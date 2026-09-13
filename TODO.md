# MeshCue · 待办

**下一步：0.10 英文化。0.9 六组已全部完成，等 Kelven 验收后整段移进 `ROADMAP.md`。**

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

## 0.10 · 英文化（开源的前置条件）

定调：**英文为主、中文为辅；中文一律简体**，不用繁体、不用口语化粤语。
界面 i18n 已有 6 本（含 `zh-Hans`），这块不用重做。

- [ ] README · AGENT-INTERFACE · SECURITY · `skills/meshcue-review/SKILL.md` —— **必须英文**
- [ ] 服务端约 105 条硬编码中文消息**接进 i18n**（这是代码改动，不是翻译；
      三种受众：浏览器、Agent、日志）
- [ ] 其余设计文档移进 `docs/zh/`，README 指过去，保持中文（简体）
- [ ] 界面的 `zh-Hant` **保留** —— 给台港用户，已经写好了，删掉是倒退

**从现在起的规矩**：新的用户可见字符串一律写进 i18n，不再硬编码中文。
否则这笔账只会越欠越大。

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
