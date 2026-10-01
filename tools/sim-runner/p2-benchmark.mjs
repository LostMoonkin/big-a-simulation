import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createMarketCore, encodeExact } from '../../packages/sim-core/src/index.ts';
import { createAutonomousWorld } from './p2-world-run.mjs';
import { argumentsFor, outputPath, commandLine, p2Manifest, writeJson, p2Identity } from './p2-runtime.mjs';

const options = argumentsFor(process.argv.slice(2), ['profile', 'out']);
const profilePath = options.profile ?? 'tests/scenarios/p2/benchmark-profile.json';
const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
assert.equal(profile.format, 'p2-benchmark-v1'); assert.equal(profile.sampleDays, 5);
const out = outputPath(options, 'benchmark');
const manifest = p2Manifest(commandLine(), { profile: profilePath, seed: profile.seed });
const measure = operation => { const start = performance.now(); const result = operation(); return { milliseconds: performance.now() - start, result }; };
const samples = {};
let peakObservedRss = process.memoryUsage().rss;
const memory = () => { peakObservedRss = Math.max(peakObservedRss, process.memoryUsage().rss); };
const core = createAutonomousWorld(profile.seed);
const start = performance.now(); let batches = 0, calls = 0;
while (true) {
  const reply = core.advance({ stop: { worldDay: 249, batch: 15 }, maxBatches: profile.advanceBudget, pauseOnMajor: false });
  batches += reply.completedBatches; calls++; memory();
  if (reply.reason === 'target') break;
  assert.equal(reply.reason, 'budget'); assert.ok(reply.completedBatches > 0);
}
samples.warmup = { milliseconds: performance.now() - start, batches, calls };
assert.equal(batches, 4000); core.prepareNextBatch();
samples.days = [];
for (let i = 0; i < profile.sampleDays; i++) {
  const sample = measure(() => core.advance({ stop: 'day', maxBatches: 16, pauseOnMajor: false }));
  assert.equal(sample.result.reason, 'target'); assert.equal(sample.result.completedBatches, 16);
  samples.days.push(sample.milliseconds); memory();
}
samples.export = []; samples.restore = [];
let bytes = 0;
for (let i = 0; i < 5; i++) {
  const exported = measure(() => core.exportSnapshot());
  const snapshot = exported.result;
  bytes = Buffer.byteLength(encodeExact(snapshot), 'utf8');
  const receiver = createMarketCore(); const restored = measure(() => receiver.restoreSnapshot(snapshot));
  assert.equal(restored.result.restored, true); assert.equal(receiver.exportSnapshot().checksum, snapshot.checksum);
  samples.export.push(exported.milliseconds); samples.restore.push(restored.milliseconds); memory();
}
const before = core.exportSnapshot();
const cancelled = measure(() => core.advance({ stop: 'day', maxBatches: 16, pauseOnMajor: false, cancelRequested: true }));
assert.equal(cancelled.result.reason, 'cancelled'); assert.equal(cancelled.result.completedBatches, 0); assert.equal(core.exportSnapshot().checksum, before.checksum);
samples.coreCancellation = cancelled.milliseconds;
const summarize = array => ({ samples: array, maximum: Math.max(...array), p95: [...array].sort((a, b) => a - b)[Math.ceil(.95 * array.length) - 1] });
const ending = p2Identity();
const sourceStable = ending.economicSourceHash === manifest.economicSourceHash;
const result = { status: sourceStable ? 'pass' : 'fail', economicSourceHash: manifest.economicSourceHash, economicSourceAtEnd: ending.economicSourceHash, sourceStable,
  scope: profile.scope, independentAcceptance: 'pending', warmup: samples.warmup,
  dayMilliseconds: summarize(samples.days), exportMilliseconds: summarize(samples.export), restoreMilliseconds: summarize(samples.restore), coreCancellationMilliseconds: samples.coreCancellation,
  encodedSnapshotBytes: bytes, peakObservedNodeRssBytes: peakObservedRss,
  limitations: ['Five samples report all values and maximum; they do not estimate stable population tails.', 'Node RSS sampled at batch boundaries; not peak UI+Worker memory.', 'Core accepts an already received cancellation flag; actual in-flight browser cancellation belongs to browser evidence.', '40-stock timing does not sign P5 200-stock budgets.'] };
writeJson(`${out}/manifest.json`, manifest); writeJson(`${out}/results.json`, result);
writeFileSync(`${out}/summary.md`, `# P2 minimal Node measurements\n\n${profile.scope}\nWarmup: ${samples.warmup.milliseconds.toFixed(2)}ms /4000 batches.\nFive day samples: ${samples.days.join(', ')}ms.\nSnapshot: ${bytes} bytes.\nObserved Node RSS: ${peakObservedRss} bytes.\n${result.limitations.join('\n')}\n`);
console.log(JSON.stringify({ status: result.status, warmupMs: samples.warmup.milliseconds, dayMs: samples.days, snapshotBytes: bytes, out }));
if (!sourceStable) process.exitCode = 1;
