/* 日本語。ツール名は並べて置かれるため短くしています（「消しゴム」など）。
   括弧は全角（）、引用は「」を使い、半角の " は文字列を切ってしまうので避けます。 */
export default {
  "agent.withTool": "{name}（{tool}）",

  "app.tagline": "3D モデルのレビューと注記",
  "app.version": "実行中のバージョン",
  "app.updateHint":
    "バージョン {version} が利用できます。エージェントに MeshCue の更新を依頼してください。",
  "app.updateHint.named":
    "バージョン {version} が利用できます。{agent}に MeshCue の更新を依頼してください。",

  "closing.pending":
    "このレビューはしばらく使われていないため終了します。ここで何か操作すれば継続します。",
  "closing.done":
    "長時間操作がなかったため終了しました。すべてのバージョンと保存済みのマークは残っています。エージェントにこのレビューを開き直すよう伝えれば続けられます。",
  "closing.done.named":
    "長時間操作がなかったため終了しました。すべてのバージョンと保存済みのマークは残っています。{agent}にこのレビューを開き直すよう伝えれば続けられます。",
  "common.close": "閉じる",
  "common.version": "バージョン",

  "conn.connecting": "接続中",
  "conn.origin": "元の会話に返信します",
  "conn.collect": "エージェントが取りに来ます",
  "conn.collect.named": "{agent}が取りに来ます",
  "conn.local": "ローカルレビュー",
  "conn.returnToChat": "元の会話に戻る",
  "conn.paused": "接続を一時停止しました",
  "conn.accessExpired": "アクセス期限切れ · 下書きは保持",
  "conn.noAccess": "レビュー権限がまだありません",
  "conn.reclaimed": "レビュー終了 · マークは保存済み",
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
  "model.awaiting.named": "{agent}のモデル納品を待っています",
  "model.awaitingFirst": "エージェントの最初のモデル納品を待っています",
  "model.awaitingFirst.named": "{agent}の最初のモデル納品を待っています",
  "model.triangles": "{count} 面",
  "model.summary": "{count} 面 · {format} · {units}",
  "units.unspecified": "単位なし",
  "model.readFailed": "モデルファイルを読み込めませんでした。",
  "model.versionMismatch":
    "モデルファイルがエージェントの指定したバージョンと一致しません。注記を停止しました。",
  "model.versionMismatch.named":
    "モデルファイルが{agent}の指定したバージョンと一致しません。注記を停止しました。",
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
    "このラウンドの記録はブラウザが保持できる上限に達しました。このバッチを送信すると、次は空から始まります。",
  "marks.nearMarkLimit":
    "このラウンドでモデルのすべての面がすでにマークされています。",
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
  "note.title": "{name}のメモ",
  "note.placeholder":
    "ここをどう変えたいか（任意）。印と一緒にエージェントへ送られます。",
  "note.placeholder.named":
    "ここをどう変えたいか（任意）。印と一緒に{agent}へ送られます。",

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

  "tool.orbit": "回転",
  "tool.orbitLabel": "回転ツール",
  "tool.orbitTitle": "モデルを回して見るだけ。印も塗りも置きません",
  "tool.label": "印",
  "tool.labelLabel": "印ツール",
  "tool.labelTitle": "表面をクリックで印を置きます。回転は右ボタン",
  "hint.label": "表面をクリックして印を置く · 右ボタンでいつでも回転",
  "tool.bucket": "塗りつぶし",
  "tool.bucketLabel": "塗りつぶしツール",
  "tool.bucketTitle":
    "つながったほぼ平らな面をプレビューし、クリックで塗ります",
  "tool.undo": "取り消し",
  "tool.undoTitle": "取り消し Ctrl/⌘ Z",
  "tool.redo": "やり直し",
  "tool.marks": "印表示",
  "tool.plain": "単色",
  "tool.spread": "範囲",
  "tool.bucketSpread": "塗りつぶしの範囲",
  "tool.newRegion": "新しい領域",
  "tool.newRegionHint": "次の塗りつぶしは独立した色の領域になります。",
  "hint.orbit":
    "右ドラッグで回転 · 二本指か中ボタンで平行移動 · ホイールでズーム",
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
    "印を保存しました。送信状況は実際の受領確認に従います。モデルはロックしたままです。",

  "settings.language": "表示言語",
  "settings.theme": "明るさ",
  "settings.themeSystem": "システムに従う",
  "settings.themeLight": "ライト",
  "settings.themeDark": "ダーク",

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

  "help.open": "使い方",
  "help.eyebrow": "クイックスタート",
  "help.title": "見て、印を付けて、何を変えたいか伝える。",
  "help.p1":
    "右ドラッグで回転、ホイールまたはピンチで拡大縮小、中ドラッグまたは Shift+ホイールで平行移動します。マウスでもトラックパッドでも同じです。左ボタンがカメラに使われることはないので、ツールを持ち替えずに印を付けられます。",
  "help.p2":
    "印：「印」ツールを選んで表面をクリックすると A、B、C が置かれます。「回転」では何も置かれないので、印を作らずにモデルを回せます。塗りつぶし：表面をクリックすると、つながった領域全体に印が付きます。右ボタンはいつでも回転できるので、印を付けるのを中断してモデルを回す必要はありません。",
  "help.p3":
    "ポイント印は文字で、印を付けた領域は色で見分けます。別の要望として分けたいときは「新しい領域」を押してください。一覧で印を選ぶと、その印にメモ（ここをどう変えたいか）を書けます。印は取り消し・やり直し・個別削除ができます。",
  "help.p4":
    "塗りつぶしはつながったほぼ平らな面をプレビューし、クリックで塗ります。範囲スライダーはその領域がどこまで広がるかを決めます。つながった面全体に働き、他の物体の陰になった部分を含むことがあります。塗りを取り消すには、元に戻すか、一覧からその印を削除してください。",
  "help.p5":
    "印は模様で区別でき、ひと押しで隠せます。単色表示は見るための補助です。印はレビューの中だけに存在し、エージェントが持つモデルファイルには決して入りません。",
  "help.p5.named":
    "印は模様で区別でき、ひと押しで隠せます。単色表示は見るための補助です。印はレビューの中だけに存在し、{agent}が持つモデルファイルには決して入りません。",
  "help.p6":
    "「エージェントへ送る」で印とメモを保存して送信します。何を変えたいかは、印のメモに書いても、元の会話で伝えても構いません。わからないところはエージェントが尋ねます。送信しただけではモデルは変わりません。",
  "help.p6.named":
    "「{agent}へ送る」で印とメモを保存して送信します。何を変えたいかは、印のメモに書いても、元の会話で伝えても構いません。わからないところは{agent}が尋ねます。送信しただけではモデルは変わりません。",
  "help.p7":
    "上部のタブにはエージェントが納品したすべてのバージョンが並びます。どれを押しても見返せますし、古い版の上で直接印を付けて送ることもできます。各バージョンは自分の下書きを持ち、切り替えても他には影響しません。エージェントが受け取る印には、どの版に対するものかが記されます。",
  "help.p7.named":
    "上部のタブには{agent}が納品したすべてのバージョンが並びます。どれを押しても見返せますし、古い版の上で直接印を付けて送ることもできます。各バージョンは自分の下書きを持ち、切り替えても他には影響しません。{agent}が受け取る印には、どの版に対するものかが記されます。",
  "help.p8":
    "「エージェントへ送る」でこの分を送ります。エージェントが新しいバージョンを返すので、そのまま次の版に印を付けてください。何かを終わらせる必要はなく、下書きは自動で保存されます。",
  "help.p8.named":
    "「{agent}へ送る」でこの分を送ります。{agent}が新しいバージョンを返すので、そのまま次の版に印を付けてください。何かを終わらせる必要はなく、下書きは自動で保存されます。",
  "help.p9":
    "対応形式は GLB／STL／STEP、80 MB・60 万面まで。STEP は読み込み時に一度だけ三角形分割され、印はそのメッシュに付きます。ダウンロードで渡されるのは STEP そのものです。STL は色を持たないため常に灰色で表示されます。色が必要なら STEP か GLB を使ってください。アニメーション、ボーン、圧縮 GLB にはまだ対応していません。これはレビュー用の道具で、モデルを造形するものではありません。",

  "tool.measure": "計測",
  "tool.measureLabel": "計測ツール",
  "tool.measureTitle":
    "2 点の間、直線の辺、2 つの面の間、円の直径を測ります。「残す」を押さない限り保存されません",
  "hint.measurePoints":
    "2 点をクリック · 角の近くは角に吸着 · 右ボタンでいつでも回転",
  "hint.measureEdge":
    "直線の辺を指してクリックすると長さを表示 · 右ボタンでいつでも回転",
  "hint.measurePlanes":
    "平らな面を 1 つクリックし、もう 1 つクリック · 右ボタンでいつでも回転",
  "hint.measureCircle":
    "穴や軸の縁を 3 点クリック · 角の近くは角に吸着 · 右ボタンでいつでも回転",
  "measure.kinds": "測るもの",
  "measure.points": "点と点",
  "measure.edge": "辺の長さ",
  "measure.planes": "2 つの面",
  "measure.circle": "3 点円",
  "measure.nextPoint": "2 点目をクリック",
  "measure.nextFace": "2 つ目の面をクリック",
  "measure.circleSecond": "2 点目をクリック",
  "measure.circleThird": "3 点目をクリック",
  "measure.keep": "残す",
  "measure.keepTitle": "この計測を印として残し、ほかの印と一緒に送ります",
  "measure.name": "計測 {label}",
  "measure.unitless": "{value}（単位なし）",
  "measure.diameter": "⌀{value}",
  "measure.noEdge":
    "ここに直線の辺はありません。角張った辺にもっと近づけてください。",
  "measure.curved": "この辺は曲がっています。測れるのは直線の辺だけです。",
  "measure.sameFace": "同じ面です。別の面をクリックしてください。",
  "measure.curvedFace": "この面は曲面です。測れるのは平らな面だけです。",
  "measure.noCircle":
    "その点では円が決まりません。縁に沿って離れた 3 点をクリックしてください。",
  "help.p10":
    "計測：計測ツールを選び、「点と点」（角の近くは角に吸着）、「辺の長さ」、「2 つの面」（平行なら間の距離、平行でなければ角度）、「3 点円」（穴や軸の縁を 3 点クリックすると直径）から選びます。STEP ではファイル自身の面で測ります。面はまるごと取り、辺は 2 つの面が接するところです。ミリメートルは小数点以下 2 桁、単位のないモデルは数字だけを表示します。計測は次を測ると消えます。「残す」を押すと印になり、メモを書く・元に戻す・削除する・送ることができます。",
  "help.p11":
    "「エージェントへ送る」を押すと、ボタンの下にこの一式の進み具合が順に表示されます。送った印の数、エージェントが読んだ時刻、そしてその理解です。理解はモデルの右下に表示され、モデル上の場所を示すときは、柔らかな光を伴う流れるシアンの破線で領域の輪郭だけを描きます。線はあなたの印の上に表示されますが、領域は塗りつぶしません。新しい理解が届くと光が短く明るくなります。「視差効果を減らす」設定では動かずに表示されます。エージェントに自動で通知できないときはそう表示し、その会話に貼り付ける一文を用意します。",
  "help.p11.named":
    "「{agent}へ送る」を押すと、ボタンの下にこの一式の進み具合が順に表示されます。送った印の数、{agent}が読んだ時刻、そしてその理解です。理解はモデルの右下に表示され、モデル上の場所を示すときは、柔らかな光を伴う流れるシアンの破線で領域の輪郭だけを描きます。線はあなたの印の上に表示されますが、領域は塗りつぶしません。新しい理解が届くと光が短く明るくなります。「視差効果を減らす」設定では動かずに表示されます。{agent}に自動で通知できないときはそう表示し、その会話に貼り付ける一文を用意します。",
};
