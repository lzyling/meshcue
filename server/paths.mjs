import path from "node:path";

// One containment test for the whole project. A `relative.startsWith("..")`
// spelling misses that "..foo" is a legitimate name and that an absolute
// result also means escape, so it must not be re-derived per call site.
export function within(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}
