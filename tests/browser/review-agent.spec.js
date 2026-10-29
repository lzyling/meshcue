import { clickControl } from "./r12-b-helpers.mjs";
import { expectCameraUnchanged } from "./camera-assertions.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fetchLoadedModel, loadedModelDisposition } from "./loaded-model.mjs";
import { test, expect } from "./fixtures.mjs";
import {
  useReviewServer,
  repo,
  browserUrl,
  dir,
  env,
  request,
  fetchThroughFixture,
  publish,
  ready,
  point,
  pin,
} from "./review-fixture.mjs";

/* The Agent's side of a round: new versions arriving, handoff, delivery,
   read receipts and echoes, the version strip, and model downloads. */
useReviewServer();

test("a new Agent model takes the screen at once and the marked one stays a tab", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  const original = await page.evaluate(
    () => window.__reviewDiagnostics().versionId,
  );
  const next = publish("bunny-figurine.glb", "v2");
  expect(next.status).toBe("active");
  // Presentation is the Agent's to drive. The reviewer loses nothing by it:
  // the marked version keeps its own draft and is one tab away.
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(next.model.id);
  await expect(page.locator("#version-tabs")).toBeVisible();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(0);
  await page.locator(`.version-tab[data-version-id="${original}"]`).click();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(original);
  await expect(page.locator("#pending-banner")).toBeHidden();
  await expect(page.locator("#review-status")).toBeHidden();
  // versionId is assigned before mesh loading and async draft restoration.
  // Hidden status banners do not mean that restoration has completed.
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await page.getByRole("button", { name: /Send to Agent/ }).click();
  await expect(page.locator("#feedback-status")).toContainText(
    "delivered to the original conversation",
  );
  const log = JSON.parse(
    fs.readFileSync(path.join(dir, "fake-gateway.json"), "utf8"),
  );
  const send = log.calls.find((c) => c.method === "chat.send");
  expect(send.params.deliver).toBe(false);
  // The batch names the version it was made against, which is the whole point
  // of being able to go back: an older marking is not an ambiguous one.
  expect(send.params.message).toContain(original);
  expect(send.params.message).toContain(
    "not an instruction to change anything",
  );
  // The round is not closed here, because closing it is not a thing a reviewer
  // does: he hands the batch over and walks onto whatever the Agent publishes
  // next. The submission below was made by handing over, not by finishing.
  await expect(page.locator("#loading")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Show the latest version", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(`.version-tab[data-version-id="${next.model.id}"]`)
    .click();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(next.model.id);
  const state = await request("GET", "state");
  expect(state.data.submissions).toHaveLength(1);
  expect(state.data.submissions[0].versionId).toBe(original);
  await page.screenshot({
    path: path.resolve(
      path.join(dir, "2026-09-09-3d-review-v02-figurine-tested.png"),
    ),
    fullPage: true,
  });
});

test("agent handoff sends true 3D patch data while keeping the model locked", async ({
  page,
}) => {
  await ready(page);
  await clickControl(page, '[data-mode="fill"]');
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  await page.getByRole("button", { name: /Send to Agent/ }).click();
  await expect(page.locator("#feedback-status")).toContainText(
    "delivered to the original conversation",
  );
  const s = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"))
    .submissions[0];
  // state.json keeps the receipt; the annotations live only in the immutable
  // per-submission file, which is the copy reviewctl read actually serves.
  expect(Object.hasOwn(s, "annotations")).toBe(false);
  const stored = JSON.parse(
    fs.readFileSync(path.join(dir, "submissions", `${s.id}.json`), "utf8"),
  );
  /* A fill's extent is the faces it claims. It carries no polygons, which is
     what `source-v2` is: the submission the agent reads is the compact form,
     not a materialised copy of it. */
  expect(stored.annotations[0].coverage).toBe("source-v2");
  expect(stored.annotations[0].surfacePatches).toEqual([]);
  expect(
    Object.values(stored.annotations[0].faces).flat().length,
  ).toBeGreaterThan(0);
  const sent = JSON.parse(
    fs.readFileSync(path.join(dir, "fake-gateway.json"), "utf8"),
  ).calls.find((c) => c.method === "chat.send");
  expect(sent.params.message).toContain("not a lettered pin");
  expect(sent.params.deliver).toBe(false);
  expect(s.meshManifest.meshes[0].surfaceAlgorithm).toBe(
    "midpoint-v3-edge0.07-rationed",
  );
  expect(s.model.sha256).toHaveLength(64);
  // Only tab present, so nothing reads as held by someone else; the round is
  // still open, which capabilities report rather than the presence flag.
  expect(await page.evaluate(() => window.__reviewDiagnostics().locked)).toBe(
    false,
  );
  expect(
    await page.evaluate(
      () => window.__reviewDiagnostics().capabilities.canFinish,
    ),
  ).toBe(true);
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
      await fetchThroughFixture(r);
      await r.abort();
    } else await r.continue();
  });
  await page.getByRole("button", { name: /Send to Agent/ }).click();
  await expect(page.locator("#toast")).toBeVisible();
  await page.unroute("**/api/feedback");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await page.getByRole("button", { name: /Send to Agent/ }).click();
  await expect(page.locator("#feedback-status")).toContainText(
    "delivered to the original conversation",
  );
  const log = JSON.parse(
    fs.readFileSync(path.join(dir, "fake-gateway.json"), "utf8"),
  );
  expect(log.calls.filter((c) => c.method === "chat.send")).toHaveLength(1);
  const s = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"));
  expect(s.submissions).toHaveLength(1);
  expect(s.drafts[s.active.id].annotations).toHaveLength(1);
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

test("bytes that are not the announced version stop the page rather than looping it", async ({
  page,
}) => {
  let served = 0;
  await page.route("**/api/models/*", (route) => {
    served++;
    /* Delivered, readable and simply not this version — the one failure a
       second attempt cannot change. The retry above is deliberate and stays;
       telling the two apart is the whole point, because a load that ends here
       drops the version the page was holding, and the poll exists to load
       whatever the page is not holding. */
    return route.fulfill({
      status: 200,
      contentType: "model/gltf-binary",
      body: Buffer.from("these are not the bytes that were published"),
    });
  });
  await page.goto(browserUrl);
  await expect(page.locator("#loading-text")).toHaveText(
    /does not match the version/,
  );
  await expect(page.locator("#loading .spinner")).toBeHidden();
  expect(served).toBe(1);

  // Three poll intervals: long enough that a page still trying would have tried
  // again, and would also have replaced the reason above with its own spinner.
  await page.waitForTimeout(2200 * 3);
  expect(served).toBe(1);
  await expect(page.locator("#loading-text")).toHaveText(
    /does not match the version/,
  );
  await expect(page.locator('[data-mode="label"]')).toBeDisabled();
});

test("iteration: explicit Agent read receipt and separate echo survive corrections without moving the camera", async ({
  page,
}) => {
  await ready(page);
  await clickControl(page, '[data-mode="fill"]');
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  await page.getByRole("button", { name: /Send to Agent/ }).click();
  await expect(page.locator("#feedback-status")).toContainText(
    "delivered to the original conversation",
  );
  await expect(page.locator("#feedback-status")).not.toContainText(
    "the Agent has read it",
  );
  const receipt = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  ).submissions[0];
  const submission = JSON.parse(
    fs.readFileSync(
      path.join(dir, "submissions", `${receipt.id}.json`),
      "utf8",
    ),
  );
  execFileSync(
    process.execPath,
    ["scripts/reviewctl.mjs", "read", submission.id],
    { cwd: repo, env, stdio: "pipe" },
  );
  await expect(page.locator("#feedback-status")).toContainText(
    "the Agent has read it",
  );
  const before = await page.evaluate(() => window.__reviewDiagnostics());
  const file = path.join(dir, "echo.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      submissionId: submission.id,
      versionId: submission.versionId,
      summary: "測試指定範圍",
      annotations: submission.annotations,
    }),
  );
  execFileSync(process.execPath, ["scripts/reviewctl.mjs", "echo", file], {
    cwd: repo,
    env,
    stdio: "pipe",
  });
  await expect(page.locator("#echo-panel")).toBeVisible();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(before.annotations);
  expectCameraUnchanged(
    await page.evaluate(() => window.__reviewDiagnostics().camera),
    before.camera,
  );
  await clickControl(page, "#toggle-marks");
  expect(
    await page.evaluate(
      () => window.__reviewDiagnostics().viewer.annotationsVisible,
    ),
  ).toBe(false);
  expect(
    JSON.parse(
      fs.readFileSync(
        path.join(dir, "submissions", submission.id + ".json"),
        "utf8",
      ),
    ).annotations,
  ).toEqual(submission.annotations);
});

test("iteration: current-version download is original bytes, including after neutral view and a queued replacement", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  const stateBefore = (await request("GET", "state")).data;
  await clickControl(page, "#neutral-view");
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().viewer.neutral),
  ).toBe(true);
  const next = publish("bunny-figurine.glb", "newer");
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(next.model.id);
  // Going back to the marked version must download that version's bytes, not
  // whichever one the Agent happens to be showing.
  await page
    .locator(`.version-tab[data-version-id="${stateBefore.active.id}"]`)
    .click();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(stateBefore.active.id);
  // The page has no download control any more — a reviewer who wants the file
  // asks the Agent for it in the conversation. The service still serves the
  // bytes, and the version named on screen still has to be the version those
  // bytes belong to, which is the part worth asserting.
  const served = await fetchLoadedModel(page);
  const { createHash } = await import("node:crypto");
  expect(createHash("sha256").update(served).digest("hex")).toBe(
    stateBefore.active.sha256,
  );
  expect(await loadedModelDisposition(page)).toContain(
    stateBefore.active.version,
  );
  // `versionId` turns over when the load begins; the version's draft comes
  // back once its model has loaded. Counted at once, a busy run caught the gap
  // between the two and read 0 (09-29, full suite; alone it passed 3 of 3).
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
});

test("iteration: superseded unsubmitted model is still served to the current view", async ({
  page,
}) => {
  await ready(page);
  const current = (await request("GET", "state")).data.active;
  await page.route("**/api/state**", (route) => route.abort());
  publish("bunny-figurine.glb", "v2");
  // Publishing does not retract what a reviewer is still looking at. The page
  // stopped offering the file, but the Agent can be asked for it, and the
  // service must still have the superseded bytes to give.
  const served = await fetchLoadedModel(page);
  const { createHash } = await import("node:crypto");
  expect(createHash("sha256").update(served).digest("hex")).toBe(
    current.sha256,
  );
});

test("iteration: the version beside the name is the one the service is running", async ({
  page,
}) => {
  await ready(page);
  const running = (await request("GET", "health")).data.version;
  expect(running).not.toBe("unknown");
  // Asking what you are looking at is a question about the service, not about
  // the build this tab happened to be cut from.
  await expect(page.locator("#app-version")).toHaveText(running);
  // It sits with the name rather than in a framed slot of its own.
  await expect(page.locator(".brand-title #app-version")).toBeVisible();
  expect(await page.locator(".prototype").count()).toBe(0);
});

test("many versions stay on one row, and the one being marked stays reachable", async ({
  page,
}) => {
  await ready(page);
  // Kelven's XR housing session reached seventeen published versions in an
  // afternoon and the strip had been wrapping onto a second row since about the
  // tenth, taking that row out of the model's height for the rest of the day.
  // Versions are identified by the hash of their bytes, so republishing one
  // sample seventeen times is one version. Each variant rewrites the generator
  // string in the GLB header — same length, same geometry, different file.
  const sample = fs.readFileSync("tmp/samples/parametric-bracket.glb");
  const generator = Buffer.from("THREE.GLTFExporter");
  const at = sample.indexOf(generator);
  expect(at).toBeGreaterThan(0);
  for (let i = 2; i <= 17; i++) {
    const bytes = Buffer.from(sample);
    Buffer.from(`MeshCueStripTest${String(i).padStart(2, "0")}`).copy(
      bytes,
      at,
    );
    const file = path.join(dir, `strip-${i}.glb`);
    fs.writeFileSync(file, bytes);
    execFileSync(
      process.execPath,
      [
        "scripts/reviewctl.mjs",
        "publish",
        file,
        "--name",
        "參數支架",
        "--version",
        `v0.${i} · 15mm鳍片爆炸`,
      ],
      { cwd: repo, env, encoding: "utf8" },
    );
  }
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().versions.length),
    )
    .toBe(17);
  const strip = page.locator("#version-tabs");
  /* The strip is drawn a tick after the state that describes it, so waiting on
     the state alone measured an empty bar and called it one row. Wait for the
     tabs themselves; the row count is only meaningful once they are there. */
  await expect(strip.locator(".version-tab")).toHaveCount(17);
  const rows = await strip.evaluate((bar) => {
    const tops = new Set(
      [...bar.querySelectorAll(".version-tab")].map((t) =>
        Math.round(t.getBoundingClientRect().top),
      ),
    );
    return tops.size;
  });
  expect(rows).toBe(1);
  // One row is only worth having if it still shows where you are. The version
  // being marked is the last one published, so it starts off the right edge.
  await expect
    .poll(() =>
      strip.evaluate((bar) => {
        const tab = bar.querySelector(".version-tab.selected");
        const rail = bar.getBoundingClientRect(),
          seat = tab.getBoundingClientRect();
        return seat.left >= rail.left - 1 && seat.right <= rail.right + 1;
      }),
    )
    .toBe(true);
  await expect(strip).toHaveClass(/overflow-start/);
  // A plain wheel walks back along the strip; a mouse has no sideways one.
  await strip.hover();
  const startedAt = await strip.evaluate((bar) => bar.scrollLeft);
  expect(startedAt).toBeGreaterThan(0);
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, -600);
    if ((await strip.evaluate((bar) => bar.scrollLeft)) === 0) break;
  }
  await expect.poll(() => strip.evaluate((bar) => bar.scrollLeft)).toBe(0);
  await expect(strip).toHaveClass(/overflow-end/);
  await expect(strip).not.toHaveClass(/overflow-start/);
  // Switching versions must not be what a stuck scroll position looks like.
  const first = await strip.evaluate(
    (bar) => bar.querySelector(".version-tab").dataset.versionId,
  );
  await page.locator(`.version-tab[data-version-id="${first}"]`).click();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().versionId))
    .toBe(first);
  await expect
    .poll(() =>
      strip.evaluate((bar) => {
        const tab = bar.querySelector(".version-tab.selected");
        const rail = bar.getBoundingClientRect(),
          seat = tab.getBoundingClientRect();
        return seat.left >= rail.left - 1 && seat.right <= rail.right + 1;
      }),
    )
    .toBe(true);
});

/* Twenty versions is a wall of history in front of the model, and the reviewer
   asks the Agent for a shorter strip in the same conversation. Before this the
   only lever was editing state.json from outside the running server, which
   raced its saves — so it appeared to need the page closed first. Nothing here
   is closed, reloaded, or lost. */

test("the Agent can shorten the version strip while the page stays open", async ({
  page,
}) => {
  await ready(page);
  const sample = fs.readFileSync("tmp/samples/parametric-bracket.glb");
  const generator = Buffer.from("THREE.GLTFExporter");
  const at = sample.indexOf(generator);
  for (let i = 2; i <= 6; i++) {
    const bytes = Buffer.from(sample);
    Buffer.from(`MeshCueKeepTest${String(i).padStart(3, "0")}`).copy(bytes, at);
    const file = path.join(dir, `keep-${i}.glb`);
    fs.writeFileSync(file, bytes);
    execFileSync(
      process.execPath,
      ["scripts/reviewctl.mjs", "publish", file, "--version", `v0.${i}`],
      { cwd: repo, env, encoding: "utf8" },
    );
  }
  const shown = () =>
    page.evaluate(() =>
      window.__reviewDiagnostics().versions.map((v) => v.version),
    );
  await expect.poll(shown).toHaveLength(6);

  const viewing = await page.evaluate(() => {
    const d = window.__reviewDiagnostics();
    return d.versions.find((v) => v.id === d.versionId).version;
  });
  execFileSync(process.execPath, ["scripts/reviewctl.mjs", "retain", "3"], {
    cwd: repo,
    env,
    encoding: "utf8",
  });
  // The page polls; it is not told, not reloaded, and never closed.
  await expect.poll(async () => (await shown()).length).toBeLessThan(6);
  const kept = await shown();
  expect(kept).toEqual(expect.arrayContaining(["v0.4", "v0.5", "v0.6"]));
  expect(kept).not.toContain("v0.2");
  /* The version under the reviewer's eyes survives the rule — hiding what
     someone is looking at would be taking something away rather than tidying
     up behind them, so "the latest three" is four while they are still here. */
  expect(kept).toContain(viewing);

  // A rule, not a tidy-up: the next version keeps the promise by itself.
  const bytes = Buffer.from(sample);
  Buffer.from("MeshCueKeepTest777").copy(bytes, at);
  const file = path.join(dir, "keep-7.glb");
  fs.writeFileSync(file, bytes);
  execFileSync(
    process.execPath,
    ["scripts/reviewctl.mjs", "publish", file, "--version", "v0.7"],
    { cwd: repo, env, encoding: "utf8" },
  );
  await expect
    .poll(shown)
    .toEqual(expect.arrayContaining(["v0.5", "v0.6", "v0.7"]));
  expect(await shown()).not.toContain("v0.4");

  // Hidden is not gone: asking for all of them back returns every one.
  execFileSync(process.execPath, ["scripts/reviewctl.mjs", "retain", "0"], {
    cwd: repo,
    env,
    encoding: "utf8",
  });
  await expect.poll(shown).toHaveLength(7);
});

test("the Agent's understanding leaves on its own and comes back when asked", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  await page.getByRole("button", { name: /Send to Agent/ }).click();
  await expect(page.locator("#feedback-status")).toContainText(
    "delivered to the original conversation",
  );
  const receipt = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  ).submissions[0];
  execFileSync(
    process.execPath,
    ["scripts/reviewctl.mjs", "read", receipt.id],
    { cwd: repo, env, stdio: "pipe" },
  );
  const file = path.join(dir, "echo.json");
  // No annotations on purpose: an Agent that replies with words and no region is
  // what every echo in the real session looked like.
  fs.writeFileSync(
    file,
    JSON.stringify({
      submissionId: receipt.id,
      versionId: receipt.versionId,
      summary: "理解：把支架孔加大",
      // Required by the contract, allowed to be empty — and empty is what the
      // Agent sent every single time in the session this came from.
      annotations: [],
    }),
  );
  try {
    execFileSync(process.execPath, ["scripts/reviewctl.mjs", "echo", file], {
      cwd: repo,
      env,
      stdio: "pipe",
    });
  } catch (e) {
    throw new Error(
      `echo failed: ${e.stderr?.toString()} ${e.stdout?.toString()}`,
    );
  }
  // It says itself once without being asked for.
  const bubble = page.locator("#echo-panel");
  await expect(bubble).toBeVisible();
  await expect(page.locator("#echo-recall")).toBeVisible();
  /* The bubble and the pill naming the file both want the bottom-right corner,
     and the bubble is on top. While it only ever landed on the axis label that
     was decoration covering decoration; the pill moved down here, so the one
     round where the Agent says what it understood is the round that would hide
     what the reviewer is looking at. */
  expect(
    await page.evaluate(() => {
      const pill = document
        .querySelector("#model-info")
        .getBoundingClientRect();
      const dock = document.querySelector("#echo-dock").getBoundingClientRect();
      return (
        pill.right <= dock.left ||
        pill.left >= dock.right ||
        pill.bottom <= dock.top ||
        pill.top >= dock.bottom
      );
    }),
  ).toBe(true);
  // Then it goes, instead of waiting to be dismissed by hand every round.
  await expect(bubble).toBeHidden({ timeout: 12000 });
  // What is left is a way to ask again — and asking is deliberate, so this time
  // it stays until it is put away.
  await page.locator("#echo-recall").click();
  await expect(bubble).toBeVisible();
  await expect(page.locator("#echo-recall")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.waitForTimeout(9000);
  await expect(bubble).toBeVisible();
  await page.locator("#echo-recall").click();
  await expect(bubble).toBeHidden();
  await expect(page.locator("#echo-recall")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  // Reading it never costs the model any room: the review keeps its marks and
  // its camera either way.
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(1);
});
