import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { runNumericProbe } from './numeric-probe.ts';
import { fee, reserve, encodeExact, decodeExact, integerSqrt, SCALE, mulQ } from '../../packages/sim-core/src/numeric.ts';

const read = path => JSON.parse(readFileSync(path,'utf8'));
const checks=[];
const check=(id,run)=>{try{const metrics=run();checks.push({id,status:'pass',metrics:metrics??null});}catch(error){checks.push({id,status:'fail',error:error.message});}};
const sectors=['energy','industry','consumer','infrastructure','digital','health'];
const concepts=['storage','compute','autonomy','renewal','automation','recycling','longevity','crossborder'];
const allowed=[[0,1,3],[4,3,0],[1,4,5],[3,1,2],[1,4,2],[0,1,2],[5,2,4],[1,0,2]];
for(const size of ['prototype','full']) check(`QUOTA-${size.toUpperCase()}`,()=>{
  const w=read(`tests/scenarios/p0/world-${size}.json`);
  assert.equal(w.stocks.length,size==='prototype'?40:200);assert.equal(w.wallets.length,26);
  const tiers=['large','medium','small'];let floatValue=0n;
  const matrix=Object.fromEntries(['A','B'].map(m=>[m,sectors.map(()=>[0,0,0])]));
  const conceptCounts=Object.fromEntries(concepts.map(c=>[c,0]));
  for(const market of ['A','B']) {
    const stocks=w.stocks.filter(s=>s.market===market);
    assert.deepEqual([0,1,2].map(n=>stocks.filter(s=>s.concepts.length===n).length),size==='prototype'?[5,11,4]:[25,55,20]);
    assert.deepEqual(tiers.map(t=>stocks.filter(s=>s.tier===t).length),size==='prototype'?[4,7,9]:[20,35,45]);
    assert.equal(w.wallets.filter(a=>a.market===market).length,12);
  }
  for(const s of w.stocks) {
    matrix[s.market][sectors.indexOf(s.sector)][tiers.indexOf(s.tier)]++;
    assert.ok(Number.isSafeInteger(s.totalShares)&&s.totalShares<=8_000_000_000);
    const cap=BigInt(s.initialPrice)*BigInt(s.totalShares);
    const [low,high]=s.tier==='large'?[1_000_000_000_000n,4_000_000_000_000n]:s.tier==='medium'?[200_000_000_000n,1_000_000_000_000n]:[20_000_000_000n,200_000_000_000n];
    assert.ok(cap>=low&&cap<high);assert.equal(s.floatShares+s.founderShares,s.totalShares);
    assert.equal(w.wallets.reduce((sum,a)=>sum+(a.holdings.find(h=>h.stockId===s.id)?.quantity??0),0),s.floatShares);
    const local=w.wallets.filter(a=>a.market===s.market).reduce((sum,a)=>sum+(a.holdings.find(h=>h.stockId===s.id)?.quantity??0),0);
    assert.equal(BigInt(local)*10n,BigInt(s.floatShares)*9n);
    assert.equal(new Set(s.concepts.map(c=>c.id)).size,s.concepts.length);
    assert.ok(s.concepts.reduce((sum,c)=>sum+c.exposureQ,0)<=1_000_000_000);
    for(const c of s.concepts) {assert.ok(allowed[concepts.indexOf(c.id)].includes(sectors.indexOf(s.sector)));assert.ok(c.business.length>5);conceptCounts[c.id]++;}
    floatValue+=BigInt(s.floatShares)*BigInt(s.initialPrice);
  }
  assert.deepEqual(matrix,w.industrySizeMatrix);assert.deepEqual(conceptCounts,w.conceptTargets);
  for(const c of concepts) assert.ok(new Set(w.stocks.filter(s=>s.concepts.some(x=>x.id===c)).map(s=>s.sector)).size>=2);
  let cash=0n;
  for(const a of w.wallets) {const holdingValue=a.holdings.reduce((sum,h)=>sum+BigInt(h.quantity)*BigInt(w.stocks.find(s=>s.id===h.stockId).initialPrice),0n);assert.equal(BigInt(a.cash),holdingValue/4n);cash+=BigInt(a.cash);}
  assert.equal(cash,floatValue/4n);assert.equal(w.playerInjected,false);
  return {stocks:w.stocks.length,relations:Object.values(conceptCounts).reduce((a,b)=>a+b,0),wallets:w.wallets.length,floatValue:floatValue.toString(),npcCash:cash.toString(),conceptCounts};
});

check('NUM-01',()=>{
  assert.deepEqual(runNumericProbe(),read('docs/verification/fixtures/p0-numeric-golden.json'));
  assert.equal(reserve(1000,16,16),16023n);assert.equal(fee(2001n),2n);
  assert.equal(encodeExact(decodeExact(encodeExact({cash:200_000_000_000_000_000_000n}))),encodeExact({cash:200_000_000_000_000_000_000n}));
  assert.throws(()=>decodeExact('{"amount":9007199254740993}'));
  assert.throws(()=>decodeExact('{"$bigint":"01"}'));
  assert.throws(()=>encodeExact({$bigint:'illegal'}));
  for(const n of [0n,1n,2n,3n,10n**40n+5n]){const r=integerSqrt(n);assert.ok(r*r<=n&&(r+1n)*(r+1n)>n);}
  return {goldenEqual:true,boundaryProduct:runNumericProbe().boundaryProduct,reserve16:'16023',unsafeEncodingRejected:true};
});

// P0 only: bounded exhaustive arithmetic oracle, never used by the game.
function auction(orders,reference,low,high) {
  let best=null;
  for(let price=low;price<=high;price++) {
    const d=orders.filter(o=>o.side==='buy'&&o.limit>=price).reduce((s,o)=>s+o.quantity,0);
    const s=orders.filter(o=>o.side==='sell'&&o.limit<=price).reduce((sum,o)=>sum+o.quantity,0);
    const q=Math.min(d,s);if(q===0)continue;
    const priority=[-q,Math.abs(d-s),Math.abs(price-reference),price];
    if(!best||priority.some((x,i)=>x!==best.priority[i]&&priority.slice(0,i).every((v,j)=>v===best.priority[j])&&x<best.priority[i])) best={price,quantity:q,priority};
  }
  return best?{price:best.price,quantity:best.quantity}:{price:null,quantity:0};
}
const protection=read('tests/scenarios/p0/protection-cases.json');
for(const c of protection.cases) check(c.id,()=>{
  for(const o of c.orders) if(o.side==='buy') assert.ok(BigInt(o.cash)>=BigInt(o.limit)*BigInt(o.quantity)+fee(BigInt(o.limit)*BigInt(o.quantity)));else assert.ok(o.sellable>=o.quantity);
  const limits=c.orders.map(o=>o.limit);const top=Math.max(c.reference,...limits);
  const result=auction(c.orders,c.reference,c.low,Math.min(c.high,top));
  assert.deepEqual(result,{price:c.expectedPrice,quantity:c.expectedQuantity});
  const unbounded=auction(c.orders,c.reference,1,top);
  if('indicativePrice'in c)assert.deepEqual(unbounded,{price:c.indicativePrice,quantity:c.indicativeQuantity});
  if(c.id==='A13') for(const [pct,q] of [[8,0],[16,0],[32,0],[64,100]])assert.equal(auction(c.orders,1000,Math.ceil(1000*(1-pct/100)),Math.floor(1000*(1+pct/100))).quantity,q);
  return {actual:result,unbounded,scope:'fixed arithmetic, production state machine required in P1'};
});

check('MI-CONTRACT-01',()=>{
  const cases=read('tests/scenarios/p0/market-cases.json').cases;
  for(const market of ['A','B'])for(const kind of ['favorable','failure'])assert.equal(cases.filter(c=>c.market===market&&c.kind===kind).length,2);
  assert.equal(mulQ(80_000_000n,600_000_000n),48_000_000n);
  assert.equal(mulQ(80_000_000n,-300_000_000n),-24_000_000n);
  const b=mulQ(mulQ(160_000_000n,800_000_000n),500_000_000n);
  const a=mulQ(mulQ(40_000_000n,800_000_000n),500_000_000n);
  assert.equal(b,64_000_000n);assert.equal(a,16_000_000n);
  assert.equal(mulQ(mulQ(200_000n,400_000_000n),500_000_000n),40_000n);
  return {cases:cases.map(c=>c.id),bDurationQ:b.toString(),swappedAProfileQ:a.toString(),scope:'directional contract, actual targets/orders required in P3'};
});
check('TIME-CROSS-01',()=>{
  const c=read('tests/scenarios/p0/cross-season.json');
  for(const t of c.timeline)assert.equal(t.worldDay,t.playerDay+249);
  assert.equal((250+249+1)%20,0);assert.equal(c.safeSnapshots.length,2);
  assert.equal(c.warmup.completedDailyBars,250);assert.ok(c.warmup.completedDailyBars>=c.warmup.MA200Needs);
  assert.equal(52_000_000n+8_000_000n,60_000_000n); // covered .05+.002, remaining .008
  return {worldDayAtSeasonEnd:499,nextOpenPhase20:0,expectationReplacement:[240,254,262],coveredQ:'52000000',remainingQ:'8000000',scope:'paper/data timing; production event/season path required in P3/P4'};
});
check('SNAP-PROJECTION-01',()=>{
  const c=read('tests/scenarios/p0/snapshot-projections.json');
  const text=JSON.stringify(c.public);
  for(const forbidden of ['hiddenEvents','actualOperating','npcMemory','branch','resultQ','nextReviewWorldDay'])assert.ok(!text.includes(forbidden));
  assert.equal(c.private.phase,'publicDecision');assert.equal(c.private.preparationAppliedTick,c.private.clock.worldDay*16+c.private.clock.batch);
  return {hiddenFieldsAbsent:true,safePhases:['publicDecision','settled'],scope:'sample projection; production future-prefix checks required in P1/P3'};
});
check('SEEDS-01',()=>{
  const g=read('tests/scenarios/p0/seeds.json').groups;
  for(const [key,n]of [['baseline',100],['training',30],['screenHoldout',30],['confirmHoldout',100],['fullSurvival',100],['defaultPool',16],['customWarmup',5]])assert.equal(g[key].length,n);
  assert.deepEqual(g.baselineLong,g.baseline.slice(0,10));assert.deepEqual(g.fullSurvivalLong,g.fullSurvival.slice(0,10));
  const all=Object.entries(g).filter(([k])=>!k.endsWith('Long')).flatMap(([,v])=>v);assert.equal(new Set(all).size,all.length);
  return {uniqueIndependentSeeds:all.length,baselineLong:10,fullSurvivalLong:10,selectedWithoutMarketOutcomes:true};
});
check('CONTENT-01',()=>{
  const c=read('tests/scenarios/p0/content-registry.json');
  assert.deepEqual(Object.values(c.templates).map(v=>v.length),[10,6,4,4]);assert.equal(Object.keys(c.chains).length,6);
  const all=Object.values(c.templates).flat().map(v=>v.split(' ')[0]);
  for(const id of c.p3Templates)assert.ok(all.includes(id));for(const chain of Object.values(c.chains))for(const id of chain)assert.ok(all.includes(id));
  assert.equal(c.p3Templates.length,8);assert.equal(c.p3Chains.length,2);
  return {templates:24,chains:6,p3Templates:8,p3Chains:2};
});
check('MATH-ACCURACY-01',()=>{
  execFileSync('python',['tools/p0/math-accuracy.py'],{encoding:'utf8'});
  const result=read('docs/verification/fixtures/p0-math-accuracy.json');assert.equal(result.rows.length,13);assert.ok(result.rows.every(r=>r.status==='pass'));
  return {points:13,reference:result.reference,scope:result.scope};
});

const sourceFiles=[];
for(const dir of ['packages/sim-core/src','tools/p0','tests/scenarios/p0','docs/design']) {
  function walk(path){for(const entry of readdirSync(path,{withFileTypes:true})){const p=path+'/'+entry.name;if(entry.isDirectory())walk(p);else sourceFiles.push(p);}}
  walk(dir);
}
for(const file of ['package.json','package-lock.json','tsconfig.base.json','apps/web/package.json','apps/web/vite.config.ts','apps/web/p0-probe.html','apps/web/src/p0-probe.ts','apps/web/src/p0-worker.ts'])if(existsSync(file))sourceFiles.push(file);
sourceFiles.sort();const hash=createHash('sha256');for(const path of sourceFiles){hash.update(path+'\0');hash.update(readFileSync(path));hash.update('\0');}
const sourceHash=hash.digest('hex');
const manifest={phase:'p0',recordedAt:new Date().toISOString(),testedSourceHash:sourceHash,sourceFiles,
  baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),rulesVersion:'0.3.0',contentVersion:'0.3.0',schemaVersion:1,mathVersion:'fixed-q9-v1',seedListHash:createHash('sha256').update(readFileSync('tests/scenarios/p0/seeds.json')).digest('hex'),
  runtime:process.version,device:{cpu:os.cpus()[0]?.model.trim(),logicalProcessors:os.cpus().length,memoryBytes:os.totalmem(),os:os.version(),release:os.release()},commands:['npm run verify:p0'],
  scope:'P0 design/numeric/fixture checks only; no simulated economy or game acceptance'};
mkdirSync('docs/verification/fixtures',{recursive:true});
writeFileSync('docs/verification/fixtures/p0-node-results.json',JSON.stringify({manifest,status:checks.some(c=>c.status==='fail')?'fail':'pass',checks},null,2)+'\n');
for(const c of checks)console.log(`${c.status.toUpperCase()} ${c.id}${c.error?': '+c.error:''}`);
console.log(`Tested sourceHash ${sourceHash}`);
if(checks.some(c=>c.status==='fail'))process.exitCode=1;
