import { newId } from "../browser-crypto.js";
import { t, currentLocale } from "../i18n/index.js";
import { paintIndex, addPatches } from "../annotation-edits.js";
import { sameMarkTarget } from "../mark-target.js";
export function installAnnotationsPanel(review) {
  function onPin(pin) {
    const previous = review.annotations.find(
      (a) => !review.submittedMarkIds?.has(a.id) && sameMarkTarget(a, pin),
    );
    if (previous) {
      previous.color = review.color;
      const explode = review.viewer.markView()?.explode;
      if (explode?.amount > 0) previous.view = { ...previous.view, explode };
      review.selectedId = previous.id;
      review.changed();
      return;
    }
    if (review.annotations.length >= 200) return review.toast(t("marks.limit"));
    const item = {
      id: newId(),
      type: "pin",
      label: review.nextLabel(),
      color: review.color,
      ...pin,
      view: review.viewer.markView(),
    };
    if (review.draftBytes() + review.markBytes(item) > review.MAX_MARK_BYTES)
      return review.toast(t("marks.nearStrokeLimit"));
    review.annotations.push(item);
    review.selectedId = item.id;
    review.changed();
  }

  function regionName(a) {
    return t("marks.regionName", { color: review.colorName(a.color) });
  }

  // What a mark is called wherever it is named: its letter, its colour, or its
  // number as a measurement.
  function markName(a) {
    return ["pin", "edge", "part"].includes(a.type)
      ? a.label
      : a.type === "measure"
        ? t("measure.name", { label: a.label })
        : review.regionName(a);
  }

  function formatMeasure(m) {
    const two = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    if (m.quantity === "angle")
      return `${new Intl.NumberFormat(currentLocale(), two).format(m.value)}\u00b0`;
    const number = new Intl.NumberFormat(
      currentLocale(),
      review.loadedUnits === "mm" || Math.abs(m.value) >= 1
        ? two
        : { minimumSignificantDigits: 3, maximumSignificantDigits: 3 },
    ).format(m.value);
    const length =
      review.loadedUnits === "unspecified"
        ? t("measure.unitless", { value: number })
        : `${number} ${review.loadedUnits}`;
    return m.quantity === "diameter"
      ? t("measure.diameter", { value: length })
      : length;
  }

  /* Every tool that still reaches this hands over entire source faces — the
   bucket by construction — so a mark is the numbers of the faces it claims and
   nothing else. Partial coverage of a face arrived with the brush and left with
   it; `source-v1` marks already on disk still carry polygons and still render,
   but nothing new writes one. */
  function onPaint(patches) {
    patches = patches.map((p) => ({ ...p, faceIndex: p.sourceFaceIndex }));
    /* Measured in bytes, because bytes are what runs out. The old guard counted
     patches and stopped at forty thousand of them — about eleven megabytes,
     twice what a browser will hold — so the warning it exists to give could
     never arrive before the quota did, and the reviewer met "local storage is
     full" instead of "submit this batch". */
    if (
      review.draftBytes() +
        patches.reduce(
          (n, p) =>
            n + (p.whole ? review.WHOLE_FACE_BYTES : review.patchBytes(p)),
          0,
        ) >
      review.MAX_MARK_BYTES
    ) {
      review.toast(t("marks.nearStrokeLimit"));
      return;
    }
    let region = review.annotations.find(
      (a) =>
        a.id === review.selectedId &&
        a.type === "region" &&
        a.color === review.color &&
        a.coverage === "source-v2",
    );
    const targetFaces = new Set(
      Object.entries(region?.faces || {}).flatMap(([meshId, ids]) =>
        ids.map((id) => `${meshId}:${id}`),
      ),
    );
    for (const p of patches) targetFaces.add(review.faceOf(p));
    const otherFaces = review.annotations
      .filter((a) => a !== region)
      .reduce((n, a) => n + review.faceCountOf(a), 0);
    /* A round used to stop at twenty thousand faces. That number was never about
     faces — it was the byte budget written a second way, back when a face cost
     a polygon repeating its own triangle: twenty thousand times about 142
     bytes is very nearly the three megabytes above. Under `source-v2` a whole
     face costs its number, so the same budget now holds the whole of any model
     up to roughly 440,000 source faces. Measured: every one of the self-test
     slab's 97,280 faces is 572,800 bytes, 19% of the budget.

     So the model is the limit, which is what a limit here should have been all
     along, and the bytes above are the one that can still be reached. */
    if (otherFaces + targetFaces.size > review.viewer.sourceFaceCount()) {
      review.toast(t("marks.nearMarkLimit"));
      return;
    }
    if (!region) {
      if (review.annotations.length >= 200) return;
      region = {
        id: newId(),
        type: "region",
        label: review.regionName({ color: review.color }),
        color: review.color,
        coverage: "source-v2",
        faces: {},
        surfacePatches: [],
      };
      review.annotations.push(region);
      review.selectedId = region.id;
    }
    review.paint = addPatches(
      region,
      patches,
      paintIndex(region, review.paint),
    );
    // The latest stroke is the view that counts: a region painted from two sides
    // is described from the side it was finished on.
    region.view = review.viewer.markView();
    review.changed();
  }

  function renderAnnotations() {
    if (review.renderFrame) return;
    review.renderFrame = requestAnimationFrame(() => {
      review.renderFrame = null;
      for (const id of review.hiddenMarks)
        if (!review.annotations.some((a) => a.id === id))
          review.hiddenMarks.delete(id);
      review.viewer.setAnnotations(
        review.annotations.filter((a) => !review.hiddenMarks.has(a.id)),
        review.selectedId,
      );
      review.$("#annotation-count").textContent = review.annotations.length;
      const list = review.$("#annotations-list");
      list.replaceChildren();
      if (!review.annotations.length) {
        const div = document.createElement("div");
        div.className = "annotation-empty";
        div.textContent = t("marks.empty");
        list.append(div);
      }
      for (const a of review.annotations) {
        const row = document.createElement("div");
        row.className = `annotation-row ${a.id === review.selectedId ? "selected" : ""}`;
        row.dataset.annotationId = a.id;
        const hidden = review.hiddenMarks.has(a.id);
        const eye = document.createElement("button");
        eye.className = `mark-eye${hidden ? " off" : ""}`;
        eye.innerHTML = review.icon(hidden ? "eye-off" : "eye");
        eye.setAttribute("aria-pressed", String(hidden));
        eye.setAttribute(
          "aria-label",
          t(hidden ? "marks.showOne" : "marks.hideOne", {
            name: review.markName(a),
          }),
        );
        eye.addEventListener("click", () => {
          if (review.hiddenMarks.has(a.id)) review.hiddenMarks.delete(a.id);
          else review.hiddenMarks.add(a.id);
          renderAnnotations();
        });
        const select = document.createElement("button");
        select.className = "annotation-select";
        const badge = document.createElement("span");
        badge.className = "annotation-badge";
        if (a.type === "measure") badge.classList.add("measure-badge");
        else badge.style.background = a.color;
        badge.textContent = a.type === "region" ? "" : a.label;
        const text = document.createElement("span");
        const title = document.createElement("strong");
        // A measurement is named by what it read.
        title.textContent = ["edge", "part"].includes(a.type)
          ? t(`marks2.${a.type}`)
          : a.type === "pin"
            ? t("marks.pin")
            : a.type === "measure"
              ? review.formatMeasure(a)
              : review.regionName(a);
        if (["edge", "part"].includes(a.type)) {
          title.className = "annotation-type-title";
          const icon = document.createElement("span");
          icon.className = "annotation-type-icon";
          icon.setAttribute("aria-hidden", "true");
          icon.innerHTML = review.icon(`mark-${a.type}`);
          title.prepend(icon);
        }
        const detail = document.createElement("small");
        // What the reviewer wrote says more about a mark than how it was made.
        if (a.note) detail.className = "annotation-note";
        detail.textContent =
          a.note ||
          (["edge", "part"].includes(a.type)
            ? a.names?.join(", ") ||
              review.formatMeasure({ value: a.length, quantity: "length" })
            : a.type === "pin"
              ? t("marks.pinned")
              : a.type === "measure"
                ? t(review.MEASURE_KINDS[a.kind])
                : ["source-v1", "source-v2"].includes(a.coverage)
                  ? t("marks.alongSurface")
                  : t("marks.legacyFace"));
        text.append(title, detail);
        select.append(badge, text);
        select.addEventListener("click", () => {
          review.selectedId = a.id;
          // A measurement has no colour to hand the palette.
          if (a.color) {
            review.color = a.color;
            review.updatePalette();
          }
          renderAnnotations();
        });
        const remove = document.createElement("button");
        remove.className = "delete-annotation";
        remove.innerHTML = review.icon("trash");
        remove.setAttribute(
          "aria-label",
          a.type === "pin"
            ? t("marks.deleteLabel", { label: a.label })
            : t("marks.deleteOne", { name: review.markName(a) }),
        );
        remove.disabled =
          !!(review.state?.locked && !review.state?.owned) ||
          review.submitting ||
          review.recoveryBlocked;
        remove.addEventListener("click", async () => {
          try {
            if (!(await review.beginEdit())) return;
            review.annotations = review.annotations.filter(
              (x) => x.id !== a.id,
            );
            if (review.selectedId === a.id) review.selectedId = null;
            review.changed();
            await review.flushDraft();
          } catch (e) {
            review.toast(e.message);
          }
        });
        const focus = document.createElement("button");
        focus.className = "quiet-dark annotation-action";
        focus.textContent = t("marks.frame");
        focus.setAttribute(
          "aria-label",
          t("marks.frameOne", { name: review.markName(a) }),
        );
        focus.addEventListener("click", () => review.viewer.focusAnnotation(a));
        const actions = document.createElement("div");
        actions.className = "annotation-actions";
        actions.append(focus);
        row.append(eye, select, actions);
        if (a.type === "pin") {
          const move = document.createElement("button");
          move.className = "quiet-dark annotation-action edit-action";
          move.textContent = t("marks.move");
          move.setAttribute(
            "aria-label",
            t("marks.moveLabel", { label: a.label }),
          );
          move.disabled = remove.disabled;
          move.addEventListener("click", () => {
            review.relocatingId = a.id;
            review.setMode("relocate");
            review.toast(t("marks.moveHint", { label: a.label }));
          });
          actions.append(move);
        }
        actions.append(remove);
        list.append(row);
      }
      review.renderNote();
      review.revealSelectedMark();
    });
  }

  function revealSelectedMark() {
    const list = review.$("#annotations-list");
    const row = list.querySelector(".selected");
    if (!row || list.hidden) return;
    // Scroll only the list: scrollIntoView can move the whole phone page and
    // hide the note field we have just made room for. Read after note layout.
    const seat = row.getBoundingClientRect(),
      rail = list.getBoundingClientRect();
    if (seat.top < rail.top) list.scrollTop -= rail.top - seat.top;
    else if (seat.bottom > rail.bottom)
      list.scrollTop += seat.bottom - rail.bottom;
  }

  function renderNote() {
    const a = review.annotations.find((x) => x.id === review.selectedId);
    const box = review.noteBox();
    review.$("#mark-note").hidden = !a || review.$("#annotations-list").hidden;
    if (!a) return;
    review.$("#mark-note-title").textContent = t("note.title", {
      name: review.markName(a),
    });
    // Never rewritten under someone typing into it; it is refreshed from the
    // mark as soon as they leave it.
    if (document.activeElement !== box || box.dataset.markId !== a.id) {
      box.dataset.markId = a.id;
      box.value = a.note || "";
    }
    review.$("#mark-note-count").textContent =
      `${box.value.length}/${review.MAX_NOTE}`;
  }

  function commitNote() {
    review.noteCommit = (async () => {
      const box = review.noteBox();
      const id = box.dataset.markId;
      if (!review.annotations.some((a) => a.id === id)) return;
      review.$("#mark-note-count").textContent =
        `${box.value.length}/${review.MAX_NOTE}`;
      // One undo step per visit to the box, not one per keystroke: `beginEdit`
      // is what takes the snapshot, so it is asked once and its answer kept.
      if (review.noteEdit?.id !== id)
        review.noteEdit = { id, ready: review.beginEdit() };
      let allowed = false;
      try {
        allowed = await review.noteEdit.ready;
      } catch (e) {
        review.toast(e.message);
      }
      const a = review.annotations.find((x) => x.id === id);
      if (!a) return;
      if (!allowed) {
        review.noteEdit = null;
        box.value = a.note || "";
        return review.renderNote();
      }
      const text = box.value.trim();
      if (text === (a.note || "")) return;
      if (text) a.note = text;
      else delete a.note;
      // Writing about a mark is looking at it: the view it carries is the one
      // the words were written from.
      a.view = review.viewer.markView();
      review.changed();
    })();
    return review.noteCommit;
  }

  Object.assign(review, {
    onPin,
    regionName,
    markName,
    formatMeasure,
    onPaint,
    renderAnnotations,
    revealSelectedMark,
    renderNote,
    commitNote,
  });
}

export function initializeAnnotations(review) {
  /* A colour is named, not described: the swatch is already on screen, so the
   word is there to be said out loud in the original conversation. A colour with
   no name falls back to its hex, which is still something to point at. */
  review.colorKeys = {
    "#e76d5c": "color.red",
    "#e6b64b": "color.yellow",
    "#6ab398": "color.green",
    "#629bd8": "color.blue",
    "#ae82ce": "color.purple",
  };

  review.colorName = (hex) =>
    review.colorKeys[hex] ? t(review.colorKeys[hex]) : hex;

  /* A measurement is read in the reviewer's own numbers -- "12,40 mm" to a
   German reader -- in the unit the author declared. Millimetres get two
   decimals. With no declared unit nothing is assumed: the number stands
   alone and says it has no unit, as the model's own summary does. */
  review.MEASURE_KINDS = {
    points: "measure.points",
    edge: "measure.edge",
    planes: "measure.planes",
    circle: "measure.circle",
  };

  review.MEASURE_HINTS = {
    points: "hint.measurePoints",
    edge: "hint.measureEdge",
    planes: "hint.measurePlanes",
    circle: "hint.measureCircle",
  };

  review.MEASURE_REFUSALS = {
    noEdge: "measure.noEdge",
    curved: "measure.curved",
    sameFace: "measure.sameFace",
    curvedFace: "measure.curvedFace",
    noCircle: "measure.noCircle",
  };

  // What to click next, by what is being measured and how many are in.
  review.MEASURE_NEXT = {
    points: ["measure.nextPoint"],
    planes: ["measure.nextFace"],
    circle: ["measure.circleSecond", "measure.circleThird"],
  };

  // Measurements are numbered on their own, M1, M2, after the highest kept.
  review.measureNumber = (label) => Number(/^M(\d+)$/.exec(label)?.[1] || 0);

  review.nextMeasureLabel = () =>
    `M${
      Math.max(
        0,
        ...review.annotations
          .filter((a) => a.type === "measure")
          .map((a) => review.measureNumber(a.label)),
      ) + 1
    }`;

  /* Browsers give an origin about 5 MB of local storage, and a review has to fit
   inside it with room for the recovery copy an unsynced draft is entitled to.
   The estimate is deliberately rough and deliberately high: a coordinate that
   rounds short costs fewer bytes than budgeted, never more. */
  review.MAX_MARK_BYTES = 3_000_000;

  review.patchBytes = (p) => 64 + (p.vertices?.length || 0) * 26;

  // A face taken whole is its own number in `faces` and nothing else: six digits
  // and a comma where a polygon repeating the same triangle charged 142 bytes.
  review.WHOLE_FACE_BYTES = 8;

  review.faceOf = (p) => `${p.meshId}:${p.faceIndex}`;

  review.faceCountOf = (a) =>
    a.type === "pin"
      ? 1
      : Object.values(a.faces || {}).reduce((m, f) => m + f.length, 0);

  // Held to the service's number by `tests/round-budget.test.mjs`
  // (`MARK_VIEW_BYTES`), like `MAX_NOTE` above. A note is charged what it weighs
  // in UTF-8, which is at least what the browser stores.
  review.VIEW_BYTES = 240;

  // What a kept measurement adds to a mark: two points, what they were taken
  // on, the number, and for two faces their normals -- or for a circle three
  // points, a centre and a normal. Held to the service's `MARK_MEASURE_BYTES` by
  // the same test.
  review.MEASURE_BYTES = 640;

  review.encoder = new TextEncoder();

  review.markBytes = (a) =>
    120 +
    review.encoder.encode(a.note || "").length +
    (a.view ? review.VIEW_BYTES : 0) +
    (a.type === "measure" ? review.MEASURE_BYTES : 0) +
    (["edge", "part"].includes(a.type)
      ? review.encoder.encode(JSON.stringify(a)).length
      : 0) +
    (a.surfacePatches || []).reduce((m, p) => m + review.patchBytes(p), 0) +
    (review.faceCountOf(a) -
      new Set((a.surfacePatches || []).map(review.faceOf)).size) *
      review.WHOLE_FACE_BYTES;

  review.draftBytes = () =>
    review.annotations.reduce((n, a) => n + review.markBytes(a), 0);

  review.paint = null;
}

export function bindAnnotationEditing(review) {
  review.viewer.onObjectMark = review.onPin;
  review.viewer.onSelect = (id) => {
    review.selectedId = id;
    review.renderAnnotations();
  };

  review.viewer.onRelocate = (pin) => {
    const a = review.annotations.find(
      (a) => a.id === review.relocatingId && a.type === "pin",
    );
    if (!a) return;
    Object.assign(a, pin, { view: review.viewer.markView() });
    review.selectedId = a.id;
    review.relocatingId = null;
    review.setMode("orbit");
    review.changed();
  };

  /* Hiding a mark is a way of looking, not a way of editing: it never reaches
   the draft or the submission, only what the viewer is asked to draw. Keyed by
   id so the list still shows every mark, including the hidden ones. */
  review.hiddenMarks = new Set();

  /* The note belongs to the selected mark and sits under the list rather than in
   it. The list is rebuilt on every change, and a text box rebuilt under the
   reviewer's cursor loses its focus, its caret and — halfway through a word in
   an input method — the word. */
  review.noteBox = () => review.$("#mark-note-text");

  review.noteEdit = null;

  review.noteCommit = null;

  review.noteBox().addEventListener("input", (e) => {
    // Mid-composition the box holds a guess the input method has not settled;
    // the word arrives with `compositionend`.
    if (!e.isComposing) review.commitNote();
  });

  review
    .noteBox()
    .addEventListener("compositionend", () => review.commitNote());

  review.noteBox().addEventListener("blur", () => {
    review.noteEdit = null;
    review.renderAnnotations();
  });
}

export function bindAnnotationsPanel(review) {
  review.$("#new-region").addEventListener("click", () => {
    review.selectedId = null;
    review.renderAnnotations();
    review.setMode("fill");
    review.toast(t("tool.newRegionHint"));
  });
}
