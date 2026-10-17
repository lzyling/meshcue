import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { MeasureViewMethods } from "../src/viewer/measure-view.js";

test("completed readings are measured hidden and placed before notifying, including the same hole twice", () => {
  const original = globalThis.document;
  globalThis.document = {
    createElement: () => ({ style: {} }),
  };
  try {
    const phases = [];
    const viewer = Object.create(MeasureViewMethods.prototype);
    Object.assign(viewer, {
      measureLayer: { replaceChildren() {}, append() {} },
      measuring: {
        kind: "circle",
        picks: [],
        result: {
          center: new Vector3(0, 0, 4),
          line: [new Vector3(1, 0, 4)],
          value: 5,
        },
      },
      clearOverlay() {},
      addDimension() {},
      frameRect() {
        assert.ok(this.frameRects instanceof Map);
        phases.push("rect");
      },
      readReadingSizes() {
        assert.equal(this.measureAnchors[0].el.style.visibility, "hidden");
        phases.push("sizes");
      },
      placeMeasure() {
        phases.push("anchors");
      },
      placeReadings() {
        this.measureAnchors[0].el.style.translate = "100px 400px";
        this.measureAnchors[0].el.style.visibility = "";
        phases.push("readings");
      },
      onMeasure() {
        assert.equal(this.measureAnchors[0].el.style.translate, "100px 400px");
        assert.equal(this.measureAnchors[0].el.style.visibility, "");
        phases.push("notify");
      },
    });
    for (let i = 0; i < 2; i++) {
      viewer.drawMeasure();
      assert.equal(viewer.frameRects, undefined);
    }
    assert.deepEqual(phases, [
      "rect",
      "sizes",
      "anchors",
      "readings",
      "notify",
      "rect",
      "sizes",
      "anchors",
      "readings",
      "notify",
    ]);
  } finally {
    globalThis.document = original;
  }
});
