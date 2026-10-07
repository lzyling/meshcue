import * as THREE from "three";
import { t } from "../i18n/index.js";
import { buildPartTree, createParts } from "./parts-tree.js";

export class PartsMethods {
  initializeParts() {
    this.parts = createParts((kind) => this.updateParts(kind));
    this.partMaterials = new WeakMap();
    this.partsHighlight = new THREE.Group();
    this.scene.add(this.partsHighlight);
    // View pointer selection is owned by navigation, so face and tree
    // selection share the same drag threshold and multi-touch cancellation.
  }
  buildParts(object, names, sourceNodes) {
    // glTF commonly shares one material across hundreds of instances. A part's
    // opacity must not change its neighbours, so give each mesh its own copy.
    const originals = new Set();
    for (const mesh of this.meshes) {
      const copy = (m) => {
        originals.add(m);
        return m.clone();
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(copy)
        : copy(mesh.material);
    }
    for (const material of originals) material.dispose();
    this.parts?.reset(
      buildPartTree(object, {
        names,
        sourceNodes,
        fallback: (n) => t("parts.fallback", { n }),
      }),
    );
  }
  updateParts(kind) {
    if (!this.parts) return;
    if (kind === "selection" || kind === "projection") {
      this.highlightPart(this.partHover || this.parts.selected());
      return;
    }
    // A lock request may still be awaiting the server when a part is hidden.
    // Cancel that stale hit just as changing tools cancels a pending edit.
    this.editEpoch = (this.editEpoch || 0) + 1;
    this.clickStart = null;
    // Visibility/transparency can expose a different surface at the same
    // screen pixel. It is a new pick, not the second click of the last label.
    this.lastLabelAt = null;
    this.effects?.replaceChildren();
    let changed = false;
    for (const mesh of this.meshes) {
      const id = mesh.userData.reviewId;
      // A glTF mesh node may itself own child meshes. Keep that node traversable
      // when only a child is shown; material visibility suppresses its own draw
      // without suppressing the child, while picking uses the same per-mesh set.
      mesh.visible = this.parts.isVisible(this.parts.partOfMesh(id));
      for (const source of [mesh.material, mesh.userData.originalMaterial])
        for (const material of Array.isArray(source) ? source : [source])
          if (material) material.visible = this.parts.meshVisible(id);
      if (!!mesh.userData.partTransparent !== this.parts.meshTransparent(id))
        changed = true;
    }
    if (this.displayStyle) {
      // Display styles own the temporary material copies. Rebuild those from
      // source materials plus part state, so a style/plain-view toggle neither
      // loses transparency nor captures a temporary opacity as the original.
      for (const mesh of this.meshes)
        mesh.userData.partTransparent = this.parts.meshTransparent(
          mesh.userData.reviewId,
        );
      this.applyDisplayStyle();
    } else if (changed) {
      // Plain view clones the current material. Restore it first so both the
      // original and the new plain copy inherit the same opacity, and switching
      // either viewing aid off returns exactly the source material's settings.
      const neutral = this.neutral;
      if (neutral) this.setNeutral(false);
      for (const mesh of this.meshes) {
        const transparent = this.parts.meshTransparent(mesh.userData.reviewId);
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]) {
          if (!this.partMaterials.has(material))
            this.partMaterials.set(material, {
              opacity: material.opacity,
              transparent: material.transparent,
              depthWrite: material.depthWrite,
              alphaTest: material.alphaTest,
            });
          // An alpha-mask cutoff above the temporary opacity would discard
          // every fragment. Preserve texture alpha, but suspend that cutoff
          // until the reviewer restores the source appearance.
          Object.assign(
            material,
            transparent
              ? {
                  opacity: 0.18,
                  transparent: true,
                  depthWrite: false,
                  alphaTest: 0,
                }
              : this.partMaterials.get(material),
          );
          material.needsUpdate = true;
        }
        mesh.userData.partTransparent = transparent;
      }
      if (neutral) this.setNeutral(true);
    }
    this.syncPartCaps();
    this.occlusionValid = false;
    if (kind !== "reset-view") this.clearMeasure?.();
    this.clearOverlay?.(this.previewOverlay);
    this.fillTarget = null;
    if (this.partAnnotations) this.setAnnotations(...this.partAnnotations);
    if (this.agentEcho) this.setAgentEcho(this.agentEcho);
    this.highlightPart(this.partHover || this.parts.selected());
  }
  syncPartCaps() {
    for (const counter of this.sectionCapGroup?.children || []) {
      const id = counter.userData.partMeshId;
      if (id) counter.visible = this.parts?.meshPickable(id) ?? true;
    }
  }
  hoverPart(id) {
    this.partHover = id;
    this.highlightPart(id || this.parts.selected());
  }
  highlightPart(id) {
    if (!this.partsHighlight) return;
    // Share existing mesh geometry; building edges for a 600k-face assembly on
    // hover would stall the pointer. A light surface tint follows the exact part.
    for (const child of this.partsHighlight.children) child.material.dispose();
    this.partsHighlight.clear();
    for (const meshId of this.parts?.meshIds(id) || []) {
      const mesh = this.meshMap.get(meshId);
      if (!mesh || !this.parts.meshVisible(meshId)) continue;
      const material = this.clipMaterial(
        new THREE.MeshBasicMaterial({
          color: this.partHover ? 0x42bccc : 0xe8aa35,
          side: this.section ? THREE.FrontSide : THREE.DoubleSide,
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      );
      const tint = new THREE.Mesh(mesh.geometry, material);
      tint.matrixAutoUpdate = false;
      tint.matrix.copy(mesh.matrixWorld);
      tint.renderOrder = 2;
      this.partsHighlight.add(tint);
    }
  }
  fitPart(id) {
    const bounds = this.parts.bounds(id);
    if (bounds.isEmpty()) return;
    if (typeof this.fitTo === "function") return this.fitTo(bounds);
    const target = bounds.getCenter(new THREE.Vector3());
    const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
    const half = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const angle = Math.min(
      half,
      Math.atan(Math.tan(half) * this.camera.aspect),
    );
    const distance = (radius / Math.sin(angle)) * 1.1;
    const direction = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize();
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(direction, distance);
    this.controls.update();
  }
}
