import fs from "node:fs";
import path from "node:path";
import {
  inspectModel,
  MAX_BYTES,
  MAX_TRIANGLES,
  MAX_TEXTURE_PIXELS,
} from "../server/models.mjs";
import { workspaceContext, scopedPath, fail } from "./context.mjs";

// Publishing already rejects an oversized model, but only after the caller has
// picked a name, a version and a project, and it answers with a message rather
// than a number to decimate by. This sizes a model from the file alone, with no
// instance running and nothing written, before the caller commits to a round.
//
// It used to carry a second verdict for the band under the cap where the review
// mesh runs out of subdivision budget. That band belonged to the brush; with
// every tool marking whole source faces it costs a reviewer nothing, so the
// verdict said "simplify" about a model that needed no simplifying. Removed in
// 1.0.0 — the hard limits are the only limits left.
//
// The measurement itself is inspectModel, the same function the publish path
// uses. Nothing here counts triangles independently: a second counter that
// disagreed with the server would be worse than no precheck at all.
const ratio = (target, actual) =>
  Math.max(0.01, Math.floor((target / actual) * 100) / 100);

/* Stays synchronous, and every refusal in it stays a synchronous throw. Sizing
   a STEP does need the tessellator loaded, but waiting for that here would turn
   `PATH_SCOPE` and `MODEL_FORMAT` into rejected promises for every caller,
   including the ones measuring an STL. The two entry points that can be handed
   a file — the CLI and the MCP server — warm it first instead. */
export function precheckModel(ctx, file) {
  const { workspace, allowed } = workspaceContext(ctx);
  const actual = scopedPath(allowed, file);
  const stat = fs.statSync(actual);
  if (!stat.isFile()) fail("MODEL_LIMIT", "The model path is not a file.");
  const format = path.extname(actual).slice(1).toLowerCase();
  const limits = {
    maxTriangles: MAX_TRIANGLES,
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
      simplify: { targetTriangles: MAX_TRIANGLES, requiredRatio: null },
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
      // The ratio comes from the measured count, so a caller decimates once and
      // publishes, instead of guessing and republishing until one happens to fit.
      simplify: over
        ? {
            targetTriangles: MAX_TRIANGLES,
            requiredRatio: ratio(MAX_TRIANGLES, over),
          }
        : error.code === "MODEL_LIMIT"
          ? { targetTriangles: MAX_TRIANGLES, requiredRatio: null }
          : null,
    };
  }
  const { triangles, texturePixels = 0 } = metadata;
  const result = { ...base, triangles, texturePixels };
  return {
    ...result,
    verdict: "ok",
    reason: `${triangles} triangles, ${(stat.size / 1048576).toFixed(2)} MB: within both limits. Publish as is.`,
    simplify: null,
  };
}
