import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startReview } from "./helpers/review-server.mjs";
import { summarizeSubmission } from "../integration/summarize.mjs";

/* A kept measurement is the third kind of mark, from 1.4.0. These hold the
   service's side of it: what it stores, the record it refuses because the
   record contradicts itself, and what the agent is told -- in the message that
   announces a batch and in what `read` hands over. */

const origin = {
  harness: "openclaw",
  channel: "telegram",
  sessionKey: "test-measure-marks",
  target: "-100000031",
  accountId: "test",
  threadId: "31",
};
const mesh = {
  id: "mesh-0",
  name: "isolated",
  triangles: 4,
  sourceTriangles: 2,
  surfaceAlgorithm: "midpoint-v3-edge0.07-rationed",
  matrixWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
};
const pick = (face = 0) => ({ meshId: "mesh-0", sourceFaceIndex: face });
const measure = (extra = {}) => ({
  id: "measure-1",
  type: "measure",
  label: "M1",
  kind: "points",
  quantity: "length",
  value: 5,
  space: "model",
  points: [
    [0, 0, 0],
    [3, 4, 0],
  ],
  picks: [pick(0), pick(1)],
  ...extra,
});
const faces = (extra = {}) =>
  measure({
    id: "measure-2",
    label: "M2",
    kind: "planes",
    points: [
      [1, 0, 2],
      [1, 10, 2],
    ],
    value: 10,
    normals: [
      [0, -1, 0],
      [0, 1, 0],
    ],
    ...extra,
  });
async function ready(t, clientId, units) {
  const f = await startReview(t, { origin });
  const published = await f.ipc("/publish", {
    file: "tmp/samples/parametric-bracket.glb",
    name: "Isolated review",
    version: "v1",
    ...(units ? { units } : {}),
  });
  assert.equal(published.status, 200);
  const model = published.body.model;
  const owner = { versionId: model.id, clientId };
  await f.api("ready", {
    method: "POST",
    body: { ...owner, sha256: model.sha256, meshes: [mesh] },
  });
  await f.api("review/begin", { method: "POST", body: owner });
  const save = (annotations, revision = 0) =>
    f.api("draft", {
      method: "PUT",
      body: { ...owner, revision, annotations, camera: null },
    });
  return { f, owner, save };
}

test("a kept measurement is stored as it was taken", async (t) => {
  const { save } = await ready(t, "measure-shape");
  const view = {
    space: "model",
    position: [40, 30, 50],
    target: [0, 0, 0],
    up: [0, 1, 0],
    fov: 38,
    aspect: 1.5,
  };
  const saved = await save([
    measure({ note: "Make this 8 mm.", view }),
    measure({
      id: "measure-edge",
      label: "M3",
      kind: "edge",
      picks: [pick(1)],
    }),
    faces(),
    faces({
      id: "measure-angle",
      label: "M4",
      quantity: "angle",
      value: 90,
      normals: [
        [0, 1, 0],
        [1, 0, 0],
      ],
    }),
  ]);
  assert.equal(saved.status, 200, JSON.stringify(saved.body).slice(0, 300));
});

test("a measurement that contradicts itself is refused, and nothing is stored", async (t) => {
  const { save } = await ready(t, "measure-refusals");
  const refusals = {
    "a length that is not the distance between its points": measure({
      value: 5.1,
    }),
    "two points taken on one": measure({ picks: [pick(0)] }),
    "an edge taken on two": measure({ kind: "edge" }),
    "points with normals": measure({ normals: faces().normals }),
    "two faces without them": faces({ normals: undefined }),
    "parallel faces read as an angle": faces({ quantity: "angle", value: 0 }),
    "faces at an angle read as a gap": faces({
      normals: [
        [0, 1, 0],
        [1, 0, 0],
      ],
    }),
    "an angle its normals do not make": faces({
      quantity: "angle",
      value: 45,
      normals: [
        [0, 1, 0],
        [1, 0, 0],
      ],
    }),
    "a normal that is not a direction": faces({
      normals: [
        [0, 2, 0],
        [0, 1, 0],
      ],
    }),
    "a triangle the model does not have": measure({
      picks: [pick(0), pick(2)],
    }),
    "a mesh the model does not have": measure({
      picks: [pick(0), { meshId: "mesh-9", sourceFaceIndex: 0 }],
    }),
    "a label that is not a measurement's": measure({ label: "A" }),
    "the preview's coordinates": measure({ space: "preview" }),
    "a field it does not carry": measure({ color: "#e76d5c" }),
  };
  for (const [what, mark] of Object.entries(refusals)) {
    const saved = await save([mark]);
    assert.equal(saved.status, 400, `${what}: ${JSON.stringify(saved.body)}`);
  }
});

test("a batch with a measurement says what was read, in the model's unit", async (t) => {
  const { f, owner, save } = await ready(t, "measure-push", "mm");
  const saved = await save([
    measure({ note: "Make this 8 mm." }),
    faces({
      id: "measure-angle",
      label: "M2",
      quantity: "angle",
      value: 90,
      normals: [
        [0, 1, 0],
        [1, 0, 0],
      ],
    }),
  ]);
  assert.equal(saved.status, 200, JSON.stringify(saved.body).slice(0, 300));
  const result = await f.api("feedback", {
    method: "POST",
    body: {
      ...owner,
      revision: saved.body.revision,
      submissionId: "measure-submission",
    },
  });
  assert.equal(result.status, 200);
  const send = JSON.parse(
    fs.readFileSync(path.join(f.dir, "fake-gateway.json"), "utf8"),
  ).calls.find((c) => c.method === "chat.send").params;
  assert.match(
    send.message,
    /M1: measurement, 5 mm point to point, from mesh-0 source face 0 to mesh-0 source face 1 — has a note/,
  );
  assert.match(send.message, /M2: measurement, 90 degrees between two faces/);
  // A measurement is a reading, not a request; the note says what it becomes.
  assert.match(send.message, /by itself it asks for no change/);
  assert.equal(send.message.includes("Make this 8 mm."), false);

  // What `read` hands over: the whole record, with its unit beside it.
  const stored = await f.ipc("/submissions/measure-submission");
  const summary = summarizeSubmission(stored.body);
  const [length, angle] = summary.annotations;
  assert.deepEqual(length, {
    id: "measure-1",
    type: "measure",
    label: "M1",
    kind: "points",
    quantity: "length",
    value: 5,
    unit: "mm",
    space: "model",
    points: [
      [0, 0, 0],
      [3, 4, 0],
    ],
    picks: [pick(0), pick(1)],
    note: "Make this 8 mm.",
  });
  assert.equal(angle.unit, "degree");
  assert.deepEqual(angle.normals, [
    [0, 1, 0],
    [1, 0, 0],
  ]);
  assert.match(summary.measureHint, /asks for no change/);
  assert.deepEqual(
    summary.meshManifest.meshes.map((m) => m.id),
    ["mesh-0"],
  );
});

test("with no declared unit the number stands alone and says so", async (t) => {
  const { f, owner, save } = await ready(t, "measure-unitless");
  const saved = await save([measure()]);
  assert.equal(saved.status, 200);
  await f.api("feedback", {
    method: "POST",
    body: {
      ...owner,
      revision: saved.body.revision,
      submissionId: "measure-unitless",
    },
  });
  const send = JSON.parse(
    fs.readFileSync(path.join(f.dir, "fake-gateway.json"), "utf8"),
  ).calls.find((c) => c.method === "chat.send").params;
  assert.match(send.message, /5 \(the model declares no unit\) point to point/);
  const stored = await f.ipc("/submissions/measure-unitless");
  assert.equal(
    summarizeSubmission(stored.body).annotations[0].unit,
    "unspecified",
  );
});
