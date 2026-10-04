# Application feature seams

`../main.js` installs feature functions into one per-page `review` context, then
mounts and binds the page before starting polling. The context replaces the old
module's live lexical variables; state is not copied between features. Keep
asynchronous ownership, save and load guards in the feature that owns them.

- `state.js`: initial per-page state and endpoint/client identity.
- `api.js`: requests, state polling, access renewal, outbox and closing status.
- `draft.js`: cache/recovery, edit ownership, saves, undo/redo and resume.
- `annotations-panel.js`: marking, byte accounting, mark list and notes.
- `versions-bar.js`: tabs, model/version loading and latest-version selection.
- `receipt.js` and `echo.js`: submission/receipt and agent-understanding UI.
- `toolbar.js`, `keyboard.js`, `commands.js`: commands and their input surfaces.
- `section.js`, `measure.js`, `orientation.js`, `settings.js`: feature bindings.
- `shell.js`: common markup/icons and small page helpers.
- `viewer.js` and `diagnostics.js`: viewer construction and read-only diagnostics.

Register a command through `review.commands.register({id, labelKey, icon,
shortcuts, enabled, run, group, ...})`. `labelKey` is an existing flat i18n key;
`run()` performs the action; `enabled(source)` defaults to true. `source` is
`button` or `keyboard`: existing undo/redo keys retain their original attempt
through `beginEdit`, even when a toolbar button is disabled. Other actions can
usually ignore that argument. A string or array of `shortcuts` is optional.
`Mod` expands to both Ctrl and Meta; aliases normalize before collision checks.
Duplicate ids or key combinations throw before any registration takes effect.

A command with `group: "tools"`, `"history"` or `"display"` gets a button in that
named toolbar slot, in registration order, including commands registered after
mounting. `titleKey`, `captionKey` and `attributes` preserve the existing title,
visible caption and DOM ids/classes. `review.refreshCommands()` updates button
enablement after state changes. No other command's markup needs editing.
`home` uses the same registry through the existing compass button. Application
keys are ignored in input, textarea, select, editable content and modal dialogs;
native input/dialog key handling remains with the browser. Escape also retains
its original non-cancelling event behavior through `preventDefault: false`.

Translations live in `../i18n/<locale>/<feature>.js`. Add a default flat object
in each of the six locale folders. Vite, Node and the integration bundler discover
feature files; there is no shared import list to edit. Duplicate keys throw,
including identical duplicate values. Keep old keys and text unchanged when
moving them. The root locale files remain compatibility entry points so help
sync keeps `AGENT-INTERFACE.md` byte-identical.
