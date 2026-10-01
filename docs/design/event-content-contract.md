# 代表事件内容合同

event-v1 / schema 1 / 规则与内容 0.3.1；2026-10-01。P0 B02 修复输入，待独立验收。只冻结 P3 的 O01/O02/S01/S02/M01/M02/I01/I02 与 C01/C02；参数和可复核样本见 [representative-events.json](../../tests/scenarios/p0/representative-events.json)。这是虚构游戏初值，不是事件引擎或自然市场验收证据。

## 字段、单位与公开边界

所有 `*Q` 是 Q9 有符号整数的规范十进制字符串：`"60000000"` 表示 .06，`"1000000000"` 表示 1。乘除按 fixed-q9-v1 向零截断。概率、可靠度、关注和暴露也使用 Q9；日数/版本/批次是安全整数。`Clock={worldDay,batch}`，`tick=worldDay*16+batch`，使用连续世界日。

| 公开版本字段 | 必需类型及含义 |
|---|---|
| eventId / templateId / chainId | 稳定消息 ID、上述模板 ID、C01/C02 或 null |
| effectId / version / previousVersion | 作用身份、从 1 递增的版本、前版整数或 null；前版必须属于同 effect |
| publishedAt / effectiveUntil | 当前已公开时点；未核实预期在发布后第 20 世界日同批到期，已核实结果为 null |
| status / primaryChannel | preview/update/result/denied/expired/archived；operatingLog/rateOutlook/effectiveFinancing/sharedDemand 中一种 |
| targets | `{stockId,businessWeightQ,businessSource}` 数组，或市场/世界对象；来自公开业务身份而非持仓 |
| expectedRange / reliabilityQ | 各分量的 `{meanQ,lowQ,highQ}`；可靠度 [0,1] 是消息置信描述，不乘经营结果或概率 |
| effectiveFrom / coverage | 已公开生效时点或 null；已公开经营覆盖 `{oneOffAt,startDay,endDayExclusive}` 或 null |
| disclosedResult | 公布结果后才有实际分量，之前为 null；否定/过期使用 null，不伪造经营结果 0 |
| major / attentionQ / textSlots / text | 只依据本版本公开数据的重大标记、关注增量、必要文本槽与已渲染文本 |

`expectedRange` 的操作分量为 `oneOffLog`、`dailyLog`、`financingLevel` 或 `demandDelta`；持续预告另含 `durationDays`、`startDelayDays` 的公开整数区间及均值 `floor((min+max)/2)`。未核实时，持续贡献的点估计使用这些公开均值；核实后替换为已公开实际区间，不能读取私有实际持续日数。信息节点必须在创建时指定一个既有/待生效 effect 和一种渠道，不能用一次消息叠加两个渠道。公开对象只能包含上述字段，不包含 creationTick、抽样键、未来分支、未公开结果、未来发布排程、私有应用/覆盖标记。可公示“预计期间”，不能将私有确定排程当已知结果。P0 的简短 `PublicMessage` 可投影为 id=eventId、revision=version、expectationQ=该 effect 的公开单值摘要、status/text；其非空 expiresAt 对未核实消息使用 effectiveUntil，对核实消息保留 publishedAt+20日作为兼容字段且 status=verified 不执行过期。P3 详情使用本表 effectiveUntil=null 表示核实后持续，不能通过短投影泄露私有值。

私有保存至少保留 effect 的当前版本、创建 tick、根节点 ID、预抽结果与分支、待公布节点、实际应用标记及逐公司经营覆盖记录。恢复不能重新抽样。版本和应用身份按 effect 保存；同 effect 的 S01 预告、O01 结果、I02 核实是一次贡献。独立渠道用不同 effect ID；一个链可以有多个 effect。

## 分布和默认参数

数据文件的 `distributions` 给出精确计算式和裁切域，`templates.parameters` 给出全部默认参数。期望均值用 `baseQ + mulQ(halfWidthQ,2*uniformQ-SCALE)`，实际结果用 `clip(meanQ+mulQ(sigmaQ,normalQ),minQ,maxQ)`。normalQ 是 rng-v1 的 12 个均匀值减 6、裁切 ±3 的有界近似；不是高斯分布。公开范围为裁切后的 mean±3sigma。持续天数采用闭区间整数均匀抽样，公布前只公开区间。结果可高于或低于预期；正负符号不会创建新模板。

| 模板 | 唯一主渠道与默认意义 | 默认预期 / 结果参数 | 生效与退出 |
|---|---|---|---|
| O01 采购结果 | operatingLog；按有符号业务权重应用一次 | 单次 log 均值 .06±.02；sigma .02，域 [-.20,.20] | 默认 5–10 日后批 0 公布；同 effect 替换预期，应用一次；已实现部分待报告覆盖 |
| O02 产能爬坡 | operatingLog；单次与逐日分量属于同一经营 effect | 单次 .04±.02，sigma .015，域 [-.10,.10]；日 log .0004±.0002，sigma .0002，域 [-.002,.002]；持续 5–20 日 | 默认 8 日后批 0 公布；单次立即应用；连续日区间半开，已实现与未来分别记录 |
| S01 政策配置 | operatingLog 预告；不更新实际 E | 与 O01 同一结果分布与 effect；预期 .06±.02、sigma .02 | 默认 5–10 日后 O01 兑现；受益与替代业务权重可异号；过期/否定只撤未实现预期 |
| S02 融资条件 | effectiveFinancing，绝对水平 [-1,1]；不发现金 | 独立节点均值为当时公开 rateOutlook，sigma .15；C02 使用 M01 已抽政策结果，不重抽 | 默认 5 日后批 0 生效；已生效水平持续到下一已公开变更，不按 20 日抹掉 |
| M01 融资预告 | rateOutlook，绝对水平 [-1,1] | 均值 .30±.20，sigma .15，域 [-1,1]；负面配置 base=-.30，其他参数相同 | 公布时替换待核实预期；5 日后核实并交 S02 生效，或 7 日后撤回；未核实版本最多 20 日 |
| M02 需求变化 | sharedDemand，宏观需求的增量 | 均值 .05±.05，sigma .05，域 [-.25,.25] | 默认 3 日后批 0，将结果作为当日宏观递推的 publishedShock；以后沿原递推演化 |
| I01 传闻/先行线索 | 默认 operatingLog，亦可明确引用 rateOutlook；只改公开预期与关注 | 继承被引用 O01/O02/M01 的分布；默认 O01、可靠度 .45；确认/否定/无后续概率 .65/.25/.10 | 创建后固定分支；确认进 C01，否定第 6 日 I02，无后续第 20 日同批失效 |
| I02 核实/指引 | 默认 operatingLog，亦可引用 rateOutlook；只有版本替换 | 指引继承 O02；update 均值为旧均值 + (源 sigma/2)*normalQ，范围裁切；verify 使用已有公开结果，deny 撤预期，不新增实际应用 | update 可靠度 .65 并重新给 20 日；verify/deny 可靠度 1、无待核实期限；无合法引用时不生成 |

经营结果先乘业务权重，再依精确规则更新/裁切 E。公司级权重为 1；政策对象的每股权重从公开业务身份取值，[-1,1]，绝对值之和≤1。持续项是该事件的额外 log 增量，不再次加入基础 g 或行业因子。S02 只经既有 `0.0002*负债敏感度*effectiveFinancing` 进入基础 g，M01 只经期限折现项，M02 只经公开宏观因子；三者不能再建同金额经营事件修正。I01/I02 不是另一份经营冲击。

除 I01 外预告/update 默认可靠度 .65，I01 为 .45，result/denied/expired/archived 为 1；核实后结果的均值及上下界都替换为已公布值。S02 的 `baseQ="0"` 是开局默认，生成时按 `baseSource=currentPublicRateOutlookQ` 读取当时公开水平替换 baseQ；halfWidth=0 不重抽均值，实际结果仍按 sigma 抽样，C02 例外复用政策结果。这些是自然生成默认值；固定 MI/跨季场景可以显式覆盖均值、结果、日数、时点，仍须满足渠道、域、单次 log≤.20、20 日未核实期限和覆盖规则。例如 MI-B02 的 .08/.0004/20 日与跨季 .05/.001/10 日均合法。M01 base=-.30 的分支可验证紧融资，无需提前扩充 M03。

## 生成、键和两条合法链

每日公司/行业/宏观候选概率 .35/.12/.03、各类最多一条新启动链；公司最多一条未决重大链、概念最多两条。数据文件固定各类模板抽样权重；先过滤合法对象及链容量，空集合跳过。对象按稳定 ID 排序后 `floor(uniformQ*n/SCALE)` 选择；不读任何玩家/NPC 持仓、现金、订单或通知筛选。公司候选 O01/O02 启动自身兑现节点，I01 启动 C01；I02 只对已有未核实经营/融资 effect 更新。行业 S01 启动 C01 的 S01 节点，S02 启动融资条件节点；宏观 M01 启动 C02，M02 启动需求节点。候选被过滤后在剩余模板中归一权重，不增加每日概率。

稳定根 ID 为 `event-v1/<templateId>/<scopeId>/<targetId>/<creationTick>`（ID 字符不含 `/`）；根在候选日批 0 创建，creationTick 不受随后选择的公开批次影响。子 eventId 为根 ID 加 `/node/<nodeName>`，effectId 为根 ID 加 `/effect/<effectName>`。不同发布版本沿用 eventId/effectId；范围或参数变更不能重新抽实际结果。候选键 entity 为 `category/<category>`；对象抽样键 entity 为根模板+scope；根创建后各键 entity 为根 ID+`/<effectName>.<component>`。所有键形式为 rng-v1(seed,purpose,entity,creationTick,slot)；purpose 与 slot 清单在数据中冻结，update 使用来源 effect 的根创建 tick、slot=newVersion−1。延迟整数、分支类别和持续日数在创建时固定，不在 UI/恢复/赛季节点抽样。normalQ 内部用 slot*12+i，其他分量通过独立 entity 隔离。

| 链 | 条件/概率和节点时点（均相对根创建） | effect 身份与终止 |
|---|---|---|
| C01 | I01 第 0 日；confirm .65 → S01 第 4 日 → O01 第 9–14 日 → I02 次日核实；deny .25 → I02 第 6 日；expire .10 → 第 20 日同批失效 | 全链一个 operating effect；S01/O01共用预抽结果；末尾 I02 只解读已公开结果。confirm 的 O01 可以正、负或低于预期 |
| C02 | M01 第 0 日；implement .70 → S02 第 5 日 → I02 经营指引第 8 日 → O02 第 16 日；withdraw .30 → I02 第 7 日撤回 | outlook/effective 两个融资 effect 共用一份政策结果；经营指引与 O02 共用另一 operating effect。撤回不能留下 effectiveFinancing 或 O02 应用 |

各发布默认批 0；根 I01 可在小时开始批 0/4/8/12 发布，C01 否定和到期保留根批次。C01 从 S01 直接启动时跳过 I01/分支，O01 从该 S01 时点延迟 5–10 日、I02 次日；从 O01 直接启动不添 S01。C02 的 S02 生效窗口同时公布原 M01 的 result 版本和 S02 的 result 版本：两条不同 effect 的公开更新，均取同一预抽政策结果。I02 指引仅引用经营 effect，不再加融资预期。C02 第 16 日 O02 至少低于其第 8 日指引的 20 日期限；持续过程可越季延续。独立 S02 则没有 M01 新版本。

延期只用于创建前的合法容量筛选；已创建链不因持仓/赛季改变节点日期。数据 `chains.edges` 是唯一允许的边，分支阈值为累计 Q9 概率半开区间；恰等阈值走下一区间。无后续是允许的终态，不保证所有链节点都会出现。跨季固定场景的 I01 前置信息是经营 effect 的外部线索版本，不是新增 C02 强制节点；其后 I02/O02 沿同一版本和覆盖合同执行。

## 替换、期限、覆盖与重大条件

同批顺序依精确规则：提交前日日终经营，再准备公告/结果/报告、冻结共同公共版本。旧版本到期时先检查同批更新/核实版本；只使该旧版的未实现预期失效，不能擦掉新版本、已实现经营或已生效融资环境。否定/到期使 activeContribution 归零；rateOutlook 回到上一已核实水平（开局 0）。已核实融资水平没有经营报告覆盖。宏观冲击随原因子递推，不因经营报告重复相加或撤回。

O02 单次在 result 时点应用，持续区间为 `[startDay,endDayExclusive)`：若 result 批 0，startDay=result.worldDay；否则从下一世界日开始。每日贡献在日终累积，下一开盘前提交。报告日 d 只覆盖时点早于 `(d,0)` 的单次和持续日 `<d`。公开经营预测保留截至报告截止后尚未覆盖的已实现部分，加未来 `[当前世界日,当前世界日+20)` 与持续区间交集内的贡献；每个日只计一次。报告增长率剔除本报告间可量化经营贡献，防止再外推。尚未到期日不能被报告移除；持续结束只停止未来贡献，未覆盖已实现贡献仍保留至报告。私有经营记录保存 E 裁切后的实际变化，公开覆盖账只用已公布可量化分量，不能读取隐藏 E/私有裁切差异修补公开预测；不可辨认差异仍为预测误差。

重大标记只来自公开版本：S01/M01/S02 为预标重大；O01/O02 的任一受影响公司公开预期参考相对前版绝对变化至少 5% 为重大（分别比较 exp(deltaLog)≥1.05 或≤.95，不能把负向 5% 当作 log(1.05)）；M02 `abs(公开 demandDelta)>=.10` 为重大；I01 默认为 false；I02 update/verify/deny/expire 沿其来源模板条件，但单纯复述且参考未变时 false。适用到合法业务暴露/持仓与同批一次复核、容量不重置仍依精确规则。普通报告的 5% 条件保持原规则。关注固定 .10–.35，正负结果均可增加关注；它不乘经营结果。

文本槽在数据中逐模板列出。title/body 可引用公开对象名、旧/新预期区间、当前置信、已知生效区间、已公开结果与风险；结果槽在 preview/update 时显示“尚未公开”，不得渲染未来分支名或排程。文本需要说明单位（对数经营变化/日增长/融资水平/需求增量）、有符号业务关联、预期不保证成交与结果。本文与数据只供 P0 参数/结构复核，生产引擎的应用一次、公开隔离、恢复和自然市场表现仍在 P3 验收。
