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
    page.getByRole("button", { name: "檢視及標籤", exact: true }),
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
  await page.getByRole("button", { name: "檢視及標籤", exact: true }).click();
  const p = await point(page);
  await page.mouse.dblclick(p.x, p.y);
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
    REVIEW_DIST_DIR: path.join(repo, "tmp/refinement-dist"),
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

test("actual double click creates a surface pin; refresh restores it and geometry ownership", async ({
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
      "../../media/images/2026-09-09-3d-review-v02-pin-tested.png",
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
      "../../media/images/2026-09-09-3d-review-v02-brush-tested.png",
    ),
    fullPage: true,
  });
  await page.getByRole("button", { name: "刪除紅色區域", exact: true }).click();
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
      "../../media/images/2026-09-09-3d-review-v02-figurine-tested.png",
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
    other.getByRole("button", { name: "檢視及標籤", exact: true }),
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
      expect(Math.hypot(x - p.x, y - p.y)).toBeLessThanOrEqual(22.001);
    }
});

test("temporary save failure keeps local edits, then retries without losing the stroke", async ({
  page,
}) => {
  await ready(page);
  await page.route("**/api/draft", (r) => r.abort());
  await page.getByRole("button", { name: "檢視及標籤", exact: true }).click();
  const p = await point(page);
  await page.mouse.dblclick(p.x, p.y);
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
  expect(s.annotations[0].coverage).toBe("brush-v1");
  const sent = JSON.parse(
    fs.readFileSync(path.join(dir, "fake-gateway.json"), "utf8"),
  ).calls.find((c) => c.method === "chat.send");
  expect(sent.params.message).toContain("不是編號點標籤");
  expect(sent.params.deliver).toBe(false);
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
      "../../media/images/2026-09-09-3d-review-v02-compact-tested.png",
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
        `../../media/images/2026-09-09-3d-review-v02-real-${file.split(".")[0]}.png`,
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

test("review page has no conversation copy, history polling or second message input", async ({
  page,
}) => {
  const calls = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/chat")) calls.push(r.url());
  });
  await ready(page);
  await expect(
    page.locator("#chat-input, #chat-messages, .chat-panel"),
  ).toHaveCount(0);
  await page.waitForTimeout(5300);
  expect(calls).toEqual([]);
  expect(
    (
      await request("POST", "chat", {
        message: "must not deliver",
        messageId: "disabled-chat",
      })
    ).status,
  ).toBe(410);
  expect(fs.existsSync(path.join(dir, "fake-gateway.json"))).toBe(false);
});

test("drag rotates and single click does nothing; double click adds exactly one pin without tool switching", async ({
  page,
}) => {
  await ready(page);
  const p = await point(page);
  const before = await page.evaluate(() => window.__reviewDiagnostics().camera);
  await page.mouse.click(p.x, p.y);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(0);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 45, p.y + 20, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const moved = await page.evaluate(() => window.__reviewDiagnostics());
  expect(moved.annotationCount).toBe(0);
  expect(moved.camera).not.toEqual(before);
  await page.getByRole("button", { name: "重設視角", exact: true }).click();
  await page.mouse.dblclick(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  const saved = await page.evaluate(() => window.__reviewDiagnostics().camera);
  await page.waitForTimeout(150);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().camera),
  ).toEqual(saved);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(1);
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
  await page.getByRole("button", { name: "檢視及標籤", exact: true }).click();
  const p = await point(page);
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.locator("#save-status")).toContainText("未同步");
  await page.mouse.dblclick(p.x + 8, p.y + 8);
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
  await page.getByRole("button", { name: "檢視及標籤", exact: true }).click();
  const p = await point(page);
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.locator("#save-status")).toContainText("未同步");
  await page.mouse.dblclick(p.x + 8, p.y + 8);
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
  await page.getByRole("button", { name: "檢視及標籤", exact: true }).click();
  const p = await point(page);
  await page.mouse.dblclick(p.x, p.y);
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
  await page.getByRole("button", { name: "檢視及標籤", exact: true }).click();
  const p = await point(page);
  await page.mouse.dblclick(p.x, p.y);
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
  await page.getByRole("button", { name: "檢視及標籤", exact: true }).click();
  await page.mouse.dblclick(p.x + 8, p.y + 8);
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

test("small brush rendered pixels follow the circular cursor instead of filling whole faces", async ({
  page,
}) => {
  publish("occlusion-check.glb", "pixel-check");
  await ready(page);
  await page.getByRole("button", { name: "畫筆模式", exact: true }).click();
  await page.locator("#brush-size").fill("6");
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  await page.mouse.move(5, 5);
  const png = await page.screenshot();
  const data = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `
import sys,io,json,math
from PIL import Image
im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGB')
x,y=map(float,sys.argv[1:])
points=[]
for b in range(int(y)-50,int(y)+51):
 for a in range(int(x)-50,int(x)+51):
  r,g,v=im.getpixel((a,b))
  if r>180 and r>g*1.35 and r>v*1.35:points.append(math.hypot(a+0.5-x,b+0.5-y))
print(json.dumps({'count':len(points),'radius':max(points,default=0)}))
`,
        String(p.x),
        String(p.y),
      ],
      { input: png, encoding: "utf8" },
    ),
  );
  expect(data.count).toBeGreaterThan(60);
  expect(data.radius).toBeLessThan(7.5);
});

test("legacy pins and paint fixture restore unchanged alongside new precise strokes", async ({
  page,
}) => {
  await ready(page);
  const legacy = JSON.parse(
    fs.readFileSync("tests/fixtures/legacy-review.json", "utf8"),
  );
  const d = await page.evaluate(() => window.__reviewDiagnostics());
  const clientId = await page.evaluate(() =>
    sessionStorage.getItem("3d-review-client"),
  );
  const owner = { versionId: d.versionId, clientId };
  expect((await request("POST", "review/begin", owner)).status).toBe(200);
  expect(
    (
      await request("PUT", "draft", {
        ...owner,
        revision: 0,
        annotations: legacy.annotations,
        camera: legacy.camera,
      })
    ).status,
  ).toBe(200);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(legacy.annotations);
  await expect(page.locator(".model-pin")).toHaveCount(2);
  await expect(page.locator(".annotation-badge").nth(2)).toHaveText("");
  await page.getByRole("button", { name: "重設視角", exact: true }).click();
  await page.getByRole("button", { name: "畫筆模式", exact: true }).click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(4);
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  const after = await page.evaluate(() => window.__reviewDiagnostics());
  expect(after.annotations.slice(0, 3)).toEqual(legacy.annotations);
  expect(after.annotations[3].coverage).toBe("brush-v1");
});

test("narrow embedded review fixture remains interactive without a duplicated conversation", async ({
  page,
}) => {
  await page.route(`${url}/host-fixture`, (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<style>body{margin:0;display:flex}aside{flex:1}iframe{width:460px;height:850px;border:0}</style><aside>Original conversation fixture — not Control UI</aside><iframe name="review" src="${url}/"></iframe>`,
    }),
  );
  await page.goto(`${url}/host-fixture`);
  const frame = page.frame({ name: "review" });
  await expect(frame.locator("#loading")).toBeHidden();
  expect(
    await frame.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(frame.locator("#chat-input")).toHaveCount(0);
  const box = await frame.locator("#viewer").boundingBox();
  await page.mouse.dblclick(
    box.x + box.width * 0.55,
    box.y + box.height * 0.45,
  );
  await expect
    .poll(() =>
      frame.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(frame.locator("#save-status")).toHaveText("草稿已保存");
  await frame.getByRole("button", { name: /交畀 Agent/ }).click();
  await expect(frame.locator("#feedback-status")).toContainText("已交到會話");
});

test("paint mode supports temporary Option navigation and does not consume point label numbers", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "畫筆模式", exact: true }).click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  const before = await page.evaluate(() => window.__reviewDiagnostics());
  await page.keyboard.down("Alt");
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 30, p.y + 12, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const after = await page.evaluate(() => window.__reviewDiagnostics());
  expect(after.annotations).toEqual(before.annotations);
  expect(after.camera).not.toEqual(before.camera);
  await page.getByRole("button", { name: "重設視角", exact: true }).click();
  await page.getByRole("button", { name: "檢視及標籤", exact: true }).click();
  await page.mouse.dblclick(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(2);
  const annotations = await page.evaluate(
    () => window.__reviewDiagnostics().annotations,
  );
  expect(annotations.find((a) => a.type === "pin").label).toBe("1");
});

test("medium and wide review layouts do not retain an empty chat column", async ({
  page,
}) => {
  await ready(page);
  for (const width of [900, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const box = await page.locator(".review-panel").boundingBox();
    expect(box.width).toBeGreaterThan(width * 0.95);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
