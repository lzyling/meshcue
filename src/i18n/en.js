/* The source language. Every other catalogue is a translation of this file and
   is checked against its key set; see scripts/check-i18n.mjs. */
export default {
  "app.tagline": "3D model review and annotation",
  "app.preview": "Preview {version}",

  "common.close": "Close",
  "common.version": "Version",

  "conn.connecting": "Connecting",
  "conn.origin": "Replies to the original conversation",
  "conn.local": "Local review",
  "conn.returnToChat": "Return to the original conversation",
  "conn.paused": "Connection paused",
  "conn.accessExpired": "Access expired · draft kept",
  "conn.noAccess": "No review access yet",
  "conn.offline": "Service is offline",
  "conn.connectedNoAccess":
    "Connected to the workbench; no model loads until access is granted.",
  "conn.dropped": "The connection to the service dropped; your draft is kept.",
  "conn.actionFailed": "The action did not complete.",
  "conn.noSecureRandom":
    "This browser has no secure random source. Please use a current version of Chrome or Edge.",

  "error.accessRequired":
    "This entrance has no valid review access. Please return to the original conversation.",

  "a11y.reviewPanel": "Model review",
  "a11y.versionTabs": "Model versions",
  "a11y.toolbar": "Model tools",
  "a11y.palette": "Mark colour",
  "a11y.viewer": "3D model preview — orbit, zoom and annotate",

  "model.awaiting": "Waiting for the Agent to deliver a model",
  "model.awaitingFirst": "Waiting for the Agent to deliver the first model",
  "model.triangles": "{count} triangles",
  "model.summary": "{count} triangles · {format} · {units}",
  "model.readFailed": "Could not read the model file.",
  "model.versionMismatch":
    "The model file does not match the version the Agent specified; marking stopped.",
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

  "review.loadingModel": "Loading model",
  "review.earlierVersion": "Earlier version · you can still mark it",
  "review.openElsewhere": "Another window has this version open",
  "review.current": "Current version · ready to mark",
  "review.notInReview": "This version is not part of the current review.",
  "review.notMarked": "Nothing marked on this version yet.",
  "review.roundClosed": "This round is closed; marking again starts a new one.",

  "marks.heading": "Marks this round",
  "marks.collapse": "Collapse the mark list",
  "marks.expand": "Expand the mark list",
  "marks.empty": "Mark the spots you want changed\non the model.",
  "marks.limit": "A round holds at most 200 marks.",
  "marks.nearStrokeLimit":
    "This round is near its stroke limit. Submit this batch first.",
  "marks.nearMarkLimit":
    "This round is near its mark limit. Submit this batch first.",
  "marks.pin": "Point label",
  "marks.regionName": "{color} area",
  "marks.pinned": "Pinned to the surface",
  "marks.alongSurface": "Marked along the surface",
  "marks.legacyFace": "Legacy whole-face mark · kept as-is",
  "marks.one": "Mark {label}",
  "marks.showOne": "Show {name}",
  "marks.hideOne": "Hide {name}",
  "marks.deleteLabel": "Delete label {label}",
  "marks.deleteOne": "Delete {name}",
  "marks.frame": "Frame",
  "marks.frameOne": "Frame {name}",
  "marks.move": "Move",
  "marks.moveLabel": "Move label {label}",
  "marks.moveHint": "Click the surface to move {label}; Esc cancels.",
  "marks.hide": "Hide marks",
  "marks.show": "Show marks",

  "color.red": "red",
  "color.yellow": "yellow",
  "color.green": "green",
  "color.blue": "blue",
  "color.purple": "purple",
  "color.choose": "Choose colour {color}",

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

  "tool.orbit": "Orbit / Label",
  "tool.orbitLabel": "Orbit and label",
  "tool.orbitTitle": "Drag to orbit, double-click a surface to drop a label",
  "tool.brush": "Brush",
  "tool.brushLabel": "Brush tool",
  "tool.brushTitle": "The brush only marks the surface you can see",
  "tool.eraser": "Eraser",
  "tool.eraserLabel": "Eraser tool",
  "tool.eraserTitle": "Erases marks only",
  "tool.bucket": "Bucket",
  "tool.bucketLabel": "Paint bucket tool",
  "tool.bucketTitle": "Previews the connected near-flat area; click to fill",
  "tool.undo": "Undo",
  "tool.undoTitle": "Undo Ctrl/⌘ Z",
  "tool.redo": "Redo",
  "tool.size": "Size",
  "tool.brushSize": "Brush size",
  "tool.spread": "Spread",
  "tool.bucketSpread": "Bucket spread",
  "tool.newRegion": "New area",
  "tool.newRegionHint": "The next stroke starts its own colour area.",
  "tool.eraseTooFine":
    "Erasing produced too many small fragments. Use a smaller area.",
  "tool.strokeTooBroad":
    "That stroke touches too many surfaces. Zoom in or use a smaller brush; existing strokes are kept.",
  "tool.faceOverLimit":
    "This surface exceeds the 20,000 triangle limit for one mark; narrow the spread or simplify the model.",

  "hint.orbit":
    "Drag to orbit · double-click to label · right-drag to pan · scroll to zoom",
  "hint.paint": "Paint the visible surface · Option/Alt drag to orbit",
  "hint.erase":
    "Erase visible strokes · leaves the model alone · Option/Alt to orbit",
  "hint.fill": "Hover to preview · click to fill · Option/Alt to orbit",
  "hint.relocate": "Click a surface to move the label · Esc cancels",

  "version.showingNow": "Showing now",
  "version.earlier": "Earlier version",
  "version.submitted": "{count} submitted",
  "version.openElsewhere": "Open in another window",
  "version.pinnedNotice":
    "You are looking at an earlier version; the newest is {version}.",
  "version.goLatest": "Show the latest version",
  "version.driftStopped":
    "A different version arrived; your draft is kept and automatic switching has stopped.",

  "resume.text": "Another window has this version open too.",
  "resume.action": "Continue marking on this machine",
  "resume.picked": "Picked up the existing draft.",

  "recovery.text":
    "An unsynced draft on this machine was kept; the current version was not overwritten.",
  "recovery.download": "Download the draft backup",
  "recovery.restored": "Restored the draft that had not synced.",
  "recovery.backedUp":
    "The unsynced draft was backed up separately and can be downloaded for the Agent; you are now seeing the version the server saved.",
  "recovery.paused":
    "Local storage is full. The unsynced draft is protected and editing is paused; download the backup for the Agent.",

  "echo.summary": "Agent understands: {summary}",
  "echo.focus": "Show the area",
  "echo.hide": "Hide the echo",
  "echo.show": "Show the echo",
  "echo.stale":
    "The marks changed — correct the understanding in the original conversation",

  "precision.overBudget":
    "This model has used up the review mesh budget (it wants {wanted} triangles, the budget is {budget}). Large flat areas stop subdividing, so the brush jumps across them in whole patches; detail is unaffected. For finer strokes, ask the Agent to re-export at a lower chord height.",

  "outbox.reason": "Reason: {message}",
  "outbox.reasonUnknown": "Reason unknown",
  "outbox.stuck":
    "{count} batches still have not reached the Agent (retried {attempts} times, still trying). {reason}. The marks are saved on this machine — mention it in the original conversation.",
  "outbox.retrying":
    "{count} batches have not reached the Agent yet; retrying (attempt {attempts}). {reason}. The marks are saved — there is no need to mark again.",

  "feedback.default": "Marks carry their 3D position and the current version",
  "feedback.notSubmitted": "Not submitted · the draft saves itself",
  "feedback.saved": "Saved",
  "feedback.delivered": "delivered to the original conversation",
  "feedback.acceptedPending": "accepted, delivery not yet confirmed",
  "feedback.deliveryUnconfirmed": "delivery unconfirmed, will retry",
  "feedback.read": "the Agent has read it",
  "feedback.unread": "waiting for the Agent to read it",
  "feedback.alsoUnsubmitted": "; more changes are not yet submitted",
  "feedback.downloadMarks": "Download the marks",
  "feedback.downloadModel": "Download this version",
  "feedback.finish": "Finish this round",
  "feedback.submit": "Send to Agent",
  "feedback.submitting": "Submitting…",
  "feedback.submitted":
    "Marks saved; the submission status updates from the actual receipt. The model stays locked.",
  "feedback.roundSealed":
    "This round is closed; marks that were not submitted have been sealed and sent to the Agent with it.",
  "feedback.roundClosed":
    "This round is closed; submitted marks are still saved.",

  "help.open": "How to use",
  "help.eyebrow": "QUICK START",
  "help.title": "Look, mark, then say what to change.",
  "help.p1":
    "Hold the left button and drag to orbit, right button to pan, wheel to zoom; you can drop a label without switching tools.",
  "help.p2":
    "Labels: double-click the model surface to place A, B, C; a plain single click places nothing. Brush: paints only the surface you can currently see; hold Option/Alt and drag to orbit for a moment, then carry on painting.",
  "help.p3":
    "Point labels are identified by their letter, painted areas by their colour; the colour covers only the actual strokes. To separate another request, press “New area”. You can undo, redo, and delete individual marks.",
  "help.p4":
    "The eraser removes visible strokes only and leaves the model's own materials alone. The paint bucket previews the connected near-flat area and fills it on a click; the spread slider appears only for the bucket. The bucket works on a whole connected surface, which can include parts hidden behind other objects; the brush and eraser do not pass through.",
  "help.p5":
    "Marks are told apart by pattern and can be hidden in one press; plain view is only a viewing aid. Downloads keep the original colours and textures and contain no marks.",
  "help.p6":
    "“Send to Agent” saves and submits the marks. Return to the original conversation to say what you want changed; the Agent will ask if anything is unclear. Submitting does not change the model by itself.",
  "help.p7":
    "The tabs along the top list every version the Agent has delivered. Press any of them to look back, and you can mark and submit on an older version directly — each version keeps its own draft, and switching does not affect the others. The marks the Agent receives state which version they target.",
  "help.p8":
    "When a round is done, press “Finish this round”; marks that were not submitted are sealed and sent to the Agent with it. Marking again afterwards starts a new round by itself. Drafts save themselves.",
  "help.p9":
    "First release: GLB/STL, up to 80 MB and 600,000 triangles. Animation, skeletons and compressed GLB are not supported yet. This is a review tool; it does not sculpt the model.",
};
