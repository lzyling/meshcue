import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import * as THREE from "three";
import { ReviewStore } from "../server/store.mjs";
import { inspectModel, importModel } from "../server/models.mjs";
import { ModelViewer } from "../src/viewer.js";

function fixture(t) {
  const parent = path.resolve("tmp");
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, "review-store-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, store: new ReviewStore(dir) };
}
const m1 = {
    id: "model-one",
    name: "sample",
    version: "v1",
    sha256: "a".repeat(64),
  },
  m2 = {
    id: "model-two",
    name: "sample",
    version: "v2",
    sha256: "b".repeat(64),
  };
const pins = [
  {
    id: "pin-one",
    type: "pin",
    label: "1",
    color: "#e76d5c",
    meshId: "mesh-0",
    faceIndex: 2,
    position: [1, 2, 3],
    normal: [0, 0, 1],
    barycentric: [0.2, 0.3, 0.5],
  },
];
function draft(store, annotations = pins, revision = 0) {
  return store.updateDraft({
    versionId: m1.id,
    clientId: "client-a",
    revision,
    annotations,
    camera: null,
  });
}

test("publishing while editing queues the new model without changing geometry or draft, including after restart", (t) => {
  const { dir, store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  assert.equal(store.publish(m2).status, "queued");
  const recovered = new ReviewStore(dir);
  assert.equal(recovered.state.active.id, m1.id);
  assert.equal(recovered.state.pending.id, m2.id);
  assert.deepEqual(recovered.state.draft.annotations, pins);
  assert.equal(recovered.state.lock.clientId, "client-a");
});
test("an old viewer cannot start edits after Agent publishes a new current version", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.publish(m2);
  assert.throws(
    () => store.acquire(m1.id, "client-a"),
    (e) => e.code === "STALE_VERSION",
  );
  assert.equal(store.state.lock, null);
});
test("a second tab and stale revision cannot overwrite an active draft", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  assert.throws(
    () => store.acquire(m1.id, "client-b"),
    (e) => e.code === "LOCKED",
  );
  assert.throws(
    () => draft(store, [], 0),
    (e) => e.code === "STALE_DRAFT",
  );
  assert.deepEqual(store.state.draft.annotations, pins);
});
test("submission is an immutable snapshot and does not release the model lock", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  const item = store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "submission-one",
  });
  store.submissionStatus(item.id, "accepted", { runId: "run-one" });
  assert.equal(store.publish(m2).status, "queued");
  draft(store, [{ ...pins[0], label: "A" }], 1);
  assert.equal(item.annotations[0].label, "1");
  assert.equal(store.state.active.id, m1.id);
  assert.throws(
    () => store.finish(m1.id, "client-a"),
    (e) => e.code === "UNSUBMITTED",
  );
});
test("unconfirmed delivery cannot silently unlock or discard annotations", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "retry-one",
  });
  store.submissionStatus("retry-one", "unconfirmed");
  store.publish(m2);
  assert.throws(
    () => store.finish(m1.id, "client-a"),
    (e) => e.code === "UNSUBMITTED",
  );
  assert.deepEqual(store.state.draft.annotations, pins);
});
test("retrying the same submission is idempotent and cannot silently change its source revision", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  const p = {
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "same-id",
  };
  assert.equal(store.createSubmission(p), store.createSubmission(p));
  assert.equal(store.state.submissions.length, 1);
  assert.throws(() => store.createSubmission({ ...p, revision: 0 }));
});
test("ending a submitted review activates pending model and retains old submission", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "done",
  });
  store.submissionStatus("done", "accepted");
  store.publish(m2);
  store.finish(m1.id, "client-a");
  assert.equal(store.state.active.id, m2.id);
  assert.equal(store.state.lock, null);
  assert.equal(store.state.draft, null);
  assert.deepEqual(store.state.submissions[0].annotations, pins);
});
test("an abandoned tab can be resumed without dropping the draft, but a live owner is protected", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  assert.throws(
    () => store.resume(m1.id, "client-b"),
    (e) => e.code === "LOCKED",
  );
  store.state.lock.touchedAt = Date.now() - 31000;
  store.resume(m1.id, "client-b");
  assert.equal(store.state.lock.clientId, "client-b");
  assert.deepEqual(store.state.draft.annotations, pins);
});
test("model import rejects corrupted GLB and invalid STL before publishing", () => {
  assert.throws(() => inspectModel(Buffer.from("not a glb"), "glb"));
  assert.throws(() => inspectModel(Buffer.alloc(84), "stl"));
});
test("real generated samples validate and import uses a stable content hash", (t) => {
  const { dir } = fixture(t);
  const workspace = path.resolve("../..");
  const mediaDir = path.join(dir, "models");
  const opts = {
    file: "media/3d/3d-agent-review/samples/parametric-bracket.glb",
    name: "test",
    version: "v1",
  };
  const a = importModel(opts, { workspace, mediaDir }),
    b = importModel(opts, { workspace, mediaDir });
  assert.equal(a.id, b.id);
  assert.ok(a.triangles > 100);
  assert.equal(fs.readdirSync(mediaDir).length, 1);
  assert.throws(() =>
    importModel({ file: os.tmpdir() }, { workspace, mediaDir }),
  );
});

test("a tiny file claiming an enormous texture is rejected before browser image decoding", () => {
  const png = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12);
  png.writeUInt32BE(20000, 16);
  png.writeUInt32BE(20000, 20);
  png[24] = 8;
  png[25] = 6;
  const doc = {
    asset: { version: "2.0" },
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ count: 3 }],
    images: [{ uri: "data:image/png;base64," + png.toString("base64") }],
  };
  const json = Buffer.from(JSON.stringify(doc)),
    length = Math.ceil(json.length / 4) * 4,
    buffer = Buffer.alloc(20 + length, 32);
  buffer.write("glTF");
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(length, 12);
  buffer.writeUInt32LE(0x4e4f534a, 16);
  json.copy(buffer, 20);
  assert.throws(
    () => inspectModel(buffer, "glb"),
    (e) => e.code === "TEXTURE_LIMIT",
  );
});

test("a lost save response can be retried after restart without duplicating or overwriting edits", (t) => {
  const { dir, store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  const saved = draft(store);
  const recovered = new ReviewStore(dir);
  assert.deepEqual(draft(recovered), saved);
  assert.equal(recovered.state.draft.revision, 1);
  assert.throws(
    () => draft(recovered, [{ ...pins[0], label: "B" }]),
    (e) => e.code === "STALE_DRAFT",
  );
  draft(recovered, [{ ...pins[0], label: "A" }], 1);
  assert.throws(
    () => draft(recovered),
    (e) => e.code === "STALE_DRAFT",
  );
  assert.equal(recovered.state.draft.annotations[0].label, "A");
});

test("delayed acceptance of an earlier submission cannot regress a newer accepted revision", (t) => {
  const { store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "earlier",
  });
  draft(store, [{ ...pins[0], label: "A" }], 1);
  store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 2,
    submissionId: "newer",
  });
  store.submissionStatus("newer", "accepted");
  store.submissionStatus("earlier", "accepted");
  assert.equal(store.state.draft.submittedRevision, 2);
  assert.doesNotThrow(() => store.finish(m1.id, "client-a"));
});

test("publishing a previously reviewed model cannot reuse an old submission revision", (t) => {
  const { dir, store } = fixture(t);
  store.publish(m1);
  store.acquire(m1.id, "client-a");
  draft(store);
  store.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "first-review",
  });
  store.submissionStatus("first-review", "accepted");
  store.publish(m2);
  store.finish(m1.id, "client-a");
  store.publish(m1);
  const recovered = new ReviewStore(dir);
  const baseline = recovered.publicState("client-a").draft;
  assert.equal(baseline.revision, 1);
  assert.deepEqual(baseline.annotations, []);
  recovered.acquire(m1.id, "client-a");
  const updated = draft(
    recovered,
    [{ ...pins[0], label: "A" }],
    baseline.revision,
  );
  assert.equal(updated.revision, 2);
  assert.equal(
    recovered.state.submissions.findLast(
      (s) => s.versionId === m1.id && s.revision === updated.revision,
    ),
    undefined,
  );
  const oldRetry = recovered.createSubmission({
    versionId: m1.id,
    clientId: "client-a",
    revision: 1,
    submissionId: "first-review",
  });
  assert.equal(oldRetry.annotations[0].label, "1");
  assert.equal(recovered.state.draft.revision, 2);
  assert.equal(recovered.state.draft.submittedRevision, null);
  recovered.submissionStatus("first-review", "accepted");
  assert.throws(
    () => recovered.finish(m1.id, "client-a"),
    (e) => e.code === "UNSUBMITTED",
  );
});

test("actual viewer BVH raycasts keep point labels and painted patches attached to the correct source triangles", async () => {
  // Deliberately scramble source triangle order so BVH partitioning must reorder
  // its internal traversal. Annotation indices must still use source order.
  const data = Buffer.alloc(84 + 40 * 50);
  data.writeUInt32LE(40, 80);
  for (let i = 0; i < 40; i++) {
    const x = (i * 17) % 40;
    const vertices = [x, 0, 0, x + 0.01, 0, 0, x, 0.01, 0];
    data.writeFloatLE(1, 84 + i * 50 + 8);
    vertices.forEach((v, k) => data.writeFloatLE(v, 84 + i * 50 + 12 + k * 4));
  }
  // Exercise the real load/selection/serialization path; only DOM/WebGL setup
  // is omitted because no rendering is required to verify geometric identity.
  const viewer = Object.assign(Object.create(ModelViewer.prototype), {
    root: new THREE.Group(),
    grid: new THREE.Object3D(),
    meshMap: new Map(),
    meshes: [],
    loadingEpoch: 0,
    clearModel() {},
    home() {},
    async onReady() {},
  });
  const model = {
    id: "scrambled-triangles",
    name: "scrambled triangles",
    format: "stl",
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
  };
  await viewer.load(
    model,
    `data:application/octet-stream;base64,${data.toString("base64")}`,
  );
  const mesh = viewer.meshes[0];
  assert.equal(mesh.geometry.userData.sourceFaces.length, 40);
  for (let sourceIndex = 0; sourceIndex < 40; sourceIndex++) {
    const local = new THREE.Vector3(
      ((sourceIndex * 17) % 40) + 0.003,
      0.003,
      0,
    );
    const world = mesh.localToWorld(local.clone());
    const ray = new THREE.Raycaster(
      world.clone().add(new THREE.Vector3(0, 0, 1)),
      new THREE.Vector3(0, 0, -1),
    );
    ray.firstHitOnly = true;
    const hit = ray.intersectObject(mesh, false)[0];
    assert.ok(hit, `source triangle ${sourceIndex} must be selectable`);
    const pin = viewer.pinFromHit(hit);
    assert.equal(pin.sourceFaceIndex, sourceIndex);
    assert.ok(
      new THREE.Vector3().fromArray(pin.position).distanceTo(local) < 0.00001,
    );
    const [region] = viewer.serializeAnnotations([
      { type: "region", faces: { "mesh-0": [hit.faceIndex] } },
    ]);
    assert.equal(region.surfacePatches[0].sourceFaceIndex, sourceIndex);
    assert.equal(
      region.surfacePatches[0].vertices[0][0],
      (sourceIndex * 17) % 40,
    );
  }
  mesh.geometry.disposeBoundsTree();
  mesh.geometry.dispose();
  mesh.material.dispose();
});
