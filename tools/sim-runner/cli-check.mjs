import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fixtures } from './checks.mjs';
import { runReplay } from './replay.ts';
import { encodeExact } from '../../packages/sim-core/src/index.ts';

export function checkCli(out){
  const rows=[];
  for(const id of ['A01','A05','A07','A06','A12','A14']){
    const path=resolve(out,`cli-${id}`);const command=['tools/sim-runner/cli.mjs','--input','tests/scenarios/p1/cases.json','--case',id,'--out',path];
    const result=spawnSync(process.execPath,command,{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);
    const snapshot=JSON.parse(readFileSync(`${path}/final-snapshot.json`,'utf8'));const expected=fixtures().find(f=>f.id===id);
    assert.equal(snapshot.checksum,runReplay(expected.input,expected.commands).finalSnapshot.checksum);rows.push({id,status:'pass',checksum:snapshot.checksum});
  }
  const resumeOut=resolve(out,'cli-saved');const resumed=spawnSync(process.execPath,['tools/sim-runner/cli.mjs','--input','tests/replays/a12-public-decision.json','--out',resumeOut],{encoding:'utf8',windowsHide:true});assert.equal(resumed.status,0,resumed.stderr);
  const bad=resolve(out,'bad-input.json');writeFileSync(bad,encodeExact({input:fixtures()[0].input,commands:[{op:'unknown'}]})+'\n');
  const failureOut=resolve(out,'cli-failure');const failure=spawnSync(process.execPath,['tools/sim-runner/cli.mjs','--input',bad,'--out',failureOut],{encoding:'utf8',windowsHide:true});assert.equal(failure.status,1);
  assert.ok(readFileSync(`${failureOut}/failure.json`,'utf8').includes('replay action 0'));assert.equal(readFileSync(`${failureOut}/failed-input.json`,'utf8'),readFileSync(bad,'utf8'));
  return {demonstrations:rows,savedPublicDecision:'pass',actualFailureExitCode:failure.status,failedInputAndBoundaryPreserved:true};
}
