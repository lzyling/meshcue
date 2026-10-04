import { readdir } from "node:fs/promises";

// Kept outside the browser graph: server calls and Node checks need the same
// folder discovery as Vite, without making the browser fetch any catalogue.
export async function loadFeatures() {
  const root = new URL("./", import.meta.url),
    features = {};
  for (const dir of await readdir(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const file of await readdir(new URL(`${dir.name}/`, root))) {
      if (!file.endsWith(".js")) continue;
      const relative = `./${dir.name}/${file}`;
      features[relative] = (await import(new URL(relative, root))).default;
    }
  }
  return features;
}
