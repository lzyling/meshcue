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
import { toolSchema, validateToolInput } from "../../integration/contract.mjs";

export const parameters = toolSchema("openclaw");
const description =
  "Open or continue browser-based 3D model review in the current conversation; publish GLB, glTF, STL or STEP drafts (confirm the model's intended upright first; all formats default to +Z up with -Y to the front; publish Y-up files with up:\"y\"; use file* or file-tagged fields to edit published files, source* for registered sources; batch camera is preview only; register sourceTransform in open for rotated copies), choose which published version the reviewer sees, read submitted annotations, and echo understanding and wait for confirmation before revising a model. Use after creating a first model, including natural modelling requests that do not name MeshCue. Model limits are 600000 triangles and 80 MiB, and nothing degrades below them: run precheck on a GLB, glTF or STL before every open, and when its verdict is reject, follow remediation.kind and remediation.next; only decimate supplies a numeric ratio, and report any simplification; a STEP needs no precheck, since open measures it while importing and refuses it the same way. Every visible published version stays selectable and annotatable; retain can hide versions without deleting files, so activate switches the display freely and never discards a draft; status lists visible versions with their marking counts. A batch with sealed true was closed out on the reviewer's behalf, so confirm what they meant before treating it as a change request, and use read.gates.nextAction to ask whether to return to the marked version or apply feedback to the displayed one. inspect, precheck and status are read-only. finish closes a version's round and unlock clears a stale tab: use either only when the user asks.";

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
