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

test("marks2 rejects finite edge coordinates whose derived length overflows", async (t) => {
  const { save } = await ready(t);
  const r = await save([
    edge({
      points: [
        [-1e308, 0, 0],
        [1e308, 0, 0],
      ],
      length: 0,
    }),
  ]);
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "BAD_GEOMETRY");
});

test("marks2 rejects overflowing and unordered part bounds", async (t) => {
  const { save } = await ready(t);
  for (const bounds of [
    {
      space: "model",
      min: [-1e308, 0, 0],
      max: [1e308, 0, 0],
      centroid: [0, 0, 0],
    },
    { space: "model", min: [1, 0, 0], max: [-1, 0, 0], centroid: [0, 0, 0] },
    { space: "model", min: [-1, 0, 0], max: [1, 0, 0], centroid: [2, 0, 0] },
  ])
    assert.equal((await save([part({ bounds })])).status, 400);
});

test("marks2 bounds names by UTF-16 units without splitting surrogate pairs", async () => {
  const { boundedMarkName } = await import("../src/viewer/marks.js");
  assert.equal(boundedMarkName("a".repeat(256)), "a".repeat(256));
  assert.equal(boundedMarkName("a".repeat(257)), "a".repeat(255) + "…");
  assert.equal(
    boundedMarkName("a".repeat(254) + "😀tail"),
    "a".repeat(254) + "…",
  );
  assert.equal(
    boundedMarkName("a".repeat(253) + "😀tail"),
    "a".repeat(253) + "😀…",
  );
});

test("marks2 generated long part and group names pass the service schema", async (t) => {
  const { MarksMethods } = await import("../src/viewer/marks.js");
  const THREE = await import("three");
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  const entry = {
    id: "part-0.3",
    name: "a".repeat(254) + "😀tail",
    meshIds: ["mesh-0"],
  };
  const viewer = {
    parts: {
      meshIds: () => ["mesh-0"],
      list: () => [entry],
      partOfMesh: () => entry.id,
      viewList: () => [
        {
          id: "agent-group:group-a",
          kind: "group",
          name: "g".repeat(95) + "😀tail",
        },
      ],
    },
    meshMap: new Map([["mesh-0", mesh]]),
    modelFrame: () => new THREE.Matrix4(),
  };
  const generated = MarksMethods.prototype.partMark.call(
    viewer,
    "agent-group:group-a",
  );
  assert.equal(generated.names[0], "a".repeat(254) + "…");
  assert.equal(generated.group.name, "g".repeat(95) + "…");
  const { save } = await ready(t);
  assert.equal((await save([part(generated)])).status, 200);
});

test("marks2 rejects group names beyond the partGroups limit", async (t) => {
  const { save } = await ready(t);
  assert.equal(
    (await save([part({ group: { id: "group-a", name: "g".repeat(97) } })]))
      .status,
    400,
  );
});

test("marks2 accepts a highly subdivided straight edge as two endpoints", async (t) => {
  const { MarksMethods } = await import("../src/viewer/marks.js");
  const { Vector3 } = await import("three");
  const points = Array.from({ length: 513 }, (_, i) => new Vector3(i, 0, 0));
  const generated = MarksMethods.prototype.edgeMark.call(
    {},
    {
      meshId: "mesh-0",
      sourceFaceIndex: 0,
      curved: false,
      points,
      ends: [points[0], points.at(-1)],
    },
  );
  assert.deepEqual(generated.points, [
    [0, 0, 0],
    [512, 0, 0],
  ]);
  assert.equal(generated.length, 512);
  const { save } = await ready(t);
  assert.equal((await save([edge(generated)])).status, 200);
});

test("marks2 refuses oversized curved edges visibly on click but not hover", async () => {
  const { MarksMethods } = await import("../src/viewer/marks.js");
  const { Vector3 } = await import("three");
  const points = Array.from(
    { length: 513 },
    (_, i) =>
      new Vector3(
        Math.cos((i / 512) * Math.PI * 2),
        Math.sin((i / 512) * Math.PI * 2),
        0,
      ),
  );
  points[512] = points[0].clone();
  const feature = {
    meshId: "mesh-0",
    sourceFaceIndex: 0,
    curved: true,
    closed: true,
    points,
  };
  const refusals = [],
    viewer = { onMarkRefused: (why) => refusals.push(why) };
  assert.equal(
    MarksMethods.prototype.edgeMark.call(viewer, feature, false),
    null,
  );
  assert.deepEqual(refusals, []);
  assert.equal(MarksMethods.prototype.edgeMark.call(viewer, feature), null);
  assert.deepEqual(refusals, ["edgeTooDetailed"]);
  assert.equal(feature.points.length, 513);
  assert.equal(feature.closed, true);
});

test("marks2 curved-edge refusal is localized and wired to the page toast", async () => {
  const { bindMeasure } = await import("../src/app/measure.js");
  const { CATALOGUES, LOCALES, setLocale, currentLocale } =
    await import("../src/i18n/index.js");
  const noop = () => {},
    element = { addEventListener: noop, open: false };
  const messages = [],
    review = {
      MEASURE_KINDS: {},
      MEASURE_HINTS: {},
      MEASURE_NEXT: {},
      MEASURE_REFUSALS: {},
      viewer: { setMeasureKind: noop },
      $: () => element,
      toast: (text) => messages.push(text),
    };
  const previousWindow = globalThis.window,
    previousDocument = globalThis.document;
  const previous = currentLocale();
  try {
    globalThis.window = { addEventListener: noop };
    globalThis.document = { querySelectorAll: () => [] };
    bindMeasure(review);
    for (const locale of LOCALES) {
      setLocale(locale);
      review.viewer.onMarkRefused("edgeTooDetailed");
      assert.equal(
        messages.at(-1),
        CATALOGUES[locale]["marks2.edgeTooDetailed"],
      );
      assert.match(messages.at(-1), /512/);
    }
  } finally {
    setLocale(previous);
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
