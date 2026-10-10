// Single public tool contract. Limits belong to their enforcing runtime modules.
import { INPUT_LIMITS as L, ID_PATTERN } from "../server/input-limits.mjs";
import { MAX_AGENT_NAME, agentNameSchema } from "../server/agent-name.mjs";
import { MAX_TRIANGLES, MAX_BYTES } from "../server/models.mjs";
import { MAX_REGION_LABEL, MAX_NOTE } from "../server/budget.mjs";
import { partGroupsSchema } from "./part-groups.mjs";
import { IntegrationError } from "./context.mjs";

export const ACTION_DETAILS = Object.freeze({
  inspect:
    "Context availability, installed version and document paths; no project or owner needed.",
  precheck: "Read-only model measurement; starts no review service.",
  open: "Publish or reopen a model; activate:false preserves the displayed version.",
  status:
    "Read-only visible versions and marking counts, submissions, outbox, notifier and storage; retain may hide versions.",
  activate:
    "Display a published version; requires versionId or a matching version string.",
  retain:
    "Show the latest keep versions; omitted, null or zero restores all. Files are retained; keptVisible explains protected versions.",
  read: "Read a submission and record its receipt; geometry:true includes polygons. Uses the batch version, not caller versionId.",
  echo: "Show understanding of a submission without changing marks; uses the batch version, not caller versionId.",
  finish:
    "Close a round, sealing unsubmitted marks into a batch; omitted versionId uses the active version.",
  unlock:
    "Clear stale presence; omitted versionId clears all presence records.",
  stop: "Stop this review service without deleting its data.",
});
export const ACTIONS = Object.freeze(Object.keys(ACTION_DETAILS));
export const ENTRY_DIFFERENCES = Object.freeze({
  openclaw: {
    host: "Listener selection is plugin listenHost configuration, never a per-call parameter; automatic private LAN by default.",
  },
  cli: {
    geometry:
      "CLI supports summary reads only; use MCP or OpenClaw for geometry.",
    annotations: "CLI echo is text only; use MCP or OpenClaw for regions.",
    partGroups:
      "Transported as a workspace-relative JSON file via --part-groups.",
    workspace:
      "CLI context; defaults to cwd. MCP uses environment; OpenClaw supplies context.",
    owner:
      "CLI context; required for project actions. MCP uses environment/workspace identity; OpenClaw supplies context.",
  },
});
const field = (schema, actions, description, cli, defaultBehavior) => ({
  schema: schema === partGroupsSchema ? schema : { ...schema, description },
  actions,
  cli,
  defaultBehavior,
});
const string = (maxLength) => ({
  type: "string",
  ...(maxLength === undefined ? {} : { maxLength }),
});
const id = {
  type: "string",
  minLength: 1,
  maxLength: L.id,
  pattern: ID_PATTERN,
};
const projectActions = ACTIONS.filter(
  (a) => !["inspect", "precheck"].includes(a),
);
export const FIELDS = Object.freeze({
  action: field(
    { type: "string", enum: ACTIONS },
    ACTIONS,
    "Operation to perform; required.",
  ),
  project: field(
    string(),
    projectActions,
    "Workspace-relative modelling project, e.g. projects/phone-stand; never the application checkout.",
    "project",
  ),
  file: field(
    { type: "string", minLength: 1 },
    ["open", "precheck"],
    `Existing GLB, glTF, STL or STEP source relative to the workspace. Hard limits: ${MAX_TRIANGLES} triangles and ${MAX_BYTES / 1024 / 1024} MiB; STEP is tessellated on import.`,
    "file",
  ),
  partGroups: field(
    partGroupsSchema,
    ["open"],
    partGroupsSchema.description +
      " Only open with file; omitted preserves reused groups; [] clears them.",
    "part-groups",
    "Omitted preserves reused groups; [] clears",
  ),
  name: field(
    string(L.name),
    ["open"],
    `Publication name; at most ${L.name} UTF-16 code units.`,
    "name",
    "Input file basename",
  ),
  version: field(
    string(L.version),
    ["open", "activate"],
    `Publication version (at most ${L.version} UTF-16 code units), or existing version string for activate.`,
    "version",
    "initial on publication",
  ),
  units: field(
    string(L.units),
    ["open"],
    `Units text; at most ${L.units} UTF-16 code units. STEP always uses mm.`,
    "units",
    "unspecified; STEP mm",
  ),
  up: field(
    { type: "string", enum: ["z", "y"], default: "z" },
    ["open"],
    "File up axis, only open with file; default z (+Z up, -Y front, +X right). Marks stay in published file coordinates.",
    "up",
    "z",
  ),
  label: field(
    string(L.label),
    ["open"],
    `Explicit tab caption is rejected above ${L.label} UTF-16 code units. When omitted, the displayed version caption is automatically shortened.`,
    "label",
    "Version caption automatically shortened",
  ),
  versionId: field(
    id,
    ["activate", "finish", "unlock"],
    "activate: required unless version resolves it; finish: omitted uses active version; unlock: omitted clears ALL presence. read/echo ignore caller versionId and use the batch version.",
    "version-id",
    "Action-dependent; see description",
  ),
  keep: field(
    { type: ["integer", "null"], minimum: 0, maximum: L.keep },
    ["retain"],
    `Show latest 0–${L.keep} versions; omitted, null or zero restores all; protected versions remain visible.`,
    "keep",
    "null: restore all",
  ),
  submissionId: field(
    id,
    ["read", "echo"],
    `Submission batch id; 1–${L.id} ASCII letters, digits, underscores or hyphens.`,
    "submission",
  ),
  geometry: field(
    { type: "boolean", default: false },
    ["read"],
    "True returns full batch geometry; omitted returns a summary.",
    undefined,
    "false: summary",
  ),
  summary: field(
    { type: "string", minLength: 1, maxLength: L.summary },
    ["echo"],
    `Understanding of the batch; required for echo, 1–${L.summary} UTF-16 code units.`,
    "summary",
  ),
  annotations: field(
    {
      type: "array",
      maxItems: L.annotations,
      items: {
        type: "object",
        required: ["id", "type", "label", "color", "faces"],
        properties: {
          id,
          type: { const: "region", type: "string" },
          label: string(MAX_REGION_LABEL),
          color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
          faces: {
            type: "object",
            propertyNames: id,
            additionalProperties: {
              type: "array",
              maxItems: MAX_TRIANGLES,
              items: { type: "integer", minimum: 0 },
            },
          },
          coverage: {
            type: "string",
            enum: ["brush-v1", "source-v1", "source-v2"],
          },
          note: string(MAX_NOTE),
          view: { type: "object" },
          bounds: { type: "object" },
          surfacePatches: { type: "array", items: { type: "object" } },
        },
        additionalProperties: false,
      },
    },
    ["echo"],
    `At most ${L.annotations} regions from a full submission; never invented geometry. HTTP validates view, bounds, patches and geometry in detail.`,
    undefined,
    "[]",
  ),
  activate: field(
    { type: "boolean", default: true },
    ["open"],
    "False publishes without changing the displayed version; default true.",
    "no-activate",
    "true",
  ),
  resume: field(
    { type: "boolean" },
    ["open"],
    "True only when the user explicitly continues this existing project in the current conversation.",
    "resume",
    "false",
  ),
  host: field(
    string(),
    ["open"],
    "New MCP/CLI reviews default to 127.0.0.1; lan selects private LAN, or use a verified private IPv4. Existing reviews keep stored host.",
    "host",
    "Entry-dependent; existing host preserved",
  ),
  confirmedClientAddress: field(
    string(L.clientAddress),
    ["open"],
    "User-confirmed browser device IPv4; never inferred from first visitor.",
    "client-address",
    "OpenClaw may use plugin clientAddress; otherwise admission may need address",
  ),
  agentName: field(
    { type: "string", minLength: 1, maxLength: MAX_AGENT_NAME },
    ["open"],
    `Review-page name: trim first, 1–${MAX_AGENT_NAME} UTF-16 code units, no control/bidi characters. Omitted keeps previous name; otherwise tool fallback. OpenClaw appends OpenClaw; MCP may append recognised client.`,
    "agent-name",
    "Previous name or tool fallback",
  ),
});
export function toolSchema(entry) {
  return {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(
      Object.entries(FIELDS)
        .filter(
          ([key]) =>
            !(entry === "openclaw" && key === "host") &&
            !(entry === "cli" && ["geometry", "annotations"].includes(key)),
        )
        .map(([key, value]) => [key, value.schema]),
    ),
    required: ["action"],
  };
}
export function cliFlags() {
  return {
    workspace: "workspace",
    owner: "owner",
    ...Object.fromEntries(
      Object.entries(FIELDS)
        .filter(([, f]) => f.cli && f.schema.type !== "boolean")
        .map(([key, f]) => [
          f.cli,
          key === "partGroups" ? "partGroupsFile" : key,
        ]),
    ),
  };
}
export function cliSwitches() {
  return Object.fromEntries(
    Object.entries(FIELDS)
      .filter(([, f]) => f.cli && f.schema.type === "boolean")
      .map(([key, f]) => [f.cli, key]),
  );
}
export function validateUnknownFields(input, entry = "mcp") {
  const properties = toolSchema(entry).properties;
  for (const key of Object.keys(input))
    if (!Object.hasOwn(properties, key))
      throw new IntegrationError("BAD_USAGE", `Unknown parameter: ${key}`);
}
// Entry validation is deliberately shallow for complex region geometry: the
// existing HTTP validator remains authoritative. Do not reject action-irrelevant
// known fields here: read/echo's historical versionId behaviour is unchanged.
export function validateToolInput(input, entry) {
  validateUnknownFields(input, entry);
  if (!ACTIONS.includes(input.action))
    throw new IntegrationError("BAD_ACTION", "Name a supported action.");
  for (const [key, value] of Object.entries(input)) {
    const schema = FIELDS[key].schema;
    if (key === "versionId" && ["read", "echo"].includes(input.action))
      continue;
    if (key === "agentName") {
      if (input.action === "open" && !agentNameSchema.safeParse(value).success)
        throw new IntegrationError("BAD_AGENT_NAME", schema.description);
      continue;
    }
    if (
      key === "keep" &&
      (value === null ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > L.keep)
    ) {
      if (value === null) continue;
      throw new IntegrationError("KEEP_REQUIRED", schema.description);
    }
    const type = Array.isArray(value) ? "array" : typeof value;
    if (
      !(Array.isArray(schema.type)
        ? schema.type.includes(type) ||
          (schema.type.includes("integer") && Number.isInteger(value))
        : schema.type === type ||
          (schema.type === "integer" && Number.isInteger(value)))
    )
      throw new IntegrationError(
        "BAD_USAGE",
        `${key}: expected ${schema.type}.`,
      );
    if (
      typeof value === "string" &&
      ((schema.minLength !== undefined && value.length < schema.minLength) ||
        (schema.maxLength !== undefined && value.length > schema.maxLength) ||
        (schema.pattern && !new RegExp(schema.pattern).test(value)))
    )
      throw new IntegrationError(
        key === "submissionId" ? "SUBMISSION_REQUIRED" : "BAD_USAGE",
        `${key}: ${schema.description}`,
      );
    if (schema.enum && !schema.enum.includes(value))
      throw new IntegrationError(
        "BAD_USAGE",
        `${key}: expected ${schema.enum.join(" or ")}.`,
      );
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      throw new IntegrationError("BAD_USAGE", `${key}: ${schema.description}`);
  }
}
