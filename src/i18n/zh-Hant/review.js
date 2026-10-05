export default {
  "review.loadingModel": "載入模型",
  "review.earlierVersion": "較早版本 · 仍可標記",
  "review.openElsewhere": "另一個視窗已開啟這一版",
  "review.current": "目前版本 · 可以標記",
  "review.notInReview": "此版本不屬於目前審閱。",
  "review.notMarked": "這一版尚未有標記。",
  "review.roundClosed": "這一版已結束；再標記即可重新開始。",

  "version.showingNow": "正在顯示",
  "version.earlier": "較早版本",
  "version.submitted": "已交 {count} 批",
  "version.openElsewhere": "另一視窗開啟中",
  "version.pinnedNotice": "你正在看較早的版本；最新的是 {version}。",
  "version.goLatest": "查看最新版本",
  "version.driftStopped": "有新版本送到，草稿已保留，並已停止自動切換。",

  "resume.text": "另一個視窗也開著這一版。",
  "resume.action": "在這部機器繼續標記",
  "resume.picked": "已接手原有草稿。",

  "recovery.text": "本機另有未同步草稿，已保留，未覆蓋目前版本。",
  "recovery.download": "下載草稿備份",
  "recovery.restored": "已還原未同步的草稿。",
  "recovery.backedUp":
    "未同步的草稿已另行備份，可下載交給 AI Agent；目前看到的是伺服器保存的版本。",
  "recovery.backedUp.named":
    "未同步的草稿已另行備份，可下載交給{agent}；目前看到的是伺服器保存的版本。",
  "recovery.paused":
    "本機儲存空間已滿。未同步的草稿已保護，編輯暫停；請下載備份交給 AI Agent。",
  "recovery.paused.named":
    "本機儲存空間已滿。未同步的草稿已保護，編輯暫停；請下載備份交給{agent}。",

  "echo.summary": "AI Agent 理解：{summary}",
  "echo.summary.named": "{agent}理解：{summary}",
  "echo.recall": "再看一次 AI Agent 的理解",
  "echo.recall.named": "再看一次{agent}的理解",
  "echo.dismiss": "收起",
  "echo.stale": "標注已更新，請在原對話更正理解",

  "outbox.reason": "原因：{message}",
  "outbox.reasonUnknown": "原因不明",
  "outbox.stuck":
    "有 {count} 批標記仍未送達 AI Agent（已重試 {attempts} 次，仍在嘗試）。{reason}。標記已保存在本機，請在原對話提一聲。",
  "outbox.stuck.named":
    "有 {count} 批標記仍未送達{agent}（已重試 {attempts} 次，仍在嘗試）。{reason}。標記已保存在本機，請在原對話提一聲。",
  "outbox.retrying":
    "有 {count} 批標記尚未送達 AI Agent，重試中（第 {attempts} 次）。{reason}。標記已保存，不需要重新標記。",
  "outbox.retrying.named":
    "有 {count} 批標記尚未送達{agent}，重試中（第 {attempts} 次）。{reason}。標記已保存，不需要重新標記。",

  "feedback.default": "標記會帶上三維位置與目前版本",
  "feedback.notSubmitted": "未提交 · 草稿會自動保存",
  "feedback.sentCount": "已送出 {count} 個標記",
  "feedback.delivered": "已送達原對話",
  "feedback.acceptedPending": "已接納，投遞待確認",
  "feedback.deliveryUnconfirmed": "投遞未確認，會重試",
  "feedback.read": "AI Agent 已讀取",
  "feedback.read.named": "{agent}已讀取",
  "feedback.unread": "等待 AI Agent 讀取",
  "feedback.unread.named": "等待{agent}讀取",
  "feedback.alsoUnsubmitted": "；另有改動尚未提交",
  "feedback.submit": "交給 AI Agent",
  "feedback.submit.named": "交給{agent}",
  "feedback.submitting": "提交中…",
  "feedback.submitted":
    "標記已保存；提交狀態以實際回執為準。您可以繼續標記此版本。",

  "receipt.next": "AI Agent 的理解會顯示在模型右下角",
  "receipt.next.named": "{agent}的理解會顯示在模型右下角",
  "receipt.understood": "AI Agent 的理解已在 {time} 送到，見模型右下角",
  "receipt.understood.named": "{agent}的理解已在 {time} 送到，見模型右下角",
  "receipt.nudge":
    "AI Agent 收不到自動通知，請回到它的對話裡說一聲，可以直接貼上這句：",
  "receipt.nudge.named":
    "{agent}收不到自動通知，請回到它的對話裡說一聲，可以直接貼上這句：",
  "receipt.line":
    "我在 MeshCue 交了 {count} 個標記，請用 meshcue read 讀取：project {project}，submissionId {submission}",
  "receipt.lineNoProject":
    "我在 MeshCue 交了 {count} 個標記，請用 meshcue read 讀取：submissionId {submission}",
  "receipt.copy": "複製",
  "receipt.copied": "已複製",
  "receipt.copyTitle": "複製這句話",
  "receipt.copyFailed": "無法複製：已選取這句話，請自行複製",
  "receipt.listJoin": "、",
  "receipt.chatSent":
    "📐 已收到 {count} 個標記（{marks}），已交給 AI Agent，正在讀取……",
  "receipt.chatSent.named":
    "📐 已收到 {count} 個標記（{marks}），已交給{agent}，正在讀取……",
  "receipt.chatRead":
    "📐 已收到 {count} 個標記（{marks}），AI Agent 已讀取，正在理解……",
  "receipt.chatRead.named":
    "📐 已收到 {count} 個標記（{marks}），{agent}已讀取，正在理解……",
};
