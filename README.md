# 虚构金融市场

浏览器端单人金融策略游戏，以经营配置、事件判断、短线交易和资金执行为核心。正式目标是两个虚构市场、每市100只股票。

目前 P0 已独立验收通过，P1 有限资金交易核心、CLI、固定回放和生产 Worker 黄金核验已实施，待独立验收。黑色交易终端仍为 UI 预览：行情与自选、日/小时 K 线、资产组合、公开资讯和委托预览均使用固定虚构示例，接入自主市场与可玩闭环属于 P2。默认红涨绿跌，可在右上角切换外观，偏好保存在当前浏览器。阶段进度见 [specs](docs/specs/README.md)。

UI 的布局、交互与接入边界见 [界面设计](docs/design/ui-design.md)，本次检查见 [UI 核验记录](docs/verification/ui-preview.md)。自选仅保留于本次会话；外观偏好不是游戏存档。

## 本地运行

使用 Node.js 24 或 26、npm 11 或 12；`.node-version`选用24系列。实际依赖版本由`package.json`及`package-lock.json`锁定。Python只用于已有设计算术检查，启动Web不依赖Python。

在仓库根目录执行：

```sh
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173`。开发服务只监听本机；端口被占用时会明确退出，也可用`npm run dev -- --port 5174`指定另一个端口。

```sh
npm run check
npm run preview
```

`check`执行全部工作区的类型检查并构建Web；产物在`apps/web/dist/`。`preview`用静态构建在`http://127.0.0.1:4173`预览，需要先构建，不等同于公网部署。

单独的`npm run typecheck`可快速检查类型。`npm run check:design`需要Python3标准库。P0数值/接口合同、完整配额样本和图表/Worker技术试验已于第2轮独立验收通过：[独立报告](docs/verification/p0-independent-round-2.md)。`npm run verify:p0`用Node与Python Decimal核验设计/数值/样本；`npm run fixtures:p0`可重建配额/种子，`npm run probe:p0`只在有意更新数值协议时重录黄金。静态预览`/p0-probe.html`及`node tools/p0/browser-probe.mjs`提供真实浏览器复现。

P1 实际运行入口：

```sh
npm test
npm run verify:p1 -- --out artifacts/verification/p1/review
npm run sim:replay -- --input tests/scenarios/p1/cases.json --case A01 --out artifacts/verification/p1/demo
npm run sim:replay -- --input tests/replays/a12-public-decision.json --out artifacts/verification/p1/restore
```

Windows PowerShell 用 `npm.cmd` 转发 `--`。P1 使用生产核心，覆盖 27 个固定场景与 2000 个固定种子的有界穷举/真实账本对照；私有快照和公开投影分别供恢复、决策使用。试验页 `/p1-probe.html` 在真实 Worker 重放同一核心，复跑及输出说明见 [CLI README](tools/sim-runner/README.md)，实际证据见 [P1 实施报告](docs/verification/p1-implementation.md)。自检通过不代表阶段独立验收通过。

## 目录

```text
apps/web/                  浏览器应用、样式与Vite配置
packages/sim-core/         纯TypeScript数值、交易、账本、时钟与快照核心
tools/p0/                 P0配额、数值、浏览器能力试验与核验
tests/scenarios/p0/        冻结配置、种子和合同场景
tools/sim-runner/          P1薄CLI、独立穷举、行为核验和Worker driver
tests/scenarios/p1/        P1有限资金场景与2000固定种子
tests/replays/            完整输出黄金及四个关键安全快照
tools/design-checks/       设计算术脚本，不是游戏模拟器
docs/design/               玩法、精确规则和模型验证
docs/research/             可行性与技术研究
docs/adr/                  重要设计决策
docs/verification/         已实际执行的工程核验记录
docs/specs/                P0–P6的规格、计划、任务与验收矩阵
AGENTS.md                  后续开发的协作与实现约定
CONTEXT.md                 领域词汇
```

P0试验锁定KLineChart9.8.12和单Dedicated Worker；P1完成固定输入交易与CLI，自主NPC和世界预热从P2开始，IndexedDB在对应阶段实施。生成的依赖、构建、实验大文件和个人存档由`.gitignore`排除；源码、锁文件、规格和必要小证据进入版本管理。

## 开发入口

- [协作约定](AGENTS.md)：在开发过程中不做过度设计，适度测试，最小化实现。
- [阶段总览](docs/specs/README.md)与[P0任务](docs/specs/00-design-baseline/tasks.md)：先关闭影响实施的模型合同。
- [总实施计划](docs/specs/implementation-plan.md)：共享边界、未来命令和证据要求。
- [验收矩阵](docs/specs/acceptance-matrix.md)：从需求追踪到任务和验收场景。

初始化采用[Vite官方入门](https://vite.dev/guide/)与[npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/)约定；Node维护状态参见[官方发布表](https://nodejs.org/en/about/previous-releases)。项目实际验证范围记录在`docs/verification/`，官方兼容说明不代替本项目实测。
