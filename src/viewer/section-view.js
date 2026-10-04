import {
  sectionPlane,
  sectionRange,
  retainedPoint,
  sectionIntersection,
} from "../section.js";
import * as THREE from "three";
import { V } from "./shared.js";

export class SectionViewMethods {
  // Section state never enters cameraState, markView or serialization. The
  // shared plane object changes in place so existing and newly drawn overlays
  // always agree, without rebuilding geometry as the slider moves.
  setSection(change) {
    if (change && !this.sectionBounds) return;
    const previous = this.section;
    if (!change) this.section = null;
    else {
      const axis = change.axis || previous?.axis || "x";
      const range = sectionRange(this.sectionBounds, axis);
      const offset =
        change.offset ??
        (previous?.axis === axis ? previous.offset : range.offset);
      this.section = {
        axis,
        flip: change.flip ?? previous?.flip ?? false,
        offset: Math.max(
          range.min,
          Math.min(range.max, Number.isFinite(offset) ? offset : range.offset),
        ),
      };
    }
    if (this.section) {
      const plane = sectionPlane(this.section, this.root.matrixWorld);
      // GPU plane tests use floats after the camera transform. Retain a tiny
      // margin in the fitted three-unit scene so a plane at the bounds does
      // not punch speckled holes through a face exactly on that boundary.
      plane.constant += 1e-6;
      if (this.sectionClips?.length) this.sectionClips[0].copy(plane);
      else this.sectionClips = [plane];
      if (!this.sectionCapMaterial) {
        // All source meshes contribute to ONE winding counter. Clearing per
        // mesh would fill cavity shells exported as separate STEP faces, and
        // would expose the shared faces of touching or overlapping solids.
        this.sectionStencilMaterials = [
          [THREE.BackSide, THREE.IncrementWrapStencilOp],
          [THREE.FrontSide, THREE.DecrementWrapStencilOp],
        ].map(([side, operation], pass) => {
          const material = new THREE.MeshBasicMaterial({
            side,
            colorWrite: false,
            depthWrite: false,
            depthTest: false,
            stencilWrite: true,
            stencilFunc: THREE.AlwaysStencilFunc,
            stencilFail: operation,
            stencilZFail: operation,
            stencilZPass: operation,
          });
          for (const mesh of this.meshes) {
            // The model owns this geometry; only the draw siblings and their
            // materials belong to the section, so disposal never frees it twice.
            const counter = new THREE.Mesh(mesh.geometry, material);
            counter.matrixAutoUpdate = false;
            counter.matrix.copy(mesh.matrixWorld);
            counter.renderOrder = -3 + pass;
            this.sectionCapGroup.add(counter);
          }
          return material;
        });
        this.sectionCapMaterial = new THREE.MeshBasicMaterial({
          color: this.sectionColor || "#bd801a",
          side: THREE.DoubleSide,
          toneMapped: false,
          fog: false,
          stencilWrite: true,
          stencilRef: 0,
          stencilFunc: THREE.NotEqualStencilFunc,
          stencilFail: THREE.KeepStencilOp,
          stencilZFail: THREE.KeepStencilOp,
          stencilZPass: THREE.KeepStencilOp,
        });
        const size =
          this.sectionBounds
            .getSize(new V())
            .multiply(this.root.scale)
            .length() * 1.01;
        this.sectionCap = new THREE.Mesh(
          new THREE.PlaneGeometry(size, size),
          this.sectionCapMaterial,
        );
        // Count first, then draw the model and cap before overlays. Drawing
        // the cap last at equal depth prevents coplanar source faces from
        // repainting it; nearer retained surfaces still win the depth test.
        this.sectionCap.renderOrder = 1;
        // Clear the whole counter even where the quad failed its depth test.
        // The renderer also keeps its default autoClearStencil=true, so a
        // culled/disabled cap cannot leak stencil into a later frame.
        this.sectionCap.onAfterRender = (renderer) => renderer.clearStencil();
        this.sectionCapGroup.add(this.sectionCap);
      }
      const cut = sectionPlane(this.section, this.root.matrixWorld);
      const center = this.sectionBounds
        .getCenter(new V())
        .applyMatrix4(this.root.matrixWorld);
      cut.projectPoint(center, this.sectionCap.position);
      this.sectionCap.quaternion.setFromUnitVectors(new V(0, 0, 1), cut.normal);
    } else this.sectionClips = [];
    if (this.sectionCapGroup) this.sectionCapGroup.visible = !!this.section;
    if (!!previous !== !!this.section) this.applySectionMaterials();
    this.occlusionValid = false;
    this.clearOverlay(this.previewOverlay);
    this.fillTarget = null;
    this.measureCandidate = null;
    this.hoverAnchor?.el.remove();
    this.hoverAnchor = null;
    this.clearOverlay(this.measureCandidateGroup);
    this.effects?.replaceChildren();
    this.onSection?.();
  }
  clipMaterial(material) {
    const clips = this.sectionClips || [];
    if (material.clippingPlanes !== clips) {
      material.clippingPlanes = clips;
      material.needsUpdate = true;
    }
    return material;
  }
  restoreSectionSides() {
    for (const [material, side] of this.sectionSides || []) {
      material.side = side;
      material.needsUpdate = true;
    }
    this.sectionSides?.clear();
  }
  applySectionMaterials() {
    this.restoreSectionSides();
    for (const mesh of this.meshes) {
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        this.clipMaterial(material);
        if (this.section) {
          this.sectionSides.set(
            material,
            this.sectionSides.get(material) ?? material.side,
          );
          material.side = THREE.FrontSide;
          material.needsUpdate = true;
        }
      }
    }
    for (const material of this.sectionStencilMaterials || [])
      this.clipMaterial(material);
    for (const cache of [
      this.markMaterials,
      this.lineMaterials,
      this.measureFaceMaterials,
    ])
      for (const material of cache?.values() || []) this.clipMaterial(material);
  }
  sectionHits() {
    if (!this.section) return this.ray.intersectObjects(this.meshes, false);
    // BVH's firstHitOnly would return the discarded exterior and never reach
    // the exposed interior. Raycast both sides to account for the fill, then
    // restore the draw materials before the renderer can see the change.
    const sides = new Map();
    for (const mesh of this.meshes)
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material])
        if (!sides.has(material)) {
          sides.set(material, material.side);
          material.side = THREE.DoubleSide;
        }
    const first = this.ray.firstHitOnly;
    this.ray.firstHitOnly = false;
    try {
      return this.ray.intersectObjects(this.meshes, false);
    } finally {
      this.ray.firstHitOnly = first;
      for (const [material, side] of sides) material.side = side;
    }
  }
  sectionContains(world) {
    return retainedPoint(world, this.sectionClips?.[0]);
  }
  sectionOccludes(world) {
    if (!this.section) return false;
    // A visible face can have a corner or edge projected behind the cap.
    // Test the snap target itself, and restore the pointer ray so subsequent
    // hover/fill work still refers to the reviewer's original screen point.
    const previous = this.ray.ray.clone();
    try {
      this.ray.set(
        this.camera.position,
        world.clone().sub(this.camera.position).normalize(),
      );
      const hit = sectionIntersection(
        this.sectionHits(),
        this.sectionClips[0],
        this.ray.ray.direction,
        this.ray.ray.origin,
      );
      return (
        !!hit?.sectionCap &&
        hit.distance < this.camera.position.distanceTo(world) - 1e-6
      );
    } finally {
      this.ray.ray.copy(previous);
    }
  }
}
