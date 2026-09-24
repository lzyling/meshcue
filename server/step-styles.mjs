/* The colours a STEP declares on its solids, read from the file itself.

   occt-import-js reports a colour only where XCAF files one against a label --
   a product, or a face -- and only when it can find that label again from the
   located shape it tessellated. A colour declared on one solid of a part made
   of several is neither: build123d writes exactly that for a coloured compound,
   and so does a CAD multi-body part. On the lantern Kelven reviewed on
   2026-09-24 every one of 76 solids carried its own STYLED_ITEM, and 72 came out
   grey. The library reads no transparency at all either, which the next
   version of the same file declared. It is vendored unmodified and 0.0.23 is its
   latest release, so the styles are read here and handed to the meshes the
   library made from those solids -- and only where that correspondence can be
   checked, because a colour on the wrong part is worse than none. */

const SOLIDS = new Set(["MANIFOLD_SOLID_BREP", "BREP_WITH_VOIDS"]);
const KEPT = new Set([
  ...SOLIDS,
  "CLOSED_SHELL",
  "ORIENTED_CLOSED_SHELL",
  "PRODUCT",
  "PRODUCT_DEFINITION_FORMATION",
  "PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE",
  "PRODUCT_DEFINITION",
  "PRODUCT_DEFINITION_SHAPE",
  "SHAPE_DEFINITION_REPRESENTATION",
  "SHAPE_REPRESENTATION",
  "ADVANCED_BREP_SHAPE_REPRESENTATION",
  "SHAPE_REPRESENTATION_RELATIONSHIP",
  "NEXT_ASSEMBLY_USAGE_OCCURRENCE",
  "STYLED_ITEM",
  "OVER_RIDING_STYLED_ITEM",
  "PRESENTATION_STYLE_ASSIGNMENT",
  "SURFACE_STYLE_USAGE",
  "SURFACE_SIDE_STYLE",
  "SURFACE_STYLE_FILL_AREA",
  "FILL_AREA_STYLE",
  "FILL_AREA_STYLE_COLOUR",
  "SURFACE_STYLE_RENDERING",
  "SURFACE_STYLE_RENDERING_WITH_PROPERTIES",
  "SURFACE_STYLE_TRANSPARENT",
  "COLOUR_RGB",
  "DRAUGHTING_PRE_DEFINED_COLOUR",
]);

// ISO 10303-46's predefined colours, the only ones a file may name.
const NAMED = {
  black: [0, 0, 0],
  red: [1, 0, 0],
  green: [0, 1, 0],
  blue: [0, 0, 1],
  yellow: [1, 1, 0],
  magenta: [1, 0, 1],
  cyan: [0, 1, 1],
  white: [1, 1, 1],
};

// Part 21 strings escape everything outside printable ASCII. Names are the one
// thing compared across the two readers, and the library hands them back
// decoded, so they are decoded here the same way.
function decode(s) {
  return s
    .replace(/\\X2\\((?:[0-9A-F]{4})+)\\X0\\/g, (_, hex) =>
      String.fromCharCode(
        ...hex.match(/.{4}/g).map((h) => Number.parseInt(h, 16)),
      ),
    )
    .replace(/\\X\\([0-9A-F]{2})/g, (_, h) =>
      String.fromCharCode(Number.parseInt(h, 16)),
    )
    .replace(/\\\\/g, "\\");
}

// One statement's parameter list, from the "(" at `at`. Refs come back as
// { ref }, enumerations as { enum }, typed values as { type, params }, unset
// values as null; strings and numbers as themselves.
function params(text, at) {
  const out = [];
  let i = at + 1;
  for (;;) {
    while (/\s/.test(text[i])) i++;
    const c = text[i];
    if (c === undefined) throw new Error("unterminated parameter list");
    if (c === ")") return [out, i + 1];
    if (c === ",") {
      i++;
    } else if (c === "(") {
      const [list, next] = params(text, i);
      out.push(list);
      i = next;
    } else if (c === "'") {
      let s = "";
      for (let j = i + 1; ;) {
        const k = text.indexOf("'", j);
        if (k < 0) throw new Error("unterminated string");
        if (text[k + 1] === "'") {
          s += text.slice(j, k + 1);
          j = k + 2;
        } else {
          s += text.slice(j, k);
          i = k + 1;
          break;
        }
      }
      out.push(decode(s));
    } else if (c === "#") {
      const m = /^#(\d+)/.exec(text.slice(i, i + 24));
      out.push({ ref: Number(m[1]) });
      i += m[0].length;
    } else if (
      c === "." &&
      /^\.[A-Z_][A-Z0-9_]*\./.test(text.slice(i, i + 64))
    ) {
      const m = /^\.([A-Z_][A-Z0-9_]*)\./.exec(text.slice(i, i + 64));
      out.push({ enum: m[1] });
      i += m[0].length;
    } else if (c === "$" || c === "*") {
      out.push(null);
      i++;
    } else {
      const typed = /^([A-Z_][A-Z0-9_]*)\s*\(/.exec(text.slice(i, i + 128));
      if (typed) {
        const [inner, next] = params(text, i + typed[0].length - 1);
        out.push({ type: typed[1], params: inner });
        i = next;
        continue;
      }
      const number = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(
        text.slice(i, i + 48),
      );
      if (!number) throw new Error(`unreadable parameter at ${i}`);
      out.push(Number(number[0]));
      i += number[0].length;
    }
  }
}

/* The DATA section, cut into statements, keeping only the entity types above.
   A simple entity becomes { type, params }; a complex one, written as a
   bracketed list of partial entities, becomes { parts } of the same. */
function entities(text) {
  const found = new Map();
  const data = text.indexOf("DATA;");
  let from = data < 0 ? 0 : data + 5,
    quoted = false;
  for (let i = from; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (quoted) {
      if (c === 39) quoted = false;
      continue;
    }
    if (c === 39) quoted = true;
    else if (c === 47 && text.charCodeAt(i + 1) === 42) {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 1;
    } else if (c === 59) {
      keep(text.slice(from, i), found);
      from = i + 1;
    }
  }
  return found;
}

function keep(statement, found) {
  const head = /^\s*#(\d+)\s*=\s*/.exec(statement);
  if (!head) return;
  const id = Number(head[1]);
  const rest = statement.slice(head[0].length).replace(/\/\*[\s\S]*?\*\//g, "");
  const simple = /^([A-Z_][A-Z0-9_]*)\s*\(/.exec(rest);
  if (simple) {
    if (KEPT.has(simple[1]))
      found.set(id, {
        type: simple[1],
        params: params(rest, simple[0].length - 1)[0],
      });
    return;
  }
  if (!rest.startsWith("(")) return;
  const parts = [];
  const pattern = /([A-Z_][A-Z0-9_]*)\s*\(/g;
  let i = 1;
  for (;;) {
    pattern.lastIndex = i;
    const m = pattern.exec(rest);
    if (!m || rest.slice(i, m.index).trim()) break;
    const [inner, next] = params(rest, m.index + m[0].length - 1);
    parts.push({ type: m[1], params: inner });
    i = next;
  }
  if (parts.some((p) => KEPT.has(p.type))) found.set(id, { parts });
}

// The parameters of `id` as `type`, whether it was written simply or as one
// part of a complex entity.
function as(found, ref, type) {
  const e = ref && found.get(ref.ref);
  if (!e) return null;
  if (e.type === type) return e.params;
  return e.parts?.find((p) => p.type === type)?.params ?? null;
}

function colourOf(found, ref) {
  const rgb = as(found, ref, "COLOUR_RGB");
  if (rgb) return rgb.slice(1, 4).map(Number);
  const named = as(found, ref, "DRAUGHTING_PRE_DEFINED_COLOUR");
  return named ? (NAMED[String(named[0]).toLowerCase()] ?? null) : null;
}

/* What a STYLED_ITEM's styles say about the surface: its colour, and its
   opacity when a transparency is declared. The fill colour is the one CAD
   writes for "the colour of this solid"; a rendering colour stands in only when
   there is no fill. */
function surfaceOf(found, styles) {
  let fill = null,
    rendered = null,
    transparency = null;
  for (const assignment of styles || []) {
    for (const style of as(
      found,
      assignment,
      "PRESENTATION_STYLE_ASSIGNMENT",
    )?.[0] || []) {
      const usage = as(found, style, "SURFACE_STYLE_USAGE");
      const side = usage && as(found, usage[1], "SURFACE_SIDE_STYLE");
      for (const element of side?.[1] || []) {
        const area = as(found, element, "SURFACE_STYLE_FILL_AREA");
        const fillStyle = area && as(found, area[0], "FILL_AREA_STYLE");
        for (const f of fillStyle?.[1] || []) {
          const colour = as(found, f, "FILL_AREA_STYLE_COLOUR");
          fill ??= colour && colourOf(found, colour[1]);
        }
        const rendering =
          as(found, element, "SURFACE_STYLE_RENDERING_WITH_PROPERTIES") ??
          as(found, element, "SURFACE_STYLE_RENDERING");
        if (rendering) {
          rendered ??= colourOf(found, rendering[1]);
          for (const property of rendering[2] || []) {
            const t = as(found, property, "SURFACE_STYLE_TRANSPARENT");
            if (t && Number.isFinite(t[0])) transparency ??= t[0];
          }
        }
        const t = as(found, element, "SURFACE_STYLE_TRANSPARENT");
        if (t && Number.isFinite(t[0])) transparency ??= t[0];
      }
    }
  }
  const rgb = fill ?? rendered;
  if (!rgb || rgb.some((v) => !Number.isFinite(v))) return null;
  const alpha =
    transparency === null ? 1 : Math.min(1, Math.max(0, 1 - transparency));
  return { rgb: rgb.map((v) => linear(Math.min(1, Math.max(0, v)))), alpha };
}

/* A file's colour values are sRGB, and OCCT reads them so; the colours the
   library hands back are linear, and so is glTF's baseColorFactor. Left as
   written, the lantern's clear parts came out 0.85 where the library said
   0.692 for the same solid -- the same colour, in the other space. */
function linear(v) {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function facesOf(found, solid) {
  const shell = (ref) => as(found, ref, "CLOSED_SHELL")?.[1]?.length ?? null;
  const brep = as(found, { ref: solid }, "MANIFOLD_SOLID_BREP");
  if (brep) return shell(brep[1]);
  const voided = as(found, { ref: solid }, "BREP_WITH_VOIDS");
  if (!voided) return null;
  let count = shell(voided[1]);
  for (const hole of voided[2] || []) {
    const oriented = as(found, hole, "ORIENTED_CLOSED_SHELL");
    const inner = oriented && shell(oriented[2]);
    if (count === null || inner === null) return null;
    count += inner;
  }
  return count;
}

/* Every product, by the names XCAF may give its label, with the solids its
   shape is made of in the order the kernel builds that shape: its own solids as
   written, then each component's, in the order the assembly lists them. That
   is the order the library meshes a node in -- including a node that is an
   assembly of parts, which it tessellates whole. The lantern's "head" is four
   parts, one per filament, and comes back as one node of 29 meshes. */
function productSolids(found) {
  const formation = new Map(),
    definition = new Map(),
    representation = new Map(),
    shapeOf = new Map(),
    related = new Map(),
    components = new Map();
  for (const [id, e] of found) {
    const p =
      as(found, { ref: id }, "PRODUCT_DEFINITION_FORMATION") ??
      as(
        found,
        { ref: id },
        "PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE",
      );
    if (p?.[2]?.ref) formation.set(id, p[2].ref);
    if (e.type === "PRODUCT_DEFINITION" && e.params[2]?.ref)
      definition.set(id, e.params[2].ref);
    if (e.type === "PRODUCT_DEFINITION_SHAPE" && e.params[2]?.ref)
      shapeOf.set(id, e.params[2].ref);
    if (e.type === "SHAPE_DEFINITION_REPRESENTATION")
      representation.set(e.params[0]?.ref, e.params[1]?.ref);
    if (e.type === "NEXT_ASSEMBLY_USAGE_OCCURRENCE") {
      const [, , , parent, child] = e.params;
      if (parent?.ref && child?.ref)
        components.set(parent.ref, [
          ...(components.get(parent.ref) || []),
          child.ref,
        ]);
    }
    // Only the plain relationship, which ties a part's shape to the geometry
    // that makes it up. The complex one carrying a transformation places a
    // component in an assembly; components are followed by their usage above.
    if (e.type === "SHAPE_REPRESENTATION_RELATIONSHIP") {
      const [, , a, b] = e.params;
      if (a?.ref && b?.ref) {
        related.set(a.ref, [...(related.get(a.ref) || []), b.ref]);
        related.set(b.ref, [...(related.get(b.ref) || []), a.ref]);
      }
    }
  }
  const repOf = new Map();
  for (const [pds, pd] of shapeOf)
    if (representation.has(pds)) repOf.set(pd, representation.get(pds));
  const ownSolids = (rep) => {
    const out = [],
      seen = new Set();
    const walk = (id) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      const e = found.get(id);
      const items =
        e?.type === "SHAPE_REPRESENTATION" ||
        e?.type === "ADVANCED_BREP_SHAPE_REPRESENTATION"
          ? e.params[1]
          : [];
      for (const item of items || [])
        if (SOLIDS.has(found.get(item?.ref)?.type)) out.push(item.ref);
      for (const next of related.get(id) || []) walk(next);
    };
    walk(rep);
    return out;
  };
  const solidsOf = (pd, path = new Set()) => {
    if (path.has(pd)) return [];
    const inside = new Set(path).add(pd);
    return [
      ...ownSolids(repOf.get(pd)),
      ...(components.get(pd) || []).flatMap((child) => solidsOf(child, inside)),
    ];
  };
  const products = [];
  for (const [pd, pdf] of definition) {
    const e = found.get(formation.get(pdf));
    if (e?.type !== "PRODUCT") continue;
    const solids = solidsOf(pd);
    if (solids.length)
      products.push({ names: new Set([e.params[0], e.params[1]]), solids });
  }
  return products;
}

/* Colours `result.meshes` in place from what `text` declares, and says how
   many meshes it coloured. A mesh node is matched to a product by name, and
   the product's solids to the node's meshes by position; a node is left
   untouched unless its solid count, every solid's face count, and every colour
   the library itself read all agree. */
export function applyDeclaredStyles(result, text) {
  const found = entities(text);
  const surface = new Map();
  for (const [, e] of found) {
    const over = e.type === "OVER_RIDING_STYLED_ITEM";
    if (!over && e.type !== "STYLED_ITEM") continue;
    const item = e.params[2]?.ref;
    if (!SOLIDS.has(found.get(item)?.type)) continue;
    // A solid's own override beats the style it overrides, wherever the two
    // happen to sit in the file.
    if (surface.get(item)?.over && !over) continue;
    const s = surfaceOf(found, e.params[1]);
    if (s) surface.set(item, { ...s, over });
  }
  if (!surface.size) return 0;
  const products = productSolids(found);
  let coloured = 0;
  const visit = (node) => {
    for (const child of node.children || []) visit(child);
    if (!node.meshes?.length || !node.name) return;
    const meshes = node.meshes.map((i) => result.meshes[i]);
    const answers = new Set();
    let chosen = null;
    for (const product of products) {
      if (!product.names.has(node.name)) continue;
      if (product.solids.length !== meshes.length) continue;
      const styles = product.solids.map((solid) => {
        const s = surface.get(solid);
        return s ? { rgb: s.rgb, alpha: s.alpha } : null;
      });
      const fits = product.solids.every(
        (solid, i) =>
          facesOf(found, solid) === (meshes[i].brep_faces?.length ?? null) &&
          (!meshes[i].color ||
            !styles[i] ||
            styles[i].rgb.every(
              (v, k) => Math.abs(v - meshes[i].color[k]) < 2e-3,
            )),
      );
      if (!fits || styles.every((s) => !s)) continue;
      answers.add(JSON.stringify(styles));
      chosen = styles;
    }
    // Two products by one name that would colour the node differently: there is
    // no telling which one it is, so it keeps what the library gave it.
    if (answers.size !== 1) return;
    chosen.forEach((s, i) => {
      if (!s) return;
      meshes[i].color = s.rgb;
      if (s.alpha < 1) meshes[i].alpha = s.alpha;
      coloured++;
    });
  };
  visit(result.root);
  return coloured;
}
