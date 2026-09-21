/* One tessellation, in a process that then stops existing.

   Everything about why this is a process rather than a function call or a
   thread is in `convertStepDetached`, which starts it. What matters here is the
   contract: the model arrives on stdin and the answer leaves on file
   descriptor 3, as a 4-byte little-endian length, that many bytes of JSON,
   then the mesh. Not stdout, because the CAD library prints there. */
import fs from "node:fs";
import { convertStep } from "./step.mjs";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const { glb, ...metadata } = await convertStep(Buffer.concat(chunks), {
  generator: process.argv[2],
});
const head = Buffer.from(JSON.stringify(metadata), "utf8");
const length = Buffer.alloc(4);
length.writeUInt32LE(head.length, 0);
fs.createWriteStream(null, { fd: 3 }).end(
  Buffer.concat([length, head, glb ?? Buffer.alloc(0)]),
);
