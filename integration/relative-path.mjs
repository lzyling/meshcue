import path from "node:path";

// Agent-visible workspace paths are portable identifiers, not native filenames.
// Only replace the native separator: a backslash is a valid POSIX filename byte.
export function workspaceRelative(root, target, paths = path) {
  return paths.relative(root, target).split(paths.sep).join("/");
}

// Older Windows registries used native separators. Normalize records on read,
// before containment checks, comparisons or agent-visible diagnostics.
export function normalizeRegistryPaths(registry) {
  for (const item of Object.values(registry.projects)) {
    for (const key of ["project", "runtime"])
      if (typeof item[key] === "string")
        item[key] = item[key].replaceAll("\\", "/");
  }
  return registry;
}
