# P1 回放与核验

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
