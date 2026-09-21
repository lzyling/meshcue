import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeAnnotation,
  summarizeSubmission,
  readReceipt,
} from "../integration/summarize.mjs";

/* The property worth pinning is not the ratio but the flatness: a summary is
   the same size whether the reviewer painted a corner or half the model. That
   is what takes the agent's context window out of the argument about how much
   marking a round may hold. */

const patch = (faceIndex, vertices) => ({
  meshId: "mesh-0",
  faceIndex,
  sourceFaceIndex: faceIndex,
  vertices,
});
const triangle = (i) => [
  [i, 0, 0],
  [i + 1, 0, 0],
  [i, 1, 0],
];
const region = (faces, patches) => ({
  id: "r1",
  type: "region",
  color: "#e76d5c",
  coverage: "source-v2",
  label: "red",
  faces: { "mesh-0": faces },
  surfacePatches: patches,
  bounds: {
    centroid: [1, 2, 3],
    min: [0, 0, 0],
    max: [2, 4, 6],
    area: 341.5,
  },
});

test("a summary carries where and how much, not the coordinates", () => {
  const out = summarizeAnnotation(region([1, 2, 3], [patch(3, triangle(3))]));
  assert.deepEqual(out, {
    id: "r1",
    type: "region",
    color: "#e76d5c",
    coverage: "source-v2",
    faces: { "mesh-0": 3 },
    wholeFaces: 2,
    partialFaces: 1,
    polygons: 1,
    centroid: [1, 2, 3],
    min: [0, 0, 0],
    max: [2, 4, 6],
    area: 341.5,
  });
  assert.equal(JSON.stringify(out).includes("vertices"), false);
});

test("a summary is the same size for a huge mark as for a small one", () => {
  const small = summarizeAnnotation(region([1], [patch(1, triangle(1))]));
  const faces = [...Array(20000).keys()];
  const patches = faces.slice(0, 400).map((i) => patch(i, triangle(i)));
  const huge = summarizeAnnotation(region(faces, patches));
  const grew = JSON.stringify(huge).length - JSON.stringify(small).length;
  assert.ok(
    grew < 20,
    `20,000 faces should cost a few digits, not a payload (grew ${grew} bytes)`,
  );
  assert.equal(huge.wholeFaces, 19600);
  assert.equal(huge.partialFaces, 400);
});

test("a pin keeps the position it is entirely made of", () => {
  const out = summarizeAnnotation({
    id: "p1",
    type: "pin",
    label: "A",
    color: "#629bd8",
    meshId: "mesh-1",
    faceIndex: 900,
    sourceFaceIndex: 42,
    position: [1.23456789, 0, -2],
    normal: [0, 1, 0],
    barycentric: [1, 0, 0],
  });
  assert.equal(out.sourceFaceIndex, 42);
  assert.deepEqual(out.position, [1.23457, 0, -2]);
  // The review-mesh face and the barycentric coordinate describe a subdivision
  // the agent is told never to reason against, so they are not carried.
  assert.equal("barycentric" in out, false);
  assert.equal("faceIndex" in out, false);
});

test("a mark with no bounds is described without inventing one", () => {
  const bare = region([1, 2], [patch(1, triangle(1))]);
  delete bare.bounds;
  const out = summarizeAnnotation(bare);
  assert.equal("centroid" in out, false);
  assert.equal("area" in out, false);
  assert.equal(out.faces["mesh-0"], 2);
});

test("an older whole-face mark is named, not left blank", () => {
  const out = summarizeAnnotation({
    id: "r0",
    type: "region",
    color: "#6ab398",
    faces: { "mesh-0": [4, 5] },
    surfacePatches: [],
  });
  assert.equal(out.coverage, "face-v0");
  assert.equal(out.wholeFaces, 2);
});

test("the batch keeps everything that says what it is", () => {
  const batch = {
    id: "sub-1",
    versionId: "v9",
    revision: 3,
    status: "accepted",
    origin: { harness: "openclaw" },
    meshManifest: [{ id: "mesh-0", triangles: 10 }],
    createdAt: 1,
    annotations: [region([1, 2], [patch(1, triangle(1))])],
  };
  const out = summarizeSubmission(batch);
  for (const key of [
    "id",
    "versionId",
    "revision",
    "status",
    "origin",
    "meshManifest",
    "createdAt",
  ])
    assert.deepEqual(out[key], batch[key], key);
  assert.equal(out.geometry, "omitted");
  assert.ok(out.geometryHint.includes("geometry: true"));
  assert.equal(out.annotations.length, 1);
  assert.equal(out.annotations[0].id, "r1");
});

/* The flatness above is a property of the marks. The manifest is not a mark:
   it grows with the model, and a CAD assembly arrives with its whole parts
   list. A real four-mark batch against a 128-part assembly was 72,346 bytes,
   65,500 of it manifest. */
test("the manifest is cut to the meshes the marks are on", () => {
  const meshes = Array.from({ length: 128 }, (_, i) => ({
    id: `mesh-${i}`,
    name: `PART_${i}`,
    triangles: 900,
    sourceTriangles: 300,
    matrixWorld: [
      0.01875, 0, 0, 0, 0, 0.01875, 0, 0, 0, 0, 0.01875, 0, 0, 0, 0, 1,
    ],
  }));
  const batch = {
    id: "sub-2",
    versionId: "v9",
    meshManifest: { versionId: "v9", meshes },
    annotations: [
      {
        id: "r1",
        type: "region",
        color: "#e76d5c",
        coverage: "source-v2",
        faces: { "mesh-0": [1], "mesh-64": [2] },
        surfacePatches: [
          { meshId: "mesh-7", faceIndex: 2, sourceFaceIndex: 2 },
        ],
      },
      {
        id: "p1",
        type: "pin",
        label: "A",
        color: "#e76d5c",
        meshId: "mesh-109",
      },
    ],
  };
  const out = summarizeSubmission(batch);
  assert.deepEqual(
    out.meshManifest.meshes.map((m) => m.id).sort(),
    ["mesh-0", "mesh-109", "mesh-64", "mesh-7"],
    "a mesh is kept when a pin, a face list or a patch names it",
  );
  // Without this an agent reads four parts and believes the model has four.
  assert.equal(out.meshManifest.omittedMeshes, 124);
  assert.equal(out.meshManifest.versionId, "v9");
  assert.ok(
    JSON.stringify(out).length * 8 < JSON.stringify(batch).length,
    "the cut has to be worth making",
  );
});

/* Both numbers were called the same four things and sat in one array: a pin's
   position in the model's millimetres, a region's extent in the preview's
   3-unit box. */
test("a region's extent says which space it was measured in", () => {
  const marked = summarizeAnnotation({
    ...region([1], []),
    bounds: {
      space: "model",
      centroid: [0, 0, 0],
      min: [-76, -18, -23.7],
      max: [76, 30.6, 14.5],
      area: 3845.8,
    },
  });
  assert.equal(marked.space, "model");
  assert.deepEqual(marked.max, [76, 30.6, 14.5]);
  // An older batch is in the preview's coordinates and must not be relabelled
  // as the model's; the absence is the only thing that says so.
  const legacy = summarizeAnnotation(region([1], []));
  assert.equal("space" in legacy, false);
  assert.equal(legacy.area, 341.5);
});

test("a batch with no annotations passes through untouched", () => {
  const batch = { id: "sub-2", status: "stalled" };
  assert.equal(summarizeSubmission(batch), batch);
});

test("the measured shape of the change, on a real batch", () => {
  /* Eleven marks over 273 faces — the submission from 2026-09-15 that put
     577,687 bytes of coordinates into an agent's context to say where eleven
     things were. */
  const annotations = [...Array(11).keys()].map((i) => ({
    ...region(
      [...Array(25).keys()],
      [...Array(215).keys()].map((j) => patch(j % 25, triangle(j))),
    ),
    id: `r${i}`,
  }));
  const full = JSON.stringify({ annotations });
  const brief = JSON.stringify(summarizeSubmission({ annotations }));
  assert.ok(
    full.length / brief.length > 50,
    `expected the description to be far smaller (${full.length} vs ${brief.length})`,
  );
});

/* `read` answers with the batch and a receipt. The service builds that receipt
   from the whole stored record, so everything the summary just described was
   being sent a second time beside it — manifest included, which is the part
   that grows with the model. */
test("the read receipt acknowledges delivery without repeating the batch", () => {
  const stored = {
    id: "sub-3",
    versionId: "v9",
    revision: 5,
    status: "accepted",
    sealed: false,
    attempts: 1,
    deliveredAt: 1789981900008,
    readAt: 1789981908394,
    lastError: null,
    stalledAt: null,
    reviewId: "r",
    bindingId: "b",
    origin: { harness: "openclaw" },
    model: { id: "v9", name: "Assembly", bytes: 21259257 },
    meshManifest: {
      versionId: "v9",
      meshes: Array.from({ length: 128 }, (_, i) => ({ id: `mesh-${i}` })),
    },
    camera: { position: [1, 2, 3], target: [0, 0, 0] },
  };
  const out = readReceipt(stored);
  assert.equal(out.readAt, 1789981908394);
  assert.equal(out.deliveredAt, 1789981900008);
  assert.equal(out.status, "accepted");
  assert.equal(out.sealed, false);
  for (const key of [
    "meshManifest",
    "model",
    "camera",
    "origin",
    "annotations",
  ])
    assert.equal(key in out, false, `the receipt still carries ${key}`);
  // Nulls are the absence of a fault, and the absence needs no field.
  assert.equal("lastError" in out, false);
  assert.equal("stalledAt" in out, false);
});

test("a receipt reporting a fault keeps the reason", () => {
  const out = readReceipt({
    id: "sub-4",
    status: "stalled",
    stalledAt: 7,
    lastError: { code: "INVALID_REQUEST", message: "no route" },
  });
  assert.equal(out.stalledAt, 7);
  assert.equal(out.lastError.message, "no route");
});
