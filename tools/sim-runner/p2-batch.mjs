import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { argumentsFor, integerOption, outputPath, p2Manifest, commandLine, writeJson, p2Identity, readEvidence } from './p2-runtime.mjs';
import { readBatchManifest } from './p2-world-run.mjs';

const options = argumentsFor(process.argv.slice(2), ['manifest', 'out', 'jobs', 'resume']);
const out = outputPath(options, 'batch');
const input = options.manifest ?? 'tests/scenarios/p2/baseline-manifest.json';
const jobs = integerOption(options.jobs, 4, 1, 8, 'jobs');
if (options.resume !== undefined && !['yes', 'no'].includes(options.resume)) throw new Error('--resume must be yes or no');
const { manifest: protocol, manifestHash } = readBatchManifest(input);
const manifest = p2Manifest(commandLine(), { batchManifest: input, batchManifestHash: manifestHash, scope: protocol.scope, seeds: protocol.seeds, longSeeds: protocol.longSeeds,
  warmupDays: 250, playerDays: protocol.playerDays, longPlayerDays: protocol.longPlayerDays, jobs });
if (existsSync(`${out}/manifest.json`)) {
  const prior = readEvidence(`${out}/manifest.json`);
  assert.equal(prior.economicSourceHash, manifest.economicSourceHash, 'economic source changed: preserve this run and choose a new output directory');
  assert.equal(prior.inputs.batchManifestHash, manifestHash, 'seed protocol changed: preserve this run and choose a new output directory');
  assert.equal(options.resume, 'yes', 'output already contains a run; use --resume yes for the same frozen source/protocol');
  writeJson(`${out}/resume-manifest-${Date.now()}.json`, manifest);
} else {
writeJson(`${out}/manifest.json`, manifest);
writeJson(`${out}/batch-manifest.json`, protocol);
}
const started = performance.now();
const results = [];
let next = 0;

function completedResult(seed) {
  const path = `${out}/seeds/${seed}/results.json`;
  if (!existsSync(path)) return null;
  const result = JSON.parse(readFileSync(path, 'utf8'));
  if (result.seed !== seed || result.economicSourceHash !== manifest.economicSourceHash || result.sourceChanged) return null;
  // A completed failed audit must remain a failure when resuming the run.
  if (result.status === 'fail' && result.error) return result;
  if (result.baseline?.playerDays !== protocol.playerDays || Boolean(result.long) !== protocol.longSeeds.includes(seed)) return null;
  if (result.long && result.long.playerDays !== protocol.longPlayerDays) return null;
  return result;
}
async function worker() {
  while (next < protocol.seeds.length) {
    const index = next++;
    const seed = protocol.seeds[index];
    if (options.resume === 'yes') {
      const prior = completedResult(seed);
      if (prior) { results.push(prior); console.log(`Reused ${seed}: ${prior.status} (same economic source; observed runner ${prior.runnerSourceHash})`); continue; }
    }
    const args = ['tools/sim-runner/p2-seed.mjs', '--manifest', resolve(input), '--seed', String(seed), '--out', `${out}/seeds/${seed}`];
    await new Promise(resolvePromise => {
      const child = spawn(process.execPath, args, { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', bytes => { stderr += bytes.toString(); });
      child.stdout.on('data', bytes => { process.stdout.write(bytes); });
      child.on('error', error => { stderr += error.message; });
      child.on('close', code => {
        const path = `${out}/seeds/${seed}/results.json`;
        let result;
        try { result = JSON.parse(readFileSync(path, 'utf8')); } catch { result = { seed, status: 'fail', error: { message: stderr || `seed subprocess ended ${code} without results` } }; }
        if (result.economicSourceHash !== manifest.economicSourceHash || result.sourceChanged || code !== 0) result.status = 'fail';
        if (stderr) result.subprocessStderr = stderr;
        results.push(result);
        writeJson(`${out}/progress.json`, { status: 'running', completed: results.length, expected: protocol.seeds.length, passed: results.filter(row => row.status === 'pass').length, failed: results.filter(row => row.status !== 'pass').length, elapsedMs: performance.now() - started });
        resolvePromise();
      });
    });
  }
}
await Promise.all(Array.from({ length: Math.min(jobs, protocol.seeds.length) }, () => worker()));
results.sort((a, b) => protocol.seeds.indexOf(a.seed) - protocol.seeds.indexOf(b.seed));
const ending = p2Identity();
const sourceStable = ending.economicSourceHash === manifest.economicSourceHash;
const baselineMarkets = results.flatMap(row => row.baseline?.markets.map(market => ({ seed: row.seed, ...market })) ?? []);
const longMarkets = results.flatMap(row => row.long?.markets.map(market => ({ seed: row.seed, ...market })) ?? []);
const result = { status: sourceStable && results.length === protocol.seeds.length && results.every(row => row.status === 'pass') ? 'pass' : 'fail', scope: protocol.scope, independentAcceptance: 'pending',
  economicSourceHash: manifest.economicSourceHash, economicSourceAtEnd: ending.economicSourceHash, runnerSourceHash: manifest.runnerSourceHash, runnerSourceAtEnd: ending.runnerSourceHash,
  seedManifestHash: manifestHash, expectedSeeds: protocol.seeds.length, expectedLongSeeds: protocol.longSeeds.length,
  completedSeeds: results.length, completedLongSeeds: results.filter(row => row.long).length, passedSeeds: results.filter(row => row.status === 'pass').length,
  failedSeeds: results.filter(row => row.status !== 'pass').map(row => ({ seed: row.seed, reasons: row.failureReasons ?? [row.error?.message ?? 'source or subprocess failure'] })),
  sourceStable, baselineMarkets, longMarkets, observedBatches: results.reduce((total, row) => total + (row.audit?.observedBatches ?? row.observedBatches ?? 0), 0),
  totalMs: performance.now() - started, seeds: results };
assert.equal(new Set(results.map(row => row.seed)).size, protocol.seeds.length, 'not every registered seed produced a result');
writeJson(`${out}/results.json`, result);
writeJson(`${out}/progress.json`, { status: result.status, completed: results.length, expected: protocol.seeds.length, passed: result.passedSeeds, failed: result.failedSeeds.length, elapsedMs: result.totalMs });
const worst = [...baselineMarkets, ...longMarkets].sort((a, b) => a.qualifyingStocks - b.qualifyingStocks || b.longestAllZeroDays - a.longestAllZeroDays).slice(0, 10);
writeFileSync(`${out}/summary.md`, `# P2 autonomous baseline\n\nStatus: ${result.status}; scope: ${protocol.scope}; independent acceptance: pending.\nEconomic source: ${manifest.economicSourceHash}\nAll registered seeds: ${results.length}/${protocol.seeds.length}; long extensions: ${result.completedLongSeeds}/${protocol.longSeeds.length}.\n250 warmup days are excluded from every liquidity denominator. Player holds cash throughout.\nActual observed batches: ${result.observedBatches}; elapsed ${result.totalMs.toFixed(1)}ms.\n\nWorst seed/market rows:\n${worst.map(row => `- ${row.seed}/${row.market}/${row.days} days: ${row.qualifyingStocks}/20 qualifying; longest whole-market zero streak ${row.longestAllZeroDays}; median daily market turnover ${row.medianMarketDailyTurnover}`).join('\n')}\n\nFailures:\n${result.failedSeeds.map(row => `- ${row.seed}: ${row.reasons.join('; ')}`).join('\n') || 'None.'}\n`);
console.log(JSON.stringify({ status: result.status, scope: result.scope, seeds: result.completedSeeds, longSeeds: result.completedLongSeeds, observedBatches: result.observedBatches, elapsedMs: result.totalMs, economicSourceHash: result.economicSourceHash, out }));
if (result.status !== 'pass') process.exitCode = 1;
