import { removeNonTrianglePrimitives } from "./glb-primitives.js";
import {
  sectionPlane,
  sectionRange,
  retainedPoint,
  sectionIntersection,
  sectionPick,
  sectionSegment,
} from "./section.js";
import { modelDigest } from "./browser-crypto.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";
import { reviewSurface, surfaceCost, SURFACE_ALGORITHM } from "./surface.js";
import { buildFillTopology, planarFaces } from "./planar-fill.js";
import { wholeFaces } from "./annotation-edits.js";
import {
  chainSegments,
  faceNormal,
  outlineSegments,
  sourceVertexNormals,
} from "./outline.js";
import {
  brepTopology,
  circleLine,
  circleThrough,
  faceEdges,
  isFeatureEdge,
  straightEdge,
  planeAt,
  planesMeasure,
} from "./measure.js";
import { t, ta } from "./i18n/index.js";

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
const V = THREE.Vector3;
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
// Matches the server's MAX_TRIANGLES; the review mesh is what has to fit.
const MAX_REVIEW_TRIANGLES = 600000;
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
/* Where the ground sits when nothing pushes it down. A model is fitted into
   three units and centred, so whichever axis is longest reaches ±1.5 — and a
   floor at -1.4 was cutting through the base of every model that stands
   taller than it is wide. The floor gives way to the model, never the other
   way round. */
const GRID_Y = -1.4;
/* STEP and STL say nothing about which way is up, so MeshCue says it for them:
   +Z, with -Y towards the reviewer -- how CAD and every slicer draw them. glTF
   does say, +Y, and is left as it is. An agent whose model is built another way
   turns it before publishing; nothing here guesses. */
const Z_UP_FORMATS = new Set(["step", "stp", "stl"]);
// The formats whose mesh the service tessellated, and so says which of the
// file's faces each triangle came from.
const STEP_FORMATS = new Set(["step", "stp"]);
/* How far off the pole a top or bottom view stands, in radians. Far enough
   from the 1e-6 OrbitControls clamps to, too little to see. */
const POLE_OFFSET = 1e-4;
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
const midpoint = ([a, b]) => a.clone().add(b).multiplyScalar(0.5);
/* Where a measurement's reading hangs: at the middle of the line it was read
   along, or for a circle at its centre, in the model's frame. */
const measureAnchor = (m) =>
  m.center
    ? new V().fromArray(m.center)
    : midpoint(m.points.map((p) => new V().fromArray(p)));
// A kept circle, drawn round from its first point.
const keptCircle = (a) =>
  circleLine(
    {
      centre: new V().fromArray(a.center),
      normal: new V().fromArray(a.normal),
    },
    new V().fromArray(a.points[0]),
  );
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
/* The one grey for a model that does not bring its own, and the one grey the
   plain view paints every model with. They were two constants that happened to
   agree until one of them was tuned, after which plain view came out brighter
   than the colours it was meant to be standing in for. One number now.

   The number itself only means anything next to the lamps: an albedo lands
   where the rig puts it, so this was solved against the rendered result a
   reviewer approved rather than picked for its own sake. The rails in
   `tests/browser/lighting.spec.js` hold that result, which is what makes the
   next change to the rig announce itself. */
const REVIEW_GREY = 0xcdd7dc;
const reviewGrey = () =>
  new THREE.MeshStandardMaterial({
    color: REVIEW_GREY,
    roughness: 0.6,
    metalness: 0.08,
  });
/* The plain view rewrites diffuse inside the shader, where colour is linear. */
const PLAIN_DIFFUSE = new THREE.Color(REVIEW_GREY)
  .toArray()
  .map((c) => c.toFixed(4))
  .join(",");
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
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    /* ACES is built for film, and its shoulder is doing the wrong job here: it
       rolls everything bright into a narrow band near white and takes the
       colour with it. A whole modelled scene came out with its canopy at 241
       and its walls at 228 — thirteen levels for the entire building. Nothing
       was clipping; the curve simply had no room left to separate anything.

       Khronos' PBR Neutral is the curve written for showing an object rather
       than for grading a frame. On that same scene it nearly doubles the tonal
       range the model occupies and doubles what is left of its colour. */
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.domElement.setAttribute("aria-label", t("a11y.viewer"));
    container.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.15;
    this.controls.maxDistance = 18;
    /* The left button belongs to marking, in every mode. It used to be shared
       with the camera, which is why painting meant either holding Option to
       steal a rotation or switching tools to turn the model and switching back.
       Rotation moves to the right button, panning to the middle one. */
    this.controls.mouseButtons = {
      LEFT: null,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    /* Directions and colours unchanged. The two lamps overhead come down hard
       and the sky barely moves, because they are not doing the same job: the
       lamps are what drove the lit faces into the top of the range, while the
       hemisphere is the only thing lighting a face that points away from them.
       Scaling all three together — the first thing tried — fixed the glare and
       halved every underside with it, which is the same mistake as 1.0.2 made
       in the other direction. */
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d9ba8, 2.21));
    const key = new THREE.DirectionalLight(0xfff4dc, 1.39);
    key.position.set(4, 7, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd3e3ff, 0.84);
    fill.position.set(-5, 3, -4);
    this.scene.add(fill);
    this.gridY = GRID_Y;
    this.applyTheme();
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
    this.renderer.setAnimationLoop(() => this.render());
  }
  /* Nothing here asks which device is turning the wheel, because that question
     has no reliable answer and asking it was the bug. A mouse and a trackpad
     are both `pointerType: "mouse"`, so the wheel was all there was to go on —
     and on macOS both go through the same scroll acceleration, where a mouse
     notch arrives small and fractional, indistinguishable from a trackpad
     glide. Every Mac was therefore read as a trackpad and had its wheel turned
     into a pan, on a laptop with a mouse plugged in no less.

     So the wheel means one thing on every device: zoom, which is what a wheel
     is for and what a two-finger glide does on every other page. Pan is Shift
     plus the same gesture, and stays on the middle button for anyone holding a
     mouse. Pinch keeps zooming for free — the browser reports it as a ctrl-held
     wheel, which OrbitControls already dollies.

     Handled in the capture phase so OrbitControls, which would otherwise dolly
     on every wheel event, never sees the ones that mean something else here. */
  wheel(e) {
    if (!this.enabled || !e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    /* Shift+wheel is the browser's horizontal-scroll convention, so a device
       with one axis has it delivered in `deltaX` on some platforms and `deltaY`
       on others. A pan is two-dimensional either way: move by whatever axes
       arrive and it follows the gesture on both. */
    this.panBy(e.deltaX, e.deltaY);
    this.render();
  }
  /* The same arithmetic OrbitControls uses for its own panning: screen pixels
     scaled by how much world the camera covers at the distance it is orbiting. */
  panBy(dx, dy) {
    const height = this.renderer.domElement.clientHeight || 1;
    const distance = this.camera.position.distanceTo(this.controls.target);
    const perPixel =
      (2 * distance * Math.tan(((this.camera.fov / 2) * Math.PI) / 180)) /
      height;
    const right = new V().setFromMatrixColumn(this.camera.matrix, 0),
      up = new V().setFromMatrixColumn(this.camera.matrix, 1);
    const shift = right
      .multiplyScalar(dx * perPixel)
      .add(up.multiplyScalar(-dy * perPixel));
    this.camera.position.add(shift);
    this.controls.target.add(shift);
    this.controls.update();
  }
  /* WebGL paints the canvas, so the CSS token block cannot reach it: without
     this the whole page would turn dark and the model would keep sitting on a
     bright rectangle. Only the backdrop and the ground grid are read from the
     tokens — the studio lights, the default STL grey and the mark colours stay
     fixed on purpose, so the same model looks the same in either theme. */
  applyTheme() {
    const token = (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    this.sectionColor = token("--section-fill") || "#bd801a";
    if (this.sectionCapMaterial)
      this.sectionCapMaterial.color.set(this.sectionColor);
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
    this.grid.position.y = this.gridY;
    this.scene.add(this.grid);
  }
  setGridY(y) {
    this.gridY = y;
    if (this.grid) this.grid.position.y = y;
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
  cameraState() {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
    };
  }
  // Which way the top of the screen points in the world. `camera.up` is only
  // what lookAt was asked for; this is what the reviewer is actually shown.
  screenUp() {
    return new V(0, 1, 0).applyQuaternion(this.camera.quaternion).toArray();
  }
  /* Where the reviewer is looking from, in the model's own frame and units —
     the frame a region's `bounds` are in — so that it can travel with a mark.
     `cameraState` is the preview's: every model is scaled into a 3-unit box and
     centred there, and a STEP or STL stood upright, so those numbers mean
     nothing to anyone holding the file. The top of the screen goes with it
     because the camera's own up is always +Y in the preview, and so says
     nothing about which way the reviewer was holding the model when they
     called something "the top".

     Undoing `root` means inverting a matrix whose scale is 3/maxDim, which is
     not exact in binary; a coordinate that should be zero comes back as a
     residue that survives rounding (see `annotationBounds`). Anything smaller
     than a billionth of the model is that residue, and is written as zero. */
  markView() {
    this.root.updateMatrixWorld();
    const toModel = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const span = 3 / (this.root.scale.x || 1);
    const round = (v) =>
      Math.abs(v) < span * 1e-9 ? 0 : Number(v.toPrecision(6));
    const at = (v) => v.clone().applyMatrix4(toModel).toArray().map(round);
    const up = new V()
      .fromArray(this.screenUp())
      .transformDirection(toModel)
      .toArray()
      .map((v) => (Math.abs(v) < 1e-9 ? 0 : Number(v.toPrecision(6))));
    return {
      space: "model",
      position: at(this.camera.position),
      target: at(this.controls.target),
      up,
      fov: Number(this.camera.fov.toPrecision(6)),
      aspect: Number(this.camera.aspect.toPrecision(6)),
    };
  }
  // Every source triangle in the loaded model: the most a round could possibly
  // claim, and since `source-v2` the only ceiling on claiming that is honest.
  sourceFaceCount() {
    return this.meshes.reduce(
      (n, mesh) => n + (mesh.userData.fillTopology?.vertices.length || 0),
      0,
    );
  }
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
          m.premultiply(o.matrix);
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
    // Nothing moves the up vector any more (see `viewFrom`); kept so that
    // nothing that ever does can outlive a trip home.
    this.camera.up.set(0, 1, 0);
    this.controls.update();
    this.controls.enableDamping = damping;
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
      normal: hit.face.normal.toArray(),
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
  pointerDown(e) {
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
    // Option on the left button still declines to mark, which is the habit the
    // old scheme taught. Rotating no longer needs it — the right button does
    // that in every mode — so it is kept as a way to not mark, nothing more.
    if (e.altKey) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    /* Every remaining tool places its mark on a click, not on a drag, so the
       press only records where the click began; `click` asks `onEdit` for the
       draft and does the work. The drag branch left with the brush. */
    this.clickStart = [e.clientX, e.clientY];
  }
  pointerMove(e) {
    if (this.mode === "fill" && !e.buttons)
      this.previewFill(e.clientX, e.clientY);
    if (this.mode === "measure" && !e.buttons)
      this.hoverMeasure(e.clientX, e.clientY);
    if (
      this.gestureStart &&
      Math.hypot(
        e.clientX - this.gestureStart[0],
        e.clientY - this.gestureStart[1],
      ) > 4
    )
      this.lastGestureDragged = true;
  }
  pointerUp() {
    this.gestureStart = null;
    if (this.editPending) return;
    this.controls.enabled = true;
  }
  setAnnotations(annotations, selectedId) {
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
      if (a.type === "pin") {
        const mesh = this.meshMap.get(a.meshId);
        if (!mesh) continue;
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
        this.drawKeptMeasure(a, a.id === selectedId);
      } else {
        for (const [meshId, faces] of Object.entries(a.faces)) {
          const mesh = this.meshMap.get(meshId);
          if (!mesh) continue;
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
          overlay.renderOrder = 3;
          this.overlay.add(overlay);
        }
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
    /* Straight down or straight up leaves the up vector parallel to the view,
       where it no longer says which way is up. This used to lay the up vector
       along the floor instead, and OrbitControls reads it once, when it is
       built: after a top or bottom view the orbit went on turning about +Y
       while lookAt used ±Z, and the right button turned the model some other
       way until a side face or home put it back. Standing a hair off the pole
       on the +Z side draws the same picture -- -Z at the top of the screen
       from above, +Z from below -- and the orbit never changes axis. */
    const vertical = Math.abs(y) > 0.9 && !x && !z;
    this.camera.position
      .set(x, y, vertical ? Math.abs(y) * Math.tan(POLE_OFFSET) : z)
      .normalize()
      .multiplyScalar(distance)
      .add(target);
    this.camera.lookAt(target);
    this.controls.update();
    this.controls.enableDamping = damping;
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
      const world = pin.model
        ? this.scratch.world.copy(pin.model).applyMatrix4(this.root.matrixWorld)
        : pin.mesh.localToWorld(this.scratch.world.fromArray(pin.a.position));
      const projected = this.scratch.projected.copy(world).project(this.camera);
      const inView =
        projected.z >= -1 &&
        projected.z <= 1 &&
        Math.abs(projected.x) < 1 &&
        Math.abs(projected.y) < 1;
      // A measurement is drawn over the model, so its reading is never behind
      // it.
      if (moved && pin.model) pin.unoccluded = true;
      else if (moved) {
        pin.unoccluded = false;
        if (inView) {
          this.ray.set(
            this.camera.position,
            this.scratch.direction
              .copy(world)
              .sub(this.camera.position)
              .normalize(),
          );
          const hit = sectionIntersection(
            this.sectionHits(),
            this.sectionClips?.[0],
            this.ray.ray.direction,
            this.ray.ray.origin,
          );
          pin.unoccluded =
            !hit ||
            hit.distance >= this.camera.position.distanceTo(world) - 0.015;
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
    if (a.type === "measure") {
      const p = measureAnchor(a).applyMatrix4(this.root.matrixWorld);
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
        float stripe = step(0.68, fract((gl_FragCoord.x + gl_FragCoord.y) / 10.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${selected ? "0.05" : "0.98"}), stripe * 0.85);
      `,
      );
    };
    material.customProgramCacheKey = () => `marks-${selected}`;
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
  setNeutral(neutral) {
    this.restoreSectionSides();
    for (const mesh of this.meshes) {
      if (neutral && !mesh.userData.originalMaterial) {
        mesh.userData.originalMaterial = mesh.material;
        const copy = (m) => {
          const neutral = m.clone();
          neutral.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <color_fragment>",
              `#include <color_fragment>\ndiffuseColor.rgb=vec3(${PLAIN_DIFFUSE});`,
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
    this.applySectionMaterials();
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
  drawOutline(group, a) {
    // A mark indexed against the review mesh was cut from its triangles, and
    // the edges between two of them lie inside one source face.
    const review = !["source-v1", "source-v2"].includes(a.coverage);
    const byMesh = new Map();
    for (const patch of this.expandWholeFaces(a)) {
      const mesh = this.meshMap.get(patch.meshId);
      if (!mesh) continue;
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
    ["glow", "under", "core"].forEach((kind, i) => {
      const line = new LineSegments2(geometry, this.echoLineMaterial(kind));
      if (kind === "core") line.computeLineDistances();
      // Over the reviewer's marks (3) and the bucket's preview (4).
      line.renderOrder = 5 + i;
      group.add(line);
    });
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
    const distance = this.camera.position.distanceTo(this.controls.target);
    const worldPerPixel =
      (2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) /
      Math.max(1, this.container.clientHeight);
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
    // Every one of these is an entire source face by construction, so each is
    // stored as its number alone. The bucket is the cheapest tool there is.
    const patches = [...selected].map((sourceFaceIndex) => ({
      meshId: mesh.userData.reviewId,
      faceIndex: sourceFaceIndex,
      sourceFaceIndex,
      vertices: mesh.userData.fillTopology.vertices[sourceFaceIndex],
      whole: true,
    }));
    /* The bucket had a ceiling of its own — twenty thousand faces, the round's
       old face limit, which was the byte budget in disguise back when each of
       those faces would have stored a polygon repeating its own triangle.
       Every one of them is now its number alone, so a fill spanning a whole
       connected surface is a few kilobytes and there is nothing left here to
       protect. The budget is still checked, where the marks are stored. */
    this.fillPatches = patches;
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
    // Measuring edits nothing, so it asks for no lock and leaves nothing to
    // undo; only keeping one does, and that is the page's to do.
    if (this.mode === "measure") return this.measureClick(e.clientX, e.clientY);
    const hit = this.rayAt(e.clientX, e.clientY);
    if (!hit) return;
    const epoch = this.editEpoch;
    const mode = this.mode,
      modelId = this.model?.id;
    /* Placing a label used to need a double click, so the habit arrives with
       the reviewer. Two single clicks in the same spot are that habit, not a
       request for two labels stacked on one another. */
    if (mode === "label") {
      const now = Date.now(),
        last = this.lastLabelAt;
      if (
        last &&
        now - last.time < 450 &&
        Math.hypot(e.clientX - last.x, e.clientY - last.y) < 8
      )
        return;
      this.lastLabelAt = { time: now, x: e.clientX, y: e.clientY };
    }
    if (mode === "fill") this.previewFill(e.clientX, e.clientY);
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
      else if (mode === "label") {
        this.ripple(e.clientX, e.clientY);
        // Consumed by the next render, so only the mark just placed lands.
        // Every pin element is rebuilt on each pass, and animating whichever
        // ones are new would make a page refresh look like a hailstorm.
        this.placing = true;
        this.onPin(pin);
      }
      this.onStrokeEnd();
    } catch (e) {
      this.onError(e.message);
    } finally {
      this.pinPending = false;
    }
  }
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
  // A mesh's frame to the model's: composed up to `root` and stopped there,
  // as `annotationBounds` does, so the fit's scale is never multiplied in.
  modelFrame(mesh) {
    const frame = new THREE.Matrix4();
    for (let o = mesh; o && o !== this.root; o = o.parent)
      frame.premultiply(o.matrix);
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
    const key = `${mesh.userData.reviewId}:${[side.ka, side.kb].sort().join("|")}`;
    if (this.edgeCache?.key !== key)
      this.edgeCache = {
        key,
        edge: {
          ...straightEdge(
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
  hoverMeasure(x, y) {
    if (!this.enabled) return;
    const hit = this.rayAt(x, y);
    const kind = this.measureKind;
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
            result: m.result
              ? { quantity: m.result.quantity, value: m.result.value }
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
    if (!m?.result) return null;
    const span = 3 / (this.root.scale.x || 1);
    const round = (v) =>
      Math.abs(v) < span * 1e-9 ? 0 : Number(v.toPrecision(6));
    const unit = (v) => (Math.abs(v) < 1e-9 ? 0 : Number(v.toPrecision(6)));
    return {
      kind: m.kind,
      quantity: m.result.quantity,
      value: Number(m.result.value.toPrecision(6)),
      space: "model",
      points: m.result.points.map((p) => p.toArray().map(round)),
      picks: m.picks.map((p) => ({
        meshId: p.meshId,
        sourceFaceIndex: p.sourceFaceIndex,
      })),
      ...(m.kind === "planes"
        ? {
            normals: m.picks.map((p) => p.plane.normal.toArray().map(unit)),
          }
        : {}),
      ...(m.kind === "circle"
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
