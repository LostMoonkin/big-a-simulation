# P1 实施交付

状态：已实施，待第1轮独立验收。以下是实际实施自检，不能代替阶段签收；P1-AC1–AC7 的门槛保持原文。P0前置已由独立报告76260e0签收，规则/内容0.3.1、schema1、fixed-q9-v1、rng-v1。

生产核心提交 `ead43ed`、初始持仓校验修复 `04d30f9`；本交付的工具/Web/证据与说明由包含本报告的提交保存。执行时 HEAD 为 `04d30f992fad60810fc70c75ce0500529ad03405`，工具尚未提交，因此受测对象以原始文件清单身份为准：

```text
sourceHash e33076dca0eff5591467a35057fe05e0c2385fdc882e8085e31bb9e6010089bd
```

完整34文件清单、规则hash、输入/种子hash和实际运行命令在 `artifacts/verification/p1/delivery-node/manifest.json`；必要小证据在 [p1-implementation.json](fixtures/p1-implementation.json) 与 [p1-browser.json](fixtures/p1-browser.json)。按路径排序后对“路径 + NUL + 原始文件SHA256 + LF”再做SHA256。清单含生产core、整个sim-runner目录（含工具README）、输入/黄金、Worker和构建配置；根README与阶段报告不参与。仅 HEAD 不能代表当时尚未提交的工具代码。

## 交付入口与边界

- `packages/sim-core`：唯一生产交易路径，显式场景、三类委托、账本/费用/共享资源、双市场时钟/保护、公开投影、重复ID、原子完整快照。核心纯TypeScript，无DOM、墙上时钟或Math.random行情依赖。
- [sim-runner](../../tools/sim-runner/README.md)：薄CLI、统一验证入口、独立逐tick参考、Node/真实Worker driver。参与者仅接收公共快照和本人账户；完整诊断仅用于核验。
- [固定输入](../../tests/scenarios/p1/cases.json)：A01–A14/A19及生命周期、乙特别竞价、甲空特别开盘、上下制度边界，共27场景；现金/股份有限，未预写成交价。
- [种子清单](../../tests/scenarios/p1/random-seeds.json)：运行前注册的整数1–2000，独立xorshift只生成核验输入，原簿/倒序/最多六份拆单均通过真实核心提交后清算。
- `tests/replays/`：完整规范输出SHA256、逐命令状态hash及4个持久化安全快照；未完成计划、公开后清算前、甲锁定股、甲空特别开盘后分别可直接CLI恢复。
- `apps/web/p1-probe.html`：真实Dedicated Worker调用同一生产core和薄回放adapter；开发与静态构建均已运行。它是核验入口，普通游戏终端仍用预览数据，P2再接自主世界。

## 实际命令与结果

Windows PowerShell 使用 `npm.cmd`，使 `--` 原样转发；其他shell可按工具README用npm。Node实际v26.7.0，npm12.0.2；依赖未新增。

| 实际执行 | 结果/范围 |
|---|---|
| `node tools/sim-runner/generate-fixtures.mjs` | exit0，27具名输入及2000固定种子 |
| `node tools/sim-runner/auction-check.mjs artifacts/verification/p1/early-auction` | exit0，A01–05及2000×3纯撮合参考对照；283零成交、1717正成交、1219非订单限价清算点 |
| `npm run probe:p1` | exit0，有意首次录制27完整输出黄金、4保存快照；验证命令从不重录 |
| `npm run build` | exit0，全部工作区类型检查及27模块静态构建，含生产Worker |
| `node tools/sim-runner/browser-probe.mjs http://127.0.0.1:5173/p1-probe.html "C:/Program Files/Google/Chrome/Application/chrome.exe" artifacts/verification/p1/browser-dev-delivery` | exit0，真实Chrome154.0.8037.58，8项、31个生产重放 |
| 同driver，URL `http://127.0.0.1:4173/p1-probe.html`，输出 `artifacts/verification/p1/browser-static-delivery` | exit0，同组8项，静态Worker完整输出与新跑Node逐字段一致 |
| `node tools/sim-runner/record-browser.mjs artifacts/verification/p1/browser-dev-delivery/results.json artifacts/verification/p1/browser-static-delivery/results.json` | exit0，只有实际两端结果与当前sourceHash一致才录小证据 |
| `npm.cmd run verify:p1 -- --out artifacts/verification/p1/delivery-node` | exit0，最终统一入口9组全部通过；核心、CLI、黄金、真实浏览器证据，机器结果见小证据与该目录 |
| `npm.cmd run sim:replay -- --input tests/scenarios/p1/cases.json --case A01 --out artifacts/verification/p1/demo-delivery-a01` | exit0，真实1040分/300股，服务费312分 |
| `npm.cmd run sim:replay -- --input tests/replays/a12-public-decision.json --commands artifacts/verification/p1/a12-commands.json --out artifacts/verification/p1/demo-delivery-restore` | exit0，显式命令数组恢复；终态checksum `ad9599ee6a3d56f85aed500a2362009e26109ba78386bf8147ee793b62534913` |

统一入口还实际启动6个CLI演示和保存公开窗口恢复，并对坏动作运行真实子进程：exit1、首个动作0和原失败输入均保留。`test` 与 `verify:p1` 在根package.json指向同一个非空生产核验脚本。

## AC对应与核验口径

| 原出口 | 实施自检证据 |
|---|---|
| P1-AC1 | A01–05实际清算；2000注册种子逐tick穷举，双方分配/序列一致；每seed三种输入通过真实funded core，6000原子批。参考器不导入生产候选价搜索或分配器，仅共享冻结随机原语。双方账户数量、总费用和现金变化对倒序/拆单一致。 |
| P1-AC2 | A07–10/A19及三类订单取消/重复/资源拒绝；即时部分成交与单批结束在A01/A03，日单/计划部分成交、撤销、到期各有fixture。A09预留16023分、16批每批1股、买费16分；A19按低评分继续减量后只提交乙1股。余额与订单预留逐步核验。 |
| P1-AC3 | A06与SETTLEMENT-B，旧60+新100的unlockTick分别16/1；旧股可卖但甲新股未提前可售。A11同批卖款不资助乙买单，9995分账面款作为受限子集保存、下一prepare才可用。股票/账户输入倒序一致。 |
| P1-AC4 | A12在公开后/清算前publicDecision暂停，玩家和具名参与者使用同一公共版本。A13真实乙8→16→32→64成交1400复位8，并补64仍受阻特别竞价；A14两整日零成交且末批受阻后特别开盘，另验空开盘保持待重开/日内停撮/下一开盘重试。A03无交叉不造价，甲乙上边界可真实成交。 |
| P1-AC5 | 固定27场景163批、393次独立状态观察；随机6000批、218372次独立资源状态核对。总现金仅sum账面cash+service，pending/冻结是cash子集；总股份、可售/锁定、预留和双侧数量零差/无负数。独立按账户×股票×方向ceil计算费用及最终现金，不仅信任core.audit.valid。 |
| P1-AC6 | 10个具名检查点与4个持久化恢复fixture；未完成32批双市场计划按批/小时/日和中途恢复checksum完全一致。甲锁定股份、公开窗口、重开状态恢复无重复公开/解锁。150次公共/本人读取不改完整hash；隐藏经营/未来公告不同的公共前缀相同。额外订单不改变外生键样本，P1不冒充P3随机事件引擎。Node/真实Chrome开发与静态Worker比较27完整输出和4恢复输出、逐命令hash、重复请求及明确错误request。 |
| P1-AC7 | 实际`test`/`verify:p1`/`sim:replay`，manifest、summary、机器结果/账务/关键快照/失败输入与边界齐备。14种坏档（含合法重算checksum后的余额/预留/股份损坏及64MiB越界）原子拒绝，2种合并前非法初始lot回归，重复/冲突ID、过期公共版本/过去批次/无决策窗口均明示。必要浏览器证据缺失/过期返回非零，不能标跳过通过。 |

合法拒绝保存幂等失败回执和版本；“无副作用”按资金、股份、冻结、已有订单、行情、时钟不变核对，不错误要求拒绝ID记录消失。含服务账户现金守恒，市值不作为守恒量。计划按总量执行，目标持仓通过不同入口targetGap核对。

## 真实失败与修正

早期自检中两处错误预期已按原合同修正：甲公告后状态为special，只有空特别开盘后为reopenPending；卖款可以按订单多行保存，但账户汇总受限金额与下一可用批一致。未因此改生产规则。生产实施者实际复现了初始持仓先合并可能吞负数/分数的缺陷，04d30f9在合并前校验，每个非法lot的回归已加入。

首次Chrome捕获`/favicon.ico`404，定位后为试验页提供内联icon；修复后实际两端检查无page/console error。首次PowerShell `npm test -- --out …`被npm.ps1吞转发分隔符，退出1；改用npm.cmd实际正确转发。

`npm.cmd test -- --out artifacts/verification/p1/final-node`的8个交易/恢复/CLI组全部通过，但当时新增工具README使严格sourceHash与旧浏览器证据不同，第9组返回1，保留该运行的manifest/results/summary。随后完成工具说明、冻结34文件身份、实际再录浏览器证据，并由最终统一verify绑定。此失败如实保留，未绕过校验或抄写pass。

## 剩余范围

阶段独立验收仍待执行。P1只证明固定有限资源交易与确定性回放；没有自主NPC、世界生成/预热、P2经济门槛、完整事件库、游戏存档或赛季产品行为。真实浏览器仅Chrome154；P5最终四浏览器、性能、长跑和玩家试玩没有在本阶段冒充通过。原始长日志/截图位于ignored artifacts，可用已提交入口重建；必要小黄金和真实结果索引纳入Git。
