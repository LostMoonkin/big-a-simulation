import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { goldenRows } from './checks.mjs';
import { sourceIdentity, writeJson, sha, localPath, commandLine } from './runtime.mjs';

const paths=process.argv.slice(2);assert.equal(paths.length,2,'provide actual dev and static browser results.json paths');
const identity=sourceIdentity();
const environments=paths.map(path=>{
  const text=readFileSync(path,'utf8'),result=JSON.parse(text),run=JSON.parse(readFileSync(resolve(dirname(path),'manifest.json'),'utf8'));
  assert.equal(result.status,'pass');assert.equal(run.sourceHash,identity.sourceHash);assert.equal(result.checks.length,8);assert.ok(result.checks.every(c=>c.status==='pass'));
  return {status:result.status,url:result.url,browserVersion:result.browserVersion,browserExecutable:result.browserExecutable,runtime:result.runtime,nodeVersion:result.nodeVersion,recordedAt:result.recordedAt,actualCommand:run.command,checks:result.checks,resultsPath:localPath(path),resultsSha256:sha(text),screenshot:localPath(resolve(dirname(path),'worker-replay.png'))};
});
writeJson('docs/verification/fixtures/p1-browser.json',{format:'p1-browser-evidence-v1',status:'pass',independentAcceptance:'pending',sourceHash:identity.sourceHash,recordCommand:commandLine(),comparison:'Actual DedicatedWorker production-core outputs equal freshly executed Node full canonical replays; also match frozen hashes',nodeGolden:goldenRows(),environments});
console.log(JSON.stringify({recorded:environments.length,sourceHash:identity.sourceHash,scope:'implementation actual browser evidence'}));
