import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createMarketCore, decodeExact } from '../../packages/sim-core/src/index.ts';
import { argumentsFor, integerOption, outputPath, p2Manifest, commandLine, writeJson, tick, clockAt, sha, p2Identity } from './p2-runtime.mjs';

const options = argumentsFor(process.argv.slice(2), ['input', 'days', 'out']);
const out = outputPath(options, 'golden');
let core, manifest;
try {
  if (!options.input) throw new Error('--input <complete snapshot.json> is required');
  const bytes = readFileSync(options.input);
  const snapshot = decodeExact(bytes.toString('utf8'));
  core = createMarketCore();
  const restored = core.restoreSnapshot(snapshot);
  if (!restored.restored) throw new Error(`restore ${restored.reason}: ${restored.detail}`);
  const days = integerOption(options.days, 20, 1, 1000, 'days');
  const initial = core.exportSnapshot();
  const inputWorld = core.diagnosticsSummary().world;
  const privateQuoteVersion = decodeExact(initial.payload).world.npcQuoteVersion;
  assert.equal(initial.checksum, snapshot.checksum);
  assert.equal(initial.payload, snapshot.payload, 'restore or query changed the input canonical state');
  assert.equal(inputWorld.npcQuoteVersion, privateQuoteVersion ?? 'npc-quote-v1');
  manifest = p2Manifest(commandLine(), { input: options.input, inputSha256: sha(bytes), days, configHash: initial.configHash, seed: initial.seed, initializationVersion: inputWorld.initializationVersion,
    npcQuoteVersion: inputWorld.npcQuoteVersion, inputHasExplicitNpcQuoteVersion: privateQuoteVersion !== undefined });
  writeJson(`${out}/manifest.json`, manifest);
  // Continue exactly days*16 real batches, including the current prepared batch.
  const target = clockAt(tick(initial.clock) + days * 16 - (initial.phase === 'publicDecision' ? 1 : 0));
  let batches = 0;
  while (true) {
    const reply = core.advance({ stop: target, maxBatches: 64, pauseOnMajor: false });
    batches += reply.completedBatches;
    if (reply.reason === 'target') break;
    if (reply.reason !== 'budget' || reply.completedBatches === 0) throw new Error(`unexpected continuation stop ${reply.reason}`);
  }
  const final = core.exportSnapshot();
  const ending = p2Identity();
  const result = { status: 'pass', initialChecksum: initial.checksum, finalChecksum: final.checksum, phase: final.phase, clock: final.clock, targetClock: target, days, completedBatches: batches,
    npcQuoteVersion: inputWorld.npcQuoteVersion, inputCanonicalStatePreserved: true, economicSourceHash: manifest.economicSourceHash, economicSourceAtEnd: ending.economicSourceHash,
    runnerSourceHash: manifest.runnerSourceHash, runnerSourceAtEnd: ending.runnerSourceHash };
  if (batches !== days * 16 || final.phase !== 'settled') throw new Error('golden did not complete the requested real batches');
  if (ending.economicSourceHash !== manifest.economicSourceHash) throw new Error('economic source changed during continuation; preserve this run and rerun the affected evidence');
  if (ending.runnerSourceHash !== manifest.runnerSourceHash) throw new Error('runner source changed during continuation; preserve this run and rerun the affected evidence');
  assert.equal(core.diagnosticsSummary().world.npcQuoteVersion, inputWorld.npcQuoteVersion);
  assert.equal(decodeExact(final.payload).world.npcQuoteVersion, privateQuoteVersion, 'continuation changed the snapshot quote version');
  writeJson(`${out}/results.json`, result);
  writeJson(`${out}/final-snapshot.json`, final);
  writeFileSync(`${out}/summary.md`, `# P2 Node continuation\n\n${days} days (${batches} actual batches) resumed from a complete snapshot using the production core.\nInitial: ${result.initialChecksum}\nFinal: ${result.finalChecksum}\nEconomic source: ${manifest.economicSourceHash}\nIndependent acceptance: pending.\n`);
  console.log(JSON.stringify({ ...result, sourceHash: manifest.sourceHash, economicSourceHash: manifest.economicSourceHash, out }));
} catch (error) {
  process.exitCode = 1;
  writeJson(`${out}/failure.json`, { status: 'fail', economicSourceHash: manifest?.economicSourceHash ?? null, message: error.message, stack: error.stack });
  console.error(error.message);
}
