import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { randomU32 } from '../../packages/sim-core/src/numeric.ts';
import { INITIALIZATION_VERSION, initialNpcCash } from '../../packages/sim-core/src/index.ts';

const sectors = ['energy', 'industry', 'consumer', 'infrastructure', 'digital', 'health'];
const concepts = ['storage', 'compute', 'autonomy', 'renewal', 'automation', 'recycling', 'longevity', 'crossborder'];
const allowed = [[0,1,3],[4,3,0],[1,4,5],[3,1,2],[1,4,2],[0,1,2],[5,2,4],[1,0,2]];
const business = ['储能组件与配套服务','算能设备与供电扩建','自主生产与诊断工艺','城市设施更新与运营','自动作业设备与应用','循环材料加工与回收','长寿产品与数字诊疗','跨境物流与供货通道'];
const full = { A:[[5,8,11],[5,7,8],[3,7,8],[3,6,7],[2,4,6],[2,3,5]], B:[[2,3,5],[3,6,7],[2,4,6],[3,7,8],[5,7,8],[5,8,11]] };
const prototype = { A:[[1,2,2],[1,1,2],[1,1,2],[1,1,1],[0,1,1],[0,1,1]], B:[[0,1,1],[1,1,1],[0,1,1],[1,1,2],[1,1,2],[1,2,2]] };
const tags = [1,2,1,1,0,1,2,1,0,1,1,2,0,1,1,1,0,1,2,0];
const pct = { A:[28,18,20,26,8], B:[40,16,12,26,6] };
const counts = [3,2,2,4,1];
const roles = ['repairValue','allocationValue','longValue','shortTrend','swingTrend','eventTheme','allocationTheme','inventory1','inventory2','inventory3','inventory4','noise'];

function distribute(total, weightedIds) {
  const sum = weightedIds.reduce((s,x)=>s+x.weight,0n);
  const parts = weightedIds.map(x=>({...x, quantity:total*x.weight/sum, remainder:total*x.weight%sum}));
  let left = total-parts.reduce((s,x)=>s+x.quantity,0n);
  parts.sort((a,b)=>a.remainder>b.remainder?-1:a.remainder<b.remainder?1:a.id<b.id?-1:a.id>b.id?1:0);
  for (const p of parts) if (left>0n) { p.quantity++; left--; }
  return parts;
}

// Deterministic capacity flow proves simultaneous row/column/tag constraints.
function assign(stocks, targets, salt) {
  const n=2+8+stocks.length, sink=n-1;
  const graph=Array.from({length:n},()=>[]);
  const add=(a,b,c)=>{ const edge={to:b,cap:c,rev:graph[b].length,initial:c}; graph[a].push(edge); graph[b].push({to:a,cap:0,rev:graph[a].length-1,initial:0}); return edge; };
  for(let c=0;c<8;c++) {
    add(0,1+c,targets[c]);
    stocks.map((s,i)=>({s,i,rank:randomU32(20261001,'concept-sample',s.id, salt,c)}))
      .filter(x=>allowed[c].includes(sectors.indexOf(x.s.sector)))
      .sort((a,b)=>a.rank-b.rank).forEach(({i})=>add(1+c,9+i,1));
  }
  for(let i=0;i<stocks.length;i++) add(9+i,sink,stocks[i].tagCapacity);
  let flow=0;
  while(true) {
    const parent=Array(n).fill(null); parent[0]={from:-1}; const queue=[0];
    for(let q=0;q<queue.length&&!parent[sink];q++) for(let j=0;j<graph[queue[q]].length;j++) {
      const e=graph[queue[q]][j]; if(e.cap>0&&!parent[e.to]) { parent[e.to]={from:queue[q],j};queue.push(e.to); }
    }
    if(!parent[sink]) break;
    let amount=1e9; for(let v=sink;v!==0;v=parent[v].from) amount=Math.min(amount,graph[parent[v].from][parent[v].j].cap);
    for(let v=sink;v!==0;v=parent[v].from) {const e=graph[parent[v].from][parent[v].j];e.cap-=amount;graph[v][e.rev].cap+=amount;}
    flow+=amount;
  }
  if(flow!==targets.reduce((a,b)=>a+b,0)) return false;
  for(const s of stocks) s.concepts=[];
  for(let c=0;c<8;c++) for(const e of graph[c+1]) if(e.to>=9&&e.to<sink&&e.initial===1&&e.cap===0) {
    const s=stocks[e.to-9];s.concepts.push({id:concepts[c],exposureQ:s.tagCapacity===2?400_000_000:600_000_000,business:business[c]+'：'+s.sector});
  }
  return concepts.every(id=>new Set(stocks.filter(s=>s.concepts.some(c=>c.id===id)).map(s=>s.sector)).size>=2);
}

function world(size,matrix,targets) {
  const stocks=[];
  for(const market of ['A','B']) {
    let sequence=0;
    for(let s=0;s<6;s++) for(let tier=0;tier<3;tier++) for(let i=0;i<matrix[market][s][tier];i++) {
      const id=market+String(++sequence).padStart(3,'0');
      const totalShares=[1_200_000_000,500_000_000,80_000_000][tier];
      stocks.push({id,name:'岚序'+id,market,sector:sectors[s],tier:['large','medium','small'][tier],initialPrice:1_000,totalShares,floatShares:totalShares*4/10,reportPhase:(sequence-1)%20,durationSensitivityQ:[400000000,400000000,200000000,600000000,800000000,800000000][s],tagCapacity:tags[(sequence-1)%20],concepts:[]});
    }
  }
  let salt=0; while(salt<64&&!assign(stocks,targets,salt)) salt++;
  if(salt===64) throw new Error('generationFailed: concepts');
  const wallets=[];
  for(const market of ['A','B']) for(const role of roles) wallets.push({id:market+':'+role,market,role,cash:'0',holdings:[]});
  wallets.push({id:'cross:swing',market:'both',role:'crossSwing',cash:'0',holdings:[]},{id:'cross:long',market:'both',role:'crossLong',cash:'0',holdings:[]});
  const lookup=new Map(wallets.map(w=>[w.id,w]));
  for(const s of stocks) {
    const float=BigInt(s.floatShares), local=float*9n/10n;
    const groups=distribute(local,pct[s.market].map((p,i)=>({id:String(i),weight:BigInt(p)})));
    let roleOffset=0;
    for(let group=0;group<5;group++) {
      const total=groups.find(p=>p.id===String(group)).quantity;
      const members=roles.slice(roleOffset,roleOffset+counts[group]);roleOffset+=counts[group];
      const allocations=distribute(total,members.map(role=>({id:s.market+':'+role,weight:BigInt(950+randomU32(20261001,'inventory',s.id,0,roles.indexOf(role))%101)})));
      for(const p of allocations) lookup.get(p.id).holdings.push({stockId:s.id,quantity:Number(p.quantity),unlockTick:0});
    }
    for(const id of ['cross:swing','cross:long']) lookup.get(id).holdings.push({stockId:s.id,quantity:Number((float-local)/2n),unlockTick:0});
    s.founderShares=s.totalShares-s.floatShares;
    delete s.tagCapacity;
  }
  for(const w of wallets){const value=w.holdings.reduce((sum,h)=>sum+BigInt(h.quantity)*1_000n,0n);w.previousCash=(value/4n).toString();w.cash=initialNpcCash(value,w.role).toString();}
  return {rulesVersion:'0.3.1',contentVersion:'0.3.1',initializationVersion:INITIALIZATION_VERSION,previousInitializationVersion:'world-v1',seed:20261001,size,industrySizeMatrix:matrix,conceptTargets:Object.fromEntries(concepts.map((c,i)=>[c,targets[i]])),stocks,wallets,serviceCash:'0',playerInjected:false};
}

mkdirSync('tests/scenarios/p0',{recursive:true});
const initializationSamples=[];
for(const [size,matrix,targets] of [['prototype',prototype,[5,5,5,5,5,5,4,4]],['full',full,[26,26,25,25,24,24,20,20]]]) {
  const value=world(size,matrix,targets), text=JSON.stringify(value,null,2)+'\n';
  writeFileSync(`tests/scenarios/p0/world-${size}.json`,text);
  const cash= value.wallets.reduce((n,w)=>n+BigInt(w.cash),0n),oldCash=value.wallets.reduce((n,w)=>n+BigInt(w.previousCash),0n),stockValue=value.stocks.reduce((n,s)=>n+BigInt(s.floatShares)*BigInt(s.initialPrice),0n);
  const roleStyle=role=>role.startsWith('inventory')?'inventory':role.includes('Value')?'value':role.includes('Trend')?'trend':role.includes('Theme')?'theme':role==='noise'?'noise':'crossMarket';
  const styles=['value','trend','theme','inventory','noise','crossMarket'].map(style=>{const wallets=value.wallets.filter(w=>roleStyle(w.role)===style),holding=wallets.reduce((n,w)=>n+w.holdings.reduce((v,h)=>v+BigInt(h.quantity)*1000n,0n),0n),old=wallets.reduce((n,w)=>n+BigInt(w.previousCash),0n),next=wallets.reduce((n,w)=>n+BigInt(w.cash),0n);
    return {style,holdingValue:holding.toString(),oldCash:old.toString(),newCash:next.toString(),oldAssetShareQ:((holding+old)*1000000000n/(stockValue+oldCash)).toString(),newAssetShareQ:((holding+next)*1000000000n/(stockValue+cash)).toString()};});
  initializationSamples.push({size,worldFixture:`world-${size}.json`,floatValue:stockValue.toString(),oldNpcCash:oldCash.toString(),newNpcCash:cash.toString(),initialCashDelta:(cash-oldCash).toString(),oldNpcAssets:(stockValue+oldCash).toString(),newNpcAssets:(stockValue+cash).toString(),styles,wallets:value.wallets.map(w=>({id:w.id,role:w.role,previousCash:w.previousCash,cash:w.cash}))});
  console.log(`${size}: ${value.stocks.length} stocks, ${value.wallets.length} wallets, sha256 ${createHash('sha256').update(text).digest('hex')}`);
}
writeFileSync('tests/scenarios/p0/initialization-candidate.json',JSON.stringify({initializationVersion:INITIALIZATION_VERSION,status:'candidate-pending-P2-validation',previousInitializationVersion:'world-v1',rulesVersion:'0.3.1',contentVersion:'0.3.1',originalFailedSeeds:[3572871866,1866980507],ordinaryCash:'floor(holdingValue*(1-f)/f)',inventoryCash:'floor(holdingValue/4)',preserved:['stock allocations','26 roles','baseline-v1 style parameters','quotes','protection','fees','registered seeds','90% x 80% gate'],samples:initializationSamples},null,2)+'\n');

// Seed groups are derived before observing any game outcome, never selected on returns.
const groups={};
for(const [name,count] of [['baseline',100],['training',30],['screenHoldout',30],['confirmHoldout',100],['fullSurvival',100],['defaultPool',16],['customWarmup',5]]) {
  groups[name]=Array.from({length:count},(_,i)=>randomU32(20261001,'seed-manifest-v1',name,0,i));
}
const all=Object.values(groups).flat();if(new Set(all).size!==all.length) throw new Error('duplicate seeds');
groups.baselineLong=groups.baseline.slice(0,10);groups.fullSurvivalLong=groups.fullSurvival.slice(0,10);
writeFileSync('tests/scenarios/p0/seeds.json',JSON.stringify({version:'seed-manifest-v1',rootSeed:20261001,groups},null,2)+'\n');
