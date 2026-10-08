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

// A ray intersects an expanded AABB over one interval of translation distances.
// Skipping the union of these intervals finds the first free position exactly,
// rather than assuming collisions are monotonic during a binary search.
function freeDistance(box, direction, obstacles, gap) {
  const intervals = [];
  for (const other of obstacles) {
    let lo = -Infinity,
      hi = Infinity;
    for (const axis of ["x", "y", "z"]) {
      const d = direction[axis];
      const min = other.min[axis] - gap - box.max[axis];
      const max = other.max[axis] + gap - box.min[axis];
      if (Math.abs(d) < 1e-12) {
        if (min > 0 || max < 0) {
          hi = -Infinity;
          break;
        }
      } else {
        lo = Math.max(lo, Math.min(min / d, max / d));
        hi = Math.min(hi, Math.max(min / d, max / d));
      }
    }
    if (hi >= Math.max(0, lo)) intervals.push([lo, hi]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let distance = gap;
  for (const [lo, hi] of intervals) {
    if (lo > distance) break;
    if (hi >= distance) distance = hi + Math.max(gap * 1e-6, 1e-9);
  }
  return distance;
}

function assemblyBox(boxes, visible) {
  const result = new THREE.Box3();
  boxes.forEach((box, i) => {
    if (visible[i]) result.union(box);
  });
  return result;
}

export function explodeBaseIndex(boxes, visible) {
  const active = boxes
    .map((_, i) => i)
    .filter((i) => visible[i] && !boxes[i].isEmpty());
  if (active.length < 3) return -1;
  const volume = (i) => {
    const size = boxes[i].getSize(new THREE.Vector3());
    return size.x * size.y * size.z;
  };
  active.sort((a, b) => volume(b) - volume(a) || a - b);
  const candidate = active[0];
  if (volume(candidate) <= volume(active[1])) return -1;
  const contained = active
    .slice(1)
    .filter((i) =>
      boxes[candidate].containsPoint(boxes[i].getCenter(new THREE.Vector3())),
    );
  return contained.length / (active.length - 1) >= 0.6 ? candidate : -1;
}

function directionFor(box, origin, index, longest = false) {
  const delta = box.getCenter(new THREE.Vector3()).sub(origin);
  if (longest || delta.lengthSq() < 1e-16) {
    const size = box.getSize(new THREE.Vector3());
    const axis = ["y", "x", "z"].sort((a, b) => size[b] - size[a])[0];
    const sign = axis === "y" || delta[axis] >= 0 ? 1 : -1;
    return new THREE.Vector3().setComponent({ x: 0, y: 1, z: 2 }[axis], sign);
  }
  delta.y = Math.max(0, delta.y);
  if (delta.lengthSq() < 1e-16)
    delta.set(Math.cos(index * 2.399963), 0.15, Math.sin(index * 2.399963));
  return delta.normalize();
}

function place(boxes, visible, origin, obstacles, gap, diagonal) {
  const offsets = boxes.map(() => new THREE.Vector3());
  const order = boxes.map((_, i) => i).filter((i) => !boxes[i].isEmpty());
  order.sort(
    (a, b) =>
      boxes[a].getCenter(new THREE.Vector3()).distanceToSquared(origin) -
        boxes[b].getCenter(new THREE.Vector3()).distanceToSquared(origin) ||
      a - b,
  );
  for (const i of order) {
    let direction = directionFor(boxes[i], origin, i);
    let distance = freeDistance(boxes[i], direction, obstacles, gap);
    if (distance > 2 * diagonal) {
      direction = directionFor(boxes[i], origin, i, true);
      distance = freeDistance(boxes[i], direction, obstacles, gap);
    }
    offsets[i].copy(direction).multiplyScalar(distance);
    if (visible[i]) obstacles.push(boxes[i].clone().translate(offsets[i]));
  }
  return offsets;
}

// Compute once at 100%. Every direction is non-descending in world Y, so even
// parts initially below gridY never get lower. Hidden parts do not obstruct.
export function explodeTargets(boxes, visible, groups = []) {
  const assembly = assemblyBox(boxes, visible);
  const origin = assembly.isEmpty()
    ? new THREE.Vector3()
    : assembly.getCenter(new THREE.Vector3());
  const diagonal = assembly.getSize(new THREE.Vector3()).length() || 1;
  const gap = diagonal * 0.02;
  const base = explodeBaseIndex(boxes, visible);
  if (base >= 0) boxes[base].getCenter(origin);
  const offsets = boxes.map(() => new THREE.Vector3());
  const owned = new Set();
  const units = [];
  for (const group of [...groups, ...boxes.map((_, i) => [i])]) {
    const ids = group.filter((i) => i !== base && !owned.has(i));
    ids.forEach((i) => owned.add(i));
    if (ids.length) units.push(ids);
  }
  // First resolve each group's internal members, then place the expanded
  // group envelopes. Excluding the fixed base allows its siblings to move.
  for (const ids of units) {
    if (ids.length < 2) continue;
    const localBoxes = ids.map((i) => boxes[i]);
    const localVisible = ids.map((i) => visible[i]);
    const localBox = assemblyBox(localBoxes, localVisible);
    const localOrigin = localBox.isEmpty()
      ? origin
      : localBox.getCenter(new THREE.Vector3());
    const local = place(
      localBoxes,
      localVisible,
      localOrigin,
      [],
      gap,
      diagonal,
    );
    ids.forEach((id, i) => offsets[id].copy(local[i]));
  }
  const envelopes = units.map((ids) => {
    const shown = ids.filter((i) => visible[i]);
    const envelope = new THREE.Box3();
    for (const i of shown.length ? shown : ids)
      envelope.union(boxes[i].clone().translate(offsets[i]));
    return envelope;
  });
  const top = place(
    envelopes,
    units.map((ids) => ids.some((i) => visible[i])),
    origin,
    base < 0 ? [] : [boxes[base]],
    gap,
    diagonal,
  );
  units.forEach((ids, i) => ids.forEach((id) => offsets[id].add(top[i])));
  return offsets;
}

export function explodeOffsets(boxes, visible, amount, groups = []) {
  return explodeTargets(boxes, visible, groups).map((offset) =>
    offset.multiplyScalar(amount),
  );
}

export class ExplodeMethods {
  prepareExplode() {
    this.explode = { amount: 0, by: "group" };
    this.explodeBase = new Map();
    this.explodeCache = null;
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
    const parts = this.parts.list();
    const groups = this.parts.groupList();
    const units = explodeUnits(parts, [], "part");
    const visibility = units.map((ids) =>
      ids.map((id) => this.parts.meshVisible(id)),
    );
    const key = JSON.stringify([
      by,
      units,
      visibility,
      groups.map((g) => g.meshIds),
      this.gridY,
    ]);
    if (this.explodeCache?.key !== key) {
      const boxes = units.map((ids, i) => {
        const box = new THREE.Box3();
        const shown = ids.filter((_, j) => visibility[i][j]);
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
      const grouped =
        by === "group"
          ? explodeUnits(parts, groups, by).map((ids) =>
              units
                .map((unit, i) =>
                  unit.some((id) => ids.includes(id)) ? i : -1,
                )
                .filter((i) => i >= 0),
            )
          : [];
      this.explodeCache = {
        key,
        targets: explodeTargets(
          boxes,
          visibility.map((v) => v.some(Boolean)),
          grouped,
        ),
      };
    }
    const desired = new Map();
    units.forEach((ids, i) => {
      const offset = this.explodeCache.targets[i]
        .clone()
        .multiplyScalar(amount);
      ids.forEach((id) => desired.set(this.meshMap.get(id), offset));
    });
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
