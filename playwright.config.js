import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 12000 },
  // Identical test code went green on one commit and red on the next, with only
  // a workflow file changed between them: a shared runner is slower and less
  // even than this machine, and some of these cases are timing-sensitive. A
  // retry is not a way to hide that — Playwright reports a case that only
  // passed on a retry as "flaky", so the count stays visible and a genuine
  // failure still fails twice.
  retries: process.env.CI ? 2 : 0,
  // On a failure here the log and the artifact both need a token to read, so
  // until now a red run said only "exit code 1" to anyone without one. The
  // github reporter writes the failing test and line into the run's public
  // annotations, and a trace is kept for whoever can download it.
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    channel: "chrome",
    // The interface now follows the reader's language, so the tests have to
    // state which reader they are. English is the source, so a failure here is
    // a failure in the text that ships, not in one translation of it.
    locale: "en-US",
    acceptDownloads: true,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      args: [
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--host-resolver-rules=MAP review.test 127.0.0.1",
      ],
    },
    trace: process.env.CI ? "retain-on-failure" : "off",
  },
});
