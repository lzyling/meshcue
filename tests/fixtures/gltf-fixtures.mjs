import fs from "node:fs";
import path from "node:path";
import { BoxGeometry } from "three";
import { MeshoptEncoder } from "./gltf-meshopt-encoder.js";
import { encodeGlb } from "../../server/gltf-pack.mjs";

await MeshoptEncoder.ready;
export function unpack(buffer) {
  const length = buffer.readUInt32LE(12);
  return {
    doc: JSON.parse(buffer.toString("utf8", 20, 20 + length)),
    bin: buffer.subarray(28 + length),
  };
}
const varint = (value) => {
  const bytes = [];
  do {
    bytes.push((value & 127) | (value > 127 ? 128 : 0));
    value >>>= 7;
  } while (value);
  return Buffer.from(bytes);
};
// No Draco encoder was installed or cached on the offline worker. This writes
// the documented sequential/raw Draco stream: real Draco bytes, decoded by
// the vendored library, with original indices and attribute values preserved.
// Meshopt below uses its real upstream encoder (0.22.0, MIT, vendored for tests
// only). Keeping sequential face order makes the paired mark assertion exact.
function dracoRaw(indices, arrays) {
  const count = arrays[0].length / 3;
  const headers = arrays.map((_, i) =>
    Buffer.from([i === 0 ? 0 : 1, 9, 3, 0, i]),
  );
  return Buffer.concat([
    Buffer.from("DRACO"),
    Buffer.from([2, 2, 1, 0, 0, 0]),
    varint(indices.length / 3),
    varint(count),
    Buffer.from([1]),
    Buffer.from(indices),
    Buffer.from([1]),
    varint(arrays.length),
    ...headers,
    Buffer.alloc(arrays.length),
    ...arrays.map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength)),
  ]);
}
export function bracketGltf(kind = "plain", images = []) {
  const doc = {
    asset: {
      version: "2.0",
      generator: "MeshCue offline compression fixtures",
    },
    buffers: [],
    bufferViews: [],
    accessors: [],
    meshes: [],
    nodes: [],
    scenes: [{ nodes: [0, 1, 2] }],
    scene: 0,
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.4, 0.6, 0.8, 1],
          metallicFactor: 0,
          roughnessFactor: 0.7,
        },
      },
    ],
  };
  const chunks = [];
  let length = 0;
  const view = (bytes, ext) => {
    const id = doc.bufferViews.length;
    doc.bufferViews.push({
      buffer: 0,
      byteOffset: length,
      byteLength: bytes.length,
      ...(ext ? { extensions: { EXT_meshopt_compression: ext } } : {}),
    });
    chunks.push(bytes, Buffer.alloc((4 - (bytes.length % 4)) % 4));
    length += Math.ceil(bytes.length / 4) * 4;
    return id;
  };
  for (const [size, translation] of [
    [
      [2, 0.25, 1.5],
      [0, 0, 0],
    ],
    [
      [2, 1.5, 0.25],
      [0, 0.625, -0.625],
    ],
    [
      [0.25, 0.75, 1],
      [0, 0.4, 0],
    ],
  ]) {
    const g = new BoxGeometry(...size);
    const p = { attributes: {}, material: 0 };
    const arrays = [g.attributes.position.array, g.attributes.normal.array];
    for (const [i, semantic] of ["POSITION", "NORMAL"].entries()) {
      let array = arrays[i];
      const quantized = kind === "quantized" && i === 0;
      if (quantized) array = Int16Array.from(array, (n) => n * 16);
      const bytes = Buffer.from(
        array.buffer,
        array.byteOffset,
        array.byteLength,
      );
      const accessor = {
        componentType: quantized ? 5122 : 5126,
        count: array.length / 3,
        type: "VEC3",
      };
      if (i === 0) {
        accessor.min = size.map((n) => (-n / 2) * (quantized ? 16 : 1));
        accessor.max = size.map((n) => (n / 2) * (quantized ? 16 : 1));
      }
      if (kind === "meshopt") {
        const compressed = Buffer.from(
          MeshoptEncoder.encodeGltfBuffer(
            bytes,
            accessor.count,
            12,
            "ATTRIBUTES",
          ),
        );
        accessor.bufferView = view(compressed, {
          buffer: 0,
          byteOffset: length,
          byteLength: compressed.length,
          byteStride: 12,
          count: accessor.count,
          mode: "ATTRIBUTES",
        });
        doc.bufferViews[accessor.bufferView].byteLength = bytes.length;
        doc.bufferViews[accessor.bufferView].byteStride = 12;
      } else if (kind !== "draco") {
        // glTF vertex attributes must be aligned to four bytes, including each
        // row of a quantized VEC3 (six bytes plus two bytes padding).
        if (quantized) {
          const padded = Buffer.alloc(accessor.count * 8);
          for (let j = 0; j < accessor.count; j++)
            bytes.copy(padded, j * 8, j * 6, j * 6 + 6);
          accessor.bufferView = view(padded);
          doc.bufferViews[accessor.bufferView].byteStride = 8;
        } else accessor.bufferView = view(bytes);
      }
      p.attributes[semantic] = doc.accessors.length;
      doc.accessors.push(accessor);
    }
    const index = { componentType: 5123, count: g.index.count, type: "SCALAR" };
    if (kind === "meshopt") {
      const bytes = Buffer.from(g.index.array.buffer);
      const compressed = Buffer.from(
        MeshoptEncoder.encodeGltfBuffer(bytes, index.count, 2, "INDICES"),
      );
      index.bufferView = view(compressed, {
        buffer: 0,
        byteOffset: length,
        byteLength: compressed.length,
        byteStride: 2,
        count: index.count,
        mode: "INDICES",
      });
      doc.bufferViews[index.bufferView].byteLength = bytes.length;
    } else if (kind !== "draco")
      index.bufferView = view(Buffer.from(g.index.array.buffer));
    p.indices = doc.accessors.length;
    doc.accessors.push(index);
    if (kind === "draco")
      p.extensions = {
        KHR_draco_mesh_compression: {
          bufferView: view(dracoRaw(g.index.array, arrays)),
          attributes: { POSITION: 0, NORMAL: 1 },
        },
      };
    doc.nodes.push({
      mesh: doc.meshes.length,
      name: `bracket-${doc.meshes.length}`,
      translation,
      ...(kind === "quantized" ? { scale: [1 / 16, 1 / 16, 1 / 16] } : {}),
    });
    doc.meshes.push({ primitives: [p] });
    g.dispose();
  }
  // Scale only positions in the quantized variant: normal vectors are unit
  // directions and remain floats, so inverse-transpose normalization is exact.
  if (images.length)
    doc.images = images.map((png) => ({
      bufferView: view(png),
      mimeType: "image/png",
    }));
  const extension = {
    draco: "KHR_draco_mesh_compression",
    meshopt: "EXT_meshopt_compression",
    quantized: "KHR_mesh_quantization",
  }[kind];
  if (extension) doc.extensionsUsed = doc.extensionsRequired = [extension];
  doc.buffers = [{ byteLength: length }];
  return encodeGlb(doc, Buffer.concat(chunks));
}
export const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1cAAAAASUVORK5CYII=",
  "base64",
);
export function externalGltf(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const { doc, bin } = unpack(bracketGltf());
  const box = new BoxGeometry();
  const uv = Buffer.from(box.attributes.uv.array.buffer);
  const uvView = doc.bufferViews.length;
  doc.bufferViews.push({
    buffer: 0,
    byteOffset: bin.length,
    byteLength: uv.length,
  });
  const uvAccessor = doc.accessors.length;
  doc.accessors.push({
    bufferView: uvView,
    componentType: 5126,
    count: box.attributes.uv.count,
    type: "VEC2",
  });
  for (const mesh of doc.meshes)
    mesh.primitives[0].attributes.TEXCOORD_0 = uvAccessor;
  const geometry = Buffer.concat([bin, uv]);
  doc.buffers[0].byteLength = geometry.length;
  box.dispose();
  doc.buffers[0].uri = "geometry.bin";
  doc.images = [{ uri: "texture.png" }];
  doc.textures = [{ source: 0 }];
  doc.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
  fs.writeFileSync(path.join(dir, "geometry.bin"), geometry);
  fs.writeFileSync(path.join(dir, "texture.png"), png);
  fs.writeFileSync(path.join(dir, "bracket.gltf"), JSON.stringify(doc));
  return doc;
}
