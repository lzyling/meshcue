/* Agent rows are aliases, not scene objects or new part identities. In
   particular, residual rows intersect native subtrees with uncovered meshes:
   a non-leaf node can own geometry itself, so checking only leaves loses it. */
export function resolvePartGroups(
  groups,
  native,
  identities = new Map(),
  labels = {},
) {
  const byId = new Map(native.map((p) => [p.id, p]));
  const indices = new Map(),
    names = new Map();
  const index = (map, key, part) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(part);
  };
  for (const part of native) {
    const source = identities.get(part.id);
    if (source?.nodeIndex !== undefined) {
      index(indices, source.nodeIndex, part);
      if (source.nodeName) index(names, source.nodeName, part);
    }
  }
  const entries = [],
    covered = new Set(),
    firstAlias = new Map(),
    issues = [],
    aliases = new Map(),
    roots = new Map();
  function alias(part, prefix, parentId, residual = null, member = undefined) {
    const meshIds = residual
      ? part.meshIds.filter((id) => residual.has(id))
      : part.meshIds;
    if (!meshIds.length) return null;
    const row = {
      ...part,
      id: `${prefix}:${part.id}`,
      partId: part.id,
      parentId,
      meshIds,
      childIds: [],
      kind: member ? "member" : "part",
      ...(member ? { member } : {}),
    };
    // Descendants are allocated only on expansion/reveal. In particular, a
    // repeated assembly member shares its mesh collection with the file tree;
    // metadata limits must not multiply the native subtree into browser memory.
    row.hasChildren = part.childIds.some((id) =>
      residual ? byId.get(id).meshIds.some((mesh) => residual.has(mesh)) : true,
    );
    row.collapsedByDefault = row.hasChildren;
    entries.push(row);
    aliases.set(row.id, { row, part, prefix, residual, expanded: false });
    return row;
  }
  function visit(group, parentId) {
    const row = {
      id: `agent-group:${group.id}`,
      name: group.name,
      parentId,
      childIds: [],
      meshIds: [],
      kind: "group",
    };
    entries.push(row);
    const issueStart = issues.length;
    const union = new Set(),
      memberParts = new Set();
    (group.members || []).forEach((member, i) => {
      const matches =
        member.partId !== undefined
          ? byId.has(member.partId)
            ? [byId.get(member.partId)]
            : []
          : member.nodeIndex !== undefined
            ? indices.get(member.nodeIndex) || []
            : names.get(member.nodeName) || [];
      if (matches.length !== 1) {
        const reason = matches.length ? "ambiguous" : "missing";
        const issue = { groupId: group.id, memberIndex: i, member, reason };
        issues.push(issue);
        const child = {
          id: `agent-member:${group.id}:${i}`,
          name: `${JSON.stringify(member)} — ${labels[reason] || reason}`,
          parentId: row.id,
          childIds: [],
          meshIds: [],
          kind: "unresolved",
          reason,
          member,
        };
        entries.push(child);
        row.childIds.push(child.id);
        return;
      }
      const part = matches[0];
      const child = alias(
        part,
        `agent-member:${group.id}:${i}`,
        row.id,
        null,
        member,
      );
      if (!child) return;
      row.childIds.push(child.id);
      if (!roots.has(part.id))
        roots.set(part.id, { child, order: entries.length, residual: null });
      // Repeated selectors remain separate navigation rows, but their mesh
      // union is computed once per native part rather than once per member.
      if (!memberParts.has(part.id)) {
        memberParts.add(part.id);
        for (const id of part.meshIds) {
          union.add(id);
          covered.add(id);
        }
      }
    });
    for (const child of group.children || []) {
      const next = visit(child, row.id);
      row.childIds.push(next.id);
      for (const id of next.meshIds) union.add(id);
    }
    row.meshIds = [...union];
    row.unresolvedMembers = issues.length - issueStart;
    return row;
  }
  for (const group of groups) visit(group, null);
  const residual = new Set(
    native
      .filter((p) => p.parentId === null)
      .flatMap((p) => p.meshIds)
      .filter((id) => !covered.has(id)),
  );
  if (residual.size) {
    const other = {
      id: "agent-other",
      name: labels.other || "Other parts",
      parentId: null,
      meshIds: [...residual],
      childIds: [],
      kind: "other",
    };
    entries.push(other);
    for (const part of native)
      if (part.parentId === null) {
        const child = alias(part, "agent-other", other.id, residual);
        if (child) {
          other.childIds.push(child.id);
          if (!roots.has(part.id))
            roots.set(part.id, { child, order: entries.length, residual });
        }
      }
  }
  function expand(id, included = null) {
    const item = aliases.get(id);
    if (!item || item.expanded) return;
    if (!included) item.expanded = true;
    const existing = new Set(
      item.row.childIds.map((child) => aliases.get(child).part.id),
    );
    for (const childId of item.part.childIds) {
      if (existing.has(childId) || (included && !included.has(childId)))
        continue;
      const child = alias(byId.get(childId), item.prefix, id, item.residual);
      if (child) item.row.childIds.push(child.id);
    }
    const order = new Map(item.part.childIds.map((child, i) => [child, i]));
    item.row.childIds.sort(
      (a, b) =>
        order.get(aliases.get(a).part.id) - order.get(aliases.get(b).part.id),
    );
  }
  // Find the earliest declared member among this part's native ancestors,
  // without pre-indexing every descendant once per duplicate member. Picking
  // materializes just the navigation path, not any sibling subtrees.
  firstAlias.get = (id) => {
    let best = null;
    const path = [];
    for (let part = byId.get(id); part; part = byId.get(part.parentId)) {
      path.push(part);
      const root = roots.get(part.id);
      if (
        root &&
        (!root.residual || part.meshIds.some((m) => root.residual.has(m))) &&
        (!best || root.order < best.root.order)
      )
        best = { root, length: path.length };
    }
    if (!best) return undefined;
    let row = best.root.child;
    for (let i = best.length - 2; i >= 0; i--) {
      expand(row.id, new Set([path[i].id]));
      row = entriesById(
        row.childIds.find(
          (child) => aliases.get(child)?.part.id === path[i].id,
        ),
      );
      if (!row) return undefined;
    }
    return row.id;
  };
  function entriesById(id) {
    return aliases.get(id)?.row;
  }
  return { entries, firstAlias, issues, expand };
}
