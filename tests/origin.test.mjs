import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ReviewStore } from "../server/store.mjs";
import { OpenClawBridge } from "../server/bridge.mjs";
import { normalizeOrigin } from "../server/origin.mjs";

const internal = normalizeOrigin("test-internal-session");
const telegram = normalizeOrigin({
  sessionKey: "test-telegram-session",
  channel: "telegram",
  target: "-100000001",
  accountId: "test",
  threadId: "41",
});
const next = { ...telegram, sessionKey: "test-other-session", threadId: "42" };
const model = {
  id: "origin-model",
  version: "v1",
  name: "origin test",
  sha256: "a".repeat(64),
};
function fixture(t, origin = internal) {
  fs.mkdirSync("tmp", { recursive: true });
  const dir = fs.mkdtempSync(path.resolve("tmp/origin-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, store: new ReviewStore(dir, { legacyOrigin: origin }) };
}
function submit(store, id = "submission-origin") {
  store.acquire(model.id, "client-origin");
  store.updateDraft({
    versionId: model.id,
    clientId: "client-origin",
    revision: 0,
    annotations: [{ id: "pin-origin", type: "pin", label: "A" }],
    camera: null,
  });
  return store.createSubmission({
    versionId: model.id,
    clientId: "client-origin",
    revision: 1,
    submissionId: id,
  });
}

test("Telegram replies use explicit destination/account/topic; internal origins never inherit delivery", async () => {
  for (const origin of [internal, telegram, next]) {
    const bridge = new OpenClawBridge(origin);
    let sent;
    bridge.call = async (method, params) => {
      sent = { method, params };
      return { ok: true };
    };
    await bridge.send("test message", "idempotent-origin");
    assert.equal(sent.method, "chat.send");
    assert.equal(sent.params.sessionKey, origin.sessionKey);
    assert.equal(sent.params.deliver, origin.channel === "telegram");
    assert.equal(sent.params.originatingThreadId, origin.threadId);
    assert.equal(sent.params.originatingTo, origin.target);
    assert.equal(sent.params.originatingAccountId, origin.accountId);
  }
  assert.throws(() => normalizeOrigin({ ...telegram, accountId: "" }));
  assert.throws(() =>
    normalizeOrigin({ ...internal, target: telegram.target }),
  );
});

test("active review cannot be rebound; queued model keeps its own origin until finish", (t) => {
  const { dir, store } = fixture(t, telegram);
  store.publish(model);
  const item = submit(store);
  assert.throws(() => store.bindOrigin(next), { code: "ORIGIN_BUSY" });
  const queued = { ...model, id: "origin-model-two", version: "v2" };
  store.publish(queued, next);
  const recovered = new ReviewStore(dir, { legacyOrigin: internal });
  assert.deepEqual(recovered.state.reviewOrigin, telegram);
  assert.deepEqual(recovered.submissionOrigin(item), telegram);
  recovered.submissionStatus(item.id, "accepted");
  recovered.finish(model.id, "client-origin");
  assert.deepEqual(recovered.state.reviewOrigin, next);
  assert.deepEqual(recovered.submissionOrigin(item), telegram);
  assert.equal(recovered.state.active.id, queued.id);
});

test("legacy submission routing survives a config change without rewriting old JSON", (t) => {
  const { dir, store } = fixture(t, internal);
  store.publish(model);
  const item = submit(store);
  const legacy = structuredClone(store.state);
  delete legacy.reviewOrigin;
  delete legacy.reviewId;
  delete legacy.bindingId;
  delete legacy.modelBindings;
  delete legacy.legacySubmissionBindings;
  delete legacy.submissions[0].bindingId;
  delete legacy.submissions[0].reviewId;
  delete legacy.legacySubmissionOrigins;
  delete legacy.submissions[0].origin;
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify(legacy));
  const file = path.join(dir, "submissions", `${item.id}.json`);
  const unchanged = fs.readFileSync(file);
  const migrated = new ReviewStore(dir, { legacyOrigin: telegram });
  const again = new ReviewStore(dir, { legacyOrigin: next });
  assert.equal(migrated.publicState("").legacyDraftCache, true);
  assert.equal(again.publicState("").legacyDraftCache, true);
  assert.deepEqual(
    migrated.submissionOrigin(migrated.state.submissions[0]),
    telegram,
  );
  assert.deepEqual(
    again.submissionOrigin(again.state.submissions[0]),
    telegram,
  );
  assert.deepEqual(fs.readFileSync(file), unchanged);
  again.submissionStatus(item.id, "accepted");
  again.finish(model.id, "client-origin");
  again.bindOrigin(next);
  assert.equal(again.publicState("").legacyDraftCache, false);
});

test("changing origin after a finished review never redirects an old idempotent retry", (t) => {
  const { store } = fixture(t, telegram);
  store.publish(model);
  const item = submit(store);
  store.submissionStatus(item.id, "accepted");
  store.finish(model.id, "client-origin");
  const originalReview = store.state.reviewId;
  store.bindOrigin(next);
  assert.notEqual(store.state.reviewId, originalReview);
  const retried = store.createSubmission({
    versionId: model.id,
    clientId: "client-origin",
    revision: 1,
    submissionId: item.id,
  });
  assert.deepEqual(store.submissionOrigin(retried), telegram);
  assert.equal(store.publicState("").submissions.length, 0);
  assert.equal(store.state.draft.annotations.length, 0);
});
