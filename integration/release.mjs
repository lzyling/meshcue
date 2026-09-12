import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { scopedPath, fail } from "./context.mjs";

function files(root, relative = "") {
  const found = [];
  for (const name of fs.readdirSync(path.join(root, relative))) {
    const rel = path.join(relative, name),
      st = fs.lstatSync(path.join(root, rel));
    if (st.isSymbolicLink())
      fail("PACKAGE_INVALID", "套件資源含符號連結，沒有啟動。");
    if (st.isDirectory()) found.push(...files(root, rel));
    else if (st.isFile()) found.push(rel);
    else fail("PACKAGE_INVALID", "套件資源不是普通文件。");
  }
  return found.sort();
}
export function cacheRelease(installRoot, runtime) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(installRoot, "openclaw.plugin.json"), "utf8"),
  );
  if (manifest.id !== "meshcue")
    fail("PACKAGE_INVALID", "套件身份不是 MeshCue。");
  const skills = path.join(installRoot, "skills");
  const wanted = [
    "runtime/server.mjs",
    "AGENT-INTERFACE.md",
    // The server derives its version from this rather than restating it, so a
    // release without it reports "unknown" from inside a numbered package.
    "package.json",
    ...files(path.join(installRoot, "web")).map((p) => path.join("web", p)),
    // A bundled skill ships in the package but the host loads it from the
    // install root, so no other check would notice it being edited in place.
    // Hash it with the rest; a package built without one contributes nothing.
    ...(fs.existsSync(skills)
      ? files(skills).map((p) => path.join("skills", p))
      : []),
  ];
  const hash = crypto.createHash("sha256"),
    content = [];
  for (const relative of wanted.sort()) {
    const target = scopedPath(installRoot, relative);
    const data = fs.readFileSync(target);
    hash.update(relative).update("\0").update(data);
    content.push({ relative, data });
  }
  const id = hash.digest("hex");
  const root = path.join(runtime, "releases", id);
  if (!fs.existsSync(root)) {
    fs.mkdirSync(path.dirname(root), { recursive: true, mode: 0o700 });
    const staging = fs.mkdtempSync(path.join(path.dirname(root), "candidate-"));
    for (const { relative, data } of content) {
      fs.mkdirSync(path.dirname(path.join(staging, relative)), {
        recursive: true,
        mode: 0o700,
      });
      fs.writeFileSync(path.join(staging, relative), data, { mode: 0o600 });
    }
    fs.renameSync(staging, root);
  } else {
    for (const { relative, data } of content) {
      const cached = scopedPath(
        runtime,
        path.relative(runtime, path.join(root, relative)),
      );
      if (!fs.readFileSync(cached).equals(data))
        fail("CACHE_CHANGED", "已驗證的版本快取被改動，未啟動。");
    }
  }
  return cachedRelease(runtime, id);
}
export function cachedRelease(runtime, id) {
  if (!/^[a-f0-9]{64}$/.test(id || ""))
    fail("PACKAGE_INVALID", "版本快取身份不正確。");
  const root = scopedPath(runtime, `releases/${id}`, { directory: true });
  const digest = crypto.createHash("sha256");
  for (const relative of files(root))
    digest
      .update(relative)
      .update("\0")
      .update(fs.readFileSync(path.join(root, relative)));
  if (digest.digest("hex") !== id)
    fail("CACHE_CHANGED", "上一個版本快取校驗失敗；沒有啟動被改動的程式。");
  return {
    id,
    root,
    serverEntry: path.join(root, "runtime/server.mjs"),
    distRoot: path.join(root, "web"),
  };
}
