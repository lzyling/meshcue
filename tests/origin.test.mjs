import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ReviewStore } from "../server/store.mjs";
import { OpenClawBridge } from "../server/bridge.mjs";
import { normalizeOrigin, deliveryParams } from "../server/origin.mjs";
import { sameRoute } from "../integration/context.mjs";

const internal = normalizeOrigin("test-internal-session");
const telegram = normalizeOrigin({
  sessionKey: "test-telegram-session",
  channel: "telegram",
  target: "-100000001",
  accountId: "test",
  threadId: "41",
});
const next = {
  ...telegram,
  sessionKey: "test-other-session",
  route: { ...telegram.route, threadId: "42" },
};
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

test("Telegram replies route by the batch's own session and never override the host's destination", async () => {
  for (const origin of [internal, telegram, next]) {
    const bridge = new OpenClawBridge(origin);
    let sent;
    bridge.call = async (method, params) => {
      sent = { method, params };
      return { ok: true };
    };
    await bridge.send("test message", "idempotent-origin");
    assert.equal(sent.method, "chat.send");
    // sessionKey is the route. Each origin carries its own, so a batch frozen
    // against one topic can never be delivered into another.
    assert.equal(sent.params.sessionKey, origin.sessionKey);
    assert.equal(sent.params.deliver, origin.route.channel === "telegram");
    // Naming the destination instead is an admin-scoped override the Gateway
    // refuses outright. Sending one stalled every real Telegram round.
    for (const key of [
      "originatingChannel",
      "originatingTo",
      "originatingAccountId",
      "originatingThreadId",
    ])
      assert.equal(sent.params[key], undefined, `${key} must not be sent`);
  }
  assert.notEqual(telegram.sessionKey, next.sessionKey);
  assert.throws(() => normalizeOrigin({ ...telegram, accountId: "" }));
  assert.throws(() =>
    normalizeOrigin({ ...internal, target: telegram.target }),
  );
});

test("a busy review cannot be rebound or taken over; another topic's model waits its turn", (t) => {
  const { dir, store } = fixture(t, telegram);
  store.publish(model);
  const item = submit(store);
  assert.throws(() => store.bindOrigin(next), { code: "ORIGIN_BUSY" });
  const other = { ...model, id: "origin-model-two", version: "v2" };
  // Another conversation may publish into this project at any time, but taking
  // over the display would reset this review's draft, so that part waits.
  assert.equal(store.publish(other, next).status, "published");
  assert.throws(() => store.activate(other.id), { code: "ORIGIN_BUSY" });
  const recovered = new ReviewStore(dir, { legacyOrigin: internal });
  assert.deepEqual(recovered.state.reviewOrigin, telegram);
  assert.deepEqual(recovered.submissionOrigin(item), telegram);
  assert.equal(recovered.state.active.id, model.id);
  recovered.submissionStatus(item.id, "accepted");
  recovered.finish(model.id, "client-origin");
  // Presence is cleared by finishing, so the other conversation can take over
  // — but only by asking, never as a side effect of the reviewer stopping.
  assert.equal(recovered.state.active.id, model.id);
  recovered.activate(other.id);
  assert.deepEqual(recovered.state.reviewOrigin, next);
  assert.deepEqual(recovered.submissionOrigin(item), telegram);
  assert.equal(recovered.state.active.id, other.id);
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
  assert.equal(store.state.drafts[model.id].annotations.length, 0);
});

test("an owner without a return route is a describable host, not a malformed one", () => {
  // The point of the split: a harness that cannot be pushed to must be
  // expressible. Before, identity was a discriminated union over chat channels,
  // so this object could not be built at all — the refusal came from the schema
  // rather than from any decision about what to do.
  const pull = normalizeOrigin({ harness: "codex", sessionKey: "a-codex-run" });
  assert.equal(pull.route, undefined);
  assert.equal(pull.harness, "codex");

  // Nowhere to push is not a failed push. The wording matters because the page
  // turns "delivery failed" into a standing red banner.
  assert.throws(() => deliveryParams(pull), /was not delivered/);
  assert.doesNotThrow(() => deliveryParams(telegram));

  // Ownership did not loosen. Every field that was ever compared is still
  // compared; route-less origins simply have fewer of them to disagree on.
  assert.equal(sameRoute(pull, normalizeOrigin({ ...pull })), true);
  assert.equal(
    sameRoute(pull, normalizeOrigin({ ...pull, sessionKey: "another-run" })),
    false,
  );
  assert.equal(
    sameRoute(pull, normalizeOrigin({ ...pull, harness: "x" })),
    false,
  );
  assert.equal(sameRoute(telegram, next), false);
});

test("origins stored before the split still read, without rewriting any state file", (t) => {
  const flat = {
    harness: "openclaw",
    sessionKey: "legacy-session",
    channel: "telegram",
    target: "-100000002",
    accountId: "test",
    threadId: "7",
  };
  const { dir, store } = fixture(t, flat);
  store.publish(model);
  const item = submit(store);
  // Written by an older release exactly as it was stored then.
  const statePath = path.join(dir, "state.json");
  const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
  raw.reviewOrigin = { ...flat };
  fs.writeFileSync(statePath, JSON.stringify(raw));

  const recovered = new ReviewStore(dir, { legacyOrigin: internal });
  assert.deepEqual(recovered.state.reviewOrigin.route, {
    channel: "telegram",
    target: "-100000002",
    accountId: "test",
    threadId: "7",
  });
  assert.equal(recovered.state.reviewOrigin.sessionKey, "legacy-session");
  assert.deepEqual(deliveryParams(recovered.state.reviewOrigin), {
    sessionKey: "legacy-session",
    deliver: true,
  });
  assert.deepEqual(recovered.submissionOrigin(item), normalizeOrigin(flat));
});
