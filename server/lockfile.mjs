import fs from "node:fs";
import crypto from "node:crypto";

// A lock file records which process owns a runtime directory. It has to survive
// a crash between creation and the write that fills it: an incomplete file must
// read as stale, never as a parse error that stops the service from ever
// starting again without someone deleting the file by hand.

export function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // ESRCH means gone. EPERM means it exists and belongs to another user,
    // which is still a running process and must not be treated as stale.
    return error.code === "EPERM";
  }
}

export function readLock(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  try {
    const value = JSON.parse(raw);
    return Number.isInteger(value?.pid) && value.pid > 0 ? value : null;
  } catch {
    return null;
  }
}

// Write in full under a private name, then link it into place. link() fails
// with EEXIST when another process already holds the lock, so this keeps the
// exclusivity of an O_EXCL create while never publishing partial content.
export function claimLock(file, value = {}) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ pid: process.pid, ...value }), {
    mode: 0o600,
    flag: "wx",
  });
  try {
    fs.linkSync(temporary, file);
  } finally {
    fs.unlinkSync(temporary);
  }
}

// Only the owner clears a lock, and a failed release never masks the error that
// is already unwinding out of the critical section.
export function releaseLock(file) {
  if (readLock(file)?.pid !== process.pid) return false;
  try {
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}
