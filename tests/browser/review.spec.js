import { test, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import * as THREE from "three";

const repo = process.cwd(),
  url = "http://127.0.0.1:43174";
let child, dir, env;
async function request(method, route, body) {
  const res = await fetch(`${url}/api/${route}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Review-Client": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}
function publish(file = "parametric-bracket.glb", version = "v1") {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "scripts/reviewctl.mjs",
        "publish",
        `../../media/3d/3d-agent-review/samples/${file}`,
        "--name",
        file === "bunny-figurine.glb" ? "人偶樣例" : "參數支架",
        "--version",
        version,
      ],
      { cwd: repo, env, encoding: "utf8" },
    ),
  );
}
async function ready(page) {
  await page.goto(url);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "點標籤模式", exact: true }),
  ).toBeEnabled();
}
async function point(page, dx = 0, dy = 0) {
  const box = await page.locator("#viewer").boundingBox();
  return {
    x: box.x + box.width * 0.55 + dx,
    y: box.y + box.height * 0.45 + dy,
  };
}
async function pin(page) {
  await page.getByRole("button", { name: "點標籤模式", exact: true }).click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
}

test.beforeEach(async () => {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  dir = fs.mkdtempSync(path.join(repo, "tmp", "browser-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  fs.copyFileSync("tests/fake-openclaw.mjs", path.join(bin, "openclaw"));
  fs.chmodSync(path.join(bin, "openclaw"), 0o755);
  env = {
    ...process.env,
    PORT: "43174",
    REVIEW_DATA_DIR: dir,
    REVIEW_SESSION_KEY: "test-only-review-session",
    REVIEW_FAKE_GATEWAY_LOG: path.join(dir, "fake-gateway.json"),
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
  };
  const log = fs.openSync(path.join(dir, "server.log"), "a");
  child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: repo,
    env,
    stdio: ["ignore", log, log],
  });
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  publish();
});
test.afterEach(async () => {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  }
});

test("actual click creates a surface pin; refresh restores it and geometry ownership", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  const before = await page.evaluate(() => window.__reviewDiagnostics());
  expect(before.annotations[0].type).toBe("pin");
  expect(
    before.annotations[0].barycentric.reduce((a, b) => a + b, 0),
  ).toBeCloseTo(1, 4);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  const after = await page.evaluate(() => window.__reviewDiagnostics());
  expect(after.annotations).toEqual(before.annotations);
  expect(after.owned).toBe(true);
  await page.screenshot({
    path: path.resolve(
      "../../media/images/2026-09-09-3d-review-pin-tested.png",
    ),
    fullPage: true,
  });
});

test("brush produces real face sets; undo, redo, delete and refresh retain the correct draft", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "畫筆模式", exact: true }).click();
  const p = await point(page, -35, 0);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(p.x + 65, p.y + 40, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  const painted = await page.evaluate(
    () => window.__reviewDiagnostics().annotations,
  );
  expect(painted[0].type).toBe("region");
  expect(Object.values(painted[0].faces).flat().length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "撤銷", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(0);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(painted);
  await page.screenshot({
    path: path.resolve(
      "../../media/images/2026-09-09-3d-review-brush-tested.png",
    ),
    fullPage: true,
  });
  await page.getByRole("button", { name: "刪除標記 1", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(0);
});

test("new Agent model waits through editing and submission until the user ends the review", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  const original = await page.evaluate(
    () => window.__reviewDiagnostics().versionId,
  );
  const queued = publish("bunny-figurine.glb", "v2");
  expect(queued.status).toBe("queued");
  await expect(page.locator("#pending-banner")).toBeVisible();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().versionId),
  ).toBe(original);
  await expect(
    page.getByRole("button", { name: "結束本輪審閱", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /交畀 Agent/ }).click();
  await expect(page.locator("#feedback-status")).toContainText("已交到會話");
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().versionId),
  ).toBe(original);
  const log = JSON.parse(
    fs.readFileSync(path.join(dir, "fake-gateway.json"), "utf8"),
  );
  const send = log.calls.find((c) => c.method === "chat.send");
  expect(send.params.deliver).toBe(false);
  expect(send.params.message).toContain(original);
  expect(send.params.message).toContain("不等於修改指令");
  await page.getByRole("button", { name: "結束本輪審閱", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(queued.model.id);
  await expect(page.locator("#loading")).toBeHidden();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(0);
  const state = await request("GET", "state");
  expect(state.data.submissions).toHaveLength(1);
  expect(state.data.submissions[0].versionId).toBe(original);
  await page.screenshot({
    path: path.resolve(
      "../../media/images/2026-09-09-3d-review-figurine-tested.png",
    ),
    fullPage: true,
  });
});

test("a second browser tab cannot overwrite another tab’s active work", async ({
  page,
  context,
}) => {
  await ready(page);
  await pin(page);
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.locator("#loading")).toBeHidden();
  await expect(other.locator("#resume-banner")).toBeVisible();
  await expect(
    other.getByRole("button", { name: "點標籤模式", exact: true }),
  ).toBeDisabled();
  await other
    .getByRole("button", { name: "接續已保存草稿", exact: true })
    .click();
  await expect(other.locator("#toast")).toContainText("原視窗仍在線");
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(1);
  await other.close();
});

test("visible-only brush never selects the occluded mesh and its patches match the brush footprint", async ({
  page,
}) => {
  publish("occlusion-check.glb", "occlusion-test");
  await ready(page);
  await page.getByRole("button", { name: "畫筆模式", exact: true }).click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  const d = await page.evaluate(() => window.__reviewDiagnostics());
  const a = d.annotations[0];
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, "manifests", `${d.versionId}.json`), "utf8"),
  );
  const front = manifest.meshes.find((m) => m.name === "visible-front"),
    back = manifest.meshes.find((m) => m.name === "hidden-back");
  expect(Object.keys(a.faces)).toEqual([front.id]);
  expect(a.faces[back.id]).toBeUndefined();
  expect(a.surfacePatches.length).toBeGreaterThan(4);
  const box = await page.locator("#viewer").boundingBox(),
    camera = new THREE.PerspectiveCamera(38, box.width / box.height, 0.01, 100);
  camera.position.fromArray(d.camera.position);
  camera.lookAt(new THREE.Vector3().fromArray(d.camera.target));
  camera.updateMatrixWorld();
  const matrix = new THREE.Matrix4().fromArray(front.matrixWorld);
  for (const patch of a.surfacePatches)
    for (const vertex of patch.vertices) {
      const v = new THREE.Vector3()
        .fromArray(vertex)
        .applyMatrix4(matrix)
        .project(camera);
      const x = box.x + ((v.x + 1) * box.width) / 2,
        y = box.y + ((1 - v.y) * box.height) / 2;
      expect(Math.abs(x - p.x)).toBeLessThan(38);
      expect(Math.abs(y - p.y)).toBeLessThan(38);
    }
});

test("temporary save failure keeps local edits, then retries without losing the stroke", async ({
  page,
}) => {
  await ready(page);
  await page.route("**/api/draft", (r) => r.abort());
  await page.getByRole("button", { name: "點標籤模式", exact: true }).click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toContainText("未同步");
  expect(await page.evaluate(() => window.__reviewDiagnostics().dirty)).toBe(
    true,
  );
  await page.unroute("**/api/draft");
  await page.getByRole("button", { name: /交畀 Agent/ }).click();
  await expect(page.locator("#feedback-status")).toContainText("已交到會話");
  const d = await page.evaluate(() => window.__reviewDiagnostics());
  expect(d.annotationCount).toBe(1);
  expect(d.dirty).toBe(false);
});

test("agent handoff sends true 3D patch data while keeping the model locked", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "畫筆模式", exact: true }).click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  await page.getByRole("button", { name: /交畀 Agent/ }).click();
  await expect(page.locator("#feedback-status")).toContainText("已交到會話");
  const s = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"))
    .submissions[0];
  expect(s.annotations[0].surfacePatches.length).toBeGreaterThan(0);
  expect(s.meshManifest.meshes[0].surfaceAlgorithm).toBe(
    "midpoint-v1-edge0.07",
  );
  expect(s.model.sha256).toHaveLength(64);
  expect(await page.evaluate(() => window.__reviewDiagnostics().locked)).toBe(
    true,
  );
});

test("rejected geometry and stale revisions never replace valid saved annotations", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  const clientId = await page.evaluate(() =>
      sessionStorage.getItem("3d-review-client"),
    ),
    d = await page.evaluate(() => window.__reviewDiagnostics());
  const bad = await request("PUT", "draft", {
    versionId: d.versionId,
    clientId,
    revision: d.revision,
    annotations: [{ ...d.annotations[0], faceIndex: 999999 }],
    camera: null,
  });
  expect(bad.status).toBe(400);
  const stale = await request("PUT", "draft", {
    versionId: d.versionId,
    clientId,
    revision: 0,
    annotations: [],
    camera: null,
  });
  expect(stale.status).toBe(409);
  const data = await request("GET", `state?full=1&clientId=${clientId}`);
  expect(data.data.draft.annotations).toEqual(d.annotations);
});

test("compact viewport remains usable without page-wide horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 760, height: 1000 });
  await ready(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "畫筆模式", exact: true }).click();
  await expect(page.locator("#brush-size")).toBeVisible();
  await page.screenshot({
    path: path.resolve(
      "../../media/images/2026-09-09-3d-review-compact-tested.png",
    ),
    fullPage: true,
  });
});

test("real textured GLB, large mesh and STL load sequentially without retaining old GPU resources", async ({
  page,
}) => {
  test.setTimeout(120000);
  await ready(page);
  const metrics = [];
  for (const [file, name] of [
    ["TRex_Head_retopo.glb", "恐龍頭 · 重拓撲"],
    ["TRex_Head_baked.glb", "恐龍頭 · 高面數"],
    ["3dbenchy.stl", "STL 小船"],
  ]) {
    const t = Date.now();
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "scripts/reviewctl.mjs",
          "publish",
          `../../media/3d/${file}`,
          "--name",
          name,
          "--version",
          "format-check",
        ],
        { cwd: repo, env, encoding: "utf8" },
      ),
    );
    await expect
      .poll(
        () =>
          page.evaluate(() => window.__reviewDiagnostics().viewer.versionId),
        { timeout: 60000 },
      )
      .toBe(result.model.id);
    await expect(page.locator("#loading")).toBeHidden();
    const d = await page.evaluate(() => window.__reviewDiagnostics());
    expect(d.viewer.geometries).toBeLessThanOrEqual(d.viewer.meshes + 2);
    if (file.endsWith(".stl")) expect(d.viewer.textures).toBe(0);
    metrics.push({
      file,
      sourceTriangles: result.model.triangles,
      bytes: result.model.bytes,
      loadMs: Date.now() - t,
      ...d.viewer,
    });
    await page.screenshot({
      path: path.resolve(
        `../../media/images/2026-09-09-3d-review-real-${file.split(".")[0]}.png`,
      ),
      fullPage: true,
    });
  }
  fs.writeFileSync(
    path.join(dir, "model-metrics.json"),
    JSON.stringify(metrics, null, 2),
  );
  console.log("REAL MODEL METRICS", JSON.stringify(metrics));
});

test("an accepted feedback response lost in transit can be retried after refresh without a second delivery", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  let lost = false;
  await page.route("**/api/feedback", async (r) => {
    if (!lost) {
      lost = true;
      await r.fetch();
      await r.abort();
    } else await r.continue();
  });
  await page.getByRole("button", { name: /交畀 Agent/ }).click();
  await expect(page.locator("#toast")).toBeVisible();
  await page.unroute("**/api/feedback");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await page.getByRole("button", { name: /交畀 Agent/ }).click();
  await expect(page.locator("#feedback-status")).toContainText("已交到會話");
  const log = JSON.parse(
    fs.readFileSync(path.join(dir, "fake-gateway.json"), "utf8"),
  );
  expect(log.calls.filter((c) => c.method === "chat.send")).toHaveLength(1);
  const s = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"));
  expect(s.submissions).toHaveLength(1);
  expect(s.draft.annotations).toHaveLength(1);
});

test("chat retry keeps the original idempotency key after a lost acknowledgement", async ({
  page,
}) => {
  await ready(page);
  let lost = false;
  const ids = [];
  await page.route("**/api/chat", async (r) => {
    if (r.request().method() !== "POST") return r.continue();
    ids.push(r.request().postDataJSON().messageId);
    if (!lost) {
      lost = true;
      await r.fetch();
      await r.abort();
    } else await r.continue();
  });
  await page
    .locator("#chat-input")
    .fill("一號位置請收幼少少，先說明你點理解。");
  await page.getByRole("button", { name: "發送修改說明", exact: true }).click();
  await expect(page.locator("#chat-error")).toBeVisible();
  await expect(page.locator("#chat-input")).not.toHaveValue("");
  await page.getByRole("button", { name: "發送修改說明", exact: true }).click();
  await expect(page.locator("#chat-input")).toHaveValue("");
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  const log = JSON.parse(
    fs.readFileSync(path.join(dir, "fake-gateway.json"), "utf8"),
  );
  expect(log.messages.filter((m) => m.role === "user")).toHaveLength(1);
});

test("a lost draft acknowledgement replays its exact write before saving a newer edit", async ({
  page,
}) => {
  await ready(page);
  const writes = [];
  await page.route("**/api/draft", async (route) => {
    writes.push(route.request().postDataJSON());
    if (writes.length === 1) {
      await route.fetch();
      return route.abort();
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "點標籤模式", exact: true }).click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toContainText("未同步");
  await page.mouse.click(p.x + 8, p.y + 8);
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  expect(writes[1]).toEqual(writes[0]);
  expect(writes.at(-1).annotations).toHaveLength(2);
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  );
  expect(saved.draft.annotations).toHaveLength(2);
  expect(saved.draft.revision).toBe(2);
});

test("refresh recovers newer local edits after an acknowledged-on-server draft lost its response", async ({
  page,
}) => {
  await ready(page);
  let writes = 0;
  await page.route("**/api/draft", async (route) => {
    if (++writes === 1) await route.fetch();
    return route.abort();
  });
  await page.getByRole("button", { name: "點標籤模式", exact: true }).click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toContainText("未同步");
  await page.mouse.click(p.x + 8, p.y + 8);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(2);
  await expect(page.locator("#save-status")).toContainText("未同步");
  const before = await page.evaluate(
    () => window.__reviewDiagnostics().annotations,
  );
  await page.unroute("**/api/draft");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(before);
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  );
  expect(saved.draft.annotations).toEqual(before);
  expect(saved.draft.revision).toBe(2);
});

test("a failed model download automatically retries and only enables editing after a verified load", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/models/*", async (route) => {
    if (++attempts === 1) return route.abort();
    return route.continue();
  });
  await ready(page);
  expect(attempts).toBe(2);
  await pin(page);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().viewer.versionId),
  ).toBe((await request("GET", "state")).data.active.id);
});

test("resuming a closed tab restores its unsynced local draft instead of replacing it with the older server draft", async ({
  page,
  context,
}) => {
  await ready(page);
  await page.route("**/api/draft", (route) => route.abort());
  await page.getByRole("button", { name: "點標籤模式", exact: true }).click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toContainText("未同步");
  const before = await page.evaluate(
    () => window.__reviewDiagnostics().annotations,
  );
  await page.close();
  const replacement = await context.newPage();
  await replacement.goto(url);
  await expect(replacement.locator("#loading")).toBeHidden();
  await expect(replacement.locator("#resume-banner")).toBeVisible();
  await replacement.waitForTimeout(31000);
  await replacement
    .getByRole("button", { name: "接續已保存草稿", exact: true })
    .click();
  await expect(replacement.locator("#save-status")).toHaveText("草稿已保存");
  expect(
    await replacement.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(before);
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  );
  expect(saved.draft.annotations).toEqual(before);
  await replacement.close();
});

test("a truly divergent cached draft is durably backed up before new edits can replace the active cache", async ({
  page,
}) => {
  await ready(page);
  await page.route("**/api/draft", (route) => route.abort());
  await page.getByRole("button", { name: "點標籤模式", exact: true }).click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toContainText("未同步");
  const before = await page.evaluate(() => window.__reviewDiagnostics());
  const clientId = await page.evaluate(() =>
    sessionStorage.getItem("3d-review-client"),
  );
  const different = [{ ...before.annotations[0], color: "#629bd8" }];
  expect(
    (
      await request("PUT", "draft", {
        versionId: before.versionId,
        clientId,
        revision: before.revision,
        annotations: different,
        camera: before.camera,
      })
    ).status,
  ).toBe(200);
  await page.unroute("**/api/draft");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#recovery-banner")).toBeVisible();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(different);
  await page.getByRole("button", { name: "點標籤模式", exact: true }).click();
  await page.mouse.click(p.x + 8, p.y + 8);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(2);
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  const backup = await page.evaluate((versionId) => {
    const key = localStorage.getItem(
      `3d-review-draft-${versionId}-recovery-latest`,
    );
    return JSON.parse(localStorage.getItem(key));
  }, before.versionId);
  expect(backup.versionId).toBe(before.versionId);
  expect(backup.annotations[0].color).toBe(before.annotations[0].color);
  expect(backup.pendingWrite.annotations).toEqual(backup.annotations);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#download-recovery")).toBeVisible();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(2);
});
