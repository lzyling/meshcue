import test from "node:test";
import assert from "node:assert/strict";
import { ReviewAccess, sessionCookie } from "../server/access.mjs";
import { listenerConfig, lanAddresses } from "../server/network.mjs";
import { inspectModel } from "../server/models.mjs";

test("confirmed admission rules expire at 15 minutes and keep the original 60-minute browser deadline on reissue", () => {
  const minute = 60_000;
  let time = 0;
  const access = new ReviewAccess({
    scope: () => "confirmed-review",
    now: () => time,
  });
  const expired = access.issue();
  time += 15 * minute;
  assert.throws(() => access.redeem(expired.value), { code: "ACCESS_EXPIRED" });

  const admission = access.issue();
  time += 15 * minute - 1;
  const session = access.redeem(admission.value);
  const deadline = session.expiresAt;
  assert.equal(deadline - time, 60 * minute);
  assert.throws(() => access.redeem(admission.value), {
    code: "ACCESS_EXPIRED",
  });
  access.claimClient(access.authenticate(session.value), "editing-tab");

  time = deadline - 1;
  const reissued = access.issue();
  assert.equal(
    access.ownsClient(access.authenticate(session.value), "editing-tab"),
    true,
  );
  const retained = access.redeem(reissued.value, session.value);
  assert.equal(retained.value === session.value, true);
  assert.equal(retained.expiresAt, deadline);
  time = deadline;
  assert.throws(() => access.authenticate(session.value), {
    code: "ACCESS_REQUIRED",
  });
});

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

test("address admission is one-use, private, rotated and scoped; active cookies keep their identity and deadline", () => {
  let time = 0,
    scope = "address-review";
  const access = new ReviewAccess({ scope: () => scope, now: () => time });
  for (const address of ["", "0.0.0.0", "8.8.8.8", "192.168.1.2/24", "::1"])
    assert.throws(() => access.admitAddress(address), { code: "BAD_ADDRESS" });
  const issued = access.admitAddress("192.168.1.22");
  assert.deepEqual(Object.keys(issued).sort(), [
    "address",
    "expiresAt",
    "singleUse",
  ]);
  assert.equal(issued.expiresAt, 15 * 60_000);
  assert.throws(() => access.claimAddress("192.168.1.23"), {
    code: "ACCESS_REQUIRED",
  });
  time = issued.expiresAt;
  assert.throws(() => access.claimAddress("192.168.1.22"), {
    code: "ACCESS_REQUIRED",
  });
  access.admitAddress("192.168.1.22");
  access.admitAddress("192.168.1.23");
  assert.throws(() => access.claimAddress("192.168.1.22"));
  const session = access.claimAddress("::ffff:192.168.1.23");
  assert.equal(session.expiresAt - time, 60 * 60_000);
  access.claimClient(access.authenticate(session.value), "existing-editor");
  assert.throws(() => access.claimAddress("192.168.1.23"));
  assert.equal(access.metadata().grantActive, false);

  const admission = access.admitAddress("192.168.1.22");
  time += 1000;
  const retained = access.claimAddress("192.168.1.23", session.value);
  assert.equal(retained.value === session.value, true);
  assert.equal(retained.expiresAt, session.expiresAt);
  assert.equal(
    access.ownsClient(access.authenticate(session.value), "existing-editor"),
    true,
  );
  assert.deepEqual(access.metadata().admission, admission);
  assert.equal(access.metadata().sessions, 1);
  access.issue();
  assert.throws(() => access.claimAddress("192.168.1.22"));
  const generic = access.issue();
  access.admitAddress("192.168.1.22");
  assert.throws(() => access.redeem(generic.value), { code: "ACCESS_EXPIRED" });
  scope = "another-review";
  assert.throws(() => access.claimAddress("192.168.1.22", session.value));
  access.admitAddress("192.168.1.22");
  access.revoke();
  assert.throws(() => access.claimAddress("192.168.1.22"));
  assert.equal(access.metadata().grantActive, false);
  access.admitAddress("192.168.1.22");
  const finalSession = access.claimAddress("192.168.1.22");
  time = finalSession.expiresAt;
  assert.throws(() => access.claimAddress("192.168.1.22", finalSession.value));
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
