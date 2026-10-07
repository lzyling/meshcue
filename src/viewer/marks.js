import { sectionIntersection } from "../section.js";
import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { wholeFaces } from "../annotation-edits.js";
import { chainSegments, faceNormal, outlineSegments } from "../outline.js";
import { t } from "../i18n/index.js";
import { V, measureAnchor } from "./shared.js";

/* Coverage is stored as the clipped polygon; WebGL wants triangles. Fanning at
   draw time costs nothing and keeps the stored form free of the sixty-odd
   repetitions a stored fan carried. Three vertices fan to themselves.

   A fan is enough again because every polygon that can still reach here is
   convex: `source-v1` marks were clipped with half-planes, and `source-v2`
   stores whole faces as numbers and no polygons at all. Ear clipping arrived
   with the union of brush stamps, which is concave, and left with it. */
const fanInto = (coords, vertices) => {
  for (let i = 1; i < vertices.length - 1; i++)
    coords.push(...vertices[0], ...vertices[i], ...vertices[i + 1]);
};

/* The Agent's echo is a line of a kind a reviewer never draws: dashed, moving
   along the edge of each place it means, lit by a soft glow, in a colour none
   of the reviewer's paints use. A reviewer's mark is a solid, still fill, so
   the two cannot be taken for each other even where they lie on one face, and
   a screenshot — which stops the movement — still shows the dashes. */
const ECHO_CORE = 0x00e5ff;

const ECHO_UNDER = 0x06242c;

const ECHO_DASH_PX = 10;

const ECHO_GAP_PX = 7;

const ECHO_FLOW_PX_PER_S = 24;

// A new echo pulses twice in this time, then settles.
const ECHO_PULSE_MS = 1600;

// How far above the surface the line floats, as a share of the fitted model.
const ECHO_LIFT = 0.002;

// How far toward the eye every stroke is drawn, as a share of its distance.
const ECHO_TOWARD_EYE = 0.001;
export class MarksMethods {
  /* Where a mark is and how much of the model it covers, in the model's own
     units, so that the agent can be told without being handed the geometry.

     It has to be computed here because this is the only place that can. The
     service keeps counts and a transform per mesh, not triangles, and under
     `source-v2` a mark whose faces were all taken whole carries no coordinate
     at all — the extent is a list of face numbers, and only the loaded model
     knows where those are. So the browser works it out once per save and sends
     it along, at about a hundred bytes for a mark of any size.

     `root` carries the preview fit — every model is scaled into a 3-unit box
     and centred — so scene coordinates are a rendering detail and mean nothing
     to anyone reading the batch. Until 1.3.0-dev these numbers were taken
     straight out of that space while a pin's `position` was already in the
     model's, and the two sat side by side in one array: a 160 mm assembly
     reported a stroke 2.85 across and 1.35 in area, which reads as millimetres
     and is out by 53 and by 2,845. Undoing `root` puts both in the same frame,
     and it is the only frame shared by marks that span several parts. */
  annotationBounds(a) {
    if (a.type !== "region") return null;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    const total = [0, 0, 0];
    let area = 0;
    let count = 0;
    const cross = [0, 0, 0];
    /* Composed up the chain and stopped at `root`, rather than going out to
       world and dividing the fit back out. The fit is 3/maxDim, which is not
       exact in binary, so multiplying by it and undoing it leaves a residue --
       a corner at the origin came back as -2.8e-14, which then survives
       `toPrecision` and is read by whoever gets the batch. Stopping short of
       `root` never multiplies by it at all, and costs one matrix per mesh
       instead of two transforms per vertex. */
    const frames = new Map();
    const frameOf = (mesh) => {
      let m = frames.get(mesh);
      if (!m) {
        m = new THREE.Matrix4();
        for (let o = mesh; o && o !== this.root; o = o.parent)
          m.premultiply(this.explodeBase?.get(o)?.matrix || o.matrix);
        frames.set(mesh, m);
      }
      return m;
    };
    const take = (mesh, vertices) => {
      const frame = frameOf(mesh);
      const world = vertices.map((p) =>
        new V().fromArray(p).applyMatrix4(frame).toArray(),
      );
      for (const p of world) {
        for (let i = 0; i < 3; i++) {
          lo[i] = Math.min(lo[i], p[i]);
          hi[i] = Math.max(hi[i], p[i]);
          total[i] += p[i];
        }
        count++;
      }
      // Newell's sum, which is the polygon's true area whether it is convex or
      // not; a fan from the first vertex would over-count a concave union.
      cross[0] = cross[1] = cross[2] = 0;
      for (let i = 0; i < world.length; i++) {
        const p = world[i];
        const q = world[(i + 1) % world.length];
        cross[0] += p[1] * q[2] - p[2] * q[1];
        cross[1] += p[2] * q[0] - p[0] * q[2];
        cross[2] += p[0] * q[1] - p[1] * q[0];
      }
      area += Math.hypot(...cross) / 2;
    };
    const whole = wholeFaces(a);
    for (const [meshId, faces] of Object.entries(a.faces || {})) {
      const mesh = this.meshMap.get(meshId);
      if (!mesh) continue;
      for (const face of faces) {
        if (!whole.has(`${meshId}:${face}`)) continue;
        const triangle = this.sourceTriangle(mesh, face);
        if (triangle) take(mesh, triangle);
      }
    }
    for (const patch of a.surfacePatches || []) {
      const mesh = this.meshMap.get(patch.meshId);
      if (mesh) take(mesh, patch.vertices);
    }
    if (!count) return null;
    const round = (v) => Number(v.toPrecision(6));
    return {
      // Named, because a batch saved before 1.3.0-dev carries the preview's
      // numbers under the same four keys and nothing else tells them apart.
      space: "model",
      centroid: total.map((v) => round(v / count)),
      min: lo.map(round),
      max: hi.map(round),
      area: round(area),
    };
  }
  // Give every face a polygon, whatever the mark stores. A `source-v2` face
  // with no patch is the whole face, so it is materialised here rather than at
  // each of the places that wants geometry. Nothing materialised is written
  // back: this is the expanded reading of a mark, not the mark.
  expandWholeFaces(a, only) {
    const whole = wholeFaces(a);
    if (!whole.size) return a.surfacePatches || [];
    const extra = [];
    for (const key of whole) {
      if (only && !only.has(key)) continue;
      const [meshId, face] = [
        key.slice(0, key.lastIndexOf(":")),
        +key.slice(key.lastIndexOf(":") + 1),
      ];
      const mesh = this.meshMap.get(meshId);
      const vertices = mesh && this.sourceTriangle(mesh, face);
      if (vertices)
        extra.push({
          meshId,
          faceIndex: face,
          sourceFaceIndex: face,
          vertices: vertices.map((v) => [...v]),
        });
    }
    return [...(a.surfacePatches || []), ...extra];
  }
  /* The wire form of a mark, and the form it is stored in. `source-v2` goes out
     exactly as it is held: a whole face is its number, and materialising a
     polygon for it here would undo the entire point of the format one step
     before the mark leaves the page.

     It did exactly that for a release. The page held a fill in the compact
     form, counted its bytes in the compact form, and then sent the expanded
     one — 142 bytes a face on the wire, on disk, and in what the service reads
     back — while every number reported about the saving was read off the page.
     Expansion belongs to drawing, which is what `expandWholeFaces` is for. */
  serializeAnnotations(annotations) {
    return annotations.map((a) =>
      a.type !== "region" ||
      ["brush-v1", "source-v1", "source-v2"].includes(a.coverage)
        ? structuredClone(a)
        : {
            ...structuredClone(a),
            surfacePatches: Object.entries(a.faces).flatMap(
              ([meshId, faces]) => {
                const mesh = this.meshMap.get(meshId);
                return faces.map((faceIndex) => {
                  const t = this.triangle(mesh, faceIndex);
                  return {
                    meshId,
                    faceIndex,
                    sourceFaceIndex:
                      mesh.geometry.userData.sourceFaces[faceIndex],
                    vertices: [t.a.toArray(), t.b.toArray(), t.c.toArray()],
                  };
                });
              },
            ),
          },
    );
  }
  edgeMark(edge) {
    if (!edge || edge.points.length > 512) return null;
    const points = edge.curved ? edge.points : edge.ends;
    return {
      type: "edge",
      meshId: edge.meshId,
      space: "model",
      points: points.map((p) => p.toArray()),
      length: points
        .slice(1)
        .reduce((n, p, i) => n + p.distanceTo(points[i]), 0),
      curved: edge.curved,
      sourceFaceIndex: edge.sourceFaceIndex,
      ...(edge.closed ? { closed: true } : {}),
      ...(edge.brep ? { brep: edge.brep } : {}),
    };
  }
  partMark(id) {
    const meshIds = this.parts.meshIds(id);
    const entries = this.parts
      .list()
      .filter(
        (p) =>
          p.meshIds.some((m) => meshIds.includes(m)) &&
          meshIds.some((m) => this.parts.partOfMesh(m) === p.id),
      );
    if (!meshIds.length || !entries.length || entries.length > 256) return null;
    const bounds = new THREE.Box3();
    for (const meshId of meshIds) {
      const mesh = this.meshMap.get(meshId);
      if (mesh) {
        mesh.geometry.computeBoundingBox();
        bounds.union(
          mesh.geometry.boundingBox.clone().applyMatrix4(this.modelFrame(mesh)),
        );
      }
    }
    const row = this.parts.viewList().find((p) => p.id === id);
    return {
      type: "part",
      partIds: entries.map((p) => p.id),
      names: entries.map((p) => p.name),
      meshIds,
      ...(row?.kind === "group"
        ? { group: { id: row.id.replace(/^agent-group:/, ""), name: row.name } }
        : {}),
      bounds: {
        space: "model",
        centroid: bounds.getCenter(new V()).toArray(),
        min: bounds.min.toArray(),
        max: bounds.max.toArray(),
      },
    };
  }
  objectMarkWorld(a) {
    if (a.type === "edge") {
      const mesh = this.meshMap.get(a.meshId);
      let remaining = a.length / 2;
      let anchor = new V().fromArray(a.points[0]);
      for (let i = 1; i < a.points.length; i++) {
        const next = new V().fromArray(a.points[i]);
        const distance = anchor.distanceTo(next);
        if (remaining <= distance) {
          anchor.lerp(next, distance ? remaining / distance : 0);
          break;
        }
        remaining -= distance;
        anchor = next;
      }
      return anchor
        .applyMatrix4(this.modelFrame(mesh).invert())
        .applyMatrix4(mesh.matrixWorld);
    }
    const box = new THREE.Box3();
    for (const id of a.meshIds) {
      const mesh = this.meshMap.get(id);
      if (mesh && this.parts.meshVisible(id))
        box.union(
          mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),
        );
    }
    return box.getCenter(new V());
  }
  drawObjectMark(group, a, selected = false, label = true) {
    if (!a) return;
    const ids = a.type === "edge" ? [a.meshId] : a.meshIds;
    let visible = false;
    for (const id of ids) {
      const mesh = this.meshMap.get(id);
      if (!mesh || !this.parts.meshVisible(id)) continue;
      visible = true;
      if (a.type === "edge") {
        const inverse = this.modelFrame(mesh).invert();
        const geometry = new LineSegmentsGeometry();
        const points = a.points.map((p) =>
          new V().fromArray(p).applyMatrix4(inverse),
        );
        geometry.setPositions(
          points
            .slice(1)
            .flatMap((p, i) => [...points[i].toArray(), ...p.toArray()]),
        );
        const key = `mark:${a.color || "#2e9e78"}`;
        let material = this.lineMaterials.get(key);
        if (!material) {
          material = new LineMaterial({
            color: a.color || "#2e9e78",
            linewidth: 4,
            depthTest: false,
            depthWrite: false,
          });
          const r = this.container.getBoundingClientRect();
          material.resolution.set(r.width, r.height);
          this.clipMaterial(material);
          this.lineMaterials.set(key, material);
        }
        const line = new LineSegments2(geometry, material);
        line.matrixAutoUpdate = false;
        line.matrix.copy(mesh.matrixWorld);
        line.userData.partMeshId = id;
        line.renderOrder = 8;
        group.add(line);
      } else {
        const overlay = new THREE.Mesh(
          mesh.geometry.clone(),
          this.markMaterial(a.color, selected),
        );
        overlay.matrixAutoUpdate = false;
        overlay.matrix.copy(mesh.matrixWorld);
        overlay.userData.partMeshId = id;
        overlay.renderOrder = 3;
        group.add(overlay);
        const outline = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry, 30),
          new THREE.LineBasicMaterial({
            color: a.color,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
          }),
        );
        this.clipMaterial(outline.material);
        outline.matrixAutoUpdate = false;
        outline.matrix.copy(mesh.matrixWorld);
        outline.userData.partMeshId = id;
        outline.renderOrder = 4;
        outline.userData.ownedMarkMaterial = true;
        group.add(outline);
      }
    }
    if (label && visible) {
      const el = document.createElement("button");
      el.className = `model-pin ${selected ? "selected" : ""}`;
      el.textContent = a.label;
      el.style.setProperty("--pin-color", a.color);
      el.onclick = (e) => {
        e.stopPropagation();
        this.onSelect?.(a.id);
      };
      this.labels.append(el);
      this.pins.push({ el, a, objectMark: true });
    }
  }
  setAnnotations(annotations, selectedId) {
    this.partAnnotations = [annotations, selectedId];
    this.clearOverlay(this.overlay);
    this.labels.replaceChildren();
    this.pins = [];
    // Fresh pin records carry no cached occlusion; recheck on the next frame.
    this.occlusionValid = false;
    // Which pins existed before this pass, so the one just placed can be told
    // apart from the ones merely being redrawn.
    const seen = this.knownPins || new Set();
    const landing = this.placing;
    this.placing = false;
    for (const a of annotations) {
      if (["edge", "part"].includes(a.type)) {
        this.drawObjectMark(this.overlay, a, a.id === selectedId);
      } else if (a.type === "pin") {
        const mesh = this.meshMap.get(a.meshId);
        if (!mesh || this.parts?.meshVisible(a.meshId) === false) continue;
        const el = document.createElement("button");
        el.type = "button";
        el.className = `model-pin ${a.id === selectedId ? "selected" : ""}`;
        if (landing && !seen.has(a.id)) el.classList.add("landing");
        el.textContent = a.label;
        el.style.setProperty("--pin-color", a.color);
        el.setAttribute("aria-label", t("marks.one", { label: a.label }));
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          this.onSelect?.(a.id);
        });
        this.labels.append(el);
        this.pins.push({ el, a, mesh });
      } else if (a.type === "measure") {
        if (!a.picks?.some((p) => this.parts?.meshVisible(p.meshId) === false))
          this.drawKeptMeasure(a, a.id === selectedId);
      } else {
        for (const [meshId, faces] of Object.entries(a.faces)) {
          const mesh = this.meshMap.get(meshId);
          if (!mesh || this.parts?.meshVisible(meshId) === false) continue;
          const coords = [];
          if (a.coverage === "source-v2") {
            // Both halves of one mark: the faces a stroke took whole are drawn
            // from their own triangles, the rest from the polygons stored for
            // them. A face appears in exactly one of the two.
            const partial = new Set();
            for (const patch of a.surfacePatches || [])
              if (patch.meshId === meshId) {
                partial.add(patch.faceIndex);
                fanInto(coords, patch.vertices);
              }
            for (const face of faces) {
              if (partial.has(face)) continue;
              const vertices = this.sourceTriangle(mesh, face);
              if (vertices) fanInto(coords, vertices);
            }
          } else if (["brush-v1", "source-v1"].includes(a.coverage)) {
            for (const patch of a.surfacePatches || []) {
              if (patch.meshId === meshId) fanInto(coords, patch.vertices);
            }
          } else
            for (const face of faces) {
              if (
                face >=
                (mesh.geometry.index?.count ||
                  mesh.geometry.attributes.position.count) /
                  3
              )
                continue;
              const t = this.triangle(mesh, face);
              for (const v of [t.a, t.b, t.c]) coords.push(...v.toArray());
            }
          if (!coords.length) continue;
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(coords, 3),
          );
          const material = this.markMaterial(a.color, a.id === selectedId);
          const overlay = new THREE.Mesh(geometry, material);
          overlay.matrixAutoUpdate = false;
          overlay.matrix.copy(mesh.matrixWorld);
          overlay.userData.partMeshId = mesh.userData.reviewId;
          overlay.renderOrder = 3;
          this.overlay.add(overlay);
        }
        this.drawOutline(this.overlay, this.serializeAnnotations([a])[0], {
          color: a.color,
          selected: a.id === selectedId,
        });
      }
    }
    this.knownPins = new Set(
      annotations.filter((a) => a.type === "pin").map((a) => a.id),
    );
    // Labels are rebuilt in an animation frame of their own, which runs after
    // the render loop's in the same frame because the loop asked first. Left to
    // the loop, every rebuilt label was painted once at the layer's origin —
    // the corner of the view — before the next frame put it on its point.
    this.placePins();
    this.placeReadings();
  }
  placePins() {
    if (!this.pins.length) return;
    const rect = this.container.getBoundingClientRect();
    // Occlusion costs one ray per pin and only changes when the view does. At
    // the documented 200-pin ceiling, testing it every frame was 12,000 BVH
    // raycasts a second; damping keeps this true for the frames that matter.
    const moved =
      !this.occlusionValid ||
      !this.occlusionAt.position.equals(this.camera.position) ||
      !this.occlusionAt.target.equals(this.controls.target);
    if (moved) {
      this.occlusionAt.position.copy(this.camera.position);
      this.occlusionAt.target.copy(this.controls.target);
      this.occlusionValid = true;
    }
    for (const pin of this.pins) {
      // A kept measurement's reading hangs at the middle of its line, which is
      // in the model's frame rather than any one mesh's.
      const world = pin.objectMark
        ? this.objectMarkWorld(pin.a)
        : pin.model
          ? this.scratch.world
              .copy(pin.model)
              .applyMatrix4(this.root.matrixWorld)
          : pin.mesh.localToWorld(this.scratch.world.fromArray(pin.a.position));
      const projected = this.scratch.projected.copy(world).project(this.camera);
      const inView =
        projected.z >= -1 &&
        projected.z <= 1 &&
        Math.abs(projected.x) < 1 &&
        Math.abs(projected.y) < 1;
      // A measurement is drawn over the model, so its reading is never behind
      // it.
      if (moved && (pin.model || pin.objectMark)) pin.unoccluded = true;
      else if (moved) {
        pin.unoccluded = false;
        if (inView) {
          this.navigationRayTo(world);
          const hit = sectionIntersection(
            this.sectionHits(),
            this.sectionClips?.[0],
            this.ray.ray.direction,
            this.ray.ray.origin,
          );
          pin.unoccluded =
            !hit ||
            hit.distance >= this.ray.ray.origin.distanceTo(world) - 0.015;
        }
      }
      pin.el.hidden =
        !inView ||
        !pin.unoccluded ||
        !this.annotationsVisible ||
        !this.sectionContains(world);
      // The tail is what marks the spot, so the tail is what sits on it. The
      // label used to be centred above the point with a near-square corner
      // hinting at a direction it was not actually anchored in, which left the
      // exact surface a mark referred to unreadable.
      // Position belongs in `translate`, not `transform`: individual transform
      // properties compose translate → rotate → scale → transform, so a scale
      // written alongside a position in `transform` is applied to the position
      // as well, about the layer's own origin. The landing animation scales, so
      // putting the position after it is what keeps a mark on its point instead
      // of flying it in from the corner of the screen.
      // A measurement's reading is set down with the others, in
      // `placeReadings`.
      if (!pin.model)
        pin.el.style.translate = `calc(${((projected.x + 1) * rect.width) / 2}px - 50%) calc(${((-projected.y + 1) * rect.height) / 2}px - 100% - 7px)`;
    }
  }
  /* Every measurement's reading, kept or being taken, set down together:
     readings are words on the model, and two taken close together -- the same
     hole twice, an edge and a face beside it -- would print one over the
     other. Each goes where it belongs, and when that is taken, just below
     whatever took it. A reading sits on the middle of its line, except a
     circle's, which hangs under the circle as it is seen: on a hole the
     centre is the hole, and a reading there hides the rim, and takes the
     clicks meant for it, as soon as the hole is smaller on the screen than
     the words. */
  placeReadings() {
    const readings = [
      ...this.pins.filter((p) => p.model),
      ...this.measureAnchors.filter((a) =>
        a.el.classList.contains("measure-label"),
      ),
    ].filter((r) => !r.el.hidden);
    if (!readings.length) return;
    const rect = this.container.getBoundingClientRect();
    const screen = (p) => {
      const q = this.scratch.ring
        .copy(p)
        .applyMatrix4(this.root.matrixWorld)
        .project(this.camera);
      return [((q.x + 1) * rect.width) / 2, ((1 - q.y) * rect.height) / 2];
    };
    const boxes = readings.map(({ el, model, ring }) => {
      // Measured once it has been laid out; its words never change after.
      let size = this.readingSizes.get(el);
      if (!size && el.offsetWidth) {
        size = [el.offsetWidth, el.offsetHeight];
        this.readingSizes.set(el, size);
      }
      const [w, h] = size || [0, 0];
      let x, top;
      if (ring) {
        const low = ring.map(screen).reduce((a, b) => (b[1] > a[1] ? b : a));
        [x, top] = [low[0], low[1] + 5];
      } else {
        const [cx, cy] = screen(model);
        [x, top] = [cx, cy - h / 2];
      }
      return { el, left: x - w / 2, top, w, h };
    });
    boxes.sort((a, b) => a.top - b.top);
    const GAP = 4;
    const placed = [];
    for (const box of boxes) {
      for (
        let moved = true, guard = 0;
        moved && guard <= placed.length;
        guard++
      ) {
        moved = false;
        for (const other of placed)
          if (
            box.left < other.left + other.w &&
            other.left < box.left + box.w &&
            box.top < other.top + other.h + GAP &&
            other.top < box.top + box.h + GAP
          ) {
            box.top = other.top + other.h + GAP;
            moved = true;
          }
      }
      placed.push(box);
      box.el.style.translate = `${box.left}px ${box.top}px`;
    }
  }
  /* Placing a mark is the one moment a reviewer makes something, and it used to
     happen in silence — the label simply existed on the next frame, which reads
     as the double click having been missed rather than taken. The ripple is
     drawn where the surface was actually struck, so it also says which point of
     the model was understood as the target. */
  ripple(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mark = document.createElement("div");
    mark.className = "pin-ripple";
    // Same reason as the label above: the ripple only scales, so its position
    // has to sit in `translate` or the scale carries it away from the point.
    mark.style.translate = `${clientX - rect.left}px ${clientY - rect.top}px`;
    mark.addEventListener("animationend", () => mark.remove());
    this.effects.append(mark);
  }
  focusAnnotation(a) {
    if (["edge", "part", "measure"].includes(a.type)) {
      const p = ["edge", "part"].includes(a.type)
        ? this.objectMarkWorld(a)
        : measureAnchor(a).applyMatrix4(this.root.matrixWorld);
      const offset = this.camera.position.clone().sub(this.controls.target);
      this.camera.position.copy(p).add(offset);
      this.controls.target.copy(p);
      this.controls.update();
      return;
    }
    const mesh = this.meshMap.get(
      a.type === "pin" ? a.meshId : Object.keys(a.faces)[0],
    );
    if (!mesh) return;
    const first = Object.values(a.faces || {})[0]?.[0];
    const p =
      a.type === "pin"
        ? new V().fromArray(a.position)
        : a.coverage === "source-v2"
          ? // A region whose every face was taken whole stores no polygon to
            // aim at, so the face it does store answers instead.
            new V().fromArray(
              a.surfacePatches?.[0]?.vertices[0] ||
                this.sourceTriangle(mesh, first)?.[0] || [0, 0, 0],
            )
          : ["brush-v1", "source-v1"].includes(a.coverage)
            ? new V().fromArray(a.surfacePatches[0].vertices[0])
            : this.triangle(mesh, first).getMidpoint(new V());
    mesh.localToWorld(p);
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.camera.position.copy(p).add(offset);
    this.controls.target.copy(p);
    this.controls.update();
  }
  clearOverlay(group) {
    for (const o of [...group.children]) {
      // Geometry is per stroke; the material is shared and outlives the group.
      o.geometry.dispose();
      if (o.userData.ownedMarkMaterial) o.material.dispose();
      group.remove(o);
    }
  }
  // Overlay materials are rebuilt on every stroke. They depend only on these
  // two inputs, so share one instance per combination instead of compiling a
  // fresh onBeforeCompile closure for every patch group, every frame. Owned by
  // the viewer and released with the model, never by clearOverlay.
  markMaterial(color, selected = false) {
    const key = `${color}|${selected}`;
    const cached = this.markMaterials.get(key);
    if (cached) return cached;
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      // Solid translucency lets the model remain legible. Its boundary, not a
      // screen-space pattern, tells a painted region apart from section hatch.
      opacity: 0.46,
      toneMapped: false,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
    this.clipMaterial(material);
    this.markMaterials.set(key, material);
    return material;
  }
  setVisible(visible) {
    this.annotationsVisible = visible;
    this.overlay.visible = visible;
    this.agentOverlay.visible = visible && !this.agentHidden;
    this.previewOverlay.visible = visible;
  }
  drawPatches(group, patches, color) {
    this.clearOverlay(group);
    const groups = new Map();
    for (const p of patches) {
      if (!groups.has(p.meshId)) groups.set(p.meshId, []);
      fanInto(groups.get(p.meshId), p.vertices);
    }
    for (const [id, coords] of groups) {
      const mesh = this.meshMap.get(id);
      if (!mesh) continue;
      const geometry = new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute(coords, 3),
      );
      const overlay = new THREE.Mesh(geometry, this.markMaterial(color, true));
      overlay.matrixAutoUpdate = false;
      overlay.matrix.copy(mesh.matrixWorld);
      overlay.userData.partMeshId = mesh.userData.reviewId;
      overlay.renderOrder = 4;
      group.add(overlay);
    }
  }
  setAgentEcho(echo) {
    this.agentEcho = echo;
    const annotations =
      echo?.versionId === this.model?.id ? echo.annotations : [];
    this.clearOverlay(this.agentOverlay);
    // Drawing, so this is the side that wants every face materialised — the
    // echo comes back in whatever form it was stored in. Each region is
    // outlined on its own, so two places side by side stay two places.
    for (const a of this.serializeAnnotations(annotations || []))
      if (a.type === "region") this.drawOutline(this.agentOverlay, a);
    // The page hands the same echo back on every poll; only one it has not
    // drawn before pulses.
    if (
      echo?.id &&
      echo.id !== this.echoShownId &&
      this.agentOverlay.children.length
    ) {
      this.echoShownId = echo.id;
      this.echoArrivedAt = performance.now();
    }
  }
  /* One region's outline, as a line of its own rather than colour on the
     surface: the stretches of its edge that no other polygon of it shares,
     chained end to end so the dashes run round it without jumping, and
     brought a hair in front of the face it bounds. Drawn over the reviewer's
     marks, but only a few pixels wide and on the edge, so where the Agent
     points at a place the reviewer also painted, their colour is still all
     there and the line still shows. */
  drawOutline(group, a, mark, onlyMesh = null) {
    if (!onlyMesh) {
      const ids = new Set([
        ...Object.keys(a.faces || {}),
        ...(a.surfacePatches || []).map((p) => p.meshId),
      ]);
      for (const id of ids) this.drawOutline(group, a, mark, id);
      return;
    }
    // A mark indexed against the review mesh was cut from its triangles, and
    // the edges between two of them lie inside one source face.
    const review = !["source-v1", "source-v2"].includes(a.coverage);
    const byMesh = new Map();
    for (const patch of this.expandWholeFaces(a)) {
      const mesh = this.meshMap.get(patch.meshId);
      if (patch.meshId !== onlyMesh) continue;
      if (!mesh || this.parts?.meshVisible(patch.meshId) === false) continue;
      const carriers = [];
      const sourceFace =
        patch.sourceFaceIndex ??
        (review
          ? mesh.geometry.userData.sourceFaces?.[patch.faceIndex]
          : patch.faceIndex) ??
        patch.faceIndex;
      const source = this.sourceTriangle(mesh, sourceFace);
      if (source) carriers.push(source);
      if (review) {
        const t = this.triangle(mesh, patch.faceIndex);
        carriers.push([t.a.toArray(), t.b.toArray(), t.c.toArray()]);
      }
      if (!byMesh.has(mesh)) byMesh.set(mesh, []);
      byMesh.get(mesh).push({ vertices: patch.vertices, carriers, sourceFace });
    }
    const positions = [];
    const lifts = [];
    for (const [mesh, polygons] of byMesh) {
      /* Prefer the file's normals, not a guess that triangle winding means
         outward. Without them, only a single-sided material tells us which
         side is drawn; a double-sided one uses the eye-depth bias alone.
         Keep lift separate from position: the shader turns it toward the
         visible side when the reviewer orbits behind a double-sided sheet. */
      const { normals: sourceNormals, groups = [] } =
        mesh.userData.echoSource || {};
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(
        mesh.matrixWorld,
      );
      const normals = polygons.map((p) => {
        const n = new THREE.Vector3();
        if (sourceNormals) n.fromArray(sourceNormals, p.sourceFace * 3);
        if (!n.lengthSq()) {
          const materialIndex =
            groups.find(
              (g) =>
                p.sourceFace * 3 >= g.start &&
                p.sourceFace * 3 < g.start + g.count,
            )?.materialIndex ?? 0;
          const material = Array.isArray(mesh.material)
            ? mesh.material[materialIndex]
            : mesh.material;
          if (material?.side !== THREE.DoubleSide) {
            n.fromArray(faceNormal(p.carriers[0] || p.vertices));
            if (material?.side === THREE.BackSide) n.negate();
          }
        }
        return n
          .applyMatrix3(normalMatrix)
          .normalize()
          .multiplyScalar(ECHO_LIFT * 3);
      });
      const world = (point) =>
        new THREE.Vector3()
          .fromArray(point)
          .applyMatrix4(mesh.matrixWorld)
          .toArray();
      for (const s of chainSegments(outlineSegments(polygons))) {
        positions.push(...world(s.from), ...world(s.to));
        lifts.push(...normals[s.owner].toArray());
      }
    }
    if (!positions.length) return;
    const geometry = new LineSegmentsGeometry().setPositions(positions);
    geometry.setAttribute(
      "instanceLift",
      new THREE.InstancedBufferAttribute(new Float32Array(lifts), 3),
    );
    // Painted regions get a still, coloured boundary. Echoes alone retain the
    // cyan glow and moving dashes, even when both address the same surface.
    (mark ? ["under", "colour"] : ["glow", "under", "core"]).forEach(
      (kind, i) => {
        const line = new LineSegments2(
          geometry,
          mark
            ? this.regionLineMaterial(mark.color, mark.selected, kind)
            : this.echoLineMaterial(kind),
        );
        if (!mark && kind === "core") line.computeLineDistances();
        // Over the reviewer's marks (3) and the bucket's preview (4).
        line.renderOrder = (mark ? 4 : 5) + i;
        group.add(line);
        line.userData.explodeOutline = {
          id: onlyMesh,
          offset:
            this.meshMap.get(onlyMesh).userData.explodeOffset?.clone() ||
            new V(),
        };
      },
    );
  }
  refreshExplodeOutlines() {
    for (const group of [this.overlay, this.agentOverlay])
      for (const line of group?.children || []) {
        const data = line.userData.explodeOutline;
        if (data)
          line.position
            .copy(this.meshMap.get(data.id).userData.explodeOffset)
            .sub(data.offset);
      }
  }
  regionLineMaterial(color, selected, kind) {
    const key = `region-${color}-${selected}-${kind}`;
    let material = this.lineMaterials.get(key);
    if (material) return material;
    // Reuse the tested eye-depth lift and section-aware clipping; only the
    // visual vocabulary changes. clone() does not copy compilation callbacks.
    const base = this.echoLineMaterial("under");
    material = base.clone();
    material.onBeforeCompile = base.onBeforeCompile;
    material.customProgramCacheKey = base.customProgramCacheKey;
    material.color.set(kind === "under" ? ECHO_UNDER : color);
    material.linewidth = (selected ? 3.5 : 1.8) + (kind === "under" ? 1.5 : 0);
    material.opacity = kind === "under" ? 0.65 : 1;
    material.dashed = false;
    this.clipMaterial(material);
    this.lineMaterials.set(key, material);
    return material;
  }
  /* The echo's three strokes, bottom to top: a soft glow, a dark underlay that
     keeps the line readable on a pale model and a pale backdrop, and the
     moving dashes. Unlike a measurement's line they are hidden behind the
     model: an echo marks a surface, and a line seen through the part would
     point at the wrong side of it.

     Each stroke is drawn a little way toward the eye, along every point's own
     line of sight: that moves nothing on the screen, keeps the line in front
     of the face it lies on from whichever side it is seen, and, being a share
     of the distance, holds at any zoom. */
  echoLineMaterial(kind) {
    const key = `echo-${kind}`;
    let material = this.lineMaterials.get(key);
    if (material) return material;
    const style = {
      glow: { color: ECHO_CORE, linewidth: 9, opacity: 0.28 },
      under: { color: ECHO_UNDER, linewidth: 4.5, opacity: 0.8 },
      core: {
        color: ECHO_CORE,
        linewidth: 2.5,
        dashed: true,
        dashSize: ECHO_DASH_PX,
        gapSize: ECHO_GAP_PX,
      },
    }[kind];
    material = new LineMaterial({
      ...style,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const toward = (1 - ECHO_TOWARD_EYE).toFixed(6);
    material.onBeforeCompile = (shader) => {
      shader.vertexShader =
        "attribute vec3 instanceLift;\n" +
        shader.vertexShader.replace(
          "vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );",
          `vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );
        vec3 lift = mat3(modelViewMatrix) * instanceLift;
        start.xyz += dot(lift, -start.xyz) < 0.0 ? -lift : lift;
        end.xyz += dot(lift, -end.xyz) < 0.0 ? -lift : lift;
        start.xyz *= ${toward};
        end.xyz *= ${toward};`,
        );
    };
    const liftShader = material.onBeforeCompile;
    material.onBeforeCompile = (shader) => {
      liftShader(shader);
      shader.vertexShader = shader.vertexShader.replace(
        "#include <clipping_planes_vertex>",
        `vec4 sectionDrawPosition = mvPosition;
        mvPosition = modelViewMatrix * vec4(position.y < 0.5 ? instanceStart : instanceEnd, 1.0);
        #include <clipping_planes_vertex>
        mvPosition = sectionDrawPosition;`,
      );
    };
    material.customProgramCacheKey = () =>
      "echo-surface-lift-toward-eye-section";
    const { width, height } = this.container.getBoundingClientRect();
    material.resolution.set(width || 1, height || 1);
    this.clipMaterial(material);
    this.lineMaterials.set(key, material);
    return material;
  }
  /* Dashes measured on the screen, so they keep their length as the reviewer
     zooms, moving along the edge unless the system asks for less motion. A
     new echo's glow swells twice to draw the eye there, then settles. */
  animateEcho() {
    const core = this.lineMaterials.get("echo-core");
    if (!core || !this.agentOverlay.children.length) return;
    const worldPerPixel =
      this.navigationHeight() / Math.max(1, this.container.clientHeight);
    core.dashScale = 1 / worldPerPixel;
    const still = this.reduceMotion.matches;
    const now = performance.now();
    core.dashOffset = still
      ? 0
      : -((now / 1000) * ECHO_FLOW_PX_PER_S) % (ECHO_DASH_PX + ECHO_GAP_PX);
    const since = now - this.echoArrivedAt;
    const pulse =
      !still && since < ECHO_PULSE_MS
        ? Math.sin((2 * Math.PI * since) / ECHO_PULSE_MS) ** 2
        : 0;
    // Brighter, barely wider: a glow much wider than the line sinks into a
    // curved face beside it and shows the facets as teeth.
    const glow = this.lineMaterials.get("echo-glow");
    glow.opacity = 0.28 + 0.5 * pulse;
    glow.linewidth = 9 + 2 * pulse;
  }
}
