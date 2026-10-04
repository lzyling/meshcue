import "./style.css";
import { bindDisplay } from "./app/display.js";
import {
  installAnnotationsPanel,
  initializeAnnotations,
  bindAnnotationEditing,
  bindAnnotationsPanel,
} from "./app/annotations-panel.js";
import { installApi, startPolling } from "./app/api.js";
import { createCommandRegistry } from "./app/commands.js";
import { installDiagnostics } from "./app/diagnostics.js";
import {
  installDraft,
  initializeDraftCache,
  initializeDraftSerialization,
  bindDraftUnload,
  bindResume,
} from "./app/draft.js";
import { installEcho, bindEcho } from "./app/echo.js";
import { bindKeyboard } from "./app/keyboard.js";
import { installMeasure, bindMeasure } from "./app/measure.js";
import { bindOrientation } from "./app/orientation.js";
import { installReceipt, bindReceipt, bindSubmission } from "./app/receipt.js";
import { bindSection } from "./app/section.js";
import { bindSettings } from "./app/settings.js";
import { installShell, mountShell, bindHelp } from "./app/shell.js";
import { initializeState } from "./app/state.js";
import {
  installToolbar,
  bindToolbarOptions,
  registerToolbarCommands,
  mountToolbar,
} from "./app/toolbar.js";
import {
  installVersionsBar,
  bindVersionScrolling,
  bindLatestVersion,
} from "./app/versions-bar.js";
import { createViewer } from "./app/viewer.js";

// One per-page context keeps the original live state across feature modules.
// Install callable seams first, then initialize in the original order: callbacks
// can refer to later features without introducing module evaluation cycles.
const review = {};
installShell(review);
installApi(review);
installDraft(review);
installAnnotationsPanel(review);
installMeasure(review);
installToolbar(review);
installEcho(review);
installVersionsBar(review);
installReceipt(review);
review.commands = createCommandRegistry();
registerToolbarCommands(review);
mountShell(review);
mountToolbar(review);
initializeState(review);
initializeDraftCache(review);
initializeAnnotations(review);
createViewer(review);
bindSection(review);
bindMeasure(review);
bindSettings(review);
bindDisplay(review);
bindOrientation(review);
bindAnnotationEditing(review);
bindToolbarOptions(review);
bindEcho(review);
bindVersionScrolling(review);
bindAnnotationsPanel(review);
bindKeyboard(review);
bindHelp(review);
initializeDraftSerialization(review);
bindReceipt(review);
bindSubmission(review);
bindLatestVersion(review);
bindResume(review);
bindDraftUnload(review);
await startPolling(review);
installDiagnostics(review);
