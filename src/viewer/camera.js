import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { V } from "./shared.js";

/* How far off the pole a top or bottom view stands, in radians. Far enough
   from the 1e-6 OrbitControls clamps to, too little to see. */
const POLE_OFFSET = 1e-4;
export class CameraMethods {
  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.15;
    this.controls.maxDistance = 18;
    /* The left button belongs to marking, in every mode. It used to be shared
       with the camera, which is why painting meant either holding Option to
       steal a rotation or switching tools to turn the model and switching back.
       Rotation moves to the right button, panning to the middle one. */
    this.controls.mouseButtons = {
      LEFT: null,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
  }

  /* Nothing here asks which device is turning the wheel, because that question
     has no reliable answer and asking it was the bug. A mouse and a trackpad
     are both `pointerType: "mouse"`, so the wheel was all there was to go on —
     and on macOS both go through the same scroll acceleration, where a mouse
     notch arrives small and fractional, indistinguishable from a trackpad
     glide. Every Mac was therefore read as a trackpad and had its wheel turned
     into a pan, on a laptop with a mouse plugged in no less.

     So the wheel means one thing on every device: zoom, which is what a wheel
     is for and what a two-finger glide does on every other page. Pan is Shift
     plus the same gesture, and stays on the middle button for anyone holding a
     mouse. Pinch keeps zooming for free — the browser reports it as a ctrl-held
     wheel, which OrbitControls already dollies.

     Handled in the capture phase so OrbitControls, which would otherwise dolly
     on every wheel event, never sees the ones that mean something else here. */
  wheel(e) {
    if (!this.enabled || !e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    /* Shift+wheel is the browser's horizontal-scroll convention, so a device
       with one axis has it delivered in `deltaX` on some platforms and `deltaY`
       on others. A pan is two-dimensional either way: move by whatever axes
       arrive and it follows the gesture on both. */
    this.panBy(e.deltaX, e.deltaY);
    this.render();
  }
  /* The same arithmetic OrbitControls uses for its own panning: screen pixels
     scaled by how much world the camera covers at the distance it is orbiting. */
  panBy(dx, dy) {
    const height = this.renderer.domElement.clientHeight || 1;
    const distance = this.camera.position.distanceTo(this.controls.target);
    const perPixel =
      (2 * distance * Math.tan(((this.camera.fov / 2) * Math.PI) / 180)) /
      height;
    const right = new V().setFromMatrixColumn(this.camera.matrix, 0),
      up = new V().setFromMatrixColumn(this.camera.matrix, 1);
    const shift = right
      .multiplyScalar(dx * perPixel)
      .add(up.multiplyScalar(-dy * perPixel));
    this.camera.position.add(shift);
    this.controls.target.add(shift);
    this.controls.update();
  }
  cameraState() {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
    };
  }
  // Which way the top of the screen points in the world. `camera.up` is only
  // what lookAt was asked for; this is what the reviewer is actually shown.
  screenUp() {
    return new V(0, 1, 0).applyQuaternion(this.camera.quaternion).toArray();
  }
  /* Where the reviewer is looking from, in the model's own frame and units —
     the frame a region's `bounds` are in — so that it can travel with a mark.
     `cameraState` is the preview's: every model is scaled into a 3-unit box and
     centred there, and a STEP or STL stood upright, so those numbers mean
     nothing to anyone holding the file. The top of the screen goes with it
     because the camera's own up is always +Y in the preview, and so says
     nothing about which way the reviewer was holding the model when they
     called something "the top".

     Undoing `root` means inverting a matrix whose scale is 3/maxDim, which is
     not exact in binary; a coordinate that should be zero comes back as a
     residue that survives rounding (see `annotationBounds`). Anything smaller
     than a billionth of the model is that residue, and is written as zero. */
  markView() {
    this.root.updateMatrixWorld();
    const toModel = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const span = 3 / (this.root.scale.x || 1);
    const round = (v) =>
      Math.abs(v) < span * 1e-9 ? 0 : Number(v.toPrecision(6));
    const at = (v) => v.clone().applyMatrix4(toModel).toArray().map(round);
    const up = new V()
      .fromArray(this.screenUp())
      .transformDirection(toModel)
      .toArray()
      .map((v) => (Math.abs(v) < 1e-9 ? 0 : Number(v.toPrecision(6))));
    return {
      space: "model",
      position: at(this.camera.position),
      target: at(this.controls.target),
      up,
      fov: Number(this.camera.fov.toPrecision(6)),
      aspect: Number(this.camera.aspect.toPrecision(6)),
    };
  }
  restoreCamera(data) {
    if (!data) return;
    this.camera.position.fromArray(data.position);
    this.controls.target.fromArray(data.target);
    this.controls.update();
  }
  home() {
    // Flush residual OrbitControls damping before resetting; otherwise the
    // supposedly reset surface continues drifting under the next double click.
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    this.camera.position.set(4, 2.8, 5);
    this.controls.target.set(0, 0, 0);
    // Nothing moves the up vector any more (see `viewFrom`); kept so that
    // nothing that ever does can outlive a trip home.
    this.camera.up.set(0, 1, 0);
    this.controls.update();
    this.controls.enableDamping = damping;
  }
  /* Where the camera sits relative to what it is looking at, as the two angles
     a compass needs. Reported from the render loop but only when it actually
     changed, so a still scene costs nothing. */
  reportOrientation() {
    if (!this.onOrient) return;
    const d = this.scratch.orient
      .copy(this.camera.position)
      .sub(this.controls.target)
      .normalize();
    const yaw = Math.atan2(d.x, d.z) * (180 / Math.PI);
    const pitch = Math.asin(Math.min(1, Math.max(-1, d.y))) * (180 / Math.PI);
    if (
      this.orientAt &&
      Math.abs(this.orientAt.yaw - yaw) < 0.05 &&
      Math.abs(this.orientAt.pitch - pitch) < 0.05
    )
      return;
    this.orientAt = { yaw, pitch };
    this.onOrient(yaw, pitch);
  }
  /* A standard view changes only where the camera looks from. The target and
     the distance are kept, so picking a face reframes the model rather than
     resetting it — the reviewer keeps whatever they had zoomed in on. */
  viewFrom(x, y, z) {
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    const target = this.controls.target;
    const distance = Math.max(this.camera.position.distanceTo(target), 0.2);
    /* Straight down or straight up leaves the up vector parallel to the view,
       where it no longer says which way is up. This used to lay the up vector
       along the floor instead, and OrbitControls reads it once, when it is
       built: after a top or bottom view the orbit went on turning about +Y
       while lookAt used ±Z, and the right button turned the model some other
       way until a side face or home put it back. Standing a hair off the pole
       on the +Z side draws the same picture -- -Z at the top of the screen
       from above, +Z from below -- and the orbit never changes axis. */
    const vertical = Math.abs(y) > 0.9 && !x && !z;
    this.camera.position
      .set(x, y, vertical ? Math.abs(y) * Math.tan(POLE_OFFSET) : z)
      .normalize()
      .multiplyScalar(distance)
      .add(target);
    this.camera.lookAt(target);
    this.controls.update();
    this.controls.enableDamping = damping;
  }
}
