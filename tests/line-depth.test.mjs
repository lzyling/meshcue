import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import {
  biasSurfaceLine,
  lineDepthQuantum,
  surfaceLineNear,
  biasLineSurface,
} from "../src/viewer/line-depth.js";

test("surface line tolerance is one buffer quantum, not the old visual lift", () => {
  assert.equal(lineDepthQuantum(24), 1 / 16777215);
  assert.equal(lineDepthQuantum(16), 1 / 65535);
  for (const distance of [500, 1000, 2000]) {
    for (const orthographic of [false, true]) {
      const camera = orthographic
        ? new THREE.OrthographicCamera(
            -140,
            140,
            140,
            -140,
            distance * 1e-4,
            distance * 4,
          )
        : new THREE.PerspectiveCamera(30, 1, distance * 1e-4, distance * 4);
      camera.updateMatrixWorld();
      const point = new THREE.Vector3(0, 0, -distance);
      const ndc = point.clone().project(camera);
      const shifted = ndc.clone();
      shifted.z -= 2 * lineDepthQuantum(24);
      const worldLift = shifted.unproject(camera).distanceTo(point);
      assert.ok(
        worldLift > 0 && worldLift < 1.2,
        `${orthographic}: ${distance}: ${worldLift}`,
      );
      const old = ndc.clone();
      old.z -= 1e-6;
      if (!orthographic) assert.ok(old.unproject(camera).distanceTo(point) > 2);
    }
  }
});

test("native and wide lines share depth testing and vertex bias without moving source geometry", () => {
  for (const material of [new THREE.LineBasicMaterial(), new LineMaterial()]) {
    const surface = new THREE.MeshBasicMaterial();
    const original = surface.clone();
    biasLineSurface(surface);
    assert.equal(surface.polygonOffset, true);
    assert.equal(surface.polygonOffsetFactor, 1);
    assert.equal(surface.polygonOffsetUnits, 1);
    assert.equal(original.polygonOffset, false);
    const planes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)];
    material.clippingPlanes = planes;
    const source = material.isLineMaterial
      ? material.fragmentShader
      : "#include <logdepthbuf_fragment>";
    let chained = false;
    material.onBeforeCompile = () => {
      chained = true;
    };
    const originalKey = material.customProgramCacheKey();
    assert.equal(biasSurfaceLine(material), material);
    const shader = {
      vertexShader: "#include <logdepthbuf_vertex>",
      fragmentShader: source,
      uniforms: {},
    };
    material.onBeforeCompile(shader, {
      getContext: () => ({ DEPTH_BITS: 0x0d56, getParameter: () => 24 }),
    });
    assert.equal(chained, true);
    assert.equal(material.depthTest, true);
    assert.equal(material.depthWrite, false);
    assert.equal(material.clippingPlanes, planes);
    assert.match(shader.vertexShader, /gl_Position.z -= 2.0/);
    assert.equal(shader.fragmentShader, source);
    assert.equal(
      shader.uniforms.surfaceLineDepthQuantum.value,
      lineDepthQuantum(24),
    );
    assert.equal(
      material.customProgramCacheKey(),
      `${originalKey}:surface-line-depth-v1`,
    );
  }
});

test("near plane gains precision only in empty space, including transformed/exploded meshes", () => {
  for (const camera of [
    new THREE.PerspectiveCamera(),
    new THREE.OrthographicCamera(-1, 1, 1, -1),
  ]) {
    camera.position.z = 1000;
    camera.lookAt(0, 0, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(200, 160, 20));
    mesh.updateMatrixWorld(true);
    assert.equal(surfaceLineNear(camera, [mesh], 0.1, 10), 10);
    camera.near = surfaceLineNear(camera, [mesh], 0.1, 10);
    camera.far = 4000;
    camera.updateProjectionMatrix();
    const a = new THREE.Vector3(0, 0, 10).project(camera);
    const b = new THREE.Vector3(0, 0, 8).project(camera);
    assert.ok((b.z - a.z) / 2 > 50 * lineDepthQuantum(24));
    mesh.position.z = 990;
    mesh.updateMatrixWorld(true);
    assert.equal(surfaceLineNear(camera, [mesh], 0.1, 10), 0.1);
    mesh.scale.set(0.001, 0.001, 0.001);
    mesh.updateMatrixWorld(true);
    const safe = surfaceLineNear(camera, [mesh], 0.1, 10);
    assert.ok(safe < 5 && safe > 4);
    assert.equal(surfaceLineNear(camera, [], 0.1, 10), 0.1);
    mesh.visible = false;
    assert.equal(surfaceLineNear(camera, [mesh], 0.1, 10), 0.1);
  }
});
