/** Fixed, fictional fixtures at world day 288, hour 2. These are not simulation output. */
export type Stock = {
  id: string;
  name: string;
  market: "甲" | "乙";
  sector: string;
  concept: string;
  price: number;
  change: number;
  volume: string;
  turnover: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
};

export const stocks: Stock[] = [
  {
    id: "A001",
    name: "星源科技",
    market: "甲",
    sector: "数字与通信",
    concept: "算能扩建",
    price: 38.62,
    change: 3.48,
    volume: "128.6万",
    turnover: 4.26,
    high: 39.18,
    low: 37.08,
    open: 37.42,
    previousClose: 37.32,
  },
  {
    id: "A002",
    name: "澜川能源",
    market: "甲",
    sector: "能源与材料",
    concept: "储能革新",
    price: 24.85,
    change: 2.22,
    volume: "96.3万",
    turnover: 2.18,
    high: 25.12,
    low: 24.16,
    open: 24.25,
    previousClose: 24.31,
  },
  {
    id: "A003",
    name: "远岭重工",
    market: "甲",
    sector: "工业与运输",
    concept: "自动作业",
    price: 16.34,
    change: -1.21,
    volume: "82.7万",
    turnover: 1.76,
    high: 16.78,
    low: 16.18,
    open: 16.58,
    previousClose: 16.54,
  },
  {
    id: "A004",
    name: "白榆生活",
    market: "甲",
    sector: "消费与生活",
    concept: "跨境通道",
    price: 42.18,
    change: 0.76,
    volume: "34.8万",
    turnover: 0.92,
    high: 42.55,
    low: 41.58,
    open: 41.72,
    previousClose: 41.86,
  },
  {
    id: "A005",
    name: "青屿建设",
    market: "甲",
    sector: "基础设施与公用",
    concept: "城市更新",
    price: 9.76,
    change: -0.91,
    volume: "210.4万",
    turnover: 3.15,
    high: 9.98,
    low: 9.68,
    open: 9.89,
    previousClose: 9.85,
  },
  {
    id: "A006",
    name: "禾序生物",
    market: "甲",
    sector: "健康与生物",
    concept: "长寿技术",
    price: 57.3,
    change: 4.81,
    volume: "67.2万",
    turnover: 3.82,
    high: 57.88,
    low: 54.25,
    open: 54.8,
    previousClose: 54.67,
  },
  {
    id: "B001",
    name: "云岚数科",
    market: "乙",
    sector: "数字与通信",
    concept: "算能扩建",
    price: 86.24,
    change: 2.67,
    volume: "54.9万",
    turnover: 1.47,
    high: 87.36,
    low: 83.2,
    open: 83.85,
    previousClose: 84.0,
  },
  {
    id: "B002",
    name: "琥珀材料",
    market: "乙",
    sector: "能源与材料",
    concept: "循环资源",
    price: 31.56,
    change: -2.65,
    volume: "78.1万",
    turnover: 2.54,
    high: 32.72,
    low: 31.22,
    open: 32.48,
    previousClose: 32.42,
  },
  {
    id: "B003",
    name: "极光航运",
    market: "乙",
    sector: "工业与运输",
    concept: "跨境通道",
    price: 18.92,
    change: 1.45,
    volume: "112.8万",
    turnover: 3.06,
    high: 19.08,
    low: 18.43,
    open: 18.58,
    previousClose: 18.65,
  },
  {
    id: "B004",
    name: "林间消费",
    market: "乙",
    sector: "消费与生活",
    concept: "自动作业",
    price: 28.4,
    change: -0.49,
    volume: "43.5万",
    turnover: 1.12,
    high: 28.88,
    low: 28.16,
    open: 28.63,
    previousClose: 28.54,
  },
  {
    id: "B005",
    name: "沐光公用",
    market: "乙",
    sector: "基础设施与公用",
    concept: "储能革新",
    price: 12.68,
    change: 0,
    volume: "62.4万",
    turnover: 0.86,
    high: 12.86,
    low: 12.51,
    open: 12.62,
    previousClose: 12.68,
  },
  {
    id: "B006",
    name: "原野医研",
    market: "乙",
    sector: "健康与生物",
    concept: "长寿技术",
    price: 64.72,
    change: -1.77,
    volume: "38.6万",
    turnover: 1.94,
    high: 66.25,
    low: 64.18,
    open: 65.84,
    previousClose: 65.89,
  },
];

export type Candle = {
  label: string;
  shortLabel: string;
  completed: boolean;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const roundPrice = (value: number) => Math.round(value * 100) / 100;

/** Decorative, reproducible sample history; deliberately separate from sim-core. */
export function candlesFor(stock: Stock, period: "day" | "hour"): Candle[] {
  const count = 60;
  const stockOffset = stock.id.charCodeAt(0) + Number(stock.id.slice(1));
  const phase = stockOffset * 0.38;
  const hourly = period === "hour";
  const swing = hourly ? 0.014 : 0.048;
  const trend = hourly ? 0.0005 : 0.0023;
  const rawClose = (index: number) =>
    0.87 +
    index * trend +
    Math.sin(index * 0.2 + phase) * swing +
    Math.sin(index * 0.71 + phase) * swing * 0.31;
  // The last completed day and its final hour both close at the snapshot's previousClose.
  const scale = stock.previousClose / rawClose(hourly ? count - 3 : count - 1);
  let previous = roundPrice(rawClose(-1) * scale);

  return Array.from({ length: count }, (_, index) => {
    const close = roundPrice(rawClose(index) * scale);
    const open = roundPrice(
      previous * (1 + Math.sin(index * 2.7 + phase) * (hourly ? 0.001 : 0.004)),
    );
    const wick = stock.price * (hourly ? 0.002 : 0.006);
    const high = roundPrice(
      Math.max(open, close) + wick * (0.4 + Math.abs(Math.sin(index * 1.8))),
    );
    const low = roundPrice(
      Math.min(open, close) - wick * (0.4 + Math.abs(Math.cos(index * 1.3))),
    );
    const absoluteHour = 288 * 4 + 1 - (count - 1) + index;
    const day = hourly ? Math.floor(absoluteHour / 4) : 228 + index;
    const hour = (absoluteHour % 4) + 1;
    const volume = Math.round(
      (240000 +
        Math.abs(Math.sin(index * 1.47 + phase)) * 740000 +
        (Math.abs(close - open) / stock.price) * 14000000) /
        (hourly ? 4 : 1),
    );
    previous = close;

    // Only two hours of the current day are visible. Their OHLCV agrees with the snapshot.
    if (hourly && index >= count - 2) {
      const inProgress = index === count - 1;
      const middlePrice = roundPrice((stock.open + stock.price) / 2);
      const currentOpen = inProgress ? middlePrice : stock.open;
      const currentClose = inProgress ? stock.price : middlePrice;
      const dayVolume = Math.round(Number.parseFloat(stock.volume) * 10000);
      const firstHourVolume = Math.round(dayVolume * 0.61);
      return {
        label: `世界日 ${day} · 第 ${hour} 时${inProgress ? " · 进行中" : ""}`,
        shortLabel: `${day} / ${hour}时`,
        completed: !inProgress,
        open: currentOpen,
        high: inProgress
          ? Math.min(
              stock.high,
              roundPrice(Math.max(currentOpen, currentClose) + wick),
            )
          : stock.high,
        low: inProgress
          ? Math.max(
              stock.low,
              roundPrice(Math.min(currentOpen, currentClose) - wick),
            )
          : stock.low,
        close: currentClose,
        volume: inProgress ? dayVolume - firstHourVolume : firstHourVolume,
      };
    }

    return {
      label: hourly ? `世界日 ${day} · 第 ${hour} 时` : `世界日 ${day}`,
      shortLabel: hourly ? `${day} / ${hour}时` : `${day}`,
      completed: true,
      open,
      high,
      low,
      close,
      volume,
    };
  });
}
