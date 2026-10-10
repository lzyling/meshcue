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

test("marks2 target matching distinguishes sets, groups, edges and non-object marks", async () => {
  const { sameMarkTarget } = await import("../src/mark-target.js");
  assert.equal(
    sameMarkTarget(
      part({ partIds: ["a", "b"] }),
      part({ partIds: ["b", "a"] }),
    ),
    true,
  );
  assert.equal(sameMarkTarget(part(), part({ partIds: ["other"] })), false);
  assert.equal(
    sameMarkTarget(
      part({ group: { id: "g" } }),
      part({ group: { id: "g" }, partIds: ["other"] }),
    ),
    true,
  );
  assert.equal(
    sameMarkTarget(part({ group: { id: "g" } }), part({ group: { id: "h" } })),
    false,
  );
  assert.equal(sameMarkTarget(part({ group: { id: "g" } }), part()), false);
  assert.equal(sameMarkTarget(edge(), edge()), true);
  assert.equal(sameMarkTarget(edge(), edge({ meshId: "other" })), false);
  assert.equal(
    sameMarkTarget(
      edge(),
      edge({
        points: [
          [3, 4, 0],
          [0, 0, 0.0000001],
        ],
      }),
    ),
    true,
  );
  assert.equal(
    sameMarkTarget(
      edge(),
      edge({
        points: [
          [0, 0, 0],
          [3, 4.01, 0],
        ],
      }),
    ),
    false,
  );
  assert.equal(
    sameMarkTarget(
      edge(),
      edge({
        points: [
          [0, 0, 0],
          [1, 1, 0],
          [3, 4, 0],
        ],
      }),
    ),
    false,
  );
  const closed = edge({
    points: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 0],
    ],
  });
  assert.equal(
    sameMarkTarget(
      closed,
      edge({
        points: [
          [0, 0, 0],
          [0, 1, 0],
          [0, 0, 0],
        ],
      }),
    ),
    false,
  );
  for (const type of ["pin", "region", "measure"])
    assert.equal(sameMarkTarget({ type }, { type }), false);
});

test("marks2 replaces draft object color, preserves identity, and undo restores it", async () => {
  const { installAnnotationsPanel } =
    await import("../src/app/annotations-panel.js");
  const { installDraft } = await import("../src/app/draft.js");
  const { rememberSubmittedMarks } = await import("../src/mark-target.js");
  const candidate = (extra) => {
    const { id, label, color, ...mark } = part(extra);
    return mark;
  };
  const original = part({ note: "keep", view: { camera: "keep" } });
  const review = {
    annotations: [structuredClone(original)],
    color: "#00ff00",
    labelCursor: 2,
    undoStack: [],
    redoStack: [],
    loadedId: "v",
    submittedMarkIds: new Set(),
    state: {},
    owner: () => ({}),
    api: async () => ({ draft: { submittedRevision: null } }),
    viewer: {
      enabled: true,
      markView: () => ({ explode: { amount: 0.6, mode: "part" } }),
    },
    updateButtons() {},
    toast(message) {
      throw new Error(message);
    },
    draftBytes: () => 0,
    markBytes: () => 0,
    MAX_MARK_BYTES: 10000,
  };
  installDraft(review);
  installAnnotationsPanel(review);
  let changes = 0;
  review.changed = () => changes++;
  review.flushDraft = async () => {};
  // The actual click path takes its undo snapshot before handing over a mark.
  assert.equal(await review.beginEdit(), true);
  review.onPin(candidate());
  assert.equal(review.annotations.length, 1);
  assert.equal(review.annotations[0].color, "#00ff00");
  assert.equal(review.annotations[0].label, original.label);
  assert.equal(review.annotations[0].note, original.note);
  assert.deepEqual(review.annotations[0].bounds, original.bounds);
  assert.equal(review.annotations[0].view.camera, "keep");
  assert.equal(review.annotations[0].view.explode.amount, 0.6);
  assert.equal(review.selectedId, original.id);
  await review.travelHistory();
  assert.deepEqual(review.annotations, [original]);
  review.submittedMarkIds.add(original.id);
  await review.beginEdit();
  review.onPin(candidate());
  assert.equal(review.annotations.length, 2);
  assert.equal(review.annotations[0].color, original.color);
  assert.notEqual(review.annotations[1].id, original.id);
  // Future repetitions update only the unsubmitted new mark.
  review.color = "#0000ff";
  await review.beginEdit();
  review.onPin(candidate());
  assert.equal(review.annotations.length, 2);
  assert.equal(review.annotations[1].color, "#0000ff");
  await review.beginEdit();
  review.onPin(candidate({ partIds: ["other"] }));
  assert.equal(review.annotations.length, 3);
  review.annotations = [edge()];
  review.submittedMarkIds.clear();
  await review.beginEdit();
  review.onPin(edge());
  assert.equal(review.annotations.length, 1);
  assert.equal(review.annotations[0].color, "#0000ff");
  await review.travelHistory();
  assert.equal(review.annotations[0].color, "#ff0000");
  rememberSubmittedMarks(review, { submittedRevision: 5 });
  assert.equal(review.submittedMarkIds.has("edge-a"), true);
  rememberSubmittedMarks(
    review,
    { submittedRevision: 5 },
    { submittedMarkRevision: 5, submittedMarkIds: ["already-sent"] },
  );
  assert.deepEqual([...review.submittedMarkIds], ["already-sent"]);
  assert.ok(changes >= 7);
});

test("marks2 mark button opens its menu and checked item toggles the tool off", async () => {
  const { registerToolbarCommands } = await import("../src/app/toolbar.js");
  const { createCommandRegistry } = await import("../src/app/commands.js");
  const { toolbarPlacement } = await import("../src/app/menus.js");
  const { readFileSync } = await import("node:fs");
  const calls = [];
  const review = {
    commands: createCommandRegistry(),
    viewer: { enabled: true },
    loadedId: "v",
    state: { capabilities: { canEdit: true } },
    mode: "orbit",
    openMenu: (name) => calls.push(name),
    toggleTool(mode) {
      this.mode = this.mode === mode ? "orbit" : mode;
    },
  };
  registerToolbarCommands(review);
  assert.deepEqual(toolbarPlacement(review.commands.get("mark-mode")), {
    group: "mark",
    direct: true,
  });
  review.commands.run("mark-mode");
  assert.deepEqual(calls, ["mark-mode"]);
  assert.equal(review.commands.get("mode-label").checked(), true);
  review.commands.run("mode-part");
  assert.equal(review.mode, "part");
  assert.equal(review.commands.get("mode-part").checked(), true);
  review.commands.run("mode-part");
  assert.equal(review.mode, "orbit");
  assert.equal(review.commands.get("mode-part").checked(), true);
  const menus = readFileSync(
    new URL("../src/app/menus.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(menus, /mark-mode-arrow/);
  assert.match(menus, /button.setAttribute\("aria-haspopup", "menu"\)/);
  assert.match(menus, /\["ArrowUp", "ArrowDown"\]/);
});

for (const show of [undefined, "color", "label"]) {
  test(`mark-show draft roundtrip and summary: ${show ?? "legacy"}`, async (t) => {
    const { f, owner, save } = await ready(t);
    const pin = {
      id: "pin-c",
      type: "pin",
      label: "C",
      color: "#8a9399",
      meshId: "mesh-0",
      faceIndex: 0,
      position: [0, 0, 0],
      normal: [0, 0, 1],
      barycentric: [1, 0, 0],
    };
    const annotations = [edge(), part(), pin].map((a) => ({
      ...a,
      ...(show ? { show } : {}),
    }));
    const saved = await save(annotations);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const restored = await f.api(
      `state?full=1&versionId=${owner.versionId}&clientId=${owner.clientId}`,
    );
    assert.equal(restored.status, 200);
    assert.deepEqual(restored.body.draft.annotations, annotations);
    const submitted = await f.api("feedback", {
      method: "POST",
      body: {
        ...owner,
        revision: saved.body.revision,
        submissionId: "show-submission",
      },
    });
    assert.equal(submitted.status, 200);
    const fs = await import("node:fs"),
      path = await import("node:path");
    const message = JSON.parse(
      fs.readFileSync(path.join(f.dir, "fake-gateway.json"), "utf8"),
    ).calls.find((c) => c.method === "chat.send").params.message;
    assert.ok(
      message.includes(
        show === "color"
          ? "A (color-only mark, #ff0000): edge"
          : show === "label"
            ? "A (label-only mark): edge"
            : "A: edge",
      ),
    );
    const read = await f.ipc("/read", {
      submissionId: "show-submission",
      versionId: owner.versionId,
    });
    assert.equal(read.status, 200);
    const expected = structuredClone(annotations);
    expected[0].coordinateSpace = "file";
    expected[1].bounds.coordinateSpace = "file";
    Object.assign(expected[2], {
      coordinateSpace: "mesh",
      fileConversion: "unavailable",
      fileConversionReason:
        "Batch manifest has no mesh-to-file matrix for this mesh.",
    });
    assert.deepEqual(read.body.annotations, expected);
    const summary = summarizeSubmission({ annotations });
    for (const a of summary.annotations) assert.equal(a.show, show);
    const { markReference } = await import("../integration/summarize.mjs");
    assert.equal(
      markReference(annotations[0]),
      show === "color"
        ? "A (color-only mark, #ff0000)"
        : show === "label"
          ? "A (label-only mark)"
          : "A",
    );
  });
}
test("mark-show rejects illegal display modes on all object mark types", async (t) => {
  const { save } = await ready(t);
  for (const mark of [
    edge(),
    part(),
    {
      id: "pin-c",
      type: "pin",
      label: "C",
      color: "#8a9399",
      meshId: "mesh-0",
      faceIndex: 0,
      position: [0, 0, 0],
      normal: [0, 0, 1],
      barycentric: [1, 0, 0],
    },
  ]) {
    assert.equal((await save([{ ...mark, show: "both" }])).status, 400);
  }
});
test("mark-show creation allocates letters and replacement retains creation display", async () => {
  const { installAnnotationsPanel } =
    await import("../src/app/annotations-panel.js");
  const { markAppearance, LABEL_ONLY_COLOR } =
    await import("../src/mark-show.js");
  assert.deepEqual(markAppearance("label", "#e76d5c"), {
    color: LABEL_ONLY_COLOR,
    show: "label",
  });
  let cursor = 0;
  const review = {
    annotations: [],
    markShow: "color",
    color: "#e76d5c",
    nextLabel: () => String.fromCharCode(65 + cursor++),
    viewer: { markView: () => ({}) },
    draftBytes: () => 0,
    markBytes: () => 0,
    MAX_MARK_BYTES: 10000,
    changed() {},
  };
  installAnnotationsPanel(review);
  review.onPin({ type: "pin" });
  review.markShow = "label";
  review.onPin({ type: "pin" });
  assert.equal(review.annotations[0].show, "color");
  assert.equal(review.annotations[0].label, "A");
  assert.equal(review.annotations[1].label, "B");
  assert.equal(review.annotations[1].color, LABEL_ONLY_COLOR);
  review.onPin(part());
  review.markShow = "color";
  review.onPin(part());
  assert.equal(review.annotations.at(-1).show, "label");
  assert.equal(review.annotations.at(-1).color, LABEL_ONLY_COLOR);
});

test("mark-show survives history and offline cache without changing paint", async () => {
  const { installDraft } = await import("../src/app/draft.js");
  const cache = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = { setItem: (k, v) => cache.set(k, v) };
  try {
    const review = {
      annotations: [part({ show: "label", color: "#8a9399" })],
      undoStack: [],
      redoStack: [],
      loadedId: "v",
      DRAFT_PREFIX: "test-",
      editSeq: 1,
      savedSeq: 0,
      viewer: { enabled: true, cameraState: () => null },
      owner: () => ({}),
      api: async () => ({ draft: {} }),
      updateButtons() {},
      toast: (m) => {
        throw Error(m);
      },
    };
    installDraft(review);
    review.historyPush();
    review.annotations = [
      edge({ show: "color" }),
      { type: "region", color: "#e76d5c", faces: {} },
    ];
    const latest = structuredClone(review.annotations);
    review.changed = () => {};
    review.flushDraft = async () => {};
    assert.equal(review.cacheDraft(), true);
    assert.deepEqual(JSON.parse([...cache.values()][0]).annotations, latest);
    await review.travelHistory();
    assert.equal(review.annotations[0].show, "label");
    await review.travelHistory(true);
    assert.deepEqual(review.annotations, latest);
    assert.equal(review.annotations[1].show, undefined);
  } finally {
    globalThis.localStorage = previous;
  }
});
