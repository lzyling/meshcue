# OpenClaw 3D 模型审阅工作台

**初版 0.1 已实现，待用户试用。** 左侧同一个 OpenClaw 会话，右侧单一大模型视窗：GLB／STL、数字／字母点标签、可见表面画笔、撤销重做、草稿恢复，以及不会中途换模型的审阅锁。

## 现在测试

本机服务入口：<http://127.0.0.1:43173/>。这是运行 OpenClaw 的同一台机器的回环地址，不是其他电脑或手机直接可用的网址。

Control UI 的 Portal **尚未创建或验证**。此前创建动作被语音确认机制阻止；关闭语音不等于批准该入口，因此本轮没有重试，也没有修改 Gateway／Control UI 或改为公开网络服务。

1. 已载入「双孔支架」参数样例。左键旋转、右键平移、滚轮缩放。
2. 选择「标签」，点表面落 1／2／3 或 A／B／C；选择「画笔」塗选可见区域，可换色、新建区域、撤销／重做、删除。
3. 点击「交畀 Agent」；位置标记和当前模型版本被提交到左侧同一会话。
4. 在左侧文字输入要怎样修改。Agent 没有足够说明时应先询问，不凭颜色自行修改。
5. 完成本轮后点「结束本轮审阅」。未提交草稿不能结束；新的 Agent 模型只会在释放审阅锁后显示。

想看人偶，可以在左侧让 Agent 按 [操作接口](AGENT-INTERFACE.md) 发布自带的人偶样例或现有 GLB；初版没有用户自行切历史版本按钮。

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

浏览器测试需要本机 Chrome。常规交互测试使用明确标识的 Gateway 测试替身，另有真实 Gateway 接纳探针，二者的证据分开记录。现有大模型测试依赖本机 `media/3d/` 下的恐龙与 Benchy 文件。

- [项目与已确认方向](PROJECT.md)
- [需求](REQUIREMENTS.md) · [待办](ROADMAP.md)
- [初版验收、测试截图与限制](ACCEPTANCE-20260909.md)
- [睡醒后的试用指引与交付状态](HANDOFF-20260909.md)
- [Agent 操作接口](AGENT-INTERFACE.md) · [实施记录](IMPLEMENTATION.md)
- [早期调研](RESEARCH-20260909.md) · [上游参考素材](REFERENCES.md)

## 版本与数据边界

项目独立本地 Git，`main` 分支；没有 remote，没有推送。版本库包含代码、需求、测试与文档；不包含 `.env`、`runtime/`、依赖、构建目录、测试运行数据、媒体及原始会话投递 JSON。原始素材和样例源坐标不会被审阅标色写回。

初版仍是审阅工作台，不是完整 CAD／雕刻软件；并不承诺对任意 Tripo 网格自动精修。参数样例用「模型单位」，没有宣称毫米标定或打印精度。
