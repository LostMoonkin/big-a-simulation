import { readFileSync, writeFileSync } from 'node:fs';
import { decodeExact, encodeExact } from '../../packages/sim-core/src/index.ts';
import { runReplay } from './replay.ts';
import { auditLedger } from './reference-auction.mjs';
import { parseArgs, outputDir, manifest, commandLine, writeJson, sha } from './runtime.mjs';

let out;let inputText;let commandsText;
try{
  const options=parseArgs(process.argv.slice(2));out=outputDir(options,'replay');
  if(!options.input)throw new Error('--input is required');inputText=readFileSync(options.input,'utf8');let packet=decodeExact(inputText);
  if(packet.cases){if(!options.case)throw new Error('--case is required for a scenario packet');packet=packet.cases.find(f=>f.id===options.case);if(!packet)throw new Error('unknown scenario case');}
  const input=packet.input??packet;let commands=packet.commands??[];
  if(options.commands){commandsText=readFileSync(options.commands,'utf8');commands=decodeExact(commandsText);}
  if(!Array.isArray(commands))throw new Error('commands must be an array');
  const result=runReplay(input,commands,d=>auditLedger(d.state));
  if(packet.expectedChecksum&&result.finalSnapshot.checksum!==packet.expectedChecksum)throw new Error('saved replay final checksum differs');
  const runManifest=manifest(commandLine(),{input:options.input,inputSha256:sha(inputText),commands:options.commands??'embedded',commandsSha256:sha(commandsText??encodeExact(commands)),seed:result.finalSnapshot.seed,configHash:result.finalSnapshot.configHash});
  writeJson(`${out}/manifest.json`,runManifest);writeFileSync(`${out}/input.json`,encodeExact(input)+'\n');writeFileSync(`${out}/commands.json`,encodeExact(commands)+'\n');
  writeFileSync(`${out}/results.json`,encodeExact(result)+'\n');writeJson(`${out}/final-snapshot.json`,result.finalSnapshot);
  writeJson(`${out}/checkpoints.json`,result.snapshots);writeJson(`${out}/ledger.json`,result.diagnostics.audit);
  const trades=result.diagnostics.trace.flatMap(b=>b.stocks.map(s=>`- d${b.clock.worldDay}/b${b.clock.batch} ${s.stockId}: price ${s.clearing.price??'no trade'}, quantity ${s.clearing.quantity}`));
  writeFileSync(`${out}/summary.md`,`# P1 replay\n\nProduction core replay completed; independent acceptance: pending.\nSource hash: ${runManifest.sourceHash}\nState: ${result.diagnostics.stateHash}\nSnapshot: ${result.finalSnapshot.checksum}\nCash difference: ${result.diagnostics.audit.cashDifference}\n\n${trades.join('\n')}\n`);
  console.log(JSON.stringify({status:'pass',commands:commands.length,batches:result.diagnostics.trace.length,stateHash:result.diagnostics.stateHash,checksum:result.finalSnapshot.checksum,out}));
}catch(error){
  process.exitCode=1;
  if(out){writeJson(`${out}/manifest.json`,manifest(commandLine(),{inputSha256:inputText?sha(inputText):null,commandsSha256:commandsText?sha(commandsText):null}));writeJson(`${out}/failure.json`,{status:'fail',message:error.message,command:commandLine()});if(inputText)writeFileSync(`${out}/failed-input.json`,inputText);if(commandsText)writeFileSync(`${out}/failed-commands.json`,commandsText);writeFileSync(`${out}/summary.md`,`# P1 replay failed\n\n${error.message}\n`);}
  console.error(error.message);
}
