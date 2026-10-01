import { CONTENT_VERSION, RULES_VERSION } from './contracts.ts';
import { MAX_AMOUNT, MAX_PRICE, MAX_SHARES, SCALE, reserve } from './numeric.ts';
import { active, assert, audit, tick, validClock, validInteger } from './state.ts';
import type { TradingState } from './trading-types.ts';
import type { Candle } from './world-types.ts';
import { SECTORS } from './world-generation.ts';

/** Current resources only. Historical documents are fully checked on create/export/restore. */
export function validateWorldBalances(state:TradingState):void {
  const at=tick(state.clock),shares=new Map<string,number>(),stockIds=new Set(state.stocks.map(s=>s.id));let cash=state.serviceCash;
  assert(typeof cash==='bigint'&&cash>=0n&&cash<=MAX_AMOUNT,'invalid service balance');
  for(const a of state.accounts){assert(typeof a.cash==='bigint'&&a.cash>=0n&&a.cash<=MAX_AMOUNT,'invalid account cash');cash+=a.cash;
    const total=new Map<string,number>(),sellable=new Map<string,number>(),reserved=new Map<string,number>(),sides=new Map<string,string>();let frozen=0n,pending=0n;
    for(const p of a.pendingProceeds){assert(typeof p.amount==='bigint'&&p.amount>0n&&validInteger(p.availableTick,at,16_000_016),'invalid pending cash');pending+=p.amount;}
    for(const l of a.lots){assert(stockIds.has(l.stockId)&&validInteger(l.quantity,1,MAX_SHARES)&&validInteger(l.unlockTick,0,16_000_016),'invalid share lot');
      shares.set(l.stockId,(shares.get(l.stockId)??0)+l.quantity);total.set(l.stockId,(total.get(l.stockId)??0)+l.quantity);
      if(l.unlockTick<=at)sellable.set(l.stockId,(sellable.get(l.stockId)??0)+l.quantity);}
    for(const o of state.orders)if(o.accountId===a.id){assert(o.quantity===o.remainingQuantity+o.filledQuantity&&validInteger(o.remainingQuantity,0,o.quantity),'invalid order quantity');
      if(active(o)){const left=o.endTick-at+(state.phase==='publicDecision'?1:0);assert(left>0,'expired live order');
        assert(!sides.has(o.stockId)||sides.get(o.stockId)===o.side,'opposite orders');sides.set(o.stockId,o.side);
        if(o.side==='buy'){assert(o.reservedCash===reserve(o.limitPrice,o.remainingQuantity,o.kind==='immediate'?1:left)&&o.reservedShares===0,'buy reservation mismatch');frozen+=o.reservedCash;}
        else{assert(o.reservedCash===0n&&o.reservedShares===o.remainingQuantity,'sell reservation mismatch');reserved.set(o.stockId,(reserved.get(o.stockId)??0)+o.reservedShares);}}
      else assert(o.reservedCash===0n&&o.reservedShares===0,'closed resources remain frozen');}
    assert(a.reservedCash===frozen&&a.cash>=frozen+pending,'account cash unavailable');
    for(const s of state.stocks){assert((total.get(s.id)??0)<=s.totalShares,'holding exceeds issue');assert((reserved.get(s.id)??0)<=(sellable.get(s.id)??0),'sell reservation exceeds unlocked stock');}
  }
  assert(cash===state.initialCash,'cash conservation failure');for(const s of state.stocks)assert(shares.get(s.id)===s.totalShares,'share conservation failure');
}
export function validateWorld(state:TradingState):void {
  const w=state.world;assert(w&&w.generationVersion==='world-v1'&&w.preset==='baseline-v1','invalid world version');
  const c=w.config;assert(c&&c.seed===state.seed&&c.size==='prototype'&&c.mode==='baseline'&&c.rulesVersion===RULES_VERSION&&c.contentVersion===CONTENT_VERSION&&typeof c.playerCapital==='bigint'&&c.playerCapital>=10_000_000n&&c.playerCapital<=1_000_000_000n,'invalid world configuration');
  assert(state.stocks.length===40&&Array.isArray(w.stocks)&&w.stocks.length===40&&Array.isArray(w.npcs)&&w.npcs.length===26,'invalid generated dimensions');
  assert(state.accounts.length===(state.playerInjected?28:27)&&state.playerAccountId===(state.playerInjected?'player':null),'invalid world player entry');
  const at=tick(state.clock);assert(state.playerInjected===(at>=4000)&&w.lastSettledTick===at-(state.phase==='publicDecision'?1:0),'invalid warmup boundary');
  assert(validInteger(w.regime,0,3)&&validInteger(w.regimeExpiresDay,state.clock.worldDay,1_000_060),'invalid economic phase');
  const bounded=(q:unknown,low:bigint,high:bigint)=>typeof q==='bigint'&&q>=low&&q<=high;
  for(const q of Object.values(w.macro))assert(bounded(q,-SCALE,SCALE),'invalid public macro');
  assert(Array.isArray(w.sectors)&&w.sectors.length===12&&new Set(w.sectors.map(s=>`${s.market}:${s.sector}`)).size===12,'invalid public sectors');
  for(const s of w.sectors)assert(['A','B'].includes(s.market)&&SECTORS.includes(s.sector)&&bounded(s.outlookQ,-SCALE,SCALE),'invalid public sector');
  const validateCandle=(b:Candle,stockId:string,maxVolume:number):void=>{
    assert(b&&b.stockId===stockId&&validInteger(b.worldDay,0,state.clock.worldDay)&&(b.hour===null||validInteger(b.hour,0,3))&&b.timestamp===946_684_800_000+b.worldDay*86_400_000+(b.hour??0)*3_600_000,'invalid candle clock');
    assert([b.open,b.high,b.low,b.close].every(p=>validInteger(p,1,MAX_PRICE))&&b.low<=b.open&&b.low<=b.close&&b.high>=b.open&&b.high>=b.close,'invalid candle OHLC');
    assert(validInteger(b.volume,0,maxVolume)&&bounded(b.turnover,0n,MAX_AMOUNT)&&typeof b.completed==='boolean'&&typeof b.noTrade==='boolean'&&typeof b.referenceOnly==='boolean'&&b.noTrade===(b.volume===0)&&
      (b.noTrade?b.turnover===0n&&b.open===b.high&&b.low===b.close&&b.open===b.close:b.turnover>=BigInt(b.low)*BigInt(b.volume)&&b.turnover<=BigInt(b.high)*BigInt(b.volume)),'invalid candle volume');
    assert(b.lastTradeAt===null||validClock(b.lastTradeAt)&&tick(b.lastTradeAt)<=at,'invalid candle trade timestamp');
    assert(b.referenceOnly===(b.lastTradeAt===null),'invalid reference-only marker');
  };
  const ids=new Set<string>();for(const e of w.stocks){const s=state.stocks.find(s=>s.id===e.id);assert(s&&!ids.has(e.id)&&s.market===e.market,'invalid company identity');ids.add(e.id);
    assert(typeof e.name==='string'&&typeof e.business==='string'&&e.business.length>0&&SECTORS.includes(e.sector)&&['large','medium','small'].includes(e.tier)&&validInteger(e.floatShares,1,s.totalShares)&&validInteger(e.reportPhase,0,19),'invalid public company');
    assert(bounded(e.muQ,-200_000n,400_000n)&&bounded(e.pendingGrowthQ,-3_000_000n,3_000_000n)&&bounded(e.publicGrowthQ,-3_000_000n,3_000_000n)&&bounded(e.forecastQ,1n,MAX_AMOUNT)&&bounded(e.publicValueQ,1n,MAX_AMOUNT)&&bounded(e.riskQ,0n,SCALE),'invalid company model');
    assert(bounded(e.demandExposureQ,-SCALE,SCALE)&&bounded(e.financingExposureQ,-SCALE,SCALE)&&(e.demandExposureQ<0n?-e.demandExposureQ:e.demandExposureQ)+(e.financingExposureQ<0n?-e.financingExposureQ:e.financingExposureQ)<=SCALE&&bounded(e.leverageQ,0n,SCALE)&&bounded(e.durationQ,0n,SCALE),'invalid business exposure');
    assert(Array.isArray(e.concepts)&&e.concepts.length<=2&&new Set(e.concepts.map(c=>c.id)).size===e.concepts.length&&e.concepts.reduce((n,c)=>n+c.exposureQ,0n)<=SCALE,'invalid concept exposure');
    for(const concept of e.concepts)assert(typeof concept.business==='string'&&concept.business.length>0&&bounded(concept.exposureQ,1n,SCALE),'invalid concept business');
    assert(Array.isArray(e.days)&&e.days.length===Math.floor((w.lastSettledTick+1)/16)&&Array.isArray(e.hours)&&e.hours.length<=480,'invalid candle retention');
    validateCandle(e.currentDay,e.id,s.totalShares*16);validateCandle(e.currentHour,e.id,s.totalShares*4);
    for(let i=0;i<e.days.length;i++){const b=e.days[i]!;validateCandle(b,e.id,s.totalShares*16);assert(b.worldDay===i&&b.hour===null&&b.completed,'non-continuous completed days');}
    for(let i=0;i<e.hours.length;i++){const b=e.hours[i]!;validateCandle(b,e.id,s.totalShares*4);assert(b.hour!==null&&b.completed&&b.worldDay*4+b.hour<=Math.floor((w.lastSettledTick-3)/4),'future completed hour');
      if(i>0){const prev=e.hours[i-1]!;assert(b.worldDay*4+b.hour===prev.worldDay*4+prev.hour!+1,'non-continuous completed hours');}}
  }
  const npcIds=new Set<string>();for(const n of w.npcs){assert(typeof n.accountId==='string'&&!npcIds.has(n.accountId)&&state.accounts.some(a=>a.id===n.accountId&&a.canTrade),'invalid NPC account');npcIds.add(n.accountId);
    assert(['value','trend','theme','inventory','noise','crossMarket'].includes(n.style)&&(n.market===null||['A','B'].includes(n.market))&&Array.isArray(n.assets)&&n.assets.length===(n.market===null?40:20),'invalid NPC profile');
    assert(validInteger(n.lastReviewPublicVersion,0,state.publicVersion)&&(n.lastReviewAt===null||validClock(n.lastReviewAt)&&tick(n.lastReviewAt)<=at)&&bounded(n.cashWeightQ,0n,SCALE),'invalid NPC review memory');
    assert(new Set(n.assets.map(a=>a.stockId)).size===n.assets.length&&n.assets.reduce((sum,a)=>sum+a.previousWeightQ,0n)+n.cashWeightQ===SCALE,'invalid complete target vector');
    for(const a of n.assets){const s=state.stocks.find(s=>s.id===a.stockId);assert(s&&(n.market===null||s.market===n.market),'illegal NPC market');
      assert(validInteger(a.initialShares,1,s.totalShares)&&validInteger(a.targetShares,0,MAX_SHARES)&&bounded(a.baselineWeightQ,1n,SCALE)&&bounded(a.previousWeightQ,0n,150_000_000n)&&bounded(a.biasQ,-120_000_000n,120_000_000n)&&bounded(a.beliefNoiseQ,-100_000_000n,100_000_000n)&&bounded(a.inventoryZetaQ,-100_000_000n,100_000_000n)&&bounded(a.referenceQ,1n,MAX_AMOUNT)&&typeof a.scoreQ==='bigint','invalid NPC target/belief');
      assert(validInteger(a.hourCapacity,0,MAX_SHARES)&&validInteger(a.hourUsed,0,a.hourCapacity),'invalid hourly capacity');}
  }
  assert(Array.isArray(w.majorStockIds)&&w.majorStockIds.every(id=>ids.has(id))&&Array.isArray(w.executions)&&w.executions.length<=1_000_000,'invalid public execution history');
  for(const x of w.executions)assert(validClock(x.clock)&&tick(x.clock)<=at&&ids.has(x.stockId)&&typeof x.orderId==='string'&&['buy','sell'].includes(x.side)&&validInteger(x.price,1,MAX_PRICE)&&validInteger(x.quantity,1,MAX_SHARES)&&bounded(x.fee,0n,MAX_AMOUNT)&&(x.side==='buy'?validClock(x.unlockAt)&&tick(x.unlockAt)>tick(x.clock):x.unlockAt===null),'invalid owned execution');
  assert(audit(state).valid,'world ledger conservation');validateWorldBalances(state);
}
