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
