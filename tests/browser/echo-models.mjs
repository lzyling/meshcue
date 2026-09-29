import fs from "node:fs";
import path from "node:path";

// Coordinates are shared by the STL and GLB fixtures. GLB is already Y-up.
const lo = [-10, -7.5, -4],
  hi = [10, 7.5, 4];
const corner = (i) => [0, 1, 2].map((k) => ((i >> k) & 1 ? hi : lo)[k]);
const quads = [
  [0, 2, 3, 1],
  [4, 5, 7, 6],
  [0, 1, 5, 4],
  [2, 6, 7, 3],
  [0, 4, 6, 2],
  [1, 3, 7, 5],
];
const triangles = quads.flatMap(([a, b, c, d]) =>
  [
    [a, b, c],
    [a, c, d],
  ].map((t) => t.map(corner)),
);
export const yUp = ([x, y, z]) => [x, z, -y];

export function writePlate(dir) {
  const file = path.join(dir, "plate.stl");
  const facets = triangles.map(
    (t) =>
      `facet normal 0 0 0\nouter loop\n${t.map((p) => `vertex ${p.join(" ")}`).join("\n")}\nendloop\nendfacet`,
  );
  fs.writeFileSync(file, `solid plate\n${facets.join("\n")}\nendsolid plate\n`);
  return file;
}

// A real GLB, not an in-page material override: all triangles wind inward,
// while optional vertex normals correctly point outward. DoubleSide makes
// the outside visible even though its winding is backwards. Missing NORMAL
// exercises the loader's computed-normal/fallback path as well.
export function writeInwardPlate(dir, withNormals) {
  const positions = [],
    normals = [];
  for (const tri of triangles) {
    const points = tri.map(yUp);
    const a = points[1].map((v, i) => v - points[0][i]);
    const b = points[2].map((v, i) => v - points[0][i]);
    const n = [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const length = Math.hypot(...n);
    for (const i of [0, 2, 1]) {
      positions.push(...points[i]);
      normals.push(...n.map((v) => v / length));
    }
  }
  const positionBytes = Buffer.from(new Float32Array(positions).buffer);
  const normalBytes = Buffer.from(new Float32Array(normals).buffer);
  const bin = withNormals
    ? Buffer.concat([positionBytes, normalBytes])
    : positionBytes;
  const gltf = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, ...(withNormals ? { NORMAL: 1 } : {}) },
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: [0.65, 0.65, 0.65, 1],
          metallicFactor: 0,
          roughnessFactor: 0.8,
        },
      },
    ],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.length },
      ...(withNormals
        ? [
            {
              buffer: 0,
              byteOffset: positionBytes.length,
              byteLength: normalBytes.length,
            },
          ]
        : []),
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 36,
        type: "VEC3",
        min: [-10, -4, -7.5],
        max: [10, 4, 7.5],
      },
      ...(withNormals
        ? [{ bufferView: 1, componentType: 5126, count: 36, type: "VEC3" }]
        : []),
    ],
  };
  const json = Buffer.from(JSON.stringify(gltf));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(padded);
  const out = Buffer.alloc(12 + 8 + padded.length + 8 + bin.length);
  out.write("glTF");
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(padded.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(out, 20);
  const offset = 20 + padded.length;
  out.writeUInt32LE(bin.length, offset);
  out.writeUInt32LE(0x004e4942, offset + 4);
  bin.copy(out, offset + 8);
  const file = path.join(
    dir,
    `inward-${withNormals ? "normals" : "no-normals"}.glb`,
  );
  fs.writeFileSync(file, out);
  return file;
}
