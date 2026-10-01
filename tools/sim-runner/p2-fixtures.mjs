import { readFileSync } from 'node:fs';
import { INITIALIZATION_VERSION } from '../../packages/sim-core/src/index.ts';
import { directory, sha, writeJson } from './p2-runtime.mjs';

const input = readFileSync('tests/scenarios/p0/seeds.json');
const seeds = JSON.parse(input);
const preset = readFileSync('tests/scenarios/p0/baseline-v1.json');
directory('tests/scenarios/p2');
const common = { format: 'p2-batch-manifest-v1', rulesVersion: '0.3.1', contentVersion: '0.3.1', mathVersion: 'fixed-q9-v1', rngVersion: 'rng-v1', schemaVersion: 1,
  initializationVersion: INITIALIZATION_VERSION,
  seedSource: 'tests/scenarios/p0/seeds.json', seedSourceHash: sha(input), presetSource: 'tests/scenarios/p0/baseline-v1.json', presetSourceHash: sha(preset),
  config: { size: 'prototype', mode: 'baseline', playerCapital: { $bigint: '100000000' } }, warmupDays: 250,
  threshold: { stocksPerMarket: 20, requiredStocks: 18, tradedDayNumerator: 4, tradedDayDenominator: 5 },
  selection: 'P0 seed-manifest-v1; registered before observing autonomous market output; no player orders' };
writeJson('tests/scenarios/p2/baseline-manifest.json', { ...common, scope: 'stage-baseline', seeds: seeds.groups.baseline, longSeeds: seeds.groups.baselineLong, playerDays: 250, longPlayerDays: 1000 });
writeJson('tests/scenarios/p2/diagnostic-manifest.json', { ...common, scope: 'diagnostic-only', seeds: seeds.groups.baseline.slice(0, 2), longSeeds: [], playerDays: 5, longPlayerDays: 5 });
writeJson('tests/scenarios/p2/behavior.json', { format: 'p2-behavior-v1', seed: seeds.groups.baseline[0], playerCapital: { $bigint: '100000000' }, warmupDays: 250, restoreDays: 20,
  stockId: 'A001', secondMarketStockId: 'B001', reviewContracts: ['A16', 'A17', 'BASELINE-STYLE-01', 'SNAP-PUBLIC-01', 'SNAP-SETTLED-01'],
  scope: 'Deterministic autonomous world checks. Player commands use production API; no synthesized NPC order fixtures.' });
writeJson('tests/scenarios/p2/benchmark-profile.json', { format: 'p2-benchmark-v1', seed: seeds.groups.customWarmup[0], sampleDays: 5, advanceBudget: 64,
  scope: 'One40-stock Node world: actual warmup/day/export/restore/core cancellation diagnostics; no P5 browser, UI latency or memory acceptance.' });
console.log('Registered P2 baseline100 + its original 10 long extensions, two diagnostic seeds, and autonomous behavior input.');
