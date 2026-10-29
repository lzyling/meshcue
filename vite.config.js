import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// One source for the version the user sees. The packaging step overrides it
// with the plugin's own version so a shipped bundle cannot advertise the
// project's number while the server and manifest report another.
const version =
  process.env.MESHCUE_VERSION ||
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))
    .version;

export default defineConfig({
  define: { __MESHCUE_VERSION__: JSON.stringify(version) },
  base: "./",
  server: { proxy: { "/api": "http://127.0.0.1:43173" } },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        // The vendored Draco decoder is CommonJS for the service, and a static
        // host types `.cjs` as application/node; a worker's importScripts
        // refuses that under nosniff. The bytes are unchanged, only the name.
        assetFileNames: ({ names }) =>
          names.some((name) => name.endsWith(".cjs"))
            ? "assets/[name]-[hash].js"
            : "assets/[name]-[hash][extname]",
      },
    },
  },
});
