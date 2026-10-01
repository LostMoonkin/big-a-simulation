# 工程、数值与实验基线

版本 0.3.1；2026-10-01；P0 实施冻结、待独立验收。此文件及[精确规则](market-model-rules.md)、[市场特色](market-identities.md)关闭 D01–D08。技术试验只证明方向与协议，不等于游戏、经济、性能或跨浏览器最终通过。

## 数值和随机合同

可复用实现为 `packages/sim-core/src/numeric.ts`；Node与Worker执行同一 `tools/p0/numeric-probe.ts`。金额为 BigInt 分；价格为Number整数分（1..100,000,000），每公司总股数/委托量为Number整数（1..8,000,000,000）。世界日上限1,000,000，批0..15，tick=day*16+batch；超界明确拒绝，不静默裁订单。

每单价格×数量上限8×10^17分，200公司聚合估值上限1.6×10^20分；聚合数量上限1.6×10^12股。价格与股数各自安全，二者乘法、成交额、预留、费用、累计资产和比例分子必须先转BigInt。账户/世界金额状态上限2×10^20分，禁止Number乘后再转BigInt。正式开局总初始市值最多8×10^14分，流通≤70%、现金25%时NPC初始现金≤1.4×10^14分，最大玩家本金10^9分，总初始现金≤140,001,000,000,000分；之后现金只转移不增发。里程碑/比例比较交叉乘BigInt，不使用浮点相等。

手续费按账户×股×批×方向 `ceil(amount/2000)`；0额0费。日单/计划预留为 `remaining*limit + fee + min(remaining,remainingBatches)-1` 分，即时单K=1。买限价向下、卖限价向上；清算量/目标股数向下，计划子量向上；最大余数分配用整数除法及模数。费用归属、数量配额平局用既定ID与随机键。价格不得因舍入变为0或超过MAX_PRICE。

经营、暴露、收益/增长、噪声、权重、log/exp均用 `Q9=10^9` 的BigInt定点，不用运行库Math.log/exp/sqrt影响行情。mulQ/divQ中间量BigInt，除法向0截断，每次状态赋值保留Q9；E范围[5,2000]对应[5e9,2e12]。比例归一化与风险裁切用精确分子；目标权重取整余数归现金，要求总和恰为1e9。方差与Risk的平方根用非负BigInt整数平方根（最大r使r²≤n），再Q9量化。显示端可转Number小数，不回写核心。

`fixed-q9-v1`的exp在[-16,16]先用常数LN2=693147181整除缩域，再迭代32项Taylor，最后乘/除2^k；log的正Q9输入上限1e18（即实数1e9），规范化到[1,2)，32项奇次atanh，最后加k*LN2。协议以实现步骤为唯一逐位答案，不依赖平台libm。测试点对96位Decimal的误差见数值精度记录；实际核心超域须报数值错误。exp权重可先减最大评分保持域内，相同比例不变；不靠超域截断掩盖账务错误。

`rng-v1`是无调用计数的随机键：JSON数组`["rng-v1",seed,purpose,entity,tick,slot]`，UTF-16LE字节FNV-1a加固定32位avalanche，Math.imul和无符号位运算由ECMAScript定义。seed为0..2^32−1。用途固定为宏观、阶段驻留/转移、市场行业、公司增长/身份、概念分配、事件对象/结果/分支、账户观点/库存、数量平局；新增用途另取字符串，不能复用同一槽。日扰动tick取当日batch0，报告期/经济阶段依世界日；事件分支entity=事件稳定ID，slot=分支编号，tick=候选创建时点，禁止读取/下单消耗新抽样。账务平局entity编码stock/side/price/account，tick取执行批。

uniformQ=floor(u32*1e9/2^32)。z用12个独立uniformQ求和减6并裁±3，明确为标准正态的有界近似（替代0.2未指定的正态算法）。公开采样次数、用途和槽号随版本固定，不声称密码学随机。保存seed、rng版本、所有已抽事件/阶段排程与观点记忆；无可变PRNG游标。同一键重求同值，公开查询/图表/通知不消耗键。

快照使用`encodeExact/decodeExact`：BigInt编码为唯一对象`{"$bigint":"规范十进制"}`，保留有符号值；业务对象不得使用保留键`$bigint`。Number必须安全整数，不保存NaN/Infinity/undefined；普通对象输出遵循ECMAScript JSON顺序：数组索引键（规范十进制字符串0..4294967294）先按数值升序，其余字符串键按UTF-16码元升序；02、-1、4294967295属于后组。数组维持规则定义顺序，主体/公司数组按稳定ID排序。canonical JSON UTF-8经SHA-256得到状态摘要与包校验（核心可注入标准实现，CLI node:crypto、浏览器SubtleCrypto结果须一致）；UI选中股票、渲染/耗时/诊断日志不入状态hash。读档先限64MiB编码大小、深度≤64、实体/历史数量与字段范围，再校验版本/hash/所有不变量，在临时状态完整构造成功后原子替换。未支持版本保留原档且明确拒绝；不建设泛化迁移。

## 核心、消息与完整状态

聚合数量上界1.6×10^12指真实发行股份；申报D/S可以超过真实存量，聚合申报量和所有分配比例分子也使用BigInt。单笔获配/账户持股转回Number前须验证不超过公司8×10^9总股数，不能假设任意多个买单的需求合计总是安全整数。

已知数值量化：在exp(-16)极小尾部，Q9输出1.12e-7，相对96位Decimal的绝对误差约5.35e-10、相对误差约0.476%；这是固定协议的小量量化，13点检查用绝对误差≤1e-7*max(1,|参考值|)，不宣称全域相对误差很小。模型变量按这一协议定义，账务金额不受此近似影响。更改精度必须提升math版本并重做黄金，不能在不同adapter偷偷用平台exp。

冻结能力类型见 `packages/sim-core/src/contracts.ts`；P1实现同一个MarketCore，CLI与单Dedicated Worker只是adapter。金额传入BigInt，UI本金字符串解析后验证；价格/股数须整数。错误码区分invalidInput、资金/可售不足、反向单、旧公共版本、已结算批、重复ID冲突、阶段不合法、结束、版本/坏档、生成失败。

createWorld在生成失败时不产生半个局；标准路径世界0开始、玩家本金仅预热后注入。P1的固定场景可显式跳过预热建立决策窗口，但不得冒充正式新局。命令ID属于生涯全程：相同ID与规范内容返回原回执，不再冻结/撮合；同ID不同内容拒绝。重复判断在旧版本/旧批校验之前，接受与拒绝回执都保存。新命令必须来自当前publicVersion，目标只能是当前publicDecision批，或settled后下一未结算批；不得回写过去批/提前预约任意未来批。已接受日单/计划按其固定限价和到期执行，不因后续版本更新自动失效。

`advance`用整数maxBatches工作量预算，不以系统时间决定模拟；UI可按耗时决定下一请求预算，不能改变批内结果。手动取消在最近完整批次停止；已公开的重要事件暂停则停在publicDecision（该批NPC未生成订单）。达到小时/日目标时先完整提交对应末批。界面等待期间核心不后台运行。Worker请求包含requestId、expectedStateVersion；操作顺序串行，旧state请求明确返回当前状态/拒绝，UI晚到reply若stateVersion小于已展示版本须丢弃。没有修改状态的查询不提升版本，准备/命令/完整清算的真实状态转换提升版本。

两个安全快照相位：`publicDecision`（解锁/到期/费用、经营与公告、公开版本已准备；NPC未决策/未冻结），`settled`（所有股清算、费用、资源、K线已原子提交）。内部clearing、bookkeeping永不导出。publicDecision恢复从决策继续，保存`preparationAppliedTick`和事件/报告效果ID，禁止再次准备同批；settled恢复从下一批准备继续。完整批次的失败使用临时账务草稿回滚，不留下部分股票已成交。

完整快照至少保留：规则/内容/schema/math版本与configHash；seed与随机键版本/已抽排程；连续时钟、相位、状态/公共版本、prepared/applied标记；公司身份、实际E与全部公开简报；宏观/市场政策/行业状态、阶段驻留；隐藏事件结果、链、公开预期版本/有效期/报告覆盖；26钱包、现金/冻结、股份批次与解锁、固定初始份额；账户持续观点、目标比例/股数、复核排程、小时容量与已用量；全部订单/计划/剩余/费用归属/命令回执；价格保护/重开公告、真实参考、历史与指标/已确认形态；服务余额/固定分配份额；玩家一次性注入标记、原始本金、生涯/赛季成绩键、累计峰值、里程碑与耗尽连续天数。普通公开视图只含当时消息/报告/历史与自己的账户，禁止使用完整snapshot给策略提示。样本见 `tests/scenarios/p0/snapshot-projections.json`。

公司简报phase=(市场内稳定序号−1) mod20，日级经营增长在日终累积、下一开盘公告/报告前提交，报告涵盖截至前一世界日的实际经营；瞬时已公开结果在对应公开准备中应用一次。跨季算例见 `tests/scenarios/p0/cross-season.json`：玩家250日是世界499，下一日世界500恰有20日费用/长期复核；240日线索在254日更新，262日以后揭晓，旧有效期不删除新版本。费用分配在新日公开准备前，报告/政策公告后再共同复核，所有时钟相位不按玩家日重置。

## 世界和内容配额

正式配额完全保留0.2；原型矩阵A为1/2/2、1/1/2、1/1/2、1/1/1、0/1/1、0/1/1，B为0/1/1、1/1/1、0/1/1、1/1/2、1/1/2、1/2/2（能源/工业/消费/基建/数字/健康，大/中/小）。每市原型4/7/9，行业A5/4/4/3/2/2、B2/3/2/4/4/5；概念5/5/5/5/5/5/4/4共38关系，每市5无/11单/4双。正式20/35/45，每市25/55/20标签，全世界190关系26/26/25/25/24/24/20/20。

`fixtures:p0`用受限容量流得到完整样本，概念合法性和至少两行业同时核验，最多64次后generationFailed。不是对100股任意截前20行。每股业务说明、Q9暴露、股数/流通/价格/市值、公司报告phase与期限敏感度可复核。样本固定10元、流通40%，大/中/小实际120/50/8亿，属于各自半开区间；P2生成器可在原合同区间随机取值，算法及失败合同不变。

90%流通股按每市既定风格份额分给12本地，10%给两个跨市各5%；风格内±5%受控库存扰动、最大余数精确分配，创始持有人持非流通股。每钱包现金=持仓初始市值25%，只有一份跨市现金。原型样本总流通值7,216,000,000,000分、NPC现金1,804,000,000,000分；正式为36,080,000,000,000/9,020,000,000,000分（verify:p0逐股重算）。40股时玩家100万相对每股容量不变、相对全世界份额比正式大5倍；不能据此证明200股平衡。

baseline-v1从创建关闭重大事件/主题与动量：26钱包及全部股份保留；各角色仍用原风格alpha（价值.90、趋势.15、主题.15、噪声.20、跨市场.75），温度/基础持股比例/持续噪声/评分噪声倍率/容量/库存目标与原复核排程、lambda、风险约束全部保留；beta=gamma=kT=kH=0、H=0，不把趋势/主题/跨市场账户转换成价值账户。公开经营、风险、报告5%重大变化复核与资金约束仍有效。完整冻结参数见 tests/scenarios/p0/baseline-v1.json，与P2 plan保持一致。complete模式从创建启用全部profile/模板，不在预热后切参。大小、模式、参数hash独立绑定缓存；消融必须显式标识且不删除钱包/免费补资。正式24/6与P3的8/2子集见内容索引；8/2的唯一生成合同为[event-v1](event-content-contract.md)及 representative-events.json，模板渠道/分布/槽位/分支不能由P3另取默认值。

## 默认启动与验收协议

固定名单 `tests/scenarios/p0/seeds.json`来自rootSeed20261001、用途seed-manifest-v1、组名和序号。baseline100，前10长期；training30、screenHoldout30、confirmHoldout100互不重合；fullSurvival100前10长期；defaultPool16、customWarmup5单列。所有名单在观察任何行情结果前封存。保留组若被用于调参整组退役，新增未观察组version，并记录旧组，禁止只删失败。P2与P3原型初筛可用同协议名单，P5须在最终200股版本重新确认。

40股基准逐种子逐市场：250日预热另计，玩家250日（长期10种子1000日）；至少18/20股各有≥200/250个真实成交日。预热不进分母，不造无成交价；任意一个种子/市场不达即fail，保持90%×80%硬出口。200股全行为逐环境诊断；换手.2%–5%、策略60%配对胜率、形态每市/尺度/类跨10种子累计50条是告警初值，并报告另一项代价、样本及区间，不能冒充硬盈利门槛。P3初筛每组30种子各预热250+玩家120，P5确认100保留各预热250+玩家250；四路径2成立2失败、消融及对抗责任见追踪矩阵。

默认选择**静态随包16个完整预热快照，按固定池均匀随机选择一个**。新局adapter调用crypto.getRandomValues一次取u32的低4位；该随机只选输入seed，选中后核心全部由固定键驱动。界面说明“从16个已预热随机世界选择”，不能声称任意新seed；未预置自选seed现场计算。快照由实际生产core以对应size/mode跑世界0..249生成，停在settled/world249/batch15，玩家未注入；载入后验证摘要/版本/seed/config，注入所选合法本金一次，prepare世界250公开窗口。P4应离线生成与现场重算逐项一致证明；P0没有造预热行情/钱包。

按需只下载所选快照；应用传输预算gzip≤2MiB、每个默认完整快照gzip≤4MiB、默认池打包≤64MiB，原始单档≤64MiB。P0编码/Worker试验验证完整状态可保存/传输的方向，实际250日快照大小与10秒目标在P4/P5测；超预算先压缩冗余记录/分页消息或优化，不能只缓存K线、删目标或放宽启动目标。坏/错版预置档拒绝，保留现场预热可恢复入口，未就绪不得展示可交易状态。默认路径仍须通过10秒协议。

固定网络20Mbps下行、5Mbps上行、RTT80ms、无额外丢包；release构建。每桌面浏览器20次清空HTTP/应用缓存/IndexedDB，导航起点，脚本立即确认默认配置；分别记录开局控件可交互p95≤3s与可接受合法交易命令p95≤10s，包含所选snapshot下载/注入，不包含人为阅读。p95=排序后第ceil(.95*n)个；所有原始样本保留。任意customWarmup5现场250日，桌面≤60s/移动≤180s，进度间隔≤1s。其他P5预算原样冻结：普通日p95≤200ms桌面/1000ms移动；缓存/250/500/1000日保存恢复≤3s/8s；交互≤100ms/200ms；取消≤250ms/1s；总UI+Worker峰值≤512MiB/256MiB。5次小样本同时报告全部值和最大值，不能推断稳定总体尾部。

开发设备档案：AMD Ryzen7 9700X，16逻辑CPU，33,409,036,288字节RAM（约31.11GiB），Windows11 Pro10.0.26200 x64；Node26.7.0/npm12.0.2。读自node:os，CIM访问被拒绝，未捏造电源/后台配置。最终P5基准桌面以此设备、接市电/平衡模式、无其他重负载为登记条件，浏览器实际版本测试前冻结。macOS Safari真实设备、中端移动目标（iPhone13、iOS正式版本Safari，至少128GB型号）现未具备，本轮not_run；不得以Chromium/WebKit模拟器冒名。P5同时提供Chrome/Edge/Firefox实机、macOS Safari、移动技术检查，不保证完整手机布局。

P2首个可玩原型的冻结浏览器范围是本机Windows11上的真实桌面Google Chrome，当前登记版本154.0.8037.58；它是P2-AC4/6/7/8完整新局、60玩家日操作、消息/三类交易、快进取消、导出/新会话导入及继续的最低验收范围。测试开始记录完整Chrome版本、OS和受测构建；若浏览器自动升级，先登记新完整版本并重跑相应完整浏览器脚本，旧版本证据不能自动代用。P2可用真实headless Chrome自动化并辅以页面核对，不用模拟Worker/UI接口冒充浏览器。P0只验证图表/Worker方向，没有执行P2游戏闭环。P5仍须真实Chrome/Edge/Firefox/macOS Safari与移动技术检查，P2范围不替代最终兼容范围。

## 工具依据、许可和复现

canonical键顺序的官方定义参照[ECMAScript OrdinaryOwnPropertyKeys](https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-ordinaryownpropertykeys)：数组索引键先数值升序；本协议在普通字符串键的创建顺序前先做UTF-16排序，所以非索引键也与输入插入顺序无关。0.3.1明确现有实现字节，而非另换编码器；新增数字样式键、非规范数字键和嵌套边界黄金。

实际锁：React/react-dom19.3.0 MIT，TypeScript7.0.2 Apache-2.0，Vite8.3.2 MIT，@vitejs/plugin-react6.1.1 MIT，KLineChart9.8.12 Apache-2.0。Node26.7.0、npm12.0.2是本机runtime而非随游戏分发。许可文件由锁定npm包核验；P6随构建保留适用LICENSE/NOTICE。测试采用Node内置assert，P0浏览器试验复用已配置Playwright依赖控制真实Chrome，不加入游戏运行依赖。

官方依据：[KLineChart9.8.12更新日志](https://v9.klinecharts.com/en-US/guide/changelog)、[固定tag源码与许可](https://github.com/klinecharts/KLineChart/tree/v9.8.12)、[Vite Worker支持](https://vite.dev/guide/features.html#web-workers)、[Worker消息](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)、[IndexedDB事务](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)、[BigInt JSON限制](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json)、[ECMAScript imul](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.imul)。浏览器存档使用IndexedDB事务成功后才提示；localStorage仅外观设置。P0仍是单Worker、DOM/Canvas、静态站点，不引入后端/WASM/共享内存。

KLineChart选9.8.12是固定稳定9.x API的能力验证，非自动追最新10.x；已有UI预览SVG保留到P2接真实数据时采用已验证Canvas库。无成交/未完成/历史不足由adapter标记与文本展示，MA仅给已完成窗口计算，库内建指标显示不得冒充缺失历史。画线仅保存可见history锚点与手工标注，不进经济hash。试验代码在独立p0-probe.html，不变成另一套交易引擎。若当前需求能力不满足才换库，需记失败和理由。

复现命令：`npm run fixtures:p0`重建配额/钱包/种子；`npm run probe:p0`有意更新数值黄金（协议不改时不执行以掩盖差异）；`npm run verify:p0`校验现有黄金、配额、价格保护算例、时序/投影合同；`npm run build`类型及静态多页构建；`npm run preview`后打开`/p0-probe.html`执行真实浏览器试验。必要小证据在docs/verification/fixtures；长输出/截图在ignored artifacts，可由浏览器入口重建。sourceHash覆盖实际受测源文件，不用旧HEAD冒充未提交代码。

## 决策影响清单

| 决策 | 选择与拒绝方案/原因 | 权威产物与受影响验收 |
|---|---|---|
| D01 | 共享因子+本地公开融资/业务事件+profile；拒绝定价器直接政策加涨幅及无限托底 | 规则3/4，market-identities，MI-A/B01..04，P3-AC3/P5 |
| D02 | 保留0.2两日甲特别开盘、乙8/16/32/64/特别；补无交叉复位和重开无成交行为；拒绝无供需自动移动参考 | 规则6.2，A13/A14/PR-*，P1-AC4/P3 |
| D03 | 完整受限流配额、精确最大余数钱包；拒绝100股截断或超标签 | world-*.json、verify:p0，P2-AC1/P4-AC1 |
| D04 | 20日公开版本替换/失效，长链中间更新；拒绝跨季永久叠加旧预期 | cross-season、规则7/8，A15/A25..28，P3/P4 |
| D05 | BigInt钱、Q9模型、固定math/rng/编码，索引键数值序/普通键UTF-16序；拒绝浮点账务与seed+平台log/exp即承诺 | numeric.ts与黄金，NUM-01/NUM-KEY-ORDER-01、P1/P5 |
| D06 | 同core、publicDecision/settled安全点、命令幂等/版本、暂存后原子替换；拒绝中间清算档与NPC抢跑 | contracts.ts、projection、SNAP-*，A12/P1-AC6/P4 |
| D07 | 预登记各组、逐种子市场硬线、默认静态池与分开计时、P2真实Windows Chrome范围；拒绝漂亮种子/只测首屏/动态降线 | seeds/protocol/设备/baseline-v1，BASELINE-STYLE-01、START-01/P2/P3/P5/P6 |
| D08 | 正式24/6，代表8/2按event-v1冻结分布/作用/重大/文本/分支，符号分支不暗增 | content-registry/event-content-contract/representative-events，P3-AC1/P4-AC2 |

冻结规则0.3.1、内容0.3.1、schema1、math fixed-q9-v1、rng-v1。任何后续行为修改提升对应版本、列受影响案例并重跑；P0独立验收前状态为待验收，G1–G4与完整G0均不在本阶段声明通过。
