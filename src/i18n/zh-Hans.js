/* 简体中文。不是繁体那份的逐字转换：文件／默认／刷新／标签页这些是用词差别，
   转换器换不出来。 */
export default {
  "app.tagline": "3D 模型审阅与标注",
  "app.preview": "试用版 {version}",

  "common.close": "关闭",
  "common.version": "版本",

  "conn.connecting": "连接中",
  "conn.origin": "回复原对话",
  "conn.local": "本机审阅",
  "conn.returnToChat": "返回原对话",
  "conn.paused": "连接已暂停",
  "conn.accessExpired": "审阅权已过期 · 草稿保留",
  "conn.noAccess": "尚未取得审阅权",
  "conn.offline": "服务未运行",
  "conn.connectedNoAccess": "已连上工作台；取得审阅权之前不会加载模型。",
  "conn.dropped": "与服务的连接中断，草稿会保留。",
  "conn.actionFailed": "操作未完成。",
  "conn.noSecureRandom":
    "浏览器缺少安全随机功能，请使用当前版本的 Chrome 或 Edge。",

  "error.accessRequired": "此入口未取得有效审阅权，请返回原对话。",

  "a11y.reviewPanel": "模型审阅",
  "a11y.versionTabs": "模型版本",
  "a11y.toolbar": "模型操作工具",
  "a11y.palette": "标注颜色",
  "a11y.viewer": "三维模型预览，可旋转、缩放及标注",

  "model.awaiting": "等候 Agent 交付模型",
  "model.awaitingFirst": "等候 Agent 交付第一个模型",
  "model.triangles": "{count} 面",
  "model.summary": "{count} 面 · {format} · {units}",
  "model.readFailed": "模型文件读取失败。",
  "model.versionMismatch": "模型文件与 Agent 指定版本不符，已停止标注。",
  "model.noExtent": "模型没有可显示的有效范围。",
  "model.animated": "请先导出静态网格；本版不标注变形动画。",
  "model.tooManyTriangles": "模型超过 60 万面，请先简化。",
  "model.meshOverBudget": "审阅网格超出 60 万面上限，请先简化模型。",
  "model.contextLost": "显示资源已中断，草稿仍会保留；请刷新页面。",

  "save.preparing": "准备中",
  "save.saving": "保存中…",
  "save.saved": "草稿已保存",
  "save.verifying": "核对中…",
  "save.restoring": "正在恢复草稿…",
  "save.notStarted": "尚未标记",
  "save.unsynced": "未同步 · 草稿在本机",
  "save.storageFull": "本机存储空间已满。请保持本页打开，让服务器保存。",

  "loading.preparing": "准备审阅空间",
  "loading.verifying": "加载并核对模型版本",
  "loading.rebuildingMesh": "重新计算审阅网格（{count} 面）",
  "loading.hint": "模型加载完成后就可以开始标记",

  "review.loadingModel": "加载模型",
  "review.earlierVersion": "较早版本 · 仍可标记",
  "review.openElsewhere": "另一个窗口已打开这一版",
  "review.current": "当前版本 · 可以标记",
  "review.notInReview": "此版本不属于当前审阅。",
  "review.notMarked": "这一版尚未有标记。",
  "review.roundClosed": "这一版已结束；再标记即可重新开始。",

  "marks.heading": "本轮标记",
  "marks.collapse": "收起标记列表",
  "marks.expand": "展开标记列表",
  "marks.empty": "将想修改的位置\n标记在模型上。",
  "marks.limit": "一轮最多 200 个标记。",
  "marks.nearStrokeLimit": "本轮笔迹接近上限，请先提交这一批。",
  "marks.nearMarkLimit": "本轮标记接近上限，请先提交这一批。",
  "marks.pin": "点标签",
  "marks.regionName": "{color}区域",
  "marks.pinned": "已钉在表面",
  "marks.alongSurface": "沿表面标记",
  "marks.legacyFace": "旧版整面标记 · 原样保留",
  "marks.one": "标记 {label}",
  "marks.showOne": "显示{name}",
  "marks.hideOne": "隐藏{name}",
  "marks.deleteLabel": "删除标签 {label}",
  "marks.deleteOne": "删除{name}",
  "marks.frame": "定位",
  "marks.frameOne": "定位到{name}",
  "marks.move": "移动",
  "marks.moveLabel": "移动标签 {label}",
  "marks.moveHint": "点击表面即可移动 {label}；按 Esc 取消。",
  "marks.hide": "隐藏标注",
  "marks.show": "显示标注",

  "color.red": "红色",
  "color.yellow": "黄色",
  "color.green": "绿色",
  "color.blue": "蓝色",
  "color.purple": "紫色",
  "color.choose": "选择{color}",

  "view.plain": "素色查看",
  "view.original": "原本颜色",

  "cube.front": "前",
  "cube.back": "后",
  "cube.right": "右",
  "cube.left": "左",
  "cube.top": "顶",
  "cube.bottom": "底",
  "cube.viewFrom": "从{side}看",
  "cube.sideJoin": "",
  "cube.homeTitle": "回到默认视角",
  "cube.homeLabel": "重置视角",

  "tool.orbit": "查看／标签",
  "tool.orbitLabel": "查看及标签",
  "tool.orbitTitle": "拖动旋转，双击表面放标签",
  "tool.brush": "画笔",
  "tool.brushLabel": "画笔模式",
  "tool.brushTitle": "画笔只标可见表面",
  "tool.eraser": "橡皮擦",
  "tool.eraserLabel": "橡皮擦模式",
  "tool.eraserTitle": "只擦掉标注笔迹",
  "tool.bucket": "油漆桶",
  "tool.bucketLabel": "油漆桶模式",
  "tool.bucketTitle": "预览相连近平面，单击填色",
  "tool.undo": "撤销",
  "tool.undoTitle": "撤销 Ctrl/⌘ Z",
  "tool.redo": "重做",
  "tool.size": "大小",
  "tool.brushSize": "画笔大小",
  "tool.spread": "范围",
  "tool.bucketSpread": "油漆桶范围",
  "tool.newRegion": "新区域",
  "tool.newRegionHint": "下一笔会自成一个颜色区域。",
  "tool.eraseTooFine": "擦除后碎片过多，请改用较小的范围。",
  "tool.strokeTooBroad":
    "这一笔涉及太多表面，请放大模型或缩小画笔；已有笔迹会保留。",
  "tool.faceOverLimit":
    "此平面超过本轮 20,000 面标注上限；可收窄范围或先简化模型。",

  "hint.orbit": "拖动旋转 · 双击放标签 · 右键平移 · 滚轮缩放",
  "hint.paint": "涂抹可见表面 · 按住 Option/Alt 拖动可旋转",
  "hint.erase": "擦掉可见笔迹 · 不动模型本身 · 按 Option/Alt 可旋转",
  "hint.fill": "移动预览 · 单击填色 · 按 Option/Alt 可旋转",
  "hint.relocate": "点击表面移动标签 · 按 Esc 取消",

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
    "未同步的草稿已另行备份，可下载交给 Agent；当前看到的是服务器保存的版本。",
  "recovery.paused":
    "本机存储空间已满。未同步的草稿已保护，编辑暂停；请下载备份交给 Agent。",

  "echo.summary": "Agent 理解：{summary}",
  "echo.focus": "查看修改范围",
  "echo.hide": "隐藏回显",
  "echo.show": "显示回显",
  "echo.stale": "标注已更新，请在原对话更正理解",

  "precision.overBudget":
    "这个模型已用尽审阅网格配额（需要 {wanted} 面，配额为 {budget}）。大片平面停止细分，画笔在上面会整块跳动；细节部位不受影响。想要更细的笔触，可请 Agent 以更小的弦高重新导出。",

  "outbox.reason": "原因：{message}",
  "outbox.reasonUnknown": "原因不明",
  "outbox.stuck":
    "有 {count} 批标记仍未送达 Agent（已重试 {attempts} 次，仍在尝试）。{reason}。标记已保存在本机，请在原对话提一声。",
  "outbox.retrying":
    "有 {count} 批标记尚未送达 Agent，重试中（第 {attempts} 次）。{reason}。标记已保存，不需要重新标记。",

  "feedback.default": "标记会带上三维位置与当前版本",
  "feedback.notSubmitted": "未提交 · 草稿会自动保存",
  "feedback.saved": "已保存",
  "feedback.delivered": "已送达原对话",
  "feedback.acceptedPending": "已接纳，投递待确认",
  "feedback.deliveryUnconfirmed": "投递未确认，会重试",
  "feedback.read": "Agent 已读取",
  "feedback.unread": "等待 Agent 读取",
  "feedback.alsoUnsubmitted": "；另有改动尚未提交",
  "feedback.submit": "交给 Agent",
  "feedback.submitting": "提交中…",
  "feedback.submitted": "标记已保存；提交状态以实际回执为准。模型维持锁定。",

  "help.open": "使用说明",
  "help.eyebrow": "快速上手",
  "help.title": "先看，再标，然后说要改什么。",
  "help.p1": "按住左键拖动可旋转，右键平移，滚轮缩放；不用切换工具也能放标签。",
  "help.p2":
    "标签：在模型表面双击即可放下 A、B、C；单击不会放任何东西。画笔：只涂抹当前看得见的表面；按住 Option/Alt 拖动可暂时旋转，松开后继续涂。",
  "help.p3":
    "点标签按字母辨认，涂抹区域按颜色辨认；颜色只覆盖实际笔迹。想分开另一个要求，按「新区域」。标记可以撤销、重做，也可以逐个删除。",
  "help.p4":
    "橡皮擦只擦掉可见笔迹，不动模型本身的材质。油漆桶会预览相连的近平面，单击即填色；范围滑块只在油漆桶时出现。油漆桶作用于整个相连表面，可能包含被其他物体挡住的部分；画笔与橡皮擦不会穿透。",
  "help.p5":
    "标记靠花纹分辨，一键即可隐藏；素色查看只是辅助观看。标记只存在于审阅里 —— Agent 手上的模型文件从不带上它们。",
  "help.p6":
    "「交给 Agent」会保存并提交标记。回到原对话说明想改什么；有不清楚的地方 Agent 会问。提交本身不会改动模型。",
  "help.p7":
    "顶部的标签页列出 Agent 交付过的每一个版本。点任何一个都可以回看，也可以直接在旧版上标记并提交——每一版各有自己的草稿，切换不影响其他版本。Agent 收到的标记会注明针对哪一版。",
  "help.p8":
    "按「交给 Agent」把这一批送出；Agent 会给出新版本，你接着在新版本上标记就行。不需要结束什么，草稿会自动保存。",
  "help.p9":
    "本版支持 GLB／STL，上限 80 MB 与 60 万面。动画、骨架与压缩 GLB 尚未支持。这是审阅工具，不会替你改模型。",
};
