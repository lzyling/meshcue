import test from "node:test";
import assert from "node:assert/strict";
import { ModelViewer } from "../src/viewer.js";

test("frame hooks follow the existing render phases and mutate only the next hook snapshot", () => {
  const viewer = Object.create(ModelViewer.prototype),
    seen = [];
  viewer.controls = { update: () => seen.push("controls") };
  viewer.renderer = { render: () => seen.push("render") };
  for (const name of [
    "animateEcho",
    "reportOrientation",
    "placePins",
    "placeMeasure",
    "placeReadings",
  ])
    viewer[name] = () => seen.push(name);
  let remove;
  viewer.addFrameHook((value) => {
    assert.equal(value, viewer);
    seen.push("first");
    remove();
    viewer.addFrameHook(last);
  });
  remove = viewer.addFrameHook(() => seen.push("second"));
  const last = () => seen.push("last");
  const phases = [
    "controls",
    "animateEcho",
    "render",
    "reportOrientation",
    "placePins",
    "placeMeasure",
    "placeReadings",
  ];
  viewer.render();
  assert.deepEqual(seen, [...phases, "first", "second"]);
  seen.length = 0;
  viewer.render();
  assert.deepEqual(seen, [...phases, "first", "last"]);
  assert.throws(() => viewer.addFrameHook(null), TypeError);
});
