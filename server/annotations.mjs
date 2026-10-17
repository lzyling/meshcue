import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ReviewError, atomicJson } from "./store.mjs";
import { MAX_TRIANGLES } from "./models.mjs";
import { id } from "./review-schemas.mjs";
import {
  MAX_ROUND_BYTES,
  MARK_WHOLE_FACE_BYTES,
  MARK_VIEW_BYTES,
  MARK_MEASURE_BYTES,
  MEASURE_PARALLEL_DEG,
} from "./budget.mjs";

export function annotationValidation({ runtime, store }) {
  function saveManifest(versionId, meshes) {
    const valid = z
      .array(
        z
          .object({
            id,
            name: z.string().max(200),
            triangles: z.number().int().positive().max(MAX_TRIANGLES),
            sourceTriangles: z.number().int().positive().max(MAX_TRIANGLES),
            surfaceAlgorithm: z.literal("midpoint-v3-edge0.07-rationed"),
            matrixWorld: z.array(z.number().finite()).length(16),
            fileMatrixWorld: z.array(z.number().finite()).length(16).optional(),
            fromSpace: z.literal("mesh").optional(),
            toSpace: z.literal("preview").optional(),
            fileToSpace: z.literal("file").optional(),
          })
          .strict(),
      )
      .min(1)
      .max(2000)
      .parse(meshes);
    if (
      new Set(valid.map((x) => x.id)).size !== valid.length ||
      valid.reduce((n, x) => n + x.triangles, 0) > MAX_TRIANGLES
    )
      throw new ReviewError("The model mesh exceeds the limits.", 400);
    atomicJson(path.join(runtime, "manifests", `${versionId}.json`), {
      versionId,
      sha256: (
        store.state.models[versionId].mesh || store.state.models[versionId]
      ).sha256,
      meshes: valid,
    });
  }
  /* A kept measurement has to say one thing. What each kind is made of is fixed
   -- two points, one edge, two faces with their normals, three points with
   the circle through them -- and the number is the one its own geometry
   gives: a length is the distance between its two points, two faces are a
   length only when they are parallel and an angle, the one their normals
   make, when they are not, and a diameter is twice the distance from the
   centre to each of its three points, which lie in the plane of its normal.
   Each triangle it was taken on has to be one this model has. Rounding to six
   figures is allowed for, and nothing more: a batch that contradicts itself
   is not handed to an agent to puzzle over. */
  function checkMeasure(a, meshes) {
    const bad = (reason) =>
      new ReviewError(
        `A measurement does not hold together: ${reason}; the draft was not overwritten.`,
        400,
        "BAD_GEOMETRY",
      );
    const circle = a.kind === "circle";
    // Picks, points, whether it has normals, whether it has a centre.
    const shape = {
      points: [2, 2, false, false],
      edge: [1, 2, false, false],
      planes: [2, 2, true, false],
      circle: [3, 3, false, true],
    }[a.kind];
    if (
      a.picks.length !== shape[0] ||
      a.points.length !== shape[1] ||
      !!a.normals !== shape[2] ||
      !!a.center !== shape[3] ||
      !!a.normal !== shape[3]
    )
      throw bad(`${a.kind} is not what it was taken on`);
    for (const pick of a.picks)
      if (
        !meshes.has(pick.meshId) ||
        pick.sourceFaceIndex >= meshes.get(pick.meshId).sourceTriangles
      )
        throw new ReviewError(
          "The annotations do not match the current model mesh; the draft was not overwritten.",
          400,
          "BAD_GEOMETRY",
        );
    const [p, q] = a.points;
    const scale = Math.max(
      a.value,
      ...[...a.points, ...(circle ? [a.center] : [])].flat().map(Math.abs),
    );
    const slack = 2e-5 * scale + 1e-12;
    const length = (v) => Math.hypot(...v);
    const minus = (u, v) => u.map((x, i) => x - v[i]);
    const dot = (u, v) => u.reduce((n, x, i) => n + x * v[i], 0);
    if (circle) {
      if (a.quantity !== "diameter") throw bad("a circle measures a diameter");
      if (Math.abs(length(a.normal) - 1) > 1e-4)
        throw bad("its normal is not a direction");
      if (!(a.value > 2 * slack)) throw bad("a circle has a size");
      for (const [i, point] of a.points.entries()) {
        const out = minus(point, a.center);
        if (Math.abs(length(out) - a.value / 2) > slack)
          throw bad("the diameter is not the circle's through its points");
        if (Math.abs(dot(out, a.normal)) > slack)
          throw bad("its points are not in the plane of its normal");
        if (
          a.points.some(
            (other, j) => j > i && length(minus(point, other)) <= slack,
          )
        )
          throw bad("a circle is three different points");
      }
      return;
    }
    if (a.kind === "planes") {
      const [m, n] = a.normals;
      if ([m, n].some((v) => Math.abs(length(v) - 1) > 1e-4))
        throw bad("a normal is not a direction");
      const cos = Math.abs(dot(m, n));
      const angle = (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
      const parallel = angle <= MEASURE_PARALLEL_DEG + 0.01;
      if (a.quantity === "diameter" || (a.quantity === "angle") === parallel)
        throw bad("parallel faces are a length and others an angle");
      if (a.quantity === "angle") {
        if (Math.abs(angle - a.value) > 0.01)
          throw bad("the angle is not the one its normals make");
        return;
      }
    } else if (a.quantity !== "length")
      throw bad(`${a.kind} measures a length`);
    if (Math.abs(length(minus(p, q)) - a.value) > slack)
      throw bad("the length is not the distance between its points");
  }
  function validateAnnotations(versionId, annotations) {
    const manifestFile = path.join(runtime, "manifests", `${versionId}.json`);
    if (!fs.existsSync(manifestFile))
      throw new ReviewError(
        "The model has not finished loading.",
        409,
        "NOT_READY",
      );
    const meshes = new Map(
      JSON.parse(fs.readFileSync(manifestFile, "utf8")).meshes.map((m) => [
        m.id,
        m,
      ]),
    );
    const usedIds = new Set();
    let faceCount = 0,
      patchCount = 0,
      markCost = 0;
    for (const a of annotations) {
      if (usedIds.has(a.id))
        throw new ReviewError("Duplicate annotation id.", 400);
      usedIds.add(a.id);
      if (a.type === "measure") checkMeasure(a, meshes);
      if (a.type === "edge") {
        const length = a.points
          .slice(1)
          .reduce(
            (sum, p, i) =>
              sum + Math.hypot(...p.map((v, j) => v - a.points[i][j])),
            0,
          );
        const difference = length - a.length;
        const tolerance = 1e-6 * Math.max(length, a.length, Number.EPSILON);
        if (
          !Number.isFinite(length) ||
          !Number.isFinite(difference) ||
          !meshes.has(a.meshId) ||
          a.sourceFaceIndex >= meshes.get(a.meshId).sourceTriangles ||
          !(Math.abs(difference) <= tolerance)
        )
          throw new ReviewError(
            "An edge does not match its geometry.",
            400,
            "BAD_GEOMETRY",
          );
      }
      if (
        a.type === "part" &&
        (a.names.length !== a.partIds.length ||
          a.meshIds.some((id) => !meshes.has(id)) ||
          a.bounds.min.some((min, i) => {
            const max = a.bounds.max[i],
              centroid = a.bounds.centroid[i];
            // Finite endpoints alone do not guarantee a finite span. Compare
            // directly for ordering/containment rather than overflow-prone sums.
            return (
              !Number.isFinite(max - min) ||
              !(min <= centroid && centroid <= max)
            );
          }))
      )
        throw new ReviewError(
          "A part does not match the model.",
          400,
          "BAD_GEOMETRY",
        );
      const groups =
        a.type === "pin"
          ? { [a.meshId]: [a.faceIndex] }
          : a.type === "measure"
            ? {}
            : a.faces || {};
      for (const [meshId, faces] of Object.entries(groups)) {
        if (
          !meshes.has(meshId) ||
          faces.some(
            (f) =>
              f >=
              (a.type === "region" &&
              ["source-v1", "source-v2"].includes(a.coverage)
                ? meshes.get(meshId).sourceTriangles
                : meshes.get(meshId).triangles),
          )
        )
          throw new ReviewError(
            "The annotations do not match the current model mesh; the draft was not overwritten.",
            400,
            "BAD_GEOMETRY",
          );
        faceCount += faces.length;
      }
      if (
        a.type === "pin" &&
        a.sourceFaceIndex !== undefined &&
        a.sourceFaceIndex >= meshes.get(a.meshId).sourceTriangles
      )
        throw new ReviewError(
          "A pin's source face does not match.",
          400,
          "BAD_GEOMETRY",
        );
      if (a.type === "region") {
        const patches = a.surfacePatches || [];
        const selected = new Set(
          Object.entries(a.faces).flatMap(([meshId, faces]) =>
            faces.map((f) => `${meshId}:${f}`),
          ),
        );
        /* Every face has to be accounted for, and until `source-v2` the only
         accounting was a polygon: one per face at least, or the mark was
         calling itself incomplete. That is what charged a face covered end to
         end 142 bytes to repeat the triangle its own number already named.

         Under `source-v2` a face with no patch means the whole face, so the
         patches name a subset of `faces` rather than all of it. Everything
         else still holds — no patch may name a face the mark did not claim,
         and the claim is still exact. */
        const painted = new Set(
          patches.map((p) => `${p.meshId}:${p.faceIndex}`),
        );
        const whole = a.coverage === "source-v2";
        if (
          (!["brush-v1", "source-v1", "source-v2"].includes(a.coverage) &&
            patches.length !== selected.size) ||
          (whole
            ? painted.size > selected.size
            : painted.size !== selected.size) ||
          patches.some(
            (p) =>
              !selected.has(`${p.meshId}:${p.faceIndex}`) ||
              p.sourceFaceIndex >= meshes.get(p.meshId).sourceTriangles ||
              (["source-v1", "source-v2"].includes(a.coverage) &&
                p.faceIndex !== p.sourceFaceIndex),
          )
        )
          throw new ReviewError(
            "The painted surface data is incomplete; the draft was not overwritten.",
            400,
            "BAD_GEOMETRY",
          );
      }
      /* A round used to stop at 20,000 faces and 40,000 polygons. Both were the
       same limit written twice — the browser's storage budget, back when a
       face covered end to end still stored a polygon repeating its own
       triangle. Under `source-v2` a whole face costs its number, and the two
       numbers stopped meaning anything: a bucket fill over a connected surface
       is a few kilobytes, and every face of a 97,280-triangle model is 19% of
       the budget.

       What is left is the budget itself, counted the way the page counts it.
       The ceiling here sits above the page's so that a reviewer meets the
       toast that tells them to submit, and never this. A round that arrives
       over it did not come from our page. */
      patchCount += a.surfacePatches?.length || 0;
      const patches = a.surfacePatches || [];
      const claimed =
        a.type === "pin"
          ? 1
          : a.type === "measure"
            ? 0
            : Object.values(a.faces || {}).reduce(
                (n, list) => n + list.length,
                0,
              );
      const onFaces = new Set(patches.map((p) => `${p.meshId}:${p.faceIndex}`))
        .size;
      markCost +=
        120 +
        Buffer.byteLength(a.note || "") +
        (a.view ? MARK_VIEW_BYTES : 0) +
        (a.type === "measure" ? MARK_MEASURE_BYTES : 0) +
        (["edge", "part"].includes(a.type)
          ? Buffer.byteLength(JSON.stringify(a))
          : 0) +
        Math.max(0, claimed - onFaces) * MARK_WHOLE_FACE_BYTES +
        patches.reduce((n, p) => n + 64 + p.vertices.length * 26, 0);
      if (markCost > MAX_ROUND_BYTES)
        throw new ReviewError(
          "This round holds more marking than a browser will keep; submit in batches.",
          400,
        );
    }
  }
  return { saveManifest, validateAnnotations };
}
