import { SCALE, MATH_VERSION, MAX_PRICE, MAX_SHARES, fee, reserve, expQ, logQ,
  randomU32, normalQ, encodeExact, decodeExact } from '../../packages/sim-core/src/numeric.ts';

/** Both Node and browser Worker execute this exact function, with no adapter math. */
export function runNumericProbe() {
  const payload = { cash: 200_000_000_000_000_000_000n,
    locked: [{ stockId: 'A001', quantity: 8_000_000_000, unlockTick: 8_000 }],
    phase: 'publicDecision', publicVersion: 83, appliedEvents: ['event-7:2'] };
  const encoded = encodeExact(payload);
  const decoded = decodeExact(encoded);
  const expInputs = [-16n * SCALE, -250_000_000n, 0n, 100_000_000n, 693_147_181n, 16n * SCALE];
  const logInputs = [1n, 50_000_000n, SCALE, 1_100_000_000n, 2n * SCALE, 20n * SCALE, 1_000_000_000n * SCALE];
  const keys: [number, string, string, number, number][] = [
    [0, 'macro', 'demand', 0, 0], [42, 'event', 'C01', 8_096, 1],
    [0xffff_ffff, 'allocation', 'A001:buy:1000:player', 15, 0],
    [42, 'company', 'B020', 4_000, 2],
  ];
  return {
    protocol: MATH_VERSION,
    fees: [0n, 1n, 1_999n, 2_000n, 2_001n, BigInt(MAX_PRICE) * BigInt(MAX_SHARES)].map(x => [x.toString(), fee(x).toString()]),
    reserves: [reserve(1_000, 16, 16), reserve(MAX_PRICE, MAX_SHARES, 16)].map(x => x.toString()),
    exp: expInputs.map(x => [x.toString(), expQ(x).toString()]),
    log: logInputs.map(x => [x.toString(), logQ(x).toString()]),
    random: keys.map(key => ({ key, u32: randomU32(...key), normalQ: normalQ(...key).toString() })),
    encoded, roundTripEqual: encoded === encodeExact(decoded),
    // Integer-index keys retain ECMAScript numeric priority; other keys sort UTF-16.
    keyOrderEncoding: encodeExact({ '10': 1, '2': 2, '02': 3, z: 4, a: 5,
      nested: { '4294967295': 1, '4294967294': 2, '-1': 3 } }),
    boundaryProduct: (BigInt(MAX_PRICE) * BigInt(MAX_SHARES)).toString(),
  };
}
