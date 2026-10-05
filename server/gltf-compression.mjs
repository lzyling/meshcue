import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { ReviewError } from "./store.mjs";

// Host loaders evaluate the plugin as a script. Decoder startup must happen
// only when a compressed model is inspected, never while importing the plugin.
let draco;
let ready;
export function initializeCompression() {
  return (ready ||= (async () => {
    const decoderFile = [
      "./gltf-vendor/draco_decoder.cjs",
      "../vendor/draco_decoder.cjs",
      "./vendor/draco_decoder.cjs",
    ]
      .map((relative) => new URL(relative, import.meta.url))
      .find((file) => fs.existsSync(file));
    if (!decoderFile) throw new Error("The packaged Draco decoder is missing.");
    const createDraco = createRequire(import.meta.url)(
      fileURLToPath(decoderFile),
    );
    draco = await createDraco();
    await MeshoptDecoder.ready;
  })());
}

// Keep the synchronous validator's refusal semantics. Async entry points call
// this preparation step first; malformed headers are left for that validator.
export async function prepareCompression(buffer, format) {
  if (
    format !== "glb" ||
    buffer.length < 20 ||
    buffer.toString("ascii", 0, 4) !== "glTF"
  )
    return;
  let doc;
  try {
    doc = JSON.parse(buffer.toString("utf8", 20, 20 + buffer.readUInt32LE(12)));
  } catch {
    return;
  }
  if (
    (doc.bufferViews || []).some(
      (view) => view.extensions?.EXT_meshopt_compression,
    ) ||
    (doc.meshes || []).some((mesh) =>
      mesh.primitives?.some(
        (prim) => prim.extensions?.KHR_draco_mesh_compression,
      ),
    )
  )
    await initializeCompression();
}
const invalid = (message) => {
  throw new ReviewError(
    `Invalid compressed GLB: ${message}`,
    400,
    "MODEL_FORMAT",
  );
};

export function compressionViews(doc, bin) {
  const cache = new Map();
  const primitiveCounts = new Map();
  const buffers = (doc.buffers || []).map((buffer, i) => {
    if (buffer.uri?.startsWith("data:")) {
      const comma = buffer.uri.indexOf(",");
      if (!buffer.uri.slice(0, comma).endsWith(";base64"))
        invalid("use base64 buffer data URIs.");
      return Buffer.from(buffer.uri.slice(comma + 1), "base64");
    }
    return i === 0 ? bin : null;
  });
  const slice = (buffer, offset = 0, length) => {
    const bytes = buffers[buffer];
    if (
      !bytes ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      offset + length > bytes.length
    )
      invalid("buffer view is outside its buffer.");
    return bytes.subarray(offset, offset + length);
  };
  const viewBytes = (index) => {
    if (cache.has(index)) return cache.get(index);
    const view = doc.bufferViews?.[index];
    if (!view) invalid("missing buffer view.");
    const ext = view.extensions?.EXT_meshopt_compression;
    let bytes;
    if (ext) {
      if (
        !Number.isSafeInteger(ext.count) ||
        ext.count < 1 ||
        !Number.isSafeInteger(ext.byteStride) ||
        ext.byteStride < 1 ||
        ext.byteStride > 256 ||
        ext.count * ext.byteStride !== view.byteLength
      )
        invalid("invalid Meshopt decoded buffer size.");
      bytes = Buffer.alloc(view.byteLength);
      try {
        MeshoptDecoder.decodeGltfBuffer(
          bytes,
          ext.count,
          ext.byteStride,
          slice(ext.buffer, ext.byteOffset, ext.byteLength),
          ext.mode,
          ext.filter,
        );
      } catch {
        invalid("Meshopt decoding failed.");
      }
    } else bytes = slice(view.buffer, view.byteOffset, view.byteLength);
    cache.set(index, bytes);
    return bytes;
  };
  // Decode even unreferenced compressed views: accepting broken fallback bytes
  // on the service while the browser chooses compression would certify a file
  // the reviewer cannot load. Image views use this same cache for GPU budgets.
  for (const [index, view] of (doc.bufferViews || []).entries())
    if (view.extensions?.EXT_meshopt_compression) viewBytes(index);
  for (const accessor of doc.accessors || []) {
    const view = doc.bufferViews?.[accessor.bufferView];
    if (!view?.extensions?.EXT_meshopt_compression) continue;
    const width = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[
      accessor.componentType
    ];
    const components = {
      SCALAR: 1,
      VEC2: 2,
      VEC3: 3,
      VEC4: 4,
      MAT2: 4,
      MAT3: 9,
      MAT4: 16,
    }[accessor.type];
    const stride = view.byteStride || width * components;
    const offset = accessor.byteOffset || 0;
    if (
      !width ||
      !components ||
      !Number.isSafeInteger(accessor.count) ||
      accessor.count < 1 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      stride < width * components ||
      offset + (accessor.count - 1) * stride + width * components >
        view.byteLength
    )
      invalid("accessor exceeds its decoded Meshopt view.");
  }
  for (const mesh of doc.meshes || [])
    for (const prim of mesh.primitives || []) {
      const ext = prim.extensions?.KHR_draco_mesh_compression;
      if (!ext) continue;
      const decoder = new draco.Decoder();
      const geometry = new draco.Mesh();
      try {
        const bytes = viewBytes(ext.bufferView);
        if (
          decoder.GetEncodedGeometryType(new Int8Array(bytes)) !==
          draco.TRIANGULAR_MESH
        )
          invalid("Draco primitive is not a triangle mesh.");
        const status = decoder.DecodeArrayToMesh(
          new Int8Array(bytes),
          bytes.length,
          geometry,
        );
        if (!status.ok() || !geometry.ptr) invalid("Draco decoding failed.");
        // Draco always draws its decoded triangle list, even if a forged accessor
        // claims fewer faces. Refuse disagreement instead of budgeting the lie.
        if (
          prim.indices !== undefined &&
          doc.accessors?.[prim.indices]?.count !== geometry.num_faces() * 3
        )
          invalid("Draco face count disagrees with its accessor.");
        primitiveCounts.set(prim, geometry.num_faces() * 3);
        for (const [semantic, id] of Object.entries(ext.attributes || {})) {
          const accessor = doc.accessors?.[prim.attributes?.[semantic]];
          const attribute = decoder.GetAttributeByUniqueId(geometry, id);
          if (
            !accessor ||
            !attribute?.ptr ||
            accessor.count !== geometry.num_points() ||
            accessor.type !==
              (attribute.num_components() === 1
                ? "SCALAR"
                : `VEC${attribute.num_components()}`)
          )
            invalid("Draco attribute disagrees with its accessor.");
        }
      } finally {
        draco.destroy(geometry);
        draco.destroy(decoder);
      }
    }
  return { viewBytes, primitiveCounts };
}
