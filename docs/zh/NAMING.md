# MeshCue · 正式命名与兼容

| 用途                | 正式名称                                                            |
| ------------------- | ------------------------------------------------------------------- |
| 产品名              | **MeshCue**                                                         |
| GitHub仓库／npm包名 | `meshcue`                                                           |
| 中文说明            | 面向Agent协作的3D模型审阅与标注工作台                               |
| 中文一句话          | 在模型上标清楚，让Agent改明白。                                     |
| 英文描述            | Browser-based 3D review and annotation for agent-assisted modeling. |

Mesh指3D模型网格，Cue指修改提示与指引。品牌不绑定OpenClaw、Telegram或某个建模工具；它是审阅协作工作台，不是完整CAD或另一个独立Agent。

## 已统一

- 页面标题、工作台品牌、页面描述、package.json和锁文件、下载标注／恢复文件的名称、服务启动提示、当前项目主文档。

## 特意保留的兼容标识

- HTTP health的 `app: 3d-agent-review` 用于既有启动器和进程身份核对；新增 `product: MeshCue` 表示正式名称。
- 浏览器的 `3d-review-client`／`3d-review-draft-*` 缓存键、cookie名、服务API、Unix IPC、提交消息识别前缀均保持。改品牌不能使浏览器授权、未同步草稿或旧提交丢失。
- 已有内网网址、端口、Telegram来源绑定和30天闲置授权规则不变。不创建新授权范围，不撤销浏览器或清锁。

正式仓库：[lzyling/meshcue](https://github.com/lzyling/meshcue)。正式产品名 MeshCue，仓库与包名 `meshcue`，维护者于 2026-09-10 确定。
