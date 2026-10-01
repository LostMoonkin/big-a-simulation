import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { RULES_VERSION, CONTENT_VERSION, MATH_VERSION, SNAPSHOT_VERSION, encodeExact } from '../../packages/sim-core/src/index.ts';

export const sha=value=>createHash('sha256').update(value).digest('hex');
export function parseArgs(args){
  const options={};
  for(let i=0;i<args.length;i++){
    const key=args[i];if(!key.startsWith('--')||i+1===args.length||args[i+1].startsWith('--'))throw new Error(`expected --option value: ${key}`);
    if(!['--out','--input','--commands','--case'].includes(key))throw new Error(`unknown option ${key}`);
    if(key.slice(2)in options)throw new Error(`duplicate option ${key}`);options[key.slice(2)]=args[++i];
  }return options;
}
export function outputDir(options,prefix){const out=resolve(options.out??`artifacts/verification/p1/${prefix}-${new Date().toISOString().replaceAll(/[:.]/g,'-')}`);mkdirSync(out,{recursive:true});return out;}
export function writeJson(path,value){writeFileSync(path,JSON.stringify(value,(_key,v)=>typeof v==='bigint'?{$bigint:v.toString()}:v,2)+'\n');}
export function sourceIdentity(){
  const paths=[];const walk=path=>{for(const name of readdirSync(path)){const child=`${path}/${name}`;if(statSync(child).isDirectory())walk(child);else paths.push(child);}};
  for(const path of ['packages/sim-core/src','tools/sim-runner','tests/scenarios/p1','tests/replays'])walk(path);
  paths.push('package.json','package-lock.json','apps/web/vite.config.ts','apps/web/p1-probe.html','apps/web/src/p1-probe.ts','apps/web/src/p1-worker.ts');
  const files=paths.sort().map(path=>({path,sha256:sha(readFileSync(path))}));
  return {algorithm:'sha256(sorted path + NUL + raw-byte sha256 + LF)',sourceHash:sha(files.map(f=>`${f.path}\0${f.sha256}\n`).join('')),files};
}
export function manifest(command,inputs={}){
  let commit=null;try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();}catch{}
  return {format:'p1-verification-v1',stage:'P1',status:'implementation evidence; pending independent acceptance',recordedAt:new Date().toISOString(),headAtExecution:commit,
    ...sourceIdentity(),rulesVersion:RULES_VERSION,contentVersion:CONTENT_VERSION,mathVersion:MATH_VERSION,rngVersion:'rng-v1',schemaVersion:SNAPSHOT_VERSION,
    rulesHash:sha(readFileSync('docs/design/market-model-rules.md')),configAndSeedsHash:sha(readFileSync('tests/scenarios/p1/cases.json')),seedManifestHash:sha(readFileSync('tests/scenarios/p1/random-seeds.json')),
    runtime:{node:process.version,platform:process.platform,architecture:process.arch},command,inputs};
}
export const commandLine=()=>`node ${process.argv.slice(1).map(v=>v.includes(' ')?JSON.stringify(v):v).join(' ')}`;
export const localPath=path=>relative(process.cwd(),resolve(path)).replaceAll('\\','/');
