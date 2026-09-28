import { test as base, expect } from "@playwright/test";

/* A context a test opens from `browser` is not the test's own. `browser` lives
   as long as the worker, so whatever is opened on it and not closed stays open
   for every file that runs after -- with its model still turning, drawn in
   software, sixty times a second. Two left behind by one file were enough to
   more than double the CI run and to time out a reload three files later, and
   the retry passed only because a failure restarts the worker and takes them
   with it. So the test that leaves one behind fails, where it was left, and
   what it left is closed before the next test starts.

   Set up before the test's own fixtures and so torn down after them: by the
   time this runs, the `context` a test was given has already been closed. */
export const test = base.extend({
  leftOpen: [
    async ({ browser }, use, testInfo) => {
      const before = new Set(browser.contexts());
      await use();
      const left = browser.contexts().filter((c) => !before.has(c));
      for (const context of left) await context.close();
      if (left.length && testInfo.status === testInfo.expectedStatus)
        throw new Error(
          `${left.length} browser context(s) left open; close what browser.newContext() opens`,
        );
    },
    { auto: true },
  ],
});
export { expect };
