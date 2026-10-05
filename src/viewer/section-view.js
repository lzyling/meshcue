import {
  sectionPlane,
  sectionRange,
  retainedPoint,
  sectionIntersection,
  sectionPartGroups,
  sectionPartColors,
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
        this.buildSectionCaps();
      }
      const cut = sectionPlane(this.section, this.root.matrixWorld);
      const center = this.sectionBounds
        .getCenter(new V())
        .applyMatrix4(this.root.matrixWorld);
      for (const cap of this.sectionCaps) {
        cut.projectPoint(center, cap.position);
        cap.quaternion.setFromUnitVectors(new V(0, 0, 1), cut.normal);
      }
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
    this.syncPartCaps?.();
    this.highlightPart?.(this.partHover || this.parts?.selected());
    this.onSection?.();
  }
  buildSectionCaps() {
    this.sectionStencilMaterials = [
      [THREE.BackSide, THREE.IncrementWrapStencilOp],
      [THREE.FrontSide, THREE.DecrementWrapStencilOp],
    ].map(
      ([side, operation]) =>
        new THREE.MeshBasicMaterial({
          side,
          colorWrite: false,
          depthWrite: false,
          depthTest: false,
          stencilWrite: true,
          stencilFunc: THREE.AlwaysStencilFunc,
          stencilFail: operation,
          stencilZFail: operation,
          stencilZPass: operation,
        }),
    );
    const groups = sectionPartGroups(this.meshes, this.parts);
    const size =
      this.sectionBounds.getSize(new V()).multiply(this.root.scale).length() *
      1.01;
    const geometry = new THREE.PlaneGeometry(size, size);
    this.sectionCaps = groups.map((part, index) => {
      // Draw source surfaces first, then each complete count/cap/clear sequence,
      // all before overlays at order 2. Depth keeps retained exterior surfaces
      // in front and prevents touching/overlapping solids exposing shared faces.
      const order = 1 + index / groups.length;
      this.sectionStencilMaterials.forEach((material, pass) => {
        for (const mesh of part.meshes) {
          const counter = new THREE.Mesh(mesh.geometry, material);
          counter.userData.partMeshId = mesh.userData.reviewId;
          counter.matrixAutoUpdate = false;
          counter.matrix.copy(mesh.matrixWorld);
          counter.renderOrder = order + pass / (groups.length * 3);
          this.sectionCapGroup.add(counter);
        }
      });
      const material = new THREE.MeshBasicMaterial({
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
      const cap = new THREE.Mesh(geometry, material);
      cap.userData.sectionPart = part;
      cap.renderOrder = order + 2 / (groups.length * 3);
      // Clear even where depth rejected the cap. A hidden or ghosted part has
      // no counting meshes, so it produces no cap and cannot leak old stencil.
      cap.onAfterRender = (renderer) => renderer.clearStencil();
      this.sectionCapGroup.add(cap);
      return cap;
    });
    this.sectionCap = this.sectionCaps[0];
    this.sectionCapMaterial = this.sectionCap?.material;
    this.updateSectionColors();
  }
  updateSectionColors() {
    if (!this.sectionCaps?.length) return;
    // A part with multiple materials takes its first primitive's diffuse colour;
    // lighting is deliberately excluded so orbiting cannot recolour the cut.
    const source = this.sectionCaps.map((cap) => {
      const mesh = cap.userData.sectionPart.meshes[0];
      const material = Array.isArray(mesh.material)
        ? mesh.material[0]
        : mesh.material;
      return material.color || new THREE.Color("#bd801a");
    });
    const colors = sectionPartColors(
      source,
      this.neutral || this.displayStyle === "hidden",
    );
    this.sectionCaps.forEach((cap, i) => cap.material.color.copy(colors[i]));
    this.sectionColor = `#${colors[0].getHexString()}`;
  }
  disposeSectionCaps() {
    this.sectionCapGroup?.clear();
    this.sectionCap?.geometry.dispose();
    for (const cap of this.sectionCaps || []) cap.material.dispose();
    for (const material of this.sectionStencilMaterials || [])
      material.dispose();
    this.sectionCaps = [];
    this.sectionStencilMaterials = [];
    this.sectionCap = this.sectionCapMaterial = null;
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
    this.updateSectionColors();
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
    const meshes = this.meshes.filter(
      (mesh) => this.parts?.meshPickable(mesh.userData.reviewId) ?? true,
    );
    if (!this.section) return this.ray.intersectObjects(meshes, false);
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
      return this.ray.intersectObjects(meshes, false);
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
      this.navigationRayTo(world);
      const hit = sectionIntersection(
        this.sectionHits(),
        this.sectionClips[0],
        this.ray.ray.direction,
        this.ray.ray.origin,
      );
      return (
        !!hit?.sectionCap &&
        hit.distance < this.ray.ray.origin.distanceTo(world) - 1e-6
      );
    } finally {
      this.ray.ray.copy(previous);
    }
  }
}
