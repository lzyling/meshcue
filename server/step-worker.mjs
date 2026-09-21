/* One tessellation, then gone.

   Two measured reasons this is a thread and not a function call. The review
   server is long-lived and single-threaded: the heaviest real assembly in this
   workspace takes 8.1 seconds to tessellate, and for those 8.1 seconds a call
   on the main thread would stop answering the page the reviewer is holding
   open. And the OCCT heap never comes back — 485 conversions in one process
   took it from 61 MB to 943 MB, with a forced GC reclaiming none of it, because
   an emscripten heap grows and does not shrink.

   Letting the thread exit after its one job answers both. The page keeps being
   served while the work happens somewhere else, and the memory is gone when the
   thread is.

   It is not free: starting one measured between 0.1 and 0.8 s, bimodally and
   independently of whether it was the bundled copy or the source — it is the
   WASM compile being cached or not, not the size of this file. Either way it is
   more than the 130 ms median conversion it is protecting.

   That is the actual trade, and it is taken because the cost lands on a
   publish — once per version, already being awaited by the agent — while what
   it buys lands on the reviewer, who is holding a page open and did not ask to
   wait 8 seconds for someone else's assembly. */
import { parentPort, workerData } from "node:worker_threads";
import { convertStep, warmStep } from "./step.mjs";

await warmStep();
const result = convertStep(Buffer.from(workerData.buffer), {
  generator: workerData.generator,
});
// The mesh is transferred rather than copied; it is the only large thing here
// and the worker is about to stop existing anyway.
const glb = result.ok
  ? result.glb.buffer.slice(
      result.glb.byteOffset,
      result.glb.byteOffset + result.glb.byteLength,
    )
  : null;
parentPort.postMessage({ ...result, glb }, glb ? [glb] : []);
