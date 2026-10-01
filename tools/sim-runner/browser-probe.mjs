import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixtures, digest } from './checks.mjs';
import { runReplay } from './replay.ts';
import { encodeExact, decodeExact } from '../../packages/sim-core/src/index.ts';
import { manifest, commandLine } from './runtime.mjs';

const [url='http://127.0.0.1:5173/p1-probe.html',executable='C:/Program Files/Google/Chrome/Application/chrome.exe',outputArg='artifacts/verification/p1/browser-dev']=process.argv.slice(2);
const output=resolve(outputArg);await mkdir(output,{recursive:true});
const runtime=process.env.P1_PLAYWRIGHT_PATH??'C:/Users/ymbn0/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(runtime).href);
const row=(id,input,actions)=>{const result=runReplay(input,actions),canonical=encodeExact(result);return {id,canonical,outputSha256:digest(canonical),stateHash:result.diagnostics.stateHash,snapshotChecksum:result.finalSnapshot.checksum,stepHashes:result.steps.map(s=>s.stateHash),stateVersion:result.finalSnapshot.stateVersion,publicVersion:result.finalSnapshot.publicVersion};};
const nodeCases=fixtures().map(f=>row(f.id,f.input,f.commands));
const saved=[];
for(const name of ['a09-reserved','a12-public-decision','a06-after-buy','protection-a-empty-pending']){
  const f=decodeExact(await readFile(`tests/replays/${name}.json`,'utf8'));saved.push({...row(f.id,f.input,f.commands),expectedChecksum:f.expectedChecksum});
}
const browser=await chromium.launch({executablePath:executable,headless:true});const page=await browser.newPage({viewport:{width:1280,height:960}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const checks=[];let state;
const check=(id,description,test)=>{test();checks.push({id,description,status:'pass'});};
try{
  await page.goto(url);await page.waitForFunction(()=>window.p1Probe?.read().replies.length===1);
  state=await page.evaluate(()=>window.p1Probe.read());
  check('actual-worker','Dedicated Worker ran production TradingCore',()=>{assert.equal(state.workerKind,'DedicatedWorker');assert.equal(state.replies[0].requestId,'p1-request-1');assert.deepEqual(state.errors,[]);});
  check('complete-node-worker','All fields of 27 actual core replays match freshly executed Node',()=>assert.deepEqual(state.replies[0].payload.cases,nodeCases));
  check('saved-node-worker','Four saved safe boundaries restore to identical full Node replays',()=>assert.deepEqual(state.replies[0].payload.savedReplays,saved));
  check('frozen-golden','Every command hash and full-output checksum matches the frozen golden',()=>assert.equal(state.replies[0].matchesGolden,true));
  check('real-clearing','A01 results come from funded core clearing and service-account ledger',()=>{
    const a01=decodeExact(state.replies[0].payload.cases.find(f=>f.id==='A01').canonical);assert.equal(a01.diagnostics.trace[0].stocks[0].clearing.price,1040);assert.equal(a01.diagnostics.trace[0].stocks[0].clearing.quantity,300);assert.equal(a01.diagnostics.state.serviceCash,312n);
  });
  await page.screenshot({path:resolve(output,'worker-replay.png'),fullPage:true});
  await page.locator('#replay').click();await page.waitForFunction(()=>window.p1Probe.read().replies.length===2);state=await page.evaluate(()=>window.p1Probe.read());
  check('repeat-request','Second real Worker request preserves identity and exact output',()=>{assert.deepEqual(state.replies.map(r=>r.requestId),['p1-request-1','p1-request-2']);assert.deepEqual(state.replies[1].payload,state.replies[0].payload);assert.equal(state.replies[1].matchesGolden,true);});
  await page.evaluate(()=>window.p1Probe.invalid());await page.waitForFunction(()=>window.p1Probe.read().replies.length===3);state=await page.evaluate(()=>window.p1Probe.read());
  check('invalid-request','Wrong expected probe version receives a defined error without a replay',()=>{assert.deepEqual(state.replies[2].payload,{error:'invalidProbeRequest'});assert.equal(state.replies[2].requestId,'p1-request-3');assert.equal(state.replies[2].matchesGolden,false);});
  check('browser-errors','Real browser had no uncaught or console error',()=>assert.deepEqual(errors,[]));
  const result={status:'pass',independentAcceptance:'pending',browserVersion:browser.version(),browserExecutable:executable,runtime,url,nodeVersion:process.version,recordedAt:new Date().toISOString(),checks,errors,state};
  await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest(commandLine(),{url,browserExecutable:executable}),null,2)+'\n');
  await writeFile(resolve(output,'results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,browserVersion:result.browserVersion,checks:checks.length,replays:31,output}));
}catch(error){await writeFile(resolve(output,'failure.json'),JSON.stringify({status:'fail',message:error.message,checks,errors,state},null,2)+'\n');await page.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{await browser.close();}
