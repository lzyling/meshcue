import { Matrix4, Matrix3, Vector3 } from "three";
import { IntegrationError } from "./context.mjs";

// Column-vector convention; reject rather than repair non-rigid registrations.
export const ROTATION_TOLERANCE = 1e-6;
export function normalizeSourceTransform(value) {
  const bad = () => {
    throw Object.assign(
      new IntegrationError(
        "INVALID_INPUT",
        "sourceTransform requires sourceFile, a finite orthogonal 3x3 rotation with determinant +1 (tolerance 1e-6), and optional finite translation[3].",
      ),
      { status: 400 },
    );
  };
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) => !["sourceFile", "rotation", "translation"].includes(k),
    ) ||
    typeof value.sourceFile !== "string" ||
    !value.sourceFile.trim()
  )
    bad();
  const vector = (v) =>
    Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  const r = value.rotation;
  if (
    !Array.isArray(r) ||
    r.length !== 3 ||
    !r.every(vector) ||
    (value.translation !== undefined && !vector(value.translation))
  )
    bad();
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      if (
        Math.abs(
          r[i].reduce((s, v, k) => s + v * r[j][k], 0) - (i === j ? 1 : 0),
        ) > ROTATION_TOLERANCE
      )
        bad();
  const determinant = new Matrix3().set(...r.flat()).determinant();
  if (Math.abs(determinant - 1) > ROTATION_TOLERANCE) bad();
  return {
    sourceFile: value.sourceFile,
    rotation: r.map((row) => [...row]),
    translation: [...(value.translation || [0, 0, 0])],
  };
}

// Never consult the displayed model: both manifest and registration are batch-owned.
export function annotateCoordinates(batch) {
  if (!batch?.annotations) return batch;
  const out = structuredClone(batch);
  const registration = out.model?.sourceTransform;
  const inverse = registration
    ? new Matrix3().set(...registration.rotation.flat()).transpose()
    : null;
  const sourcePoint = (p) =>
    new Vector3()
      .fromArray(p)
      .sub(new Vector3().fromArray(registration.translation || [0, 0, 0]))
      .applyMatrix3(inverse)
      .toArray();
  const sourceDirection = (p) =>
    new Vector3().fromArray(p).applyMatrix3(inverse).normalize().toArray();
  const meshes = new Map(
    (out.meshManifest?.meshes || []).map((m) => [m.id, m]),
  );
  for (const m of meshes.values()) {
    m.fromSpace = "mesh";
    m.toSpace = "preview";
    if (m.fileMatrixWorld) m.fileToSpace = "file";
  }
  const file = (object) => {
    object.coordinateSpace = "file";
  };
  const bounds = (b, space) => {
    if (!b) return;
    b.coordinateSpace = space;
    if (!registration || space !== "file") return;
    const corners = [];
    for (const x of [b.min[0], b.max[0]])
      for (const y of [b.min[1], b.max[1]])
        for (const z of [b.min[2], b.max[2]])
          corners.push(sourcePoint([x, y, z]));
    return {
      coordinateSpace: "source",
      conservative: true,
      min: [0, 1, 2].map((i) => Math.min(...corners.map((p) => p[i]))),
      max: [0, 1, 2].map((i) => Math.max(...corners.map((p) => p[i]))),
      ...(b.centroid ? { centroid: sourcePoint(b.centroid) } : {}),
      ...(b.area !== undefined ? { area: b.area } : {}),
    };
  };
  const convert = (object, meshId, patch = false) => {
    object.coordinateSpace = "mesh";
    const values = meshes.get(meshId)?.fileMatrixWorld;
    const matrix =
      values?.length === 16 ? new Matrix4().fromArray(values) : null;
    if (
      !matrix ||
      !values.every(Number.isFinite) ||
      matrix.determinant() === 0
    ) {
      object.fileConversion = "unavailable";
      object.fileConversionReason = matrix
        ? "Batch mesh-to-file matrix is singular or invalid."
        : "Batch manifest has no mesh-to-file matrix for this mesh.";
      return;
    }
    const point = (p) =>
      new Vector3().fromArray(p).applyMatrix4(matrix).toArray();
    if (patch) {
      object.fileVertices = object.vertices.map(point);
      if (registration)
        object.sourceVertices = object.fileVertices.map(sourcePoint);
    } else {
      object.filePosition = point(object.position);
      object.fileNormal = new Vector3()
        .fromArray(object.normal)
        .applyNormalMatrix(new Matrix3().getNormalMatrix(matrix))
        .toArray();
      if (registration) {
        object.sourcePosition = sourcePoint(object.filePosition);
        object.sourceNormal = sourceDirection(object.fileNormal);
      }
    }
  };
  for (const a of out.annotations) {
    if (a.view) {
      file(a.view);
      if (registration) {
        a.view.sourcePosition = sourcePoint(a.view.position);
        a.view.sourceTarget = sourcePoint(a.view.target);
        a.view.sourceUp = sourceDirection(a.view.up);
      }
    }
    if (a.type === "pin") convert(a, a.meshId);
    if (a.type === "region") {
      const sourceBounds = bounds(
        a.bounds,
        a.bounds?.space === "model" ? "file" : "preview",
      );
      if (sourceBounds) a.sourceBounds = sourceBounds;
      for (const p of a.surfacePatches || []) convert(p, p.meshId, true);
    }
    if (a.type === "part") {
      const s = bounds(a.bounds, "file");
      if (s) a.sourceBounds = s;
    }
    if (a.type === "edge" || a.type === "measure") {
      file(a);
      if (registration) {
        if (a.points) a.sourcePoints = a.points.map(sourcePoint);
        if (a.normals) a.sourceNormals = a.normals.map(sourceDirection);
        if (a.center) a.sourceCenter = sourcePoint(a.center);
        if (a.normal) a.sourceNormal = sourceDirection(a.normal);
        a.sourceMeasurementInvariant = true;
      }
    }
  }
  if (out.camera) out.camera.coordinateSpace = "preview";
  if (registration)
    out.sourceSpace = {
      coordinateSpace: "source",
      sourceFile: registration.sourceFile,
    };
  return out;
}

export function coordinateExtras(a, exclude = []) {
  return Object.fromEntries(
    Object.entries(a).filter(
      ([k]) =>
        !exclude.includes(k) &&
        (k === "coordinateSpace" ||
          k.startsWith("file") ||
          (k.startsWith("source") && !["sourceFaceIndex"].includes(k))),
    ),
  );
}

// Derived read metadata is not editable marking geometry. Preserve legacy keys.
export function withoutCoordinateExtras(value) {
  if (Array.isArray(value)) return value.map(withoutCoordinateExtras);
  if (!value || typeof value !== "object") return value;
  const added = new Set([
    "coordinateSpace",
    "filePosition",
    "fileNormal",
    "fileVertices",
    "fileConversion",
    "fileConversionReason",
    "sourcePosition",
    "sourceNormal",
    "sourceVertices",
    "sourceBounds",
    "sourcePoints",
    "sourceEnds",
    "sourceNormals",
    "sourceCenter",
    "sourceTarget",
    "sourceUp",
    "sourceMeasurementInvariant",
  ]);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !added.has(key))
      .map(([key, v]) => [key, withoutCoordinateExtras(v)]),
  );
}
