export default {
  "review.loadingModel": "加载模型",
  "review.earlierVersion": "较早版本 · 仍可标记",
  "review.openElsewhere": "另一个窗口已打开这一版",
  "review.current": "当前版本 · 可以标记",
  "review.notInReview": "此版本不属于当前审阅。",
  "review.notMarked": "这一版尚未有标记。",
  "review.roundClosed": "这一版已结束；再标记即可重新开始。",

  "version.showingNow": "正在显示",
  "version.earlier": "较早版本",
  "version.submitted": "已交 {count} 批",
  "version.openElsewhere": "另一窗口打开中",
  "version.pinnedNotice": "你正在看较早的版本；最新的是 {version}。",
  "version.goLatest": "查看最新版本",
  "version.driftStopped": "有新版本送到，草稿已保留，并已停止自动切换。",

  "resume.text": "另一个窗口也开着这一版。",
  "resume.action": "在这台机器继续标记",
  "resume.picked": "已接手原有草稿。",

  "recovery.text": "本机另有未同步草稿，已保留，未覆盖当前版本。",
  "recovery.download": "下载草稿备份",
  "recovery.restored": "已恢复未同步的草稿。",
  "recovery.backedUp":
    "未同步的草稿已另行备份，可下载交给 AI Agent；当前看到的是服务器保存的版本。",
  "recovery.backedUp.named":
    "未同步的草稿已另行备份，可下载交给{agent}；当前看到的是服务器保存的版本。",
  "recovery.paused":
    "本机存储空间已满。未同步的草稿已保护，编辑暂停；请下载备份交给 AI Agent。",
  "recovery.paused.named":
    "本机存储空间已满。未同步的草稿已保护，编辑暂停；请下载备份交给{agent}。",

  "echo.summary": "AI Agent 理解：{summary}",
  "echo.summary.named": "{agent}理解：{summary}",
  "echo.recall": "再看一次 AI Agent 的理解",
  "echo.recall.named": "再看一次{agent}的理解",
  "echo.dismiss": "收起",
  "echo.stale": "标注已更新，请在原对话更正理解",

  "outbox.reason": "原因：{message}",
  "outbox.reasonUnknown": "原因不明",
  "outbox.stuck":
    "有 {count} 批标记仍未送达 AI Agent（已重试 {attempts} 次，仍在尝试）。{reason}。标记已保存在本机，请在原对话提一声。",
  "outbox.stuck.named":
    "有 {count} 批标记仍未送达{agent}（已重试 {attempts} 次，仍在尝试）。{reason}。标记已保存在本机，请在原对话提一声。",
  "outbox.retrying":
    "有 {count} 批标记尚未送达 AI Agent，重试中（第 {attempts} 次）。{reason}。标记已保存，不需要重新标记。",
  "outbox.retrying.named":
    "有 {count} 批标记尚未送达{agent}，重试中（第 {attempts} 次）。{reason}。标记已保存，不需要重新标记。",

  "feedback.default": "标记会带上三维位置与当前版本",
  "feedback.notSubmitted": "未提交 · 草稿会自动保存",
  "feedback.sentCount": "已送出 {count} 个标记",
  "feedback.delivered": "已送达原对话",
  "feedback.acceptedPending": "已接纳，投递待确认",
  "feedback.deliveryUnconfirmed": "投递未确认，会重试",
  "feedback.read": "AI Agent 已读取",
  "feedback.read.named": "{agent}已读取",
  "feedback.unread": "等待 AI Agent 读取",
  "feedback.unread.named": "等待{agent}读取",
  "feedback.alsoUnsubmitted": "；另有改动尚未提交",
  "feedback.submit": "交给 AI Agent",
  "feedback.submit.named": "交给{agent}",
  "feedback.submitting": "提交中…",
  "feedback.submitted": "标记已保存；提交状态以实际回执为准。您可以继续标记此版本。",

  "receipt.next": "AI Agent 的理解会显示在模型右下角",
  "receipt.next.named": "{agent}的理解会显示在模型右下角",
  "receipt.understood": "AI Agent 的理解已在 {time} 送到，见模型右下角",
  "receipt.understood.named": "{agent}的理解已在 {time} 送到，见模型右下角",
  "receipt.nudge":
    "AI Agent 收不到自动通知，请回到它的对话里说一声，可以直接粘贴这句：",
  "receipt.nudge.named":
    "{agent}收不到自动通知，请回到它的对话里说一声，可以直接粘贴这句：",
  "receipt.line":
    "我在 MeshCue 交了 {count} 个标记，请用 meshcue read 读取：project {project}，submissionId {submission}",
  "receipt.lineNoProject":
    "我在 MeshCue 交了 {count} 个标记，请用 meshcue read 读取：submissionId {submission}",
  "receipt.copy": "复制",
  "receipt.copied": "已复制",
  "receipt.copyTitle": "复制这句话",
  "receipt.copyFailed": "复制不了：已选中这句话，请自行复制",
  "receipt.listJoin": "、",
  "receipt.chatSent":
    "📐 已收到 {count} 个标记（{marks}），已交给 AI Agent，正在读取……",
  "receipt.chatSent.named":
    "📐 已收到 {count} 个标记（{marks}），已交给{agent}，正在读取……",
  "receipt.chatRead":
    "📐 已收到 {count} 个标记（{marks}），AI Agent 已读取，正在理解……",
  "receipt.chatRead.named":
    "📐 已收到 {count} 个标记（{marks}），{agent}已读取，正在理解……",
};
