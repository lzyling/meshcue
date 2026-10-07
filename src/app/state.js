import { MARK_SHOW_KEY } from "../mark-show.js";
import { newId } from "../browser-crypto.js";

export function initializeState(review) {
  review.base = new URL("./", location.href);

  review.endpoint = (path) => new URL(path, review.base).href;

  review.clientId = sessionStorage.getItem("3d-review-client") || newId();

  sessionStorage.setItem("3d-review-client", review.clientId);

  review.colors = ["#e76d5c", "#e6b64b", "#6ab398", "#629bd8", "#ae82ce"];

  review.color = review.colors[0];
  review.markShow = "both";
  try {
    const stored = localStorage.getItem(MARK_SHOW_KEY);
    if (["color", "label"].includes(stored)) review.markShow = stored;
  } catch {}

  review.state = null;

  // Sticky on purpose. Once the service has said it is reclaiming itself, the
  // polls that follow fail — and a bare connection error is what a crash looks
  // like. Remembering the reason is the only way the page can keep telling the
  // truth after the thing that knew it has gone.
  review.closingNotice = null;

  // The last countdown the service published. A hidden tab is throttled to
  // roughly one timer a minute, so the forgotten tab this whole mechanism
  // exists to collect is exactly the one that can sleep through the announced
  // window — and then all it has left is how close the deadline was when it
  // last managed to ask.
  review.lastIdle = null;

  review.loadedId = null;

  // Named for the acceptance checks: with no download control on the page, a
  // test that wants to prove the bytes on screen belong to the version claimed
  // has to be told which file to ask the service for.
  review.loadedFilename = null;

  // Which version the reviewer chose to look at, and whether they are still
  // following whatever the Agent puts on screen. Picking an older tab pins the
  // view; picking the current one hands the choice back to the Agent.
  review.viewingId = null;

  review.followActive = true;

  review.loadedReviewId = null;

  review.annotations = [];

  review.selectedId = null;

  review.mode = "orbit";

  review.revision = 0;

  review.editSeq = 0;

  review.savedSeq = 0;

  review.saveFlight = null;

  review.pendingWrite = null;

  review.saveTimer = null;

  review.renderFrame = null;

  review.loadFlight = null;

  review.beginFlight = null;

  review.submissionKey = null;

  review.submitting = false;

  review.undoStack = [];

  review.redoStack = [];

  review.initialDraftRestored = false;

  review.pollFlight = null;

  review.labelCursor = 0;

  review.relocatingId = null;

  review.loadedPrecision = null;

  // The unit the author declared for the model on screen, which is the unit
  // every length measured on it is in; "unspecified" when they declared none.
  review.loadedUnits = "unspecified";

  // What the measurement on screen has got to, as the viewer last said.
  review.measureReport = null;

  // Which version's bytes were refused as not being the ones announced. A load
  // that ends there drops the version it was holding, and the poll's job is to
  // load whatever the page is not holding — so without remembering the refusal
  // the two restart each other for as long as the tab is open, and the reason
  // is overwritten by the next "verifying" before it can be read. Cleared by
  // anything that changes the answer: a new round, a different version, or the
  // reviewer asking again by hand.
  review.refusedLoad = null;

  review.echoId = null;

  review.recoveryBlocked = false;

  review.recoveryUrl = null;

  review.accessBlocked = false;

  review.accessRecoveryNeeded = false;

  review.loadedReceipt = null;

  review.clone = (x) => structuredClone(x);
}
