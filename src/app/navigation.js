import * as THREE from "three";
import { boxCorners } from "../viewer/navigation-math.js";
import { t } from "../i18n/index.js";

export function bindNavigation(review) {
  const viewer = review.viewer;
  // Cursor zoom consumes the wheel before it bubbles to the document. Keep
  // trusted navigation activity on the same renewal path as other input.
  viewer.renderer.domElement.addEventListener("wheel", review.noteActivity, {
    capture: true,
    passive: true,
  });
  // Read-only inspection follows the existing review diagnostics convention.
  window.__navigationDiagnostics = () => ({
    projection: viewer.camera.isOrthographicCamera
      ? "orthographic"
      : "perspective",
    visibleHeight: viewer.navigationHeight(),
    animating: !!viewer.navigationAnimation,
    damping: viewer.controls.enableDamping,
    hoverFaces: viewer.navigationHover ? viewer.navigationHoverFaces || 0 : 0,
    bounds: boxCorners(viewer.visibleNavigationBounds()).map((point) =>
      point.project(viewer.camera).toArray(),
    ),
  });
  const enabled = () => viewer.enabled;
  const register = (id, labelKey, shortcuts, run, extra = {}) =>
    review.commands.register({
      id: `navigation-${id}`,
      labelKey,
      shortcuts,
      run,
      enabled,
      ...extra,
    });
  const views = [
    ["front", [0, 0, 1]],
    ["back", [0, 0, -1]],
    ["left", [-1, 0, 0]],
    ["right", [1, 0, 0]],
    ["top", [0, 1, 0]],
    ["bottom", [0, -1, 0]],
    ["iso", [4, 2.8, 5]],
  ];
  views.forEach(([name, direction], i) =>
    register(
      name,
      name === "iso" ? "navigation.iso" : `cube.${name}`,
      [`Shift+${i + 1}`, `Shift+${"!@#$%^&"[i]}`],
      () => viewer.viewFrom(...direction),
      { shortcutLabel: `Shift+${i + 1}` },
    ),
  );
  register("fit", "navigation.fit", "F", () => viewer.fitAll());
  register("zoom-out", "navigation.zoomOut", "Z", () =>
    viewer.zoomNavigation(1.2),
  );
  register("zoom-in", "navigation.zoomIn", "Shift+Z", () =>
    viewer.zoomNavigation(1 / 1.2),
  );
  register("normal", "navigation.normal", "N", () => {
    if (!viewer.normalToPointer())
      review.$("#tool-hint").textContent = t("navigation.noFace");
  });
  const arrows = [
    ["Left", -1, 0, "navigation.rotateLeft", "navigation.panLeft"],
    ["Right", 1, 0, "navigation.rotateRight", "navigation.panRight"],
    ["Up", 0, 1, "navigation.rotateUp", "navigation.panUp"],
    ["Down", 0, -1, "navigation.rotateDown", "navigation.panDown"],
  ];
  for (const [name, dx, dy, rotateKey, panKey] of arrows) {
    for (const [prefix, degrees] of [
      ["", 15],
      ["Ctrl+", 5],
      ["Shift+", 90],
    ])
      register(`${prefix}${name}`, rotateKey, `${prefix}Arrow${name}`, () =>
        viewer.rotateNavigation(dx * degrees, dy * degrees),
      );
    register(`pan-${name}`, panKey, `Ctrl+Shift+Arrow${name}`, () =>
      viewer.panBy(dx * 40, -dy * 40),
    );
  }
  register(
    "projection",
    "navigation.projection",
    undefined,
    () =>
      viewer.setProjection(
        viewer.camera.isOrthographicCamera ? "perspective" : "orthographic",
      ),
    {
      group: "display",
      captionKey: "navigation.projection",
      icon: "plain",
      attributes: { id: "navigation-projection", "aria-pressed": "false" },
    },
  );
  const projection = document.createElement("button");
  projection.className = "quiet-dark navigation-projection";
  projection.dataset.command = "navigation-projection";
  review.$(".orient").append(projection);
  viewer.onProjection = (ortho) => {
    for (const button of document.querySelectorAll(
      '[data-command="navigation-projection"]',
    )) {
      button.setAttribute("aria-pressed", String(ortho));
      button.title = t(
        ortho ? "navigation.perspective" : "navigation.orthographic",
      );
    }
    projection.textContent = t(
      ortho ? "navigation.orthographic" : "navigation.perspective",
    );
  };
  viewer.onProjection(!!viewer.camera.isOrthographicCamera);

  const sheet = document.createElement("dialog");
  sheet.id = "navigation-shortcuts";
  const close = document.createElement("button");
  close.className = "dialog-close";
  close.textContent = t("common.close");
  close.addEventListener("click", () => sheet.close());
  const title = document.createElement("h2");
  title.textContent = t("navigation.shortcuts");
  const list = document.createElement("dl");
  sheet.append(close, title, list);
  document.body.append(sheet);
  register(
    "shortcuts",
    "navigation.shortcuts",
    ["Shift+/", "Shift+?"],
    () => {
      list.replaceChildren();
      for (const command of review.commands.list()) {
        if (!command.shortcuts) continue;
        const key = document.createElement("dt"),
          label = document.createElement("dd");
        key.textContent =
          command.shortcutLabel ||
          (Array.isArray(command.shortcuts)
            ? command.shortcuts.join(" / ")
            : command.shortcuts);
        key.textContent = key.textContent
          .replaceAll("Mod+", "Ctrl/⌘+")
          .replaceAll("ArrowLeft", "←")
          .replaceAll("ArrowRight", "→")
          .replaceAll("ArrowUp", "↑")
          .replaceAll("ArrowDown", "↓");
        label.textContent = t(command.labelKey);
        list.append(key, label);
      }
      sheet.showModal();
    },
    { enabled: () => true, shortcutLabel: "Shift+/" },
  );

  const stage = review.$(".orient-stage");
  for (const [name, glyph] of [
    ["Left", "‹"],
    ["Right", "›"],
    ["Up", "⌃"],
    ["Down", "⌄"],
  ]) {
    const arrow = document.createElement("button");
    arrow.className = `navigation-arrow navigation-arrow-${name.toLowerCase()}`;
    arrow.dataset.command = `navigation-Shift+${name}`;
    arrow.setAttribute(
      "aria-label",
      t(arrows.find((arrow) => arrow[0] === name)[3]),
    );
    arrow.textContent = glyph;
    stage.append(arrow);
  }
  let drag;
  stage.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".navigation-arrow") || event.button !== 0) return;
    viewer.cancelNavigation();
    drag = { x: event.clientX, y: event.clientY, moved: false };
  });
  stage.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    stage.setPointerCapture(event.pointerId);
    viewer.rotateNavigation(-dx * 0.6, dy * 0.6);
    // A dragged cube follows the hand immediately, exactly as the model does.
    const end = viewer.navigationAnimation;
    if (end) viewer.applyNavigation(end.position, end.target, end.height);
    viewer.cancelNavigation();
    viewer.navigationRotating = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  stage.addEventListener(
    "click",
    (event) => {
      if (drag?.moved) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      drag = null;
    },
    true,
  );
  stage.addEventListener("pointerup", () => {
    viewer.navigationRotating = false;
  });
  stage.addEventListener("pointercancel", () => {
    drag = null;
    viewer.navigationRotating = false;
  });

  // Apply the model root's rotation to file axes before projecting them. STL
  // and STEP stand +Z up; GLB keeps +Y up, without a filename heuristic here.
  const ns = "http://www.w3.org/2000/svg";
  const triad = document.createElementNS(ns, "svg");
  triad.classList.add("navigation-triad");
  triad.setAttribute("viewBox", "0 0 90 90");
  triad.setAttribute("role", "img");
  triad.setAttribute("aria-label", t("navigation.axes"));
  const axes = ["X", "Y", "Z"].map((label, i) => {
    const group = document.createElementNS(ns, "g");
    group.setAttribute("fill", ["#dd5353", "#2e9e78", "#398ce6"][i]);
    group.setAttribute("stroke", ["#dd5353", "#2e9e78", "#398ce6"][i]);
    const line = document.createElementNS(ns, "line"),
      text = document.createElementNS(ns, "text");
    line.setAttribute("x1", "45");
    line.setAttribute("y1", "45");
    text.textContent = label;
    group.append(line, text);
    triad.append(group);
    return { line, text, direction: new THREE.Vector3().setComponent(i, 1) };
  });
  review.$(".orient").append(triad);
  viewer.addFrameHook(() => {
    const inverse = viewer.camera.quaternion.clone().invert();
    for (const { line, text, direction } of axes) {
      const d = direction
        .clone()
        .applyQuaternion(viewer.root.quaternion)
        .applyQuaternion(inverse);
      line.setAttribute("x2", 45 + d.x * 27);
      line.setAttribute("y2", 45 - d.y * 27);
      text.setAttribute("x", 45 + d.x * 35);
      text.setAttribute("y", 49 - d.y * 35);
    }
  });
}
