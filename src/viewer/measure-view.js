import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import {
  circleLine,
  circleThrough,
  fitCircle,
  cylinderAt,
  planeAt,
  planesMeasure,
} from "../measure.js";
import { t } from "../i18n/index.js";
import { V, midpoint, measureAnchor } from "./shared.js";

// A kept circle, drawn round from its first point.
const keptCircle = (a) =>
  circleLine(
    {
      centre: new V().fromArray(a.center),
      normal: new V().fromArray(a.normal),
    },
    new V().fromArray(a.points[0]),
  );
export class MeasureViewMethods {
  /* Measuring. A measurement is the reviewer looking, not marking: it takes no
     edit lock, leaves nothing to undo, and is gone at the next one, or when
     the tool is put down -- unless it is kept, which makes it a mark like any
     other (`measureMark`, and the page's `keepMeasure`). Everything is worked
     out in the model's frame and units from the triangles as they arrived
     (`src/measure.js`); the screen only decides which of them was meant. */
  setMeasureKind(kind) {
    this.measureKind = kind;
    this.clearMeasure();
  }
  lineMaterial(name) {
    let material = this.lineMaterials.get(name);
    if (material) return material;
    const style = {
      // A pale halo under a dark core, so a line reads on a pale model, a dark
      // one and either backdrop.
      halo: { color: 0xffffff, linewidth: 5, opacity: 0.85 },
      line: { color: 0x14202a, linewidth: 2 },
      selected: { color: 0x2e9e78, linewidth: 2.5 },
      hover: { color: 0x2e9e78, linewidth: 3, opacity: 0.6 },
    }[name];
    material = new LineMaterial({
      ...style,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const { width, height } = this.container.getBoundingClientRect();
    material.resolution.set(width || 1, height || 1);
    this.clipMaterial(material);
    this.lineMaterials.set(name, material);
    return material;
  }
  // A polyline in the model's frame, drawn over the model: a measurement is
  // there to be read, not hidden behind the thing it measures.
  modelLine(points, material, order) {
    const geometry = new LineGeometry();
    geometry.setPositions(points.flatMap((p) => p.toArray()));
    const line = new Line2(geometry, material);
    line.matrixAutoUpdate = false;
    line.matrix.copy(this.root.matrixWorld);
    line.renderOrder = order;
    return line;
  }
  addDimension(group, points, core = "line") {
    group.add(
      this.modelLine(points, this.lineMaterial("halo"), 7),
      this.modelLine(points, this.lineMaterial(core), 8),
    );
  }
  // Plain tint, no stripes: the stripes are what says "a mark".
  addFaces(group, mesh, faces, hover = false) {
    const key = hover ? "hover" : "fixed";
    let material = this.measureFaceMaterials.get(key);
    if (!material) {
      material = new THREE.MeshBasicMaterial({
        color: 0x2e9e78,
        transparent: true,
        opacity: hover ? 0.22 : 0.42,
        toneMapped: false,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        side: THREE.DoubleSide,
      });
      this.clipMaterial(material);
      this.measureFaceMaterials.set(key, material);
    }
    const vertices = mesh.userData.fillTopology.vertices;
    const coords = [];
    for (const f of faces) for (const v of vertices[f]) coords.push(...v);
    const geometry = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(coords, 3),
    );
    const overlay = new THREE.Mesh(geometry, material);
    overlay.matrixAutoUpdate = false;
    overlay.matrix.copy(mesh.matrixWorld);
    overlay.renderOrder = 4;
    group.add(overlay);
  }
  // All smart hover and click paths use the same priority. A tessellation
  // vertex still wins within the existing snap tolerance, including on rims.
  smartCandidate(hit, x, y) {
    const point = this.snapPoint(hit, x, y);
    if (point.snapped) return { ...point, type: "point" };
    const edge = this.edgeAt(hit, x, y);
    if (edge) return { ...edge, type: "edge", mesh: hit.object };
    const face = this.planeUnder(hit);
    return face ? { ...face, type: "face" } : null;
  }
  smartOwn(pick) {
    let circle;
    if (pick.type === "edge") {
      if (!pick.curved)
        return {
          kind: "edge",
          result: {
            quantity: "length",
            value: pick.length,
            points: pick.ends,
            line: pick.points,
          },
        };
      if (!pick.mesh.userData.fillTopology.brep) {
        this.onMeasureRefused?.("curved");
        return { result: null };
      }
      circle = fitCircle(pick.points);
      if (!circle) {
        // The old edge mark is exactly two endpoints; a curved polyline
        // cannot truthfully be kept in that shape. Its tessellated length is
        // still useful on screen, explicitly labelled as an approximation.
        const value = pick.points.reduce(
          (sum, p, i, points) => sum + (i ? p.distanceTo(points[i - 1]) : 0),
          0,
        );
        return {
          kind: "edge",
          result: {
            quantity: "length",
            value,
            points: pick.ends,
            line: pick.points,
            keepable: false,
            approximate: true,
          },
        };
      }
    } else if (pick.type === "face" && pick.plane.curved) {
      const topology = pick.mesh.userData.fillTopology;
      // Fitting and validating a whole B-rep face happens only once per face
      // and model load; flat faces and mesh-only faces never enter this cache.
      topology.measureCylinders ||= new Map();
      const id = topology.brep?.of[pick.sourceFaceIndex];
      if (!topology.measureCylinders.has(id))
        topology.measureCylinders.set(
          id,
          cylinderAt(
            topology,
            pick.sourceFaceIndex,
            this.modelFrame(pick.mesh),
          ),
        );
      circle = topology.measureCylinders.get(id);
      if (!circle) this.onMeasureRefused?.("notCylinder");
    }
    if (!circle) return { result: null };
    const eye = this.root.worldToLocal(this.camera.position.clone());
    if (circle.normal.dot(eye.sub(circle.centre)) < 0)
      circle = { ...circle, normal: circle.normal.clone().negate() };
    // Project three well-spaced boundary samples onto the fitted ring. This
    // keeps its saved points exactly coplanar and at the fitted radius even
    // when the tessellation accepted by the fit contains small residuals.
    const samples = [
      0,
      Math.floor(circle.points.length / 3),
      Math.floor((2 * circle.points.length) / 3),
    ].map((i) => circle.points[i]);
    const points = samples.map((p) => {
      const radial = p.clone().sub(circle.centre);
      radial
        .addScaledVector(circle.normal, -radial.dot(circle.normal))
        .setLength(circle.diameter / 2);
      return circle.centre.clone().add(radial);
    });
    return {
      kind: "circle",
      result: {
        quantity: "diameter",
        value: circle.diameter,
        points,
        center: circle.centre,
        normal: circle.normal,
        line: circleLine(circle, points[0]),
        ...(circle.arcAngle < 359.9
          ? { radius: circle.diameter / 2, arcAngle: circle.arcAngle }
          : {}),
      },
    };
  }
  smartMeasureClick(pick) {
    if (!pick) return;
    if (!this.measuring?.smart || this.measuring.picks.length >= 2)
      this.measuring = { kind: "smart", smart: true, picks: [], result: null };
    const m = this.measuring;
    const first = m.picks[0];
    if (
      first?.type === "face" &&
      pick.type === "face" &&
      first.mesh === pick.mesh &&
      first.faceSet.has(pick.sourceFaceIndex)
    )
      return this.onMeasureRefused?.("sameFace");
    m.picks.push(pick);
    m.result = null;
    m.savedKind = null;
    if (!first) {
      const own = this.smartOwn(pick);
      m.result = own.result;
      m.savedKind = own.kind;
    } else if (first.type === "point" && pick.type === "point") {
      const points = m.picks.map((p) => p.point);
      m.savedKind = "points";
      m.result = {
        quantity: "length",
        value: points[0].distanceTo(points[1]),
        points,
      };
    } else if (
      first.type === "face" &&
      pick.type === "face" &&
      !first.plane.curved &&
      !pick.plane.curved
    ) {
      m.savedKind = "planes";
      m.result = planesMeasure(first, pick);
    } else this.onMeasureRefused?.("unsupported");
    this.drawMeasure();
  }
  hoverSmartMeasure(hit, x, y) {
    const candidate = hit ? this.smartCandidate(hit, x, y) : null;
    const old = this.measureCandidate;
    this.measureCandidate = candidate;
    this.hoverAnchor?.el.remove();
    this.hoverAnchor = null;
    if (candidate?.type === "point") {
      const el = document.createElement("div");
      el.className = "measure-dot hover snapped";
      this.hoverAnchor = { el, model: candidate.point };
      this.measureLayer.append(el);
    }
    // Avoid rebuilding the same large face/edge overlay for every pixel.
    if (
      candidate?.type === "face" &&
      old?.type === "face" &&
      candidate.plane === old.plane
    )
      return;
    if (
      candidate?.type === "edge" &&
      old?.type === "edge" &&
      candidate.points === old.points
    )
      return;
    this.clearOverlay(this.measureCandidateGroup);
    if (candidate?.type === "edge")
      this.measureCandidateGroup.add(
        this.modelLine(candidate.points, this.lineMaterial("hover"), 8),
      );
    if (candidate?.type === "face")
      this.addFaces(
        this.measureCandidateGroup,
        candidate.mesh,
        candidate.plane.faces,
        true,
      );
  }
  hoverMeasure(x, y) {
    if (!this.enabled) return;
    const hit = this.rayAt(x, y);
    const kind = this.measureKind;
    if (kind === "smart") return this.hoverSmartMeasure(hit, x, y);
    const onPoints = kind === "points" || kind === "circle";
    const candidate = !hit
      ? null
      : kind === "edge"
        ? this.edgeAt(hit, x, y)
        : kind === "planes"
          ? this.planeUnder(hit)
          : this.snapPoint(hit, x, y);
    const same =
      kind === "planes"
        ? candidate?.plane === this.measureCandidate?.plane
        : kind === "edge" && candidate === this.measureCandidate;
    this.measureCandidate = candidate;
    // Where a click would land, and whether it would take a corner.
    if (onPoints) {
      if (!candidate) {
        this.hoverAnchor?.el.remove();
        this.hoverAnchor = null;
        return;
      }
      this.hoverAnchor ||= { el: document.createElement("div") };
      this.hoverAnchor.model = candidate.point;
      this.hoverAnchor.el.className = `measure-dot hover${candidate.snapped ? " snapped" : ""}`;
      if (!this.hoverAnchor.el.isConnected)
        this.measureLayer.append(this.hoverAnchor.el);
      return;
    }
    if (same) return;
    this.clearOverlay(this.measureCandidateGroup);
    // A curved edge or face is not offered: it is not one this tool measures.
    if (candidate && kind === "edge" && !candidate.curved)
      this.measureCandidateGroup.add(
        this.modelLine(candidate.points, this.lineMaterial("hover"), 8),
      );
    if (candidate && kind === "planes" && !candidate.plane.curved)
      this.addFaces(
        this.measureCandidateGroup,
        candidate.mesh,
        candidate.plane.faces,
        true,
      );
  }
  measureClick(x, y) {
    const hit = this.rayAt(x, y);
    if (!hit) return;
    const kind = this.measureKind;
    if (kind === "smart")
      return this.smartMeasureClick(this.smartCandidate(hit, x, y));
    // A finished measurement is replaced by the next click, not added to.
    if (!this.measuring || this.measuring.result)
      this.measuring = { kind, picks: [], result: null };
    const m = this.measuring;
    if (kind === "circle") {
      const pick = this.snapPoint(hit, x, y);
      /* A point already taken adds nothing to a circle, and nor does a third
         in line with the first two: either is taken back and asked for again.
         "Already taken" is to a ten-thousandth of the model, which the same
         corner twice always is and two clicks meant apart never are. */
      const span = 3 / (this.root.scale.x || 1);
      if (m.picks.some((p) => p.point.distanceTo(pick.point) < span * 1e-4))
        return this.onMeasureRefused?.("noCircle");
      m.picks.push(pick);
      if (m.picks.length === 3) {
        const points = m.picks.map((p) => p.point);
        const circle = circleThrough(points);
        if (!circle) {
          m.picks.pop();
          return this.onMeasureRefused?.("noCircle");
        }
        /* Which way the normal points is the reviewer's side of the circle:
           the one they were looking from, which on a hole is out of the face
           it is drilled into. */
        const eye = this.root.worldToLocal(this.camera.position.clone());
        if (circle.normal.dot(eye.sub(circle.centre)) < 0)
          circle.normal.negate();
        m.result = {
          quantity: "diameter",
          value: circle.diameter,
          points,
          center: circle.centre,
          normal: circle.normal,
          line: circleLine(circle, points[0]),
        };
      }
    } else if (kind === "points") {
      m.picks.push(this.snapPoint(hit, x, y));
      if (m.picks.length === 2) {
        const points = m.picks.map((p) => p.point);
        m.result = {
          quantity: "length",
          value: points[0].distanceTo(points[1]),
          points,
        };
      }
    } else if (kind === "edge") {
      const edge = this.edgeAt(hit, x, y);
      if (!edge || edge.curved) {
        this.measuring = null;
        this.drawMeasure();
        this.onMeasureRefused?.(edge ? "curved" : "noEdge");
        return;
      }
      m.picks = [edge];
      m.result = {
        quantity: "length",
        value: edge.length,
        points: edge.ends,
        line: edge.points,
      };
    } else {
      const face = this.planeUnder(hit);
      if (!face) return;
      if (face.plane.curved) return this.onMeasureRefused?.("curvedFace");
      const first = m.picks[0];
      if (
        first?.mesh === face.mesh &&
        first.faceSet.has(face.sourceFaceIndex)
      ) {
        this.onMeasureRefused?.("sameFace");
        return;
      }
      m.picks.push(face);
      if (m.picks.length === 2)
        m.result = planesMeasure(m.picks[0], m.picks[1]);
    }
    this.drawMeasure();
  }
  drawMeasure() {
    this.clearOverlay(this.measureLines);
    this.clearOverlay(this.measureFaces);
    this.measureLayer.replaceChildren();
    if (this.hoverAnchor) this.measureLayer.append(this.hoverAnchor.el);
    this.measureAnchors = [];
    const m = this.measuring;
    const anchor = (className, model, ring) => {
      const el = document.createElement("div");
      el.className = className;
      this.measureLayer.append(el);
      this.measureAnchors.push({ el, model: model.clone(), ring });
      return el;
    };
    if (m?.smart)
      for (const p of m.picks) {
        if (p.type === "face")
          this.addFaces(this.measureFaces, p.mesh, p.plane.faces);
        if (p.type === "point") anchor("measure-dot", p.point);
      }
    if (m?.kind === "planes")
      for (const p of m.picks)
        this.addFaces(this.measureFaces, p.mesh, p.plane.faces);
    if (m?.kind === "points" || m?.kind === "circle")
      for (const p of m.picks) anchor("measure-dot", p.point);
    if (m?.result) {
      this.addDimension(this.measureLines, m.result.line || m.result.points);
      anchor(
        "measure-label",
        m.result.center || midpoint(m.result.points),
        m.result.center && m.result.line,
      ).textContent = this.formatMeasure?.(m.result) ?? String(m.result.value);
    }
    // On its point from the first frame, not the corner of the view.
    this.placeMeasure();
    this.placeReadings();
    this.onMeasure?.(
      m
        ? {
            kind: m.kind,
            picks: m.picks.length,
            ...(m.smart ? { objects: m.picks.map((p) => p.type) } : {}),
            result: m.result
              ? {
                  quantity: m.result.quantity,
                  value: m.result.value,
                  keepable: m.result.keepable,
                  approximate: m.result.approximate,
                  radius: m.result.radius,
                  arcAngle: m.result.arcAngle,
                }
              : null,
          }
        : null,
    );
  }
  placeMeasure() {
    const anchors = this.hoverAnchor
      ? [...this.measureAnchors, this.hoverAnchor]
      : this.measureAnchors;
    if (!anchors.length) return;
    const rect = this.container.getBoundingClientRect();
    for (const a of anchors) {
      const p = this.scratch.projected
        .copy(a.model)
        .applyMatrix4(this.root.matrixWorld);
      const retained = this.sectionContains(p);
      p.project(this.camera);
      a.el.hidden =
        !retained ||
        p.z < -1 ||
        p.z > 1 ||
        Math.abs(p.x) >= 1 ||
        Math.abs(p.y) >= 1;
      if (!a.el.classList.contains("measure-label"))
        a.el.style.translate = `calc(${((p.x + 1) * rect.width) / 2}px - 50%) calc(${((1 - p.y) * rect.height) / 2}px - 50%)`;
    }
  }
  clearMeasure() {
    this.measuring = null;
    this.measureCandidate = null;
    this.hoverAnchor = null;
    if (!this.measureLayer) return;
    this.clearOverlay(this.measureCandidateGroup);
    this.drawMeasure();
  }
  /* The measurement on screen as a mark keeps it: what was measured, between
     what, and the number, in the model's frame and units (an angle in
     degrees). Six significant figures, as a region's bounds and a mark's view
     are, and a coordinate within a billionth of the model of zero is zero. */
  measureMark() {
    const m = this.measuring;
    if (!m?.result || m.result.keepable === false) return null;
    const kind = m.smart ? m.savedKind : m.kind;
    let picks = m.picks;
    if (m.smart && kind === "circle") {
      const source = m.picks[0];
      const topology = source.mesh.userData.fillTopology;
      const frame = this.modelFrame(source.mesh);
      // A fitted circle is still the existing three-point mark. Associate
      // each fitted ring sample with its nearest source triangle, rather than
      // pretending all three samples were on the triangle clicked once.
      picks = m.result.points.map((point) => {
        let sourceFaceIndex = source.sourceFaceIndex,
          best = Infinity;
        for (let face = 0; face < topology.vertices.length; face++)
          for (const corner of topology.vertices[face]) {
            const distance = new V()
              .fromArray(corner)
              .applyMatrix4(frame)
              .distanceToSquared(point);
            if (distance < best) {
              best = distance;
              sourceFaceIndex = face;
            }
          }
        return { meshId: source.meshId, sourceFaceIndex };
      });
    }
    const span = 3 / (this.root.scale.x || 1);
    const round = (v) =>
      Math.abs(v) < span * 1e-9 ? 0 : Number(v.toPrecision(6));
    const unit = (v) => (Math.abs(v) < 1e-9 ? 0 : Number(v.toPrecision(6)));
    return {
      kind,
      quantity: m.result.quantity,
      value: Number(m.result.value.toPrecision(6)),
      space: "model",
      points: m.result.points.map((p) => p.toArray().map(round)),
      picks: picks.map((p) => ({
        meshId: p.meshId,
        sourceFaceIndex: p.sourceFaceIndex,
      })),
      ...(kind === "planes"
        ? {
            normals: m.picks.map((p) => p.plane.normal.toArray().map(unit)),
          }
        : {}),
      ...(kind === "circle"
        ? {
            center: m.result.center.toArray().map(round),
            normal: m.result.normal.toArray().map(unit),
          }
        : {}),
    };
  }
  // A kept measurement: its line, its reading at the middle of it, and when it
  // is the one selected, the faces it was taken between.
  drawKeptMeasure(a, selected) {
    const ring = a.kind === "circle" ? keptCircle(a) : null;
    const line = ring || a.points.map((p) => new V().fromArray(p));
    this.addDimension(this.overlay, line, selected ? "selected" : "line");
    if (selected && a.kind === "planes")
      for (const pick of a.picks) {
        const mesh = this.meshMap.get(pick.meshId);
        const plane =
          mesh?.userData.fillTopology &&
          planeAt(
            mesh.userData.fillTopology,
            pick.sourceFaceIndex,
            this.modelFrame(mesh),
          );
        if (plane) this.addFaces(this.overlay, mesh, plane.faces);
      }
    const el = document.createElement("button");
    el.type = "button";
    el.className = `measure-label${selected ? " selected" : ""}`;
    const name = document.createElement("b");
    name.textContent = a.label;
    el.append(name, ` ${this.formatMeasure?.(a) ?? a.value}`);
    el.setAttribute("aria-label", t("marks.one", { label: a.label }));
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onSelect?.(a.id);
    });
    this.labels.append(el);
    this.pins.push({ el, a, model: measureAnchor(a), ring });
  }
}
