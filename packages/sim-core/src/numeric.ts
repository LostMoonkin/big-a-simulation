/** Frozen P0 numeric protocol. No clock, DOM or unkeyed random input. */
export const MATH_VERSION = 'fixed-q9-v1';
export const SCALE = 1_000_000_000n;
export const LN2 = 693_147_181n;
export const MAX_PRICE = 100_000_000;
export const MAX_SHARES = 8_000_000_000;
export const MAX_AMOUNT = 200_000_000_000_000_000_000n;

export function ceilDiv(n: bigint, d: bigint): bigint {
  if (n < 0n || d <= 0n) throw new RangeError('ceilDiv requires n>=0,d>0');
  return (n + d - 1n) / d;
}

export function fee(amount: bigint): bigint {
  return ceilDiv(amount, 2_000n);
}

export function reserve(price: number, quantity: number, remainingBatches: number): bigint {
  if (!Number.isSafeInteger(price) || price < 1 || price > MAX_PRICE ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_SHARES ||
      !Number.isSafeInteger(remainingBatches) || remainingBatches < 1) {
    throw new RangeError('invalid reservation input');
  }
  const amount = BigInt(price) * BigInt(quantity);
  const k = Math.min(quantity, remainingBatches);
  return amount + fee(amount) + BigInt(k - 1);
}

/** Model multiplication truncates toward zero, exactly as specified in q9-v1. */
export function mulQ(a: bigint, b: bigint): bigint { return a * b / SCALE; }
export function divQ(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new RangeError('division by zero');
  return a * SCALE / b;
}

export function integerSqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError('negative square root');
  if (n < 2n) return n;
  let x = n;
  let next = (x + 1n) / 2n;
  while (next < x) { x = next; next = (x + n / x) / 2n; }
  return x;
}

/** 32 Taylor terms after ln(2) reduction, input in [-16,16]. */
export function expQ(x: bigint): bigint {
  if (x < -16n * SCALE || x > 16n * SCALE) throw new RangeError('expQ domain');
  const k = x / LN2;
  const r = x - k * LN2;
  let term = SCALE;
  let sum = SCALE;
  for (let n = 1n; n <= 32n; n++) {
    term = term * r / (SCALE * n);
    sum += term;
  }
  return k >= 0n ? sum * (2n ** k) : sum / (2n ** -k);
}

/** Normalize to [1,2), then 32 odd atanh terms. */
export function logQ(x: bigint): bigint {
  if (x <= 0n || x > 1_000_000_000n * SCALE) throw new RangeError('logQ domain');
  let m = x;
  let k = 0n;
  while (m >= 2n * SCALE) { m /= 2n; k++; }
  while (m < SCALE) { m *= 2n; k--; }
  const y = divQ(m - SCALE, m + SCALE);
  const yy = mulQ(y, y);
  let power = y;
  let sum = 0n;
  for (let n = 1n; n <= 63n; n += 2n) {
    sum += power / n;
    power = mulQ(power, yy);
  }
  return 2n * sum + k * LN2;
}

/** FNV-1a over UTF-16LE followed by fixed avalanche. Tuple framing uses JSON. */
export function randomU32(seed: number, purpose: string, entity: string, tick: number, slot: number): number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff ||
      !Number.isSafeInteger(tick) || tick < 0 || !Number.isSafeInteger(slot) || slot < 0) {
    throw new RangeError('invalid random key');
  }
  const key = JSON.stringify(['rng-v1', seed, purpose, entity, tick, slot]);
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    h = Math.imul(h ^ (c & 255), 0x01000193) >>> 0;
    h = Math.imul(h ^ (c >>> 8), 0x01000193) >>> 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function uniformQ(seed: number, purpose: string, entity: string, tick: number, slot: number): bigint {
  return BigInt(randomU32(seed, purpose, entity, tick, slot)) * SCALE / 4_294_967_296n;
}

/** Bounded normal approximation: 12 U[0,1) minus 6, clipped to +/-3. */
export function normalQ(seed: number, purpose: string, entity: string, tick: number, slot: number): bigint {
  let z = -6n * SCALE;
  for (let i = 0; i < 12; i++) z += uniformQ(seed, purpose, entity, tick, slot * 12 + i);
  return z < -3n * SCALE ? -3n * SCALE : z > 3n * SCALE ? 3n * SCALE : z;
}

export type ExactValue = null | boolean | number | string | bigint | ExactValue[] | { [key: string]: ExactValue };

export function encodeExact(value: ExactValue): string {
  function encode(v: ExactValue): unknown {
    if (typeof v === 'bigint') return { $bigint: v.toString() };
    if (typeof v === 'number' && !Number.isSafeInteger(v)) throw new RangeError('snapshot number must be safe integer');
    if (Array.isArray(v)) return v.map(encode);
    if (v !== null && typeof v === 'object') {
      if ('$bigint' in v) throw new TypeError('reserved snapshot key');
      return Object.fromEntries(Object.keys(v).sort().map(k => [k, encode(v[k]!)]));
    }
    return v;
  }
  return JSON.stringify(encode(value));
}

export function decodeExact(text: string): ExactValue {
  return JSON.parse(text, (_key: string, value: unknown): unknown => {
    if (value !== null && typeof value === 'object' && '$bigint' in value) {
      const record = value as Record<string, unknown>;
      if (Object.keys(record).length !== 1 || typeof record.$bigint !== 'string' ||
          !/^(0|-?[1-9][0-9]*)$/.test(record.$bigint)) throw new TypeError('invalid bigint encoding');
      return BigInt(record.$bigint);
    }
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new RangeError('unsafe snapshot number');
    return value;
  }) as ExactValue;
}
