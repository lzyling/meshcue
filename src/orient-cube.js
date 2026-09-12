/* The orientation cube, built from its geometry rather than written out.
 *
 * Twenty-six regions — six faces, twelve edges, eight corners — each a plate
 * laid on a chamfered cube. Writing twenty-six transforms by hand is how the
 * first version got the top and the bottom the wrong way round: the labels
 * still read correctly, so nothing looked broken. One derivation that every
 * region goes through cannot be wrong for only two of them.
 */

/* The cube the plates are laid on. HALF is its half-side; CHAMFER is how far
   each edge and corner is cut back, which is also how wide those plates end up.
   Small enough that the faces stay the thing you aim at, large enough that an
   edge is a comfortable click. */
const HALF = 36;
const CHAMFER = 11;

const DEG = 180 / Math.PI;
const rad = (d) => d / DEG;

/* Where a plate has to be rotated so its front faces out along a world
   direction. Derived once, checked against the four faces that were already
   right: (0,0,1) needs no rotation, (1,0,0) needs rotateY(90deg).
   CSS puts +Y downwards, which is the whole reason the naive version had the
   two vertical faces swapped — here the sign lives in one place. */
function angles(x, y, z) {
  const n = Math.hypot(x, y, z);
  return {
    yaw: Math.atan2(x, z) * DEG,
    pitch: Math.asin(y / n) * DEG,
  };
}

/* The plate's own axes in CSS space, so a point known in world coordinates can
   be expressed as a position on the plate. Only the corners need this. */
function basis(yaw, pitch) {
  const a = rad(yaw),
    b = rad(pitch);
  return {
    ex: [Math.cos(a), 0, -Math.sin(a)],
    ey: [Math.sin(a) * Math.sin(b), Math.cos(b), Math.cos(a) * Math.sin(b)],
    n: [Math.sin(a) * Math.cos(b), -Math.sin(b), Math.cos(a) * Math.cos(b)],
  };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* A corner plate is the triangle left when three cuts meet. Its three vertices
   are known in world space; projecting them onto the plate's own axes gives the
   clip path, so the triangle lines up with the edges beside it by construction
   instead of by tuning. */
function cornerClip(d, yaw, pitch, dist, radius) {
  const { ex, ey, n } = basis(yaw, pitch);
  const inner = HALF - CHAMFER;
  const corners = [
    [d[0] * HALF, d[1] * inner, d[2] * inner],
    [d[0] * inner, d[1] * HALF, d[2] * inner],
    [d[0] * inner, d[1] * inner, d[2] * HALF],
  ];
  const points = corners.map((p) => {
    // World Y is up, CSS Y is down; everything below is CSS space.
    const rel = [p[0] - n[0] * dist, -p[1] - n[1] * dist, p[2] - n[2] * dist];
    const u = dot(rel, ex),
      v = dot(rel, ey);
    const pct = (t) => (((t + radius) / (2 * radius)) * 100).toFixed(2);
    return `${pct(u)}% ${pct(v)}%`;
  });
  return `polygon(${points.join(", ")})`;
}

/* Every direction whose components are -1, 0 or 1, minus the one that points
   nowhere. How many of them are non-zero is what kind of region it is. */
function directions() {
  const out = [];
  for (const x of [-1, 0, 1])
    for (const y of [-1, 0, 1])
      for (const z of [-1, 0, 1]) {
        const rank = Math.abs(x) + Math.abs(y) + Math.abs(z);
        if (rank) out.push({ d: [x, y, z], rank });
      }
  return out;
}

function plate({ d, rank }) {
  const [x, y, z] = d;
  const { yaw, pitch } = angles(x, y, z);
  const span = 2 * (HALF - CHAMFER);
  if (rank === 1)
    return { yaw, pitch, dist: HALF, w: span, h: span, kind: "face" };
  if (rank === 2) {
    // An edge runs along the axis it has no component in. That axis lands on
    // the plate's own vertical only when it is Y — otherwise on its horizontal.
    const along = y === 0;
    const short = CHAMFER * Math.SQRT2;
    return {
      yaw,
      pitch,
      dist: (2 * HALF - CHAMFER) / Math.SQRT2,
      w: along ? short : span,
      h: along ? span : short,
      kind: "edge",
    };
  }
  const root3 = Math.sqrt(3);
  const dist = (3 * HALF - 2 * CHAMFER) / root3;
  const radius = (CHAMFER * Math.SQRT2) / root3;
  return {
    yaw,
    pitch,
    dist,
    w: 2 * radius,
    h: 2 * radius,
    kind: "corner",
    clip: cornerClip(d, yaw, pitch, dist, radius),
  };
}

/* The widest the cube can ever project, so the space it is given can be the
   space it actually needs. A cube given only its own flat size spills over
   whatever sits beneath it the moment it turns — which is how the reset-view
   button underneath ended up unclickable at some angles. */
export function projectedReach() {
  const inner = HALF - CHAMFER;
  return Math.hypot(HALF, inner, inner);
}

/* The other half of the contract, and it lives here because it has to agree
   with the plates exactly: turning the cube by the camera's angles reversed is
   what makes the side the camera is on the side that faces the reviewer. Split
   across two files, the pair drifts and only a screenshot can tell. */
export function compassTransform(yaw, pitch) {
  return `rotateX(${-pitch}deg) rotateY(${-yaw}deg)`;
}

export const cameraAngles = angles;

/* Every region as plain geometry, with no DOM in sight, so the derivation can
   be checked by composing matrices rather than by looking at a picture. */
export function regions() {
  return directions().map((dir) => ({
    view: dir.d.join(","),
    d: dir.d,
    ...plate(dir),
  }));
}

/* Builds the regions into `host`. Labels are looked up per direction so the
   caller owns the words; this module owns only where they go. */
export function buildOrientCube(host, { label, title }) {
  host.replaceChildren();
  const built = [];
  for (const p of regions()) {
    const view = p.view;
    const el = document.createElement("button");
    el.type = "button";
    el.className = `orient-region orient-${p.kind}`;
    el.dataset.view = view;
    el.dataset.kind = p.kind;
    el.tabIndex = -1;
    el.style.width = `${p.w}px`;
    el.style.height = `${p.h}px`;
    el.style.marginLeft = `${-p.w / 2}px`;
    el.style.marginTop = `${-p.h / 2}px`;
    el.style.transform = `rotateY(${p.yaw.toFixed(4)}deg) rotateX(${p.pitch.toFixed(4)}deg) translateZ(${p.dist.toFixed(3)}px)`;
    /* A corner is drawn as the triangle it geometrically is, but aimed at as
       the square that contains it. Clipping the element itself would clip its
       hit area too, and a triangle seen at an angle leaves so little of that
       area that two dozen viewpoints had no way to reach the corner at all. */
    if (p.clip) el.style.setProperty("--corner-clip", p.clip);
    if (p.kind === "face") {
      el.classList.add("orient-face");
      el.textContent = label(view) ?? "";
    }
    const tip = title(view);
    if (tip) el.title = tip;
    host.append(el);
    built.push({ el, view });
  }
  return built;
}

export const CUBE_GEOMETRY = { HALF, CHAMFER };
