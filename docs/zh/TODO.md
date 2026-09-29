# MeshCue · 待办

**`lzyling/meshcue` 已公开**，Apache-2.0，默认分支 `main`。
首个公开版本 **1.0.0**（Kelven 2026-09-17 定），此后 1.0.1、1.0.2、1.0.3 均已发布；
推 `v*` tag 即自动建 Release。当前版本以 `package.json` 为准，**不要从本文件推断**。

> 这段原本写着「这个仓库到今天为止一次都没有公开过」，并且在转公开之后又挂了两天。
> 它是 2026-09-19 被当成「文档宣称的 ≠ 实际的」这一类顺手改掉的 ——
> 同一轮里 README 那句「63 个浏览器用例」也被抓到（实际 68），
> 而那句现在有断言钉着（`tests/docs.test.mjs`），这句没有。**首行状态靠人记。**

<details>
<summary>转公开那段的两条教训（历史，做完了，留着是因为坑还在）</summary>

🔴 **force push 清不掉历史**：远端当时有 5 个 dependabot PR，GitHub 的 `refs/pull/*/head`
**永久保留、仓库所有者也删不掉**。实测：带 `FIELD-NOTES-20260913.md` 的老提交 `9b8e627`
从 `refs/pull/1/head` 可达 —— force push 只动 `main`，那些日志照样能被 fetch 出来。
所以当时必须删仓重建，不是洁癖。

🔴 **私有仓下未认证的 GitHub API 一律回 404**，不是 403 —— 它连仓库存不存在都不告诉你。
别拿那个 404 当「仓库没了」；判存活要用 deploy key 跑 `git ls-remote`。
本文件 §0.15 早就写过这条，我自己还是踩了。

</details>

0.14 那一节写的是把仓库从私有推到公开要做的事，当天已按计划整节删除 —— 那些事**确实做完了**，
删的是清单不是成果。它做掉的：内部阶段日志移出仓库、清理陈旧分支、加 CI 与 issue 模板、
三份安全文档逐条对代码复核、`files` 白名单 + `prepare` 构建（在此之前装了这个包
审阅页面是空的）、以及把 README 里指向一个**我们并不发布**的 npm 包的安装说明改掉。

公开前最后一轮补的是**别人的 Agent 拿得到什么**（Kelven 2026-09-16 15:42 要求）：

- `AGENT-INTERFACE.md` 新增 **Installing it** —— 在此之前，两份 Agent 文件里
  `install`／`npx`／`npm` 各出现 **0 次**，而 SKILL.md §2 正确地要求「工具不在就说清楚缺什么，
  绝不猜命令」。Agent 会正确地停下来，然后无据可查。
- 🔴 **`inspect` 只在 OpenClaw 适配器里存在。** SKILL.md §2 要求每个宿主都先调它：
  CLI 回 `BAD_USAGE`，**MCP 更糟 —— 它落进管理器，回的是 `PROJECT_REQUIRED`
  「请指定一个建模项目」**，工具在回答一个没人问过的问题，而 Agent 还在找自己在哪。
  已下沉成 `inspectInstall()`，三个入口共用，返回里带四份文档的**绝对路径**。
- **审阅者操作知识以 i18n 为单一来源**：帮助面板那 9 段原本只活在 `src/i18n/en.js`
  （`eraser`／`bucket`／`orbit`／`undo` 在两份 Agent 文件里各 **0** 次）。
  `scripts/sync-reviewer-help.mjs` 把英文目录逐字写进 `AGENT-INTERFACE.md`，
  `tests/docs.test.mjs` 在两者漂移时让构建变红。
  **方向是 i18n → 文档，不能反过来**：面板是这些句子唯一被翻成六语的地方，
  而文档不可能是一份翻译的源头。
- 另一条同类断言：文档里写死的安装 tag 必须等于 `package.json` 的版本 ——
  发版日最容易悄悄过期的就是这行字。两条断言都**故意弄坏验证过会红**。

0.12.0 是四条界面修改意见；0.13.0 是第五条（版本标签栏太长）；
0.13.1 是重启后第一通 `retain` 撞出来的两条。

这份是「接下来做什么」的唯一清单。做完的整段在版本发布时移进 `ROADMAP.md`（历史记录），
版本号怎么定见 `VERSIONING.md`。没有归属版本、也还没想清楚的，一律进最后那节，不要散落在别处。

> 下文用反引号写、没有做成链接的文件名（`ITERATION-*`／`ACCEPTANCE-*`／`HANDOFF-*`／`SIDEBAR-*` 等）
> 是开发期的阶段日志，2026-09-15 已移出仓库，留在开发者本地。引用它们只是为了说明某项决定的出处。

---

## 🗺️ 版本规划（Kelven 2026-09-25 01:13 定，01:18 调整顺序：原定 1.4 不动，GLB 起依次顺延）

> 依据当晚的 GLB 缺口排查（服务端 `inspectModel` 的 GLB 规则、查看器加载逻辑、three 0.180 `GLTFLoader` 的 22 个扩展）。
> 版本号最终仍按 `VERSIONING.md` 在发版提交时判定；这里定的是顺序和范围。

**1.4.0 · 审阅者的意图传到 Agent（原定，不动；01:55 加入测量）**
- 相机 up（最好连 FOV）写进提交，并给出模型坐标／单位下的相机 —— 见「审阅者的『上』传不到 Agent」。
  **09-29 改为每个标记各记一份视角**（up 已恒为 +Y，改传屏幕上方），见下「1.4.0 · 开工前扫描」待拍板②。
  ✅ **09-29 第二轮已做**（标记的 `view` 字段，见下「相机」条）。
- 标记加一段可选文字，随提交回传；定好它和聊天口述的先后与冲突。**09-29 已定**，见待拍板①。
  ✅ **09-29 第二轮已做**（标记的 `note` 字段，见下「标记文字」条）。
- **测量**（Kelven 2026-09-25 01:55 采纳；他早先也想过、一直没提）：点到点、边长、面到面距离，吸附到顶点／边／面，
  尺寸标在页面上；量出来的数可以附在标记上（「这里改成 22 mm」），随提交以模型单位回传。
  **09-29 改**：留下的测量本身就是一个标记，不挂到 pin／区域上，见待拍板③。
  ✅ **09-29 第四、五轮做完**（四种测量＋留下成标记；STEP 按文件自己的面，见下「测量」条）。
  参照：manifold3d-mcp 09-20 合并的测量（点、直边、平面中心、相连平面片），见 `documents/meshcue/competitors-20260925.md`。
- 顺带（小项，不等 GLB）：文档写明「STL 一律灰，要颜色发 STEP 或 GLB」；库给回的中文零件名乱码；
  morph targets 服务端放行、页面拒的不一致 —— 先改成服务端直接拒并说明，真正支持留给 1.5.0。

**1.5.0 · GLB 完整支持**（「任何合规 GLB 都能打开，并按作者意图显示」）
- A1 压缩：Draco、Meshopt、`KHR_mesh_quantization`、KTX2／BasisU 贴图 —— 现在 `extensionsRequired` 白名单一律拒。
- A2 骨骼角色：按绑定姿势显示（不播放），标记照旧落在面上 —— 现在服务端、查看器都拒（`ANIMATED_MODEL`）。
- A3 morph targets：显示基础形状。（现存的放行／拒绝不一致在 1.4.0 先改成一致地拒。）
- A4 `EXT_mesh_gpu_instancing`：展开成普通网格，受 60 万面约束。
- A5 贴图预算：3355 万像素＝两张 4K，一套 4K PBR 就超；改按显存估算（KTX2 小得多）。
- A6 `EXT_texture_webp` 列为必需时被拒（WebP 图本身放行，前后矛盾）；AVIF 贴图。
- A7 `.gltf`＋外部文件：服务端代为打包，或文档写明先打包成 GLB。
- A8 非三角图元：跳过线／点，三角带／扇转普通三角形 —— 现在整个模型拒。
- B9 忽略文件自带的 `KHR_lights_punctual` 灯光（会叠进标定灯光，未实测影响）。
- 顺带：three 升级（先查 0.186 切 STL 后残留 1 张贴图；解码器跟 three 版本走，所以放这版）。

**1.6.0 · 显示保真（B 类）**：动画只显示初始姿势；同一 GLB 里多级 LOD 叠在一起；`KHR_materials_variants` 只显示默认。

**1.7.0 · 游戏美术审阅功能（C 类）**：UV／棋盘格、按通道看（颜色／法线／粗糙度）、分网格面数、节点树显隐。

**2.0.0 · 动画播放**：让 MeshCue 播放绑定好骨骼的动画，能逐帧看（选片段、播放暂停、拖时间轴）。
动画随 GLB 进来 —— glTF 本身就带骨骼和动画片段；别的格式按「朝向不对由 Agent 先转换」同一原则，
由 Agent 先转 GLB（这句是我的建议，未定）。标记要不要带时间／帧，是这版真正要设计的；
若它改了标注契约，正是跳 major 的理由。


---

## 1.4.0 · 开工前扫描（2026-09-29 01:2x–01:4x，只读，代码未动）

> 按「先扫全、出清单、再批量做」。三路只读扫描，关键几处人工复核过（标「未核实」的没有）。行号以 v1.3.2 为准。

**实测后两处修改（Kelven 2026-09-29 17:42 装 1.4.0-dev 实测后提出，发版前做）** —— ✅ **09-29 18:07–18:5x 两处都做完**
（① `897f751`、② `bbbd054`，dev 已推，CI 绿）；开发包 `tmp/candidate-140-bbbd054/package` 冒烟 11/11。
**装包**：19:08 等因子工人 19:00 那期跑完、查无其他活动会话后，`openclaw plugins install <绝对路径> --force --accept-capabilities` 一次成功
（Applied in Gateway generation 3）；装后目录与包逐字节相同，openclaw.json 哈希前后一致，新增日志 0 条 reloaded or disabled，
`meshcue inspect`／`memory_search` 仍可用。旧包备份 `tmp/meshcue-plugin-1.4.0-dev-a215b5b-backup-20260929`。**等 Kelven 手动重启后实测**：
重启后要先 `open` 验收项目，实例才换新构建；再交一批看话题里的即时回执和读后改已读、回显只描边、页面状态块。
本机 node 288 条 287 过 1 跳过、浏览器 91 条 90 过 1 跳过（跳的是要真局域网的 LAN HTTP 那条）；`897f751` 单独在临时工作树跑 node 281 条 280 过 1 跳过。
1. ✅ 回显不能盖住审阅者的标记 —— **17:45 同意**：
   - 规矩（AGENT-INTERFACE、SKILL、推送消息都写）：回显的区域只标「准备要改的位置」，且只在审阅者提了修改之后才标；
     标不准就只用文字，不硬标；不把审阅者自己的标记原样再画一遍。起因：POP 在无修改要求时把他的红色区域原样 echo 成黄色。
   - 画法：回显区域改为只描黄边、不填色，并画在审阅者标记之下（原为 `#f5dc72` 整片填充、renderOrder 5，审阅者标记是 3，桶预览 4）。
   - ✅ **做完**（`897f751`）：`src/outline.js` 算区域外边界——多边形的每条边按它所在的载边（源三角形的边，两端精确坐标作键，相邻三角形正好共用）归组，
     载边上被覆盖一次的段是轮廓、两次就在区域里面；不在任何载边上的边（切过面的）一律是轮廓。按审阅网格索引的旧标记（brush-v1、无 coverage）再加审阅三角形作载边。
     查看器把每段轮廓画在它所属多边形自己的三角形上，着色器只留离这段线 3.5 CSS 像素内的片元（屏幕空间，斜看同宽，段与段圆头相接不断开），
     线在区域内侧；层级 2、不写深度，审阅者标记（层级 3）盖在上面。每个回显区域单独描边。标记材质的 agent 分支删了。
     测试：node `outline.test.mjs` 5 条；浏览器 `echo.spec.js` 1 条（平板顶面涂红，回显「顶面＋正面」：顶面中心仍是红、正面中心不填黄、
     正面边上有黄边且不到面积三分之一）——旧代码上先跑过，顶面中心 178 个黄像素，红。截图 `tmp/screenshots/2026-09-29-echo-outline.png` 核过。
2. ✅ 收到标记后先在原对话回一句 —— **17:49 同意，并要求适配 Claude Code、Codex（主流用户在那边）**。按工具分三层：
   - 通用（页面）：提交后页面马上明确显示「已送出 N 个标记 · 等待 X 读取」→「X 已读取」→ 回显；对不能推送的工具（Claude Code 未开 channels、Codex、CLI），
     页面直接告诉审阅者下一步「回到 X 的对话说一声」，并给一键复制的一句话（带项目和批次编号，Agent 拿到就能读）。
   - OpenClaw：桥在送达时用官方 `openclaw message send` 发回执，读取后 `openclaw message edit` 改成已读。
   - Claude Code channels（研究预览）—— **Kelven 18:05 定：不进 1.4.0，列入后续版本再做**：MCP 服务可把消息推进正在运行的会话（code.claude.com/docs/en/channels）；
     预览期 `--channels` 只收 Anthropic 名单上的插件，自家插件要申请进名单或用 `--dangerously-load-development-channels`；
     Team／Enterprise 还要管理员开 `channelsEnabled`。这正是下面「搁置 · 回传的触发机制」在等的新思路。
   - Codex：暂未查到能从外部推进会话的机制（未核实），只能靠通用层。
   原记录：交标记后要等大模型读完才有回复，对话里几十秒到几分钟无反馈。
   可用官方出站命令 `openclaw message send --channel telegram --target <chatId> --thread-id <topicId> --json` 由桥直接发回执，
   Telegram 还支持 `openclaw message edit` 在读取后改成已读；不经过大模型。只有 OpenClaw 有推送桥，MCP／CLI 无此问题也无此回执。
   - ✅ **第 1、2 层做完**（`bbbd054`）：
     - 页面：按钮下两行——「已送出 N 个标记 · 等待X读取」→「已送出 N 个标记 · X已读取 · 18:32」（加粗）；第二行在能推送的宿主上是送达情况
       （已送达原对话／已接纳投递待确认／投递未确认会重试），读取后「X的理解会显示在模型右下角」，回显到了变「X的理解已在 18:33 送到，见模型右下角」。
       收不到推送（状态 `notifier.send` 为假：MCP、CLI、REVIEW_BRIDGE=off）且未读时，下面多一块黄底提示
       「X收不到自动通知，请回到它的对话里说一声，可以直接粘贴这句：」＋那句话＋「复制」，读取后自动收起。
       那句话用审阅者页面语言：「我在 MeshCue 交了 N 个标记，请用 meshcue read 读取：project …，submissionId …」（状态新增 `project`＝受管时
       Agent open 用的项目路径；没有项目时只带批次号）。复制先用剪贴板 API，局域网 http 页面没有就退到 `execCommand("copy")`，都不行就选中那句话并提示。
       窄屏（≤760px）有提示时面板上限 250px，说明框同时开着 330px。提交记录新增 `markCount`、`locale`（只收有目录的语言）。
       旧键 `feedback.saved`、`feedback.waiting` 六语删掉；新增 `feedback.sentCount`、`receipt.*`、帮助第 11 段（已 sync 进 AGENT-INTERFACE）。
     - OpenClaw：`server/receipt.mjs`。chat.send 被接纳后，用 `openclaw message send --channel telegram --target <chatId> --account <accountId>
       --thread-id <topicId> --message … --json` 发「📐 已收到 6 个标记（M1–M4、A、红色区域），已交给爆爆（OpenClaw），正在读取……」
       （审阅者页面语言；文案在六语目录里，服务端经新纯函数 `sentence()` 取；三个以上连号写成区间、重名区域计数、超 8 项省略、
       名字只留字母数字空格连字符），messageId 记在批次 `chatReceipt`；Agent `read` 写回执时 `openclaw message edit --message-id` 改成
       「……爆爆（OpenClaw）已读取，正在理解……」；读取早于发出就等发完再改，只改一次。只有 Telegram 路由有；webchat（Control UI）、
       MCP／CLI、sealed 批次没有。失败只记日志（`[receipt]`），不重试、不影响送达和读取。
       **未核实**：`--json` 输出顶层 `messageId` 是按 OpenClaw 2026.9.5 源码 `buildMessageCliJson` 核的（dry-run 只验了命令形状、约 8 秒），
       真机 Telegram 发出与编辑没跑过，要重启后实测。
     - 服务端取文案：`src/i18n/index.js` 加 `sentence(locale, key, vars, name)`（`ta` 改用同一个 `withName`）；`package.json` files 加 `src/i18n/`
       （npm 装法的服务端要 import 目录；OpenClaw 包由 esbuild 打进 runtime）；`check-i18n` 也数 `server/*.mjs` 里的键引用。
     - AGENT-INTERFACE「Delivery status」、SKILL §6 教 Agent：收不到推送时审阅者贴过来的那句话就是通知，拿 project＋submissionId 直接 read；
       OpenClaw 那行回执是服务写的，不代替自己读完后的回复。
     - 测试：node `receipt.test.mjs` 7 条（文案、列表、路由、Telegram 发出＋读后改一次、发不出不影响批次、webchat 与 sealed 不发、状态带 project）；
       浏览器 `receipt.spec.js` 3 条（能推送：三步文字；收不到推送：中文提示、那句话、复制进剪贴板、读后收起；无剪贴板 API 的退路＋420px 窄屏都在面板内）。
       测试替身 `fake-openclaw.mjs` 认 `message send|edit`，记在单独的 `fake-messages.json`（和网关状态文件分开，并发时不互相覆盖）。
       截图核过中文 1440 宽、420 宽（`tmp/screenshots/2026-09-29-receipt-zh-*.png`）。

**09-30 重启后验收（网关 09-29 19:18 重启；02:00 `open` 把验收实例从 `1a736f03` 换成新构建 `1df40004`）**
- ✅ 话题回执真机跑通，上面「未核实」解除：第一批（`537e7e31`）02:03:19 交出 → 20.9 推送到会话 → 32.2 回执发出（消息 31701）→ 41.1 read →
  49.6 改成已读。第二批（`65f767ff`）在 Agent 还在回上一批时交出，回执 11.5 秒后先到——正是它要解决的场景。
- ✅ 回显规矩：第一批只有 B「test」，回显只写文字、不画区域；第二批 C「角尖啲、R 细啲」、D「面薄啲」，回显描出两个 B-rep 整面
  （面 7＝顶边 R2 包俯视 R4 转角的环面，面 48＝镜头孔外圈 Ø9.80～Ø15.05 环形台阶），文字里问清 R4／R2、几个角、目标值。**描边观感等 Kelven 看页面确认。**
- 发现 1（待 Kelven 定要不要进 1.4.0）：回执比推送晚约 11 秒。网关 `message.action` 只用 1.1 秒，其余是每次冷启动 openclaw 命令行；
  Agent 回得快时回执会落在回复之后。候选：插件进程内直接发（要先查官方插件 API 有没有出站发送）。
- 发现 2：推送时 Agent 正忙、消息排队，`observe` 只在接纳后查一次会话历史，查不到就一直不标 `deliveredAt`，页面停在「已接纳，投递待确认」直到读取。
  不会重发（状态仍是 accepted）；1.4 之前就这样，不是回归。可改成读取时补标，或稍后再查一次。
- **02:29 Kelven 定：进度反馈不再加**（他认为交标记后的即时回执已经够好；我提的 a 回执三步、b 页面计时、c 初步回显、d 网关内直发都不做）。
- **回显视觉改版（Kelven 02:19 提、02:29 同意先做样子）**：回显和人类标注本质上都是「给三角面上色」，分不开；回显黄 `#f5dc72` 还和调色盘黄
  `#e6b64b` 同色系，且画在人类标注（不透明度 0.83）之下，重叠时几乎看不见。方案 A：回显改为浮在表面上的青色流动虚线（`LineSegments2`，
  深色衬底＋半透明光晕，按屏幕像素定虚线长度，逐帧改 `dashOffset`），画在人类标注之上但只占线宽；新回显光晕闪两下；「减少动态效果」时静止；
  右下角文字前加同款虚线图例，面板改青色系。**这与 09-29 定的「画在标记下面」相反**，理由已向他说明（一条细线比被盖住更能两边都看见）。
  样子在分支 `echo-flow-proto`（工作树 `tmp/wt-echo`，`987eabb`，未推送），独立服务 http://10.2.11.1:63470/（不经网关、不用重启）。
  自查：浅色／深色、重叠处两者可见、虚线在动、减少动态时静止；光晕加宽会在曲面边上露出网格锯齿，已改为只变亮。页面本来就逐帧重绘，动画不额外耗显卡。
  **等他看效果再定用不用**；用的话要补：旧测试 `echo.spec.js`（按黄色像素判断）改写、帮助／AGENT-INTERFACE 里「黄线」的说法、截图核对。
- 顺带：回显整面要 Agent 自己解析 GLB `extras.brepFaces` 换源三角形范围（顺序与 build123d `faces()` 一致，本次核过；脚本 `tmp/meshcue-140-test/echo_regions.py`），
  印证下面「锚点能力单独立项」的价值。`server/step.mjs` 那句「Nothing reads it yet」已过时（测量在读），发版前顺手改。

**版本判定**：标记文字、相机新字段、测量都做成**可选的新增字段**，`camera.position／target` 保留现在的预览坐标含义，
不动 `label`，不升 `schemaVersion` → **minor**（先例：1.3.0 加 `bounds.space` 没升号）。
会逼成 major 的做法：把 `camera` 原地改成模型坐标、改 `label` 含义、新字段设成必填、升 schemaVersion。
**降级风险写进发版说明**：1.4 写过文字的草稿退回 1.3.x 后一编辑就 400（旧页面把 note 原样发回，pin／区域 schema 是 `.strict()`）；
旧版 read 会悄悄丢掉 note。
带测量标记（第四轮起）的草稿退回 1.3.x 更糟：旧页面画标记时按区域去读 `faces`，直接抛错；旧服务端存稿 400。

**相机 —— 原计划的前提已经过时**
- 1.3.1 修方位立方体轨道之后，`camera.up` 恒为 +Y（`src/viewer.js:454`；顶／底视角靠 `POLE_OFFSET = 1e-4` 偏开极点，`:47`）。
  **存 `camera.up` 没有信息量**，本节下方「审阅者的『上』」那条的写法要按这里改。
- 该传的是：屏幕上方在模型里指向哪（`screenUp()`，`src/viewer.js:332`，现在只进诊断钩子 `src/main.js:1734-1738`）、
  FOV（固定 38°）和宽高比，以及模型坐标／单位下的 position／target。单位用现成的 `model.units`。
- 预览坐标＝模型缩到最长边 3 单位再居中，STEP／STL 在 root 上绕 X 转 −90°（`src/viewer.js:540-563`）。
  普通 GLB 的节点变换服务端不解析，所以换算放客户端，照 `annotationBounds`「只合成到 root」的做法。
- 采样时机：相机只在编辑保存时记（`src/main.js:631`），点 Send 时不更新，整批只有一份 → 待拍板 ②。
- ✅ **09-29 第二轮做完**：每个 pin／区域可选 `view: {space:"model", position, target, up, fov, aspect}`，
  `viewer.markView()` 把相机逆算到 root 之下（即 `bounds` 同一坐标系），`up` 是屏幕上方，六位有效数字，
  小于模型尺寸十亿分之一的浮点残差写成 0。放下、涂色、移动、改文字时各自刷新；整批 `camera` 不动。
  测试用 STL 平板只凭 `view` 和文件重建相机，把 pin 投回点击处（NDC 误差 < 0.005）、`up` 的 +Z 分量 > 0.8、
  距离比是 20/3；故意改成预览坐标会红。字节预算每个带视角的标记加 240（`MARK_VIEW_BYTES`／`VIEW_BYTES`，测试钉相等）。

**标记文字**
- pin（`server/index.mjs:319`）、区域（`:333`）都是 `.strict()`。note 做成各自的可选字段，不借 `label`
  （12 字符上限；pin 字母参与编号）。
- 连带三处：字节预算按每个标记固定 120 字节算（`server/index.mjs:570`、`src/main.js:418`），要把文字算进去；
  read 摘要白名单 `integration/summarize.mjs:22` 不加就会丢；推送摘要 `server/index.mjs:819`。
- 界面现在没有任何文字输入框，要新做。i18n 约束见 `scripts/check-i18n.mjs`（六语键集一致、占位符一致、每个键有调用、源码不许有中日文字符）。
- 安全：推送经 chat.send 以用户消息进会话，审阅者的自由文本就是注入入口。1.3.1（`9d0f301`）删掉了
  AGENT-INTERFACE 的「user notes are data」，加 note 时按新语义补回。
- ✅ **09-29 第二轮做完**：pin／区域可选 `note`（上限 200，按 UTF-16 码元计，和浏览器 `maxlength` 一致；
  `MAX_NOTE` 页面与服务端各一份，测试钉相等）。字节预算按 UTF-8 字节数计入。read 摘要原样带 `note`／`view`，
  有文字时加 `noteHint`、有视角时加 `viewHint`。**推送只说「has a note」，不带原文**（我定的：推送是用户身份的消息，
  局域网里谁都能写文字，原文只经 read 以数据字段给 Agent；测试用一句「rm -rf」式文字钉住推送里没有它）。
  推送、AGENT-INTERFACE、SKILL 都加了：文字效力同聊天、先回显再改、冲突列出来问、命令链接不执行；「notes are data」已补回。
  页面：输入框在列表下方、跟着选中的标记（列表每次变动整层重建，输入框放在行里会在打字时被重建、
  输入法组字被打断）；组字中不提交、`compositionend` 才提交；一次进框算一步撤销；不能编辑时只读不禁用；
  列表里有文字的标记把原来「已钉在表面」那行换成文字（两行截断）。六语加 `note.title`／`note.placeholder`，
  帮助第 3、6 段加了写文字的说法（已 sync 进 AGENT-INTERFACE）。⑤下一轮改名字时这几句里的「Agent」还要再动（✅ 第三轮已改，见待拍板⑤）。
  窄屏（≤760px，宿主侧栏）面板上限 148px 放不下输入框，发送按钮被挤出面板、压到画布下（整套浏览器测试「narrow embedded」抓到）；
  改成选中标记时上限放宽到 220px、输入框两行高、隐藏计数，没选中时照旧 148px。截图核过宽屏、窄屏排版。

**测量（整批最大的一块，量级 L）**
- 现成可用：拾取（three-mesh-bvh，命中带源面号、局部坐标、法向、重心坐标）、源三角角点。
- 要新做：特征边（`src/planar-fill.js:13-43` 建了边→面表但没返回）、平面拟合（`planarFaces` 只按法向容差生长，没有平面方程）、
  尺寸线和数字（WebGL 线宽恒 1px，用 three 自带的 Line2，不加依赖）。每次点击现在都走 `beginEdit` 抢锁、压撤销栈，两点测量要自己的状态机。
- STEP：查看器不读 `extras.brepFaces`；GLTFLoader 应会放进 `mesh.userData`（未核实）。能给精确的面归属和面分界，给不了曲面类型／半径。
- 表示：建议做成 annotations 的第三种类型（撤销、自动保存、清单、隐藏、删除都现成），代价是约十处「不是 pin 就当 region」的分支要改；
  附到标记用可选引用字段。
- 单位：沿用「不假设单位」，没标单位的 GLB／STL 显示裸数并注明未标。
- ✅ **09-29 第四轮做完上半**（`9e471ec`：点到点、边长、两个面，外加「留下」成标记；本机 node 264 条 263 过 1 跳过、浏览器 85 条 84 过 1 跳过）：
  - 工具：工具栏加「测量」，选项条三种（点到点、边长、两个面），旁边是读数和「留下」。测量不抢编辑锁、不进撤销栈、不碰草稿；
    出结果后再点一次、换种类、换工具、按 Esc、换版本都会清掉。审阅者不能编辑时（比如被别的标签页占着）也能量，只是「留下」不可用。
  - 几何（`src/measure.js`，全部按模型坐标和单位，读 `fillTopology` 里的原始三角形；`planar-fill.js` 没改，边→面表不返回，按顶点扇面局部走）：
    - 点到点：点在三角形角点 10 像素内就取角点（悬停时实心绿点＝会吸附，空心＝点在哪量哪）。
    - 边长：两侧面法向夹角 > 30° 算棱边（STEP 网格化角偏差 0.5 rad≈28.6°，阈值压在它上面，圆柱面上的拼缝不算），开放网格的边沿也算。
      沿共线（< 0.5°）的棱边往两头接，遇到第三条棱边（角点）停。曲边：两头都以 < 40° 转弯接下去、且这段不比邻段长 1.5 倍以上 → 当作曲线的一小段，拒绝并提示「这条边是弯的」。
      跑道形的长直边、六棱柱的边都判为直边（单测钉住）。
    - 两个面：从点中的三角形按 2° 法向容差生长，面积加权法向＋面积加权中心得平面；两面夹角 ≤ 0.5° 算平行，给间距（两次点击各自先投到自己的平面，再沿平均法向量），
      否则给两平面夹角（0–90°），同时存两面外法向，让 Agent 分得清倒角和 V 槽。第二下点在同一个面上会提示换一个面。
  - 显示：Line2 画尺寸线（白光晕＋深色芯线，画在模型上面不被遮挡），读数标签在线的中点；两个面的测量把两面着绿色（不带斜纹，和标记区分）。
    数字按审阅者的语言格式化（德语「12,40 mm」）；mm 两位小数；未标单位显示「20.00（单位未标）」——沿用界面已有的「单位未标」措辞，没另写一个「未标单位」；
    其他声明单位 ≥ 1 两位小数、< 1 三位有效数字；角度两位小数。
  - 留下：成为 `type: "measure"` 的标记，编号 M1、M2（现有最大号 +1），和 pin／区域一样能写文字、撤销、删除、随提交发送，带逐标记视角。
    字段：`kind`（points／edge／planes）、`quantity`（length／angle）、`value`、`space: "model"`、`points`（尺寸线两端）、`picks`（每端所在源三角形）、planes 另有 `normals`。
    不设目标值字段、不做 pin／区域引用，不升 schemaVersion。
  - 服务端：schema `.strict()`；`checkMeasure` 要求记录自洽——种类和 picks／normals 个数对得上、长度等于两点距离（容许六位有效数字舍入）、只有平行才是长度、
    夹角等于法向夹角、picks 指向模型里有的三角形；不自洽回 400 `BAD_GEOMETRY`。字节预算每条测量加 480（页面 `MEASURE_BYTES`＝服务端 `MARK_MEASURE_BYTES`，测试钉相等）。
    推送一行「M1: measurement, 20 mm point to point, from … to … — has a note」，并说明测量本身不要求改动、目标看文字或聊天、回显按「从 X 到 Y」；
    read 摘要整条带上并加 `unit`（mm／unspecified／degree）和 `measureHint`；summary 的 manifest 算进 picks 所在网格。
  - 约十处「不是 pin 就当 region」的分支都改了：viewer 的 serializeAnnotations／setAnnotations／focusAnnotation／placePins，main 的列表行（徽章 M1、标题＝读数、
    说明＝种类、选中不改调色板、删除／定位的名字）、说明框标题、字节预算，服务端 validateAnnotations 的 groups／claimed、推送摘要、read 摘要、manifest。
  - 六语各加 20 键（工具三条、三种、三条提示、两条读数提示、留下两条、三条拒绝、`measure.kinds`／`measure.name`／`measure.unitless`、帮助第 10 段），
    帮助对话框里放在油漆桶那段后面，已 sync 进 AGENT-INTERFACE；都没提到 Agent，不需要 `.named`。AGENT-INTERFACE「Reading marks」加测量一条和「测量本身不要求改动」一段，SKILL 第 6 节加一段。
  - 测试：node 新 11 条（`measure.test.mjs` 7 条几何、`measure-marks.test.mjs` 4 条服务端）＋预算常量多钉一对；浏览器新 3 条（`measure.spec.js`，20×15×8 mm 平板：
    角点吸附量出 20.00 mm、边长 20.00／8.00 mm、两面 90.00° 和翻到底面量出 8.00 mm、全程草稿不动；留下成 M1、写文字、撤销重做、发送后推送里有那一行；未标单位显示「20.00 (no units)」）。
    截图核过英文宽屏、中文窄屏、中文帮助。
- ~~留给第五轮~~：STEP `extras.brepFaces` 精确面／面分界吸附；三点定圆（孔、轴的直径和圆心）。第四轮顺手记下的边角：
  没做读数标签避让（两条尺寸线的读数可能叠在一起）；小于 30° 的浅倒角边量不了边长（改用点到点）；在曲面上点「两个面」得到的是一条窄带拟合出的「平面」（着色看得出来，STEP 精确面后改善）。
  → 第五轮全部做了，见下一条；GLB／STL 上后两条照旧（按网格，没有文件自己的面可用）。
- ✅ **09-29 第五轮做完下半**（`0e040b3`；本机 node 268 条 267 过 1 跳过、浏览器 87 条 86 过 1 跳过）：
  - 核实：`server/step.mjs` 写的 `extras.brepFaces` 是每个 B-rep 面一段 `[first, last]` 三角形编号，按顺序连续、铺满整个网格
    （plate.step 11 面／344 三角形，另抽 6 个本机 STEP 共 5 千多三角形都对得上）；three 0.180 的 GLTFLoader 把 mesh 的 extras 原样
    `Object.assign` 进 `mesh.userData`（`assignExtrasToUserData`，单图元时 mesh 就是节点），`sourceFaceIndex` 就是这个三角形编号。
  - 查看器：只对服务端转换的 STEP（`model.format` 是 step／stp 且有 `model.mesh`）读 `userData.brepFaces`，建「三角形→面」表挂在
    `fillTopology.brep`；区间不连续、不铺满、越界就整张表不用、按网格量。别处来的 GLB 带同名字段一律不信（浏览器测试把 plate 的网格
    当 GLB 发布，同一条相切边照样量不了）。标记（pin／区域／油漆桶）不受影响，照旧按三角形。
  - STEP 上的「两个面」：点中哪个三角形就取它所在的整个 B-rep 面，面积加权拟合平面；角点离平面超过面尺寸万分之一（另加 float32 余量）
    就是曲面，拒绝并提示「这个面是弯的，只能量平面」（新 toast）。网格上照旧按 2° 生长。
  - STEP 上的「边长」：边＝两个 B-rep 面的分界，不看二面角，所以相切边（平面接圆角那条线）和浅倒角边都能量。沿同一对面的分界往两头接，
    遇到第三个面停；转角超过 40°（曲线自身的折线段转不到这么大）也停；绕回起点就是闭合的圈。所有点离两端连线都在长度万分之一以内才算直边，
    否则按弯边拒绝（孔口整圈、圆角弧都拒）。点到点的角点吸附不变（任何三角形角点）。
  - 三点定圆（新 kind `circle`）：在孔或轴的边缘点三点，每点照点到点的规矩吸附角点（孔口的网格顶点就在真圆上）。同一点点两次、三点共线或
    圆比三点间距大 50 倍以上（`FLAT_ARC`，基本是沿直边点的）→ 提示「这几个点定不出圆」，撤回这一点、等重点。读数「⌀5.00 mm」（六语同一写法 `⌀{value}`）。
    法向朝审阅者那一侧（对孔就是朝孔口外）。
  - 记录：`kind:"circle"`、`quantity:"diameter"`、`points` 三点、`picks` 三个、新增 `center` 和 `normal`；schema 的 `points` 放宽为 2–3 个、
    `picks` 1–3 个，`checkMeasure` 按种类核对个数和有无 `normals`／`center`／`normal`，圆要求三点到圆心都是半径、都在法向平面上、三点互不相同、
    直径大于零；别的种类不许 `diameter`。推送一行「M1: measurement, 5 mm diameter, the circle through three points on mesh-0 source face …」；
    read 摘要带 `center`／`normal`，`unit` 为模型单位，`measureHint` 加圆和「STEP 按文件自己的面」两段（去掉了「a STEP's own faces are not used yet」）。
    每条测量的字节预算 480 → 640（圆约 400 字节，页面 `MEASURE_BYTES`＝服务端 `MARK_MEASURE_BYTES`，测试钉相等）。
  - 读数标签：圆的读数挂在圆（屏幕上的椭圆）最低点下方 5px，不压在孔上——窄屏截图发现挂在圆心时已留下的读数按钮把孔口整圈盖住、
    再点孔口全被按钮截走。所有测量读数（已留下的和正在量的）每帧一起摆：按高度排，位置被占就挪到占位者下方 4px（同一个孔量两次不再叠字）。
    读数尺寸在第一次排版后记住，只读一次布局。
  - 六语加 7 键（`measure.circle`、`hint.measureCircle`、`measure.circleSecond`／`circleThird`（法语三点要用 deuxième，所以不复用 nextPoint）、
    `measure.diameter`、`measure.curvedFace`、`measure.noCircle`），改 `tool.measureTitle` 和帮助第 10 段（已 sync 进 AGENT-INTERFACE）；
    AGENT-INTERFACE「Reading marks」加圆和「On a STEP, faces and edges are the file's own」一段，SKILL 第 6 节同步。
  - 测试：node 新 4 条（区间表的收与拒；plate.step 真网格：顶面整面、孔壁和圆角判曲面、顶底 8 mm；顶前边 16 mm、相切边 8 mm、孔口闭环和圆角弧判弯；
    三点定圆含共线／近共线／重点和 plate 孔口 ⌀5）；服务端圆的存取和 11 种自相矛盾记录；浏览器新 2 条（STEP 平板：边 16／相切边 8、点圆角被拒、
    三点定圆 ⌀5.00 并留下成 M1、再量一次两个读数不重叠且都不压孔、共线被拒、推送那一行；同一网格当 GLB 发布时相切边量不了）。
    三处变异验证过会红：关掉读 brepFaces、对 GLB 也读、去掉标签避让。
    截图核过英文宽屏（含留下后）、中文和法语 460 宽、德语 760、日语宽屏，四个种类按钮都不溢出。
  - 仍没做（不在范围或以后再说）：曲边长度、曲面之间最短距离、点一下孔直接出直径（均按④不做）；STEP 的点到点只吸附网格角点，不认 B-rep 顶点；
    读数避让只往下挪，挤满时可能出画面；复杂装配 STEP 只在单元测试和 plate 上验过，没拿大装配实测手感。

**小项（原定）** —— 09-29 第一轮三项都已做完（见各条 ✅）
- ✅ STL 一律灰（`db334a2` 之后的提交：六语帮助段＋AGENT-INTERFACE＋SKILL.md）：`src/viewer.js:530-535`。文档加在 AGENT-INTERFACE 朝向那段之后和 `SKILL.md`；要让审阅者也看到，改 `en.js` 的
  `help.p9`＋五语译文再跑 `sync:docs`（AGENT-INTERFACE `:169-217` 是生成的，不能手改）。
- ✅ 中文零件名乱码（`db334a2`，本机 67 个受影响 STEP 回归：113 个网格名还原，8 个因文件丢了 C1 字节还原不了）：**乱码在文件里**——OCCT 写文件时把 UTF-8 字节又按 Latin-1 编了一遍，库只是原样返回（扫描实测：本机 113 个 STEP 的零件名是这种乱码，
  正确 UTF-8 的 0 个）。修法：在 `applyDeclaredStyles` 之后按 Latin-1 取回字节，能按 UTF-8 解开就还原（放在它之前会破坏取色匹配）。
  名字不在界面显示，只随 read 给 Agent。
- ✅ morph targets（服务端拒 `ANIMATED_MODEL`，页面查全部 morphAttributes）：服务端 `server/models.mjs:193-201` 不看 `targets`，precheck／open 放行；页面 `src/viewer.js:572-578` 拒。
  按代码看这个错误不算 HASH_MISMATCH，页面每 2.2 秒轮询就重新加载一次，Agent 收不到任何失败信号（未核实）。
  改：服务端抛 `ANIMATED_MODEL`，AGENT-INTERFACE 补上这个错误码。

**扫描查出的新缺陷（不另发补丁，并进 1.4.0）** —— 09-29 第一轮全部修完
- ✅ 🔴 **CLI／MCP 打开的审阅页，一切写入都被拒（0.9.0 起就有，09-29 实测发现，`80c2acc` 修）**：受管实例判断「安装还在」看的是
  `installRoot/openclaw.plugin.json`，只有 OpenClaw 包有；npm／git 安装和克隆都没有，于是页面的每个写请求（含局域网浏览器领取准入）
  都回 503 `INTEGRATION_DISABLED`，页面能打开、什么都标不了。改看 `package.json`（每种安装根目录都有、卸载时一起消失）。
  没有测试从「没有清单的安装」开过受管实例，所以一直没人看到；新测试在旧代码上红。给 Kelven 从克隆起 1.4.0-dev 测试页时发现。
- ✅ 🔴 德语／法语界面（`24755d0`：上限改 32、check-i18n 逐语逐色核对）用紫色涂区域，保存会 400：区域名 `violette Fläche`（15 字符）／`Zone violette`（13）超过区域 `label` 的 12 字符上限
  （`server/index.mjs:338`）。已按代码和六语目录核实，未端到端复现；其他语言、其他颜色都在 12 以内。
- ✅ 🟡（`db334a2`，assembly1.step 有色 1/3→3/3）`server/step-styles.mjs:60-71` 的 `decode` 只认大写十六进制，也不认 `\X4\`／`\S\`。SolidWorks 写小写十六进制，零件名对不上，颜色补不回来
  （扫描实测 `filament-swatch-box/ref/original/assembly1.step`：库自己 1/3 有色、补 0；改成不分大小写后 3/3）。
- ✅ 🟡 morph 页面反复重载（见上）。修法扩到同类：页面对「同样的字节每次都会被拒」的情况（哈希不符、会动的模型、超面数、没有尺寸）一律标 `settled`，不再每 2.2 秒重取。

**Claude Code 插件市场清单（Kelven 09-25 同意随 1.4.0 上线）—— 比「加一个清单文件」大**
- 仓库根同时做市场根和插件根，MCP 跑 `node ${CLAUDE_PLUGIN_ROOT}/mcp/server.mjs`；根目录不放 `.mcp.json`（否则开发本仓的人会被当成项目级 MCP 加载）。
- 两个硬坑：① 插件 MCP 的 cwd 是插件根，而 `mcp/server.mjs:97` 拿 `process.cwd()` 当 workspace，要改读 `CLAUDE_PROJECT_DIR`；
  ② `dist/` 不在 git 里，按 git 装的插件没有网页（`PACKAGE_INCOMPLETE`），要么首次启动构建到 `${CLAUDE_PLUGIN_DATA}`，要么发版附预构建包。
  依赖在插件安装时怎么装，按官方文档，未核实。
- ✅ **09-29 第六轮做完**（`2b442c7`；方案按上面两条硬坑改过，见下）：
  - 读官方文档（code.claude.com/docs 的 plugins、marketplace-reference、loading、mcp 各页）定的三件事：
    ① 从 git 装的插件会被拷进 `~/.claude/plugins/cache/<市场>/<插件>/<版本>/`，根目录同时有 `package.json` 和锁文件时，Claude Code 在那里跑
    `npm ci --ignore-scripts`（60 秒超时、devDependencies 照装、`prepare` 不跑）——所以按 git 装永远没有 `dist/`；
    ② 管理器的 `PACKAGE_INCOMPLETE` 本来就写明「no ad-hoc build was attempted」，运行时临时构建网页违背这条；
    ③ 文档表格说 stdio MCP 进程只导出 `CLAUDE_PLUGIN_ROOT`／`CLAUDE_PLUGIN_DATA`，`${CLAUDE_PROJECT_DIR}` 要写在 args／env 里由 Claude Code 替换。
  - **定的方案**：仓库根只做市场（`.claude-plugin/marketplace.json`，根目录没有 plugin.json 也没有 `.mcp.json`）；插件本体是发版附带的预构建包，
    市场条目用 `archive` 来源指向 `releases/download/v<版本>/meshcue-<版本>.zip`。这个包就是 `build:integration` 出的那个 OpenClaw 包，
    多了 `.claude-plugin/plugin.json`（名字 meshcue；版本由构建写入，模板 `adapters/claude-code/plugin.json` 自己不带版本，免得发版多一处要改）
    和打包过的 `mcp/server.mjs`（带 `__MESHCUE_PACKAGED__`，走和 OpenClaw 一样的「每个项目一份校验过的副本」启动，插件更新删旧目录也不影响正在跑的审阅）。
    包里没有锁文件，Claude Code 不跑 npm。URL 按 package.json 去掉 -dev 的版本写，发版提交不用改它；在 dev 上它指向正在做的版本（还不存在），
    用户读的是 main。在 tag 上加市场（`lzyling/meshcue#v<版本>`）就连包一起钉住——和 README「Pin the tag」同一个道理。没有 sha256 钉（包在打 tag 之后才构建，除非构建可复现）。
  - 工作区：`mcp/server.mjs` 读 `MESHCUE_WORKSPACE`，插件把它设成 `${CLAUDE_PROJECT_DIR}`；没给就用 cwd（原行为）；给了但不是存在的绝对目录
    （比如没替换的占位符）→ 每次调用都拒 `WORKSPACE_INVALID`，握手照答，不退回 cwd。
  - 发版工作流拆成两个任务：`package`（只读权限，唯一跑 npm 的地方）构建并 zip，`release`（写权限）只下载这个产物、建 Release 时附上。
  - **实测（本机 claude 2.1.284，配置目录隔离在仓库 `tmp/cc-home`，没碰本机 Claude Code 配置）**：`claude plugin validate` 市场和包都通过；
    本地目录市场装上后，在项目目录跑 `claude mcp list` 显示 `plugin:meshcue:meshcue ✔ Connected`。探针记下：**cwd 是项目目录，不是插件根**
    （TODO 当初那条「cwd 是插件根」在 2.1.284 上不成立），`CLAUDE_PROJECT_DIR` 也在进程环境里（文档表格没列），`${CLAUDE_PROJECT_DIR}` 替换进 `MESHCUE_WORKSPACE` 生效。
    文档没承诺 cwd，所以照样显式传。
  - 测试 `tests/claude-plugin.test.mjs` 4 条：工作区取值与拒绝；坏工作区握手照答、调用全拒；市场条目＝本版资产名、发版工作流按同一名字附上、根目录不许有 plugin.json／.mcp.json；
    打包后的服务端从包目录起（不是项目目录、没有 node_modules）、客户端报 claude-code，inspect 报本版本且文档路径在包里，open 一个 STL 拿到页面、
    页面名字是「Claude Code」、从项目里那份校验过的副本启动、包目录一个字节没多。两处变异验过会红（打包标记去掉 → `PACKAGE_INCOMPLETE`；不读 `MESHCUE_WORKSPACE` → 3 条红）。
  - **未核实**：`archive` 来源从 GitHub Release 下载这一步（要等 1.4.0 发版、资产真的存在才能测；GitHub 的 releases/download 会 302 到 objects.githubusercontent.com，
    Claude Code 跟不跟重定向没实测）；真会话里（不是 `claude mcp list`）的 cwd；Windows。发版后第一件事：按 README 两行命令真装一次。
  - CI（`2b442c7`）：unit 1.5 分钟绿（含新测试和出包）；浏览器 85 过、2 跳过、0 flaky，9.4 分钟。
  - 开发包：`tmp/candidate-140-2b442c7`（含 OpenClaw 宿主构建），`package-smoke` 11/11；同一包照发版工作流的办法 zip 成 4.2 MB，
    装进隔离配置 `claude mcp list` ✔ Connected，`claude plugin details` 列出 1 个技能（meshcue-review）＋1 个 MCP 服务器。`claude plugin validate` 不收 zip，只收目录。
  - 09-29 17:2x 第二个开发包 `tmp/candidate-140-final/package`（`a215b5b` 构建，和冒烟过的 `1a6d081` 构建逐字节相同，含名字加工具）。
    冒烟先撞出 `80c2acc` 留下的测试缺口：「卸载冻结写入」那例还在改名 `openclaw.plugin.json`，服务端已改看 package.json，于是拿到 200 而不是 503；
    改成挪走 package.json 后 11/11（`a215b5b`）。已按 Kelven 31619 装进本机 OpenClaw（装一次），等他重启后一起实测显示名、标记文字、测量、推送进话题、回显。
  - 发版时顺手核对：AGENT-INTERFACE「every release states the SHA-256 of its own artifact」——Release 正文至今只附提交号，
    从没有过制品；1.4.0 起有了 zip 资产，GitHub 会不会在资产上显示 digest、这句要不要改成「资产的 SHA-256」，发版后看实际页面再定（未核实）。

**依赖**：dependabot #5（vite 8）只动 devDependency，`vite.config.js` 没用到改名项，风险低 —— rebase 到 dev 跑全套再交 Kelven。
#8（three 0.186）按规划留 1.5.0。
- ✅ **09-29 第六轮跑完，等 Kelven 定合不合**：PR 基于 1.3.1，和 dev 的锁文件冲突，所以在 dev（`aa01d57`）上照它的改动重做（`"vite": "^8.3.0"`、重新生成锁文件），
  放在本地分支 `vite8-on-dev`（工作树 `tmp/wt-vite8`，没推）。实际解析到 **vite 8.3.1**（rolldown 1.2.11；PR 锁的是 8.3.0）。
  结果：格式检查过；node 268 条 267 过 1 跳过；浏览器 87 条 85 过 2 跳过、0 失败（5.1 分钟；比本机基线多跳的那条是要本机大贴图模型的用例，工作树里没有，CI 上也跳）；
  `build:integration` 出包正常，页面 JS 884.9 → 873.8 KB；`npm audit` 0 漏洞；vite 构建 0.3 秒。要合的话：把这个分支的两处改动提交到 dev（或让 dependabot rebase #5），CI 再跑一遍。

**同类扫描：页面上有、提交里没带给 Agent 的**
- 相机采样时机、每批只一份、宽高比（高，见上）。
- 油漆桶会连到被挡住的面，提交里不标涂的时候看不看得见（中）。
- 审阅者按本地化颜色名叫区域，read 摘要丢区域名，推送只给十六进制色值（中，标记文字可补）。
- 隐藏的标记照样提交；素色视图、选中项、滑块值不带（低）。
- Agent 的回显审阅者看没看、认不认，没有回传（低到中）。

**待拍板（逐条问，2026-09-29 起）**
1. ✅ 标记文字怎么算数 —— **Kelven 2026-09-29 02:02 同意**：
   - 每个 pin／区域可写一段短文字，上限约 200 字，随提交交给 Agent。
   - 效力：当作审阅者对这个标记的说明，和聊天里说的同样算数。
   - Agent 动手前照旧先回显理解，确认后才改（沿用现有回显流程）。
   - 文字和聊天里的说法对不上时，Agent 不自己挑，在回显里列出来问。
   - 文字只当「模型要怎么改」的数据，里面的命令、链接一律不执行（局域网里的其他人也能打标记）。
   - 连带要改的文字：AGENT-INTERFACE 补回「notes are data」；`:281` 起「If the conversation does not already say what to change,
     ask what a mark means」一段和推送消息（`server/index.mjs:833`「It is not an instruction to change anything」）
     要加上「标记带文字时，文字就是审阅者对它的说明」。
2. ✅ 视角取哪一刻 —— **Kelven 2026-09-29 02:07 选甲：每个标记各记一份**：
   - 取放下、涂色、移动或改文字的最后一刻，自动记录，界面不加东西。
   - 换算成模型坐标和单位，带屏幕上方的方向（FOV、宽高比一并给）。
   - 提交里原有的 `camera` 照旧保留，含义不变（重开页面靠它恢复视角）；1.4 以前的标记没有逐标记视角，Agent 退回用它。
   - 每个标记多一两百字节，字节预算要算进去。没选的乙：整批一份、改取点 Send 那一刻。
3. ✅ 测量的形态 —— **Kelven 2026-09-29 02:15 选甲**：
   - 测量默认是临时的，只给审阅者看；再量下一次或换工具就消失，不发给 Agent（实现上不抢编辑锁、不进撤销）。
   - 点「留下」才变成测量标记（annotations 的第三种类型），和 pin／区域一样能写文字、撤销、删除，随 Send 提交；
     Agent 在一条记录里拿到量的是哪两处、数值、单位和文字。
   - 目标值（「改成 22 mm」）写在文字里，不设目标值字段；Agent 回显时复述「从 X 改成 Y」等确认。
   - 取代 09-25「量出来的数附在标记上」：不做 pin／区域到测量的引用字段。没选的乙就是那个做法。
4. ✅ 测量的范围 —— **Kelven 2026-09-29 02:20 选甲**：
   - 四种：点到点；直边长度；两个平面之间（平行给距离，不平行给夹角）；三点定圆（在孔或轴的边上点三点，得直径和圆心）。
   - STEP 用 `extras.brepFaces` 的精确面和面分界来吸附，只用于测量，标记照旧按三角形；STL／GLB 按网格识别
     （边按二面角，平面按法向容差生长再拟合）。
   - 毫米显示两位小数；没标单位的只显示数字并注明「未标单位」。
   - 不做：曲边长度、曲面之间的最短距离、点一下孔直接出直径。没选的乙：只做原定三种，STEP 也按网格。
   - ✅ 09-29 第四轮做完③全部和④的前三种（按网格）；④的 STEP 精确面吸附和三点定圆留第五轮。细节见上方「测量」一节。
   - ✅ 09-29 第五轮做完④剩下的（`0e040b3`）：STEP 按文件自己的面和面分界量（只用于测量），三点定圆。④全部完成。
5. ✅ 界面怎么称呼 Agent —— **Kelven 2026-09-29 02:29 提出，比「改成 AI Agent」更进一步：显示 Agent 的名字；02:42 确认下列细节**：
   - Agent 可以自己报名字（用户给它起的，比如「爆爆」）；没起名就报它所在工具的名字（OpenClaw、Claude Code、Codex）。
     界面显示「交给爆爆」「交给 OpenClaw」「交给 Claude Code」。（原话第三个是「CloudCall」，按 Codex 理解，语音转写所致。）
   - 我补的默认：`open` 加可选的名字参数，按项目存、以最近一次为准；Agent 没报时，OpenClaw 插件自带工具名，
     MCP 从握手的 `clientInfo.name` 认已知客户端（映射表待实测，未核实）；都认不出时中文写「AI Agent」、其他语言写 agent。
     六种语言都改成带名字的写法（i18n 加占位符，check-i18n 要求六语一致）。名字限长约 24 字符、只当纯文字显示。
   - 同步进 AGENT-INTERFACE 的帮助段不能出现占位符，要保持通用说法；SKILL.md 教 Agent 怎么报名字。
   - ✅ **09-29 第三轮做完**：
     - 参数：`open`（OpenClaw 工具、MCP、CLI `--agent-name` 三个入口）加可选 `agentName`，1–24 个 UTF-16 码元、单行纯文字；
       控制符、文字方向控制符（U+202A–202E、U+2066–2069 等）、行分隔符一律拒，报 `BAD_AGENT_NAME`，在动任何东西之前拒。
       页面只当文字显示（名字写 `<b>Bo</b>` 就原样显示，测试钉住）。
     - 存法（「以最近一次为准」的落地）：服务端按项目存 `{owner, name, tool}`，owner＝harness＋sessionKey（续接会话换 generation 不算换人）。
       同一会话、同一工具再开时不报名字就沿用上次报的；换会话接手、或同一个 MCP owner 换了客户端（同一工作区的 MCP 客户端共用一个 owner），名字作废。
       名字经独立 IPC `/agent` 送，不塞进 `/opened`：旧运行时对 `/agent` 回 404、不影响 `/opened` 的回收保护。
     - 兜底工具名：OpenClaw 插件自带「OpenClaw」；MCP 按握手 `clientInfo.name` 认两个——
       `claude-code`→Claude Code（**本机 claude 2.1.284 实测握手**：`{"name":"claude-code","title":"Claude Code","version":"2.1.284",…}`）、
       `codex-mcp-client`→Codex（openai/codex 主干 fe50d01 `codex-rs/codex-mcp/src/rmcp_client.rs` 读到，带 title「Codex」；**本机没装 Codex，未实跑**）。
       别的客户端不猜（握手里的 title 也不拿来用）；CLI 认不出。都没有时页面用自己的词：中文「AI Agent」，英 the Agent，德 den Agenten，法 l'Agent，日 エージェント。
     - `open` 返回 `agentName`（页面显示的名字；null＝页面自己的词），`status` 也带。
     - 界面：21 句提到 Agent 的话各加一条 `key.named`（六语，共 126 条），`ta()`／`TA()` 取词，有名字取 named、没名字取原句。
       德法按语法重写：名字不带冠词、不变格（「An {agent}」对「An den Agenten」、「Warten, bis {agent} ein Modell liefert」）；
       法语避开 de／que＋名字（元音开头要省音），如「Revoir ce qu'a compris {agent}」。中日由代码按字母定空格：「交给爆爆」「交给 OpenClaw」「Claude Code へ送る」。
       名字和其他占位符一次替换：名字写「{count}」不会再被替换，回显摘要里的「{agent}」也不会被换成名字。
     - 启动时画好的文字（发送按钮、说明框占位、帮助第 5–8 段、等候模型标题、回显按钮标签）在名字到达时重画，不用重载。
       发送按钮文字包进可省略的 span（悬停看全名）；24 个 W 的名字宽窄屏都不出按钮（先在没这条样式的代码上测红：文字 265px 溢出 218px 按钮）。
     - check-i18n 新规则：英文提到 agent 的句子必须有 `.named`；`.named` 必须含 `{agent}`、原句不能含；有 named 的键不许用 `t()` 取；
       英德法名字前不许有冠词（德语逗号后的关系代词不算）、法语不许 de／que＋名字。临时副本故意写错四处，全部拦住。
     - 文档：AGENT-INTERFACE 新增「What the page calls you — agentName」一节；帮助段前言加一句「这些 the Agent 在页面上是你报的名字」，
       同步脚本遇到占位符直接报错；SKILL.md 第 4 节教报名字；reviewctl 加 `agent` 命令（测试和手动排查用）。
     - 截图核过：英文宽屏「Send to Ada」、中文帮助「交给爆爆」、德语 23 字名字窄屏、法语「Envoyer à Claude Code」。
   - ✅ **09-29 17:0x–17:1x 名字后面加工具**（dev `0769c56`；Kelven 16:57，31619：「爆爆（OpenClaw）」比单写「爆爆」清楚，左下角提交按钮也照改）：
     - 规则：名字和工具都有、两者不同 →「爆爆（OpenClaw）」；只有工具 →「OpenClaw」（服务端这时把工具名也当名字给，页面只说一次）；
       有名字但认不出工具（CLI）→「爆爆」；都没有 → 页面自己的词（中文「AI Agent」）。名字和工具只差大小写也只说一次。
     - 服务端 `publicState` 多给 `agentTool`（`agentName` 照旧＝名字或工具，旧页面、旧调用方不受影响）；`open` 返回、`status` 也带 `agentTool`。
     - 页面在 `src/agent-label.js` 拼好再交给 `setAgentName`，所有 named 句子（按钮、状态行、回显、帮助、说明框提示、等候标题…）一起变；
       括号走新词条 `agent.withTool`：中日全角「{name}（{tool}）」、英德法半角「{name} ({tool})」。中日空格规则照旧（「交给 Ada（OpenClaw）」）。
       词条必须在 i18n 目录以外被引用（check-i18n 只扫那里），所以拼法放在独立模块而不是 `i18n/index.js`。
     - 测试：node 加 3 条（服务端给两样、四种情况含不重复、句子里的完整写法），MCP 那条加 `agentTool`；浏览器 3 条改期望
       （英文「Send to Ada (OpenClaw)」；中文「交给爆爆（OpenClaw）」＋CLI 只有名字时「交给爆爆」；24 个 W＋「Claude Code」宽窄屏仍省略、不出按钮）。
       先在旧逻辑上跑：node 4 条红、浏览器 3 条红；三处变异（去掉不重复、`agentTool` 恒空、中文改半角括号）各自会红。
     - 截图核过（中文，1440 与 700 宽）：按钮「交给爆爆（OpenClaw）」完整显示、没有省略；顶栏「由爆爆（OpenClaw）来取」（860 以下本来就隐藏）；
       提交后状态行「已保存 · 等待爆爆（OpenClaw）来取 · 等待爆爆（OpenClaw）读取」，宽屏折成两行；说明框提示同样是完整写法。
     - 文档：AGENT-INTERFACE「What the page calls you」、帮助段前言、SKILL.md、两个入口的 agentName 说明都改成带工具的例子。

---

## 0.9 · 核心与 harness 解耦

**不叫「Codex 兼容」** —— 目标是核心不再知道任何 harness 的名字，Codex／Claude Code／
国内那批都只是消费者。`REQUIREMENTS.md` R16 早就写下「共用核心，各平台分别包装」，这一版兑现它。

完整方案、实读到的现状、风险与「明确不做」见 **`ITERATION-V09-PLAN.md`**。

- [x] **组 1 · 身份改成「拥有者 + 可选回传」** —— 完成（`3c1d081`）。
      origin 现在是 `{harness, sessionKey, sessionId?, route?}`，`harness` 开放；
      `HOST_CONTEXT` 的 `need: "origin"` 改名 `"owner"`；旧 origin 进出时就地升格，**磁盘不改写**。
      `sameRoute` 仍比较全部字段，**没有放松任何检查**。
      ⭐ 写测试时抓到一个真漏：store 原样返回存档 origin，改完之后**旧项目会跟自己的会话比不相等**。
      已修（读时升格）。127 node + 55 浏览器测试。
- [x] **组 2 · 通知器变成能力接口** —— 完成（`ad37b23`）。`send`／`observe` 各自可缺席；
      代际围栏原样保留。无 `send` 时提交是 `waiting`：**不计入重试、永不 stalled**。
      无 `observe` 时送达确认退回 Agent 自己的已读回执。
- [x] **组 3 · 拔掉剩下的名字** —— `z.literal("openclaw")` 随组 1 没了；版本读取本来就只看
      `package.json`，已下沉到 manager 并对所有 harness 生效。
      `release.mjs` 的 `openclaw.plugin.json` **保留**：它只在启动内附发布包时才走，
      CLI／MCP 走 `serverEntry`，那条分支到不了 —— 等真有第二种包布局再改。
- [x] **组 4 · `meshcue` CLI** —— 完成（`ee7d817`）。manager 的命令行外壳，JSON 进 JSON 出。
      owner 必须由调用方指明，**不替它编一个**；`bin: meshcue`。
- [x] **组 5 · MCP server** —— 完成（`3fe56e9`）。stdio JSON-RPC，**零新依赖**；
      `instructions` 就是仓库那份 SKILL.md 的字节；`bin: meshcue-mcp`。
- [x] **组 6 · 适配器与底座合一** —— 完成（`bf0b391`）。适配器本来就直连 manager，
      它独占的只有「装的 vs 跑的」对比 —— 已下沉，CLI／MCP 同样拿得到。

⚠️ 跳 `INTEGRATION_API` 时发现并修掉的一条：旧契约实例原本落进 `WRONG_INSTANCE`，
而 `ensure()` 对该码直接重抛 —— **正在跑的实例会同时变成读不了、换不掉、也停不了**。
现在分成 `foreign`／`outdated`／`ok` 三态，`outdated` 由重新 `open` 停掉再起新的。

验收：**同一个审阅在 OpenClaw 打开 → Codex 接手 → 回到 OpenClaw，草稿与版本一个不丢。**
`INTEGRATION_API` 1 → 2；`schemaVersion` 不动。

---

## 0.10 · 英文为主 —— 已完成（未安装）

- [x] README · AGENT-INTERFACE · SECURITY · SKILL.md → **英文**。README 与 AGENT-INTERFACE 是
      **重写**不是翻译：旧的两份都是阶段状态日志，翻出来只会得到英文版的状态日志。
- [x] **193 条**运行时消息 → 英文（不是原估的 105：那次数漏了 `server/index.mjs`）。
      **做法与原计划不同**：没有在服务端做 i18n，而是让服务端一律英文 ——
      它的受众是 Agent 与日志。网页本来就有 `serverMessage()` 按 `code` 查 i18n 的机制，
      所以改为**补全那张表**：审阅者真正会撞到的 8 条用他自己的语言说，其余落回服务端原文。
      顺带给「草稿还没保存完」分了独立 code（原本和其他冲突共用默认 `CONFLICT`，分不出来就没法本地化）。
- [x] 9 份中文设计文档 → `docs/zh/`，保持中文
- [x] 界面 `zh-Hant` 原样保留；i18n 190 键 × 6 语

留着没做、并且是有意的一处中文：`check-i18n.mjs`（CJK 正则与解释它的注释）。
原本还有一处 `sidebar-e2e.mjs`（**已取消的 Control UI 侧栏**的 E2E 脚本）——
2026-09-15 已随阶段日志一起移出仓库，这条自动结案。

---

## 0.11 · 闲置实例自我回收

实例现在**永远不会自己退出** —— 唯一的退出路径是外部 SIGTERM。实测当时有 6 个在跑，
最久的 3 天 20 小时，合计 446MB 与 **6 个 LAN 绑定端口**；而浏览器准入 session 的闲置
有效期是 30 天，所以一个被遗忘的实例 = 内网上一个活的 HTTP 服务，最长认已授权浏览器 30 天。

完整方案、活动判定逐条表、风险与「明确不做」见 **`ITERATION-V11-PLAN.md`**。

已定：闲置阈值 **24 小时**；**心跳不豁免**（有心跳但 24 小时零手势照收）；
回收后旧链接失效可接受，重新迭代由 Agent 重开。

- [x] **组 1 · 活动时钟** —— 复用 `POST /api/access/activity`（**已经存在**，只在可信手势
      且标签页可见时发，最多每 60 秒一次），加上会改变审阅的写路由。规则落在 `server/idle.mjs`，
      与路由分开，因此可以单独测。
      ⚠️ `GET /api/state`（2.2 秒）、`review/heartbeat`（10 秒）、`/api/health`、
      自愈重发的 `POST /api/ready`、Agent 的 `GET /status` **一律不计** ——
      一个忘了关的标签页每天敲 4.7 万次，算进去机制直接变 no-op。
- [x] **组 2 · 到点自我回收** —— `unref()` 计时器，走已有的优雅退出路径。
      管理与非管理实例**一视同仁**：跑得最久的那个（3 天 20 小时）正是非管理的。
      `REVIEW_IDLE_HOURS` / `config.idleHours` 可调，**只有显式 0 才关掉**；读不懂的值
      回落到 24 小时而不是「永不」。
- [x] **组 3 · 先通告、再退出** —— `/api/state` 带 `closing`，一个 tick（默认 60 秒 ≈ 27 次轮询）
      之后才退。页面记住这条通告：服务端没了之后仍然说「闲置回收、标记都在」，
      而不是退回「连线中断」那种跟崩溃一样的话。`closing.pending`／`closing.done`／
      `conn.reclaimed` 三键 × 6 语。
- [x] **组 4 · `open` 时扫注册表** —— ⚠️ **形态和原计划不同，理由见下**。
      自我回收做完之后，「替别人判断闲置」既多余又更没根据（管理器看不到活动）。
      真正没人兜的是**早于 0.11 的 runtime**：它不会自己退，而这正是 09-14 那几个
      0.6.1 跑满两三天的原因。所以这一步**只报不杀** —— `open` 的结果里多一个
      `runtimesNeedingReopen`，点名哪些项目的 runtime 老到不会自我回收。
      判据是「health/status 里没有 `idle` 字段」；显式关掉的会报 `limitMs: 0`，
      **不会**跟「根本没有这个概念」混为一谈。

`/api/health` 与 agent `/status` 都直说 `idle: { forMs, limitMs }` —— 读它不会重置它，
所以这个倒计时可以被诚实地报出来。

版本号 **0.11.0**（minor：行为实质变化，契约／schema／网格算法不动，零迁移）。

### 0.11.1 · 开测前的场景审阅（6 条）

- [x] **`open` 一个仍在运行的实例不算使用** —— `ensure()` 探 health、问 status，两条都是读；
      同会话不重绑 origin，不带新文件就不发布。**零个计数路由。** 闲置 23 小时的项目被重开、
      地址交给人，一小时内自己关掉。也同时关掉了一个竞态：`open` 可能落在通告窗口里，
      交出一个几秒后就死的地址。修法：新增 agent 路由 `POST /opened`，manager 在 `open` 时明说一次。
- [x] **真人打开链接不算使用** —— `POST /api/ready` 被排除（对的，自愈会重发），
      但那把真实载入也一起排除了。`GET /api/models/:filename` 正好把两者分开：
      真载入要取字节，自愈复用手上的回执、从不再要。
- [x] **回收文案写死了「一天」**，而窗口是可配的 —— 短窗口测试时横幅会睁眼说瞎话。六语改掉。
- [x] **后台标签页可能整段错过通告** —— Chrome 把后台计时器节流到约每分钟一次，
      而通告窗口就是一个 tick。改成 `/api/state` 每次都带 `idle: {forMs, limitMs, graceMs}`，
      页面据最后一次读数判断，而不是退回「服务已离线」那种跟崩溃一样的话。
- [x] **注册表巡检串行、每个最多 3 秒** —— 而它跑在交互式的 `open` 里。
      先按锁文件里的 pid 跳过已死的（读文件，不是往返），其余并发问。
- [x] **`INSTANCE_OUTDATED` 被说成「身份校验失败」** —— 09-14 就发现、当时推迟的那条。
      `status` 现在照实说，`stop` 也能停掉旧契约实例；两条都拒绝正是「一个进程只能靠人去 kill」的由来。

skill 补第 9 节：回收不是故障，重新 `open` 即可；`runtimesNeedingReopen` 只报不动手。

156 node（155 过 1 跳）／ 55 浏览器 ／ 包冒烟 11 项，全绿。

---

## 0.12 · 实测四条（已完成，未安装）

Kelven 用 0.11.1 做真实建模时报的四条。**每一条的病因都和它看起来的样子不同**，
四条都先量过再改。

- [x] **① 标记落点动效从画面角落飞进来** —— 不是审美问题。`transform` 里同时写位置和
      `scale` 时，CSS 合成顺序是 translate → rotate → scale → **transform**，
      所以 `scale` 会连位置一起缩放，缩放中心是标签层的左上角；落点离左上角越远飞得越远。
      旧代码上实测 **347.9px 位移**。位置改用 `translate` 属性（在 scale 之后合成）。
      ⭐ 顺带发现**落点涟漪从来没出现过一次**：它被 append 到「标记一变就整层重建」的那层，
      于是在同一个同步块里被它所确认的那次编辑抹掉。特效改用自己的层。（`3192987`）
- [x] **④ 三个下拉框没有标题、字号不一** —— 标题**一直都有**，只是只写在 `aria-label` 里：
      读屏器知道，屏幕上什么都没有。把已有的那句显示出来，零新增翻译。
      字号不一是 0.8.1 加「指点设备」时漏的：那条管另外两个的规则没带上它，
      于是它比左右大 20%、高 2px。三个合成一条规则。窄于 1100px 标题收起（460px 嵌入面板放不下）。
      i18n 新断言：三个下拉框的字体／字号／高度必须完全相同。（`db84a85`）
- [x] **② 画笔画一条线就撑爆本地存储** —— 真凶不是模型，**是笔刷自己**。
      一次盖章恒定产生 64–66 个 patch，**跟网格精细度无关**（1×1 的两个三角形也是 64 个）：
      笔刷圆是 64 边形，每盖一次就把**笔刷自己的轮廓**扇形切成 62 个三角形存一遍，
      每个还各自重复一份 meshId 和两个面号。改成存裁剪后的多边形、扇形化挪到绘制时；
      轮廓降到 32 边形（最大笔刷 0.29px 误差）；盖章间距半径 1/3 → 1/2（扇贝 0.7px）；
      坐标取 7 位有效数字（float32 的精度）。一条 600px 的线 **2.6MB → 573KB（密网格）／135KB（粗网格）**。
      护栏原本数 patch 个数、卡在 40,000 ≈ 11MB，**是 5MB 容器的两倍**，所以「请先提交」永远
      来不及说；现在按字节算、卡在 3MB。（`0f2288c`）
- [x] **③ 「查看」和「添加标签」拆成两个工具** —— 那颗按钮的名字本来就是「查看／标签」，
      斜杠写在脸上。现在查看只转不落、添加标签单击即落。查看模式下调色板隐藏
      （看不产生东西，没有可上色的对象）。旧习惯是双击，所以 450ms + 8px 内的第二次点击
      当作同一个手势丢掉；换个位置的点击照样落。六语四键 + 帮助面板 + README 一起改。（`c704249`）

**② 剩下的没做完，写在这里不让它消失**：盖章之间仍然重叠，笔画内部一个面约存 12 次。
正解是「一个面被盖满后塌缩成整面」。**试过「按面两两相减合并」，失败**：`subtract`
会把每块新笔迹对着已有的每块切碎，一条线从 13,636 变成 230,151 个、33MB、11 秒。
下次要做就做塌缩，不要再做相减。

版本号 **0.12.0**（minor：界面有实质变化；`INTEGRATION_API` 仍是 2，`schemaVersion` 不动，
零迁移。patch 的 `vertices` 从三元组放宽成 ≥3 的多边形 —— 旧草稿照读，三个顶点的多边形
扇形化就是它自己）。

157 node（156 过 1 跳）／ 56 浏览器（55 过 1 跳）／ 包冒烟 11 项，全绿。

---

## 0.13 · Agent 能收起旧版本（已完成，未安装）

版本迭代到二十个之后，标签栏成了模型前面的一堵墙。Kelven 要的是：**在原本的对话里
跟 Agent 说「只显示最近三个」，Agent 就能做到，而且他不用关掉网页。**

**他的诊断是「锁限制得过分」，查下来不是。** `busyReason()` 只在**另一个对话**来发布时
才拦（`store.mjs`：`blocked = !mine && this.busyReason()`），他自己的 Agent 从不受他
开着页面影响。真正的原因是**根本没有这个动作** —— `server/` 与 `integration/` 全搜过，
没有任何代码能让一个版本离开列表（`versionInBinding` 是给换对话用的）。

所以在此之前唯一的办法是**从外面改 `state.json`**，而服务端把整份 state 拿在内存里、
每次 `save()` 整文件覆写 —— 于是那次编辑**跟服务端的保存赛跑**，只有页面停着才留得住。
「要关掉网页才行」是这么来的，不是锁。

- [x] **`retain` 动作**（agent 侧 `keep: <n>`，`keep: 0` 恢复全部）。**隐藏而非删除**：
      草稿、标记、已提交批次、文件全部原样留着，加大数字就原样回来。
- [x] **是规则不是一次性整理** —— 存在 `retainVersions` 里，之后每发布一版，最旧的自动
      退出显示，不用再问一次。
- [x] **三种情况压过规则**：屏幕上那一版、有人正在标的那一版、还有未提交标记的那一版。
      返回值用 `keptVisible` 逐条说明理由 —— **「最近三个」实际显示四个时要说出来**，
      不能报一个没发生的数字。
- [x] **不需要 presence 锁** —— 它不破坏任何东西。页面 2.2 秒轮询自己更新，
      **不用刷新、更不用关页面**（浏览器测试全程页面开着）。
- [x] CLI（`meshcue retain --keep 3`）、MCP、`reviewctl` 三个入口一起有。
      顺带给 CLI 补了数字类型声明 —— argv 全是字符串，`"3"` 传给要 `3` 的调用方会被
      当成类型错误拒绝，而那读起来像「值不对」。
- [x] SKILL.md 第 5 节教这个动作；第 7 节原本写「版本不得删除或覆写」，
      跟「可以隐藏」并存会自相矛盾，一并改成「不删不覆写，但用户要短一点时 `retain` 给得起」。

### 🔴 顺手抓到第二个 NUL 字节 —— 而且是我自己写的

`mcp/server.mjs:47` 用**真的 NUL 字节**当哈希输入的分隔符，不是 `\0` 转义 ——
跟 09-14 凌晨在 `server/index.mjs` 找到的那个一模一样，**这个是 0.9.0 我写 MCP server
时留下的**。`file` 判它是 binary，**grep 静默跳过**：我当天早些时候 grep 这个文件
「没有输出」，读成了「没有匹配」，正是我自己描述过的那种失败模式。

已修（先断言两种写法产生同一个字符串和同一个摘要，所以已有的 MCP owner id 不变）。
**加了 `tests/source-bytes.test.mjs`**：扫 9 个源码目录，任何文件含 NUL 或其他
控制字节即失败，并报出文件、行号、字节值。重新塞回那个 NUL 验证过它会当场红。

版本号 **0.13.0**（minor：新增 agent 能力；`INTEGRATION_API` 仍是 2，`schemaVersion`
不动，`retainVersions` 缺失即「无规则」，零迁移）。

160 node（159 过 1 跳）／ 58 浏览器（57 过 1 跳）／ 包冒烟 11 项，全绿。

### 0.13.1 · 装完重启后第一通 `retain` 就炸了

安装不替换已在跑的 server。0.13.0 装好、Gateway 重启之后，三个实例仍是 0.11.1 的
代码，`/retain` 这条路由在它们身上不存在 —— Express 回默认的 HTML 404，而
`ipc()` 直接把 `JSON.parse` 的异常原样抛回去。Agent 收到的是
`Unexpected token '<', "<!DOCTYPE "...`：读起来像响应损坏，却完全没提到唯一能解决
它的动作。`withServingVersion` 早就写好了那句话，但它只作用于成功的返回值，
抛错时整条绕过。

改成：非 JSON 响应按状态码判读，404 → `OLD_RUNTIME` + 「重新 open 这个项目」，
其余 → `BAD_RESPONSE` + 状态码。回归测试在 `tests/integration.test.mjs`，
已验证回滚修复即变红。顺手删掉 `mcp/server.mjs` 里 `keep` 的重复键（0.13.0 手滑，
运行时无害）。

161 node（160 过 1 跳）全绿。**这一条本身也要装了才生效** —— 它修的正是「装了没生效」
这件事的报错文案。

**同一次探测还暴露了第二条，比第一条严重。** `agentApp` 的活动中间件跑在**路由之前**，
`agentUse()` 又只看方法（非 GET/HEAD 且不是 `/maintenance`），所以那次 404 的 `retain`
**把 24 小时闲置时钟归了零** —— 测试项目从 9.42 小时退回 0，而 404 的响应里没有任何迹象。
方向正好反了：打不中的请求，恰恰就是新版 harness 发给旧 runtime 的那种，于是**最该被回收的
实例反而被续命**，一次一天。

改成在 `res.on("finish")` 里按 `req.route` 判定 —— 到达了处理器才算。handler 自己抛的
404（`No such submission`）照样算，因为那确实是 Agent 来干的活；只有没匹配上任何路由的
才不算。两条测试分别钉住这两面，回滚 `server/index.mjs` 验证过前者当场变红。

163 node（162 过 1 跳）全绿。这条在**服务端**层，所以重开项目就生效，不欠 Gateway 重启。

---

## 0.15 · 版本显示与「检查升级」（Kelven 2026-09-15 提出，仍在计划阶段，未动工）

Kelven 要的是：页面**右上角**显示当前 MeshCue 版本 + 一个「检查升级」按钮；开页面时自动检查，
有新版就在右上角闪；点按钮弹悬浮窗；**确认升级不执行任何脚本**，而是回到 Agent 会话，
由 Agent 引导代码审计与升级告示，用户向自己的 Agent 确认后才真的升级。
**位置已定：header 右上**（不是画布右上的方向立方那块）。

### 已拍板

| #   | 事项               | 决定                                                                                 | 时间            |
| --- | ------------------ | ------------------------------------------------------------------------------------ | --------------- |
| 1   | 上游版本源         | **GitHub 仓库**，直连开源地址 —— **不是 npm**（逐条比过，见下）                      | 09-15 22:35     |
| 2   | 什么时候激活       | **跟正式开源同一批**。当前开发中的非开源版本不做                                     | 09-15 22:35     |
| 3   | 仓库地址           | 公开时已定为 `github.com/lzyling/meshcue`，5 处写死的位置见下                        | 09-15 22:35     |
| 4   | **谁去拨这通电话** | **(b) Agent 查完经 agent socket 告知服务端** —— `server/` 保持零出网                 | **09-16 14:36** |
| 5   | **回传走哪条轨道** | **复用 submission**（不另开轻量路由），但**不复用 `createSubmission()`**，见下方实测 | **09-16 14:36** |

### 为什么是 GitHub 不是 npm（2026-09-15 两边都实打过）

|                       | npm registry                                                      | GitHub Releases                                  |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| 端点                  | `registry.npmjs.org/<pkg>/latest`                                 | `api.github.com/repos/<o>/<r>/releases/latest`   |
| 版本号                | ✅ `version`                                                      | ✅ `tag_name`                                    |
| **升级告示正文**      | 🔴 **没有** —— 实测顶层 30 个字段里零个 changelog／notes／release | ✅ `body`（markdown，样本 926 字符）+ `html_url` |
| **代码审计用的 diff** | 🔴 只有 tarball                                                   | ✅ 可拼 `compare/vA...vB`                        |
| 速率                  | ✅ CDN，`cache-control: max-age=300`，无任何限额头                | ⚠️ **60 次/小时/IP**                             |
| 报的版本一定装得上    | ✅ 按定义成立                                                     | ⚠️ 打了 Release 不等于产物可装                   |

**决定性的一条是 Kelven 自己的需求**：点确认之后「由 Agent 引导用户做**代码审计**和**版本升级告示**」。
**升级告示就是 Release 的 `body`，代码审计要的是 diff —— npm 两样都没有。**
选 npm 的话，告示正文最后还是得回 GitHub 拿，等于两个源。

**第二条**：今天真正被安装的东西**来自 git 不是 npm** ——
`build:integration` 从 checkout 打包拷进 `~/.openclaw/extensions/meshcue`。
npm 的版本号会在描述一个本机没人用的分发渠道；而且 npm 那条本身还没定、还卡在打包白名单上。

**GitHub 这边要认的代价（实测，别信「304 不计数」那个说法）**：
未认证 60 次/小时/IP，而**条件请求救不了** —— 连打 3 次带 `If-None-Match` 的请求全部回 304，
配额 56 → 53，**一次一个照扣**。（「304 免费」那条规则是对**已认证**请求说的。）
所以缓存必须做在**自己这边**，不能指望 ETag。按推荐的方案 (b)（Agent 拨号并缓存），
一个 Agent 几小时一次，这个限额碰都碰不到。

**唯一一处 npm 本来会更好**：它报的版本按定义一定装得上，而 GitHub 可以打出一个还没有可装产物的
Release。

### GitHub 是**唯一**源，即使将来发了 npm 也不加第二个

⚠️ **这条推翻了本节初稿里「远期版本源跟随『这一份是怎么装上来的』」那句。** 那句听起来体贴，
实际是在引入**两个可以互相矛盾的真相**：npm 说 0.16、GitHub 说 0.17 时，页面无论显示哪个
都在对另一半用户说假话。**一个略有滞后的真相，好过两个互相打架的真相。**

正确的解法不是加源，是**规定发布次序**：

> **先 `npm publish`，成功之后才打 GitHub Release。**

ℹ️ **2026-09-16 补**：npm 的结论已定为「**不发功能包，也不承诺以后发**」
（实测 `npx github:…` 本来就通，`private: true` 都不挡）。**npm 若始终不存在，
这条次序规矩就是空的，GitHub 作为唯一源无条件成立。** 下面两段只在真发了 npm 之后才需要。

这样 GitHub 的版本号**永远不会超前于任何一个渠道能给出的东西** —— 它是最后一步，
所以它一出现就代表「两边都拿得到了」。上面那条「产物可装了才打 Release」是同一条规矩的一般形式。

**要盯的一处**：如果将来决定「只有部分版本发 npm」（比如只发跟 MCP 相关的），
npm 就会合法地滞后，这条次序规矩失效，页面会向 npm 用户宣告一个他们还拿不到的版本。
**真要那么做之前先回来改这一节**，不要默默破例。

**⚠️ 另有一条比「地址未定」更硬的技术理由，2026-09-15 实测：**

```
GET api.github.com/repos/lzyling/meshcue            -> 404
GET api.github.com/repos/lzyling/meshcue/releases/latest -> 404
GET api.github.com/repos/lzyling/meshcue/tags        -> 404
```

私有仓下 GitHub API 对未认证请求一律回 **404**（不是 403 —— 它连仓库存在都不告诉你）。
所以**在转公开之前，这个功能连开发和联调都做不了**，除非往每个审阅实例里塞一个 GitHub token
——而那等于把凭据放进一个内网可达的服务里，跟 `SECURITY.md`「never asks for, stores or
displays host credentials」直接冲突。**技术上不可能提前，不只是「还没决定」。**

### 转公开时必须一起办的四件事（否则这个功能没有数据源）

1. 🔴 **得真的打 GitHub Release。** `/releases/latest` 读的是 Release 对象，不是 tag。
   现在是 **0 个 Release、1 个 tag**（`v0.4.0-rc.1`）。要么转公开后把「发版就打 Release」
   写进流程，要么改读 `/tags`（但那样拿不到升级说明正文）。
2. ⚠️ **删仓重建会连 tag 和 Release 一起删掉。** 所以这个功能的版本历史**从公开后的第一个
   Release 开始**，之前十几个版本在 GitHub 上不存在。这点要在升级说明里讲清楚，
   否则用户会以为自己漏了什么。
3. **地址写死的地方只有 4 处**（2026-09-15 实测，`package-lock.json` 里那些是依赖的赞助链接，不算）：
   · `package.json:9` `repository.url`
   · `adapters/openclaw/package.json:9` `repository.url`
   · `docs/zh/NAMING.md:30` 正文与链接
   · `.github/ISSUE_TEMPLATE/config.yml:4` 指向 `SECURITY.md` 的链接
   加上 `git remote origin`。**改名或换 org 就这 5 处一起改**；地址应当从
   `package.json` 的 `repository.url` 单一来源读出，不要再写第六处。
4. **速率限额：未认证 60 次/小时/IP**，而同一内网所有实例共享一个出口 IP。
   **必须缓存**（建议 TTL 数小时），不能每次开页面都打一次 —— 五个实例各自轮询就能把它打光。

### ✅ 已拍板：谁去拨这个电话 —— (b) Agent 拨（Kelven 2026-09-16 14:36）

- ~~(a) 审阅服务端直连 GitHub~~ —— 不采用。`server/` 至今**零出网**（实测），
  这会是它第一个对外连接；`SECURITY.md` 要新开一节「它往外打什么」，
  而且每个实例各打各的，速率限额压力乘以实例数。
- **(b) Agent 查，经 agent socket 告知服务端** —— **采用**。服务端仍然零出网；
  一个 Agent 一次调用、天然可缓存；而且 Agent 本来就是唯一能改变页面内容的东西，
  跟「点击后回到 Agent 会话」是同一条链路。

⇒ **由此固化成一条不变量**：`server/` 的出网连接数**恒为 0**。
上游版本号是被**告知**的，不是被**查询**的。将来任何人想在 `server/` 里加第一个
`fetch`，都要先回来推翻这一条。

### 🔴 先记三条查出来的事实，它们改变了这个需求的形状

1. **版本号今天根本没显示在页面上。** `.prototype` 元素在（`main.js:115`），
   文案 `app.preview` 在，六语翻译也都在 —— 但 **`style.css:1220` 一条无条件
   `display: none`** 把它和品牌副标题 `.brand span` 一起关掉了。那是 0.3「把高度让给模型」
   把 header 从 78px 压到 38px 时做的，但**压缩是无条件的，不是只在窄面板下**。
   1920×1080 实测 `getComputedStyle(.prototype).display === "none"`。
   连带三处死代码：`.app-header { height: 78px }`（`style.css:232`）被 1207 行的 38px 无条件盖掉；
   `.prototype` 的边框／圆角／内距样式不可达；800px 与 760px 两个 media query 里
   再次 `display:none` 它的规则也是死的。
   ⚠️ **`app.preview` 与 `app.tagline` 两个 key × 6 语 = 12 条翻译渲染不到任何地方**，
   而 `check:i18n` 报「all used」—— 它只看有没有被引用，**看不出元素被 CSS 关掉了**。
   这跟 0.12 ④「标题一直都在，只写在 `aria-label` 里」是同一类缺陷。
2. **「有没有新版本」有三种意思，今天只有一种答得出来。**

   |       | 意思                        | 能不能答            | 谁已经知道                                                                                                            |
   | ----- | --------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
   | A     | 网页 bundle vs 跑着的服务端 | ✅ 但没价值         | 同一个 release 出来的，恒等                                                                                           |
   | **B** | **跑着的 vs 本机已装的**    | ✅ **现成**         | `withServingVersion()`（`manager.mjs:518`）已算好；`installRoot` 也已传进服务端（`manager.mjs:318` → `index.mjs:97`） |
   | C     | 已装的 vs **上游发布的**    | ✅ **上游已有**     | 仓库已公开、Release 在打、`/releases/latest` 未认证可读；写这张表时还是「仓库私有、最后一个 tag 是 `v0.4.0-rc.1`」     |

   **B 就是 09-15 上午真咬人的那个**：装着 0.13.0、三个实例跑 0.11.1、`retain` 回 404，
   而页面一个字都没说。

3. **`server/` 从来没有出过网** —— 零个 `fetch`／`http.request`（唯二两处在 `manager.mjs`，
   打的是 localhost）。做 C 就要让内网审阅服务连互联网，安全文档得新开一节「它往外打什么」。

### 实测的空间（真实浏览器，6 语 × 5 个宽度）

| 视口                  | `.header-right` 宽（最宽语言 fr） | header 剩余 |
| --------------------- | --------------------------------- | ----------- |
| 1920                  | 829px                             | **958px**   |
| 1280                  | 829px                             | 318px       |
| 1100                  | 505px（标题已收起）               | 461px       |
| 900                   | 505px                             | 261px       |
| **460**（嵌入式面板） | 338px                             | **−8px**    |

1920 全屏（Kelven 的实际场景）空间充裕。但 **460px 今天就已经是 −8px** ——
靠 `min-width: 0` 的 flex 收缩兜住、没出横向滚动条，**但零余量**。
`.header-right` 上那句注释「Anything added here has to be able to give ground」
不是假设，是已经在兑现。

### 建议的切法：分两版

- [x] **B —— 已完成**（2026-09-17，随本轮界面六条一起做）。
      `/api/state` 每次轮询带上服务端自己算的 `version`，页面拿到就换掉编译期注入的
      `__MESHCUE_VERSION__`；**显示的是正在跑的那个**，构建版本只是它开口之前的占位。
      🔴 **位置与上面的计划不同，以实际为准**：Kelven 2026-09-17 要的是
      **紧挨 MeshCue 标题的小字**（`.brand-title`），不是 `.header-right`；
      原来那个带边框的 `.prototype` 大标签连同它的三条响应式规则一起删掉了。
      收缩阶梯也不再需要 —— 版本号只有几个字符，窄到 460px 都留着，
      让位的是副标题（`.brand > span`，选择器已收窄，否则会把版本号一起藏掉）。
- [x] **C（检查更新）· 告知那半已完成**（2026-09-21，Kelven 要求）。
      **拆开做的**：原计划「查上游 → 写进 state → 页面显示 → 点击回传 Agent」捆成一件事，
      而挡着的第三条前置（回传的触发机制）只挡**最后一步**。前三步不依赖它，已单独落地：
      `server/upstream.mjs` 查 `/releases/latest` → `/api/state` 带 `update` →
      页面在版本号旁挂一枚 `↑1.1.2` 徽标，`title` 写「让你的 Agent 更新 MeshCue」。
      **点击不回传**，只链到 Release 说明页；动作那步仍归下面那条搁置项，没有绕过它。
      🔴 **`server/` 从此不再是零出网** —— 这是它唯一的互联网请求，`SECURITY.md`
      新增「What it sends outward」一节逐条写明去哪、发什么、多久一次、怎么关。
      `REVIEW_UPDATE_CHECK=off`／`config.updateCheck: false` 关掉后回到零出网。
      懒触发（没人开页面就不查）、6 小时窗口、失败等 30 分钟且**不清掉上次结果**、
      失败**永不告诉审阅者**。比的是**已装版本**不是正在跑的版本（后者是 `serving` 回答的另一个问题）。
      ⚠️ **测试夹具全部显式关掉**（7 处 + `record-demo.mjs`），套件不许依赖互联网；
      `tests/browser/update.spec.js` 自起一个 loopback 假上游，**刻意不并进 review.spec.js**
      ——那边 70 个用例都该在关闭状态下跑，为一条用例全开是反的。

### 动工前必须先解决的坑

- ⚠️ **回传会撞已知的墙**：0.9 之后 notifier 的 `send` 是**可缺席**的（Codex 没有 push 原语）。
  没有 notifier 的宿主上，点了按钮**送不出去**，只能在页面上写「去跟你的 Agent 说一声」。
  这条**仍然成立**，也仍是「点一下就让 Agent 去装」唯一挡着的东西；
  09-21 做掉的是**告知**，徽标现在说的就是那句「去跟你的 Agent 说一声」。
- **闲置时钟必须归类**（`idle.mjs`）：开页面时的**自动检查绝不能算使用**
  （与 `/api/ready` 同类，正是 0.13.1 那个 bug）；**用户点击**是真手势，应该算。
- **不要挂在 `/api/health`** —— 它免鉴权。把「这个实例过期了」放那儿，等于告诉内网扫描器
  该拿哪个已知旧版本下手。走 `/api/state`，在 cookie 后面。
- **闪烁**：要 `prefers-reduced-motion`；要能被「知道了」停下来，不能永远闪；
  还要跟闲置回收的 `closing` 横幅、连接点一起想，别三处抢注意力。
- **回传轨道：已拍板复用 submission**（Kelven 2026-09-16 14:36）。理由成立 —— 重试／`stalled`／
  `waiting` 那套是 0.5 花了力气做出来的，另开一条轻量路由等于把「送不出去怎么办」再写一遍。

  🔴 **但拍板之后实测出一条：不能在 `createSubmission()` 里加 `kind` 分支。**
  那个函数是**焊死在标注草稿上**的，四道门里有三道对「升级请求」根本不成立：

  | `server/store.mjs`                                                   | 对升级请求会怎样                                       |
  | -------------------------------------------------------------------- | ------------------------------------------------------ |
  | `claim(versionId, clientId)` + `d.revision !== revision` → `SAVING`  | 升级请求跟版本／草稿无关，却被迫编一个 `revision` 出来 |
  | `if (!d.annotations.length && …)` → **`EMPTY` 400**（:658）          | 升级请求**零标注**，当场被拒                           |
  | **`markSubmitted(item)`（:688）**                                    | 🔴 **会把审阅者没送出的标注误标成已送出**              |
  | `attachManifest()`（`index.mjs:636`）读 `manifests/<versionId>.json` | 升级请求没有网格，却要挂一份 manifest                  |

  第三条是真会咬人的那条，不是接线麻烦而已：`markSubmitted` 把
  `draft.submittedRevision` 推到当前 `revision`，于是 `hasUnsubmitted()`（:332）当场变 `false`
  —— 而它正是**「你还有没交出去的标记」那道警告**和切版／`retain` 的闸门。
  **点一下「我要升级」，就把人家画了一半还没交的标注标成已经交了。**

  ⇒ 正确切法：**共用 outbox（投递／重试／`stalled`／`accepted`），但不共用 `createSubmission`。**
  把「落盘 + 入 outbox」从标注专属的那四道门里抽出来，标注提交和升级请求各走各的入口，
  在**同一条**投递管线汇合。连带要改的：
  · `notifier` 正文（`index.mjs:710` 现在是写死的标注措辞，升级请求要另一段，且**仍要说明它不是改模指令**）
  · `/api/state` 的 `revision` 归约（`store.mjs:423`，浏览器靠它恢复 submission id，别被无版本的记录污染）
  · `agentApp /submissions`（:1087）整份外露，`read`／`echo` 都假设有 `annotations`
  · SKILL.md ＋ `AGENT-INTERFACE.md`：Agent 拿到这一条时该做什么（**去查 GitHub**，不是去改模型）

- **i18n**：每条新文案 × 6 语；0.12 那条「三个下拉框字号必须完全相同」的断言还在。
- 顺带把①里那三处死代码清掉，并考虑给 `check:i18n` 补一条
  「被引用但渲染不出来」的检查 —— 否则下一个 `app.tagline` 还会这样躺着。

---

## 🛡️ 供应链防护 · 全面排查（Kelven 2026-09-16 00:47 要求：npm 占名那类风险还可能出现在哪）

**不是头脑风暴，是把仓库实际量了一遍。** 排查当天就发现**一个真实存在、但已被代码防住**的漏洞，
以及**三处我自己在 09-15 当天引入或推荐出来的新暴露面**。

### 已经做掉的（`.github/` 当场加固，零风险）

- [x] **CI 声明 `permissions: contents: read`** —— `on: pull_request` 会在这里**执行 fork 的代码**。
      默认 token 是只读的，但「默认」是一个仓库设置、有人能改；工作流自己写明需要什么，不继承。
- [x] **三个 action 全部按 commit SHA 固定**，不再按 `@v4`。
      **tag 是一个它的所有者可以移动的名字** —— `@v4` 等于「那个账号下次发布的任何东西」，
      这正是这份文件本来会替我们开的口子。注释里留了版本号，升级仍可读。
      （顺带记下：`v4` 之外已有 `v7`，跨大版本升级另作一次评估，不在这批。）
- [x] **CI 加 `npm audit --audit-level=high`**，`continue-on-error` —— 只报告，不拿别人的发版节奏卡我们的构建。
- [x] **加 `.github/dependabot.yml`** —— npm 每周、actions 每月。
      routine 归组成一个 PR，**安全修复单独一条**，不被埋在十个 bump 里。

### 🔴 排查当天就查出的真东西

**`image-size` 2.0.2 有一条 high 级公告**（ICNS 解析器无限循环 DoS），而**修复版 2.0.4 早就有了**。

- ✅ **够不着** —— `server/models.mjs` 有两道独立防线：启动时 `disableTypes()` 只留 png/jpg/webp，
  调用前再做一次字节签名校验。代码注释（第 117–118 行）当时就写明了这个已知问题。**防得很好。**
- 🔴 **但问题不在这里**：那两道防线是**承重的缓解措施**，写的时候「还没有补丁版本」。
  **补丁出来了，仓库里没有任何东西会告诉我们。** 锁文件把 2.0.2 钉死，`npm ci` 忠实照装，
  `^2.0.2` 那个范围永远不会被真正用到。
- **⇒ 待办**：升到 `2.0.4`，**但两道防线原样保留** —— 它们本来就该在，不是为这一个公告写的。

### 查过、结论是干净的

| 项                        | 实测                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------- |
| 锁文件 integrity 覆盖     | ✅ **141 个包，141 个都有** `integrity`                                                |
| 锁文件是否提交            | ✅ 已提交，CI 用 `npm ci` 而非 `npm install`                                           |
| 有安装期脚本的依赖        | 只有 **`esbuild`** 一个（`postinstall: node install.js`，拉平台二进制）—— 已知、可接受 |
| GitHub 同名重建会不会被抢 | ✅ **不会。** 自己账号下的 `<owner>/meshcue` 只有本人能建，删掉重建期间外人抢不走      |

### ⚠️ 还没做、必须做的（按性价比排）

- [ ] **`npx github:…` 这条安装路径本身没有不可变性** —— ⚠️ **这是我自己推荐出来的，代价要说清楚**：
      它执行的是**默认分支当下那一刻**的 `prepare`。仓库被攻陷一小时，这一小时里所有安装的人都中招。
      npm 至少版本不可变、带 `integrity`。
      **⇒ 文档必须写成固定到 tag 或 commit（`npx github:<owner>/meshcue#v0.16.0`），
      并在 Release body 里给出产物的 SHA-256。** 不要让「最省事的那条命令」就是最不安全的那条。
- [ ] **永不改名、永不转 org** —— 一旦改名或转移，**旧路径会变成别人可注册的**，
      GitHub 的重定向随即被接管（repojacking）。公开前那次「删仓 → 同名重建」不触发这条；
      **真要改名之前先回来读这一段。**
- [ ] **§0.15 那个功能本身就是投递渠道** —— 它的全部工作就是**劝人去升级**。
      地址错一次、或被接管一次，它就从提示变成攻击的扩音器。
      ⇒ 地址只能从 `package.json` 的 `repository.url` 单一来源读，
      **不允许被环境变量或运行时配置覆盖**；拿到的版本/链接在交给用户之前要校验是同一个 owner/repo。
- [ ] **Release 产物没有校验和、没有签名** —— 附件被换掉无从发现。
      最低成本做法：Release body 里贴 SHA-256。签名（minisign／cosign）成本更高，另议。
- ~~**npm 占名 placeholder**~~ —— **决定不做**（Kelven 2026-09-17）。三个名字
      `meshcue`／`meshcue-mcp`／`@lzyling/meshcue` 当天实测仍全部无人占用，但为占名要先注册
      npm 账号，而 npm 已把建账号收进网页，网页对机房 IP 一律回 403（实测：网页 403、
      `registry.npmjs.org` 200），整条路要为一个纯防御动作绕住宅 IP 折腾一轮。

      **留下的风险要说清楚**：这三个名字对任何人开放，将来有人发一个叫 `meshcue` 的包，
      而某个 Agent 猜一条 `npm i meshcue` 就会装到陌生人的东西。当前的缓解是**文档层面**：
      README 明写「不在 npm 上，这些名字不属于本项目，叫这个名字的包不是我们」，
      `AGENT-INTERFACE.md` 给的是钉了 tag 的 `github:` 安装式，SKILL.md §2 要求工具缺失时
      说清楚缺什么、**绝不猜命令**。

      **这扇门没关死**：项目真有人用之后随时可以回来占，代价只是那时的名字可能已经有人拿走。

---

## 1.1.0 · 整套画面标定重做 —— 已发布（2026-09-19）

起因是 GPT 子区做《头文字D》加油站时报「升级完模型仍然太亮」，并自行查了源码
（审计记录在 `projects/initial-d-gas-station/audits/2026-09-19-lighting-definition/`）。
1.0.2／1.0.3 修的都只是**没有材质的模型**；彩色模型一次都没碰过。

### 扫出六条

| # | 问题 | 处置 |
| - | ---- | ---- |
| 1 | 灰模 Plain 另写一套灰，1.0.3 之后比替补灰亮 2.34× | 合并成一个常数 `REVIEW_GREY` |
| 2 | ACES 的肩部把彩色模型压进 255 顶端 | 换 `NeutralToneMapping` |
| 3 | 三盏灯整体偏亮 | 曝光 1.3→1.0，平行光 ×0.42 |
| 4 | **把三盏灯一起调暗，彩色模型底面被砍一半** | 半球光只 ×0.85 —— 它是底面唯一的光 |
| 5 | **改灯作废了 1.0.3 那个灰** | 重解 `#7d878d`→`#cdd7dc` |
| 6 | 没有投影 | 本批不做，理由见末尾 |

第 4 条是**我在这一批里自己造出来又自己量出来的** —— 和 1.0.2 同一个形状：
修一端、压另一端。第一版把 `hemi/key/fill` 一起 ×0.55，顶面好了，
加油站底面从 116 掉到 48、bunny 从 147 掉到 69。
**底面只有半球光的地面色在照**，所以半球几乎不能动，要动的是两盏平行光。

第 5 条是这一批最容易被漏掉的：**灰不是被调的东西，被调的是它在屏幕上落到哪里。**
`#7d878d` 是在 ACES＋旧灯下解出来的；换了灯它掉到中位 83、底面 27，
直接退回最早那次投诉。`#cdd7dc` 是对着**同一个被批准的渲染结果**重解的。

### 实测（三类模型 × 两主题 × 两模式）

| 模型 | 指标 | 1.0.3 | 1.1.0 |
| ---- | ---- | ----: | ----: |
| 未上色件 | 中位／层次／对比 | 165.2 / 47.5 / 1.34 | **165.4 / 53.9 / 1.34** |
| 未上色件 | 底面 | 69.3 | **88.0** |
| 未上色件 | 灰模 vs 默认 | 亮 48 级 | **逐像素一致** |
| 加油站（130 材质） | 层次／饱和／对比 | 71.8 / 0.049 / 1.01 | **139.8 / 0.103 / 1.23** |
| bunny | 层次／饱和／对比 | 40.4 / 0.086 / 1.00 | **79.6 / 0.231 / 1.28** |

**被批准过的未上色件观感一个数没动**，底面还更亮。代价写明：彩色模型底面会降
（加油站 116→69.5、bunny 147→94.2），远高于「黑」，与未上色件同档。

### 三条新轨，每条都验过只咬自己那个缺陷

| 弄坏 | 只红 | 数值 |
| ---- | ---- | ---- |
| 三盏灯一起 ×0.55 | `the shaded side keeps enough light to read` | 底面 51.1→**37.7**（下限 45） |
| 退回 ACES | `a coloured model keeps the tone between its surfaces` | 残留色度 0.206→**0.133**（下限 0.15） |
| 灰模退回第二套灰 | `plain view leaves an already unpainted model alone` | 中位跳变 |

🔴 **第一次写的那两条是假的，别照抄**：TONE 原本量「层次」并把裁切收到 18%，
ACES 下照样绿；FLOOR 原本用未上色件，而那一类的灰是跟着灯重解的，永远不会掉。
**鉴别量必须落在会坏的那一类上** —— 底面要量**自带材质**的件，褪色要量**色度**不是亮度。

### 为什么不做投影

`GridHelper` 是线段、接不了投影，要做就得铺实心地板 —— 那是改舞台设计不是修缺陷；
60 万面上的阴影贴图另有性能问题。原本报的「平」主要是色调映射压出来的，
层次已经 71.8→139.8。要做另行评估。

### 版本号

`VERSIONING.md` 那行「用户可见表面实质变化 → minor」：每个模型的观感都变了，
**minor 1.1.0**，契约与磁盘 schema 一处未动。

## 1.0.3 · 替补灰太亮，把模型洗白了 —— 已发布（2026-09-19）

Kelven 实际用 1.0.2 之后报：「光照好似过曝晒咁样，模型非常之高亮」。**他是对的，
而这正是我在 1.0.2 之前量到过、又自己否掉的那条。**

### 我是怎么把它放过去的

1.0.2 的核对里我测出「任何让底部可读的方案都把模型推到 200–230、顶面对比从 1.40 掉到 1.01」，
然后拿 bunny 样例反证：它也算出接近 1.0，当了几个星期门面模型没人抱怨，所以判定指标失效。
**反证不成立** —— bunny 是奶油色有机造型，送审的是整件一个灰的 CAD 件，
靠明暗读边、圆角和分模缝。同一个数字，两种模型上的含义不一样。

更要紧的是机制问题：`lighting.spec.js` 只钉了**暗的那一端**（底视角不准出现近黑像素）。
一个只有下限的区间，修复可以一路冲过上限而**一条用例都不会红**。这才是它能发出去的原因。

### 改了什么

- **替补灰 `0xb9cbd0` → `0x7d878d`**。0.73 反照率对「未上色默认件」高得离谱
  （常见 0.5–0.6）；配这套灯（半球 2.6 + 主光 3.3 + 补光 2.0，曝光 1.3），
  顶面直接顶到 216/255，而浅色背景是 226。
  取值是 Kelven 从**真 app 渲的五档真实零件图**里挑的，不是我算出来的。
- **新增「不准洗白」断言**：开图视角取画面中央 40%（那里只有模型，没有工具栏、
  没有方向立方、没有地面），模型中位亮度与背景的差必须 **> 30**。
  `#b9cbd0` 实测 gap **10.6 → 红**，`#7d878d` gap **60.6 → 绿**。
  另带一条取景守卫（中央区落在背景上的像素 < 45%），万一将来构图变了，
  这条用例会直说「我量的不是模型了」，而不是默默去给背景打分。

### 为什么不是调灯或调背景

**顶到底的动态范围是灯光定死的，改反照率只是把那个窗口整体上下滑。**
实测（16E-v0.5，浅色）：

| 替补灰 | 顶面 | 顶面对比 | 底面 |
| ------ | ---- | -------- | ---- |
| `#b9cbd0`（1.0.2） | 216.4 | 1.05 | 98.9 |
| `#8b959b` | 183.9 | 1.22 | 60.6 |
| **`#7d878d`（1.0.3）** | **171.0** | **1.31** | **50.9** |
| *1.0.2 之前的金属观感* | *150.7* | *1.40* | *4.3（全黑）* |

所以这是一次取舍，不是一个能两头都最优的解。底面 50.9 距离「黑」（<25）还有一倍余量，
真 app 底视角实测 p01 **69.3**、近黑像素 **0%**。

⚠️ 只影响**没自带材质**的模型（trimesh 那类只写几何的导出）。
带材质的 GLB 仍旧显示作者自己的颜色，一个像素都没动。

## 1.0.2 · 从下面看，模型是黑的 —— 已发布（2026-09-18 20:1x）

> Release https://github.com/lzyling/meshcue/releases/tag/v1.0.2 ，latest；
> tag 与 `616359a` 均已推，CI 在 main 与 tag 上都绿。**发布 ≠ 在跑** —— 已开着的审阅实例
> 要重新 `open` 才换 server。

Kelven 2026-09-18 18:36 报：转到模型底下看细节时「漆黑一片」。
按 00:04 的新规矩办的第一批：先扫完同类、出完整清单，再一次修完。

### 根因：不是灯，是文件里没有材质

glTF 规定「没有材质的 primitive 用默认材质」，而那个默认材质是
**`metalness: 1, roughness: 1`** 的全金属。金属的漫反射是
`baseColor × (1 − metalness)` = **0**，于是**半球光对它完全无效** ——
而半球光是模型下方唯一的光源（key 在 `y=+7`、fill 在 `y=+3`，`scene.environment` 从未设过）。
只写几何、不写材质的导出器（trimesh 就是）产出的正是这种文件。

真 app 实测，同一个几何体只差有没有材质：

| 发布的模型               | 底视角近黑像素 | p01 亮度 |
| ------------------------ | -------------- | -------- |
| 带材质（仓库自带样例）   | 0%             | 83.8     |
| 剥掉材质                 | **19.7%**      | **0**    |

19.7% 是整个画面的比例，模型在那个角度大约占画面 20% —— 也就是**整个模型全黑**。

🔴 **这也是它躲过所有测试的原因：仓库三个样例夹具全都自带材质**
（`metallicFactor` 0 / 0.28），比真实送审的模型「健康」。
测试夹具比产品数据干净，就永远测不到产品的毛病。

### 做了什么

- **`declaresNoMaterials(data)`** 读 GLB 的 JSON 块，判据是**文件声明了什么**，
  不是加载后的材质长什么样 —— 真的想要裸金属的模型保留原样。
  命中就整棵树换成 `reviewGrey()`，也就是 STL 路径一直在用的那套
  （`0xb9cbd0 / roughness 0.6 / metalness 0.08`），两条路径现在共用同一个工厂。
- **地面不再穿模**：模型按最长边缩到三个单位并居中，所以高瘦模型的底会到 `-1.5`，
  而地面钉在 `-1.4` —— 它一直在切每一个站得比躺得高的模型。现在取
  `min(-1.4, 包围盒底 - 0.02)`，只在需要时让开，其余模型画面不变。
- **从下往上看时地面消失**：它是地板，不是架在模型底下的玻璃。
  站到它下面，它就不该在那儿（薄模型实测正下方被地面盖掉 6.07% 的模型像素）。
- `viewer.stats()` 增加 `ground: { y, visible }` —— 和 `background` 同一个理由：
  手工摆的东西，只有从里面才问得出它去了哪。

### 扫过、结论是干净的（本批不动）

- **`Fog(10, 35)` + `maxDistance 18`**：实测相机 6→18 距离模型均值 150.7→**158.8**，
  不降反升。不是缺陷。
- **方向立方**：26 个方向齐全、底面可点，功能正常。
  （它也正是一键就撞到全黑的原因 —— 问题在光照不在立方。）
- **标注在暗面**：`markMaterial` 是 `MeshBasicMaterial` + `toneMapped: false`，
  本来就不受光照影响；底面不黑之后这条自动消失。

### 两条我自己提出来、又被自己的测量推翻的

- ❌ **「补 IBL 环境贴图」** —— 不需要。带材质的样例模型**用现在这套灯光**
  底部就有 83.8，说明光照本身够用。加 IBL 会把所有模型推到 190–230，
  那是改视觉体系，不是修缺陷。
- ❌ **「浅色背景要调暗，否则轮廓糊」** —— 站不住。我的「顶部对比度」指标
  给 bunny 样例算出来也接近 1.0，而它当了几个星期的门面模型没人抱怨。
  指标没抓住真正让模型可读的东西（内部明暗梯度、地面、边缘抗锯齿），
  不能拿它去改主题。
- ⚠️ **「`setNeutral()` 上线起就哑火」** —— 说过头了。
  正确说法是：材质替补的线性色 `(0.485, 0.597, 0.631)` 与 neutral 写死的
  `(0.52, 0.56, 0.58)` 相差不到 0.05，所以在**没有材质的模型**上，
  中性显示本来就该几乎没有变化 —— 那是对的行为，不是坏掉。
  实测切换只动 1.3 个亮度级。`diffuseColor` 被 `(1 − metalness)` 乘掉这件事是真的，
  但它只在**作者真的写了高 metalness** 的模型上有可见影响，那不是这次报的问题。

### 验收

`tests/browser/lighting.spec.js`（真 app，不是替身页面）四条：
带材质的从下面可读、**不带材质的从下面可读**、带材质的模型颜色不被涂掉、
地面让开且从下方不出现。四条都**故意弄坏验证过会红**，且各自只咬自己那个修复。

夹具 `no-material-bracket.glb` 由 `npm run samples` 从 bracket 剥掉材质生成 ——
两个文件只差材质，别的全同。**这是唯一能让替补保持诚实的夹具形状。**

### 版本号判定

契约没破、磁盘 schema 没动、灯光／色调映射／配色／布局一处未改 ——
改的是「本来就该正常显示的模型终于正常显示了」，不是换一套视觉体系，
按 `VERSIONING.md` 属 **patch**。
但它在每一个 trimesh 导出的模型上都看得见，这点已向 Kelven 说明。

## 📋 下一批 · 1.1.0 之后（在 `dev` 上开工，**按新规矩批量处理**）

> 工作在 `dev`，`main` 只做 `--ff-only` 合并并紧接着打 tag；版本号在 `dev` 上带 `-dev`
> 后缀、发版提交才去掉。完整约定见仓库根的 `CONTRIBUTING.md`。
> **修一个缺陷不需要发版** —— 交给 Kelven 试的是 `npm run build:integration` 出来的包，
> 他用 `openclaw plugins install <路径>` 装，全程没有 tag、没有 Release。

> 新规矩（2026-09-18 00:04 立）：发现缺陷**先不修** → 按「同一类」把范围扫完出完整清单 →
> 批量修、一次验收 → 清单复跑为空**才**提版本号。起因是 1.0.0→1.0.1 期间连续三轮串行小修复，
> 三条本属同一类（「宣称过但从来没人验证过的东西」），本该一次收掉。

- ✅ ~~**`inspect` 报的版本是磁盘 manifest，不是加载进内存的那份代码。**~~ 1.3.1 已修（构建时写入版本）。
  2026-09-18 01:08 实测：磁盘装 1.0.1、`inspect` 回 `integrationVersion: "1.0.1"`，
  而 Gateway 里跑的仍是 0.16.2 的快照（同一次 `precheck` 还带着已删除的 `degradeAboveTriangles` 为证）。
  → Agent 问「你是哪个版本」，答案可以和它即将执行的行为对不上。**属于「报出来的 ≠ 真实的」那一类。**
- **dependabot #4（routine group）与 #5（vite 7.3.6 → 8.3.0，跨大版本）** —— 动的是真依赖。
  09-18 只合了三个 `github_actions` 标签的 action 升级 PR；这两个要本地拉下来跑完整套件、确认绿了再给 Kelven。
- **未查清 · 09-29 `799d144` 的 node 测试红过一次**：这个提交只改 TODO，CI「i18n, format, unit tests」里 `node --test` 退出码 1
  （84 秒，通过时约 80 秒，不是卡死）；同样代码的 `0e040b3` 两个任务全绿，两次浏览器测试都是 85 过、0 flaky。
  日志匿名拿不到（API 要仓库管理员权限、网页要登录），所以不知道是哪一条。本机正常跑 6 次、占满 CPU 跑 1 次都全过。
  **下次再红先看那次的日志**（要 Kelven 登录 GitHub 看，或给一个只读 Actions 的令牌），别凭猜改测试。
  排查时自己踩的坑：**别在同一个工作副本里并发跑两套 node 测试**——ci-build 的「版本漂移」测试会把另一套改过的
  `adapters/openclaw/package.json` 当原件恢复，留下 `0.0.1-drift`，之后单跑也红（第五轮踩到，已 `git checkout` 还原，没进任何提交）。
- ✅ ~~**已知具名 flaky**：`tests/browser/review.spec.js`「a mark arrives at its point instead of
  flying in from the corner」~~ —— **2026-09-29 查清：是真缺陷，已修。**
  `836f7d4`（只改 TODO）的 CI 三次重试都是 634.9 px —— 正好是标签还在图层原点（视图左上角）、
  没被摆到位时的距离。根源：标签每次标记变化都整层重建，重建跑在自己的 rAF 里；three 的渲染循环在上一帧末尾
  就登记了下一帧，排在前面，所以新标签在同一帧里「渲染之后才出生」，先以未定位的样子被画一帧，
  下一帧才摆到点上。本机 16 ms 看不出；CI 的 SwiftShader 一帧超过 120 ms 就被测到。
  本机加观察器实测：放两个标记再选中一个，5 次插入里 3 次是未定位的。
  修法：`setAnnotations` 建完标签当场调 `placePins()`（从 `render()` 拆出来的那段）；
  新测试「a mark is on its point the first time it is drawn」用 MutationObserver 数未定位的插入，
  不依赖帧速，修前稳定红、修后绿。`62374c4` 的 CI 恰好是绿的（74 过），偶发与否只看运行器快慢。
  教训：「本机过、CI 抖」的动效测试，先问它量到的是不是一帧真实的画面，再下「flaky」的结论。
- ✅ ~~`review.spec.js`「iteration: current-version download is original bytes…」整套跑时读到 0 个标记~~ ——
  **2026-09-29 第三轮查清：是测试等错了时机，不是缺陷**（`7822a0b`）。诊断里的 `versionId` 在开始加载时就变，
  这一版的草稿要等模型加载完才恢复；测试切回旧版后立刻数标记。整套跑时机器忙读到 0，单独跑 3/3 过；
  给该版模型下载加 2.5 秒延迟，「立即数」稳定得 0、等待后得 1。加载期间页面本来就盖着加载层，改成轮询等标记恢复。
- ✅ ~~`review.spec.js:149`「actual double click creates a surface pin; refresh restores it…」CI 上 reload 后 #loading 12 秒没隐藏~~ ——
  **2026-09-29 第四轮查清：是测试泄漏，不是产品缺陷**（`7f9e548`）。第三轮加的 `agent-name.spec.js` 前两条用 `browser.newContext()` 开页面却不关；
  `browser` 属于整个 worker，两个页面一直开到 worker 结束：模型在 SwiftShader 里每秒软件渲染 60 帧，还每 2.2 秒轮询一次。
  CI 只有 4 核，浏览器测试从约 8 分钟涨到 17.9／19.2 分钟（`7822a0b`、`9787241` 两次都是），lighting.spec 第一次被报慢（5.3 分钟），排在后面的这条 reload 超时。
  失败会重启 worker，泄漏的页面跟着没了，所以重试就过——「看起来像 flaky」就是这么来的。
  实证：在 agent-name 后面跑一个探针，浏览器里还开着 2 个上下文、2 个页面；修后 0。
  修法：agent-name.spec 在 afterEach 关掉自己开的上下文；新增 `tests/browser/fixtures.mjs`，所有浏览器测试文件改从它取 `test`，
  每条测试结束检查有没有留下 `browser.newContext()` 开的上下文，留了就关掉并判这条失败（没修的 agent-name 两条被它抓到）。修后 CI 浏览器测试 8.4 分钟、80 过、0 flaky。
  教训：CI 整体变慢和某条测试超时同时出现，先查后台是不是有东西在吃 CPU（泄漏的页面、没杀的子进程），再看那条测试本身。
- ~~**`release.yml` 那两条修复尚未被证实**~~ —— **✅ 1.0.2 发版时已读回实证，本条结案。**
  Release 正文与 tag 注解逐字一致（提交信息是完全不同的一句，静默回落会立刻露馅），
  结尾带着自动追加的 `This release is commit 616359a8…`。装机端到端也复验过：
  74 包、`prepare` 真跑、`inspect` 自报 1.0.2 且四份文档路径都在。
- **「检查更新」（§0.15 C）前置条件已满足**：仓库已 public，`/releases/latest` **未认证可读**（09-17 实测）。
  可以开发了；入口方案见 §0.15 C。
- **投影（1.1.0 留下的第 6 条）** —— `GridHelper` 是线段、接不了投影，要做就得铺一块实心地板，
  那是改舞台设计不是修缺陷；60 万面上的阴影贴图另有性能问题。1.1.0 把层次从 71.8 提到 139.8
  之后，原本报的「平」已经大为改善。**要做须单独评估，不要顺手加。**
- **画面标定的量具留在工作区**：`documents/meshcue/light-rig/`（`rig.html` + `rig.mjs` + 用法）。
  下次动灯光／色调映射／替补灰**先用它量**，`tests/browser/lighting.spec.js` 是它的固化结果、
  不能代替它做探索。

---

## 1.0 之后再评估 · 细分本身

R34 拆掉了 `degraded` 那一档，但 `reviewSurface()` 的中点细分**还在跑**。实测下来它对审阅者不产生任何可观察差别（标记读源拓扑，中点细分也不改变曲面形状），只是在大模型上多占 GPU 三角形 —— 35.2 万面那个球体多烧 8.6 万个。

所以它现在是纯开销。要不要连同 `surface.js`、`SURFACE_ALGORITHM`、manifest 里的`sourceTriangles`／`sourceFaces` 映射一起拆掉，**需要单独评估**：

- `source-v1`／`brush-v1` 老草稿的局部区域从存下的多边形渲染，不依赖细分；但 DEV-06 那几个  实例的磁盘数据要逐条确认才能下结论。
- `sourceFaces` 是「点到的三角形 → 源面」那一步的映射，**不能删**，只能在不细分时退化成恒等。
- 属于性能优化，不属于正确性，**1.0 不做**。

---

## 1.3.1 · 本批范围 —— 已发布（2026-09-25 00:25；范围 Kelven 2026-09-24 19:05–19:37 定）

> 判据照 `VERSIONING.md`：别人不用改自己的代码、不用迁数据 → patch。每项单独提交，做完一次验收。
> 细节留在各自原来的小节，这里只列范围和拍板结果。

**显示**
- [x] 点方位立方体顶／底面后右键旋转变样（Kelven 当天报）—— 见「审阅者的『上』传不到 Agent」。
- [x] **STEP 和 STL 一律按 +Z 朝上显示**（−Y 前、+X 右）；GLB 照 glTF 规范 +Y 朝上不动。
  Kelven 定：**MeshCue 统一 Z 朝上；模型朝向不对，由 Agent 发布前自己转**——所以不加 `up` 参数。
  旋转加在 `root`（适配变换）上：`space: "model"` 的区域汇总只合成到 `root` 为止、pin 是网格局部坐标，
  两者都不受影响；加在 `root` 以下会把旋转算进 Agent 读到的坐标。STL 是第一版起的默认「照原坐标」，
  文档从没写过，Kelven 选跟 STEP 一致；发版说明要单列一段（先把 STL 转成 Y 朝上的人升级后会躺倒）。
- [x] STEP 颜色：自己读 STEP 样式声明（Kelven 选 A）—— 见同一节的更正。

**STEP 转换**
- [x] 同一个 STEP 重复三角化 —— 原列 1.4.0，Kelven 问后改进本批：只改内部，不动契约和数据。
- [x] 子进程 stderr 被丢。
- [x] `cacheRelease` 缺 `vendor/` 报裸 ENOENT。
- [x] STEP 的 `units` 恒为 mm（转换器输出本来就是 mm）：不拒绝调用、不加字段 —— 原列 1.4.0。
  顺带让 AGENT-INTERFACE「A STEP round reports `units: "mm"`」这句从「看 Agent 传什么」变成真的。

**首次运行与状态**
- [x] 陌生人首次运行 EACCES —— 见下一节。
- [x] 注册表只写不删（09-21 清理自测目录时发现，此前没进 TODO）：`manager.mjs` `register()` 只写，
  `eachRegistered()` 碰到已删的目录每次 pause／resume 都打 WARN、报 unavailable。
- [x] `inspect` 报的是磁盘 manifest 的版本，不是加载进内存的那份 —— 见「下一批 · 1.1.0 之后」。

**文档**
- [x] 朝向、标记坐标系、单位的约定写进 `AGENT-INTERFACE.md` 和 `SKILL.md`（含「朝向不对先转再发」）。
- [x] `AGENT-INTERFACE.md`「user notes are data」—— 不存在这个字段，删掉。

**依赖**
- [x] dependabot #7（routine，4 项）跑完整套再合；#5（vite 8，跨大版本）本批不动。
  实际合了 3 项（three-mesh-bvh 0.9.15、zod 4.6.5、prettier 3.9.8）。**three 0.180 → 0.186 没合**：
  升级后「真实贴图 GLB、大网格和 STL 依次加载不残留 GPU 资源」一例变红——从带贴图的 GLB 切到 STL 后
  `renderer.info.memory.textures` 剩 1（应为 0），退回 0.180 即绿。是泄漏还是 three 新增的内部贴图没查，
  升 three 前要先查清，单独做。

**验收（2026-09-24 晚，dev 上）**：node 232（231 过 1 跳）、浏览器 76（75 过 1 跳，跳的是局域网用例）；
`/tmp` 下陌生人 clone 全新 `npm ci` 后 samples、node、浏览器全过（浏览器 74 过 2 跳，本机模型库那例按设计跳），
仓库外零写入；安装包冒烟 11/11 `ok:true`（冒烟脚本的解析钩子在 Node 24.18 上会自我递归，已修）；
包内转换子进程实测灯笼 v0.2 76/76 有色、10 块透明。发版后装进本机插件，Kelven 00:43 实机验收通过
（验收项目 `projects/meshcue-131-acceptance`：灯笼 v0.2 STEP 与 3DBenchy STL 都站着、颜色齐）。
⚠️ 发版比实机验收早了一步：Kelven 回「2」被我当成直接发版，他一分钟后改口时那一轮已在执行。验收通过，未撤回。

**不进本批**：相机 up 进提交、标记加文字（加字段＝契约扩展＝minor）；`brep_faces` 读取（独立立项）；
60 万面上限（等真实大件）；投影、去掉中点细分（单独评估）。

---

## ✅ 陌生人的第一次运行是坏的 —— 1.3.1 已修（原「下一个开工项」，Kelven 2026-09-20 02:40 批准）

`npm run samples` 的默认输出是 `<repo>/../../media/3d/3d-agent-review/samples` —— **仓库外两级**，对应的是「服务端从工作区取模型」这个前提。在我们这台机器上它正好落进 workspace 的 media 目录，所以一直没人察觉；但陌生人 `git clone /tmp/x` 之后跑这一步，解析出来是 `/media/3d/...`，**直接 EACCES**（2026-09-17 实测）。克隆到家目录下则会在他家目录里凭空造一个 `media/3d/3d-agent-review/`。

1.0.1 只做了两件**不动路径策略**的事：CI 补上 `npm run samples`，README 说明它写到哪。

🟢 **本条原先写着「`server/index.mjs` 那条媒体根是产品行为，实例都落在它上面，不能在发版当天动」—— 2026-09-20 实测推翻了它。**
三个在跑的实例（XR 外壳、色卡盒、加油站）`ps eww` 读出来 `REVIEW_WORKSPACE`、`REVIEW_DATA_DIR`、`REVIEW_MEDIA_DIR` **全部显式传值**；而且不是巧合，`integration/manager.mjs:507-509` 结构上永远会传。
**默认值只服务「陌生人裸跑一个 clone」这一条路径，够不到任何托管实例。** 风险比原先记的小得多。

**按「先扫完同类再批量修」，这一类就是 4 处默认值：**

| 位置 | 默认值 | 陌生人撞到什么 |
| ---- | ------ | -------------- |
| `server/index.mjs:37` | workspace = `repo/../..` | 服务起来了但看不到自己的模型 |
| `server/index.mjs:43` | mediaDir = workspace 下 `media/3d/3d-agent-review` | 同上 |
| `scripts/reviewctl.mjs:10` | 同一条 workspace 默认 | 手动 publish 找不到路 |
| `scripts/generate-samples.mjs:29` | 输出到仓库外两级 | **EACCES，第一步就死** |

⚠️ **真成本在测试夹具，不在这 4 行**：浏览器套件**没有**传 `REVIEW_WORKSPACE`，它靠的就是这条默认值去 publish `../../media/...`。所以改默认值必须连带改 `tests/helpers/review-server.mjs` 的 `file:` 前缀、浏览器 spec 里几处硬编码相对路径，以及 `scripts/record-demo.mjs`（1.1.1 新增，同样写死了这条相对路径）。

**验收**：跑满 node + 浏览器全套，再**模拟陌生人在 `/tmp` 下 clone 一次跑通** —— 这条是这批修复唯一真正的验收，本机跑通不算数。

---

## 1.3.0 之后 · STEP 直读留下的六条（发布评审时发现，2026-09-21 判定不进 1.3.0）

> **1.3.1 已修四条**：重复三角化、stderr、`vendor/` 守卫、`units`。仍开：`brep_faces`（独立立项）、面数上限（等证据）。

> 六条全部是 1.3.0 那次 STEP 支持带出来的，在发版前的自审里逐条记下。当时的判断是
> **不塞进 1.3.0**：红的那条（子进程写一半就死、`JSON.parse` 从 `close` 处理器里抛出去
> 打崩进程）已经修掉并随 1.3.0 发了，这六条没有一条是发布阻塞项。
>
> 排序按「**现在动得了吗**」，不按严重性 —— 前三条能直接开工，后三条不能。

### 能直接开工（缺陷）

- 🟡 **重发同一个 STEP 会整个重新三角化。** `server/models.mjs` 的 `importModel` 是先
  `await convertStepDetached`、再算源件哈希、最后才 `if (!fs.existsSync(meshTarget))` ——
  **去重发生在转换之后**。所以同一个文件重发照样烧满一次转换，而产物是同一份字节
  （73,132 面的三摄装配实测 8.6 秒；09-21 当天重开了四五次，每次都付）。再叠上
  `skills/meshcue-review/SKILL.md` 要求的「每次 `open` 前先 `precheck`」，
  **一个 STEP 轮次实际转两次，约 17 秒**。
  → 要收就得建「源件哈希 → 派生网格哈希」的索引，**动的是 `importModel` 的形状，
  不是顺手修**。注意派生网格的 `generator` 里嵌了版本号，所以这个索引必须带版本维度。
- 🟡 **子进程的 stderr 被丢掉。** `server/step.mjs` 的 `convertStepDetached` 用
  `stdio: ["pipe", "ignore", "ignore", "pipe"]`。那个库的噪声打在 **stdout**
  （`**** ERR StepFile ...`，答案因此才走 fd 3），所以 stderr 其实是条**干净可用**的通道，
  白白扔了。
  → 后果：子进程侧任何真实错误，回到调用方只剩一句
  `The STEP converter stopped without an answer (exit 1)`。09-21 那个
  `require2(...) is not a function`（vendor 被当 ESM 加载）就是因此多花了一小时。
  收一段 stderr 尾巴进错误消息即可，**十几分钟，纯收益**。
- 🟡 **`cacheRelease` 缺 `vendor/` 时抛的是裸 ENOENT。** `integration/release.mjs` 里
  `skills` 有 `existsSync` 兜底，1.3.0 新加的 `files(path.join(installRoot, "vendor"))` 没有。
  → 包不完整时报的不是这个模块统一的那句 `PACKAGE_INVALID`「nothing was started」，
  而是一条来自 `fs.readdirSync` 的 ENOENT。只在构建产物残缺时才碰得到 ——
  **而那正是最需要好错误信息的时候**。

### 不能直接开工

- 🟡 **`brep_faces` 写进 GLB 的 `extras` 了，但没人读。** `server/step.mjs` 的 `toGlb`
  把每个 mesh 的 BREP 面区间写进 `extras.brepFaces`（那个三摄装配有 5,584 个）。
  → **这是功能，不是缺陷**：它是为「标这个圆角面，而不是三角形 #4213」留的口子，
  而那种锚点**跨三角化精度稳定**，是 GLB／STL 路线根本拿不到的东西。
  要不要做取决于想不想要那个能力，**不该因为「在清单上」就做**。要做是独立立项。
  **2026-09-29**：1.4.0 的测量要读它（只读面归属，给吸附用），见顶部「1.4.0 · 开工前扫描」待拍板④；
  「标记锚到 BREP 面」那个能力仍是独立立项，不随 1.4.0 做。
- 🟡 **`units` 对 STEP 仍只取 agent 传的值。** 而 `convertStep` 写死
  `linearUnit: "millimeter"`，派生网格**恒为 mm** —— 服务端明明知道，却不用。
  → 改了等于让 agent 传的 `units` 在 STEP 上不再权威，**是接口语义变更，要先拍板**。
  （09-21 页面上能显示 `mm`，是因为发布时手动传了。）
- ⚪ **「面数爆掉」仍然证伪不了。** 485 个真实 STEP 里最大 73,132 面，离 60 万上限差一个
  数量级；deflection 拧到 `0.0001` 也才 133,036 面。
  → **这不是活，是等证据**：要一个接近上限的真实件才验得到，写代码解决不了。
  现在有 120 秒转换预算 ＋ `readAnswer` 的帧守卫兜着，不是裸奔。

### 版本形态的建议

能直接开工那三条里的**后两条**（stderr、vendor 守卫），加上 §🔜 那条 EACCES，
三条都是 bug fix，**合起来发 `1.3.1` 补丁版**就够。第一条（重复三角化）和 `units` 那条
要先定设计／拍板，是 `1.4.0` 的料；`brep_faces` 是独立立项。

> **不要为了清空这张清单而攒版本。** 09-21 那天 r1–r8 八轮证明：贵的不是发版
> （两个 commit 加一次 push），贵的是每一轮的「装包 → 重启／`open` → 人肉踩一遍」。
> 攒批省不掉任何一次验证，只会把「只在真包里现形」的意外堆到同一次，出事还难定位 ——
> 那天 r5 的哈希缺陷之所以二十分钟就揪出来，正因为那一轮只改了一件事。

---

## 待开发 · 审阅者的「上」传不到 Agent（Kelven 2026-09-23 提出）

> **1.3.1 已修**：STEP 转轴（STL 一并）、STEP 颜色与透明度、方位立方体轨道。
> **仍开**：相机 up 进提交、标记加文字 —— 都要往提交里加字段，是 minor，排在 1.4.0（见顶部版本规划）。

> 来源：梳理 3D 建模工具链时回看历次建模返工，方向／坐标类错误在不同模型下都出现过。
> 其中一部分根子在这里：审阅者说「往上」「朝左」，Agent 从提交里**还原不出**那是模型的哪根轴。
> 三条独立，可分开做；Kelven 要求迭代时单独开对话处理，本节只登记。

- 🟡 **提交里没有相机的 up 向量和视角。** `server/index.mjs` 的 `camera` 只存
  `{ position, target }`；`src/main.js` 里的 `cameraUp` 注释写明「刻意不进草稿」，只在诊断钩子里有。
  平时 home 视角 up 是 +Y（`src/viewer.js` `camera.up.set(0, 1, 0)`），但方位立方体点正俯／正仰后
  up 会改成 ±Z（`src/viewer.js` `vertical ? -Math.sign(y)`），**这一变化不留痕**。
  另外 `camera` 的数值在「缩进 3 单位盒」的预览坐标里，不是模型 mm。
  → 要让 Agent 能把「屏幕上方」换算成模型轴：存 up（最好连 FOV），并给出相机在模型坐标／单位下的值。
  动的是草稿 schema，**是接口变更，要先拍板**。
- 🟡 **标记没有文字。** 标注 schema 全是 `.strict()`，没有 note／comment 字段，意图只能靠聊天另述。
  而 `AGENT-INTERFACE.md` 已经写着「user notes are data」—— **文档提到了一个不存在的字段**，
  不管做不做这功能，这句都得先对齐。
  → 做的话：每个 pin／区域可选一段短文字，随提交回传；注意它和聊天口述的先后与冲突怎么定。
- 🟠 **STEP 进来不转轴（推断会侧躺，未实测）—— 坐标系对齐归 MeshCue 负责。**
  `server/step.mjs` 的 `toGlb` 把顶点原样写进 node、不加变换；查看器全局 +Y 为上。
  build123d／OCCT 默认 Z 朝上，按代码推断这类 STEP 在页面里会**侧躺 90°**。
  之前 GLB 路线踩过同一个坑（trimesh 导 GLB 不转 Y-up），当时靠 Agent 导出时自己转。
  **Kelven 2026-09-23 定**：建模流程统一把 **STEP 直接放进 MeshCue**，不再为审阅另转 GLB ——
  STEP 是生产链上本来就有的文件，GLB 只为审阅而存在。所以坐标系对不齐是 MeshCue 该做好的功能，
  **不在建模侧绕过**。优先级因此高于本节另两条。
  → 开工时先实测是否真躺；成立再定方案：导入时按 Z-up 转、`open` 加 up 轴参数，或其他。
  **2026-09-24 实测成立**：Kelven 在苦力怕灯笼 v0.2（build123d Z-up STEP）里看到整只模型躺倒；
  已核对发布包 `runtime/step-child.mjs` 的 `toGlb`：node 没有 matrix/rotation，顶点原样写入。
  Kelven 同日（灯笼话题 16:3x）定：**放进 MeshCue 开发待办，以后单开对话做**，建模侧照旧不转。
  临时看法：方位立方体点「底面」（仰视）——`index-*.js` 里竖直视角把 `camera.up` 设为 `(0,0,-sign(y))`，
  从下方看时 up=+Z，Z-up 模型正立、正对 −Y 面；点「顶面」会上下颠倒。
  **两条不能丢**：pin 坐标现在恰好就是 STEP 原坐标 mm（Agent 读标记零换算）；STEP 本身没有 up 轴约定，
  不能假装能自动判断。
  → 同时补**官方说明**：`AGENT-INTERFACE.md`／`SKILL.md` 写清查看器的 up 轴、STEP 的显示朝向约定、
  以及标记坐标处在哪个坐标系、什么单位，让任何 Agent 不用读源码就知道怎么对应。
  （2026-09-24 查：pin 由 `hit.object.worldToLocal` 存成**网格局部坐标**，所以只要旋转加在网格的
  上层——查看器里给 STEP 的 scene 加 −90° X，或 GLB 根节点——pin 坐标就不变。放在查看器里的好处是
  1.3.0 已发布的旧版本重新打开也会正过来，同一项目前后版本朝向一致。）
- 🟠 **颜色只认实体自己的，不继承上层（2026-09-24 实测）。** `toGlb` 只用 occt-import-js 给每个 mesh 的
  `m.color`；STEP 里颜色挂在多实体 compound 上时，下面的实体全没颜色、也没名字，页面显示灰色
  （灯笼 v0.2：76 块里只有 4 块有色）。建模侧已改成每块实体单独设色绕开；MeshCue 若要兼容，
  可在转换时沿装配树往上找颜色。另：`baseColorFactor` 的 alpha 被强制为 1，透明件显示成不透明。
  🔴 **2026-09-24 晚更正：上面的原因记错了，「往上找」救不回来。** 实测 v0.2 `exploded.step`：
  76 个 `MANIFOLD_SOLID_BREP` **每一个都有自己的 `STYLED_ITEM`**——颜色本来就在实体上，不在上层。
  是 occt-import-js 只读「零件（product／label）」一级和面一级的颜色，一个零件里多个实体各自的颜色
  它不读（同一文件 76 网格只有 4 个有 `color`，`brep_faces` 颜色 0 个；树节点本身不带颜色字段）。
  v0.3 每块实体单独成零件（83 个 PRODUCT）才 76/76 有色。npm 上最新就是现用的 0.0.23（2024-12），
  升级解决不了；许可方案 A 又定了库不改。要修只能**自己读 STEP 的样式声明**再对上网格。
  ~~透明度：灯笼这两份 STEP 里 `TRANSPARENCY` 为 0 条——文件里根本没写~~ —— **同晚再更正：查错了字符串。**
  实体是 `SURFACE_STYLE_TRANSPARENT`，v0.2 有 14 条、v0.3 也有（0.55）；透明度是真的被丢了，一并读。
  **Kelven 2026-09-24 19:29 定：选 A，进 1.3.1**——自己读 STEP 的颜色声明，按「零件 → 实体」顺序对上网格，
  数量对不上就退回现状；本机 485 个真实 STEP 回归，v0.2／v0.3 对照（几何相同，以 v0.3 颜色为准）。
  没选的 B 是只在文档里写「上色的实体各自单独成零件」。
  **实现后的实测（`server/step-styles.mjs`）**：本机 1024 个不同的 STEP 全部跑过，0 个出错；网格有色 6601 → 7896，
  465 块带透明度；库自己读到的颜色 0 块被改；两边都有色的 6578 块逐块比对 0 块不一致。v0.2 对 v0.3 按几何
  配对 74/74，颜色、透明度全部相同。对应关系靠「零件名 → 实体（含装配子件，按列出顺序）」，
  数量、逐个面数、库已读颜色三道核对任一不符就整节点不动。颜色要按 sRGB → 线性换算，库给的就是线性值。
  顺带查到、**不进本批**：①零件名含中文时库给回的名字是乱码（网格名因此也是）；②面级颜色
  （`STYLED_ITEM` 挂在 `ADVANCED_FACE` 上，本机 20 处）`toGlb` 一直不画，库读到的 `brep_faces` 颜色也没用上。
- 🟠 **点方位立方体的顶／底面之后，右键旋转整个变样（Kelven 2026-09-24 报）。**
  根因：`viewFrom()` 对竖直视角把 `camera.up` 改成 `(0,0,∓1)`，而 three 0.180 的 `OrbitControls`
  只在构造时按 `camera.up` 算一次轨道坐标系（`_quat`，`OrbitControls.js:404`），之后的旋转仍绕 +Y
  算、`lookAt` 却按新的 up——两套轴对不上。要一直到点侧面或回主视角把 up 改回 +Y 才恢复。
  → 修法：不再改 up，竖直视角改成「贴着正上／正下方、带一点点方位偏移」看，画面朝向与现在一样，
  轨道始终绕 +Y。**STEP 转正之后，「点底面把 Z-up 模型看正」这个临时办法也就不需要了。**

---

## 搁置 · 未定

- **STL 的颜色**（Kelven 2026-09-25 问起）—— STL 标准里没有颜色。非标准的二进制扩展（每个三角形的 2 个
  属性字节＋文件头 `COLOR=`，Magics 与 VisCAM 两种写法颜色位含义相反）three 的 `STLLoader` 读得出
  （`geometry.hasColors`），但查看器对 STL 一律用审阅灰（`src/viewer.js` STL 分支）。
  **要补的是文档**：AGENT-INTERFACE／SKILL 还没写「STL 一律灰，要颜色就发 STEP 或 GLB」，下次发版带上。
  要不要支持那个扩展：我建议不做（不统一、少见、容易显示错色），Kelven 未表态。
- **回传的触发机制** —— MCP 没有任何让 server 唤醒一轮对话的原语（协议级，不是某个客户端的问题）。
  **2026-09-29**：Claude Code 的 channels（研究预览）让 MCP 服务能把消息推进正在运行的会话，是第一条可行路子，见顶部「实测后两处修改」②。
  Kelven 09-29 18:05 定：列入后续版本（1.4.0 之后）单独立项；立项时一并准备申请进 Anthropic 官方 channel 名单的材料。
  阻塞等待 / 用户口述 / 系统通知三个方案都被否了，**等新思路**。
  在它定下来之前，Codex 侧只能做到「人说一句，Agent 才去读」。
- **`#feedback-status` 的最终归宿** —— 0.8.0 删底栏时跟着「交给 Agent」进了左栏，
  但它是否还是「我交出去了」最合适的常驻凭据，没有定论。
- **回显要不要带区域** —— `echo` 支持 `annotations` 并会在模型上画黄色高亮，
  但实际用法里一次都没带过。要么让它真的带，要么承认它只是文字。
