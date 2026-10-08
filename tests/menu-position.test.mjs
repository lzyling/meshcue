import test from "node:test";
import assert from "node:assert/strict";
import { positionMenu } from "../src/app/menus.js";

function place({ anchorTop, toolbarTop, viewport, naturalHeight = 291 }) {
  const globals = {
    window: { visualViewport: viewport },
    innerWidth: 1440,
    innerHeight: 900,
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  Object.assign(globalThis, globals);
  try {
    const menu = {
      style: {},
      getBoundingClientRect() {
        return {
          width: 210,
          height: Math.min(naturalHeight, parseFloat(this.style.maxHeight)),
        };
      },
    };
    const anchor = {
      getBoundingClientRect: () => ({ left: 500, top: anchorTop }),
      closest: (selector) => {
        assert.equal(selector, ".toolbar");
        return { getBoundingClientRect: () => ({ top: toolbarTop }) };
      },
    };
    positionMenu(menu, anchor);
    return menu.style;
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test("single-row menus retain their original anchor gap", () => {
  const style = place({ anchorTop: 817, toolbarTop: 811 });
  assert.equal(style.top, "518px");
  assert.equal(style.left, "500px");
  assert.equal(style.maxHeight, "801px");
});

test("second-row menus shrink to the whole toolbar boundary rather than covering it", () => {
  const style = place({ anchorTop: 180, toolbarTop: 120 });
  assert.equal(style.maxHeight, "112px");
  assert.equal(style.top, "8px");
  assert.equal(parseFloat(style.top) + parseFloat(style.maxHeight), 120);
});

test("zoom and keyboard visual viewport offsets still clamp and constrain menus", () => {
  const style = place({
    anchorTop: 250,
    toolbarTop: 180,
    viewport: { offsetLeft: 30, offsetTop: 100, width: 300, height: 200 },
  });
  assert.equal(style.maxHeight, "72px");
  assert.equal(style.maxWidth, "284px");
  assert.equal(style.top, "108px");
  assert.equal(style.left, "112px");
});
