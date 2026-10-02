# P2 第1轮失败后的单一报价修复

2026-10-02；这是实施者定向回归，不是正式第2轮验收。P2仍未通过，新的250+5与100+10经济运行尚未开始。本修复响应[第1轮B01/B02](p2-independent-round-1.md)，合同先由4158cbd提交并执行P0检查，随后才实施生产分支。原初始化候选/旧失败/中断记录全部保留。

新增唯一报价版本 `npc-quote-v2-target-gap`：在本批风险限制后的本人剩余需求g上，以固定initialShares为尺度，计算 `uQ=clip(g*Q9/initialShares,±120000000)`，再将三档保留价格取为 `mulQ(referenceQ,expQ(uQ))`。原referenceQ仍供评分；持续目标、风格标量、复核、数量/三档比例、跨股跨市统一预算、初始现金/股份、可售时点、费用、保护与硬门槛不变。规则见[5.2](../design/market-model-rules.md)，固定输入见[NPC-QUOTE-01](../../tests/scenarios/p0/npc-quote-candidate.json)。

新世界显式保存npcQuoteVersion，进入configHash/预设/公共progress/diagnostics/CLI manifest。缺字段world-v1及world-v2-style-cash旧档有效版本是npc-quote-v1，不补字段、不改规范字节或旧报价；未知值拒绝并保留当前世界。规则/内容0.3.1、schema1、fixed-q9-v1、rng-v1未变。未来complete与baseline共享报价合同并从头预热；旧预热不得用作新经济证据。

实际执行：

- `npm.cmd run verify:p0`：退出0，20项pass（含新增报价算术），来源4158cbd前受测hash记录在[独立命名P0候选结果](fixtures/p0-node-results-world-v2-style-cash-npc-quote-v2-target-gap.json)。仅说明合同/算术，不继承P0历史经济结论。
- `npm.cmd run typecheck --workspace @big-a/sim-core`：退出0。
- `node packages/sim-core/check-npc-quote.mjs --out artifacts/verification/p2/quote-candidate-04`：退出0，四组pass；[小证据](fixtures/p2-quote-repair-round-1.json)保留完整来源、原始结果与脚本hash。首末经济hash同为`e7b429c102d774bea3bf90fd60d69e66645f86ab8f85952e1731387055cfa58f`。

两个真实保留输入在目标复核之后隔离本人订单，旧/新走同一生产generateNpcOrders、资源预留与保护内clearAuction。两分支的方向、股数、现金和持股保持；改变的是保留价格。A001顶买4911→5500、顶卖5164→5043，旧Q0，新p5084/Q25063；A003顶买仍4837、顶卖4875→4479，旧Q0，新p4505/Q245。±.12裁切、零缺口不下单、锁定卖单为零及有限含费现金均通过。固定参与者回归不是一次新世界预热，也不保证自主经济中的每个缺口都成交。

新世界与隔离9dfc69f原生产生成器相比，完整初值仅npcQuoteVersion/configHash不同。未知报价版本的合法checksum档被拒绝，当前完整档不变。真实旧world-v1一档、world-v2-style-cash两档读取/恢复/导出payload和checksum逐位保持；各继续16个真实批次后，与9dfc69f冻结world-generation/world-simulation/trading-core模块的完整payload/checksum相同。冻结副本只写ignored运行目录，其他依赖保持当前源码，验证器仅新增版本合法性守卫；没有改黄金或旧存档。

新的原两种子3572871866/1866980507必须由CLI在新目录从世界0重新完整250+5；诊断结果合理后才启动原登记100种子250+250及原前10延至1000玩家日。当前这两项都是not_run，90%股票×80%真实成交日仍为硬出口。此处不签收长期经济、P1完整新浏览器来源、P2新60日浏览器来源或P3/P4。
