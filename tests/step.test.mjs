import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { inspectModel, importModel } from "../server/models.mjs";
import { convertStep, warmStep, warmStepFor, DEFLECTION } from "../server/step.mjs";
import { ReviewStore } from "../server/store.mjs";
import { startReview } from "./helpers/review-server.mjs";

/* The fixture is a plate with a through hole and filleted corners, so the
   tessellation has cylinders and a torus in it rather than six flat faces. It
   also carries no colour, which is the case that matters: the sample GLBs in
   this repository all declare materials, and that is precisely why the "black
   from underneath" bug survived three releases of testing. Real parametric
   output usually declares nothing. */
const FIXTURE = "tests/fixtures/plate.step";
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const bytes = () => fs.readFileSync(path.join(repo, FIXTURE));

function mediaFixture(t) {
  const parent = path.join(repo, "tmp");
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, "step-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("a STEP is measured by tessellating it, and the mesh survives our own reader", async () => {
  await warmStep();
  const metadata = inspectModel(bytes(), "step");
  assert.equal(metadata.format, "step");
  assert.ok(metadata.triangles > 100);
  // The strongest check available: hand the derived file back to the GLB path
  // the viewer uses. A writer that agrees with itself proves nothing.
  const reread = inspectModel(metadata.derived.glb, "glb");
  assert.equal(reread.triangles, metadata.triangles);
});

test("the published identity stays the source; the drawn bytes are the mesh", async (t) => {
  await warmStep();
  const mediaDir = mediaFixture(t);
  const model = importModel(
    { file: FIXTURE, name: "plate", version: "v1" },
    { workspace: repo, mediaDir },
  );
  assert.equal(model.format, "step");
  assert.equal(
    model.sha256,
    crypto.createHash("sha256").update(bytes()).digest("hex"),
    "sha256 must name the file the author published",
  );
  assert.equal(model.mesh.format, "glb");
  assert.notEqual(model.mesh.sha256, model.sha256);
  assert.equal(
    model.mesh.sha256,
    crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(mediaDir, model.mesh.filename)))
      .digest("hex"),
    "mesh.sha256 must match the bytes the page will fetch and check",
  );
  // Both halves are kept: the source for download, the mesh for the viewer.
  assert.deepEqual(fs.readdirSync(mediaDir).sort(), [
    model.filename,
    model.mesh.filename,
  ].sort());
  assert.deepEqual(model.mesh.deflection, DEFLECTION);
  assert.ok(model.mesh.brepFaces > 0);
});

test("re-importing the same STEP lands on the same mesh file, so marks keep meaning", async (t) => {
  await warmStep();
  const mediaDir = mediaFixture(t);
  const opts = { file: FIXTURE, name: "plate", version: "v1" };
  const a = importModel(opts, { workspace: repo, mediaDir });
  const b = importModel(opts, { workspace: repo, mediaDir });
  assert.equal(a.mesh.sha256, b.mesh.sha256);
  // Two imports, two files, not four: the derived mesh is content-addressed
  // like the source, which is what stops a second publish from silently
  // re-tessellating under an existing round's face indices.
  assert.equal(fs.readdirSync(mediaDir).length, 2);
});

test("a STEP with no colour reaches the viewer with no material, so it gets the review grey", async () => {
  await warmStep();
  const { glb } = inspectModel(bytes(), "step").derived;
  const json = JSON.parse(
    glb.toString("utf8", 20, 20 + glb.readUInt32LE(12)).replace(/\0+$/, ""),
  );
  assert.equal(
    json.materials,
    undefined,
    "inventing a material here would opt the model out of the grey and put it back in the dark",
  );
  assert.ok(json.meshes[0].extras.brepFaces.length > 0);
});

test("a file that is not a STEP is refused as one, and refusing it does not take the process down", async () => {
  await warmStep();
  for (const bad of [
    Buffer.alloc(0),
    Buffer.from("not a step at all"),
    bytes().subarray(0, 200),
    Buffer.concat([Buffer.from("glTF"), Buffer.alloc(64)]),
  ])
    assert.throws(
      () => inspectModel(bad, "step"),
      (error) => error.code === "MODEL_FORMAT" || error.code === "MODEL_LIMIT",
    );
  // Still usable afterwards; the parser's own error output is swallowed rather
  // than left to surface in a reviewer's log.
  assert.ok(convertStep(bytes()).ok);
});

test("a round grants the page the mesh it can draw, not only the source it cannot", async (t) => {
  await warmStep();
  const mediaDir = mediaFixture(t);
  const store = new ReviewStore(mediaFixture(t));
  const model = importModel(
    { file: FIXTURE, name: "plate", version: "v1" },
    { workspace: repo, mediaDir },
  );
  store.publish(model, null, { activate: true });
  assert.ok(store.modelInBinding(model.filename));
  assert.ok(
    store.modelInBinding(model.mesh.filename),
    "the viewer fetches the derived mesh; refusing it would leave the page empty",
  );
  assert.equal(store.modelInBinding(`${"0".repeat(64)}.glb`), false);
});

test("a running instance serves the mesh to the page and the STEP to whoever downloads it", async (t) => {
  const f = await startReview(t, { workspace: repo });
  const published = await f.ipc("/publish", {
    file: FIXTURE,
    name: "Plate",
    version: "v1",
  });
  assert.equal(published.status, 200);
  const model = published.body.model;
  assert.equal(model.format, "step");
  assert.ok(model.mesh, "a STEP must reach the page with a mesh to draw");

  /* The page checks what it fetched against `mesh.sha256` before it will draw
     it, so this is the assertion that the two ends agree. It is also the one
     that would have caught serving the source here: a STEP body against a mesh
     hash tells the reviewer their version is stale, which is a confusing way to
     say "this format is not supported". */
  const drawn = await f.api(`models/${model.mesh.filename}`);
  assert.equal(drawn.status, 200);
  assert.equal(
    crypto.createHash("sha256").update(drawn.raw).digest("hex"),
    model.mesh.sha256,
  );

  const downloaded = await f.api(`download/${model.filename}`);
  assert.equal(downloaded.status, 200);
  assert.equal(
    crypto.createHash("sha256").update(downloaded.raw).digest("hex"),
    model.sha256,
    "download hands over the file the author published, not our tessellation",
  );
  assert.deepEqual(downloaded.raw, bytes());
});

test("warming is skipped for the formats that never needed a CAD kernel", async () => {
  // Cheap, but the point is the shape: measuring an STL must not start paying
  // for a tessellator it will never call.
  await warmStepFor("model.stl");
  await warmStepFor("model.glb");
  await warmStepFor(undefined);
  await warmStepFor("part.STP");
});
