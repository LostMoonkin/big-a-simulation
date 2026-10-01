import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMarketCore, decodeExact, encodeExact, SCALE } from '../../packages/sim-core/src/index.ts';
import { advanceTo } from './p2-world-run.mjs';
import { argumentsFor, outputPath, writeJson, p2Manifest, commandLine, sha, canonicalHash, p2Identity, tick } from './p2-runtime.mjs';

const options = argumentsFor(process.argv.slice(2), ['input', 'out']);
const out = outputPath(options, 'major-fixture');
let manifest;
try {
  assert.ok(options.input, '--input must be an actual browser-downloaded complete world');
  const bytes = readFileSync(options.input);
  const input = decodeExact(bytes.toString('utf8'));
  const fixturePath = 'tests/scenarios/p2/major-report-fixture.json';
  const fixture = decodeExact(readFileSync(fixturePath, 'utf8'));
  assert.equal(fixture.format, 'p2-major-report-fixed-input-v1');
  const core = createMarketCore(); assert.equal(core.restoreSnapshot(input).restored, true);
  const initial = core.exportSnapshot(); const initialState = decodeExact(initial.payload);
  assert.equal(initial.checksum, input.checksum); assert.equal(initial.payload, input.payload);
  const npcQuoteVersion = core.diagnosticsSummary().world.npcQuoteVersion;
  assert.ok(initialState.world && initialState.playerInjected);
  assert.equal(initial.phase, 'settled'); assert.equal(initial.clock.batch, 15);
  const metadata = initialState.world.stocks.find(s => s.id === fixture.stockId);
  assert.ok(metadata, 'fixed report company is absent');
  const hasHolding = state => state.accounts.find(a => a.id === state.playerAccountId).lots.some(l => l.stockId === fixture.stockId && l.quantity > 0);
  assert.ok(hasHolding(initialState), 'fixture needs a real player holding already present in its browser input');
  let reportDay = initial.clock.worldDay + 1;
  while (reportDay % 20 !== metadata.reportPhase) reportDay++;
  manifest = p2Manifest(commandLine(), { scope: 'fixed-hidden-input-only', input: options.input, inputSha256: sha(bytes), fixture: fixturePath,
    fixtureSha256: sha(readFileSync(fixturePath)), initialChecksum: initial.checksum, npcQuoteVersion, reportDay, stockId: fixture.stockId });
  writeJson(`${out}/manifest.json`, manifest);
  const beforeReport = { worldDay: reportDay - 1, batch: 15 };
  if (tick(beforeReport) > tick(initial.clock)) advanceTo(core, beforeReport);
  const base = core.exportSnapshot(); const state = decodeExact(base.payload);
  assert.ok(hasHolding(state));
  const stock = state.stocks.find(s => s.id === fixture.stockId);
  const previousIndex = stock.actualOperatingIndexQ;
  const fixedIndex = previousIndex * fixture.hiddenOperatingIndexMultiplierQ / SCALE;
  assert.ok(fixedIndex >= 5n * SCALE && fixedIndex <= 2000n * SCALE && fixedIndex !== previousIndex);
  stock.actualOperatingIndexQ = fixedIndex;
  const patchedPayload = encodeExact(state);
  stock.actualOperatingIndexQ = previousIndex;
  assert.equal(encodeExact(state), base.payload, 'fixture changed another state field');
  const { checksum: _checksum, ...body } = { ...base, payload: patchedPayload };
  const patched = { ...body, checksum: canonicalHash(body) };
  const receiver = createMarketCore(); assert.equal(receiver.restoreSnapshot(patched).restored, true);
  assert.equal(encodeExact(receiver.readWorldView({ kind: 'market' })), encodeExact(core.readWorldView({ kind: 'market' })), 'hidden fixture changed the prior public projection');
  writeJson(`${out}/base-snapshot.json`, base);
  writeJson(`${out}/major-input-snapshot.json`, patched);
  // The normal control prepares the same public boundary without submitting NPCs.
  // Daily inventory targets, hour capacity and pending proceeds legitimately
  // change during preparation, so compare those fields to this control.
  core.prepareNextBatch();
  const preparedControl = decodeExact(core.exportSnapshot().payload);
  const reply = receiver.advance({ stop: { worldDay: reportDay, batch: 15 }, maxBatches: 16, pauseOnMajor: true });
  assert.equal(reply.reason, 'majorMessage'); assert.equal(reply.completedBatches, 0);
  const paused = receiver.exportSnapshot(); const after = decodeExact(paused.payload);
  assert.equal(paused.phase, 'publicDecision'); assert.deepEqual(paused.clock, { worldDay: reportDay, batch: 0 });
  assert.equal(after.world.lastSettledTick, state.world.lastSettledTick);
  assert.equal(encodeExact(after.world.npcs), encodeExact(preparedControl.world.npcs), 'NPC order generation ran beyond normal public preparation');
  assert.equal(encodeExact(after.accounts), encodeExact(preparedControl.accounts), 'accounts differ from an untraded public preparation');
  assert.equal(encodeExact(after.orders), encodeExact(preparedControl.orders));
  assert.equal(encodeExact(after.world.executions), encodeExact(state.world.executions));
  for (const before of state.stocks) {
    const actual = after.stocks.find(s => s.id === before.id);
    assert.equal(actual.lastPrice, before.lastPrice); assert.equal(encodeExact(actual.batches), encodeExact(before.batches));
  }
  const company = after.world.stocks.find(s => s.id === fixture.stockId);
  const beforeForecast = state.world.stocks.find(s => s.id === fixture.stockId).forecastQ;
  const change = company.forecastQ > beforeForecast ? company.forecastQ - beforeForecast : beforeForecast - company.forecastQ;
  assert.ok(change * 20n >= beforeForecast);
  assert.ok(after.world.majorStockIds.includes(fixture.stockId));
  assert.deepEqual(after.stocks.find(s => s.id === fixture.stockId).reports.at(-1).publishedAt, paused.clock);
  receiver.prepareNextBatch(); assert.equal(receiver.exportSnapshot().checksum, paused.checksum);
  const restored = createMarketCore(); assert.equal(restored.restoreSnapshot(paused).restored, true);
  restored.prepareNextBatch(); assert.equal(restored.exportSnapshot().checksum, paused.checksum, 'restored public preparation applied the report twice');
  const ending = p2Identity(); assert.equal(ending.economicSourceHash, manifest.economicSourceHash);
  assert.equal(ending.runnerSourceHash, manifest.runnerSourceHash);
  assert.equal(receiver.diagnosticsSummary().world.npcQuoteVersion, npcQuoteVersion);
  writeJson(`${out}/paused-snapshot.json`, paused);
  const result = { status: 'pass', scope: 'fixed-hidden-input-only', independentAcceptance: 'pending', naturalEconomicEvidence: false,
    npcQuoteVersion, economicSourceHash: manifest.economicSourceHash, economicSourceAtEnd: ending.economicSourceHash,
    runnerSourceHash: manifest.runnerSourceHash, runnerSourceAtEnd: ending.runnerSourceHash, initialChecksum: initial.checksum,
    baseChecksum: base.checksum, baseClock: base.clock, actualAdvanceBatchesToBase: tick(base.clock) - tick(initial.clock),
    inputChecksum: patched.checksum, patch: { field: `stocks[${fixture.stockId}].actualOperatingIndexQ`, before: previousIndex, after: fixedIndex },
    priorPublicProjectionUnchanged: true, pausedChecksum: paused.checksum, phase: paused.phase, clock: paused.clock,
    forecastBefore: beforeForecast, forecastAfter: company.forecastQ, npcClearingBatchesAfterBase: 0, balancesOrdersMatchUntradedControlPreparation: true, historicalPricesUnchanged: true,
    repeatedAndRestoredPreparationDuplicates: 0, fixtureStatement: fixture.scope };
  writeJson(`${out}/results.json`, result); console.log(JSON.stringify(result, (_key, v) => typeof v === 'bigint' ? v.toString() : v));
} catch (error) {
  process.exitCode = 1;
  writeJson(`${out}/failure.json`, { status: 'fail', scope: 'fixed-hidden-input-only', economicSourceHash: manifest?.economicSourceHash ?? null, message: error.message, stack: error.stack });
  console.error(error.message);
}
