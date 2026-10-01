import { ActionType, IndicatorSeries, init, registerIndicator, version } from 'klinecharts';
import type { Chart, Indicator, KLineData, Overlay } from 'klinecharts';
import type { WorkerReply, WorkerRequest } from '@big-a/sim-core';
import goldenText from '../../../docs/verification/fixtures/p0-numeric-golden.json?raw';

type Scale = 'day' | 'hour';
type ProbeCandle = KLineData & { completed: boolean; noTrade: boolean };
type MovingAverages = Record<string, number>;

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing probe element: ${id}`);
  return node as T;
}

function makeFixture(scale: Scale): ProbeCandle[] {
  const count = scale === 'day' ? 65 : 33;
  const interval = scale === 'day' ? 86_400_000 : 3_600_000;
  const start = Date.UTC(2026, 0, 1);
  let previous = 1000;
  return Array.from({ length: count }, (_, index) => {
    const noTrade = index === count - 5;
    const close = noTrade ? previous : 1000 + index * 4 + ((index % 7) - 3) * 9;
    const open = previous;
    const candle: ProbeCandle = {
      timestamp: start + index * interval,
      open: open / 100,
      high: noTrade ? previous / 100 : (Math.max(open, close) + 8) / 100,
      low: noTrade ? previous / 100 : (Math.min(open, close) - 8) / 100,
      close: close / 100,
      volume: noTrade ? 0 : 1000 + (index % 6) * 250,
      completed: index < count - 1,
      noTrade,
    };
    previous = close;
    return candle;
  });
}

// Override only the fixture indicator: no invented history or unfinished input.
function calculateMa(data: KLineData[], indicator: Indicator<MovingAverages>): MovingAverages[] {
  return data.map((bar, index) => {
    if (bar.completed !== true) return {};
    const result: MovingAverages = {};
    for (const rawWindow of indicator.calcParams) {
      const window = Number(rawWindow);
      if (index + 1 < window) continue;
      const slice = data.slice(index + 1 - window, index + 1);
      if (slice.some(item => item.completed !== true)) continue;
      // Display arithmetic only; market numerical protocol is tested separately.
      result[`ma${window}`] = slice.reduce((sum, item) => sum + item.close, 0) / window;
    }
    return result;
  });
}

registerIndicator<MovingAverages>({
  name: 'P0_MA', shortName: 'MA', series: IndicatorSeries.Price, precision: 2,
  calcParams: [5, 20, 60, 200],
  figures: [5, 20, 60, 200].map(window => ({ key: `ma${window}`, title: `MA${window}: `, type: 'line' })),
  calc: calculateMa,
});

const initialized = init(element('chart'));
if (!initialized) throw new Error('KLineChart initialization failed');
const chart: Chart = initialized;
chart.setTimezone('UTC');
chart.setPriceVolumePrecision(2, 0);
chart.setStyles('dark');
chart.setStyles({ candle: { bar: { upColor: '#f16975', downColor: '#36c99b',
  upBorderColor: '#f16975', downBorderColor: '#36c99b',
  upWickColor: '#f16975', downWickColor: '#36c99b' } } });
chart.setBarSpace(13);
chart.setOffsetRightDistance(60);
chart.createIndicator('VOL', false, { height: 90 });
chart.createIndicator('P0_MA', true, { id: 'candle_pane' });
chart.setPaneOptions({ id: 'candle_pane', gap: { top: 0.45, bottom: 0.12 } });

let scale: Scale = 'day';
let shortHistory = false;
let drawSequence = 0;
const lineIds: string[] = [];
let statusIds: string[] = [];
const workerTrace: { requestId: string; matchesGolden: boolean; payload: unknown }[] = [];
const workerErrors: string[] = [];
let workerSequence = 0;
const expected = JSON.parse(goldenText) as unknown;
const worker = new Worker(new URL('./p0-worker.ts', import.meta.url), { type: 'module' });

function indicatorResult(): MovingAverages[] {
  const value = chart.getIndicatorByPaneId('candle_pane', 'P0_MA');
  return value && 'result' in value ? value.result as MovingAverages[] : [];
}

function snapshot() {
  const data = chart.getDataList();
  const ma = indicatorResult();
  const overlays = lineIds.map(id => chart.getOverlayById(id)).filter((overlay): overlay is Overlay => overlay !== null);
  const periods = scale === 'day' ? [5, 20, 60, 200] : [5, 20];
  return {
    chartVersion: version(), scale, shortHistory,
    visibleRange: chart.getVisibleRange(), barSpace: chart.getBarSpace(),
    candles: data.map(bar => ({ timestamp: bar.timestamp, open: bar.open, high: bar.high,
      low: bar.low, close: bar.close, volume: bar.volume, completed: bar.completed, noTrade: bar.noTrade })),
    maPeriods: periods,
    indicator: ma,
    maLatestCompleted: ma[data.length - 2] ?? {},
    maLatestUnfinished: ma[data.length - 1] ?? {},
    overlays: overlays.map(overlay => ({ id: overlay.id, name: overlay.name,
      points: overlay.points, currentStep: overlay.currentStep })),
    statusAnnotations: statusIds.map(id => chart.getOverlayById(id)).filter(overlay => overlay !== null)
      .map(overlay => ({ id: overlay.id, text: overlay.extendData, points: overlay.points })),
    workerTrace, workerErrors,
    userAgent: navigator.userAgent,
    canvasCount: element('chart').querySelectorAll('canvas').length,
  };
}

function updateOutput() {
  const state = snapshot();
  const periods = state.maPeriods;
  element('ma-status').replaceChildren(...periods.map(window => {
    const span = document.createElement('span');
    const value = state.maLatestCompleted[`ma${window}`];
    span.textContent = `MA${window} ${value === undefined ? '历史不足' : value.toFixed(2)}`;
    return span;
  }));
  element('probe-output').textContent = JSON.stringify(state, null, 2);
  document.documentElement.dataset.probeReady = 'true';
}

function loadChart() {
  chart.removeOverlay({ groupId: 'p0-status' });
  chart.removeOverlay({ groupId: 'p0-lines' });
  const fixture = makeFixture(scale);
  const data = shortHistory ? fixture.slice(-5) : fixture;
  const periods = scale === 'day' ? [5, 20, 60, 200] : [5, 20];
  chart.overrideIndicator({ name: 'P0_MA', calcParams: periods,
    figures: periods.map(window => ({ key: `ma${window}`, title: `MA${window}: `, type: 'line' })) }, 'candle_pane');
  chart.applyNewData(data, false);
  statusIds = [];
  for (const bar of data.filter(item => item.noTrade || !item.completed)) {
    const id = `p0-status-${scale}-${bar.timestamp}`;
    statusIds.push(id);
    chart.createOverlay({ id, name: 'simpleAnnotation', groupId: 'p0-status', lock: true,
      points: [{ timestamp: bar.timestamp, value: bar.high }],
      extendData: bar.noTrade ? '无成交' : '进行中' });
  }
  element('day').setAttribute('aria-pressed', String(scale === 'day'));
  element('hour').setAttribute('aria-pressed', String(scale === 'hour'));
  element('short').setAttribute('aria-pressed', String(shortHistory));
  element('chart-status').textContent = `${scale === 'day' ? '日' : '小时'} K · ${data.length - 1} 根已完成 · 1 根进行中 · 无成交窗口 V=0，价格为平线`;
}

function draw(name: 'horizontalStraightLine' | 'straightLine') {
  const id = `p0-line-${++drawSequence}`;
  chart.createOverlay({ id, name, groupId: 'p0-lines', onDrawEnd: () => {
    element('chart-status').textContent = `${name === 'straightLine' ? '趋势线' : '水平线'}已完成 · 可删除画线`;
    updateOutput();
    return false;
  } });
  lineIds.push(id);
  element('chart-status').textContent = name === 'straightLine' ? '在图中点击两个点绘制趋势线' : '在图中点击一个点绘制水平线';
}

function runWorker() {
  const request: WorkerRequest = { requestId: `p0-request-${++workerSequence}`, expectedStateVersion: 0,
    operation: 'numericProbe', payload: null };
  element('worker-status').textContent = `等待 ${request.requestId}`;
  worker.postMessage(request);
}

worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
  const reply = event.data;
  const matchesGolden = JSON.stringify(reply.payload) === JSON.stringify(expected);
  workerTrace.push({ requestId: reply.requestId, matchesGolden, payload: reply.payload });
  element('worker-status').textContent = `${reply.requestId} · ${matchesGolden ? '逐字段一致' : '与黄金样本不一致'} · stateVersion=${reply.stateVersion}`;
  updateOutput();
});
worker.addEventListener('error', event => {
  workerErrors.push(event.message);
  element('worker-status').textContent = `Worker 失败：${event.message}`;
  updateOutput();
});
chart.subscribeAction(ActionType.OnDataReady, () => {
  chart.setBarSpace(shortHistory ? 40 : 13);
  chart.scrollToRealTime();
  updateOutput();
});
new ResizeObserver(() => chart.resize()).observe(element('chart'));
element('day').addEventListener('click', () => { scale = 'day'; loadChart(); });
element('hour').addEventListener('click', () => { scale = 'hour'; loadChart(); });
element('short').addEventListener('click', () => { shortHistory = !shortHistory; loadChart(); });
element('horizontal').addEventListener('click', () => draw('horizontalStraightLine'));
element('trend').addEventListener('click', () => draw('straightLine'));
element('remove').addEventListener('click', () => {
  chart.removeOverlay({ groupId: 'p0-lines' });
  element('chart-status').textContent = '画线已删除';
  updateOutput();
});
element('worker').addEventListener('click', runWorker);

// Read-only diagnostics for the local engineering runner; never a trading API.
Object.defineProperty(window, 'p0Probe', { value: { read: snapshot }, writable: false });
loadChart();
runWorker();
