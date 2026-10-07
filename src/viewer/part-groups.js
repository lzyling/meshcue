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
    issues = [];
  function alias(part, prefix, parentId, residual = null, member = undefined) {
    const meshIds = residual
      ? part.meshIds.filter((id) => residual.has(id))
      : [...part.meshIds];
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
    entries.push(row);
    if (!firstAlias.has(part.id)) firstAlias.set(part.id, row.id);
    for (const id of part.childIds) {
      const child = alias(byId.get(id), prefix, row.id, residual);
      if (child) row.childIds.push(child.id);
    }
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
    const union = new Set();
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
      row.childIds.push(child.id);
      for (const id of part.meshIds) {
        union.add(id);
        covered.add(id);
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
    native.flatMap((p) => p.meshIds).filter((id) => !covered.has(id)),
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
        if (child) other.childIds.push(child.id);
      }
  }
  return { entries, firstAlias, issues };
}
