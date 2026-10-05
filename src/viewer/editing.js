import { planarFaces } from "../planar-fill.js";

export class EditingMethods {
  pointerDown(e) {
    this.clickStart = null;
    this.gestureStart = [e.clientX, e.clientY];
    this.lastGestureDragged = false;
    if (
      this.navigationPointers.size > 1 ||
      e.button !== 0 ||
      ["orbit", "pan"].includes(this.mode) ||
      e.shiftKey ||
      !this.enabled ||
      this.editPending ||
      this.pinPending
    )
      return;
    // Option on the left button still declines to mark, which is the habit the
    // old scheme taught. Rotating no longer needs it — the right button does
    // that in every mode — so it is kept as a way to not mark, nothing more.
    if (e.altKey) return;
    // A touch press may still become an orbit or pinch. Let OrbitControls
    // see it; only a single stationary contact earns a mark on release.
    if (e.pointerType !== "touch") {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
    /* Every remaining tool places its mark on a click, not on a drag, so the
       press only records where the click began; `click` asks `onEdit` for the
       draft and does the work. The drag branch left with the brush. */
    this.clickStart = [e.clientX, e.clientY];
  }
  pointerMove(e) {
    if (this.mode === "fill" && !e.buttons)
      this.previewFill(e.clientX, e.clientY);
    if (this.mode === "measure" && !e.buttons)
      this.hoverMeasure(e.clientX, e.clientY);
    if (
      this.gestureStart &&
      Math.hypot(
        e.clientX - this.gestureStart[0],
        e.clientY - this.gestureStart[1],
      ) > 4
    ) {
      this.lastGestureDragged = true;
      this.clickStart = null;
    }
  }
  pointerUp() {
    this.clickStart = null;
    this.gestureStart = null;
    if (this.editPending) return;
    this.controls.enabled = true;
  }
  setFillTolerance(value) {
    this.fillTolerance = value;
    if (this.fillTarget) this.computeFill(this.fillTarget);
  }
  previewFill(x, y) {
    const hit = this.rayAt(x, y);
    if (!hit) {
      this.fillTarget = null;
      this.clearOverlay(this.previewOverlay);
      return;
    }
    const target = {
      mesh: hit.object,
      seed: hit.object.geometry.userData.sourceFaces[hit.faceIndex],
    };
    if (
      this.fillTarget?.mesh === target.mesh &&
      this.fillTarget?.seed === target.seed
    )
      return;
    this.computeFill(target);
  }
  computeFill(target) {
    this.fillTarget = target;
    const { mesh, seed } = target;
    const selected = new Set(
      planarFaces(mesh.userData.fillTopology, seed, this.fillTolerance),
    );
    // Every one of these is an entire source face by construction, so each is
    // stored as its number alone. The bucket is the cheapest tool there is.
    const patches = [...selected].map((sourceFaceIndex) => ({
      meshId: mesh.userData.reviewId,
      faceIndex: sourceFaceIndex,
      sourceFaceIndex,
      vertices: mesh.userData.fillTopology.vertices[sourceFaceIndex],
      whole: true,
    }));
    /* The bucket had a ceiling of its own — twenty thousand faces, the round's
       old face limit, which was the byte budget in disguise back when each of
       those faces would have stored a polygon repeating its own triangle.
       Every one of them is now its number alone, so a fill spanning a whole
       connected surface is a few kilobytes and there is nothing left here to
       protect. The budget is still checked, where the marks are stored. */
    this.fillPatches = patches;
    this.drawPatches(this.previewOverlay, this.fillPatches, "#fcfcfc");
  }
  async clickEdit(e) {
    const start = this.clickStart;
    this.clickStart = null;
    if (
      !start ||
      Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 4 ||
      this.pinPending
    )
      return;
    // Measuring edits nothing, so it asks for no lock and leaves nothing to
    // undo; only keeping one does, and that is the page's to do.
    if (this.mode === "measure") return this.measureClick(e.clientX, e.clientY);
    const hit = this.rayAt(e.clientX, e.clientY);
    if (!hit) return;
    const epoch = this.editEpoch;
    const mode = this.mode,
      modelId = this.model?.id;
    /* Placing a label used to need a double click, so the habit arrives with
       the reviewer. Two single clicks in the same spot are that habit, not a
       request for two labels stacked on one another. */
    if (mode === "label") {
      const now = Date.now(),
        last = this.lastLabelAt;
      if (
        last &&
        now - last.time < 450 &&
        Math.hypot(e.clientX - last.x, e.clientY - last.y) < 8
      )
        return;
      this.lastLabelAt = { time: now, x: e.clientX, y: e.clientY };
    }
    if (mode === "fill") this.previewFill(e.clientX, e.clientY);
    const patches = this.fillPatches,
      pin = this.pinFromHit(hit);
    this.pinPending = true;
    try {
      if (
        !(await this.onEdit()) ||
        modelId !== this.model?.id ||
        epoch !== this.editEpoch
      )
        return;
      if (mode === "relocate") this.onRelocate?.(pin);
      else if (mode === "fill" && patches?.length) this.onPaint(patches);
      else if (mode === "label") {
        this.ripple(e.clientX, e.clientY);
        // Consumed by the next render, so only the mark just placed lands.
        // Every pin element is rebuilt on each pass, and animating whichever
        // ones are new would make a page refresh look like a hailstorm.
        this.placing = true;
        this.onPin(pin);
      }
      this.onStrokeEnd();
    } catch (e) {
      this.onError(e.message);
    } finally {
      this.pinPending = false;
    }
  }
}
