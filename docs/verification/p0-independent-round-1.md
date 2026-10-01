# P0 第 1 轮独立验收

日期：2026-10-01。结论：**fail，P0 尚未通过**。受测实施提交：`a8625e98a8a33a5efde46ede55adf9e00e57df6a`（含浏览器实施 `ae881aa`）；规则/玩法及内容 0.3.0、schema 1、math `fixed-q9-v1`、rng `rng-v1`。验收者与实施者不同，本轮未修复或优化实现。

受测源码 hash 为 `970479dbf2844dc03cacc8e5fa4628727070ec5f10ad5bea30f59f913cf4f759`，与交付自检一致。独立小证据见 [p0-independent-round-1.json](fixtures/p0-independent-round-1.json)。本结论来自逐项合同审阅、实际重跑及独立数据复核，16 项自检 pass 不等于阶段通过。

## 实际执行与证据

- 为避免验证脚本重写实施者的已提交报告，将受测文件复制到 `artifacts/verification/p0/independent-round-1/source`；在此执行 `npm run verify:p0`，退出码 0、16 项 pass，重算 sourceHash 与完整实施提交一致。
- 在同一隔离副本执行 `npm run fixtures:p0`，退出码 0。重建 40 股、200 股及种子文件与受测提交逐字节一致；两套行业/规模矩阵另按权威规则常量独立核对。
- 在仓库执行 `npm run build`，退出码 0；全部工作区 typecheck 及 Vite 静态多页构建通过，24 个模块。构建产物不证明市场模拟或启动性能。
- 执行 `node tools/p0/browser-probe.mjs http://127.0.0.1:4173/p0-probe.html "C:/Program Files/Google/Chrome/Application/chrome.exe" artifacts/verification/p0/independent-round-1/browser-release`，退出码 0；真实 Chrome `154.0.8037.58`、Node `v26.7.0`，静态页面 11 项 pass。实际 Worker 与当次 Node 输出逐字段一致，真实鼠标输入创建水平线/趋势线并删除，无页面/控制台错误。
- 读取独立浏览器原始状态，重新计算日/小时/短历史的 151 个可用 MA 数值，最大差值 0；所有不可用/未完成窗口保持缺值。实际日图及画线截图已查看。交付浏览器证据的 6 个源码 hash 与受测文件均匹配。
- 执行独立诊断 `node artifacts/verification/p0/independent-round-1/diagnostics.mjs`，退出码 1：MA、矩阵/重建、浏览器源码绑定通过；合法编码输入的键顺序反例失败，详见 B03。
- 从实际 `node_modules` 核对 React/React DOM 19.3.0、TypeScript 7.0.2、Vite 8.3.2、plugin-react 6.1.1、KLineChart 9.8.12 的包 metadata 和 LICENSE/NOTICE 文件，与工具档案一致。查阅了 [KLineChart 官方版本记录](https://v9.klinecharts.com/en-US/guide/changelog)、[Vite Worker 官方说明](https://vite.dev/guide/features.html#web-workers)和[ECB 传导说明](https://www.ecb.europa.eu/mopo/intro/transmission/html/index.en.html)，未将现实资料当成本游戏参数的实证证明。

原始 JSON、隔离源码及截图位于 ignored `artifacts/verification/p0/independent-round-1/`，不作为默认应入 Git 的大量日志；已提交的小证据包含命令、commit/sourceHash、环境、原始文件校验值、AC 与问题结果。正式受测代码与 fixtures 未被本轮改写。

## AC 与决策核对

| AC | 结果 | 本轮证据与范围 |
|---|---|---|
| P0-AC1 | fail | 权威文档和版本可定位，但 B01 的基准参数冲突、B02 的 P3 生成合同空白、B04 的 P2 浏览器范围仍要求下游自行决定。 |
| P0-AC2 | pass | 两市 profile、共享/本地状态及传导渠道明确；MI-A01–04、MI-B01–04 每市 2 成立+2 失败，公开时点、来源、方向与真实资源限制齐备。当前只签收场景合同，真实目标/委托/成交在 P3。 |
| P0-AC3 | pass | 两市保护状态表、边界可成交/带外交叉/无交叉与空供需反例一致；A13/A14 现行断言同步，7 个有界算术场景重跑通过。生产状态机在 P1。 |
| P0-AC4 | pass | 完整 40/200 股配置同时满足行业/规模/标签/关联边际、合法暴露、跨行业概念与 26 钱包的股份/初始现金算术；重建字节一致。自然多种子世界生成在 P2/P4。 |
| P0-AC5 | fail | BigInt 钱、Q9 模型、乘法上界、费用、固定数学/随机流、13 点 Decimal 与 Node/真实 Worker 黄金均有实际证据；但 B03 的 canonical 编码键顺序合同与可复用实现不一致。 |
| P0-AC6 | pass | 240→254 更新→262 结果→265 报告覆盖→273 结束的纸面/数据时序成立；499/500 世界日、20 日到期、锁定股与跨季计划连续；publicDecision/settled 两类安全快照和原子清算合同明确。未冒称生产恢复已运行。 |
| P0-AC7 | pass | 已锁定的依赖/许可、静态构建、真实 Canvas 小时/日 K、无成交/未完成、MA/缺历史、画线与 Worker 技术试验重跑通过。 |
| P0-AC8 | fail | A01–A32/新增场景责任、种子分组、逐种子市场硬线、设备/网络/p95/20 次默认启动、默认完整快照池与任意种子现场预热协议已给出；B04 的原型浏览器验收边界未冻结。 |

D01/D02/D03/D04/D06 的本阶段合同检查通过；D05 因 B03 未关闭，D07 因 B01/B04 未关闭，D08 的 24/6 和 8/2 映射通过，但其 P3 依赖的生成合同因 B02 未关闭。P0-T1 的场景/保护成果和 T2 的配额/时间成果可独立保留，整阶段及 T3 出口尚未通过。

## 聚合阻塞与最小返工

### B01：基准模型有两个不同的 alpha 答案

[工程基线第 49 行](../design/engineering-baseline.md#世界和内容配额)要求库存/噪声之外的角色统一 `alpha=.9`；[P2 plan 第 25 行](../specs/02-market-prototype/plan.md#基准预设-baseline-v1)要求各风格的 alpha、温度、基础持股比例和非技术行为保持不变，[总计划](../specs/implementation-plan.md#配置数据与内容)也要求保留非技术行为。[规则 4.3](../design/market-model-rules.md#目标权重)的趋势/主题 alpha=.15、跨市场=.75，与统一 .9 不同。

这会改变基准钱包的价值响应与成交覆盖，不能留给 P2 实现者任择。最小修复是定下一个基准预设并同步受影响规则/计划与关闭记录；默认应保留已约定的非技术参数。若确实改变该参数，需明确变更理由和影响，不能仅换一句文字后宣称是同一基准。无需在本轮预先运行尚未实现的 NPC 经济。

### B02：代表事件的自然生成答案尚未冻结

[P3 plan 的进入条件第 3 项](../specs/03-events-and-strategies/plan.md#进入条件与合同核对)明确依赖 P0 定下 8 模板/2 链的结果分布、作用单位、报告覆盖、重大信息条件、文本槽位及分支键。现有 [content-registry.json](../../tests/scenarios/p0/content-registry.json)只有模板名称/ID、链成员数组与一句通用合同；[规则第 7 节](../design/market-model-rules.md#事件结构与去重)仍写“结果按既有公开预期附近的分布生成”，没有给出可用的分布或参数。固定 MI/跨季算例决定特定输入，不能代替自然生成的通用答案。

最小修复是为已选的 8 模板/2 链给出一个可执行的公共 schema/默认参数表及可复核数据样本：具体渠道/单位、预期与结果分布/范围、持续及覆盖语义、重大标记/条件、合法分支与确定性抽样键、必要文本槽。可复用通用规则，不要求 P0 实现事件引擎或补齐 P4 的全部正文；不能把关键参数改写为“P3 再定”。

### B03：canonical JSON 的键顺序与冻结文字不同

[工程基线第 21 行](../design/engineering-baseline.md#数值和随机合同)规定对象 key 按 UTF-16 排序；[numeric.ts 的 encodeExact](../../packages/sim-core/src/numeric.ts)使用排序后的 `Object.fromEntries` 再 `JSON.stringify`，整数索引键仍会按数字顺序输出。对合法 `ExactValue` 输入：

```js
encodeExact({ '10': 1, '2': 2 })
// 实际：{"2":2,"10":1}
// 当前冻结文字要求：{"10":1,"2":2}
```

本反例没有声称已发生账务精度丢失或跨端不同，但哈希的规范字节答案存在冲突。最小修复是让编码实现满足冻结排序，或明确冻结实际采用的整数索引键/普通键排序规则并补对应黄金样本；规则/数值协议变更须留痕。无需增加泛化迁移或其他系统。

### B04：P2 的首个原型浏览器范围未指定

[P2 plan 进入条件第 2 项](../specs/02-market-prototype/plan.md#进入条件)要求 P0 冻结“首个浏览器范围”，[P2-AC4](../specs/02-market-prototype/spec.md#acceptance-criteria)按“P0 原型浏览器范围”签收。当前工程基线记录了 P0 实际 Chrome 试验和 P5 的四桌面/移动设备责任，但没有给出 P2 原型应在哪些真实浏览器执行完整脚本。

最小修复是明确原型浏览器及版本记录/更新原则，例如指定当期真实 Chrome 为 P2 最初范围，并保留 P5 的完整兼容责任。不要求 P0 提前取得 Safari、移动或目标玩家证据；实际已测 Chrome 不自动等于冻结了 P2 验收边界。

## 未执行与回交

P1 的生产撮合/账本/命令恢复、P2 的 100+10 长期种子与 60 日操作、P3 的事件/策略/保留初筛、P4 的预热快照/生涯/耐久存档，以及 P5 的真实 Safari/移动/目标玩家/完整性能，均属于后续责任且本轮 `not_run`；没有据此扩张 P0 或用它们补造通过。

本轮共有 4 项可见合同阻塞，交回原 P0 实施代理最小修复。保留已通过的独立证据；第 2 轮核对修复、受影响试验与剩余 P0 出口。P0 仍未通过，不能凭本轮技术试验进入下游“已完成”。
