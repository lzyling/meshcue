# MeshCue

**在模型上标清楚，让 Agent 改明白。**

Browser-based 3D review and annotation for agent-assisted modeling.

面向 Agent 协作的 3D 模型审阅与标注工作台。2026-09-10由Kelven确认正式名称 **MeshCue**，仓库名及包名统一为 `meshcue`；原开发代号为 `3d-agent-review`。命名与旧路径兼容说明见 [正式命名](NAMING.md)。

**产品定位：在标准浏览器中使用的通用 3D 审阅与标注工具。** 面向不同 Agent harness，OpenClaw 为首个 Agent 适配平台。当前是独立本地网页程序配 OpenClaw 自订接线，尚未封装为 MCP 或正式 Skill，也未完成跨平台解耦。见 [定位说明](POSITIONING.md) 与 [2026-09-10 入口决策](BROWSER-ACCESS-DECISION.md)。

**最新设计：不再适配 OpenClaw／Codex 等内置浏览器。** 用户直接在 Chrome、Safari 等标准浏览器访问工作台，对话仍留在原会话。历史侧栏修复与验收材料保留，但不再是产品使用或发布前提；既有宿主补丁未在本轮移除。

## 0.4 候选：内网授权与原会话接线

**2026-09-10：已在 `feat/v0.4-lan-delivery` 实现 0.4 候选，尚未覆盖正式服务或用户数据。** 新增逐轮原会话绑定、Telegram 显式话题回传、普通内网 HTTP 的 UUID／SHA 兼容、具体私网网卡监听、短期授权与跨话题隔离。隔离浏览器已跑通真实参数改模及新版再审；验收细节及尚待端上核实的项目见 [0.4 结果](ITERATION-V04-RESULTS.md)。

已补[内网定向入场适配](LAN-ADMISSION.md)：Agent 为已核对的客户端 IPv4 创建15分钟一次性许可，普通网页自动领取HttpOnly浏览器授权，没有token输入或Mac配对步骤。**16:32用户确认[长期记住浏览器](BROWSER-TRUST.md)**：30天未实际使用才过期、正常使用续期、重启保留，取代60分钟硬截止。Windows已确认内网页面连通，模型操作及真实Telegram回传仍待端上验收。

## 0.3 交付基线（历史）

**0.3 阶段已收尾（2026-09-10）：用户试用后确认「想要的功能基本都实现了」。同日 14:18 已获准实施 [0.4开发计划](ITERATION-V04-PLAN.md)。** 不把原整体反馈扩大为所有边界情况、其他浏览器或实际改模闭环均已验收；详情见 [发布与试用记录](STANDARD-BROWSER-V03-20260910.md)。

本轮已实现模型优先布局、稳定字母标签／移动／撤销、可收合清单、全局隐藏、精确橡皮擦、近平面油漆桶预览／调节、原色与素色显示、独立 Agent 理解回显、真实提交回执及当前原档下载。旧数字标记和提交不改写，安装包不在本轮范围。

**2026-09-10 已单次启用工作台 0.3，未重启 OpenClaw／Gateway。** 候选哈希、现有模型／草稿／提交保全、独立 Chrome 加载与原档下载已核验；本轮没有在正式数据上新增测试标记或提交。新功能的用户手感仍待试用。旧的宿主下载补丁／配套 UI 发布流程保持停止。见 [标准浏览器发布记录](STANDARD-BROWSER-V03-20260910.md)。

## 现在测试

0.3 既有本机服务入口：<http://127.0.0.1:43173/>。这是运行服务的同一台机器的回环地址，不是其他电脑或手机直接可用的网址。**09-10 开工核对时服务未运行，本轮未启动正式入口。** 0.4 的内网监听与授权核心已实现，但实际 Windows／Telegram 入口尚未交付，不能只换成内网IP就当已可用。

把上述网址放入 **Chrome／Safari 等标准浏览器的地址栏**打开，不放进 Control UI／Codex 的内置浏览器。可将工作台和原会话窗口并排摆放；此入口不需要刷新宿主 UI、配置导航例外或为模型显示重启 Gateway。

Control UI Portal 入口待办已取消。跨 harness 保留的是模型／标注／回显与原会话接线，不是宿主侧栏显示。其他标准浏览器及版本按后续兼容矩阵核验，不宣称已经全部实测。

以下是 **0.3** 操作。已打开旧页的用户，等显示「草稿已保存」后刷新原有分頁；不要新开分頁抢占原草稿。服务不会强制刷新页面。

1. 「双孔支架」参数样例：左键拖动旋转、右键平移、滚轮缩放。
2. 无需切工具，双击模型表面落 A／B／C 字母标签；旧数字标记保留。单击、拖动不落点。画笔跟随笔迹、不填满三角面；画笔模式可按 Option／Alt 拖动临时旋转。
3. 点击「交畀 Agent」；位置标记和当前模型版本被提交到发起审阅的原会话。
4. 回原会话说明怎样修改。Agent 没有足够说明时应先询问，不凭颜色自行修改。
5. 完成本轮后点「结束本轮审阅」。未提交草稿不能结束；新的 Agent 模型只会在释放审阅锁后显示。

想看人偶，可以在原会话让 Agent 按 [操作接口](AGENT-INTERFACE.md) 发布自带的人偶样例或现有 GLB；初版没有用户自行切历史版本按钮。

旧的整面标记原样保留并标明来源；没有足够原笔迹数据，不能自动修复成精确笔迹。新笔迹不会覆盖或冒充旧标记。

旧 Control UI 侧栏过程仅作 [历史接入记录](CONTROL-UI-INTEGRATION.md)，不再按其待办实施配置、部署或重启。

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

首次启动从忽略的 `runtime/config.json` 的 `origin`（旧版为 `sessionKey`）导入来源，随后固定到审阅状态和提交快照；改启动配置不会重定向旧批次。新来源由 Agent 用 `reviewctl bind` 或 `publish --origin` 绑定，见 [Agent 接口](AGENT-INTERFACE.md)。本项目不保存、展示或索取 Gateway 凭据，CLI 沿用主机配置。媒体放在 workspace 的 `media/3d/3d-agent-review/`，不会进源代码仓库。

内网接口发现：`node scripts/reviewctl.mjs network`。`REVIEW_HOST=lan` 只在唯一首选私网网卡时选址，否则要求显式指定已配置的私网 IPv4；不监听 `0.0.0.0` 或公网地址。内网模式强制授权；Agent 按[定向入场操作](LAN-ADMISSION.md)核对目标并签发，不能把监听成功当作用户入口可用。撤销浏览器授权可用 `node scripts/reviewctl.mjs revoke`，不改变模型或草稿锁。

## 验证与文档

```sh
npm test
npm run test:browser
REVIEW_BROWSER_ORIGIN=http://review.test:43174 npm run test:browser
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

项目独立本地 Git；0.4 在 `feat/v0.4-lan-delivery`，`main` 保留开工前基线。没有 remote、没有推送，GitHub 由 Kelven 在本轮后设置。版本库包含代码、需求、测试与文档；不包含 `.env`、`runtime/`、依赖、构建目录、测试运行数据、媒体及原始会话投递 JSON。原始素材和样例源坐标不会被审阅标色写回。

初版仍是审阅工作台，不是完整 CAD／雕刻软件；并不承诺对任意 Tripo 网格自动精修。参数样例用「模型单位」，没有宣称毫米标定或打印精度。
