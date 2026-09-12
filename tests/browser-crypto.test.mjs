import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { newId, modelDigest } from "../src/browser-crypto.js";

test("LAN HTTP identifiers keep UUID v4 bits and secure entropy without randomUUID", () => {
  const provider = {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
  };
  const ids = Array.from({ length: 100 }, () => newId(provider));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids)
    assert.match(
      id,
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
  assert.throws(() => newId({}), /secure random source/);
});

test("LAN SHA-256 matches Node for empty, padding boundaries, subarrays and chunked models", async () => {
  for (const size of [0, 1, 55, 56, 63, 64, 65, 1024, 4 * 1024 * 1024 + 257]) {
    const backing = Uint8Array.from({ length: size + 6 }, (_, i) => i % 251);
    const bytes = backing.subarray(3, size + 3);
    const expected = createHash("sha256").update(bytes).digest("hex");
    assert.equal(await modelDigest(bytes, {}), expected, `fallback ${size}`);
    assert.equal(
      await modelDigest(bytes, webcrypto),
      expected,
      `native ${size}`,
    );
  }
});
