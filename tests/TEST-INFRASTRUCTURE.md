# Isolated browser runs

`npm run test:browser -- [Playwright arguments]` acquires a checkout-independent
lock at `path.join(os.tmpdir(), "meshcue-browser-tests.lock")` before building or
launching Chrome. The lock records PID, start time and checkout and prints the
owner every five seconds while waiting. Atomic hard-link publication prevents
partial metadata; an exclusive reaper lock prevents competing waiters from
removing a successor. Dead owners and dead reapers are reclaimed. SIGINT/SIGTERM
are forwarded to the active child and the lock is released after it exits.
`CI` skips this lock; Node tests never acquire it.

Each run has a `tmp/browser-run-*/` build and Playwright result directory. Browser
servers receive `PORT=0`; `tests/helpers/browser-server.mjs` reads their assigned
port over the private IPC socket. The review test helper follows the same
per-run distribution via `REVIEW_TEST_DIST`. Browser fixture data and screenshots
are in per-test `mkdtemp` directories. The section gallery uses the enclosing
run's evidence directory. `tmp/samples/` is shared, read-only fixture input.

The port audit found fixed ports in nine browser spec files; all now use OS
assignment. HTTP upstream fixtures already used `listen(0)`. The Node restart
helper intentionally reuses its **initially assigned** port so remembered-cookie
and restart tests keep their origin; the instance-hijack test likewise binds the
port of the instance it just stopped. These are assertions about an existing
per-run origin, not globally fixed ports. Unix sockets are scoped to unique test
runtime identities/directories. Package/build candidates are per process and
run; normal `dist/` is a build output, not a test data directory.

Direct `playwright test` remains a low-level entry point and bypasses the wrapper;
use the npm command for concurrent worktrees. `scripts/test-lan.mjs` routes its
browser leg through that wrapper too. The scenario kit and its standalone smoke
check are documented in `scenarios/README.md`.
