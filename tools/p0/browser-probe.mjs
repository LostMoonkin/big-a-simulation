import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runNumericProbe } from './numeric-probe.ts';

const [url = 'http://127.0.0.1:5173/p0-probe.html', executable = 'C:/Program Files/Google/Chrome/Application/chrome.exe', outputArg = 'artifacts/verification/p0/browser-dev'] = process.argv.slice(2);
const output = resolve(outputArg);
const runtime = process.env.P0_PLAYWRIGHT_PATH ?? 'C:/Users/ymbn0/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: executable, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const checks = [];
const states = {};
const golden = runNumericProbe();
const read = () => page.evaluate(() => window.p0Probe.read());
const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const check = (id, description, assertion) => {
  assertion();
  checks.push({ id, description, status: 'pass' });
};
try {
  await page.goto(url);
  await page.waitForFunction(() => window.p0Probe?.read().workerTrace.length > 0);
  await page.waitForFunction(() => window.p0Probe?.read().indicator.length === 65);
  await paint();
  states.day = await read();
  check('chart-initialize', 'Real canvas chart initializes at locked version', () => {
    assert.equal(states.day.chartVersion, '9.8.12');
    assert.ok(states.day.canvasCount > 0);
    assert.equal(states.day.candles.length, 65);
  });
  check('day-ma', 'Daily MA5/20/60 values and unavailable MA200 use completed windows', () => {
    assert.deepEqual(states.day.maPeriods, [5, 20, 60, 200]);
    for (const n of [5, 20, 60]) assert.equal(typeof states.day.maLatestCompleted[`ma${n}`], 'number');
    assert.equal(states.day.maLatestCompleted.ma200, undefined);
    assert.deepEqual(states.day.maLatestUnfinished, {});
    assert.equal(states.day.indicator[3].ma5, undefined);
    assert.equal(typeof states.day.indicator[4].ma5, 'number');
  });
  check('zero-volume', 'No-trade candle is a marked flat line with V=0', () => {
    const flat = states.day.candles.filter(bar => bar.noTrade);
    assert.equal(flat.length, 1);
    assert.equal(flat[0].volume, 0);
    assert.equal(flat[0].open, flat[0].close);
    assert.equal(flat[0].high, flat[0].low);
    assert.equal(flat[0].high, flat[0].close);
    assert.deepEqual(states.day.statusAnnotations.map(marker => marker.text).sort(), ['无成交', '进行中']);
  });
  check('worker-golden', 'Actual Worker equals freshly executed Node golden field for field', () => {
    assert.deepEqual(states.day.workerTrace[0].payload, golden);
    assert.equal(states.day.workerTrace[0].matchesGolden, true);
    assert.deepEqual(states.day.workerErrors, []);
  });
  await page.screenshot({ path: resolve(output, 'day.png'), fullPage: true });
  await page.locator('#hour').click();
  await page.waitForFunction(() => window.p0Probe.read().indicator.length === 33);
  await paint();
  states.hour = await read();
  check('hour-switch', 'Switching to actual hourly fixture replaces chart and MA windows', () => {
    assert.equal(states.hour.scale, 'hour');
    assert.equal(states.hour.candles.length, 33);
    assert.deepEqual(states.hour.maPeriods, [5, 20]);
    assert.deepEqual(Object.keys(states.hour.maLatestCompleted).sort(), ['ma20', 'ma5']);
    assert.deepEqual(states.hour.maLatestUnfinished, {});
    assert.equal(states.hour.candles[1].timestamp - states.hour.candles[0].timestamp, 3_600_000);
  });
  await page.screenshot({ path: resolve(output, 'hour.png'), fullPage: true });
  await page.locator('#short').click();
  await page.waitForFunction(() => window.p0Probe.read().indicator.length === 5);
  await paint();
  states.short = await read();
  check('insufficient-history', 'Only four completed bars show MA unavailable without copied history', () => {
    assert.equal(states.short.candles.filter(bar => bar.completed).length, 4);
    assert.ok(states.short.indicator.every(ma => Object.keys(ma).length === 0));
  });
  await page.screenshot({ path: resolve(output, 'short-history.png'), fullPage: true });
  await page.locator('#short').click();
  await page.waitForFunction(() => window.p0Probe.read().indicator.length === 33);
  await paint();
  const bounds = await page.locator('#chart').boundingBox();
  assert.ok(bounds);
  await page.locator('#horizontal').click();
  await page.mouse.click(bounds.x + 350, bounds.y + 140);
  await page.waitForFunction(() => window.p0Probe.read().overlays.some(line => line.name === 'horizontalStraightLine' && line.points.length === 1));
  states.horizontal = await read();
  check('draw-horizontal', 'Toolbar and real pointer input create a horizontal line', () => {
    assert.equal(states.horizontal.overlays.length, 1);
    assert.equal(states.horizontal.overlays[0].points.length, 1);
    assert.equal(states.horizontal.overlays[0].currentStep, -1);
  });
  // KLineChart v9 suppresses a second canvas click inside its 500 ms double-click window.
  await page.waitForTimeout(550);
  await page.locator('#trend').click();
  await page.mouse.click(bounds.x + bounds.width * 0.68, bounds.y + 220);
  await page.waitForFunction(() => window.p0Probe.read().overlays.some(line => line.name === 'straightLine' && line.currentStep === 2));
  states.trendFirstClick = await read();
  await page.waitForTimeout(550);
  await page.mouse.click(bounds.x + bounds.width * 0.84, bounds.y + 140);
  states.trendSecondClick = await read();
  await page.waitForFunction(() => window.p0Probe.read().overlays.some(line => line.name === 'straightLine' && line.points.length === 2 && line.currentStep === -1));
  states.lines = await read();
  check('draw-trend', 'Toolbar and two real pointer points create a trend line', () => {
    assert.equal(states.lines.overlays.length, 2);
    assert.equal(states.lines.overlays.find(line => line.name === 'straightLine').points.length, 2);
  });
  await page.screenshot({ path: resolve(output, 'drawn-lines.png'), fullPage: true });
  await page.locator('#remove').click();
  states.removed = await read();
  check('remove-lines', 'Deleting lines removes actual library overlays', () => assert.equal(states.removed.overlays.length, 0));
  await page.locator('#worker').click();
  await page.waitForFunction(() => window.p0Probe.read().workerTrace.length === 2);
  states.repeatedWorker = await read();
  check('worker-request-ids', 'Repeated real Worker requests preserve identity and equal numeric output', () => {
    assert.deepEqual(states.repeatedWorker.workerTrace.map(reply => reply.requestId), ['p0-request-1', 'p0-request-2']);
    assert.ok(states.repeatedWorker.workerTrace.every(reply => reply.matchesGolden));
    assert.deepEqual(states.repeatedWorker.workerTrace[1].payload, golden);
  });
  check('browser-errors', 'No page or console error occurred during the probe', () => assert.deepEqual(errors, []));
  const result = { status: 'pass', browserVersion: browser.version(), browserExecutable: executable,
    runtime, url, nodeVersion: process.version, viewport: { width: 1280, height: 960 },
    recordedAt: new Date().toISOString(), checks, states, errors };
  await writeFile(resolve(output, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ status: result.status, browserVersion: result.browserVersion, checks: checks.length, output }));
} catch (error) {
  states.failure = await read().catch(() => null);
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ status: 'fail', message: error.message, checks, states, errors }, null, 2) + '\n');
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}

