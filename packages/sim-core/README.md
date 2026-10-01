# 模拟核心

纯 TypeScript 的内部工作区。当前只有入口占位与独立类型检查，尚未实现市场，也未冻结公共 API。

P0 合同定案后按 [P1 任务](../../docs/specs/01-trading-core/tasks.md)引入最小交易闭环。这里不依赖 DOM、React、浏览器存储或系统时钟；Web 与后续 CLI 共用这一份核心。

包当前导出 TypeScript 源码，供仓库内 TypeScript 工具链使用；不构建或发布独立 npm 包。测试随实际交易行为加入，不为空入口编写占位测试。
