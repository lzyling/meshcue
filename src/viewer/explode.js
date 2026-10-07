import * as THREE from "three";

// Deterministic, disjoint units. Geometry on non-leaf nodes remains a part too.
export function explodeUnits(parts, groups = [], by = "group") {
  const owned = new Set();
  const units = [];
  const take = (ids) => {
    const unique = ids.filter((id) => !owned.has(id));
    if (unique.length) {
      unique.forEach((id) => owned.add(id));
      units.push(unique);
    }
  };
  if (by === "group") groups.forEach((group) => take(group.meshIds));
  for (const part of parts) {
    const descendants = new Set(
      parts.filter((p) => p.parentId === part.id).flatMap((p) => p.meshIds),
    );
    take(part.meshIds.filter((id) => !descendants.has(id)));
  }
  return units;
}

export function explodeOffsets(boxes, visible, amount) {
  const assembly = new THREE.Box3();
  boxes.forEach((box, i) => {
    if (visible[i]) assembly.union(box);
  });
  if (assembly.isEmpty()) boxes.forEach((box) => assembly.union(box));
  const center = assembly.getCenter(new THREE.Vector3());
  const distance =
    assembly.getSize(new THREE.Vector3()).length() * 0.6 * amount;
  return boxes.map((box, i) => {
    const direction = box.getCenter(new THREE.Vector3()).sub(center);
    if (direction.lengthSq() < 1e-16)
      direction.set(Math.cos(i * 2.399963), 0.35, Math.sin(i * 2.399963));
    return direction.normalize().multiplyScalar(distance);
  });
}

export class ExplodeMethods {
  prepareExplode() {
    this.explode = { amount: 0, by: "group" };
    this.explodeBase = new Map();
    // A viewer without a scene root (unit stubs) still has meshes to record.
    if (this.root) this.root.updateMatrixWorld(true);
    else for (const mesh of this.meshes) mesh.updateMatrixWorld(true);
    for (const mesh of this.meshes)
      this.explodeBase.set(mesh, {
        matrix: mesh.matrix.clone(),
        world: mesh.matrixWorld.clone(),
        auto: mesh.matrixAutoUpdate,
      });
    this.onExplode?.();
  }
  setExplode(amount = 0, by = this.explode?.by || "group") {
    if (!this.explodeBase?.size) return;
    amount = Math.max(0, Math.min(1, Number(amount) || 0));
    this.explode = { amount, by };
    const groups = this.parts.groupList();
    const units = explodeUnits(this.parts.list(), groups, by);
    const boxes = units.map((ids) => {
      const box = new THREE.Box3();
      // Hidden members do not affect visible unit centres. Hidden-only units use their own base bounds.
      const shown = ids.filter((id) => this.parts.meshVisible(id));
      for (const id of shown.length ? shown : ids) {
        const mesh = this.meshMap.get(id);
        if (!mesh) continue;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        box.union(
          mesh.geometry.boundingBox
            .clone()
            .applyMatrix4(this.explodeBase.get(mesh).world),
        );
      }
      return box;
    });
    const offsets = explodeOffsets(
      boxes,
      units.map((ids) => ids.some((id) => this.parts.meshVisible(id))),
      amount,
    );
    const desired = new Map();
    units.forEach((ids, i) =>
      ids.forEach((id) => desired.set(this.meshMap.get(id), offsets[i])),
    );
    // Parent meshes may own child meshes: derive each local matrix from desired
    // world matrices, avoiding double translation and preserving scale/rotation.
    const worldOf = (node) => {
      const base = this.explodeBase.get(node);
      if (base)
        return base.world
          .clone()
          .setPosition(
            new THREE.Vector3()
              .setFromMatrixPosition(base.world)
              .add(desired.get(node) || new THREE.Vector3()),
          );
      return node.parent
        ? worldOf(node.parent).multiply(node.matrix)
        : node.matrixWorld.clone();
    };
    for (const [mesh, base] of this.explodeBase) {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(worldOf(mesh.parent).invert().multiply(worldOf(mesh)));
      mesh.userData.explodeOffset = desired.get(mesh) || new THREE.Vector3();
      if (!amount) {
        mesh.matrix.copy(base.matrix);
        mesh.matrixAutoUpdate = base.auto;
      }
    }
    this.root.updateMatrixWorld(true);
    for (const group of [
      this.overlay,
      this.previewOverlay,
      this.agentOverlay,
      this.partsHighlight,
      this.sectionCapGroup,
    ])
      for (const child of group?.children || []) {
        const mesh = this.meshMap.get(child.userData.partMeshId);
        if (mesh) child.matrix.copy(mesh.matrixWorld);
      }
    if (this.section) {
      const plane = this.sectionClips[0];
      for (const cap of this.sectionCaps || []) {
        const bounds = new THREE.Box3();
        for (const mesh of cap.userData.sectionPart.meshes)
          bounds.union(
            mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),
          );
        bounds.getCenter(cap.userData.sectionCenter);
        plane.projectPoint(cap.userData.sectionCenter, cap.position);
        cap.scale.setScalar(
          bounds.getSize(new THREE.Vector3()).length() * 1.01,
        );
      }
    }
    this.refreshExplodeOutlines?.();
    this.refreshExplodeMeasures?.();
    this.highlightPart(this.partHover || this.parts.selected());
    this.occlusionValid = false;
    this.placePins();
    this.placeReadings();
    this.onExplode?.();
  }
  explodeModelOffset(id) {
    const offset =
      this.meshMap.get(id)?.userData.explodeOffset?.clone() ||
      new THREE.Vector3();
    return offset.applyMatrix3(
      new THREE.Matrix3().setFromMatrix4(this.root.matrixWorld).invert(),
    );
  }
}
