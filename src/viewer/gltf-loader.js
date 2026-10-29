import {
  BufferAttribute,
  BufferGeometry,
  InterleavedBuffer,
  InterleavedBufferAttribute,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import dracoUrl from "../../server/gltf-vendor/draco_decoder.cjs?url";

// Draco primitives decode with the identical vendored JavaScript decoder the
// service uses, emitted by Vite as a local asset. It avoids a WASM fetch and
// needs no eval permission. three's DRACOLoader can only be held to its JS
// decoder through a deprecated option, and its default WASM paths make the
// bundler emit decoders that are never used, so GLTFLoader gets this small
// adapter instead. One shared pool bounds the page's decoder workers.
class VendoredDracoDecoder {
  constructor(workerLimit) {
    this.workerLimit = workerLimit;
    this.workers = [];
    this.nextId = 1;
    this.tasks = new WeakMap();
  }

  // GLTFLoader calls this on finding the extension; workers start on demand.
  preload() {
    return this;
  }

  worker(cost) {
    if (this.workers.length < this.workerLimit) {
      const worker = new Worker(new URL("./draco-worker.js", import.meta.url));
      worker.tasks = new Map();
      worker.load = 0;
      const settle = (id, settleTask) => {
        const task = worker.tasks.get(id);
        if (!task) return;
        worker.tasks.delete(id);
        worker.load -= task.cost;
        settleTask(task);
      };
      worker.onmessage = ({ data }) =>
        settle(data.id, (task) =>
          data.error
            ? task.reject(new Error(data.error))
            : task.resolve(data.geometry),
        );
      worker.onerror = (event) => {
        event.preventDefault();
        const error = new Error(event.message || "Draco decoder failed.");
        for (const id of [...worker.tasks.keys()])
          settle(id, (task) => task.reject(error));
        // A worker that failed to start cannot recover; let the next decode
        // start a fresh one instead of queueing behind it.
        worker.terminate();
        this.workers = this.workers.filter((w) => w !== worker);
      };
      worker.postMessage({
        type: "init",
        decoderUrl: new URL(dracoUrl, document.baseURI).href,
      });
      this.workers.push(worker);
    }
    const worker = this.workers.reduce((a, b) => (b.load < a.load ? b : a));
    worker.load += cost;
    return worker;
  }

  decode(buffer, config) {
    // The buffer is transferred to the worker. A second primitive sharing the
    // same buffer view must reuse that result rather than send it again.
    const key = JSON.stringify(config);
    const cached = this.tasks.get(buffer);
    if (cached?.key === key) return cached.promise;
    if (cached)
      throw new Error("Draco buffer was already decoded differently.");
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      const cost = buffer.byteLength;
      const worker = this.worker(cost);
      worker.tasks.set(id, { cost, resolve, reject });
      worker.postMessage({ type: "decode", id, config, buffer }, [buffer]);
    }).then(geometryFrom);
    this.tasks.set(buffer, { key, promise });
    return promise;
  }

  // Signature used by GLTFLoader's KHR_draco_mesh_compression extension. It
  // always passes linear vertex colors, which need no conversion.
  decodeDracoFile(buffer, onLoad, attributeIDs, attributeTypes, _, onError) {
    let pending;
    try {
      pending = this.decode(buffer, { attributeIDs, attributeTypes });
    } catch (error) {
      pending = Promise.reject(error);
    }
    return pending.then(onLoad, onError);
  }

  dispose() {
    for (const worker of this.workers) worker.terminate();
    this.workers = [];
  }
}

function geometryFrom({ index, attributes }) {
  const geometry = new BufferGeometry();
  geometry.setIndex(new BufferAttribute(index, 1));
  for (const { name, array, itemSize, stride } of attributes) {
    const attribute =
      itemSize === stride
        ? new BufferAttribute(array, itemSize)
        : new InterleavedBufferAttribute(
            new InterleavedBuffer(array, stride),
            itemSize,
            0,
          );
    // GLTFLoader then applies each accessor's own normalized flag.
    if (name === "color")
      attribute.normalized = !(array instanceof Float32Array);
    geometry.setAttribute(name, attribute);
  }
  return geometry;
}

// Meshopt embeds its own WASM and compiles it as soon as its module is
// evaluated. Few models use it, so the module is fetched from the local
// bundle, and compiled, only when a model carries EXT_meshopt_compression.
let meshopt;
const lazyMeshopt = {
  supported: typeof WebAssembly === "object",
  decodeGltfBufferAsync(...args) {
    meshopt ||= import("three/addons/libs/meshopt_decoder.module.js").then(
      ({ MeshoptDecoder }) => MeshoptDecoder,
      (error) => {
        meshopt = null;
        throw error;
      },
    );
    return meshopt.then((decoder) => decoder.decodeGltfBufferAsync(...args));
  },
};

const draco = new VendoredDracoDecoder(2);
export function createGltfLoader() {
  return new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(lazyMeshopt);
}
