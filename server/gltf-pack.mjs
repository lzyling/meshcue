import fs from "node:fs";
import path from "node:path";
import { ReviewError } from "./store.mjs";

const fail = (message, code = "GLTF_RESOURCE_URI") => {
  throw new ReviewError(message, 400, code);
};
const inside = (root, file) => file.startsWith(root + path.sep);

export function encodeGlb(doc, bin) {
  const json = Buffer.from(JSON.stringify(doc));
  const jsonSize = Math.ceil(json.length / 4) * 4;
  const binSize = Math.ceil(bin.length / 4) * 4;
  const result = Buffer.alloc(28 + jsonSize + binSize);
  result.write("glTF");
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonSize, 12);
  result.write("JSON", 16);
  result.fill(32, 20, 20 + jsonSize);
  json.copy(result, 20);
  result.writeUInt32LE(binSize, 20 + jsonSize);
  result.writeUInt32LE(0x004e4942, 24 + jsonSize);
  bin.copy(result, 28 + jsonSize);
  return result;
}

// All resource reads precede publication. The stored identity is the packed
// GLB's hash, so editing a neighbouring PNG or BIN creates a new immutable
// version rather than silently changing geometry beneath existing marks.
export function packGltf(buffer, actual, workspace, maxBytes) {
  let doc;
  try {
    doc = JSON.parse(buffer.toString("utf8"));
  } catch {
    fail("The glTF JSON could not be read.", "MODEL_FORMAT");
  }
  if (doc?.asset?.version !== "2.0")
    fail("Not a glTF 2.0 document.", "MODEL_FORMAT");
  const root = path.dirname(actual);
  const chunks = [];
  let length = 0;
  const checkSize = (size) => {
    if (!Number.isSafeInteger(size) || size < 0 || length + size > maxBytes)
      fail("The packed glTF exceeds the 80 MB model limit.", "MODEL_LIMIT");
  };
  const read = (uri) => {
    if (typeof uri !== "string" || !uri)
      fail("A glTF resource needs a relative URI.");
    if (uri.startsWith("data:")) {
      const match = /^data:([^,]*),(.*)$/s.exec(uri);
      if (!match) fail("Malformed glTF data URI.");
      checkSize(
        match[1].endsWith(";base64")
          ? Math.floor((match[2].length * 3) / 4)
          : match[2].length,
      );
      try {
        return match[1].endsWith(";base64")
          ? Buffer.from(match[2], "base64")
          : Buffer.concat(
              match[2]
                .split(/(%[0-9a-f]{2})/i)
                .map((part) =>
                  /^%[0-9a-f]{2}$/i.test(part)
                    ? Buffer.from([parseInt(part.slice(1), 16)])
                    : Buffer.from(part),
                ),
            );
      } catch {
        fail("Malformed glTF data URI.");
      }
    }
    let relative;
    try {
      relative = decodeURIComponent(uri);
    } catch {
      fail(`Malformed glTF resource URI: ${uri}`);
    }
    // Decode before checking: percent-encoded separators and schemes must not
    // turn an apparently harmless filename into a second path language.
    if (
      /^[a-z][a-z0-9+.-]*:/i.test(relative) ||
      /[\\\0?#]/.test(relative) ||
      path.isAbsolute(relative)
    )
      fail(`Only relative local glTF resources are accepted: ${uri}`);
    const candidate = path.resolve(root, relative);
    if (!inside(root, candidate) || !inside(workspace, candidate))
      fail(
        `The glTF resource escapes its directory tree: ${uri}`,
        "GLTF_RESOURCE_OUTSIDE",
      );
    let resolved;
    try {
      resolved = fs.realpathSync(candidate);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR")
        fail(`The glTF resource is missing: ${uri}`, "GLTF_RESOURCE_MISSING");
      throw error;
    }
    if (!inside(root, resolved) || !inside(workspace, resolved))
      fail(
        `The glTF resource symlink escapes its directory tree: ${uri}`,
        "GLTF_RESOURCE_OUTSIDE",
      );
    const fd = fs.openSync(
      resolved,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile())
        fail(
          `The glTF resource is not a regular file: ${uri}`,
          "GLTF_RESOURCE_MISSING",
        );
      checkSize(stat.size);
      return fs.readFileSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  };
  const append = (bytes) => {
    const padding = (4 - (bytes.length % 4)) % 4;
    checkSize(bytes.length + padding);
    const offset = length;
    chunks.push(bytes, Buffer.alloc(padding));
    length += bytes.length + padding;
    return offset;
  };
  const sourceBuffers = doc.buffers || [];
  const offsets = sourceBuffers.map((entry) => {
    // Required Meshopt files may declare a fallback buffer without bytes; its
    // views are decoded from the extension and are never fetched by the viewer.
    if (!entry.uri && entry.extensions?.EXT_meshopt_compression?.fallback)
      return 0;
    const bytes = read(entry.uri);
    if (
      !Number.isSafeInteger(entry.byteLength) ||
      bytes.length < entry.byteLength
    )
      fail(
        "A glTF buffer is shorter than its declared length.",
        "MODEL_FORMAT",
      );
    return append(bytes);
  });
  for (const view of doc.bufferViews || []) {
    if (offsets[view.buffer] === undefined)
      fail("Invalid glTF buffer reference.", "MODEL_FORMAT");
    if (
      !view.extensions?.EXT_meshopt_compression &&
      (!Number.isSafeInteger(view.byteLength) ||
        view.byteLength < 0 ||
        !Number.isSafeInteger(view.byteOffset || 0) ||
        (view.byteOffset || 0) < 0 ||
        (view.byteOffset || 0) + view.byteLength >
          sourceBuffers[view.buffer].byteLength)
    )
      fail("A glTF buffer view exceeds its source buffer.", "MODEL_FORMAT");
    view.byteOffset = offsets[view.buffer] + (view.byteOffset || 0);
    view.buffer = 0;
    const ext = view.extensions?.EXT_meshopt_compression;
    if (ext) {
      if (offsets[ext.buffer] === undefined)
        fail("Invalid Meshopt buffer reference.", "MODEL_FORMAT");
      ext.byteOffset = offsets[ext.buffer] + (ext.byteOffset || 0);
      ext.buffer = 0;
    }
  }
  for (const image of doc.images || []) {
    if (image.uri === undefined) continue;
    const bytes = read(image.uri);
    image.mimeType ||=
      bytes[0] === 137
        ? "image/png"
        : bytes[0] === 255
          ? "image/jpeg"
          : "application/octet-stream";
    image.bufferView = (doc.bufferViews ||= []).length;
    doc.bufferViews.push({
      buffer: 0,
      byteOffset: append(bytes),
      byteLength: bytes.length,
    });
    delete image.uri;
  }
  doc.buffers = [{ byteLength: length }];
  const result = encodeGlb(doc, Buffer.concat(chunks));
  if (result.length > maxBytes)
    fail("The packed glTF exceeds the 80 MB model limit.", "MODEL_LIMIT");
  return result;
}
