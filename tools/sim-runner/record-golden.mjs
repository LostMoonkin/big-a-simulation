import { mkdirSync, writeFileSync } from 'node:fs';
import { goldenRows, fixtures, digest } from './checks.mjs';
import { runReplay } from './replay.ts';
import { encodeExact } from '../../packages/sim-core/src/index.ts';
import { writeJson } from './runtime.mjs';

// Intentional contract update only. verify and npm test never rewrite goldens.
mkdirSync('tests/replays',{recursive:true});
writeJson('tests/replays/p1-golden.json',{format:'p1-golden-v1',rulesVersion:'0.3.1',contentVersion:'0.3.1',mathVersion:'fixed-q9-v1',rngVersion:'rng-v1',comparison:'SHA256 of complete canonical result plus every command boundary state hash, exact integer values',cases:goldenRows()});
for(const [id,label]of [['A09','reserved'],['A12','public-decision'],['A06','after-buy'],['PROTECTION-A-EMPTY','pending']]){
  const f=fixtures().find(f=>f.id===id),index=f.commands.findIndex(a=>a.op==='snapshot'&&a.label===label),checkpoint=runReplay(f.input,f.commands.slice(0,index+1));
  const saved={format:'p1-saved-replay-v1',id:`${id}/${label}`,input:checkpoint.finalSnapshot,commands:f.commands.slice(index+1),expectedChecksum:runReplay(f.input,f.commands).finalSnapshot.checksum};
  writeFileSync(`tests/replays/${id.toLowerCase()}-${label}.json`,encodeExact(saved)+'\n');
}
console.log(JSON.stringify({recorded:goldenRows().length,savedReplays:4,goldenHash:digest(encodeExact(goldenRows()))}));
