import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ReviewStore } from "../server/store.mjs";

test("reuse records the latest publication boundary durably without changing notice lifetime", (t) => {
  fs.mkdirSync("tmp/b1-decisions", { recursive: true });
  const dir = fs.mkdtempSync(path.resolve("tmp/b1-decisions/store-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new ReviewStore(dir);
  const first = { id: "first", name: "first", version: "v1", publishedAt: 1 };
  const second = {
    id: "second",
    name: "second",
    version: "v2",
    publishedAt: 2,
  };
  store.publish(first);
  store.publish(second);
  store.publish(first);
  const event = store.state.sameContentReuse;
  assert.equal(event.latestVersionId, second.id);
  const restored = new ReviewStore(dir);
  assert.deepEqual(restored.state.sameContentReuse, event);
  restored.publish({ id: "third", name: "third", publishedAt: 3 }, undefined, {
    activate: false,
  });
  assert.deepEqual(restored.state.sameContentReuse, event);
  restored.activate(second.id);
  assert.equal(restored.state.sameContentReuse, undefined);
});
