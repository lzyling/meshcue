import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ReviewStore } from "../server/store.mjs";
import { inspectModel, importModel } from "../server/models.mjs";

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
