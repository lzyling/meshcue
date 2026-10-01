/* Add one embedded 2x2 RGBA PNG to a generated, untextured GLB. No network,
   canvas, image library or private model assets are needed by the CI case. */
export function withEmbeddedTexture(binary) {
  const input = Buffer.from(binary);
  const jsonLength = input.readUInt32LE(12);
  const document = JSON.parse(input.subarray(20, 20 + jsonLength).toString());
  const binHeader = 20 + jsonLength;
  const binLength = input.readUInt32LE(binHeader);
  const original = input.subarray(binHeader + 8, binHeader + 8 + binLength);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4nGP476DwX+G/w38GBYf/YAAAVsgLF6TB5qkAAAAASUVORK5CYII=",
    "base64",
  );
  const imageView = document.bufferViews.length;
  document.bufferViews.push({
    buffer: 0,
    byteOffset: original.length,
    byteLength: png.length,
  });
  document.images = [{ bufferView: imageView, mimeType: "image/png" }];
  document.samplers = [{ magFilter: 9728, minFilter: 9728 }];
  document.textures = [{ sampler: 0, source: 0 }];
  for (const material of document.materials) {
    material.pbrMetallicRoughness ??= {};
    material.pbrMetallicRoughness.baseColorTexture = { index: 0 };
  }
  const payload = Buffer.concat([original, png]);
  document.buffers[0].byteLength = payload.length;
  const align = (buffer, padding = 0) =>
    Buffer.concat([
      buffer,
      Buffer.alloc((4 - (buffer.length % 4)) % 4, padding),
    ]);
  const json = align(Buffer.from(JSON.stringify(document)), 0x20);
  const bin = align(payload);
  const header = Buffer.alloc(20);
  header.write("glTF");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length + 8 + bin.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.write("JSON", 16);
  const binChunk = Buffer.alloc(8);
  binChunk.writeUInt32LE(bin.length);
  binChunk.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, binChunk, bin]);
}
