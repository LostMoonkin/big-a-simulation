import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as sim from './src/index.ts';
import { generateNpcOrders } from './src/world-simulation.ts';
import { validateWorldBalances } from './src/world-validation.ts';
import { argumentsFor, outputPath, p2Manifest, p2Identity, writeJson, sha, canonicalHash } from '../../tools/sim-runner/p2-runtime.mjs';

const options=argumentsFor(process.argv.slice(2),['out']),out=outputPath(options,'npc-quote'),fixture=JSON.parse(readFileSync('tests/scenarios/p0/npc-quote-candidate.json','utf8'));
const legacyCommit='9dfc69ffb1ee314d6d2a90b8fdad6d2a5f873548';
const manifest=p2Manifest(`node ${process.argv.slice(1).join(' ')}`,{fixture:'tests/scenarios/p0/npc-quote-candidate.json',fixtureHash:sha(readFileSync('tests/scenarios/p0/npc-quote-candidate.json')),legacyCommit});
const checks=[],check=(id,run)=>{try{checks.push({id,status:'pass',metrics:run()});}catch(error){checks.push({id,status:'fail',error:error.message});}};
const snapshots=new Map();
function retained(path){if(!snapshots.has(path))snapshots.set(path,JSON.parse(readFileSync(path,'utf8')));return snapshots.get(path);}
function receiver(snapshot){const core=sim.createMarketCore();assert.equal(core.restoreSnapshot(snapshot).restored,true);return core;}

// The original autonomous modules are isolated under the ignored run directory.
// Other runtime dependencies are unchanged; validation only gained the version guard.
const frozenNames=['world-generation.ts','world-simulation.ts','trading-core.ts'];
const frozenPaths=new Map(frozenNames.map(name=>[name,resolve(out,`legacy-${name}`)]));
for(const name of frozenNames){const original=execFileSync('git',['show',`${legacyCommit}:packages/sim-core/src/${name}`],{encoding:'utf8',windowsHide:true});
  const source=original.replace(/from '(\.\/[^']+)'/g,(_match,specifier)=>`from '${pathToFileURL(frozenPaths.get(specifier.slice(2))??resolve('packages/sim-core/src',specifier.slice(2))).href}'`);
  writeFileSync(frozenPaths.get(name),source);}
const frozen=await import(pathToFileURL(frozenPaths.get('trading-core.ts')).href);

function participant(c,person,version,{target=person.targetShares,lock=false}={}){
  const path=`artifacts/verification/p2/diagnostic-03/seeds/${c.seed}/baseline-end-snapshot.json`,core=receiver(retained(path));core.prepareNextBatch();
  const state=sim.decodeExact(core.exportSnapshot().payload),npc=state.world.npcs.find(n=>n.accountId===person.accountId),wallet=state.accounts.find(a=>a.id===person.accountId),asset=npc.assets.find(a=>a.stockId===c.stockId);
  assert.deepEqual(state.clock,c.clock);assert.equal(wallet.cash,BigInt(person.cash));assert.equal(asset.initialShares,person.initialShares);
  assert.equal(wallet.lots.filter(l=>l.stockId===c.stockId).reduce((sum,l)=>sum+l.quantity,0),person.held);
  // Fixed participant input after target review; not new-world warmup or coverage evidence.
  state.world.npcs=[npc];state.world.majorStockIds=[];npc.lastReviewPublicVersion=state.publicVersion;
  for(const a of npc.assets)a.targetShares=wallet.lots.filter(l=>l.stockId===a.stockId).reduce((sum,l)=>sum+l.quantity,0);
  asset.targetShares=target;asset.hourCapacity=person.hourCapacity;asset.hourUsed=0;
  if(version===undefined)delete state.world.npcQuoteVersion;else state.world.npcQuoteVersion=version;
  if(lock)for(const l of wallet.lots)if(l.stockId===c.stockId)l.unlockTick=c.clock.worldDay*16+16;
  const beforeCash=wallet.cash;generateNpcOrders(state);validateWorldBalances(state);
  assert.equal(wallet.cash,beforeCash);assert.equal(wallet.lots.filter(l=>l.stockId===c.stockId).reduce((sum,l)=>sum+l.quantity,0),person.held);
  assert.equal(asset.targetShares,target,'quote generation changed the persistent target');assert.equal(asset.hourUsed,0,'quote generation refreshed/used capacity');
  assert.equal(asset.referenceQ,BigInt(person.referenceQ),'valuation reference used for scores changed');
  const rows=state.orders.filter(o=>o.accountId===person.accountId&&o.stockId===c.stockId);
  assert.ok(rows.reduce((sum,o)=>sum+o.quantity,0)<=person.hourCapacity);
  assert.ok(state.orders.filter(o=>o.accountId===person.accountId&&o.side==='buy').reduce((sum,o)=>sum+o.reservedCash,0n)<=wallet.cash-wallet.pendingProceeds.reduce((sum,p)=>sum+p.amount,0n));
  return {state,rows};
}

check('NPC-QUOTE-01-PRODUCTION',()=>fixture.cases.map(c=>{
  const legacy=[participant(c,c.buyer),participant(c,c.seller)],candidate=[participant(c,c.buyer,sim.NPC_QUOTE_VERSION),participant(c,c.seller,sim.NPC_QUOTE_VERSION)];
  for(let i=0;i<2;i++){const person=i===0?c.buyer:c.seller;
    assert.equal(legacy[i].rows.find(o=>o.id.endsWith(':0')).limitPrice,person.legacyTopPrice);
    assert.equal(candidate[i].rows.find(o=>o.id.endsWith(':0')).limitPrice,person.candidateTopPrice);
    assert.deepEqual(candidate[i].rows.map(o=>[o.side,o.quantity]),legacy[i].rows.map(o=>[o.side,o.quantity]));}
  const stock=candidate[0].state.stocks.find(s=>s.id===c.stockId),input={seed:c.seed,tick:c.clock.worldDay*16,stockId:c.stockId,reference:stock.lastPrice,
    low:Number((BigInt(stock.lastPrice)*9n+9n)/10n),high:Number(BigInt(stock.lastPrice)*11n/10n)};
  const clear=parts=>sim.clearAuction({...input,orders:parts.flatMap(p=>p.rows.map(o=>({id:o.id,accountId:o.accountId,side:o.side,limitPrice:o.limitPrice,quantity:o.quantity,sequence:o.sequence})))});
  const old=clear(legacy),next=clear(candidate);assert.equal(old.quantity,0);assert.ok(next.quantity>0&&next.price>=input.low&&next.price<=input.high);
  const cappedBuy=participant(c,c.buyer,sim.NPC_QUOTE_VERSION,{target:sim.MAX_SHARES}),cappedSell=participant(c,c.seller,sim.NPC_QUOTE_VERSION,{target:0});
  assert.equal(cappedBuy.rows[0].limitPrice,Number(sim.mulQ(BigInt(c.buyer.referenceQ),sim.expQ(120_000_000n))/sim.SCALE));
  const lower=sim.mulQ(BigInt(c.seller.referenceQ),sim.expQ(-120_000_000n));assert.equal(cappedSell.rows[0].limitPrice,Number((lower+sim.SCALE-1n)/sim.SCALE));
  assert.equal(participant(c,c.buyer,sim.NPC_QUOTE_VERSION,{target:c.buyer.held}).rows.length,0);
  assert.equal(participant(c,c.seller,sim.NPC_QUOTE_VERSION,{lock:true}).rows.length,0);
  return {id:c.id,legacyQuantity:old.quantity,candidateQuantity:next.quantity,candidatePrice:next.price,buyerTop:c.buyer.candidateTopPrice,sellerTop:c.seller.candidateTopPrice,boundedLogShift:true,unchangedQuantities:true,lockedSellQuantity:0,
    inputSnapshot:retained(`artifacts/verification/p2/diagnostic-03/seeds/${c.seed}/baseline-end-snapshot.json`).checksum,scope:'Controlled fixed participant inputs; not new autonomous economic coverage'};
}));

check('NPC-QUOTE-VERSION-NEW-WORLD',()=>{
  const config={rulesVersion:sim.RULES_VERSION,contentVersion:sim.CONTENT_VERSION,seed:20261001,size:'prototype',mode:'baseline',playerCapital:100_000_000n},core=sim.createMarketCore(),old=frozen.createMarketCore();
  assert.ok('stateVersion' in core.createWorld(config));assert.ok('stateVersion' in old.createWorld(config));
  const current=sim.decodeExact(core.exportSnapshot().payload),prior=sim.decodeExact(old.exportSnapshot().payload),bound=current.configHash;
  assert.equal(current.world.npcQuoteVersion,sim.NPC_QUOTE_VERSION);assert.notEqual(bound,prior.configHash);
  delete current.world.npcQuoteVersion;current.configHash=prior.configHash;assert.equal(sim.encodeExact(current),sim.encodeExact(prior),'generation changed beyond quote version/config binding');
  assert.equal(core.readWorldView({kind:'market'}).world.npcQuoteVersion,sim.NPC_QUOTE_VERSION);assert.equal(core.diagnosticsSummary().world.npcQuoteVersion,sim.NPC_QUOTE_VERSION);
  const preset=sim.exportBaselinePreset();assert.equal(preset.npcQuoteVersion,fixture.npcQuoteVersion);assert.equal(preset.quote.gapScale,'initialShares');assert.equal(preset.quote.maxLogShiftQ,BigInt(fixture.maxLogShiftQ));
  const good=core.exportSnapshot(),badState=sim.decodeExact(good.payload);badState.world.npcQuoteVersion='unsupported';const {checksum,...body}=good;body.payload=sim.encodeExact(badState);
  assert.equal(core.restoreSnapshot({...body,checksum:canonicalHash(body)}).restored,false);assert.equal(core.exportSnapshot().checksum,good.checksum);
  return {newConfigHash:bound,legacyConfigHash:prior.configHash,onlyGenerationDifferences:['npcQuoteVersion','configHash'],unknownVersionRetainsWorld:true,presetQuoteVersion:preset.npcQuoteVersion};
});

check('NPC-QUOTE-LEGACY-CANONICAL-AND-FUTURE',()=>[
  'artifacts/verification/p2/diagnostic-02/seeds/3572871866/baseline-end-snapshot.json',
  'artifacts/verification/p2/diagnostic-03/seeds/3572871866/baseline-end-snapshot.json',
  'artifacts/verification/p2/diagnostic-03/seeds/1866980507/baseline-end-snapshot.json',
].map(path=>{const input=retained(path),core=receiver(input),old=frozen.createMarketCore();assert.equal(old.restoreSnapshot(input).restored,true);
  assert.equal(core.readWorldView({kind:'market'}).world.npcQuoteVersion,'npc-quote-v1');assert.equal(core.diagnosticsSummary().world.npcQuoteVersion,'npc-quote-v1');
  assert.equal(core.exportSnapshot().payload,input.payload);assert.equal(core.exportSnapshot().checksum,input.checksum);
  assert.equal(sim.decodeExact(core.exportSnapshot().payload).world.npcQuoteVersion,undefined);
  for(let i=0;i<16;i++){core.advance({stop:'batch',maxBatches:1,pauseOnMajor:false});old.advance({stop:'batch',maxBatches:1,pauseOnMajor:false});}
  const result=core.exportSnapshot(),expected=old.exportSnapshot();assert.equal(result.payload,expected.payload);assert.equal(result.checksum,expected.checksum);
  return {input:path,initializationVersion:sim.decodeExact(input.payload).world.generationVersion,inputChecksum:input.checksum,canonicalBytesPreserved:true,continuedBatches:16,frozenLegacyCommit:legacyCommit,continuedChecksum:result.checksum};
}));

const ending=p2Identity();check('NPC-QUOTE-SOURCE-UNCHANGED',()=>{assert.equal(ending.economicSourceHash,manifest.economicSourceHash);return {economicSourceHash:ending.economicSourceHash};});
const status=checks.every(c=>c.status==='pass')?'pass':'fail';writeJson(`${out}/manifest.json`,manifest);writeJson(`${out}/results.json`,{status,scope:'Production fixed quote/compatibility regression; P2 stage acceptance and economic gate remain pending',checks});
console.log(JSON.stringify({status,out,checks:checks.map(({id,status,error})=>({id,status,...(error?{error}:{})})),economicSourceHash:manifest.economicSourceHash}));if(status==='fail')process.exitCode=1;
