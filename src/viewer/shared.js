import * as THREE from "three";
export const V = THREE.Vector3;

/* Where the ground sits when nothing pushes it down. A model is fitted into
   three units and centred, so whichever axis is longest reaches ±1.5 — and a
   floor at -1.4 was cutting through the base of every model that stands
   taller than it is wide. The floor gives way to the model, never the other
   way round. */
export const GRID_Y = -1.4;

export const midpoint = ([a, b]) => a.clone().add(b).multiplyScalar(0.5);

/* Where a measurement's reading hangs: at the middle of the line it was read
   along, or for a circle at its centre, in the model's frame. */
export const measureAnchor = (m) =>
  m.center
    ? new V().fromArray(m.center)
    : midpoint(m.points.map((p) => new V().fromArray(p)));

/* The one grey for a model that does not bring its own, and the one grey the
   plain view paints every model with. They were two constants that happened to
   agree until one of them was tuned, after which plain view came out brighter
   than the colours it was meant to be standing in for. One number now.

   The number itself only means anything next to the lamps: an albedo lands
   where the rig puts it, so this was solved against the rendered result a
   reviewer approved rather than picked for its own sake. The rails in
   `tests/browser/lighting.spec.js` hold that result, which is what makes the
   next change to the rig announce itself. */
export const REVIEW_GREY = 0xcdd7dc;
