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
    "左・右ドラッグで回転 · Shift+ドラッグまたは中ボタンで移動 · ホイール・ピンチで拡大縮小",
  "hint.fill": "重ねてプレビュー · クリックで塗る · 右ボタンでいつでも回転",
  "hint.relocate": "表面をクリックして印を移動 · Esc で取り消し",

  "settings.language": "表示言語",
  "settings.theme": "明るさ",
  "settings.themeSystem": "システムに従う",
  "settings.themeLight": "ライト",
  "settings.themeDark": "ダーク",

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
};
