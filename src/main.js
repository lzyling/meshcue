import { newId } from "./browser-crypto.js";
import "./style.css";
import { ModelViewer } from "./viewer.js";
import { buildOrientCube, compassTransform } from "./orient-cube.js";
import { latestVersion, viewingBehindLatest } from "./versions.js";
import {
  t,
  currentLocale,
  setLocale,
  LOCALES,
  localeName,
} from "./i18n/index.js";
import { DEVICES } from "./pointer-profile.js";
import {
  readThemeChoice,
  storeThemeChoice,
  applyTheme,
  THEMES,
} from "./theme.js";
import {
  letterLabel,
  letterNumber,
  erasePatches,
  facesOf,
} from "./annotation-edits.js";

/* index.html ships with a fixed lang, because the language is not known until
   the reviewer's own preferences have been read. Correcting it here is what
   makes hyphenation, font selection and a screen reader's pronunciation match
   the words actually on the page. */
document.documentElement.lang = currentLocale();

const $ = (selector) => document.querySelector(selector);
const app = $("#app");
/* Icons were Unicode glyphs, which is not a style choice but an absence of
   control: the operating system font decided their shape, weight and baseline,
   the rarer ones (▱ ▰ ⌖ ⌂) are missing from some fonts entirely, and ▱ against
   ▰ differed only by fill — eraser and paint bucket were indistinguishable side
   by side. These are drawn here, ship inside the bundle, and depict the action
   rather than gesture at it. Sized in em so every existing font-size rule,
   including the responsive ones, keeps working untouched. */
/* Before a single element exists: resolving the theme afterwards paints one
   frame of the wrong one on every load. */
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
let themeChoice = readThemeChoice();
applyTheme(themeChoice, darkQuery);

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
<g id="mc-check" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.6 9.5 17.5 19.5 6.8"/></g>
<g id="mc-collapse-left" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6.5 9 12l5.5 5.5"/><path d="M19 5.5v13"/></g>
<g id="mc-expand-right" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6.5 15 12l-5.5 5.5"/><path d="M5 5.5v13"/></g>
<g id="mc-echo" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 6.8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7.4a2 2 0 0 1-2 2h-6.6L7 19.8v-3.6H6a2 2 0 0 1-2-2z"/></g>
<g id="mc-pin" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 21.2s6.4-6.3 6.4-11a6.4 6.4 0 1 0-12.8 0c0 4.7 6.4 11 6.4 11z"/><circle cx="12" cy="10" r="2.4"/></g>
<g id="mc-eye" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1.8 12S5.6 5.8 12 5.8 22.2 12 22.2 12 18.4 18.2 12 18.2 1.8 12 1.8 12z"/><circle cx="12" cy="12" r="3"/></g>
<g id="mc-eye-off" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9.6 6.2A9.6 9.6 0 0 1 12 5.8c6.4 0 10.2 6.2 10.2 6.2a17 17 0 0 1-3.2 3.8M6.1 8.2A17 17 0 0 0 1.8 12S5.6 18.2 12 18.2c1.2 0 2.2-.2 3.2-.5"/><path d="M10 10a2.8 2.8 0 0 0 3.9 3.9"/><path d="M3.5 3.5l17 17"/></g>
<g id="mc-help" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.3"/><circle cx="12" cy="16.6" r="1" fill="currentColor" stroke="none"/></g>
</defs></svg>`;
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#mc-${name}"/></svg>`;
/* Catalogue text goes into markup, so it is escaped on the way in. Five
   languages of apostrophes and quotation marks are not a place to rely on
   nobody having typed an angle bracket. */
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const T = (key, vars) => esc(t(key, vars));
/* The service names its refusals and the browser is what has to say them out
   loud, so a refusal the reader will see is looked up by code rather than
   printed in whatever language the service happens to be written in. A code
   with no entry yet falls back to the service's own words: half-translated is
   poor, but silence in place of a reason is worse. This is the seam where the
   rest of the service's browser-facing text will join. */
// A server message is written for an agent and a log file. These are the
// refusals a reviewer can actually cause from the page, so they are said in the
// reviewer's own language; anything else falls through to the server's text,
// which is the honest thing to show when nobody has translated it.
const ERROR_KEYS = {
  ACCESS_REQUIRED: "error.accessRequired",
  EMPTY: "error.empty",
  SAVING: "error.saving",
  STALE_DRAFT: "error.staleDraft",
  ORIGIN_BUSY: "error.originBusy",
  ACCESS_EXPIRED: "error.accessExpired",
  ACCESS_LIMIT: "error.accessLimit",
  INTEGRATION_DISABLED: "error.integrationDisabled",
  DELIVERY_UNCONFIRMED: "error.deliveryUnconfirmed",
};
const BLOCKED_KEYS = {
  NOT_IN_REVIEW: "review.notInReview",
  NOT_MARKED: "review.notMarked",
  ROUND_CLOSED: "review.roundClosed",
};
const blockedText = (code) => (BLOCKED_KEYS[code] ? t(BLOCKED_KEYS[code]) : "");
const serverMessage = (json) =>
  (json?.code && ERROR_KEYS[json.code] && t(ERROR_KEYS[json.code])) ||
  json?.error ||
  t("conn.actionFailed");
app.innerHTML = `${SPRITE}
<header class="app-header"><div class="brand-mark">${icon("brand")}</div><div class="brand"><strong>MeshCue</strong><span>${T("app.tagline")}</span></div><span class="prototype">${T("app.preview", { version: __MESHCUE_VERSION__ })}</span><div class="header-right"><span class="connection-dot"></span><span id="connection-status">${T("conn.connecting")}</span><select class="quiet" id="locale-choice" aria-label="${T("settings.language")}"></select><select class="quiet" id="device-choice" aria-label="${T("settings.device")}"><option value="auto">${T("settings.deviceAuto")}</option><option value="mouse">${T("settings.deviceMouse")}</option><option value="trackpad">${T("settings.deviceTrackpad")}</option></select><select class="quiet" id="theme-choice" aria-label="${T("settings.theme")}"><option value="system">${T("settings.themeSystem")}</option><option value="light">${T("settings.themeLight")}</option><option value="dark">${T("settings.themeDark")}</option></select><button class="quiet icon-only" id="help-button" aria-label="${T("help.open")}">${icon("help")}</button></div></header>
<main class="workspace">
 <section class="review-panel" aria-label="${T("a11y.reviewPanel")}">
  <div class="model-heading"><div><h2 id="model-name">${T("model.awaiting")}</h2></div><div class="model-meta"><span class="version-chip" id="model-version">—</span><span id="save-status">${T("save.preparing")}</span></div></div>
  <div id="version-tabs" class="version-tabs" role="tablist" aria-label="${T("a11y.versionTabs")}" hidden></div>
  <div class="review-body">
  <aside class="annotations-panel"><div class="annotations-heading"><strong>${T("marks.heading")} <span id="annotation-count">0</span></strong><button id="toggle-annotations" class="quiet-dark" aria-label="${T("marks.collapse")}" aria-expanded="true">${icon("collapse-left")}</button></div><div id="annotations-list"><div class="annotation-empty">${T("marks.empty").replace(/\n/g, "<br>")}</div></div><div class="panel-actions"><button id="submit-feedback" class="primary-button" disabled>${T("feedback.submit")} ${icon("send")}</button><span id="feedback-status">${T("feedback.default")}</span></div></aside>
  <div class="viewer-shell">
   <div id="viewer"></div>
   <div class="viewer-top"><span class="scene-pill" id="review-status">${T("review.loadingModel")}</span><span class="scene-pill subtle" id="model-info"></span></div>
   <div class="view-actions"><button id="toggle-marks" class="quiet-dark" aria-pressed="false">${T("marks.hide")}</button><button id="neutral-view" class="quiet-dark" aria-pressed="false">${T("view.plain")}</button></div>
   <div class="orient">
    <div class="orient-stage"><div class="orient-cube" id="orient-cube" aria-hidden="true"></div></div>
    <button class="orient-home quiet-dark" id="home-view" title="${T("cube.homeTitle")}" aria-label="${T("cube.homeLabel")}">${icon("home")}</button>
   </div>
   <div class="toolbar" role="toolbar" aria-label="${T("a11y.toolbar")}">
    <button data-mode="orbit" class="tool active" title="${T("tool.orbitTitle")}" aria-label="${T("tool.orbitLabel")}">${icon("orbit")}<span>${T("tool.orbit")}</span></button>
    <button data-mode="paint" class="tool" title="${T("tool.brushTitle")}" aria-label="${T("tool.brushLabel")}">${icon("brush")}<span>${T("tool.brush")}</span></button>
    <button data-mode="erase" class="tool" aria-label="${T("tool.eraserLabel")}" title="${T("tool.eraserTitle")}">${icon("eraser")}<span>${T("tool.eraser")}</span></button>
    <button data-mode="fill" class="tool" aria-label="${T("tool.bucketLabel")}" title="${T("tool.bucketTitle")}">${icon("fill")}<span>${T("tool.bucket")}</span></button>
    <div class="tool-divider"></div><button class="tool small" id="undo" title="${T("tool.undoTitle")}" aria-label="${T("tool.undo")}">${icon("undo")}</button><button class="tool small" id="redo" title="${T("tool.redo")}" aria-label="${T("tool.redo")}">${icon("redo")}</button>
   </div>
   <div id="tool-options" class="tool-options"><div class="palette" role="group" aria-label="${T("a11y.palette")}"></div><label id="radius-control" hidden>${T("tool.size")} <input id="brush-size" type="range" min="6" max="60" value="22" aria-label="${T("tool.brushSize")}"></label><label id="fill-control" hidden>${T("tool.spread")} <input id="fill-range" type="range" min="1" max="30" value="6" aria-label="${T("tool.bucketSpread")}"></label><button class="quiet-dark" id="new-region" hidden>${icon("plus")}${T("tool.newRegion")}</button></div>
   <div id="echo-dock"><div id="echo-panel" hidden><span id="echo-summary"></span><span id="echo-stale" hidden>${T("echo.stale")}</span></div><button id="echo-recall" hidden aria-expanded="false" aria-label="${T("echo.recall")}">${icon("echo")}</button></div>
   <div id="loading" class="loading-overlay"><div class="spinner"></div><strong id="loading-text">${T("loading.preparing")}</strong><span id="loading-hint">${T("loading.hint")}</span></div>
   <div class="viewer-bottom"><span id="tool-hint">${T("hint.orbit")}</span><span class="axis-label">3D SPACE</span></div>
  </div>
  </div>
  <div id="pending-banner" class="pending-banner" hidden><span id="pending-text"></span><button id="go-latest" class="quiet">${T("version.goLatest")}</button></div>
  <div id="resume-banner" class="pending-banner" hidden><span>${T("resume.text")}</span><button id="resume-review" class="quiet">${T("resume.action")}</button></div>
  <div id="recovery-banner" class="pending-banner" hidden><span>${T("recovery.text")}</span><a id="download-recovery">${T("recovery.download")}</a></div>
  <div id="outbox-banner" class="pending-banner warn" hidden><span id="outbox-text"></span></div>
  <div id="closing-banner" class="pending-banner warn" hidden><span id="closing-text"></span></div>
  <div id="precision-banner" class="pending-banner" hidden><span id="precision-text"></span></div>
 </section>
</main><div id="toast" role="status" hidden></div>
<dialog id="help-dialog"><button id="close-help" class="dialog-close icon-only" aria-label="${T("common.close")}">${icon("close")}</button><span class="eyebrow">${T("help.eyebrow")}</span><h2>${T("help.title")}</h2><p>${T("help.p1")}</p><p>${T("help.p2")}</p><p>${T("help.p3")}</p><p>${T("help.p4")}</p><p>${T("help.p5")}</p><p>${T("help.p6")}</p><p>${T("help.p7")}</p><p>${T("help.p8")}</p><p class="muted">${T("help.p9")}</p></dialog>`;

const base = new URL("./", location.href);
const endpoint = (path) => new URL(path, base).href;
const clientId = sessionStorage.getItem("3d-review-client") || newId();
sessionStorage.setItem("3d-review-client", clientId);
const colors = ["#e76d5c", "#e6b64b", "#6ab398", "#629bd8", "#ae82ce"];
let color = colors[0];
let state = null,
  // Sticky on purpose. Once the service has said it is reclaiming itself, the
  // polls that follow fail — and a bare connection error is what a crash looks
  // like. Remembering the reason is the only way the page can keep telling the
  // truth after the thing that knew it has gone.
  closingNotice = null,
  // The last countdown the service published. A hidden tab is throttled to
  // roughly one timer a minute, so the forgotten tab this whole mechanism
  // exists to collect is exactly the one that can sleep through the announced
  // window — and then all it has left is how close the deadline was when it
  // last managed to ask.
  lastIdle = null,
  loadedId = null,
  // Named for the acceptance checks: with no download control on the page, a
  // test that wants to prove the bytes on screen belong to the version claimed
  // has to be told which file to ask the service for.
  loadedFilename = null,
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
    throw new Error(t("conn.dropped"));
  }
  if (!res.ok) {
    const err = new Error(serverMessage(json));
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
        $("#loading-hint").textContent = t("conn.connectedNoAccess");
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
// review's draft is precisely what the kept-draft promise covers.
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
    toast(t("save.storageFull"));
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
  $("#save-status").textContent = t("save.saving");
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
  if (annotations.length >= 200) return toast(t("marks.limit"));
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
/* A colour is named, not described: the swatch is already on screen, so the
   word is there to be said out loud in the original conversation. A colour with
   no name falls back to its hex, which is still something to point at. */
const colorKeys = {
  "#e76d5c": "color.red",
  "#e6b64b": "color.yellow",
  "#6ab398": "color.green",
  "#629bd8": "color.blue",
  "#ae82ce": "color.purple",
};
const colorName = (hex) => (colorKeys[hex] ? t(colorKeys[hex]) : hex);
function regionName(a) {
  return t("marks.regionName", { color: colorName(a.color) });
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
      toast(t("tool.eraseTooFine"));
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
    toast(t("marks.nearStrokeLimit"));
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
    toast(t("marks.nearMarkLimit"));
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
darkQuery.addEventListener("change", () => {
  // Only while nobody has chosen. A reviewer who picked light meant it, and
  // dusk is not an argument against it.
  if (themeChoice === "system") applyTheme(themeChoice, darkQuery);
  viewer.applyTheme();
  viewer.render();
});
/* CSS repaints itself from the variables; the WebGL canvas is painted by us and
   will not, so every path that changes the theme has to say so here. The system
   listener above was the only one that existed, which is why the canvas could
   not have followed a manual switch. */
$("#theme-choice").value = THEMES.includes(themeChoice)
  ? themeChoice
  : "system";
$("#theme-choice").addEventListener("change", (e) => {
  themeChoice = storeThemeChoice(e.target.value);
  applyTheme(themeChoice, darkQuery);
  viewer.applyTheme();
  viewer.render();
});
for (const tag of LOCALES) {
  const option = document.createElement("option");
  option.value = tag;
  option.textContent = localeName(tag);
  $("#locale-choice").append(option);
}
$("#locale-choice").value = currentLocale();
/* Which pointing device this is gets guessed from how the wheel behaves, and
   the guess is usually right — but a trackpad has no middle button, so being
   wrong costs a laptop reviewer the ability to pan at all. Saying so outright
   is cheap; discovering it is not. */
const storedDevice = (() => {
  try {
    const value = localStorage.getItem("meshcue-device");
    return DEVICES.includes(value) ? value : "auto";
  } catch {
    return "auto";
  }
})();
viewer.setDevice(storedDevice);
$("#device-choice").value = storedDevice;
$("#device-choice").addEventListener("change", (e) => {
  viewer.setDevice(e.target.value);
  try {
    if (e.target.value === "auto") localStorage.removeItem("meshcue-device");
    else localStorage.setItem("meshcue-device", e.target.value);
  } catch {
    /* the choice still holds for this visit */
  }
});
/* Every string was placed once, when the interface was built. Rebuilding it in
   place would mean re-binding every listener and rebuilding the viewer with the
   model still in it; reloading is honest and the choice is already stored.
   Flushing first is not optional — a reload with an unsaved draft in the tab
   would throw away marks the reviewer just made. */
$("#locale-choice").addEventListener("change", async (e) => {
  const wanted = e.target.value;
  if (wanted === currentLocale()) return;
  setLocale(wanted);
  try {
    await flushDraft();
  } catch {
    /* a draft that will not save is a reason to reload no less carefully */
  }
  location.reload();
});
/* The cube is a compass: it turns with the camera so a reviewer who has orbited
   into an unfamiliar angle can still read which way the model is facing, and
   clicking a face reframes from that side without changing what is framed. */
const orientCube = $("#orient-cube");
viewer.onOrient = (yaw, pitch) => {
  orientCube.style.transform = compassTransform(yaw, pitch);
};
/* Faces name a side; edges and corners are the three-quarter views a modeller
   reaches for to see two or three sides at once. */
const CUBE_KEYS = {
  "0,0,1": "cube.front",
  "0,0,-1": "cube.back",
  "1,0,0": "cube.right",
  "-1,0,0": "cube.left",
  "0,1,0": "cube.top",
  "0,-1,0": "cube.bottom",
};
const CUBE_AXES = [
  ["cube.right", "cube.left"],
  ["cube.top", "cube.bottom"],
  ["cube.front", "cube.back"],
];
const cubeTitle = (view) =>
  view
    .split(",")
    .map(Number)
    .map((v, i) => (v ? t(CUBE_AXES[i][v > 0 ? 0 : 1]) : ""))
    .filter(Boolean)
    .reverse()
    .join(t("cube.sideJoin"));
for (const region of buildOrientCube(orientCube, {
  label: (view) => (CUBE_KEYS[view] ? t(CUBE_KEYS[view]) : ""),
  title: (view) => t("cube.viewFrom", { side: cubeTitle(view) }),
}))
  region.el.addEventListener("click", () =>
    viewer.viewFrom(...region.view.split(",").map(Number)),
  );
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
        editSeq === savedSeq ? t("save.saved") : t("save.saving");
    } catch (e) {
      $("#save-status").textContent = t("save.unsynced");
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
  const latest = latestVersion(state?.versions),
    behind = viewingBehindLatest(state?.versions, viewingId);
  const ready =
      !!loadedId && viewer.enabled && !recoveryBlocked && !accessBlocked,
    settled = editSeq === savedSeq && !saveFlight,
    busy = submitting || !ready;
  // Marks this tab has not managed to save yet still count as something to hand
  // over — submitting flushes first. Requiring the server to have seen them
  // would disable the button during exactly the outage it exists to survive.
  $("#submit-feedback").disabled =
    busy || !can.canEdit || (!can.canSubmit && !annotations.length);
  $("#undo").disabled = busy || !undoStack.length;
  $("#redo").disabled = busy || !redoStack.length;
  $("#review-status").textContent = accessBlocked
    ? loadedId && initialDraftRestored
      ? t("conn.accessExpired")
      : t("conn.noAccess")
    : !ready
      ? t("review.loadingModel")
      : behind
        ? t("review.earlierVersion")
        : state?.locked
          ? t("review.openElsewhere")
          : blockedText(can.blocked) || t("review.current");
  updateReceipt();
  renderVersions();
  $("#pending-banner").hidden = !behind;
  if (behind)
    $("#pending-text").textContent = t("version.pinnedNotice", {
      version: latest.version || latest.name,
    });
  $("#resume-banner").hidden = !state?.locked || accessBlocked;
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => (b.disabled = busy || !can.canEdit));
  document
    .querySelectorAll(".delete-annotation, .edit-action")
    .forEach((b) => (b.disabled = busy || !can.canEdit));
}
/* Hiding a mark is a way of looking, not a way of editing: it never reaches
   the draft or the submission, only what the viewer is asked to draw. Keyed by
   id so the list still shows every mark, including the hidden ones. */
const hiddenMarks = new Set();
function renderAnnotations() {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(() => {
    renderFrame = null;
    for (const id of hiddenMarks)
      if (!annotations.some((a) => a.id === id)) hiddenMarks.delete(id);
    viewer.setAnnotations(
      annotations.filter((a) => !hiddenMarks.has(a.id)),
      selectedId,
    );
    $("#annotation-count").textContent = annotations.length;
    const list = $("#annotations-list");
    list.replaceChildren();
    if (!annotations.length) {
      const div = document.createElement("div");
      div.className = "annotation-empty";
      div.textContent = t("marks.empty");
      list.append(div);
    }
    for (const a of annotations) {
      const row = document.createElement("div");
      row.className = `annotation-row ${a.id === selectedId ? "selected" : ""}`;
      row.dataset.annotationId = a.id;
      const hidden = hiddenMarks.has(a.id);
      const eye = document.createElement("button");
      eye.className = `mark-eye${hidden ? " off" : ""}`;
      eye.innerHTML = icon(hidden ? "eye-off" : "eye");
      eye.setAttribute("aria-pressed", String(hidden));
      eye.setAttribute(
        "aria-label",
        t(hidden ? "marks.showOne" : "marks.hideOne", {
          name: a.type === "pin" ? a.label : regionName(a),
        }),
      );
      eye.addEventListener("click", () => {
        if (hiddenMarks.has(a.id)) hiddenMarks.delete(a.id);
        else hiddenMarks.add(a.id);
        renderAnnotations();
      });
      const select = document.createElement("button");
      select.className = "annotation-select";
      const badge = document.createElement("span");
      badge.className = "annotation-badge";
      badge.style.background = a.color;
      badge.textContent = a.type === "pin" ? a.label : "";
      const text = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = a.type === "pin" ? t("marks.pin") : regionName(a);
      const detail = document.createElement("small");
      detail.textContent =
        a.type === "pin"
          ? t("marks.pinned")
          : a.coverage === "source-v1"
            ? t("marks.alongSurface")
            : t("marks.legacyFace");
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
        a.type === "pin"
          ? t("marks.deleteLabel", { label: a.label })
          : t("marks.deleteOne", { name: regionName(a) }),
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
      focus.textContent = t("marks.frame");
      focus.setAttribute(
        "aria-label",
        t("marks.frameOne", {
          name: a.type === "pin" ? a.label : regionName(a),
        }),
      );
      focus.addEventListener("click", () => viewer.focusAnnotation(a));
      row.append(eye, select, focus);
      if (a.type === "pin") {
        const move = document.createElement("button");
        move.className = "quiet-dark annotation-action edit-action";
        move.textContent = t("marks.move");
        move.setAttribute(
          "aria-label",
          t("marks.moveLabel", { label: a.label }),
        );
        move.disabled = remove.disabled;
        move.addEventListener("click", () => {
          relocatingId = a.id;
          setMode("relocate");
          toast(t("marks.moveHint", { label: a.label }));
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
  $("#toggle-marks").textContent = t("marks.hide");
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
    paint: t("hint.paint"),
    erase: t("hint.erase"),
    fill: t("hint.fill"),
    relocate: t("hint.relocate"),
    orbit: t("hint.orbit"),
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
  b.setAttribute("aria-label", t("color.choose", { color: colorName(c) }));
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
    ? t("marks.hide")
    : t("marks.show");
  $("#toggle-marks").setAttribute(
    "aria-pressed",
    String(!viewer.annotationsVisible),
  );
});
$("#neutral-view").addEventListener("click", () => {
  viewer.setNeutral(!viewer.neutral);
  $("#neutral-view").textContent = viewer.neutral
    ? t("view.original")
    : t("view.plain");
  $("#neutral-view").setAttribute("aria-pressed", String(viewer.neutral));
});
/* The Agent's understanding used to sit across the model until it was dismissed
   by hand, every round. It says itself once, gets out of the way on its own, and
   leaves a bubble to be asked again — reading it is occasional, the model is
   what the screen is for.

   Only the first showing leaves by itself. Recalling it is a deliberate act, so
   it then stays until it is put away, and a pointer resting on it is someone
   still reading. */
const ECHO_LINGER = 7000;
let echoTimer = null;
function echoLinger() {
  clearTimeout(echoTimer);
  echoTimer = setTimeout(hideEcho, ECHO_LINGER);
}
function showEcho({ linger }) {
  $("#echo-panel").hidden = false;
  $("#echo-recall").setAttribute("aria-expanded", "true");
  $("#echo-recall").setAttribute("aria-label", t("echo.dismiss"));
  clearTimeout(echoTimer);
  // A stale echo is a warning that the marks moved under it. Warnings do not
  // get to leave before they are read.
  if (linger && $("#echo-stale").hidden) echoLinger();
}
function hideEcho() {
  clearTimeout(echoTimer);
  echoTimer = null;
  $("#echo-panel").hidden = true;
  $("#echo-recall").setAttribute("aria-expanded", "false");
  $("#echo-recall").setAttribute("aria-label", t("echo.recall"));
}
$("#echo-recall").addEventListener("click", () => {
  if ($("#echo-panel").hidden) showEcho({ linger: false });
  else hideEcho();
});
$("#echo-panel").addEventListener("pointerenter", () =>
  clearTimeout(echoTimer),
);
$("#echo-panel").addEventListener("pointerleave", () => {
  if (echoTimer !== null) echoLinger();
});
$("#version-tabs").addEventListener("scroll", () =>
  markVersionOverflow($("#version-tabs")),
);
/* A mouse has no horizontal wheel, and Shift+wheel is not something a reviewer
   should have to know to see the versions he was given. A plain wheel over the
   strip moves along it, and only while the strip has somewhere to move. */
$("#version-tabs").addEventListener(
  "wheel",
  (e) => {
    const bar = $("#version-tabs");
    if (e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    if (bar.scrollWidth <= bar.clientWidth) return;
    e.preventDefault();
    bar.scrollLeft += e.deltaY;
  },
  { passive: false },
);
window.addEventListener("resize", () =>
  markVersionOverflow($("#version-tabs")),
);
$("#home-view").addEventListener("click", () => viewer.home());
$("#new-region").addEventListener("click", () => {
  selectedId = null;
  renderAnnotations();
  setMode("paint");
  toast(t("tool.newRegionHint"));
});
$("#toggle-annotations").addEventListener("click", () => {
  $("#annotations-list").hidden = !$("#annotations-list").hidden;
  const collapsed = $("#annotations-list").hidden;
  $("#toggle-annotations").setAttribute("aria-expanded", String(!collapsed));
  // The icon flips but the label did not: collapsed, the button still told a
  // screen reader it would collapse the list. Found by the catalogue check —
  // "expand" was a translated phrase that nothing ever asked for.
  $("#toggle-annotations").setAttribute(
    "aria-label",
    t(collapsed ? "marks.expand" : "marks.collapse"),
  );
  $(".annotations-panel").classList.toggle(
    "collapsed",
    $("#annotations-list").hidden,
  );
  // A plus beside a list of marks reads as "add a mark", which is a thing this
  // page can actually do — just not here. The control moves a panel sideways,
  // so it points the way the panel will go.
  $("#toggle-annotations").innerHTML = icon(
    $("#annotations-list").hidden ? "expand-right" : "collapse-left",
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
    toast(t("recovery.restored"));
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
    toast(t("recovery.backedUp"));
  } catch {
    recoveryBlocked = true;
    toast(t("recovery.paused"));
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
      t("model.triangles", { count: (v.triangles || 0).toLocaleString() }),
      v.active ? t("version.showingNow") : t("version.earlier"),
      v.submissions ? t("version.submitted", { count: v.submissions }) : null,
      v.busy ? t("version.openElsewhere") : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const caption = document.createElement("span");
    caption.textContent = v.label || v.version || v.name || t("common.version");
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
  // The tabs were replaced a statement ago; their positions, and the width the
  // strip can scroll through, are only settled once the browser has laid them
  // out. Asking now reads the old strip and scrolls to a place that is gone.
  requestAnimationFrame(() => {
    revealCurrentVersion(bar);
    markVersionOverflow(bar);
  });
}
/* A strip that scrolls can hide the tab you are standing on. Seventeen versions
   deep, the one being marked is off the right-hand end on load, and a reviewer
   looking for where he is finds an empty rail. Only move when it is actually
   out of sight: scrolling on every render would fight anyone reading along it. */
function revealCurrentVersion(bar) {
  const tab = bar.querySelector(".version-tab.selected");
  if (!tab) return;
  // Measured against the strip itself, not offsetLeft: the strip is not a
  // positioned element, so offsetLeft counts from some ancestor and scrolling
  // by it lands somewhere else entirely.
  const rail = bar.getBoundingClientRect(),
    seat = tab.getBoundingClientRect();
  if (seat.left < rail.left) bar.scrollLeft -= rail.left - seat.left + 12;
  else if (seat.right > rail.right)
    bar.scrollLeft += seat.right - rail.right + 12;
}
function markVersionOverflow(bar) {
  const scrollable = bar.scrollWidth - bar.clientWidth;
  bar.classList.toggle("overflow-start", bar.scrollLeft > 1);
  bar.classList.toggle("overflow-end", bar.scrollLeft < scrollable - 1);
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
  loadedFilename = model.filename;
  loadedReviewId = fullState.reviewId;
  sweepDraftCache();
  loadedReceipt = null;
  labelCursor = 0;
  echoId = null;
  relocatingId = null;
  // A new version has nothing said about it yet, so neither the bubble nor the
  // way to ask for it belongs on screen until the Agent speaks again.
  $("#echo-recall").hidden = true;
  hideEcho();
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
  $("#loading-text").textContent = t("loading.verifying");
  $("#loading-hint").textContent = t("loading.hint");
  $("#save-status").textContent = t("save.verifying");
  try {
    const stats = await viewer.load(
      model,
      endpoint(`api/models/${model.filename}`),
      (stage) => {
        $("#loading-text").textContent = stage;
      },
    );
    if (!stats) return;
    $("#model-info").textContent = t("model.summary", {
      count: model.triangles.toLocaleString(),
      format: model.format.toUpperCase(),
      units: model.units,
    });
    updatePrecision(stats);
    await restoreDraft(fullState.draft);
    initialDraftRestored = true;
    renderAnnotations();
    $("#loading").hidden = true;
    $("#save-status").textContent =
      editSeq > savedSeq
        ? t("save.restoring")
        : annotations.length
          ? t("save.saved")
          : t("save.notStarted");
    updateButtons();
    if (editSeq > savedSeq) await flushDraft().catch((e) => toast(e.message));
  } catch (e) {
    if (!initialDraftRestored) {
      viewer.enabled = false;
      loadedId = null;
      loadedFilename = null;
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
        toast(t("version.driftStopped"));
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
        $("#loading-text").textContent = t("model.awaitingFirst");
        $("#loading .spinner").hidden = true;
      }
    } else state = incoming;
    if (recovered && state?.owned && editSeq > savedSeq && !recoveryBlocked)
      await flushDraft();
    $(".connection-dot").classList.add("online");
    $("#connection-status").textContent = incoming.notifier?.send
      ? t("conn.origin")
      : incoming.owned || state?.submissions?.length
        ? t("conn.collect")
        : t("conn.local");
    updateEcho(incoming);
    updateOutbox(incoming);
    updateClosing(incoming);
    updateButtons();
  } catch (e) {
    $(".connection-dot").classList.remove("online");
    // A service that announced its own reclaim and then stopped answering did
    // not fail. Saying "offline" here would describe a crash, and would leave
    // the reviewer with no reason to believe their marks are still there.
    if (wasReclaimed()) {
      $("#connection-status").textContent = t("conn.reclaimed");
      $("#save-status").textContent = t("closing.done");
      $("#closing-text").textContent = t("closing.done");
      $("#closing-banner").hidden = false;
      updateButtons();
      return;
    }
    $("#connection-status").textContent = accessBlocked
      ? t("conn.returnToChat")
      : t("conn.paused");
    $("#save-status").textContent = accessBlocked
      ? loadedId && initialDraftRestored
        ? t("conn.accessExpired")
        : t("conn.noAccess")
      : t("conn.offline");
    updateButtons();
  }
}
// The warning can be called off: anything the reviewer does resets the clock,
// and the service withdraws the notice on its own. So this follows the service
// both ways while it is still answering, and only sticks once it stops.
function updateClosing(incoming) {
  closingNotice = incoming.closing || null;
  lastIdle = incoming.idle || null;
  $("#closing-banner").hidden = !closingNotice;
  if (closingNotice) $("#closing-text").textContent = t("closing.pending");
}
// Nothing is left to ask, so this is read off the last thing the service said.
// A reading taken within a couple of announcement ticks of a deadline the
// service had published in advance, followed by silence, is that deadline
// arriving — no outage lines up with it that precisely.
function wasReclaimed() {
  if (closingNotice) return true;
  if (!lastIdle?.limitMs) return false;
  const slack = Math.max(lastIdle.graceMs || 0, 60_000) * 2;
  return lastIdle.forMs >= lastIdle.limitMs - slack;
}
function updateReceipt() {
  if (submitting) return;
  const last = state?.submissions?.findLast((s) => s.versionId === loadedId);
  if (!last) {
    $("#feedback-status").textContent = annotations.length
      ? t("feedback.notSubmitted")
      : t("feedback.default");
    return;
  }
  // "waiting" is not a delivery in progress. Saying "will retry" about a host
  // that never had anywhere to push would promise something nothing is doing.
  const delivery = last.deliveredAt
    ? t("feedback.delivered")
    : last.status === "waiting"
      ? t("feedback.waiting")
      : last.status === "accepted"
        ? t("feedback.acceptedPending")
        : t("feedback.deliveryUnconfirmed");
  const status = `${t("feedback.saved")} · ${delivery} · ${
    last.readAt ? t("feedback.read") : t("feedback.unread")
  }`;
  $("#feedback-status").textContent =
    status +
    (editSeq > savedSeq || revision !== last.revision
      ? t("feedback.alsoUnsubmitted")
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
  $("#precision-text").textContent = t("precision.overBudget", {
    wanted: stats.wanted.toLocaleString(),
    budget: stats.budget.toLocaleString(),
  });
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
    ? t("outbox.reason", { message: worst.lastError.message })
    : t("outbox.reasonUnknown");
  $("#outbox-text").textContent = stalled.length
    ? t("outbox.stuck", {
        count: stuck.length,
        attempts: worst.attempts,
        reason,
      })
    : t("outbox.retrying", {
        count: stuck.length,
        attempts: worst.attempts,
        reason,
      });
}
function updateEcho(incoming) {
  const echo = incoming.echo;
  $("#echo-stale").hidden =
    !echo || (echo.revision === revision && editSeq === savedSeq);
  if ((echo?.id || null) === echoId || !viewer.enabled) return;
  echoId = echo?.id || null;
  viewer.setAgentEcho(echo?.versionId === loadedId ? echo : null);
  $("#echo-summary").textContent = viewer.agentEcho
    ? t("echo.summary", { summary: echo.summary })
    : "";
  $("#echo-recall").hidden = !viewer.agentEcho;
  if (viewer.agentEcho) showEcho({ linger: true });
  else hideEcho();
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
  $("#submit-feedback").textContent = t("feedback.submitting");
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
    toast(t("feedback.submitted"));
  } catch (e) {
    $("#feedback-status").textContent = e.message;
    toast(e.message);
  } finally {
    submitting = false;
    $("#submit-feedback").innerHTML = `${T("feedback.submit")} ${icon("send")}`;
    updateButtons();
  }
});
$("#go-latest").addEventListener("click", () => {
  const latest = latestVersion(state?.versions);
  if (latest?.id) selectVersion(latest.id).catch((e) => toast(e.message));
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
    toast(t("resume.picked"));
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
  modelFilename: loadedFilename,
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
