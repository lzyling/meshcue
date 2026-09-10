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
  if (!stat.isFile()) fail("MODEL_LIMIT", "模型路徑不是檔案。");
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
      reason: `檔案 ${(stat.size / 1048576).toFixed(1)} MB 超過 ${MAX_BYTES / 1048576} MB 上限；檔案太大未解析面數。請先簡化或重新匯出，再跑一次 precheck 取得面數。`,
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
      reason: `${triangles} 三角面在上限內，可以發布，但已超過 ${DEGRADE_TRIANGLES}：審閱網格的細分餘量不足每面一個三角形，大平面會停止細分，畫筆在那些面上會整片跳動。建議簡化後再發布。`,
      simplify: {
        targetTriangles: DEGRADE_TRIANGLES,
        requiredRatio: null,
        recommendedRatio: ratio(DEGRADE_TRIANGLES, triangles),
      },
    };
  return {
    ...result,
    verdict: "ok",
    reason: `${triangles} 三角面、${(stat.size / 1048576).toFixed(2)} MB，在上限內且細分餘量充足，可直接發布。`,
    simplify: null,
  };
}
