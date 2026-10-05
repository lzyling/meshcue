import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { InstanceManager } from "../../integration/manager.mjs";
import { stopManagedReview } from "../helpers/managed-server.mjs";

const workspace = process.env.MESHCUE_CLEANUP_FIXTURE;
const mode = process.env.MESHCUE_CLEANUP_MODE;
test("controlled server teardown fixture", async (t) => {
  fs.mkdirSync(path.join(workspace, "web"));
  fs.writeFileSync(path.join(workspace, "web/index.html"), "<!doctype html>");
  fs.writeFileSync(path.join(workspace, "package.json"), '{"name":"meshcue"}');
  fs.copyFileSync(
    "tmp/samples/parametric-bracket.glb",
    path.join(workspace, "part.glb"),
  );
  const manager = new InstanceManager(
    {
      workspaceDir: workspace,
      agentId: "fixture",
      sessionKey: "fixture",
      sessionId: "one",
      messageChannel: "webchat",
    },
    {
      installRoot: workspace,
      serverEntry: path.resolve("server/index.mjs"),
      distRoot: path.join(workspace, "web"),
      listenHost: "127.0.0.1",
      environment: { REVIEW_BRIDGE: "off", REVIEW_UPDATE_CHECK: "off" },
    },
  );
  const project = "projects/fixture";
  if (mode !== "leak")
    t.after(async () => {
      try {
        await stopManagedReview(manager, project);
      } catch (error) {
        console.error(error.message);
        throw error;
      }
    });
  await manager.execute({ action: "open", project, file: "part.glb" });
  if (mode === "stop-error")
    t.mock.method(manager, "execute", async () => {
      throw new Error("deliberate stop failure");
    });
  if (mode !== "leak")
    throw new Error("deliberate assertion failure after startup");
});
