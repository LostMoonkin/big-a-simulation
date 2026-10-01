import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AppearanceSettings, useAppearance } from "./AppearanceSettings";
import { MarketChart } from "./MarketChart";
import { stocks, type Stock } from "./market-demo";

type IconName =
  | "chart"
  | "wallet"
  | "news"
  | "settings"
  | "search"
  | "star"
  | "arrow"
  | "close"
  | "chevron"
  | "info"
  | "check"
  | "grid";
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    chart: (
      <>
        <path d="M4 4v16h16M8 14l4-5 4 3 5-7" />
      </>
    ),
    wallet: (
      <>
        <path d="M4 7V5a2 2 0 0 1 2-2h12v4M4 7h15a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1Z" />
        <path d="M16 11h5v5h-5z" />
      </>
    ),
    news: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 7h8M8 11h8M8 15h3M8 18h8" />
      </>
    ),
    settings: (
      <>
        <path d="m10 3-1 3-3 1-3 3 2 2-1 4 3 1 2 4 3-1 3 1 2-3 4-2-1-3 1-3-3-2-1-3z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    star: (
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    chevron: <path d="m8 5 7 7-7 7" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7v1" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

const money = (value: number) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const signed = (value: number) => `${value >= 0 ? "+" : ""}${money(value)}`;
const direction = (value: number) =>
  value > 0 ? "up" : value < 0 ? "down" : "neutral";
const initialStock = stocks[0]!;
const holdings = [
  { stock: stocks[0]!, quantity: 6000, available: 4000, cost: 34.8 },
  {
    stock: stocks[2]!,
    quantity: 8000,
    available: 8000,
    cost: 16.76,
  },
  {
    stock: stocks[6]!,
    quantity: 4000,
    available: 4000,
    cost: 78.82,
  },
];
const cash = 428650;
const frozenCash = 0;
const positionsValue = holdings.reduce(
  (sum, h) => sum + h.stock.price * h.quantity,
  0,
);
const profit = holdings.reduce(
  (sum, h) => sum + (h.stock.price - h.cost) * h.quantity,
  0,
);
const news = [
  {
    id: 1,
    time: "第 39 日 · 第 2 小时",
    tag: "行业动态",
    title: "算能扩建计划公布，新一轮设备需求进入观察期",
    summary:
      "星源科技所在行业的采购计划已公开。项目将分阶段推进，订单落地规模仍有不确定性。",
    detail:
      "公开计划将算能基础设施列入本轮设备更新范围，相关企业将陆续披露参与情况。目前只有采购意向公开，尚无已签署合同或实际收入确认。后续可关注企业公开简报与项目进展。",
    stock: stocks[0]!,
  },
  {
    id: 2,
    time: "第 39 日 · 第 1 小时",
    tag: "公司简报",
    title: "经营简报更新：产能利用率回升，关注后续交付",
    summary: "经营端出现改善，新增需求能否持续仍需更多公开数据。",
    detail:
      "本期公开简报显示设备利用率较上期改善。原料与运输成本仍有波动，公司未提供确定的未来盈利承诺。经营改善与股价涨跌并非一一对应。",
    stock: stocks[2]!,
  },
  {
    id: 3,
    time: "第 38 日 · 收盘后",
    tag: "市场观察",
    title: "两市交易分化，资金配置转向更多行业",
    summary: "历史成交显示行业表现分化，单一概念的关注度并不等于未来收益。",
    detail:
      "本条为界面演示资讯，展示公开消息的阅读层级。正式游戏中的事件和统计将来自同一模拟核心；界面不会透露未公布的经营结果，也不会通过消息直接改写价格。",
    stock: stocks[6]!,
  },
];

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="content-dialog"
      aria-labelledby="modal-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id="modal-title">{title}</h2>
        <button className="icon-button" aria-label="关闭弹窗" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}

function Sparkline({ down = false }: { down?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 35"
      className={`sparkline ${down ? "down" : "up"}`}
      aria-hidden="true"
    >
      <path
        d={
          down
            ? "M1 7 8 10 13 6 19 16 25 12 32 16 38 14 44 24 50 21 55 27 61 20 68 24 73 21 80 30 86 27 92 30 99 25"
            : "M1 29 8 25 14 28 20 20 26 24 32 17 38 21 44 18 50 23 57 14 63 17 69 10 76 14 82 6 88 10 94 5 99 7"
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function OrderTicket({ stock }: { stock: Stock }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [kind, setKind] = useState("限价日单");
  const [price, setPrice] = useState(stock.price.toFixed(2));
  const [quantity, setQuantity] = useState("1000");
  const [end, setEnd] = useState("本日第 4 小时");
  const [preview, setPreview] = useState(false);
  const available =
    holdings.find((h) => h.stock.id === stock.id)?.available ?? 0;
  const p = Number(price),
    q = Number(quantity);
  const valid =
    Number.isFinite(p) &&
    p > 0 &&
    p <= 1e9 &&
    /^\d+(\.\d{1,2})?$/.test(price) &&
    Number.isSafeInteger(q) &&
    q > 0 &&
    q <= 1e9;
  const amount = valid ? p * q : 0;
  const error = !valid
    ? "请输入有效价格（最多两位小数）和正整数股数。"
    : side === "sell" && q > available
      ? "数量超过示例账户的可售股份。"
      : side === "buy" && amount > cash - frozenCash
        ? "委托金额超过示例账户的可用现金。"
        : "";
  return (
    <section className="order-panel" aria-label="委托面板">
      <div className="panel-title">
        <h2>交易委托</h2>
        <span className="subtle-badge">预览</span>
      </div>
      <div className="side-switch">
        <button
          className={side === "buy" ? "buy selected" : ""}
          aria-pressed={side === "buy"}
          onClick={() => setSide("buy")}
        >
          买入
        </button>
        <button
          className={side === "sell" ? "sell selected" : ""}
          aria-pressed={side === "sell"}
          onClick={() => setSide("sell")}
        >
          卖出
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!error) setPreview(true);
        }}
      >
        <label className="field-label" htmlFor="order-type">
          委托类型
        </label>
        <select
          id="order-type"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option>限价日单</option>
          <option>受保护即时单</option>
          <option>分批计划</option>
        </select>
        <label className="field-label" htmlFor="order-price">
          {side === "buy" ? "最高买入价" : "最低卖出价"}
          <span>元 / 股</span>
        </label>
        <div className="number-input">
          <button
            type="button"
            aria-label="降低委托价格"
            disabled={p <= 0.01 || !Number.isFinite(p)}
            onClick={() => setPrice(Math.max(0.01, p - 0.01).toFixed(2))}
          >
            −
          </button>
          <input
            id="order-price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <button
            type="button"
            aria-label="提高委托价格"
            disabled={!Number.isFinite(p)}
            onClick={() => setPrice((p + 0.01).toFixed(2))}
          >
            +
          </button>
        </div>
        <label className="field-label" htmlFor="order-quantity">
          委托数量<span>股</span>
        </label>
        <input
          id="order-quantity"
          className="quantity-input"
          inputMode="numeric"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <div className="quantity-presets">
          {[100, 500, 1000, 2000].map((n) => (
            <button
              type="button"
              className={Number(quantity) === n ? "active" : ""}
              key={n}
              onClick={() => setQuantity(String(n))}
            >
              {n.toLocaleString()}
            </button>
          ))}
        </div>
        {kind === "分批计划" && (
          <>
            <label className="field-label" htmlFor="plan-end">
              计划结束
            </label>
            <select
              id="plan-end"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            >
              <option>本日第 3 小时</option>
              <option>本日第 4 小时</option>
            </select>
          </>
        )}
        <div className="order-summary">
          <div>
            <span>{side === "buy" ? "可用现金" : "可售股份"}</span>
            <span className="numeric">
              {side === "buy"
                ? `${money(cash - frozenCash)} 元`
                : `${available.toLocaleString()} 股`}
            </span>
          </div>
          <div>
            <span>
              委托金额 <small>不含费用</small>
            </span>
            <strong className="numeric">
              {valid ? money(amount) : "—"} <small>元</small>
            </strong>
          </div>
        </div>
        {error && (
          <p className="form-error" role="status">
            {error}
          </p>
        )}
        <button
          className={`order-submit ${side}`}
          disabled={!!error}
          type="submit"
        >
          预览{side === "buy" ? "买入" : "卖出"}委托
          <Icon name="arrow" size={16} />
        </button>
      </form>
      <p className="order-hint">
        <Icon name="info" size={13} />
        <span>
          {stock.market === "甲"
            ? "甲市场新买股份次日可售"
            : "乙市场新买股份下一批可售"}
          。保护价不保证成交。
        </span>
      </p>
      {preview && (
        <Modal title="委托预览" onClose={() => setPreview(false)}>
          <p className="modal-kicker">
            {stock.id} · {stock.name}
          </p>
          <h3 className={side === "buy" ? "up" : "down"}>
            {side === "buy" ? "买入" : "卖出"} {q.toLocaleString()} 股
          </h3>
          <dl className="detail-list">
            <div>
              <dt>委托类型</dt>
              <dd>{kind}</dd>
            </div>
            <div>
              <dt>保护价</dt>
              <dd>{money(p)} 元</dd>
            </div>
            <div>
              <dt>委托金额（不含费用）</dt>
              <dd>{money(amount)} 元</dd>
            </div>
            {kind === "分批计划" && (
              <div>
                <dt>结束时间</dt>
                <dd>{end}</dd>
              </div>
            )}
          </dl>
          <p className="inline-notice">
            这是界面预览，委托没有提交，也不会改变资金和持仓。实际资源校验、费用和成交结果将在交易内核接入后提供。
          </p>
          <button
            className="button button-primary full-width"
            onClick={() => setPreview(false)}
          >
            返回调整
          </button>
        </Modal>
      )}
    </section>
  );
}

function HoldingsTable({ onSelect }: { onSelect: (stock: Stock) => void }) {
  return (
    <div className="table-scroll">
      <table className="holdings-table">
        <thead>
          <tr>
            <th>股票</th>
            <th>持有 / 可售</th>
            <th>成本 / 现价</th>
            <th>持仓市值</th>
            <th>浮动盈亏</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const gain = (h.stock.price - h.cost) * h.quantity;
            return (
              <tr key={h.stock.id}>
                <td>
                  <button
                    className="stock-link"
                    onClick={() => onSelect(h.stock)}
                  >
                    {h.stock.name}
                    <small>
                      {h.stock.id} · {h.stock.market}市场
                    </small>
                  </button>
                </td>
                <td>
                  {h.quantity.toLocaleString()}
                  <small>{h.available.toLocaleString()}</small>
                </td>
                <td>
                  {money(h.cost)}
                  <small>{money(h.stock.price)}</small>
                </td>
                <td>{money(h.stock.price * h.quantity)}</td>
                <td className={direction(gain)}>
                  {signed(gain)}
                  <small>{signed((h.stock.price / h.cost - 1) * 100)}%</small>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function App() {
  const { colors, setColors, storageError } = useAppearance();
  const [settings, setSettings] = useState(false);
  const [page, setPage] = useState<"terminal" | "portfolio" | "news">(
    "terminal",
  );
  const [stock, setStock] = useState(initialStock);
  const [market, setMarket] = useState("全部");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([
    stocks[0]!.id,
    stocks[2]!.id,
    stocks[6]!.id,
  ]);
  const [period, setPeriod] = useState<"day" | "hour">("day");
  const [average, setAverage] = useState(true);
  const [bottomTab, setBottomTab] = useState("当前持仓");
  const [detailTab, setDetailTab] = useState("行情走势");
  const [article, setArticle] = useState<(typeof news)[number] | null>(null);
  const [help, setHelp] = useState(false);
  const filtered = stocks
    .filter(
      (s) =>
        (market === "全部" ||
          (market === "自选"
            ? favorites.includes(s.id)
            : s.market === market)) &&
        `${s.name}${s.id}${s.sector}${s.concept}`
          .toLowerCase()
          .includes(search.toLowerCase().trim()),
    )
    .sort((a, b) =>
      sort ? b.change - a.change : stocks.indexOf(a) - stocks.indexOf(b),
    );
  const toggleFavorite = (id: string) =>
    setFavorites((list) =>
      list.includes(id) ? list.filter((item) => item !== id) : [...list, id],
    );
  const selectStock = (next: Stock) => {
    setStock(next);
    setPage("terminal");
    setMarket("全部");
    setSearch("");
  };
  const rising = stocks.filter((s) => s.change > 0).length;
  const falling = stocks.filter((s) => s.change < 0).length;

  return (
    <div
      className="app-shell"
      style={{ "--up": colors.up, "--down": colors.down } as CSSProperties}
    >
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("terminal");
          }}
          aria-label="大 A 市场模拟首页"
        >
          <span className="brand-mark">
            A<span>·</span>
          </span>
          <span className="brand-name">
            大 A<span>市场模拟</span>
          </span>
        </a>
        <nav className="main-nav" aria-label="主导航">
          {(
            [
              { id: "terminal", label: "交易终端", icon: "chart" },
              { id: "portfolio", label: "资产组合", icon: "wallet" },
              { id: "news", label: "市场资讯", icon: "news" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => setPage(item.id)}
            >
              <Icon name={item.icon} size={17} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <span className="preview-label">
            <i />
            界面预览
          </span>
          <button
            className="icon-button"
            aria-label="使用说明"
            title="使用说明"
            onClick={() => setHelp(true)}
          >
            <Icon name="info" />
          </button>
          <button
            className="icon-button"
            aria-label="外观设置"
            title="外观设置"
            onClick={() => setSettings(true)}
          >
            <Icon name="settings" />
          </button>
          <span className="avatar" title="本地玩家">
            P
          </span>
        </div>
      </header>

      <div className="workspace">
        <div className="workspace-heading">
          <div>
            <div className="eyebrow">YOUR MARKET. YOUR MOVE.</div>
            <h1>
              {page === "terminal"
                ? "市场总览"
                : page === "portfolio"
                  ? "资产组合"
                  : "市场资讯"}
              <span>观察市场，找到你的节奏。</span>
            </h1>
          </div>
          <div className="world-clock">
            <span className="clock-status">
              <i />
              示例时点
            </span>
            <strong>
              第 1 赛季 <span>/</span> 第 39 日
            </strong>
            <span className="hour-label">第 2 小时</span>
          </div>
        </div>
        <section className="market-strip" aria-label="示例市场概况">
          <div className="index-stat">
            <div>
              <span className="stat-label">
                甲市场综合 <small>示例</small>
              </span>
              <div className="index-value">
                <strong className="numeric up">108.46</strong>
                <span className="up numeric">+1.82%</span>
              </div>
            </div>
            <Sparkline />
          </div>
          <div className="index-stat">
            <div>
              <span className="stat-label">
                乙市场综合 <small>示例</small>
              </span>
              <div className="index-value">
                <strong className="numeric down">102.18</strong>
                <span className="down numeric">−0.64%</span>
              </div>
            </div>
            <Sparkline down />
          </div>
          <div className="breadth-stat">
            <span className="stat-label">样本涨跌分布</span>
            <div className="breadth-labels">
              <span className="up">上涨 {rising}</span>
              <span className="muted">
                平盘 {stocks.length - rising - falling}
              </span>
              <span className="down">下跌 {falling}</span>
            </div>
            <div className="breadth-bar">
              <i style={{ width: `${(rising / stocks.length) * 100}%` }} />
              <i
                style={{
                  width: `${((stocks.length - rising - falling) / stocks.length) * 100}%`,
                }}
              />
              <i style={{ width: `${(falling / stocks.length) * 100}%` }} />
            </div>
          </div>
          <div className="account-stat">
            <span className="stat-label">
              账户净值 <small>元 · 示例</small>
            </span>
            <div className="account-value numeric">
              {money(cash + positionsValue)}
              <span className={direction(profit)}>
                {signed(profit)} <small>浮盈</small>
              </span>
            </div>
          </div>
        </section>

        {page === "terminal" && (
          <main className="terminal-grid">
            <aside className="watchlist-panel">
              <div className="panel-title">
                <h2>行情列表</h2>
                <span className="count-label">{filtered.length} 只</span>
              </div>
              <div className="market-tabs" aria-label="市场筛选">
                {["全部", "甲", "乙", "自选"].map((m) => (
                  <button
                    key={m}
                    aria-pressed={market === m}
                    className={market === m ? "active" : ""}
                    onClick={() => setMarket(m)}
                  >
                    {m === "甲" || m === "乙" ? `${m}市场` : m}
                  </button>
                ))}
              </div>
              <div className="search-field">
                <Icon name="search" size={15} />
                <input
                  aria-label="搜索股票"
                  placeholder="搜索名称、代码、行业"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button aria-label="清空搜索" onClick={() => setSearch("")}>
                    <Icon name="close" size={13} />
                  </button>
                )}
              </div>
              <div className="watchlist-columns">
                <span>名称 / 代码</span>
                <button
                  onClick={() => setSort((v) => !v)}
                  aria-label={sort ? "恢复默认排序" : "按涨幅降序排序"}
                >
                  最新价 / 涨跌幅{" "}
                  <span className={sort ? "accent" : ""}>
                    {sort ? "↓" : "↕"}
                  </span>
                </button>
              </div>
              <div className="stock-list">
                {filtered.map((s) => (
                  <div
                    key={s.id}
                    className={`stock-row ${s.id === stock.id ? "selected" : ""}`}
                  >
                    <button
                      className="stock-select"
                      aria-pressed={s.id === stock.id}
                      onClick={() => setStock(s)}
                    >
                      <span>
                        <strong>{s.name}</strong>
                        <small>
                          <span
                            className={`market-dot market-${s.market === "甲" ? "a" : "b"}`}
                          >
                            {s.market}
                          </span>
                          {s.id}
                        </small>
                      </span>
                      <span
                        className={`stock-quote numeric ${direction(s.change)}`}
                      >
                        <strong>{money(s.price)}</strong>
                        <small>{signed(s.change)}%</small>
                      </span>
                    </button>
                    <button
                      className={`favorite-button ${favorites.includes(s.id) ? "active" : ""}`}
                      aria-label={`${favorites.includes(s.id) ? "移除自选" : "加入自选"} ${s.name}`}
                      aria-pressed={favorites.includes(s.id)}
                      onClick={() => toggleFavorite(s.id)}
                    >
                      <Icon name="star" size={12} />
                    </button>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="empty-state">
                    <Icon name="search" size={23} />
                    <p>
                      {market === "自选" && !search
                        ? "还没有自选股票"
                        : "没有找到匹配的股票"}
                    </p>
                    <small>
                      {market === "自选" && !search
                        ? "点击股票旁的星标，加入观察列表。"
                        : "试试名称、代码或行业关键词。"}
                    </small>
                  </div>
                )}
              </div>
              <div className="watchlist-foot">
                <i />
                固定示例行情 · 非实时数据
              </div>
            </aside>

            <div className="center-column">
              <section className="chart-panel" aria-label={`${stock.name}行情`}>
                <div className="stock-heading">
                  <div>
                    <div className="stock-name-line">
                      <h2>{stock.name}</h2>
                      <span className="stock-id">{stock.id}</span>
                      <button
                        className={`icon-button star-toggle ${favorites.includes(stock.id) ? "active" : ""}`}
                        aria-label={
                          favorites.includes(stock.id)
                            ? "移出当前股票自选"
                            : "将当前股票加入自选"
                        }
                        aria-pressed={favorites.includes(stock.id)}
                        onClick={() => toggleFavorite(stock.id)}
                      >
                        <Icon name="star" size={16} />
                      </button>
                    </div>
                    <div className="stock-tags">
                      <span>{stock.market}市场</span>
                      <span>{stock.sector}</span>
                      <span>{stock.concept}</span>
                    </div>
                  </div>
                  <span className="subtle-badge">示例快照</span>
                </div>
                <div className="quote-summary">
                  <div
                    className={`main-quote numeric ${direction(stock.change)}`}
                  >
                    <strong>{money(stock.price)}</strong>
                    <span>
                      {signed(stock.price - stock.previousClose)}
                      <br />
                      {signed(stock.change)}%
                    </span>
                  </div>
                  <dl className="quote-metrics">
                    <div>
                      <dt>今开</dt>
                      <dd
                        className={direction(stock.open - stock.previousClose)}
                      >
                        {money(stock.open)}
                      </dd>
                    </div>
                    <div>
                      <dt>最高</dt>
                      <dd
                        className={direction(stock.high - stock.previousClose)}
                      >
                        {money(stock.high)}
                      </dd>
                    </div>
                    <div>
                      <dt>成交量</dt>
                      <dd>{stock.volume}</dd>
                    </div>
                    <div>
                      <dt>昨收</dt>
                      <dd>{money(stock.previousClose)}</dd>
                    </div>
                    <div>
                      <dt>最低</dt>
                      <dd
                        className={direction(stock.low - stock.previousClose)}
                      >
                        {money(stock.low)}
                      </dd>
                    </div>
                    <div>
                      <dt>换手率</dt>
                      <dd>{stock.turnover.toFixed(2)}%</dd>
                    </div>
                  </dl>
                </div>
                <div className="detail-tabs">
                  <div>
                    {["行情走势", "公司资料"].map((tab) => (
                      <button
                        className={detailTab === tab ? "active" : ""}
                        aria-pressed={detailTab === tab}
                        key={tab}
                        onClick={() => setDetailTab(tab)}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  <span>公开资料</span>
                </div>
                {detailTab === "行情走势" ? (
                  <>
                    <div className="chart-toolbar">
                      <div className="segmented">
                        <button
                          className={period === "day" ? "active" : ""}
                          aria-pressed={period === "day"}
                          onClick={() => setPeriod("day")}
                        >
                          日 K
                        </button>
                        <button
                          className={period === "hour" ? "active" : ""}
                          aria-pressed={period === "hour"}
                          onClick={() => setPeriod("hour")}
                        >
                          小时 K
                        </button>
                      </div>
                      <button
                        className={`indicator-toggle ${average ? "active" : ""}`}
                        aria-pressed={average}
                        onClick={() => setAverage((v) => !v)}
                      >
                        <Icon name="chart" size={14} />
                        均线 {average ? "开" : "关"}
                      </button>
                      <span className="chart-source">OHLCV · 演示</span>
                    </div>
                    <MarketChart
                      stock={stock}
                      period={period}
                      showAverage={average}
                    />
                    <div className="chart-caption">
                      <span>以世界交易日计时</span>
                      <span>价格与成交量为 UI 示例</span>
                    </div>
                  </>
                ) : (
                  <div className="company-detail">
                    <span className="eyebrow">COMPANY PROFILE</span>
                    <h3>{stock.name}</h3>
                    <p>
                      {stock.name}是一家位于{stock.market}市场、主营
                      {stock.sector}相关业务的虚构企业。当前关联概念为「
                      {stock.concept}」。
                    </p>
                    <dl className="detail-list">
                      <div>
                        <dt>所属行业</dt>
                        <dd>{stock.sector}</dd>
                      </div>
                      <div>
                        <dt>关联概念</dt>
                        <dd>{stock.concept}</dd>
                      </div>
                      <div>
                        <dt>新买股份可售时间</dt>
                        <dd>
                          {stock.market === "甲"
                            ? "下一交易日"
                            : "下一竞价批次"}
                        </dd>
                      </div>
                      <div>
                        <dt>资料范围</dt>
                        <dd>公开资料示例</dd>
                      </div>
                    </dl>
                    <p className="muted">
                      概念关联代表业务联系，不代表热度或收益承诺。正式经营简报将在市场内核接入后提供。
                    </p>
                  </div>
                )}
              </section>
              <section className="positions-panel">
                <div className="positions-heading">
                  <div className="panel-tabs">
                    {["当前持仓", "当日委托", "成交记录"].map((t) => (
                      <button
                        key={t}
                        aria-pressed={bottomTab === t}
                        className={bottomTab === t ? "active" : ""}
                        onClick={() => setBottomTab(t)}
                      >
                        {t}
                        {t === "当前持仓" && <span>3</span>}
                      </button>
                    ))}
                  </div>
                  <span className="subtle-badge">示例账户</span>
                </div>
                {bottomTab === "当前持仓" ? (
                  <HoldingsTable onSelect={selectStock} />
                ) : (
                  <div className="empty-state compact">
                    <Icon
                      name={bottomTab === "当日委托" ? "grid" : "check"}
                      size={24}
                    />
                    <div>
                      <p>
                        {bottomTab === "当日委托"
                          ? "暂无已提交委托"
                          : "暂无成交记录"}
                      </p>
                      <small>
                        预览委托不会实际提交；交易功能将在内核接入后启用。
                      </small>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <aside className="right-column">
              <OrderTicket key={stock.id} stock={stock} />
              <section className="news-panel">
                <div className="panel-title">
                  <h2>市场快讯</h2>
                  <button
                    className="text-button"
                    onClick={() => setPage("news")}
                  >
                    全部
                    <Icon name="chevron" size={12} />
                  </button>
                </div>
                <div className="news-items">
                  {news.slice(0, 2).map((n) => (
                    <button
                      className="news-item"
                      key={n.id}
                      onClick={() => setArticle(n)}
                    >
                      <span className="news-time">
                        <i />
                        {n.time}
                      </span>
                      <strong>{n.title}</strong>
                      <span className="news-tag">{n.tag}</span>
                    </button>
                  ))}
                </div>
              </section>
            </aside>
          </main>
        )}

        {page === "portfolio" && (
          <main className="portfolio-page">
            <section className="portfolio-overview">
              <div>
                <span className="eyebrow">PORTFOLIO / 示例账户</span>
                <h2>让每一笔配置，都有据可循。</h2>
                <p>现金、持仓与可售股份，集中掌握。</p>
              </div>
              <div className="allocation-bar">
                <span style={{ flex: cash }} />
                <span style={{ flex: positionsValue }} />
              </div>
              <div className="allocation-labels">
                <span>
                  <i />
                  现金 {((cash / (cash + positionsValue)) * 100).toFixed(1)}%
                </span>
                <span>
                  <i />
                  股票{" "}
                  {((positionsValue / (cash + positionsValue)) * 100).toFixed(
                    1,
                  )}
                  %
                </span>
              </div>
            </section>
            <section className="portfolio-stats">
              {[
                { label: "总现金", value: cash },
                { label: "可用现金", value: cash - frozenCash },
                { label: "冻结现金", value: frozenCash },
                { label: "持仓市值", value: positionsValue },
              ].map((s) => (
                <div key={s.label}>
                  <span>
                    {s.label}
                    <small>元</small>
                  </span>
                  <strong className="numeric">{money(s.value)}</strong>
                </div>
              ))}
            </section>
            <section className="portfolio-holdings">
              <div className="panel-title">
                <h2>
                  持仓明细 <span className="count-label">3 只</span>
                </h2>
                <span className="muted">
                  锁定{" "}
                  {holdings
                    .reduce((sum, h) => sum + h.quantity - h.available, 0)
                    .toLocaleString()}{" "}
                  股 · 冻结 0 股
                </span>
              </div>
              <HoldingsTable onSelect={selectStock} />
              <p className="section-note">
                示例账户仅用于展示信息层级，尚未连接交易账本或生涯存档。
              </p>
            </section>
          </main>
        )}

        {page === "news" && (
          <main className="news-page">
            <section>
              <div className="panel-title">
                <h2>公开信息流</h2>
                <span className="count-label">3 条示例</span>
              </div>
              {news.map((n) => (
                <article className="news-card" key={n.id}>
                  <div className="news-card-meta">
                    <span className="news-tag">{n.tag}</span>
                    <span>{n.time}</span>
                  </div>
                  <button onClick={() => setArticle(n)}>
                    <h2>{n.title}</h2>
                    <p>{n.summary}</p>
                    <span className="read-more">
                      阅读详情
                      <Icon name="arrow" size={15} />
                    </span>
                  </button>
                  <button
                    className="related-stock"
                    onClick={() => selectStock(n.stock)}
                  >
                    {n.stock.name}
                    <span className={direction(n.stock.change)}>
                      {signed(n.stock.change)}%
                    </span>
                    <Icon name="chevron" size={13} />
                  </button>
                </article>
              ))}
            </section>
            <aside className="reading-note">
              <Icon name="news" size={28} />
              <h2>先读信息，再做判断。</h2>
              <p>公开线索、经营结果与市场预期，共同构成你的决策依据。</p>
              <div />
              <h3>当前为界面预览</h3>
              <p>
                消息与公司均为虚构示例。未来事件不会提前展示；公开消息也不保证价格朝某个方向变化。
              </p>
            </aside>
          </main>
        )}

        <footer className="app-footer">
          <span>
            <i />
            本地界面预览<span className="footer-divider">/</span>
            所有公司、行情与资讯均为虚构示例
          </span>
          <button onClick={() => setSettings(true)}>
            涨跌配色可自定义
            <Icon name="settings" size={12} />
          </button>
        </footer>
      </div>
      {settings && (
        <AppearanceSettings
          colors={colors}
          onChange={setColors}
          onClose={() => setSettings(false)}
          storageError={storageError}
        />
      )}
      {article && (
        <Modal title="公开资讯" onClose={() => setArticle(null)}>
          <div className="news-card-meta">
            <span className="news-tag">{article.tag}</span>
            <span>{article.time}</span>
          </div>
          <h3 className="article-title">{article.title}</h3>
          <p className="article-body">{article.detail}</p>
          <p className="inline-notice">虚构资讯示例 · 仅用于界面预览</p>
          <button
            className="button button-primary full-width"
            onClick={() => {
              selectStock(article.stock);
              setArticle(null);
            }}
          >
            查看 {article.stock.name}
            <Icon name="arrow" size={16} />
          </button>
        </Modal>
      )}
      {help && (
        <Modal title="欢迎来到大 A" onClose={() => setHelp(false)}>
          <p className="article-body">
            这是一个双市场策略游戏的交互界面预览。你可以筛选股票、切换图表、管理本次会话的自选、查看资产和资讯，并预览委托表单。
          </p>
          <dl className="detail-list">
            <div>
              <dt>甲市场</dt>
              <dd>新买股份次日可售</dd>
            </div>
            <div>
              <dt>乙市场</dt>
              <dd>新买股份下一批可售</dd>
            </div>
            <div>
              <dt>外观设置</dt>
              <dd>涨跌颜色可自由选择，本机保存</dd>
            </div>
          </dl>
          <p className="inline-notice">
            交易、时钟推进和游戏存档尚未接入。当前固定示例不代表实际模拟或阶段验收通过。
          </p>
          <button
            className="button button-primary full-width"
            onClick={() => setHelp(false)}
          >
            开始探索
          </button>
        </Modal>
      )}
    </div>
  );
}
