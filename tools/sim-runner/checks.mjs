import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createScenario, createMarketCore, decodeExact, encodeExact, randomU32 } from '../../packages/sim-core/src/index.ts';
import { runReplay } from './replay.ts';
import { exhaustiveAuction, randomBook, independentFee, auditLedger } from './reference-auction.mjs';
import { splitOrders } from './auction-check.mjs';

export const digest=value=>createHash('sha256').update(typeof value==='string'?value:encodeExact(value)).digest('hex');
export const fixtures=()=>decodeExact(readFileSync('tests/scenarios/p1/cases.json','utf8')).cases;
const clone=value=>decodeExact(encodeExact(value));
const tick=clock=>clock.worldDay*16+clock.batch;
const totals=(account,id)=>account.lots.filter(l=>l.stockId===id).reduce((n,l)=>n+l.quantity,0);
const account=(state,id)=>state.accounts.find(a=>a.id===id);
const snapshotState=(result,label)=>decodeExact(result.snapshots.find(s=>s.label===label).snapshot.payload);
const economic=result=>({price:result.price,quantity:result.quantity,buyAllocations:result.buyAllocations,sellAllocations:result.sellAllocations});
const financial=state=>encodeExact({accounts:state.accounts,stocks:state.stocks,orders:state.orders,serviceCash:state.serviceCash,clock:state.clock,phase:state.phase,publicVersion:state.publicVersion,nextSequence:state.nextSequence});

function traceAssertions(trace){
  for(const batch of trace){
    assert.equal(batch.audit.cashDifference,0n);assert.ok(batch.audit.shares.every(s=>s.difference===0));
    for(const s of batch.stocks){
      const r=s.clearing;
      for(const side of ['buyAllocations','sellAllocations'])assert.equal(r[side].reduce((n,a)=>n+a.quantity,0),r.quantity);
      for(const side of ['buy','sell'])assert.equal(r.orderAllocations.filter(a=>a.side===side).reduce((n,a)=>n+a.quantity,0),r.quantity);
      assert.equal(r.price===null,r.quantity===0);
      if(r.price!==null)assert.ok(r.price>=s.low&&r.price<=s.high);
    }
    for(const fee of batch.fees){
      assert.equal(fee.fee,independentFee(fee.amount));
      assert.equal(fee.attribution.reduce((n,a)=>n+a.fee,0n),fee.fee);
      assert.ok(fee.attribution.every(a=>a.fee>=0n));
    }
  }
}

export function checkFixed(out){
  const results=[];let observedStates=0,observedBatches=0;
  for(const f of fixtures()){
    try{
      let priorTrace=0;
      const r=runReplay(f.input,f.commands,d=>{
        auditLedger(d.state);observedStates++;
        if(d.trace.length>priorTrace){traceAssertions(d.trace.slice(priorTrace));observedBatches+=d.trace.length-priorTrace;priorTrace=d.trace.length;}
      });
      // Single-call fast forward and inspected one-batch execution must agree.
      const ordinary=runReplay(f.input,f.commands);assert.equal(encodeExact(r),encodeExact(ordinary));
      const state=r.diagnostics.state, trace=r.diagnostics.trace;
      const last=trace.at(-1)?.stocks[0]?.clearing;
      if('price'in f.expected){assert.equal(last.price,f.expected.price);assert.equal(last.quantity,f.expected.quantity);}
      if('serviceCash'in f.expected)assert.equal(state.serviceCash,f.expected.serviceCash);
      if(f.id==='A01'){const o=state.orders.find(o=>o.accountId==='player');assert.equal(o.filledQuantity,300);assert.equal(o.remainingQuantity,50);assert.equal(o.status,'cancelled');}
      if(f.id==='A03'){assert.equal(state.stocks[0].lastPrice,1000);assert.equal(state.stocks[0].lastTradeAt,null);assert.equal(trace[0].stocks[0].indicative.quantity,0);}
      if(f.id==='A05')assert.deepEqual(last.buyAllocations,f.expected.buyAllocations);
      if(f.id==='A06'||f.id==='SETTLEMENT-B'){
        const bought=snapshotState(r,'after-buy'), unlocked=snapshotState(r,'after-unlock');
        const p=account(bought,'player');assert.equal(totals(p,state.stocks[0].id),160);
        assert.equal(p.lots.find(l=>l.quantity===100).unlockTick,f.expected.newUnlockTick);
        assert.equal(p.lots.filter(l=>l.unlockTick<=tick(bought.clock)).reduce((n,l)=>n+l.quantity,0),60);
        assert.equal(account(unlocked,'player').lots.filter(l=>l.unlockTick<=tick(unlocked.clock)).reduce((n,l)=>n+l.quantity,0),160);
        if(f.id==='A06')assert.equal(r.steps.find(s=>s.result?.id==='too-much').result.reason,'insufficientShares');
      }
      if(f.id==='A07'){
        const converted=r.steps[0].result;assert.deepEqual(converted.converted.map(i=>i.quantity),[1,1]);assert.ok(converted.receipts.every(x=>x.accepted));
        assert.equal(r.steps.find(s=>s.result?.id==='player-b').result.reason,'insufficientCash');
        assert.deepEqual(trace[0].stocks.map(s=>s.clearing.quantity),[3,1]);
      }
      if(f.id==='A08')assert.deepEqual(r.steps.filter(s=>s.operation==='targetGap').map(s=>s.result),[60,50]);
      if(f.id==='A09'){
        assert.equal(account(snapshotState(r,'reserved'),'player').reservedCash,16023n);assert.equal(trace.length,16);
        assert.ok(trace.every(t=>t.stocks[0].clearing.quantity===1));assert.equal(state.orders.find(o=>o.accountId==='player').feesPaid,16n);
        assert.equal(account(state,'player').cash,7n);assert.equal(account(state,'player').reservedCash,0n);
      }
      if(f.id==='A10'){
        assert.equal(r.steps.find(s=>s.result?.id==='opposite').result.reason,'oppositeDirection');
        assert.equal(r.steps[3].result.duplicate,true);assert.ok(state.orders.every(o=>o.status==='cancelled'&&o.reservedCash===0n&&o.reservedShares===0));
      }
      if(f.id==='A11'){
        assert.equal(r.steps.find(s=>s.result?.id==='too-early').result.reason,'insufficientCash');
        const p=account(snapshotState(r,'pending-proceeds'),'player');assert.equal(p.cash,9995n);assert.deepEqual(p.pendingProceeds,[{amount:9995n,availableTick:1}]);
        assert.equal(totals(account(state,'player'),'B001'),1);assert.equal(account(state,'player').pendingProceeds.length,0);
      }
      if(f.id==='A12'){
        const pause=r.steps[1].result;assert.equal(pause.reason,'majorMessage');assert.equal(pause.phase,'publicDecision');assert.equal(tick(pause.clock),1);assert.equal(pause.completedBatches,0);
        const s=snapshotState(r,'public-decision');assert.equal(s.messages.length,1);assert.equal(s.stocks[0].batches.length,1);
        const participants=r.steps.filter(s=>s.operation==='participant').map(s=>s.result);assert.ok(participants.every(p=>p.sawMessage&&p.receipt.accepted));
        assert.equal(participants[0].publicInput.publicVersion,participants[1].publicInput.publicVersion);
        for(const p of participants){const encoded=encodeExact(p.publicInput);assert.ok(!encoded.includes('privateResultQ')&&!encoded.includes('publications')&&!encoded.includes('actualOperatingIndexQ'));assert.ok(p.publicInput.orders.every(o=>o.accountId===p.receipt.id.split('-')[0]));}
      }
      if(f.id==='A13'||f.id==='PROTECTION-B-SPECIAL'){
        assert.deepEqual(trace.map(t=>t.stocks[0].clearing.price),f.expected.prices);
        assert.ok(trace.slice(0,-1).every(t=>t.stocks[0].indicative.quantity===100));
        if(f.id==='A13')assert.deepEqual(trace.map(t=>t.stocks[0].protectionAfter.bandPercent),[16,32,64,8]);
        assert.equal(state.stocks[0].protection.reference,f.expected.prices.at(-1));
      }
      if(f.id==='A14'){
        assert.ok(trace.slice(0,32).every(t=>t.stocks[0].clearing.quantity===0));assert.equal(trace.length,33);
        const announced=snapshotState(r,'announced');assert.equal(announced.stocks[0].protection.mode,'special');
        const company=r.publicView.companies[0];assert.equal(company.protection.reference,1400);assert.equal(company.protection.low,1260);assert.equal(company.protection.high,1540);
        assert.ok(announced.messages.some(m=>m.text.includes('特别竞价')));
      }
      if(f.id==='PROTECTION-A-EMPTY'){
        assert.equal(snapshotState(r,'pending').stocks[0].protection.mode,'reopenPending');
        const muted=snapshotState(r,'intraday-suppressed');assert.equal(muted.stocks[0].lastTradeAt,null);
        assert.ok(trace.slice(0,48).every(t=>t.stocks[0].clearing.quantity===0));assert.equal(tick(state.stocks[0].lastTradeAt),48);
      }
      if(f.id==='A19'){
        assert.deepEqual(r.steps[0].result.converted.map(i=>[i.stockId,i.quantity]),[['B001',1]]);assert.ok(r.steps[0].result.receipts.every(x=>x.accepted));assert.equal(account(state,'player').cash,1000n);
      }
      if(f.id.startsWith('LIFECYCLE-')){
        assert.equal(state.orders[0].status,'cancelled');assert.equal(r.steps[3].result.duplicate,true);
        assert.equal(r.steps[4].result.reason,'insufficientCash');assert.equal(r.steps[5].result.reason,'insufficientShares');assert.equal(account(state,'player').reservedCash,0n);
      }
      if(f.id.startsWith('PARTIAL-')||f.id.startsWith('EXPIRY-')){
        const o=state.orders.find(o=>o.accountId==='player');assert.equal(o.filledQuantity,f.expected.filled);assert.equal(o.status,f.id.startsWith('PARTIAL-')?'cancelled':'expired');assert.equal(o.reservedCash,0n);
        if(f.id.startsWith('PARTIAL-'))assert.equal(snapshotState(r,'partial').orders.find(o=>o.accountId==='player').status,'partial');
      }
      for(const checkpoint of r.snapshots){const restored=createMarketCore();assert.equal(restored.restoreSnapshot(checkpoint.snapshot).restored,true);assert.equal(restored.exportSnapshot().checksum,checkpoint.snapshot.checksum);auditLedger(restored.diagnostics().state);}
      results.push({id:f.id,ac:f.ac,status:'pass',batches:trace.length,stateHash:r.diagnostics.stateHash,checksum:r.finalSnapshot.checksum,checkpointLabels:r.snapshots.map(s=>s.label)});
      if(['A01','A09','A12','A14'].includes(f.id))writeFileSync(`${out}/${f.id}-replay.json`,encodeExact(r)+'\n');
    }catch(error){writeFileSync(`${out}/first-fixed-failure.json`,encodeExact({fixture:f,error:error.message})+'\n');throw new Error(`${f.id}: ${error.message}`);}
  }
  return {cases:results,observedStates,observedBatches};
}

function runBook(book,orders){
  const ids=[...new Set(orders.map(o=>o.accountId))].sort();
  const input={seed:book.seed,playerAccountId:ids[0],stocks:[{id:book.stockId,market:book.market,initialPrice:book.reference}],accounts:ids.map(id=>{
    const own=orders.filter(o=>o.accountId===id),cash=own.filter(o=>o.side==='buy').reduce((n,o)=>n+BigInt(o.quantity)*BigInt(o.limitPrice)+independentFee(BigInt(o.quantity)*BigInt(o.limitPrice)),0n)+100n;
    const quantity=own.filter(o=>o.side==='sell').reduce((n,o)=>n+o.quantity,0);
    return {id,cash,holdings:quantity?[{stockId:book.stockId,quantity}]:[]};
  })};
  const core=createScenario(input);auditLedger(core.diagnostics().state);
  const prepared=core.readPublicView({kind:'market'});
  const submitted=[];
  for(const o of orders){
    const receipt=core.submitFor(o.accountId,{id:o.id,publicVersion:prepared.publicVersion,target:prepared.clock,body:{kind:'immediate',stockId:book.stockId,side:o.side,quantity:o.quantity,limitPrice:o.limitPrice}});
    assert.equal(receipt.accepted,true);auditLedger(core.diagnostics().state);
    submitted.push({...o,id:receipt.orderId,sequence:submitted.length});
  }
  const expected=exhaustiveAuction({...book,orders:submitted});
  core.advance({stop:'batch',maxBatches:1,pauseOnMajor:false});const d=core.diagnostics();auditLedger(d.state);traceAssertions(d.trace);
  const actual=d.trace[0].stocks[0].clearing;assert.deepEqual(actual,expected);
  const initial=new Map(input.accounts.map(a=>[a.id,a]));let fees=0n;
  for(const a of d.state.accounts){
    const b=actual.buyAllocations.find(x=>x.accountId===a.id)?.quantity??0,s=actual.sellAllocations.find(x=>x.accountId===a.id)?.quantity??0;
    const buyAmount=BigInt(b)*BigInt(actual.price??0),sellAmount=BigInt(s)*BigInt(actual.price??0),buyFee=independentFee(buyAmount),sellFee=independentFee(sellAmount);
    assert.equal(a.cash,initial.get(a.id).cash-buyAmount-buyFee+sellAmount-sellFee);fees+=buyFee+sellFee;
    assert.equal(totals(a,book.stockId),(initial.get(a.id).holdings[0]?.quantity??0)+b-s);
    assert.equal(a.reservedCash,0n);
    if(b>0)assert.equal(a.lots.find(l=>l.unlockTick>0).unlockTick,book.market==='A'?16:1);
    if(s>0){assert.equal(a.pendingProceeds.reduce((n,p)=>n+p.amount,0n),sellAmount-sellFee);assert.ok(a.pendingProceeds.every(p=>p.availableTick===1));}
    assert.equal(d.state.orders.filter(o=>o.accountId===a.id).reduce((n,o)=>n+o.feesPaid,0n),buyFee+sellFee);
  }
  assert.equal(d.state.serviceCash,fees);
  // All pending proceeds become available, and only B purchases unlock at tick 1.
  core.prepareNextBatch();auditLedger(core.diagnostics().state);
  for(const a of core.diagnostics().state.accounts)assert.equal(a.pendingProceeds.length,0);
  return {auction:economic(actual),fees:fees.toString(),balances:d.state.accounts.map(a=>({id:a.id,cashDelta:(a.cash-initial.get(a.id).cash).toString(),shares:totals(a,book.stockId)})),observedStates:orders.length+3};
}
export function checkFundedRandom(out){
  const seeds=JSON.parse(readFileSync('tests/scenarios/p1/random-seeds.json','utf8')).seeds;
  let observedStates=0;const checkpoints=[];
  for(const seed of seeds){const book=randomBook(seed);
    try{
      const original=runBook(book,book.orders),reordered=runBook(book,[...book.orders].reverse()),split=runBook(book,splitOrders(book.orders));
      assert.deepEqual(original.auction,reordered.auction);assert.deepEqual(original.auction,split.auction);
      assert.equal(original.fees,reordered.fees);assert.equal(original.fees,split.fees);
      assert.deepEqual(original.balances,reordered.balances);assert.deepEqual(original.balances,split.balances);
      observedStates+=original.observedStates+reordered.observedStates+split.observedStates;
      if(seed<=5||seed%200===0)checkpoints.push({seed,...original});
      if(seed%500===0)console.log(`Funded core reference ${seed}/${seeds.length} seeds`);
    }catch(error){writeFileSync(`${out}/first-funded-failure.json`,encodeExact({seed,book,error:error.message})+'\n');throw new Error(`funded seed ${seed}: ${error.message}`);}
  }
  return {seeds:seeds.length,variantsPerSeed:3,actualBatches:seeds.length*3,observedStates,checkpoints};
}

export function checkBoundaries(out){
  const invalidInitial=[];
  for(const quantities of [[-1,10],[.5,.5]]){
    const input={seed:1,playerAccountId:'player',stocks:[{id:'A001',market:'A',initialPrice:1000}],accounts:[{id:'player',cash:1_000_000n,holdings:[]},{id:'seller',cash:0n,holdings:quantities.map(quantity=>({stockId:'A001',quantity}))}]};
    assert.throws(()=>createScenario(input),RangeError);invalidInitial.push(quantities);
  }
  const f=fixtures().find(f=>f.id==='LIFECYCLE-PLAN'),core=createScenario(f.input);const view=core.readPublicView({kind:'market'});
  const command={id:'dedup',target:view.clock,publicVersion:view.publicVersion,body:{kind:'day',stockId:'A001',side:'buy',quantity:10,limitPrice:1000}};
  const receipt=core.submitCommand(command);assert.equal(receipt.accepted,true);const saved=core.exportSnapshot();
  assert.equal(core.submitCommand(command).duplicate,true);assert.equal(core.exportSnapshot().checksum,saved.checksum);
  assert.equal(core.submitCommand({...command,body:{...command.body,quantity:11}}).reason,'duplicateIdConflict');assert.equal(core.exportSnapshot().checksum,saved.checksum);
  const reasons=[];
  for(const change of [{id:'stale',publicVersion:0},{id:'future',target:{worldDay:0,batch:2}},{id:'bad',body:{...command.body,limitPrice:0}},{id:'cash',body:{...command.body,quantity:8_000_000_000,limitPrice:100_000_000}}]){
    const before=financial(core.diagnostics().state),result=core.submitCommand({...command,...change});assert.equal(result.accepted,false);reasons.push(result.reason);assert.equal(financial(core.diagnostics().state),before);
    const hash=core.exportSnapshot().checksum;assert.deepEqual(core.submitCommand({...command,...change}),result);assert.equal(core.exportSnapshot().checksum,hash);
  }
  assert.deepEqual(reasons,['staleView','notDecisionWindow','invalidInput','insufficientCash']);
  core.advance({stop:'batch',maxBatches:1,pauseOnMajor:false});let before=financial(core.diagnostics().state);
  assert.equal(core.submitCommand({...command,id:'past',publicVersion:core.readPublicView({kind:'market'}).publicVersion}).reason,'pastBatch');assert.equal(financial(core.diagnostics().state),before);
  const stable=core.exportSnapshot();assert.equal(core.advance({stop:'day',maxBatches:16,pauseOnMajor:false,cancelRequested:true}).reason,'cancelled');assert.equal(core.exportSnapshot().checksum,stable.checksum);
  assert.equal(core.advance({stop:'day',maxBatches:0,pauseOnMajor:false}).reason,'budget');assert.equal(core.exportSnapshot().checksum,stable.checksum);
  const atomic=[];
  const sign=s=>{const {checksum,...body}=s;return {...body,checksum:digest(encodeExact(body))};};
  const changePayload=fn=>{const s=clone(stable),p=decodeExact(s.payload);fn(p);s.payload=encodeExact(p);return sign(s);};
  const corruptions=[
    ['checksum',{...stable,checksum:'0'.repeat(64)}],['schema',{...stable,schemaVersion:2}],['rules',{...stable,rulesVersion:'0.3.0'}],['math',{...stable,mathVersion:'unknown'}],
    ['malformed',sign({...stable,payload:'{'})],['phase',sign({...stable,phase:'settling'})],['cash',changePayload(p=>{p.accounts[0].cash++;})],
    ['negative',changePayload(p=>{p.accounts[0].cash=-1n;})],['reserve',changePayload(p=>{p.accounts[0].reservedCash++;})],['lot',changePayload(p=>{p.accounts.find(a=>a.lots.length).lots[0].quantity++;})],
    ['rng',changePayload(p=>{p.rngVersion='rng-v2';})],['duplicateOrder',changePayload(p=>{p.orders.push(clone(p.orders[0]));})],
    ['envelopeClock',sign({...stable,clock:{worldDay:1,batch:0}})],['oversize',{...stable,payload:' '.repeat(64*1024*1024+1)}],
  ];
  for(const [name,input]of corruptions){const result=core.restoreSnapshot(input);assert.equal(result.restored,false,name);assert.equal(core.exportSnapshot().checksum,stable.checksum,name);atomic.push({name,reason:result.reason});}
  const restored=createMarketCore();assert.equal(restored.restoreSnapshot(saved).restored,true);const restoredHash=restored.exportSnapshot().checksum;
  assert.equal(restored.submitCommand(command).duplicate,true);assert.equal(restored.exportSnapshot().checksum,restoredHash);
  for(let i=0;i<50;i++){restored.readFor('player',{kind:'market'});restored.readFor('seller',{kind:'portfolio'});restored.readPublicView({kind:'chart',stockId:'A001',scale:'day'});}
  assert.equal(restored.exportSnapshot().checksum,restoredHash);
  const modified=clone(f.input);modified.stocks[0].actualOperatingIndexQ=777_000_000_000n;modified.publications=[{message:{id:'hidden-future',revision:1,publishedAt:{worldDay:3,batch:0},expiresAt:{worldDay:20,batch:0},expectationQ:7n,status:'active',text:'not published yet'},major:true,privateResultQ:888n}];
  assert.deepEqual(createScenario(modified).readPublicView({kind:'market'}),createScenario(f.input).readPublicView({kind:'market'}));
  const prefix=[0,1,2,3].map(t=>randomU32(42,'external','A001',t,0));
  core.prepareNextBatch();const current=core.readPublicView({kind:'market'});core.submitCommand({id:'extra',target:current.clock,publicVersion:current.publicVersion,body:{kind:'cancel',orderId:receipt.orderId}});
  assert.deepEqual([0,1,2,3].map(t=>randomU32(42,'external','A001',t,0)),prefix);
  // Every relevant fixture normalizes entity order before creating the same world.
  const orderChecks=[];
  for(const f of fixtures().filter(f=>['A07','A11','A12','A14'].includes(f.id))){const changed=clone(f.input);changed.stocks.reverse();changed.accounts.reverse();changed.publications?.reverse();assert.equal(runReplay(changed,f.commands).finalSnapshot.checksum,runReplay(f.input,f.commands).finalSnapshot.checksum);orderChecks.push(f.id);}
  return {invalidInitialHoldings:invalidInitial,duplicateAndRejectionReasons:reasons,malformedSnapshots:atomic,readCount:150,publicPrefixIsolation:true,externalKeyIsolation:true,stockAndAccountReorder:orderChecks};
}

export function checkResume(){
  const results=[];
  for(const f of fixtures().filter(f=>['A09','A06','A12','A14','PROTECTION-A-EMPTY','A13'].includes(f.id))){
    const full=runReplay(f.input,f.commands),baseChecksum=full.finalSnapshot.checksum;
    for(let i=0;i<f.commands.length;i++)if(f.commands[i].op==='snapshot'){
      const prefix=runReplay(f.input,f.commands.slice(0,i+1));const actions=f.commands.slice(i+1);
      const resumed=runReplay(prefix.finalSnapshot,actions,d=>auditLedger(d.state));assert.equal(resumed.finalSnapshot.checksum,baseChecksum,`${f.id}/${f.commands[i].label}`);
      results.push({id:f.id,checkpoint:f.commands[i].label,phase:prefix.finalSnapshot.phase,checksum:baseChecksum});
    }
  }
  // One funded uncompleted plan crosses 32 batches, A unlocks, and two markets
  // share its wallet. Only advance granularity changes; the command stream is fixed.
  const input={seed:88,playerAccountId:'player',stocks:[{id:'A001',market:'A',initialPrice:1000},{id:'B001',market:'B',initialPrice:1000}],accounts:[{id:'player',cash:1_000_000n,holdings:[]},{id:'seller',cash:0n,holdings:[{stockId:'A001',quantity:32},{stockId:'B001',quantity:32}]}]};
  const actions=[...['A001','B001'].flatMap(id=>[{op:'submit',accountId:'player',id:`buy-${id}`,body:{kind:'plan',stockId:id,side:'buy',quantity:32,limitPrice:1000,endAt:{worldDay:1,batch:15}}},{op:'submit',accountId:'seller',id:`sell-${id}`,body:{kind:'plan',stockId:id,side:'sell',quantity:32,limitPrice:1000,endAt:{worldDay:1,batch:15}}}])];
  const variant=stop=>[...actions,...Array.from({length:stop==='batch'?32:stop==='hour'?8:2},()=>({op:'advance',request:{stop,maxBatches:stop==='batch'?1:stop==='hour'?4:16,pauseOnMajor:false}}))];
  const hashes=['batch','hour','day'].map(stop=>{const r=runReplay(input,variant(stop),d=>auditLedger(d.state));traceAssertions(r.diagnostics.trace);return r.finalSnapshot.checksum;});assert.equal(new Set(hashes).size,1);
  const checkpoint=runReplay(input,[...actions,{op:'advance',request:{stop:'hour',maxBatches:4,pauseOnMajor:false}}]);
  assert.ok(decodeExact(checkpoint.finalSnapshot.payload).orders.some(o=>o.status==='partial'));
  const resumed=runReplay(checkpoint.finalSnapshot,Array.from({length:7},()=>({op:'advance',request:{stop:'hour',maxBatches:4,pauseOnMajor:false}})),d=>auditLedger(d.state));assert.equal(resumed.finalSnapshot.checksum,hashes[0]);
  return {fixtureCheckpoints:results,batchHourDayAndPlanRestoreChecksum:hashes[0],planBatches:32};
}

export function goldenRows(){return fixtures().map(f=>{const result=runReplay(f.input,f.commands);return {id:f.id,outputSha256:digest(encodeExact(result)),stateHash:result.diagnostics.stateHash,snapshotChecksum:result.finalSnapshot.checksum,stepHashes:result.steps.map(s=>s.stateHash)};});}
export function checkGolden(){const recorded=JSON.parse(readFileSync('tests/replays/p1-golden.json','utf8'));const actual=goldenRows();assert.deepEqual(actual,recorded.cases);return {cases:actual.length,fullCanonicalOutputsCompared:true,rows:actual};}
