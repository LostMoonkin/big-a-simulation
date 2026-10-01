# 有限资金交易核心

P1 使用显式、资金与股份齐全的场景。规则/内容版本 0.3.1、快照 schema 1、fixed-q9-v1、rng-v1。源码是纯 TypeScript，不依赖 DOM、存储、系统时间或非固定随机数；CLI 与 Worker 均从 `src/index.ts` 调用同一实现。

```ts
import { createScenario } from '@big-a/sim-core';

const core = createScenario({
  seed: 42,
  playerAccountId: 'buyer',
  stocks: [{ id: 'A001', market: 'A', initialPrice: 1000 }],
  accounts: [
    { id: 'buyer', cash: 100_000n, holdings: [] },
    { id: 'seller', cash: 0n, holdings: [{ stockId: 'A001', quantity: 50 }] },
  ],
});
const view = core.readPublicView({ kind: 'market' });
core.submitCommand({ id: 'buy-1', publicVersion: view.publicVersion, target: view.clock,
  body: { kind: 'immediate', stockId: 'A001', side: 'buy', quantity: 50, limitPrice: 1000 } });
core.submitFor('seller', { id: 'sell-1', publicVersion: view.publicVersion, target: view.clock,
  body: { kind: 'immediate', stockId: 'A001', side: 'sell', quantity: 50, limitPrice: 1000 } });
core.advance({ stop: 'batch', maxBatches: 1, pauseOnMajor: false });
const saved = core.exportSnapshot();
```

`ScenarioInput` 和诊断字段见 [trading-types.ts](src/trading-types.ts)。价格是整数分，股数是整数，现金/费用是 BigInt 分；股份总发行量若省略，取所有账户初始持仓之和。显式总发行量必须与所有账户（包括不可交易创始持有人）的持仓精确相等。`canTrade:false` 禁止该账户下单。玩家账户可为 null；费用分配权重默认取非玩家交易账户的初始现金，固定不随盈亏改变。

默认 `(0,0)/publicDecision` 构造会执行本批公开准备。`phase:'settled'` 表示输入时点已经结算；下一准备从下一批开始。场景从日中开始时，甲的 `processedBatchesToday` 默认 0，未模拟的批次不会冒充一整日受阻；确有前缀状态时可显式给出该计数及 `tradedToday`。正常逐批推进和快照恢复自动保留它们。

`prepareNextBatch()` 只进行解锁、到期、费用周期和公告准备，停在 publicDecision；在该阶段重复调用无副作用。固定参与者通过 `readFor(accountId,query)` 读取共同公开资料及本人账户，再用 `submitFor` 提交同 publicVersion/同 target 的命令。所有人完成决策后调用 `advance` 清算。`pauseOnMajor:true` 停在已公开、未清算的窗口；查看/保存后用 false 继续。工作量由 maxBatches 控制，取消在稳定边界返回。

命令 ID 全局去重，相同账户与规范命令内容重试返回原回执；改变内容复用 ID 拒绝。去重在旧版本/旧批校验之前。有效但被拒绝的命令也保存回执，重试不能后来变成新单；记录回执会提高 stateVersion，但不改变经济资源。新命令可指向当前 publicDecision 或 settled 后下一批，不能指定更远的未来。计划 endAt 必须为小时末批 3/7/11/15。日单到当日批 15；即时余量本批撤销；计划子量按剩余总量/剩余批次向上取整。

`cash` 是总现金，冻结现金与 `pendingProceeds` 均为其中受限部分；availableCash=cash−reservedCash−pending。卖款在结算时计入 cash，下一批准备解除 pending 限制。甲新股次日批 0 解锁，乙新股下一批解锁。所有股票的有效申报在清算前已冻结；结算在临时完整账本中计算、审计后一次替换，任一错误不留下部分股票成交。

`convertIntents(accountId,intents)` 对全部股票/两市场的固定 NPC 意图执行统一含费预算缩量、取整后再按评分/股票 ID/档位稳定减量，返回可提交意图，不替玩家缩单，也不预支卖款。`targetGap(accountId,stockId,targetShares)` 使用当前总持股和活跃买卖余量；总量分批计划使用自身 remainingQuantity，二者语义分开。

`clearAuction` 是生产清算器的纯函数入口，只接受已经有资源支持、同账户同股单向的订单簿。账户分配按价格优先、同价数量比例/最大余数；同余数键为 `randomU32(seed,'allocation',stockId+':'+side+':'+限价位+':'+accountId,tick,0)` 升序，账户 ID 作后备。账户获配再按 sequence、订单 ID 顺序回写。费用按账户×股×批×方向汇总向上取整，归属项按金额费率余数和订单 ID 分摊。

`readPublicView/readFor` 只投影当前已公布消息、报告、行情和本人订单/资源；未来排程、隐藏结果、实际经营和其他钱包只在 `diagnostics()` 或完整快照中。diagnostics 是验证入口，包含 state/trace/audit/stateHash，不应传给游戏参与者。诊断日志不进入经济状态摘要；查询不改变状态或随机键。

快照使用规范整数编码和同步标准 SHA-256 UTF-8。publicDecision 与 settled 都可保存，prepared tick 防止重做公告/解锁；清算中间态不可保存。恢复先检查 64 MiB/深度 64、版本、校验、资源关系和总账，再原子替换；失败保留当前局。`createMarketCore()` 可建立空接收器后恢复。P1 的 `createWorld` 保留冻结接口并明确返回 generationFailed；自主世界生成、250 日预热、NPC 决策和正式玩家本金注入由 P2 实现，显式场景不是正式新局。

实际包检查：`npm run typecheck --workspace @big-a/sim-core`。阶段 fixtures、独立穷举、CLI 和跨端证据由 `tools/sim-runner` 提供；包内自检不表示独立 P1 验收通过。
