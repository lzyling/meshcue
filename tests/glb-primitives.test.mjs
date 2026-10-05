import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  inspectModel,
  MAX_TRIANGLES,
  MAX_TEXTURE_BYTES,
} from "../server/models.mjs";
import { precheckModel } from "../integration/precheck.mjs";
import { InstanceManager, ipc } from "../integration/manager.mjs";
import { removeNonTrianglePrimitives } from "../src/glb-primitives.js";
import { buildFillTopology } from "../src/planar-fill.js";
import { reviewSurface } from "../src/surface.js";
import { stopManagedReview } from "./helpers/managed-server.mjs";
import { primitiveGlb, mixedPrimitives } from "./fixtures/primitive-glb.mjs";

process.env.REVIEW_UPDATE_CHECK = "off";
const parse = (buffer) =>
  new GLTFLoader().parseAsync(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
    "",
  );
const notice = [
  {
    code: "SKIPPED_PRIMITIVES",
    message:
      "Skipped 4 point/line primitives; only triangle surfaces are shown and counted.",
  },
];
function setup(t) {
  fs.mkdirSync("tmp", { recursive: true });
  const workspace = fs.mkdtempSync(
    path.join(process.cwd(), "tmp/glb-primitives-"),
  );
  const cleanup = [];
  // node:test runs after hooks in registration order. Keep the workspace and
  // its process lock until shutdown has completed, including on assertion failure.
  t.after(async () => {
    try {
      for (const stop of cleanup) await stop();
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
  const ctx = {
    workspaceDir: workspace,
    fsPolicy: { workspaceOnly: true },
    agentId: "fixture",
    sessionKey: "fixture",
    sessionId: "one",
    messageChannel: "webchat",
  };
  const write = (buffer) => {
    fs.writeFileSync(path.join(workspace, "part.glb"), buffer);
    return "part.glb";
  };
  return { workspace, ctx, write, cleanup };
}

test("mixed GLB server counts match loader triangles and page source-face numbering", async () => {
  const buffer = primitiveGlb(mixedPrimitives);
  const metadata = inspectModel(buffer, "glb");
  const { scene } = await parse(buffer);
  assert.equal(metadata.triangles, 7);
  assert.deepEqual(metadata.notices, notice);
  assert.ok(new THREE.Box3().setFromObject(scene).max.x >= 1000);
  const discarded = [];
  scene.traverse((o) => {
    if (o.isLine || o.isPoints) discarded.push(o);
  });
  const geometries = new Set(),
    materials = new Set();
  for (const o of discarded) {
    o.geometry.addEventListener("dispose", () => geometries.add(o.geometry));
    o.material.addEventListener("dispose", () => materials.add(o.material));
  }
  removeNonTrianglePrimitives(scene);
  assert.equal(geometries.size, 4);
  assert.equal(materials.size, new Set(discarded.map((o) => o.material)).size);
  const meshes = [];
  scene.traverse((o) => {
    assert.ok(!o.isLine && !o.isPoints);
    if (o.isMesh) meshes.push(o);
  });
  assert.deepEqual(
    meshes.map(
      (o) =>
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3,
    ),
    [2, 3, 1, 1],
  );
  assert.deepEqual([...meshes[0].geometry.index.array], [0, 1, 2, 3, 2, 1]);
  assert.deepEqual(
    [...meshes[1].geometry.index.array],
    [0, 1, 2, 0, 2, 3, 0, 3, 4],
  );
  const bounds = new THREE.Box3().setFromObject(scene);
  assert.deepEqual(bounds.min.toArray(), [0, 0, 0]);
  assert.deepEqual(bounds.max.toArray(), [1, 2, 0]);
  let total = 0;
  for (const mesh of meshes) {
    const faces =
      (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) /
      3;
    const topology = buildFillTopology(mesh.geometry, mesh.matrixWorld);
    const surface = reviewSurface(mesh.geometry, mesh.matrixWorld, faces);
    assert.deepEqual(
      [...new Set(surface.userData.sourceFaces)],
      Array.from({ length: faces }, (_, i) => i),
    );
    total += faces;
    surface.dispose();
    assert.ok(topology);
  }
  assert.equal(total, metadata.triangles);
});

test("indexed and unindexed strips and fans use n minus two, including short primitives", async () => {
  for (const mode of [5, 6])
    for (const indexed of [false, true]) {
      for (const count of [2, 3, 4, 5]) {
        const buffer = primitiveGlb([
          { mode, indexed, count },
          { mode: 4, count: 3 },
        ]);
        const { scene } = await parse(buffer);
        let total = 0;
        scene.traverse((o) => {
          if (o.isMesh)
            total +=
              (o.geometry.index?.count ??
                o.geometry.attributes.position.count) / 3;
        });
        assert.equal(total, Math.max(0, count - 2) + 1);
        assert.equal(inspectModel(buffer, "glb").triangles, total);
      }
      for (const count of [0, 1])
        assert.equal(
          inspectModel(
            primitiveGlb([
              { mode, indexed, count },
              { mode: 4, count: 3 },
            ]),
            "glb",
          ).triangles,
          1,
        );
    }
});

test("skipped-only GLBs still fail with zero triangles and tell precheck what was skipped", (t) => {
  const { ctx, write } = setup(t);
  for (const mode of [0, 1, 2, 3]) {
    const buffer = primitiveGlb([{ mode, count: 4 }]);
    assert.throws(
      () => inspectModel(buffer, "glb"),
      (e) => e.code === "MODEL_LIMIT" && e.measured.triangles === 0,
    );
    const result = precheckModel(ctx, write(buffer));
    assert.equal(result.verdict, "reject");
    assert.equal(result.notices[0].code, "SKIPPED_PRIMITIVES");
  }
  assert.throws(() => inspectModel(primitiveGlb([{ mode: 7 }]), "glb"));
  assert.throws(() =>
    inspectModel(primitiveGlb([{ mode: 4, count: 4 }]), "glb"),
  );
});

test("strip and fan triangles enforce the same inclusive model cap", () => {
  for (const mode of [5, 6]) {
    assert.equal(
      inspectModel(primitiveGlb([{ mode, count: MAX_TRIANGLES + 2 }]), "glb")
        .triangles,
      MAX_TRIANGLES,
    );
    assert.throws(
      () =>
        inspectModel(primitiveGlb([{ mode, count: MAX_TRIANGLES + 3 }]), "glb"),
      (e) =>
        e.code === "MODEL_LIMIT" && e.measured.triangles === MAX_TRIANGLES + 1,
    );
  }
});

test("removing construction objects preserves shared surface resources and closes discarded images once", () => {
  const root = new THREE.Group(),
    geometry = new THREE.BufferGeometry();
  const texture = new THREE.Texture(),
    material = new THREE.MeshBasicMaterial({ map: texture });
  const mesh = new THREE.Mesh(geometry, material);
  root.add(mesh, new THREE.Line(geometry, material));
  let keptDisposals = 0;
  for (const r of [geometry, material, texture])
    r.addEventListener("dispose", () => keptDisposals++);
  let closed = 0,
    disposed = 0;
  const discardedTexture = new THREE.Texture({
    close() {
      closed++;
    },
  });
  const discardedMaterial = new THREE.PointsMaterial({ map: discardedTexture });
  const discardedGeometry = new THREE.BufferGeometry();
  for (const r of [discardedGeometry, discardedMaterial, discardedTexture])
    r.addEventListener("dispose", () => disposed++);
  root.add(
    new THREE.Points(discardedGeometry, discardedMaterial),
    new THREE.Points(discardedGeometry, discardedMaterial),
  );
  removeNonTrianglePrimitives(root);
  assert.deepEqual(root.children, [mesh]);
  assert.equal(keptDisposals, 0);
  assert.equal(disposed, 3);
  assert.equal(closed, 1);
});

function textureBoundary(count, size) {
  const bytes = Array.from(
    { length: count },
    () => (size * size * 4 * 4) / 3,
  ).reduce((a, b) => a + b, 0);
  const buffer = primitiveGlb(
    undefined,
    Array.from({ length: count }, () => [size, size]),
  );
  if (bytes <= MAX_TEXTURE_BYTES) {
    const result = inspectModel(buffer, "glb");
    assert.equal(result.textureBytes, bytes);
    assert.equal(result.texturePixels, count * size * size);
  } else
    assert.throws(
      () => inspectModel(buffer, "glb"),
      (e) => {
        assert.equal(e.code, "TEXTURE_LIMIT");
        assert.equal(e.measured.textureBytes, bytes);
        assert.match(e.message, /384 MiB/);
        assert.ok(e.message.includes(`${(bytes / 1048576).toFixed(1)} MiB`));
        return true;
      },
    );
}
test("four 4K images fit the estimated GPU byte budget", () =>
  textureBoundary(4, 4096));
test("five 4K images exceed the estimated GPU byte budget", () =>
  textureBoundary(5, 4096));
test("one 8K image fits the estimated GPU byte budget", () =>
  textureBoundary(1, 8192));
test("the per-image dimension cap remains independent of total GPU bytes", () => {
  for (const dimensions of [
    [8193, 1],
    [1, 8193],
  ])
    assert.throws(
      () => inspectModel(primitiveGlb(undefined, [dimensions]), "glb"),
      (e) => e.code === "TEXTURE_LIMIT",
    );
});
test("precheck retains pixel fields and adds the byte estimate and notices", (t) => {
  const { ctx, write } = setup(t);
  const result = precheckModel(
    ctx,
    write(primitiveGlb(mixedPrimitives, [[4096, 4096]])),
  );
  assert.deepEqual(result.notices, notice);
  assert.equal(result.triangles, 7);
  assert.equal(result.texturePixels, 4096 ** 2);
  assert.equal(result.textureBytes, (4096 ** 2 * 4 * 4) / 3);
  assert.equal(result.limits.maxTextureBytes, MAX_TEXTURE_BYTES);
  assert.equal(
    result.limits.maxTexturePixels,
    MAX_TEXTURE_BYTES / ((4 * 4) / 3),
  );
  assert.equal(precheckModel(ctx, write(primitiveGlb())).notices, undefined);
});

test("publish, repeated open and reopen carry the skipped primitive notice to the Agent", async (t) => {
  const { workspace, ctx, write, cleanup } = setup(t);
  write(primitiveGlb(mixedPrimitives));
  fs.mkdirSync(path.join(workspace, "web"));
  fs.writeFileSync(path.join(workspace, "web/index.html"), "<!doctype html>");
  fs.writeFileSync(path.join(workspace, "package.json"), '{"name":"meshcue"}');
  const manager = new InstanceManager(ctx, {
    installRoot: workspace,
    serverEntry: path.join(process.cwd(), "server/index.mjs"),
    distRoot: path.join(workspace, "web"),
    environment: { REVIEW_BRIDGE: "off" },
  });
  const project = "projects/fixture";
  cleanup.push(() => stopManagedReview(manager, project));
  const args = {
    action: "open",
    project,
    file: "part.glb",
    host: "127.0.0.1",
    confirmedClientAddress: "127.0.0.1",
  };
  // Re-publication now explains reuse as well as the geometry omission; a
  // plain reopen without a file still reports only the model's own notice.
  const reusedNotices = [
    ...notice,
    {
      code: "SAME_CONTENT_REUSED",
      message:
        "Content identical to initial; initial reopened. Requested version/label were not applied.",
    },
  ];
  for (let i = 0; i < 2; i++)
    assert.deepEqual(
      (await manager.execute(args)).notices,
      i ? reusedNotices : notice,
    );
  assert.deepEqual(
    (await manager.execute({ ...args, file: undefined })).notices,
    notice,
  );
  const p = manager.project(project);
  const config = JSON.parse(
    fs.readFileSync(path.join(p.runtime, "config.json"), "utf8"),
  );
  const published = await ipc(p.runtime, config.instance, "/publish", {
    file: "part.glb",
  });
  assert.deepEqual(published.notices, reusedNotices);
  write(primitiveGlb());
  assert.equal(
    (await manager.execute({ ...args, activate: false })).notices,
    undefined,
  );
  assert.deepEqual(
    (await manager.execute({ ...args, file: undefined })).notices,
    notice,
  );
  assert.deepEqual((await manager.execute(args)).notices, [reusedNotices[1]]);
});

test("empty strips and construction parents preserve only their child surfaces and transforms", async () => {
  const { scene } = await parse(
    primitiveGlb([
      { mode: 5, count: 2 },
      { mode: 4, count: 3 },
    ]),
  );
  removeNonTrianglePrimitives(scene);
  const surfaces = [];
  scene.traverse((o) => {
    if (o.isMesh) surfaces.push(o);
  });
  assert.equal(surfaces.length, 1);
  const root = new THREE.Group();
  const line = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial(),
  );
  line.position.set(2, 3, 4);
  line.rotation.set(0.1, 0.2, 0.3);
  line.scale.set(2, 3, 4);
  const child = surfaces[0];
  line.add(child);
  root.add(line);
  const sibling = child.clone();
  root.add(sibling);
  root.updateMatrixWorld(true);
  const before = child.matrixWorld.clone();
  removeNonTrianglePrimitives(root);
  root.updateMatrixWorld(true);
  assert.deepEqual(child.matrixWorld.elements, before.elements);
  const retained = [];
  root.traverse((o) => {
    if (o.isMesh) retained.push(o);
  });
  assert.deepEqual(retained, [child, sibling]);
});
