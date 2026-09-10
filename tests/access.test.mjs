import test from "node:test";
import assert from "node:assert/strict";
import { ReviewAccess, sessionCookie } from "../server/access.mjs";
import { listenerConfig, lanAddresses } from "../server/network.mjs";
import { inspectModel } from "../server/models.mjs";

test("fresh one-use grants revoke old admission but preserve an already active editing session", () => {
  let time = 100,
    scope = "review-a";
  const access = new ReviewAccess({
    scope: () => scope,
    now: () => time,
    grantMs: 100,
    sessionMs: 1000,
  });
  const first = access.issue();
  const newest = access.issue();
  assert.equal(first.value === newest.value, false);
  assert.throws(() => access.redeem(first.value), { code: "ACCESS_EXPIRED" });
  const session = access.redeem(newest.value);
  assert.throws(() => access.redeem(newest.value), { code: "ACCESS_EXPIRED" });
  const owner = access.authenticate(session.value);
  access.claimClient(owner, "tab-a");
  const renewal = access.issue();
  const reused = access.redeem(renewal.value, session.value);
  assert.equal(reused.value === session.value, true);
  assert.equal(
    access.ownsClient(access.authenticate(reused.value), "tab-a"),
    true,
  );
  const other = access.redeem(access.issue().value);
  assert.throws(
    () => access.claimClient(access.authenticate(other.value), "tab-a"),
    { code: "CLIENT_OWNERSHIP" },
  );
  time = 1100;
  assert.throws(() => access.authenticate(session.value), {
    code: "ACCESS_REQUIRED",
  });
  const expired = access.issue();
  time += 100;
  assert.throws(() => access.redeem(expired.value), { code: "ACCESS_EXPIRED" });
  const beforeSwitch = access.redeem(access.issue().value);
  scope = "review-b";
  assert.throws(() => access.authenticate(beforeSwitch.value));
  const current = access.redeem(access.issue().value);
  access.revoke();
  assert.throws(() => access.authenticate(current.value));
});

test("ambiguous cookies and unauthenticated client ownership never establish access", () => {
  assert.equal(sessionCookie({ cookie: "review_access=invalid" }), null);
  assert.equal(
    sessionCookie({
      cookie: "review_access=invalid; review_access=also-invalid",
    }),
    null,
  );
  const access = new ReviewAccess({ scope: () => "scope" });
  assert.throws(() => access.authenticate("invalid"));
  assert.equal(access.metadata().sessions, 0);
});

test("LAN address selection requires a concrete local private interface and does not guess among networks", () => {
  const iface = {
    lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
    en0: [{ address: "192.168.4.12", family: "IPv4", internal: false }],
    utun0: [{ address: "10.0.8.3", family: "IPv4", internal: false }],
  };
  assert.deepEqual(listenerConfig("lan", iface), {
    host: "192.168.4.12",
    lan: true,
  });
  assert.equal(lanAddresses(iface).length, 2);
  assert.throws(() => listenerConfig("0.0.0.0", iface));
  assert.throws(() => listenerConfig("8.8.8.8", iface));
  assert.throws(() => listenerConfig("192.168.4.13", iface));
  assert.throws(() =>
    listenerConfig("lan", {
      ...iface,
      en1: [{ address: "10.1.2.3", family: "IPv4", internal: false }],
    }),
  );
});

test("GLB images cannot invoke the vulnerable ICNS/JXL/HEIF decoders even with a false PNG MIME", () => {
  for (const bytes of [
    Buffer.from("icns00000000"),
    Buffer.from([255, 10, 0, 0, 0, 0, 0, 0]),
    Buffer.from("0000ftypheic0000"),
  ]) {
    const doc = {
      asset: { version: "2.0" },
      images: [{ uri: `data:image/png;base64,${bytes.toString("base64")}` }],
    };
    const json = Buffer.from(JSON.stringify(doc));
    const length = Math.ceil(json.length / 4) * 4;
    const glb = Buffer.alloc(20 + length, 32);
    glb.write("glTF");
    glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(glb.length, 8);
    glb.writeUInt32LE(length, 12);
    glb.writeUInt32LE(0x4e4f534a, 16);
    json.copy(glb, 20);
    assert.throws(() => inspectModel(glb, "glb"), { code: "TEXTURE_FORMAT" });
  }
});
