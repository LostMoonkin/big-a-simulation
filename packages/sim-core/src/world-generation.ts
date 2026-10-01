import { CONTENT_VERSION, RULES_VERSION } from './contracts.ts';
import type { MarketId, WorldConfig } from './contracts.ts';
import { SCALE, encodeExact, mulQ, randomU32, uniformQ } from './numeric.ts';
import { compareId } from './auction.ts';
import { sha256 } from './hash.ts';
import { assert, initialState, totalShares } from './state.ts';
import type { ScenarioAccount, ScenarioStock, TradingState } from './trading-types.ts';
import type { Candle, CompanyTier, ConceptId, NpcRole, NpcState, NpcStyle, SectorId, WorldStockState } from './world-types.ts';

export const SECTORS: SectorId[] = ['energy','industry','consumer','infrastructure','digital','health'];
const SECTOR_NAMES = ['能源','工业','消费','基础设施','数字','健康'];
const CONCEPTS: ConceptId[] = ['storage','compute','autonomy','renewal','automation','recycling','longevity','crossborder'];
const CONCEPT_NAMES = ['储能革新','算能扩建','自主工艺','城市更新','自动作业','循环资源','长寿技术','跨境通道'];
const ALLOWED = [[0,1,3],[4,3,0],[1,4,5],[3,1,2],[1,4,2],[0,1,2],[5,2,4],[1,0,2]];
const BUSINESS = ['储能组件与配套服务','算能设备与供电扩建','自主生产与诊断工艺','城市设施更新与运营','自动作业设备与应用','循环材料加工与回收','长寿产品与数字诊疗','跨境物流与供货通道'];
const MATRIX = { A:[[1,2,2],[1,1,2],[1,1,2],[1,1,1],[0,1,1],[0,1,1]], B:[[0,1,1],[1,1,1],[0,1,1],[1,1,2],[1,1,2],[1,2,2]] };
const TAGS = [1,2,1,1,0,1,2,1,0,1,1,2,0,1,1,1,0,1,2,0];
const ROLES: NpcRole[] = ['repairValue','allocationValue','longValue','shortTrend','swingTrend','eventTheme','allocationTheme','inventory1','inventory2','inventory3','inventory4','noise'];
export const BASELINE_STYLE = {
  value:{alphaQ:900_000_000n,temperatureQ:800_000_000n,stockFractionQ:700_000_000n,beliefSigmaQ:2_000_000n,scoreNoiseMultiplier:1,hourCapacityQ:40_000_000n},
  trend:{alphaQ:150_000_000n,temperatureQ:600_000_000n,stockFractionQ:600_000_000n,beliefSigmaQ:4_000_000n,scoreNoiseMultiplier:2,hourCapacityQ:100_000_000n},
  theme:{alphaQ:150_000_000n,temperatureQ:600_000_000n,stockFractionQ:600_000_000n,beliefSigmaQ:5_000_000n,scoreNoiseMultiplier:2,hourCapacityQ:100_000_000n},
  noise:{alphaQ:200_000_000n,temperatureQ:SCALE,stockFractionQ:550_000_000n,beliefSigmaQ:8_000_000n,scoreNoiseMultiplier:5,hourCapacityQ:60_000_000n},
  crossMarket:{alphaQ:750_000_000n,temperatureQ:SCALE,stockFractionQ:700_000_000n,beliefSigmaQ:2_000_000n,scoreNoiseMultiplier:1,hourCapacityQ:40_000_000n},
  inventory:{alphaQ:0n,temperatureQ:SCALE,stockFractionQ:900_000_000n,beliefSigmaQ:2_000_000n,scoreNoiseMultiplier:1,hourCapacityQ:100_000_000n,
    targetKind:'shares',dailyPersistenceQ:800_000_000n,dailySigmaQ:10_000_000n,zetaLimitQ:100_000_000n},
};
export const BASELINE_REVIEW:Record<NpcRole,{period:'hour'|number;lambdaQ:bigint}>={
  repairValue:{period:1,lambdaQ:250_000_000n},allocationValue:{period:5,lambdaQ:200_000_000n},longValue:{period:20,lambdaQ:350_000_000n},
  shortTrend:{period:'hour',lambdaQ:750_000_000n},swingTrend:{period:1,lambdaQ:250_000_000n},eventTheme:{period:'hour',lambdaQ:600_000_000n},allocationTheme:{period:1,lambdaQ:250_000_000n},
  inventory1:{period:'hour',lambdaQ:SCALE},inventory2:{period:'hour',lambdaQ:SCALE},inventory3:{period:'hour',lambdaQ:SCALE},inventory4:{period:'hour',lambdaQ:SCALE},noise:{period:'hour',lambdaQ:SCALE},
  crossSwing:{period:5,lambdaQ:250_000_000n},crossLong:{period:20,lambdaQ:350_000_000n}};
export function exportBaselinePreset(){const p=BASELINE_STYLE.inventory;
  return {preset:'baseline-v1',rulesVersion:RULES_VERSION,contentVersion:CONTENT_VERSION,accountCount:26,
    disabled:{betaQ:0n,gammaQ:0n,kTQ:0n,kHQ:0n,themeHQ:0n,technicalSignals:false,majorEvents:false,policyChains:false,shapeLabels:false},
    styles:{value:{...BASELINE_STYLE.value},trend:{...BASELINE_STYLE.trend},theme:{...BASELINE_STYLE.theme},noise:{...BASELINE_STYLE.noise},crossMarket:{...BASELINE_STYLE.crossMarket},
      inventory:{targetKind:p.targetKind,beliefSigmaQ:p.beliefSigmaQ,hourCapacityQ:p.hourCapacityQ,dailyPersistenceQ:p.dailyPersistenceQ,dailySigmaQ:p.dailySigmaQ,zetaLimitQ:p.zetaLimitQ}},
    review:Object.fromEntries(Object.entries(BASELINE_REVIEW).map(([role,r])=>[role,{...r,phase:0}]))};
}
export function clipQ(q: bigint, low: bigint, high: bigint): bigint { return q<low?low:q>high?high:q; }
export function splitInteger(total: bigint, weights: bigint[], ids: string[]): bigint[] {
  const sum=weights.reduce((n,w)=>n+w,0n);assert(sum>0n&&total>=0n,'invalid allocation weights');
  const parts=weights.map((w,i)=>({i,value:total*w/sum,remainder:total*w%sum}));
  let left=total-parts.reduce((n,p)=>n+p.value,0n);
  parts.sort((a,b)=>a.remainder>b.remainder?-1:a.remainder<b.remainder?1:compareId(ids[a.i]!,ids[b.i]!));
  for(const p of parts)if(left>0n){p.value++;left--;}
  parts.sort((a,b)=>a.i-b.i);return parts.map(p=>p.value);
}
/** Risk caps are NAV weights, including sectors merged across both markets. */
export function capWeights(raw: bigint[], sectors: SectorId[], redistribute: boolean): bigint[] {
  const target=raw.reduce((n,w)=>n+w,0n),out=raw.map(w=>clipQ(w,0n,150_000_000n));
  for(const sector of SECTORS){const indexes=sectors.flatMap((s,i)=>s===sector?[i]:[]),sum=indexes.reduce((n,i)=>n+out[i]!,0n);
    if(sum>350_000_000n)for(const i of indexes)out[i]=out[i]!*350_000_000n/sum;}
  if(redistribute)for(let pass=0;pass<raw.length+1;pass++){
    const left=target-out.reduce((n,w)=>n+w,0n);if(left<=0n)break;
    const sums=new Map(SECTORS.map(s=>[s,out.reduce((n,w,i)=>n+(sectors[i]===s?w:0n),0n)]));
    const eligible=raw.flatMap((w,i)=>w>0n&&out[i]!<150_000_000n&&sums.get(sectors[i]!)!<350_000_000n?[i]:[]);if(eligible.length===0)break;
    const weight=eligible.reduce((n,i)=>n+raw[i]!,0n),additions=eligible.map(i=>left*raw[i]!/weight);let used=0n;
    for(let j=0;j<eligible.length;j++){const i=eligible[j]!,s=sectors[i]!,room=clipQ(350_000_000n-sums.get(s)!,0n,150_000_000n-out[i]!);
      const add=additions[j]!<room?additions[j]!:room;out[i]!+=add;sums.set(s,sums.get(s)!+add);used+=add;}
    if(used===0n)break;
  }
  return out;
}
export function emptyCandle(stockId:string,worldDay:number,hour:number|null,price:number,lastTradeAt:Candle['lastTradeAt']):Candle {
  return {stockId,worldDay,hour,timestamp:946_684_800_000+worldDay*86_400_000+(hour??0)*3_600_000,
    open:price,high:price,low:price,close:price,volume:0,turnover:0n,completed:false,noTrade:true,referenceOnly:lastTradeAt===null,lastTradeAt:lastTradeAt?{...lastTradeAt}:null};
}
function styleOf(role:NpcRole):NpcStyle {return role.startsWith('inventory')?'inventory':role.includes('Value')?'value':role.includes('Trend')?'trend':role.includes('Theme')?'theme':role==='noise'?'noise':'crossMarket';}
type FlowEdge={to:number,reverse:number,capacity:number,initial:number};
function assignConcepts(seed:number,stocks:WorldStockState[]):void {
  const target=[5,5,5,5,5,5,4,4],count=stocks.length;
  for(let attempt=0;attempt<64;attempt++){
    const sink=9+count,graph:FlowEdge[][]=Array.from({length:sink+1},()=>[]);
    const edge=(from:number,to:number,capacity:number):FlowEdge=>{const a={to,reverse:graph[to]!.length,capacity,initial:capacity},b={to:from,reverse:graph[from]!.length,capacity:0,initial:0};graph[from]!.push(a);graph[to]!.push(b);return a;};
    const associations:{concept:number;stock:number;edge:FlowEdge}[]=[];
    for(let c=0;c<8;c++){edge(0,1+c,target[c]!);const eligible=stocks.flatMap((s,i)=>ALLOWED[c]!.includes(SECTORS.indexOf(s.sector))?[i]:[])
      .sort((a,b)=>randomU32(seed,'concept-sample',stocks[a]!.id,attempt,c)-randomU32(seed,'concept-sample',stocks[b]!.id,attempt,c)||a-b);
      for(const i of eligible)associations.push({concept:c,stock:i,edge:edge(1+c,9+i,1)});}
    stocks.forEach((s,i)=>edge(9+i,sink,TAGS[Number(s.id.slice(1))-1]!));let flow=0;
    for(;;){const parents=Array.from({length:sink+1},()=>({node:-1,index:-1})),queue=[0];parents[0]!.node=0;
      for(let q=0;q<queue.length&&parents[sink]!.node===-1;q++){const from=queue[q]!;graph[from]!.forEach((e,index)=>{if(e.capacity>0&&parents[e.to]!.node===-1){parents[e.to]={node:from,index};queue.push(e.to);}});}
      if(parents[sink]!.node===-1)break;
      for(let to=sink;to!==0;){const p=parents[to]!,e=graph[p.node]![p.index]!;e.capacity--;graph[to]![e.reverse]!.capacity++;to=p.node;}flow++;
    }
    if(flow!==38)continue;
    const choices=stocks.map(()=>[] as number[]);for(const a of associations)if(a.edge.capacity===0)choices[a.stock]!.push(a.concept);
    if(target.some((_n,c)=>new Set(choices.flatMap((cs,i)=>cs.includes(c)?[stocks[i]!.sector]:[])).size<2))continue;
    stocks.forEach((s,i)=>{const selected=choices[i]!,exposures=selected.map(c=>300_000_000n+mulQ(uniformQ(seed,'concept-exposure',s.id,0,c),700_000_001n));
      const sum=exposures.reduce((n,q)=>n+q,0n);if(sum>SCALE)exposures.forEach((q,j)=>exposures[j]=q*SCALE/sum);
      s.concepts=selected.map((c,j)=>({id:CONCEPTS[c]!,name:CONCEPT_NAMES[c]!,exposureQ:exposures[j]!,business:BUSINESS[c]!}));
      s.business=s.concepts.length?s.concepts.map(c=>c.business).join('；'):`${s.sectorName}产品生产与经营服务`;});return;
  }
  throw new RangeError('40-stock concept quotas cannot be generated in 64 attempts');
}

export function generateWorld(config:WorldConfig):TradingState {
  assert(config.size==='prototype'&&config.mode==='baseline','P2 supports the prototype baseline preset');
  const seed=config.seed,stocks:ScenarioStock[]=[],economy:WorldStockState[]=[];
  for(const market of ['A','B'] as const){let local=0;
    for(let sector=0;sector<6;sector++)for(let t=0;t<3;t++)for(let n=0;n<MATRIX[market][sector]![t]!;n++){
      const id=`${market}${String(++local).padStart(3,'0')}`,tier=(['large','medium','small'] as CompanyTier[])[t]!;
      const price=500+Number(BigInt(randomU32(seed,'initial-price',id,0,0))*9501n/4_294_967_296n);
      const [low,high]=([[1_000_000_000_000n,4_000_000_000_000n],[200_000_000_000n,1_000_000_000_000n],[20_000_000_000n,200_000_000_000n]] as const)[t]!;
      const desired=low+mulQ(uniformQ(seed,'initial-cap',id,0,0),high-low);
      const shares=Number((desired+BigInt(price)-1n)/BigInt(price));assert(BigInt(shares)*BigInt(price)>=low&&BigInt(shares)*BigInt(price)<high,'capitalisation outside tier');
      const floatRatio=250_000_000n+mulQ(uniformQ(seed,'float-ratio',id,0,0),450_000_001n),floatShares=Number(BigInt(shares)*floatRatio/SCALE);
      stocks.push({id,market,initialPrice:price,totalShares:shares});
      const demand=-SCALE+2n*uniformQ(seed,'business-exposure',id,0,0),financing=-SCALE+2n*uniformQ(seed,'business-exposure',id,0,1);
      const absolute=(q:bigint)=>q<0n?-q:q,sum=absolute(demand)+absolute(financing),normalizer=sum>SCALE?sum:SCALE;
      economy.push({id,name:`${market==='A'?'澄川':'曜海'}${SECTOR_NAMES[sector]}${String(local).padStart(2,'0')}`,market,sector:SECTORS[sector]!,sectorName:SECTOR_NAMES[sector]!,tier,floatShares,concepts:[],business:'',
        demandExposureQ:demand*SCALE/normalizer,financingExposureQ:financing*SCALE/normalizer,leverageQ:uniformQ(seed,'leverage',id,0,0),durationQ:[400_000_000n,400_000_000n,200_000_000n,600_000_000n,800_000_000n,800_000_000n][sector]!,
        reportPhase:local-1,muQ:-200_000n+mulQ(uniformQ(seed,'company-growth',id,0,0),600_001n),pendingGrowthQ:0n,publicGrowthQ:0n,forecastQ:100n*SCALE,publicValueQ:BigInt(price)*SCALE,riskQ:200_000_000n,
        currentDay:emptyCandle(id,0,null,price,null),currentHour:emptyCandle(id,0,0,price,null),days:[],hours:[]});
    }
  }
  assignConcepts(seed,economy);
  const accounts:ScenarioAccount[]=[];
  for(const market of ['A','B'] as const)for(const role of ROLES)accounts.push({id:`${market}:${role}`,cash:0n,holdings:[]});
  accounts.push({id:'cross:swing',cash:0n,holdings:[]},{id:'cross:long',cash:0n,holdings:[]},{id:'founder',canTrade:false,cash:0n,holdings:[],feeWeight:0n});
  const add=(id:string,stockId:string,quantity:bigint)=>{const a=accounts.find(x=>x.id===id)!;if(quantity>0n)a.holdings.push({stockId,quantity:Number(quantity)});};
  for(let i=0;i<stocks.length;i++){
    const stock=stocks[i]!,e=economy[i]!,float=BigInt(e.floatShares),distribution=splitInteger(float,[90n,5n,5n],['local','cross:swing','cross:long']);
    const groups: NpcRole[][]=[ROLES.slice(0,3),ROLES.slice(3,5),ROLES.slice(5,7),ROLES.slice(7,11),ROLES.slice(11)];
    const byStyle=splitInteger(distribution[0]!,stock.market==='A'?[28n,18n,20n,26n,8n]:[40n,16n,12n,26n,6n],['value','trend','theme','inventory','noise']);
    groups.forEach((roles,g)=>{const weights=roles.map(r=>950n+BigInt(randomU32(seed,'inventory',stock.id,0,ROLES.indexOf(r))%101));
      const quantities=splitInteger(byStyle[g]!,weights,roles);roles.forEach((role,j)=>add(`${stock.market}:${role}`,stock.id,quantities[j]!));});
    add('cross:swing',stock.id,distribution[1]!);add('cross:long',stock.id,distribution[2]!);add('founder',stock.id,BigInt(stock.totalShares!)-float);
  }
  for(const a of accounts)if(a.canTrade!==false){a.cash=a.holdings.reduce((n,h)=>n+BigInt(h.quantity)*BigInt(stocks.find(s=>s.id===h.stockId)!.initialPrice),0n)/4n;a.feeWeight=a.cash;}
  const state=initialState({seed,playerAccountId:null,stocks,accounts});
  const npcs:NpcState[]=state.accounts.filter(a=>a.canTrade).map(a=>{
    const market=a.id.startsWith('A:')?'A':a.id.startsWith('B:')?'B':null,role=market===null?a.id==='cross:swing'?'crossSwing':'crossLong':a.id.split(':')[1] as NpcRole,style=styleOf(role),eligible=economy.filter(s=>market===null||s.market===market);
    const values=eligible.map(s=>BigInt(totalShares(a,s.id))*BigInt(stocks.find(x=>x.id===s.id)!.initialPrice)),holdingValue=values.reduce((n,v)=>n+v,0n),nav=holdingValue+a.cash;
    const weights=capWeights(values.map(v=>v*SCALE/nav),eligible.map(s=>s.sector),false);
    return {accountId:a.id,role,style,market,cashWeightQ:SCALE-weights.reduce((n,w)=>n+w,0n),lastReviewAt:null,lastReviewPublicVersion:0,
      assets:eligible.map((s,i)=>({stockId:s.id,initialShares:totalShares(a,s.id),baselineWeightQ:values[i]!*SCALE/holdingValue||1n,
        previousWeightQ:weights[i]!,targetShares:style==='inventory'?totalShares(a,s.id):Number(nav*weights[i]!/(SCALE*BigInt(stocks.find(x=>x.id===s.id)!.initialPrice))),
        biasQ:-120_000_000n+mulQ(uniformQ(seed,'account-bias',`${a.id}:${s.id}`,0,0),240_000_001n),beliefNoiseQ:0n,inventoryZetaQ:0n,scoreQ:0n,referenceQ:BigInt(stocks.find(x=>x.id===s.id)!.initialPrice)*SCALE,hourCapacity:0,hourUsed:0}))};
  });
  state.world={generationVersion:'world-v1',config:{...config},preset:'baseline-v1',regime:randomU32(seed,'regime-initial','world',0,0)%4,
    regimeExpiresDay:20+randomU32(seed,'regime-duration','world',0,0)%41,macro:{demandQ:0n,financingQ:0n,riskAppetiteQ:0n},
    sectors:(['A','B'] as MarketId[]).flatMap(market=>SECTORS.map(sector=>({market,sector,outlookQ:0n}))),stocks:economy,npcs,executions:[],majorStockIds:[],lastSettledTick:-1};
  state.configHash=sha256(encodeExact({generationVersion:'world-v1',preset:'baseline-v1',config,initialStocks:stocks,initialAccounts:accounts}));
  return state;
}
