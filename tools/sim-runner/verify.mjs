import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { decodeExact, encodeExact } from '../../packages/sim-core/src/index.ts';
import { runReplay } from './replay.ts';
import { checkAuctions } from './auction-check.mjs';
import { checkFixed, checkFundedRandom, checkBoundaries, checkResume, checkGolden } from './checks.mjs';
import { parseArgs, outputDir, manifest, commandLine, writeJson, sourceIdentity } from './runtime.mjs';
import { checkCli } from './cli-check.mjs';

const options=parseArgs(process.argv.slice(2));const out=outputDir(options,'node');const results=[];
let failure;
const groups={
  'auction-reference':()=>checkAuctions(out),
  'fixed-core-replays':()=>checkFixed(out),
  'funded-random-core':()=>checkFundedRandom(out),
  'command-and-snapshot-boundaries':()=>checkBoundaries(out),
  'resume-and-granularity':()=>checkResume(),
  'recorded-node-golden':()=>checkGolden(),
  'saved-snapshot-replays':()=>{
    const rows=[];
    for(const name of ['a09-reserved','a12-public-decision','a06-after-buy','protection-a-empty-pending']){
      const f=decodeExact(readFileSync(`tests/replays/${name}.json`,'utf8')),actual=runReplay(f.input,f.commands);
      assert.equal(actual.finalSnapshot.checksum,f.expectedChecksum);rows.push({id:f.id,checksum:actual.finalSnapshot.checksum});
    }return rows;
  },
  'cli-success-and-failure':()=>checkCli(out),
  'actual-browser-evidence':()=>{
    const evidence=JSON.parse(readFileSync('docs/verification/fixtures/p1-browser.json','utf8'));
    assert.equal(evidence.sourceHash,sourceIdentity().sourceHash,'required browser evidence belongs to a different source; run and record the browser probe');
    assert.equal(evidence.status,'pass');assert.equal(evidence.environments.length,2);
    for(const environment of evidence.environments){assert.equal(environment.status,'pass');assert.equal(environment.checks.length,8);assert.ok(environment.checks.every(c=>c.status==='pass'));}
    assert.deepEqual(evidence.nodeGolden,checkGolden().rows);
    return {status:'pass',sourceHash:evidence.sourceHash,environments:evidence.environments.map(e=>({url:e.url,browserVersion:e.browserVersion,checks:e.checks.length})),scope:'Recorded actual Chrome dev/static Worker runs. This does not rerun a browser or grant independent acceptance.'};
  },
};
try{
  for(const [id,run]of Object.entries(groups)){const data=run();results.push({id,status:'pass',data});console.log(`PASS ${id}`);}
}catch(error){failure={message:error.message,stack:error.stack};results.push({id:Object.keys(groups)[results.length],status:'fail',error:failure});process.exitCode=1;}
const status=failure?'fail':'pass';const runManifest=manifest(commandLine(),{seeds:'tests/scenarios/p1/random-seeds.json',fixed:'tests/scenarios/p1/cases.json',golden:'tests/replays/p1-golden.json'});
writeJson(`${out}/manifest.json`,runManifest);writeJson(`${out}/results.json`,{status,independentAcceptance:'pending',results});
writeFileSync(`${out}/summary.md`,`# P1 Node verification\n\nStatus: ${status}; independent acceptance: pending.\nSource hash: ${runManifest.sourceHash}\nNode: ${process.version}\n\n${results.map(r=>`- ${r.id}: ${r.status}`).join('\n')}\n\n${failure?failure.message:'27 funded fixed scenarios; 2000 registered seeds × 3 actual core variants; exact snapshot and complete replay goldens.'}\n`);
if(failure){writeJson(`${out}/failure.json`,failure);console.error(failure.message);}else console.log(JSON.stringify({status,groups:results.length,sourceHash:runManifest.sourceHash,out}));
