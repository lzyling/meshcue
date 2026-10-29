// Classic worker for KHR_draco_mesh_compression primitives. The first message
// names the vendored JavaScript decoder, which importScripts runs unchanged:
// no WASM fetch, no eval and no blob: worker. The decode steps follow
// three.js's DRACOLoader worker (MIT) for the glTF case, where attributes are
// always addressed by their unique id.
const arrays = {
  Float32Array,
  Int8Array,
  Int16Array,
  Int32Array,
  Uint8Array,
  Uint16Array,
  Uint32Array,
};
let ready;

function dataType(draco, TypedArray) {
  return {
    Float32Array: draco.DT_FLOAT32,
    Int8Array: draco.DT_INT8,
    Int16Array: draco.DT_INT16,
    Int32Array: draco.DT_INT32,
    Uint8Array: draco.DT_UINT8,
    Uint16Array: draco.DT_UINT16,
    Uint32Array: draco.DT_UINT32,
  }[TypedArray.name];
}

function decodeAttribute(draco, decoder, mesh, name, TypedArray, attribute) {
  const count = mesh.num_points();
  const itemSize = attribute.num_components();
  // glTF aligns each vertex to four bytes; narrower items are interleaved.
  const srcByteStride = itemSize * TypedArray.BYTES_PER_ELEMENT;
  const dstByteStride = Math.ceil(srcByteStride / 4) * 4;
  const stride = dstByteStride / TypedArray.BYTES_PER_ELEMENT;
  const byteLength = count * srcByteStride;
  const ptr = draco._malloc(byteLength);
  try {
    decoder.GetAttributeDataArrayForAllPoints(
      mesh,
      attribute,
      dataType(draco, TypedArray),
      byteLength,
      ptr,
    );
    const src = new TypedArray(
      draco.HEAPF32.buffer,
      ptr,
      byteLength / TypedArray.BYTES_PER_ELEMENT,
    );
    let array;
    if (srcByteStride === dstByteStride) array = src.slice();
    else {
      array = new TypedArray(
        (count * dstByteStride) / TypedArray.BYTES_PER_ELEMENT,
      );
      for (let i = 0; i < count; i++)
        for (let j = 0; j < itemSize; j++)
          array[i * stride + j] = src[i * itemSize + j];
    }
    return { name, itemSize, stride, array };
  } finally {
    draco._free(ptr);
  }
}

function decodeIndex(draco, decoder, mesh) {
  const count = mesh.num_faces() * 3;
  const byteLength = count * 4;
  const ptr = draco._malloc(byteLength);
  try {
    decoder.GetTrianglesUInt32Array(mesh, byteLength, ptr);
    return new Uint32Array(draco.HEAPF32.buffer, ptr, count).slice();
  } finally {
    draco._free(ptr);
  }
}

function decode(draco, buffer, { attributeIDs, attributeTypes }) {
  const bytes = new Int8Array(buffer);
  const decoder = new draco.Decoder();
  const mesh = new draco.Mesh();
  try {
    if (decoder.GetEncodedGeometryType(bytes) !== draco.TRIANGULAR_MESH)
      throw new Error("Draco primitive is not a triangle mesh.");
    const status = decoder.DecodeArrayToMesh(bytes, bytes.byteLength, mesh);
    if (!status.ok() || mesh.ptr === 0)
      throw new Error(`Draco decoding failed: ${status.error_msg()}`);
    const attributes = [];
    for (const name in attributeIDs) {
      const TypedArray = arrays[attributeTypes[name]];
      if (!TypedArray) throw new Error(`Unsupported Draco attribute type.`);
      const attribute = decoder.GetAttributeByUniqueId(
        mesh,
        attributeIDs[name],
      );
      attributes.push(
        decodeAttribute(draco, decoder, mesh, name, TypedArray, attribute),
      );
    }
    return { index: decodeIndex(draco, decoder, mesh), attributes };
  } finally {
    draco.destroy(mesh);
    draco.destroy(decoder);
  }
}

self.onmessage = ({ data }) => {
  if (data.type === "init") {
    importScripts(data.decoderUrl);
    ready = new Promise((resolve) => {
      // The module object is thenable; wrap it so resolve does not chain it.
      self.DracoDecoderModule({
        onModuleLoaded: (draco) => resolve({ draco }),
      });
    });
    return;
  }
  ready.then(({ draco }) => {
    try {
      const geometry = decode(draco, data.buffer, data.config);
      const transfer = geometry.attributes.map((a) => a.array.buffer);
      transfer.push(geometry.index.buffer);
      self.postMessage({ id: data.id, geometry }, transfer);
    } catch (error) {
      self.postMessage({ id: data.id, error: String(error?.message || error) });
    }
  });
};
