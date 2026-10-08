import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { test, expect } from "./fixtures.mjs";
import { startReview } from "../helpers/review-server.mjs";
import { browserOrigin } from "../helpers/browser-server.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";
import { clickControl, showParts } from "./r12-b-helpers.mjs";

const evidence = path.resolve("tmp/b1v-groups/evidence");
let fixture, cleanup, file, groups;
const diagnostics = (page) => page.evaluate(() => window.__reviewDiagnostics());
const row = (page, id) => page.locator(`[data-part-id="${id}"]`);
const groupRow = (page) => row(page, "agent-group:service");

test.beforeEach(async () => {
  cleanup = [];
  fixture = await startReview({ after: (fn) => cleanup.push(fn) });
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((data) => {
        this.result = data;
        this.onloadend?.();
      });
    }
  };
  const scene = new THREE.Group();
  scene.name = "Assembly";
  // A mesh can own child parts. Other parts must retain this base without
  // accidentally acting on its grouped descendants.
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x6090a0 }),
  );
  base.name = "Base";
  for (const [name, x, y] of [
    ["Front", -3, 0],
    ["Same", 3, 0],
    ["Same", 0, 2],
  ]) {
    const child = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x909070 }),
    );
    child.name = name;
    child.position.set(x, y, 0);
    base.add(child);
  }
  scene.add(base);
  const bytes = Buffer.from(
    await new GLTFExporter().parseAsync(scene, { binary: true }),
  );
  file = path.join(fixture.dir, "assembly.glb");
  fs.writeFileSync(file, bytes);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const same = json.nodes.findIndex((node) => node.name === "Same");
  groups = [
    {
      id: "service",
      name: "Service access",
      members: [{ nodeName: "Front" }, { nodeName: "Front" }],
      children: [
        { id: "fasteners", name: "Fasteners", members: [{ nodeIndex: same }] },
      ],
    },
    {
      id: "invalid",
      name: "References",
      members: [{ nodeName: "Same" }, { nodeIndex: 999 }],
    },
    { id: "empty", name: "<b>Empty group</b>" },
  ];
});
test.afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
});
async function open(page, partGroups) {
  const result = await fixture.ipc("/publish", {
    file: path.relative(process.cwd(), file),
    version: "groups-v1",
    ...(partGroups !== undefined ? { partGroups } : {}),
  });
  expect(result.status).toBe(200);
  const kit = scenarioKit(page, { run: evidence });
  await kit.open(browserOrigin(fixture.url));
  await showParts(page);
  return kit;
}

test("without groups the File tree is unchanged and no switch is shown", async ({
  page,
}) => {
  const kit = await open(page);
  await expect(page.locator(".parts-view")).toBeHidden();
  await expect(page.locator(".parts-row")).toHaveCount(5);
  await expect(row(page, "part-0.0.0").locator(".parts-name")).toHaveText(
    "Front",
  );
  await kit.screenshot("before-desktop-file");
  await page.setViewportSize({ width: 390, height: 844 });
  await kit.screenshot("before-phone-file");
});

test("optional groups show nested native aliases Other parts and disabled references safely", async ({
  page,
}) => {
  const kit = await open(page, groups);
  await expect(page.locator("[data-parts-view]")).toHaveCount(0);
  await expect(groupRow(page)).toHaveAttribute("aria-level", "1");
  await expect(row(page, "agent-group:fasteners")).toHaveAttribute(
    "aria-level",
    "2",
  );
  await expect(
    row(page, "agent-member:service:0:part-0.0.0").locator(".parts-name"),
  ).toHaveText("Front");
  await expect(row(page, "agent-other").locator(".parts-name")).toHaveText(
    "Other parts",
  );
  await expect(row(page, "agent-member:invalid:0")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(
    row(page, "agent-member:invalid:0").locator(".parts-name"),
  ).toContainText('"nodeName":"Same"');
  await expect(
    row(page, "agent-member:invalid:0").locator(".parts-name"),
  ).toContainText("Ambiguous member");
  await expect(
    row(page, "agent-member:invalid:1").locator(".parts-name"),
  ).toContainText("Missing member");
  await expect(
    row(page, "agent-member:invalid:1").locator(".parts-eye"),
  ).toBeDisabled();
  await expect(
    row(page, "agent-group:empty").locator(".parts-name"),
  ).toHaveText("<b>Empty group</b>");
  await expect(
    row(page, "agent-group:empty").locator(".parts-badge"),
  ).toHaveText("Empty");
  await expect(row(page, "agent-group:empty").locator("b")).toHaveCount(0);
  await kit.screenshot("after-desktop-agent");
});

test("group hide isolate transparency and fit act on the member and child-group union", async ({
  page,
}) => {
  await open(page, groups);
  await groupRow(page).locator(".parts-name").click();
  await page.keyboard.press("y");
  await expect(row(page, "agent-member:service:0:part-0.0.0")).toHaveClass(
    /part-hidden/,
  );
  await expect(row(page, "agent-group:fasteners")).toHaveClass(/part-hidden/);
  await expect(row(page, "agent-other")).not.toHaveClass(/part-hidden/);
  await clickControl(page, '[data-command="parts-showAll"]');
  await clickControl(page, '[data-command="parts-isolate"]');
  await expect(row(page, "agent-other")).toHaveClass(/part-hidden/);
  await expect(groupRow(page)).not.toHaveClass(/part-hidden/);
  await page.keyboard.press("Escape");
  await groupRow(page).locator(".parts-name").click();
  await clickControl(page, '[data-command="parts-transparent"]');
  await expect(row(page, "agent-group:fasteners")).toHaveClass(
    /part-transparent/,
  );
  await expect(row(page, "agent-other")).not.toHaveClass(/part-transparent/);
  const before = (await diagnostics(page)).camera;
  await groupRow(page).locator(".parts-name").dblclick();
  await expect
    .poll(async () => JSON.stringify((await diagnostics(page)).camera))
    .not.toBe(JSON.stringify(before));
  await expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);
  const target = (await diagnostics(page)).camera.target;
  // The first two member boxes span x=-3..3; fitting their union is centred,
  // not the first alias's x=-3 box or the ungrouped box above it.
  expect(Math.abs(target[0])).toBeLessThan(0.05);
});

test("parent gates retain child switches and Reset restores all parts and clears marks", async ({
  page,
}) => {
  const kit = await open(page, groups);
  await page.locator("#sidebar-marks").click();
  await clickControl(page, '[data-mode="label"]');
  await kit.clickModelPoint([0, 0, 0.5], { meshId: "mesh-1" });
  await expect
    .poll(async () => (await diagnostics(page)).annotationCount)
    .toBe(1);
  await clickControl(page, '[data-mode="orbit"]');
  await showParts(page);
  await groupRow(page).locator(".parts-eye").click();
  const child = row(page, "agent-member:service:0:part-0.0.0");
  await expect(child).toHaveClass(/part-hidden/);
  await expect(child.locator(".parts-eye")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await child.locator(".parts-eye").click();
  await expect(child.locator(".parts-eye")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await child.locator(".parts-eye").click();
  await expect(child).toHaveClass(/part-hidden/);
  await groupRow(page).locator(".parts-eye").click();
  await expect(child).not.toHaveClass(/part-hidden/);
  await groupRow(page).locator(".parts-eye").click();
  await row(page, "agent-other").locator(".parts-name").click();
  await clickControl(page, '[data-command="parts-transparent"]');
  await expect(row(page, "agent-other")).toHaveClass(/part-transparent/);
  await clickControl(page, '[data-command="reset-preview"]');
  await expect(page.locator("#reset-dialog")).toBeVisible();
  await page.locator("#reset-confirm").click();
  await expect(page.locator(".parts-row.part-hidden")).toHaveCount(0);
  await expect(page.locator(".parts-row.part-transparent")).toHaveCount(0);
  await expect
    .poll(async () => (await diagnostics(page)).annotations)
    .toEqual([]);
});

test("search keyboard and surface picking reveal the first declared alias without grouping the pick", async ({
  page,
}) => {
  const kit = await open(page, groups);
  await page.locator("#parts-search").fill("Front");
  await expect(groupRow(page)).toBeVisible();
  await expect(row(page, "agent-group:invalid")).toHaveCount(0);
  await page.locator("#parts-search").fill("");
  await groupRow(page).locator(".parts-name").click();
  await page.keyboard.press("ArrowRight");
  await expect(row(page, "agent-member:service:0:part-0.0.0")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await groupRow(page).locator(".parts-expand").click();
  await page.locator('[data-view="0,0,1"]').press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);
  await kit.clickModelPoint([0, 0, 0.5], { meshId: "mesh-1" });
  await expect(row(page, "agent-member:service:0:part-0.0.0")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(groupRow(page)).toHaveAttribute("aria-selected", "false");
  expect((await diagnostics(page)).annotationCount).toBe(0);
});

test("same-content metadata updates keep visibility and geometry loaded and use automatic grouping", async ({
  page,
}) => {
  await open(page, groups);
  await groupRow(page).locator(".parts-eye").click();
  const original = await diagnostics(page);
  const replace = await fixture.ipc("/publish", {
    file: path.relative(process.cwd(), file),
    activate: false,
    partGroups: [{ ...groups[0], name: "Renamed access" }],
  });
  expect(
    replace.body.notices.some((n) => n.code === "PART_GROUPS_REPLACED"),
  ).toBe(true);
  await expect(groupRow(page).locator(".parts-name")).toHaveText(
    "Renamed access",
  );
  await expect(groupRow(page)).toHaveClass(/part-hidden/);
  expect((await diagnostics(page)).modelFilename).toBe(original.modelFilename);
  expect((await diagnostics(page)).revision).toBe(original.revision);
  await page.reload();
  await page.locator("#loading").waitFor({ state: "hidden" });
  await showParts(page);
  await expect(page.locator("[data-parts-view]")).toHaveCount(0);
  await expect(groupRow(page)).toBeVisible();
  await fixture.ipc("/publish", {
    file: path.relative(process.cwd(), file),
    activate: false,
    partGroups: [],
  });
  await expect(page.locator(".parts-view")).toBeHidden();
  await expect(row(page, "part-0.0.0")).toBeVisible();
});

test("phone portrait has localized automatic groups and usable nested rows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("meshcue-locale", "zh-Hans"),
  );
  const kit = await open(page, groups);
  await expect(page.locator("[data-parts-view]")).toHaveCount(0);
  await expect(page.locator(".parts-heading")).toHaveText("零件");
  await expect(row(page, "agent-group:fasteners")).toHaveAttribute(
    "aria-level",
    "2",
  );
  await expect(row(page, "agent-other").locator(".parts-name")).toHaveText(
    "其他零件",
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  const button = await groupRow(page).locator(".parts-name").boundingBox();
  expect(button.width).toBeGreaterThan(45);
  await groupRow(page).locator(".parts-eye").click();
  await expect(groupRow(page)).toHaveClass(/part-hidden/);
  await kit.screenshot("after-phone-agent-zh-Hans");
});
