import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startReview } from "./helpers/review-server.mjs";
import { MAX_ROUND_BYTES, MARK_WHOLE_FACE_BYTES } from "../server/budget.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const main = fs.readFileSync(path.join(repo, "src/main.js"), "utf8");
const constant = (name) => {
  const found = main.match(new RegExp(`${name} = ([0-9_]+)`));
  assert.ok(found, `${name} is no longer declared in src/main.js`);
  return Number(found[1].replace(/_/g, ""));
};

/* The page stops a reviewer at three megabytes so that a round and its recovery
   copy both fit in the storage a browser gives an origin. The service has to
   stop them too — nothing says a request came from our page — but if the two
   ceilings ever crossed, a reviewer would meet a rejected save instead of the
   toast that tells them to submit. That is the failure the byte budget was
   introduced to end, and it would come back silently. */

test("the page's budget sits below the service's, and they count alike", () => {
  const page = constant("MAX_MARK_BYTES");
  assert.ok(
    page < MAX_ROUND_BYTES,
    `the page must warn before the service refuses (${page} vs ${MAX_ROUND_BYTES})`,
  );
  assert.equal(constant("WHOLE_FACE_BYTES"), MARK_WHOLE_FACE_BYTES);
});

test("the face limit is gone from both sides, not merely raised", () => {
  // 20,000 faces and 40,000 polygons were the byte budget written twice, from
  // when a whole face still stored a polygon repeating its own triangle.
  const server = fs.readFileSync(path.join(repo, "server/index.mjs"), "utf8");
  assert.equal(/20,?000 review faces/.test(server), false);
  assert.equal(/patchCount > 40000/.test(server), false);
  assert.equal(/> 20000/.test(main), false);
});

const origin = {
  harness: "openclaw",
  channel: "telegram",
  sessionKey: "test-round-budget",
  target: "-100000011",
  accountId: "test",
  threadId: "11",
};
const mesh = {
  id: "mesh-0",
  name: "isolated",
  triangles: 600000,
  sourceTriangles: 600000,
  surfaceAlgorithm: "midpoint-v3-edge0.07-rationed",
  matrixWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
};
const region = (faces) => [
  {
    id: "region-budget",
    type: "region",
    coverage: "source-v2",
    label: "red",
    color: "#e76d5c",
    faces: { "mesh-0": faces },
    surfacePatches: [],
  },
];
async function ready(t) {
  const f = await startReview(t, { origin });
  const model = await f.publish();
  const owner = { versionId: model.id, clientId: "budget-owner" };
  await f.api("ready", {
    method: "POST",
    body: { ...owner, sha256: model.sha256, meshes: [mesh] },
  });
  await f.api("review/begin", { method: "POST", body: owner });
  return (annotations) =>
    f.api("draft", {
      method: "PUT",
      body: { ...owner, revision: 0, annotations, camera: null },
    });
}

test("a round far past the old face limit is now accepted", async (t) => {
  const save = await ready(t);
  // Five times the limit that used to stand here, and well inside the budget:
  // a hundred thousand whole faces is about 680 kB.
  const saved = await save(region([...Array(100000).keys()]));
  assert.equal(saved.status, 200, JSON.stringify(saved.body).slice(0, 200));
});

test("a round past what a browser will keep is still refused", async (t) => {
  const save = await ready(t);
  /* Whole faces, because that is now the cheap shape and so the honest way to
     reach the ceiling: half a million of them is about 3.4 MB of JSON and
     4,000,120 bytes of budget. Reaching it with polygons instead would take
     fifteen megabytes of request body and be stopped by a different limit
     entirely, which would have tested that limit rather than this one. */
  const saved = await save(region([...Array(500000).keys()]));
  assert.equal(saved.status, 400, JSON.stringify(saved.body).slice(0, 200));
  assert.match(saved.body.error, /submit in batches/);
});
