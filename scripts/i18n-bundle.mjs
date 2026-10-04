import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Node discovers feature files from disk in a checkout. The distributable is
   one server file with no source tree, so freeze that discovery into imports
   while bundling. This also keeps adding a feature free of manifest conflicts. */
export const i18nBundlePlugin = {
  name: "meshcue-i18n-features",
  setup(build) {
    build.onLoad({ filter: /[/\\]i18n[/\\]node-features\.js$/ }, () => {
      const root = fileURLToPath(new URL("../src/i18n/", import.meta.url));
      const files = fs
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((dir) =>
          fs
            .readdirSync(path.join(root, dir.name))
            .filter((file) => file.endsWith(".js"))
            .map((file) => `./${dir.name}/${file}`),
        )
        .sort();
      return {
        contents:
          files
            .map((file, i) => `import f${i} from ${JSON.stringify(file)};`)
            .join("\n") +
          `\nexport async function loadFeatures() { return {${files.map((file, i) => `${JSON.stringify(file)}:f${i}`).join(",")}}; }`,
        resolveDir: root,
        loader: "js",
      };
    });
  },
};
