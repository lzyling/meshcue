import * as THREE from "three";
import { faceRegion } from "../face-region.js";
import {
  easeNavigation,
  fitFrame,
  visibleHeight,
  perspectiveDistance,
  rotateDirection,
  zoomLimits,
} from "./navigation-math.js";

export class NavigationMethods {
  setupNavigation() {
    this.navigationPointers = new Set();
    this.pivotDot = document.createElement("span");
    this.pivotDot.className = "navigation-pivot";
    this.pivotDot.hidden = true;
    this.container.append(this.pivotDot);
    this.controls.addEventListener("start", () => {
      this.navigationFitOnLayout = false;
    });
    const canvas = this.renderer.domElement;
    canvas.addEventListener(
      "pointerdown",
      (e) => {
        this.cancelNavigation();
        this.navigationPointers.add(e.pointerId);
        this.navigationPointer = null;
        this.clearNavigationHover();
        this.controls.mouseButtons.LEFT =
          // Shift has always meant pan. Keep LEFT as ROTATE for that
          // modifier because OrbitControls swaps ROTATE and PAN on Shift.
          e.shiftKey || this.mode === "orbit"
            ? THREE.MOUSE.ROTATE
            : this.mode === "pan"
              ? THREE.MOUSE.PAN
              : null;
        this.controls.touches.ONE =
          this.mode === "pan" ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
        if (this.mode === "pan") canvas.style.cursor = "grabbing";
        this.navigationRotating =
          (e.pointerType === "touch" && this.mode !== "pan") ||
          (!e.shiftKey &&
            (e.button === 2 || (e.button === 0 && this.mode === "orbit")));
      },
      true,
    );
    const release = (e) => {
      this.navigationPointers.delete(e.pointerId);
      if (!this.navigationPointers.size) {
        this.navigationRotating = false;
        if (this.mode === "pan") canvas.style.cursor = "grab";
      }
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    canvas.addEventListener("pointermove", (e) => {
      this.navigationPointer =
        e.pointerType === "mouse" && !e.buttons ? [e.clientX, e.clientY] : null;
      this.navigationHoverDirty = true;
    });
    canvas.addEventListener("pointerleave", () => {
      this.navigationPointer = null;
      this.clearNavigationHover();
    });
    canvas.addEventListener(
      "wheel",
      () => {
        this.navigationFitOnLayout = false;
        this.cancelNavigation();
      },
      {
        capture: true,
        passive: true,
      },
    );
    canvas.addEventListener("dblclick", (e) => {
      if (!this.enabled || this.mode !== "orbit" || e.button !== 0) return;
      const hit = this.rayAt(e.clientX, e.clientY);
      if (!hit) return this.fitAll();
      const shift = hit.point.clone().sub(this.controls.target);
      this.animateNavigation(
        this.camera.position.clone().add(shift),
        hit.point.clone(),
      );
    });
    this.controls.addEventListener("change", () => {
      // Keyboard pan/zoom and framing a mark also move the camera without a
      // pointer start. Only load/restore may opt back into automatic fitting.
      this.navigationFitOnLayout = false;
      this.navigationHoverDirty = true;
      this.updateNavigationProjection();
    });
    this.addFrameHook(() => this.navigationFrame());
    try {
      if (localStorage.getItem("meshcue-projection") === "orthographic")
        this.setProjection("orthographic", false);
    } catch {
      /* Storage denial must not prevent reviewing a model. */
    }
  }

  cancelNavigation() {
    this.navigationAnimation = null;
    this.navigationNormal = null;
  }

  animateNavigation(
    position,
    target,
    { animate = true, height = this.navigationHeight() } = {},
  ) {
    this.navigationFitOnLayout = false;
    this.cancelNavigation();
    const start = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      height: this.navigationHeight(),
    };
    if (!animate || this.reduceMotion.matches || !this.enabled) {
      this.applyNavigation(position, target, height);
      return;
    }
    this.navigationAnimation = {
      start,
      position,
      target,
      height,
      at: performance.now(),
    };
  }

  applyNavigation(position, target, height) {
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    if (this.camera.isOrthographicCamera)
      this.camera.zoom = (this.camera.top - this.camera.bottom) / height;
    this.camera.lookAt(target);
    this.controls.update();
    this.updateNavigationProjection();
    this.occlusionValid = false;
  }

  navigationFrame() {
    const animation = this.navigationAnimation;
    if (animation) {
      const t = Math.min(1, (performance.now() - animation.at) / 300);
      const eased = easeNavigation(t);
      // Interpolating spherical directions avoids passing through the target
      // during a front-to-back change, where a Cartesian lerp has no view.
      const from = animation.start.position.clone().sub(animation.start.target);
      const to = animation.position.clone().sub(animation.target);
      const q = new THREE.Quaternion().setFromUnitVectors(
        from.clone().normalize(),
        to.clone().normalize(),
      );
      const direction = from
        .clone()
        .normalize()
        .applyQuaternion(new THREE.Quaternion().slerp(q, eased));
      const target = animation.start.target
        .clone()
        .lerp(animation.target, eased);
      const position = target
        .clone()
        .addScaledVector(
          direction,
          THREE.MathUtils.lerp(from.length(), to.length(), eased),
        );
      this.applyNavigation(
        position,
        target,
        THREE.MathUtils.lerp(animation.start.height, animation.height, eased),
      );
      if (t === 1) {
        this.applyNavigation(
          animation.position,
          animation.target,
          animation.height,
        );
        this.navigationAnimation = null;
      }
    }
    this.updateNavigationProjection();
    this.pivotDot.hidden = !this.navigationRotating || !this.enabled;
    if (!this.pivotDot.hidden) {
      const [x, y] = this.toScreen(this.controls.target);
      const rect = this.container.getBoundingClientRect();
      this.pivotDot.style.transform = `translate(${x - rect.left}px, ${y - rect.top}px)`;
    }
    if (!["orbit", "pan"].includes(this.mode)) {
      this.navigationHover = false;
      this.navigationHoverTarget = null;
    }
    if (
      !["orbit", "pan"].includes(this.mode) ||
      !this.enabled ||
      this.navigationPointers.size ||
      !this.navigationPointer
    ) {
      this.clearNavigationHover();
      return;
    }
    if (!this.navigationHoverDirty) return;
    this.navigationHoverDirty = false;
    // Share the bucket's connected-face definition, but the measurement
    // hover's plain green tint: stripes would imply a mark had been placed.
    // Picking occurs once per dirty frame and uses the section-aware ray.
    const hit = this.rayAt(...this.navigationPointer);
    if (!hit) return this.clearNavigationHover();
    const mesh = hit.object;
    const seed = mesh.geometry.userData.sourceFaces[hit.faceIndex];
    this.previewOverlay.visible = true;
    if (
      this.navigationHoverTarget?.mesh === mesh &&
      this.navigationHoverTarget.seed === seed
    )
      return;
    this.clearNavigationHover();
    const faces = faceRegion(
      mesh.userData.fillTopology,
      seed,
      this.fillTolerance,
    );
    this.addFaces(this.previewOverlay, mesh, faces, true);
    this.navigationHoverTarget = { mesh, seed };
    this.navigationHoverFaces = faces.length;
    this.navigationHover = true;
  }

  clearNavigationHover() {
    if (!this.navigationHover) return;
    this.clearOverlay(this.previewOverlay);
    this.navigationHoverTarget = null;
    this.navigationHoverFaces = 0;
    this.navigationHover = false;
  }

  navigationHeight() {
    return this.camera.isOrthographicCamera
      ? (this.camera.top - this.camera.bottom) / this.camera.zoom
      : visibleHeight(
          this.camera.position.distanceTo(this.controls.target),
          this.camera.fov,
        );
  }

  updateNavigationProjection() {
    const camera = this.camera;
    if (camera.isOrthographicCamera) {
      camera.left = -camera.top * camera.aspect;
      camera.right = camera.top * camera.aspect;
    }
    const distance = camera.position.distanceTo(this.controls.target);
    const size = this.navigationSize || 3;
    camera.near = Math.max(size * 1e-6, distance * 1e-4);
    camera.far = Math.max(size * 4, distance + size * 4);
    camera.updateProjectionMatrix();
  }

  setProjection(projection, remember = true) {
    const ortho = projection === "orthographic";
    if (!!this.camera.isOrthographicCamera === ortho) return;
    this.cancelNavigation();
    const old = this.camera,
      height = this.navigationHeight();
    const camera = ortho
      ? new THREE.OrthographicCamera(
          (-height * old.aspect) / 2,
          (height * old.aspect) / 2,
          height / 2,
          -height / 2,
          old.near,
          old.far,
        )
      : new THREE.PerspectiveCamera(old.fov, old.aspect, old.near, old.far);
    camera.fov = old.fov;
    camera.aspect = old.aspect;
    camera.position.copy(old.position);
    camera.up.copy(old.up);
    if (!ortho)
      camera.position
        .copy(this.controls.target)
        .addScaledVector(
          old.position.clone().sub(this.controls.target).normalize(),
          perspectiveDistance(height, old.fov),
        );
    this.camera = camera;
    this.controls.object = camera;
    camera.lookAt(this.controls.target);
    this.controls.update();
    this.updateNavigationProjection();
    this.updateNavigationLimits();
    this.occlusionValid = false;
    if (remember) {
      try {
        localStorage.setItem("meshcue-projection", projection);
      } catch {
        /* Optional preference. */
      }
    }
    this.onProjection?.(ortho);
  }

  visibleNavigationBounds() {
    const box = new THREE.Box3();
    this.root.updateMatrixWorld(true);
    for (const mesh of this.meshes) {
      let visible = true;
      for (let node = mesh; node; node = node.parent) visible &&= node.visible;
      if (
        !visible ||
        (this.parts && !this.parts.meshVisible(mesh.userData.reviewId))
      )
        continue;
      mesh.geometry.computeBoundingBox();
      box.union(
        mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),
      );
    }
    return box;
  }

  updateNavigationLimits(box = this.visibleNavigationBounds()) {
    if (!box.isEmpty())
      this.navigationSize = box.getSize(new THREE.Vector3()).length();
    const { min, max } = zoomLimits(this.navigationSize || 3);
    this.controls.minDistance = min;
    this.controls.maxDistance = max;
    if (this.camera.isOrthographicCamera) {
      this.controls.minZoom =
        (this.camera.top - this.camera.bottom) /
        visibleHeight(max, this.camera.fov);
      this.controls.maxZoom =
        (this.camera.top - this.camera.bottom) /
        visibleHeight(min, this.camera.fov);
    }
  }

  /* Public feature seam: box is in preview/world coordinates, as returned by
     visibleNavigationBounds. A part-tree caller can supply its own selection
     bounds without changing camera direction or reaching into controls. */
  fitTo(
    box,
    {
      animate = true,
      direction = this.camera.position.clone().sub(this.controls.target),
    } = {},
  ) {
    if (box.isEmpty()) return;
    this.updateNavigationLimits(box);
    const frame = fitFrame(
      box,
      direction,
      this.camera.aspect,
      this.camera.fov,
      !!this.camera.isOrthographicCamera,
      this.navigationViewport?.(),
    );
    this.animateNavigation(frame.position, frame.target, {
      animate,
      height: frame.height,
    });
  }
  fitAll(options) {
    this.fitTo(this.visibleNavigationBounds(), options);
  }
  rotateNavigation(horizontal, vertical) {
    this.cancelNavigation();
    const offset = this.camera.position.clone().sub(this.controls.target);
    const direction = rotateDirection(offset, horizontal, vertical);
    this.animateNavigation(
      this.controls.target.clone().addScaledVector(direction, offset.length()),
      this.controls.target.clone(),
    );
  }

  zoomNavigation(factor, x, y) {
    this.cancelNavigation();
    const camera = this.camera,
      target = this.controls.target;
    const rect = this.renderer.domElement.getBoundingClientRect();
    x ??= rect.left + rect.width / 2;
    y ??= rect.top + rect.height / 2;
    const hit = this.rayAt(x, y);
    const normal = target.clone().sub(camera.position).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      normal,
      hit?.point || target,
    );
    const anchor = this.ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!anchor) return;
    if (camera.isOrthographicCamera) {
      const zoom = THREE.MathUtils.clamp(
        camera.zoom / factor,
        this.controls.minZoom,
        this.controls.maxZoom,
      );
      factor = camera.zoom / zoom;
      camera.zoom = zoom;
      const shift = anchor
        .clone()
        .sub(target)
        .addScaledVector(normal, -anchor.clone().sub(target).dot(normal))
        .multiplyScalar(1 - factor);
      camera.position.add(shift);
      target.add(shift);
    } else {
      const distance = camera.position.distanceTo(target);
      factor =
        THREE.MathUtils.clamp(
          distance * factor,
          this.controls.minDistance,
          this.controls.maxDistance,
        ) / distance;
      const rayOffset = anchor.clone().sub(camera.position);
      const depth = rayOffset.dot(normal);
      if (depth <= 0) return;
      const shift = rayOffset.multiplyScalar((distance * (1 - factor)) / depth);
      camera.position.add(shift);
      // Move the pivot only across the screen plane. Moving it forward with
      // the camera would leave orbit distance unchanged and defeat the zoom
      // limits, especially when inspecting a surface in front of the pivot.
      target.add(shift.clone().addScaledVector(normal, -shift.dot(normal)));
    }
    this.controls.update();
    this.updateNavigationProjection();
    this.occlusionValid = false;
  }

  navigationRayTo(world) {
    // Perspective rays originate at the eye; retaining that construction also
    // lets geometry-only consumers supply a position without a renderer.
    if (!this.camera.isOrthographicCamera) {
      this.ray.set(
        this.camera.position,
        world.clone().sub(this.camera.position).normalize(),
      );
      return;
    }
    this.camera.updateMatrixWorld();
    const screen = world.clone().project(this.camera);
    this.ray.setFromCamera(new THREE.Vector2(screen.x, screen.y), this.camera);
  }

  normalToPointer() {
    if (!this.navigationPointer) return false;
    const hit = this.rayAt(...this.navigationPointer);
    if (!hit) return false;
    const normal = hit.face.normal
      .clone()
      .applyNormalMatrix(
        new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld),
      )
      .normalize();
    const same =
      this.navigationNormal?.pointer === this.navigationPointer.join(",");
    if (same) normal.copy(this.navigationNormal.normal).negate();
    this.viewFrom(normal.x, normal.y, normal.z);
    this.navigationNormal = {
      pointer: this.navigationPointer.join(","),
      normal: normal.clone(),
    };
    return true;
  }
}
