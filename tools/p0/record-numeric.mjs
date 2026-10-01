import { writeFileSync, mkdirSync } from 'node:fs';
import { runNumericProbe } from './numeric-probe.ts';
mkdirSync('docs/verification/fixtures',{recursive:true});
const path='docs/verification/fixtures/p0-numeric-golden.json';
writeFileSync(path,JSON.stringify(runNumericProbe(),null,2)+'\n');
console.log(`Recorded ${path}; compare with verify:p0 and real browser Worker.`);
