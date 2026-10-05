import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startReview } from "./helpers/review-server.mjs";

test("A: identical and renamed publications reuse the labelled version with a notice", async (t) => {
  const f = await startReview(t);
  const first = await f.ipc("/publish", {
    file: "tmp/samples/parametric-bracket.glb",
    version: "v1",
    label: "Original",
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.notices, undefined);
  const renamed = path.join(f.dir, "renamed.glb");
  fs.copyFileSync("tmp/samples/parametric-bracket.glb", renamed);
  for (const file of ["tmp/samples/parametric-bracket.glb", renamed]) {
    const result = await f.ipc("/publish", {
      file,
      version: "v3",
      label: "Replacement",
    });
    assert.equal(result.body.model.id, first.body.model.id);
    assert.equal(result.body.model.label, "Original");
    const notice = result.body.notices?.find(
      (n) => n.code === "SAME_CONTENT_REUSED",
    );
    assert.ok(notice, "reuse must be explicit in the publish response");
    assert.match(notice.message, /Original/);
    assert.match(notice.message, /version.*label.*not applied/i);
    assert.equal((await f.ipc("/status")).body.versions.length, 1);
  }
  const other = await f.ipc("/publish", {
    file: "tmp/samples/bunny-figurine.glb",
    version: "v2",
  });
  assert.equal(other.body.notices, undefined);
  const passive = await f.ipc("/publish", {
    file: renamed,
    version: "v4",
    activate: false,
  });
  assert.match(passive.body.notices[0].message, /not changed/i);
  assert.equal((await f.ipc("/status")).body.active.id, other.body.model.id);
});
