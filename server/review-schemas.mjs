import { z } from "zod";
import { ID_PATTERN } from "./input-limits.mjs";
import { MAX_TRIANGLES } from "./models.mjs";
import { MAX_NOTE, MAX_REGION_LABEL } from "./budget.mjs";

const id = z.string().regex(new RegExp(ID_PATTERN));
const vec3 = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
/* What the reviewer wrote on a mark and where they were looking from, both
   added in 1.4.0 and both optional, so a batch saved before then is still one
   this service reads. Neither is authorised by anything: the note is the
   reviewer's description of the mark, carried as data and never acted on here,
   and the view is a camera in the model's own frame and units — the same frame
   a region's `bounds` are in — with the direction the top of the screen was
   pointing, which the preview's always-upright camera cannot say. */
const note = z.string().max(MAX_NOTE).optional();
const markView = z
  .object({
    space: z.literal("model"),
    position: vec3,
    target: vec3,
    up: vec3,
    fov: z.number().finite().positive().max(180),
    aspect: z.number().finite().positive(),
    projection: z.literal("orthographic").optional(),
    visibleHeight: z.number().finite().positive().optional(),
    explode: z
      .object({
        amount: z.number().finite().min(0).max(1),
        by: z.enum(["group", "part"]),
      })
      .strict()
      .optional(),
  })
  .strict()
  .optional();
/* A measurement the reviewer kept, added in 1.4.0: what was measured -- two
   points, a straight edge, or two faces -- the two ends of the line it was
   read along, the triangle each end was taken on, and the number: a length in
   the model's own units, or for two faces that are not parallel the angle
   between them in degrees. A circle is three points on a rim, with the centre
   and the normal of the circle through them, and its diameter. Worked out by
   the page, the one place with the geometry, in the model's frame, as
   `bounds` and `view` are; the checks in `validateAnnotations` hold it to
   itself, so the number is the one its points and normals say. */
const measurePick = z
  .object({ meshId: id, sourceFaceIndex: z.number().int().min(0) })
  .strict();
const annotation = z.discriminatedUnion("type", [
  z
    .object({
      id,
      type: z.literal("edge"),
      show: z.enum(["color", "label"]).optional(),
      label: z.string().max(12),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      note,
      view: markView,
      meshId: id,
      space: z.literal("model"),
      points: z.array(vec3).min(2).max(512),
      closed: z.literal(true).optional(),
      length: z.number().finite().min(0),
      curved: z.boolean(),
      sourceFaceIndex: z.number().int().min(0),
      brep: z
        .object({
          face: z.tuple([z.number().int().min(-1), z.number().int().min(-1)]),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal("part"),
      show: z.enum(["color", "label"]).optional(),
      label: z.string().max(12),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      note,
      view: markView,
      partIds: z
        .array(z.string().regex(/^part-\d+(?:\.\d+)*$/))
        .min(1)
        .max(256),
      names: z.array(z.string().min(1).max(256)).min(1).max(256),
      meshIds: z.array(id).min(1).max(4096),
      group: z
        .object({ id, name: z.string().min(1).max(96) })
        .strict()
        .optional(),
      bounds: z
        .object({
          space: z.literal("model"),
          centroid: vec3,
          min: vec3,
          max: vec3,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal("measure"),
      // Numbered on its own, M1, M2, beside the pins' letters.
      label: z.string().regex(/^M[1-9][0-9]{0,3}$/),
      kind: z.enum(["points", "edge", "planes", "circle"]),
      quantity: z.enum(["length", "angle", "diameter"]),
      value: z.number().finite().min(0),
      space: z.literal("model"),
      points: z.array(vec3).min(2).max(3),
      picks: z.array(measurePick).min(1).max(3),
      normals: z.tuple([vec3, vec3]).optional(),
      center: vec3.optional(),
      normal: vec3.optional(),
      note,
      view: markView,
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal("pin"),
      show: z.enum(["color", "label"]).optional(),
      label: z.string().max(12),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      meshId: id,
      faceIndex: z.number().int().min(0),
      sourceFaceIndex: z.number().int().min(0).optional(),
      position: vec3,
      normal: vec3,
      barycentric: vec3,
      note,
      view: markView,
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal("region"),
      coverage: z.enum(["brush-v1", "source-v1", "source-v2"]).optional(),
      label: z.string().max(MAX_REGION_LABEL),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      note,
      view: markView,
      /* Where the mark is and how much surface it covers, in the model's own
         units, worked out by the browser because nothing else can: this service
         keeps a triangle count and a transform per mesh, not triangles, and a
         `source-v2` mark whose faces were all taken whole carries no
         coordinate of its own. It is descriptive — nothing is authorised by it
         and no geometry is derived from it — which is why a hundred bytes of
         it is worth carrying for a mark of any size.

         `space` is optional because batches saved before 1.3.0-dev are in the
         preview's scaled coordinates and have to stay readable as what they
         are; it is never added to them after the fact. */
      bounds: z
        .object({
          space: z.literal("model").optional(),
          centroid: vec3,
          min: vec3,
          max: vec3,
          area: z.number(),
        })
        .strict()
        .optional(),
      faces: z.record(id, z.array(z.number().int().min(0)).max(MAX_TRIANGLES)),
      surfacePatches: z
        .array(
          z
            .object({
              meshId: id,
              faceIndex: z.number().int().min(0),
              sourceFaceIndex: z.number().int().min(0),
              /* A clipped polygon, not a triangle: the brush outline is a
                 64-gon, so a triangle cut by it can carry up to 67 corners,
                 and an occluder subtracted from that a few more.

                 Since `source-v2` a polygon may also be the union of every
                 stamp that crossed one face, whose boundary is as long as the
                 stroke was — measured at 530 corners for a quarter of one
                 coarse face. The ceiling that matters is the round's total,
                 counted below; this one only has to sit past anything a single
                 boundary reaches. `MAX_POLYGON_VERTICES` in
                 `src/polygon-union.js` holds the client to the same number. */
              vertices: z.array(vec3).min(3).max(4096),
            })
            .strict(),
        )
        .max(MAX_TRIANGLES)
        .optional(),
    })
    .strict(),
]);
const owner = z.object({ versionId: id, clientId: id });
const camera = z
  .object({
    position: vec3,
    target: vec3,
    projection: z.literal("orthographic").optional(),
    visibleHeight: z.number().finite().positive().optional(),
  })
  .nullable();
const draftSchema = owner.extend({
  revision: z.number().int().min(0),
  labelCursor: z.number().int().min(0).max(1000000).optional(),
  annotations: z.array(annotation).max(200),
  camera,
});

export { id, annotation, owner, draftSchema };
