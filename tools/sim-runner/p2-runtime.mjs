import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { RULES_VERSION, CONTENT_VERSION, MATH_VERSION, SNAPSHOT_VERSION, encodeExact } from '../../packages/sim-core/src/index.ts';

export const sha = value => createHash('sha256').update(value).digest('hex');
export const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? { $bigint: v.toString() } : v, 2) + '\n');
/** Evidence includes measured fractional milliseconds and ratios; unlike a core
 * snapshot it may contain finite fractional numbers. Preserve exact money tags. */
export function readEvidence(path) { return JSON.parse(readFileSync(path, 'utf8'), (_key, value) => value && typeof value === 'object' && Object.keys(value).length === 1 && typeof value.$bigint === 'string' && /^-?(0|[1-9][0-9]*)$/.test(value.$bigint) ? BigInt(value.$bigint) : value); }
export function argumentsFor(args, allowed) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!key.startsWith('--') || !allowed.includes(key.slice(2)) || i + 1 === args.length || args[i + 1].startsWith('--')) throw new Error(`expected --option value; invalid option ${key}`);
    if (key.slice(2) in options) throw new Error(`duplicate option ${key}`);
    options[key.slice(2)] = args[++i];
  }
  return options;
}
export function integerOption(value, fallback, low, high, name) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < low || number > high) throw new Error(`${name} must be an integer in ${low}..${high}`);
  return number;
}
export function directory(path) { const result = resolve(path); mkdirSync(result, { recursive: true }); return result; }
export function outputPath(options, name) { return directory(options.out ?? `artifacts/verification/p2/${name}-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`); }
function walk(path) {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap(name => walk(`${path}/${name}`));
}
export function identity(paths) {
  const files = [...new Set(paths.flatMap(walk))].sort().map(path => ({ path, sha256: sha(readFileSync(path)) }));
  return { sourceHash: sha(files.map(file => `${file.path}\0${file.sha256}\n`).join('')), files };
}
export function p2Identity() {
  const economy = identity(['packages/sim-core/src', 'docs/design/market-model-rules.md', 'docs/design/market-identities.md', 'tests/scenarios/p0/baseline-v1.json']);
  const runner = identity(['tools/sim-runner', 'tests/scenarios/p2', 'package.json', 'package-lock.json']);
  return { economicSourceHash: economy.sourceHash, economicFiles: economy.files, runnerSourceHash: runner.sourceHash, runnerFiles: runner.files,
    sourceHash: sha(`${economy.sourceHash}\n${runner.sourceHash}\n`) };
}
export function p2Manifest(command, inputs = {}) {
  let headAtExecution = null;
  try { headAtExecution = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(); } catch {}
  return { format: 'p2-verification-v1', stage: 'P2', independentAcceptance: 'pending', recordedAt: new Date().toISOString(), headAtExecution,
    ...p2Identity(), rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, mathVersion: MATH_VERSION, rngVersion: 'rng-v1', schemaVersion: SNAPSHOT_VERSION,
    baselinePresetHash: sha(readFileSync('tests/scenarios/p0/baseline-v1.json')), seedListHash: sha(readFileSync('tests/scenarios/p0/seeds.json')),
    environment: { node: process.version, platform: process.platform, architecture: process.arch, os: os.version(), cpu: os.cpus()[0]?.model.trim(), logicalProcessors: os.cpus().length, memoryBytes: os.totalmem() }, command, inputs };
}
export const tick = clock => clock.worldDay * 16 + clock.batch;
export const clockAt = tick => ({ worldDay: Math.floor(tick / 16), batch: tick % 16 });
export const canonicalHash = value => sha(encodeExact(value));
export const commandLine = () => `node ${process.argv.slice(1).map(value => value.includes(' ') ? JSON.stringify(value) : value).join(' ')}`;
