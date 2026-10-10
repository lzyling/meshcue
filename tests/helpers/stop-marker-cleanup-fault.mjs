// Only launched fixture servers import this module. Preserve a real idle
// marker through a new launch without mocking startup or the manager logic.
import fs from "node:fs";
import path from "node:path";
const unlink = fs.unlinkSync;
fs.unlinkSync = function (file, ...args) {
  if (file === path.join(process.env.REVIEW_DATA_DIR, "stopped.json")) {
    const error = new Error("fixture stop marker cleanup denied");
    error.code = "EACCES";
    throw error;
  }
  return unlink.call(this, file, ...args);
};
