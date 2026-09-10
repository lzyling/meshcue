import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { imageSize, disableTypes, types as imageTypes } from "image-size";
import { ReviewError } from "./store.mjs";

// Also disable decoder fallback: a malformed RIFF header must not reach a
// different format's parser after the supported-format signature check.
disableTypes(
  imageTypes.filter((type) => !["png", "jpg", "webp"].includes(type)),
);

export const MAX_BYTES = 80 * 1024 * 1024;
export const MAX_TRIANGLES = 600000;
export const MAX_TEXTURE_PIXELS = 33554432;
// The review tessellation shares MAX_TRIANGLES across every source face, and a
// face can never emit fewer than the triangle it already is. So a model of N
// source faces has MAX_TRIANGLES - N triangles left to spend on subdivision:
// past half the cap that spare drops below one per face, flat spans stop being
// refined, and the brush starts snapping across them. Publishing still succeeds
// there — nothing rejects it — which is exactly why callers need the number.
export const DEGRADE_TRIANGLES = MAX_TRIANGLES / 2;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
// Every limit message states the measured value beside the cap, and carries it
// as a number too. Without it a caller is told to "simplify" with no way to
// know by how much, and its only recourse is to guess a decimation ratio and
// republish until one happens to fit.
function limitError(message, code, measured) {
  const error = new ReviewError(message, 400, code);
  error.measured = measured;
  return error;
}

export function inspectModel(buffer, format) {
  if (!buffer.length || buffer.length > MAX_BYTES)
    throw limitError(
      `模型須小於 ${mb(MAX_BYTES)}；此檔為 ${mb(buffer.length)}。`,
      "MODEL_LIMIT",
      { bytes: buffer.length },
    );
  if (format === "glb") {
    if (
      buffer.length < 20 ||
      buffer.toString("ascii", 0, 4) !== "glTF" ||
      buffer.readUInt32LE(4) !== 2 ||
      buffer.readUInt32LE(8) !== buffer.length
    )
      throw new ReviewError("不是有效的 GLB 2.0 檔案。", 400, "MODEL_FORMAT");
    const jsonSize = buffer.readUInt32LE(12);
    if (jsonSize > buffer.length - 20 || buffer.readUInt32LE(16) !== 0x4e4f534a)
      throw new ReviewError("GLB 結構不完整。", 400);
    let doc;
    try {
      doc = JSON.parse(buffer.toString("utf8", 20, 20 + jsonSize));
    } catch {
      throw new ReviewError("GLB 資料無法讀取。", 400);
    }
    if (
      (doc.extensionsRequired || []).some(
        (x) =>
          ![
            "KHR_materials_unlit",
            "KHR_materials_clearcoat",
            "KHR_materials_transmission",
            "KHR_materials_ior",
            "KHR_materials_specular",
            "KHR_materials_emissive_strength",
            "KHR_texture_transform",
          ].includes(x),
      )
    )
      throw new ReviewError(
        "初版未支援此 GLB 的壓縮／必要擴充；請先匯出未壓縮 GLB。",
        400,
        "UNSUPPORTED_EXTENSION",
      );
    for (const item of [...(doc.buffers || []), ...(doc.images || [])]) {
      if (item.uri && !item.uri.startsWith("data:"))
        throw new ReviewError(
          "請使用貼圖及幾何都嵌入檔案的 GLB。",
          400,
          "EXTERNAL_RESOURCE",
        );
    }
    let bin = null;
    for (let offset = 20 + jsonSize; offset + 8 <= buffer.length;) {
      const size = buffer.readUInt32LE(offset),
        type = buffer.readUInt32LE(offset + 4);
      if (offset + 8 + size > buffer.length)
        throw new ReviewError("GLB 區塊資料不完整。", 400);
      if (type === 0x004e4942)
        bin = buffer.subarray(offset + 8, offset + 8 + size);
      offset += 8 + size;
    }
    let texturePixels = 0;
    for (const image of doc.images || []) {
      let bytes;
      if (image.uri?.startsWith("data:")) {
        const comma = image.uri.indexOf(",");
        if (!image.uri.slice(0, comma).endsWith(";base64"))
          throw new ReviewError("請將貼圖嵌入 GLB 二進位資料。", 400);
        bytes = Buffer.from(image.uri.slice(comma + 1), "base64");
      } else {
        const view = doc.bufferViews?.[image.bufferView];
        if (!view || view.buffer !== 0 || !bin)
          throw new ReviewError("貼圖資料不完整。", 400);
        bytes = bin.subarray(
          view.byteOffset || 0,
          (view.byteOffset || 0) + view.byteLength,
        );
      }
      let dimensions;
      try {
        // Only supported web texture decoders are reachable. image-size 2.0.2
        // has known ICNS/JXL/HEIF parser DoS issues and no patched release yet.
        const png =
          bytes.length >= 8 &&
          bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg =
          bytes.length >= 3 &&
          bytes[0] === 255 &&
          bytes[1] === 216 &&
          bytes[2] === 255;
        const webp =
          bytes.length >= 12 &&
          bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP";
        if (!png && !jpeg && !webp)
          throw new Error("Unsupported texture decoder");
        dimensions = imageSize(bytes);
      } catch {
        throw new ReviewError(
          "貼圖格式未支援或資料不完整。",
          400,
          "TEXTURE_FORMAT",
        );
      }
      texturePixels += dimensions.width * dimensions.height;
      if (
        dimensions.width > 8192 ||
        dimensions.height > 8192 ||
        texturePixels > MAX_TEXTURE_PIXELS
      )
        throw limitError(
          `貼圖解碼量超出初版上限；單張上限 8192×8192、合計上限 ${MAX_TEXTURE_PIXELS} 像素，此模型已達 ${texturePixels}。請縮小貼圖（建議 4K 或以下）。`,
          "TEXTURE_LIMIT",
          { texturePixels },
        );
    }
    if (
      doc.skins?.length ||
      doc.nodes?.some((n) => n.extensions?.EXT_mesh_gpu_instancing)
    )
      throw new ReviewError(
        "初版請先將骨架／實例轉為靜態網格再匯入。",
        400,
        "ANIMATED_MODEL",
      );
    let triangles = 0;
    for (const node of doc.nodes || []) {
      if (node.mesh === undefined) continue;
      for (const prim of doc.meshes?.[node.mesh]?.primitives || []) {
        if (prim.mode !== undefined && prim.mode !== 4)
          throw new ReviewError("初版只接受三角面網格。", 400);
        const count =
          doc.accessors?.[prim.indices ?? prim.attributes?.POSITION]?.count;
        if (!Number.isFinite(count) || count < 3 || count % 3 !== 0)
          throw new ReviewError("模型三角面資料不完整。", 400);
        triangles += count / 3;
      }
    }
    if (!triangles || triangles > MAX_TRIANGLES)
      throw limitError(
        `模型上限為 ${MAX_TRIANGLES} 三角面；此模型有 ${triangles}，請先簡化至 ${MAX_TRIANGLES} 以下（建議 ${DEGRADE_TRIANGLES} 以下以保留標注精度）。`,
        "MODEL_LIMIT",
        { triangles },
      );
    return { triangles, format, texturePixels };
  }
  if (format === "stl") {
    let triangles =
      buffer.length >= 84 && 84 + buffer.readUInt32LE(80) * 50 === buffer.length
        ? buffer.readUInt32LE(80)
        : (buffer.toString("utf8").match(/facet\s+normal/gi) || []).length;
    if (!triangles || triangles > MAX_TRIANGLES)
      throw limitError(
        triangles
          ? `模型上限為 ${MAX_TRIANGLES} 三角面；此 STL 有 ${triangles}，請先簡化至 ${MAX_TRIANGLES} 以下（建議 ${DEGRADE_TRIANGLES} 以下以保留標注精度）。`
          : "STL 無法辨識。",
        "MODEL_LIMIT",
        { triangles },
      );
    return { triangles, format };
  }
  throw new ReviewError("初版支援 GLB 與 STL。", 400, "MODEL_FORMAT");
}

export function importModel(
  { file, name, version, source, units = "未指定" },
  { workspace, mediaDir },
) {
  const actual = fs.realpathSync(path.resolve(workspace, file));
  if (!actual.startsWith(workspace + path.sep))
    throw new ReviewError("模型必須位於目前 workspace。", 400, "PATH_OUTSIDE");
  const stat = fs.statSync(actual);
  if (!stat.isFile())
    throw new ReviewError("模型路徑不是檔案。", 400, "MODEL_LIMIT");
  if (stat.size > MAX_BYTES)
    throw limitError(
      `模型須小於 ${mb(MAX_BYTES)}；此檔為 ${mb(stat.size)}。`,
      "MODEL_LIMIT",
      { bytes: stat.size },
    );
  const buffer = fs.readFileSync(actual),
    format = path.extname(actual).slice(1).toLowerCase();
  const metadata = inspectModel(buffer, format);
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const id = hash.slice(0, 24),
    filename = `${hash}.${format}`;
  fs.mkdirSync(mediaDir, { recursive: true });
  const target = path.join(mediaDir, filename);
  if (!fs.existsSync(target)) fs.writeFileSync(target, buffer);
  return {
    id,
    sha256: hash,
    filename,
    name: String(name || path.basename(actual)).slice(0, 160),
    version: String(version || "初版").slice(0, 80),
    units: String(units).slice(0, 30),
    source: source
      ? path.relative(workspace, path.resolve(workspace, source))
      : null,
    original: path.relative(workspace, actual),
    stored: path.relative(workspace, target),
    bytes: buffer.length,
    ...metadata,
    publishedAt: Date.now(),
  };
}
