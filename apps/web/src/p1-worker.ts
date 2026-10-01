import fixtureText from '../../../tests/scenarios/p1/cases.json?raw';
import a09Text from '../../../tests/replays/a09-reserved.json?raw';
import a12Text from '../../../tests/replays/a12-public-decision.json?raw';
import a06Text from '../../../tests/replays/a06-after-buy.json?raw';
import protectionText from '../../../tests/replays/protection-a-empty-pending.json?raw';
import { decodeExact, encodeExact, sha256 } from '@big-a/sim-core';
import type { ExactValue, ScenarioInput, SnapshotEnvelope, WorkerReply, WorkerRequest } from '@big-a/sim-core';
import { runReplay } from '../../../tools/sim-runner/replay.ts';
import type { ReplayAction, ReplayFixture } from '../../../tools/sim-runner/replay.ts';

type SavedReplay={id:string;input:SnapshotEnvelope;commands:ReplayAction[];expectedChecksum:string};
const fixtures=(decodeExact(fixtureText) as unknown as {cases:ReplayFixture[]}).cases;
const saved=[a09Text,a12Text,a06Text,protectionText].map(text=>decodeExact(text) as unknown as SavedReplay);
function row(id:string,input:ScenarioInput|SnapshotEnvelope,actions:ReplayAction[]){
  const result=runReplay(input,actions);const canonical=encodeExact(result as unknown as ExactValue);
  return {id,canonical,outputSha256:sha256(canonical),stateHash:result.diagnostics.stateHash,snapshotChecksum:result.finalSnapshot.checksum,stepHashes:result.steps.map(s=>s.stateHash),stateVersion:result.finalSnapshot.stateVersion,publicVersion:result.finalSnapshot.publicVersion};
}
globalThis.addEventListener('message',(event:MessageEvent<WorkerRequest>)=>{
  const request=event.data;
  let payload:unknown;
  try{
    if(request.operation!=='replayProbe'||request.expectedStateVersion!==0)payload={error:'invalidProbeRequest'};
    else payload={cases:fixtures.map(f=>row(f.id,f.input,f.commands)),savedReplays:saved.map(f=>({...row(f.id,f.input,f.commands),expectedChecksum:f.expectedChecksum}))};
  }catch(error){payload={error:error instanceof Error?error.message:'Worker replay failed'};}
  const reply:WorkerReply={requestId:request.requestId,stateVersion:0,publicVersion:0,payload};
  globalThis.postMessage(reply);
});
