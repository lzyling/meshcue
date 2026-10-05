import { latestVersion, viewingBehindLatest } from "../versions.js";
import { registerPanTool } from "./pan-tool.js";
import { reusedVersionIsCurrent } from "./reuse-version.js";
import { t } from "../i18n/index.js";
export function installToolbar(review) {
  function updateButtons() {
    // The server decides what is permitted and says why when it is not. The page
    // only adds what the server cannot know: whether this tab has finished saving.
    const can = review.state?.capabilities || {};
    const latest = latestVersion(review.state?.versions),
      behind =
        viewingBehindLatest(review.state?.versions, review.viewingId) &&
        !reusedVersionIsCurrent(review, latest);
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
    review.refreshCommands();
    // Read-only rather than disabled: a note that cannot be changed right now
    // can still be read, scrolled and copied.
    review.noteBox().readOnly = busy || !can.canEdit;
    review.$("#review-status").textContent = review.accessBlocked
      ? review.loadedId && review.initialDraftRestored
        ? t("conn.accessExpired")
        : t("conn.noAccess")
      : !ready
        ? t("review.loadingModel")
        : behind
          ? t("review.earlierVersion")
          : review.state?.locked
            ? t("review.openElsewhere")
            : review.blockedText(can.blocked) || t("review.current");
    review.updateReceipt();
    review.renderVersions();
    review.updatePublicationNotices();
    review.$("#pending-banner").hidden = !behind;
    if (behind)
      review.$("#pending-text").textContent = t("version.pinnedNotice", {
        version: latest.version || latest.name,
      });
    review.$("#resume-banner").hidden =
      !review.state?.locked || review.accessBlocked;
    document
      .querySelectorAll(".delete-annotation, .edit-action")
      .forEach((b) => (b.disabled = busy || !can.canEdit));
    review.showMeasure();
  }

  function setMode(next) {
    review.mode = next;
    if (next !== "relocate") review.relocatingId = null;
    review.viewer.setVisible(true);
    review.showMarksToggle();
    review.viewer.setMode(next);
    document
      .querySelectorAll("[data-mode]")
      .forEach((b) => b.classList.toggle("active", b.dataset.mode === next));
    review.$("#fill-control").hidden = next !== "fill";
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
      orbit: t("hint.orbit"),
      pan: t("hint.pan"),
      measure: t(review.MEASURE_HINTS[review.viewer.measureKind]),
    }[next];
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
    button.innerHTML = `${review.icon(name)}<span>${review.esc(t(caption))}</span>`;
  }

  Object.assign(review, { updateButtons, setMode, updatePalette, showToggle });
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
  for (const [mode, labelKey, titleKey, captionKey, icon] of [
    ["orbit", "tool.orbitLabel", "tool.orbitTitle", "tool.orbit", "orbit"],
    ["label", "tool.labelLabel", "tool.labelTitle", "tool.label", "pin"],
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
      group: "tools",
      attributes: {
        "data-mode": mode,
        class: `tool${mode === "orbit" ? " active" : ""}`,
      },
      // Measuring changes nothing; keeping a measurement is the edit.
      enabled: () =>
        mode === "measure"
          ? ready()
          : idle() && !!review.state?.capabilities?.canEdit,
      run: () => review.setMode(mode),
    });
    if (mode === "orbit") registerPanTool(review, ready);
  }
  review.commands.register({
    id: "section",
    labelKey: "section.title",
    captionKey: "section.title",
    icon: "section",
    group: "tools",
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
    group: "display",
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
    group: "display",
    attributes: { id: "neutral-view", class: "tool", "aria-pressed": "false" },
    run: () => {
      review.viewer.setNeutral(!review.viewer.neutral);
      review.showToggle(
        "#neutral-view",
        review.viewer.neutral,
        review.viewer.neutral ? "view.original" : "view.plain",
        "plain",
        "tool.plain",
      );
    },
  });
  review.commands.register({
    id: "home",
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
  };
  const mount = (command) => {
    if (!command.group) return;
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
      (command.captionKey
        ? `<span>${review.esc(t(command.captionKey))}</span>`
        : "");
    slot.append(button);
  };
  review.commands.list().forEach(mount);
  review.commands.onRegister((command) => {
    mount(command);
    review.refreshCommands();
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-command]");
    if (button && !button.disabled) review.commands.run(button.dataset.command);
  });
}
