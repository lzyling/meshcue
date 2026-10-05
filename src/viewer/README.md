# Viewer feature seams

`../viewer.js` exports the same `ModelViewer` facade. It owns construction,
model loading/clearing, the render loop and diagnostics. Feature classes lend
non-enumerable prototype methods to that facade; they are not separate viewers
and all existing `this` properties keep their meaning. Constructor helpers run
at the original points in initialization.

| Module            | Owns                                                               |
| ----------------- | ------------------------------------------------------------------ |
| `camera.js`       | OrbitControls, wheel/pan, camera snapshots, home and compass views |
| `display.js`      | tone mapping, lights, theme/grid and plain view                    |
| `section-view.js` | clipping, stencil caps and section occlusion                       |
| `picking.js`      | rays, source triangles and measurement snapping                    |
| `marks.js`        | annotation serialization, bounds, pins/readings, overlays and echo |
| `measure-view.js` | measurement state, hover, geometry and kept dimensions             |
| `editing.js`      | pointer editing and connected-face fill                            |
| `shared.js`       | the small set of constants/helpers used by several features        |

`viewer.addFrameHook(fn)` returns an unsubscribe function. Hooks receive the
viewer, run in registration order, and run **after** controls, grid visibility,
echo animation, scene rendering, orientation reporting, pin placement, transient
measurement placement and kept-reading placement. Existing phases were not
migrated into hooks. A frame takes a snapshot of registered hooks; adding or
removing one during a hook changes the next frame. Registering the same function
twice keeps one entry. Hooks are synchronous and should not throw; exceptions
propagate as they do in the existing render phases. Scene changes from a hook
are visible on the next frame.

## Parts (Batch 2 seam)

`parts.js` lends viewer methods; `parts-tree.js` builds the file tree and holds
reviewer-only state. `viewer.parts` keeps its identity across loads; its contents,
selection, visibility, isolation and transparency reset per version. None enters
the saved review, camera, mesh manifest or agent contract.

```js
viewer.parts.list(); // [{id, name, parentId: null|string, meshIds: [...], childIds: [...]}]
viewer.parts.bounds(id); // THREE.Box3 in world space (empty for unknown id)
viewer.parts.object(id); // THREE.Object3D for transforms, or null
viewer.parts.setVisible(id, bool);
viewer.parts.isVisible(id);
viewer.parts.isolate(ids | null); // null restores visibility from before isolation
viewer.parts.setTransparent(id, bool);
viewer.parts.select(id | null);
viewer.parts.selected();
viewer.parts.partOfMesh(meshId); // owning leaf/node id, or null
viewer.parts.onChange(fn); // returns unsubscribe; includes reset/transparency
```

Ids are deterministic node paths, independent of names and Three UUIDs. Duplicate
names retain their original spelling; unnamed nodes receive localized, numbered
fallbacks. An assembly's `meshIds` includes its descendants; `object(id)` returns
the actual loaded object, without reparenting. Bounds are computed on demand,
including hidden descendants and current transforms. `isVisible` means at least
one descendant mesh is visible. Visibility and transparency apply to the entire
subtree. Isolation temporarily overrides the hidden set, and leaving it restores
that set. Show all clears both isolation and hiding; transparency stays separate.

STEP stores identity assembly nodes around the existing, already transformed
mesh buffers. Its `stepMeshIndex` restores the original flat mesh ordering before
review subdivision, so `mesh-N`, local coordinates and face indices stay stable.
Old cached STEP GLBs without hierarchy still work as a flat list. GLB uses its
node hierarchy; the scene container itself is omitted. STL has one part.

The panel virtualizes rows and uses the command registry (Y, Shift+Y, Shift+I,
Shift+T). Its Escape extension composes with the existing command. Hover uses
shared mesh geometry with a light tint, not a second tessellation or edge build.
Transparent parts do not contribute to picking or opaque section caps. Hiding
refreshes marks/echo and clears transient measurement/fill state without editing
annotations. `fitPart` calls `fitTo(bounds)` when available and otherwise frames
the world-space bounds using the current camera direction.
