import type { Clock } from './contracts.ts';
import { MAX_AMOUNT, MAX_PRICE, MAX_SHARES, decodeExact, encodeExact, reserve } from './numeric.ts';
import type { ExactValue } from './numeric.ts';
import { compareId } from './auction.ts';
import type { AccountState, AuditSummary, OrderState, ScenarioInput, TradingState } from './trading-types.ts';
import { sha256 } from './hash.ts';

export const MAX_WORLD_DAY = 1_000_000;
export const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
export function clone<T>(value: T): T { return decodeExact(encodeExact(value as ExactValue)) as T; }
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RangeError(message);
}
export function validInteger(value: unknown, low: number, high: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= low && (value as number) <= high;
}
export function validClock(clock: unknown): clock is Clock {
  if (!clock || typeof clock !== 'object') return false;
  const c = clock as Clock; return validInteger(c.worldDay, 0, MAX_WORLD_DAY) && validInteger(c.batch, 0, 15);
}
export function tick(clock: Clock): number { assert(validClock(clock), 'invalid clock'); return clock.worldDay * 16 + clock.batch; }
export function clockAt(value: number): Clock {
  assert(validInteger(value,0,MAX_WORLD_DAY * 16 + 15), 'clock out of range');
  return { worldDay: Math.floor(value / 16), batch: value % 16 };
}
export function active(order: OrderState): boolean { return order.status === 'active' || order.status === 'partial'; }
export function blockedCash(account: AccountState): bigint {
  return account.pendingProceeds.reduce((n, p) => n + p.amount, 0n);
}
export function availableCash(account: AccountState): bigint { return account.cash - account.reservedCash - blockedCash(account); }
export function totalShares(account: AccountState, stockId: string): number {
  return account.lots.filter(l => l.stockId === stockId).reduce((n,l) => n+l.quantity,0);
}
export function sellableShares(account: AccountState, stockId: string, at: number): number {
  return account.lots.filter(l => l.stockId === stockId && l.unlockTick <= at).reduce((n,l) => n+l.quantity,0);
}
export function reservedShares(state: TradingState, accountId: string, stockId: string): number {
  return state.orders.filter(o => active(o) && o.accountId === accountId && o.stockId === stockId)
    .reduce((n,o) => n+o.reservedShares,0);
}
export function sortLots(account: AccountState): void {
  account.lots.sort((a,b) => compareId(a.stockId,b.stockId) || a.unlockTick-b.unlockTick);
  const lots: AccountState['lots'] = [];
  for (const l of account.lots) { const last=lots[lots.length-1];
    if (last && last.stockId===l.stockId && last.unlockTick===l.unlockTick) last.quantity+=l.quantity;
    else if (l.quantity>0) lots.push({...l}); }
  account.lots=lots;
}
export function audit(state: TradingState): AuditSummary {
  const cash=state.accounts.reduce((n,a)=>n+a.cash,state.serviceCash);
  const totals=new Map<string,number>();for(const a of state.accounts)for(const lot of a.lots)totals.set(lot.stockId,(totals.get(lot.stockId)??0)+lot.quantity);
  const shares=state.initialShares.map(s=>{const total=totals.get(s.stockId)??0;
    return {stockId:s.stockId,total,expected:s.quantity,difference:total-s.quantity};});
  return {cash,initialCash:state.initialCash,cashDifference:cash-state.initialCash,shares,
    valid:cash===state.initialCash&&shares.every(s=>s.difference===0)};
}
export function validateState(state: TradingState): void {
  assert(state && typeof state==='object','missing state');
  assert(validInteger(state.seed,0,0xffff_ffff)&&state.rngVersion==='rng-v1','invalid RNG');
  assert(typeof state.configHash==='string'&&/^[0-9a-f]{64}$/.test(state.configHash),'invalid config hash');
  assert(validClock(state.clock)&&['publicDecision','settled'].includes(state.phase),'invalid phase');
  assert(state.preparationAppliedTick===tick(state.clock),'unprepared safe boundary');
  assert(validInteger(state.stateVersion,1,Number.MAX_SAFE_INTEGER)&&validInteger(state.publicVersion,1,Number.MAX_SAFE_INTEGER),'invalid versions');
  assert(typeof state.playerInjected==='boolean'&&typeof state.ended==='boolean'&&
    typeof state.majorAtCurrentTick==='boolean'&&typeof state.pauseNextDecision==='boolean','invalid state flags');
  assert(Array.isArray(state.stocks)&&state.stocks.length>0&&state.stocks.length<=200,'invalid stocks');
  assert(Array.isArray(state.accounts)&&state.accounts.length>0&&state.accounts.length<=1000,'invalid accounts');
  assert(Array.isArray(state.orders)&&state.orders.length<=1_000_000&&Array.isArray(state.commands)&&state.commands.length<=1_000_000,'invalid orders/receipts');
  assert(validInteger(state.nextSequence,0,Number.MAX_SAFE_INTEGER),'invalid order sequence');
  const stockIds=new Set<string>(),accountIds=new Set<string>(),orderIds=new Set<string>();
  for(const stock of state.stocks){assert(typeof stock.id==='string'&&stock.id.length>0&&stock.id.length<=128&&!stockIds.has(stock.id),'invalid stock ID');stockIds.add(stock.id);
    assert(['A','B'].includes(stock.market)&&validInteger(stock.initialPrice,1,MAX_PRICE)&&validInteger(stock.lastPrice,1,MAX_PRICE)&&validInteger(stock.totalShares,1,MAX_SHARES),'invalid stock');
    assert(stock.lastTradeAt===null||validClock(stock.lastTradeAt)&&tick(stock.lastTradeAt)<=tick(state.clock),'invalid last trade');
    assert(typeof stock.actualOperatingIndexQ==='bigint'&&stock.actualOperatingIndexQ>=5_000_000_000n&&stock.actualOperatingIndexQ<=2_000_000_000_000n,'invalid operating state');
    assert(Array.isArray(stock.reports)&&stock.reports.length<=MAX_WORLD_DAY+1&&Array.isArray(stock.batches)&&stock.batches.length<=16*(MAX_WORLD_DAY+1),'invalid history');
    for(const r of stock.reports)assert(validClock(r.publishedAt)&&tick(r.publishedAt)<=tick(state.clock)&&typeof r.operatingIndexQ==='bigint'&&r.operatingIndexQ>=5_000_000_000n&&r.operatingIndexQ<=2_000_000_000_000n,'invalid report');
    for(const b of stock.batches)assert(validClock(b.clock)&&tick(b.clock)<=tick(state.clock)&&validInteger(b.quantity,0,stock.totalShares)&&(b.price===null?b.quantity===0:validInteger(b.price,1,MAX_PRICE)&&b.quantity>0),'invalid batch history');
    const p=stock.protection;assert(p&&validInteger(p.reference,1,MAX_PRICE)&&[8,16,32,64].includes(p.bandPercent)&&['normal','special','reopenPending'].includes(p.mode)&&validInteger(p.zeroDays,0,2)&&typeof p.tradedToday==='boolean'&&validInteger(p.processedBatchesToday,0,16),'invalid protection');}
  for(const a of state.accounts){assert(typeof a.id==='string'&&a.id.length>0&&a.id.length<=128&&!accountIds.has(a.id),'invalid account ID');accountIds.add(a.id);
    assert(typeof a.canTrade==='boolean'&&typeof a.cash==='bigint'&&a.cash>=0n&&a.cash<=MAX_AMOUNT&&typeof a.reservedCash==='bigint'&&a.reservedCash>=0n&&a.reservedCash<=a.cash&&typeof a.feeWeight==='bigint'&&a.feeWeight>=0n&&a.feeWeight<=MAX_AMOUNT,'invalid account balance');
    assert(Array.isArray(a.pendingProceeds)&&a.pendingProceeds.length<=1_000_000&&Array.isArray(a.lots)&&a.lots.length<=1_000_000,'invalid lots/pending cash');
    for(const p of a.pendingProceeds)assert(typeof p.amount==='bigint'&&p.amount>0n&&p.amount<=MAX_AMOUNT&&validInteger(p.availableTick,tick(state.clock),MAX_WORLD_DAY*16+16),'invalid pending proceeds');
    for(const l of a.lots)assert(stockIds.has(l.stockId)&&validInteger(l.quantity,1,MAX_SHARES)&&validInteger(l.unlockTick,0,MAX_WORLD_DAY*16+16),'invalid lot');
    assert(availableCash(a)>=0n,'reserved/pending cash overlap');}
  assert(state.playerAccountId===null||accountIds.has(state.playerAccountId),'invalid player account');
  for(const o of state.orders){assert(typeof o.id==='string'&&o.id.length>0&&!orderIds.has(o.id),'invalid order ID');orderIds.add(o.id);
    assert(accountIds.has(o.accountId)&&stockIds.has(o.stockId)&&['immediate','day','plan'].includes(o.kind)&&['buy','sell'].includes(o.side),'invalid order identity');
    assert(validInteger(o.quantity,1,MAX_SHARES)&&validInteger(o.remainingQuantity,0,o.quantity)&&validInteger(o.filledQuantity,0,o.quantity)&&o.remainingQuantity+o.filledQuantity===o.quantity,'invalid order quantities');
    assert(validInteger(o.limitPrice,1,MAX_PRICE)&&validInteger(o.startTick,0,MAX_WORLD_DAY*16+15)&&validInteger(o.endTick,o.startTick,MAX_WORLD_DAY*16+15)&&validInteger(o.sequence,0,state.nextSequence-1),'invalid order range');
    assert(['active','partial','completed','cancelled','expired'].includes(o.status)&&typeof o.feesPaid==='bigint'&&o.feesPaid>=0n,'invalid order status');
    assert(typeof o.reservedCash==='bigint'&&o.reservedCash>=0n&&validInteger(o.reservedShares,0,o.remainingQuantity),'invalid order reserves');
    if(active(o)){assert(o.remainingQuantity>0&&o.endTick>=tick(state.clock),'expired active order');
      const batches=o.endTick-tick(state.clock)+(state.phase==='publicDecision'?1:0);
      assert(batches>0,'active order after end');
      assert(o.side==='buy'?o.reservedCash===reserve(o.limitPrice,o.remainingQuantity,o.kind==='immediate'?1:batches)&&o.reservedShares===0:o.reservedCash===0n&&o.reservedShares===o.remainingQuantity,'incorrect reservation');}
    else assert(o.reservedCash===0n&&o.reservedShares===0,'closed order retains reserves');}
  for(const a of state.accounts){assert(a.reservedCash===state.orders.filter(o=>o.accountId===a.id).reduce((n,o)=>n+o.reservedCash,0n),'cash reserve sum');
    for(const stock of state.stocks){assert(totalShares(a,stock.id)<=stock.totalShares,'account shares exceed issue');
      assert(reservedShares(state,a.id,stock.id)<=sellableShares(a,stock.id,tick(state.clock)),'sell reserve exceeds unlocked stock');
      const sides=new Set(state.orders.filter(o=>active(o)&&o.accountId===a.id&&o.stockId===stock.id).map(o=>o.side));assert(sides.size<=1,'opposite active orders');}}
  assert(typeof state.serviceCash==='bigint'&&state.serviceCash>=0n&&state.serviceCash<=MAX_AMOUNT&&typeof state.initialCash==='bigint'&&state.initialCash>=0n&&state.initialCash<=MAX_AMOUNT,'invalid service cash');
  assert(Array.isArray(state.initialShares)&&state.initialShares.length===state.stocks.length,'invalid initial supply');
  const initialIds=new Set<string>();for(const s of state.initialShares){assert(!initialIds.has(s.stockId)&&state.stocks.find(x=>x.id===s.stockId)?.totalShares===s.quantity,'initial supply mismatch');initialIds.add(s.stockId);}
  assert(audit(state).valid,'ledger conservation failure');
  assert(Array.isArray(state.messages)&&state.messages.length<=1_000_000&&Array.isArray(state.publications)&&state.publications.length<=1_000_000&&Array.isArray(state.appliedPublications),'invalid publications');
  for(const m of [...state.messages,...state.publications.map(p=>p.message)])assert(typeof m.id==='string'&&m.id.length>0&&validInteger(m.revision,1,Number.MAX_SAFE_INTEGER)&&validClock(m.publishedAt)&&validClock(m.expiresAt)&&tick(m.expiresAt)>=tick(m.publishedAt)&&typeof m.expectationQ==='bigint'&&['active','verified','expired'].includes(m.status)&&typeof m.text==='string','invalid public message');
  for(const p of state.publications)assert(typeof p.major==='boolean'&&(p.privateResultQ===undefined||typeof p.privateResultQ==='bigint'),'invalid private publication');
  for(const m of state.messages)assert(tick(m.publishedAt)<=tick(state.clock),'future public message');
  const receiptIds=new Set<string>();for(const r of state.commands){assert(typeof r.id==='string'&&!receiptIds.has(r.id)&&accountIds.has(r.accountId)&&typeof r.canonical==='string'&&r.result.id===r.id&&typeof r.result.accepted==='boolean'&&validInteger(r.result.stateVersion,1,state.stateVersion),'invalid command receipt');receiptIds.add(r.id);}
}

export function initialState(input: ScenarioInput): TradingState {
  assert(input&&typeof input==='object'&&validInteger(input.seed,0,0xffff_ffff),'invalid scenario seed');
  assert(Array.isArray(input.stocks)&&Array.isArray(input.accounts),'invalid scenario entities');
  const clock=clone(input.clock??{worldDay:0,batch:0});const at=tick(clock);
  for(const account of input.accounts){assert(Array.isArray(account.holdings),'invalid initial holdings');
    for(const lot of account.holdings)assert(lot&&validInteger(lot.quantity,0,MAX_SHARES),'initial shares must be nonnegative integers');}
  const accounts=input.accounts.map(a=>({id:a.id,canTrade:a.canTrade??true,cash:a.cash,reservedCash:0n,
    pendingProceeds:[],lots:a.holdings.map(l=>({stockId:l.stockId,quantity:l.quantity,unlockTick:l.unlockAt?tick(l.unlockAt):0})),
    feeWeight:a.feeWeight??(a.id===input.playerAccountId||a.canTrade===false?0n:a.cash)}));
  for(const a of accounts)sortLots(a);
  const stocks=input.stocks.map(s=>{const total=accounts.reduce((n,a)=>n+BigInt(totalShares(a,s.id)),0n);
    assert(total<=BigInt(MAX_SHARES),'issue exceeds maximum');
    return {id:s.id,market:s.market,initialPrice:s.initialPrice,totalShares:s.totalShares??Number(total),lastPrice:s.lastPrice??s.initialPrice,
      lastTradeAt:clone(s.lastTradeAt??null),actualOperatingIndexQ:s.actualOperatingIndexQ??100_000_000_000n,
      reports:[{publishedAt:{worldDay:0,batch:0},operatingIndexQ:100_000_000_000n}],
      protection:{reference:s.lastPrice??s.initialPrice,bandPercent:8 as const,mode:'normal' as const,zeroDays:0,tradedToday:s.lastTradeAt?.worldDay===clock.worldDay,processedBatchesToday:0,...s.protection},batches:[]};});
  accounts.sort((a,b)=>compareId(a.id,b.id));stocks.sort((a,b)=>compareId(a.id,b.id));
  const state:TradingState={seed:input.seed,rngVersion:'rng-v1',configHash:'0'.repeat(64),clock,phase:input.phase??'publicDecision',preparationAppliedTick:at,
    stateVersion:1,publicVersion:1,majorAtCurrentTick:false,pauseNextDecision:false,playerAccountId:input.playerAccountId,playerInjected:input.playerAccountId!==null,ended:false,
    stocks,accounts,serviceCash:input.serviceCash??0n,orders:[],nextSequence:0,commands:[],publications:clone(input.publications??[]),appliedPublications:[],messages:[],
    initialCash:accounts.reduce((n,a)=>n+a.cash,input.serviceCash??0n),initialShares:stocks.map(s=>({stockId:s.id,quantity:s.totalShares}))};
  state.publications.sort((a,b)=>tick(a.message.publishedAt)-tick(b.message.publishedAt)||compareId(a.message.id,b.message.id)||a.message.revision-b.message.revision);
  state.configHash=sha256(encodeExact({...state,configHash:'P1-explicit-scenario-v1'}));
  validateState(state);return state;
}
