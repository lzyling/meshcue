/* Small, actual GLBs let the service and the installed GLTFLoader read the
   same bytes. Non-surface vertices deliberately sit far outside the part so
   a bounds regression cannot hide behind coincident construction geometry. */
export function primitiveGlb(
  primitives = [{ mode: 4, count: 3 }],
  images = [],
) {
  const doc = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: 0 }],
    bufferViews: [],
    accessors: [],
    meshes: [{ primitives: [] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  const chunks = [];
  let length = 0;
  function view(bytes) {
    const index = doc.bufferViews.length;
    doc.bufferViews.push({
      buffer: 0,
      byteOffset: length,
      byteLength: bytes.length,
    });
    const padded = Buffer.concat([
      bytes,
      Buffer.alloc((4 - (bytes.length % 4)) % 4),
    ]);
    chunks.push(padded);
    length += padded.length;
    return index;
  }
  for (const { mode, count = 4, indexed = false } of primitives) {
    const offset = mode < 4 ? 1000 : 0;
    const positions = Buffer.alloc(count * 12);
    for (let i = 0; i < count; i++) {
      positions.writeFloatLE(offset + (i % 2), i * 12);
      positions.writeFloatLE(offset + Math.floor(i / 2), i * 12 + 4);
      positions.writeFloatLE(offset, i * 12 + 8);
    }
    const position = doc.accessors.length;
    doc.accessors.push({
      bufferView: view(positions),
      componentType: 5126,
      count,
      type: "VEC3",
      min: [offset, offset, offset],
      max: [
        offset + 1,
        offset + Math.max(0, Math.floor((count - 1) / 2)),
        offset,
      ],
    });
    const primitive = {
      attributes: { POSITION: position },
      ...(mode === undefined ? {} : { mode }),
    };
    if (indexed) {
      const indices = Buffer.alloc(count * 4);
      for (let i = 0; i < count; i++) indices.writeUInt32LE(i, i * 4);
      primitive.indices = doc.accessors.length;
      doc.accessors.push({
        bufferView: view(indices),
        componentType: 5125,
        count,
        type: "SCALAR",
      });
    }
    doc.meshes[0].primitives.push(primitive);
  }
  if (images.length) {
    // Header-only PNGs exercise the size preflight without allocating hundreds
    // of MiB or pretending this fixture tests an image decoder.
    doc.images = images.map(([width, height]) => {
      const png = Buffer.alloc(33);
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
      png.writeUInt32BE(13, 8);
      png.write("IHDR", 12);
      png.writeUInt32BE(width, 16);
      png.writeUInt32BE(height, 20);
      png[24] = 8;
      png[25] = 6;
      return { bufferView: view(png), mimeType: "image/png" };
    });
  }
  doc.buffers[0].byteLength = length;
  const text = JSON.stringify(doc);
  const json = Buffer.from(text.padEnd(Math.ceil(text.length / 4) * 4));
  const header = Buffer.alloc(20);
  header.write("glTF");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length + 8 + length, 8);
  header.writeUInt32LE(json.length, 12);
  header.write("JSON", 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(length);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, binHeader, ...chunks]);
}
export const mixedPrimitives = [
  { mode: 1, count: 2 },
  { mode: 5, count: 4, indexed: true },
  { mode: 0, count: 1 },
  { mode: 6, count: 5 },
  { mode: 2, count: 3 },
  { mode: 4, count: 3 },
  { mode: 3, count: 3 },
  { count: 3 },
];
