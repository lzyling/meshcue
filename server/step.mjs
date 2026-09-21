/* STEP arrives as exact surfaces; a viewer can only draw triangles. This turns
   one into the other, once, at import.

   The tessellation is the part worth being careful about. Marks anchor on
   `meshId` + face index (`server/index.mjs`), so the deflection that produced
   those indices is not a rendering preference — it is part of what a mark
   means. Recompute it later with a different value and every existing mark
   quietly moves to a different piece of the model. So the derived mesh is
   written beside the source, keyed by the source hash, and never recomputed;
   `importModel` reuses the file if it is already there. The parameters travel
   with it so a future reader can see what produced the indices rather than
   having to guess from the current defaults. */
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

/* Two homes, because the library is LGPL and stays replaceable in both. From a
   clone or a global install it resolves out of node_modules like any other
   dependency. The plugin build has no node_modules at all -- everything else is
   bundled into one file -- so `build-integration.mjs` copies the two dist files
   beside the server instead. Bundling them would be the one arrangement that
   takes away the user's ability to swap the library, which is the thing LGPL
   asks us to leave alone.

   Searched rather than hardcoded: the bundler puts its entry points at more
   than one depth under the package root, and one copy of a 7.6 MB binary they
   can all find is worth a loop. */
function vendored() {
  let dir = here;
  for (let up = 0; up < 3; up++) {
    const candidate = path.join(dir, "vendor", "occt-import-js.js");
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

let occtPromise = null;
function occt() {
  if (!occtPromise) occtPromise = require(vendored() ?? "occt-import-js")();
  return occtPromise;
}

export const STEP_FORMATS = ["step", "stp"];

/* OCCT's own default. Measured across 485 real parts: median 1,356 triangles,
   worst 73,132 -- an order of magnitude under the cap, so there is no reason to
   coarsen the default to defend a budget it never approaches. */
export const DEFLECTION = Object.freeze({
  linearUnit: "millimeter",
  linearDeflectionType: "bounding_box_ratio",
  linearDeflection: 0.001,
  angularDeflection: 0.5,
});

/* The parser writes its complaints straight to stderr ("**** ERR StepFile"),
   which on a malformed upload is noise the reviewer must never be shown and the
   host should not have to read either. The result object already says whether
   it worked. */
function quietly(fn) {
  const write = process.stderr.write;
  process.stderr.write = () => true;
  try {
    return fn();
  } finally {
    process.stderr.write = write;
  }
}

const GL = { FLOAT: 5126, UNSIGNED_INT: 5125, ARRAY: 34962, ELEMENT: 34963 };
const pad4 = (n) => (n + 3) & ~3;

/* A glTF writer, kept to exactly what a review mesh needs: triangles, normals,
   and a colour when the source declared one. Nothing here is a general-purpose
   exporter, and it should not become one -- the viewer is the only reader. */
function toGlb(meshes, generator) {
  const views = [],
    accessors = [],
    chunks = [];
  let offset = 0;
  const put = (typed, target, extra = {}) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    chunks.push(bytes, Buffer.alloc(pad4(bytes.length) - bytes.length));
    views.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: bytes.length,
      target,
    });
    offset += pad4(bytes.length);
    accessors.push({
      bufferView: views.length - 1,
      count: extra.count,
      ...extra.rest,
    });
    return accessors.length - 1;
  };

  const gltfMeshes = [],
    nodes = [],
    materials = [];
  for (const m of meshes) {
    const position = Float32Array.from(m.attributes.position.array);
    const index = Uint32Array.from(m.index.array);
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < position.length; i += 3)
      for (let k = 0; k < 3; k++) {
        if (position[i + k] < min[k]) min[k] = position[i + k];
        if (position[i + k] > max[k]) max[k] = position[i + k];
      }
    const attributes = {
      POSITION: put(position, GL.ARRAY, {
        count: position.length / 3,
        rest: { componentType: GL.FLOAT, type: "VEC3", min, max },
      }),
    };
    const normal = m.attributes.normal?.array;
    if (normal?.length === position.length)
      attributes.NORMAL = put(Float32Array.from(normal), GL.ARRAY, {
        count: normal.length / 3,
        rest: { componentType: GL.FLOAT, type: "VEC3" },
      });
    const indices = put(index, GL.ELEMENT, {
      count: index.length,
      rest: { componentType: GL.UNSIGNED_INT, type: "SCALAR" },
    });

    const primitive = { attributes, indices, mode: 4 };
    /* Only when the source said so. A STEP that declares no colour must reach
       the viewer with no material at all, because that is exactly what makes
       `declaresNoMaterials` hand it the review grey -- the same path every
       untinted STL already takes. Inventing a white material here would opt
       these models out of it and put them back in the dark. */
    if (m.color) {
      materials.push({
        name: `${m.name || "part"} colour`,
        pbrMetallicRoughness: {
          baseColorFactor: [...m.color.slice(0, 3), 1],
          metallicFactor: 0,
          roughnessFactor: 0.85,
        },
      });
      primitive.material = materials.length - 1;
    }
    /* The b-rep face ranges are the one thing a tessellation knows that its
       triangles do not. Carrying them in `extras` costs a few hundred bytes and
       keeps the door open to anchoring a mark on "this fillet" rather than on a
       triangle number. Nothing reads it yet. */
    gltfMeshes.push({
      name: m.name || undefined,
      primitives: [primitive],
      extras: m.brep_faces?.length
        ? { brepFaces: m.brep_faces.map((f) => [f.first, f.last]) }
        : undefined,
    });
    nodes.push({ mesh: gltfMeshes.length - 1, name: m.name || undefined });
  }

  const json = {
    asset: { version: "2.0", generator },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes: gltfMeshes,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: offset }],
  };
  if (materials.length) json.materials = materials;

  const bin = Buffer.concat(chunks);
  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = Buffer.alloc(pad4(jsonBytes.length) - jsonBytes.length, 0x20);
  const header = (length, type) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(length, 0);
    b.writeUInt32LE(type, 4);
    return b;
  };
  const body = Buffer.concat([
    header(jsonBytes.length + jsonPad.length, 0x4e4f534a),
    jsonBytes,
    jsonPad,
    header(bin.length, 0x004e4942),
    bin,
  ]);
  const top = Buffer.alloc(12);
  top.write("glTF", 0, "ascii");
  top.writeUInt32LE(2, 4);
  top.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([top, body]);
}

/* Returns the derived mesh and what it is made of, or throws with the same
   shape of error the other formats use. `generator` is the caller's version
   string, written into the file so a mesh on disk can say what produced it. */
export function convertStep(buffer, { generator = "MeshCue" } = {}) {
  const result = quietly(() =>
    occtSync().ReadStepFile(new Uint8Array(buffer), { ...DEFLECTION }),
  );
  if (!result?.success || !result.meshes?.length) return { ok: false };
  const meshes = result.meshes.filter(
    (m) => m.attributes?.position?.array?.length && m.index?.array?.length,
  );
  if (!meshes.length) return { ok: false };
  let triangles = 0,
    brepFaces = 0;
  for (const m of meshes) {
    triangles += m.index.array.length / 3;
    brepFaces += (m.brep_faces || []).length;
  }
  return {
    ok: true,
    glb: toGlb(meshes, generator),
    triangles,
    brepFaces,
    meshCount: meshes.length,
    deflection: { ...DEFLECTION },
  };
}

/* The WASM module is loaded once and then reused, so everything after the first
   call is synchronous. `warmStep` exists to get that one await out of the way
   somewhere it does not matter, rather than have the first publish of a session
   pay for it. */
let ready = null;
export async function warmStep() {
  if (!ready) ready = await occt();
  return true;
}

/* The same conversion, on a thread that exits when it is done -- see
   `step-worker.mjs` for the two measurements that put it there. This is for the
   review server, which has a page to keep answering and a process that outlives
   any one model.

   `precheck` deliberately does not use it. That runs in the CLI or the MCP
   server: a process with no reviewer waiting on it, which exits and takes the
   heap with it. Spending a thread and its start-up to protect an event loop
   that is about to stop would make measuring a file slower for nobody. */
export function convertStepDetached(buffer, { generator = "MeshCue" } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./step-worker.mjs", import.meta.url), {
      workerData: {
        buffer: buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ),
        generator,
      },
    });
    let answered = false;
    worker.once("message", (result) => {
      answered = true;
      resolve(
        result.ok ? { ...result, glb: Buffer.from(result.glb) } : { ok: false },
      );
    });
    worker.once("error", reject);
    /* A thread that dies without answering is not a model we can size. Saying
       so beats resolving with nothing and having the caller report a STEP with
       no triangles in it. */
    worker.once("exit", (code) => {
      if (!answered)
        reject(new Error(`The STEP converter stopped (exit ${code}).`));
    });
  });
}

/* For the entry points that are handed a path rather than a format. They warm
   before calling into the synchronous sizing code, and only when the file is
   one this module is for -- measuring an STL should not pay to load a CAD
   kernel it will never call. */
export async function warmStepFor(file) {
  const format = String(file || "")
    .split(".")
    .pop()
    .toLowerCase();
  if (STEP_FORMATS.includes(format)) await warmStep();
}
function occtSync() {
  if (!ready)
    throw new Error("STEP support was used before warmStep() resolved");
  return ready;
}
