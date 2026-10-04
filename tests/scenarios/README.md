# Scenario kit

Use Node 24 and the installed dependencies. Generate fixtures with `npm run
samples` only in a fresh checkout; never regenerate another worker's fixtures.
Build this checkout with `npm run build`, then start an isolated review:

```sh
node scripts/scenario-env.mjs tmp/samples/parametric-bracket.glb
```

The command prints the review URL and its unique `tmp/scenarios/run-*/`
directory. It copies the fixture into that run's workspace, keeps all data
there, listens on an OS-assigned loopback port and disables host notifications
and update checks. An optional second argument selects a built distribution.
Ctrl+C or SIGTERM stops the instance; evidence remains for inspection.

For scripts, `await startScenario({fixture, dist})` returns `{url, run, stop}`.
Always call `stop()` in `finally`. Create a Playwright page and pass it to
`scenarioKit(page, {run})` from `kit.mjs`. Helpers are:

- `open(url)`: wait for a loaded, ready fixture and its model manifest.
- `orbit(dx, dy, options)`: right-drag by pixels; `pan` uses the middle button.
  Options are fractional start coordinates `x`, `y` and drag `steps`.
- `wheel(deltaY, deltaX = 0)` and `key("Control+z")`: ordinary input.
- `clickModelPoint([x,y,z], {meshId})`: project a mesh-local source point through
  its ready manifest and the current camera. The default is the first mesh;
  select a mesh explicitly in assemblies. The point must be visible, since this
  is an actual mouse click and does not bypass occlusion or tool rules.
- `toolbarState()`: ids, command ids, enabled/active/pressed state and labels.
- `screenshot("step-name", {viewerOnly})`: write `<run>/step-name.png`.

The kit performs no assertions about a reviewer goal. POP supplies those later.
Browser scripts must acquire `acquireBrowserLock()` from
`scripts/browser-lock.mjs` before launching Chrome and release it in `finally`.
The standalone environment starts a server only, so it does not hold that lock.

The infrastructure smoke check opens a fixture and checks a canvas screenshot
for rendered detail; it is intentionally separate from `npm test`:

```sh
node tests/scenarios/smoke.mjs
```

This smoke acquires the same machine lock as `npm run test:browser`, uses Chrome
with SwiftShader, prints its pixel counts and screenshot location, and closes
the browser and isolated review. All state and screenshots remain under `tmp/`.
