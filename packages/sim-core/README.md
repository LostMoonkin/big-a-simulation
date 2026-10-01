# 模拟核心

纯TypeScript内部工作区。P0已冻结数值协议numeric.ts和能力接口contracts.ts，实施交付待独立验收；尚未实现交易市场。

按[P1任务](../../docs/specs/01-trading-core/tasks.md)与[工程基线](../../docs/design/engineering-baseline.md)实施最小交易闭环。这里不依赖DOM、React、浏览器存储或系统时钟；Web与CLI共用同一核心。数值黄金与界面能力试验不冒充生产撮合。

包当前导出 TypeScript 源码，供仓库内 TypeScript 工具链使用；不构建或发布独立 npm 包。测试随实际交易行为加入，不为空入口编写占位测试。
