import { mountMenus, toolbarCaption } from "./menus.js";
import { registerPanTool } from "./pan-tool.js";
import { t } from "../i18n/index.js";
export function installToolbar(review) {
  function updateFillControl() {
    review.$("#fill-control").hidden =
      review.mode !== "fill" ||
      (["step", "stp"].includes(review.viewer.model?.format) &&
        review.viewer.meshes.length > 0 &&
        review.viewer.meshes.every((mesh) => mesh.userData.fillTopology?.brep));
  }

  function updateButtons() {
    updateFillControl();
    // The server decides what is permitted and says why when it is not. The page
    // only adds what the server cannot know: whether this tab has finished saving.
    const can = review.state?.capabilities || {};
    const ready =
        !!review.loadedId &&
        review.viewer.enabled &&
        !review.recoveryBlocked &&
        !review.accessBlocked,
      settled = review.editSeq === review.savedSeq && !review.saveFlight,
      busy = review.submitting || !ready;
    // Marks this tab has not managed to save yet still count as something to hand
    // over — submitting flushes first once the connection is available again.
    review.$("#submit-feedback").disabled =
      busy ||
      review.disconnected ||
      !can.canEdit ||
      (!can.canSubmit && !review.annotations.length);
    review.$("#submit-feedback").title = review
      .$("#submit-feedback")
      .textContent.trim();
    review.refreshCommands();
    // Read-only rather than disabled: a note that cannot be changed right now
    // can still be read, scrolled and copied.
    review.noteBox().readOnly = busy || !can.canEdit;
    const status = review.$("#review-status");
    status.textContent = review.accessBlocked
      ? review.loadedId && review.initialDraftRestored
        ? t("conn.accessExpired")
        : t("conn.noAccess")
      : !ready
        ? t("review.loadingModel")
        : review.state?.locked
          ? t("review.openElsewhere")
          : can.canEdit
            ? ""
            : review.blockedText(can.blocked);
    status.hidden = !status.textContent;
    review.updateReceipt();
    review.renderVersions();
    review.updatePublicationNotices();
    review.$("#resume-banner").hidden =
      !review.state?.locked || review.accessBlocked;
    document
      .querySelectorAll(".delete-annotation, .edit-action")
      .forEach((b) => (b.disabled = busy || !can.canEdit));
    review.showMeasure();
  }

  let viewingMode = "orbit";
  function setMode(next) {
    if (["orbit", "pan"].includes(next)) viewingMode = next;
    review.mode = next;
    if (next !== "relocate") review.relocatingId = null;
    review.viewer.setVisible(true);
    review.showMarksToggle();
    review.viewer.setMode(next);
    document
      .querySelectorAll("[data-mode]")
      .forEach((b) => b.classList.toggle("active", b.dataset.mode === next));
    review.refreshMenus?.();
    updateFillControl();
    // Looking makes nothing, so there is nothing for a colour to apply to; and
    // a measurement is a number, not a colour.
    review.$(".palette").hidden = [
      "orbit",
      "pan",
      "relocate",
      "measure",
    ].includes(next);
    review.$("#new-region").hidden = next !== "fill";
    review.$("#measure-options").hidden = next !== "measure";
    // Once every option inside it is gone the frame is all that is left, and an
    // empty frame still reads as a window that failed to close.
    review.$("#tool-options").hidden = [
      ...review.$("#tool-options").children,
    ].every((el) => el.hidden);
    review.$("#tool-hint").textContent = {
      fill: t("hint.fill"),
      relocate: t("hint.relocate"),
      label: t("hint.label"),
      edge: t("marks2.edge"),
      part: t("marks2.part"),
      orbit: t("hint.orbit"),
      pan: t("hint.pan"),
      measure: t(review.MEASURE_HINTS[review.viewer.measureKind]),
    }[next];
    review.showToolHint?.(next);
  }

  function toggleTool(mode) {
    // Viewer.setMode uses the same clearMeasure path as Escape; saved marks stay.
    setMode(review.mode === mode ? viewingMode : mode);
  }

  function updatePalette() {
    document
      .querySelectorAll(".color-button")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.color === review.color),
      );
  }

  /* These two are switches, not tools, and they moved off the model into the
   toolbar where every other control already was. An unlabelled icon among
   captioned buttons reads as an unfinished one, so each is named on the face
   by what it is about; the icon carries which way it is set, and the name it
   is announced by says what the next press will do. The caption is a noun for
   that reason — it would have to contradict itself as a verb. */
  function showToggle(id, pressed, key, name, caption) {
    const button = review.$(id);
    button.setAttribute("aria-pressed", String(pressed));
    button.setAttribute("aria-label", t(key));
    button.title = t(key);
    button.innerHTML = `${review.icon(name)}<span>${review.esc(toolbarCaption(button.dataset.command) || t(caption))}</span>`;
  }

  Object.assign(review, {
    updateButtons,
    setMode,
    toggleTool,
    updatePalette,
    showToggle,
  });
}

export function bindToolbarOptions(review) {
  for (const c of review.colors) {
    const b = document.createElement("button");
    b.className = "color-button";
    b.dataset.color = c;
    b.style.background = c;
    b.setAttribute(
      "aria-label",
      t("color.choose", { color: review.colorName(c) }),
    );
    b.addEventListener("click", () => {
      review.color = c;
      review.updatePalette();
    });
    review.$(".palette").append(b);
  }

  const dialog = document.createElement("dialog");
  dialog.id = "reset-dialog";
  dialog.setAttribute("aria-labelledby", "reset-dialog-title");
  dialog.setAttribute("aria-describedby", "reset-dialog-message");
  dialog.innerHTML = `<h2 id="reset-dialog-title">${review.esc(t("shell.reset"))}</h2><p id="reset-dialog-message"></p><div class="reset-dialog-actions"><button id="reset-cancel" autofocus>${review.esc(t("shell.resetCancel"))}</button><button id="reset-confirm" class="danger-button">${review.esc(t("shell.reset"))}</button></div>`;
  document.body.append(dialog);
  const restoreDisplay = () => {
    review.viewer.parts.restoreAll({ preserveMeasure: false });
    review.viewer.clearMeasure();
    review.viewer.hoverPart(null);
    review.viewer.setSection(null);
    review.viewer.setExplode?.(0);
    if (review.viewer.neutral) review.commands.run("plain");
    review.setDisplayStyle("edges");
    review.viewer.setVisible(true);
    review.showMarksToggle();
    review.viewer.home();
  };
  let version;
  const performReset = async () => {
    const resetVersion = version;
    // A modal may outlive a version/permission refresh; never clear another draft.
    if (version !== review.loadedId || review.submitting) return;
    if (
      !review.state?.capabilities?.canEdit ||
      review.recoveryBlocked ||
      review.accessBlocked
    ) {
      restoreDisplay();
      review.toast(t("shell.resetReadOnly"));
      return;
    }
    if (review.annotations.length) {
      let cleared = false;
      try {
        // beginEdit is the authority for locks and pushes exactly one history entry.
        if (!(await review.beginEdit())) {
          restoreDisplay();
          review.toast(t("shell.resetReadOnly"));
          return;
        }
        if (resetVersion !== review.loadedId) return;
        review.annotations = [];
        cleared = true;
        review.selectedId = null;
        review.relocatingId = null;
        restoreDisplay();
        review.changed();
        await review.flushDraft();
      } catch (error) {
        restoreDisplay();
        review.toast(cleared ? error.message : t("shell.resetReadOnly"));
      }
    } else restoreDisplay();
  };
  const reset = async () => {
    if (review.resettingPreview) return;
    review.resettingPreview = true;
    review.refreshCommands();
    try {
      await performReset();
    } finally {
      review.resettingPreview = false;
      review.refreshCommands();
    }
  };
  review.$("#reset-cancel").onclick = () => dialog.close();
  review.$("#reset-confirm").onclick = () => {
    dialog.close();
    void reset();
  };
  review.resetPreview = () => {
    if (review.resettingPreview) return;
    version = review.loadedId;
    if (!review.annotations.length || !review.state?.capabilities?.canEdit)
      return reset();
    review.$("#reset-dialog-message").textContent = t("shell.resetConfirm", {
      count: review.annotations.length,
    });
    dialog.showModal();
    review.$("#reset-cancel").focus();
  };

  review.updatePalette();

  review
    .$("#fill-range")
    .addEventListener("input", (e) =>
      review.viewer.setFillTolerance(Number(e.target.value)),
    );

  review.showMarksToggle = () =>
    review.showToggle(
      "#toggle-marks",
      !review.viewer.annotationsVisible,
      review.viewer.annotationsVisible ? "marks.hide" : "marks.show",
      review.viewer.annotationsVisible ? "eye" : "eye-off",
      "tool.marks",
    );
}

export function registerToolbarCommands(review) {
  const ready = () =>
    !!review.loadedId &&
    review.viewer.enabled &&
    !review.recoveryBlocked &&
    !review.accessBlocked;
  const idle = () => ready() && !review.submitting;
  review.commands.register({
    id: "view-mode",
    labelKey: "shell.rotateMode",
    icon: "orbit",
    menu: "view",
    attributes: { id: "view-mode-toggle" },
    enabled: ready,
    run: () => review.openMenu("view-mode"),
  });
  review.markMode = "label";
  review.commands.register({
    id: "mark-mode",
    labelKey: "tool.labelLabel",
    icon: "pin",
    menu: "mark",
    attributes: { id: "mark-mode-toggle" },
    enabled: () => idle() && !!review.state?.capabilities?.canEdit,
    run: () => review.toggleTool(review.markMode),
  });
  review.commands.register({
    id: "reset-preview",
    labelKey: "shell.reset",
    titleKey: "shell.resetTitle",
    captionKey: "shell.reset",
    icon: "reset",
    group: "history",
    attributes: { id: "reset-preview", class: "tool reset-preview" },
    enabled: () => ready() && !review.resettingPreview,
    run: () => review.resetPreview(),
  });
  for (const [mode, labelKey, titleKey, captionKey, icon] of [
    ["orbit", "tool.orbitLabel", "tool.orbitTitle", "tool.orbit", "orbit"],
    ["label", "tool.labelLabel", "tool.labelTitle", "tool.label", "pin"],
    ["edge", "marks2.edge", "marks2.edge", "marks2.edge", "mark-edge"],
    ["part", "marks2.part", "marks2.part", "marks2.part", "mark-part"],
    ["fill", "tool.bucketLabel", "tool.bucketTitle", "tool.bucket", "fill"],
    [
      "measure",
      "tool.measureLabel",
      "tool.measureTitle",
      "tool.measure",
      "measure",
    ],
  ]) {
    review.commands.register({
      id: `mode-${mode}`,
      labelKey,
      titleKey,
      captionKey,
      icon,
      menu: mode === "orbit" ? "view" : mode === "measure" ? "inspect" : "mark",
      menuOrder: 0,
      menuSection: "tools",
      attributes: {
        "data-mode": mode,
        class: `tool${mode === "orbit" ? " active" : ""}`,
      },
      // Measuring changes nothing; keeping a measurement is the edit.
      enabled: () =>
        ["measure", "orbit"].includes(mode)
          ? ready() && (mode !== "measure" || !review.viewer.explode?.amount)
          : idle() && !!review.state?.capabilities?.canEdit,
      run: () =>
        mode === "orbit"
          ? review.setMode(mode)
          : ["label", "edge", "part"].includes(mode)
            ? ((review.markMode = mode), review.setMode(mode))
            : review.toggleTool(mode),
    });
    if (mode === "orbit") registerPanTool(review, ready);
  }
  review.commands.register({
    id: "section",
    labelKey: "section.title",
    captionKey: "section.title",
    icon: "section",
    menu: "inspect",
    menuOrder: 10,
    checked: () => !!review.viewer?.section,
    attributes: {
      id: "section-toggle",
      class: "tool",
      "aria-pressed": "false",
      "aria-expanded": "false",
      "aria-controls": "section-options",
      disabled: "",
    },
    enabled: () => !!review.viewer?.sectionBounds,
    run: () => review.viewer.setSection(review.viewer.section ? null : {}),
  });
  for (const redo of [false, true]) {
    const id = redo ? "redo" : "undo";
    review.commands.register({
      id,
      labelKey: redo ? "tool.redo" : "tool.undo",
      titleKey: redo ? "tool.redo" : "tool.undoTitle",
      icon: id,
      group: "history",
      attributes: { id, class: "tool small" },
      shortcuts: redo ? "Mod+Shift+Z" : "Mod+Z",
      // Historically keys attempt beginEdit even while the button is disabled;
      // that path owns the lock/refusal logic and remains authoritative.
      enabled: (source) =>
        source === "keyboard" ||
        (idle() && !!(redo ? review.redoStack : review.undoStack)?.length),
      run: () => review.travelHistory(redo),
    });
  }
  review.commands.register({
    id: "marks",
    labelKey: "marks.hide",
    titleKey: "marks.hide",
    captionKey: "tool.marks",
    icon: "eye",
    menu: "view",
    checked: () => !!review.viewer?.annotationsVisible,
    attributes: { id: "toggle-marks", class: "tool", "aria-pressed": "false" },
    run: () => {
      review.viewer.setVisible(!review.viewer.annotationsVisible);
      review.showMarksToggle();
    },
  });
  review.commands.register({
    id: "plain",
    labelKey: "view.plain",
    titleKey: "view.plain",
    captionKey: "tool.plain",
    icon: "plain",
    menu: "view",
    menuOrder: 50,
    menuSection: "display",
    checked: () => !!review.viewer?.neutral,
    attributes: { id: "neutral-view", class: "tool", "aria-pressed": "false" },
    run: () => {
      review.viewer.setNeutral(!review.viewer.neutral);
      review.refreshDisplay?.();
    },
  });
  review.commands.register({
    id: "home",
    menuOrder: 20,
    menuSection: "camera",
    labelKey: "cube.homeLabel",
    icon: "home",
    run: () => review.viewer.home(),
  });
  review.commands.register({
    id: "escape",
    labelKey: "common.close",
    shortcuts: "Escape",
    preventDefault: false,
    enabled: () => ["relocate", "measure"].includes(review.mode),
    run: () => {
      if (review.mode === "relocate") review.setMode("orbit");
      if (review.mode === "measure") review.viewer.clearMeasure();
    },
  });
}

export function mountToolbar(review) {
  review.refreshCommands = () => {
    for (const button of document.querySelectorAll("[data-command]")) {
      const command = review.commands.get(button.dataset.command);
      if (command) button.disabled = !command.enabled("button");
    }
    review.refreshMenus?.();
  };
  mountMenus(review);
  const mount = (command) => {
    if (!command.group || command.menu) return;
    const slot = document.querySelector(
      `[data-toolbar-slot="${command.group}"]`,
    );
    if (!slot) throw new Error(`Unknown toolbar slot: ${command.group}`);
    const button = document.createElement("button");
    button.className = "tool";
    for (const [key, value] of Object.entries(command.attributes || {}))
      button.setAttribute(key, value);
    button.dataset.command = command.id;
    button.setAttribute("aria-label", t(command.labelKey));
    if (command.titleKey) button.title = t(command.titleKey);
    button.innerHTML =
      (command.icon ? review.icon(command.icon) : "") +
      (toolbarCaption(command.id) || command.captionKey
        ? `<span>${review.esc(toolbarCaption(command.id) || t(command.captionKey))}</span>`
        : "");
    slot.append(button);
  };
  review.commands
    .list()
    .filter((c) => c.id !== "reset-preview")
    .forEach(mount);
  mount(review.commands.get("reset-preview"));
  review.commands.onRegister((command) => {
    mount(command);
    review.refreshCommands();
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#section-off"))
      review.$("#section-toggle").focus();
    const button = event.target.closest?.("[data-command]");
    if (button && !button.disabled) {
      review.commands.run(button.dataset.command);
      review.refreshCommands();
    }
  });
}
