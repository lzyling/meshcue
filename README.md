# OpenClaw 3D 模型审阅工作台

**产品定位：Agent 通用 3D 审阅与标注工具。** 面向不同 Agent harness，OpenClaw 为首个适配平台。当前是独立本地网页程序配 OpenClaw 自订接线，尚未封装为 MCP 或正式 Skill，也未完成跨平台解耦。见 [定位说明](POSITIONING.md)。保留现有项目名／目录，新增说明不改变当前运行方式。

**0.2 工作台与 Control UI 侧边交互修复已上线。** 2026-09-09 18:54 用户手动重启后，新后端原生输入与连续画面核验通过，配套 UI 已单次发布。实际安装产物此前通过真正侧栏的旋转、双击标签、画笔、提交和边界操作验收；正式 HTTP 资源与该产物一致。原模型、5 个标记及提交未改。见 [侧栏验收](SIDEBAR-ACCEPTANCE-20260909.md)。

## 现在测试

本机服务入口：<http://127.0.0.1:43173/>。这是运行 OpenClaw 的同一台机器的回环地址，不是其他电脑或手机直接可用的网址。

先刷新**整个 Control UI**，再在右侧「浏览器」打开上述地址。新侧栏已转发连续原生手势并保留画面后台刷新；不需要第二次 Gateway 重启或再次修改地址例外。Control UI 的「浏览器」与「Portals」是不同入口，不能混称嵌入式网页。用户本人的操作体验仍待本次反馈。

Control UI 的 Portal **尚未创建或验证**。此前创建动作被语音确认机制阻止；关闭语音不等于批准该入口，因此本轮没有重试，也没有修改 Gateway／Control UI 或改为公开网络服务。

以下是 **0.2** 操作。已打开旧页的用户，等显示「草稿已保存」后刷新原有分頁；不要新开分頁抢占原草稿。服务不会强制刷新页面。

1. 「双孔支架」参数样例：左键拖动旋转、右键平移、滚轮缩放。
2. 无需切工具，双击模型表面落 1／2／3 或 A／B／C；单击、拖动不落点。画笔跟随笔迹、不填满三角面；画笔模式可按 Option／Alt 拖动临时旋转。
3. 点击「交畀 Agent」；位置标记和当前模型版本被提交到发起审阅的原会话。
4. 回原会话说明怎样修改。Agent 没有足够说明时应先询问，不凭颜色自行修改。
5. 完成本轮后点「结束本轮审阅」。未提交草稿不能结束；新的 Agent 模型只会在释放审阅锁后显示。

想看人偶，可以在原会话让 Agent 按 [操作接口](AGENT-INTERFACE.md) 发布自带的人偶样例或现有 GLB；初版没有用户自行切历史版本按钮。

旧的整面标记原样保留并标明来源；没有足够原笔迹数据，不能自动修复成精确笔迹。新笔迹不会覆盖或冒充旧标记。

Control UI 侧边接入的具体方案与待配置边界见 [接入方案](CONTROL-UI-INTEGRATION.md)。

## 本地运行

需要 Node.js 22、已配置的 OpenClaw CLI、现代支持 WebGL 的浏览器。

```sh
npm ci
npm run samples
npm run build
npm run serve:start
npm run serve:status
```

停止：`npm run serve:stop`。前台运行：`npm start`。开发前端：先启动后端，再 `npm run dev`（仅本机 43175，代理后端 API）。不安装系统自启动服务。

当前主机的原会话绑定已经保存在忽略的 `runtime/config.json`。换机器须由 Agent 用已确认的会话 key 重新绑定；本项目不保存、展示或索取 Gateway 凭据，CLI 沿用主机配置。媒体统一放在 workspace 的 `media/3d/3d-agent-review/`，不会进源代码仓库。

## 验证与文档

```sh
npm test
npm run test:browser
```

浏览器测试会先构建到隔离的 `tmp/refinement-dist`，使用 43174 和临时数据，不更新正式 43173 服务。需要本机 Chrome，以及用于渲染像素检查的 Python/Pillow。常规交互测试使用明确标识的 Gateway 测试替身，另有真实 Gateway 接纳探针，二者的证据分开记录。现有大模型测试依赖本机 `media/3d/` 下的恐龙与 Benchy 文件。

- [项目与已确认方向](PROJECT.md)
- [需求](REQUIREMENTS.md) · [待办](ROADMAP.md)
- [0.2 改进验证、激活与待验收边界](ACCEPTANCE-V02-20260909.md)
- [初版验收、测试截图与限制](ACCEPTANCE-20260909.md)
- [睡醒后的试用指引与交付状态](HANDOFF-20260909.md)
- [Agent 操作接口](AGENT-INTERFACE.md) · [实施记录](IMPLEMENTATION.md)
- [早期调研](RESEARCH-20260909.md) · [上游参考素材](REFERENCES.md)

## 版本与数据边界

项目独立本地 Git，`main` 分支；没有 remote，没有推送。版本库包含代码、需求、测试与文档；不包含 `.env`、`runtime/`、依赖、构建目录、测试运行数据、媒体及原始会话投递 JSON。原始素材和样例源坐标不会被审阅标色写回。

初版仍是审阅工作台，不是完整 CAD／雕刻软件；并不承诺对任意 Tripo 网格自动精修。参数样例用「模型单位」，没有宣称毫米标定或打印精度。
