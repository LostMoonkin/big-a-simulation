# P0 第1轮验收后的最小修复

2026-10-01；**实施完成、待第2轮独立验收**。针对独立验收提交 `2859420` 的 B01–B04 修复，保留[第1轮fail报告](p0-independent-round-1.md)与[首次交付记录](p0-baseline.md)。本次规则/玩法及内容提升为0.3.1，event合同为event-v1；schema1、math fixed-q9-v1、rng-v1及P0 spec1.0门槛不变。实施自检不等于独立通过。

| 问题 | 实际修订 | 自检与影响 |
|---|---|---|
| B01 / AC1、D07 | baseline-v1保留每风格原alpha=.90/.15/.15/.20/.75及非技术参数、26钱包、复核/库存规则；只关闭原约定技术/主题项和重大事件。新增[冻结样本](../../tests/scenarios/p0/baseline-v1.json)，工程基线、规则与P2 plan一致。 | BASELINE-STYLE-01核对；未提前运行P2经济。 |
| B02 / AC1、D08 | [代表事件合同](../design/event-content-contract.md)与[参数/样本](../../tests/scenarios/p0/representative-events.json)冻结8模板/2链的渠道单位、分布、持续/报告覆盖、重大条件、文本槽、合法路径和随机键。规则/特色/registry/P3入口指向同一答案。 | CONTENT-01及EVENT-CONTRACT-01核对合同与实际rng-v1样本；未实现P3生产事件引擎，24/6配额不增加。 |
| B03 / AC5、D05 | 采用现有实现的ECMAScript JSON输出：数组索引键按数值升序，其余字符串键按UTF-16码元升序。保留实际编码字节，补数字样式键、非规范数字键与嵌套边界黄金。 | NUM-KEY-ORDER-01及真实Worker逐字段对照；原黄金字段逐一与2859420版本相同，只有新增keyOrderEncoding。 |
| B04 / AC1、AC8、D07 | 明确P2首个原型的真实Windows桌面Chrome范围（当前154.0.8037.58），登记实际版本/受测构建，升级后重绑版本重跑完整操作脚本。 | 合同审阅；P2完整60日/交易/快进取消/恢复仍由P2执行，P5四桌面/移动范围保留。 |

本次仅修补这四项及其版本/引用/黄金，不改变40/200公司、26钱包、种子名单、费用、保护带、经营方程、公开时序、快照安全点、默认快照池和任何阶段硬出口。正式独立结论由另一个验收者签收。

实际执行的命令与受测源码/原始结果校验值见[p0-repair-round-1.json](fixtures/p0-repair-round-1.json)及[p0-node-results.json](fixtures/p0-node-results.json)。原始浏览器结果在ignored `artifacts/verification/p0/repair-round-1/browser-release`，复现入口为已提交的 `tools/p0/browser-probe.mjs`。旧浏览器小证据保留原源码/时间；本次新增证据绑定修订后的golden与Worker实际结果。

- `npm run fixtures:p0`：规则/内容元数据0.3.1的40/200配置重建成功；名单及配置数值保留。
- `npm run probe:p0`：有意新增keyOrderEncoding黄金；单独逐字段比较旧黄金，其余所有输出不变。
- `npm run build`：全部工作区typecheck及静态多页构建通过，24模块；新增黄金改变Worker试验载荷，故重跑。
- `node tools/p0/browser-probe.mjs http://127.0.0.1:4173/p0-probe.html "C:/Program Files/Google/Chrome/Application/chrome.exe" artifacts/verification/p0/repair-round-1/browser-release`：真实Chrome154.0.8037.58，11项pass，新黄金与当次Node及真实Worker逐字段一致。
- `npm run verify:p0`：最终整合后的19项设计/数值/样本自检pass，包含13随机键、6结果draw、5分支与9公开版本，sourceHash见小证据；不作为生产引擎或阶段独立验收。

协作B02两文件提交为 `0f23213e8bdb99698bc0428f0cffa54bb595179a`。首次19项pass后，一次源码绑定诊断检出了协作文件的最后文本/样本修订；没有沿用旧hash。待两文件稳定提交后只重跑受影响的verify:p0，最终19项pass且重新计算hash一致；未重跑无新改动的构建/浏览器。最终受测源码hash为 `fa24f1310d6eeb482b078ad1df21c8881f9669d76c7778709af32a4ca636ca4d`，执行时HEAD仅作为baseCommit记录，不能代表当时尚未提交的整合代码。

P1生产账本/恢复、P2自然100+10种子经济与60日游戏、P3事件/策略、P4真实250日预热快照与持久存档、P5最终性能/兼容与目标玩家仍为not_run，并按原阶段责任保留。当前待第2轮独立验收，无新增确认请求。
