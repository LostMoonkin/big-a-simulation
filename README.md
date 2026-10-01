# 虚构金融市场

浏览器端单人金融策略游戏，以经营配置、事件判断、短线交易和资金执行为核心。正式目标是两个虚构市场、每市100只股票。

目前完成工程初始化：React + Vite + TypeScript 页面、npm workspaces、模拟核心占位和 Git 基础配置。页面可启动，交易模拟尚未实现；P0设计合同和各阶段验收仍按 [specs](specs/README.md)推进。

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

单独的`npm run typecheck`可快速检查类型。已有设计检查用`npm run check:design`执行，需要Python 3标准库。当前没有业务行为测试，也没有`npm test`、`verify:pN`或市场回放命令；这些随对应阶段实现，不用空测试冒充市场验证。

## 目录

```text
apps/web/                  浏览器应用、样式与Vite配置
packages/sim-core/         纯TypeScript核心占位，暂无交易API
tools/design-checks/       设计算术脚本，不是游戏模拟器
docs/design/               玩法、精确规则和模型验证
docs/research/             可行性与技术研究
docs/adr/                  重要设计决策
docs/verification/         已实际执行的工程核验记录
specs/                     P0–P6的规格、计划、任务与验收矩阵
AGENTS.md                  后续开发的协作与实现约定
CONTEXT.md                 领域词汇
```

按真实功能需要再增加CLI、Worker、IndexedDB、图表和测试；当前不建立通用插件层、服务端或多个行情实现。生成的依赖、构建、实验大文件和个人存档由`.gitignore`排除；源码、锁文件、规格和可复现证据说明进入版本管理。

## 开发入口

- [协作约定](AGENTS.md)：在开发过程中不做过度设计，适度测试，最小化实现。
- [阶段总览](specs/README.md)与[P0任务](specs/00-design-baseline/tasks.md)：先关闭影响实施的模型合同。
- [总实施计划](specs/implementation-plan.md)：共享边界、未来命令和证据要求。
- [验收矩阵](specs/acceptance-matrix.md)：从需求追踪到任务和验收场景。

初始化采用[Vite官方入门](https://vite.dev/guide/)与[npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/)约定；Node维护状态参见[官方发布表](https://nodejs.org/en/about/previous-releases)。项目实际验证范围记录在`docs/verification/`，官方兼容说明不代替本项目实测。
