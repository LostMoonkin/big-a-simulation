# Web 金融策略模拟游戏：技术与引擎可行性

> 0.2 设计同步：预热改为 250 日，正式游戏以 250 日为赛季并支持连续经营，新增多周期目标状态、指标确认时点和跨季存档检查；账户仍为 26 个。具体见[主设计](../design/gameplay-market-model.md)，引擎选型不变，性能仍待实测。

> 2026-10-01 范围更新：首版已调整为每市场 100 股、两市共 200 股；每市场 6 个行业、世界共享 8 个概念，每股 0–2 个概念标签。当前模型选择为“有限预算异质资金群体＋每子步统一价批量竞价”；新闻先公开，玩家与 NPC 依据同一公开信息撤改委托，然后本批统一清算，事件暂停发生在清算前。具体撮合、新闻时序和参数以[玩法驱动市场模型设计](../design/gameplay-market-model.md)为准；本文保留可行性研究背景，不替代详细设计。

核验日期：2026-10-01。研究范围：单人、打开网页即可游玩、两个虚构市场合计约 200 只股票，以环境判断、选股、调仓和资金成长为主，同时支持短线与资金博弈。本文区分已核验的平台事实与针对本项目的工程判断；未实施性能基准测试。

## 建议结论

首版采用 **TypeScript 模拟内核 + DOM 策略界面 + Canvas 金融图表 + 一个 Dedicated Web Worker + IndexedDB 本地存档**。React、Vue 或 Svelte 按团队熟悉度选择，当前无需为框架选择单独做长期研究。静态网站即可承载首版，账号、云存档、排行榜可后置。

这是适配产品形态的工程判断：游戏主要界面是行情列表、公司详情、新闻、账户和下单表单，浏览器已有成熟的排版、输入和响应式能力；专用图表库提供 K 线交互。需要自主研发的是市场模型、成交与清算、事件因果和游戏目标。游戏引擎并不会替代这些工作。

**日级与小时级两种决策模式、事件触发暂停，与内部更细步进完全兼容。** 界面上的日 K / 小时 K 是展示与决策尺度；引擎内部可以按固定时间片推进流动性、订单成交和事件，不必让所有玩家逐小时点击。首版建议每个市场每天统一为 4 个虚构交易小时、内部 16 步；小时模式每 4 步暂停，日级快进则在重要事件或订单条件触发时暂停。T+0、T+1、大单分批和参与者的持续资金/库存状态进入内核，不要求逐笔高频撮合。这是玩法与模型选择，不是引擎限制。

## 候选比较

以下“适配度”和“工作负担”是本项目的判断，不是通用引擎排名。

| 路线 | 官方能力与约束 | 对本项目的适配判断 |
| --- | --- | --- |
| TypeScript + DOM + Canvas 图表 + Worker | Worker 在背景线程运行脚本，通过消息和主线程通信，不能直接操作 DOM；可使用 IndexedDB。[MDN Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) | **首选**。界面和金融图表直接使用 Web 生态；模拟与渲染拆开，可独立批量跑种子、检查经济漏洞。 |
| Phaser + DOM | Phaser 面向 2D Web 游戏，支持 JavaScript/TypeScript、WebGL/Canvas 渲染，覆盖桌面和移动浏览器。[Phaser 官方介绍](https://docs.phaser.io/phaser/getting-started/what-is-phaser) | 有大量场景、精灵、动画、音效和游戏状态切换时有帮助。纯金融策略面板暂时用不到其主要价值，图表和表单仍适合 DOM。可后加，不应成为模拟内核依赖。 |
| PixiJS + DOM | PixiJS 是 2D 渲染引擎，提供 WebGL、可选 WebGPU、输入、资源加载、文字和绘图能力。[PixiJS 官方介绍](https://pixijs.com/8.x/guides/getting-started/intro) | 更适合可视化世界地图、资金流动或大厅背景。它提供渲染能力，完整玩法状态、存档和市场模型仍需自行实现。先不引入，出现明确视觉需求时局部使用。 |
| Godot Web | Godot 4 Web 需要 WebAssembly/WebGL 2，使用 Compatibility 渲染器；Godot 4 C# 项目当前不能导出 Web。4.3 起支持且默认采用单线程导出；启用线程需跨源隔离配置。[Godot Web 导出](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) | 若团队熟悉 GDScript，且未来有角色、场景或桌面版，是可行备选。当前为金融表单、图表增加引擎 UI 和 Web 桥接成本，不优先。 |
| Unity Web | Unity 6 文档列有桌面和移动浏览器支持；C# 多线程不受支持，原生 C/C++ 线程属另一受限路径。[浏览器支持](https://docs.unity3d.com/6000.0/Documentation/Manual/webgl-browsercompatibility.html)、[技术限制](https://docs.unity3d.com/6000.0/Documentation/Manual/webgl-technical-overview.html) | 具备现成 Unity 团队和美术资产，或规划 3D 游戏时再考虑。本项目没有足够的场景需求抵消构建、部署与 UI 接入成本。可行，但收益最小。 |

两个不能沿用的旧结论：**Unity Web 并非一概不支持手机；Godot Web 并非一概必须开启 SharedArrayBuffer。** 上述判断以当前查阅的官方版本文档为准，立项后固定实际采用版本。

## 浏览器、线程和部署

推荐内核由一个 Worker 持有权威游戏状态。主线程仅发送“提交订单、取消订单、前进至下一决策点”等命令；Worker 返回账户变更、市场摘要、当前股票图表和新闻增量。不要每个时间片把 200 只股票的全部历史复制到 UI，也不要为每只股票建立 Worker。消息通常复制数据，也可转移 ArrayBuffer；这些机制已有浏览器支持。[MDN Worker 数据传递](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#transferring_data_to_and_from_workers_further_details)

普通 Worker 的消息模式足以作为首版方案，无需以共享内存、SharedArrayBuffer 或 WebAssembly 作为前置条件。它可以让计算和 UI 并行，但不会使模拟算法自动更快。较长快进需要分批执行，保留取消和重要事件中断点。浏览器切到后台时不应让真实时间悄悄推动市场，模拟时钟只由明确的推进命令改变。

Godot Web 可以在移动端运行，但官方提示性能、下载初始化和 Safari/WebGL 兼容问题；单线程更易部署。Unity 6 支持移动浏览器也不代表低端机性能自动合格。Unity 压缩构建需正确的 Content-Encoding，并需为 Wasm 设置合适响应头。[Godot 移动端说明](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html#mobile-considerations)、[Unity Web 部署](https://docs.unity3d.com/6000.0/Documentation/Manual/webgl-deploying.html)

建议首发验收范围是桌面 Chrome、Edge、Firefox、Safari；触屏交互同时保留，但手机完整适配应单独预算。密集行情和新闻面板在窄屏上的信息架构，可能比计算性能更早成为体验问题。

## 金融图表与完全虚构世界

**优先验证 KLineChart，保留 Lightweight Charts 为备选。** KLineChart 官方仓库说明采用 Canvas、支持移动端和指标，许可证为 Apache 2.0；可用虚构 OHLCV 数据驱动。[KLineChart 仓库](https://github.com/klinecharts/KLineChart)、[许可证](https://github.com/klinecharts/KLineChart/blob/main/LICENSE)

Lightweight Charts 也是 Canvas 金融图表库、Apache 2.0，但官方 README 另明确要求用户可访问页面提供 TradingView 归属通知和链接；图表 attributionLogo 可满足链接部分要求。不能仅因“开源”就把该要求删掉。[Lightweight Charts 官方许可说明](https://github.com/tradingview/lightweight-charts#license)

若“不能出现现实世界信息”指虚构经济体、公司、人物和事件，那么软件许可页可独立于世界观。若连图表关联的现实品牌都不希望出现，KLineChart 是更适合先验证的候选，但仍需保留适用的开源许可证和通知。这里是依据库文档识别工程约束，最终随锁定版本核对分发材料。

图表验收要覆盖：虚构历法/交易日、停牌和无成交时段、日内与日线切换、成交点、事件标记、价格涨跌幅限制、手机拖动缩放，以及避免把未来 K 线传入可见数据。不要把真实日期和交易时区硬编码成市场规则。

## 模拟内核、确定性与可复盘

建议将内核做成无 DOM、无引擎依赖的纯 TypeScript 模块，采用明确的固定步长状态转换：`advance(state, commands, rngState) -> nextState + events`。绘图帧率、设备性能和快进倍速不得改变市场结果。

建议实现约束：

1. 存档保存世界种子、各随机流状态、模拟版本、规则/内容版本、当前快照与玩家命令日志。宏观、公司、噪声等使用独立随机流，避免添加一条新闻就改变整个市场随机序列。
2. 不直接用 Math.random 生成需要复盘的市场结果。ECMAScript 规范把其算法定义为实现相关，不能将其当作固定可重放协议。[ECMAScript Math.random](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.random)
3. 资金、价格最小单位、持股数量采用受边界约束的整数/定点数，明确舍入时机；“富可敌国”的资金上限需和数字表示一起设计。超出安全整数范围时采用 BigInt 或明确的大数方案，不能无限叠加普通浮点数。
4. 固定资产遍历顺序、批量清算的价格选择/数量分配规则和同刻事件顺序；不把玩家与 NPC 的提交毫秒先后当成同价优势。若要求不同浏览器逐位一致，不能只加 seed 就宣称实现；还需处理 exp/log 等实现近似函数的差异，可通过统一数值实现、定点更新和黄金回放测试验证。[ECMAScript Math.exp](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.exp)
5. 保留撮合、价格生成和结算日志的诊断模式，才能定位“同一根 K 线成交价格为何如此”或“大资金是否无成本拉抬套利”。正式存档不必保留全部细节。

没有必要先开发通用金融引擎。首版使用股票资产结构和两套可配置市场规则；将订单、账户账本、日历和事件等稳定职责分离即可。债券和期货涉及新的定价/到期/保证金行为，未来可扩展，但不宜提前把它们的所有抽象做进首版。

## 200 只股票的规模判断

**200 只本身不是采用重型引擎的理由。** 简化模型只需更新宏观因子、行业因子、各股状态和少量参与者群体；成本更可能出现在对手盘粒度、历史数据、统计指标和大量图表同时渲染。以下仅是容量估算，不是性能实测：

- 按 200 只 × 每日 16 个内部时段 × 250 个游戏交易日，模拟一年约需 80 万次个股时段更新。实际市场日历可不同，这里采用首版建议的 4 小时、16 步结构估算。
- 0.2 的 250 日预热另需 80 万次更新；预热加首季共 160 万次，预热加 1,000 玩家日共 400 万次。预热缓存必须包括账户、事件、持续目标、历史与随机状态，按版本/种子/初始化参数区分；不能只缓存价格或在恢复时补满资金。
- 若进一步模拟每只股票的数千个独立账户和每笔挂单，计算与调参复杂度会发生质变；首版应采用有预算/库存/行为规则的参与者群体或有限深度曲线。
- 200 只 × 250 日 × 10 年 = 50 万根日 K。假设每根使用六个 64 位数值，仅数值数据约 24 MB；对象、索引和存储序列化还有额外开销。
- 若每天保留 4 根小时 K，同样十年就有 200 万根，数值数据约 96 MB；若连 16 步内部数据都全量留存，则是约 384 MB。因此建议保留全程日 K、有限窗口小时 K，旧数据降采样；订单与新闻按需分页。

**观察股票和未观察股票必须使用相同经济逻辑。** 可以只绘制当前可见图表，不能让未打开的股票暂停模拟或获得不同概率，这会引入可利用的观察者效应。

## 本地存档的必要设计

IndexedDB 面向较大量结构化数据并支持事务，适合快照、K 线分块和命令日志；LocalStorage 仅用于小型设置更合适。[MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)

浏览器存储存在配额与清理机制；持久化请求可以减少自动驱逐，但不替代备份。[MDN 存储配额与驱逐](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) 因此首版应有回合边界自动存档、上一份有效快照、版本迁移、导出/导入存档和写入失败提示。完成事务后才显示“已保存”。

换游戏引擎不会消除这一问题：Godot 的 Web user:// 持久化和 Unity Web 的 persistentDataPath 都落在浏览器侧存储体系中。[Godot 持久化](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html#using-cookies-for-data-persistence)、[Unity persistentDataPath](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Application-persistentDataPath.html)

单人本地玩法可以允许玩家自行修改存档。若未来需要可信排行榜、竞技或付费经济状态，需要服务器权威模拟或验证机制，那是新增产品范围，不能通过给前端存档“加密”保证。

## 技术验证与复杂度影响

建议把 **1–2 周的技术与玩法联合试验** 放入整体 4–6 人周原型预算内；这是经验估算，不是交付承诺。使用 40 股（两市各 20）完成“看消息—下单—内部推进—成交—账户变化—存读档”，然后把资产数扩到 200 做基准。不要等全部美术与 UI 做完才检验模拟。

试验需要回答：

- 同 seed、同命令，在逐步推进和跳过 20 天时是否得到相同快照；关闭再读档是否延续同一条随机路径。
- 一笔大单是否体现可解释的分批成交、滑点、未成交量和暂时/持续影响；是否存在无成本循环买卖获利。
- 200 只、完整一年的快进，在目标电脑和一台中端手机上各耗时多少；UI 是否可取消、是否漏过关键暂停事件。
- 下载、初始化、存档大小与图表历史增长是否满足预算；至少实际跑一次手机 Safari。

可以暂定工程目标：可见界面交互反馈低于约 100 ms，常规推进不阻塞 UI，长快进及时展示进度并支持取消；下载量和首开时间在首个原型测得后确定。上述是待验证目标，没有实测前不应宣称某个引擎能保证达到。

缩股主要降低内容浏览、计算与存储成本；双市场账户规则、事件与资金模型的实现及测试仍在，不应把总工期按股数减半。原研究工作量区间暂作保守预算，待原型校准。

就首版复杂度而言，推荐路线可降低 UI、部署和自动验证成本；引擎切换不会明显缩短事件设计、市场可信度、成交规则与数值平衡。真正需要优先投入的工程能力是：可复盘内核、成交流水核查、批量情境仿真、存档兼容与可理解的玩家反馈。
