import test from "node:test";
import assert from "node:assert/strict";
import {
  wheelLooksLikeTrackpad,
  createDeviceSense,
  resolveDevice,
} from "../src/pointer-profile.js";

/* `pointerType` reports "mouse" for a trackpad, because a trackpad drives the
   system cursor. The wheel is the only thing that differs, and it differs a
   lot: detents versus a continuous surface. */

const notch = { deltaMode: 0, deltaX: 0, deltaY: 100 };
const lineMode = { deltaMode: 1, deltaX: 0, deltaY: 3 };
const glide = { deltaMode: 0, deltaX: 0, deltaY: 4.5 };
const sideways = { deltaMode: 0, deltaX: -12, deltaY: 2 };
const pinch = { deltaMode: 0, deltaX: 0, deltaY: -8, ctrlKey: true };

test("a detent is a wheel; a small or fractional delta is a surface", () => {
  assert.equal(wheelLooksLikeTrackpad(notch), false);
  assert.equal(wheelLooksLikeTrackpad(lineMode), false);
  assert.equal(wheelLooksLikeTrackpad(glide), true);
});

test("a horizontal component means a surface — no wheel produces one", () => {
  assert.equal(wheelLooksLikeTrackpad(sideways), true);
});

test("pinch is a ctrl-held wheel, which no wheel hardware sends by itself", () => {
  assert.equal(wheelLooksLikeTrackpad(pinch), true);
});

test("one stray event cannot flip the controls mid-gesture", () => {
  const sense = createDeviceSense({ samples: 4 });
  assert.equal(sense.observeWheel(glide), null);
  assert.equal(sense.observeWheel(glide), null);
  assert.equal(sense.observeWheel(notch), null);
  assert.equal(sense.observeWheel(glide), "trackpad");
});

test("a middle button settles it outright, because no trackpad has one", () => {
  const sense = createDeviceSense();
  sense.observeWheel(glide);
  assert.equal(sense.observeButton(1), "mouse");
});

test("an explicit choice wins, and nothing detected still leaves a usable scheme", () => {
  assert.equal(resolveDevice("trackpad", "mouse"), "trackpad");
  assert.equal(resolveDevice("mouse", "trackpad"), "mouse");
  assert.equal(resolveDevice("auto", "trackpad"), "trackpad");
  // Before any wheel has turned, assume the device that has every button: a
  // mouse on the mouse scheme loses nothing, a trackpad on it loses panning,
  // and the first two-finger scroll corrects it either way.
  assert.equal(resolveDevice("auto", null), "mouse");
});
