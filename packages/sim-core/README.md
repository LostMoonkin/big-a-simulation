# 有限资金交易核心

P1 使用显式、资金与股份齐全的场景。规则/内容版本 0.3.1、快照 schema 1、fixed-q9-v1、rng-v1。源码是纯 TypeScript，不依赖 DOM、存储、系统时间或非固定随机数；CLI 与 Worker 均从 `src/index.ts` 调用同一实现。

P2第1轮失败后的单一报价候选为 `NPC_QUOTE_VERSION='npc-quote-v2-target-gap'`。新世界的私有 `world.npcQuoteVersion`、公开progress/diagnostics的有效版本、configHash和`exportBaselinePreset()`均绑定它。按本人风险限制后的剩余需求g与固定initialShares计算 `clip(g*Q9/initialShares,±120000000)`，仅对三档的保留价格乘expQ；评分用referenceQ、持续目标、数量/资源、费用与保护不变。缺字段旧world-v1/v2档有效版本为npc-quote-v1，保持原报价及canonical字节，未知值恢复失败且保留当前世界；不会迁移旧档或加钱。具体合同见[规则5.2](../../docs/design/market-model-rules.md)。

`node packages/sim-core/check-npc-quote.mjs --out artifacts/verification/p2/<new-run-id>`使用保留的diagnostic-02/03完整输入和[NPC-QUOTE-01](../../tests/scenarios/p0/npc-quote-candidate.json)执行生产固定报价/有限资源清算、版本绑定、旧档及冻结旧源码后续对照。隔离旧源码只写ignored运行目录；该回归需要此前保留输入，不生成或替代新的250日预热/100+10长期经济。新候选的自主经济由CLI从头重跑，P2仍未通过。

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

快照使用规范整数编码和同步标准 SHA-256 UTF-8。publicDecision 与 settled 都可保存，prepared tick 防止重做公告/解锁；清算中间态不可保存。恢复先检查 64 MiB/深度 64、版本、校验、资源关系和总账，再原子替换；失败保留当前局。`createMarketCore()` 可建立空接收器后恢复。显式 P1 场景保持原规范字段与回放路径。

P2 的 `createWorld({rulesVersion,contentVersion,seed,size:'prototype',mode:'baseline',playerCapital})` 生成两市各 20 股、26 个真实交易钱包及非流通股份的创始持有人，停在世界日 0/批 0 的公开决策窗口。公司价格、股份、流通比例、经营暴露与概念业务来自指定 seed；每批在公开准备之后生成 NPC 委托，以持续目标、小时成交余量、可售股与跨股统一含费现金预算约束，再进入同一生产清算器。`exportBaselinePreset()` 返回正在使用的风格参数、关闭项与角色复核周期；P2 仅支持 prototype/baseline，full/complete 返回 generationFailed。

当前新建初始化候选为 `INITIALIZATION_VERSION='world-v2-style-cash'`，公共 progress 的 initializationVersion 与私有 world.generationVersion 标识它。`initialNpcCash(holdingValue,role)` 仅创建时对普通角色按原基础持股比例 f 返回 floor(H×(1−f)/f)，库存角色仍 H/4；初始股份与所有风格行为参数保持。已有 world-v1 存档恢复保留原现金、固定回流权重和目标，不调用新初值公式；P1显式场景不带初始化字段。样本旧/新总资产与共同失败种子见 [初始化候选](../../tests/scenarios/p0/initialization-candidate.json)。此候选待复跑，不是经济通过或旧世界迁移。

`warmup({maxBatches,cancelRequested?})` 分段执行世界日 0–249 的真实 4000 批。complete 表示 settled/249/15，尚未注资；随后显式 `prepareNextBatch()` 在 250/0 加入玩家本金一次。再次准备/恢复不会重新加钱或重置 NPC 记忆。也可用 `advance` 的显式 249/15 目标完成同一预热。预算或取消只在完整批次边界返回，Worker 应在小预算块之间让出消息循环。60 玩家日是 Web 体验边界（309/15），核心允许长期实验继续运行，不强制清仓或发奖金。

生成世界通过 `readWorldView(query)` 读取 [world-types.ts](src/world-types.ts) 的公共字段。公司简报只含公开报告、经营预期参考与示意区间（参考值的 ±10%，不是概率承诺）、业务暴露和真实行情；不含隐藏经营值或阶段名称。chart/company 查询沿 P1 只返回所选公司的 companies，可另读 market 获取全表。小时/日 bars 从真实清算价与数量聚合，未完成和全窗无成交均有明确标记；小时线保留最近 120 世界日，日线完整保留。timestamp 是从 2000-01-01 起的固定虚构图表坐标，不是现实市场时间。本人 executions 保存逐次成交价、量、费用与买入可售时点，跨恢复保留，不虚构持仓成本或浮盈。玩家委托保存提交当时的 submissionReference 与 submissionReferenceOnly；早期未捕获参考的开发存档显示 null，不用恢复后的行情冒充提交价。

经营增长在日终积累、下一开盘提交；日扰动的 RNG tick 仍取当日批 0。每股按市场内序号模 20 错峰公开，公开预期参考变化至少 5% 时触发相关 NPC 提前复核，玩家已有持仓才因此暂停。publicDecision 存档中的公开准备已完成，NPC 尚未更新观点/申报。确认已展示的重大资料后，可用 pauseOnMajor:false 执行当前一批，再用 true 捕获后续窗口。

`diagnosticsSummary()` 仅用于验证，返回当前钱包/目标/小时容量、守恒审计和最新批 BatchTrace；它不复制累计历史或计算完整状态哈希。完整 `diagnostics()` 与 `exportSnapshot()` 用于复现错误和经济状态对照，不应每批调用或送到主线程。NPC 即时委托在该批结束移除，不进入玩家命令去重表；玩家回执、订单、锁定、成交、经营、目标与 K 线都在完整快照内。诊断 trace 仅留最新批且不进入经济摘要，恢复后为空。

P2 自主经济仍待独立验收。初始短诊断发现成交日不足；守恒与接口可运行不代表通过 100 注册种子的 90%×80% 长期门槛。实际失败快照和后续修复/复跑由阶段验证工具保留，不以少量样例代替完整闸门。

3443852 的两种子诊断（各 250 日预热 + 5 玩家日）仍未满足短窗同口径筛查：3572871866 为甲 2/20、乙 6/20；1866980507 为甲 1/20、乙 6/20 股票达到 4/5 成交日，8160 批资源/账务检查零违规。复跑命令为 `node tools/sim-runner/p2-batch.mjs --manifest tests/scenarios/p2/diagnostic-manifest.json --out artifacts/verification/p2/diagnostic-02 --jobs 1`。经济源 hash 为 a5cd1981a077cd9b27e2f50f1cd2f1834635bfcdc85ba5aa75a0cb7e0f08f803，前后绑定一致；这是诊断范围，完整 100+10 长期组尚未运行。

生产预设与 P0 baseline-v1 的 49 项版本/关闭项/风格标量逐项相同。普通目标使用初始 baselineWeight、原 alpha/温度/比例、λ 与世界日相位，复核后目标股数持续保留；库存按初始股数和每日 .8/.01/±.1 的 zeta；观点按 .9η+σz；风险用此前 20 日收益的样本标准差/ .06；L、各风格小时上限、三档报价与 20/30/50% 数量均保持冻结值。此前发现的跨市 ID、经营日 RNG tick 和目标权重取整余数已修复，没有因此承诺成交门槛解决。

诊断末态第一种子的普通账户实际持股占 NAV 79.33%，目标为 63.22%；库存目标仅为其现持股的 91.18%，全部目标股价值仅现流通股价值的 82.41%，40 股净目标缺口均负，12 股没有任何买目标。第二种子对应 79.07%/65.10%、总目标 84.64%，13 股没有买目标。多数零量来自没有交叉需求，现金未耗尽；第一种子只有 2 股批受保护阻挡，第二种子没有。初始化现金为持股值 25%（实际持股比例 80%），普通风格长期目标为 55–70% 加风险项，库存目标围绕初始股数；核心不能为了覆盖率补反向订单、改参数或发现金。共同初始比例、风格目标和基于经营估值的硬报价锚是否相容，需要先做有版本的合同评估，保留失败种子后再决定修订并重跑；当前实现不自行变更规则或降低闸门。

实际包检查：`npm run typecheck --workspace @big-a/sim-core`。阶段 fixtures、独立穷举、CLI 和跨端证据由 `tools/sim-runner` 提供；包内自检不表示独立 P1 验收通过。
