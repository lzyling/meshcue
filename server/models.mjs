import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { imageSize } from 'image-size';
import { ReviewError } from './store.mjs';

export const MAX_BYTES = 80 * 1024 * 1024;
export const MAX_TRIANGLES = 600000;

export function inspectModel(buffer, format) {
  if (!buffer.length || buffer.length > MAX_BYTES) throw new ReviewError('模型須小於 80 MB。', 400, 'MODEL_LIMIT');
  if (format === 'glb') {
    if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF' || buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length)
      throw new ReviewError('不是有效的 GLB 2.0 檔案。', 400, 'MODEL_FORMAT');
    const jsonSize = buffer.readUInt32LE(12);
    if (jsonSize > buffer.length - 20 || buffer.readUInt32LE(16) !== 0x4e4f534a) throw new ReviewError('GLB 結構不完整。', 400);
    let doc; try { doc = JSON.parse(buffer.toString('utf8', 20, 20 + jsonSize)); } catch { throw new ReviewError('GLB 資料無法讀取。', 400); }
    if ((doc.extensionsRequired || []).some(x => !['KHR_materials_unlit','KHR_materials_clearcoat','KHR_materials_transmission','KHR_materials_ior','KHR_materials_specular','KHR_materials_emissive_strength','KHR_texture_transform'].includes(x)))
      throw new ReviewError('初版未支援此 GLB 的壓縮／必要擴充；請先匯出未壓縮 GLB。', 400, 'UNSUPPORTED_EXTENSION');
    for (const item of [...(doc.buffers || []), ...(doc.images || [])]) {
      if (item.uri && !item.uri.startsWith('data:')) throw new ReviewError('請使用貼圖及幾何都嵌入檔案的 GLB。', 400, 'EXTERNAL_RESOURCE');
    }
    let bin=null;for(let offset=20+jsonSize;offset+8<=buffer.length;){const size=buffer.readUInt32LE(offset),type=buffer.readUInt32LE(offset+4);if(offset+8+size>buffer.length)throw new ReviewError('GLB 區塊資料不完整。',400);if(type===0x004e4942)bin=buffer.subarray(offset+8,offset+8+size);offset+=8+size;}
    let texturePixels=0;
    for(const image of doc.images||[]){
      let bytes;
      if(image.uri?.startsWith('data:')){const comma=image.uri.indexOf(',');if(!image.uri.slice(0,comma).endsWith(';base64'))throw new ReviewError('請將貼圖嵌入 GLB 二進位資料。',400);bytes=Buffer.from(image.uri.slice(comma+1),'base64');}
      else{const view=doc.bufferViews?.[image.bufferView];if(!view||view.buffer!==0||!bin)throw new ReviewError('貼圖資料不完整。',400);bytes=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);}
      let dimensions;try{dimensions=imageSize(bytes);}catch{throw new ReviewError('貼圖格式未支援或資料不完整。',400,'TEXTURE_FORMAT');}
      texturePixels+=dimensions.width*dimensions.height;
      if(dimensions.width>8192||dimensions.height>8192||texturePixels>33554432)throw new ReviewError('貼圖解碼量超出初版上限；請縮小貼圖（建議 4K 或以下）。',400,'TEXTURE_LIMIT');
    }
    if (doc.skins?.length || doc.nodes?.some(n => n.extensions?.EXT_mesh_gpu_instancing)) throw new ReviewError('初版請先將骨架／實例轉為靜態網格再匯入。', 400, 'ANIMATED_MODEL');
    let triangles = 0;
    for (const node of doc.nodes || []) {
      if (node.mesh === undefined) continue;
      for (const prim of doc.meshes?.[node.mesh]?.primitives || []) {
        if (prim.mode !== undefined && prim.mode !== 4) throw new ReviewError('初版只接受三角面網格。', 400);
        const count = doc.accessors?.[prim.indices ?? prim.attributes?.POSITION]?.count;
        if (!Number.isFinite(count) || count < 3 || count % 3 !== 0) throw new ReviewError('模型三角面資料不完整。', 400);
        triangles += count / 3;
      }
    }
    if (!triangles || triangles > MAX_TRIANGLES) throw new ReviewError('模型上限為 60 萬三角面，請先簡化。', 400, 'MODEL_LIMIT');
    return { triangles, format, texturePixels };
  }
  if (format === 'stl') {
    let triangles = buffer.length >= 84 && 84 + buffer.readUInt32LE(80) * 50 === buffer.length ? buffer.readUInt32LE(80) : (buffer.toString('utf8').match(/facet\s+normal/gi) || []).length;
    if (!triangles || triangles > MAX_TRIANGLES) throw new ReviewError('STL 無法辨識或超過 60 萬三角面。', 400, 'MODEL_LIMIT');
    return { triangles, format };
  }
  throw new ReviewError('初版支援 GLB 與 STL。', 400, 'MODEL_FORMAT');
}

export function importModel({ file, name, version, source, units = '未指定' }, { workspace, mediaDir }) {
  const actual = fs.realpathSync(path.resolve(workspace, file));
  if (!actual.startsWith(workspace + path.sep)) throw new ReviewError('模型必須位於目前 workspace。', 400, 'PATH_OUTSIDE');
  if (!fs.statSync(actual).isFile() || fs.statSync(actual).size > MAX_BYTES) throw new ReviewError('模型須小於 80 MB。', 400, 'MODEL_LIMIT');
  const buffer = fs.readFileSync(actual), format = path.extname(actual).slice(1).toLowerCase();
  const metadata = inspectModel(buffer, format);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const id = hash.slice(0, 24), filename = `${hash}.${format}`;
  fs.mkdirSync(mediaDir, { recursive: true });
  const target = path.join(mediaDir, filename);
  if (!fs.existsSync(target)) fs.writeFileSync(target, buffer);
  return { id, sha256: hash, filename, name: String(name || path.basename(actual)).slice(0, 160),
    version: String(version || '初版').slice(0, 80), units: String(units).slice(0, 30),
    source: source ? path.relative(workspace, path.resolve(workspace, source)) : null,
    original: path.relative(workspace, actual), stored: path.relative(workspace, target),
    bytes: buffer.length, ...metadata, publishedAt: Date.now() };
}
