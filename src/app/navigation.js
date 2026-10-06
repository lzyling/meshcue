import * as THREE from "three";
import { boxCorners } from "../viewer/navigation-math.js";
import { t } from "../i18n/index.js";
import { CUBE_GEOMETRY } from "../orient-cube.js";

export function bindNavigation(review) {
  const viewer = review.viewer;
  // Canvas picks select the model's part regardless of which sidebar tab is
  // currently open. Surface hover is transient and never becomes a selection.
  viewer.canSelectNavigationPart = () => !!viewer.parts;
  // Cursor zoom consumes the wheel before it bubbles to the document. Keep
  // trusted navigation activity on the same renewal path as other input.
  viewer.renderer.domElement.addEventListener("wheel", review.noteActivity, {
    capture: true,
    passive: true,
  });
  // Read-only inspection follows the existing review diagnostics convention.
  window.__navigationDiagnostics = (x, y) => ({
    pick:
      Number.isFinite(x) && Number.isFinite(y)
        ? (() => {
            const hit = viewer.rayAt(x, y);
            if (!hit) return null;
            const mesh = hit.object;
            const seed = mesh.geometry.userData.sourceFaces[hit.faceIndex];
            const brep = mesh.userData.fillTopology.brep;
            const range = brep?.ranges[brep.of[seed]];
            return {
              meshId: mesh.userData.reviewId,
              seed,
              range,
              point: hit.point.toArray(),
            };
          })()
        : null,
    selection: viewer.navigationSelection
      ? {
          meshId: viewer.navigationSelection.mesh.userData.reviewId,
          faces: viewer.navigationSelection.faces,
        }
      : null,
    selectionOverlayChildren:
      viewer.navigationSelectionOverlay?.children.length || 0,
    defaultView: viewer.getDefaultView?.() || null,
    fills: viewer.overlay.children
      .filter((o) => o.isMesh && !o.isLineSegments2)
      .map((o) => ({
        opacity: o.material.opacity,
        solid:
          o.material.onBeforeCompile ===
          THREE.Material.prototype.onBeforeCompile,
      })),
    regionOutlines: viewer.overlay.children
      .filter((o) => o.isLineSegments2)
      .map((o) => ({
        width: o.material.linewidth,
        dashed: o.material.dashed,
      })),
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
  // Compose with the existing Escape command, including parts isolation and
  // measurement, so typing/dialog boundaries still belong to the registry.
  const escape = review.commands.get("escape");
  const previousRun = escape.run,
    previousEnabled = escape.enabled;
  escape.enabled = (source) =>
    !!viewer.parts?.selected() || previousEnabled(source);
  escape.run = () => {
    viewer.clearNavigationSelection();
    viewer.navigationLastClick = null;
    viewer.parts?.select(null);
    previousRun();
  };
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
  // Home returns to the starting view; Fit keeps the current direction and
  // only frames the whole model. Two different actions side by side in the
  // same menu section need two different marks, or the one used less looks
  // like a duplicate. Corner brackets round a box, as viewers usually draw it.
  register("fit", "navigation.fit", "F", () => viewer.fitAll(), {
    menu: "view",
    menuOrder: 25,
    menuSection: "camera",
    icon: "fit",
  });
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
      menu: "view",
      menuOrder: 30,
      menuSection: "camera",
      checked: () => !!viewer.camera.isOrthographicCamera,
      captionKey: "navigation.projection",
      icon: "plain",
      attributes: { id: "navigation-projection", "aria-pressed": "false" },
    },
  );
  viewer.onProjection = (ortho) => {
    const command = review.commands.get("navigation-projection");
    command.captionKey = ortho
      ? "navigation.orthographic"
      : "navigation.perspective";
    for (const button of document.querySelectorAll(
      '[data-command="navigation-projection"]',
    )) {
      button.setAttribute("aria-pressed", String(ortho));
      button.querySelector("span").textContent = t(command.captionKey);
      button.title = t(
        ortho ? "navigation.perspective" : "navigation.orthographic",
      );
    }
    review.refreshCommands();
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
    ["Left", "◀"],
    ["Right", "▶"],
    ["Up", "▲"],
    ["Down", "▼"],
  ]) {
    const arrow = document.createElement("button");
    arrow.className = `navigation-arrow navigation-arrow-${name.toLowerCase()}`;
    arrow.dataset.command = `navigation-Shift+${name}`;
    arrow.setAttribute(
      "aria-label",
      t(arrows.find((arrow) => arrow[0] === name)[3]),
    );
    arrow.title = arrow.getAttribute("aria-label");
    arrow.textContent = glyph;
    stage.append(arrow);
  }
  for (const [name, degrees, glyph, labelKey] of [
    ["left", 90, "↶", "navigation.rollLeft"],
    ["right", -90, "↷", "navigation.rollRight"],
  ]) {
    const id = `navigation-roll-${name}`;
    register(`roll-${name}`, labelKey, undefined, () =>
      viewer.rollNavigation(degrees),
    );
    const button = document.createElement("button");
    button.type = "button";
    button.className = `navigation-roll navigation-roll-${name}`;
    button.dataset.command = id;
    button.setAttribute("aria-label", t(labelKey));
    button.title = button.getAttribute("aria-label");
    button.textContent = glyph;
    stage.append(button);
  }
  let drag,
    longPress,
    heldReleaseClick = false;
  document.addEventListener(
    "pointerdown",
    () => {
      heldReleaseClick = false;
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      if (!heldReleaseClick) return;
      // Touch compatibility clicks can be retargeted to the menu now under the
      // releasing finger, even with the pointer captured by the stage. Consume
      // that release once at document capture; a fresh contact (above) is always
      // an intentional menu choice, including on browsers that emit no click.
      heldReleaseClick = false;
      drag = null;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
  stage.addEventListener("pointerdown", (event) => {
    clearTimeout(longPress);
    if (event.pointerType === "touch")
      stage.classList.add("navigation-touch-controls");
    if (
      event.target.closest("button:not(.orient-region)") ||
      event.button !== 0
    )
      return;
    viewer.cancelNavigation();
    drag = { x: event.clientX, y: event.clientY, moved: false };
    if (event.pointerType === "touch") {
      // A tap still chooses a face; it also reveals controls until the next
      // outside tap. Holding for 550ms opens the same menu as a right click,
      // suppressing the face click and cancelling on a real cube drag.
      longPress = setTimeout(() => {
        drag.moved = true;
        drag.held = true;
        heldReleaseClick = true;
        stage.setPointerCapture(event.pointerId);
        stage.dispatchEvent(
          new Event("contextmenu", { bubbles: true, cancelable: true }),
        );
      }, 550);
    }
  });
  stage.addEventListener("pointermove", (event) => {
    if (!drag || drag.held) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    clearTimeout(longPress);
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
    clearTimeout(longPress);
    viewer.navigationRotating = false;
  });
  stage.addEventListener("pointercancel", () => {
    clearTimeout(longPress);
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
  stage.append(triad);
  viewer.addFrameHook(() => {
    // The origin is a bottom corner of this same cube, projected in the same
    // 400px perspective, rather than a free-floating axes panel to its left.
    // The axes themselves name file coordinates after the model's up rotation.
    const size = stage.clientWidth || 156;
    triad.setAttribute("viewBox", `0 0 ${size} ${size}`);
    const inverse = viewer.camera.quaternion.clone().invert();
    const corner = new THREE.Vector3(
      -CUBE_GEOMETRY.HALF + CUBE_GEOMETRY.CHAMFER,
      -CUBE_GEOMETRY.HALF,
      CUBE_GEOMETRY.HALF - CUBE_GEOMETRY.CHAMFER,
    ).applyQuaternion(inverse);
    const perspective = 400 / (400 - corner.z);
    const x = size / 2 + corner.x * perspective;
    const y = size / 2 - corner.y * perspective;
    for (const { line, text, direction } of axes) {
      line.parentNode.setAttribute(
        "transform",
        `translate(${x - 45 * 0.65} ${y - 45 * 0.65}) scale(0.65)`,
      );
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
