# MeshCue · 待办

**下一步：等 Kelven 决定装不装 0.11.0。已完成，未安装。**

0.9／0.10 已随 **0.10.1** 安装并经 Gateway 重启生效（09-14 13:14 复核：`running` = `installed` = 0.10.1，`integrationApi` 2）。

这份是「接下来做什么」的唯一清单。做完的整段在版本发布时移进 `ROADMAP.md`（历史记录），
版本号怎么定见 `VERSIONING.md`。没有归属版本、也还没想清楚的，一律进最后那节，不要散落在别处。

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

留着没做、并且是有意的两处中文：`check-i18n.mjs`（CJK 正则与解释它的注释）、
`sidebar-e2e.mjs`（**已取消的 Control UI 侧栏**的 E2E 脚本，09-09 之后没动过 ——
给一个不存在的功能翻译脚本，是花力气把自己弄得像做完了）。**它其实该删，等你一句话。**

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
153 node（152 过 1 跳）／ 55 浏览器 ／ 包冒烟 11 项，全绿。

---

## 转公开前（时机由 Kelven 定，本节在公开时删除）

本节的详细清单与已核实事实，在内部开发日志里，不必重查。

- [ ] 历史重写：清掉 `evidence/` 与内部工作笔记（`evidence/` 自 0.8.3 起已不再进新提交）
- [ ] 删远端仓 → 同名重建 → 推 → 网页复核 → 才转 public
      （force-push 清不掉服务器上的旧对象，所以必须删仓重建）
- [ ] 重新加一次 deploy key（删仓会连带删掉）
- [ ] **复核两份安全文档对代码是否仍然成立** —— 发一份过时的安全文档比不发更糟
- [ ] 加 `.github/`：CI（现有 125 个 node 测试没跑 CI）、issue 模板、SECURITY.md
- [ ] 决定要不要发 npm（现在两个 manifest 都是 `private: true`）

---

## 搁置 · 未定

- **回传的触发机制** —— MCP 没有任何让 server 唤醒一轮对话的原语（协议级，不是某个客户端的问题）。
  阻塞等待 / 用户口述 / 系统通知三个方案都被否了，**等新思路**。
  在它定下来之前，Codex 侧只能做到「人说一句，Agent 才去读」。
- **`#feedback-status` 的最终归宿** —— 0.8.0 删底栏时跟着「交给 Agent」进了左栏，
  但它是否还是「我交出去了」最合适的常驻凭据，没有定论。
- **回显要不要带区域** —— `echo` 支持 `annotations` 并会在模型上画黄色高亮，
  但实际用法里一次都没带过。要么让它真的带，要么承认它只是文字。
