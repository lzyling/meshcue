#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  privateRules,
  scanText,
  scanTree,
  scanRange,
} from "./privacy-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  const args = process.argv.slice(2);
  const indicatorFile = process.env.MESHCUE_PRIVATE_INDICATORS;
  if (indicatorFile) {
    const resolved = fs.realpathSync(indicatorFile);
    const relative = path.relative(root, resolved);
    if (
      !relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative)
    )
      throw new Error("Private indicators must be outside the repository");
  }
  const additional = privateRules(indicatorFile);
  let hits;
  if (!args.length) hits = scanTree(root, additional);
  else if (args.length === 2 && args[0] === "--message")
    hits = scanText(
      fs.readFileSync(args[1], "utf8"),
      "commit message",
      additional,
    );
  else if (args.length === 2 && args[0] === "--range")
    hits = scanRange(root, args[1], additional);
  else
    throw new Error(
      "Usage: privacy-check.mjs [--message <file> | --range <a>..<b>]",
    );
  for (const hit of hits) console.error(`${hit.file}:${hit.line}: ${hit.rule}`);
  if (hits.length) process.exitCode = 1;
  else console.log("Privacy check passed");
} catch (error) {
  console.error(`Privacy check failed: ${error.message}`);
  process.exitCode = 1;
}
