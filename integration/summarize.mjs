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
          /* Carried verbatim, `space` included. A batch saved before 1.3.0-dev
             has none, and that absence is the only thing that says its numbers
             are the preview's rather than the model's — inventing one here
             would make an old stroke claim a size it never measured. */
          ...(a.bounds.space ? { space: a.bounds.space } : {}),
          centroid: a.bounds.centroid,
          min: a.bounds.min,
          max: a.bounds.max,
          area: a.bounds.area,
        }
      : {}),
  };
}

/* The manifest is the one part of a batch that grows with the *model* rather
   than with the marking, and a STEP assembly is the first thing that routinely
   arrives with a hundred and twenty-eight parts. Measured on a real four-mark
   batch against a 128-part assembly: 72,346 bytes, of which 65,500 were the
   manifest — sent twice, since `read` answers with the batch and the receipt.
   The marks themselves were 1,720.

   Reading marks needs the parts the marks are on. The rest is a parts list,
   and an agent that wants one can ask for the batch untouched. The count of
   what was left out stays, because "five meshes" must not be mistakable for a
   five-part model. */
function manifestFor(batch, annotations) {
  const manifest = batch.meshManifest;
  if (!manifest?.meshes) return manifest;
  const used = new Set();
  for (const a of annotations) {
    if (a.meshId) used.add(a.meshId);
    for (const meshId of Object.keys(a.faces || {})) used.add(meshId);
    for (const patch of a.surfacePatches || []) used.add(patch.meshId);
  }
  const meshes = manifest.meshes.filter((m) => used.has(m.id));
  return {
    ...manifest,
    meshes,
    omittedMeshes: manifest.meshes.length - meshes.length,
  };
}

/* The acknowledgement, not a second copy of the batch. The service answers a
   read with the whole stored record less its annotations, and everything in it
   except the delivery state is already in the summary sent beside it —
   including the mesh manifest, which on a large assembly is most of the answer.
   What survives is the only thing the read call is the authority on: whether
   the batch reached the conversation, and that it has now been read. */
export function readReceipt(receipt) {
  if (!receipt) return receipt;
  return {
    id: receipt.id,
    versionId: receipt.versionId,
    revision: receipt.revision,
    status: receipt.status,
    sealed: receipt.sealed,
    attempts: receipt.attempts,
    deliveredAt: receipt.deliveredAt,
    readAt: receipt.readAt,
    ...(receipt.lastError ? { lastError: receipt.lastError } : {}),
    ...(receipt.stalledAt ? { stalledAt: receipt.stalledAt } : {}),
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
    meshManifest: manifestFor(batch, batch.annotations),
    // Stated, not implied. An agent that needs the extent has to know it was
    // given a description of one, and has to know what to ask for instead.
    geometry: "omitted",
    geometryHint:
      "Positions and sizes are in the model's own units, the same ones its file is dimensioned in; a region whose bounds carry no space: \"model\" was saved before 1.3.0 and is in the preview's scaled coordinates instead. meshManifest lists only the meshes these marks are on; omittedMeshes counts the rest. For the painted polygons themselves, or the whole parts list, read again with geometry: true — needed only to echo a region back or to measure one exactly.",
  };
}
