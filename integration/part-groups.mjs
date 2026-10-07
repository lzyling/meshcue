/* Optional descriptive metadata has one transport contract across HTTP, tools
   and the browser. Validation never resolves geometry: the reviewer's loaded
   native tree is the only authority for member identity in this lean feature. */
export const PART_GROUP_LIMITS = Object.freeze({
  groups: 256,
  depth: 8,
  members: 4096,
  bytes: 256 * 1024,
});
export const FEATURES = Object.freeze({ partGroups: 1 });
const groupNamePattern =
  "^(?!\\s*$)[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028-\\u202e\\u2066-\\u2069]+$";
const partIdPattern = "^part-[0-9]+(?:\\.[0-9]+)*$";
const memberSchemas = [
  ["nodeIndex", { type: "integer", minimum: 0 }],
  ["nodeName", { type: "string", minLength: 1, maxLength: 256 }],
  ["partId", { type: "string", maxLength: 512, pattern: partIdPattern }],
].map(([key, value]) => ({
  type: "object",
  additionalProperties: false,
  required: [key],
  properties: { [key]: value },
}));
// Bounded recursion is expanded for hosts which do not support JSON Schema
// $defs/$ref. Both tool surfaces import these exact bytes rather than keeping
// independent copies whose accepted shapes could drift.
const groupSchema = (depth) => ({
  type: "object",
  additionalProperties: false,
  required: ["id", "name"],
  properties: {
    id: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" },
    name: {
      type: "string",
      minLength: 1,
      maxLength: 96,
      pattern: groupNamePattern,
    },
    members: {
      type: "array",
      maxItems: PART_GROUP_LIMITS.members,
      items: { oneOf: memberSchemas },
    },
    children: {
      type: "array",
      maxItems:
        depth === PART_GROUP_LIMITS.depth ? 0 : PART_GROUP_LIMITS.groups,
      ...(depth < PART_GROUP_LIMITS.depth
        ? { items: groupSchema(depth + 1) }
        : {}),
    },
  },
});
export const partGroupsSchema = {
  type: "array",
  maxItems: PART_GROUP_LIMITS.groups,
  items: groupSchema(1),
  description:
    "open with file: optional named, nested groups alongside the unchanged File hierarchy. Membership is resolved only in the reviewer's browser. Omit to keep existing groups on same-content reuse; [] clears them. Total limits: 256 groups, depth 8, 4096 members and 256 KiB normalized UTF-8 JSON.",
};
function invalid(message) {
  const error = new Error(`partGroups: ${message}`);
  error.code = "ERROR";
  error.status = 400;
  throw error;
}
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export function normalizePartGroups(value) {
  if (!Array.isArray(value)) invalid("expected an array of groups.");
  const ids = new Set(),
    pending = [{ groups: value, depth: 1 }];
  let groups = 0,
    members = 0;
  // Check depth and totals iteratively before allocating a recursive normalized
  // tree. An over-deep caller document cannot exhaust the JavaScript stack.
  while (pending.length) {
    const item = pending.pop();
    if (item.groups.length > PART_GROUP_LIMITS.groups)
      invalid("at most 256 groups per array.");
    if (item.groups.length && item.depth > PART_GROUP_LIMITS.depth)
      invalid("nesting depth must be at most 8.");
    for (const group of item.groups) {
      if (++groups > PART_GROUP_LIMITS.groups)
        invalid("at most 256 groups in total.");
      if (
        !object(group) ||
        Object.keys(group).some(
          (key) => !["id", "name", "members", "children"].includes(key),
        )
      )
        invalid("groups accept only id, name, members and children.");
      if (
        typeof group.id !== "string" ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(group.id) ||
        ids.has(group.id)
      )
        invalid("id must be a unique ASCII identifier of 1–64 characters.");
      ids.add(group.id);
      if (
        typeof group.name !== "string" ||
        group.name.length > 96 ||
        !new RegExp(groupNamePattern, "u").test(group.name)
      )
        invalid(
          "name must be one-line plain text, 1–96 UTF-16 code units, without control or bidi-control characters.",
        );
      const refs = group.members === undefined ? [] : group.members;
      if (
        !Array.isArray(refs) ||
        refs.length > PART_GROUP_LIMITS.members ||
        (members += refs.length) > PART_GROUP_LIMITS.members
      )
        invalid("at most 4096 member selectors in total.");
      for (const ref of refs) {
        if (!object(ref) || Object.keys(ref).length !== 1)
          invalid(
            "each member must contain exactly one of nodeIndex, nodeName or partId.",
          );
        const key = Object.keys(ref)[0],
          v = ref[key];
        if (
          key === "nodeIndex"
            ? !Number.isInteger(v) || v < 0
            : key === "nodeName"
              ? typeof v !== "string" || v.length < 1 || v.length > 256
              : key === "partId"
                ? typeof v !== "string" ||
                  v.length > 512 ||
                  !new RegExp(partIdPattern).test(v)
                : true
        )
          invalid("invalid nodeIndex, nodeName or partId selector.");
      }
      const children = group.children === undefined ? [] : group.children;
      if (!Array.isArray(children))
        invalid("children must be an array of groups.");
      pending.push({ groups: children, depth: item.depth + 1 });
    }
  }
  const normalize = (groups) =>
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      members: (g.members || []).map((m) => ({ ...m })),
      children: normalize(g.children || []),
    }));
  const result = normalize(value);
  if (
    new TextEncoder().encode(JSON.stringify(result)).byteLength >
    PART_GROUP_LIMITS.bytes
  )
    invalid("normalized UTF-8 JSON must be at most 256 KiB.");
  return result;
}
