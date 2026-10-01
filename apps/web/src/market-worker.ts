import { CONTENT_VERSION, RULES_VERSION, createMarketCore } from '@big-a/sim-core';
import type { Clock, PublicQuery, SnapshotEnvelope, TradingCore } from '@big-a/sim-core';
import type { AdvanceInput, CommandInput, MarketReply, MarketRequest, NewWorldInput } from './market-protocol';

// This worker alone owns the world. Ordinary replies contain the core's public projection.
let core: TradingCore | null = null;
let sessionId = 0;
let query: PublicQuery = { kind: 'market' };
let active: { id: string; cancelled: boolean; operation: 'warmup' | 'advance' } | null = null;
let notifiedMajorVersion: number | null = null;
const downloadUrls = new Set<string>();
const endTick = 309 * 16 + 15;
const tick = (clock: Clock) => clock.worldDay * 16 + clock.batch;
const clock = (value: number): Clock => ({ worldDay: Math.floor(value / 16), batch: value % 16 });
const yieldToMessages = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function reply(request: MarketRequest, extra: Partial<MarketReply>, includeView = true) {
  const view = core && includeView ? core.readWorldView({ kind: 'market' }) : undefined;
  if (view && core && query.kind === 'chart') view.bars = core.readWorldView(query).bars;
  const response: MarketReply = { requestId: request.requestId, sessionId, kind: 'result',
    stateVersion: view?.stateVersion ?? 0, publicVersion: view?.publicVersion ?? 0, ...extra };
  if (view) response.view = view;
  globalThis.postMessage(response);
}
function requireWorld(request: MarketRequest, mutation = true): TradingCore {
  if (!core) throw new Error('尚未创建或导入世界。');
  const view = core.readWorldView({ kind: 'market' });
  if (request.sessionId !== sessionId || (mutation && request.expectedStateVersion !== view.stateVersion)) {
    throw new Error('视图已更新，请基于当前公开窗口重试。');
  }
  if (mutation && active) throw new Error('正在执行推进，请先取消并等待稳定暂停。');
  return core;
}
function targetTick(input: AdvanceInput, view: ReturnType<TradingCore['readWorldView']>) {
  const start = tick(view.clock) + (view.phase === 'settled' ? 1 : 0);
  const target = typeof input.stop === 'object' ? tick(input.stop)
    : input.stop === 'batch' ? start : input.stop === 'hour' ? Math.floor(start / 4) * 4 + 3
      : Math.floor(start / 16) * 16 + 15;
  return Math.min(endTick, target);
}

async function handle(request: MarketRequest) {
  try {
    if (request.operation === 'cancel') {
      if (active && request.sessionId === sessionId) active.cancelled = true;
      reply(request, {}, false); return;
    }
    if (request.operation === 'releaseExport') {
      const url = String(request.payload); if (downloadUrls.delete(url)) URL.revokeObjectURL(url);
      reply(request, {}, false); return;
    }
    if (request.operation === 'create') {
      if (active) throw new Error('请先等待当前操作结束。');
      const input = request.payload as NewWorldInput;
      const candidate = createMarketCore();
      const created = candidate.createWorld({ rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION,
        seed: input.seed, playerCapital: input.playerCapital, size: 'prototype', mode: 'baseline' });
      if ('reason' in created) throw new Error(`${created.reason}: ${created.detail}`);
      const run = { id: request.requestId, cancelled: false, operation: 'warmup' as const }; active = run;
      let result;
      do {
        result = candidate.warmup({ maxBatches: 4, cancelRequested: run.cancelled });
        reply(request, { kind: 'progress', progress: { operation: 'warmup', completed: result.warmupCompletedBatches, total: 4000 } }, false);
        await yieldToMessages();
      } while (result.reason === 'budget' && !run.cancelled);
      active = null;
      if (run.cancelled || result.reason === 'cancelled') { reply(request, { cancelled: true }); return; }
      candidate.prepareNextBatch(); // The sole player injection occurs at world250/batch0 in the core.
      core = candidate; sessionId++; query = input.query; notifiedMajorVersion = null;
      reply(request, {}); return;
    }
    if (request.operation === 'import') {
      if (active) throw new Error('请先取消推进并等待稳定暂停。');
      const file = request.payload as File;
      // The envelope escapes its canonical payload; the core applies the 64 MiB payload limit.
      if (!(file instanceof Blob) || file.size > 128 * 1024 * 1024 + 4096) throw new Error('文件缺失或过大。');
      const snapshot = JSON.parse(await file.text()) as SnapshotEnvelope;
      const candidate = createMarketCore(); const restored = candidate.restoreSnapshot(snapshot);
      if (!restored.restored) throw new Error(`${restored.reason}: ${restored.detail}`);
      const view = candidate.readWorldView({ kind: 'market' });
      if (view.world.size !== 'prototype' || view.world.mode !== 'baseline' || !view.world.playerInjected) throw new Error('仅接受已经预热入场的 P2 原型存档。');
      core = candidate; sessionId++; query = { kind: 'market' }; notifiedMajorVersion = null;
      reply(request, {}); return;
    }
    const current = requireWorld(request, request.operation !== 'view');
    if (request.operation === 'view') { query = request.payload as PublicQuery; reply(request, {}); return; }
    const view = current.readWorldView({ kind: 'market' });
    if (request.operation === 'export') {
      const snapshot = current.exportSnapshot();
      // The renderer receives a download capability, never the private payload.
      const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot)], { type: 'application/json' })); downloadUrls.add(url);
      reply(request, { exported: { url, filename: `big-a-${view.world.seed}-world${view.clock.worldDay}-${view.clock.batch}.json`, checksum: snapshot.checksum } }); return;
    }
    if (view.world.warmupCompletedBatches !== 4000 || !view.world.playerInjected) throw new Error('预热尚未完成。');
    if (tick(view.clock) >= endTick && view.phase === 'settled') throw new Error('60 日原型已暂停；可导出或重新创建世界。');
    if (request.operation === 'prepare') { current.prepareNextBatch(); reply(request, {}); return; }
    if (request.operation === 'command') {
      const input = request.payload as CommandInput; reply(request, { command: current.submitCommand(input.command) }); return;
    }
    if (request.operation === 'advance') {
      const input = request.payload as AdvanceInput, target = targetTick(input, view);
      const run = { id: request.requestId, cancelled: false, operation: 'advance' as const }; active = run;
      let completed = 0, result;
      const total = Math.max(0, target - tick(view.clock) + (view.phase === 'publicDecision' ? 1 : 0));
      const acknowledged = input.acknowledgeMajor && view.phase === 'publicDecision' && notifiedMajorVersion === view.publicVersion;
      do {
        result = current.advance({ stop: clock(target), maxBatches: acknowledged && completed === 0 ? 1 : 4,
          pauseOnMajor: !(acknowledged && completed === 0), cancelRequested: run.cancelled });
        completed += result.completedBatches;
        if (result.reason === 'majorMessage') notifiedMajorVersion = result.publicVersion;
        reply(request, { kind: 'progress', progress: { operation: 'advance', completed, total } });
        if (result.reason !== 'budget') break;
        await yieldToMessages();
      } while (!run.cancelled);
      if (run.cancelled && result.reason === 'budget') result = current.advance({ stop: clock(target), maxBatches: 1, pauseOnMajor: true, cancelRequested: true });
      active = null; reply(request, { advance: { ...result, completedBatches: completed }, cancelled: run.cancelled }); return;
    }
    throw new Error('不支持的操作。');
  } catch (error) {
    if (active?.id === request.requestId) active = null;
    reply(request, { error: { code: 'operationFailed', detail: error instanceof Error ? error.message : String(error) } });
  }
}
globalThis.addEventListener('message', (event: MessageEvent<MarketRequest>) => { void handle(event.data); });
