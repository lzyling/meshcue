/* What `read` hands the agent.

   It used to hand over the batch exactly as stored — the comment above it said
   so, as though completeness were the virtue. Measured on a real submission of
   eleven marks over 273 faces: 577,687 bytes, something like 144,000 tokens,
   almost all of it coordinates. And it grew with how much the reviewer had
   painted, so the limits on a round of marking were, in the end, limits on how
   much the agent could afford to read back.

   A summary of the same batch is 2,127 bytes. The saving is not the point; the
   shape is. A summary is the same size whether a mark covers twenty-five faces
   or twenty thousand, so what the reviewer may paint stops being a question
   about the agent's context window.

   Geometry is still there for the asking — `read` with `geometry: true`
   returns the batch untouched. That is for echoing a region back, or measuring
   one exactly. It is not for finding out what the reviewer meant, which is
   what the summary is for and what the summary is enough for. */

const round = (v) => (typeof v === "number" ? Number(v.toPrecision(6)) : v);

export function summarizeAnnotation(a) {
  if (a.type === "pin")
    return {
      id: a.id,
      type: "pin",
      label: a.label,
      color: a.color,
      meshId: a.meshId,
      sourceFaceIndex: a.sourceFaceIndex ?? a.faceIndex,
      position: (a.position || []).map(round),
      normal: (a.normal || []).map(round),
    };
  const faces = Object.fromEntries(
    Object.entries(a.faces || {}).map(([meshId, list]) => [
      meshId,
      list.length,
    ]),
  );
  const patches = a.surfacePatches || [];
  const painted = new Set(patches.map((p) => `${p.meshId}:${p.faceIndex}`));
  const claimed = Object.values(faces).reduce((n, count) => n + count, 0);
  return {
    id: a.id,
    type: "region",
    color: a.color,
    coverage: a.coverage || "face-v0",
    faces,
    /* A face with no polygon beside it under `source-v2` is the whole face, so
       these two numbers are the reviewer's stroke described in the terms the
       agent can act on: how much surface, and how much of it was taken
       entirely rather than in part. */
    wholeFaces: Math.max(0, claimed - painted.size),
    partialFaces: painted.size,
    polygons: patches.length,
    ...(a.bounds
      ? {
          centroid: a.bounds.centroid,
          min: a.bounds.min,
          max: a.bounds.max,
          area: a.bounds.area,
        }
      : {}),
  };
}

/* The batch without its coordinates. Every field that says what the batch *is*
   survives — id, version, revision, origin, status, timestamps, the mesh
   manifest — because those are what the agent routes and reasons on. Only
   `annotations` is replaced, and it is replaced rather than dropped so that
   nothing has to learn a second shape to find a mark by id. */
export function summarizeSubmission(batch) {
  if (!batch?.annotations) return batch;
  return {
    ...batch,
    annotations: batch.annotations.map(summarizeAnnotation),
    // Stated, not implied. An agent that needs the extent has to know it was
    // given a description of one, and has to know what to ask for instead.
    geometry: "omitted",
    geometryHint:
      "Positions and sizes are in world units. For the painted polygons themselves, read again with geometry: true — needed only to echo a region back or to measure one exactly.",
  };
}
