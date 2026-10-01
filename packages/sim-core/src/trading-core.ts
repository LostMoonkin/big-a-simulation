import { CONTENT_VERSION, RULES_VERSION, SNAPSHOT_VERSION } from './contracts.ts';
import type { AdvanceRequest, AdvanceResult, Command, CommandResult, FailureCode,
  MarketCore, PublicAccount, PublicMessage, PublicQuery, SnapshotEnvelope, WorldConfig } from './contracts.ts';
import { MATH_VERSION, MAX_PRICE, MAX_SHARES, ceilDiv, decodeExact, encodeExact, fee, reserve } from './numeric.ts';
import type { ExactValue } from './numeric.ts';
import { clearAuction, compareId } from './auction.ts';
import { sha256, utf8ByteLength } from './hash.ts';
import { active, assert, audit, availableCash, clockAt, clone, initialState, MAX_SNAPSHOT_BYTES,
  reservedShares, sellableShares, sortLots, tick, totalShares, validClock, validInteger, validateState } from './state.ts';
import type { AccountState, AuctionInput, AuctionResult, BatchTrace, FeeItem, Intent,
  ProtectionState, PublicTradingView, ScenarioInput, StockState, TradingDiagnostics, TradingState } from './trading-types.ts';
import type { WarmupRequest, WarmupResult, WorldDiagnostics, WorldProgress, WorldPublicView } from './world-types.ts';
import { generateWorld } from './world-generation.ts';
import { finishWorldBatch, forkWorldState, generateNpcOrders, prepareWorld, recordWorldBatch } from './world-simulation.ts';
import { validateWorld, validateWorldBalances } from './world-validation.ts';

function fork(state:TradingState):TradingState{return state.world?forkWorldState(state):clone(state);}
function validateRuntime(state:TradingState):void{if(state.world)validateWorldBalances(state);else validateState(state);}
function progress(state:TradingState):WorldProgress{
  const w=state.world;assert(w,'not an autonomous world');const done=Math.min(4000,w.lastSettledTick+1);
  return {seed:state.seed,size:'prototype',mode:'baseline',preset:'baseline-v1',warmupCompletedBatches:done,warmupTotalBatches:4000,
    preheated:done===4000,playerInjected:state.playerInjected,playerDay:state.playerInjected?state.clock.worldDay-249:null,
    originalCapital:w.config.playerCapital,prototypeDayLimit:60};
}

function bounds(stock: StockState, at: number): { low: number; high: number } {
  const p=stock.protection;
  if(p.mode==='special'&&(stock.market==='B'||at%16===0))return {low:1,high:MAX_PRICE};
  if(p.mode==='reopenPending'&&stock.market==='A'&&at%16===0)return {low:1,high:MAX_PRICE};
  const percent=stock.market==='A'?10:p.bandPercent;
  return {low:Math.max(1,Number(ceilDiv(BigInt(p.reference)*BigInt(100-percent),100n))),
    high:Math.min(MAX_PRICE,Number(BigInt(p.reference)*BigInt(100+percent)/100n))};
}
function emptyAuction(): AuctionResult { return {price:null,quantity:0,buyAllocations:[],sellAllocations:[],orderAllocations:[]}; }
function publicMessage(m:PublicMessage):PublicMessage {return {id:m.id,revision:m.revision,publishedAt:clone(m.publishedAt),expectationQ:m.expectationQ,expiresAt:clone(m.expiresAt),status:m.status,text:m.text};}
function getAccount(state: TradingState,id:string): AccountState {
  const account=state.accounts.find(a=>a.id===id);assert(account,'unknown account');return account;
}
function resetReservations(state: TradingState): void {
  const at=tick(state.clock);
  for(const a of state.accounts)a.reservedCash=0n;
  for(const o of state.orders){o.reservedCash=0n;o.reservedShares=0;
    if(active(o)){const left=o.endTick-at+(state.phase==='publicDecision'?1:0);
      if(left<=0||o.remainingQuantity===0){o.status=o.remainingQuantity===0?'completed':o.kind==='immediate'?'cancelled':'expired';continue;}
      if(o.side==='buy'){o.reservedCash=reserve(o.limitPrice,o.remainingQuantity,o.kind==='immediate'?1:left);getAccount(state,o.accountId).reservedCash+=o.reservedCash;}
      else o.reservedShares=o.remainingQuantity;}}
}
function consumeLots(account: AccountState,stockId:string,quantity:number,at:number): void {
  let left=quantity;
  for(const lot of account.lots)if(lot.stockId===stockId&&lot.unlockTick<=at){const take=Math.min(left,lot.quantity);lot.quantity-=take;left-=take;if(left===0)break;}
  assert(left===0,'sell allocation exceeds unlocked lots');sortLots(account);
}
function applyClearing(state: TradingState,stock:StockState,result:AuctionResult): FeeItem[] {
  if(result.price===null)return [];
  const price=result.price,at=tick(state.clock);
  const groups=new Map<string,typeof result.orderAllocations>();
  for(const fill of result.orderAllocations){const key=JSON.stringify([fill.accountId,fill.side]);
    const group=groups.get(key)??[];group.push(fill);groups.set(key,group);}
  const items:FeeItem[]=[];
  for(const group of groups.values()){
    const first=group[0]!,account=getAccount(state,first.accountId);
    const rows=group.map(fill=>{const order=state.orders.find(o=>o.id===fill.orderId);assert(order,'missing allocated order');
      const amount=BigInt(price)*BigInt(fill.quantity);return {fill,order,amount,fee:amount/2000n,remainder:amount%2000n};});
    const amount=rows.reduce((n,r)=>n+r.amount,0n),totalFee=fee(amount);
    let left=totalFee-rows.reduce((n,r)=>n+r.fee,0n);
    rows.sort((a,b)=>a.remainder>b.remainder?-1:a.remainder<b.remainder?1:compareId(a.order.id,b.order.id));
    for(const r of rows){if(left>0n){r.fee++;left--;}
      assert(r.fee<=fee(r.amount),'fee attribution exceeds reservation');
      r.order.remainingQuantity-=r.fill.quantity;r.order.filledQuantity+=r.fill.quantity;r.order.feesPaid+=r.fee;
      r.order.status=r.order.remainingQuantity===0?'completed':'partial';
      if(state.world&&first.accountId===state.playerAccountId)state.world.executions.push({clock:{...state.clock},stockId:stock.id,orderId:r.order.id,side:first.side,price,quantity:r.fill.quantity,fee:r.fee,
        unlockAt:first.side==='buy'?clockAt(stock.market==='A'?(state.clock.worldDay+1)*16:at+1):null});
      if(first.side==='buy'){
        account.cash-=r.amount+r.fee;
        account.lots.push({stockId:stock.id,quantity:r.fill.quantity,unlockTick:stock.market==='A'?(state.clock.worldDay+1)*16:at+1});
      }else{
        consumeLots(account,stock.id,r.fill.quantity,at);const proceeds=r.amount-r.fee;
        account.cash+=proceeds;if(proceeds>0n)account.pendingProceeds.push({amount:proceeds,availableTick:at+1});
      }
    }
    sortLots(account);state.serviceCash+=totalFee;
    items.push({accountId:first.accountId,stockId:stock.id,side:first.side,amount,fee:totalFee,
      attribution:rows.map(r=>({orderId:r.order.id,fee:r.fee})).sort((a,b)=>compareId(a.orderId,b.orderId))});
  }
  assert(result.buyAllocations.reduce((n,r)=>n+r.quantity,0)===result.quantity&&
    result.sellAllocations.reduce((n,r)=>n+r.quantity,0)===result.quantity,'unbalanced auction');
  return items.sort((a,b)=>compareId(a.accountId,b.accountId)||compareId(a.side,b.side));
}
function notice(state:TradingState,stock:StockState,text:string): void {
  const id=`protection:${stock.id}:${tick(state.clock)}`;
  state.messages.push({id,revision:1,publishedAt:clone(state.clock),expiresAt:{worldDay:state.clock.worldDay+20,batch:state.clock.batch},expectationQ:0n,status:'verified',text});
  state.publicVersion++;
  if(!state.world||state.playerAccountId&&totalShares(getAccount(state,state.playerAccountId),stock.id)>0)state.pauseNextDecision=true;
}
function updateProtection(state:TradingState,stock:StockState,clearing:AuctionResult,indicative:AuctionResult,band:{low:number;high:number}): void {
  const at=tick(state.clock),p=stock.protection;
  const blocked=clearing.quantity===0&&indicative.quantity>0&&indicative.price!==null&&
    (indicative.price<band.low||indicative.price>band.high);
  if(clearing.price!==null){stock.lastPrice=clearing.price;stock.lastTradeAt=clone(state.clock);p.tradedToday=true;
    if(stock.market==='B'){p.reference=clearing.price;p.bandPercent=8;p.mode='normal';}
    else if(p.mode!=='normal'){p.reference=clearing.price;p.mode='normal';p.zeroDays=0;}}
  if(stock.market==='B'&&clearing.quantity===0){const previousBand=p.bandPercent,previousMode=p.mode;
    if(p.mode==='special'||!blocked){p.bandPercent=8;p.mode='normal';}
    else if(p.bandPercent===64)p.mode='special';
    else p.bandPercent=(p.bandPercent*2) as ProtectionState['bandPercent'];
    if(previousBand!==p.bandPercent||previousMode!==p.mode)notice(state,stock,`乙 ${stock.id} 下一批${p.mode==='special'?'特别竞价':`保护带 ±${p.bandPercent}%`}，参考仍为最近实际成交。`);
  }
  if(stock.market==='A'){
    p.processedBatchesToday++;
    if(at%16===0&&p.mode!=='normal'&&clearing.quantity===0){p.mode='reopenPending';notice(state,stock,`甲 ${stock.id} 特别开盘无成交，保留重开至下一日开盘。`);}
    if(at%16===15){
      if(p.mode==='normal'){
        p.zeroDays=p.processedBatchesToday===16&&!p.tradedToday&&blocked?Math.min(2,p.zeroDays+1):0;
        if(p.zeroDays===2){p.mode='special';notice(state,stock,`甲 ${stock.id} 连续两整日零成交且末批受阻，下一日开盘特别竞价。`);}
      }
      p.reference=stock.lastPrice;p.tradedToday=false;p.processedBatchesToday=0;
    }
  }
}
function distributeService(state:TradingState): void {
  const rows=state.accounts.filter(a=>a.feeWeight>0n&&a.id!==state.playerAccountId);
  const weight=rows.reduce((n,a)=>n+a.feeWeight,0n),balance=state.serviceCash;
  if(weight===0n||balance===0n)return;
  const parts=rows.map(a=>({account:a,amount:balance*a.feeWeight/weight,remainder:balance*a.feeWeight%weight}));
  let extra=balance-parts.reduce((n,r)=>n+r.amount,0n);
  parts.sort((a,b)=>a.remainder>b.remainder?-1:a.remainder<b.remainder?1:compareId(a.account.id,b.account.id));
  for(const part of parts){if(extra>0n){part.amount++;extra--;}part.account.cash+=part.amount;}
  state.serviceCash=0n;
}
function prepare(state:TradingState,newTick:number): void {
  state.clock=clockAt(newTick);state.phase='publicDecision';state.preparationAppliedTick=newTick;
  state.majorAtCurrentTick=state.pauseNextDecision;state.pauseNextDecision=false;
  for(const account of state.accounts)account.pendingProceeds=account.pendingProceeds.filter(p=>p.availableTick>newTick);
  for(const order of state.orders)if(active(order)&&order.endTick<newTick)order.status=order.kind==='immediate'?'cancelled':'expired';
  resetReservations(state);
  if(newTick%16===0&&state.clock.worldDay>0&&state.clock.worldDay%20===0)distributeService(state);
  if(state.world)prepareWorld(state);
  for(const p of state.publications){const m=p.message,key=JSON.stringify([m.id,m.revision,tick(m.publishedAt)]);
    if(tick(m.publishedAt)!==newTick||state.appliedPublications.includes(key))continue;
    const previous=state.messages.filter(x=>x.id===m.id).sort((a,b)=>b.revision-a.revision)[0];
    assert(!previous||m.revision>previous.revision,'non-increasing publication revision');
    if(previous?.status==='active')previous.status='expired';
    state.messages.push(publicMessage(m));state.appliedPublications.push(key);state.majorAtCurrentTick ||= p.major;
  }
  for(const m of state.messages)if(m.status==='active'&&tick(m.expiresAt)<=newTick){
    const newer=state.messages.some(x=>x.id===m.id&&x.revision>m.revision);
    m.status='expired';if(!newer)m.expectationQ=0n;
  }
  state.messages.sort((a,b)=>tick(a.publishedAt)-tick(b.publishedAt)||compareId(a.id,b.id)||a.revision-b.revision);
  state.publicVersion++;state.stateVersion++;
}

export class TradingCore implements MarketCore {
  private state:TradingState|null=null;
  private trace:BatchTrace[]=[];
  constructor(input?:ScenarioInput){if(input){const state=initialState(input);
    if(state.phase==='publicDecision'){state.preparationAppliedTick=-1;prepare(state,tick(state.clock));}
    validateState(state);this.state=state;}}
  private current():TradingState {assert(this.state,'create an explicit scenario first');return this.state;}

  createWorld(config:WorldConfig):{stateVersion:number}|{reason:FailureCode;detail:string}{
    if(!config||config.rulesVersion!==RULES_VERSION||config.contentVersion!==CONTENT_VERSION)
      return {reason:'incompatibleVersion',detail:'rules/content version mismatch'};
    if(!validInteger(config.seed,0,0xffff_ffff)||!['prototype','full'].includes(config.size)||!['baseline','complete'].includes(config.mode)||
      typeof config.playerCapital!=='bigint'||config.playerCapital<10_000_000n||config.playerCapital>1_000_000_000n)
      return {reason:'invalidInput',detail:'invalid world configuration'};
    try{const state=generateWorld(config);prepare(state,0);validateState(state);validateWorld(state);this.state=state;this.trace=[];return {stateVersion:state.stateVersion};}
    catch(error){return {reason:'generationFailed',detail:error instanceof Error?error.message:'world generation failed'};}
  }

  submitCommand(command:Command):CommandResult {const state=this.current();
    if(state.playerAccountId===null)return {accepted:false,id:command?.id??'',stateVersion:state.stateVersion,reason:'invalidInput',detail:'scenario has no player'};
    return this.submitFor(state.playerAccountId,command);}

  submitFor(accountId:string,command:Command):CommandResult {
    const state=this.current();let canonical:string;
    try{canonical=encodeExact({accountId,command} as ExactValue);}catch{return {accepted:false,id:command?.id??'',stateVersion:state.stateVersion,reason:'invalidInput',detail:'command is not exact serializable input'};}
    const old=state.commands.find(r=>r.id===command?.id);
    if(old){if(old.canonical!==canonical)return {accepted:false,id:command.id,stateVersion:state.stateVersion,reason:'duplicateIdConflict',detail:'command ID was used with different input'};
      return old.result.accepted?{...clone(old.result),duplicate:true}:clone(old.result);}
    const account=state.accounts.find(a=>a.id===accountId);
    if(!account||!command||typeof command.id!=='string'||command.id.length===0||command.id.length>256)
      return {accepted:false,id:command?.id??'',stateVersion:state.stateVersion,reason:'invalidInput',detail:'invalid command/account identity'};
    const reject=(reason:FailureCode,detail:string):CommandResult=>{
      const draft=fork(state);draft.stateVersion++;const result:CommandResult={accepted:false,id:command.id,stateVersion:draft.stateVersion,reason,detail};
      draft.commands.push({id:command.id,accountId,canonical,result});validateRuntime(draft);this.state=draft;return clone(result);};
    if(state.ended)return reject('ended','career ended');
    if(command.publicVersion!==state.publicVersion)return reject('staleView','public version changed');
    if(!validClock(command.target))return reject('invalidInput','invalid target clock');
    const at=tick(state.clock),target=tick(command.target),expected=at+(state.phase==='settled'?1:0);
    if(target<expected)return reject('pastBatch','batch already settled');
    if(target!==expected)return reject('notDecisionWindow','command must target current decision or next unsettled batch');
    if(!command.body||typeof command.body!=='object')return reject('invalidInput','missing command body');
    const body=command.body,draft=fork(state),owner=getAccount(draft,accountId);
    let orderId:string|undefined;
    if(body.kind==='cancel'){
      const order=draft.orders.find(o=>o.id===body.orderId&&o.accountId===accountId);
      if(!order)return reject('invalidInput','unknown owned order');
      if(active(order))order.status='cancelled';resetReservations(draft);
    }else if(body.kind==='retire'||body.kind==='confirmExhaustion'){
      if(accountId!==state.playerAccountId)return reject('invalidInput','only player may end career');
      if(body.kind==='confirmExhaustion')return reject('invalidInput','capital exhaustion qualification starts in P4');
      draft.ended=true;
    }else if(body.kind==='immediate'||body.kind==='day'||body.kind==='plan'){
      if(!['immediate','day','plan'].includes(body.kind)||!owner.canTrade||!['buy','sell'].includes(body.side)||
        !validInteger(body.quantity,1,MAX_SHARES)||!validInteger(body.limitPrice,1,MAX_PRICE))return reject('invalidInput','invalid funded order');
      const stock=state.stocks.find(s=>s.id===body.stockId);if(!stock)return reject('invalidInput','unknown stock');
      if(state.orders.some(o=>active(o)&&o.accountId===accountId&&o.stockId===stock.id&&o.side!==body.side))return reject('oppositeDirection','cancel opposite orders first');
      let end=body.kind==='day'?Math.floor(target/16)*16+15:target;
      if(body.kind==='plan'){
        if(!validClock(body.endAt)||![3,7,11,15].includes(body.endAt.batch))return reject('invalidInput','plan must end at an hour close');
        end=tick(body.endAt);if(end<target)return reject('invalidInput','plan end before start');
      }else if(body.endAt!==undefined)return reject('invalidInput','endAt is only valid for a plan');
      const needed=body.side==='buy'?reserve(body.limitPrice,body.quantity,body.kind==='immediate'?1:end-target+1):0n;
      if(body.side==='buy'&&needed>availableCash(account))return reject('insufficientCash','cash including fee reservation is insufficient');
      if(body.side==='sell'&&body.quantity>sellableShares(account,stock.id,at)-reservedShares(state,accountId,stock.id))return reject('insufficientShares','unlocked unreserved shares are insufficient');
      orderId=`order:${command.id}`;
      draft.orders.push({id:orderId,accountId,kind:body.kind,stockId:stock.id,side:body.side,quantity:body.quantity,remainingQuantity:body.quantity,filledQuantity:0,
        limitPrice:body.limitPrice,startTick:target,endTick:end,sequence:draft.nextSequence++,reservedCash:needed,reservedShares:body.side==='sell'?body.quantity:0,feesPaid:0n,status:'active',
        ...(state.world?{submissionReference:stock.lastPrice,submissionReferenceOnly:stock.lastTradeAt===null}:{})});
      owner.reservedCash+=needed;
    }else return reject('invalidInput','unknown command kind');
    draft.stateVersion++;
    const result:CommandResult={accepted:true,id:command.id,stateVersion:draft.stateVersion,duplicate:false,...(orderId?{orderId}:{})};
    draft.commands.push({id:command.id,accountId,canonical,result});validateRuntime(draft);this.state=draft;return clone(result);
  }

  /** Public preparation only; a publicDecision call is idempotent and never clears. */
  prepareNextBatch():PublicTradingView {
    this.prepareBoundary();
    return this.readPublicView({kind:'market'});
  }
  private prepareBoundary():void {
    const state=this.current();if(state.ended)return;
    if(state.phase==='settled'){const draft=fork(state);prepare(draft,tick(state.clock)+1);validateRuntime(draft);this.state=draft;}
  }

  private settle():void {
    const original=this.current();assert(original.phase==='publicDecision','settlement requires prepared public window');
    const draft=fork(original),at=tick(draft.clock),fees:FeeItem[]=[],stocks:BatchTrace['stocks']=[];
    if(draft.world)generateNpcOrders(draft);
    const byStock=new Map<string,TradingState['orders']>();for(const o of draft.orders){const rows=byStock.get(o.stockId)??[];rows.push(o);byStock.set(o.stockId,rows);}
    for(const stock of draft.stocks){
      const orders=(byStock.get(stock.id)??[]).filter(o=>active(o)&&o.startTick<=at&&o.endTick>=at)
        .map(o=>({id:o.id,accountId:o.accountId,side:o.side,limitPrice:o.limitPrice,sequence:o.sequence,
          quantity:o.kind==='plan'?Number(ceilDiv(BigInt(o.remainingQuantity),BigInt(o.endTick-at+1))):o.remainingQuantity}));
      const band=bounds(stock,at),input:AuctionInput={seed:draft.seed,tick:at,stockId:stock.id,reference:stock.lastPrice,...band,orders};
      const before=clone(stock.protection),indicative=clearAuction({...input,low:1,high:MAX_PRICE});
      const suspended=stock.market==='A'&&stock.protection.mode!=='normal'&&at%16!==0;
      const clearing=suspended?emptyAuction():clearAuction(input);
      fees.push(...applyClearing(draft,stock,clearing));updateProtection(draft,stock,clearing,indicative,band);
      if(draft.world)recordWorldBatch(draft,stock.id,clearing.price,clearing.quantity);
      else stock.batches.push({clock:clone(draft.clock),price:clearing.price,quantity:clearing.quantity});
      stocks.push({stockId:stock.id,...band,clearing,indicative,protectionBefore:before,protectionAfter:clone(stock.protection)});
    }
    for(const o of draft.orders)if(active(o)&&(o.kind==='immediate'&&o.startTick<=at||o.endTick<=at))o.status=o.kind==='immediate'?'cancelled':'expired';
    if(draft.world)finishWorldBatch(draft);
    draft.phase='settled';resetReservations(draft);draft.stateVersion++;validateRuntime(draft);
    const summary=audit(draft);assert(summary.valid,'atomic batch audit failed');
    this.state=draft;const trace={clock:clone(draft.clock),publicVersion:original.publicVersion,stocks,fees,audit:summary};
    if(draft.world)this.trace=[trace];else this.trace.push(trace);
  }

  advance(request:AdvanceRequest):AdvanceResult {
    let state=this.current();assert(request&&validInteger(request.maxBatches,0,16_000_016)&&typeof request.pauseOnMajor==='boolean','invalid advance request');
    const start=tick(state.clock)+(state.phase==='settled'?1:0);
    let target:number;
    if(typeof request.stop==='object'){assert(validClock(request.stop),'invalid stop clock');target=tick(request.stop);assert(target>=start,'stop before next batch');}
    else if(request.stop==='batch')target=start;
    else if(request.stop==='hour')target=Math.floor(start/4)*4+3;
    else if(request.stop==='day')target=Math.floor(start/16)*16+15;
    else if(request.stop==='season'){const day=Math.floor(start/16),base=day>=250?250+Math.floor((day-250)/250)*250:0;target=(base+250)*16-1;}
    else throw new RangeError('invalid advance target');
    let completed=0;
    const result=(reason:AdvanceResult['reason']):AdvanceResult=>{state=this.current();return {clock:clone(state.clock),phase:state.phase,stateVersion:state.stateVersion,publicVersion:state.publicVersion,reason,completedBatches:completed};};
    if(state.ended)return result('ended');if(request.cancelRequested)return result('cancelled');
    while(completed<request.maxBatches){this.prepareBoundary();state=this.current();
      if(request.pauseOnMajor&&state.majorAtCurrentTick)return result('majorMessage');
      this.settle();completed++;state=this.current();
      if(tick(state.clock)>=target)return result(request.stop==='season'?'seasonEnd':'target');
    }
    return result('budget');
  }

  readPublicView(query:PublicQuery):PublicTradingView {return this.current().world?this.readWorldView(query):this.readFor(this.current().playerAccountId,query);}
  warmup(request:WarmupRequest):WarmupResult {
    let state=this.current();assert(state.world,'not an autonomous world');let completed=0,reason:WarmupResult['reason']='complete';
    if(state.world.lastSettledTick<3999){const result=this.advance({stop:{worldDay:249,batch:15},maxBatches:request.maxBatches,pauseOnMajor:false,...(request.cancelRequested===undefined?{}:{cancelRequested:request.cancelRequested})});completed=result.completedBatches;reason=result.reason==='target'?'complete':result.reason==='cancelled'?'cancelled':'budget';}
    state=this.current();return {...progress(state),clock:{...state.clock},phase:state.phase,stateVersion:state.stateVersion,publicVersion:state.publicVersion,reason,completedBatches:completed};
  }
  readWorldView(query:PublicQuery):WorldPublicView {
    const state=this.current(),w=state.world;assert(w,'not an autonomous world');
    const view=this.readFor(state.playerAccountId,query),account=state.playerAccountId?getAccount(state,state.playerAccountId):null;
    const companies=view.companies.map(company=>{const e=w.stocks.find(s=>s.id===company.id)!,s=state.stocks.find(s=>s.id===company.id)!;
      return {...company,name:e.name,sector:e.sector,sectorName:e.sectorName,tier:e.tier,totalShares:s.totalShares,floatShares:e.floatShares,initialPrice:s.initialPrice,concepts:clone(e.concepts),business:e.business,
        demandExposureQ:e.demandExposureQ,financingExposureQ:e.financingExposureQ,leverageQ:e.leverageQ,durationQ:e.durationQ,reportPhase:e.reportPhase,
        forecastQ:e.forecastQ,forecastLowQ:e.forecastQ*90n/100n,forecastHighQ:e.forecastQ*110n/100n,publicGrowthQ:e.publicGrowthQ,
        currentDay:clone(e.currentDay),currentHour:clone(e.currentHour),protection:{...s.protection,...bounds(s,tick(state.clock))}};});
    const holdings=view.player&&account?view.player.holdings.map(h=>({...h,locked:h.total-h.sellable,lots:account.lots.filter(l=>l.stockId===h.stockId).map(l=>({quantity:l.quantity,unlockAt:clockAt(l.unlockTick)}))})):[];
    const player=view.player&&account?{...view.player,holdings,netAssetValue:state.stocks.reduce((n,s)=>n+BigInt(totalShares(account,s.id))*BigInt(s.lastPrice),account.cash)}:null;
    let bars:WorldPublicView['bars']=[];
    if(query.kind==='chart'){const e=w.stocks.find(s=>s.id===query.stockId);assert(e,'unknown chart stock');const history=query.scale==='day'?e.days:e.hours,current=query.scale==='day'?e.currentDay:e.currentHour;
      bars=clone([...history,...(!current.completed?[current]:[])].filter(c=>query.fromWorldDay===undefined||c.worldDay>=query.fromWorldDay));}
    return {...view,world:progress(state),companies,player,macro:{...w.macro},sectors:clone(w.sectors),bars,executions:clone(w.executions),
      orders:view.orders.map(o=>({...o,submissionReference:o.submissionReference??null,submissionReferenceOnly:o.submissionReferenceOnly??false}))};
  }
  diagnosticsSummary():WorldDiagnostics {
    const state=this.current(),w=state.world;assert(w,'not an autonomous world');const at=tick(state.clock);
    return {clock:{...state.clock},phase:state.phase,stateVersion:state.stateVersion,publicVersion:state.publicVersion,audit:audit(state),latestBatch:this.trace.length?clone(this.trace[this.trace.length-1]!):null,
      world:{...progress(state),config:{...w.config}},wallets:state.accounts.map(a=>{const npc=w.npcs.find(n=>n.accountId===a.id);
        return {id:a.id,role:npc?.role??(a.id==='player'?'player':'founder'),market:npc?.market??null,cash:a.cash,reservedCash:a.reservedCash,availableCash:availableCash(a),pendingCash:a.pendingProceeds.reduce((n,p)=>n+p.amount,0n),
          holdings:state.stocks.map(s=>({stockId:s.id,quantity:totalShares(a,s.id),sellable:sellableShares(a,s.id,at),reserved:reservedShares(state,a.id,s.id)})),
          targets:npc?npc.assets.map(x=>({stockId:x.stockId,targetShares:x.targetShares,previousWeightQ:x.previousWeightQ,baselineWeightQ:x.baselineWeightQ,hourCapacity:x.hourCapacity,hourUsed:x.hourUsed})):[]};}),
      stocks:state.stocks.map(s=>{const e=w.stocks.find(e=>e.id===s.id)!;return {id:s.id,market:s.market,sector:e.sector,floatShares:e.floatShares,lastPrice:s.lastPrice,lastTradeAt:s.lastTradeAt?{...s.lastTradeAt}:null,protection:{...s.protection},lastCompletedDay:e.days.length?clone(e.days[e.days.length-1]!):null};})};
  }
  readFor(accountId:string|null,query:PublicQuery):PublicTradingView {
    const state=this.current();assert(query&&['market','portfolio','messages','orders','company','chart'].includes(query.kind),'invalid public query');
    const account=accountId===null?null:getAccount(state,accountId),at=tick(state.clock);
    const player:PublicAccount|null=account?{cash:account.cash,reservedCash:account.reservedCash,holdings:state.stocks.map(s=>({stockId:s.id,total:totalShares(account,s.id),sellable:sellableShares(account,s.id,at),reserved:reservedShares(state,account.id,s.id)}))}:null;
    const companies=state.stocks.filter(s=>query.kind!=='company'&&query.kind!=='chart'||s.id===query.stockId).map(s=>({id:s.id,market:s.market,lastPrice:s.lastPrice,lastTradeAt:clone(s.lastTradeAt),referenceOnly:s.lastTradeAt===null,reports:s.reports.map(r=>({publishedAt:clone(r.publishedAt),operatingIndexQ:r.operatingIndexQ})),protection:{reference:s.protection.reference,bandPercent:s.protection.bandPercent,mode:s.protection.mode,...bounds(s,at)}}));
    const view={publicVersion:state.publicVersion,stateVersion:state.stateVersion,clock:clone(state.clock),phase:state.phase,companies,player,messages:state.messages.map(publicMessage),
      orders:account?clone(state.orders.filter(o=>o.accountId===account.id)):[],
      availableCash:account?availableCash(account):null,pendingProceeds:account?clone(account.pendingProceeds):[],
      history:query.kind==='chart'?state.stocks.filter(s=>s.id===query.stockId).flatMap(s=>s.batches.filter(b=>query.fromWorldDay===undefined||b.clock.worldDay>=query.fromWorldDay).map(b=>({...clone(b),stockId:s.id}))):[]};
    return view;
  }

  targetGap(accountId:string,stockId:string,targetShares:number):number {
    const state=this.current(),account=getAccount(state,accountId);assert(validInteger(targetShares,0,MAX_SHARES)&&state.stocks.some(s=>s.id===stockId),'invalid target');
    const orders=state.orders.filter(o=>active(o)&&o.accountId===accountId&&o.stockId===stockId);
    return targetShares-totalShares(account,stockId)-orders.filter(o=>o.side==='buy').reduce((n,o)=>n+o.remainingQuantity,0)+orders.filter(o=>o.side==='sell').reduce((n,o)=>n+o.remainingQuantity,0);
  }

  /** Account-wide conversion of fixed NPC intents. Does not reserve, submit or use future proceeds. */
  convertIntents(accountId:string,intents:Intent[]):Intent[] {
    const state=this.current(),account=getAccount(state,accountId),at=tick(state.clock);
    assert(Array.isArray(intents)&&intents.length<=1000,'invalid intents');
    const rows=intents.map((i,index)=>{assert(state.stocks.some(s=>s.id===i.stockId)&&['buy','sell'].includes(i.side)&&validInteger(i.quantity,1,MAX_SHARES)&&validInteger(i.limitPrice,1,MAX_PRICE)&&(i.scoreQ===undefined||typeof i.scoreQ==='bigint')&&(i.level===undefined||validInteger(i.level,0,1000)),'invalid intent');return {...i,index};});
    const sides=new Map<string,string>();for(const i of rows){assert(!sides.has(i.stockId)||sides.get(i.stockId)===i.side,'opposite intents');sides.set(i.stockId,i.side);}
    const free=availableCash(account),buy=rows.filter(i=>i.side==='buy');
    const cost=(r:Intent):bigint=>r.quantity===0?0n:reserve(r.limitPrice,r.quantity,1);
    const total=buy.reduce((n,i)=>n+cost(i),0n);
    if(total>free)for(const i of buy)i.quantity=Number(BigInt(i.quantity)*free/total);
    const reduction=[...buy].sort((a,b)=>(a.scoreQ??0n)<(b.scoreQ??0n)?-1:(a.scoreQ??0n)>(b.scoreQ??0n)?1:compareId(a.stockId,b.stockId)||(a.level??0)-(b.level??0)||a.index-b.index);
    let spend=buy.reduce((n,i)=>n+cost(i),0n);
    while(spend>free){const row=reduction.find(i=>i.quantity>0);assert(row,'cannot reduce budget');const before=cost(row);row.quantity--;spend+=cost(row)-before;}
    const sellLeft=new Map<string,number>();
    for(const i of rows)if(i.side==='sell'){const left=sellLeft.get(i.stockId)??sellableShares(account,i.stockId,at)-reservedShares(state,accountId,i.stockId);i.quantity=Math.min(i.quantity,left);sellLeft.set(i.stockId,left-i.quantity);}
    return rows.filter(i=>i.quantity>0).map(({index: _index,...i})=>i);
  }

  diagnostics():TradingDiagnostics {const state=this.current();return {state:clone(state),trace:clone(this.trace),audit:audit(state),stateHash:sha256(encodeExact(state as ExactValue))};}
  exportSnapshot():SnapshotEnvelope {
    const state=this.current();validateState(state);if(state.world)validateWorld(state);const payload=encodeExact(state as ExactValue);
    assert(payload.length<=MAX_SNAPSHOT_BYTES&&utf8ByteLength(payload)<=MAX_SNAPSHOT_BYTES,'snapshot exceeds 64 MiB');
    const body={schemaVersion:SNAPSHOT_VERSION,rulesVersion:RULES_VERSION,contentVersion:CONTENT_VERSION,mathVersion:MATH_VERSION,seed:state.seed,configHash:state.configHash,clock:clone(state.clock),phase:state.phase,stateVersion:state.stateVersion,publicVersion:state.publicVersion,playerInjected:state.playerInjected,payload};
    return {...body,checksum:sha256(encodeExact(body))};
  }
  restoreSnapshot(snapshot:SnapshotEnvelope):{restored:true;stateVersion:number}|{restored:false;reason:FailureCode;detail:string}{
    try{
      assert(snapshot&&typeof snapshot==='object','missing snapshot');
      if(snapshot.schemaVersion!==SNAPSHOT_VERSION||snapshot.rulesVersion!==RULES_VERSION||snapshot.contentVersion!==CONTENT_VERSION||snapshot.mathVersion!==MATH_VERSION)
        return {restored:false,reason:'incompatibleVersion',detail:'snapshot version mismatch'};
      assert(typeof snapshot.payload==='string'&&snapshot.payload.length<=MAX_SNAPSHOT_BYTES&&utf8ByteLength(snapshot.payload)<=MAX_SNAPSHOT_BYTES,'snapshot size/type invalid');
      const {checksum,...body}=snapshot;assert(typeof checksum==='string'&&checksum===sha256(encodeExact(body as ExactValue)),'snapshot checksum mismatch');
      const decoded=decodeExact(snapshot.payload);
      const visit=(v:unknown,depth:number):void=>{assert(depth<=64,'snapshot too deep');if(v&&typeof v==='object')for(const x of Object.values(v))visit(x,depth+1);};visit(decoded,0);
      const state=decoded as TradingState;validateState(state);if(state.world)validateWorld(state);
      assert(state.seed===snapshot.seed&&state.configHash===snapshot.configHash&&encodeExact(state.clock)===encodeExact(snapshot.clock)&&state.phase===snapshot.phase&&state.stateVersion===snapshot.stateVersion&&state.publicVersion===snapshot.publicVersion&&state.playerInjected===snapshot.playerInjected,'snapshot envelope/payload mismatch');
      assert(snapshot.payload===encodeExact(state as ExactValue),'non-canonical snapshot payload');
      this.state=state;this.trace=[];return {restored:true,stateVersion:state.stateVersion};
    }catch(error){return {restored:false,reason:'corruptSnapshot',detail:error instanceof Error?error.message:'invalid snapshot'};}
  }
}

export function createMarketCore():TradingCore {return new TradingCore();}
export function createScenario(input:ScenarioInput):TradingCore {return new TradingCore(input);}
