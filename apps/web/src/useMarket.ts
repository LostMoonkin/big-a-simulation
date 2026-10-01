import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicQuery, WorldPublicView } from '@big-a/sim-core';
import type { MarketOperation, MarketReply, MarketRequest } from './market-protocol';

export function useMarket() {
  const worker = useRef<Worker | null>(null), current = useRef<WorldPublicView | null>(null), session = useRef(0), sequence = useRef(0);
  const pending = useRef(new Map<string, { resolve: (reply: MarketReply) => void; reject: (error: Error) => void }>());
  const [view, setView] = useState<WorldPublicView | null>(null), [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<MarketReply['progress']>(), [error, setError] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState<MarketReply | null>(null);
  const [sessionId, setSessionId] = useState(0);
  useEffect(() => {
    const instance = new Worker(new URL('./market-worker.ts', import.meta.url), { type: 'module' }); worker.current = instance;
    instance.onmessage = (event: MessageEvent<MarketReply>) => {
      const reply = event.data, waiter = pending.current.get(reply.requestId);
      if (!waiter) return;
      if (reply.sessionId < session.current) return;
      if (reply.sessionId > session.current) { session.current = reply.sessionId; setSessionId(reply.sessionId); current.current = null; }
      if (reply.view && (!current.current || reply.view.stateVersion >= current.current.stateVersion)) { current.current = reply.view; setView(reply.view); }
      if (reply.kind === 'progress') { setProgress(reply.progress); return; }
      pending.current.delete(reply.requestId); setLastReply(reply);
      if (reply.error) { setError(reply.error.detail); waiter.reject(new Error(reply.error.detail)); }
      else waiter.resolve(reply);
    };
    instance.onerror = (event) => { setError(`模拟 Worker 失败：${event.message}`); setBusy(false); for (const waiter of pending.current.values()) waiter.reject(new Error(event.message)); pending.current.clear(); };
    return () => { instance.terminate(); worker.current = null; for (const waiter of pending.current.values()) waiter.reject(new Error('会话已关闭')); pending.current.clear(); };
  }, []);
  const request = useCallback((operation: MarketOperation, payload?: unknown): Promise<MarketReply> => {
    const instance = worker.current; if (!instance) return Promise.reject(new Error('模拟 Worker 尚未就绪。'));
    const requestId = `ui-${++sequence.current}`;
    const message: MarketRequest = { requestId, sessionId: session.current, expectedStateVersion: current.current?.stateVersion ?? 0, operation, payload };
    return new Promise((resolve, reject) => { pending.current.set(requestId, { resolve, reject }); instance.postMessage(message); });
  }, []);
  const perform = useCallback(async (operation: MarketOperation, payload?: unknown) => {
    setError(null); setBusy(true); setProgress(undefined);
    try { return await request(operation, payload); } finally { setBusy(false); setProgress(undefined); }
  }, [request]);
  const select = useCallback((query: PublicQuery) => { void request('view', query).catch(() => {}); }, [request]);
  return { view, busy, progress, error, setError, lastReply, perform, request, select, sessionId };
}
