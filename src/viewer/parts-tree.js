import * as THREE from "three";

/* Paths belong to the file's object tree, never to Three's random UUIDs or its
   deduplicated display names. Empty helper nodes are omitted, but still count
   in the path so omitting a helper from the list does not renumber a sibling. */
export function buildPartTree(
  root,
  { names = new Map(), fallback = (n) => `Part ${n}` } = {},
) {
  const entries = [],
    objects = new Map(),
    meshParts = new Map();
  const visit = (object, path, parentId) => {
    const id = `part-${path}`;
    const entry = {
      id,
      name: names.get(object) ?? object.userData.name ?? object.name,
      parentId,
      meshIds: [],
      childIds: [],
    };
    entries.push(entry);
    objects.set(id, object);
    if (object.isMesh && object.userData.reviewId) {
      entry.meshIds.push(object.userData.reviewId);
      meshParts.set(object.userData.reviewId, id);
    }
    object.children.forEach((child, index) => {
      const next = visit(child, `${path}.${index}`, id);
      if (next) {
        entry.childIds.push(next.id);
        entry.meshIds.push(...next.meshIds);
      }
    });
    if (!entry.meshIds.length) {
      entries.splice(entries.indexOf(entry), 1);
      objects.delete(id);
      return null;
    }
    return entry;
  };
  // A glTF scene is a container, not an assembly declared in its node list.
  if (root.isScene || root.userData.partsScene)
    root.children.forEach((child, index) => visit(child, String(index), null));
  else visit(root, "0", null);
  entries.forEach((entry, i) => {
    if (!entry.name?.trim()) entry.name = fallback(i + 1);
  });
  return { entries, objects, meshParts };
}

export function createParts(onChange = () => {}) {
  let tree = { entries: [], objects: new Map(), meshParts: new Map() };
  let byId = new Map(),
    hidden = new Set(),
    transparent = new Set(),
    isolated = null,
    selected = null;
  const listeners = new Set();
  const emit = (kind = "view") => {
    onChange(kind);
    for (const fn of listeners) fn(kind);
  };
  const meshes = (id) => byId.get(id)?.meshIds || [];
  const meshVisible = (id) => (isolated ? isolated.has(id) : !hidden.has(id));
  const api = {
    list: () =>
      tree.entries.map((p) => ({
        ...p,
        meshIds: [...p.meshIds],
        childIds: [...p.childIds],
      })),
    bounds(id) {
      const object = tree.objects.get(id);
      if (!object) return new THREE.Box3();
      object.updateWorldMatrix(true, true);
      return new THREE.Box3().setFromObject(object);
    },
    object: (id) => tree.objects.get(id) ?? null,
    setVisible(id, value) {
      for (const mesh of meshes(id)) {
        value ? hidden.delete(mesh) : hidden.add(mesh);
        if (isolated) value ? isolated.add(mesh) : isolated.delete(mesh);
      }
      emit();
    },
    isVisible: (id) => meshes(id).some(meshVisible),
    isolate(ids) {
      isolated = ids === null ? null : new Set(ids.flatMap(meshes));
      emit();
    },
    setTransparent(id, value) {
      for (const mesh of meshes(id))
        value ? transparent.add(mesh) : transparent.delete(mesh);
      emit();
    },
    select(id) {
      const next = byId.has(id) ? id : null;
      if (selected === next) return;
      selected = next;
      emit("selection");
    },
    selected: () => selected,
    partOfMesh: (id) => tree.meshParts.get(id) ?? null,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    // Viewer-only helpers. None of these are serialized into a review.
    meshVisible,
    meshPickable: (id) => meshVisible(id) && !transparent.has(id),
    isTransparent: (id) =>
      meshes(id).length > 0 &&
      meshes(id).every((mesh) => transparent.has(mesh)),
    meshTransparent: (id) => transparent.has(id),
    isIsolated: () => isolated !== null,
    showAll() {
      hidden.clear();
      isolated = null;
      emit();
    },
    reset(next) {
      tree = next || { entries: [], objects: new Map(), meshParts: new Map() };
      byId = new Map(tree.entries.map((p) => [p.id, p]));
      hidden = new Set();
      transparent = new Set();
      isolated = null;
      selected = null;
      emit();
    },
  };
  return api;
}
