import * as THREE from "three";
import { GRID_Y, REVIEW_GREY } from "./shared.js";

/* The plain view rewrites diffuse inside the shader, where colour is linear. */
const PLAIN_DIFFUSE = new THREE.Color(REVIEW_GREY)
  .toArray()
  .map((c) => c.toFixed(4))
  .join(",");
export class DisplayMethods {
  setupToneMapping() {
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
  }

  setupLights() {
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
}
