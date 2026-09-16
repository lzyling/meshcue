import test from "node:test";
import assert from "node:assert/strict";
import { startReview } from "./helpers/review-server.mjs";

/* Until `source-v2` the service required a polygon for every face a mark
   claimed. That rule is the reason a face covered end to end still paid 142
   bytes to repeat the triangle its own number already named — on a dense mesh
   under a wide brush, most of a 3 MB draft.

   `source-v2` lets the patches name a subset of `faces`: a face with no patch
   is the whole face. These pin both halves of that — the new format is let
   through, and every other guarantee the old rule was carrying is still
   enforced, including for the old format itself. */

const origin = {
  harness: "openclaw",
  channel: "telegram",
  sessionKey: "test-coverage-v2",
  target: "-100000009",
  accountId: "test",
  threadId: "9",
};
const mesh = {
  id: "mesh-0",
  name: "isolated",
  triangles: 64,
  sourceTriangles: 64,
  surfaceAlgorithm: "midpoint-v3-edge0.07-rationed",
  matrixWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
};
const TRIANGLE = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
];
const patch = (faceIndex, vertices = TRIANGLE) => ({
  meshId: "mesh-0",
  faceIndex,
  sourceFaceIndex: faceIndex,
  vertices,
});
const region = (coverage, faces, surfacePatches) => [
  {
    id: "region-v2",
    type: "region",
    coverage,
    label: "red",
    color: "#e76d5c",
    faces: { "mesh-0": faces },
    surfacePatches,
  },
];

async function ready(t) {
  const f = await startReview(t, { origin });
  const model = await f.publish();
  const owner = { versionId: model.id, clientId: "coverage-owner" };
  assert.equal(
    (
      await f.api("ready", {
        method: "POST",
        body: { ...owner, sha256: model.sha256, meshes: [mesh] },
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.api("review/begin", { method: "POST", body: owner })).status,
    200,
  );
  const save = (annotations, revision = 0) =>
    f.api("draft", {
      method: "PUT",
      body: { ...owner, revision, annotations, camera: null },
    });
  return { f, owner, save };
}

test("a source-v2 face with no patch is the whole face, and is accepted", async (t) => {
  const { save } = await ready(t);
  const saved = await save(region("source-v2", [0, 1, 2], []));
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
});

test("source-v2 still accepts a face that does carry polygons", async (t) => {
  const { save } = await ready(t);
  // Three faces claimed; one partial, two whole. This is what a real stroke
  // looks like once the interior of the painted region collapses.
  const saved = await save(
    region(
      "source-v2",
      [0, 1, 2],
      [
        patch(1, [
          [0, 0, 0],
          [0.5, 0, 0],
          [0, 0.5, 0],
        ]),
      ],
    ),
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
});

test("source-v1 still has to account for every face with a polygon", async (t) => {
  const { save } = await ready(t);
  // The guarantee the relaxation must not have leaked into the old format: a
  // v1 mark claiming three faces and storing one polygon is still incomplete.
  const saved = await save(region("source-v1", [0, 1, 2], [patch(0)]));
  assert.equal(saved.status, 400);
  assert.equal(saved.body.code, "BAD_GEOMETRY");
});

test("a source-v2 patch may not name a face the mark did not claim", async (t) => {
  const { save } = await ready(t);
  const saved = await save(region("source-v2", [0, 1], [patch(5)]));
  assert.equal(saved.status, 400);
  assert.equal(saved.body.code, "BAD_GEOMETRY");
});

test("a source-v2 face number is a source face number", async (t) => {
  const { save } = await ready(t);
  const saved = await save(
    region("source-v2", [0], [{ ...patch(0), sourceFaceIndex: 3 }]),
  );
  assert.equal(saved.status, 400);
  assert.equal(saved.body.code, "BAD_GEOMETRY");
});

test("a source-v2 face number beyond the source mesh is refused", async (t) => {
  const { save } = await ready(t);
  const saved = await save(region("source-v2", [0, 999], []));
  assert.equal(saved.status, 400);
  assert.equal(saved.body.code, "BAD_GEOMETRY");
});

test("a whole-face mark round-trips through the draft it was saved to", async (t) => {
  const { f, owner, save } = await ready(t);
  assert.equal((await save(region("source-v2", [0, 1, 2], []))).status, 200);
  const state = await f.api(
    `state?full=1&versionId=${owner.versionId}&clientId=${owner.clientId}`,
  );
  const [back] = state.body.draft.annotations;
  assert.equal(back.coverage, "source-v2");
  assert.deepEqual(back.faces["mesh-0"], [0, 1, 2]);
  assert.deepEqual(back.surfacePatches, []);
});

test("the whole-face format is what makes a filled area cheap", async (t) => {
  const { save } = await ready(t);
  const faces = [...Array(64).keys()];
  const whole = region("source-v2", faces, []);
  const spelt = region("source-v1", faces, faces.map(patch));
  assert.equal((await save(whole)).status, 200);
  /* The measurement the change exists for. Both marks claim the same faces and
     mean the same surface; one spends a polygon per face to say so. At 20,000
     faces this ratio is the difference between a draft that fits in local
     storage and one that does not. */
  const ratio = JSON.stringify(spelt).length / JSON.stringify(whole).length;
  assert.ok(
    ratio > 10,
    `whole-face storage should be far cheaper, got ${ratio}`,
  );
});
