import { sectionPick, sectionSegment } from "../section.js";
import * as THREE from "three";
import {
  faceEdges,
  isFeatureEdge,
  straightEdge,
  featureChain,
  planeAt,
} from "../measure.js";
import { t } from "../i18n/index.js";
import { V, midpoint } from "./shared.js";

/* How near a triangle's corner a measuring click must land, in screen pixels,
   to take the corner instead of the point it hit: a model's corners are where
   its dimensions are, and a hand cannot find one to the pixel. */
const SNAP_PX = 10;

// How near an edge the pointer must be for the edge tool to take it.
const EDGE_PX = 20;

// The distance from a point to a segment, on the screen.
const segmentDistance = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax,
    dy = by - ay;
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
export class PickingMethods {
  rayAt(x, y) {
    // Input can arrive before the next render after orbit/home changes.
    this.camera.updateMatrixWorld();
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((x - r.left) / r.width) * 2 - 1,
        (-(y - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    return sectionPick(
      this.sectionHits(),
      this.sectionClips?.[0],
      this.ray.ray.direction,
      this.ray.ray.origin,
    );
  }
  triangle(mesh, index) {
    const g = mesh.geometry,
      attr = g.attributes.position;
    const ids = g.index
      ? [
          g.index.getX(index * 3),
          g.index.getX(index * 3 + 1),
          g.index.getX(index * 3 + 2),
        ]
      : [index * 3, index * 3 + 1, index * 3 + 2];
    return new THREE.Triangle(
      ...ids.map((i) => new V().fromBufferAttribute(attr, i)),
    );
  }
  pinFromHit(hit) {
    const position = hit.object.worldToLocal(hit.point.clone());
    return {
      meshId: hit.object.userData.reviewId,
      faceIndex: hit.faceIndex,
      sourceFaceIndex: hit.object.geometry.userData.sourceFaces[hit.faceIndex],
      position: position.toArray(),
      // Cross products can produce -0, which JSON restores as +0. Canonicalize
      // it at creation so a saved pin is identical before and after reload.
      normal: hit.face.normal.toArray().map((v) => (v === 0 ? 0 : v)),
      barycentric: this.triangle(hit.object, hit.faceIndex)
        .getBarycoord(position, new V())
        .toArray(),
    };
  }
  // The triangle a source face number points at, in that mesh's local
  // coordinates — the space brush patches are stored in. `triangle()` reads the
  // review surface, whose indices only agree with source numbering by accident
  // of alignment; `source-v2` counts source faces, so it reads the topology
  // built from the geometry as it arrived.
  sourceTriangle(mesh, sourceFaceIndex) {
    return mesh.userData.fillTopology?.vertices[sourceFaceIndex] || null;
  }
  // A mesh's frame to the model's: composed up to `root` and stopped there,
  // as `annotationBounds` does, so the fit's scale is never multiplied in.
  modelFrame(mesh) {
    const frame = new THREE.Matrix4();
    for (let o = mesh; o && o !== this.root; o = o.parent)
      frame.premultiply(this.explodeBase?.get(o)?.matrix || o.matrix);
    return frame;
  }
  toScreen(world) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const p = world.clone().project(this.camera);
    return [
      r.left + ((p.x + 1) * r.width) / 2,
      r.top + ((1 - p.y) * r.height) / 2,
    ];
  }
  // The point a click meant: the corner of the triangle it hit when it landed
  // within a few pixels of one, else the point itself. In the model's frame.
  snapPoint(hit, x, y) {
    const mesh = hit.object;
    const face = mesh.geometry.userData.sourceFaces[hit.faceIndex];
    let local = mesh.worldToLocal(hit.point.clone()),
      snapped = false,
      best = SNAP_PX;
    for (const corner of mesh.userData.fillTopology.vertices[face] || []) {
      const at = new V().fromArray(corner);
      const world = mesh.localToWorld(at.clone());
      if (!this.sectionContains(world) || this.sectionOccludes(world)) continue;
      const [sx, sy] = this.toScreen(world);
      const d = Math.hypot(sx - x, sy - y);
      if (d < best) {
        best = d;
        local = at;
        snapped = true;
      }
    }
    return {
      meshId: mesh.userData.reviewId,
      sourceFaceIndex: face,
      point: local.applyMatrix4(this.modelFrame(mesh)),
      snapped,
    };
  }
  // The straight edge nearest the pointer among the sharp sides of the
  // triangle it is over, end to end.
  edgeAt(hit, x, y) {
    const mesh = hit.object;
    const face = mesh.geometry.userData.sourceFaces[hit.faceIndex];
    const topology = mesh.userData.fillTopology;
    let side = null,
      best = EDGE_PX;
    for (const s of faceEdges(topology, face)) {
      if (!isFeatureEdge(topology, face, s.ka, s.kb)) continue;
      const visible = sectionSegment(
        mesh.localToWorld(new V().fromArray(s.a)),
        mesh.localToWorld(new V().fromArray(s.b)),
        this.sectionClips?.[0],
      );
      if (!visible) continue;
      const ends = visible.map((p) => this.toScreen(p));
      const d = segmentDistance([x, y], ...ends);
      if (this.section && d < best) {
        const [a, b] = ends;
        const dx = b[0] - a[0],
          dy = b[1] - a[1];
        const length = dx * dx + dy * dy;
        const t = length
          ? Math.max(
              0,
              Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length),
            )
          : 0;
        // Interpolate after projection: perspective makes the screen midpoint
        // differ from the world midpoint. This is the actual snap target.
        const target = visible[0]
          .clone()
          .project(this.camera)
          .lerp(visible[1].clone().project(this.camera), t)
          .unproject(this.camera);
        if (this.sectionOccludes(target)) continue;
      }
      if (d < best) {
        best = d;
        side = s;
      }
    }
    if (!side) return null;
    const key = `${this.mode}:${mesh.userData.reviewId}:${[side.ka, side.kb].sort().join("|")}`;
    if (this.edgeCache?.key !== key)
      this.edgeCache = {
        key,
        edge: {
          ...(this.mode === "edge" ? featureChain : straightEdge)(
            topology,
            face,
            side.ka,
            side.kb,
            this.modelFrame(mesh),
          ),
          meshId: mesh.userData.reviewId,
          sourceFaceIndex: face,
        },
      };
    return this.edgeCache.edge;
  }
  // The flat face under the pointer and the plane through it. Growing a big
  // face is a walk over every triangle in it, so the last one is kept while
  // the pointer stays on it.
  planeUnder(hit) {
    const mesh = hit.object;
    const face = mesh.geometry.userData.sourceFaces[hit.faceIndex];
    const frame = this.modelFrame(mesh);
    let found = this.planeCache;
    if (!(found && found.mesh === mesh && found.faceSet.has(face))) {
      const plane = planeAt(mesh.userData.fillTopology, face, frame);
      if (!plane) return null;
      found = this.planeCache = {
        mesh,
        meshId: mesh.userData.reviewId,
        plane,
        faceSet: new Set(plane.faces),
      };
    }
    return {
      ...found,
      sourceFaceIndex: face,
      pick: mesh.worldToLocal(hit.point.clone()).applyMatrix4(frame),
    };
  }
}
