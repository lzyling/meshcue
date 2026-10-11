# MeshCue · 项目档案

MeshCue 是面向实体生产与机械模型的标准浏览器 3D 审阅和标注工具；仓库／包名 `meshcue`，历史协议标识 `3d-agent-review` 保留兼容。项目始于 2026-09-09，首个公开版本于 2026-09-17 发布。

用户与原会话 Agent 查看同一模型，以点标签、彩色区域、测量和文字表达修改要求。Agent 负责理解、源工程建模与下一版交付，工作台不复制聊天框或替代建模工具。参数化模型与其他来源网格共用流程，保留原文件与可编辑工程；标注期间不强制换版，提交不可变，旧面索引不套到新拓扑。

Three.js 查看器与本地 Node 服务共用核心，OpenClaw 扩充、CLI、MCP 通过实例管理器接入。正式入口是独立标准浏览器，不维护宿主侧栏、截图或下载转发。

## 文档入口

- [已发布版本](ROADMAP.md) 与 [待办](TODO.md)，实际版本以 `package.json` 为准
- [定位](POSITIONING.md) 与 [需求](REQUIREMENTS.md)
- [浏览器入口](BROWSER-ACCESS-DECISION.md)、[长期信任](BROWSER-TRUST.md)、[局域网入场](LAN-ADMISSION.md)
- [命名](NAMING.md)、[版本规则](VERSIONING.md)、[公开参考](REFERENCES.md)
- [Agent 接口](../../AGENT-INTERFACE.md)、[安全边界](../../SECURITY.md)、[安装与数据边界](../../README.md)
