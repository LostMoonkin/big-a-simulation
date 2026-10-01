# 工程初始化核验

日期：2026-10-01。范围：工程骨架、目录整理和Git初始化；不代表P0–P6任一业务阶段通过。

## 交付

- npm workspaces组织`apps/web`与`packages/sim-core`；前者为可运行占位页面，后者为纯TypeScript入口占位。
- 已锁定React/React DOM 19.3.0、Vite 8.3.2、React插件6.1.1与TypeScript 7.0.2；完整解析版本见根锁文件。
- 添加根README、AGENTS.md、编辑器/换行/忽略配置，按实际初始化状态更新spec入口。
- 设计算术脚本迁至`tools/design-checks/check_model_arithmetic.py`并修正引用。
- 本地Git使用`main`分支。初始化时发现沙箱账户拥有的`.git`会被普通用户Git拒绝，已保留原空仓库元数据于被忽略的`artifacts/initialization/git-bootstrap/`，并以当前用户重新初始化；用户身份下`git status`正常。没有增加全局信任例外。

## 实际执行结果

环境：Windows，Node.js 26.7.0、npm 12.0.2、Python 3.14.7、Git 2.54.0.windows.1。

| 检查 | 结果 |
|---|---|
| `npm install --no-fund` | 成功生成锁文件；安装输出报告0个已知漏洞，不代表完整安全审计 |
| `npm run check` | 两工作区及Vite配置类型检查通过；Web生产构建成功 |
| `npm run check:design` | 5个清算/分配场景、2,000个断点与穷举对照、配额和分配不变量、2,000个费用上界与舍入反例通过 |
| `npm run dev` | 本机5173端口启动；内置浏览器实际显示“虚构金融市场”和“交易功能仍在开发中。”，无捕获的控制台错误 |
| `npm run preview` | 本机4173端口启动；内置浏览器从静态产物显示同一页面，无捕获的控制台错误 |
| 文档引用 | 新建核验记录前检查37份Markdown、163个本地链接，无断链或未配对代码块；AGENTS.md包含用户指定原句 |
| Git忽略规则 | 依赖、Web构建、artifacts、个人存档目录与`.env`均被排除 |

当前没有业务单元测试，不添加仅验证空入口或固定文案的测试。Node24为项目工具版本文件的选择，本轮实际运行环境为Node26；尚未进行Node24、目标浏览器全矩阵、交易模拟、经济平衡或性能预算验收。已有Python脚本通过不能替代之后的生产内核测试。
