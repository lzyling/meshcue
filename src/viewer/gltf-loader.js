import { LoadingManager } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import dracoUrl from "../../server/gltf-vendor/draco_decoder.cjs?url";

// Vite emits the identical vendored decoder the service uses as a local asset.
// The JS Draco build avoids a WASM fetch and needs no eval permission; Meshopt
// embeds its own WASM. Sharing one loader also bounds the page's worker pool.
const manager = new LoadingManager();
manager.setURLModifier(() => dracoUrl);
const draco = new DRACOLoader(manager)
  .setDecoderConfig({ type: "js" })
  .setWorkerLimit(2);
export function createGltfLoader() {
  return new GLTFLoader()
    .setDRACOLoader(draco)
    .setMeshoptDecoder(MeshoptDecoder);
}
