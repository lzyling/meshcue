import { t } from "./i18n/index.js";

/* What the page calls the Agent, from the two things the service knows of it:
   the name its user gave it, and the tool it runs in. Both, and the tool goes
   in brackets after the name — "爆爆（OpenClaw）" — because a name alone does
   not tell a reviewer who has never met 爆爆 that it is an agent, or where the
   marks go. With only one of the two the page says that one: the tool, when no
   name was given (the service then sends the tool as the name too, and it is
   said once, never "OpenClaw（OpenClaw）"), or the name, when the caller could
   not say which tool it is, as the CLI cannot. With neither there is no name,
   and every sentence keeps the page's own words for an agent. The brackets
   come from the catalogue: Chinese and Japanese write theirs full width. */
export function agentLabel(name, tool) {
  if (!name) return tool || null;
  if (!tool || name.toLowerCase() === tool.toLowerCase()) return name;
  return t("agent.withTool", { name, tool });
}
