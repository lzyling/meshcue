import { t, ta, setAgentName, currentLocale } from "../i18n/index.js";
import { agentLabel } from "../agent-label.js";
import { readThemeChoice, applyTheme } from "../theme.js";
export function installShell(review) {
  function toast(text) {
    review.$("#toast").textContent = text;
    review.$("#toast").hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (review.$("#toast").hidden = true), 6500);
  }

  function owner() {
    return { versionId: review.loadedId, clientId: review.clientId };
  }

  /* The Agent's name and tool arrive with the service's first answer, after the
   page was drawn in its own words, and change when another conversation takes
   the review over. What was drawn once at start-up is drawn again here; every
   other sentence about the Agent looks the name up each time it is written. */
  function nameAgent(name, tool) {
    if (!setAgentName(agentLabel(name, tool))) return;
    for (const el of document.querySelectorAll("[data-agent-text]"))
      el.textContent = ta(el.dataset.agentText);
    if (!review.loadedId)
      review.$("#model-name").textContent = ta("model.awaiting");
    review.$("#mark-note-text").placeholder = ta("note.placeholder");
    if (review.$("#echo-recall").getAttribute("aria-expanded") !== "true")
      review.$("#echo-recall").setAttribute("aria-label", ta("echo.recall"));
    if (!review.submitting)
      review.$("#submit-feedback").innerHTML = review.submitLabel();
  }

  Object.assign(review, { toast, owner, nameAgent });
}

export function mountShell(review) {
  /* index.html ships with a fixed lang, because the language is not known until
   the reviewer's own preferences have been read. Correcting it here is what
   makes hyphenation, font selection and a screen reader's pronunciation match
   the words actually on the page. */
  document.documentElement.lang = currentLocale();

  review.$ = (selector) => document.querySelector(selector);

  review.app = review.$("#app");

  /* Icons were Unicode glyphs, which is not a style choice but an absence of
   control: the operating system font decided their shape, weight and baseline,
   the rarer ones (▱ ▰ ⌖ ⌂) are missing from some fonts entirely, and ▱ against
   ▰ differed only by fill — eraser and paint bucket were indistinguishable side
   by side. These are drawn here, ship inside the bundle, and depict the action
   rather than gesture at it. Sized in em so every existing font-size rule,
   including the responsive ones, keeps working untouched. */
  /* Before a single element exists: resolving the theme afterwards paints one
   frame of the wrong one on every load. */
  review.darkQuery = matchMedia("(prefers-color-scheme: dark)");

  review.themeChoice = readThemeChoice();

  applyTheme(review.themeChoice, review.darkQuery);

  review.SPRITE = `<svg class="sprite" aria-hidden="true" focusable="false"><defs>
<g id="mc-brand" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3.2 20.4 8v8L12 20.8 3.6 16V8z"/><path d="M3.6 8 12 12.8 20.4 8M12 12.8v8" stroke-width="1.2" opacity=".55"/></g>
<g id="mc-pan" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
  <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
  <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></g>
<g id="mc-orbit" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.341 6.484A10 10 0 0 1 10.266 21.85" />
  <path d="M3.659 17.516A10 10 0 0 1 13.74 2.152" />
  <circle cx="12" cy="12" r="3" />
  <circle cx="19" cy="5" r="2" />
  <circle cx="5" cy="19" r="2" /></g>
<g id="mc-fill" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M11 7 6 2" />
  <path d="M18.992 12H2.041" />
  <path d="M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595" />
  <path d="m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33" /></g>
<g id="mc-undo" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5" />
  <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" /></g>
<g id="mc-redo" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5" />
  <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" /></g>
<g id="mc-home" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5M5.5 8.5V20h13V8.5"/><path d="M9.5 20v-7h5v7M16 4.5V3h2.5v3.5"/></g>
<g id="mc-fit" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2" />
  <path d="M17 3h2a2 2 0 0 1 2 2v2" />
  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
  <path d="M7 21H5a2 2 0 0 1-2-2v-2" /></g>
<g id="mc-reset" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
  <path d="M3 3v5h5" /></g>
<g id="mc-display-edges" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4M12 11v10"/></g>
<g id="mc-display-shaded" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m4 7 8-4 8 4v10l-8 4-8-4V7ZM4 7l8 4 8-4M12 11v10M15 12v5M18 10v5"/></g>
<g id="mc-display-wireframe" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4M12 11v10M4 17l8-6 8 6M12 3v8"/></g>
<g id="mc-display-hidden" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4M12 11v10"/><path d="M4 17l8-6 8 6M12 3v8" stroke-dasharray="2 3"/></g>
<g id="mc-display-xray" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4M12 11v10"/><path d="M4 17l8-6 8 6M12 3v8" opacity=".45"/></g>
<g id="mc-send" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8z"/></g>
<g id="mc-trash" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5h16M9.5 6.5V4.2h5v2.3"/><path d="M6.3 6.5 7.2 20h9.6l.9-13.5"/><path d="M10.3 10v6.4M13.7 10v6.4" stroke-width="1.3" opacity=".6"/></g>
<g id="mc-close" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></g>
<g id="mc-plus" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></g>
<g id="mc-check" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.6 9.5 17.5 19.5 6.8"/></g>
<g id="mc-collapse-left" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6.5 9 12l5.5 5.5"/><path d="M19 5.5v13"/></g>
<g id="mc-expand-right" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6.5 15 12l-5.5 5.5"/><path d="M5 5.5v13"/></g>
<g id="mc-echo" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 6.8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7.4a2 2 0 0 1-2 2h-6.6L7 19.8v-3.6H6a2 2 0 0 1-2-2z"/></g>
<g id="mc-measure" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
  <path d="m14.5 12.5 2-2" />
  <path d="m11.5 9.5 2-2" />
  <path d="m8.5 6.5 2-2" />
  <path d="m17.5 15.5 2-2" /></g>
<g id="mc-pin" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
  <circle cx="12" cy="10" r="3" /></g>
<g id="mc-eye" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
  <circle cx="12" cy="12" r="3" /></g>
<g id="mc-eye-off" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
  <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
  <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
  <path d="m2 2 20 20" /></g>
<g id="mc-help" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.3"/><circle cx="12" cy="16.6" r="1" fill="currentColor" stroke="none"/></g>
<g id="mc-projection" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5h8l5 15H3L8 5Z"/><path d="M12 5v15M5.4 13h13.2"/></g>
<g id="mc-plain" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" />
  <path d="M12 18a6 6 0 0 0 0-12v12z" /></g>
<g id="mc-language" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8"/><path d="M12 3.6a12.6 12.6 0 0 1 0 16.8a12.6 12.6 0 0 1 0-16.8z"/></g>
<g id="mc-section" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v5l8 4 8-4v-5M12 16v5"/><path d="m4 12 8-4 8 4-8 4-8-4Z"/><path d="M4 9V7l8-4 8 4v2" stroke-dasharray="1.5 3"/></g>
<g id="mc-theme" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="4.6"/><path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/></g>
<g id="mc-parts-tab" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
  <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
  <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" /></g>
</defs></svg>`;

  review.icon = (name) =>
    `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#mc-${name}"/></svg>`;

  /* Catalogue text goes into markup, so it is escaped on the way in. Five
   languages of apostrophes and quotation marks are not a place to rely on
   nobody having typed an angle bracket. */
  review.esc = (s) =>
    String(s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );

  review.T = (key, vars) => review.esc(t(key, vars));

  // The same for a sentence about the Agent, which carries its name when known.
  review.TA = (key, vars) => review.esc(ta(key, vars));

  /* The button that hands the marks over says who to: a name the Agent chose, in
   any script and up to twenty-four characters, and the tool it runs in after
   it. The words give way before the button does, and the whole of them stays
   in the tooltip. */
  review.submitLabel = () =>
    `<span class="submit-label" title="${review.TA("feedback.submit")}">${review.TA("feedback.submit")}</span> ${review.icon("send")}`;

  /* The service names its refusals and the browser is what has to say them out
   loud, so a refusal the reader will see is looked up by code rather than
   printed in whatever language the service happens to be written in. A code
   with no entry yet falls back to the service's own words: half-translated is
   poor, but silence in place of a reason is worse. This is the seam where the
   rest of the service's browser-facing text will join. */
  /* "unspecified" is the record's word for a file that declared no unit, and it
   reached the pill verbatim -- one English word in the middle of a translated
   line, next to a STEP round that says "mm". Only that sentinel is translated:
   a unit the author did state is their word, and rewriting it would be this
   page making a claim about the model. */
  review.unitsLabel = (units) =>
    units === "unspecified" ? t("units.unspecified") : units;

  // The longest note a mark may carry; the service holds the same line
  // (`MAX_NOTE` in `server/budget.mjs`) and a test holds the two together.
  review.MAX_NOTE = 200;

  // A server message is written for an agent and a log file. These are the
  // refusals a reviewer can actually cause from the page, so they are said in the
  // reviewer's own language; anything else falls through to the server's text,
  // which is the honest thing to show when nobody has translated it.
  review.ERROR_KEYS = {
    ACCESS_REQUIRED: "error.accessRequired",
    EMPTY: "error.empty",
    SAVING: "error.saving",
    STALE_DRAFT: "error.staleDraft",
    ORIGIN_BUSY: "error.originBusy",
    ACCESS_EXPIRED: "error.accessExpired",
    ACCESS_LIMIT: "error.accessLimit",
    INTEGRATION_DISABLED: "error.integrationDisabled",
    DELIVERY_UNCONFIRMED: "error.deliveryUnconfirmed",
    // The service's own check of what the page drew; the page makes the same one
    // first and says it in the same words.
    HASH_MISMATCH: "model.versionMismatch",
  };

  review.BLOCKED_KEYS = {
    NOT_IN_REVIEW: "review.notInReview",
    NOT_MARKED: "review.notMarked",
    ROUND_CLOSED: "review.roundClosed",
  };

  review.blockedText = (code) =>
    review.BLOCKED_KEYS[code] ? t(review.BLOCKED_KEYS[code]) : "";

  review.serverMessage = (json) =>
    (json?.code &&
      review.ERROR_KEYS[json.code] &&
      ta(review.ERROR_KEYS[json.code])) ||
    json?.error ||
    t("conn.actionFailed");

  review.app.innerHTML = `${review.SPRITE}
<header class="app-header"><div class="brand-mark">${review.icon("brand")}</div><div class="brand"><div class="brand-title"><strong>MeshCue</strong><span class="app-version" id="app-version" title="${review.T("app.version")}">${__MESHCUE_VERSION__}</span><a class="app-update" id="app-update" target="_blank" rel="noreferrer noopener" hidden></a></div><span>${review.T("app.tagline")}</span></div><div class="header-right"><span id="connection-indicator" class="connection-indicator" role="img" data-state="connecting" aria-label="${review.T("conn.connecting")}" title="${review.T("conn.connecting")}"></span><button class="quiet icon-only" id="help-button" aria-label="${review.T("help.open")}">${review.icon("help")}</button><button class="quiet icon-only" id="settings-button" aria-label="${review.T("shell.settings")}">⚙</button></div></header>
<main class="workspace">
 <section class="review-panel" aria-label="${review.T("a11y.reviewPanel")}">
  <!-- The name arrived with the link, the tab strip carries the version, and a
       save that fails says so in a toast. None of it was worth a row of the
       page across the top of the model — but a reviewer who cannot see the
       screen has no toast and no tab strip, so the three of them stay here,
       out of the layout and still in the accessibility tree. -->
  <div class="sr-only"><h2 id="model-name">${review.TA("model.awaiting")}</h2><span id="model-version">—</span><span id="save-status" aria-live="polite">${review.T("save.preparing")}</span></div>
  <div id="version-tabs" class="version-tabs" role="tablist" aria-label="${review.T("a11y.versionTabs")}" hidden></div>
  <div class="review-body">
  <aside class="annotations-panel"><div class="annotations-heading"><strong>${review.T("marks.heading")} <span id="annotation-count">0</span></strong><button id="toggle-annotations" class="quiet-dark" aria-label="${review.T("marks.collapse")}" aria-expanded="true">${review.icon("collapse-left")}</button></div><div id="marks-controls" data-toolbar-slot="marks-panel"></div><div id="annotations-list"><div class="annotation-empty">${review.T("marks.empty").replace(/\n/g, "<br>")}</div></div><div id="mark-note" class="mark-note" hidden><label id="mark-note-title" for="mark-note-text"></label><textarea id="mark-note-text" rows="3" maxlength="${review.MAX_NOTE}" placeholder="${review.TA("note.placeholder")}"></textarea><small id="mark-note-count" aria-hidden="true"></small></div><div class="panel-actions"><button id="submit-feedback" class="primary-button" disabled>${review.submitLabel()}</button><div id="feedback-status" aria-live="polite"><span id="feedback-line">${review.T("feedback.default")}</span><span id="feedback-detail" hidden></span></div><div id="receipt-nudge" class="receipt-nudge" hidden><span id="receipt-nudge-text"></span><div class="receipt-copy"><span id="receipt-line"></span><button id="receipt-copy" class="quiet" title="${review.T("receipt.copyTitle")}">${review.T("receipt.copy")}</button></div></div></div></aside>
  <aside id="parts-panel" hidden></aside>
  <div class="viewer-shell">
   <div id="viewer"></div>
   <div class="viewer-top"><span class="scene-pill" role="status" id="review-status">${review.T("review.loadingModel")}</span></div>
   <div class="orient">
    <div class="orient-stage" tabindex="0" role="group" aria-label="${review.T("cube.widgetLabel")}"><div class="orient-cube" id="orient-cube" aria-hidden="true"></div>
     <button class="orient-home quiet-dark" id="home-view" data-command="home" title="${review.T("cube.homeTitle")}" aria-label="${review.T("cube.homeLabel")}">${review.icon("home")}</button>
    </div>
   </div>
   <div class="toolbar" role="toolbar" aria-label="${review.T("a11y.toolbar")}">
    <div data-toolbar-slot="tools"></div><div data-toolbar-slot="history" class="toolbar-history" role="group" aria-label="${review.T("shell.history")}"></div>
   </div>
   <div id="tool-options" class="tool-options" hidden><div class="palette" role="group" aria-label="${review.T("a11y.palette")}" hidden></div><label id="fill-control" hidden>${review.T("tool.spread")} <input id="fill-range" type="range" min="1" max="30" value="6" aria-label="${review.T("tool.bucketSpread")}"></label><button class="quiet-dark" id="new-region" hidden>${review.icon("plus")}${review.T("tool.newRegion")}</button><div id="measure-options" class="measure-options" hidden><button class="measure-kind active" data-measure="smart" aria-pressed="true">${review.T("measure.smart")}</button><details id="measure-advanced"><summary>${review.T("measure.advanced")}</summary><div class="measure-kinds" role="group" aria-label="${review.T("measure.kinds")}"><button class="measure-kind" data-measure="points" aria-pressed="false">${review.T("measure.points")}</button><button class="measure-kind" data-measure="edge" aria-pressed="false">${review.T("measure.edge")}</button><button class="measure-kind" data-measure="planes" aria-pressed="false">${review.T("measure.planes")}</button><button class="measure-kind" data-measure="circle" aria-pressed="false">${review.T("measure.circle")}</button></div></details><output id="measure-reading" aria-live="polite"></output><button class="quiet-dark" id="keep-measure" title="${review.T("measure.keepTitle")}" disabled>${review.icon("check")}${review.T("measure.keep")}</button></div></div>
   <div id="section-options" class="section-options" role="group" aria-label="${review.T("section.title")}" hidden><label>${review.T("section.axis")} <select id="section-axis"><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select></label><label for="section-offset">${review.T("section.offset")} <span id="section-units"></span></label><input id="section-range" type="range" aria-label="${review.T("section.offset")}"><input id="section-offset" type="number" step="any"><button id="section-flip" class="quiet-dark" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4"/></svg>${review.T("section.flip")}</button><button id="section-off" class="quiet-dark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>${review.T("section.off")}</button><small>${review.T("section.hint")}</small></div>
   <div id="echo-dock"><div id="echo-panel" hidden><span class="echo-swatch" aria-hidden="true"></span><span id="echo-summary"></span><span id="echo-stale" hidden>${review.T("echo.stale")}</span></div><button id="echo-recall" hidden aria-expanded="false" aria-label="${review.TA("echo.recall")}">${review.icon("echo")}</button></div>
   <div id="loading" class="loading-overlay"><div class="spinner"></div><strong id="loading-text">${review.T("loading.preparing")}</strong><span id="loading-hint">${review.T("loading.hint")}</span></div>
   <div class="viewer-bottom"><span id="tool-hint">${review.T("hint.orbit")}</span><span class="scene-pill subtle" id="model-info"></span><span class="axis-label">3D SPACE</span></div>
  </div>
  </div>
  <div id="resume-banner" class="pending-banner" hidden><span>${review.T("resume.text")}</span><button id="resume-review" class="quiet">${review.T("resume.action")}</button></div>
  <div id="recovery-banner" class="pending-banner" hidden><span>${review.T("recovery.text")}</span><a id="download-recovery">${review.T("recovery.download")}</a></div>
  <div id="outbox-banner" class="pending-banner warn" hidden><span id="outbox-text"></span></div>
  <div id="closing-banner" class="pending-banner warn" hidden><span id="closing-text"></span></div>
 </section>
</main><div id="toast" role="status" hidden></div>
<dialog id="settings-dialog" aria-labelledby="settings-title"><button id="close-settings" class="dialog-close icon-only" aria-label="${review.T("common.close")}">${review.icon("close")}</button><h2 id="settings-title">${review.T("shell.settings")}</h2><span class="connection-dot"></span><span id="connection-status">${review.T("conn.connecting")}</span><label class="setting">${review.icon("language")}<select class="quiet" id="locale-choice" aria-label="${review.T("settings.language")}"></select></label><label class="setting">${review.icon("theme")}<select class="quiet" id="theme-choice" aria-label="${review.T("settings.theme")}"><option value="system">${review.T("settings.themeSystem")}</option><option value="light">${review.T("settings.themeLight")}</option><option value="dark">${review.T("settings.themeDark")}</option></select></label><div id="settings-features"></div></dialog>
<dialog id="help-dialog"><button id="close-help" class="dialog-close icon-only" aria-label="${review.T("common.close")}">${review.icon("close")}</button><span class="eyebrow">${review.T("help.eyebrow")}</span><h2>${review.T("help.title")}</h2><p>${review.T("help.p1")}</p><p>${review.T("help.p2")}</p><p>${review.T("help.p3")}</p><p>${review.T("help.p4")}</p><p>${review.T("help.p10")}</p><p data-agent-text="help.p5">${review.TA("help.p5")}</p><p data-agent-text="help.p6">${review.TA("help.p6")}</p><p data-agent-text="help.p7">${review.TA("help.p7")}</p><p data-agent-text="help.p8">${review.TA("help.p8")}</p><p data-agent-text="help.p11">${review.TA("help.p11")}</p><p data-agent-text="help.p12">${review.TA("help.p12")}</p><p data-agent-text="help.p13">${review.TA("help.p13")}</p><p>${review.T("help.p14")}</p><p>${review.T("help.p16")}</p><p data-agent-text="help.p15">${review.TA("help.p15")}</p><p class="muted">${review.T("help.p9")}</p></dialog>`;
}

export function bindHelp(review) {
  review
    .$("#help-button")
    .addEventListener("click", () => review.$("#help-dialog").showModal());

  review
    .$("#close-help")
    .addEventListener("click", () => review.$("#help-dialog").close());
}
