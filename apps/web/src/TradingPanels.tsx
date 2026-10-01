import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CommandBody, OrderKind, WorldCompanyView, WorldPublicView } from '@big-a/sim-core';
import { MAX_PRICE, MAX_SHARES, reserve } from '@big-a/sim-core';
import type { useMarket } from './useMarket';

export type MarketBridge = ReturnType<typeof useMarket>;
export const money = (value: bigint | number) => {
  const cents = typeof value === 'bigint' ? value : BigInt(value), negative = cents < 0n, absolute = negative ? -cents : cents;
  return `${negative ? '−' : ''}${(absolute / 100n).toLocaleString('en-US')}.${String(absolute % 100n).padStart(2, '0')}`;
};
export const q = (value: bigint) => (Number(value) / 1e9).toFixed(4);
export const clockLabel = (at: { worldDay: number; batch: number }) => `世界日 ${at.worldDay} · 第${Math.floor(at.batch / 4) + 1}小时 / 批${at.batch + 1}`;
export const tickClock = (value: number) => ({ worldDay: Math.floor(value / 16), batch: value % 16 });
export const direction = (value: number | bigint) => value > 0 ? 'up' : value < 0 ? 'down' : 'neutral';
const sideLabel = { buy: '买入', sell: '卖出' };
const orderLabel = { immediate: '受保护即时单', day: '限价日单', plan: '分批计划' };
const statusLabel = { active: '等待成交', partial: '部分成交', completed: '已完成', cancelled: '已撤销', expired: '已到期' };
export const reasonLabel: Record<string, string> = { insufficientCash: '可用现金不足', insufficientShares: '可售股份不足（检查锁定与冻结）', oppositeDirection: '同股反向委托冲突，请先撤销原单', staleView: '公开资料已更新，请刷新后重试', pastBatch: '目标批次已过去', invalidInput: '数量、价格或有效期不合法', notDecisionWindow: '请先进入公开决策窗口', ended: '体验已暂停', duplicateIdConflict: '命令编号冲突' };
export function Icon({ name, size = 18 }: { name: 'chart' | 'wallet' | 'news' | 'settings' | 'search' | 'star' | 'close' | 'arrow'; size?: number }) {
  const paths = { chart: 'M4 4v16h16M8 14l4-5 4 3 5-7', wallet: 'M4 7V5h14v2M4 7h17v13H4ZM16 11h5v5h-5Z', news: 'M4 3h16v18H4ZM8 7h8M8 11h8M8 15h8', settings: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M9 15v6', search: 'M16 16l5 5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z', close: 'm6 6 12 12M6 18 18 6', arrow: 'M5 12h14m-5-5 5 5-5 5' };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} className="content-dialog" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-label={title}>
    <div className="dialog-heading"><h2>{title}</h2><button className="icon-button" aria-label="关闭弹窗" onClick={onClose}><Icon name="close" /></button></div><div className="dialog-body">{children}</div>
  </dialog>;
}
export function NewWorld({ market, onComplete }: { market: MarketBridge; onComplete: () => void }) {
  const [seed, setSeed] = useState('20261001'), [capital, setCapital] = useState('100'), [error, setError] = useState<string | null>(null);
  return <section className="new-world-panel" aria-label="新建虚构世界">
    <div className="eyebrow">LOCAL MARKET / BASELINE-V1</div><h2>从同一个种子开始</h2>
    <p className="muted">两市各 20 股，26 个真实钱包。先模拟 250 世界日，再加入你的本金；历史成交与账户状态连续保留。</p>
    <form onSubmit={event => { event.preventDefault(); setError(null); const parsedSeed = Number(seed);
      if (!/^\d+$/.test(seed) || !Number.isSafeInteger(parsedSeed) || parsedSeed < 0 || parsedSeed > 4294967295) { setError('种子须为 0–4294967295 的整数。'); return; }
      if (!/^\d+(\.\d{1,2})?$/.test(capital)) { setError('本金以万为单位，最多两位小数。'); return; }
      const [whole, fraction = ''] = capital.split('.'), cents = BigInt(whole!) * 1000000n + BigInt(fraction.padEnd(2, '0')) * 10000n;
      if (cents < 10000000n || cents > 1000000000n) { setError('本金范围为 10–1,000 万。'); return; }
      void market.perform('create', { seed: parsedSeed, playerCapital: cents, query: { kind: 'market' } }).then(reply => { if (!reply.cancelled) onComplete(); }).catch(() => {});
    }}>
      <label className="field-label" htmlFor="world-seed">世界种子</label><input id="world-seed" inputMode="numeric" value={seed} onChange={event => setSeed(event.target.value)} disabled={market.busy} />
      <label className="field-label" htmlFor="world-capital">初始本金（万虚构货币）</label><input id="world-capital" inputMode="decimal" value={capital} onChange={event => setCapital(event.target.value)} disabled={market.busy} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary full-width" type="submit" disabled={market.busy} data-testid="create-world">创建并预热 250 日</button>
    </form>
    {market.progress?.operation === 'warmup' && <div className="warmup-progress" role="status" data-testid="warmup-progress"><span>真实预热：{Math.floor(market.progress.completed / 16)} / 250 日</span><progress max={market.progress.total} value={market.progress.completed} /><small>{market.progress.completed} / 4,000 交易批次</small><button className="button button-secondary" onClick={() => { void market.request('cancel'); }}>取消预热</button></div>}
    <p className="section-note">本地 60 日原型 · 当前仅文件导入导出，没有自动保存。突发事件与高级技术/主题行为尚未启用。</p>
  </section>;
}
export function OrderTicket({ stock, view, market, ended, onCommand }: { stock: WorldCompanyView; view: WorldPublicView; market: MarketBridge; ended: boolean; onCommand: (body: CommandBody) => Promise<void> }) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy'), [kind, setKind] = useState<OrderKind>('immediate');
  const [price, setPrice] = useState(money(stock.lastPrice).replaceAll(',', '')), [quantity, setQuantity] = useState('100');
  const [endDay, setEndDay] = useState(String(view.clock.worldDay + 2)), [endHour, setEndHour] = useState('4'), [error, setError] = useState<string | null>(null);
  useEffect(() => { setPrice(money(stock.lastPrice).replaceAll(',', '')); setError(null); }, [stock.id]);
  const holding = view.player?.holdings.find(item => item.stockId === stock.id);
  const inputQuantity = Number(quantity), parsedPrice = /^\d+(\.\d{1,2})?$/.test(price) ? Number(price.replace('.', '')) * (price.includes('.') ? (price.split('.')[1]!.length === 1 ? 10 : 1) : 100) : 0;
  const principal = Number.isSafeInteger(inputQuantity) && Number.isSafeInteger(parsedPrice) && inputQuantity >= 0 ? BigInt(inputQuantity) * BigInt(parsedPrice) : 0n;
  const batches = kind === 'plan' ? Number(endDay) * 16 + Number(endHour) * 4 - (view.clock.worldDay * 16 + view.clock.batch) : kind === 'day' ? 16 - view.clock.batch : 1;
  const estimatedReserve = Number.isSafeInteger(batches) && batches > 0 && inputQuantity >= 1 && inputQuantity <= MAX_SHARES && Number.isSafeInteger(inputQuantity) && parsedPrice >= 1 && parsedPrice <= MAX_PRICE && Number.isSafeInteger(parsedPrice) ? reserve(parsedPrice, inputQuantity, batches) : null;
  const disabled = market.busy || ended || view.phase !== 'publicDecision';
  return <section className="order-panel" aria-label="委托面板">
    <div className="panel-title"><h2>提交委托</h2><span className="subtle-badge">真实账户</span></div>
    <div className="side-switch"><button className={side === 'buy' ? 'buy selected' : ''} onClick={() => setSide('buy')}>买入</button><button className={side === 'sell' ? 'sell selected' : ''} onClick={() => setSide('sell')}>卖出</button></div>
    <form onSubmit={event => { event.preventDefault(); setError(null);
      if (!/^\d+$/.test(quantity) || !Number.isSafeInteger(inputQuantity) || inputQuantity < 1 || !Number.isSafeInteger(parsedPrice) || parsedPrice < 1) { setError('请输入正整数股数和最多两位小数的正价格。'); return; }
      const endAt = { worldDay: Number(endDay), batch: Number(endHour) * 4 - 1 };
      void onCommand({ kind, stockId: stock.id, side, quantity: inputQuantity, limitPrice: parsedPrice, ...(kind === 'plan' ? { endAt } : {}) });
    }}>
      <label className="field-label" htmlFor="order-type">委托类型</label><select id="order-type" value={kind} onChange={event => setKind(event.target.value as OrderKind)}><option value="immediate">受保护即时单 · 当前批次</option><option value="day">限价日单 · 当日有效</option><option value="plan">分批计划 · 跨批等待</option></select>
      <label className="field-label" htmlFor="order-price">{side === 'buy' ? '最高接受价' : '最低接受价'}（元）</label><input id="order-price" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} />
      <label className="field-label" htmlFor="order-quantity">委托股数</label><input id="order-quantity" className="quantity-input" inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value)} />
      <div className="quantity-presets">{[100, 1000, 10000].map(value => <button key={value} type="button" onClick={() => setQuantity(String(value))}>{value.toLocaleString()}</button>)}</div>
      {kind === 'plan' && <div className="plan-end-fields"><label className="field-label" htmlFor="plan-end-day">有效至世界日 / 小时末</label><input id="plan-end-day" inputMode="numeric" value={endDay} onChange={event => setEndDay(event.target.value)} /><select id="plan-end-hour" aria-label="计划结束小时" value={endHour} onChange={event => setEndHour(event.target.value)}>{[1, 2, 3, 4].map(hour => <option key={hour} value={hour}>第{hour}小时末</option>)}</select></div>}
      <div className="order-summary"><div><span>限价本金</span><strong className="numeric">{money(principal)}</strong></div><div><span>预计冻结（含最坏分批费）</span><span className="numeric">{side === 'buy' && estimatedReserve !== null ? money(estimatedReserve) : side === 'sell' ? `${inputQuantity || 0} 股` : '—'}</span></div><div><span>可用现金</span><span className="numeric">{money(view.availableCash ?? 0n)}</span></div><div><span>可售 / 已冻结</span><span>{holding?.sellable ?? 0} / {holding?.reserved ?? 0} 股</span></div></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className={`order-submit ${side}`} disabled={disabled} data-testid="submit-order">提交{sideLabel[side]}委托</button>
    </form>
    <p className="order-hint">{view.phase === 'settled' ? '本批已清算。先进入下一决策窗口，再基于新公开资料下单。' : `${stock.market === 'A' ? '甲：新买次日可售' : '乙：新买下一批可售'}。` } 保护价是最差接受价，历史价与可用预算不保证成交。手续费和冻结额度由核心实际计算。</p>
  </section>;
}
export function Holdings({ view, onSelect }: { view: WorldPublicView; onSelect: (id: string) => void }) {
  const holdings = view.player?.holdings.filter(item => item.total > 0) ?? [];
  return holdings.length ? <div className="table-scroll"><table className="holdings-table"><thead><tr><th>股票</th><th>总股数</th><th>可售</th><th>锁定</th><th>冻结</th><th>最新标记市值</th><th>锁定可售时点</th></tr></thead><tbody>{holdings.map(holding => {
    const company = view.companies.find(item => item.id === holding.stockId);
    return <tr key={holding.stockId}><td><button className="stock-link" onClick={() => onSelect(holding.stockId)}>{company?.name ?? holding.stockId}<small>{holding.stockId}</small></button></td><td>{holding.total.toLocaleString()}</td><td>{holding.sellable.toLocaleString()}</td><td>{holding.locked.toLocaleString()}</td><td>{holding.reserved.toLocaleString()}</td><td>{company ? money(BigInt(company.lastPrice) * BigInt(holding.total)) : '—'}</td><td>{holding.lots.filter(lot => lot.unlockAt.worldDay * 16 + lot.unlockAt.batch > view.clock.worldDay * 16 + view.clock.batch).map(lot => `${lot.quantity}股：${clockLabel(lot.unlockAt)}`).join('；') || '已到时点'}</td></tr>;
  })}</tbody></table></div> : <div className="empty-state compact">尚无持仓。现金与股份均由真实竞价成交形成。</div>;
}
export function Orders({ view, market, ended, onCommand }: { view: WorldPublicView; market: MarketBridge; ended: boolean; onCommand: (body: CommandBody) => Promise<void> }) {
  if (!view.orders.length) return <div className="empty-state compact">还没有委托。提交后在此核对保护价、余量与冻结资源。</div>;
  return <div className="table-scroll"><table className="holdings-table" data-testid="orders-table">
    <thead><tr><th>股票 / 委托</th><th>方向 / 类型</th><th>提交参考</th><th>保护价</th><th>已成交 / 余量</th><th>费用</th><th>冻结资源</th><th>状态</th><th /></tr></thead>
    <tbody>{[...view.orders].reverse().map(order => <tr key={order.id} data-order-id={order.id}>
      <td>{order.stockId}<small className="order-id">{order.id}</small></td><td>{sideLabel[order.side]}<small>{orderLabel[order.kind]}</small></td>
      <td>{order.submissionReference === null ? '旧档未记录' : money(order.submissionReference)}<small>{order.submissionReferenceOnly ? '发行参考' : '当时历史成交'}</small></td>
      <td>{money(order.limitPrice)}</td><td>{order.filledQuantity} / {order.remainingQuantity}</td><td>{money(order.feesPaid)}</td>
      <td>{order.side === 'buy' ? `${money(order.reservedCash)}元` : `${order.reservedShares}股`}</td>
      <td>{statusLabel[order.status]}{order.kind === 'plan' && <small>至 {clockLabel(tickClock(order.endTick))}</small>}</td>
      <td>{['active', 'partial'].includes(order.status) && <button className="button button-secondary" disabled={market.busy || ended || view.phase !== 'publicDecision'} onClick={() => { void onCommand({ kind: 'cancel', orderId: order.id }); }}>撤销余量</button>}</td>
    </tr>)}</tbody>
  </table></div>;
}
export function Executions({ view }: { view: WorldPublicView }) {
  return view.executions.length ? <div className="table-scroll"><table className="holdings-table" data-testid="executions-table"><thead><tr><th>成交时点 / 股票</th><th>方向</th><th>实际清算价</th><th>成交股数</th><th>实际费用</th><th>可售 / 回款时点</th></tr></thead><tbody>{[...view.executions].reverse().map((fill, index) => <tr key={`${fill.orderId}-${fill.clock.worldDay}-${fill.clock.batch}-${index}`}><td>{fill.stockId}<small>{clockLabel(fill.clock)}</small></td><td className={fill.side === 'buy' ? 'up' : 'down'}>{sideLabel[fill.side]}</td><td>{money(fill.price)}</td><td>{fill.quantity.toLocaleString()}</td><td>{money(fill.fee)}</td><td>{fill.unlockAt ? clockLabel(fill.unlockAt) : '本批已结算'}</td></tr>)}</tbody></table></div> : <div className="empty-state compact">尚无实际成交。未成交的即时单与到期余量在委托记录中保留。</div>;
}
