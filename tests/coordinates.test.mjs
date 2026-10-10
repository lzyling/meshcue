import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Matrix4 } from "three";
import { coordinateProbe } from "./helpers/coordinate-probe.mjs";
import {
  annotateCoordinates,
  normalizeSourceTransform,
} from "../integration/coordinates.mjs";

import { startScenario } from "../scripts/scenario-env.mjs";

const near = (a, b, eps = 1e-4) => {
  assert.equal(a.length, b.length);
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < eps, `${a} != ${b}`));
};
const registration = {
  sourceFile: "source.step",
  rotation: [
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ],
  translation: [3, 4, 5],
};
const source = (p) => [p[1] - 4, 3 - p[0], p[2] - 5];

test("production nested GLB, Y-up, uniform scale, STL and three-mesh STEP coordinate contract", async () => {
  const dir = fs.mkdtempSync(path.resolve("tmp/coordinates-"));
  const checks = await coordinateProbe(dir);
  for (const c of checks) {
    const read = (name) =>
      JSON.parse(fs.readFileSync(path.join(dir, c.key + name)));
    const raw = read("-raw.json"),
      full = read("-read.json"),
      summary = read("-summary.json");
    const pin = full.annotations.find((a) => a.type === "pin");
    const nested = c.key.startsWith("nested") || c.key.startsWith("fresh");
    const k = c.key.includes("s2") ? 2 : 1;
    const expected = nested
      ? k === 1
        ? [9 - c.local[0], 26 + c.local[2], 39 + c.local[1]]
        : [13 - 2 * c.local[0], 28 + 2 * c.local[2], 42 + 2 * c.local[1]]
      : c.local;
    near(pin.position, c.local);
    near(pin.filePosition, expected);
    near(pin.fileNormal, nested ? [0, 1, 0] : pin.normal);
    near(
      summary.annotations.find((a) => a.type === "pin").filePosition,
      expected,
    );
    near(c.snap, expected);
    assert.equal(pin.coordinateSpace, "mesh");
    const patch = full.annotations.find((a) => a.id === "region")
      .surfacePatches[0];
    patch.vertices.forEach((p, i) =>
      near(
        patch.fileVertices[i],
        nested
          ? k === 1
            ? [9 - p[0], 26 + p[2], 39 + p[1]]
            : [13 - 2 * p[0], 28 + 2 * p[2], 42 + 2 * p[1]]
          : p,
      ),
    );
    assert.equal(
      full.annotations.find((a) => a.id === "region").bounds.coordinateSpace,
      "file",
    );
    assert.equal(
      full.annotations.find((a) => a.id === "legacy-region").bounds
        .coordinateSpace,
      "preview",
    );
    assert.equal(full.camera.coordinateSpace, "preview");
    assert.equal(read("-section.json").readSerializationUnchanged, true);
    for (const m of summary.annotations.filter((a) => a.type === "measure"))
      assert.equal(m.unit, m.quantity === "angle" ? "degree" : c.units);
    const legacy = structuredClone(raw);
    legacy.meshManifest.meshes.forEach((m) => delete m.fileMatrixWorld);
    const old = annotateCoordinates(legacy).annotations.find(
      (a) => a.type === "pin",
    );
    assert.equal(old.fileConversion, "unavailable");
    assert.ok(old.fileConversionReason);
    assert.equal("filePosition" in old, false);
    near(old.position, c.local);
    const oldPatch = annotateCoordinates(legacy).annotations.find(
      (a) => a.id === "region",
    ).surfacePatches[0];
    assert.equal(oldPatch.fileConversion, "unavailable");
    assert.equal("fileVertices" in oldPatch, false);
    const registered = structuredClone(raw);
    registered.model.sourceTransform = normalizeSourceTransform(registration);
    const transformed = annotateCoordinates(registered);
    near(transformed.annotations[0].sourcePosition, source(expected));
    near(
      transformed.annotations[0].sourceNormal,
      nested ? [1, 0, 0] : [pin.normal[1], -pin.normal[0], pin.normal[2]],
    );
    transformed.annotations
      .find((a) => a.id === "region")
      .surfacePatches[0].sourceVertices.forEach((p, i) =>
        near(p, source(patch.fileVertices[i])),
      );
    for (const a of transformed.annotations) {
      if (a.sourceBounds) {
        assert.equal(a.sourceBounds.conservative, true);
        const b = a.bounds;
        near(a.sourceBounds.min, [b.min[1] - 4, 3 - b.max[0], b.min[2] - 5]);
        near(a.sourceBounds.max, [b.max[1] - 4, 3 - b.min[0], b.max[2] - 5]);
      }
      if (a.sourcePoints)
        a.sourcePoints.forEach((p, i) => near(p, source(a.points[i])));
      if (a.sourceCenter) near(a.sourceCenter, source(a.center));
      if (a.sourceNormals)
        a.sourceNormals.forEach((n, i) =>
          near(n, [a.normals[i][1], -a.normals[i][0], a.normals[i][2]]),
        );
      if (a.sourceNormal) {
        const normal = a.fileNormal || a.normal;
        near(a.sourceNormal, [normal[1], -normal[0], normal[2]]);
      }
      if (a.value !== undefined)
        assert.equal(
          a.value,
          raw.annotations.find((original) => original.id === a.id).value,
        );
      if (a.length !== undefined)
        assert.equal(
          a.length,
          raw.annotations.find((original) => original.id === a.id).length,
        );
      if (a.view) {
        near(a.view.sourceTarget, source(a.view.target));
        near(a.view.sourcePosition, source(a.view.position));
        near(a.view.sourceUp, [a.view.up[1], -a.view.up[0], a.view.up[2]]);
      }
    }
    assert.equal(
      "sourceBounds" in
        transformed.annotations.find((a) => a.id === "legacy-region"),
      false,
    );
    assert.equal(JSON.stringify(full).includes('"sourcePosition"'), false);
    if (nested) {
      near(c.bounds.min, k === 1 ? [6, 26, 39] : [7, 28, 42]);
      near(c.bounds.max, k === 1 ? [8, 26, 41] : [11, 28, 46]);
      near([c.bounds.area], [2 * k * k]);
      near([c.measure.value], [2 * k]);
    }
  }
  near(checks[0].file, checks[1].file);
  assert.notDeepEqual(checks[0].preview, checks[1].preview);
  assert.equal(checks.at(-1).meshCount, 3);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, "cleanup.json"))).serviceStopped,
    true,
  );
});

test("rigid registration rejects scale, shear, mirrors, nonfinite and wrong shapes; normals use inverse transpose", () => {
  assert.deepEqual(normalizeSourceTransform(registration), registration);
  for (const rotation of [
    [
      [2, 0, 0],
      [0, 2, 0],
      [0, 0, 2],
    ],
    [
      [1, 0.1, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [NaN, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [Infinity, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  ])
    assert.throws(
      () => normalizeSourceTransform({ ...registration, rotation }),
      { code: "INVALID_INPUT" },
    );
  assert.throws(
    () =>
      normalizeSourceTransform({ ...registration, translation: [0, NaN, 0] }),
    { code: "INVALID_INPUT" },
  );
  const matrix = new Matrix4().makeScale(2, 1, 1).toArray();
  const batch = {
    annotations: [
      {
        type: "pin",
        meshId: "mesh-0",
        position: [1, 2, 3],
        normal: [Math.SQRT1_2, Math.SQRT1_2, 0],
      },
    ],
    meshManifest: { meshes: [{ id: "mesh-0", fileMatrixWorld: matrix }] },
  };
  near(annotateCoordinates(batch).annotations[0].fileNormal, [
    1 / Math.sqrt(5),
    2 / Math.sqrt(5),
    0,
  ]);
  batch.meshManifest.meshes[0].fileMatrixWorld = new Matrix4()
    .makeScale(0, 1, 1)
    .toArray();
  const singular = annotateCoordinates(batch).annotations[0];
  assert.equal(singular.fileConversion, "unavailable");
  assert.equal("fileNormal" in singular, false);
});

test("HTTP publication registration owns immutable version identity including absent registration", async () => {
  const env = await startScenario({
    fixture: path.resolve("tests/fixtures/coordinates/nested-s1.glb"),
    dist: "dist",
  });
  try {
    const file = "copy.glb";
    fs.copyFileSync(
      "tests/fixtures/coordinates/nested-s1.glb",
      path.join(env.workspace, file),
    );
    const publish = (sourceTransform) =>
      env.ipc("/publish", {
        file,
        ...(sourceTransform ? { sourceTransform } : {}),
      });
    const plain = await publish();
    const a = await publish(registration);
    const again = await publish({ ...registration, translation: undefined });
    const zero = await publish({ ...registration, translation: [0, 0, 0] });
    assert.equal(again.model.id, zero.model.id);
    const reuse = await publish(registration);
    assert.equal(a.model.id, reuse.model.id);
    assert.notEqual(a.model.id, plain.model.id);
    assert.notEqual(a.model.id, zero.model.id);
    const owner = { versionId: a.model.id, clientId: "registration-client" };
    const api = async (route, method, body) => {
      const r = await fetch(`${env.url}/api/${route}`, {
        method,
        headers: { "Content-Type": "application/json", "X-Review-Client": "1" },
        body: JSON.stringify(body),
      });
      assert.equal(r.status, 200, await r.clone().text());
      return r.json();
    };
    await api("ready", "POST", {
      ...owner,
      sha256: a.model.sha256,
      meshes: [
        {
          id: "mesh-0",
          name: "known",
          triangles: 1,
          sourceTriangles: 1,
          surfaceAlgorithm: "midpoint-v3-edge0.07-rationed",
          matrixWorld: new Matrix4().toArray(),
          fileMatrixWorld: new Matrix4().toArray(),
        },
      ],
    });
    await api("review/begin", "POST", owner);
    const draft = await api("draft", "PUT", {
      ...owner,
      revision: 0,
      annotations: [
        {
          id: "registered-pin",
          type: "pin",
          label: "A",
          color: "#e76d5c",
          meshId: "mesh-0",
          faceIndex: 0,
          sourceFaceIndex: 0,
          position: [1, 2, 3],
          normal: [0, 0, 1],
          barycentric: [1, 0, 0],
        },
      ],
      camera: null,
    });
    await api("feedback", "POST", {
      ...owner,
      revision: draft.revision,
      submissionId: "registered-batch",
    });
    const old = await env.ipc("/read", {
      versionId: a.model.id,
      submissionId: "registered-batch",
    });
    near(old.annotations[0].sourcePosition, source([1, 2, 3]));
    await publish({ ...registration, translation: [6, 7, 8] });
    const reread = await env.ipc("/read", {
      versionId: a.model.id,
      submissionId: "registered-batch",
    });
    near(reread.annotations[0].sourcePosition, source([1, 2, 3]));
    assert.deepEqual(old.model.sourceTransform, registration);
    assert.equal((await publish()).model.id, plain.model.id);
    await assert.rejects(
      () =>
        publish({
          ...registration,
          rotation: [
            [-1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
        }),
      /sourceTransform/,
    );
  } finally {
    await env.stop();
  }
});
