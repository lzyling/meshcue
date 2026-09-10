// Native OpenClaw entry. No host-private imports or process work during discovery.
import fs from "node:fs";
import path from "node:path";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import {
  InstanceManager,
  pauseRegistered,
} from "../../integration/manager.mjs";

// Read at call time, not discovery, and never restated: a hardcoded copy here
// disagreed with the manifest and with the version the server reported.
function installedVersion(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
      .version;
  } catch {
    return "unknown";
  }
}
export function contextSummary(ctx) {
  const delivery = ctx.deliveryContext;
  return {
    workspace: Boolean(ctx.workspaceDir),
    agent: Boolean(ctx.agentId),
    sessionKey: Boolean(ctx.sessionKey),
    sessionGeneration: Boolean(ctx.sessionId),
    channel: delivery?.channel || ctx.messageChannel || null,
    deliveryTarget: Boolean(delivery?.to),
    deliveryAccount: Boolean(delivery?.accountId),
    deliveryThread: delivery?.threadId !== undefined,
    fsPolicy: Boolean(ctx.fsPolicy),
    sandboxed: Boolean(ctx.sandboxed),
  };
}

const parameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["inspect", "open", "status", "read", "echo", "stop"],
    },
    project: {
      type: "string",
      description:
        "Workspace-relative modelling project, e.g. projects/phone-stand. Never the MeshCue application checkout.",
    },
    file: {
      type: "string",
      description:
        "Existing GLB or STL source, relative to this workspace. open imports/publishes it.",
    },
    name: { type: "string" },
    version: { type: "string" },
    units: { type: "string" },
    resume: {
      type: "boolean",
      description:
        "True only when the user explicitly continues this existing project in the present conversation.",
    },
    confirmedClientAddress: {
      type: "string",
      description:
        "Client LAN IPv4 already confirmed by the user, never inferred from the first visitor.",
    },
    submissionId: { type: "string" },
    summary: { type: "string" },
    annotations: {
      type: "array",
      items: { type: "object" },
      description:
        "Surface regions from the complete submission, validated by the core; never invented mesh coordinates.",
    },
  },
  required: ["action"],
};
const description =
  "Open or continue browser-based 3D model review in the current conversation; publish GLB/STL drafts, read submitted annotations, and show understanding before revising a model. Use after creating a first model, including natural modelling requests that do not name MeshCue. inspect is read-only. Never finish a user's review automatically.";

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
              let result;
              if (params.action === "inspect")
                result = {
                  product: "MeshCue",
                  integrationVersion: installedVersion(api.rootDir),
                  context: contextSummary(ctx),
                };
              else {
                const manager = new InstanceManager(ctx, {
                  installRoot: api.rootDir,
                  clientAddress: config.clientAddress,
                  listenHost: config.listenHost,
                });
                try {
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
// Preserve the SDK's static metadata while adding the supported cleanup hook.
const registerTools = plugin.register;
plugin.register = (api) => {
  registerTools(api);
  api.lifecycle.registerRuntimeLifecycle({
    id: "meshcue-instances",
    description:
      "Pause managed review writes when the extension is disabled; keep drafts and outbox.",
    cleanup({ reason }) {
      if (reason === "disable") {
        let unavailable = 0;
        for (const manager of new Set(managers.values()))
          unavailable += manager.pauseOwned().length;
        const workspaces = new Set(
          [
            api.config.agents?.defaults?.workspace,
            ...Object.values(api.config.agents?.entries || {}).map(
              (agent) => agent.workspace,
            ),
          ].filter(Boolean),
        );
        for (const workspace of workspaces) {
          try {
            unavailable += pauseRegistered(workspace, api.rootDir).length;
          } catch (error) {
            api.logger?.warn?.(
              `MeshCue disable: registry unreadable for ${workspace}: ${error.message}`,
            );
            unavailable++;
          }
        }
        if (unavailable)
          api.logger?.warn(
            `MeshCue disable: ${unavailable} unavailable registrations; other instances were processed.`,
          );
      }
      // Gateway restart is deliberately not a model-service restart. Reset is
      // handled by each batch's generation CAS, not by deleting browser data.
    },
  });
};
export default plugin;
