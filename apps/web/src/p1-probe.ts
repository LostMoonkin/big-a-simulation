import goldenText from '../../../tests/replays/p1-golden.json?raw';
import type { WorkerReply, WorkerRequest } from '@big-a/sim-core';

type Row={id:string;canonical:string;outputSha256:string;stateHash:string;snapshotChecksum:string;stepHashes:string[];stateVersion:number;publicVersion:number};
type ProbePayload={cases:Row[];savedReplays:(Row&{expectedChecksum:string})[];error?:string};
type GoldenRow=Pick<Row,'id'|'outputSha256'|'stateHash'|'snapshotChecksum'|'stepHashes'>;
const golden=JSON.parse(goldenText) as {cases:GoldenRow[]};
const replies:(WorkerReply&{matchesGolden:boolean})[]=[];const errors:string[]=[];
let requests=0;
const worker=new Worker(new URL('./p1-worker.ts',import.meta.url),{type:'module'});
const status=document.querySelector<HTMLParagraphElement>('#status')!;
const result=document.querySelector<HTMLPreElement>('#result')!;
worker.addEventListener('error',e=>{errors.push(e.message);status.textContent=`失败：${e.message}`;});
worker.addEventListener('message',(event:MessageEvent<WorkerReply>)=>{
  const reply=event.data;const payload=reply.payload as ProbePayload;
  const matchesGolden=!payload.error&&payload.cases.length===golden.cases.length&&payload.cases.every((row,i)=>{
    const expected=golden.cases[i]!;return row.id===expected.id&&row.outputSha256===expected.outputSha256&&row.stateHash===expected.stateHash&&row.snapshotChecksum===expected.snapshotChecksum&&JSON.stringify(row.stepHashes)===JSON.stringify(expected.stepHashes);
  })&&payload.savedReplays.every(row=>row.snapshotChecksum===row.expectedChecksum);
  replies.push({...reply,matchesGolden});
  if(payload.error)errors.push(payload.error);
  status.textContent=matchesGolden?`${payload.cases.length} 个固定场景与 ${payload.savedReplays.length} 个恢复场景精确一致`:`失败：${payload.error??'黄金不一致'}`;
  if(!payload.error)result.textContent=payload.cases.map(row=>`${row.id.padEnd(24)} ${row.snapshotChecksum}`).join('\n');
});
const send=(operation='replayProbe',expectedStateVersion=0)=>{
  const request:WorkerRequest={requestId:`p1-request-${++requests}`,operation,expectedStateVersion,payload:null};worker.postMessage(request);
};
document.querySelector<HTMLButtonElement>('#replay')!.addEventListener('click',()=>send());
const api={read:()=>({replies,errors,requests,workerKind:'DedicatedWorker'}),invalid:()=>send('replayProbe',1)};
(window as unknown as {p1Probe:typeof api}).p1Probe=api;
send();
const style=document.createElement('style');style.textContent='body{background:#101218;color:#dce0e9;font:14px/1.6 system-ui;margin:32px}main{max-width:1000px}h1{font-size:23px}button{color:#fff;background:#343e59;border:1px solid #617090;padding:8px 18px;border-radius:4px;cursor:pointer}pre{font-size:12px;overflow:auto}';document.head.append(style);
