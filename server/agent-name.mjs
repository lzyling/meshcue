import { z } from "zod";

/* What the reviewer's page calls the Agent. A person knows their agent by a
   name — the one they gave it, or failing that the tool it runs in — and a page
   that says "Send to Agent" reads as if it meant somebody else. The name is only
   ever words on the page: it is set as text, never as markup, and a character
   that would steer how the words around it are drawn (a control, a direction
   override) is refused rather than shown, because the name sits in the middle
   of the page's own sentences.

   Twenty-four is room for "Claude Code", a name in any script and a word or two
   more. The page writes the tool after a name, "Send to Ada (OpenClaw)", and a
   button too narrow for both shortens its words and keeps them whole in its
   tooltip. Counted in UTF-16 code units, the way `String.length` counts. */
export const MAX_AGENT_NAME = 24;

const STEERING =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/;

export const agentNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_AGENT_NAME)
  .refine((value) => !STEERING.test(value), {
    message: "control and text-direction characters are not shown",
  });

export const AGENT_NAME_RULE = `agentName is what the review page calls you: 1 to ${MAX_AGENT_NAME} characters of plain text on one line.`;
