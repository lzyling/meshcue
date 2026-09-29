import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { normalizeOrigin } from "./origin.mjs";
import { matchLocale, sentence } from "../src/i18n/index.js";
const exec = promisify(execFile);

/* A line in the reviewer's own conversation the moment a batch is handed
   over, and the same line changed once the Agent has read it.

   The batch itself goes into the Agent's session as a message the reviewer
   never sees, and the Agent's answer comes only after it has read and thought
   — tens of seconds, sometimes minutes, in which the conversation shows
   nothing and the reviewer cannot tell whether anything arrived. This fills
   that gap with the host's own outbound command, `openclaw message send`, and
   `openclaw message edit` once `read` is written. It never passes through the
   model and says nothing the service does not know: that the marks arrived,
   which ones, to whom, and when they were read.

   Only a chat the message command can write to and edit gets one: Telegram,
   today. The Control UI's chat has no outbound message to edit, and a host
   reached over a tool protocol has no conversation to write into at all —
   for both, the review page says the same thing on its own. A receipt that
   fails is logged and forgotten: it is a courtesy beside the delivery, never
   a condition of it, and it is not retried. */

const CHANNELS = new Set(["telegram"]);
// The command starts the whole host CLI, which takes several seconds before it
// sends anything.
const TIMEOUT_MS = 60000;
// Past this many names the line stops listing and says there are more.
const LISTED = 8;

// Where a receipt can go: the chat and topic the batch was bound to.
export function receiptRoute(origin) {
  let route;
  try {
    route = normalizeOrigin(origin)?.route;
  } catch {
    return null;
  }
  if (!route || !CHANNELS.has(route.channel) || !route.target) return null;
  return route;
}

/* The Agent as the page calls it, in the language the line is written in:
   `src/agent-label.js` for a language that is not the page's. */
function agentIn(which, name, tool) {
  if (!name) return tool || null;
  if (!tool || name.toLowerCase() === tool.toLowerCase()) return name;
  return sentence(which, "agent.withTool", { name, tool });
}

/* A name as the reviewer's page shows it, minus anything that could make the
   line read as more than a list: a region is named by the page, but the
   service only holds the name to a length. */
const plain = (label) =>
  String(label ?? "")
    .replace(/[^\p{L}\p{N}\p{Zs}\-–]/gu, "")
    .trim();

/* "M1–M4, A, red area": measurements, then pins, then regions, in the order
   they were made, a run of three or more in sequence written as a range and a
   repeated region name counted. */
export function markList(which, annotations) {
  const numbered = (type, pattern, value) =>
    annotations
      .filter((a) => a.type === type)
      .map((a) => plain(a.label))
      .filter((label) => pattern.test(label))
      .map((label) => ({ label, n: value(label) }));
  const ranges = (items) => {
    const out = [];
    for (let i = 0; i < items.length;) {
      let j = i;
      while (j + 1 < items.length && items[j + 1].n === items[j].n + 1) j++;
      if (j - i >= 2) out.push(`${items[i].label}–${items[j].label}`);
      else for (let k = i; k <= j; k++) out.push(items[k].label);
      i = j + 1;
    }
    return out;
  };
  const measures = numbered("measure", /^M\d+$/, (l) => Number(l.slice(1)));
  const pins = numbered("pin", /^[A-Z]$/, (l) => l.charCodeAt(0));
  const others = annotations
    .filter(
      (a) =>
        a.type === "region" ||
        (a.type === "pin" && !/^[A-Z]$/.test(plain(a.label))),
    )
    .map((a) => plain(a.label))
    .filter(Boolean);
  const counted = new Map();
  for (const label of others) counted.set(label, (counted.get(label) || 0) + 1);
  const names = [
    ...ranges(measures),
    ...ranges(pins),
    ...[...counted].map(([label, n]) => (n > 1 ? `${label} ×${n}` : label)),
  ];
  const join = sentence(which, "receipt.listJoin");
  return names.length > LISTED
    ? `${names.slice(0, LISTED).join(join)}${join}…`
    : names.join(join);
}

/* The line itself: `sent` when the batch is handed over, `read` once the
   Agent has read it. In the language the reviewer's page was in when they
   pressed the button. */
export function receiptText(
  stage,
  { locale, annotations, agentName, agentTool },
) {
  const which = matchLocale(locale) || "en";
  return sentence(
    which,
    stage === "read" ? "receipt.chatRead" : "receipt.chatSent",
    { count: annotations.length, marks: markList(which, annotations) },
    agentIn(which, agentName, agentTool),
  );
}

function routeArgs(route) {
  return [
    "--channel",
    route.channel,
    "--target",
    route.target,
    ...(route.accountId ? ["--account", route.accountId] : []),
    ...(route.threadId ? ["--thread-id", route.threadId] : []),
  ];
}

// The command prints its result as JSON, and nothing else on stdout.
async function run(argv) {
  let stdout;
  try {
    ({ stdout } = await exec("openclaw", argv, {
      timeout: TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    }));
  } catch (error) {
    const reason = error.killed
      ? "the command timed out"
      : error.code === "ENOENT"
        ? "the openclaw command was not found"
        : `openclaw exited with ${error.code ?? "?"}`;
    // Only the host's own words, which never contain the line being sent:
    // execFile's message repeats the whole command line.
    const detail = String(error.stdout || error.stderr || "")
      .trim()
      .slice(0, 200);
    throw new Error(detail ? `${reason}: ${detail}` : reason);
  }
  const text = String(stdout);
  let data;
  try {
    data = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    throw new Error(`the result could not be read: ${text.slice(0, 200)}`);
  }
  if (data.ok === false || data.error)
    throw new Error(
      `the host refused it: ${JSON.stringify(data.error ?? data).slice(0, 200)}`,
    );
  return data;
}

export async function sendReceipt(route, message) {
  const data = await run([
    "message",
    "send",
    ...routeArgs(route),
    "--message",
    message,
    "--json",
  ]);
  const messageId = data.messageId ?? data.payload?.messageId;
  if (messageId === undefined || messageId === null || messageId === "")
    throw new Error("the host sent it but gave no message id to edit");
  return String(messageId);
}

export async function editReceipt(route, messageId, message) {
  await run([
    "message",
    "edit",
    ...routeArgs(route),
    "--message-id",
    String(messageId),
    "--message",
    message,
    "--json",
  ]);
}
