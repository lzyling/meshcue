// Native OpenClaw entry. No host-private imports or process work during discovery.
import fs from "node:fs";
import path from "node:path";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import {
  InstanceManager,
  pauseRegistered,
  resumeRegistered,
  inspectInstall,
} from "../../integration/manager.mjs";
import { precheckModel, stepMeshFor } from "../../integration/precheck.mjs";
import {
  toolSchema,
  validateToolInput,
  TOOL_DESCRIPTION,
} from "../../integration/contract.mjs";

export const parameters = toolSchema("openclaw");
const description = TOOL_DESCRIPTION;

const managers = new Map();
const plugin = defineToolPlugin({
  id: "meshcue",
  name: "MeshCue",
  description:
    "3D model review, annotation and model iteration in the originating conversation",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      clientAddress: {
        type: "string",
        description:
          "Optional previously user-confirmed LAN browser device address, not a global browser credential.",
      },
      listenHost: {
        type: "string",
        description:
          "Optional verified local listener address; defaults to automatic private LAN selection.",
      },
    },
  },
  tools: (tool) => [
    tool({
      name: "meshcue",
      description,
      parameters,
      optional: false,
      factory({ api, config, toolContext: ctx }) {
        return {
          name: "meshcue",
          label: "MeshCue",
          description,
          parameters,
          async execute(_callId, params) {
            try {
              validateToolInput(params, "openclaw");
              let result;
              if (params.action === "inspect")
                result = inspectInstall(ctx, api.rootDir);
              // Sizing a file needs the workspace root and nothing else. Going
              // through InstanceManager would start or adopt a project instance
              // just to read a header, which is exactly what a caller wants to
              // avoid before it knows the model can be reviewed at all.
              else if (params.action === "precheck")
                result = precheckModel(ctx, params.file, {
                  derived: await stepMeshFor(ctx, params.file),
                });
              else {
                const manager = new InstanceManager(ctx, {
                  installRoot: api.rootDir,
                  clientAddress: config.clientAddress,
                  listenHost: config.listenHost,
                  // What the page calls an agent here that gave no name.
                  toolName: "OpenClaw",
                });
                try {
                  // The installed-versus-running comparison now travels with
                  // the manager, so every harness gets it rather than the one
                  // that noticed it first.
                  result = await manager.execute(params);
                } finally {
                  for (const runtime of manager.usedProjects.keys())
                    managers.set(runtime, manager);
                }
              }
              return {
                content: [{ type: "text", text: JSON.stringify(result) }],
                details: result,
              };
            } catch (error) {
              // The structured result reaches the model; the host log is the
              // only place the stack survives for an operator.
              api.logger?.warn?.(
                `MeshCue ${params.action || "?"} failed: ${error.code || "UNAVAILABLE"} ${error.message}`,
              );
              const result = {
                ok: false,
                code: error.code || "UNAVAILABLE",
                error: error.message,
                ...(error.precheck
                  ? { precheck: error.precheck, remediation: error.remediation }
                  : {}),
              };
              return {
                content: [{ type: "text", text: JSON.stringify(result) }],
                details: result,
                isError: true,
              };
            }
          },
        };
      },
    }),
  ],
});
// Every agent may point at its own workspace, and each workspace keeps its own
// project registry, so both halves of the pause lifecycle have to walk all of
// them rather than assume the default one.
function configuredWorkspaces(api) {
  return new Set(
    [
      api.config.agents?.defaults?.workspace,
      ...Object.values(api.config.agents?.entries || {}).map(
        (agent) => agent.workspace,
      ),
    ].filter(Boolean),
  );
}
function sweepRegistrations(api, verb, sweep) {
  let unavailable = 0;
  for (const workspace of configuredWorkspaces(api)) {
    try {
      unavailable += sweep(workspace, api.rootDir).length;
    } catch (error) {
      api.logger?.warn?.(
        `MeshCue ${verb}: registry unreadable for ${workspace}: ${error.message}`,
      );
      unavailable++;
    }
  }
  if (unavailable)
    api.logger?.warn(
      `MeshCue ${verb}: ${unavailable} unavailable registrations; other instances were processed.`,
    );
}
// Preserve the SDK's static metadata while adding the supported cleanup hook.
const registerTools = plugin.register;
plugin.register = (api) => {
  registerTools(api);
  // Registering is itself the proof that this extension is enabled, so any
  // pause marker a previous process left behind is stale. Clearing it here is
  // what keeps a Gateway restart from stranding a live review behind a 503 that
  // only an Agent action could lift: the host cannot tell MeshCue that a
  // shutdown was a restart, but MeshCue can tell that it came back.
  sweepRegistrations(api, "resume", resumeRegistered);
  api.lifecycle.registerRuntimeLifecycle({
    id: "meshcue-instances",
    description:
      "Pause managed review writes when the extension is disabled; keep drafts and outbox.",
    cleanup({ reason }) {
      // "restart" means the plugin is still in the next registry, so the
      // instances stay reachable and pausing them would only cost a reload.
      if (reason !== "disable") return;
      let unavailable = 0;
      for (const manager of new Set(managers.values()))
        unavailable += manager.pauseOwned().length;
      if (unavailable)
        api.logger?.warn(
          `MeshCue disable: ${unavailable} managed instances could not be paused.`,
        );
      sweepRegistrations(api, "disable", pauseRegistered);
      // Gateway restart is deliberately not a model-service restart. Reset is
      // handled by each batch's generation CAS, not by deleting browser data.
    },
  });
};
export default plugin;
