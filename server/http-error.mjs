import { z } from "zod";
import { log, errorDetail } from "./log.mjs";

export function errorHandler(err, req, res, next) {
  const schemaError = err instanceof z.ZodError;
  const status = schemaError ? 400 : err.status || 500;
  // A 4xx reaches the client as one transient line in the page and is then
  // gone. Nothing else records it, so a reviewer reporting "the button does
  // nothing" left no trace at all to work from. Every rejection is logged.
  if (status >= 500)
    log.error("http", "request failed", {
      method: req.method,
      path: req.path,
      ...errorDetail(err),
    });
  else if (schemaError)
    log.warn("http", "request rejected by schema", {
      method: req.method,
      path: req.path,
      issues: err.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
        message: i.message,
      })),
    });
  else
    log.warn("http", "request refused", {
      method: req.method,
      path: req.path,
      status,
      code: err.code || "ERROR",
      message: err.message,
    });
  // Publication captions are supplied by agents, so name the rejected field
  // and its existing bound without exposing arbitrary schema input values.
  const labelLimit =
    schemaError && req.path === "/publish"
      ? err.issues.find(
          (issue) =>
            issue.path.length === 1 &&
            issue.path[0] === "label" &&
            issue.code === "too_big",
        )
      : null;
  res.status(status).json({
    error: labelLimit
      ? `Publication label must be at most ${labelLimit.maximum} characters.`
      : schemaError
        ? "The input is not in the expected shape."
        : status >= 500
          ? "The service could not complete the request for now; the draft is kept."
          : err.message,
    code: err.code || "ERROR",
    ...(err.precheck
      ? { precheck: err.precheck, remediation: err.remediation }
      : {}),
  });
}
