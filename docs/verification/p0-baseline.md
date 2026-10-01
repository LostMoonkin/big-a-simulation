# P0 设计与工程交付记录

2026-10-01；**实施已交付、待独立验收**。本报告记录实际设计/算例/技术试验，不自行宣布P0独立通过，也不宣布G1–G4或完整G0通过。冻结规则/玩法0.3.0、内容0.3.0、schema1、math fixed-q9-v1、rng-v1；spec1.0的8项门槛未降低。

交付包含[市场特色](../design/market-identities.md)、[工程基线](../design/engineering-baseline.md)、修订后的[规则](../design/market-model-rules.md)/[验证](../design/model-validation.md)、核心数值与接口类型、完整40/200股和26钱包样本、保护/跨季/投影/内容/种子夹具，以及可复现技术试验。P0-T1/T2/T3均待独立签收。

| AC | 实施证据/自检结论 | 独立验收 |
|---|---|---|
| AC1 | 工程基线D01–D08逐项唯一答案、拒绝方案与影响；所有下游依赖指向0.3.0 | not_run，由独立验收代理执行 |
| AC2 | 市场特色两个传导图/profile，MI-A01..04/MI-B01..04每市2成立2失败；来源、公开时间、预期/经营/目标方向与预算风险均明确；MI-CONTRACT-01算例pass | not_run |
| AC3 | 规则6.2状态表、protection-cases共7具名固定反例；边界/无交叉/空供需、A13/A14有真实资金库存，独立穷举算例pass；保留原两日甲/逐批乙、补复位 | not_run |
| AC4 | 完整world-prototype/full JSON；各股合法业务/暴露、标签/市值/行业、至少两行业概念、精确26钱包/流通/创始股份/现金；两个QUOTA检查pass | not_run |
| AC5 | BigInt/Q9/上界/舍入/rng/精确编码定案，NUM-01及13个96位Decimal参考点pass；真实Chrome Worker逐字段与Node黄金相同；已知极小尾部量化明确 | not_run |
| AC6 | cross-season的240→254更新→262结果→265覆盖→273结束，20日过期反例、世界499/500费用/复核、甲锁股、252计划与连续资格；两类安全相位/完整状态清单、时序与投影数据自检pass | not_run |
| AC7 | 锁定工具/许可，小型Canvas小时/日K、完成窗口MA/缺历史、无成交/进行中、真实鼠标水平/趋势线/删除、Worker请求，Chrome dev/release各11项pass；静态多页build pass | not_run |
| AC8 | A01–A32及新增MI/PR/NUM/SNAP/TIME/START场景责任表；各种子组预登记、90%×80%硬出口、设备/网络/样本/p95协议、默认16均匀静态完整预热池与自选现场预热分开；SEEDS/CONTENT自检pass | not_run |

实际执行：

- `npm install klinecharts@9.8.12 --save-exact --workspace @big-a/web --cache .npm-cache`：锁依赖成功，审计0漏洞；初次npm view因全局cache写权限失败，改用工作区cache后成功。
- `npm run fixtures:p0`：生成40/200股及种子成功；初版原型tag位置使健康业务占满autonomy/longevity容量、跨行业约束不成立，generator明确失败。调整无概念位置、保持所有边际门槛后重建，QUOTA全量检查通过，未静默超配额。
- `npm run probe:p0`：记录实际Node协议黄金；`npm run verify:p0`：16检查pass，含NUM边界、7保护反例、8市场场景数量/公式、时序/投影、种子/内容、13点Decimal。该脚本不运行生产市场，也不把文字断言当核心实现。
- `npm run build`：全部工作区typecheck及Vite静态多页构建pass，24模块；app约261.83kB/gzip81.94kB，P0图表chunk约198.82kB/gzip51.92kB，Worker约3.42kB。这些体积不是正式250日快照/性能证明。
- `npm run check:design`：原Python5算例、2000穷举比较、2000费用上界pass，仍只作设计算术对照。
- `npm run dev`、`npm run preview`及实际`node artifacts/verification/p0/browser-probe.mjs`（dev与4173参数）：真实本机headless Chrome154.0.8037.58，dev/release各11项pass。独立协作实施提交`ae881aa`。driver现归入`tools/p0/browser-probe.mjs`供复跑；原始trace、初期失败与最终截图保留ignored artifacts。

[Node结果/manifest](fixtures/p0-node-results.json)含受测实际sourceHash、文件清单、规则/种子hash、设备、命令、每case结果；baseCommit只是记录生成时Git基点，不冒充尚未提交的受测代码。[浏览器小证据](fixtures/p0-browser.json)含实际浏览器/Node/库版本、逐文件sourceHashes、11项结果与原trace路径。[数学误差](fixtures/p0-math-accuracy.json)含全部13点原值/误差，明确只是点检；[黄金](fixtures/p0-numeric-golden.json)是两adapter比较的协议输入输出；[许可档案](fixtures/p0-tools.json)来自实际锁定npm包metadata与LICENSE/NOTICE。

复跑设计/数值：`npm run verify:p0`。重建静态页面：`npm run build`，另一个终端`npm run preview`；再`node tools/p0/browser-probe.mjs http://127.0.0.1:4173/p0-probe.html "C:/Program Files/Google/Chrome/Application/chrome.exe" artifacts/verification/p0/recheck`。自动化使用已配置bundled Playwright；其他机器设置P0_PLAYWRIGHT_PATH到本机playwright/index.mjs并传真实浏览器路径，无须把它加入游戏依赖。页面可手动使用按钮、鼠标和查看JSON结果；不是游戏交易演示。

剩余界线：P1生产撮合/账本/命令恢复尚未实施；P2基准100种子+10长期与60日操作、P3生产事件/策略初筛、P4真正250日预热快照与续季均未运行。默认快照池是输入/分发/一致性合同，未伪造预热档；P4须由生产core生成并与重算一致。20次冷启动、3s/10s目标、任意seed60s/180s、长局/存档/内存预算、四桌面最终确定性、Safari和移动/目标玩家证据均not_run，按责任阶段执行。本机CIM访问拒绝，设备信息来自node:os；电源/后台条件尚未测量，不能据此宣布性能合格。
