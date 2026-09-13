import fs from "node:fs";
import path from "node:path";
import {
  inspectModel,
  MAX_BYTES,
  MAX_TRIANGLES,
  MAX_TEXTURE_PIXELS,
  DEGRADE_TRIANGLES,
} from "../server/models.mjs";
import { workspaceContext, scopedPath, fail } from "./context.mjs";

// Publishing already rejects an oversized model, but only after the caller has
// picked a name, a version and a project — and the caller learns nothing about
// the band below the cap where publishing succeeds and the brush quietly loses
// precision. This answers both questions from the file alone, with no instance
// running and nothing written, so a caller can size a model before it commits
// to a review round.
//
// The measurement itself is inspectModel, the same function the publish path
// uses. Nothing here counts triangles independently: a second counter that
// disagreed with the server would be worse than no precheck at all.
const ratio = (target, actual) =>
  Math.max(0.01, Math.floor((target / actual) * 100) / 100);

export function precheckModel(ctx, file) {
  const { workspace, allowed } = workspaceContext(ctx);
  const actual = scopedPath(allowed, file);
  const stat = fs.statSync(actual);
  if (!stat.isFile()) fail("MODEL_LIMIT", "The model path is not a file.");
  const format = path.extname(actual).slice(1).toLowerCase();
  const limits = {
    maxTriangles: MAX_TRIANGLES,
    degradeAboveTriangles: DEGRADE_TRIANGLES,
    maxBytes: MAX_BYTES,
    maxTexturePixels: MAX_TEXTURE_PIXELS,
  };
  const base = {
    ok: true,
    file: path.relative(workspace, actual),
    format,
    bytes: stat.size,
    limits,
  };
  if (stat.size > MAX_BYTES)
    return {
      ...base,
      triangles: null,
      verdict: "reject",
      reason: `${(stat.size / 1048576).toFixed(1)} MB exceeds the ${MAX_BYTES / 1048576} MB limit; too large to count faces. Simplify or re-export, then run precheck again for a face count.`,
      simplify: { targetTriangles: DEGRADE_TRIANGLES, requiredRatio: null },
    };
  let metadata;
  try {
    metadata = inspectModel(fs.readFileSync(actual), format);
  } catch (error) {
    // A malformed or unsupported file is not a sizing answer; let it surface as
    // itself. Only the two size limits become a verdict.
    if (error.code !== "MODEL_LIMIT" && error.code !== "TEXTURE_LIMIT")
      throw error;
    const over = error.measured?.triangles || null;
    return {
      ...base,
      triangles: over,
      verdict: "reject",
      reason: error.message,
      // Both ratios come from the measured count, so a caller decimates once:
      // requiredRatio is what publishing will accept, recommendedRatio is what
      // keeps the brush precise. Prefer the second unless the user has said the
      // extra detail matters more than annotation accuracy.
      simplify: over
        ? {
            targetTriangles: DEGRADE_TRIANGLES,
            requiredRatio: ratio(MAX_TRIANGLES, over),
            recommendedRatio: ratio(DEGRADE_TRIANGLES, over),
          }
        : error.code === "MODEL_LIMIT"
          ? { targetTriangles: DEGRADE_TRIANGLES, requiredRatio: null }
          : null,
    };
  }
  const { triangles, texturePixels = 0 } = metadata;
  const result = { ...base, triangles, texturePixels };
  if (triangles > DEGRADE_TRIANGLES)
    return {
      ...result,
      verdict: "degraded",
      // Publishing this succeeds. Say what the user will actually experience,
      // because nothing downstream will say it for them.
      reason: `${triangles} triangles is within the limit and publishable, but past ${DEGRADE_TRIANGLES} the review mesh has under one triangle of subdivision left per face: large flat spans stop subdividing and the brush skips across them. Simplify before publishing.`,
      simplify: {
        targetTriangles: DEGRADE_TRIANGLES,
        requiredRatio: null,
        recommendedRatio: ratio(DEGRADE_TRIANGLES, triangles),
      },
    };
  return {
    ...result,
    verdict: "ok",
    reason: `${triangles} triangles, ${(stat.size / 1048576).toFixed(2)} MB: within the limits with subdivision budget to spare. Publish as is.`,
    simplify: null,
  };
}
