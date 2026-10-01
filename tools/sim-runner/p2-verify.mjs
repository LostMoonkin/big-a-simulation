import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { decodeExact } from '../../packages/sim-core/src/index.ts';
import { argumentsFor, outputPath, p2Manifest, commandLine, writeJson, p2Identity, sha, readEvidence } from './p2-runtime.mjs';
import { readBatchManifest } from './p2-world-run.mjs';
import { checkMetricGate, checkWorldInitialization, checkWorldBehavior, checkBaselinePreset } from './p2-checks.mjs';
import { sourceIdentity } from './runtime.mjs';

const options = argumentsFor(process.argv.slice(2), ['seed-manifest', 'batch-results', 'browser-results', 'benchmark-results', 'p1-results', 'out']);
const out = outputPath(options, 'verify');
const inputs = {
  seedManifest: options['seed-manifest'] ?? 'tests/scenarios/p2/baseline-manifest.json',
  batchResults: options['batch-results'] ?? 'artifacts/verification/p2/baseline-final/results.json',
  browserResults: options['browser-results'] ?? 'docs/verification/fixtures/p2-browser.json',
  benchmarkResults: options['benchmark-results'] ?? 'artifacts/verification/p2/benchmark-final/results.json',
  p1Results: options['p1-results'] ?? 'artifacts/verification/p2/p1-regression/results.json',
};
const manifest = p2Manifest(commandLine(), inputs);
const groups = [];
const load = readEvidence;
function group(id, run) {
  try { const data = run(); groups.push({ id, status: 'pass', data }); console.log(`PASS ${id}`); }
  catch (error) { const status = error.code === 'ENOENT' ? 'not_run' : 'fail'; groups.push({ id, status, message: error.message, stack: error.stack }); console.log(`${status.toUpperCase()} ${id}: ${error.message}`); }
}

group('statistics-hard-gate', checkMetricGate);
group('generated-world-and-public-boundary', checkWorldInitialization);
group('actual-baseline-parameters', checkBaselinePreset);
group('zero-ADV-fee-cycle-entry-and20-day-resume', () => checkWorldBehavior(out));
group('all-registered-autonomous-seeds', () => {
  const { manifest: protocol, manifestHash } = readBatchManifest(inputs.seedManifest);
  assert.equal(protocol.scope, 'stage-baseline');
  const data = load(inputs.batchResults);
  assert.equal(data.status, 'pass'); assert.equal(data.scope, 'stage-baseline');
  assert.equal(data.economicSourceHash, manifest.economicSourceHash); assert.equal(data.economicSourceAtEnd, manifest.economicSourceHash);
  assert.equal(data.seedManifestHash, manifestHash);
  assert.equal(data.completedSeeds, 100); assert.equal(data.completedLongSeeds, 10); assert.equal(data.failedSeeds.length, 0);
  assert.equal(data.observedBatches, 920000); //100*(250+250)*16 +10*750*16.
  assert.deepEqual(data.seeds.map(seed => seed.seed), protocol.seeds);
  const base = dirname(resolve(inputs.batchResults));
  for (const seed of data.seeds) {
    assert.equal(seed.status, 'pass'); assert.equal(seed.economicSourceHash, manifest.economicSourceHash); assert.equal(seed.economicSourceAtEnd, manifest.economicSourceHash);
    const isLong = protocol.longSeeds.includes(seed.seed); const totalDays = isLong ? 1000 : 250;
    assert.equal(seed.audit.observedBatches, 4000 + totalDays * 16);
    for (const name of ['cashViolations', 'shareViolations', 'negativeBalances', 'frozenResourceViolations', 'hourCapacityViolations', 'unbalancedTrades']) assert.equal(seed.audit[name], 0);
    const dailyPath = `${base}/seeds/${seed.seed}/daily.jsonl`;
    const rows = readFileSync(dailyPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(rows.length, totalDays);
    for (let i = 0; i < rows.length; i++) { assert.equal(rows[i].worldDay, 250 + i); assert.equal(rows[i].playerDay, i + 1); }
    for (const report of [seed.baseline, ...(isLong ? [seed.long] : [])]) {
      assert.equal(report.warmupIncluded, false); assert.equal(report.stocks.length, 40);
      assert.equal(report.playerDays, report === seed.baseline ? 250 : 1000);
      const requiredDays = report.playerDays * 4 / 5;
      for (const stock of report.stocks) {
        const counted = rows.slice(0, report.playerDays).filter(day => day.quantities[stock.id] > 0).length;
        assert.equal(stock.tradedDays, counted); assert.equal(stock.passes, counted >= requiredDays);
        assert.equal(stock.minimumDays, requiredDays);
      }
      for (const market of ['A', 'B']) {
        const members = report.stocks.filter(stock => stock.market === market);
        assert.equal(members.length, 20);
        const qualifying = members.filter(stock => stock.tradedDays >= requiredDays).length;
        assert.ok(qualifying >= 18, `${seed.seed}/${market}: ${qualifying}/20`);
        assert.equal(report.markets.find(row => row.market === market).qualifyingStocks, qualifying);
      }
    }
  }
  return { economicSourceHash: data.economicSourceHash, batchResultsHash: sha(readFileSync(inputs.batchResults)), seeds: 100, longExtensions: 10, actualBatchesAudited: data.observedBatches,
    perSeedPerMarketRows: data.baselineMarkets.length, longPerSeedPerMarketRows: data.longMarkets.length, worstQualifiedStocks: Math.min(...data.baselineMarkets.map(row => row.qualifyingStocks), ...data.longMarkets.map(row => row.qualifyingStocks)),
    longestAllMarketZeroDays: Math.max(...data.baselineMarkets.map(row => row.longestAllZeroDays), ...data.longMarkets.map(row => row.longestAllZeroDays)), scope: 'Each registered seed checked individually; daily actual quantities independently recounted. No warmup denominator.' };
});
group('P1-complete-regression', () => {
  const data = load(inputs.p1Results); const priorManifest = load(`${dirname(resolve(inputs.p1Results))}/manifest.json`);
  assert.equal(data.status, 'pass'); assert.equal(data.results.length, 9); assert.ok(data.results.every(row => row.status === 'pass'));
  assert.equal(priorManifest.sourceHash, sourceIdentity().sourceHash, 'P1 regression source/actual browser evidence is stale');
  return { status: 'pass', resultsHash: sha(readFileSync(inputs.p1Results)), sourceHash: priorManifest.sourceHash, groups: data.results.length, goldenRerecorded: false };
});
group('actual-Windows-Chrome60-day-UI', () => {
  const data = load(inputs.browserResults);
  assert.equal(data.status, 'pass'); assert.equal(data.economicSourceHash, manifest.economicSourceHash, 'browser tested a different economic core');
  assert.ok(Array.isArray(data.checks) && data.checks.length > 0 && data.checks.every(check => check.status === 'pass'));
  const coverage = new Set(data.checks.flatMap(check => check.ac ?? [check.id]));
  for (const ac of ['P2-AC4', 'P2-AC5', 'P2-AC6', 'P2-AC7', 'P2-AC8']) assert.ok(coverage.has(ac), `browser missing ${ac}`);
  assert.ok(data.environment?.browserVersion && data.environment?.os, 'actual browser/OS version missing');
  return { evidenceHash: sha(readFileSync(inputs.browserResults)), economicSourceHash: data.economicSourceHash, browserSourceHash: data.browserSourceHash ?? data.sourceHash,
    environment: data.environment, checks: data.checks.length, acceptance: [...coverage], scope: 'Recorded actual Chrome operations, not a simulated Worker or fabricated UI fixture.' };
});
group('minimal-Node-measurements', () => {
  const data = load(inputs.benchmarkResults); const measuredManifest = load(`${dirname(resolve(inputs.benchmarkResults))}/manifest.json`);
  assert.equal(data.status, 'pass'); assert.equal(measuredManifest.economicSourceHash, manifest.economicSourceHash);
  assert.equal(data.economicSourceAtEnd, measuredManifest.economicSourceHash);
  assert.equal(data.warmup.batches, 4000); assert.equal(data.dayMilliseconds.samples.length, 5);
  assert.ok(data.encodedSnapshotBytes > 0 && data.encodedSnapshotBytes <= 64 * 1024 * 1024);
  return { resultsHash: sha(readFileSync(inputs.benchmarkResults)), data, scope: 'Measured40-stock Node timings; no P5 browser budget acceptance.' };
});
const finalIdentity = p2Identity();
if (finalIdentity.economicSourceHash !== manifest.economicSourceHash) groups.push({ id: 'economic-source-stability', status: 'fail', message: 'production source changed during verification' });
const status = groups.every(group => group.status === 'pass') ? 'pass' : 'fail';
const results = { status, independentAcceptance: 'pending', sourceHash: manifest.sourceHash, economicSourceHash: manifest.economicSourceHash, groups };
writeJson(`${out}/manifest.json`, manifest); writeJson(`${out}/results.json`, results);
writeFileSync(`${out}/summary.md`, `# P2 implementation verification\n\nStatus: ${status}; independent acceptance: pending.\nEconomic source: ${manifest.economicSourceHash}\n${groups.map(group => `- ${group.id}: ${group.status}${group.message ? ` — ${group.message}` : ''}`).join('\n')}\n\nThis gathers actual world, economic and recorded browser evidence. It does not grant independent stage acceptance or P3–P5 qualification.\n`);
console.log(JSON.stringify({ status, groups: groups.length, economicSourceHash: manifest.economicSourceHash, out }));
if (status !== 'pass') process.exitCode = 1;
