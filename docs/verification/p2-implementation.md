# P2 实施记录

日期：2026-10-02（Asia/Shanghai）。状态：实施检查点，P2 第1轮独立验收进行中、尚未签收。P0/P1 已独立签收；本报告不签收 P2、P3–P5 或正式赛季产品。

## 当前交付与证据边界

核心实现、CLI 实验与浏览器适配分工实施。CLI 直接使用 `packages/sim-core` 的世界生成、推进、公开投影与完整存档；不向自主实验注入固定 NPC 订单。实际入口、恢复规则与输出说明见 [runner README](../../tools/sim-runner/README.md)。

`tests/scenarios/p2/baseline-manifest.json` 在正式行情观察前沿用 P0 已封存的 100 个 baseline 种子和其中原定前 10 个长期种子；配置为 baseline-v1、两市各 20 股、默认玩家本金 100 万持币。全部真实预热 250 日，再运行 250 玩家日，长期组延至 1,000 玩家日。逐批核对现金、股份、冻结、成交双侧、费用与小时容量；成交覆盖按每种子、每市场分别统计至少 18/20 股达到 80% 完整玩家日。预热不计分母。

`sim:batch` 保存逐日实际清算量、换手、零成交最长时长、保护阻挡与钱包分布；失败世界保留。每个种子完成即落盘，支持同经济源码、同清单恢复未完成批次实验；已完成失败不能由恢复运行变为忽略。经济源码变化必须保留旧输出并新建目录。首末 sourceHash 与版本、参数、种子字节摘要写入证据，纯浏览器或报告变化独立记录。

## 已执行的初次诊断

实际命令：

```powershell
npm.cmd run fixtures:p2
npm.cmd run sim:batch -- --manifest tests/scenarios/p2/diagnostic-manifest.json --out artifacts/verification/p2/diagnostic-01 --jobs 1
npm.cmd run verify:p2 -- --out artifacts/verification/p2/self-01
```

两枚登记种子各 250 预热日 +5 玩家日，合计 8,160 个真实批次；经济首末身份均为 `1c56df1eaafef06c29d0bf14a513a8a2426da1481f67be20dba4cb5217bb3c83`。必要小结果见 [失败诊断证据](fixtures/p2-diagnostic-01.json)，完整快照、钱包和实际逐日量在 ignored `artifacts/verification/p2/diagnostic-01`。该身份是当时未提交的受测文件字节；随后核心检查点 `f632812` 保留同一经济行为，并包含不改变经济的 `WorldPlayerView` 类型修正，故其字节 hash 不冒充首次身份。

| 种子 | A/B 达到至少 4/5 成交日的股票 | 无交叉股票批 /3,200 | 保护阻挡批 | 预热 /总耗时 |
|---|---|---|---|---|
| 3572871866 | 3/20、5/20 | 2,730 | 2 | 85.07s /88.68s |
| 1866980507 | 2/20、2/20 | 2,829 | 0 | 73.24s /76.24s |

两种子全部观察批次的现金/股份差额、负余额、冻结、容量与成交双侧违规均为 0；两个市场均未出现完整 5 日中的全市场零成交日。成交集中在少数股票，短诊断失败，不能以全市场有量放行。首种子 26 个 NPC 末态现金为 80,996,617,454–257,015,947,485 分，冻结现金 0，仍持有全部流通库存；A001/A006/B003/B012/B016 的 14 个相关钱包目标均低于现持仓，持续同向出售。B020 仅 2 批被保护价阻挡，另外 78 批没有交叉；其买卖价格分歧已交核心代理定位。

`self-01` 实际通过统计硬门槛边界、40 股/26 钱包/配额/公开边界、实际导出冻结 preset、A16/A17/一次入场/步进与恢复四组检查。全量长期、最终 P1 回归、真实 Chrome 60 日证据和小性能测量四组明确 `not_run`，命令退出 1。恢复检查保存部分计划、冻结现金、新买甲股和费用周期并与不中断对象比较，尚待最终经济版本与实际浏览器文件补齐统一 20 日证据。

初次诊断仅记录总耗时，无法追认 core、逐批检查与存档写入的历史占比。后续 runner 累计分别记录实际推进、诊断投影、审计、统计、快照导出与写入耗时，并去除同一终态的重复导出及只读取初始现金时的全历史解码；逐批审计保持完整。按旧短诊断线性外推 920,000 个正式批次约需 5.2–5.6 小时串行，4 并发的 1.3–1.4 小时仅为无争抢的理想下限；历史/lot 增长和修复后成交量可能改变成本，不是长跑实测。

## 后续实施与最终闸门

核心代理已从失败样本确认并在 `3443852` 修正三处既有合同差异：跨市钱包稳定 ID、经营日扰动的 batch0 随机键，以及 Q9 目标比例取整余数归现金。参数、资金与门槛没有降低。同两枚种子重新真实生成的 `diagnostic-02` 首末经济 hash 均为 `a5cd1981a077cd9b27e2f50f1cd2f1834635bfcdc85ba5aa75a0cb7e0f08f803`；覆盖仍不足，分别 A2/B6 与 A1/B6，8,160 批审计仍全 0。保护阻挡分别 0/2 批，无交叉 2,659/2,731 股票批，仍大量钱包目标同向出售。旧失败结果继续保留，禁止沿旧预热快照冒充新生成器结果。诊断未恢复合理覆盖前，全量 100+10 暂停。

本次实际首种子总耗时 82.48s，其中 core 推进 58.89s（71.4%）、生产 diagnostics 21.82s（26.4%）、独立逐批审计 0.293s（0.36%）、快照导出 1.334s（1.62%）、快照写入 0.095s（0.12%）。第二种子 82.16s、分布相近。完整数值见 [第二次诊断小证据](fixtures/p2-diagnostic-02.json)；每次检查仍保留全量逐批守恒。生产 diagnostics 的多次 lot 扫描占比已经实际出现，长期整体吞吐量尚未实测。

## 恢复、报告暂停及小测量检查点

已实际执行：

```powershell
npm.cmd run verify:p2 -- --out artifacts/verification/p2/self-02
npm.cmd run sim:continue -- --input artifacts/verification/p2/self-02/behavior-checkpoint.json --days 20 --out artifacts/verification/p2/node20-02
npm.cmd run verify:p1 -- --out artifacts/verification/p2/p1-preliminary
node tools/sim-runner/p2-major-fixture.mjs --input artifacts/verification/p2/browser-full-trades/qualified-checkpoint.json --out artifacts/verification/p2/major-fixture-04
npm.cmd run benchmark -- --out artifacts/verification/p2/benchmark-diagnostic-02
```

必要小结果见 [runner 检查点](fixtures/p2-runner-checkpoint.json)。`self-02` 的前四组通过，其余四组因最终证据未齐仍为 `not_run`，整体退出 1。严格 20 日为 320 个真实批次：部分计划、冻结现金、新买锁定甲股的 259/1 公开窗口，按 1/4/16/64 批预算恢复及不中断对象都得到 `5a6119660ed808b2704bb05b15feb2bc6d087e638b30eb67a46b896dea500c6c`；独立 CLI 对同生产档继续 320 批结果完全相同。受测经济 hash 为 `a5cd1981a077cd9b27e2f50f1cd2f1834635bfcdc85ba5aa75a0cb7e0f08f803`。这份档由实际 Node 世界形成，实际浏览器下载档的三方对照由 Web 记录，不能混称。

P1 实际八组（含 2,000 种子 ×3 变体、命令/坏档、恢复粒度、完整 Node 黄金、保存回放、CLI）通过，既有黄金未重录。最后真实浏览器证据的 sourceHash 过期，命令整体退出 1，最终候选冻结后需真实复跑该来源。

重大简报 fixture 基于实际 Chrome 下载的 259/15 完整世界：已有真实 A002 持仓，先由同核心实际推进 16 批至其报告前 260/15，唯一改动为尚未公开的 `stocks[A002].actualOperatingIndexQ` 从 `100793643002` 固定为 `120952371602`，其余 payload 逐位保持。固定前后的既有公共投影完全一致；实际核心在 261/0 发布新报告并以 `majorMessage` 暂停，清算 0 批、既有价格/成交不变，账本与订单等同无交易公开准备对照。正常公开准备可更新库存日目标、小时容量和到期资源，不能误当 NPC 已成交。公开窗口导出、重复准备、恢复再准备都没有重复报告。此检查的 sourceHash 为 `c8c6a74c3527824e94f37a852616e29527cc3cd55b8dfba8e63ab5af4d4d3bf4`，用途严格为合法隐藏输入的 AC6 行为验证，不计自然 seed、NPC 经济、流动性或 60 日发生频率；最终候选须重新真实生成基底。

Web 辅助 100 种子 locator 仅调用 `prepareWorld`/`recordWorldBatch` 的每日经营与报告键，没有 NPC 撮合或完整 4,000 批预热，因此只能称辅助候选扫描未找到样本。默认 seed20261001 的自然无 major 观察来自完整预热和实际 Chrome/Node 60 日运行，不能由该单世界推断 100 世界的自然频率。浏览器证据由 [Web 报告](p2-browser.md) 单独记录。

首个小 benchmark sourceHash 同为 `c8c6a74c...` 且首末一致：实际 4,000 批预热 51,712.95ms；五个日推进 215.68/252.40/245.78/218.05/255.68ms；五次导出最大 453.06ms，恢复最大 537.42ms；编码 12,231,972 字节。Node RSS 仅在批次边界采样，最大观测 531,992,576 字节，不能充作 UI+Worker 峰值。Web 联调同时存在，这些是诊断值，不签收 P5 的性能、设备、四浏览器或 200 股门槛。

| 交付项 | 当前实际结果 | 最终前置 |
|---|---|---|
| 生成/公开边界/preset/A16/A17/一次入场 | 受测版本 pass | 初始化候选同步后核对受影响项 |
| 320 批 Node 步进/恢复/不中断 | pass | 最终经济源与真实浏览器文件统一对照 |
| P1 八组合同与黄金 | pass；完整命令 fail | 真实浏览器来源过期，待最终绑定 |
| 合法隐藏输入重大报告 Node case | pass，fixture-only | 真实 Chrome 导入操作与最终源绑定 |
| 40 股小 benchmark | pass，诊断值 | 最终冻结源测量，不代表 P5 |
| 2 种子 ×5 日覆盖 | fail | 根因修订后仍同种子重新真实预热 |
| 100 种子 ×250 日 +原定 10 长期 | not_run | 经济可行与版本/名单冻结 |
| 最终 60 日浏览器、独立 P2 验收 | not_run | 最终交付证据齐备 |

最终需冻结行为和名单后执行全部登记种子、实际 Node 小测量、P1 完整回归与真实 Windows Chrome 操作。浏览器以实际下载存档交给 `sim:continue --days 20`，原会话继续、新会话导入继续、Node 最终完整 checksum 必须一致；浏览器操作止于世界 309/15 的 60 日原型摘要，CLI 世界继续用于长期经济实验。

## 初始化候选与中断恢复诊断

`9991d5b` 依 P2 plan 的失败回流安排修订为单一 `world-v2-style-cash` 新建候选：普通 NPC 按原风格持股比例换算初始现金，库存账户仍为股票初值的 25%；全部股份、26 钱包、原行为参数及 90% 股票×80% 成交日门槛保持原定口径。旧 `world-v1` 存档恢复不转换现金。`9d2a18f` 的 P0 回归与旧历史各自保留，不能将原经济结果移植到新初值。

候选第三次短诊断的经济首末身份均为 `9ac1c6634a1d13e2179cf48dfd511bc29b5bba6385a5e8481760f7bd16a2aa19`，runner 为 `cf4327d1307cefc7e9b9d6917f129aa130bc7fb53f1f533a89124dfaa167f169`，协议字节 hash 为 `44bccc8b0048247bf0f622b24a9b4b5ec794c7a1d0205209b9b59e2a75cdc558`。首种子已完整失败，第二种子在预热第 191 日 /3,072 批后中断，未留下可继续的中间世界存档。恢复前比对身份并将第二种子的初始快照、钱包、partial progress 与批次进度原样复制到 `artifacts/verification/p2/diagnostic-03/interruption-checkpoint`，逐文件核对 SHA-256。runner 的恢复单位是种子：复用首个完成失败，只重新初始化第二种子；不声称从第 3,072 批继续。

实际续跑入口：

```powershell
node tools/sim-runner/p2-batch.mjs --manifest tests/scenarios/p2/diagnostic-manifest.json --out artifacts/verification/p2/diagnostic-03 --jobs 1 --resume yes
```

此前同参数 `npm run sim:batch -- ...` 因本机 PowerShell 的 npm shim 参数转发失败，报 `EUNKNOWNCONFIG` 并退出 1，尚未执行模拟；随后改用上述已有 Node 入口。续跑同样退出 1，但原因是实际成交覆盖未达门槛。首种子结果文件恢复前后 hash 均为 `d235af0eda021c5a900ad36c1f4453b0eb72a2510e9a16143accd754321c9caf`，没有被重跑或删去。

| 种子 | A/B 达到至少 4/5 成交日的股票 | 无交叉股票批 /3,200 | 保护阻挡批 | 完成审计批数 | 结果 |
|---|---|---|---|---|---|
| 3572871866 | 6/20、11/20 | 2,084 | 34 | 4,080 | fail，保留首轮完成结果 |
| 1866980507 | 7/20、4/20 | 2,404 | 0 | 4,080 | fail，仅未完成种子重新开始 |

两枚完整种子共 8,160 批，现金、股份、负余额、冻结资源、小时容量、成交双侧违规全部为 0；两市最长整市场零成交日均为 0。原中断的 3,072 批仅作为历史 partial 记录，未重复计入完整观察数。换手与逐股覆盖继续保存，不能以全市场偶有成交替代 18/20 股票门槛。总结果 hash 为 `fcd1e9c2d656300876ad05a48b4f16b8ad5114750ce704ea8c72559e0df19967`，必要小结果及中断保留清单已追加到 [runner 检查点](fixtures/p2-runner-checkpoint.json)，完整源文件、每日量和失败快照仍在原诊断目录。

候选改善了部分覆盖，但同两枚固定种子仍未满足短诊断线；本次没有叠加调参、换种子、降低门槛或启动全部 100+10。完整 250/1,000 玩家日实验仍为 `not_run`，P2-AC3 不通过；继续处理须依失败证据修订相应规则与验收，并重新生成受影响世界。

`npm.cmd run verify:p2 -- --out artifacts/verification/p2/self-candidate-03` 在同一候选实际通过统计硬边界、40 股与26钱包初始化/公开边界、导出实际 preset、A16/A17/一次入场/320批恢复四组。完整注册种子、最终 P1 回归与最终小测量三组为 `not_run`；默认浏览器小结果当前状态为 `incomplete`，该组为 `fail`，正在由 Web 独立完成真实候选操作，不能抄用过期结果。命令整体退出 1，受测经济 hash 同上。8 个待提交 `.mjs` 的 `node --check` 与 `git diff --check` 通过；此处不扩张测试或重录既有 P1 黄金。

当前 P2-AC3–AC8 的最终交付证据未齐，独立第1轮验收正在核对；阶段任务保持未签收。
