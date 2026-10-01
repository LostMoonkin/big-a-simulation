import assert from 'node:assert/strict';

const median = values => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};

/** Count actual clearing quantity, never a carried reference price. The caller
 * starts this accumulator at world250, after all 250 warmup days. */
export class EconomicMetrics {
  constructor(stocks, firstWorldDay = 250) {
    assert.equal(stocks.length, 40);
    this.firstWorldDay = firstWorldDay;
    this.nextTick = firstWorldDay * 16;
    this.days = 0;
    this.stocks = stocks.map(stock => {
      assert.ok(stock.market === 'A' || stock.market === 'B');
      assert.ok(Number.isSafeInteger(stock.floatShares) && stock.floatShares > 0);
      return { id: stock.id, market: stock.market, floatShares: stock.floatShares, tradedDays: 0, longestZeroDays: 0, zeroStreak: 0,
        blockedBatches: 0, noCrossBatches: 0, volume: 0n, turnovers: [], todayQuantity: 0, todayBlocked: 0 };
    });
    assert.equal(new Set(this.stocks.map(stock => stock.id)).size, 40);
    for (const market of ['A', 'B']) assert.equal(this.stocks.filter(stock => stock.market === market).length, 20);
    this.markets = Object.fromEntries(['A', 'B'].map(market => [market, { longestAllZeroDays: 0, zeroStreak: 0, dailyTurnovers: [] }]));
  }
  record(trace) {
    assert.ok(trace && trace.clock && Array.isArray(trace.stocks), 'latestBatch trace is required');
    const at = trace.clock.worldDay * 16 + trace.clock.batch;
    assert.equal(at, this.nextTick, 'batch statistics skipped or duplicated a real batch');
    assert.equal(trace.stocks.length, 40);
    this.nextTick++;
    for (const stock of this.stocks) {
      const row = trace.stocks.find(row => row.stockId === stock.id);
      assert.ok(row, `missing actual batch ${stock.id}`);
      const quantity = row.clearing.quantity;
      assert.ok(Number.isSafeInteger(quantity) && quantity >= 0);
      assert.equal(row.clearing.price === null, quantity === 0);
      const blocked = quantity === 0 && row.indicative.quantity > 0 && row.indicative.price !== null && (row.indicative.price < row.low || row.indicative.price > row.high);
      stock.todayQuantity += quantity;
      stock.volume += BigInt(quantity);
      if (blocked) { stock.blockedBatches++; stock.todayBlocked++; }
      else if (quantity === 0 && row.indicative.quantity === 0) stock.noCrossBatches++;
    }
    if (trace.clock.batch !== 15) return null;
    this.days++;
    const daily = { worldDay: trace.clock.worldDay, playerDay: this.days, quantities: {}, blockedBatches: {} };
    for (const stock of this.stocks) {
      daily.quantities[stock.id] = stock.todayQuantity;
      daily.blockedBatches[stock.id] = stock.todayBlocked;
      if (stock.todayQuantity > 0) { stock.tradedDays++; stock.zeroStreak = 0; }
      else { stock.zeroStreak++; stock.longestZeroDays = Math.max(stock.longestZeroDays, stock.zeroStreak); }
      stock.turnovers.push(stock.todayQuantity / stock.floatShares);
    }
    for (const market of ['A', 'B']) {
      const state = this.markets[market];
      const members = this.stocks.filter(stock => stock.market === market);
      state.dailyTurnovers.push(members.reduce((total, stock) => total + stock.todayQuantity, 0) / members.reduce((total, stock) => total + stock.floatShares, 0));
      if (this.stocks.filter(stock => stock.market === market).every(stock => stock.todayQuantity === 0)) {
        state.zeroStreak++; state.longestAllZeroDays = Math.max(state.longestAllZeroDays, state.zeroStreak);
      } else state.zeroStreak = 0;
    }
    for (const stock of this.stocks) { stock.todayQuantity = 0; stock.todayBlocked = 0; }
    return daily;
  }
  summary() {
    assert.ok(this.days > 0 && this.nextTick % 16 === 0, 'statistics must end at a completed day');
    const minimumDays = Math.ceil(this.days * 4 / 5);
    const stocks = this.stocks.map(stock => ({ id: stock.id, market: stock.market, floatShares: stock.floatShares,
      tradedDays: stock.tradedDays, days: this.days, tradedDayFraction: stock.tradedDays / this.days, minimumDays, passes: stock.tradedDays >= minimumDays,
      totalQuantity: stock.volume.toString(), medianDailyTurnover: median(stock.turnovers), longestZeroDays: stock.longestZeroDays, blockedBatches: stock.blockedBatches, noCrossBatches: stock.noCrossBatches }));
    const markets = ['A', 'B'].map(market => {
      const members = stocks.filter(stock => stock.market === market);
      const qualifyingStocks = members.filter(stock => stock.passes).length;
      const turnover = median(members.map(stock => stock.medianDailyTurnover));
      return { market, stocks: 20, requiredStocks: 18, qualifyingStocks, minimumDays, days: this.days, passes: qualifyingStocks >= 18,
        longestAllZeroDays: this.markets[market].longestAllZeroDays, medianStockDailyTurnover: turnover,
        medianMarketDailyTurnover: median(this.markets[market].dailyTurnovers),
        turnoverDiagnostic: turnover < .002 || turnover > .05 ? 'outside-initial-diagnostic-range' : 'inside-initial-diagnostic-range' };
    });
    return { firstWorldDay: this.firstWorldDay, lastWorldDay: this.firstWorldDay + this.days - 1, playerDays: this.days, warmupIncluded: false,
      status: markets.every(market => market.passes) ? 'pass' : 'fail', threshold: 'each seed and each market: at least18/20 stocks each trading on at least80% completed player days', markets, stocks };
  }
}

export function auditBatch(summary, expectedTick) {
  assert.ok(summary && summary.audit && summary.latestBatch, 'diagnosticsSummary audit/latestBatch required');
  assert.equal(summary.latestBatch.clock.worldDay * 16 + summary.latestBatch.clock.batch, expectedTick);
  const audit = summary.audit;
  assert.equal(audit.cashDifference, 0n);
  assert.equal(audit.cash, audit.initialCash);
  assert.ok(audit.shares.every(stock => stock.difference === 0 && stock.total === stock.expected));
  for (const row of summary.latestBatch.stocks) {
    const clearing = row.clearing;
    for (const side of ['buyAllocations', 'sellAllocations']) assert.equal(clearing[side].reduce((total, fill) => total + fill.quantity, 0), clearing.quantity);
    assert.equal(clearing.price === null, clearing.quantity === 0);
    if (clearing.price !== null) assert.ok(clearing.price >= row.low && clearing.price <= row.high);
  }
  for (const item of summary.latestBatch.fees) {
    assert.equal(item.fee, (item.amount + 1999n) / 2000n);
    assert.equal(item.attribution.reduce((total, row) => total + row.fee, 0n), item.fee);
  }
  for (const wallet of summary.wallets) {
    assert.ok(wallet.cash >= 0n && wallet.reservedCash >= 0n && wallet.reservedCash <= wallet.cash, `invalid wallet ${wallet.id}`);
    if (wallet.availableCash !== undefined) assert.ok(wallet.availableCash >= 0n && wallet.availableCash <= wallet.cash);
    assert.equal(wallet.availableCash + wallet.reservedCash + wallet.pendingCash, wallet.cash, `cash subsets ${wallet.id}`);
    for (const holding of wallet.holdings) assert.ok(holding.quantity >= 0 && holding.sellable >= 0 && holding.reserved >= 0 && holding.reserved <= holding.sellable && holding.sellable <= holding.quantity, `shares subsets ${wallet.id}/${holding.stockId}`);
    for (const target of wallet.targets) assert.ok(target.hourUsed >= 0 && target.hourCapacity >= 0 && target.hourUsed <= target.hourCapacity, `hour capacity ${wallet.id}/${target.stockId}`);
  }
  for (const stock of audit.shares) assert.equal(summary.wallets.reduce((total, wallet) => total + (wallet.holdings.find(holding => holding.stockId === stock.stockId)?.quantity ?? 0), 0), stock.expected, `independent share total ${stock.stockId}`);
}
