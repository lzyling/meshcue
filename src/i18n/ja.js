/* 日本語。ツール名は並べて置かれるため短くしています（「消しゴム」など）。
   括弧は全角（）、引用は「」を使い、半角の " は文字列を切ってしまうので避けます。 */
export default {
  "app.tagline": "3D モデルのレビューと注記",
  "app.preview": "プレビュー {version}",

  "common.close": "閉じる",
  "common.version": "バージョン",

  "conn.connecting": "接続中",
  "conn.origin": "元の会話に返信します",
  "conn.collect": "エージェントが取りに来ます",
  "conn.local": "ローカルレビュー",
  "conn.returnToChat": "元の会話に戻る",
  "conn.paused": "接続を一時停止しました",
  "conn.accessExpired": "アクセス期限切れ · 下書きは保持",
  "conn.noAccess": "レビュー権限がまだありません",
  "conn.offline": "サービスが停止しています",
  "conn.connectedNoAccess":
    "ワークベンチに接続しました。アクセスが許可されるまでモデルは読み込まれません。",
  "conn.dropped": "サービスとの接続が切れました。下書きは保持されます。",
  "conn.actionFailed": "操作は完了しませんでした。",
  "conn.noSecureRandom":
    "このブラウザには安全な乱数生成がありません。最新版の Chrome または Edge をご利用ください。",

  "error.empty": "まずピンを置くか領域を塗ってください",
  "error.saving": "下書きの保存が終わってから送信してください",
  "error.staleDraft":
    "下書きが更新されました。保存済みの版を読み込み直してください",
  "error.originBusy": "別の会話がこのレビューを使用中です",
  "error.accessExpired":
    "一時的な許可の期限が切れました。元の会話に戻ってください",
  "error.accessLimit": "このレビューの接続数が上限に達しました",
  "error.integrationDisabled":
    "MeshCue は無効です。下書きは保持されています。元の会話から続けてください",
  "error.deliveryUnconfirmed":
    "配信は未確認です。マークは保存済みで、再試行されます",
  "error.accessRequired":
    "この入口には有効なレビュー権限がありません。元の会話に戻ってください。",

  "a11y.reviewPanel": "モデルレビュー",
  "a11y.versionTabs": "モデルのバージョン",
  "a11y.toolbar": "モデル操作ツール",
  "a11y.palette": "注記の色",
  "a11y.viewer": "3D モデルプレビュー — 回転・ズーム・注記",

  "model.awaiting": "エージェントのモデル納品を待っています",
  "model.awaitingFirst": "エージェントの最初のモデル納品を待っています",
  "model.triangles": "{count} 面",
  "model.summary": "{count} 面 · {format} · {units}",
  "model.readFailed": "モデルファイルを読み込めませんでした。",
  "model.versionMismatch":
    "モデルファイルがエージェントの指定したバージョンと一致しません。注記を停止しました。",
  "model.noExtent": "モデルに表示可能な範囲がありません。",
  "model.animated":
    "先に静的メッシュを書き出してください。この版では変形アニメーションに注記できません。",
  "model.tooManyTriangles":
    "モデルが 60 万面を超えています。先に簡略化してください。",
  "model.meshOverBudget":
    "レビューメッシュが 60 万面の上限を超えています。先にモデルを簡略化してください。",
  "model.contextLost":
    "表示コンテキストが失われました。下書きは保持されます。ページを再読み込みしてください。",

  "save.preparing": "準備中",
  "save.saving": "保存中…",
  "save.saved": "下書きを保存しました",
  "save.verifying": "確認中…",
  "save.restoring": "下書きを復元中…",
  "save.notStarted": "まだ印はありません",
  "save.unsynced": "未同期 · 下書きはこの端末にあります",
  "save.storageFull":
    "ローカル保存領域が一杯です。サーバーが保存できるよう、このページを開いたままにしてください。",

  "loading.preparing": "レビュー空間を準備しています",
  "loading.verifying": "モデルのバージョンを読み込み、確認しています",
  "loading.rebuildingMesh": "レビューメッシュを再計算中（{count} 面）",
  "loading.hint": "モデルの読み込みが終われば印を付けられます",

  "review.loadingModel": "モデルを読み込み中",
  "review.earlierVersion": "以前のバージョン · 印は付けられます",
  "review.openElsewhere": "別のウィンドウがこの版を開いています",
  "review.current": "現在のバージョン · 印を付けられます",
  "review.notInReview": "このバージョンは現在のレビューに含まれていません。",
  "review.notMarked": "このバージョンにはまだ印がありません。",
  "review.roundClosed":
    "この回は終了しました。もう一度印を付けると新しい回が始まります。",

  "marks.heading": "この回の印",
  "marks.collapse": "印の一覧を畳む",
  "marks.expand": "印の一覧を開く",
  "marks.empty": "変えたい場所を\nモデルの上に印で示してください。",
  "marks.limit": "1 回につき印は最大 200 個です。",
  "marks.nearStrokeLimit":
    "この回のストロークが上限に近づいています。先にこの分を送信してください。",
  "marks.nearMarkLimit":
    "この回の印が上限に近づいています。先にこの分を送信してください。",
  "marks.pin": "ポイント印",
  "marks.regionName": "{color}の領域",
  "marks.pinned": "表面に固定",
  "marks.alongSurface": "表面に沿って記入",
  "marks.legacyFace": "旧形式の面全体の印 · そのまま保持",
  "marks.one": "印 {label}",
  "marks.showOne": "{name}を表示",
  "marks.hideOne": "{name}を非表示",
  "marks.deleteLabel": "印 {label} を削除",
  "marks.deleteOne": "{name}を削除",
  "marks.frame": "表示",
  "marks.frameOne": "{name}を画面に収める",
  "marks.move": "移動",
  "marks.moveLabel": "印 {label} を移動",
  "marks.moveHint":
    "表面をクリックすると {label} を移動できます。Esc で取り消します。",
  "marks.hide": "印を隠す",
  "marks.show": "印を表示",

  "color.red": "赤",
  "color.yellow": "黄",
  "color.green": "緑",
  "color.blue": "青",
  "color.purple": "紫",
  "color.choose": "{color}を選ぶ",

  "view.plain": "単色表示",
  "view.original": "元の色",

  "cube.front": "前",
  "cube.back": "後",
  "cube.right": "右",
  "cube.left": "左",
  "cube.top": "上",
  "cube.bottom": "下",
  "cube.viewFrom": "{side}から見る",
  "cube.sideJoin": "",
  "cube.homeTitle": "既定の視点に戻す",
  "cube.homeLabel": "視点をリセット",

  "tool.orbit": "回転／印",
  "tool.orbitLabel": "回転と印",
  "tool.orbitTitle": "表面をダブルクリックで印を置きます。回転は右ボタン",
  "tool.brush": "ブラシ",
  "tool.brushLabel": "ブラシツール",
  "tool.brushTitle": "ブラシは見えている表面だけに描きます",
  "tool.eraser": "消しゴム",
  "tool.eraserLabel": "消しゴムツール",
  "tool.eraserTitle": "印だけを消します",
  "tool.bucket": "塗りつぶし",
  "tool.bucketLabel": "塗りつぶしツール",
  "tool.bucketTitle":
    "つながったほぼ平らな面をプレビューし、クリックで塗ります",
  "tool.undo": "取り消し",
  "tool.undoTitle": "取り消し Ctrl/⌘ Z",
  "tool.redo": "やり直し",
  "tool.size": "大きさ",
  "tool.brushSize": "ブラシの大きさ",
  "tool.spread": "範囲",
  "tool.bucketSpread": "塗りつぶしの範囲",
  "tool.newRegion": "新しい領域",
  "tool.newRegionHint": "次のストロークは独立した色の領域になります。",
  "tool.eraseTooFine":
    "消した結果、細かい断片が多すぎます。もっと小さい範囲で行ってください。",
  "tool.strokeTooBroad":
    "このストロークは表面に触れすぎています。拡大するかブラシを小さくしてください。既存のストロークは保持されます。",
  "tool.faceOverLimit":
    "この面は 1 つの印あたり 20,000 面の上限を超えています。範囲を狭めるかモデルを簡略化してください。",

  "hint.orbit":
    "右ドラッグで回転 · ダブルクリックで印 · 二本指か中ボタンで平行移動 · ホイールでズーム",
  "hint.paint": "見えている面を塗る · 右ボタンでいつでも回転",
  "hint.erase":
    "見えているストロークを消す · モデル自体は変わりません · 右ボタンでいつでも回転",
  "hint.fill": "重ねてプレビュー · クリックで塗る · 右ボタンでいつでも回転",
  "hint.relocate": "表面をクリックして印を移動 · Esc で取り消し",

  "version.showingNow": "表示中",
  "version.earlier": "以前のバージョン",
  "version.submitted": "{count} 件送信済み",
  "version.openElsewhere": "別ウィンドウで表示中",
  "version.pinnedNotice":
    "以前のバージョンを見ています。最新は {version} です。",
  "version.goLatest": "最新バージョンを見る",
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
  "recovery.paused":
    "ローカル保存領域が一杯です。未同期の下書きは保護し、編集を一時停止しました。バックアップをダウンロードしてエージェントにお渡しください。",

  "echo.summary": "エージェントの理解：{summary}",
  "echo.recall": "エージェントの理解をもう一度見る",
  "echo.dismiss": "しまう",
  "echo.stale": "印が変わりました。元の会話で理解を訂正してください",

  "precision.overBudget":
    "このモデルはレビューメッシュの割り当てを使い切りました（必要 {wanted} 面、割り当て {budget} 面）。広い平面は細分化が止まるため、ブラシはそこで面単位に飛びます。細部には影響しません。より細かいストロークが必要なら、弦高を小さくして書き出すようエージェントに依頼してください。",

  "outbox.reason": "理由：{message}",
  "outbox.reasonUnknown": "理由不明",
  "outbox.stuck":
    "{count} 件がまだエージェントに届いていません（{attempts} 回再試行、継続中）。{reason}。印はこの端末に保存済みです。元の会話で一言お伝えください。",
  "outbox.retrying":
    "{count} 件がまだエージェントに届いていません。再試行中（{attempts} 回目）。{reason}。印は保存済みで、付け直す必要はありません。",

  "feedback.default": "印には 3D の位置と現在のバージョンが付きます",
  "feedback.notSubmitted": "未送信 · 下書きは自動で保存されます",
  "feedback.saved": "保存しました",
  "feedback.delivered": "元の会話に届きました",
  "feedback.acceptedPending": "受理済み、配信は未確認",
  "feedback.waiting": "エージェントの取得待ち",
  "feedback.deliveryUnconfirmed": "配信未確認、再試行します",
  "feedback.read": "エージェントが読みました",
  "feedback.unread": "エージェントの読み取り待ち",
  "feedback.alsoUnsubmitted": "。未送信の変更がほかにもあります",
  "feedback.submit": "エージェントへ送る",
  "feedback.submitting": "送信中…",
  "feedback.submitted":
    "印を保存しました。送信状況は実際の受領確認に従います。モデルはロックしたままです。",

  "settings.device": "ポインティングデバイス",
  "settings.deviceAuto": "自動判別",
  "settings.deviceMouse": "マウス",
  "settings.deviceTrackpad": "トラックパッド",
  "settings.language": "表示言語",
  "settings.theme": "明るさ",
  "settings.themeSystem": "システムに従う",
  "settings.themeLight": "ライト",
  "settings.themeDark": "ダーク",

  "help.open": "使い方",
  "help.eyebrow": "クイックスタート",
  "help.title": "見て、印を付けて、何を変えたいか伝える。",
  "help.p1":
    "右ドラッグで回転、中ドラッグまたは二本指で平行移動、ホイールまたはピンチで拡大縮小します。左ボタンがカメラに使われることはないので、ツールを持ち替えずに印を付けられます。",
  "help.p2":
    "印：モデル表面をダブルクリックすると A、B、C が置かれます。単なるクリックでは何も置かれません。ブラシ：今見えている表面だけを塗ります。右ボタンはいつでも回転できるので、塗るのを中断してモデルを回す必要はありません。",
  "help.p3":
    "ポイント印は文字で、塗った領域は色で見分けます。色は実際のストロークだけを覆います。別の要望として分けたいときは「新しい領域」を押してください。印は取り消し・やり直し・個別削除ができます。",
  "help.p4":
    "消しゴムは見えているストロークだけを消し、モデル自体の材質には触れません。塗りつぶしはつながったほぼ平らな面をプレビューし、クリックで塗ります。範囲スライダーは塗りつぶしのときだけ現れます。塗りつぶしはつながった面全体に働き、他の物体の陰になった部分を含むことがあります。ブラシと消しゴムは貫通しません。",
  "help.p5":
    "印は模様で区別でき、ひと押しで隠せます。単色表示は見るための補助です。印はレビューの中だけに存在し、エージェントが持つモデルファイルには決して入りません。",
  "help.p6":
    "「エージェントへ送る」で印を保存して送信します。元の会話に戻って、何を変えたいか伝えてください。わからないところはエージェントが尋ねます。送信しただけではモデルは変わりません。",
  "help.p7":
    "上部のタブにはエージェントが納品したすべてのバージョンが並びます。どれを押しても見返せますし、古い版の上で直接印を付けて送ることもできます。各バージョンは自分の下書きを持ち、切り替えても他には影響しません。エージェントが受け取る印には、どの版に対するものかが記されます。",
  "help.p8":
    "「エージェントへ送る」でこの分を送ります。エージェントが新しいバージョンを返すので、そのまま次の版に印を付けてください。何かを終わらせる必要はなく、下書きは自動で保存されます。",
  "help.p9":
    "初版の対応：GLB／STL、80 MB・60 万面まで。アニメーション、ボーン、圧縮 GLB にはまだ対応していません。これはレビュー用の道具で、モデルを造形するものではありません。",
};
