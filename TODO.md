# MeshCue · 待办

**下一步：0.9 第 1 组 —— 把「身份」从一条聊天路由改成「拥有者 + 可选回传」。**

这份是「接下来做什么」的唯一清单。做完的整段在版本发布时移进 `ROADMAP.md`（历史记录），
版本号怎么定见 `VERSIONING.md`。没有归属版本、也还没想清楚的，一律进最后那节，不要散落在别处。

---

## 0.9 · 核心与 harness 解耦

**不叫「Codex 兼容」** —— 目标是核心不再知道任何 harness 的名字，Codex／Claude Code／
国内那批都只是消费者。`REQUIREMENTS.md` R16 早就写下「共用核心，各平台分别包装」，这一版兑现它。

完整方案、实读到的现状、风险与「明确不做」见 **`ITERATION-V09-PLAN.md`**。

- [ ] **组 1 · 身份改成「拥有者 + 可选回传」** ——
      `server/origin.mjs` 现在是 `discriminatedUnion("channel", [webchat, telegram])`，
      **身份被建模成一条 OpenClaw 聊天路由**。拆成 `owner`（人人都要）与 `route`（只有推送型有），
      `HOST_CONTEXT` 随之收缩；旧 origin 走宽容读取，不迁移磁盘。
- [ ] **组 2 · 通知器变成能力接口** —— bridge 做的是**两件事**：`send`（带代际围栏，不能丢）
      与 `history`（读回对话推断送达）。两个都要能缺席。
      ⚠️ 无通知器时提交是「等 Agent 来取」，**不是投递失败** —— 否则 `STALL_AFTER=20` 会永远误报。
- [ ] **组 3 · 拔掉剩下的名字** —— `z.literal("openclaw")`、`release.mjs:21` 读
      `openclaw.plugin.json`、bridge 里的「找不到 openclaw 指令」文案。
- [ ] **组 4 · `meshcue` CLI** —— manager 的命令行外壳，**所有 harness 的共同底座**。
- [ ] **组 5 · MCP server** —— 建在组 4 之上；`instructions` 由 `skills/meshcue-review/SKILL.md` 生成。
- [ ] **组 6 · OpenClaw 适配器改调同一条底座** —— 不能省，省了就是两套路径、其中一套没人测。

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
