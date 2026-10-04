import { Group } from "three";

/* CAD exports often carry construction lines beside their surfaces. Removing
   them before fitting matters as much as hiding them: a distant construction
   point would otherwise shrink the part, and only triangle meshes have source
   faces that a mark can name. GLTFLoader already triangulates strips and fans.

   Loader caches can share geometry, materials and textures with retained
   objects. Dispose only resources no retained object uses, once each, so
   dropping a line cannot invalidate the surface beside it. */
export function removeNonTrianglePrimitives(root) {
  const removed = [];
  root.traverse((object) => {
    // Short strips/fans become an empty index. Keeping one would make the
    // review tessellator fall back to its unused vertices and invent faces.
    if (
      object.isLine ||
      object.isPoints ||
      (object.isMesh && object.geometry.index?.count === 0)
    )
      removed.push(object);
  });
  for (const object of removed) {
    if (object.children.length && object.parent) {
      // A glTF node can carry construction geometry AND child surface nodes.
      // Preserve its local transform and traversal position without its draw
      // object, so removing the parent never removes or renumbers those faces.
      const parent = object.parent,
        index = parent.children.indexOf(object);
      const group = new Group().copy(object, false);
      for (const child of [...object.children]) group.add(child);
      parent.add(group);
      parent.children.splice(parent.children.indexOf(group), 1);
      parent.children.splice(index, 0, group);
    }
    object.removeFromParent();
  }
  const resources = (objects) => {
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    for (const object of objects) {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material))
          if (value?.isTexture) textures.add(value);
      }
    }
    return { geometries, materials, textures };
  };
  const retained = [];
  root.traverse((object) => retained.push(object));
  const kept = resources(retained),
    discarded = resources(removed);
  for (const kind of ["geometries", "materials", "textures"])
    for (const resource of discarded[kind])
      if (!kept[kind].has(resource)) resource.dispose();
  const keptImages = new Set([...kept.textures].map((t) => t.source?.data));
  const closed = new Set();
  for (const texture of discarded.textures) {
    const data = texture.source?.data;
    if (data && !keptImages.has(data) && !closed.has(data)) {
      data.close?.();
      closed.add(data);
    }
  }
}
