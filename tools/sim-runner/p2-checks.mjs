import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as sim from '../../packages/sim-core/src/index.ts';
import { auditLedger } from './reference-auction.mjs';
import { createAutonomousWorld, advanceTo, warmupWorld } from './p2-world-run.mjs';
import { EconomicMetrics, auditBatch } from './p2-metrics.mjs';
import { writeJson, tick, clockAt } from './p2-runtime.mjs';

export function checkMetricGate() {
  const stocks = ['A', 'B'].flatMap(market => Array.from({ length: 20 }, (_, i) => ({ id: `${market}${i}`, market, floatShares: 1000 })));
  const calculate = failingStocks => {
    const metrics = new EconomicMetrics(stocks);
    for (let day = 0; day < 250; day++) for (let batch = 0; batch < 16; batch++) metrics.record({ clock: { worldDay: 250 + day, batch }, stocks: stocks.map(stock => {
      const quantity = batch === 0 && day < 200 && !failingStocks.includes(stock.id) ? 1 : 0;
      return { stockId: stock.id, low: 90, high: 110, clearing: { quantity, price: quantity ? 100 : null }, indicative: { quantity, price: quantity ? 100 : null } };
    }) });
    return metrics.summary();
  };
  const boundary = calculate(['A0', 'A1']);
  assert.equal(boundary.status, 'pass'); assert.equal(boundary.markets[0].qualifyingStocks, 18);
  assert.equal(boundary.stocks.find(stock => stock.id === 'A2').tradedDays, 200);
  const failure = calculate(['A0', 'A1', 'A2']);
  assert.equal(failure.status, 'fail'); assert.equal(failure.markets[0].qualifyingStocks, 17); assert.equal(failure.markets[1].qualifyingStocks, 20);
  assert.equal(boundary.warmupIncluded, false);
  return { exactBoundary: '18stocks ×200/250 days passes', counterexample: '17stocks fails despite other market20/20', scope: 'Statistics unit inputs only; not autonomous market evidence.' };
}

export function checkWorldInitialization() {
  const fixture = sim.decodeExact(readFileSync('tests/scenarios/p2/behavior.json', 'utf8'));
  const a = createAutonomousWorld(fixture.seed, fixture.playerCapital);
  const b = createAutonomousWorld(fixture.seed, fixture.playerCapital);
  assert.equal(a.exportSnapshot().checksum, b.exportSnapshot().checksum);
  const state = sim.decodeExact(a.exportSnapshot().payload);
  assert.equal(state.world.generationVersion, sim.INITIALIZATION_VERSION);
  const initialStyles = JSON.parse(readFileSync('tests/scenarios/p0/baseline-v1.json', 'utf8')).styles;
  auditLedger(state);
  assert.equal(state.playerInjected, false); assert.equal(state.world.npcs.length, 26);
  const view = a.readWorldView({ kind: 'market' });
  assert.equal(view.companies.length, 40); assert.equal(view.world.playerInjected, false);
  const allowed = { storage: ['energy', 'industry', 'infrastructure'], compute: ['digital', 'infrastructure', 'energy'], autonomy: ['industry', 'digital', 'health'],
    renewal: ['infrastructure', 'industry', 'consumer'], automation: ['industry', 'digital', 'consumer'], recycling: ['energy', 'industry', 'consumer'], longevity: ['health', 'consumer', 'digital'], crossborder: ['industry', 'energy', 'consumer'] };
  const expectedConcepts = { storage: 5, compute: 5, autonomy: 5, renewal: 5, automation: 5, recycling: 5, longevity: 4, crossborder: 4 };
  for (const [id, count] of Object.entries(expectedConcepts)) {
    const members = view.companies.filter(stock => stock.concepts.some(concept => concept.id === id));
    assert.equal(members.length, count); assert.ok(new Set(members.map(stock => stock.sector)).size >= 2);
  }
  const quotas = JSON.parse(readFileSync('tests/scenarios/p0/world-prototype.json', 'utf8')).industrySizeMatrix;
  const sectors = ['energy', 'industry', 'consumer', 'infrastructure', 'digital', 'health'];
  const tiers = ['large', 'medium', 'small'];
  for (const market of ['A', 'B']) {
    const stocks = view.companies.filter(stock => stock.market === market);
    assert.equal(stocks.length, 20);
    assert.deepEqual([0, 1, 2].map(count => stocks.filter(stock => stock.concepts.length === count).length), [5, 11, 4]);
    for (let sector = 0; sector < 6; sector++) for (let tier = 0; tier < 3; tier++) assert.equal(stocks.filter(stock => stock.sector === sectors[sector] && stock.tier === tiers[tier]).length, quotas[market][sector][tier]);
    for (let i = 0; i < stocks.length; i++) assert.equal(stocks[i].reportPhase, i % 20);
  }
  for (const stock of view.companies) {
    assert.ok(stock.concepts.every(concept => allowed[concept.id].includes(stock.sector) && concept.business.length > 0 && concept.exposureQ >= 0n));
    assert.ok(stock.concepts.reduce((total, concept) => total + concept.exposureQ, 0n) <= 1_000_000_000n);
    const trading = state.stocks.find(s => s.id === stock.id);
    const marketValue = BigInt(trading.totalShares) * BigInt(trading.initialPrice);
    const limits = { large: [1_000_000_000_000n, 4_000_000_000_000n], medium: [200_000_000_000n, 1_000_000_000_000n], small: [20_000_000_000n, 200_000_000_000n] };
    assert.ok(marketValue >= limits[stock.tier][0] && marketValue < limits[stock.tier][1]);
    assert.ok(BigInt(stock.floatShares) * 100n >= BigInt(stock.totalShares) * 25n && BigInt(stock.floatShares) * 100n <= BigInt(stock.totalShares) * 70n);
  }
  for (const npc of state.world.npcs) {
    const wallet = state.accounts.find(account => account.id === npc.accountId);
    const value = wallet.lots.reduce((sum, lot) => sum + BigInt(lot.quantity) * BigInt(state.stocks.find(stock => stock.id === lot.stockId).initialPrice), 0n);
    const fraction = npc.style === 'inventory' ? null : BigInt(initialStyles[npc.style].stockFractionQ);
    const expectedCash = fraction === null ? value / 4n : value * (1_000_000_000n - fraction) / fraction;
    assert.equal(wallet.cash, expectedCash); assert.equal(sim.initialNpcCash(value, npc.role), expectedCash); assert.equal(wallet.feeWeight, wallet.cash);
    if (npc.market !== null) assert.ok(wallet.lots.every(lot => lot.stockId.startsWith(npc.market)));
    assert.ok(npc.assets.every(asset => asset.initialShares > 0 && asset.baselineWeightQ > 0n));
  }
  const privateKeys = ['actualOperatingIndexQ', 'npcs', 'pendingGrowthQ', 'regimeExpiresDay', 'privateResultQ', 'publications'];
  const publicText = sim.encodeExact(view);
  assert.ok(privateKeys.every(key => !publicText.includes(`"${key}"`)));
  const initialChecksum = a.exportSnapshot().checksum;
  for (let i = 0; i < 10; i++) { a.readWorldView({ kind: 'company', stockId: 'A001' }); a.readWorldView({ kind: 'chart', stockId: 'B001', scale: i % 2 ? 'day' : 'hour' }); }
  assert.equal(a.exportSnapshot().checksum, initialChecksum);
  return { seed: fixture.seed, initializationVersion: state.world.generationVersion, initialChecksum, companies: 40, npcWallets: 26,
    npcInitialCash: state.accounts.reduce((sum, account) => sum + account.cash, 0n), initialCashFormula: 'ordinary floor(H*(1-f)/f); inventory floor(H/4); fixed initial feeWeight',
    quotas: 'exact P0 matrix and concepts', conservation: 'zero', publicQueryChanges: 0 };
}

export function checkWorldBehavior(out) {
  const input = sim.decodeExact(readFileSync('tests/scenarios/p2/behavior.json', 'utf8'));
  const core = createAutonomousWorld(input.seed, input.playerCapital);
  core.advance({ stop: 'batch', maxBatches: 1, pauseOnMajor: false });
  const zeroHistory = core.diagnosticsSummary(); auditBatch(zeroHistory, 0);
  const availableCapacity = zeroHistory.wallets.flatMap(wallet => wallet.targets).filter(target => target.hourCapacity > 0).length;
  const cross = zeroHistory.latestBatch.stocks.filter(stock => stock.indicative.quantity > 0);
  assert.ok(availableCapacity > 0 && cross.length > 0, 'A16 real funded quotes must be possible with no prior ADV');
  const { snapshot: preheated, ready } = warmupWorld(core);
  const entry = sim.decodeExact(ready.payload); const warmup = sim.decodeExact(preheated.payload);
  assert.equal(entry.initialCash, warmup.initialCash + input.playerCapital);
  const beforeRepeat = core.exportSnapshot().checksum; core.prepareNextBatch();
  assert.equal(core.exportSnapshot().checksum, beforeRepeat, 'entry prepare repeated capital or effects');
  advanceTo(core, { worldDay: 258, batch: 15 }); core.prepareNextBatch();
  const view = core.readWorldView({ kind: 'market' });
  const company = id => view.companies.find(stock => stock.id === id);
  const submit = (id, body) => core.submitCommand({ id, publicVersion: view.publicVersion, target: view.clock, body });
  const immediate = submit('p2-check-buy', { kind: 'immediate', stockId: 'A001', side: 'buy', quantity: 100, limitPrice: company('A001').protection.high });
  const plan = submit('p2-check-plan', { kind: 'plan', stockId: 'A002', side: 'buy', quantity: 3000, limitPrice: company('A002').protection.high, endAt: { worldDay: 260, batch: 15 } });
  assert.equal(immediate.accepted, true); assert.equal(plan.accepted, true);
  core.advance({ stop: 'batch', maxBatches: 1, pauseOnMajor: false }); core.prepareNextBatch();
  const checkpoint = core.exportSnapshot(); const state = sim.decodeExact(checkpoint.payload);
  const player = state.accounts.find(account => account.id === state.playerAccountId);
  const pendingPlan = state.orders.find(order => order.id === plan.orderId);
  assert.ok(pendingPlan.filledQuantity > 0 && pendingPlan.remainingQuantity > 0 && pendingPlan.reservedCash > 0n, 'restore checkpoint must hold a partially filled frozen plan');
  assert.ok(player.lots.some(lot => lot.stockId.startsWith('A') && lot.unlockTick > tick(state.clock)), 'restore checkpoint must hold newly bought locked A shares');
  assert.equal(checkpoint.phase, 'publicDecision');
  writeJson(`${out}/behavior-checkpoint.json`, checkpoint);
  const continuationBatches = input.restoreDays * 16;
  const target = clockAt(tick(checkpoint.clock) + continuationBatches - 1);
  const checksums = [];
  for (const budget of [1, 4, 16, 64]) {
    const receiver = sim.createMarketCore(); assert.equal(receiver.restoreSnapshot(checkpoint).restored, true);
    assert.equal(receiver.exportSnapshot().checksum, checkpoint.checksum);
    advanceTo(receiver, target, budget);
    checksums.push({ budget, checksum: receiver.exportSnapshot().checksum });
  }
  assert.equal(new Set(checksums.map(row => row.checksum)).size, 1, 'batch/hour/day/fast-forward restoration diverged');
  // The original object, without any restore, must have the same complete future.
  advanceTo(core, { worldDay: 259, batch: 15 });
  const beforeFee = sim.decodeExact(core.exportSnapshot().payload);
  assert.ok(beforeFee.serviceCash > 0n);
  core.prepareNextBatch();
  const afterFee = sim.decodeExact(core.exportSnapshot().payload);
  assert.equal(afterFee.serviceCash, 0n); assert.equal(afterFee.initialCash, beforeFee.initialCash); auditLedger(afterFee);
  const recipients = beforeFee.accounts.filter(account => account.feeWeight > 0n && account.id !== beforeFee.playerAccountId);
  const weight = recipients.reduce((total, account) => total + account.feeWeight, 0n);
  const distribution = recipients.map(account => ({ id: account.id, amount: beforeFee.serviceCash * account.feeWeight / weight, remainder: beforeFee.serviceCash * account.feeWeight % weight }));
  let remaining = beforeFee.serviceCash - distribution.reduce((total, row) => total + row.amount, 0n);
  distribution.sort((a, b) => a.remainder === b.remainder ? a.id < b.id ? -1 : a.id > b.id ? 1 : 0 : a.remainder > b.remainder ? -1 : 1);
  for (const row of distribution) if (remaining > 0n) { row.amount++; remaining--; }
  for (const account of beforeFee.accounts) {
    const actual = afterFee.accounts.find(a => a.id === account.id);
    assert.equal(actual.cash, account.cash + (distribution.find(row => row.id === account.id)?.amount ?? 0n));
    assert.equal(sim.encodeExact(actual.lots), sim.encodeExact(account.lots), 'fee cycle refilled shares');
  }
  advanceTo(core, target);
  assert.equal(core.exportSnapshot().checksum, checksums[0].checksum);
  const stable = core.exportSnapshot();
  const invalid = [{ ...stable, checksum: '0'.repeat(64) }, { ...stable, schemaVersion: 999 }, { ...stable, rulesVersion: 'unsupported' }];
  for (const snapshot of invalid) { assert.equal(core.restoreSnapshot(snapshot).restored, false); assert.equal(core.exportSnapshot().checksum, stable.checksum); }
  assert.equal(core.advance({ stop: 'day', maxBatches: 16, pauseOnMajor: false, cancelRequested: true }).reason, 'cancelled');
  assert.equal(core.exportSnapshot().checksum, stable.checksum);
  return { seed: input.seed, A16: { positiveCapacityAssets: availableCapacity, stocksWithRealUnboundedCross: cross.length, audit: 'zero' }, A17: { worldDay: 260, distributed: beforeFee.serviceCash, recipients: distribution.length, fixedInitialCashShares: true, sharesChanged: false },
    warmupChecksum: preheated.checksum, entryChecksum: ready.checksum, entryCashAdded: input.playerCapital, repeatedInjection: 0, checkpointChecksum: checkpoint.checksum,
    checkpoint: { clock: checkpoint.clock, phase: checkpoint.phase, partiallyFilledPlan: true, reservedCash: player.reservedCash, lockedA: true }, continuationBatches, continuedThrough: target, finalChecksum: stable.checksum,
    budgets: checksums, corruptRestoreRetainedCurrentWorld: invalid.length, coreCancelledAtBoundary: true };
}

export function checkBaselinePreset() {
  assert.equal(typeof sim.exportBaselinePreset, 'function', 'production must expose the actual baseline-v1 parameters');
  const actual = sim.exportBaselinePreset();
  const expected = JSON.parse(readFileSync('tests/scenarios/p0/baseline-v1.json', 'utf8'));
  const normalize = value => typeof value === 'bigint' ? value.toString() : Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)])) : value;
  const normalized = normalize(actual);
  assert.equal(normalized.preset, expected.preset); assert.equal(normalized.accountCount, 26);
  assert.deepEqual(normalized.disabled, expected.disabled); assert.deepEqual(normalized.styles, expected.styles);
  return { preset: normalized.preset, actual, matchesFrozenBehavior: true };
}
