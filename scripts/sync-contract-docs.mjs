import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  ACTIONS,
  ACTION_DETAILS,
  FIELDS,
  ENTRY_DIFFERENCES,
  cliFlags,
  cliSwitches,
} from "../integration/contract.mjs";

export const BLOCKS = ["actions", "fields"];
export const begin = (key) => `<!-- contract-${key}:begin -->`;
export const end = (key) => `<!-- contract-${key}:end -->`;
const escape = (text) =>
  String(text ?? "Not specified")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
export function renderContract(key) {
  const rows =
    key === "actions"
      ? [
          ACTIONS.map((a) => `\`${a}\``).join(" · "),
          "",
          "| Action | Does / defaults |",
          "| --- | --- |",
          ...ACTIONS.map((a) => `| \`${a}\` | ${escape(ACTION_DETAILS[a])} |`),
        ]
      : [
          "| Field | Type / bounds | Actions | Default / meaning |",
          "| --- | --- | --- | --- |",
          ...Object.entries(FIELDS).map(([key, f]) => {
            const bounds = Object.entries(f.schema)
              .filter(([k]) =>
                [
                  "type",
                  "enum",
                  "minLength",
                  "maxLength",
                  "minimum",
                  "maximum",
                  "maxItems",
                ].includes(k),
              )
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("/") : v}`)
              .join("; ");
            return `| \`${key}\` | ${escape(bounds)} | ${f.actions.join(", ")} | ${escape(f.schema.description)} Default: ${escape(f.defaultBehavior)} |`;
          }),
          "",
          "| CLI flag | Tool field |",
          "| --- | --- |",
          ...Object.entries(cliFlags()).map(
            ([flag, key]) =>
              `| \`--${flag} <value>\` | \`${key === "partGroupsFile" ? "partGroups" : key}\` |`,
          ),
          ...Object.entries(cliSwitches()).map(
            ([flag, key]) =>
              `| \`--${flag}\` | \`${key}: ${flag !== "no-activate"}\` |`,
          ),
          "",
          "Entry differences:",
          ...Object.entries(ENTRY_DIFFERENCES).flatMap(([entry, differences]) =>
            Object.entries(differences).map(
              ([field, reason]) => `- ${entry} \`${field}\`: ${reason}`,
            ),
          ),
        ];
  return [begin(key), "", ...rows, "", end(key)].join("\n");
}
export function syncContractDocs(source) {
  for (const key of BLOCKS) {
    const from = source.indexOf(begin(key)),
      to = source.indexOf(end(key));
    if (from < 0 || to < from)
      throw new Error(`Missing contract ${key} markers`);
    source =
      source.slice(0, from) +
      renderContract(key) +
      source.slice(to + end(key).length);
  }
  return source;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const file = new URL("../AGENT-INTERFACE.md", import.meta.url);
  const current = fs.readFileSync(file, "utf8"),
    next = syncContractDocs(current);
  if (process.argv.includes("--check")) {
    if (current !== next)
      throw new Error("Contract docs drifted; run npm run sync:docs");
  } else fs.writeFileSync(file, next);
}
