import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { runNumericProbe } from './numeric-probe.ts';
import { fee, reserve, encodeExact, decodeExact, integerSqrt, SCALE, mulQ, expQ, randomU32, uniformQ, normalQ } from '../../packages/sim-core/src/numeric.ts';
import { RULES_VERSION, CONTENT_VERSION } from '../../packages/sim-core/src/contracts.ts';

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

check('NUM-KEY-ORDER-01',()=>{
  assert.equal(encodeExact({'10':1,'2':2}),'{"2":2,"10":1}');
  const expected='{"2":2,"10":1,"02":3,"a":5,"nested":{"4294967294":2,"-1":3,"4294967295":1},"z":4}';
  assert.equal(runNumericProbe().keyOrderEncoding,expected);
  assert.equal(encodeExact(decodeExact(expected)),expected);
  assert.equal(encodeExact({z:4,nested:{'-1':3,'4294967294':2,'4294967295':1},a:5,'02':3,'2':2,'10':1}),expected);
  return {counterexample:'{"2":2,"10":1}',golden:expected,insertionOrderIndependent:true};
});

check('BASELINE-STYLE-01',()=>{
  const c=read('tests/scenarios/p0/baseline-v1.json');
  assert.equal(c.preset,'baseline-v1');assert.equal(c.accountCount,26);
  assert.equal(c.rulesVersion,RULES_VERSION);assert.equal(c.contentVersion,CONTENT_VERSION);
  const expectedAlpha={value:'900000000',trend:'150000000',theme:'150000000',noise:'200000000',crossMarket:'750000000'};
  for(const [style,alpha]of Object.entries(expectedAlpha))assert.equal(c.styles[style].alphaQ,alpha);
  for(const key of ['betaQ','gammaQ','kTQ','kHQ','themeHQ'])assert.equal(c.disabled[key],'0');
  assert.equal(c.styles.inventory.targetKind,'shares');assert.equal(c.styles.inventory.hourCapacityQ,'100000000');
  return {alphaQ:expectedAlpha,technicalAndThemeOnlyDisabled:true,scope:'frozen configuration; production economic checks remain P2'};
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
  assert.equal(c.version,CONTENT_VERSION);assert.ok(existsSync(c.representativeContract.document));assert.ok(existsSync(c.representativeContract.data));
  return {templates:24,chains:6,p3Templates:8,p3Chains:2};
});
check('EVENT-CONTRACT-01',()=>{
  const registry=read('tests/scenarios/p0/content-registry.json');const c=read(registry.representativeContract.data);
  assert.equal(c.metadata.contractVersion,'event-v1');assert.equal(c.metadata.schemaVersion,1);
  assert.equal(c.metadata.rulesVersion,RULES_VERSION);assert.equal(c.metadata.contentVersion,CONTENT_VERSION);
  assert.equal(c.metadata.mathVersion,'fixed-q9-v1');assert.equal(c.metadata.rngVersion,'rng-v1');
  assert.deepEqual(c.templates.map(t=>t.id),registry.p3Templates);assert.deepEqual(c.chains.map(t=>t.id),registry.p3Chains);
  assert.equal(c.units.q9.scaleQ,SCALE.toString());assert.equal(c.publicSchema.pendingExpiryDays,20);
  const q=v=>{assert.match(v,/^(0|-?[1-9][0-9]*)$/);return BigInt(v);};
  const clip=(v,p)=>v<q(p.minQ)?q(p.minQ):v>q(p.maxQ)?q(p.maxQ):v;
  const draw=(key,kind)=>{const args=[key.seed,key.purpose,key.entity,key.creationTick,key.slot];return kind==='normal'?normalQ(...args):uniformQ(...args);};
  for(const t of c.templates){
    assert.ok(c.publicSchema.channels.includes(t.defaultChannel));assert.ok(t.major&&Object.keys(t.schedule).length);
    for(const slot of ['objectName','expectedRange','unit','resultOrUnpublished','risk'])assert.ok(t.textSlots.includes(slot));
    for(const match of (t.text.title+t.text.body).matchAll(/\{([^}]+)\}/g))assert.ok(t.textSlots.includes(match[1]));
    for(const [component,p]of Object.entries(t.parameters))if(p&&typeof p==='object'&&'minQ'in p){
      assert.ok(q(p.minQ)<=q(p.baseQ)&&q(p.baseQ)<=q(p.maxQ));assert.ok(q(p.sigmaQ)>=0n&&q(p.halfWidthQ)>=0n);
      assert.ok(c.distributions[p.meanDistribution]&&c.distributions[p.resultDistribution]);
      if(component==='oneOffLog')assert.ok(q(p.minQ)>=-200_000_000n&&q(p.maxQ)<=200_000_000n);
    }
  }
  for(const chain of c.chains){
    assert.deepEqual([...chain.members].sort(),[...registry.chains[chain.id]].sort());
    assert.equal(new Set(chain.nodes.map(n=>n.id)).size,chain.nodes.length);assert.equal(new Set(chain.effects.map(e=>e.name)).size,chain.effects.length);
    assert.equal(chain.branches.reduce((sum,b)=>sum+q(b.probabilityQ),0n),SCALE);
    for(const node of chain.nodes){assert.ok(chain.members.includes(node.templateId));assert.ok(chain.effects.some(e=>e.name===node.effect));}
    for(const branch of chain.branches){assert.ok(q(branch.probabilityQ)>0n);assert.equal(branch.path[0],chain.root);for(let i=1;i<branch.path.length;i++)assert.ok(chain.edges.some(e=>e[0]===branch.path[i-1]&&e[1]===branch.path[i]));}
  }
  for(const sample of [...c.rngSamples,...c.branchSamples]){
    assert.ok(['uniform','normal'].includes(sample.kind));assert.equal(draw(sample.key,sample.kind).toString(),sample.expectedQ);
    if('u32'in sample){const k=sample.key;assert.equal(randomU32(k.seed,k.purpose,k.entity,k.creationTick,k.slot),sample.u32);}
  }
  for(const d of c.outcomeDraws){const p=d.parameters;
    const mean=clip(q(p.baseQ)+mulQ(q(p.halfWidthQ),2n*draw(d.expectationKey,'uniform')-SCALE),p);
    assert.equal(mean.toString(),d.meanQ);assert.equal(clip(mean-3n*q(p.sigmaQ),p).toString(),d.lowQ);assert.equal(clip(mean+3n*q(p.sigmaQ),p).toString(),d.highQ);
    assert.equal(clip(mean+mulQ(q(p.sigmaQ),draw(d.resultKey,'normal')),p).toString(),d.resultQ);
  }
  for(const sample of c.branchSamples){let cumulative=0n;const u=draw(sample.key,'uniform');const chain=c.chains.find(v=>v.id===sample.chainId);const selected=chain.branches.find(b=>{cumulative+=q(b.probabilityQ);return u<cumulative;});assert.equal(selected.id,sample.branch);}
  assert.deepEqual([...new Set(c.publicSamples.map(p=>p.templateId))].sort(),[...registry.p3Templates].sort());
  for(const p of c.publicSamples){assert.deepEqual(Object.keys(p).sort(),[...c.publicSchema.required].sort());const t=c.templates.find(t=>t.id===p.templateId);for(const slot of t.textSlots)assert.equal(typeof p.textSlots[slot],'string');
    for(const hidden of c.publicSchema.privateFieldsForbidden)assert.ok(!JSON.stringify(p).includes(`"${hidden}":`));
    if(['preview','update'].includes(p.status)){assert.equal(p.disclosedResult,null);assert.deepEqual(p.effectiveUntil,{worldDay:p.publishedAt.worldDay+20,batch:p.publishedAt.batch});}
  }
  const ex=id=>c.examples.find(e=>e.id===id);
  const signed=ex('SIGNED-BUSINESS-01');assert.deepEqual(signed.weightsQ.map(w=>mulQ(q(signed.shockQ),q(w)).toString()),signed.contributionsQ);assert.ok(signed.weightsQ.reduce((sum,w)=>sum+(q(w)<0n?-q(w):q(w)),0n)<=SCALE);
  const below=ex('BELOW-EXPECTATION-01');assert.equal(mulQ(q(below.actualEFromQ),expQ(q(below.publishedResultQ))).toString(),below.actualEToQ);
  const partial=ex('PARTIAL-REPORT-01');assert.equal(q(partial.oneOffLogQ)+q(partial.dailyLogQ)*BigInt(partial.coveredDays.length),q(partial.coveredTotalQ));assert.equal(q(partial.dailyLogQ)*BigInt(partial.remainingDays.length),q(partial.remainingFutureQ));assert.equal(partial.coveredDays.length+partial.remainingDays.length,partial.endDayExclusive-partial.startDay);
  const update=ex('UPDATE-DRAW-01');assert.equal((q(update.oldMeanQ)+mulQ(q(update.sourceSigmaQ)/2n,draw(update.key,'normal'))).toString(),update.newMeanQ);
  const major=ex('MAJOR-PUBLIC-ONLY-01');assert.equal(expQ(q(major.positiveDeltaQ)).toString(),major.positiveMultiplierQ);assert.equal(expQ(q(major.negativeDeltaQ)).toString(),major.negativeMultiplierQ);
  return {templates:8,chains:2,rngSamples:c.rngSamples.length,outcomeDraws:c.outcomeDraws.length,reachableBranchSamples:c.branchSamples.length,publicSamples:c.publicSamples.length,partialReportQ:partial.coveredTotalQ,scope:'P0 contract/data arithmetic only; production event application and natural market acceptance remain P3'};
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
  baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),rulesVersion:'0.3.1',contentVersion:'0.3.1',schemaVersion:1,mathVersion:'fixed-q9-v1',seedListHash:createHash('sha256').update(readFileSync('tests/scenarios/p0/seeds.json')).digest('hex'),
  runtime:process.version,device:{cpu:os.cpus()[0]?.model.trim(),logicalProcessors:os.cpus().length,memoryBytes:os.totalmem(),os:os.version(),release:os.release()},commands:['npm run verify:p0'],
  scope:'P0 design/numeric/fixture checks only; no simulated economy or game acceptance'};
mkdirSync('docs/verification/fixtures',{recursive:true});
writeFileSync('docs/verification/fixtures/p0-node-results.json',JSON.stringify({manifest,status:checks.some(c=>c.status==='fail')?'fail':'pass',checks},null,2)+'\n');
for(const c of checks)console.log(`${c.status.toUpperCase()} ${c.id}${c.error?': '+c.error:''}`);
console.log(`Tested sourceHash ${sourceHash}`);
if(checks.some(c=>c.status==='fail'))process.exitCode=1;
