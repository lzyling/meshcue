/* 繁體中文。原本的介面文案是粵語口語，這一份改寫成標準書面中文：粵語讀者
   讀書面中文沒有障礙，多開一個 yue-Hant 目錄卻要多養一份文案。 */
export default {
  "app.tagline": "3D 模型審閱與標注",
  "app.preview": "試用版 {version}",

  "common.close": "關閉",
  "common.version": "版本",

  "conn.connecting": "連接中",
  "conn.origin": "回覆原對話",
  "conn.local": "本機審閱",
  "conn.returnToChat": "返回原對話",
  "conn.paused": "連線已暫停",
  "conn.accessExpired": "審閱權已過期 · 草稿保留",
  "conn.noAccess": "尚未取得審閱權",
  "conn.offline": "服務未運行",
  "conn.connectedNoAccess": "已連上工作台；取得審閱權之前不會載入模型。",
  "conn.dropped": "與服務的連線中斷，草稿會保留。",
  "conn.actionFailed": "操作未完成。",
  "conn.noSecureRandom":
    "瀏覽器缺少安全隨機功能，請使用目前版本的 Chrome 或 Edge。",

  "error.accessRequired": "此入口未取得有效審閱權，請返回原對話。",

  "a11y.reviewPanel": "模型審閱",
  "a11y.versionTabs": "模型版本",
  "a11y.toolbar": "模型操作工具",
  "a11y.palette": "標注顏色",
  "a11y.viewer": "三維模型預覽，可旋轉、縮放及標注",

  "model.awaiting": "等候 Agent 交付模型",
  "model.awaitingFirst": "等候 Agent 交付第一個模型",
  "model.triangles": "{count} 面",
  "model.summary": "{count} 面 · {format} · {units}",
  "model.readFailed": "模型檔案讀取失敗。",
  "model.versionMismatch": "模型檔案與 Agent 指定版本不符，已停止標注。",
  "model.noExtent": "模型沒有可顯示的有效範圍。",
  "model.animated": "請先匯出靜態網格；本版不標注變形動畫。",
  "model.tooManyTriangles": "模型超過 60 萬面，請先簡化。",
  "model.meshOverBudget": "審閱網格超出 60 萬面上限，請先簡化模型。",
  "model.contextLost": "顯示資源已中斷，草稿仍會保留；請重新整理頁面。",

  "save.preparing": "準備中",
  "save.saving": "儲存中…",
  "save.saved": "草稿已保存",
  "save.verifying": "核對中…",
  "save.restoring": "正在還原草稿…",
  "save.notStarted": "尚未標記",
  "save.unsynced": "未同步 · 草稿在本機",
  "save.storageFull": "本機儲存空間已滿。請保持本頁開啟，讓伺服器儲存。",

  "loading.preparing": "準備審閱空間",
  "loading.verifying": "載入並核對模型版本",
  "loading.rebuildingMesh": "重新計算審閱網格（{count} 面）",
  "loading.hint": "模型載入完成後就可以開始標記",

  "review.loadingModel": "載入模型",
  "review.earlierVersion": "較早版本 · 仍可標記",
  "review.openElsewhere": "另一個視窗已開啟這一版",
  "review.current": "目前版本 · 可以標記",
  "review.notInReview": "此版本不屬於目前審閱。",
  "review.notMarked": "這一版尚未有標記。",
  "review.roundClosed": "這一版已結束；再標記即可重新開始。",

  "marks.heading": "本輪標記",
  "marks.collapse": "收合標記列表",
  "marks.expand": "展開標記列表",
  "marks.empty": "將想修改的位置\n標記在模型上。",
  "marks.limit": "一輪最多 200 個標記。",
  "marks.nearStrokeLimit": "本輪筆跡接近上限，請先提交這一批。",
  "marks.nearMarkLimit": "本輪標記接近上限，請先提交這一批。",
  "marks.pin": "點標籤",
  "marks.regionName": "{color}區域",
  "marks.pinned": "已釘在表面",
  "marks.alongSurface": "沿表面標記",
  "marks.legacyFace": "舊版整面標記 · 原樣保留",
  "marks.one": "標記 {label}",
  "marks.showOne": "顯示{name}",
  "marks.hideOne": "隱藏{name}",
  "marks.deleteLabel": "刪除標籤 {label}",
  "marks.deleteOne": "刪除{name}",
  "marks.frame": "定位",
  "marks.frameOne": "定位到{name}",
  "marks.move": "移動",
  "marks.moveLabel": "移動標籤 {label}",
  "marks.moveHint": "點選表面即可移動 {label}；按 Esc 取消。",
  "marks.hide": "隱藏標注",
  "marks.show": "顯示標注",

  "color.red": "紅色",
  "color.yellow": "黃色",
  "color.green": "綠色",
  "color.blue": "藍色",
  "color.purple": "紫色",
  "color.choose": "選擇{color}",

  "view.plain": "素色檢視",
  "view.original": "原本顏色",

  "cube.front": "前",
  "cube.back": "後",
  "cube.right": "右",
  "cube.left": "左",
  "cube.top": "頂",
  "cube.bottom": "底",
  "cube.viewFrom": "從{side}看",
  "cube.sideJoin": "",
  "cube.homeTitle": "回到預設視角",
  "cube.homeLabel": "重設視角",

  "tool.orbit": "檢視／標籤",
  "tool.orbitLabel": "檢視及標籤",
  "tool.orbitTitle": "拖動旋轉，雙擊表面落標籤",
  "tool.brush": "畫筆",
  "tool.brushLabel": "畫筆模式",
  "tool.brushTitle": "畫筆只標可見表面",
  "tool.eraser": "橡皮擦",
  "tool.eraserLabel": "橡皮擦模式",
  "tool.eraserTitle": "只擦走標注筆跡",
  "tool.bucket": "油漆桶",
  "tool.bucketLabel": "油漆桶模式",
  "tool.bucketTitle": "預覽相連近平面，單擊填色",
  "tool.undo": "撤銷",
  "tool.undoTitle": "撤銷 Ctrl/⌘ Z",
  "tool.redo": "重做",
  "tool.size": "大小",
  "tool.brushSize": "畫筆大小",
  "tool.spread": "範圍",
  "tool.bucketSpread": "油漆桶範圍",
  "tool.newRegion": "新區域",
  "tool.newRegionHint": "下一筆會自成一個顏色區域。",
  "tool.eraseTooFine": "擦除後碎片過多，請改用較小的範圍。",
  "tool.strokeTooBroad":
    "這一筆涉及太多表面，請放大模型或縮細畫筆；已有筆跡會保留。",
  "tool.faceOverLimit":
    "此平面超過本輪 20,000 面標注上限；可收窄範圍或先簡化模型。",

  "hint.orbit": "拖動旋轉 · 雙擊落標籤 · 右鍵平移 · 滾輪縮放",
  "hint.paint": "塗抹可見表面 · 按住 Option/Alt 拖動可旋轉",
  "hint.erase": "擦走可見筆跡 · 不動模型本身 · 按 Option/Alt 可旋轉",
  "hint.fill": "移動預覽 · 單擊填色 · 按 Option/Alt 可旋轉",
  "hint.relocate": "點選表面移動標籤 · 按 Esc 取消",

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
    "未同步的草稿已另行備份，可下載交給 Agent；目前看到的是伺服器保存的版本。",
  "recovery.paused":
    "本機儲存空間已滿。未同步的草稿已保護，編輯暫停；請下載備份交給 Agent。",

  "echo.summary": "Agent 理解：{summary}",
  "echo.recall": "再看一次 Agent 的理解",
  "echo.dismiss": "收起",
  "echo.stale": "標注已更新，請在原對話更正理解",

  "precision.overBudget":
    "這個模型已用盡審閱網格配額（需要 {wanted} 面，配額為 {budget}）。大片平面停止細分，畫筆在上面會整塊跳動；細節部位不受影響。想要更細的筆觸，可請 Agent 以更小的弦高重新匯出。",

  "outbox.reason": "原因：{message}",
  "outbox.reasonUnknown": "原因不明",
  "outbox.stuck":
    "有 {count} 批標記仍未送達 Agent（已重試 {attempts} 次，仍在嘗試）。{reason}。標記已保存在本機，請在原對話提一聲。",
  "outbox.retrying":
    "有 {count} 批標記尚未送達 Agent，重試中（第 {attempts} 次）。{reason}。標記已保存，不需要重新標記。",

  "feedback.default": "標記會帶上三維位置與目前版本",
  "feedback.notSubmitted": "未提交 · 草稿會自動保存",
  "feedback.saved": "已保存",
  "feedback.delivered": "已送達原對話",
  "feedback.acceptedPending": "已接納，投遞待確認",
  "feedback.deliveryUnconfirmed": "投遞未確認，會重試",
  "feedback.read": "Agent 已讀取",
  "feedback.unread": "等待 Agent 讀取",
  "feedback.alsoUnsubmitted": "；另有改動尚未提交",
  "feedback.submit": "交給 Agent",
  "feedback.submitting": "提交中…",
  "feedback.submitted": "標記已保存；提交狀態以實際回執為準。模型維持鎖定。",

  "help.open": "使用說明",
  "help.eyebrow": "快速上手",
  "help.title": "先看，再標，然後說要改什麼。",
  "help.p1": "按住左鍵拖動可旋轉，右鍵平移，滾輪縮放；不用切換工具也能落標籤。",
  "help.p2":
    "標籤：在模型表面雙擊即可放下 A、B、C；單擊不會放任何東西。畫筆：只塗抹目前看得見的表面；按住 Option/Alt 拖動可暫時旋轉，放開後繼續塗。",
  "help.p3":
    "點標籤按字母辨認，塗抹區域按顏色辨認；顏色只覆蓋實際筆跡。想分開另一個要求，按「新區域」。標記可以撤銷、重做，也可以逐個刪除。",
  "help.p4":
    "橡皮擦只擦走可見筆跡，不動模型本身的材質。油漆桶會預覽相連的近平面，單擊即填色；範圍滑桿只在油漆桶時出現。油漆桶作用於整個相連表面，可能包含被其他物件遮住的部分；畫筆與橡皮擦不會穿透。",
  "help.p5":
    "標記靠花紋分辨，一鍵即可隱藏；素色檢視只是輔助觀看。標記只存在於審閱裡 —— Agent 手上的模型檔案從不帶上它們。",
  "help.p6":
    "「交給 Agent」會保存並提交標記。回到原對話說明想改什麼；有不清楚的地方 Agent 會問。提交本身不會改動模型。",
  "help.p7":
    "頂部的頁籤列出 Agent 交付過的每一個版本。按任何一個都可以回看，也可以直接在舊版上標記並提交——每一版各有自己的草稿，切換不影響其他版本。Agent 收到的標記會註明針對哪一版。",
  "help.p8":
    "按「交給 Agent」把這一批送出；Agent 會給出新版本，你接著在新版本上標記就行。不需要結束什麼，草稿會自動保存。",
  "help.p9":
    "本版支援 GLB／STL，上限 80 MB 與 60 萬面。動畫、骨架與壓縮 GLB 尚未支援。這是審閱工具，不會替你改模型。",
};
