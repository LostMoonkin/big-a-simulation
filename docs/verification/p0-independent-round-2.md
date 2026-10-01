# P0 第 2 轮独立验收

日期：2026-10-01。结论：**pass，P0 设计与工程基线已独立验收通过**。这是本阶段第 2 轮、最后一轮常规独立验收；验收者与实施者不同，未修复或优化实现。受测提交为 `13567e6cb5333c042cb28e1f61e6337c36661426`，含事件合同修复 `0f23213`、其余修复整合 `d23eb5e` 及最终证据绑定。

规则/玩法及内容 0.3.1、event-v1、schema 1、math `fixed-q9-v1`、rng `rng-v1`。P0 spec 1.0 的 AC 和原经济、性能门槛未降低。34 个受测文件的 Git blob、工作区和实际运行的隔离副本 sourceHash 均为 `aad4d9476f6217c8a01b6a5ac17d965b7227edaf5659b19957d6062d5e32905f`。独立小证据见 [p0-independent-round-2.json](fixtures/p0-independent-round-2.json)。

## 实际核验

本轮先审阅[第 1 轮 fail](p0-independent-round-1.md)、[修复记录](p0-repair-round-1.md)，再对受测差异、权威规则、样本和 P0 AC1–8 核对。实施自报 pass 未直接用作独立结论。

- 在 `artifacts/verification/p0/independent-round-2/source` 的受测副本执行 `npm run verify:p0`，退出码 0，19 项通过。副本隔离脚本写出的 Node/Decimal 报告，没有改写已提交的实施报告。包含新增风格、编码和事件合同检查，以及受影响的数值、保护、配额、时间、公开投影和种子检查。
- 在仓库执行 `npm run build`，退出码 0；工作区 typecheck 与 Vite 静态构建通过，24 个模块。
- 执行 `node tools/p0/browser-probe.mjs http://127.0.0.1:4173/p0-probe.html "C:/Program Files/Google/Chrome/Application/chrome.exe" artifacts/verification/p0/independent-round-2/browser-release`，退出码 0；真实 Windows Chrome `154.0.8037.58`、Node `v26.7.0`，11 项通过。该次静态构建的实际 Worker 输出含新增 `keyOrderEncoding`，全部字段与本次 Node 黄金一致；小时/日 K、缺历史、无成交、真实指针画线/删除、重复请求身份及页面错误检查通过。
- 执行独立诊断 `node artifacts/verification/p0/independent-round-2/diagnostics.mjs`，最终退出码 0。逐文件核对 Git blob 与工作区字节，重算 sourceHash；复核五种普通风格各六个非技术参数及库存参数；原黄金九个字段全部保留；40/200 股配置和种子除版本字段外与第 1 轮一致；六个浏览器相关文件与受测提交一致。诊断第一次把 Worker 原始证据字段误写为 `workerPayload`，退出码 1；按原始结构改为 `workerTrace[0].payload` 后通过，这是验收读取器错误，未修改受测实现。

图表页面、Worker 入口和 HTML 与第 1 轮逐字节相同，因此继承其 151 个 MA 数值独立复算及截图目视检查，未再扩展未受影响的图表验证。第 1 轮已实际核对的依赖许可和官方技术依据同样保留；本轮锁文件未变。未无理由重复配额重建，改以配置完整值比较证明仅规则/内容版本变化。

原始浏览器状态、截图、Node/Decimal 结果和诊断位于 ignored `artifacts/verification/p0/independent-round-2/`；提交的小证据保存其校验值、受测提交、命令、环境和结果。正式状态更新限于 P0 及其文档入口，不改实现源码或后续阶段的未完成状态。

## 四项阻塞关闭

| 问题 | 独立结论 | 核对依据 |
|---|---|---|
| B01 基准 alpha 冲突 | closed | `baseline-v1.json`、精确规则、工程基线与 P2 plan 一致：价值/趋势/主题/噪声/跨市场 alpha=.90/.15/.15/.20/.75；温度、持股比例、观点/评分噪声、容量、库存和生命周期保留，只关闭约定的技术/主题输入及突发链。独立参数复核通过。 |
| B02 8 模板/2 链生成合同空白 | closed | [代表事件合同](../design/event-content-contract.md)及 `representative-events.json` 明确公开 schema、Q9 单位、预期/实际有界分布、持续/报告覆盖、重大条件、文本槽、稳定 ID/随机键、五条合法分支和节点时点；与 registry、规则及 P3 plan 对接。13 个 RNG 样本、6 个结果抽样、5 个分支和 9 个公开样本通过实际检查。审阅了预期替换、负业务权重、结果低于预期、融资去重、部分覆盖、旧版本到期和正负 5% 条件。这里只签收合同与算例。 |
| B03 编码键顺序矛盾 | closed | 权威合同明确数组索引键数值升序、其他字符串键 UTF-16 序，与现有编码字节一致。原反例得到 `{"2":2,"10":1}`；新增混合/嵌套边界黄金及实际 Worker 均一致，原黄金字段未改变。 |
| B04 P2 首个浏览器范围空白 | closed | 工程基线及 P2 plan 明确真实 Windows 桌面 Chrome、当前版本 `154.0.8037.58`，完整 60 日/新会话恢复验收范围和升级后登记及重跑协议；本轮仅完成 P0 技术试验。P5 四桌面浏览器、真实 Safari 和移动检查责任保留。 |

## AC 与任务签收

| AC | 结论 | 证据与本阶段边界 |
|---|---|---|
| P0-AC1 | pass | 0.3.1 权威规则、D01–D08、baseline-v1、event-v1、编码和原型浏览器范围已统一；四项原阻塞均关闭。 |
| P0-AC2 | pass | 沿用并重新核对两市 profile、渠道/时点和 MI-A01–04、MI-B01–04 每市 2 成立+2 失败合同；本次数值方向检查通过。真实目标、委托及对照在 P3。 |
| P0-AC3 | pass | 保护、带内可成交、带外交叉、无交叉和空供需/重开反例与 A13/A14 一致，七个算术场景通过；生产状态机在 P1。 |
| P0-AC4 | pass | 40/200 股完整配额、合法关联与 26 钱包检查通过，原配置值保留；第 1 轮重建及独立矩阵证据有效。多种子生产生成在 P2/P4。 |
| P0-AC5 | pass | BigInt/Q9、上界、费用、固定 RNG/数学、13 点 Decimal、canonical 编码及 Node/实际 Worker 检查通过；B03 已关闭，完整跨端复现在 P5。 |
| P0-AC6 | pass | 预热/报告/费用相位、20 日预期替换/到期、240→254→262 跨季链、部分报告覆盖及 publicDecision/settled 安全点一致；新增 event-v1 保持作用/覆盖去重。生产恢复在 P1/P3/P4。 |
| P0-AC7 | pass | 锁定工具/许可及静态构建、真实 Canvas 图表、MA/缺历史/无成交/画线与 Worker 技术试验成立。 |
| P0-AC8 | pass | A01–A32 和新增场景的阶段责任、种子组、逐种子逐市场硬线、基准设备/性能协议、默认完整快照池和任意种子现场预热合同齐备；B04 已关闭。计时目标仍待实测。 |

D01–D08 的 P0 合同全部关闭，P0-T1/T2/T3 均按其对应 AC 独立签收。P0 可作为 P1 的冻结输入；历史第 1 轮失败报告保留，不回写为通过。

## 尚未执行的后续出口

P1 生产账本、可售限制、命令/快照回放；P2 100 个基准种子及 10 个长期种子的真实经济、完整 60 日浏览器游戏；P3 事件应用及策略训练/保留种子；P4 200 股连续长程、真实耐久存档和完整赛季；P5 跨浏览器、Safari/移动实机、玩家与性能均为 **not_run**。本次通过限定为 P0 设计与最小技术试验，未证明经济、玩法、启动性能或完整 G0–G4 通过。
