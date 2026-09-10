// The private-network path is what a reviewer's browser actually uses, and
// both tests covering it opt in through an environment variable, so a plain
// `npm test` reports them as skipped and nobody notices. Derive the address
// from this machine and run them, rather than leaving it to be remembered.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lanAddresses } from "../server/network.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  ...new Set(
    lanAddresses()
      .filter((item) => item.preferred)
      .map((item) => item.address),
  ),
];
const host = process.env.REVIEW_TEST_LAN_HOST || candidates[0];
if (!host)
  throw new Error(
    `No private IPv4 interface to bind. Set REVIEW_TEST_LAN_HOST explicitly.${
      candidates.length ? ` Candidates: ${candidates.join(", ")}` : ""
    }`,
  );
if (!process.env.REVIEW_TEST_LAN_HOST && candidates.length > 1)
  throw new Error(
    `Several private interfaces are up (${candidates.join(", ")}); set REVIEW_TEST_LAN_HOST to the one the reviewer's device can reach.`,
  );

const run = (label, command, args, env) => {
  process.stdout.write(`\n── ${label} ──\n`);
  execFileSync(command, args, { cwd: repo, stdio: "inherit", env });
};
// A real listener on a real interface, exercising admission and authorization.
run(
  `real LAN listener on ${host}`,
  process.execPath,
  ["--test", "tests/http-review.test.mjs"],
  { ...process.env, REVIEW_TEST_LAN_HOST: host },
);
// A non-localhost origin, where the browser has no secure context and the
// crypto fallbacks in browser-crypto.js are the ones actually in use.
run(
  "insecure browser origin",
  process.execPath,
  [
    path.join(repo, "node_modules/@playwright/test/cli.js"),
    "test",
    "tests/browser/review.spec.js",
    "-g",
    "LAN HTTP",
  ],
  { ...process.env, REVIEW_BROWSER_ORIGIN: "http://review.test:43174" },
);
