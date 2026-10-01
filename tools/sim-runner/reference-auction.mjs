import { randomU32 } from '../../packages/sim-core/src/numeric.ts';

// Verification only. Exhaust every integer tick; never import the production
// candidate search, allocator or ledger. Only the frozen RNG primitive is shared.
export function exhaustiveAuction(input) {
  const orders=input.orders;
  const ceiling=Math.min(input.high,Math.max(input.reference,...orders.map(o=>o.limitPrice)));
  if(ceiling-input.low>5000)throw new RangeError('reference oracle requires a bounded price domain');
  let winner=null;
  for(let p=input.low;p<=ceiling;p++) {
    const demand=orders.reduce((n,o)=>n+(o.side==='buy'&&o.limitPrice>=p?BigInt(o.quantity):0n),0n);
    const supply=orders.reduce((n,o)=>n+(o.side==='sell'&&o.limitPrice<=p?BigInt(o.quantity):0n),0n);
    const volume=demand<supply?demand:supply;
    const priority=[-volume,demand>supply?demand-supply:supply-demand,BigInt(Math.abs(p-input.reference)),BigInt(p)];
    let better=!winner;
    if(winner)for(let i=0;i<priority.length;i++)if(priority[i]!==winner.priority[i]){better=priority[i]<winner.priority[i];break;}
    if(better)winner={price:p,quantity:volume,priority};
  }
  if(!winner||winner.quantity===0n)return {price:null,quantity:0,buyAllocations:[],sellAllocations:[],orderAllocations:[]};
  const allocate=side=>{
    const book=orders.filter(o=>o.side===side&&(side==='buy'?o.limitPrice>=winner.price:o.limitPrice<=winner.price));
    const levels=[...new Set(book.map(o=>o.limitPrice))].sort((a,b)=>side==='buy'?b-a:a-b);
    const accounts={};let left=winner.quantity;
    for(const price of levels){
      if(left===0n)break;
      const atLevel=book.filter(o=>o.limitPrice===price);
      const ids=[...new Set(atLevel.map(o=>o.accountId))];
      const amounts=ids.map(id=>atLevel.filter(o=>o.accountId===id).reduce((sum,o)=>sum+BigInt(o.quantity),0n));
      const total=amounts.reduce((a,b)=>a+b,0n);const take=left<total?left:total;
      const counts=amounts.map(q=>take*q/total);let residue=take-counts.reduce((a,b)=>a+b,0n);
      const ranked=ids.map((id,i)=>({id,i,remainder:take*amounts[i]%total,rank:randomU32(input.seed,'allocation',`${input.stockId}:${side}:${price}:${id}`,input.tick,0)}))
        .sort((a,b)=>a.remainder===b.remainder?a.rank-b.rank||(a.id<b.id?-1:a.id>b.id?1:0):a.remainder>b.remainder?-1:1);
      for(const row of ranked)if(residue>0n){counts[row.i]++;residue--;}
      for(let i=0;i<ids.length;i++)accounts[ids[i]]=(accounts[ids[i]]??0n)+counts[i];
      left-=take;
    }
    return Object.entries(accounts).filter(([,n])=>n>0n).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([accountId,q])=>({accountId,quantity:Number(q)}));
  };
  const buyAllocations=allocate('buy');const sellAllocations=allocate('sell');const orderAllocations=[];
  for(const [side,allocations]of [['buy',buyAllocations],['sell',sellAllocations]])for(const a of allocations){
    let left=a.quantity;
    const fifo=orders.filter(o=>o.accountId===a.accountId&&o.side===side&&(side==='buy'?o.limitPrice>=winner.price:o.limitPrice<=winner.price))
      .sort((a,b)=>(a.sequence??0)-(b.sequence??0)||(a.id<b.id?-1:a.id>b.id?1:0));
    for(const o of fifo){const quantity=Math.min(left,o.quantity);if(quantity>0)orderAllocations.push({orderId:o.id,accountId:a.accountId,side,quantity});left-=quantity;if(left===0)break;}
  }
  return {price:winner.price,quantity:Number(winner.quantity),buyAllocations,sellAllocations,orderAllocations};
}

export function independentFee(amount){return (amount+1999n)/2000n;}

// A reproducible independent xorshift stream constructs test inputs only. It is
// not used by the game and does not consume any production market RNG key.
export function randomBook(seed){
  let x=seed>>>0;const next=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};
  const market=seed%2?'A':'B';const reference=25+next()%76;
  const percent=market==='A'?10:8;const low=Math.max(1,Math.ceil(reference*(100-percent)/100));const high=Math.floor(reference*(100+percent)/100);
  const orders=[];const count=3+next()%14;
  for(let i=0;i<count;i++){
    const side=i%2?'sell':'buy';const accountId=`${side}-${i}`;
    const limitPrice=1+next()%125;const quantity=1+next()%90;
    orders.push({id:`o-${i}`,accountId,side,limitPrice,quantity,sequence:i});
    if(next()%3===0)orders.push({id:`o-${i}-extra`,accountId,side,limitPrice:1+next()%125,quantity:1+next()%30,sequence:count+i});
  }
  return {seed,tick:0,stockId:`${market}001`,market,reference,low,high,orders};
}

export function auditLedger(state){
  const sum=state.accounts.reduce((n,a)=>n+a.cash,0n)+state.serviceCash;
  if(sum!==state.initialCash)throw new Error(`cash difference ${sum-state.initialCash}`);
  for(const a of state.accounts){
    if(a.cash<0n||a.reservedCash<0n||a.reservedCash>a.cash)throw new Error(`invalid cash/reservation ${a.id}`);
    const pending=a.pendingProceeds.reduce((n,p)=>n+p.amount,0n);
    if(pending<0n||pending>a.cash||a.reservedCash+pending>a.cash)throw new Error(`pending/frozen funds exceed cash ${a.id}`);
    const expected=state.orders.filter(o=>o.accountId===a.id&&['active','partial'].includes(o.status)).reduce((n,o)=>n+o.reservedCash,0n);
    if(expected!==a.reservedCash)throw new Error(`reservation mismatch ${a.id}`);
    for(const stock of state.stocks){
      const unlocked=a.lots.filter(l=>l.stockId===stock.id&&l.unlockTick<=state.clock.worldDay*16+state.clock.batch).reduce((n,l)=>n+l.quantity,0);
      const frozen=state.orders.filter(o=>o.accountId===a.id&&o.stockId===stock.id&&['active','partial'].includes(o.status)).reduce((n,o)=>n+o.reservedShares,0);
      if(frozen<0||frozen>unlocked)throw new Error(`reserved sale exceeds unlocked stock ${a.id}/${stock.id}`);
    }
    if(a.lots.some(l=>l.quantity<0||!Number.isSafeInteger(l.quantity)))throw new Error(`invalid shares ${a.id}`);
  }
  for(const stock of state.stocks){
    const actual=state.accounts.reduce((sum,a)=>sum+a.lots.filter(l=>l.stockId===stock.id).reduce((n,l)=>n+l.quantity,0),0);
    if(actual!==stock.totalShares)throw new Error(`shares difference ${stock.id}: ${actual-stock.totalShares}`);
  }
  return {cashDifference:'0',shareDifferences:state.stocks.map(s=>({stockId:s.id,difference:0})),negativeBalances:0};
}
