import { MAX_PRICE, MAX_SHARES, randomU32 } from './numeric.ts';
import type { AccountAllocation, AuctionInput, AuctionOrder, AuctionResult, Side } from './trading-types.ts';

export function compareId(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

/** Frozen P0 quantity tie: hash ascending, then UTF-16 account ID ascending. */
export function allocationKey(seed: number, tick: number, stockId: string, side: Side,
  price: number, accountId: string): number {
  return randomU32(seed, 'allocation', `${stockId}:${side}:${price}:${accountId}`, tick, 0);
}

function distribute(input: AuctionInput, side: Side, price: number, quantity: bigint): AccountAllocation[] {
  const eligible = input.orders.filter(o => o.side === side &&
    (side === 'buy' ? o.limitPrice >= price : o.limitPrice <= price));
  const prices = [...new Set(eligible.map(o => o.limitPrice))].sort((a, b) => side === 'buy' ? b - a : a - b);
  const result = new Map<string, bigint>();
  let left = quantity;
  for (const level of prices) {
    if (left === 0n) break;
    const groups = new Map<string, bigint>();
    for (const o of eligible) if (o.limitPrice === level) groups.set(o.accountId,
      (groups.get(o.accountId) ?? 0n) + BigInt(o.quantity));
    const total = [...groups.values()].reduce((a, b) => a + b, 0n);
    const take = left < total ? left : total;
    const rows = [...groups].map(([accountId, demand]) => ({ accountId,
      count: take * demand / total, remainder: take * demand % total,
      tie: allocationKey(input.seed, input.tick, input.stockId, side, level, accountId) }));
    let extra = take - rows.reduce((n, r) => n + r.count, 0n);
    rows.sort((a, b) => a.remainder > b.remainder ? -1 : a.remainder < b.remainder ? 1 :
      a.tie - b.tie || compareId(a.accountId, b.accountId));
    for (const r of rows) { if (extra > 0n) { r.count++; extra--; }
      result.set(r.accountId, (result.get(r.accountId) ?? 0n) + r.count); }
    left -= take;
  }
  return [...result].filter(([, n]) => n > 0n).sort(([a], [b]) => compareId(a, b))
    .map(([accountId, n]) => ({ accountId, quantity: Number(n) }));
}

function orderAttribution(input: AuctionInput, side: Side, price: number,
  allocations: AccountAllocation[]): AuctionResult['orderAllocations'] {
  const result: AuctionResult['orderAllocations'] = [];
  for (const allocation of allocations) {
    let left = allocation.quantity;
    const orders = input.orders.filter(o => o.accountId === allocation.accountId && o.side === side &&
      (side === 'buy' ? o.limitPrice >= price : o.limitPrice <= price))
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || compareId(a.id, b.id));
    for (const o of orders) { const count = Math.min(left, o.quantity); if (count > 0)
      result.push({ orderId: o.id, accountId: o.accountId, side, quantity: count });
      left -= count; if (left === 0) break; }
  }
  return result;
}

function validateOrder(o: AuctionOrder): void {
  if (!o.id || !o.accountId || !['buy', 'sell'].includes(o.side) ||
    !Number.isSafeInteger(o.limitPrice) || o.limitPrice < 1 || o.limitPrice > MAX_PRICE ||
    !Number.isSafeInteger(o.quantity) || o.quantity < 1 || o.quantity > MAX_SHARES ||
    (o.sequence !== undefined && (!Number.isSafeInteger(o.sequence) || o.sequence < 0))) {
    throw new RangeError('invalid auction order');
  }
}

/** Pure auction over already funded, one-direction-per-account orders. No ledger mutation. */
export function clearAuction(input: AuctionInput): AuctionResult {
  if (!Number.isSafeInteger(input.low) || !Number.isSafeInteger(input.high) ||
    input.low < 1 || input.high > MAX_PRICE || input.low > input.high ||
    !Number.isSafeInteger(input.reference) || input.reference < 1 || input.reference > MAX_PRICE) {
    throw new RangeError('invalid auction band');
  }
  for (const o of input.orders) validateOrder(o);
  const directions = new Map<string, Side>(); const ids = new Set<string>();
  for (const o of input.orders) { if (ids.has(o.id) || (directions.has(o.accountId) && directions.get(o.accountId) !== o.side))
    throw new RangeError('duplicate order or opposite auction direction'); ids.add(o.id); directions.set(o.accountId, o.side); }
  const candidates = new Set<number>([input.low, input.high,
    Math.max(input.low, Math.min(input.high, input.reference))]);
  for (const o of input.orders) for (const p of [o.limitPrice - 1, o.limitPrice, o.limitPrice + 1])
    if (p >= input.low && p <= input.high) candidates.add(p);
  let best: { price: number; quantity: bigint; imbalance: bigint; distance: number } | null = null;
  for (const price of candidates) {
    let demand = 0n; let supply = 0n;
    for (const o of input.orders) { if (o.side === 'buy' && o.limitPrice >= price) demand += BigInt(o.quantity);
      if (o.side === 'sell' && o.limitPrice <= price) supply += BigInt(o.quantity); }
    const quantity = demand < supply ? demand : supply;
    const imbalance = demand > supply ? demand - supply : supply - demand;
    const distance = Math.abs(price - input.reference);
    if (!best || quantity > best.quantity || (quantity === best.quantity &&
      (imbalance < best.imbalance || (imbalance === best.imbalance &&
        (distance < best.distance || (distance === best.distance && price < best.price))))))
      best = { price, quantity, imbalance, distance };
  }
  if (!best || best.quantity === 0n) return { price: null, quantity: 0,
    buyAllocations: [], sellAllocations: [], orderAllocations: [] };
  if (best.quantity > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('unsafe clearing quantity');
  const buys = distribute(input, 'buy', best.price, best.quantity);
  const sells = distribute(input, 'sell', best.price, best.quantity);
  return { price: best.price, quantity: Number(best.quantity), buyAllocations: buys, sellAllocations: sells,
    orderAllocations: [...orderAttribution(input, 'buy', best.price, buys),
      ...orderAttribution(input, 'sell', best.price, sells)] };
}
