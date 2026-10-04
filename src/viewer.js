import { removeNonTrianglePrimitives } from "./glb-primitives.js";
import { sectionRange } from "./section.js";
import { modelDigest } from "./browser-crypto.js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";
import { reviewSurface, surfaceCost, SURFACE_ALGORITHM } from "./surface.js";
import { buildFillTopology } from "./planar-fill.js";
import { sourceVertexNormals } from "./outline.js";
import { brepTopology } from "./measure.js";
import { t, ta } from "./i18n/index.js";
import { V, GRID_Y, REVIEW_GREY } from "./viewer/shared.js";
import { CameraMethods } from "./viewer/camera.js";
import { DisplayModesMethods } from "./viewer/display-modes.js";
import { DisplayMethods } from "./viewer/display.js";
import { SectionViewMethods } from "./viewer/section-view.js";
import { PickingMethods } from "./viewer/picking.js";
import { MarksMethods } from "./viewer/marks.js";
import { MeasureViewMethods } from "./viewer/measure-view.js";
import { EditingMethods } from "./viewer/editing.js";

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

// Matches the server's MAX_TRIANGLES; the review mesh is what has to fit.
const MAX_REVIEW_TRIANGLES = 600000;

/* STEP and STL say nothing about which way is up, so MeshCue says it for them:
   +Z, with -Y towards the reviewer -- how CAD and every slicer draw them. glTF
   does say, +Y, and is left as it is. An agent whose model is built another way
   turns it before publishing; nothing here guesses. */
const Z_UP_FORMATS = new Set(["step", "stp", "stl"]);

// The formats whose mesh the service tessellated, and so says which of the
// file's faces each triangle came from.
const STEP_FORMATS = new Set(["step", "stp"]);

/* A refusal these bytes will earn on every attempt. `settled` tells the page to
   stop asking for them, as it always has for a hash mismatch: a model it cannot
   show was otherwise fetched and refused again on every 2.2-second poll, for as
   long as the tab stayed open. */
const refusal = (message, code) =>
  Object.assign(new Error(message), { code, settled: true });

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

const reviewGrey = () =>
  new THREE.MeshStandardMaterial({
    color: REVIEW_GREY,
    roughness: 0.6,
    metalness: 0.08,
  });

/* glTF says a primitive with no material takes "a default material", and the
   default it describes is a fully rough metal. A metal has no diffuse at all,
   so the hemisphere light — the only light under the model — cannot reach it,
   and every face pointing away from the two lamps overhead renders black.
   Exporters that write geometry and nothing else produce exactly that file.

   The question asked here is what the file declares, not what the material
   looks like once loaded: a model that really did ask for bare metal keeps it.
   `tests/browser/lighting.spec.js` publishes a file of each kind. */
const declaresNoMaterials = (data) => {
  const view = new DataView(data);
  if (view.byteLength < 20) return false;
  if (view.getUint32(0, true) !== 0x46546c67) return false; // "glTF"
  if (view.getUint32(16, true) !== 0x4e4f534a) return false; // "JSON"
  const length = view.getUint32(12, true);
  if (20 + length > view.byteLength) return false;
  try {
    const json = JSON.parse(
      new TextDecoder().decode(new Uint8Array(data, 20, length)),
    );
    return !json.materials?.length;
  } catch {
    return false; // Malformed here is the loader's error to report, not ours.
  }
};
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
      stencil: true,
      powerPreference: "high-performance",
    });
    this.renderer.localClippingEnabled = true;
    this.section = null;
    this.sectionClips = [];
    this.sectionSides = new Map();
    this.sectionCapGroup = new THREE.Group();
    this.scene.add(this.sectionCapGroup);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.setupToneMapping();
    this.renderer.domElement.setAttribute("aria-label", t("a11y.viewer"));
    container.append(this.renderer.domElement);
    this.setupControls();
    this.setupLights();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.overlay = new THREE.Group();
    this.scene.add(this.overlay);
    this.agentOverlay = new THREE.Group();
    this.previewOverlay = new THREE.Group();
    this.scene.add(this.agentOverlay, this.previewOverlay);
    /* The measurement being taken -- the faces it is between, the one under
       the pointer, and its line -- kept apart from the marks: a measurement is
       the reviewer looking and is gone at the next one, while the marks are
       redrawn on every edit. */
    this.measureFaces = new THREE.Group();
    this.measureCandidateGroup = new THREE.Group();
    this.measureLines = new THREE.Group();
    this.scene.add(
      this.measureFaces,
      this.measureCandidateGroup,
      this.measureLines,
    );
    this.lineMaterials = new Map();
    this.echoShownId = null;
    this.echoArrivedAt = -Infinity;
    this.reduceMotion =
      typeof matchMedia === "function"
        ? matchMedia("(prefers-reduced-motion: reduce)")
        : { matches: false };
    this.measureFaceMaterials = new Map();
    this.measureKind = "points";
    this.measuring = null;
    this.annotationsVisible = true;
    this.fillTolerance = 6;
    // Two layers, because they are cleared on different schedules. Every pin
    // element is rebuilt whenever the marks change, so anything sharing that
    // layer is wiped by the very edit it is acknowledging — which is what
    // happened to the landing ripple: it was appended and then removed in the
    // same synchronous block, before a single frame could show it.
    this.effects = document.createElement("div");
    this.effects.className = "pin-layer";
    container.append(this.effects);
    this.labels = document.createElement("div");
    this.labels.className = "pin-layer";
    container.append(this.labels);
    // The measurement's points and reading, cleared on the measurement's own
    // schedule and not the marks'.
    this.measureLayer = document.createElement("div");
    this.measureLayer.className = "pin-layer";
    container.append(this.measureLayer);
    this.measureAnchors = [];
    // Each reading's size on the screen, measured the first time it is laid
    // out (`placeReadings`).
    this.readingSizes = new WeakMap();
    this.hoverAnchor = null;
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
      ring: new V(),
    };
    this.occlusionAt = { position: new V(), target: new V() };
    this.occlusionValid = false;
    this.markMaterials = new Map();
    this.mode = "orbit";
    this.enabled = false;
    this.loadingEpoch = 0;
    this.pendingFrame = null;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", (e) => this.pointerDown(e), true);
    canvas.addEventListener("pointermove", (e) => this.pointerMove(e));
    canvas.addEventListener("pointercancel", () => this.pointerUp());
    window.addEventListener("pointerup", (e) => {
      this.clickEdit(e);
      this.pointerUp();
    });
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.enabled = false;
      this.onError(t("model.contextLost"));
    });
    canvas.addEventListener("wheel", (e) => this.wheel(e), {
      passive: false,
      capture: true,
    });
    this.initializeDisplayModes();
    this.renderer.setAnimationLoop(() => this.render());
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    // A wide line is so many pixels wide, so it has to know how many there are.
    for (const material of this.lineMaterials.values())
      material.resolution.set(width, height);
  }
  setMode(mode) {
    this.editEpoch = (this.editEpoch || 0) + 1;
    this.clickStart = null;
    // Putting the measuring tool down, or picking it up again, starts over.
    this.clearMeasure();
    this.controls.enabled = true;
    this.clearOverlay(this.previewOverlay);
    this.fillTarget = null;
    this.mode = mode;
    // Rotation no longer competes with the mode: it is on a button that marking
    // never uses, so the camera stays available while marking.
    this.controls.enableRotate = true;
    this.renderer.domElement.style.cursor =
      mode === "orbit" ? "grab" : "crosshair";
  }
  // Every source triangle in the loaded model: the most a round could possibly
  // claim, and since `source-v2` the only ceiling on claiming that is honest.
  sourceFaceCount() {
    return this.meshes.reduce(
      (n, mesh) => n + (mesh.userData.fillTopology?.vertices.length || 0),
      0,
    );
  }
  clearModel() {
    this.setSection(null);
    this.sectionBounds = null;
    this.sectionCapGroup?.clear();
    this.sectionCap?.geometry.dispose();
    this.sectionCap = null;
    for (const material of this.sectionStencilMaterials || [])
      material.dispose();
    this.sectionStencilMaterials = [];
    this.sectionCapMaterial?.dispose();
    this.sectionCapMaterial = null;
    this.onSection?.();
    this.setNeutral(false);
    this.setAnnotations([]);
    this.clearMeasure();
    this.planeCache = null;
    this.edgeCache = null;
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
    this.root.rotation.set(0, 0, 0);
    this.root.scale.setScalar(1);
    this.setGridY(GRID_Y);
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
    if (!response.ok) throw new Error(t("model.readFailed"));
    const data = await response.arrayBuffer();
    /* Checked against whichever file was actually fetched. For a STEP that is
       the derived mesh, not the source: `sha256` names what the author
       published and is what the round is discussed by, while `mesh.sha256`
       names the bytes on screen. Comparing the drawn bytes to the source hash
       would fail every time and tell the reviewer their version was stale. */
    const shown = model.mesh ?? model;
    const hash = await modelDigest(data);
    if (hash !== shown.sha256) {
      // Coded like the service's own refusal, because they mean the same thing
      // and the page has to stop retrying either of them.
      throw refusal(ta("model.versionMismatch"), "HASH_MISMATCH");
    }
    if (epoch !== this.loadingEpoch) return;
    let object;
    if (shown.format === "glb") {
      const gltf = await new GLTFLoader().parseAsync(data, "");
      object = gltf.scene;
      removeNonTrianglePrimitives(object);
      if (declaresNoMaterials(data)) {
        const grey = reviewGrey();
        object.traverse((o) => {
          if (o.isMesh) o.material = grey;
        });
      }
    } else {
      const geometry = new STLLoader().parse(data);
      geometry.computeVertexNormals();
      object = new THREE.Mesh(geometry, reviewGrey());
      object.name = model.name;
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
      throw refusal(t("model.noExtent"), "MODEL_FORMAT");
    this.sectionBounds = bounds.clone();
    const scale = 3 / Math.max(size.x, size.y, size.z);
    /* The turn goes on `root`, beside the fit, because every coordinate handed
       to the agent stops short of `root`: a pin is in its own mesh's frame, and
       a region's `space: "model"` numbers are composed up to `root` and no
       further. Turned anywhere below it, the model would stand up and every
       mark on it would come back rotated. */
    if (Z_UP_FORMATS.has(model.format)) this.root.rotation.x = -Math.PI / 2;
    this.root.scale.setScalar(scale);
    this.root.position
      .copy(center)
      .applyQuaternion(this.root.quaternion)
      .multiplyScalar(-scale);
    this.root.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(this.root);
    const floor = fitted.min.y;
    this.extent = fitted.getSize(new V()).toArray();
    this.setGridY(Math.min(GRID_Y, floor - 0.02));
    const source = [];
    this.root.traverse((o) => {
      if (o.isMesh) source.push(o);
    });
    const faces = source.map(
      (o) =>
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3,
    );
    for (const o of source)
      if (
        o.isSkinnedMesh ||
        o.isInstancedMesh ||
        Object.values(o.geometry.morphAttributes).some((a) => a?.length)
      )
        throw refusal(t("model.animated"), "ANIMATED_MODEL");
    const sourceTotal = faces.reduce((n, c) => n + c, 0);
    if (sourceTotal > MAX_REVIEW_TRIANGLES)
      throw refusal(t("model.tooManyTriangles"), "MODEL_LIMIT");
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
    onStage(
      t("loading.rebuildingMesh", { count: sourceTotal.toLocaleString() }),
    );
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
        o.userData.echoSource = {
          normals: sourceVertexNormals(o.geometry),
          groups: o.geometry.groups.map((g) => ({ ...g })),
        };
        /* The faces of the file itself, as its tessellation wrote them into
           the mesh's `extras` (`server/step.mjs`), which the loader hands on
           as `userData`. Read only from a STEP the service converted: in any
           other GLB the same name could mean anything. */
        if (STEP_FORMATS.has(model.format) && model.mesh)
          o.userData.fillTopology.brep = brepTopology(
            o.userData.brepFaces,
            faces[i],
          );
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
      throw refusal(t("model.meshOverBudget"), "MODEL_LIMIT");
    this.model = model;
    this.onSection?.();
    this.grid.position.y = floor - 0.025;
    this.home();
    const manifest = this.meshes.map((o) => ({
      id: o.userData.reviewId,
      name: o.name || o.userData.reviewId,
      triangles:
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3,
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
  addFrameHook(fn) {
    if (typeof fn !== "function")
      throw new TypeError("A frame hook must be a function");
    this.frameHooks ??= new Set();
    this.frameHooks.add(fn);
    return () => this.frameHooks.delete(fn);
  }
  render() {
    this.controls.update();
    /* Seen from underneath, the ground is between the reviewer and the thing
       they went under there to look at, and every line of it lands on the
       surface being inspected. It is a floor: stand below it and it is not
       in the way, it is simply not there. */
    if (this.grid) this.grid.visible = this.camera.position.y > this.gridY;
    this.animateEcho();
    this.renderer.render(this.scene, this.camera);
    this.reportOrientation();
    this.placePins();
    this.placeMeasure();
    this.placeReadings();
    // Hooks run after rendering and all overlay placement, in registration order.
    // Snapshotting makes registration/removal during a hook affect the next frame.
    for (const hook of [...(this.frameHooks || [])]) hook(this);
  }
  stats() {
    const core = this.lineMaterials.get("echo-core");
    const echoLines = this.agentOverlay.children.filter(
      (o) => o.material === core,
    );
    return {
      section: this.section
        ? {
            ...this.section,
            ...sectionRange(this.sectionBounds, this.section.axis),
            offset: this.section.offset,
          }
        : null,
      sectionColor: this.sectionCapMaterial?.color.getHexString() || null,
      versionId: this.model?.id,
      meshes: this.meshes.length,
      annotationsVisible: this.annotationsVisible,
      neutral: !!this.neutral,
      fillFaces: this.fillPatches?.length || 0,
      agentEchoId: this.agentEcho?.id || null,
      // The echo as drawn: how many outlines, through how many stretches, and
      // where their dashes stand, so a test can tell a moving line from a
      // still one without reading pixels.
      echoLines: echoLines.length,
      echoSegments: echoLines.reduce(
        (n, o) => n + o.geometry.attributes.instanceStart.count,
        0,
      ),
      echoDashOffset: core?.dashOffset ?? null,
      // The canvas takes its colour from the theme tokens by hand rather than
      // by rule, so whether it followed a theme change is only checkable here.
      background: this.scene.background?.getHexString() || null,
      // Same reason as the background: the ground is placed against the model
      // and hidden against the camera, both by hand, so where it ended up is
      // only answerable from in here.
      ground: this.grid
        ? { y: +this.gridY.toFixed(3), visible: this.grid.visible }
        : null,
      // Which way the model stands, as the fitted size along x, y (up) and z.
      extent: this.extent?.map((v) => +v.toFixed(3)) ?? null,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }
}
Object.defineProperties(
  ModelViewer.prototype,
  Object.fromEntries(
    Object.entries(
      Object.getOwnPropertyDescriptors(CameraMethods.prototype),
    ).filter(([name]) => name !== "constructor"),
  ),
);
Object.defineProperties(
  ModelViewer.prototype,
  Object.fromEntries(
    Object.entries(
      Object.getOwnPropertyDescriptors(DisplayMethods.prototype),
    ).filter(([name]) => name !== "constructor"),
  ),
);
Object.defineProperties(
  ModelViewer.prototype,
  Object.fromEntries(
    Object.entries(
      Object.getOwnPropertyDescriptors(SectionViewMethods.prototype),
    ).filter(([name]) => name !== "constructor"),
  ),
);
Object.defineProperties(
  ModelViewer.prototype,
  Object.fromEntries(
    Object.entries(
      Object.getOwnPropertyDescriptors(PickingMethods.prototype),
    ).filter(([name]) => name !== "constructor"),
  ),
);
Object.defineProperties(
  ModelViewer.prototype,
  Object.fromEntries(
    Object.entries(
      Object.getOwnPropertyDescriptors(MarksMethods.prototype),
    ).filter(([name]) => name !== "constructor"),
  ),
);
Object.defineProperties(
  ModelViewer.prototype,
  Object.fromEntries(
    Object.entries(
      Object.getOwnPropertyDescriptors(MeasureViewMethods.prototype),
    ).filter(([name]) => name !== "constructor"),
  ),
);
Object.defineProperties(
  ModelViewer.prototype,
  Object.fromEntries(
    Object.entries(
      Object.getOwnPropertyDescriptors(EditingMethods.prototype),
    ).filter(([name]) => name !== "constructor"),
  ),
);

Object.defineProperties(
  ModelViewer.prototype,
  Object.fromEntries(
    Object.entries(
      Object.getOwnPropertyDescriptors(DisplayModesMethods.prototype),
    ).filter(([name]) => name !== "constructor"),
  ),
);
