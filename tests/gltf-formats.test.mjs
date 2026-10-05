import test, { before } from "node:test";
import { initializeCompression } from "../server/gltf-compression.mjs";

// Production callers prepare compressed files at their async entry point.
before(() => initializeCompression());
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  inspectModel,
  importModel,
  MAX_BYTES,
  MAX_TRIANGLES,
} from "../server/models.mjs";
import { precheckModel } from "../integration/precheck.mjs";
import { MeshoptEncoder } from "./fixtures/gltf-meshopt-encoder.js";
import { packGltf, encodeGlb } from "../server/gltf-pack.mjs";
import {
  bracketGltf,
  externalGltf,
  unpack,
  png,
} from "./fixtures/gltf-fixtures.mjs";

const kinds = ["plain", "draco", "meshopt", "quantized"];
function setup(t) {
  fs.mkdirSync("tmp", { recursive: true });
  const workspace = fs.mkdtempSync(path.join(process.cwd(), "tmp/gltf-"));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const dir = path.join(workspace, "assets");
  const doc = externalGltf(dir);
  const actual = path.join(dir, "bracket.gltf");
  return {
    workspace,
    dir,
    doc,
    actual,
    mediaDir: path.join(workspace, "media"),
    ctx: {
      agentId: "fixture",
      sessionKey: "fixture",
      sessionId: "one",
      messageChannel: "webchat",
      workspaceDir: workspace,
      fsPolicy: { workspaceOnly: true },
    },
  };
}
const mutate = (bytes, fn) => {
  const { doc, bin } = unpack(bytes);
  fn(doc, bin);
  return encodeGlb(doc, bin);
};

test("plain, Draco, Meshopt and quantized bracket budgets agree", () => {
  const baseline = inspectModel(bracketGltf("plain", [png]), "glb");
  for (const kind of kinds) {
    assert.deepEqual(
      inspectModel(bracketGltf(kind, [png]), "glb"),
      baseline,
      kind,
    );
    // Optional extension declarations still select compressed data in the
    // browser, so they must follow the identical service validation path.
    assert.deepEqual(
      inspectModel(
        mutate(
          bracketGltf(kind, [png]),
          (doc) => delete doc.extensionsRequired,
        ),
        "glb",
      ),
      baseline,
    );
  }
});

test("compressed twins enforce the same triangle and GPU texture budgets", () => {
  for (const kind of kinds) {
    const over = mutate(bracketGltf(kind), (doc) => {
      doc.nodes = Array.from(
        { length: Math.floor(MAX_TRIANGLES / 12) + 1 },
        () => ({ mesh: 0 }),
      );
    });
    assert.throws(
      () => inspectModel(over, "glb"),
      (e) => e.code === "MODEL_LIMIT" && e.measured.triangles === 600012,
    );
    const huge = Buffer.from(png);
    huge.writeUInt32BE(4096, 16);
    huge.writeUInt32BE(4096, 20);
    assert.throws(
      () => inspectModel(bracketGltf(kind, Array(5).fill(huge)), "glb"),
      (e) =>
        e.code === "TEXTURE_LIMIT" &&
        Math.abs(e.measured.textureBytes / 1048576 - 426.6666667) < 0.01,
    );
  }
});

test("corrupt compression and forged decoded counts cannot bypass validation", () => {
  assert.throws(
    () =>
      inspectModel(
        mutate(bracketGltf("draco"), (doc) => {
          doc.accessors[2].count = 3;
        }),
        "glb",
      ),
    /Draco face count/,
  );
  assert.throws(
    () =>
      inspectModel(
        mutate(bracketGltf("draco"), (doc, bin) => {
          bin.fill(
            0,
            doc.bufferViews[0].byteOffset,
            doc.bufferViews[0].byteOffset + 5,
          );
        }),
        "glb",
      ),
    /Draco/,
  );
  assert.throws(
    () =>
      inspectModel(
        mutate(bracketGltf("meshopt"), (doc, bin) => {
          bin[0] = 0;
        }),
        "glb",
      ),
    /Meshopt decoding/,
  );
  assert.throws(
    () =>
      inspectModel(
        mutate(bracketGltf("meshopt"), (doc) => {
          doc.accessors[0].count *= 100;
        }),
        "glb",
      ),
    /accessor exceeds/,
  );
  assert.throws(
    () =>
      inspectModel(
        mutate(bracketGltf("meshopt"), (doc) => {
          doc.bufferViews[0].extensions.EXT_meshopt_compression.count *= 100;
        }),
        "glb",
      ),
    /decoded buffer size/,
  );
});

test("compressed image views still contribute their decoded GPU memory", () => {
  const compressedImage = (image) => {
    const { doc, bin } = unpack(bracketGltf("meshopt"));
    const padded = Buffer.alloc(Math.ceil(image.length / 4) * 4);
    image.copy(padded);
    const encoded = Buffer.from(
      MeshoptEncoder.encodeGltfBuffer(
        padded,
        padded.length / 4,
        4,
        "ATTRIBUTES",
      ),
    );
    doc.images = [
      { bufferView: doc.bufferViews.length, mimeType: "image/png" },
    ];
    doc.bufferViews.push({
      buffer: 0,
      byteOffset: 0,
      byteLength: padded.length,
      extensions: {
        EXT_meshopt_compression: {
          buffer: 0,
          byteOffset: bin.length,
          byteLength: encoded.length,
          byteStride: 4,
          count: padded.length / 4,
          mode: "ATTRIBUTES",
        },
      },
    });
    doc.buffers[0].byteLength = bin.length + encoded.length;
    return encodeGlb(doc, Buffer.concat([bin, encoded]));
  };
  assert.equal(inspectModel(compressedImage(png), "glb").textureBytes, 16 / 3);
  const huge = Buffer.from(png);
  huge.writeUInt32BE(8193, 16);
  assert.throws(
    () => inspectModel(compressedImage(huge), "glb"),
    (e) => e.code === "TEXTURE_LIMIT",
  );
});

test("compression leaves skipped primitives and static-only refusals intact", () => {
  for (const kind of kinds) {
    const skipped = mutate(bracketGltf(kind), (doc) => {
      doc.meshes.push({ primitives: [{ mode: 1, attributes: {} }] });
      doc.nodes.push({ mesh: 3 });
    });
    const result = inspectModel(skipped, "glb");
    assert.equal(result.triangles, 36);
    assert.equal(result.notices[0].code, "SKIPPED_PRIMITIVES");
    const animated = mutate(bracketGltf(kind), (doc) => {
      doc.skins = [{}];
    });
    assert.throws(
      () => inspectModel(animated, "glb"),
      (e) => e.code === "ANIMATED_MODEL",
    );
  }
});

test("external glTF precheck and publication produce one immutable GLB", async (t) => {
  const f = setup(t);
  const check = precheckModel(f.ctx, "assets/bracket.gltf");
  assert.equal(check.verdict, "ok");
  assert.equal(check.format, "glb");
  assert.equal(check.triangles, 36);
  assert.equal(check.textureBytes, 16 / 3);
  const first = await importModel({ file: "assets/bracket.gltf" }, f);
  assert.equal(first.format, "glb");
  assert.equal(first.bytes, check.bytes);
  assert.equal(first.original, "assets/bracket.gltf");
  const stored = fs.readFileSync(path.join(f.workspace, first.stored));
  const { doc } = unpack(stored);
  assert.equal(doc.buffers.length, 1);
  assert.ok(!doc.buffers[0].uri && !doc.images[0].uri);
  assert.deepEqual(
    await importModel({ file: "assets/bracket.gltf" }, f).then((m) => m.sha256),
    first.sha256,
  );
  const bytes = fs.readFileSync(path.join(f.dir, "geometry.bin"));
  bytes[0] ^= 1;
  fs.writeFileSync(path.join(f.dir, "geometry.bin"), bytes);
  const second = await importModel({ file: "assets/bracket.gltf" }, f);
  assert.notEqual(second.sha256, first.sha256);
  assert.deepEqual(
    fs.readFileSync(path.join(f.workspace, first.stored)),
    stored,
  );
});

test("glTF supports nested resources, multiple buffers and data URIs", (t) => {
  const f = setup(t);
  fs.mkdirSync(path.join(f.dir, "nested"));
  fs.renameSync(
    path.join(f.dir, "geometry.bin"),
    path.join(f.dir, "nested", "geometry.bin"),
  );
  f.doc.buffers[0].uri = "nested/geometry.bin";
  f.doc.images[0].uri = `data:image/png;base64,${png.toString("base64")}`;
  f.doc.buffers.unshift({
    uri: "data:application/octet-stream;base64,AAAAAA==",
    byteLength: 4,
  });
  f.doc.bufferViews.forEach((view) => view.buffer++);
  const packed = packGltf(
    Buffer.from(JSON.stringify(f.doc)),
    f.actual,
    f.workspace,
    MAX_BYTES,
  );
  assert.equal(inspectModel(packed, "glb").triangles, 36);
  assert.equal(inspectModel(packed, "glb").texturePixels, 1);
  f.doc.images[0].uri = `data:image/png,${[...png].map((b) => `%${b.toString(16).padStart(2, "0")}`).join("")}`;
  assert.equal(
    inspectModel(
      packGltf(
        Buffer.from(JSON.stringify(f.doc)),
        f.actual,
        f.workspace,
        MAX_BYTES,
      ),
      "glb",
    ).texturePixels,
    1,
  );
});

test("glTF refuses escaping, absolute, remote, missing and malformed resource URIs", async (t) => {
  const f = setup(t);
  for (const [uri, code] of [
    ["../secret.bin", "GLTF_RESOURCE_OUTSIDE"],
    ["%2e%2e/secret.bin", "GLTF_RESOURCE_OUTSIDE"],
    ["/tmp/secret.bin", "GLTF_RESOURCE_URI"],
    ["C:/secret.bin", "GLTF_RESOURCE_URI"],
    ["https://example.com/a.bin", "GLTF_RESOURCE_URI"],
    ["file:secret.bin", "GLTF_RESOURCE_URI"],
    ["//example.com/a.bin", "GLTF_RESOURCE_URI"],
    ["missing.bin", "GLTF_RESOURCE_MISSING"],
    ["bad%zz.bin", "GLTF_RESOURCE_URI"],
    ["..\\secret.bin", "GLTF_RESOURCE_URI"],
  ]) {
    f.doc.buffers[0].uri = uri;
    fs.writeFileSync(f.actual, JSON.stringify(f.doc));
    assert.throws(
      () => precheckModel(f.ctx, "assets/bracket.gltf"),
      (e) => e.code === code,
      uri,
    );
    await assert.rejects(
      importModel({ file: "assets/bracket.gltf" }, f),
      (e) => e.code === code,
      uri,
    );
  }
  assert.ok(!fs.existsSync(f.mediaDir));
});

test("glTF refuses symlinks outside its tree even inside the workspace", (t) => {
  const f = setup(t);
  fs.writeFileSync(path.join(f.workspace, "outside.bin"), "secret");
  fs.symlinkSync(
    path.join(f.workspace, "outside.bin"),
    path.join(f.dir, "escape.bin"),
  );
  f.doc.buffers[0].uri = "escape.bin";
  assert.throws(
    () =>
      packGltf(
        Buffer.from(JSON.stringify(f.doc)),
        f.actual,
        f.workspace,
        MAX_BYTES,
      ),
    (e) => e.code === "GLTF_RESOURCE_OUTSIDE",
  );
  fs.symlinkSync(
    path.join(f.dir, "geometry.bin"),
    path.join(f.dir, "safe.bin"),
  );
  f.doc.buffers[0].uri = "safe.bin";
  assert.equal(
    inspectModel(
      packGltf(
        Buffer.from(JSON.stringify(f.doc)),
        f.actual,
        f.workspace,
        MAX_BYTES,
      ),
      "glb",
    ).triangles,
    36,
  );
});

test("glTF applies packed size and buffer bounds before publishing", (t) => {
  const f = setup(t);
  assert.throws(
    () =>
      packGltf(Buffer.from(JSON.stringify(f.doc)), f.actual, f.workspace, 100),
    (e) => e.code === "MODEL_LIMIT",
  );
  f.doc.bufferViews[0].byteLength = 999999;
  assert.throws(
    () =>
      packGltf(
        Buffer.from(JSON.stringify(f.doc)),
        f.actual,
        f.workspace,
        MAX_BYTES,
      ),
    (e) => e.code === "MODEL_FORMAT",
  );
});

test("every decoded bracket face keeps its ordered corners across repeated loads", async () => {
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const { MeshoptDecoder } =
    await import("three/addons/libs/meshopt_decoder.module.js");
  const { default: createDraco } =
    await import("../server/gltf-vendor/draco_decoder.cjs");
  const d = await createDraco();
  // A test-only synchronous adapter lets the actual GLTFLoader consume Draco
  // under Node (its production adapter uses browser Workers). Both call the
  // same vendored decoder, and the browser suite checks the production path.
  const draco = {
    preload() {},
    decodeDracoFile(bytes, done, attributes) {
      const decoder = new d.Decoder(),
        mesh = new d.Mesh();
      const face = new d.DracoInt32Array(),
        values = new d.DracoFloat32Array();
      try {
        assert.ok(
          decoder
            .DecodeArrayToMesh(new Int8Array(bytes), bytes.byteLength, mesh)
            .ok(),
        );
        const geometry = new THREE.BufferGeometry();
        const indices = [];
        for (let i = 0; i < mesh.num_faces(); i++) {
          decoder.GetFaceFromMesh(mesh, i, face);
          indices.push(face.GetValue(0), face.GetValue(1), face.GetValue(2));
        }
        geometry.setIndex(indices);
        for (const [name, id] of Object.entries(attributes)) {
          const attr = decoder.GetAttributeByUniqueId(mesh, id);
          decoder.GetAttributeFloatForAllPoints(mesh, attr, values);
          const array = Float32Array.from({ length: values.size() }, (_, i) =>
            values.GetValue(i),
          );
          geometry.setAttribute(
            name,
            new THREE.BufferAttribute(array, attr.num_components()),
          );
        }
        done(geometry);
      } finally {
        d.destroy(face);
        d.destroy(values);
        d.destroy(mesh);
        d.destroy(decoder);
      }
    },
  };
  const snapshots = [];
  for (const kind of kinds)
    for (let run = 0; run < 2; run++) {
      const bytes = bracketGltf(kind);
      const gltf = await new GLTFLoader()
        .setDRACOLoader(draco)
        .setMeshoptDecoder(MeshoptDecoder)
        .parseAsync(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
          "",
        );
      gltf.scene.updateMatrixWorld(true);
      const meshes = [];
      gltf.scene.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const { index, attributes } = mesh.geometry;
        const corners = [];
        for (let i = 0; i < index.count; i++)
          corners.push(
            new THREE.Vector3()
              .fromBufferAttribute(attributes.position, index.getX(i))
              .applyMatrix4(mesh.matrixWorld)
              .toArray(),
          );
        meshes.push({ name: mesh.name, faces: index.count / 3, corners });
        mesh.geometry.dispose();
        mesh.material.dispose();
      });
      assert.equal(meshes.length, 3);
      if (snapshots.length)
        assert.deepEqual(meshes, snapshots[0], `${kind}, decode ${run}`);
      snapshots.push(meshes);
    }
});

test("compressed external glTF packs the same geometry and decoder offsets", (t) => {
  const f = setup(t);
  for (const kind of ["draco", "meshopt"]) {
    const { doc, bin } = unpack(bracketGltf(kind, [png]));
    // A leading buffer ensures remapping isn't accidentally correct only at 0.
    doc.buffers[0].uri = "geometry.bin";
    doc.buffers.unshift({
      byteLength: 4,
      uri: "data:application/octet-stream;base64,AAAAAA==",
    });
    for (const view of doc.bufferViews) {
      view.buffer++;
      if (view.extensions?.EXT_meshopt_compression)
        view.extensions.EXT_meshopt_compression.buffer++;
    }
    fs.writeFileSync(path.join(f.dir, "geometry.bin"), bin);
    const result = packGltf(
      Buffer.from(JSON.stringify(doc)),
      f.actual,
      f.workspace,
      MAX_BYTES,
    );
    assert.deepEqual(
      inspectModel(result, "glb"),
      inspectModel(bracketGltf("plain", [png]), "glb"),
    );
  }
});
