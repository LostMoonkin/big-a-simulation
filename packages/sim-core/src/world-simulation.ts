import { SCALE, MAX_PRICE, ceilDiv, divQ, expQ, integerSqrt, logQ, mulQ, normalQ, randomU32, reserve, uniformQ } from './numeric.ts';
import { active, assert, availableCash, sellableShares, tick, totalShares } from './state.ts';
import type { Intent, TradingState } from './trading-types.ts';
import type { Candle, NpcState, SectorId, WorldState } from './world-types.ts';
import { BASELINE_REVIEW, BASELINE_STYLE, capWeights, clipQ, emptyCandle, SECTORS, splitInteger } from './world-generation.ts';
import { compareId } from './auction.ts';

/** Mutable current resources are copied; immutable completed bars/reports are shared until append. */
export function forkWorldState(state:TradingState):TradingState {
  const w=state.world;assert(w,'missing generated world');
  return {...state,clock:{...state.clock},stocks:state.stocks.map(s=>({...s,lastTradeAt:s.lastTradeAt?{...s.lastTradeAt}:null,protection:{...s.protection}})),
    accounts:state.accounts.map(a=>({...a,lots:a.lots.map(l=>({...l})),pendingProceeds:a.pendingProceeds.map(p=>({...p}))})),
    orders:state.orders.map(o=>({...o})),commands:[...state.commands],messages:state.messages.map(m=>({...m})),appliedPublications:[...state.appliedPublications],
    world:{...w,config:{...w.config},macro:{...w.macro},sectors:w.sectors.map(s=>({...s})),stocks:w.stocks.map(s=>({...s,currentDay:{...s.currentDay},currentHour:{...s.currentHour}})),
      npcs:w.npcs.map(n=>({...n,assets:n.assets.map(a=>({...a}))})),majorStockIds:[...w.majorStockIds],executions:[...w.executions]}};
}
const MEANS=[[500_000_000n,200_000_000n,400_000_000n],[700_000_000n,-300_000_000n,700_000_000n],[-600_000_000n,-400_000_000n,-700_000_000n],[100_000_000n,500_000_000n,0n]];
const TRANSITIONS=[[0n,450_000_000n,200_000_000n,350_000_000n],[250_000_000n,0n,550_000_000n,200_000_000n],[100_000_000n,50_000_000n,0n,850_000_000n],[600_000_000n,100_000_000n,300_000_000n,0n]];
function absQ(q:bigint):bigint{return q<0n?-q:q;}
function updateMacro(state:TradingState,w:WorldState):void {
  const day=state.clock.worldDay,at=tick(state.clock);
  if(day>=w.regimeExpiresDay){const draw=uniformQ(state.seed,'regime-transition','world',at,0),row=TRANSITIONS[w.regime]!;let cumulative=0n;
    for(let i=0;i<4;i++){cumulative+=row[i]!;if(draw<cumulative){w.regime=i;break;}}
    w.regimeExpiresDay=day+20+randomU32(state.seed,'regime-duration','world',at,0)%41;}
  const means=MEANS[w.regime]!,fields=['demandQ','financingQ','riskAppetiteQ'] as const;
  fields.forEach((field,i)=>w.macro[field]=clipQ(mulQ(960_000_000n,w.macro[field])+mulQ(40_000_000n,means[i]!)+mulQ(40_000_000n,normalQ(state.seed,'macro',field,at,0)),-SCALE,SCALE));
  for(const s of w.sectors)s.outlookQ=clipQ(mulQ(940_000_000n,s.outlookQ)+mulQ(60_000_000n,normalQ(state.seed,'sector',`${s.market}:${s.sector}`,at,0)),-SCALE,SCALE);
}
function riskFromDays(days:Candle[]):bigint {
  if(days.length<21)return 200_000_000n;
  const history=days.slice(-21),returns=history.slice(1).map((d,i)=>divQ(BigInt(d.close),BigInt(history[i]!.close))-SCALE);
  const mean=returns.reduce((n,r)=>n+r,0n)/20n;
  const variance=returns.reduce((n,r)=>n+(r-mean)*(r-mean),0n)/19n;
  return clipQ(integerSqrt(variance)*SCALE/60_000_000n,0n,SCALE);
}
/** Called once per public boundary. Hidden business is committed before publishing scheduled reports. */
export function prepareWorld(state:TradingState):void {
  const w=state.world!;w.majorStockIds=[];const day=state.clock.worldDay,at=tick(state.clock);
  if(at===4000&&!state.playerInjected){assert(!state.accounts.some(a=>a.id==='player'),'duplicate player endowment');
    state.accounts.push({id:'player',canTrade:true,cash:w.config.playerCapital,reservedCash:0n,pendingProceeds:[],lots:[],feeWeight:0n});
    state.accounts.sort((a,b)=>compareId(a.id,b.id));state.initialCash+=w.config.playerCapital;state.playerAccountId='player';state.playerInjected=true;}
  if(state.clock.batch===0){
    updateMacro(state,w);
    for(const e of w.stocks){const stock=state.stocks.find(s=>s.id===e.id)!;
      if(day>0){stock.actualOperatingIndexQ=clipQ(mulQ(stock.actualOperatingIndexQ,expQ(e.pendingGrowthQ)),5n*SCALE,2000n*SCALE);e.pendingGrowthQ=0n;}
      const before=e.forecastQ,last=stock.reports[stock.reports.length-1]!;
      const reporting=day%20===e.reportPhase&&!(last.publishedAt.worldDay===day&&last.publishedAt.batch===0);
      if(reporting){stock.reports=[...stock.reports,{publishedAt:{...state.clock},operatingIndexQ:stock.actualOperatingIndexQ}];}
      const recent=stock.reports[stock.reports.length-1]!,previous=stock.reports[stock.reports.length-2];
      const historic=previous?logQ(divQ(recent.operatingIndexQ,previous.operatingIndexQ))/BigInt(recent.publishedAt.worldDay-previous.publishedAt.worldDay):0n;
      e.publicGrowthQ=clipQ(historic+mulQ(500_000n,mulQ(e.demandExposureQ,w.macro.demandQ)),-3_000_000n,3_000_000n);
      e.forecastQ=mulQ(recent.operatingIndexQ,expQ(e.publicGrowthQ*BigInt(day-recent.publishedAt.worldDay+20)));
      e.publicValueQ=BigInt(stock.initialPrice)*e.forecastQ/100n;
      e.publicValueQ=mulQ(e.publicValueQ,expQ(mulQ(200_000_000n,mulQ(e.leverageQ,w.macro.financingQ))));
      if(reporting){
        const major=absQ(e.forecastQ-before)*20n>=before;if(major)w.majorStockIds.push(e.id);
        const id=`report:${e.id}`,message={id,revision:Math.floor(day/20)+1,publishedAt:{...state.clock},expiresAt:{worldDay:day+20,batch:0},expectationQ:0n,status:'verified' as const,
          text:`${e.name}：公开经营指数 ${recent.operatingIndexQ/SCALE}.${String(recent.operatingIndexQ%SCALE).padStart(9,'0').slice(0,3)}，覆盖至世界日 ${day-1}；经营预期参考${major?'变动至少5%':'已更新'}。`};
        state.messages=state.messages.filter(m=>m.id!==id);state.messages.push(message);
        if(major&&state.playerAccountId&&totalShares(state.accounts.find(a=>a.id===state.playerAccountId)!,e.id)>0)state.majorAtCurrentTick=true;
      }
      e.riskQ=riskFromDays(e.days);e.currentDay=emptyCandle(e.id,day,null,stock.lastPrice,stock.lastTradeAt);
    }
    for(const npc of w.npcs)if(npc.style==='inventory')for(const a of npc.assets){
      const p=BASELINE_STYLE.inventory;a.inventoryZetaQ=clipQ(mulQ(p.dailyPersistenceQ,a.inventoryZetaQ)+mulQ(p.dailySigmaQ,normalQ(state.seed,'inventory-target',`${npc.accountId}:${a.stockId}`,at,0)),-p.zetaLimitQ,p.zetaLimitQ);
      a.targetShares=Number(BigInt(a.initialShares)*(SCALE+a.inventoryZetaQ)/SCALE);}
  }
  if(state.clock.batch%4===0){const hour=Math.floor(state.clock.batch/4);
    for(const e of w.stocks){const stock=state.stocks.find(s=>s.id===e.id)!;e.currentHour=emptyCandle(e.id,day,hour,stock.lastPrice,stock.lastTradeAt);}
    for(const npc of w.npcs)for(const a of npc.assets){const e=w.stocks.find(s=>s.id===a.stockId)!,days=e.days.slice(-20);
      const prior=BigInt(e.floatShares)*10_000_000n,adv=days.length?days.reduce((n,d)=>n+BigInt(d.volume)*SCALE,0n)/BigInt(days.length):prior;
      const capacityQ=(adv+prior)/2n;a.hourCapacity=Number(mulQ(capacityQ,BASELINE_STYLE[npc.style].hourCapacityQ)/SCALE);a.hourUsed=0;}
  }
}
function schedule(npc:NpcState,day:number,batch:number):{due:boolean;lambdaQ:bigint} {
  if(npc.style==='inventory')return {due:false,lambdaQ:SCALE};
  const r=BASELINE_REVIEW[npc.role];return {due:r.period==='hour'?batch%4===0:batch===0&&day%r.period===0,lambdaQ:r.lambdaQ};
}
function convert(state:TradingState,accountId:string,rows:Intent[]):Intent[] {
  const account=state.accounts.find(a=>a.id===accountId)!,at=tick(state.clock),free=availableCash(account),buys=rows.filter(r=>r.side==='buy');
  const cost=(r:Intent)=>r.quantity>0?reserve(r.limitPrice,r.quantity,1):0n,total=buys.reduce((n,r)=>n+cost(r),0n);
  if(total>free)for(const r of buys)r.quantity=Number(BigInt(r.quantity)*free/total);
  let spend=buys.reduce((n,r)=>n+cost(r),0n);
  const reduce=[...buys].sort((a,b)=>a.scoreQ!<b.scoreQ!?-1:a.scoreQ!>b.scoreQ!?1:compareId(a.stockId,b.stockId)||a.level!-b.level!);
  while(spend>free){const r=reduce.find(x=>x.quantity>0)!;const old=cost(r);r.quantity--;spend+=cost(r)-old;}
  const left=new Map<string,number>();for(const r of rows)if(r.side==='sell'){const freeShares=left.get(r.stockId)??sellableShares(account,r.stockId,at);r.quantity=Math.min(r.quantity,freeShares);left.set(r.stockId,freeShares-r.quantity);}
  return rows.filter(r=>r.quantity>0);
}
/** Generate all finite orders before any stock settles. No commands/receipts or future sale proceeds. */
export function generateNpcOrders(state:TradingState):void {
  const w=state.world!,at=tick(state.clock),stockMap=new Map(state.stocks.map(s=>[s.id,s])),economy=new Map(w.stocks.map(s=>[s.id,s]));
  for(const npc of w.npcs){const account=state.accounts.find(a=>a.id===npc.accountId)!,params=BASELINE_STYLE[npc.style],holdings=new Map<string,number>();
    for(const l of account.lots)holdings.set(l.stockId,(holdings.get(l.stockId)??0)+l.quantity);
    const values=npc.assets.map(a=>BigInt(holdings.get(a.stockId)??0)*BigInt(stockMap.get(a.stockId)!.lastPrice)),nav=values.reduce((n,v)=>n+v,account.cash);
    assert(nav>0n,'NPC NAV exhausted');
    for(const a of npc.assets){const e=economy.get(a.stockId)!,stock=stockMap.get(a.stockId)!;
      a.beliefNoiseQ=clipQ(mulQ(900_000_000n,a.beliefNoiseQ)+mulQ(params.beliefSigmaQ,normalQ(state.seed,'belief',`${npc.accountId}:${a.stockId}`,at,0)),-100_000_000n,100_000_000n);
      a.referenceQ=mulQ(e.publicValueQ,expQ(a.biasQ+a.beliefNoiseQ));
      if(npc.style!=='inventory'){const f=clipQ(divQ(logQ(divQ(a.referenceQ,BigInt(stock.lastPrice)*SCALE)),250_000_000n),-SCALE,SCALE);
        const multiplier=stock.market==='A'?SCALE:1_150_000_000n;
        a.scoreQ=mulQ(mulQ(params.alphaQ,multiplier),f)-mulQ(300_000_000n,e.riskQ)+BigInt(params.scoreNoiseMultiplier)*a.beliefNoiseQ;}
    }
    const scheduled=schedule(npc,state.clock.worldDay,state.clock.batch),major=npc.assets.some(a=>w.majorStockIds.includes(a.stockId));
    if(npc.style!=='inventory'&&(scheduled.due||major)&&npc.lastReviewPublicVersion!==state.publicVersion){
      const fraction=clipQ(params.stockFractionQ+mulQ(100_000_000n,w.macro.riskAppetiteQ),350_000_000n,850_000_000n);
      const raw=npc.assets.map(a=>{let weight=mulQ(a.baselineWeightQ,expQ(divQ(a.scoreQ,params.temperatureQ)));
        if(npc.style==='crossMarket'){const e=economy.get(a.stockId)!,sector=w.sectors.find(s=>s.market===e.market&&s.sector===e.sector)!;weight=mulQ(weight,expQ(mulQ(250_000_000n,sector.outlookQ)));}return weight;});
      const normal=splitInteger(fraction,raw,npc.assets.map(a=>a.stockId)),capped=capWeights(normal,npc.assets.map(a=>economy.get(a.stockId)!.sector),true);
      const lambda=major&&scheduled.lambdaQ<500_000_000n?500_000_000n:scheduled.lambdaQ;
      npc.assets.forEach((a,i)=>{a.previousWeightQ=mulQ(SCALE-lambda,a.previousWeightQ)+mulQ(lambda,capped[i]!);a.targetShares=Number(nav*a.previousWeightQ/(SCALE*BigInt(stockMap.get(a.stockId)!.lastPrice)));});
      npc.cashWeightQ=SCALE-npc.assets.reduce((n,a)=>n+a.previousWeightQ,0n);npc.lastReviewAt={...state.clock};npc.lastReviewPublicVersion=state.publicVersion;
    }
    const sectorValues=new Map<SectorId,bigint>(SECTORS.map(s=>[s,0n]));npc.assets.forEach((a,i)=>{const sector=economy.get(a.stockId)!.sector;sectorValues.set(sector,sectorValues.get(sector)!+values[i]!);});
    const inventoryOver=npc.style==='inventory'&&values.reduce((n,v)=>n+v,0n)*10n>nav*9n;
    const intents:Intent[]=[];
    npc.assets.forEach((a,i)=>{const stock=stockMap.get(a.stockId)!,e=economy.get(a.stockId)!,held=holdings.get(a.stockId)??0;
      const singleOver=values[i]!*20n>nav*3n,sectorValue=sectorValues.get(e.sector)!,sectorOver=sectorValue*20n>nav*7n;
      if(singleOver)a.targetShares=Math.min(a.targetShares,Number(nav*3n/(20n*BigInt(stock.lastPrice))));
      if(sectorOver)a.targetShares=Math.min(a.targetShares,Number(BigInt(held)*nav*7n/(20n*sectorValue)));
      if(inventoryOver)a.targetShares=Math.min(a.targetShares,Number(BigInt(held)*nav*9n/(10n*values.reduce((n,v)=>n+v,0n))));
      const outstanding=state.orders.filter(o=>active(o)&&o.accountId===npc.accountId&&o.stockId===a.stockId);
      const gap=a.targetShares-held-outstanding.filter(o=>o.side==='buy').reduce((n,o)=>n+o.remainingQuantity,0)+outstanding.filter(o=>o.side==='sell').reduce((n,o)=>n+o.remainingQuantity,0);
      if(gap===0||gap>0&&(singleOver||sectorOver||inventoryOver))return;
      const capacity=Math.max(0,a.hourCapacity-a.hourUsed),wanted=Math.min(Math.abs(gap),capacity);
      const quantity=Math.min(capacity,Number(ceilDiv(BigInt(wanted),BigInt(4-state.clock.batch%4))));if(quantity===0)return;
      const side=gap>0?'buy':'sell',width=2_000_000n+mulQ(8_000_000n,e.riskQ),parts=splitInteger(BigInt(quantity),[2n,3n,5n],['0','1','2']);
      [0n,width,width*3n].forEach((spread,level)=>{const rawPrice=mulQ(a.referenceQ,side==='buy'?SCALE-spread:SCALE+spread),price=Number(side==='buy'?rawPrice/SCALE:ceilDiv(rawPrice,SCALE));
        if(parts[level]!>0n&&price>=1&&price<=MAX_PRICE)intents.push({stockId:a.stockId,side,quantity:Number(parts[level]),limitPrice:price,scoreQ:a.scoreQ,level});});
    });
    for(const intent of convert(state,npc.accountId,intents)){const reservedCash=intent.side==='buy'?reserve(intent.limitPrice,intent.quantity,1):0n;
      state.orders.push({id:`npc:${at}:${npc.accountId}:${intent.stockId}:${intent.level}`,accountId:npc.accountId,kind:'immediate',stockId:intent.stockId,side:intent.side,quantity:intent.quantity,
        remainingQuantity:intent.quantity,filledQuantity:0,limitPrice:intent.limitPrice,startTick:at,endTick:at,sequence:state.nextSequence++,reservedCash,reservedShares:intent.side==='sell'?intent.quantity:0,feesPaid:0n,status:'active'});
      account.reservedCash+=reservedCash;}
  }
}
function fillCandle(c:Candle,price:number|null,quantity:number,at:TradingState['clock']):void {
  if(price===null)return;
  if(c.noTrade){c.open=price;c.high=price;c.low=price;}else{c.high=Math.max(c.high,price);c.low=Math.min(c.low,price);}
  c.close=price;c.volume+=quantity;c.turnover+=BigInt(price)*BigInt(quantity);c.noTrade=false;c.referenceOnly=false;c.lastTradeAt={...at};
}
export function recordWorldBatch(state:TradingState,stockId:string,price:number|null,quantity:number):void {
  const w=state.world!,e=w.stocks.find(s=>s.id===stockId)!;fillCandle(e.currentHour,price,quantity,state.clock);fillCandle(e.currentDay,price,quantity,state.clock);
  if(state.clock.batch%4===3){e.currentHour.completed=true;e.hours=[...e.hours,e.currentHour].filter(c=>c.worldDay>=state.clock.worldDay-119);}
  if(state.clock.batch===15){e.currentDay.completed=true;e.days=[...e.days,e.currentDay];
    const sector=w.sectors.find(s=>s.market===e.market&&s.sector===e.sector)!;
    const exposure=mulQ(e.demandExposureQ,w.macro.demandQ)+mulQ(e.financingExposureQ,w.macro.financingQ);
    e.pendingGrowthQ=clipQ(e.muQ+mulQ(500_000n,exposure)+mulQ(500_000n,sector.outlookQ)+mulQ(800_000n,normalQ(state.seed,'operating',e.id,tick(state.clock),0)),-3_000_000n,3_000_000n);
  }
}
export function finishWorldBatch(state:TradingState):void {
  const w=state.world!;
  for(const o of state.orders)if(o.accountId!==state.playerAccountId&&o.filledQuantity>0){const npc=w.npcs.find(n=>n.accountId===o.accountId)!,a=npc.assets.find(a=>a.stockId===o.stockId)!;a.hourUsed+=o.filledQuantity;assert(a.hourUsed<=a.hourCapacity,'NPC hourly capacity exceeded');}
  state.orders=state.orders.filter(o=>o.accountId===state.playerAccountId);w.lastSettledTick=tick(state.clock);
}
