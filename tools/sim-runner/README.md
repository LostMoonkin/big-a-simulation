# 生产核心 CLI 与核验

只调用 `packages/sim-core` 的生产交易路径。参考穷举器用于核验，不能用于游戏定价。P1 使用具名、有限资金/股份的固定参与者；世界生成、26 钱包自主经济和预热属于 P2。

```sh
npm test
npm run verify:p1 -- --out artifacts/verification/p1/review
npm run sim:replay -- --input tests/scenarios/p1/cases.json --case A01 --out artifacts/verification/p1/demo-a01
npm run sim:replay -- --input tests/replays/a12-public-decision.json --out artifacts/verification/p1/demo-restore
```

Windows PowerShell 中请用 `npm.cmd` 替代 `npm`，使 `--` 原样传给脚本。也可直接运行 `node tools/sim-runner/verify.mjs --out <dir>`。`test` 与 `verify:p1` 使用同一实际入口；任何失败均为非零退出码，不重录黄金。

`cases.json` 的 `--case` 指定具名场景。单个文件可为 `{input,commands}`、显式 `ScenarioInput` 或完整快照；`--commands <file>` 用命令数组替代嵌入数组。价格为整数分，现金使用 `{"$bigint":"1000000"}`，股份为整数。动作包含 `submit`、`prepare`、`advance`、`read`、`snapshot`、`restore`、账户意图转换和固定公共信息参与者；具体输入见 fixtures。撤单 `$提交ID` 只引用当前命令数组内的已接受订单，恢复后可直接使用快照内的实际订单 ID。

提交订单和撤单始终经过核心的 `submitFor`；CLI 不直接修改账户。输出 `manifest.json`、`summary.md`、完整 `results.json`、`final-snapshot.json`、`checkpoints.json`、`ledger.json`、输入及命令。合法的业务拒绝属于回执；不可解析输入、坏快照、未知动作和守恒失败使 CLI 返回 1，保留失败输入与首个动作位置。

`verify:p1` 核对 27 固定场景、注册种子 1–2000 的原簿/倒序/最多六份拆单、双方分配/费用/余额、生命周期、坏档、恢复、完整黄金、实际 CLI 成功/失败，以及与当前受测源码匹配的已记录浏览器证据。参考器逐整数 tick 穷举，独立实现双侧数量及余数分配，只共享冻结的随机数原语。真实核心在每次资源变化和每个原子批次后独立核对总现金（含服务账户）、总股份、冻结和锁定，不能容忍一分钱差额。

源码身份采用按路径排序的原始文件字节 SHA256 清单，再对 `路径 + NUL + 文件hash + LF` 做 SHA256；规则、输入、种子另记 hash。清单包含生产 core、整个工具目录（包括本使用说明）、场景、黄金、Worker 与构建配置；根 README、阶段报告、输出目录和运行时钟不参与该源码身份。`headAtExecution` 只是当时 HEAD；有尚未提交源码时以 `sourceHash` 识别受测代码。

真实 Worker 复跑：

```sh
npm run build
npm run dev
npm run preview
node tools/sim-runner/browser-probe.mjs http://127.0.0.1:5173/p1-probe.html "C:/Program Files/Google/Chrome/Application/chrome.exe" artifacts/verification/p1/browser-dev
node tools/sim-runner/browser-probe.mjs http://127.0.0.1:4173/p1-probe.html "C:/Program Files/Google/Chrome/Application/chrome.exe" artifacts/verification/p1/browser-static
node tools/sim-runner/record-browser.mjs artifacts/verification/p1/browser-dev/results.json artifacts/verification/p1/browser-static/results.json
```

开发/预览服务分别在两个终端运行。driver 复用本机 Codex bundled Playwright；其他设备可设 `P1_PLAYWRIGHT_PATH` 为其 `playwright/index.mjs` 绝对路径，并传入浏览器可执行文件。页面通过真实 Dedicated Worker 执行 27 个生产核心重放及 4 个已保存快照，driver 与刚在 Node 运行的完整输出逐字段比较。只覆盖实际 Chrome；P5 最终四浏览器、性能和耐久范围另验。

`record-browser` 只在两次真实结果的源码身份与当前一致时更新必要小证据，`verify:p1` 读取该证据，不假称每次重开浏览器。证据缺失或过期为失败。`fixtures:p1` 可重建输入；`probe:p1` 只用于有意更新合同后的黄金重录，不能为通过测试而改答案。原始长日志/截图在 ignored artifacts；验收结果由独立代理记录。

## P2 自主实验与真实存档继续

```powershell
npm.cmd run fixtures:p2
npm.cmd run sim:batch -- --manifest tests/scenarios/p2/diagnostic-manifest.json --out artifacts/verification/p2/diagnostic --jobs 1
npm.cmd run sim:batch -- --manifest tests/scenarios/p2/baseline-manifest.json --out artifacts/verification/p2/baseline-final --jobs 4
npm.cmd run sim:batch -- --manifest tests/scenarios/p2/baseline-manifest.json --out artifacts/verification/p2/baseline-final --jobs 4 --resume yes
npm.cmd run sim:continue -- --input path/to/exported-snapshot.json --days 20 --out artifacts/verification/p2/continued
npm.cmd run benchmark -- --out artifacts/verification/p2/benchmark-final
npm.cmd run verify:p2 -- --out artifacts/verification/p2/review
```

`fixtures:p2` 从已封存的 P0 名单生成输入清单，不生成行情或答案。正式清单强制全部 100 个 baseline 种子预热 250 日、运行 250 玩家日，其中原定 10 个延长至 1,000 玩家日；默认玩家 100 万持币，不提交订单。每个真实批次调用生产 `advance`、轻量 `diagnosticsSummary` 和独立检查，统计只计世界 250 日起的真实清算量；每个种子、每个市场至少 18/20 股分别达到 80% 成交日，任一失败使整体失败。

每个种子保存初始、预热、入场和结束快照、钱包分布、实际逐日量与保护阻挡数、逐股最长零成交、换手与无交叉批数；失败保留完整世界。`progress.json` 随预热/玩家日及种子完成更新，最终 `results.json` 按原清单排序。恢复运行只复用同经济源码、实验工具与同清单的已完成结果（失败仍失败），未完成种子从头重新生成；经济源码、实验工具或协议改变必须新建输出目录。`--jobs` 为 1..8，长期实验与真实浏览器测量需错开重负载。

清单显式绑定初始化与 NPC 报价版本，并核对冻结 preset 的完整 hash。新建世界采用 `npc-quote-v2-target-gap`；缺报价字段的旧完整档继续采用 `npc-quote-v1`，恢复和查询不得补字段。证据分别记录当前新世界报价版本与输入档的有效版本，种子和批量结果保存首末经济/工具 hash；报价候选必须从新世界完整预热，不能继续旧预热档计作候选。

`sim:continue` 的输入是完整生产存档，特别是浏览器实际下载文件。它保存原始 checksum，按同核心、`pauseOnMajor:false` 继续恰好 `days*16` 批，输出 `final-snapshot.json`、`results.json` 与版本/源码清单。20 日恢复证据必须同时有浏览器原会话继续、新空会话导入继续和 Node 三份完全一致的最终 checksum，不能用构造订单 fixture 替代真实 NPC 市场。

`node tools/sim-runner/p2-major-fixture.mjs --input <浏览器实际下载完整档> --out <dir>` 是单独 AC6 固定输入检查。输入必须已有真实 A002 持仓；同核心先推进至其下一报告前日末，只固定该股尚未公开经营指数，输出 `major-input-snapshot.json` 供真实 UI 导入，及 `paused-snapshot.json`/`results.json` 的下一报告公开窗口。它核对之前公共投影不变、真实报告在 NPC 清算前暂停与恢复不重复；不改成交价、历史、玩家股份或钱包，明确 `naturalEconomicEvidence:false`，不得计入自然行情/长期种子结果。

P2 源码身份将经济（core、规则、市场制度、冻结 preset）、实验工具及浏览器分别记录。经济证据绑定 `economicSourceHash`，每次运行核对首末身份；纯 UI 或报告更改不自动让 100 个种子重跑。行为变化后必须重跑受影响证据。P1 沿用其既有完整源码身份，因此新增这些工具后需真实复跑 P1 浏览器证据；不能盲目重录旧黄金。

`verify:p2` 核验生成配额/钱股/公开边界、导出的实际 baseline 参数、零 ADV 的真实容量、20 日固定份额费用回流、一次入场、完整状态步进/恢复、登记种子的逐日量重计、P1 全部回归和已记录的 Windows Chrome 60 日操作。可用 `--seed-manifest`、`--batch-results`、`--browser-results`、`--benchmark-results`、`--p1-results` 指定实际证据位置。未执行或过期证据按 `not_run`/失败记录，整个命令返回非零；实施自检始终待独立验收。

`benchmark` 报告真实 40 股预热、五个日推进/导出/恢复样本、编码大小和批次边界采样的 Node RSS。已收到取消标志的核心检查不能证明浏览器运行中取消延迟，Node RSS 不代表 UI+Worker 峰值；此小测量不签收 P5 的 200 股/四浏览器/移动门槛。
