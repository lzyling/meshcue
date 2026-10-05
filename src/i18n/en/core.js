/* The source language. Every other catalogue is a translation of this file and
   is checked against its key set; see scripts/check-i18n.mjs. */
export default {
  "agent.withTool": "{name} ({tool})",

  "app.tagline": "3D model review and annotation",
  "app.version": "Running version",
  "app.updateHint":
    "Version {version} is available. Ask your agent to update MeshCue.",
  "app.updateHint.named":
    "Version {version} is available. Ask {agent} to update MeshCue.",

  "closing.pending":
    "Nobody has used this review for a while, so it is closing. Anything you do here keeps it open.",
  "closing.done":
    "Closed after being left idle. Every version and the marks you saved are kept — ask the Agent to open this review again to carry on.",
  "closing.done.named":
    "Closed after being left idle. Every version and the marks you saved are kept — ask {agent} to open this review again to carry on.",
  "common.close": "Close",
  "common.version": "Version",

  "conn.connecting": "Connecting",
  "conn.origin": "Replies to the original conversation",
  "conn.collect": "The Agent collects from here",
  "conn.collect.named": "{agent} collects from here",
  "conn.local": "Local review",
  "conn.returnToChat": "Return to the original conversation",
  "conn.paused": "Connection paused",
  "conn.accessExpired": "Access expired · draft kept",
  "conn.noAccess": "No review access yet",
  "conn.reclaimed": "Review closed · marks saved",
  "conn.offline": "Service is offline",
  "conn.connectedNoAccess":
    "Connected to the workbench; no model loads until access is granted.",
  "conn.dropped": "The connection to the service dropped; your draft is kept.",
  "conn.actionFailed": "The action did not complete.",
  "conn.noSecureRandom":
    "This browser has no secure random source. Please use a current version of Chrome or Edge.",

  "error.empty": "Add a pin or paint a region first",
  "error.saving": "Wait for the draft to finish saving before submitting",
  "error.staleDraft": "The draft moved on; reload the saved revision",
  "error.originBusy": "Another conversation is using this review right now",
  "error.accessExpired":
    "That one-time grant has expired; go back to the conversation",
  "error.accessLimit": "This review has reached its connection limit",
  "error.integrationDisabled":
    "MeshCue is disabled; your draft is kept, continue from the conversation",
  "error.deliveryUnconfirmed":
    "Delivery is not confirmed yet; your marks are saved and will be retried",
  "error.accessRequired":
    "This entrance has no valid review access. Please return to the original conversation.",

  "a11y.reviewPanel": "Model review",
  "a11y.versionTabs": "Model versions",
  "a11y.toolbar": "Model tools",
  "a11y.palette": "Mark colour",
  "a11y.viewer": "3D model preview — orbit, zoom and annotate",

  "model.awaiting": "Waiting for the Agent to deliver a model",
  "model.awaiting.named": "Waiting for {agent} to deliver a model",
  "model.awaitingFirst": "Waiting for the Agent to deliver the first model",
  "model.awaitingFirst.named": "Waiting for {agent} to deliver the first model",
  "model.triangles": "{count} triangles",
  "model.summary": "{count} triangles · {format} · {units}",
  "units.unspecified": "no units",
  "model.readFailed": "Could not read the model file.",
  "model.versionMismatch":
    "The model file does not match the version the Agent specified; marking stopped.",
  "model.versionMismatch.named":
    "The model file does not match the version {agent} specified; marking stopped.",
  "model.noExtent": "The model has no displayable extent.",
  "model.animated":
    "Export a static mesh first; this release does not annotate deforming animation.",
  "model.tooManyTriangles":
    "The model exceeds 600,000 triangles. Simplify it first.",
  "model.meshOverBudget":
    "The review mesh exceeds the 600,000 triangle limit. Simplify the model first.",
  "model.contextLost":
    "The display context was lost; your draft is kept. Please reload the page.",

  "save.preparing": "Preparing",
  "save.saving": "Saving…",
  "save.saved": "Draft saved",
  "save.verifying": "Verifying…",
  "save.restoring": "Restoring draft…",
  "save.notStarted": "No marks yet",
  "save.unsynced": "Not synced · draft is on this machine",
  "save.storageFull":
    "Local storage is full. Keep this page open so the server can save.",

  "loading.preparing": "Preparing the review space",
  "loading.verifying": "Loading and verifying the model version",
  "loading.rebuildingMesh": "Rebuilding the review mesh ({count} triangles)",
  "loading.hint": "You can start marking once the model finishes loading",

  "view.plain": "Plain view",
  "view.original": "Original colours",

  "cube.front": "FRONT",
  "cube.back": "BACK",
  "cube.right": "RIGHT",
  "cube.left": "LEFT",
  "cube.top": "TOP",
  "cube.bottom": "BOTTOM",
  "cube.viewFrom": "Look from {side}",
  "cube.sideJoin": "-",
  "cube.homeTitle": "Back to the default view",
  "cube.homeLabel": "Reset the view",

  "tool.orbit": "Orbit",
  "tool.orbitLabel": "Orbit tool",
  "tool.orbitTitle": "Turn and inspect the model; nothing is placed or painted",
  "tool.label": "Label",
  "tool.labelLabel": "Label tool",
  "tool.labelTitle":
    "Click a surface to place a label; the right button orbits",
  "hint.label":
    "Click a surface to place a label · the right button still orbits",
  "tool.bucket": "Bucket",
  "tool.bucketLabel": "Paint bucket tool",
  "tool.bucketTitle": "Previews the connected near-flat area; click to fill",
  "tool.undo": "Undo",
  "tool.undoTitle": "Undo Ctrl/⌘ Z",
  "tool.redo": "Redo",
  "tool.marks": "Marks",
  "tool.plain": "Plain",
  "tool.spread": "Spread",
  "tool.bucketSpread": "Bucket spread",
  "tool.newRegion": "New area",
  "tool.newRegionHint": "The next fill starts its own colour area.",
  "hint.orbit":
    "Left/right-drag to orbit · Pan (H) or Shift+scroll/drag to pan · wheel/pinch to zoom",
  "hint.fill":
    "Hover to preview · click to fill · the right button still orbits",
  "hint.relocate": "Click a surface to move the label · Esc cancels",

  "settings.language": "Interface language",
  "settings.theme": "Light or dark",
  "settings.themeSystem": "Follow the system",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",

  "tool.measure": "Measure",
  "tool.measureLabel": "Measure tool",
  "tool.measureTitle":
    "Measure between two points, along an edge, between two faces or across a circle; nothing is kept unless you keep it",
  "hint.measurePoints":
    "Click two points · corners snap · the right button still orbits",
  "hint.measureEdge":
    "Point at a straight edge and click to read its length · the right button still orbits",
  "hint.measurePlanes":
    "Click one flat face, then another · the right button still orbits",
  "hint.measureCircle":
    "Click three points on the rim of a hole or shaft · corners snap · the right button still orbits",
};
