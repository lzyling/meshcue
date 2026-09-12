import { modelDigest } from "./browser-crypto.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";
import { reviewSurface, surfaceCost, SURFACE_ALGORITHM } from "./surface.js";
import { brushPatches } from "./brush.js";
import { buildFillTopology, planarFaces } from "./planar-fill.js";

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
const V = THREE.Vector3;
// Matches the server's MAX_TRIANGLES; the review mesh is what has to fit.
const MAX_REVIEW_TRIANGLES = 600000;
// Let the browser actually paint before a long synchronous block starts. One
// animation frame only schedules the work; the second is what proves it ran.
// Off-screen callers — the geometry tests drive this same load path in Node —
// have nothing to paint, so they just need the turn of the event loop.
const nextPaint = () =>
  new Promise((resolve) =>
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(() => requestAnimationFrame(resolve))
      : setTimeout(resolve, 0),
  );
export class ModelViewer {
  constructor(
    container,
    { onReady, onEdit, onPin, onPaint, onStrokeEnd, onError },
  ) {
    Object.assign(this, {
      container,
      onReady,
      onEdit,
      onPin,
      onPaint,
      onStrokeEnd,
      onError,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    this.camera.position.set(4, 3, 5);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "三維模型預覽，可旋轉、縮放及標注",
    );
    container.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.15;
    this.controls.maxDistance = 18;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d9ba8, 2.6));
    const key = new THREE.DirectionalLight(0xfff4dc, 3.3);
    key.position.set(4, 7, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd3e3ff, 2);
    fill.position.set(-5, 3, -4);
    this.scene.add(fill);
    this.applyTheme();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.overlay = new THREE.Group();
    this.scene.add(this.overlay);
    this.agentOverlay = new THREE.Group();
    this.previewOverlay = new THREE.Group();
    this.scene.add(this.agentOverlay, this.previewOverlay);
    this.annotationsVisible = true;
    this.fillTolerance = 6;
    this.labels = document.createElement("div");
    this.labels.className = "pin-layer";
    container.append(this.labels);
    this.cursor = document.createElement("div");
    this.cursor.className = "brush-cursor";
    container.append(this.cursor);
    this.ray = new THREE.Raycaster();
    this.ray.firstHitOnly = true;
    this.meshes = [];
    this.meshMap = new Map();
    this.pins = [];
    // Reused per frame: the pin layer used to allocate four vectors per pin.
    this.scratch = {
      world: new V(),
      projected: new V(),
      direction: new V(),
      orient: new V(),
    };
    this.occlusionAt = { position: new V(), target: new V() };
    this.occlusionValid = false;
    this.markMaterials = new Map();
    this.mode = "orbit";
    this.radius = 22;
    this.enabled = false;
    this.drawing = false;
    this.loadingEpoch = 0;
    this.pendingFrame = null;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", (e) => this.pointerDown(e), true);
    canvas.addEventListener("pointermove", (e) => this.pointerMove(e));
    canvas.addEventListener("dblclick", (e) => this.doubleClick(e));
    canvas.addEventListener("pointercancel", () => this.pointerUp());
    canvas.addEventListener(
      "pointerleave",
      () => (this.cursor.style.display = "none"),
    );
    window.addEventListener("pointerup", (e) => {
      this.clickEdit(e);
      this.pointerUp();
    });
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.enabled = false;
      this.onError("顯示資源已中斷，草稿仍會保留；請重新整理頁面。");
    });
    this.renderer.setAnimationLoop(() => this.render());
  }
  /* WebGL paints the canvas, so the CSS token block cannot reach it: without
     this the whole page would turn dark and the model would keep sitting on a
     bright rectangle. Only the backdrop and the ground grid are read from the
     tokens — the studio lights, the default STL grey and the mark colours stay
     fixed on purpose, so the same model looks the same in either theme. */
  applyTheme() {
    const token = (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const backdrop = new THREE.Color(token("--canvas-b") || "#e9ede8");
    this.scene.background = backdrop;
    this.scene.fog = new THREE.Fog(backdrop, 10, 35);
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      this.grid.material.dispose();
    }
    this.grid = new THREE.GridHelper(
      20,
      40,
      new THREE.Color(token("--canvas-grid-line") || "#c3cdc5"),
      new THREE.Color(token("--canvas-grid") || "#d7ddd8"),
    );
    this.grid.position.y = -1.4;
    this.scene.add(this.grid);
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
  setMode(mode) {
    this.editEpoch = (this.editEpoch || 0) + 1;
    this.clickStart = null;
    this.pendingPoints = [];
    if (this.drawing) {
      this.drawing = false;
      this.onStrokeEnd();
    }
    this.controls.enabled = true;
    this.clearOverlay(this.previewOverlay);
    this.fillTarget = null;
    this.mode = mode;
    this.controls.enableRotate = mode === "orbit";
    this.cursor.style.display = "none";
    this.renderer.domElement.style.cursor =
      mode === "orbit" ? "grab" : "crosshair";
  }
  setRadius(n) {
    this.radius = n;
    this.cursor.style.width = `${n * 2}px`;
    this.cursor.style.height = `${n * 2}px`;
  }
  cameraState() {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
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
    this.controls.update();
    this.controls.enableDamping = damping;
  }
  clearModel() {
    this.setNeutral(false);
    this.setAnnotations([]);
    this.clearOverlay(this.agentOverlay);
    this.clearOverlay(this.previewOverlay);
    this.fillTarget = null;
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    this.root.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (m) materials.add(m);
    });
    for (const m of materials) {
      for (const value of Object.values(m))
        if (value?.isTexture) textures.add(value);
      m.dispose();
    }
    for (const t of textures) {
      t.dispose();
      t.source?.data?.close?.();
    }
    for (const g of geometries) {
      g.disposeBoundsTree?.();
      g.dispose();
    }
    for (const material of this.markMaterials.values()) material.dispose();
    this.markMaterials.clear();
    this.root.clear();
    this.root.position.set(0, 0, 0);
    this.root.scale.setScalar(1);
    this.meshes = [];
    this.meshMap.clear();
    this.occlusionValid = false;
    this.renderer.renderLists.dispose();
  }
  async load(model, url, onStage = () => {}) {
    const epoch = ++this.loadingEpoch;
    this.enabled = false;
    this.clearModel();
    this.model = null;
    const response = await fetch(url);
    if (!response.ok) throw new Error("模型檔案讀取失敗。");
    const data = await response.arrayBuffer();
    const hash = await modelDigest(data);
    if (hash !== model.sha256)
      throw new Error("模型檔案與 Agent 指定版本不符，已停止標注。");
    if (epoch !== this.loadingEpoch) return;
    let object;
    if (model.format === "glb") {
      const gltf = await new GLTFLoader().parseAsync(data, "");
      object = gltf.scene;
    } else {
      const geometry = new STLLoader().parse(data);
      geometry.computeVertexNormals();
      object = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: 0xb9cbd0,
          roughness: 0.6,
          metalness: 0.08,
        }),
      );
      object.name = model.name;
      // STL has no standard up axis; preserve the original model coordinates.
    }
    if (epoch !== this.loadingEpoch) {
      object.traverse((o) => o.geometry?.dispose());
      return;
    }
    this.root.add(object);
    this.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.root),
      size = bounds.getSize(new V()),
      center = bounds.getCenter(new V());
    if (!Number.isFinite(size.length()) || size.length() === 0)
      throw new Error("模型沒有可顯示的有效範圍。");
    const scale = 3 / Math.max(size.x, size.y, size.z);
    this.root.scale.setScalar(scale);
    this.root.position.copy(center).multiplyScalar(-scale);
    this.root.updateMatrixWorld(true);
    const source = [];
    this.root.traverse((o) => {
      if (o.isMesh) source.push(o);
    });
    const faces = source.map(
      (o) =>
        (o.geometry.index?.count || o.geometry.attributes.position.count) / 3,
    );
    for (const o of source)
      if (
        o.isSkinnedMesh ||
        o.isInstancedMesh ||
        o.geometry.morphAttributes.position?.length
      )
        throw new Error("請先匯出靜態網格；初版不標注變形動畫。");
    const sourceTotal = faces.reduce((n, c) => n + c, 0);
    if (sourceTotal > MAX_REVIEW_TRIANGLES)
      throw new Error("模型超過 60 萬面，請先簡化。");
    // Share the budget by what each mesh needs, not by how many triangles it
    // happens to start with. A dense mesh used to hold a share far larger than
    // it could ever spend while a mesh of a few large faces was starved down to
    // raw triangles. Every mesh keeps at least its own faces; only the surplus
    // above that is rationed, so a model that fits is left exactly as before.
    const costs = source.map((o) => surfaceCost(o.geometry, o.matrixWorld));
    const extra = costs.map((c, i) =>
      Math.max(0, c.reduce((n, x) => n + x, 0) - faces[i]),
    );
    const demand = extra.reduce((n, x) => n + x, 0);
    const spare = MAX_REVIEW_TRIANGLES - sourceTotal;
    // Subdividing and building bounds trees is one synchronous block: whatever
    // is on screen when it starts stays frozen there until it ends, animations
    // included. Version tabs turn that from a one-time cost at open into a cost
    // per switch, so name it rather than leaving a stalled spinner. Two frames,
    // because one only schedules the paint and the second proves it happened.
    onStage(`重新計算審閱網格（${sourceTotal.toLocaleString()} 面）`);
    await nextPaint();
    if (epoch !== this.loadingEpoch) return;
    const originals = new Set();
    try {
      source.forEach((o, i) => {
        const budget =
          faces[i] +
          (demand <= spare
            ? extra[i]
            : Math.floor((spare * extra[i]) / demand));
        o.userData.fillTopology = buildFillTopology(o.geometry, o.matrixWorld);
        originals.add(o.geometry);
        o.geometry = reviewSurface(o.geometry, o.matrixWorld, budget, costs[i]);
        const meshId = `mesh-${this.meshes.length}`;
        o.userData.reviewId = meshId;
        // Keep review face indices aligned with sourceFaces. BVH's default
        // in-place triangle reordering would silently corrupt annotation mapping.
        o.geometry.computeBoundsTree({ targetLeafSize: 12, indirect: true });
        this.meshes.push(o);
        this.meshMap.set(meshId, o);
      });
    } finally {
      // A mesh converted before a later one failed must not keep its source
      // geometry alive; nothing calls clearModel on this path.
      for (const geometry of originals) geometry.dispose();
    }
    const total = this.meshes.reduce(
      (n, o) => n + o.geometry.attributes.position.count / 3,
      0,
    );
    // The rationing above is what keeps this true. Say so here anyway: without
    // it an over-budget manifest reaches the server, which can only answer with
    // the generic schema rejection and leaves the viewer with no explanation.
    if (total > MAX_REVIEW_TRIANGLES)
      throw new Error("審閱網格超出 60 萬面上限，請先簡化模型。");
    this.model = model;
    this.grid.position.y = (-size.y * scale) / 2 - 0.025;
    this.home();
    const manifest = this.meshes.map((o) => ({
      id: o.userData.reviewId,
      name: o.name || o.userData.reviewId,
      triangles:
        (o.geometry.index?.count || o.geometry.attributes.position.count) / 3,
      sourceTriangles: o.geometry.userData.sourceTriangles,
      surfaceAlgorithm: SURFACE_ALGORITHM,
      matrixWorld: o.matrixWorld.toArray(),
    }));
    await this.onReady({ sha256: hash, meshes: manifest });
    if (epoch === this.loadingEpoch) this.enabled = true;
    return {
      triangles: total,
      meshes: this.meshes.length,
      // Running out of budget is silent by construction: the model loads, the
      // brush works, and only the large flat spans stop following a stroke. The
      // numbers that prove it exist right here and nowhere else afterwards.
      rationed: demand > spare,
      wanted: sourceTotal + demand,
      budget: MAX_REVIEW_TRIANGLES,
      sourceTriangles: sourceTotal,
    };
  }
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
    return this.ray.intersectObjects(this.meshes, false)[0] || null;
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
      normal: hit.face.normal.toArray(),
      barycentric: this.triangle(hit.object, hit.faceIndex)
        .getBarycoord(position, new V())
        .toArray(),
    };
  }
  serializeAnnotations(annotations) {
    return annotations.map((a) =>
      a.type === "pin" || ["brush-v1", "source-v1"].includes(a.coverage)
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
  async doubleClick(e) {
    if (
      e.button !== 0 ||
      this.mode !== "orbit" ||
      !this.enabled ||
      this.pinPending ||
      this.lastGestureDragged
    )
      return;
    e.preventDefault();
    const hit = this.rayAt(e.clientX, e.clientY);
    if (!hit) return;
    const epoch = this.editEpoch;
    const pin = this.pinFromHit(hit),
      modelId = this.model.id;
    this.pinPending = true;
    try {
      if (
        (await this.onEdit()) &&
        modelId === this.model?.id &&
        epoch === this.editEpoch
      ) {
        this.onPin(pin);
        this.onStrokeEnd();
      }
    } catch (err) {
      this.onError(err.message);
    } finally {
      this.pinPending = false;
    }
  }
  async pointerDown(e) {
    this.gestureStart = [e.clientX, e.clientY];
    this.lastGestureDragged = false;
    if (
      e.button !== 0 ||
      this.mode === "orbit" ||
      !this.enabled ||
      this.editPending ||
      this.pinPending
    )
      return;
    if (!e.altKey && ["fill", "relocate"].includes(this.mode)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      this.clickStart = [e.clientX, e.clientY];
      return;
    }
    // Temporary navigation while painting; does not create a stroke.
    if (e.altKey) {
      this.controls.enableRotate = true;
      return;
    }
    e.stopImmediatePropagation();
    e.preventDefault();
    const epoch = this.editEpoch;
    const point = [e.clientX, e.clientY],
      modelId = this.model?.id;
    if (!this.rayAt(...point)) return;
    this.drawing = true;
    this.pointerHeld = true;
    this.editPending = true;
    this.pendingPoints = [];
    this.lastPaintPoint = null;
    this.controls.enabled = false;
    try {
      const allowed = await this.onEdit();
      this.editPending = false;
      if (!allowed || modelId !== this.model?.id || epoch !== this.editEpoch) {
        this.drawing = false;
        this.controls.enabled = true;
        return;
      }
      this.paint(...point);
      this.flushPaintPoints();
      if (!this.pointerHeld) this.pointerUp();
    } catch (err) {
      this.editPending = false;
      this.drawing = false;
      this.controls.enabled = true;
      this.onError(err.message);
    }
  }
  pointerMove(e) {
    if (this.mode === "fill" && !e.buttons)
      this.previewFill(e.clientX, e.clientY);
    if (
      this.gestureStart &&
      Math.hypot(
        e.clientX - this.gestureStart[0],
        e.clientY - this.gestureStart[1],
      ) > 4
    )
      this.lastGestureDragged = true;
    const r = this.container.getBoundingClientRect();
    if (
      ["paint", "erase"].includes(this.mode) &&
      this.enabled &&
      this.annotationsVisible
    ) {
      this.cursor.style.display = "block";
      this.cursor.style.left = `${e.clientX - r.left}px`;
      this.cursor.style.top = `${e.clientY - r.top}px`;
    }
    if (this.drawing && ["paint", "erase"].includes(this.mode)) {
      this.pendingPoints.push([e.clientX, e.clientY]);
      if (!this.pendingFrame && !this.editPending)
        this.pendingFrame = requestAnimationFrame(() => {
          this.pendingFrame = null;
          if (this.drawing) this.flushPaintPoints();
        });
    }
  }
  flushPaintPoints() {
    const points = this.pendingPoints || [];
    this.pendingPoints = [];
    try {
      for (const p of points) this.paint(...p);
    } catch (err) {
      this.onError(err.message);
      this.drawing = false;
      this.controls.enabled = true;
      this.onStrokeEnd();
    }
  }
  pointerUp() {
    this.pointerHeld = false;
    this.gestureStart = null;
    if (this.editPending) return;
    if (this.drawing) {
      this.flushPaintPoints();
      this.drawing = false;
      this.lastPaintPoint = null;
      this.onStrokeEnd();
    }
    this.controls.enabled = true;
    this.controls.enableRotate = this.mode === "orbit";
  }
  paint(x, y) {
    if (!this.enabled || !this.model) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const previous = this.lastPaintPoint || [x, y];
    const distance = Math.hypot(x - previous[0], y - previous[1]);
    if (this.lastPaintPoint && distance < 0.5) return;
    const steps = Math.max(
      1,
      Math.ceil(distance / Math.max(2, this.radius / 3)),
    );
    const patches = [];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      patches.push(
        ...brushPatches(
          this.meshes,
          this.camera,
          rect,
          previous[0] + (x - previous[0]) * t,
          previous[1] + (y - previous[1]) * t,
          this.radius,
        ),
      );
    }
    this.lastPaintPoint = [x, y];
    if (patches.length) this.onPaint(patches);
  }
  setAnnotations(annotations, selectedId) {
    this.clearOverlay(this.overlay);
    this.labels.replaceChildren();
    this.pins = [];
    // Fresh pin records carry no cached occlusion; recheck on the next frame.
    this.occlusionValid = false;
    for (const a of annotations) {
      if (a.type === "pin") {
        const mesh = this.meshMap.get(a.meshId);
        if (!mesh) continue;
        const el = document.createElement("button");
        el.type = "button";
        el.className = `model-pin ${a.id === selectedId ? "selected" : ""}`;
        el.textContent = a.label;
        el.style.setProperty("--pin-color", a.color);
        el.setAttribute("aria-label", `標記 ${a.label}`);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          this.onSelect?.(a.id);
        });
        this.labels.append(el);
        this.pins.push({ el, a, mesh });
      } else {
        for (const [meshId, faces] of Object.entries(a.faces)) {
          const mesh = this.meshMap.get(meshId);
          if (!mesh) continue;
          const coords = [];
          if (["brush-v1", "source-v1"].includes(a.coverage)) {
            for (const patch of a.surfacePatches || []) {
              if (patch.meshId === meshId)
                for (const v of patch.vertices) coords.push(...v);
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
          overlay.renderOrder = 3;
          this.overlay.add(overlay);
        }
      }
    }
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
    this.camera.position
      .set(x, y, z)
      .normalize()
      .multiplyScalar(distance)
      .add(target);
    // Straight down or straight up leaves the default up vector parallel to the
    // view, where it no longer says which way is up; lay it along the floor.
    const vertical = Math.abs(y) > 0.9 && !x && !z;
    this.camera.up.set(0, vertical ? 0 : 1, vertical ? -Math.sign(y) : 0);
    this.camera.lookAt(target);
    this.controls.update();
    this.controls.enableDamping = damping;
  }
  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.reportOrientation();
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
      const world = pin.mesh.localToWorld(
        this.scratch.world.fromArray(pin.a.position),
      );
      const projected = this.scratch.projected.copy(world).project(this.camera);
      const inView =
        projected.z >= -1 &&
        projected.z <= 1 &&
        Math.abs(projected.x) < 1 &&
        Math.abs(projected.y) < 1;
      if (moved) {
        pin.unoccluded = false;
        if (inView) {
          this.ray.set(
            this.camera.position,
            this.scratch.direction
              .copy(world)
              .sub(this.camera.position)
              .normalize(),
          );
          const hit = this.ray.intersectObjects(this.meshes, false)[0];
          pin.unoccluded =
            !hit ||
            hit.distance >= this.camera.position.distanceTo(world) - 0.015;
        }
      }
      pin.el.hidden = !inView || !pin.unoccluded || !this.annotationsVisible;
      pin.el.style.transform = `translate(${((projected.x + 1) * rect.width) / 2}px,${((-projected.y + 1) * rect.height) / 2}px) translate(-50%,-100%)`;
    }
  }
  focusAnnotation(a) {
    const mesh = this.meshMap.get(
      a.type === "pin" ? a.meshId : Object.keys(a.faces)[0],
    );
    if (!mesh) return;
    const p =
      a.type === "pin"
        ? new V().fromArray(a.position)
        : ["brush-v1", "source-v1"].includes(a.coverage)
          ? new V().fromArray(a.surfacePatches[0].vertices[0])
          : this.triangle(mesh, Object.values(a.faces)[0][0]).getMidpoint(
              new V(),
            );
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
      group.remove(o);
    }
  }
  // Overlay materials are rebuilt on every stroke. They depend only on these
  // three inputs, so share one instance per combination instead of compiling a
  // fresh onBeforeCompile closure for every patch group, every frame. Owned by
  // the viewer and released with the model, never by clearOverlay.
  markMaterial(color, selected = false, agent = false) {
    const key = `${color}|${selected}|${agent}`;
    const cached = this.markMaterials.get(key);
    if (cached) return cached;
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.83,
      toneMapped: false,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float stripe = step(0.68, fract((gl_FragCoord.x ${agent ? "-" : "+"} gl_FragCoord.y) / 10.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${selected ? "0.05" : "0.98"}), stripe * 0.85);
      `,
      );
    };
    material.customProgramCacheKey = () => `marks-${selected}-${agent}`;
    this.markMaterials.set(key, material);
    return material;
  }
  setVisible(visible) {
    this.annotationsVisible = visible;
    this.overlay.visible = visible;
    this.agentOverlay.visible = visible && !this.agentHidden;
    this.previewOverlay.visible = visible;
    this.cursor.style.display = "none";
  }
  setNeutral(neutral) {
    for (const mesh of this.meshes) {
      if (neutral && !mesh.userData.originalMaterial) {
        mesh.userData.originalMaterial = mesh.material;
        const copy = (m) => {
          const neutral = m.clone();
          neutral.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <color_fragment>",
              "#include <color_fragment>\ndiffuseColor.rgb=vec3(0.52,0.56,0.58);",
            );
          };
          neutral.customProgramCacheKey = () => "review-neutral";
          return neutral;
        };
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(copy)
          : copy(mesh.material);
      } else if (!neutral && mesh.userData.originalMaterial) {
        for (const m of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material])
          m.dispose();
        mesh.material = mesh.userData.originalMaterial;
        delete mesh.userData.originalMaterial;
      }
    }
    this.neutral = neutral;
  }
  drawPatches(group, patches, color, agent = false) {
    this.clearOverlay(group);
    const groups = new Map();
    for (const p of patches) {
      if (!groups.has(p.meshId)) groups.set(p.meshId, []);
      groups.get(p.meshId).push(...p.vertices.flat());
    }
    for (const [id, coords] of groups) {
      const mesh = this.meshMap.get(id);
      if (!mesh) continue;
      const geometry = new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute(coords, 3),
      );
      const overlay = new THREE.Mesh(
        geometry,
        this.markMaterial(color, true, agent),
      );
      overlay.matrixAutoUpdate = false;
      overlay.matrix.copy(mesh.matrixWorld);
      overlay.renderOrder = agent ? 5 : 4;
      group.add(overlay);
    }
  }
  setAgentEcho(echo) {
    this.agentEcho = echo;
    const annotations =
      echo?.versionId === this.model?.id ? echo.annotations : [];
    const patches = this.serializeAnnotations(annotations || []).flatMap(
      (a) => a.surfacePatches || [],
    );
    this.drawPatches(this.agentOverlay, patches, "#f5dc72", true);
  }
  setFillTolerance(value) {
    this.fillTolerance = value;
    if (this.fillTarget) this.computeFill(this.fillTarget);
  }
  previewFill(x, y) {
    const hit = this.rayAt(x, y);
    if (!hit) {
      this.fillTarget = null;
      this.clearOverlay(this.previewOverlay);
      return;
    }
    const target = {
      mesh: hit.object,
      seed: hit.object.geometry.userData.sourceFaces[hit.faceIndex],
    };
    if (
      this.fillTarget?.mesh === target.mesh &&
      this.fillTarget?.seed === target.seed
    )
      return;
    this.computeFill(target);
  }
  computeFill(target) {
    this.fillTarget = target;
    const { mesh, seed } = target;
    const selected = new Set(
      planarFaces(mesh.userData.fillTopology, seed, this.fillTolerance),
    );
    const patches = [...selected].map((sourceFaceIndex) => ({
      meshId: mesh.userData.reviewId,
      faceIndex: sourceFaceIndex,
      sourceFaceIndex,
      vertices: mesh.userData.fillTopology.vertices[sourceFaceIndex],
    }));
    this.fillTooLarge = patches.length > 20000;
    this.fillPatches = this.fillTooLarge ? [] : patches;
    this.drawPatches(this.previewOverlay, this.fillPatches, "#fcfcfc");
  }
  async clickEdit(e) {
    const start = this.clickStart;
    this.clickStart = null;
    if (
      !start ||
      Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 4 ||
      this.pinPending
    )
      return;
    const hit = this.rayAt(e.clientX, e.clientY);
    if (!hit) return;
    const epoch = this.editEpoch;
    const mode = this.mode,
      modelId = this.model?.id;
    if (mode === "fill") this.previewFill(e.clientX, e.clientY);
    if (mode === "fill" && this.fillTooLarge) {
      this.onError(
        "此平面超過本輪 20,000 面標注上限；可收窄範圍或先簡化模型。",
      );
      return;
    }
    const patches = this.fillPatches,
      pin = this.pinFromHit(hit);
    this.pinPending = true;
    try {
      if (
        !(await this.onEdit()) ||
        modelId !== this.model?.id ||
        epoch !== this.editEpoch
      )
        return;
      if (mode === "relocate") this.onRelocate?.(pin);
      else if (mode === "fill" && patches?.length) this.onPaint(patches);
      this.onStrokeEnd();
    } catch (e) {
      this.onError(e.message);
    } finally {
      this.pinPending = false;
    }
  }
  stats() {
    return {
      versionId: this.model?.id,
      meshes: this.meshes.length,
      annotationsVisible: this.annotationsVisible,
      neutral: !!this.neutral,
      fillFaces: this.fillPatches?.length || 0,
      agentEchoId: this.agentEcho?.id || null,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }
}
