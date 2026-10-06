import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ModelViewer } from "../src/viewer.js";
import { validDefaultView } from "../src/viewer/camera.js";
import { compassTransform } from "../src/orient-cube.js";
import { boxCorners } from "../src/viewer/navigation-math.js";
import { buildFillTopology } from "../src/planar-fill.js";

function cameraViewer() {
  const camera = new THREE.PerspectiveCamera(38, 1.44, 0.01, 100);
  camera.position.set(4, 2.8, 5);
  const controls = new OrbitControls(camera, null);
  controls.enableDamping = false;
  return Object.assign(Object.create(ModelViewer.prototype), {
    camera,
    controls,
    enabled: true,
    reduceMotion: { matches: true },
    scratch: { orient: new THREE.Vector3() },
    visibleNavigationBounds: () =>
      new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)),
  });
}
const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-8);

test("saved default validation rejects malformed, nonfinite and degenerate local camera frames", () => {
  const valid = { position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0] };
  assert.equal(validDefaultView(valid), true);
  assert.equal(
    validDefaultView({
      ...valid,
      projection: "orthographic",
      visibleHeight: 3,
    }),
    true,
  );
  for (const invalid of [
    null,
    {},
    { ...valid, position: [NaN, 2, 3] },
    { ...valid, position: [1e308, 2, 3] },
    { ...valid, position: [0, 0, 0] },
    { ...valid, up: [1, 2, 3] },
    { ...valid, up: [0, 0, 0] },
    { ...valid, projection: "orthographic", visibleHeight: -1 },
  ])
    assert.equal(validDefaultView(invalid), false);
});

test("Home retains today's fitted isometric default when no review preference exists", () => {
  const v = cameraViewer();
  let fit;
  v.fitAll = (options) => {
    fit = options;
  };
  v.rollNavigation(90);
  v.home();
  assert.deepEqual(v.camera.up.toArray(), [0, 1, 0]);
  assert.deepEqual(fit.direction.toArray(), [4, 2.8, 5]);
  assert.equal(v.controls.enableDamping, false);
});

test("Home restores a saved default's exact framing and screen-up direction", () => {
  const v = cameraViewer();
  v.rollNavigation(90);
  const saved = { ...v.cameraState(), up: v.screenUp() };
  v.getDefaultView = () => saved;
  v.viewFrom(1, 0, 0);
  v.home();
  assert.ok(close(v.camera.position.toArray(), saved.position));
  assert.ok(close(v.controls.target.toArray(), saved.target));
  assert.ok(close(v.screenUp(), saved.up));
});

function homeAfterSmallPart(projection) {
  const v = cameraViewer();
  v.setProjection(projection, false);
  v.fitAll({ animate: false });
  v.rollNavigation(90);
  const saved = { ...v.cameraState(), up: v.screenUp() };
  const height = v.navigationHeight();
  const limits = {
    minDistance: v.controls.minDistance,
    maxDistance: v.controls.maxDistance,
    minZoom: v.controls.minZoom,
    maxZoom: v.controls.maxZoom,
  };
  v.getDefaultView = () => saved;
  v.parts = {
    bounds: () =>
      new THREE.Box3(
        new THREE.Vector3(0.4, 0.2, 0.1),
        new THREE.Vector3(0.42, 0.22, 0.12),
      ),
  };
  v.fitPart("small-part");
  assert.ok(v.controls.maxDistance < limits.maxDistance / 10);
  v.home();
  assert.ok(close(v.camera.position.toArray(), saved.position));
  assert.ok(close(v.controls.target.toArray(), saved.target));
  assert.ok(close(v.screenUp(), saved.up));
  assert.ok(Math.abs(v.navigationHeight() - height) < 1e-8);
  for (const [key, value] of Object.entries(limits))
    assert.equal(
      v.controls[key],
      value,
      `${key} returns to whole-model limits`,
    );
}

test("perspective Home restores saved whole-model framing after fitting a small part", () => {
  homeAfterSmallPart("perspective");
});

test("orthographic Home restores saved whole-model framing after fitting a small part", () => {
  homeAfterSmallPart("orthographic");
});

test("90 degree rolls keep the pivot and distance, compass agrees, and subsequent orbit uses the rolled axis", () => {
  const v = cameraViewer();
  const position = v.camera.position.toArray();
  const target = v.controls.target.toArray();
  const originalUp = new THREE.Vector3().fromArray(v.screenUp());
  v.rollNavigation(90);
  assert.ok(close(v.camera.position.toArray(), position));
  assert.ok(close(v.controls.target.toArray(), target));
  assert.ok(
    Math.abs(originalUp.dot(new THREE.Vector3().fromArray(v.screenUp()))) <
      1e-8,
  );
  let report;
  v.onOrient = (...angles) => {
    report = angles;
  };
  v.reportOrientation();
  assert.ok(Math.abs(report[2] - 90) < 1e-8);
  assert.match(compassTransform(...report), /rotateZ/);
  assert.ok(
    new THREE.Vector3()
      .copy(v.camera.up)
      .applyQuaternion(v.controls._quat)
      .distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-8,
  );
  v.controls.rotateLeft(0.15);
  assert.ok(v.camera.position.toArray().every(Number.isFinite));
  assert.ok(
    Math.abs(
      v.camera.position.distanceTo(v.controls.target) - Math.hypot(...position),
    ) < 1e-8,
  );
  const box = new THREE.Box3(
    new THREE.Vector3(-3, -0.5, -1),
    new THREE.Vector3(3, 0.5, 1),
  );
  for (const aspect of [0.4, 2.5]) {
    v.camera.aspect = aspect;
    v.fitTo(box, { animate: false });
    v.camera.updateMatrixWorld();
    for (const corner of boxCorners(box)) {
      const point = corner.project(v.camera);
      assert.ok(
        Math.abs(point.x) < 1 && Math.abs(point.y) < 1,
        "Fit contains a rolled view in either aspect",
      );
    }
  }
  v.home();
  assert.deepEqual(v.camera.up.toArray(), [0, 1, 0]);
});

function markViewer() {
  const geometry = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0],
      3,
    ),
  );
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  mesh.userData.fillTopology = buildFillTopology(geometry, mesh.matrixWorld);
  return Object.assign(Object.create(ModelViewer.prototype), {
    meshMap: new Map([["mesh-0", mesh]]),
    lineMaterials: new Map(),
    markMaterials: new Map(),
    container: { getBoundingClientRect: () => ({ width: 800, height: 600 }) },
  });
}

test("paint uses an unmodified solid translucent material and still outlines thicker on selection", () => {
  const v = markViewer();
  const fill = v.markMaterial("#e76d5c");
  assert.equal(fill.opacity, 0.46);
  assert.equal(fill.transparent, true);
  const shader = { fragmentShader: "#include <color_fragment>" };
  fill.onBeforeCompile(shader);
  assert.equal(shader.fragmentShader, "#include <color_fragment>");
  const a = {
    type: "region",
    coverage: "source-v2",
    faces: { "mesh-0": [0, 1] },
  };
  const groups = [false, true].map((selected) => {
    const group = new THREE.Group();
    v.drawOutline(group, a, { color: "#e76d5c", selected });
    return group;
  });
  for (const group of groups) {
    assert.equal(group.children.length, 2);
    assert.equal(
      group.children[0].geometry.getAttribute("instanceStart").count,
      4,
    );
    for (const line of group.children) {
      assert.equal(line.material.dashed, false);
      assert.equal(line.material.depthTest, true);
      const shader = { vertexShader: line.material.vertexShader };
      line.material.onBeforeCompile(shader);
      assert.match(shader.vertexShader, /instanceLift/);
      assert.match(shader.vertexShader, /sectionDrawPosition/);
    }
    assert.equal(group.children.at(-1).material.color.getHexString(), "e76d5c");
  }
  assert.ok(
    groups[1].children.at(-1).material.linewidth >
      groups[0].children.at(-1).material.linewidth,
  );
});

test("View click selects only a part and double-click centres from the fresh ray hit", () => {
  const v = cameraViewer();
  let selected;
  v.parts = {
    partOfMesh: () => "part-1",
    select: (id) => {
      selected = id;
    },
  };
  const hit = {
    object: { userData: { reviewId: "mesh-0" } },
    point: new THREE.Vector3(0.4, 0.6, 0.2),
  };
  v.rayAt = () => hit;
  v.clickNavigation({
    clientX: 200,
    clientY: 200,
    pointerType: "mouse",
    timeStamp: 100,
  });
  assert.equal(selected, "part-1");
  assert.equal(v.navigationSelection, null);
  assert.equal(v.navigationSelectionOverlay, undefined);
  v.clickNavigation({
    clientX: 200,
    clientY: 200,
    pointerType: "mouse",
    timeStamp: 200,
  });
  assert.ok(v.controls.target.distanceTo(hit.point) < 1e-8);
  v.rayAt = () => null;
  v.clickNavigation({
    clientX: 200,
    clientY: 200,
    pointerType: "mouse",
    timeStamp: 300,
  });
  assert.equal(selected, null);
});
