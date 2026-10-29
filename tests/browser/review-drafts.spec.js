import { clickControl } from "./r12-b-helpers.mjs";
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "./fixtures.mjs";
import {
  useReviewServer,
  browserUrl,
  dir,
  request,
  fetchThroughFixture,
  publish,
  ready,
  point,
  pin,
} from "./review-fixture.mjs";

/* Saving and recovering a draft: failed and lost writes, other tabs,
   cached and backed-up drafts, legacy fixtures and version switches. */
useReviewServer();

test("a second browser tab cannot overwrite another tab’s active work", async ({
  page,
  context,
}) => {
  await ready(page);
  await pin(page);
  const other = await context.newPage();
  await other.goto(browserUrl);
  await expect(other.locator("#loading")).toBeHidden();
  // A second tab is never locked out — it picks up the same draft and may mark.
  // Clobbering is prevented by the draft revision check, which is the only
  // guard that actually knows whether two edits conflict.
  await expect(other.locator('[data-mode="label"]')).toBeEnabled();
  await expect
    .poll(() => other.evaluate(() => window.__reviewDiagnostics().owned))
    .toBe(true);
  expect(
    await other.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(1);
  // The tab that lost presence is told another window is here.
  await expect(page.locator("#resume-banner")).toBeVisible();
  await clickControl(other, '[data-mode="label"]');
  const q = await point(other, 12, 12);
  await other.mouse.click(q.x, q.y);
  await expect
    .poll(() =>
      other.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(2);
  await expect(other.locator("#save-status")).toHaveText("Draft saved");
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  );
  expect(saved.drafts[saved.active.id].annotations).toHaveLength(2);
  expect(saved.drafts[saved.active.id].revision).toBe(2);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(1);
  await other.close();
});

/* The bucket crosses a connected surface on purpose, including round the back
   of it, so "only what you can see" was the brush's rule and left with it. What
   is still true, and is what this now pins, is that a fill stays on the mesh it
   was clicked: it walks one mesh's topology and cannot step onto a different
   object standing behind.

   The second half is the assertion this release exists for. A fill claims whole
   source faces, and a whole face is stored as its number alone — so a mark made
   by the bucket carries no coordinates at all. Coordinates were 142 bytes per
   face spent saying a second time what the face number already said, and for a
   whole release nothing in this suite would have noticed them come back. */

test("temporary save failure keeps local edits, then retries without losing the stroke", async ({
  page,
}) => {
  await ready(page);
  await page.route("**/api/draft", (r) => r.abort());
  await clickControl(page, '[data-mode="label"]');
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toContainText("Not synced");
  expect(await page.evaluate(() => window.__reviewDiagnostics().dirty)).toBe(
    true,
  );
  await page.unroute("**/api/draft");
  await page.getByRole("button", { name: /Send to Agent/ }).click();
  await expect(page.locator("#feedback-status")).toContainText(
    "delivered to the original conversation",
  );
  const d = await page.evaluate(() => window.__reviewDiagnostics());
  expect(d.annotationCount).toBe(1);
  expect(d.dirty).toBe(false);
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

test("a lost draft acknowledgement replays its exact write before saving a newer edit", async ({
  page,
}) => {
  await ready(page);
  const writes = [];
  await page.route("**/api/draft", async (route) => {
    writes.push(route.request().postDataJSON());
    if (writes.length === 1) {
      await fetchThroughFixture(route);
      return route.abort();
    }
    return route.continue();
  });
  await clickControl(page, '[data-mode="label"]');
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toContainText("Not synced");
  await page.mouse.click(p.x + 8, p.y + 8);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  expect(writes[1]).toEqual(writes[0]);
  expect(writes.at(-1).annotations).toHaveLength(2);
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  );
  expect(saved.drafts[saved.active.id].annotations).toHaveLength(2);
  expect(saved.drafts[saved.active.id].revision).toBe(2);
});

test("refresh recovers newer local edits after an acknowledged-on-server draft lost its response", async ({
  page,
}) => {
  await ready(page);
  let writes = 0;
  await page.route("**/api/draft", async (route) => {
    if (++writes === 1) await fetchThroughFixture(route);
    return route.abort();
  });
  await clickControl(page, '[data-mode="label"]');
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toContainText("Not synced");
  await page.mouse.click(p.x + 8, p.y + 8);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(2);
  await expect(page.locator("#save-status")).toContainText("Not synced");
  const before = await page.evaluate(
    () => window.__reviewDiagnostics().annotations,
  );
  await page.unroute("**/api/draft");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(before);
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  );
  expect(saved.drafts[saved.active.id].annotations).toEqual(before);
  expect(saved.drafts[saved.active.id].revision).toBe(2);
});

test("resuming a closed tab restores its unsynced local draft instead of replacing it with the older server draft", async ({
  page,
  context,
}) => {
  await ready(page);
  await page.route("**/api/draft", (route) => route.abort());
  await clickControl(page, '[data-mode="label"]');
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toContainText("Not synced");
  const before = await page.evaluate(
    () => window.__reviewDiagnostics().annotations,
  );
  await page.close();
  const replacement = await context.newPage();
  await replacement.goto(browserUrl);
  await expect(replacement.locator("#loading")).toBeHidden();
  // No banner and no waiting out a stale lock: the round was never withheld,
  // so the new tab takes it on load and its unsynced local draft still wins.
  await expect(replacement.locator("#resume-banner")).toBeHidden();
  await expect
    .poll(() => replacement.evaluate(() => window.__reviewDiagnostics().owned))
    .toBe(true);
  await expect(replacement.locator("#save-status")).toHaveText("Draft saved");
  expect(
    await replacement.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(before);
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  );
  expect(saved.drafts[saved.active.id].annotations).toEqual(before);
  await replacement.close();
});

test("a truly divergent cached draft is durably backed up before new edits can replace the active cache", async ({
  page,
}) => {
  await ready(page);
  await page.route("**/api/draft", (route) => route.abort());
  await clickControl(page, '[data-mode="label"]');
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toContainText("Not synced");
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
  await clickControl(page, '[data-mode="label"]');
  await page.mouse.click(p.x + 8, p.y + 8);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(2);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const backup = await page.evaluate(() => {
    const key = localStorage.getItem(
      `${window.__reviewDiagnostics().draftCacheKey}-recovery-latest`,
    );
    return JSON.parse(localStorage.getItem(key));
  });
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

test("legacy pins and paint fixture restore unchanged alongside a new fill", async ({
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
  const regionBadge = page.locator(".annotation-badge").nth(2);
  await expect(regionBadge).toHaveText("");
  await expect(regionBadge).toHaveClass(/region-badge/);
  await expect(regionBadge).toHaveCSS("height", "20px");
  await expect(regionBadge).toHaveCSS("border-radius", "10px");
  await page.locator("#home-view").click();
  await clickControl(page, '[data-mode="fill"]');
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(4);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const after = await page.evaluate(() => window.__reviewDiagnostics());
  /* The three restored marks come back byte for byte in the format they were
     written in — that is the whole point of the fixture — while the new one
     beside them is written in the current format. Both live in one draft. */
  expect(after.annotations.slice(0, 3)).toEqual(legacy.annotations);
  expect(after.annotations[3].coverage).toBe("source-v2");
  expect(after.annotations[3].surfacePatches).toEqual([]);
});

test("LAN HTTP: real insecure origin can verify models, create IDs and save annotations", async ({
  page,
}) => {
  test.skip(!process.env.REVIEW_BROWSER_ORIGIN, "LAN origin run only");
  await ready(page);
  const capabilities = await page.evaluate(() => ({
    secure: isSecureContext,
    uuid: typeof crypto.randomUUID,
    digest: typeof crypto.subtle?.digest,
  }));
  expect(capabilities).toEqual({
    secure: false,
    uuid: "undefined",
    digest: "undefined",
  });
  await pin(page);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#annotation-count")).toHaveText("1");
});

test("switching versions reports its own cost, sweeps dead draft caches and keeps recovery backups", async ({
  page,
}) => {
  await ready(page);
  const first = await page.evaluate(
    () => window.__reviewDiagnostics().versionId,
  );
  const next = publish("bunny-figurine.glb", "v2");
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(next.model.id);
  // Every version keeps its own cached draft and every new review generation
  // starts another set, so the keys only accumulate — and running out of quota
  // is what puts the page into the mode that stops editing to protect an
  // unsynced draft. A cache the server already holds costs a reload to rebuild;
  // one with unsaved work, and any backup written because work was at risk,
  // has to survive however stale it looks.
  const seeded = await page.evaluate(
    (live) => {
      const spent = `3d-review-draft-oldversion-${live.reviewId}`;
      const unsynced = "3d-review-draft-oldversion-earlier-review";
      localStorage.setItem(spent, JSON.stringify({ dirty: false }));
      localStorage.setItem(unsynced, JSON.stringify({ dirty: true }));
      localStorage.setItem(`${live.draftCacheKey}-recovery-kept`, "{}");
      return { spent, unsynced, kept: `${live.draftCacheKey}-recovery-kept` };
    },
    await page.evaluate(() => window.__reviewDiagnostics()),
  );
  await page.locator(`.version-tab[data-version-id="${first}"]`).click();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(first);
  expect(
    await page.evaluate((k) => localStorage.getItem(k), seeded.spent),
  ).toBeNull();
  for (const key of [seeded.unsynced, seeded.kept])
    expect(
      await page.evaluate((k) => localStorage.getItem(k), key),
    ).not.toBeNull();
  // The mesh budget is still measured and still reported here; since 1.0.0 it
  // warns nobody, because marking reads the source topology and does not care
  // whether the review mesh got to subdivide.
  const precision = await page.evaluate(
    () => window.__reviewDiagnostics().precision,
  );
  expect(precision.rationed).toBe(false);
  expect(precision.wanted).toBeLessThanOrEqual(precision.budget);
  expect(await page.locator("#precision-banner").count()).toBe(0);
});
