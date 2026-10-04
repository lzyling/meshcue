import * as THREE from "three";
import { edgeInputAsync } from "./edges.js";
import { REVIEW_GREY } from "./shared.js";
const PLAIN_DIFFUSE = new THREE.Color(REVIEW_GREY)
  .toArray()
  .map((c) => c.toFixed(4))
  .join(",");

export const DISPLAY_STYLES = [
  "edges",
  "shaded",
  "wireframe",
  "hidden",
  "xray",
];
const CACHE_BYTES = 64 * 1024 * 1024;
const cache = new Map();
let cacheBytes = 0;
const materials = (mesh) =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material];

export class DisplayModesMethods {
  initializeDisplayModes() {
    this.displayStyle = "edges";
    this.displayEdges = [];
    this.displayGeneration = 0;
    // Lifecycle wrapping is local to this feature so loading, section and
    // theme modules need no display-specific branches. Clear cancels pending
    // work before source geometry is freed; a late worker cannot attach lines
    // to a newer version. No display frame hook or polling is needed.
    const clear = this.clearModel;
    this.clearModel = (...args) => {
      this.releaseDisplay();
      this.displayClearing = true;
      try {
        return clear.apply(this, args);
      } finally {
        this.displayClearing = false;
      }
    };
    const load = this.load;
    this.load = async (...args) => {
      const pending = load.apply(this, args);
      const epoch = this.loadingEpoch;
      const result = await pending;
      if (result && epoch === this.loadingEpoch) {
        this.applyDisplayStyle();
        this.buildDisplayEdges();
      }
      return result;
    };
    const section = this.applySectionMaterials;
    this.applySectionMaterials = (...args) => {
      const result = section.apply(this, args);
      for (const edge of this.displayEdges) this.clipMaterial(edge.material);
      return result;
    };
    const theme = this.applyTheme;
    this.applyTheme = (...args) => {
      const result = theme.apply(this, args);
      this.updateDisplayEdgeColor();
      return result;
    };
    const stats = this.stats;
    this.stats = () => ({
      ...stats.call(this),
      display: {
        style: this.displayStyle,
        pending: !!this.displayPending,
        error: this.displayError || null,
        segments: this.displayEdges.reduce(
          (n, e) =>
            n + (e.visible ? e.geometry.attributes.position.count / 2 : 0),
          0,
        ),
        clipped: this.displayEdges.every(
          (e) => e.material.clippingPlanes === this.sectionClips,
        ),
        buildMs: this.displayBuildMs || 0,
        bytes: this.displayBytes || 0,
        cacheHits: this.displayCacheHits || 0,
      },
    });
  }
  setDisplayStyle(style) {
    if (!DISPLAY_STYLES.includes(style)) return;
    this.displayStyle = style;
    this.applyDisplayStyle();
  }
  restoreDisplayMaterials() {
    this.restoreSectionSides();
    for (const mesh of this.meshes)
      if (mesh.userData.displayOriginal) {
        for (const m of materials(mesh)) m.dispose();
        mesh.material = mesh.userData.displayOriginal;
        delete mesh.userData.displayOriginal;
      }
  }
  applyDisplayStyle() {
    this.restoreDisplayMaterials();
    for (const mesh of this.meshes) {
      mesh.userData.displayOriginal = mesh.material;
      const copy = (original) => {
        const m =
          this.displayStyle === "hidden"
            ? new THREE.MeshBasicMaterial({
                color: 0xe8ecee,
                side: original.side,
              })
            : original.clone();
        if (this.displayStyle === "wireframe") {
          m.colorWrite = false;
          m.depthWrite = false;
        }
        if (this.displayStyle === "xray") {
          m.opacity = 0.24;
          m.depthWrite = false;
          // Transparent model surfaces must draw before opaque mark overlays.
          // Keeping them in the opaque queue achieves that without touching
          // the mark/echo materials or their existing render order.
          m.transparent = false;
          m.blending = THREE.CustomBlending;
          m.blendSrc = THREE.SrcAlphaFactor;
          m.blendDst = THREE.OneMinusSrcAlphaFactor;
          // Match normal blending's alpha equation as well as its RGB one.
          // Squaring source alpha would make the canvas compositor brighten
          // translucent surfaces when it unpremultiplies the framebuffer.
          m.blendSrcAlpha = THREE.OneFactor;
          m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
          m.forceSinglePass = true;
          if ("transmission" in m) m.transmission = 0;
        }
        if (this.neutral && this.displayStyle !== "hidden") {
          m.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <color_fragment>",
              `#include <color_fragment>\ndiffuseColor.rgb=vec3(${PLAIN_DIFFUSE});`,
            );
          };
          m.customProgramCacheKey = () => "display-neutral";
        }
        // Three's opaque shader forces alpha=1. X-ray needs its own final
        // alpha while remaining in the model's draw order before annotations.
        if (this.displayStyle === "xray") {
          const before = m.onBeforeCompile;
          m.onBeforeCompile = (shader, renderer) => {
            before.call(m, shader, renderer);
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <opaque_fragment>",
              "#include <opaque_fragment>\ngl_FragColor.a = 0.24;",
            );
          };
          m.customProgramCacheKey = () => `display-xray-${!!this.neutral}`;
        }
        return m;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(copy)
        : copy(mesh.material);
    }
    for (const edge of this.displayEdges) {
      edge.visible = ["edges", "hidden", "wireframe"].includes(
        this.displayStyle,
      );
      edge.geometry =
        this.displayStyle === "wireframe"
          ? edge.userData.wire
          : edge.userData.feature;
    }
    this.applySectionMaterials();
    if (this.displayEdges.length) this.updateDisplayEdgeColor();
  }
  updateDisplayEdgeColor() {
    const dark = document.documentElement.dataset.theme === "dark";
    for (const edge of this.displayEdges)
      edge.material.color.set(
        dark && this.displayStyle === "wireframe"
          ? 0xa5b7c4
          : dark
            ? 0x162630
            : 0x26343d,
      );
  }
  async buildDisplayEdges() {
    const generation = this.displayGeneration;
    this.displayPending = true;
    this.displayError = null;
    this.displayBuildMs = this.displayBytes = this.displayCacheHits = 0;
    try {
      for (const [index, mesh] of this.meshes.entries()) {
        const key = `${this.model.mesh?.sha256 || this.model.sha256}:${index}`;
        let result = cache.get(key);
        if (result) {
          this.displayCacheHits++;
          cache.delete(key);
          cache.set(key, result);
        } else {
          // Yield before packing, and run the expensive welding/map build in
          // a worker. The ready model and controls remain available throughout.
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (generation !== this.displayGeneration) return;
          const input = await edgeInputAsync(
            mesh.userData.fillTopology,
            () => generation !== this.displayGeneration,
          );
          if (!input || generation !== this.displayGeneration) return;
          result = await new Promise((resolve, reject) => {
            const worker = new Worker(
              new URL("./edges-worker.js", import.meta.url),
              { type: "module" },
            );
            this.displayWorker = worker;
            this.cancelDisplayWorker = () => {
              worker.terminate();
              resolve(null);
            };
            worker.onmessage = ({ data }) => {
              worker.terminate();
              resolve(data);
            };
            worker.onerror = (event) => {
              worker.terminate();
              reject(new Error(event.message));
            };
            worker.postMessage(input, [
              input.positions.buffer,
              input.normals.buffer,
              ...(input.faceIds ? [input.faceIds.buffer] : []),
            ]);
          });
          if (generation !== this.displayGeneration || !result) return;
          this.displayWorker = this.cancelDisplayWorker = null;
          if (result.bytes <= CACHE_BYTES) {
            while (cacheBytes + result.bytes > CACHE_BYTES && cache.size) {
              const first = cache.keys().next().value;
              cacheBytes -= cache.get(first).bytes;
              cache.delete(first);
            }
            cache.set(key, result);
            cacheBytes += result.bytes;
          }
        }
        if (generation !== this.displayGeneration) return;
        const geometry = (array) =>
          new THREE.BufferGeometry().setAttribute(
            "position",
            new THREE.BufferAttribute(array, 3),
          );
        const feature = geometry(result.feature);
        const wire =
          result.wire === result.feature ? feature : geometry(result.wire);
        const material = this.clipMaterial(
          new THREE.LineBasicMaterial({
            color: 0x26343d,
            depthWrite: false,
            toneMapped: false,
            fog: false,
          }),
        );
        // Offset in clip depth, scaled by w: stable across perspective zoom,
        // without pushing model surfaces back or moving source/pick geometry.
        material.onBeforeCompile = (shader) => {
          shader.vertexShader = shader.vertexShader.replace(
            "#include <project_vertex>",
            "#include <project_vertex>\ngl_Position.z -= 0.000001 * gl_Position.w;",
          );
        };
        material.customProgramCacheKey = () => "display-edge-depth";
        const lines = new THREE.LineSegments(feature, material);
        lines.userData = { feature, wire };
        lines.renderOrder = 2;
        lines.raycast = () => {};
        mesh.add(lines);
        this.displayEdges.push(lines);
        this.displayBuildMs += result.buildMs;
        this.displayBytes += result.bytes;
      }
      this.applyDisplayStyle();
      this.updateDisplayEdgeColor();
    } catch (error) {
      if (generation === this.displayGeneration)
        this.displayError = error.message;
    } finally {
      if (generation === this.displayGeneration) this.displayPending = false;
    }
  }
  releaseDisplay() {
    this.displayGeneration++;
    this.cancelDisplayWorker?.();
    this.displayWorker = this.cancelDisplayWorker = null;
    this.displayPending = false;
    this.restoreDisplayMaterials();
    for (const edge of this.displayEdges) {
      edge.removeFromParent();
      edge.userData.feature.dispose();
      if (edge.userData.wire !== edge.userData.feature)
        edge.userData.wire.dispose();
      edge.material.dispose();
    }
    this.displayEdges = [];
  }
}
