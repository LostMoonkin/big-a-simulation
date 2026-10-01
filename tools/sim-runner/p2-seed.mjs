import { argumentsFor, integerOption } from './p2-runtime.mjs';
import { readBatchManifest, runSeed } from './p2-world-run.mjs';

const options = argumentsFor(process.argv.slice(2), ['manifest', 'seed', 'out']);
if (!options.manifest || !options.out) throw new Error('--manifest and --out are required');
const { manifest } = readBatchManifest(options.manifest);
const seed = integerOption(options.seed, undefined, 0, 0xffff_ffff, 'seed');
if (!manifest.seeds.includes(seed)) throw new Error('seed is outside the registered manifest');
const result = runSeed(manifest, seed, options.out);
console.log(JSON.stringify({ seed, status: result.status, elapsedMs: result.timing.totalMs, reason: result.error?.message ?? result.failureReasons?.join('; ') ?? null }));
if (result.status !== 'pass') process.exitCode = 1;
