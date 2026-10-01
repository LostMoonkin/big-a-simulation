import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { candlesFor } from "./market-demo";
import type { Stock } from "./market-demo";

type MarketChartProps = {
  stock: Stock;
  period: "day" | "hour";
  showAverage: boolean;
};

const LEFT = 14;
const TOP = 26;
const gridColor = "#1c232b";
const mutedColor = "#677481";

export function MarketChart({ stock, period, showAverage }: MarketChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(1000);
  const WIDTH = chartWidth;
  const HEIGHT = Math.round(Math.max(300, Math.min(426, WIDTH * 0.43)));
  const RIGHT = WIDTH - 65;
  const PRICE_BOTTOM = HEIGHT - 118;
  const VOLUME_TOP = HEIGHT - 91;
  const VOLUME_BOTTOM = HEIGHT - 33;
  const timeTicks = WIDTH < 550 ? [0, 29, 59] : [0, 12, 24, 36, 48, 59];
  const candles = useMemo(() => candlesFor(stock, period), [stock, period]);
  const [inspection, setInspection] = useState<{
    stockId: string;
    period: string;
    index: number;
    y: number;
  } | null>(null);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setChartWidth(Math.max(300, Math.min(1000, Math.round(entry.contentRect.width))));
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const active =
    inspection?.stockId === stock.id && inspection.period === period
      ? inspection
      : null;
  const inspectionY = Math.max(TOP, Math.min(PRICE_BOTTOM, active?.y ?? TOP));
  const selectedIndex = active?.index ?? candles.length - 1;
  const candle = candles[selectedIndex]!;
  const latest = candles[candles.length - 1]!;
  const latestPrevious = candles[candles.length - 2]!;
  const latestDirection =
    latest.close >= latestPrevious.close ? "var(--up)" : "var(--down)";
  const high = Math.max(...candles.map((point) => point.high));
  const low = Math.min(...candles.map((point) => point.low));
  const padding = (high - low) * 0.14;
  const topPrice = high + padding;
  const bottomPrice = low - padding;
  const maxVolume = Math.max(...candles.map((point) => point.volume));
  const step = (RIGHT - LEFT) / candles.length;
  const xFor = (index: number) => LEFT + (index + 0.5) * step;
  const yFor = (price: number) =>
    TOP +
    ((topPrice - price) / (topPrice - bottomPrice)) * (PRICE_BOTTOM - TOP);
  const priceAt = (y: number) =>
    topPrice - ((y - TOP) / (PRICE_BOTTOM - TOP)) * (topPrice - bottomPrice);
  const averageFor = (index: number, length: number) =>
    index < length - 1 || !candles[index]?.completed
      ? null
      : candles
          .slice(index - length + 1, index + 1)
          .reduce((sum, point) => sum + point.close, 0) / length;
  const averagePath = (length: number) =>
    candles
      .flatMap((_, index) => {
        const average = averageFor(index, length);
        return average === null
          ? []
          : [
              `${index === length - 1 ? "M" : "L"}${xFor(index).toFixed(2)},${yFor(average).toFixed(2)}`,
            ];
      })
      .join(" ");
  const previousClose = candles[selectedIndex - 1]?.close ?? candle.open;
  const change = ((candle.close - previousClose) / previousClose) * 100;
  const changeColor =
    change > 0 ? "var(--up)" : change < 0 ? "var(--down)" : "#84919d";
  const direction = candle.close >= candle.open ? "var(--up)" : "var(--down)";
  const averageIndex = candle.completed ? selectedIndex : selectedIndex - 1;
  const ma5 = averageFor(averageIndex, 5);
  const ma20 = averageFor(averageIndex, 20);

  const inspectPointer = (event: PointerEvent<SVGSVGElement>) => {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    const index = Math.max(
      0,
      Math.min(candles.length - 1, Math.floor((point.x - LEFT) / step)),
    );
    setInspection({
      stockId: stock.id,
      period,
      index,
      y: Math.max(TOP, Math.min(PRICE_BOTTOM, point.y)),
    });
  };

  const inspectKeyboard = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "Escape") {
      setInspection(null);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = Math.max(
      0,
      Math.min(
        candles.length - 1,
        selectedIndex + (event.key === "ArrowLeft" ? -1 : 1),
      ),
    );
    setInspection({
      stockId: stock.id,
      period,
      index,
      y: yFor(candles[index]!.close),
    });
  };

  return (
    <div className="market-chart" ref={hostRef}>
      <div
        className="chart-inspection"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "5px 14px",
          minHeight: 23,
          fontSize: 11,
          fontVariantNumeric: "tabular-nums",
          color: "#84919d",
        }}
      >
        <span style={{ color: "#a8b4be" }}>{candle.label}</span>
        {period === "day" && (
          <span style={{ color: "#677481" }}>已完成日线</span>
        )}
        {period === "hour" && !candle.completed && showAverage && WIDTH < 550 && (
          <span style={{ color: "#677481" }}>均线：已完成小时</span>
        )}
        <span>
          开{" "}
          <b style={{ color: "#c5ced5", fontWeight: 500 }}>
            {candle.open.toFixed(2)}
          </b>
        </span>
        <span>
          高{" "}
          <b style={{ color: "#c5ced5", fontWeight: 500 }}>
            {candle.high.toFixed(2)}
          </b>
        </span>
        <span>
          低{" "}
          <b style={{ color: "#c5ced5", fontWeight: 500 }}>
            {candle.low.toFixed(2)}
          </b>
        </span>
        <span>
          收{" "}
          <b style={{ color: direction, fontWeight: 500 }}>
            {candle.close.toFixed(2)}
          </b>
        </span>
        <span style={{ color: changeColor }}>
          {change >= 0 ? "+" : ""}
          {change.toFixed(2)}%
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${stock.name}${period === "day" ? "日" : "小时"} K 线演示图，60 根蜡烛。左右方向键查看，Escape 退出查看。`}
        tabIndex={0}
        onPointerMove={inspectPointer}
        onPointerLeave={() => setInspection(null)}
        onKeyDown={inspectKeyboard}
        onBlur={() => setInspection(null)}
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          overflow: "visible",
          cursor: "crosshair",
        }}
      >
        <title>{stock.name} · 固定示例行情</title>
        <g
          fontFamily="inherit"
          fontSize="11"
          fill={mutedColor}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {Array.from({ length: 5 }, (_, index) => {
            const y = TOP + (index * (PRICE_BOTTOM - TOP)) / 4;
            return (
              <g key={`price-${index}`}>
                <line
                  x1={LEFT}
                  y1={y}
                  x2={RIGHT}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 5"
                />
                <text x={RIGHT + 13} y={y + 4}>
                  {priceAt(y).toFixed(2)}
                </text>
              </g>
            );
          })}
          {timeTicks.map((index) => (
            <g key={`time-${index}`}>
              <line
                x1={xFor(index)}
                y1={TOP}
                x2={xFor(index)}
                y2={VOLUME_BOTTOM}
                stroke={gridColor}
                strokeDasharray="3 5"
              />
              <text
                x={xFor(index)}
                y={HEIGHT - 11}
                textAnchor={
                  index === 0 ? "start" : index === 59 ? "end" : "middle"
                }
              >
                {candles[index]!.shortLabel}
              </text>
            </g>
          ))}
          <line
            x1={LEFT}
            y1={VOLUME_TOP - 9}
            x2={RIGHT}
            y2={VOLUME_TOP - 9}
            stroke={gridColor}
          />
          <text x={LEFT} y={VOLUME_TOP + 8}>
            VOL
          </text>
          <text x={LEFT + 32} y={VOLUME_TOP + 8} fill={direction}>
            {(candle.volume / 10000).toFixed(1)}万
          </text>
          <text x={RIGHT + 13} y={VOLUME_TOP + 8}>
            {(maxVolume / 10000).toFixed(0)}万
          </text>
          <text x={RIGHT + 13} y={VOLUME_BOTTOM}>
            0
          </text>
          <text x={RIGHT + 13} y={HEIGHT - 11}>
            世界日
          </text>
        </g>
        {candles.map((point, index) => {
          const x = xFor(index);
          const color = point.close >= point.open ? "var(--up)" : "var(--down)";
          const bodyTop = yFor(Math.max(point.open, point.close));
          const bodyHeight = Math.max(
            1.5,
            Math.abs(yFor(point.open) - yFor(point.close)),
          );
          const volumeHeight =
            (point.volume / maxVolume) * (VOLUME_BOTTOM - VOLUME_TOP - 13);
          return (
            <g key={index}>
              <line
                x1={x}
                y1={yFor(point.high)}
                x2={x}
                y2={yFor(point.low)}
                stroke={color}
                strokeWidth="1.2"
              />
              <rect
                x={x - step * 0.28}
                y={bodyTop}
                width={step * 0.56}
                height={bodyHeight}
                fill={color}
              />
              <rect
                x={x - step * 0.28}
                y={VOLUME_BOTTOM - volumeHeight}
                width={step * 0.56}
                height={volumeHeight}
                fill={color}
                opacity="0.52"
              />
            </g>
          );
        })}
        {showAverage && (
          <g
            fill="none"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <path d={averagePath(5)} stroke="#e0ba72" />
            <path d={averagePath(20)} stroke="#7d91dc" />
          </g>
        )}
        {showAverage && (
          <g
            fontFamily="inherit"
            fontSize="11"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            <text x={LEFT} y={12} fill="#e0ba72">
              MA5 {ma5 === null ? "历史不足" : ma5.toFixed(2)}
            </text>
            <text x={LEFT + 118} y={12} fill="#7d91dc">
              MA20 {ma20 === null ? "历史不足" : ma20.toFixed(2)}
            </text>
            {!candle.completed && WIDTH >= 550 && (
              <text x={LEFT + 248} y={12} fill={mutedColor}>
                均线截至已完成小时
              </text>
            )}
          </g>
        )}
        <line
          x1={LEFT}
          y1={yFor(latest.close)}
          x2={RIGHT}
          y2={yFor(latest.close)}
          stroke={latestDirection}
          opacity="0.5"
          strokeDasharray="5 5"
        />
        <rect
          x={RIGHT + 1}
          y={yFor(latest.close) - 10}
          width="64"
          height="21"
          rx="2"
          fill={latestDirection}
        />
        <text
          x={RIGHT + 33}
          y={yFor(latest.close) + 4}
          textAnchor="middle"
          fontSize="11"
          fontFamily="inherit"
          fontWeight="600"
          fill="#07100c"
        >
          {latest.close.toFixed(2)}
        </text>
        {active && (
          <g pointerEvents="none">
            <line
              x1={xFor(selectedIndex)}
              y1={TOP}
              x2={xFor(selectedIndex)}
              y2={VOLUME_BOTTOM}
              stroke="#8b99a6"
              strokeDasharray="4 4"
            />
            <line
              x1={LEFT}
              y1={inspectionY}
              x2={RIGHT}
              y2={inspectionY}
              stroke="#8b99a6"
              strokeDasharray="4 4"
            />
            <rect
              x={RIGHT + 1}
              y={inspectionY - 10}
              width="64"
              height="21"
              rx="2"
              fill="#d4dde4"
            />
            <text
              x={RIGHT + 33}
              y={inspectionY + 4}
              textAnchor="middle"
              fontFamily="inherit"
              fontSize="11"
              fill="#10151a"
            >
              {priceAt(inspectionY).toFixed(2)}
            </text>
            <rect
              x={Math.max(
                LEFT,
                Math.min(RIGHT - 109, xFor(selectedIndex) - 54),
              )}
              y={HEIGHT - 28}
              width="109"
              height="23"
              rx="2"
              fill="#25313d"
            />
            <text
              x={Math.max(LEFT + 54, Math.min(RIGHT - 55, xFor(selectedIndex)))}
              y={HEIGHT - 12}
              textAnchor="middle"
              fontFamily="inherit"
              fontSize="11"
              fill="#e0e6ed"
            >
              {period === "day"
                ? `世界日 ${candle.shortLabel}`
                : candle.shortLabel}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export default MarketChart;
