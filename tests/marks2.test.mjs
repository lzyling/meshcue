import test from "node:test";
import assert from "node:assert/strict";
import { startReview } from "./helpers/review-server.mjs";
import { summarizeSubmission } from "../integration/summarize.mjs";
const edge = (extra = {}) => ({
  id: "edge-a",
  type: "edge",
  label: "A",
  color: "#ff0000",
  meshId: "mesh-0",
  space: "model",
  points: [
    [0, 0, 0],
    [3, 4, 0],
  ],
  length: 5,
  curved: false,
  sourceFaceIndex: 0,
  ...extra,
});
const part = (extra = {}) => ({
  id: "part-b",
  type: "part",
  label: "B",
  color: "#ff0000",
  partIds: ["part-0.3"],
  names: ["Bolt"],
  meshIds: ["mesh-0"],
  bounds: {
    space: "model",
    centroid: [0, 0, 0],
    min: [-1, -1, -1],
    max: [1, 1, 1],
  },
  ...extra,
});
async function ready(t) {
  const f = await startReview(t, {
    origin: {
      harness: "openclaw",
      channel: "telegram",
      sessionKey: "marks2",
      target: "-100000031",
      accountId: "test",
      threadId: "31",
    },
  });
  const published = await f.ipc("/publish", {
    file: "tmp/samples/parametric-bracket.glb",
    name: "Marks2",
    version: "v1",
    units: "mm",
  });
  assert.equal(published.status, 200);
  const model = published.body.model,
    owner = { versionId: model.id, clientId: "marks2-client" };
  await f.api("ready", {
    method: "POST",
    body: {
      ...owner,
      sha256: model.sha256,
      meshes: [
        {
          id: "mesh-0",
          name: "Bolt",
          triangles: 4,
          sourceTriangles: 2,
          surfaceAlgorithm: "midpoint-v3-edge0.07-rationed",
          matrixWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        },
      ],
    },
  });
  await f.api("review/begin", { method: "POST", body: owner });
  return {
    f,
    owner,
    save: (annotations) =>
      f.api("draft", {
        method: "PUT",
        body: { ...owner, revision: 0, annotations, camera: null },
      }),
  };
}
test("marks2 accepts valid edge and part", async (t) => {
  const { save } = await ready(t);
  const r = await save([edge(), part()]);
  assert.equal(r.status, 200);
});
for (const [name, mark] of Object.entries({
  "too few points": edge({ points: [[0, 0, 0]] }),
  "too many points": edge({ points: Array(513).fill([0, 0, 0]) }),
  "inconsistent length": edge({ length: 6 }),
  "unknown edge mesh": edge({ meshId: "unknown" }),
  "source face outside": edge({ sourceFaceIndex: 2 }),
  "unknown part mesh": part({ meshIds: ["unknown"] }),
  "invalid part path": part({ partIds: ["wrong"] }),
  "names mismatch": part({ names: ["a", "b"] }),
}))
  test(`marks2 rejects ${name}`, async (t) => {
    const { save } = await ready(t);
    assert.equal((await save([mark])).status, 400);
  });
test("marks2 read summary carries identity and endpoints without full geometry", () => {
  const s = summarizeSubmission({
    annotations: [
      edge({ brep: { face: [0, 1] } }),
      part({ group: { id: "group-a", name: "Fasteners" } }),
    ],
    meshManifest: { meshes: [{ id: "mesh-0" }, { id: "mesh-1" }] },
  });
  assert.deepEqual(s.annotations[0].ends, [
    [0, 0, 0],
    [3, 4, 0],
  ]);
  assert.equal(s.annotations[0].length, 5);
  assert.deepEqual(s.annotations[0].brep.face, [0, 1]);
  assert.equal(s.annotations[0].points, undefined);
  assert.deepEqual(s.annotations[1].partIds, ["part-0.3"]);
  assert.equal(s.annotations[1].group.name, "Fasteners");
  assert.equal(s.meshManifest.meshes.length, 1);
});
test("marks2 push describes a whole part and edge length", async (t) => {
  const { f, owner, save } = await ready(t);
  const saved = await save([edge(), part()]);
  const submitted = await f.api("feedback", {
    method: "POST",
    body: {
      ...owner,
      revision: saved.body.revision,
      submissionId: "marks2-submission",
    },
  });
  assert.equal(submitted.status, 200);
  const fs = await import("node:fs"),
    path = await import("node:path");
  const message = JSON.parse(
    fs.readFileSync(path.join(f.dir, "fake-gateway.json"), "utf8"),
  ).calls.find((c) => c.method === "chat.send").params.message;
  assert.match(message, /A: edge \(length 5.00 mm\)/);
  assert.match(message, /B: part 'Bolt'/);
});
test("marks2 reload preserves part bounds while dropping derived region bounds", async () => {
  const { initializeDraftSerialization } = await import("../src/app/draft.js");
  const review = {};
  initializeDraftSerialization(review);
  const p = part();
  assert.deepEqual(review.withoutBounds([p]), [p]);
  assert.deepEqual(
    review.withoutBounds([{ type: "region", bounds: p.bounds }]),
    [{ type: "region" }],
  );
});
