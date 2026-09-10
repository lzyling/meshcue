# MeshCue · 正式命名与兼容

2026-09-10 17:14，Kelven明确采纳 **MeshCue** 为正式产品名，并要求完成项目命名修改；GitHub仓库由Kelven创建。

| 用途 | 正式名称 |
| --- | --- |
| 产品名 | **MeshCue** |
| GitHub仓库／npm包名 | `meshcue` |
| 中文说明 | 面向Agent协作的3D模型审阅与标注工作台 |
| 中文一句话 | 在模型上标清楚，让Agent改明白。 |
| 英文描述 | Browser-based 3D review and annotation for agent-assisted modeling. |

Mesh指3D模型网格，Cue指修改提示与指引。品牌不绑定OpenClaw、Telegram或某个建模工具；它是审阅协作工作台，不是完整CAD或另一个独立Agent。

## 已统一

- 页面标题、工作台品牌、页面描述、package.json和锁文件、下载标注／恢复文件的名称、服务启动提示、当前项目主文档。
- 本机源码目录为 `projects/meshcue/`。旧目录名 `projects/3d-agent-review` 是指向新目录的相对符号链接；新旧入口为同一份Git、运行数据及源码，不是复制项目或分叉。
- 历史验收文档、模型manifest、提交和旧侧栏证据不批量重写。正式名称不影响已有版本或审阅数据。

## 特意保留的兼容标识

- HTTP health的 `app: 3d-agent-review` 用于既有启动器和进程身份核对；新增 `product: MeshCue` 表示正式名称。
- 浏览器的 `3d-review-client`／`3d-review-draft-*` 缓存键、cookie名、服务API、Unix IPC、提交消息识别前缀均保持。改品牌不能使浏览器授权、未同步草稿或旧提交丢失。
- 已有 `media/3d/3d-agent-review/` 媒体目录及模型记录中的旧路径继续可用，不移动或复制用户原始模型。
- 已有内网网址、端口、Telegram来源绑定和30天闲置授权规则不变。不创建新授权范围，不撤销浏览器或清锁。

## GitHub准备

仓库建议名 `meshcue`。用户正在自行创建；在收到实际仓库地址前，不猜测owner、不设置remote、不推送。

项目级SSH访问使用独立GitHub Deploy Key；提交给用户的是公钥，添加到仓库 **Settings → Deploy keys**，不是提交到仓库文件或Actions secret。Mac端私钥使用系统钥匙串保管，不进入源码／日志／聊天；这把key与工作台浏览器授权完全无关。
