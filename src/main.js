import { newId } from "./browser-crypto.js";
import "./style.css";
import { ModelViewer } from "./viewer.js";
import {
  letterLabel,
  letterNumber,
  erasePatches,
  facesOf,
} from "./annotation-edits.js";

const $ = (selector) => document.querySelector(selector);
const app = $("#app");
/* Icons were Unicode glyphs, which is not a style choice but an absence of
   control: the operating system font decided their shape, weight and baseline,
   the rarer ones (▱ ▰ ⌖ ⌂) are missing from some fonts entirely, and ▱ against
   ▰ differed only by fill — eraser and paint bucket were indistinguishable side
   by side. These are drawn here, ship inside the bundle, and depict the action
   rather than gesture at it. Sized in em so every existing font-size rule,
   including the responsive ones, keeps working untouched. */
const SPRITE = `<svg class="sprite" aria-hidden="true" focusable="false"><defs>
<g id="mc-brand" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3.2 20.4 8v8L12 20.8 3.6 16V8z"/><path d="M3.6 8 12 12.8 20.4 8M12 12.8v8" stroke-width="1.2" opacity=".55"/></g>
<g id="mc-orbit" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z"/><path d="M4 8.5 12 13l8-4.5M12 13v7" stroke-width="1.2" opacity=".55"/></g>
<g id="mc-brush" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M14.5 3.6l5.9 5.9-7.2 7.2a3 3 0 0 1-1.5.8l-1.6.3-1.9-1.9.3-1.6a3 3 0 0 1 .8-1.5z"/><path d="M13.2 5 19 10.8" stroke-width="1.2" opacity=".55"/><path d="M7.6 15.2c-1.6.5-2.3 1.7-2.6 3.1-.2 1-.7 1.5-1.6 1.9 1.4 1.1 3.6 1.2 4.9.1 1-.9 1.3-2.2 1.1-3.4z" fill="currentColor" stroke="none"/></g>
<g id="mc-eraser" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M8.9 19.4 4.3 14.8a2 2 0 0 1 0-2.8l8-8a2 2 0 0 1 2.8 0l4.6 4.6a2 2 0 0 1 0 2.8l-7.8 8z"/><path d="M8.6 8.4 15.6 15.4" stroke-width="1.3" opacity=".55"/><path d="M9 19.4h11" stroke-linecap="round"/></g>
<g id="mc-fill" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M11 2.6 20 11.6a1.6 1.6 0 0 1 0 2.3l-6 6a1.6 1.6 0 0 1-2.3 0l-6-6a1.6 1.6 0 0 1 0-2.3l6-6"/><path d="M5.6 13.2h14.2l-5.8 5.8a1.6 1.6 0 0 1-2.3 0z" fill="currentColor" stroke="none" opacity=".32"/><path d="M21.4 15.6c.9 1.2 1.4 2.1 1.4 2.8a1.4 1.4 0 1 1-2.8 0c0-.7.5-1.6 1.4-2.8z" fill="currentColor" stroke="none"/></g>
<g id="mc-undo" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h9a5 5 0 0 1 0 10H9"/><path d="M7.5 6 3.5 10l4 4"/></g>
<g id="mc-redo" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10h-9a5 5 0 0 0 0 10h4"/><path d="M16.5 6l4 4-4 4"/></g>
<g id="mc-home" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.6 11 12 4l8.4 7"/><path d="M5.8 12.2V20h12.4v-7.8"/></g>
<g id="mc-send" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8z"/></g>
<g id="mc-trash" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5h16M9.5 6.5V4.2h5v2.3"/><path d="M6.3 6.5 7.2 20h9.6l.9-13.5"/><path d="M10.3 10v6.4M13.7 10v6.4" stroke-width="1.3" opacity=".6"/></g>
<g id="mc-close" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></g>
<g id="mc-plus" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></g>
<g id="mc-minus" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 12h14"/></g>
<g id="mc-check" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.6 9.5 17.5 19.5 6.8"/></g>
<g id="mc-pin" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 21.2s6.4-6.3 6.4-11a6.4 6.4 0 1 0-12.8 0c0 4.7 6.4 11 6.4 11z"/><circle cx="12" cy="10" r="2.4"/></g>
<g id="mc-eye" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1.8 12S5.6 5.8 12 5.8 22.2 12 22.2 12 18.4 18.2 12 18.2 1.8 12 1.8 12z"/><circle cx="12" cy="12" r="3"/></g>
<g id="mc-eye-off" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9.6 6.2A9.6 9.6 0 0 1 12 5.8c6.4 0 10.2 6.2 10.2 6.2a17 17 0 0 1-3.2 3.8M6.1 8.2A17 17 0 0 0 1.8 12S5.6 18.2 12 18.2c1.2 0 2.2-.2 3.2-.5"/><path d="M10 10a2.8 2.8 0 0 0 3.9 3.9"/><path d="M3.5 3.5l17 17"/></g>
<g id="mc-help" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.3"/><circle cx="12" cy="16.6" r="1" fill="currentColor" stroke="none"/></g>
</defs></svg>`;
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#mc-${name}"/></svg>`;
app.innerHTML = `${SPRITE}
<header class="app-header"><div class="brand-mark">${icon("brand")}</div><div class="brand"><strong>MeshCue</strong><span>3D 模型審閱與標注</span></div><span class="prototype">試用版 ${__MESHCUE_VERSION__}</span><div class="header-right"><span class="connection-dot"></span><span id="connection-status">連接中</span><button class="quiet icon-only" id="help-button" aria-label="使用說明">${icon("help")}</button></div></header>
<main class="workspace">
 <section class="review-panel" aria-label="模型審閱">
  <div class="model-heading"><div><h2 id="model-name">等候 Agent 交付模型</h2></div><div class="model-meta"><span class="version-chip" id="model-version">—</span><span id="save-status">準備中</span></div></div>
  <div id="version-tabs" class="version-tabs" role="tablist" aria-label="模型版本" hidden></div>
  <div class="viewer-shell">
   <div id="viewer"></div>
   <div class="viewer-top"><span class="scene-pill" id="review-status">載入模型</span><span class="scene-pill subtle" id="model-info"></span></div>
   <div class="view-actions"><button id="toggle-marks" class="quiet-dark" aria-pressed="false">隱藏標注</button><button id="neutral-view" class="quiet-dark" aria-pressed="false">素色檢視</button></div>
   <div class="toolbar" role="toolbar" aria-label="模型操作工具">
    <button data-mode="orbit" class="tool active" title="拖動旋轉，雙擊表面落標籤" aria-label="檢視及標籤">${icon("orbit")}<span>檢視／標籤</span></button>
    <button data-mode="paint" class="tool" title="畫筆只標可見表面" aria-label="畫筆模式">${icon("brush")}<span>畫筆</span></button>
    <button data-mode="erase" class="tool" aria-label="橡皮擦模式" title="只擦走標注筆跡">${icon("eraser")}<span>橡皮擦</span></button>
    <button data-mode="fill" class="tool" aria-label="油漆桶模式" title="預覽相連近平面，單擊填色">${icon("fill")}<span>油漆桶</span></button>
    <div class="tool-divider"></div><button class="tool small" id="undo" title="撤銷 Ctrl/⌘ Z" aria-label="撤銷">${icon("undo")}</button><button class="tool small" id="redo" title="重做" aria-label="重做">${icon("redo")}</button><button class="tool small" id="home-view" title="回到預設視角" aria-label="重設視角">${icon("home")}</button>
   </div>
   <div id="tool-options" class="tool-options"><div class="palette" role="group" aria-label="標注顏色"></div><label id="radius-control" hidden>大小 <input id="brush-size" type="range" min="6" max="60" value="22" aria-label="畫筆大小"></label><label id="fill-control" hidden>範圍 <input id="fill-range" type="range" min="1" max="30" value="6" aria-label="油漆桶範圍"></label><button class="quiet-dark" id="new-region" hidden>${icon("plus")}新區域</button></div>
   <aside class="annotations-panel"><div class="annotations-heading"><strong>本輪標記 <span id="annotation-count">0</span></strong><button id="toggle-annotations" class="quiet-dark" aria-label="收合標記列表" aria-expanded="true">${icon("minus")}</button></div><div id="annotations-list"><div class="annotation-empty">將想改嘅位置<br>標記喺模型上。</div></div></aside>
   <div id="echo-panel" hidden><span id="echo-summary"></span><button id="focus-echo" class="quiet-dark">睇修改範圍</button><button id="toggle-echo" class="quiet-dark" aria-pressed="false">隱藏回顯</button><span id="echo-stale" hidden>標注已更新，請在原會話更正理解</span></div>
   <div id="loading" class="loading-overlay"><div class="spinner"></div><strong id="loading-text">準備審閱空間</strong><span id="loading-hint">模型載入完成後就可以開始標記</span></div>
   <div class="viewer-bottom"><span id="tool-hint">拖動旋轉 · 雙擊落標籤 · 右鍵平移 · 滾輪縮放</span><span class="axis-label">3D SPACE</span></div>
  </div>
  <div id="pending-banner" class="pending-banner" hidden><span id="pending-text"></span><button id="go-active" class="quiet">睇最新版本</button></div>
  <div id="resume-banner" class="pending-banner" hidden><span>另一個視窗都開住呢一版。</span><button id="resume-review" class="quiet">繼續喺呢部機標記</button></div>
  <div id="recovery-banner" class="pending-banner" hidden><span>本機另有未同步草稿，已保留，未覆蓋目前版本。</span><a id="download-recovery">下載草稿備份</a></div>
  <div id="outbox-banner" class="pending-banner warn" hidden><span id="outbox-text"></span></div>
  <div id="precision-banner" class="pending-banner" hidden><span id="precision-text"></span></div>
  <footer class="review-footer"><div class="submission-status"><span id="feedback-status">標注會附帶三維位置及當前版本</span><a id="download-feedback" hidden>下載標注</a></div><a id="download-model" class="secondary-button" hidden>下載當前版本</a><button id="finish-review" class="secondary-button" disabled>結束本輪審閱</button><button id="submit-feedback" class="primary-button" disabled>交畀 Agent ${icon("send")}</button></footer>
 </section>
</main><div id="toast" role="status" hidden></div>
<dialog id="help-dialog"><button id="close-help" class="dialog-close icon-only" aria-label="關閉">${icon("close")}</button><span class="eyebrow">QUICK START</span><h2>睇、標記，再講點改。</h2><p>按住左鍵拖動旋轉，右鍵平移，滾輪縮放；唔使切工具就可以落標籤。</p><p>標籤：雙擊模型表面，放上 A、B、C 字母，普通單擊唔落標籤。畫筆：只塗選目前睇到嘅表面；按住 Option／Alt 拖動可暫時旋轉，再繼續畫。</p><p>點標籤用字母，塗抹區用顏色辨認；顏色只覆蓋實際筆跡。想分開另一個要求，撳「新區域」。可以撤銷、重做，亦可以刪除個別標記。</p><p>橡皮擦只移除可見筆跡，唔影響模型材質。油漆桶預覽相連近平面，點一下上色；範圍滑桿只在油漆桶顯示。油漆桶以整片相連表面為單位，可能包括被其他物件遮住的部分；畫筆和橡皮擦不穿透。</p><p>標注以紋樣區分；可一鍵隱藏，素色只是輔助檢視。下載會保留原檔顏色與貼圖，不包含標注。</p><p>「交畀 Agent」保存並提交標記。返原本對話講修改要求；Agent 未明白就會問清楚。提交本身唔會自動改模型。</p><p>頂部標籤列出 Agent 交付過嘅每一個版本。撳任何一個都可以睇返，亦可以直接喺舊版本上標記同提交 —— 每個版本有自己嘅草稿，換版唔會影響其他版本。Agent 收到嘅標記會註明係針對邊一版。</p><p>標完一版撳「結束本輪審閱」，仲未提交嘅標記會一併封存交畀 Agent；之後再標記就會自動重新開始。草稿會自動保存。</p><p class="muted">初版：GLB／STL，最多 80 MB、60 萬面。動畫、骨架及壓縮 GLB 暫未支援。這是審閱工具，唔會直接雕刻模型。</p></dialog>`;

const base = new URL("./", location.href);
const endpoint = (path) => new URL(path, base).href;
const clientId = sessionStorage.getItem("3d-review-client") || newId();
sessionStorage.setItem("3d-review-client", clientId);
const colors = ["#e76d5c", "#e6b64b", "#6ab398", "#629bd8", "#ae82ce"];
let color = colors[0];
let state = null,
  loadedId = null,
  // Which version the reviewer chose to look at, and whether they are still
  // following whatever the Agent puts on screen. Picking an older tab pins the
  // view; picking the current one hands the choice back to the Agent.
  viewingId = null,
  followActive = true,
  loadedReviewId = null,
  annotations = [],
  selectedId = null,
  mode = "orbit",
  revision = 0,
  editSeq = 0,
  savedSeq = 0;
let saveFlight = null,
  pendingWrite = null,
  saveTimer = null,
  renderFrame = null,
  loadFlight = null,
  beginFlight = null,
  submissionKey = null,
  submitting = false;
let undoStack = [],
  redoStack = [],
  initialDraftRestored = false;
let pollFlight = null,
  labelCursor = 0,
  relocatingId = null,
  loadedPrecision = null,
  echoId = null;
let recoveryBlocked = false,
  recoveryUrl = null,
  accessBlocked = false,
  accessRecoveryNeeded = false,
  loadedReceipt = null;
const clone = (x) => structuredClone(x);
async function api(path, data, method = "POST") {
  const options =
    data === undefined
      ? {}
      : {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Review-Client": "1",
          },
          body: JSON.stringify(data),
        };
  const res = await fetch(endpoint(`api/${path}`), options);
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error("服務連線中斷，草稿仍會保留。");
  }
  if (!res.ok) {
    const err = new Error(json.error || "操作未完成。");
    err.code = json.code;
    if (res.status === 401 || json.code === "REVIEW_FINISHED") {
      accessBlocked = true;
      clearTimeout(saveTimer);
      if (loadedId && initialDraftRestored) {
        cacheDraft();
        if (editSeq > savedSeq)
          showRecovery({
            versionId: loadedId,
            reviewId: loadedReviewId,
            annotations,
            camera: viewer.cameraState(),
            revision,
          });
      } else {
        $("#loading-text").textContent = err.message;
        $("#loading-hint").textContent =
          "已連接工作台；授權完成前不會載入模型。";
        $("#loading .spinner").hidden = true;
      }
      updateButtons();
    }
    throw err;
  }
  return json;
}
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").hidden = true), 6500);
}
function owner() {
  return { versionId: loadedId, clientId };
}
const DRAFT_PREFIX = "3d-review-draft-";
function draftKey() {
  return `${DRAFT_PREFIX}${loadedId}-${loadedReviewId}`;
}
// Every version keeps its own cached draft, and a new review generation starts
// another set, so the keys only ever accumulate. Exhausting the quota is not
// cosmetic here: it is exactly what puts the page into the mode that stops
// editing to protect an unsynced draft. Age cannot decide what goes — an older
// review's draft is precisely what "草稿保留，請在原會話接續" promises to keep.
// Being unsynced can: a cache that matches what the server already holds costs
// a reload to rebuild and nothing to lose. Recovery backups are never touched;
// they exist because something was already at risk.
function sweepDraftCache() {
  const mine = draftKey();
  const spent = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(DRAFT_PREFIX) || key === mine) continue;
    if (key.slice(DRAFT_PREFIX.length).includes("-recovery-")) continue;
    try {
      if (JSON.parse(localStorage.getItem(key))?.dirty === true) continue;
    } catch {
      // Unreadable is not recoverable either way, and it still costs quota.
    }
    spent.push(key);
  }
  for (const key of spent) localStorage.removeItem(key);
}
function cacheDraft() {
  if (recoveryBlocked) return;
  try {
    localStorage.setItem(
      draftKey(),
      JSON.stringify({
        annotations,
        labelCursor,
        revision,
        dirty: editSeq > savedSeq,
        editSeq,
        savedSeq,
        pendingWrite,
        camera: viewer.cameraState(),
      }),
    );
  } catch {
    toast("本機暫存空間不足；請保持頁面開啟，等伺服器保存。");
  }
}
function historyPush() {
  undoStack.push(JSON.stringify(annotations));
  while (
    undoStack.length > 20 ||
    undoStack.reduce((n, x) => n + x.length, 0) > 8_000_000
  )
    undoStack.shift();
  redoStack = [];
}
function nextLabel() {
  return letterLabel(++labelCursor);
}
function changed() {
  editSeq++;
  submissionKey = null;
  cacheDraft();
  renderAnnotations();
  $("#save-status").textContent = "保存中…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () => flushDraft().catch((e) => toast(e.message)),
    500,
  );
  updateButtons();
}
async function beginEdit() {
  if (
    !loadedId ||
    !viewer.enabled ||
    submitting ||
    recoveryBlocked ||
    accessBlocked
  )
    return false;
  if (beginFlight) return beginFlight;
  beginFlight = (async () => {
    const result = await api("review/begin", owner());
    state = { ...state, ...result };
    historyPush();
    updateButtons();
    return true;
  })();
  try {
    return await beginFlight;
  } finally {
    beginFlight = null;
  }
}
function onPin(pin) {
  if (annotations.length >= 200) return toast("本輪最多 200 個標記。");
  const item = {
    id: newId(),
    type: "pin",
    label: nextLabel(),
    color,
    ...pin,
  };
  annotations.push(item);
  selectedId = item.id;
  changed();
}
const colorNames = {
  "#e76d5c": "紅色",
  "#e6b64b": "黃色",
  "#6ab398": "綠色",
  "#629bd8": "藍色",
  "#ae82ce": "紫色",
};
function regionName(a) {
  return `${colorNames[a.color] || a.color}區域`;
}
function onPaint(patches) {
  patches = patches.map((p) => ({ ...p, faceIndex: p.sourceFaceIndex }));
  if (mode === "erase") {
    const serialized = viewer.serializeAnnotations(annotations);
    const next = serialized
      .map((a) => {
        if (a.type !== "region") return a;
        const sourcePatches = (a.surfacePatches || []).map((p) => ({
          ...p,
          faceIndex: p.sourceFaceIndex,
        }));
        const remaining = erasePatches(sourcePatches, patches);
        if (sameValue(sourcePatches, remaining)) return a;
        return {
          ...a,
          coverage: "source-v1",
          faces: facesOf(remaining),
          surfacePatches: remaining,
        };
      })
      .filter((a) => a.type === "pin" || a.surfacePatches.length);
    if (next.reduce((n, a) => n + (a.surfacePatches?.length || 0), 0) > 40000) {
      toast("擦除產生太多細小筆跡，請縮小範圍。");
      return;
    }
    if (!sameValue(serialized, next)) {
      annotations = next;
      changed();
    }
    return;
  }
  const count = annotations.reduce(
    (n, a) => n + (a.surfacePatches?.length || 0),
    0,
  );
  if (count + patches.length > 40000) {
    toast("本輪筆跡接近上限，請先提交呢一批。");
    return;
  }
  let region = annotations.find(
    (a) =>
      a.id === selectedId &&
      a.type === "region" &&
      a.color === color &&
      a.coverage === "source-v1",
  );
  const targetFaces = new Set(
    Object.entries(region?.faces || {}).flatMap(([meshId, ids]) =>
      ids.map((id) => `${meshId}:${id}`),
    ),
  );
  for (const p of patches) targetFaces.add(`${p.meshId}:${p.faceIndex}`);
  const otherFaces = annotations
    .filter((a) => a !== region)
    .reduce(
      (n, a) =>
        n +
        (a.type === "pin"
          ? 1
          : Object.values(a.faces).reduce((m, f) => m + f.length, 0)),
      0,
    );
  if (otherFaces + targetFaces.size > 20000) {
    toast("本輪標注接近上限，請先提交呢一批。");
    return;
  }
  if (!region) {
    if (annotations.length >= 200) return;
    region = {
      id: newId(),
      type: "region",
      label: regionName({ color }),
      color,
      coverage: "source-v1",
      faces: {},
      surfacePatches: [],
    };
    annotations.push(region);
    selectedId = region.id;
  }
  for (const p of patches) {
    (region.faces[p.meshId] ||= []).push(p.faceIndex);
    region.surfacePatches.push(p);
  }
  for (const key of Object.keys(region.faces))
    region.faces[key] = [...new Set(region.faces[key])].sort((a, b) => a - b);
  changed();
}
const viewer = new ModelViewer($("#viewer"), {
  onReady: async (data) => {
    await api("ready", { ...owner(), ...data });
    loadedReceipt = data;
  },
  onEdit: beginEdit,
  onPin,
  onPaint,
  onStrokeEnd: () => {
    clearTimeout(saveTimer);
    flushDraft().catch((e) => toast(e.message));
  },
  onError: toast,
});
/* The theme follows the system, so it can change while the page is open — at
   dusk, or when the reviewer flips the setting mid-review. CSS repaints itself;
   the WebGL canvas will not until it is told to. */
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  viewer.applyTheme();
  viewer.render();
});
viewer.onSelect = (id) => {
  selectedId = id;
  renderAnnotations();
};
viewer.onRelocate = (pin) => {
  const a = annotations.find((a) => a.id === relocatingId && a.type === "pin");
  if (!a) return;
  Object.assign(a, pin);
  selectedId = a.id;
  relocatingId = null;
  setMode("orbit");
  changed();
};
viewer.setRadius(22);

async function flushDraft() {
  if (saveFlight) {
    await saveFlight;
    if (editSeq > savedSeq) return flushDraft();
    return;
  }
  if (editSeq === savedSeq || !loadedId) return;
  // An uncertain write must be replayed unchanged: the server may have saved it
  // before its response was lost, while the user has already made another edit.
  pendingWrite ||= {
    revision,
    labelCursor,
    annotations: clone(annotations),
    camera: viewer.cameraState(),
    seq: editSeq,
  };
  cacheDraft();
  const seq = pendingWrite.seq,
    modelId = loadedId,
    payload = {
      ...owner(),
      revision: pendingWrite.revision,
      labelCursor: pendingWrite.labelCursor ?? labelCursor,
      annotations: viewer.serializeAnnotations(pendingWrite.annotations),
      camera: pendingWrite.camera,
    };
  saveFlight = (async () => {
    try {
      const draft = await api("draft", payload, "PUT");
      if (loadedId !== modelId) return;
      revision = draft.revision;
      savedSeq = seq;
      pendingWrite = null;
      state.draft = {
        ...draft,
        annotations: undefined,
        annotationCount: annotations.length,
      };
      // Refresh permissions on the same round trip. Otherwise the first mark
      // leaves the buttons grey until the next poll, and re-deriving them here
      // would put the decision back in the browser, where it went wrong.
      if (draft.capabilities) state.capabilities = draft.capabilities;
      cacheDraft();
      $("#save-status").textContent =
        editSeq === savedSeq ? "草稿已保存" : "保存中…";
    } catch (e) {
      $("#save-status").textContent = "未同步 · 草稿仍在本機";
      throw e;
    } finally {
      saveFlight = null;
      updateButtons();
    }
  })();
  await saveFlight;
  if (editSeq > savedSeq) return flushDraft();
}
function updateButtons() {
  // The server decides what is permitted and says why when it is not. The page
  // only adds what the server cannot know: whether this tab has finished saving.
  const can = state?.capabilities || {};
  const ready =
      !!loadedId && viewer.enabled && !recoveryBlocked && !accessBlocked,
    settled = editSeq === savedSeq && !saveFlight,
    busy = submitting || !ready;
  // Marks this tab has not managed to save yet still count as something to hand
  // over — submitting flushes first. Requiring the server to have seen them
  // would disable the button during exactly the outage it exists to survive.
  $("#submit-feedback").disabled =
    busy || !can.canEdit || (!can.canSubmit && !annotations.length);
  $("#finish-review").disabled = busy || !can.canFinish || !settled;
  $("#undo").disabled = busy || !undoStack.length;
  $("#redo").disabled = busy || !redoStack.length;
  $("#review-status").textContent = accessBlocked
    ? loadedId && initialDraftRestored
      ? "授權已失效 · 草稿仍保留"
      : "尚未取得審閱權限"
    : !ready
      ? "載入模型"
      : !followActive
        ? "較早版本 · 一樣可以標記"
        : state?.locked
          ? "另一個視窗都開住呢一版"
          : can.blockedReason || "目前版本 · 可以開始標記";
  updateReceipt();
  renderVersions();
  const newer = !followActive && state?.active;
  $("#pending-banner").hidden = !newer;
  if (newer)
    $("#pending-text").textContent =
      `你正在睇較早版本；Agent 目前展示 ${state.active.version || state.active.name}。`;
  $("#resume-banner").hidden = !state?.locked || accessBlocked;
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => (b.disabled = busy || !can.canEdit));
  document
    .querySelectorAll(".delete-annotation, .edit-action")
    .forEach((b) => (b.disabled = busy || !can.canEdit));
}
function renderAnnotations() {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(() => {
    renderFrame = null;
    viewer.setAnnotations(annotations, selectedId);
    $("#annotation-count").textContent = annotations.length;
    const list = $("#annotations-list");
    list.replaceChildren();
    if (!annotations.length) {
      const div = document.createElement("div");
      div.className = "annotation-empty";
      div.textContent = "將想改嘅位置\n標記喺模型上。";
      list.append(div);
    }
    for (const a of annotations) {
      const row = document.createElement("div");
      row.className = `annotation-row ${a.id === selectedId ? "selected" : ""}`;
      row.dataset.annotationId = a.id;
      const select = document.createElement("button");
      select.className = "annotation-select";
      const badge = document.createElement("span");
      badge.className = "annotation-badge";
      badge.style.background = a.color;
      badge.textContent = a.type === "pin" ? a.label : "";
      const text = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = a.type === "pin" ? "點標籤" : regionName(a);
      const detail = document.createElement("small");
      detail.textContent =
        a.type === "pin"
          ? "已固定在模型表面"
          : a.coverage === "source-v1"
            ? "沿表面筆跡標記"
            : "舊版整面標記 · 原樣保留";
      text.append(title, detail);
      select.append(badge, text);
      select.addEventListener("click", () => {
        selectedId = a.id;
        color = a.color;
        updatePalette();
        renderAnnotations();
      });
      const remove = document.createElement("button");
      remove.className = "delete-annotation";
      remove.innerHTML = icon("trash");
      remove.setAttribute(
        "aria-label",
        a.type === "pin" ? `刪除標記 ${a.label}` : `刪除${regionName(a)}`,
      );
      remove.disabled =
        !!(state?.locked && !state?.owned) || submitting || recoveryBlocked;
      remove.addEventListener("click", async () => {
        try {
          if (!(await beginEdit())) return;
          annotations = annotations.filter((x) => x.id !== a.id);
          if (selectedId === a.id) selectedId = null;
          changed();
          await flushDraft();
        } catch (e) {
          toast(e.message);
        }
      });
      const focus = document.createElement("button");
      focus.className = "quiet-dark annotation-action";
      focus.textContent = "定位";
      focus.setAttribute(
        "aria-label",
        `轉視角查看 ${a.type === "pin" ? a.label : regionName(a)}`,
      );
      focus.addEventListener("click", () => viewer.focusAnnotation(a));
      row.append(select, focus);
      if (a.type === "pin") {
        const move = document.createElement("button");
        move.className = "quiet-dark annotation-action edit-action";
        move.textContent = "移動";
        move.setAttribute("aria-label", `移動標籤 ${a.label}`);
        move.disabled = remove.disabled;
        move.addEventListener("click", () => {
          relocatingId = a.id;
          setMode("relocate");
          toast(`點模型表面移動 ${a.label}；Esc 取消。`);
        });
        row.append(move);
      }
      row.append(remove);
      list.append(row);
    }
  });
}
function setMode(next) {
  mode = next;
  if (next !== "relocate") relocatingId = null;
  viewer.setVisible(true);
  $("#toggle-marks").textContent = "隱藏標注";
  $("#toggle-marks").setAttribute("aria-pressed", "false");
  viewer.setMode(next);
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => b.classList.toggle("active", b.dataset.mode === next));
  $("#tool-options").hidden = false;
  $("#fill-control").hidden = next !== "fill";
  $(".palette").hidden = ["erase", "relocate"].includes(next);
  $("#radius-control").hidden = !["paint", "erase"].includes(next);
  $("#new-region").hidden = next !== "paint";
  $("#tool-hint").textContent = {
    paint: "塗可見表面 · Option／Alt 拖動旋轉",
    erase: "擦走可見筆跡 · 不影響模型 · Option／Alt 旋轉",
    fill: "移上預覽 · 單擊填色 · Option／Alt 旋轉",
    relocate: "點表面移動標籤 · Esc 取消",
    orbit: "拖動旋轉 · 雙擊落標籤 · 右鍵平移 · 滾輪縮放",
  }[next];
}
function updatePalette() {
  document
    .querySelectorAll(".color-button")
    .forEach((b) => b.classList.toggle("active", b.dataset.color === color));
}
for (const c of colors) {
  const b = document.createElement("button");
  b.className = "color-button";
  b.dataset.color = c;
  b.style.background = c;
  b.setAttribute("aria-label", `選擇顏色 ${c}`);
  b.addEventListener("click", () => {
    color = c;
    updatePalette();
  });
  $(".palette").append(b);
}
updatePalette();
document
  .querySelectorAll("[data-mode]")
  .forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
$("#brush-size").addEventListener("input", (e) =>
  viewer.setRadius(Number(e.target.value)),
);
$("#fill-range").addEventListener("input", (e) =>
  viewer.setFillTolerance(Number(e.target.value)),
);
$("#toggle-marks").addEventListener("click", () => {
  viewer.setVisible(!viewer.annotationsVisible);
  $("#toggle-marks").textContent = viewer.annotationsVisible
    ? "隱藏標注"
    : "顯示標注";
  $("#toggle-marks").setAttribute(
    "aria-pressed",
    String(!viewer.annotationsVisible),
  );
});
$("#neutral-view").addEventListener("click", () => {
  viewer.setNeutral(!viewer.neutral);
  $("#neutral-view").textContent = viewer.neutral ? "原色檢視" : "素色檢視";
  $("#neutral-view").setAttribute("aria-pressed", String(viewer.neutral));
});
$("#toggle-echo").addEventListener("click", () => {
  viewer.agentHidden = !viewer.agentHidden;
  viewer.setVisible(viewer.annotationsVisible);
  $("#toggle-echo").textContent = viewer.agentHidden ? "顯示回顯" : "隱藏回顯";
  $("#toggle-echo").setAttribute("aria-pressed", String(viewer.agentHidden));
});
$("#focus-echo").addEventListener("click", () => {
  const a = viewer.agentEcho?.annotations?.[0];
  if (a) viewer.focusAnnotation(a);
});
$("#home-view").addEventListener("click", () => viewer.home());
$("#new-region").addEventListener("click", () => {
  selectedId = null;
  renderAnnotations();
  setMode("paint");
  toast("下一筆會建立獨立顏色區域。");
});
$("#toggle-annotations").addEventListener("click", () => {
  $("#annotations-list").hidden = !$("#annotations-list").hidden;
  $("#toggle-annotations").setAttribute(
    "aria-expanded",
    String(!$("#annotations-list").hidden),
  );
  $(".annotations-panel").classList.toggle(
    "collapsed",
    $("#annotations-list").hidden,
  );
  $("#toggle-annotations").innerHTML = icon(
    $("#annotations-list").hidden ? "plus" : "minus",
  );
});
async function travelHistory(redo = false) {
  const from = redo ? redoStack : undoStack,
    to = redo ? undoStack : redoStack;
  if (!from.length) return;
  try {
    const savedUndo = [...undoStack],
      savedRedo = [...redoStack];
    if (!(await beginEdit())) return;
    undoStack = savedUndo;
    redoStack = savedRedo;
    const actualFrom = redo ? redoStack : undoStack,
      actualTo = redo ? undoStack : redoStack;
    actualTo.push(JSON.stringify(annotations));
    annotations = JSON.parse(actualFrom.pop());
    selectedId = null;
    changed();
    await flushDraft();
  } catch (e) {
    toast(e.message);
  }
}
$("#undo").addEventListener("click", () => travelHistory());
$("#redo").addEventListener("click", () => travelHistory(true));
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && mode === "relocate") setMode("orbit");
  if (["TEXTAREA", "INPUT", "SELECT"].includes(document.activeElement?.tagName))
    return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    travelHistory(e.shiftKey);
  }
});
$("#help-button").addEventListener("click", () =>
  $("#help-dialog").showModal(),
);
$("#close-help").addEventListener("click", () => $("#help-dialog").close());

function showRecovery(backup) {
  if (recoveryUrl) URL.revokeObjectURL(recoveryUrl);
  recoveryUrl = URL.createObjectURL(
    new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
  );
  $("#download-recovery").href = recoveryUrl;
  $("#download-recovery").download = `meshcue-${loadedId}-unsynced.json`;
  $("#recovery-banner").hidden = false;
}
async function restoreDraft(draft) {
  annotations = clone(draft?.annotations || []);
  labelCursor = Math.max(
    draft?.labelCursor || 0,
    ...annotations
      .filter((a) => a.type === "pin")
      .map((a) => letterNumber(a.label)),
  );
  revision = draft?.revision || 0;
  editSeq = 0;
  savedSeq = 0;
  pendingWrite = null;
  recoveryBlocked = false;
  viewer.restoreCamera(draft?.camera);
  let cached;
  try {
    cached = JSON.parse(localStorage.getItem(draftKey()));
    if (!cached && state.legacyDraftCache)
      cached = JSON.parse(localStorage.getItem(`3d-review-draft-${loadedId}`));
    const backupKey = localStorage.getItem(`${draftKey()}-recovery-latest`);
    if (backupKey) {
      const backup = JSON.parse(localStorage.getItem(backupKey));
      if (backup) showRecovery(backup);
    }
  } catch {}
  // Take the round before anything can return early, and take it unconditionally.
  // This used to sit below the clean-cache exit and behind an ownership test, so
  // a reviewer whose draft was fully saved never claimed it back and had no way
  // to reach it: no banner, no button, and the page offered no explanation.
  // Claiming also returns a draft newer than the poll this load started from.
  try {
    state = await api("review/begin", owner());
    draft = state.draft;
    annotations = clone(draft?.annotations || []);
    labelCursor = Math.max(
      draft?.labelCursor || 0,
      ...annotations
        .filter((a) => a.type === "pin")
        .map((a) => letterNumber(a.label)),
    );
    revision = draft?.revision || 0;
  } catch (e) {
    if (e.code !== "NOT_READY") throw e;
  }
  if (!cached?.dirty) return;
  const uncertainWriteMatches =
    cached.pendingWrite?.revision === revision - 1 &&
    sameValue(
      viewer.serializeAnnotations(cached.pendingWrite.annotations),
      draft?.annotations,
    ) &&
    sameValue(cached.pendingWrite.camera, draft?.camera);
  if (cached.revision === revision || uncertainWriteMatches) {
    annotations = cached.annotations;
    labelCursor = Math.max(
      labelCursor,
      cached.labelCursor || 0,
      ...annotations
        .filter((a) => a.type === "pin")
        .map((a) => letterNumber(a.label)),
    );
    viewer.restoreCamera(cached.camera);
    editSeq = cached.editSeq || 1;
    savedSeq = cached.savedSeq || 0;
    pendingWrite = cached.pendingWrite || null;
    toast("已恢復上次未同步嘅草稿。");
    return;
  }
  // A genuine concurrent conflict is not an acknowledgement retry. Keep the
  // complete local draft under a separate durable key before allowing edits.
  const backup = { versionId: loadedId, ...cached };
  showRecovery(backup);
  try {
    const key = `${draftKey()}-recovery-${newId()}`;
    localStorage.setItem(key, JSON.stringify(backup));
    const superseded = localStorage.getItem(`${draftKey()}-recovery-latest`);
    localStorage.setItem(`${draftKey()}-recovery-latest`, key);
    // Write, repoint, then drop: a crash never strands the pointer. Only the
    // latest backup is ever offered, so keeping older copies just consumes the
    // quota that has to protect the next unsynced draft.
    if (superseded && superseded !== key) localStorage.removeItem(superseded);
    cacheDraft();
    toast("未同步草稿已獨立備份，可下載交畀 Agent；目前顯示伺服器已保存版本。");
  } catch {
    recoveryBlocked = true;
    toast("本機空間不足，已保護未同步草稿並暫停編輯；請下載備份交畀 Agent。");
  }
}

// Tabs are the whole point of keeping every version: a marking made against an
// earlier model stays a first-class act instead of something the reviewer has
// to describe in prose. Each tab carries its own draft, so switching is free.
function renderVersions() {
  const bar = $("#version-tabs");
  const versions = state?.versions || [];
  bar.hidden = versions.length < 2;
  if (bar.hidden) {
    bar.textContent = "";
    return;
  }
  const signature = versions
    .map(
      (v) =>
        `${v.id}:${v.active}:${v.annotations}:${v.unsubmitted}:${v.submissions}:${v.busy}:${v.id === viewingId}`,
    )
    .join("|");
  if (bar.dataset.signature === signature) return;
  bar.dataset.signature = signature;
  bar.textContent = "";
  for (const v of versions) {
    const tab = document.createElement("button");
    tab.className = "version-tab";
    tab.type = "button";
    tab.role = "tab";
    tab.dataset.versionId = v.id;
    tab.setAttribute("aria-selected", String(v.id === viewingId));
    if (v.id === viewingId) tab.classList.add("selected");
    if (v.active) tab.classList.add("current");
    const marks = v.annotations || v.submissions;
    tab.title = [
      v.name,
      v.version,
      `${(v.triangles || 0).toLocaleString()} 面`,
      v.active ? "Agent 目前展示" : "較早版本",
      v.submissions ? `${v.submissions} 批已提交` : null,
      v.busy ? "另一個視窗開住" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const caption = document.createElement("span");
    caption.textContent = v.label || v.version || v.name || "版本";
    tab.append(caption);
    if (marks) {
      const badge = document.createElement("em");
      badge.className = v.unsubmitted ? "badge unsent" : "badge";
      badge.textContent = String(marks);
      tab.append(badge);
    }
    tab.addEventListener("click", () => selectVersion(v.id));
    bar.append(tab);
  }
}
async function selectVersion(id) {
  if (!id || id === viewingId || loadFlight || submitting) return;
  // Switching costs a full re-tessellation, and the guard above silently drops
  // anything clicked during one. Make the strip look as unavailable as it is,
  // so the clicks are not made in the first place.
  $("#version-tabs").classList.add("busy");
  // Claim the load slot before the first await. The poll starts its own load
  // whenever the Agent's version differs, and two loads racing each other end
  // as a hash mismatch: bytes from one model checked against another's digest.
  loadFlight = (async () => {
    if (editSeq > savedSeq) await flushDraft().catch((e) => toast(e.message));
    viewingId = id;
    // Choosing the version the Agent is showing hands the choice back to it.
    followActive = id === state?.active?.id;
    const full = await api(
      `state?clientId=${encodeURIComponent(clientId)}&versionId=${encodeURIComponent(id)}&full=1`,
    );
    state = full;
    await loadVersion(full);
  })();
  try {
    await loadFlight;
  } finally {
    loadFlight = null;
    $("#version-tabs").classList.remove("busy");
    renderVersions();
    updateButtons();
  }
}
async function loadVersion(fullState) {
  const model = fullState.model || fullState.active;
  if (!model) return;
  viewingId = fullState.viewing || model.id;
  loadedId = model.id;
  loadedReviewId = fullState.reviewId;
  sweepDraftCache();
  loadedReceipt = null;
  labelCursor = 0;
  echoId = null;
  relocatingId = null;
  $("#echo-panel").hidden = true;
  $("#download-model").href = endpoint(`api/download/${model.filename}`);
  $("#download-model").download =
    `${model.name}-${model.version}.${model.format}`;
  $("#download-model").hidden = false;
  initialDraftRestored = false;
  annotations = [];
  selectedId = null;
  revision = 0;
  editSeq = 0;
  savedSeq = 0;
  undoStack = [];
  redoStack = [];
  submissionKey = null;
  pendingWrite = null;
  recoveryBlocked = false;
  $("#recovery-banner").hidden = true;
  $("#model-name").textContent = model.name;
  $("#model-version").textContent = model.version;
  $("#model-info").textContent =
    `${model.format.toUpperCase()} · ${model.units}`;
  $("#loading").hidden = false;
  $("#loading .spinner").hidden = false;
  $("#loading-text").textContent = "載入並核對模型版本";
  $("#loading-hint").textContent = "模型載入完成後就可以開始標記";
  $("#save-status").textContent = "核對中…";
  try {
    const stats = await viewer.load(
      model,
      endpoint(`api/models/${model.filename}`),
      (stage) => {
        $("#loading-text").textContent = stage;
      },
    );
    if (!stats) return;
    $("#model-info").textContent =
      `${model.triangles.toLocaleString()} 面 · ${model.format.toUpperCase()} · ${model.units}`;
    updatePrecision(stats);
    await restoreDraft(fullState.draft);
    initialDraftRestored = true;
    renderAnnotations();
    $("#loading").hidden = true;
    $("#save-status").textContent =
      editSeq > savedSeq
        ? "恢復草稿中…"
        : annotations.length
          ? "草稿已保存"
          : "未開始標記";
    updateButtons();
    if (editSeq > savedSeq) await flushDraft().catch((e) => toast(e.message));
  } catch (e) {
    if (!initialDraftRestored) {
      viewer.enabled = false;
      loadedId = null;
    }
    $("#loading-text").textContent = e.message;
    $("#loading .spinner").hidden = true;
    toast(e.message);
    updateButtons();
  }
}
function sameValue(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]),
    )
  );
}
async function readState() {
  try {
    if (loadFlight || beginFlight || saveFlight || submitting) return;
    const statePath =
      `state?clientId=${encodeURIComponent(clientId)}` +
      (viewingId ? `&versionId=${encodeURIComponent(viewingId)}` : "");
    const wasBlocked = accessBlocked;
    let incoming;
    try {
      incoming = await api(statePath);
    } catch (e) {
      if (e.code !== "ACCESS_REQUIRED") throw e;
      // The host must already have admitted this TCP peer. No credential is
      // supplied by JavaScript or the URL; the response sets an HttpOnly cookie.
      await api("access/claim", {});
      accessRecoveryNeeded = true;
      incoming = await api(statePath);
    }
    // A sibling tab may have collected the shared HttpOnly cookie. This tab
    // still needs its own association even if it did not win /claim.
    if (wasBlocked) accessRecoveryNeeded = true;
    if (loadFlight || beginFlight || saveFlight || submitting) return;
    if (
      accessRecoveryNeeded &&
      loadedReceipt &&
      incoming.active?.id === loadedId &&
      incoming.reviewId === loadedReviewId
    ) {
      // Re-associate only this verified model/tab, then recover its draft using
      // the existing revision/conflict checks. Never claim a foreign edit lock.
      await api("ready", { ...owner(), ...loadedReceipt });
      incoming = await api(`${statePath}&full=1`);
      state = incoming;
      await restoreDraft(incoming.draft);
      renderAnnotations();
    }
    accessBlocked = false;
    const recovered = accessRecoveryNeeded;
    accessRecoveryNeeded = false;
    // Follow whatever the Agent puts on screen, unless the reviewer pinned an
    // earlier tab. Their own choice outranks the Agent's; an unsynced draft
    // outranks both, because reloading the viewer would discard it.
    const wanted = followActive ? incoming.active?.id : viewingId;
    if (wanted !== loadedId || incoming.reviewId !== loadedReviewId) {
      if (loadedId && editSeq > savedSeq) {
        toast("偵測到版本不同，已保留當前草稿，停止自動換版。");
        return;
      }
      const full = await api(
        `state?clientId=${encodeURIComponent(clientId)}&full=1` +
          (wanted ? `&versionId=${encodeURIComponent(wanted)}` : ""),
      );
      if (beginFlight || saveFlight || submitting || editSeq > savedSeq) return;
      state = full;
      if (full.model || full.active) {
        loadFlight = loadVersion(full);
        await loadFlight;
        loadFlight = null;
      } else {
        $("#loading-text").textContent = "等候 Agent 交付第一個模型";
        $("#loading .spinner").hidden = true;
      }
    } else state = incoming;
    if (recovered && state?.owned && editSeq > savedSeq && !recoveryBlocked)
      await flushDraft();
    $(".connection-dot").classList.add("online");
    $("#connection-status").textContent = incoming.bridgeEnabled
      ? "回傳原會話"
      : "本機審閱";
    updateEcho(incoming);
    updateOutbox(incoming);
    updateButtons();
  } catch (e) {
    $(".connection-dot").classList.remove("online");
    $("#connection-status").textContent = accessBlocked
      ? "請返回原對話"
      : "連線暫停";
    $("#save-status").textContent = accessBlocked
      ? loadedId && initialDraftRestored
        ? "授權已失效 · 草稿仍保留"
        : "尚未取得審閱權限"
      : "服務暫時離線";
    updateButtons();
  }
}
function updateReceipt() {
  if (submitting) return;
  const last = state?.submissions?.findLast((s) => s.versionId === loadedId);
  if (!last) {
    $("#feedback-status").textContent = annotations.length
      ? "尚未提交 · 草稿自動保存"
      : "標注會附帶三維位置及當前版本";
    return;
  }
  const status = `已保存 · ${last.deliveredAt ? "已送到原會話" : last.status === "accepted" ? "送達待核實" : "送達未確認，可重試"} · ${last.readAt ? "Agent 已讀取" : "等候 Agent 讀取"}`;
  $("#feedback-status").textContent =
    status +
    (editSeq > savedSeq || revision !== last.revision
      ? "；另有尚未提交改動"
      : "");
}
// Hitting the subdivision budget produces no error and no visible defect until
// the reviewer tries to paint a large flat face and the brush jumps a whole
// panel at a time — which looks exactly like a bug that was fixed for a
// different reason. Say it up front, in the wording precheck already uses on
// the Agent side, so both halves of the conversation name the same thing.
function updatePrecision(stats) {
  loadedPrecision = stats || null;
  const short = stats?.rationed;
  $("#precision-banner").hidden = !short;
  if (!short) return;
  $("#precision-text").textContent =
    `呢個模型嘅面數已經食晒審閱網格嘅上限（要 ${stats.wanted.toLocaleString()} 個三角形，得 ${stats.budget.toLocaleString()}）。` +
    `大平面唔會再細分，畫筆喺𠮶啲面上會一整片咁跳；細節位唔受影響。想要更準嘅筆觸，叫 Agent 用低啲嘅弦高重新匯出。`;
}
// The one channel that would report a delivery failure is the channel that is
// failing, so the reviewer is the only person present to tell. A single missed
// attempt is a blip the retry covers; from the second one the page says so and
// keeps saying it, with the host's own reason rather than a generic apology.
function updateOutbox(incoming) {
  const stuck = (incoming.submissions || []).filter(
    (item) => item.status !== "accepted" && (item.attempts || 0) >= 2,
  );
  $("#outbox-banner").hidden = !stuck.length;
  if (!stuck.length) return;
  const stalled = stuck.filter((item) => item.status === "stalled");
  const worst = stalled[0] || stuck[0];
  const reason = worst.lastError?.message
    ? `原因：${worst.lastError.message}`
    : "原因未明";
  $("#outbox-text").textContent = stalled.length
    ? `${stuck.length} 批標記一直送唔到 Agent（已重試 ${worst.attempts} 次，仍會繼續）。${reason}。標記已保存喺本機，請喺原會話講一聲。`
    : `${stuck.length} 批標記未送到 Agent，正在重試（第 ${worst.attempts} 次）。${reason}。標記已保存，唔使重新標。`;
}
function updateEcho(incoming) {
  const echo = incoming.echo;
  $("#echo-stale").hidden =
    !echo || (echo.revision === revision && editSeq === savedSeq);
  if ((echo?.id || null) === echoId || !viewer.enabled) return;
  echoId = echo?.id || null;
  viewer.setAgentEcho(echo?.versionId === loadedId ? echo : null);
  $("#echo-panel").hidden = !viewer.agentEcho;
  $("#echo-summary").textContent = viewer.agentEcho
    ? `Agent 理解：${echo.summary}`
    : "";
}
function pollState() {
  if (pollFlight) return pollFlight;
  pollFlight = readState().finally(() => {
    pollFlight = null;
  });
  return pollFlight;
}
$("#submit-feedback").addEventListener("click", async () => {
  if (submitting) return;
  submitting = true;
  updateButtons();
  $("#submit-feedback").textContent = "提交中…";
  try {
    await flushDraft();
    submissionKey ||=
      state?.submissions?.findLast(
        (s) => s.versionId === loadedId && s.revision === revision,
      )?.id || newId();
    const result = await api("feedback", {
      ...owner(),
      revision,
      submissionId: submissionKey,
    });
    state.draft = { ...state.draft, submittedRevision: revision };
    state.submissions = [
      ...(state.submissions || []).filter((s) => s.id !== result.id),
      result,
    ];
    updateReceipt();
    $("#download-feedback").href = endpoint(`api/submissions/${result.id}`);
    $("#download-feedback").hidden = false;
    toast("標記已保存，提交狀態會按實際回執更新；模型仍然鎖定。");
  } catch (e) {
    $("#feedback-status").textContent = e.message;
    toast(e.message);
  } finally {
    submitting = false;
    $("#submit-feedback").textContent = "交畀 Agent ↗";
    updateButtons();
  }
});
$("#finish-review").addEventListener("click", async () => {
  if (submitting) return;
  submitting = true;
  updateButtons();
  try {
    await flushDraft();
    const result = await api("review/finish", owner());
    state = result;
    toast(
      result.sealed
        ? "本輪已結束；仲未提交嘅標記已經一併封存交畀 Agent。"
        : "本輪審閱已結束，已提交標記仍有保存。",
    );
  } catch (e) {
    toast(e.message);
  } finally {
    submitting = false;
    updateButtons();
    await pollState();
  }
});
$("#go-active").addEventListener("click", () => {
  if (state?.active?.id)
    selectVersion(state.active.id).catch((e) => toast(e.message));
});
$("#resume-review").addEventListener("click", async () => {
  if (submitting) return;
  submitting = true;
  updateButtons();
  try {
    state = await api("review/resume", owner());
    await restoreDraft(state.draft);
    selectedId = null;
    undoStack = [];
    redoStack = [];
    renderAnnotations();
    if (editSeq > savedSeq) await flushDraft();
    toast("已接續原有草稿。");
  } catch (e) {
    toast(e.message);
  } finally {
    submitting = false;
    updateButtons();
  }
});

window.addEventListener("beforeunload", (e) => {
  if (editSeq > savedSeq) {
    cacheDraft();
    e.preventDefault();
    e.returnValue = "";
  }
});
await pollState();
setInterval(pollState, 2200);
// A visible user action extends remembered-browser access. Passive state and
// lock heartbeats do not count as use; no unconditional renewal timer runs.
let activityTimer = null,
  activityFlight = false,
  activityPending = false,
  lastActivitySent = 0;
function noteActivity(event) {
  if (!event.isTrusted || document.visibilityState !== "visible") return;
  activityPending = true;
  scheduleActivity();
}
function scheduleActivity() {
  if (
    activityTimer ||
    activityFlight ||
    !activityPending ||
    !loadedId ||
    accessBlocked ||
    document.visibilityState !== "visible"
  )
    return;
  activityTimer = setTimeout(
    async () => {
      activityTimer = null;
      if (document.visibilityState !== "visible" || !loadedId || accessBlocked)
        return;
      activityPending = false;
      activityFlight = true;
      try {
        await api("access/activity", { clientId });
        lastActivitySent = Date.now();
      } catch {
        // The state poll handles lost authorization. Keep any unsynced draft.
      } finally {
        activityFlight = false;
        scheduleActivity();
      }
    },
    Math.max(0, 60_000 - (Date.now() - lastActivitySent)),
  );
}
for (const event of ["pointerdown", "wheel", "keydown"])
  document.addEventListener(event, noteActivity, { passive: true });
document.addEventListener("visibilitychange", noteActivity);
setInterval(() => {
  if (state?.owned && !accessBlocked)
    api("review/heartbeat", { clientId, versionId: loadedId }).catch(() => {});
}, 10000);

// Read-only diagnostics for browser acceptance checks; never mutate review state.
window.__reviewDiagnostics = () => ({
  versionId: loadedId,
  reviewId: loadedReviewId,
  draftCacheKey: draftKey(),
  precision: loadedPrecision,
  accessBlocked,
  revision,
  annotationCount: annotations.length,
  labelCursor,
  dirty: editSeq > savedSeq,
  annotations: viewer.serializeAnnotations(annotations),
  camera: viewer.cameraState(),
  viewer: viewer.stats(),
  locked: state?.locked,
  owned: state?.owned,
  viewing: viewingId,
  followActive,
  capabilities: state?.capabilities || null,
  versions: (state?.versions || []).map((v) => ({
    id: v.id,
    version: v.version,
    active: v.active,
    annotations: v.annotations,
    unsubmitted: v.unsubmitted,
    submissions: v.submissions,
  })),
});
