export default {
  "review.loadingModel": "モデルを読み込み中",
  "review.earlierVersion": "以前のバージョン · 印は付けられます",
  "review.openElsewhere": "別のウィンドウがこの版を開いています",
  "review.current": "現在のバージョン · 印を付けられます",
  "review.notInReview": "このバージョンは現在のレビューに含まれていません。",
  "review.notMarked": "このバージョンにはまだ印がありません。",
  "review.roundClosed":
    "この回は終了しました。もう一度印を付けると新しい回が始まります。",

  "version.showingNow": "表示中",
  "version.earlier": "以前のバージョン",
  "version.submitted": "{count} 件送信済み",
  "version.openElsewhere": "別ウィンドウで表示中",
  "version.driftStopped":
    "別のバージョンが届きました。下書きは保持し、自動切り替えを停止しました。",

  "resume.text": "別のウィンドウでもこの版を開いています。",
  "resume.action": "この端末で続けて印を付ける",
  "resume.picked": "既存の下書きを引き継ぎました。",

  "recovery.text":
    "この端末に未同期の下書きがあり、保持しました。現在のバージョンは上書きしていません。",
  "recovery.download": "下書きのバックアップをダウンロード",
  "recovery.restored": "未同期の下書きを復元しました。",
  "recovery.backedUp":
    "未同期の下書きは別途バックアップしました。エージェント向けにダウンロードできます。現在はサーバーが保存した版を表示しています。",
  "recovery.backedUp.named":
    "未同期の下書きは別途バックアップしました。{agent}向けにダウンロードできます。現在はサーバーが保存した版を表示しています。",
  "recovery.paused":
    "ローカル保存領域が一杯です。未同期の下書きは保護し、編集を一時停止しました。バックアップをダウンロードしてエージェントにお渡しください。",
  "recovery.paused.named":
    "ローカル保存領域が一杯です。未同期の下書きは保護し、編集を一時停止しました。バックアップをダウンロードして{agent}にお渡しください。",

  "echo.summary": "エージェントの理解：{summary}",
  "echo.summary.named": "{agent}の理解：{summary}",
  "echo.recall": "エージェントの理解をもう一度見る",
  "echo.recall.named": "{agent}の理解をもう一度見る",
  "echo.dismiss": "しまう",
  "echo.stale": "印が変わりました。元の会話で理解を訂正してください",

  "outbox.reason": "理由：{message}",
  "outbox.reasonUnknown": "理由不明",
  "outbox.stuck":
    "{count} 件がまだエージェントに届いていません（{attempts} 回再試行、継続中）。{reason}。印はこの端末に保存済みです。元の会話で一言お伝えください。",
  "outbox.stuck.named":
    "{count} 件がまだ{agent}に届いていません（{attempts} 回再試行、継続中）。{reason}。印はこの端末に保存済みです。元の会話で一言お伝えください。",
  "outbox.retrying":
    "{count} 件がまだエージェントに届いていません。再試行中（{attempts} 回目）。{reason}。印は保存済みで、付け直す必要はありません。",
  "outbox.retrying.named":
    "{count} 件がまだ{agent}に届いていません。再試行中（{attempts} 回目）。{reason}。印は保存済みで、付け直す必要はありません。",

  "feedback.default": "印には 3D の位置と現在のバージョンが付きます",
  "feedback.notSubmitted": "未送信 · 下書きは自動で保存されます",
  "feedback.sentCount": "送った印：{count} 件",
  "feedback.delivered": "元の会話に届きました",
  "feedback.acceptedPending": "受理済み、配信は未確認",
  "feedback.deliveryUnconfirmed": "配信未確認、再試行します",
  "feedback.read": "エージェントが読みました",
  "feedback.read.named": "{agent}が読みました",
  "feedback.unread": "エージェントの読み取り待ち",
  "feedback.unread.named": "{agent}の読み取り待ち",
  "feedback.alsoUnsubmitted": "。未送信の変更がほかにもあります",
  "feedback.submit": "エージェントへ送る",
  "feedback.submit.named": "{agent}へ送る",
  "feedback.submitting": "送信中…",
  "feedback.submitted":
    "印を保存しました。送信状況は実際の受領確認に従います。このバージョンへのマーキングは続けられます。",

  "receipt.next": "エージェントの理解はモデルの右下に表示されます",
  "receipt.next.named": "{agent}の理解はモデルの右下に表示されます",
  "receipt.understood":
    "エージェントの理解が {time} に届きました（モデルの右下）",
  "receipt.understood.named":
    "{agent}の理解が {time} に届きました（モデルの右下）",
  "receipt.nudge":
    "エージェントには自動では通知されません。その会話でひとこと伝えてください。次の文をそのまま貼り付けられます：",
  "receipt.nudge.named":
    "{agent}には自動では通知されません。その会話でひとこと伝えてください。次の文をそのまま貼り付けられます：",
  "receipt.line":
    "MeshCue で印を {count} 件送りました。meshcue read で読んでください：project {project}、submissionId {submission}",
  "receipt.lineNoProject":
    "MeshCue で印を {count} 件送りました。meshcue read で読んでください：submissionId {submission}",
  "receipt.copy": "コピー",
  "receipt.copied": "コピーしました",
  "receipt.copyTitle": "この文をコピー",
  "receipt.copyFailed":
    "コピーできませんでした。文を選択したので、手動でコピーしてください",
  "receipt.listJoin": "、",
  "receipt.chatSent":
    "📐 印を {count} 件受け取りました（{marks}）。エージェントに渡し、読み取り中です……",
  "receipt.chatSent.named":
    "📐 印を {count} 件受け取りました（{marks}）。{agent}に渡し、読み取り中です……",
  "receipt.chatRead":
    "📐 印を {count} 件受け取りました（{marks}）。エージェントが読み取り、意図を理解しているところです……",
  "receipt.chatRead.named":
    "📐 印を {count} 件受け取りました（{marks}）。{agent}が読み取り、意図を理解しているところです……",
};
