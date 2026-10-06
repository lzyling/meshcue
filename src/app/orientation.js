import { buildOrientCube, compassTransform } from "../orient-cube.js";
import { validDefaultView } from "../viewer/camera.js";
import { t } from "../i18n/index.js";

export function bindOrientation(review) {
  /* The cube is a compass: it turns with the camera so a reviewer who has orbited
   into an unfamiliar angle can still read which way the model is facing, and
   clicking a face reframes from that side without changing what is framed. */
  review.orientCube = review.$("#orient-cube");

  review.viewer.onOrient = (yaw, pitch, roll) => {
    review.orientCube.style.transform = compassTransform(yaw, pitch, roll);
  };

  // Review-local browser state, deliberately separate from drafts/submissions.
  // Keep the current tab usable when storage is denied, without letting one
  // review's preferred camera become another review's default.
  const defaults = new Map();
  const key = () =>
    review.loadedReviewId
      ? `meshcue-default-view-${review.loadedReviewId}`
      : null;
  review.viewer.getDefaultView = () => {
    const id = key();
    if (!id) return null;
    if (!defaults.has(id)) {
      let saved;
      try {
        saved = JSON.parse(localStorage.getItem(id));
      } catch {}
      defaults.set(id, validDefaultView(saved) ? saved : null);
    }
    return defaults.get(id);
  };
  const stage = review.$(".orient-stage");
  const menu = document.createElement("div");
  menu.className = "orient-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", t("cube.defaultMenu"));
  menu.hidden = true;
  review.$(".orient").append(menu);
  const close = (focus = false) => {
    menu.hidden = true;
    stage.setAttribute("aria-expanded", "false");
    if (focus) stage.focus();
  };
  stage.setAttribute("aria-haspopup", "menu");
  stage.setAttribute("aria-expanded", "false");
  for (const [name, labelKey] of [
    ["set", "cube.setDefault"],
    ["reset", "cube.resetDefault"],
  ]) {
    const id = `navigation-default-${name}`;
    review.commands.register({
      id,
      labelKey,
      enabled: () => review.viewer.enabled && !!key(),
      run: () => {
        const storageKey = key();
        const saved =
          name === "set"
            ? { ...review.viewer.cameraState(), up: review.viewer.screenUp() }
            : null;
        defaults.set(storageKey, saved);
        try {
          if (saved) localStorage.setItem(storageKey, JSON.stringify(saved));
          else localStorage.removeItem(storageKey);
        } catch {
          /* Optional browser preference, not a saved mark. */
        }
        close(true);
      },
    });
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.dataset.command = id;
    button.textContent = t(labelKey);
    menu.append(button);
  }
  const open = () => {
    if (!review.viewer.enabled) return;
    menu.hidden = false;
    stage.setAttribute("aria-expanded", "true");
    menu.querySelector("button").focus();
    review.refreshCommands();
  };
  stage.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    open();
  });
  stage.addEventListener("keydown", (event) => {
    if (
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      event.preventDefault();
      event.stopPropagation();
      open();
    }
  });
  menu.addEventListener("keydown", (event) => {
    // Application arrows rotate the model. A menu's arrows must move focus
    // instead, and Escape must close this popover before clearing a selection.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const buttons = [...menu.querySelectorAll("button")];
      const index = buttons.indexOf(document.activeElement);
      buttons[
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length
      ].focus();
    }
    if (event.key === "Tab") close();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".orient")) {
      close();
      if (stage.contains(document.activeElement)) document.activeElement.blur();
      stage.classList.remove("navigation-touch-controls");
    }
  });

  /* Faces name a side; edges and corners are the three-quarter views a modeller
   reaches for to see two or three sides at once. */
  review.CUBE_KEYS = {
    "0,0,1": "cube.front",
    "0,0,-1": "cube.back",
    "1,0,0": "cube.right",
    "-1,0,0": "cube.left",
    "0,1,0": "cube.top",
    "0,-1,0": "cube.bottom",
  };

  review.CUBE_AXES = [
    ["cube.right", "cube.left"],
    ["cube.top", "cube.bottom"],
    ["cube.front", "cube.back"],
  ];

  review.cubeTitle = (view) =>
    view
      .split(",")
      .map(Number)
      .map((v, i) => (v ? t(review.CUBE_AXES[i][v > 0 ? 0 : 1]) : ""))
      .filter(Boolean)
      .reverse()
      .join(t("cube.sideJoin"));

  for (const region of buildOrientCube(review.orientCube, {
    label: (view) => (review.CUBE_KEYS[view] ? t(review.CUBE_KEYS[view]) : ""),
    title: (view) => t("cube.viewFrom", { side: review.cubeTitle(view) }),
  })) {
    const id = `navigation-cube-${region.view}`;
    review.commands.register({
      id,
      labelKey: review.CUBE_KEYS[region.view] || "cube.viewFrom",
      enabled: () => review.viewer.enabled,
      run: () => review.viewer.viewFrom(...region.view.split(",").map(Number)),
    });
    region.el.dataset.command = id;
  }
}
