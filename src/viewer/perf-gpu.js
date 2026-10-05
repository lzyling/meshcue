// At most one outstanding query. Query results are polled only while the
// display is on, never waited on synchronously, and disjoint samples are lost
// rather than presented as plausible timings from a reset GPU clock.
export function gpuTimer(gl) {
  const extension = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  let pending = null,
    running = false,
    milliseconds = null;
  return {
    available: !!extension,
    begin() {
      if (!extension || gl.isContextLost()) return;
      if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
        if (pending) gl.deleteQuery(pending);
        pending = null;
        milliseconds = null;
        return;
      }
      if (pending && gl.getQueryParameter(pending, gl.QUERY_RESULT_AVAILABLE)) {
        milliseconds = gl.getQueryParameter(pending, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(pending);
        pending = null;
      }
      if (!pending) {
        pending = gl.createQuery();
        gl.beginQuery(extension.TIME_ELAPSED_EXT, pending);
        running = true;
      }
    },
    end() {
      if (running) {
        gl.endQuery(extension.TIME_ELAPSED_EXT);
        running = false;
      }
    },
    get milliseconds() {
      return milliseconds;
    },
    dispose() {
      this.end();
      if (pending) gl.deleteQuery(pending);
      pending = null;
    },
  };
}
