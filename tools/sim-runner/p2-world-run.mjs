import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createMarketCore, RULES_VERSION, CONTENT_VERSION, INITIALIZATION_VERSION, decodeExact } from '../../packages/sim-core/src/index.ts';
import { EconomicMetrics, auditBatch } from './p2-metrics.mjs';
import { directory, sha, writeJson, p2Identity, tick } from './p2-runtime.mjs';

export function readBatchManifest(path) {
  const bytes = readFileSync(path);
  const manifest = decodeExact(bytes.toString('utf8'));
  const registered = JSON.parse(readFileSync('tests/scenarios/p0/seeds.json', 'utf8'));
  assert.equal(manifest.format, 'p2-batch-manifest-v1');
  assert.equal(manifest.rulesVersion, RULES_VERSION);
  assert.equal(manifest.contentVersion, CONTENT_VERSION);
  assert.equal(manifest.initializationVersion, INITIALIZATION_VERSION);
  assert.equal(manifest.seedSourceHash, sha(readFileSync(manifest.seedSource)));
  assert.equal(manifest.presetSourceHash, sha(readFileSync(manifest.presetSource)));
  assert.equal(manifest.warmupDays, 250);
  assert.equal(manifest.config.size, 'prototype'); assert.equal(manifest.config.mode, 'baseline'); assert.equal(manifest.config.playerCapital, 100_000_000n);
  assert.deepEqual(manifest.threshold, { stocksPerMarket: 20, requiredStocks: 18, tradedDayNumerator: 4, tradedDayDenominator: 5 });
  assert.ok(Array.isArray(manifest.seeds) && manifest.seeds.length > 0 && new Set(manifest.seeds).size === manifest.seeds.length);
  assert.ok(Array.isArray(manifest.longSeeds) && new Set(manifest.longSeeds).size === manifest.longSeeds.length && manifest.longSeeds.every(seed => manifest.seeds.includes(seed)));
  assert.ok(manifest.seeds.every(seed => Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffff_ffff));
  assert.ok(Number.isSafeInteger(manifest.playerDays) && manifest.playerDays > 0 && Number.isSafeInteger(manifest.longPlayerDays) && manifest.longPlayerDays >= manifest.playerDays);
  if (manifest.scope === 'stage-baseline') {
    assert.deepEqual(manifest.seeds, registered.groups.baseline, 'full stage requires all original100 seeds');
    assert.deepEqual(manifest.longSeeds, registered.groups.baselineLong, 'full stage requires the original10 extensions');
    assert.equal(manifest.playerDays, 250); assert.equal(manifest.longPlayerDays, 1000);
  } else { assert.equal(manifest.scope, 'diagnostic-only'); assert.ok(manifest.seeds.every(seed => registered.groups.baseline.includes(seed)), 'diagnostics use registered baseline seeds'); }
  return { manifest, manifestHash: sha(bytes) };
}

export function createAutonomousWorld(seed, playerCapital = 100_000_000n) {
  const core = createMarketCore();
  const result = core.createWorld({ rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, seed, size: 'prototype', mode: 'baseline', playerCapital });
  if ('reason' in result) throw new Error(`createWorld ${result.reason}: ${result.detail}`);
  assert.equal(typeof core.diagnosticsSummary, 'function', 'P2 production diagnosticsSummary is required');
  return core;
}
export function advanceTo(core, target, budget = 64) {
  while (true) {
    const result = core.advance({ stop: target, maxBatches: budget, pauseOnMajor: false });
    if (result.reason === 'target') return result;
    if (result.reason !== 'budget' || result.completedBatches === 0) throw new Error(`unexpected advance ${result.reason}`);
  }
}
export function warmupWorld(core) {
  advanceTo(core, { worldDay: 249, batch: 15 });
  const snapshot = core.exportSnapshot();
  assert.equal(snapshot.playerInjected, false);
  core.prepareNextBatch();
  const ready = core.exportSnapshot();
  assert.equal(ready.playerInjected, true); assert.deepEqual(ready.clock, { worldDay: 250, batch: 0 }); assert.equal(ready.phase, 'publicDecision');
  return { snapshot, ready };
}

export function runSeed(manifest, seed, out) {
  directory(out);
  const sourceAtStart = p2Identity();
  const started = performance.now();
  const checkpoints = [];
  let core, lastSummary, latestSnapshot, observedBatches = 0, result;
  const operationMs = { createWorld: 0, coreAdvance: 0, entryPrepare: 0, diagnostics: 0, audit: 0, metrics: 0, snapshotExport: 0, snapshotSerializeWrite: 0, walletSerializeWrite: 0, dailyWrite: 0, progressWrite: 0 };
  const measured = (name, run) => { const before = performance.now(); try { return run(); } finally { operationMs[name] += performance.now() - before; } };
  writeFileSync(`${out}/daily.jsonl`, '');
  const save = name => {
    const snapshot = measured('snapshotExport', () => core.exportSnapshot());
    measured('snapshotSerializeWrite', () => writeJson(`${out}/${name}-snapshot.json`, snapshot));
    lastSummary = measured('diagnostics', () => core.diagnosticsSummary());
    measured('walletSerializeWrite', () => writeJson(`${out}/${name}-wallets.json`, lastSummary.wallets));
    latestSnapshot = snapshot;
    checkpoints.push({ name, checksum: snapshot.checksum, clock: snapshot.clock, phase: snapshot.phase, playerInjected: snapshot.playerInjected, elapsedMs: performance.now() - started });
    return snapshot;
  };
  try {
    core = measured('createWorld', () => createAutonomousWorld(seed, manifest.config.playerCapital));
    save('initial');
    const initialCash = lastSummary.audit.initialCash;
    for (let at = 0; at < 4000; at++) {
      const reply = measured('coreAdvance', () => core.advance({ stop: 'batch', maxBatches: 1, pauseOnMajor: false }));
      assert.equal(reply.completedBatches, 1);
      lastSummary = measured('diagnostics', () => core.diagnosticsSummary()); measured('audit', () => auditBatch(lastSummary, at)); observedBatches++;
      assert.equal(lastSummary.world.playerInjected, false, 'capital appeared during warmup');
      if (observedBatches % 512 === 0) measured('progressWrite', () => writeJson(`${out}/progress.json`, { seed, stage: 'warmup', observedBatches, worldDay: lastSummary.clock.worldDay, elapsedMs: performance.now() - started, millisecondsPerBatch: (performance.now() - started) / observedBatches }));
    }
    const preheated = save('warmup');
    assert.deepEqual(preheated.clock, { worldDay: 249, batch: 15 }); assert.equal(preheated.phase, 'settled'); assert.equal(preheated.playerInjected, false);
    const warmupMs = performance.now() - started;
    measured('entryPrepare', () => core.prepareNextBatch());
    const ready = save('player-entry');
    assert.deepEqual(ready.clock, { worldDay: 250, batch: 0 }); assert.equal(ready.playerInjected, true);
    assert.equal(lastSummary.audit.initialCash, initialCash + manifest.config.playerCapital);
    const metrics = new EconomicMetrics(lastSummary.stocks);
    const days = manifest.longSeeds.includes(seed) ? manifest.longPlayerDays : manifest.playerDays;
    let baseline;
    for (let day = 0; day < days; day++) {
      for (let batch = 0; batch < 16; batch++) {
        const at = (250 + day) * 16 + batch;
        const reply = measured('coreAdvance', () => core.advance({ stop: 'batch', maxBatches: 1, pauseOnMajor: false }));
        assert.equal(reply.completedBatches, 1);
        lastSummary = measured('diagnostics', () => core.diagnosticsSummary()); measured('audit', () => auditBatch(lastSummary, at)); observedBatches++;
        assert.equal(lastSummary.world.playerInjected, true);
        assert.equal(lastSummary.audit.initialCash, initialCash + manifest.config.playerCapital);
        const daily = measured('metrics', () => metrics.record(lastSummary.latestBatch));
        if (daily) measured('dailyWrite', () => appendFileSync(`${out}/daily.jsonl`, JSON.stringify(daily) + '\n'));
      }
      if ((day + 1) % 64 === 0) measured('progressWrite', () => writeJson(`${out}/progress.json`, { seed, stage: 'player', playerDays: day + 1, observedBatches, elapsedMs: performance.now() - started, millisecondsPerBatch: (performance.now() - started) / observedBatches }));
      if (day + 1 === manifest.playerDays) { baseline = metrics.summary(); save('baseline-end'); }
    }
    const long = days > manifest.playerDays ? metrics.summary() : null;
    if (long) save('long-end');
    const final = latestSnapshot;
    assert.equal(tick(final.clock), (250 + days) * 16 - 1);
    result = { seed, status: baseline.status === 'pass' && (!long || long.status === 'pass') ? 'pass' : 'fail', scope: manifest.scope, initializationVersion: lastSummary.world.initializationVersion,
      configHash: final.configHash, baseline, long, audit: { observedBatches, warmupBatches: 4000, playerBatches: days * 16, cashViolations: 0, shareViolations: 0, negativeBalances: 0, frozenResourceViolations: 0, hourCapacityViolations: 0, unbalancedTrades: 0 },
      checkpoints, timing: { warmupMs, totalMs: performance.now() - started, operationMs }, finalChecksum: final.checksum,
      finalWallets: lastSummary.wallets, failureReasons: [...baseline.markets, ...(long?.markets ?? [])].filter(market => !market.passes).map(market => `${market.market}: ${market.qualifyingStocks}/20 meet ${market.minimumDays}/${market.days} days`) };
  } catch (error) {
    result = { seed, status: 'fail', scope: manifest.scope, observedBatches, checkpoints, error: { message: error.message, stack: error.stack }, timing: { totalMs: performance.now() - started, operationMs } };
    if (core) try { writeJson(`${out}/failure-snapshot.json`, core.exportSnapshot()); writeJson(`${out}/failure-diagnostics.json`, core.diagnosticsSummary()); } catch (saveError) { result.failureSaveError = saveError.message; }
  }
  const sourceAtEnd = p2Identity();
  result.economicSourceHash = sourceAtStart.economicSourceHash;
  result.runnerSourceHash = sourceAtStart.runnerSourceHash;
  result.economicSourceAtEnd = sourceAtEnd.economicSourceHash;
  if (sourceAtStart.economicSourceHash !== sourceAtEnd.economicSourceHash) { result.status = 'fail'; result.sourceChanged = true; }
  writeJson(`${out}/results.json`, result);
  writeFileSync(`${out}/summary.md`, `# P2 seed ${seed}\n\nStatus: ${result.status}; scope: ${manifest.scope}; independent acceptance: pending.\nEconomic source: ${result.economicSourceHash}\nObserved actual batches: ${result.audit?.observedBatches ?? observedBatches}\n${result.error?.message ?? result.failureReasons?.join('\n') ?? ''}\n`);
  return result;
}
