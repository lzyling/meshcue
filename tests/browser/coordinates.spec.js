import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import fs from "node:fs";
import path from "node:path";

let env;
test.afterEach(async () => env?.stop());
test("nested GLB real ready manifest supplies batch-owned file pin coordinates", async ({
  page,
}) => {
  env = await startScenario({
    fixture: path.resolve("tests/fixtures/coordinates/nested-s1.glb"),
    dist: process.env.REVIEW_TEST_DIST,
  });
  const readyRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/ready") && request.method() === "POST",
  );
  await page.goto(env.url);
  const readyBody = (await readyRequest).postDataJSON();
  await expect(page.locator("#loading")).toBeHidden();
  const state = await env.ipc("/status");
  const model = state.active;
  const manifestFile = path.join(env.data, "manifests", `${model.id}.json`);
  await expect.poll(() => fs.existsSync(manifestFile)).toBe(true);
  const manifest = JSON.parse(fs.readFileSync(manifestFile));
  expect(manifest.sha256).toBe(model.sha256);
  expect(manifest.meshes[0].fromSpace).toBe("mesh");
  expect(manifest.meshes[0].toSpace).toBe("preview");
  const m = manifest.meshes[0].fileMatrixWorld;
  expect(m).toHaveLength(16);
  const expected = [8, 26, 39];
  const actual = [m[0] + m[12], m[1] + m[13], m[2] + m[14]];
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 5));
  const owner = { versionId: model.id, clientId: readyBody.clientId };
  const api = async (route, method, body) => {
    const r = await fetch(`${env.url}/api/${route}`, {
      method,
      headers: { "Content-Type": "application/json", "X-Review-Client": "1" },
      body: JSON.stringify(body),
    });
    expect(r.status, await r.clone().text()).toBe(200);
    return r.json();
  };
  await api("review/begin", "POST", owner);
  const draft = await api("draft", "PUT", {
    ...owner,
    revision: 0,
    annotations: [
      {
        id: "browser-pin",
        type: "pin",
        label: "A",
        color: "#e76d5c",
        meshId: manifest.meshes[0].id,
        faceIndex: 0,
        sourceFaceIndex: 0,
        position: [1, 0, 0],
        normal: [0, 0, 1],
        barycentric: [1, 0, 0],
      },
    ],
    camera: null,
  });
  await api("feedback", "POST", {
    ...owner,
    revision: draft.revision,
    submissionId: "browser-coordinate-batch",
  });
  const result = await env.ipc("/read", {
    submissionId: "browser-coordinate-batch",
    versionId: model.id,
  });
  result.annotations[0].filePosition.forEach((v, i) =>
    expect(v).toBeCloseTo(expected[i], 5),
  );
  result.annotations[0].fileNormal.forEach((v, i) =>
    expect(v).toBeCloseTo([0, 1, 0][i], 5),
  );
  expect(result.annotations[0].position).toEqual([1, 0, 0]);
});
