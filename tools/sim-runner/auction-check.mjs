import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { clearAuction, decodeExact } from '../../packages/sim-core/src/index.ts';
import { exhaustiveAuction, randomBook } from './reference-auction.mjs';

const economic=r=>({price:r.price,quantity:r.quantity,buyAllocations:r.buyAllocations,sellAllocations:r.sellAllocations});
export function splitOrders(orders){return orders.flatMap(o=>{
  const n=Math.min(6,o.quantity);const base=Math.floor(o.quantity/n);const extra=o.quantity%n;
  return Array.from({length:n},(_,i)=>({...o,id:`${o.id}-split-${i}`,quantity:base+(i<extra?1:0),sequence:(o.sequence??0)*6+i}));
});}
export function checkAuctions(out){
  const seeds=JSON.parse(readFileSync('tests/scenarios/p1/random-seeds.json','utf8')).seeds;
  assert.equal(seeds.length,2000);assert.deepEqual(seeds,Array.from({length:2000},(_,i)=>i+1));
  const cases=decodeExact(readFileSync('tests/scenarios/p1/cases.json','utf8')).cases;
  const examples=[];let zero=0,positive=0,inside=0;
  mkdirSync(out,{recursive:true});
  for(const f of cases.filter(c=>['A01','A02','A03','A04','A05'].includes(c.id))){
    const stock=f.input.stocks[0];const book={seed:f.input.seed,tick:0,stockId:stock.id,reference:stock.initialPrice,low:Math.ceil(stock.initialPrice*.9),high:Math.floor(stock.initialPrice*1.1),orders:f.commands.filter(c=>c.op==='submit').map((c,i)=>({id:c.id,accountId:c.accountId,side:c.body.side,limitPrice:c.body.limitPrice,quantity:c.body.quantity,sequence:i}))};
    const actual=clearAuction(book);assert.deepEqual(actual,exhaustiveAuction(book));assert.equal(actual.price,f.expected.price);assert.equal(actual.quantity,f.expected.quantity);examples.push({id:f.id,...economic(actual)});
  }
  for(const seed of seeds){
    const book=randomBook(seed);
    try{
      const expected=exhaustiveAuction(book);const actual=clearAuction(book);assert.deepEqual(actual,expected);
      assert.deepEqual(clearAuction({...book,orders:[...book.orders].reverse()}),expected);
      assert.deepEqual(economic(clearAuction({...book,orders:splitOrders(book.orders)})),economic(expected));
      if(actual.quantity===0)zero++;else{positive++;if(!book.orders.some(o=>o.limitPrice===actual.price))inside++;}
      for(const side of ['buyAllocations','sellAllocations'])assert.equal(actual[side].reduce((sum,a)=>sum+a.quantity,0),actual.quantity);
    }catch(error){writeFileSync(`${out}/first-auction-failure.json`,JSON.stringify({seed,book,error:error.message},null,2)+'\n');throw new Error(`auction seed ${seed}: ${error.message}`);}
  }
  return {fixed:examples,seeds:seeds.length,variantsPerSeed:3,zero,positive,nonLimitClearingPrices:inside,oracle:'independent exhaustive integer ticks and dual-side BigInt remainder allocation; production candidate/allocator are not imported'};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/auction-check.mjs')){
  const out=process.argv[2]??'artifacts/verification/p1/early-auction';
  try{const result=checkAuctions(out);writeFileSync(`${out}/auction-results.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:'pass',...result}));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
