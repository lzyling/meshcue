import * as THREE from "three";
import { resolvePartGroups } from "./part-groups.js";

/* Paths belong to the file's object tree, never to Three's random UUIDs or its
   deduplicated display names. Empty helper nodes are omitted, but still count
   in the path so omitting a helper from the list does not renumber a sibling. */
export function buildPartTree(
  root,
  {
    names = new Map(),
    sourceNodes = new Map(),
    fallback = (n) => `Part ${n}`,
  } = {},
) {
  const entries = [],
    objects = new Map(),
    meshParts = new Map(),
    identities = new Map(),
    meshObjects = new Map();
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
    if (sourceNodes.has(object))
      identities.set(id, { ...sourceNodes.get(object) });
    if (object.isMesh && object.userData.reviewId) {
      entry.meshIds.push(object.userData.reviewId);
      meshParts.set(object.userData.reviewId, id);
      meshObjects.set(object.userData.reviewId, object);
    }
    object.children.forEach((child, index) => {
      // GLTFLoader splits a multi-material node into primitive meshes that do
      // not exist in the file's node hierarchy. Keep those meshes on their
      // owning part instead of inventing selectable child parts for materials.
      if (names.size && child.isMesh && !names.has(child)) {
        if (child.userData.reviewId) {
          entry.meshIds.push(child.userData.reviewId);
          meshParts.set(child.userData.reviewId, id);
          meshObjects.set(child.userData.reviewId, child);
        }
        return;
      }
      const next = visit(child, `${path}.${index}`, id);
      if (next) {
        entry.childIds.push(next.id);
        entry.meshIds.push(...next.meshIds);
      }
    });
    if (!entry.meshIds.length) {
      entries.splice(entries.indexOf(entry), 1);
      objects.delete(id);
      identities.delete(id);
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
  return { entries, objects, meshParts, identities, meshObjects };
}

export function createParts(onChange = () => {}) {
  let tree = { entries: [], objects: new Map(), meshParts: new Map() };
  let byId = new Map(),
    hidden = new Set(),
    hiddenContainers = new Map(),
    blocked = new Set(),
    transparent = new Set(),
    isolated = null,
    selected = null;
  let groups = [],
    groupLabels = {},
    view = "file",
    projection = null,
    groupSignature = "";
  const listeners = new Set();
  const emit = (kind = "view") => {
    onChange(kind);
    for (const fn of listeners) fn(kind);
  };
  const meshes = (id) => byId.get(id)?.meshIds || [];
  // Container switches are gates, not writes to descendant switches. Isolation
  // remains a temporary override, restoring the gates unchanged on exit.
  const meshVisible = (id) =>
    isolated ? isolated.has(id) : !hidden.has(id) && !blocked.has(id);
  const containerKey = (id) => byId.get(id)?.partId || id;
  const rebuildBlocked = () => {
    blocked = new Set([...hiddenContainers.values()].flat());
  };
  const isContainer = (id) => {
    const row = byId.get(id);
    return (
      row &&
      (row.hasChildren ||
        row.childIds.length ||
        ["group", "other"].includes(row.kind))
    );
  };
  let indexedRows = 0;
  const indexProjection = () => {
    while (indexedRows < projection.entries.length) {
      const row = projection.entries[indexedRows++];
      byId.set(row.id, row);
    }
  };
  const ensureProjection = () => {
    if (projection) return;
    projection = resolvePartGroups(
      groups,
      tree.entries,
      tree.identities,
      groupLabels,
    );
    indexProjection();
  };
  const api = {
    list: () =>
      tree.entries.map((p) => ({
        ...p,
        meshIds: [...p.meshIds],
        childIds: [...p.childIds],
      })),
    identities: () =>
      new Map(
        [...(tree.identities || [])].map(([id, value]) => [id, { ...value }]),
      ),
    meshIds: (id) => [...meshes(id)],
    view: () => view,
    hasGroups: () => groups.length > 0,
    groupList() {
      ensureProjection();
      return projection.entries.filter(
        (p) => p.kind === "group" && p.parentId === null,
      );
    },
    viewList() {
      if (view !== "agent" || !groups.length) return api.list();
      ensureProjection();
      return projection.entries.map((p) => ({
        ...p,
        childIds: [...p.childIds],
      }));
    },
    expand(id) {
      if (view !== "agent") return;
      ensureProjection();
      projection.expand(id);
      indexProjection();
      return (byId.get(id)?.childIds || []).map((child) => ({
        ...byId.get(child),
        childIds: [...byId.get(child).childIds],
      }));
    },
    search(query) {
      if (view !== "agent" || !query) return;
      ensureProjection();
      const included = new Set();
      for (const part of tree.entries) {
        if (!part.name.toLocaleLowerCase().includes(query)) continue;
        for (let p = part; p; p = byId.get(p.parentId)) included.add(p.id);
      }
      // Only matching native paths are opened during a search; the ordinary
      // collapsed state is owned by the panel and is restored on clearing it.
      for (let i = 0; i < projection.entries.length; i++) {
        const row = projection.entries[i];
        if (included.has(row.partId)) projection.expand(row.id, included);
      }
      indexProjection();
    },
    revealId(id) {
      if (view !== "agent" || !byId.get(id)?.id?.startsWith("part-")) return id;
      ensureProjection();
      const alias = projection.firstAlias.get(id) ?? null;
      indexProjection();
      return alias;
    },
    setView(value) {
      const next = value === "agent" && groups.length ? "agent" : "file";
      if (view === next) return;
      if (next === "file" && selected && !selected.startsWith("part-"))
        selected = byId.get(selected)?.partId ?? null;
      view = next;
      if (view === "agent") ensureProjection();
      emit("projection");
    },
    setGroups(value = [], labels = {}) {
      const signature = JSON.stringify([value, labels]);
      if (signature === groupSignature) return;
      groups = value;
      groupLabels = labels;
      groupSignature = signature;
      projection = null;
      indexedRows = 0;
      let visibilityChanged = false;
      byId = new Map(tree.entries.map((p) => [p.id, p]));
      const groupGates = [...hiddenContainers.keys()].filter(
        (id) => !id.startsWith("part-"),
      );
      if (groups.length && (view === "agent" || groupGates.length))
        ensureProjection();
      for (const id of groupGates) {
        const previous = hiddenContainers.get(id);
        if (!byId.has(id)) {
          hiddenContainers.delete(id);
          visibilityChanged = true;
        } else {
          const current = meshes(id);
          hiddenContainers.set(id, current);
          if (
            previous.length !== current.length ||
            previous.some((mesh) => !current.includes(mesh))
          )
            visibilityChanged = true;
        }
      }
      rebuildBlocked();
      if (selected && !byId.has(selected)) selected = null;
      if (!groups.length) view = "file";
      emit(visibilityChanged ? "view" : "projection");
    },
    bounds(id) {
      const object = tree.objects.get(id);
      if (!object) {
        const bounds = new THREE.Box3();
        for (const meshId of meshes(id)) {
          const mesh = tree.meshObjects?.get(meshId);
          if (!mesh) continue;
          mesh.updateWorldMatrix(true, false);
          mesh.geometry.computeBoundingBox();
          bounds.union(
            mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),
          );
        }
        return bounds;
      }
      object.updateWorldMatrix(true, true);
      return new THREE.Box3().setFromObject(object);
    },
    object: (id) => tree.objects.get(id) ?? null,
    setVisible(id, value) {
      if (isContainer(id)) {
        const key = containerKey(id);
        value
          ? hiddenContainers.delete(key)
          : hiddenContainers.set(key, meshes(id));
        rebuildBlocked();
      } else {
        for (const mesh of meshes(id))
          value ? hidden.delete(mesh) : hidden.add(mesh);
      }
      if (isolated)
        for (const mesh of meshes(id))
          value ? isolated.add(mesh) : isolated.delete(mesh);
      emit();
    },
    isVisible: (id) => meshes(id).some(meshVisible),
    // Own switch state for the browser eye; effective visibility additionally
    // includes parent gates. A child can be changed without reopening its parent.
    visibilityEnabled: (id) =>
      isolated
        ? meshes(id).some(meshVisible)
        : isContainer(id)
          ? !hiddenContainers.has(containerKey(id))
          : meshes(id).some((mesh) => !hidden.has(mesh)),
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
      // Re-picking a selected surface can reveal an alias the reviewer has
      // since collapsed. Selection is navigation, never a visibility reset.
      if (selected === next) {
        if (next) emit("selection");
        return;
      }
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
      hiddenContainers.clear();
      blocked.clear();
      isolated = null;
      emit();
    },
    /* Reset is a viewing action, never an edit. It can preserve an unfinished
       measurement while restoring visibility; ordinary changes still cancel
       stale picks when they expose a different surface. */
    restoreAll({ preserveMeasure = false } = {}) {
      hidden.clear();
      hiddenContainers.clear();
      blocked.clear();
      transparent.clear();
      isolated = null;
      selected = null;
      emit(preserveMeasure ? "reset-view" : "view");
    },
    reset(next) {
      tree = next || { entries: [], objects: new Map(), meshParts: new Map() };
      groups = [];
      groupSignature = "";
      projection = null;
      indexedRows = 0;
      byId = new Map(tree.entries.map((p) => [p.id, p]));
      hidden = new Set();
      hiddenContainers = new Map();
      blocked = new Set();
      transparent = new Set();
      isolated = null;
      selected = null;
      emit();
    },
  };
  return api;
}
