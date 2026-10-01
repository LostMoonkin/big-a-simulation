import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONTENT_VERSION, RULES_VERSION, createMarketCore, decodeExact, encodeExact } from '../../packages/sim-core/src/index.ts';
import { identity, p2Identity, p2Manifest, writeJson } from '../sim-runner/p2-runtime.mjs';

const [url = 'http://127.0.0.1:5173/', outputArg = 'artifacts/verification/p2/browser-full', mode = 'full', fixtureInput] = process.argv.slice(2);
const output = resolve(outputArg); await mkdir(output, { recursive: true });
const browserPaths = ['apps/web/src', 'apps/web/index.html', 'apps/web/vite.config.ts', 'apps/web/package.json', 'apps/web/tsconfig.json', 'tools/web-checks'];
const sourceAtStart = p2Identity(), browserAtStart = identity(browserPaths);
const manifestAtStart = { ...p2Manifest(`node tools/web-checks/browser-check.mjs ${url} ${outputArg} ${mode}`),
  browserSourceHash: browserAtStart.sourceHash, browserFiles: browserAtStart.files };
writeJson(resolve(output, 'manifest.json'), manifestAtStart);
const runtime = process.env.P2_PLAYWRIGHT_PATH ?? 'C:/Users/ymbn0/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const executable = process.env.P2_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { chromium } = await import(pathToFileURL(runtime).href);
const browser = await chromium.launch({ executablePath: executable, headless: true });
let page = await browser.newPage({ viewport: { width: 1560, height: 1100 }, acceptDownloads: true });
const errors = [], checks = [], evidence = {}, startedAt = Date.now();
async function configurePage() {
page.setDefaultTimeout(180000);
page.on('pageerror', error => errors.push(error.message));
page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
await page.addInitScript(() => {
  const OriginalWorker = window.Worker;
  window.__p2 = { view: null, requests: [], replies: [], workers: 0, progress: [] };
  window.Worker = class extends OriginalWorker {
    constructor(...args) {
      super(...args); window.__p2.workers++;
      this.addEventListener('message', event => { const reply = event.data; if (reply.view) window.__p2.view = reply.view;
        if (reply.kind === 'result') window.__p2.replies.push(reply);
        if (reply.progress) window.__p2.progress.push(reply.progress);
      });
    }
    postMessage(message, ...args) { window.__p2.requests.push(message); return super.postMessage(message, ...args); }
  };
});
}
await configurePage();
const publicView = () => page.evaluate(() => JSON.stringify(window.__p2.view, (_key, value) => typeof value === 'bigint' ? { $bigint: value.toString() } : value));
const read = async () => decodeExact(await publicView());
const parseCaptured = text => decodeExact(text);
const capture = expression => page.evaluate(expression).then(parseCaptured);
const capturedReply = async (operation, firstRequest) => {
  await page.waitForFunction(({ operation, firstRequest }) => window.__p2.requests.slice(firstRequest).some(request => request.operation === operation && window.__p2.replies.some(reply => reply.requestId === request.requestId)), { operation, firstRequest });
  return capture(() => { const state = window.__p2; const request = state.requests.slice(window.__p2.firstRequest).find(r => r.operation === window.__p2.awaitOperation && state.replies.some(p => p.requestId === r.requestId));
    return JSON.stringify({ request, reply: state.replies.find(p => p.requestId === request.requestId) }, (_key, value) => typeof value === 'bigint' ? { $bigint: value.toString() } : value); });
};
async function operation(operation, action) {
  const firstRequest = await page.evaluate(() => window.__p2.requests.length);
  await page.evaluate(({ operation, firstRequest }) => { window.__p2.firstRequest = firstRequest; window.__p2.awaitOperation = operation; }, { operation, firstRequest });
  await action(); const result = await capturedReply(operation, firstRequest);
  assert.equal(result.reply.error, undefined, JSON.stringify(result.reply.error));
  await page.waitForFunction(() => !document.querySelector('[data-testid="cancel-run"]'));
  return result;
}
const check = (id, ac, data = {}) => { checks.push({ id, ac, status: 'pass', data }); console.log(`PASS ${id}`); };
async function download(name) {
  const promise = page.waitForEvent('download'); await operation('export', () => page.getByTestId('export').click());
  const file = await promise, path = resolve(output, `${name}.json`); await file.saveAs(path); return { path, snapshot: decodeExact(await readFile(path, 'utf8')) };
}
async function importFile(path) { return operation('import', () => page.getByLabel('导入存档文件').setInputFiles(path)); }
let reference;
async function prepare() {
  if ((await read()).phase === 'settled') { await operation('prepare', () => page.getByTestId('prepare').click()); reference?.prepareNextBatch(); }
}
function replayAdvance(reply) {
  if (!reference) return;
  const result = reply.advance, at = result.clock.worldDay * 16 + result.clock.batch;
  if (result.completedBatches) reference.advance({ stop: { worldDay: Math.floor((at - (result.phase === 'publicDecision' ? 1 : 0)) / 16), batch: (at - (result.phase === 'publicDecision' ? 1 : 0)) % 16 }, maxBatches: result.completedBatches, pauseOnMajor: false });
  if (result.phase === 'publicDecision') reference.prepareNextBatch();
}
async function step(button = 'step-batch') { const { reply } = await operation('advance', () => page.getByTestId(button).click()); replayAdvance(reply); return reply; }
async function fast(days) { await page.getByLabel('快进天数').fill(String(days)); const { reply } = await operation('advance', () => page.getByTestId('fast-forward').click()); replayAdvance(reply); return reply; }
async function selectStock(id) {
  await page.getByRole('button', { name: '交易终端', exact: true }).click();
  await page.locator('.market-tabs').getByRole('button', { name: '全部', exact: true }).click();
  await page.getByLabel('行业筛选').selectOption(''); await page.getByLabel('概念筛选').selectOption(''); await page.getByLabel('搜索股票或业务').fill('');
  await page.locator(`[data-stock-id="${id}"] .stock-select`).click();
  await page.waitForFunction(id => document.querySelector('[data-testid="selected-stock-id"]')?.textContent === id && window.__p2.view.bars[0]?.stockId === id, id);
}
async function submit(side, kind, quantity, price, endAt, accepted = true, reason) {
  await page.locator('.side-switch').getByRole('button', { name: side === 'buy' ? '买入' : '卖出', exact: true }).click();
  await page.locator('#order-type').selectOption(kind); await page.locator('#order-price').fill((price / 100).toFixed(2)); await page.locator('#order-quantity').fill(String(quantity));
  if (endAt) { await page.locator('#plan-end-day').fill(String(endAt.worldDay)); await page.locator('#plan-end-hour').selectOption(String((endAt.batch + 1) / 4)); }
  const result = await operation('command', () => page.getByTestId('submit-order').click());
  assert.equal(result.reply.command.accepted, accepted, result.reply.command.detail);
  if (reason) assert.equal(result.reply.command.reason, reason);
  if (reference) assert.deepEqual(reference.submitCommand(result.request.payload.command), result.reply.command);
  return result.reply.command;
}
async function compare(name) { const saved = await download(name); if (reference) assert.equal(saved.snapshot.checksum, reference.exportSnapshot().checksum, `${name} Node/Worker full-state checksum`); return saved; }
async function continueTo(worldDay) {
  let pauses = 0;
  while (true) { const before = await read(); if (before.clock.worldDay === worldDay && before.clock.batch === 15 && before.phase === 'settled') break;
    const days = worldDay - before.clock.worldDay + (before.phase === 'publicDecision' && before.clock.batch === 0 ? 1 : 0);
    const reply = days > 0 ? await fast(days) : await step('step-day');
    if (reply.advance.reason === 'majorMessage') {
      pauses++; assert.equal(reply.view.phase, 'publicDecision');
      const saved = await compare(`notification-window-${worldDay}-${pauses}`), body = decodeExact(saved.snapshot.payload);
      const at = body.clock.worldDay * 16 + body.clock.batch;
      assert.equal(body.world.lastSettledTick, at - 1);
      assert.ok(!body.orders.some(order => order.accountId !== 'player' && ['active', 'partial'].includes(order.status)));
      const held = id => body.accounts.find(account => account.id === 'player').lots.some(lot => lot.stockId === id && lot.quantity > 0);
      const reports = body.world.majorStockIds.filter(held).map(id => body.messages.find(message => message.id === `report:${id}` && message.publishedAt.worldDay * 16 + message.publishedAt.batch === at && message.text.includes('变动至少5%')));
      assert.ok(reports.every(Boolean));
      if (reports.length) assert.equal(body.clock.batch, 0);
      const protection = body.messages.filter(message => message.id.startsWith('protection:') && held(message.id.split(':')[1]) && message.publishedAt.worldDay * 16 + message.publishedAt.batch === at - 1);
      assert.ok(reports.length || protection.length, 'held notification pause needs a current report or previous-batch protection announcement');
      const window = { checksum: saved.snapshot.checksum, clock: saved.snapshot.clock, phase: saved.snapshot.phase, lastSettledTick: body.world.lastSettledTick,
        reportIds: reports.map(message => message.id), protectionAnnouncements: protection.map(message => ({ id: message.id, publishedAt: message.publishedAt, text: message.text })), npcClearingBatchesAtWindow: 0 };
      (evidence.notificationPauses ??= []).push(window);
    }
  }
  return pauses;
}
async function fixedReportCase(checkpointPath) {
  const nodeOut=resolve(output,'fixed-report-node');
  execFileSync(process.execPath,['tools/sim-runner/p2-major-fixture.mjs','--input',checkpointPath,'--out',nodeOut],{stdio:'pipe',windowsHide:true});
  const fixtureResult=decodeExact(await readFile(resolve(nodeOut,'results.json'),'utf8'));
  assert.equal(fixtureResult.status,'pass'); assert.equal(fixtureResult.naturalEconomicEvidence,false);
  const inputPath=resolve(nodeOut,'major-input-snapshot.json'),input=decodeExact(await readFile(inputPath,'utf8'));
  await importFile(inputPath); reference=createMarketCore(); assert.equal(reference.restoreSnapshot(input).restored,true);
  const reply=await fast(2); assert.equal(reply.advance.reason,'majorMessage'); assert.equal(reply.advance.completedBatches,0);
  assert.deepEqual(reply.view.clock,fixtureResult.clock); assert.equal(reply.view.phase,'publicDecision');
  assert.ok(reply.view.messages.some(message=>message.id==='report:A002'&&message.text.includes('变动至少5%')));
  const paused=await compare('fixed-report-public-window'); assert.equal(paused.snapshot.checksum,fixtureResult.pausedChecksum);
  await page.screenshot({path:resolve(output,'fixed-report-paused.png'),fullPage:true});
  const publicVersion=reply.view.publicVersion,reportCount=reply.view.messages.length;
  await importFile(paused.path); assert.equal((await read()).publicVersion,publicVersion); assert.equal((await read()).messages.length,reportCount);
  assert.equal((await compare('fixed-report-restored-window')).snapshot.checksum,paused.snapshot.checksum);
  // After restore, first click acknowledges the existing decision-window report;
  // the second explicit continuation clears exactly one batch.
  const first=await step(); assert.equal(first.advance.reason,'majorMessage'); assert.equal(first.advance.completedBatches,0);
  const next=await step(); assert.equal(next.advance.completedBatches,1); assert.equal(next.view.phase,'settled');
  await compare('fixed-report-after-explicit-continue');
  evidence.fixedMajor={scope:'fixed-hidden-input-only',naturalEconomicEvidence:false,input:checkpointPath,nodeResult:resolve(nodeOut,'results.json'),inputChecksum:fixtureResult.inputChecksum,pausedChecksum:paused.snapshot.checksum,clock:fixtureResult.clock,phase:'publicDecision',restoredPublicVersion:publicVersion,clearingBatchesBeforePause:0,duplicatesAfterRestore:0};
  check('fixed-held-report-before-npc-clear-and-public-window-restore','P2-AC6/7',evidence.fixedMajor);
}
try {
  await page.goto(url);
  await page.getByTestId('create-world').waitFor();
  assert.equal(await page.getByTestId('market-app').getAttribute('data-phase'), 'empty');
  if(mode==='major-only'){
    assert.ok(fixtureInput,'major-only requires an actual browser checkpoint path');
    await fixedReportCase(fixtureInput);
  }else{
  if (mode === 'full') {
    const first = await page.evaluate(() => window.__p2.requests.length);
    await page.getByTestId('create-world').click(); await page.getByTestId('warmup-progress').waitFor();
    await page.getByRole('button', { name: '取消预热', exact: true }).click();
    await page.waitForFunction(first => window.__p2.requests.slice(first).some(request => request.operation === 'create' && window.__p2.replies.some(reply => reply.requestId === request.requestId && reply.cancelled)), first);
    await page.getByTestId('create-world').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('[data-testid="create-world"]').disabled);
    assert.equal(await page.getByTestId('market-app').getAttribute('data-phase'), 'empty');
    check('cancel-warmup-retry', 'P2-AC4');
  }
  await page.getByTestId('create-world').click();
  await page.getByTestId('warmup-progress').waitFor();
  await page.waitForFunction(() => window.__p2.view?.world.playerInjected === true);
  const view = JSON.parse(await publicView());
  assert.equal(view.clock.worldDay, 250); assert.equal(view.clock.batch, 0); assert.equal(view.phase, 'publicDecision');
  assert.equal(view.world.warmupCompletedBatches, 4000); assert.equal(view.world.playerDay, 1); assert.equal(view.companies.length, 40);
  assert.deepEqual(view.player.cash, { $bigint: '100000000' });
  assert.ok(await page.evaluate(() => window.__p2.progress.some(p => p.operation === 'warmup' && p.completed > 0 && p.completed < 4000)));
  check('warmup-start', 'P2-AC4', { worldDay: 250, companies: 40 });
  await page.waitForFunction(() => window.__p2.view?.bars.length > 0);
  assert.ok(await page.locator('.canvas-chart canvas').count() > 0);
  await page.screenshot({ path: resolve(output, 'terminal.png'), fullPage: true });
  await writeFile(resolve(output, 'initial-public.json'), await publicView());
  check('real-chart', 'P2-AC4');
  if (mode === 'full') {
    reference = createMarketCore(); assert.ok(!('reason' in reference.createWorld({ rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, seed: 20261001, size: 'prototype', mode: 'baseline', playerCapital: 100000000n })));
    assert.equal(reference.warmup({ maxBatches: 4000 }).reason, 'complete'); reference.prepareNextBatch();
    const initial = await compare('initial-snapshot');
    check('node-worker-preheat', 'P2-AC4', { checksum: initial.snapshot.checksum });
    const tempo={};
    for(const kind of ['hour','day','fast']){
      await importFile(initial.path); assert.equal(reference.restoreSnapshot(initial.snapshot).restored,true);
      if(kind==='hour')for(let i=0;i<4;i++)await step('step-hour');else if(kind==='day')await step('step-day');else await fast(1);
      tempo[kind]=(await compare(`tempo-${kind}`)).snapshot.checksum;
    }
    assert.equal(new Set(Object.values(tempo)).size,1);
    await importFile(initial.path); assert.equal(reference.restoreSnapshot(initial.snapshot).restored,true);
    check('hour-day-fast-ui-same-fixed-stream','P2-AC6',tempo);
    for (const id of ['A001', 'B001']) {
      await selectStock(id); await page.getByRole('button', { name: '公司', exact: true }).click();
      assert.ok((await page.getByTestId('company-detail').innerText()).includes('已公布经营简报'));
      await page.getByRole('button', { name: '行情', exact: true }).click();
      for (const scale of ['hour', 'day']) {
        await page.getByRole('button', { name: scale === 'hour' ? '小时 K' : '日 K', exact: true }).click();
        await page.waitForFunction(({ id, scale }) => window.__p2.view?.bars[0]?.stockId === id && (scale === 'hour' ? window.__p2.view.bars[0].hour !== null : window.__p2.view.bars[0].hour === null), { id, scale });
        const bars = (await read()).bars; assert.ok(bars.length >= (scale === 'day' ? 251 : 480));
        assert.equal(bars.at(-1).completed, false); assert.equal(bars.at(-1).noTrade, true); assert.equal(bars.at(-1).volume, 0);
      }
    }
    await page.getByLabel('行业筛选').selectOption('energy'); assert.ok(await page.locator('.stock-row').count() > 0);
    await page.getByLabel('行业筛选').selectOption(''); await page.getByLabel('概念筛选').selectOption({ index: 1 }); assert.ok(await page.locator('.stock-row').count() > 0);
    await page.getByLabel('概念筛选').selectOption('');
    await page.getByRole('button', { name: 'MA 5 / 20', exact: true }).click(); await page.getByRole('button', { name: 'MA 5 / 20', exact: true }).click();
    const hidden = await browser.newPage(); await hidden.goto('about:blank'); await page.waitForTimeout(1200); await hidden.close(); await page.bringToFront();
    assert.equal((await compare('view-switches-paused')).snapshot.checksum, initial.snapshot.checksum);
    const serializedView = await publicView(); for (const key of ['actualOperatingIndexQ', 'pendingGrowthQ', 'npcs', 'beliefNoiseQ', 'majorStockIds']) assert.ok(!serializedView.includes(`"${key}"`));
    check('both-markets-history-company-filters-no-free-time', 'P2-AC4/6', { initialChecksum: initial.snapshot.checksum });

    // The fixed browser seed is also used to locate a reachable public-report pause,
    // by running a separate test observer; this forecast is never sent to the UI.
    const observer = createMarketCore(); assert.equal(observer.restoreSnapshot(initial.snapshot).restored, true);
    let futureMajor;
    for(let day=250;day<310&&!futureMajor;day++){
      observer.advance({stop:{worldDay:day,batch:15},maxBatches:16,pauseOnMajor:false});
      futureMajor=observer.readWorldView({kind:'messages'}).messages.find(message=>message.publishedAt.worldDay===day&&day>=260&&message.text.includes('变动至少5%'));
    }
    const majorStock = futureMajor?.id.slice('report:'.length) ?? 'A002';
    if(futureMajor)evidence.majorScenario={stockId:majorStock,publiclyRevealedAt:futureMajor.publishedAt};
    else evidence.emptyNaturalMajor={seed:20261001,fromWorldDay:250,toWorldDay:309};

    let current = await read(); const recent=(market)=>current.companies.filter(company=>company.market===market).sort((left,right)=>(right.lastTradeAt?.worldDay??-1)*16+(right.lastTradeAt?.batch??-1)-(left.lastTradeAt?.worldDay??-1)*16-(left.lastTradeAt?.batch??-1))[0];
    const a = recent('A');
    await selectStock(a.id); await submit('buy', 'immediate', 100, a.protection.high); await step();
    current = await read(); assert.ok(current.player.holdings.find(holding => holding.stockId === a.id).locked > 0);
    await prepare(); await submit('sell', 'immediate', 1, a.protection.low, undefined, false, 'insufficientShares');
    check('a-immediate-fill-t1-rejection', 'P2-AC5', { shares: current.player.holdings.find(holding => holding.stockId === a.id).total });
    const dayOrder = await submit('buy', 'day', 100, 1);
    await submit('sell', 'immediate', 1, a.protection.low, undefined, false, 'oppositeDirection');
    const cancel = await operation('command', () => page.locator(`[data-order-id="${dayOrder.orderId}"]`).getByRole('button', { name: '撤销余量' }).click());
    assert.equal(cancel.reply.command.accepted, true); assert.deepEqual(reference.submitCommand(cancel.request.payload.command), cancel.reply.command);
    const available = (await read()).availableCash;
    await submit('buy', 'immediate', Number(available / BigInt(a.protection.high)) + 100, a.protection.high, undefined, false, 'insufficientCash');
    check('day-cancel-opposite-and-cash-rejections', 'P2-AC5');
    current=await read(); const b=recent('B'); await selectStock(b.id);
    await submit('buy', 'immediate', 100, b.protection.high); await step(); await prepare();
    const bHolding = (await read()).player.holdings.find(holding => holding.stockId === b.id); assert.ok(bHolding.sellable > 0);
    await submit('sell', 'immediate', 1, b.protection.low); await step();
    assert.ok((await read()).pendingProceeds.length > 0); await prepare();
    await selectStock(majorStock); current = await read(); const majorCompany = current.companies.find(company => company.id === majorStock);
    await submit('buy', 'immediate', 10, majorCompany.protection.high); await step();
    assert.ok((await read()).player.holdings.find(holding => holding.stockId === majorStock).total > 0);
    await compare('first-trades'); check('b-next-batch-sale-fees-and-public-ledger', 'P2-AC5');
    await prepare(); await selectStock('A001'); const expiring = await submit('buy', 'day', 100, 1); await step('step-day');
    assert.equal((await read()).orders.find(order => order.id === expiring.orderId).status, 'expired');
    check('zero-fill-day-expiry', 'P2-AC5');

    // Start a long run and cancel through the actual UI while the worker yields.
    await page.getByLabel('快进天数').fill('50'); const firstRunRequest = await page.evaluate(() => window.__p2.requests.length);
    await page.evaluate(({ firstRunRequest }) => { window.__p2.firstRequest = firstRunRequest; window.__p2.awaitOperation = 'advance'; }, { firstRunRequest });
    await page.getByTestId('fast-forward').click(); await page.getByTestId('cancel-run').waitFor();
    await page.waitForFunction(() => window.__p2.progress.at(-1)?.operation === 'advance' && window.__p2.progress.at(-1).completed > 0);
    await page.getByTestId('cancel-run').click(); const cancelled = await capturedReply('advance', firstRunRequest); replayAdvance(cancelled.reply);
    assert.equal(cancelled.reply.advance.reason, 'cancelled'); assert.equal(cancelled.reply.view.phase, 'settled'); assert.ok(cancelled.reply.advance.completedBatches > 0);
    await page.waitForFunction(() => !document.querySelector('[data-testid="cancel-run"]'));
    await compare('cancelled-stable'); check('cancel-fast-forward-at-complete-batch', 'P2-AC6', { clock: cancelled.reply.view.clock, batches: cancelled.reply.advance.completedBatches });

    assert.ok((await read()).clock.worldDay <= 258, 'cancel scenario must preserve room for the registered checkpoint');
    await continueTo(258); await prepare(); for (let i = 0; i < 3; i++) await step('step-hour'); for (let i = 0; i < 3; i++) await step(); await prepare();
    assert.deepEqual((await read()).clock, { worldDay: 259, batch: 15 });
    current = await read(); const candidate = current.companies.filter(company => company.market === 'A').sort((left, right) => (right.lastTradeAt?.worldDay ?? -1) * 16 + (right.lastTradeAt?.batch ?? -1) - (left.lastTradeAt?.worldDay ?? -1) * 16 - (left.lastTradeAt?.batch ?? -1))[0];
    await selectStock(candidate.id); const planQuantity = Math.max(100, Math.floor(Number(current.availableCash / BigInt(candidate.protection.high)) / 2));
    await submit('buy', 'immediate', 10, candidate.protection.high); const plan = await submit('buy', 'plan', planQuantity, candidate.protection.high, { worldDay: 260, batch: 15 }); await step();
    const checkpoint = await compare('qualified-checkpoint'), state = decodeExact(checkpoint.snapshot.payload), player = state.accounts.find(account => account.id === 'player'), partial = state.orders.find(order => order.id === plan.orderId);
    assert.ok(partial.filledQuantity > 0 && partial.remainingQuantity > 0 && partial.reservedCash > 0n);
    assert.ok(player.reservedCash > 0n); assert.ok(player.lots.some(lot => lot.stockId.startsWith('A') && lot.unlockTick === 260 * 16 && lot.quantity > 0));
    evidence.checkpoint = { checksum: checkpoint.snapshot.checksum, path: checkpoint.path, clock: checkpoint.snapshot.clock, phase: checkpoint.snapshot.phase, plan: { quantity: partial.quantity, filled: partial.filledQuantity, remaining: partial.remainingQuantity, reservedCash: partial.reservedCash }, lockedA: player.lots.filter(lot => lot.stockId.startsWith('A') && lot.unlockTick === 260 * 16) };
    check('partial-plan-frozen-cash-a-lock-fee-cycle-checkpoint', 'P2-AC7', evidence.checkpoint);

    const badVersion = { ...checkpoint.snapshot, rulesVersion: 'incompatible-test' }, corrupt = { ...checkpoint.snapshot, checksum: '0'.repeat(64) };
    for (const [name, input] of [['bad-version', badVersion], ['corrupt', corrupt]]) {
      const path = resolve(output, `${name}.json`); writeJson(path, input);
      await page.getByLabel('导入存档文件').setInputFiles(path); await page.getByTestId('operation-error').waitFor();
      assert.equal((await compare(`after-${name}`)).snapshot.checksum, checkpoint.snapshot.checksum);
    }
    check('bad-import-keeps-current-world', 'P2-AC7');
    const pauses = await continueTo(279); const uninterrupted = await compare('uninterrupted-20-days');
    if(pauses)check('held-notification-before-npc-clearing', 'P2-AC6', { pauses, windows: evidence.notificationPauses });
    const nodeOut = resolve(output, 'node-20-days');
    execFileSync(process.execPath, ['tools/sim-runner/p2-golden.mjs', '--input', checkpoint.path, '--days', '20', '--out', nodeOut], { stdio: 'pipe', windowsHide: true });
    const nodeResult = JSON.parse(await readFile(resolve(nodeOut, 'results.json'), 'utf8')); assert.equal(nodeResult.finalChecksum, uninterrupted.snapshot.checksum); assert.equal(nodeResult.completedBatches, 320);
    await writeFile(resolve(output, 'before-close-ui-log.json'), await page.evaluate(() => JSON.stringify({ requests: window.__p2.requests, replies: window.__p2.replies, progress: window.__p2.progress }, (_key, value) => typeof value === 'bigint' ? { $bigint: value.toString() } : value)));
    await page.close(); page = await browser.newPage({ viewport: { width: 1560, height: 1100 }, acceptDownloads: true }); await configurePage(); await page.goto(url);
    await page.getByTestId('create-world').waitFor(); assert.equal(await page.getByTestId('market-app').getAttribute('data-phase'), 'empty');
    await importFile(checkpoint.path); reference = createMarketCore(); assert.equal(reference.restoreSnapshot(checkpoint.snapshot).restored, true);
    assert.equal((await compare('fresh-page-restored')).snapshot.checksum, checkpoint.snapshot.checksum);
    await continueTo(279); const resumed = await compare('reopened-20-days'); assert.equal(resumed.snapshot.checksum, uninterrupted.snapshot.checksum);
    evidence.continuation = { initialChecksum: checkpoint.snapshot.checksum, uninterruptedChecksum: uninterrupted.snapshot.checksum, reopenedChecksum: resumed.snapshot.checksum, nodeChecksum: nodeResult.finalChecksum, completedBatches: 320, initialClock: checkpoint.snapshot.clock, finalClock: resumed.snapshot.clock, nodeResults: resolve(nodeOut, 'results.json') };
    check('close-reopen-import-20-days-full-state', 'P2-AC7', evidence.continuation);
    await continueTo(309); await page.getByTestId('prototype-summary').waitFor();
    assert.equal(await page.getByTestId('step-hour').isDisabled(), true); assert.equal(await page.getByTestId('submit-order').isDisabled(), true);
    const final = await compare('prototype-60-days'), finalState = decodeExact(final.snapshot.payload); assert.equal(finalState.ended, false); assert.ok(finalState.accounts.find(account => account.id === 'player').lots.length > 0);
    evidence.summary = { checksum: final.snapshot.checksum, clock: final.snapshot.clock, phase: final.snapshot.phase, coreEnded: finalState.ended, player: (await read()).player, executions: (await read()).executions.length };
    await page.screenshot({ path: resolve(output, 'summary-60-days.png'), fullPage: true });
    check('60-day-readonly-no-liquidation-or-reward', 'P2-AC8', { checksum: final.snapshot.checksum, coreEnded: false });
    await fixedReportCase(checkpoint.path);
  }
  }
  assert.deepEqual(errors, []);
  const browserSource = identity(browserPaths);
  assert.equal(p2Identity().economicSourceHash, sourceAtStart.economicSourceHash, 'economic source changed during the browser run');
  assert.equal(browserSource.sourceHash, browserAtStart.sourceHash, 'browser source changed during the browser run');
  const result = { status: 'pass', independentAcceptance: 'pending', mode, ...p2Identity(), browserSourceHash: browserSource.sourceHash, browserFiles: browserSource.files, environment: { browserVersion: browser.version(), executable, url, playwrightRuntime: runtime }, elapsedMs: Date.now() - startedAt, checks, evidence, errors };
  writeJson(resolve(output, 'results.json'), result);
  console.log(JSON.stringify({ status: 'pass', checks, browserVersion: browser.version() }, (_key, value) => typeof value === 'bigint' ? { $bigint: value.toString() } : value));
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  writeJson(resolve(output, 'results.json'), { status: 'fail', independentAcceptance: 'pending', mode,
    ...sourceAtStart, browserSourceHash: browserAtStart.sourceHash, environment: { browserVersion: browser.version(), executable, url },
    checks, evidence, errors, detail: String(error), elapsedMs: Date.now() - startedAt });
  console.error(error); process.exitCode = 1;
} finally { await browser.close(); }
