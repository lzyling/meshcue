import { sha256 } from "@noble/hashes/sha2.js";
import { t } from "./i18n/index.js";

// getRandomValues is available on ordinary LAN HTTP origins; randomUUID and
// subtle.digest are not. Keep secure randomness and the full SHA-256 check.
export function newId(provider = globalThis.crypto) {
  if (typeof provider?.randomUUID === "function") return provider.randomUUID();
  if (typeof provider?.getRandomValues !== "function")
    throw new Error(t("conn.noSecureRandom"));
  const bytes = provider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function modelDigest(data, provider = globalThis.crypto) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let digest;
  if (typeof provider?.subtle?.digest === "function") {
    digest = new Uint8Array(await provider.subtle.digest("SHA-256", bytes));
  } else {
    const hash = sha256.create();
    const chunk = 4 * 1024 * 1024;
    for (let offset = 0; offset < bytes.length; offset += chunk) {
      hash.update(bytes.subarray(offset, offset + chunk));
      if (offset + chunk < bytes.length)
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    digest = hash.digest();
  }
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}
