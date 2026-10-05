import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startReview } from "./helpers/review-server.mjs";

import { primitiveGlb, mixedPrimitives } from "./fixtures/primitive-glb.mjs";
import { ReviewStore } from "../server/store.mjs";

test("B: skipped primitive counts persist per version and old records remain valid", async (t) => {
  const f = await startReview(t);
  const file = path.join(f.dir, "mixed.glb");
  fs.writeFileSync(file, primitiveGlb(mixedPrimitives));
  const published = await f.ipc("/publish", { file, version: "mixed" });
  assert.equal(published.status, 200);
  assert.equal(published.body.model.skippedPrimitives, 4);
  assert.equal(published.body.notices[0].code, "SKIPPED_PRIMITIVES");
  await f.restart();
  const state = (await f.api("state")).body;
  assert.equal(state.model.skippedPrimitives, 4);
  const reused = await f.ipc("/publish", { file, version: "renamed" });
  assert.deepEqual(reused.body.notices.map((n) => n.code).sort(), [
    "SAME_CONTENT_REUSED",
    "SKIPPED_PRIMITIVES",
  ]);
  const plain = await f.publish("plain");
  assert.equal(plain.skippedPrimitives, undefined);
  assert.equal(
    (await f.api(`state?versionId=${state.model.id}`)).body.model
      .skippedPrimitives,
    4,
  );
  // A pre-field review remains readable without a migration or invented count.
  await f.restart(() => {
    const store = new ReviewStore(f.dir);
    delete store.state.models[state.model.id].skippedPrimitives;
    store.save();
  });
  assert.equal(
    (await f.api(`state?versionId=${state.model.id}`)).body.model
      .skippedPrimitives,
    undefined,
  );
});
