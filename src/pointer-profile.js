/* A mouse and a trackpad are the same pointer as far as the browser is
   concerned: `pointerType` says "mouse" for both, because a trackpad drives the
   system cursor. They are not the same device to use, though — a trackpad has no
   middle button at all, so a scheme that pans with one leaves half the camera
   unreachable on a laptop.

   What does tell them apart is the wheel. A mouse wheel arrives in notches:
   large, vertical-only, often reported in lines rather than pixels. A trackpad
   arrives as a stream of small pixel deltas with a horizontal component, and its
   pinch is a wheel event with ctrlKey set — a convention the browser invented
   and three.js already relies on to recognise pinch-zoom.

   None of this is certain, so it is a default and not a verdict: the reviewer
   can say which device they are on, exactly as they can with language and
   theme. */

export const DEVICES = ["auto", "mouse", "trackpad"];

// A notch is 100 or 120 in practice, and line mode means a wheel almost always.
const NOTCH = 40;

export function wheelLooksLikeTrackpad(event) {
  if (!event) return false;
  // Pinch: browsers report it as a ctrl-held wheel, which no wheel hardware
  // sends on its own.
  if (event.ctrlKey) return true;
  if (event.deltaMode !== 0) return false;
  if (event.deltaX) return true;
  const step = Math.abs(event.deltaY);
  // Fractional or small deltas are a continuous surface, not a detent.
  return step > 0 && (step < NOTCH || !Number.isInteger(event.deltaY));
}

/* One event is weak evidence; a mouse can emit a small delta and a trackpad can
   flick hard enough to look like a notch. Deciding on a run of them keeps a
   single stray event from flipping the camera's controls mid-gesture. */
export function createDeviceSense({ samples = 4 } = {}) {
  let trackpadish = 0,
    mouseish = 0,
    decided = null;
  return {
    get detected() {
      return decided;
    },
    observeWheel(event) {
      if (wheelLooksLikeTrackpad(event)) trackpadish++;
      else mouseish++;
      const total = trackpadish + mouseish;
      if (total >= samples)
        decided = trackpadish > mouseish ? "trackpad" : "mouse";
      return decided;
    },
    // A middle button settles it outright: no trackpad has one.
    observeButton(button) {
      if (button === 1) decided = "mouse";
      return decided;
    },
  };
}

export function resolveDevice(choice, detected) {
  if (choice === "mouse" || choice === "trackpad") return choice;
  return detected || "mouse";
}
