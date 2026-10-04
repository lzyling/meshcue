import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";

export function scenarioKit(page, { run }) {
  let manifest = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/api/ready"))
      manifest = request.postDataJSON()?.meshes || [];
  });
  const bounds = () => page.locator("#viewer canvas").boundingBox();
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  const drag = async (
    button,
    dx,
    dy,
    { x = 0.5, y = 0.5, steps = 12 } = {},
  ) => {
    const box = await bounds(),
      from = { x: box.x + box.width * x, y: box.y + box.height * y };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button });
    try {
      await page.mouse.move(from.x + dx, from.y + dy, { steps });
    } finally {
      await page.mouse.up({ button });
    }
    await settle();
  };
  return {
    async open(url) {
      await page.goto(url);
      await page.waitForFunction(
        () =>
          window.__reviewDiagnostics?.().viewer?.meshes > 0 &&
          !document.querySelector('[data-mode="orbit"]').disabled,
      );
      await page.locator("#loading").waitFor({ state: "hidden" });
      await settle();
    },
    orbit: (dx, dy, options) => drag("right", dx, dy, options),
    pan: (dx, dy, options) => drag("middle", dx, dy, options),
    async wheel(deltaY, deltaX = 0) {
      const box = await bounds();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(deltaX, deltaY);
      await settle();
    },
    async key(key) {
      await page.keyboard.press(key);
      await settle();
    },
    async clickModelPoint(point, { meshId = manifest[0]?.id } = {}) {
      const mesh = manifest.find((item) => item.id === meshId);
      if (!mesh)
        throw new Error(
          `No ready mesh manifest for ${meshId}; open the page with this kit first`,
        );
      const diagnostic = await page.evaluate(() =>
          window.__reviewDiagnostics(),
        ),
        box = await bounds();
      const camera = new THREE.PerspectiveCamera(
        diagnostic.camera.fov || 38,
        box.width / box.height,
        0.01,
        100,
      );
      camera.position.fromArray(diagnostic.camera.position);
      camera.up.fromArray(diagnostic.cameraUp);
      camera.lookAt(new THREE.Vector3().fromArray(diagnostic.camera.target));
      camera.updateMatrixWorld();
      const projected = new THREE.Vector3()
        .fromArray(point)
        .applyMatrix4(new THREE.Matrix4().fromArray(mesh.matrixWorld))
        .project(camera);
      if (
        Math.abs(projected.x) > 1 ||
        Math.abs(projected.y) > 1 ||
        Math.abs(projected.z) > 1
      )
        throw new Error("Model point is outside the camera view");
      await page.mouse.click(
        box.x + ((projected.x + 1) * box.width) / 2,
        box.y + ((1 - projected.y) * box.height) / 2,
      );
      await settle();
    },
    toolbarState: () =>
      page.locator(".toolbar button, #home-view").evaluateAll((buttons) =>
        buttons.map((button) => ({
          id: button.id || button.dataset.mode,
          command: button.dataset.command || null,
          disabled: button.disabled,
          active: button.classList.contains("active"),
          pressed: button.getAttribute("aria-pressed"),
          label: button.getAttribute("aria-label"),
        })),
      ),
    async screenshot(step, { viewerOnly = false } = {}) {
      if (!/^[a-zA-Z0-9_-]+$/.test(step))
        throw new Error("Screenshot step must be a plain filename stem");
      fs.mkdirSync(run, { recursive: true });
      const file = path.join(run, `${step}.png`);
      await (viewerOnly ? page.locator("#viewer canvas") : page).screenshot({
        path: file,
        animations: "disabled",
      });
      return file;
    },
  };
}
