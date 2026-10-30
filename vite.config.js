import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { LICENSE_FILE, licenseFile } from "./scripts/third-party-licenses.mjs";

// One source for the version the user sees. The packaging step overrides it
// with the plugin's own version so a shipped bundle cannot advertise the
// project's number while the server and manifest report another.
const version =
  process.env.MESHCUE_VERSION ||
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))
    .version;

/* What the minified bundle no longer says about the code inside it is written
   beside it, as THIRD_PARTY_LICENSES.md at the top of the output. Vite's own
   `build.license` would write a similar file, but it lists only the main
   bundle's chunks, so a dependency reached only from a worker would go
   unlisted, and it credits a library one package carries for another (three's
   copy of the meshoptimizer decoder) to the carrier. The service serves the
   output directory as it is, so the file is also readable next to the code the
   browser downloads; that is the copy the licences ask it to accompany. */
const workerModules = new Set();
const modulesOf = (bundle) =>
  Object.values(bundle).flatMap((chunk) =>
    chunk.type === "chunk" ? chunk.moduleIds : [],
  );
const thirdPartyLicenses = {
  name: "meshcue-third-party-licenses",
  apply: "build",
  generateBundle(_, bundle) {
    this.emitFile({
      type: "asset",
      fileName: LICENSE_FILE,
      source: licenseFile([...workerModules, ...modulesOf(bundle)], {
        scope: "This web app",
        copied: true,
      }).text,
    });
  },
};

export default defineConfig({
  define: { __MESHCUE_VERSION__: JSON.stringify(version) },
  plugins: [thirdPartyLicenses],
  // Workers are bundled on their own, ahead of the page that starts them.
  worker: {
    plugins: () => [
      {
        name: "meshcue-worker-modules",
        generateBundle(_, bundle) {
          for (const id of modulesOf(bundle)) workerModules.add(id);
        },
      },
    ],
  },
  base: "./",
  server: { proxy: { "/api": "http://127.0.0.1:43173" } },
  build: {
    target: "es2022",
    // One entry chunk is what this viewer needs before its first frame: three.js
    // itself (about 590 kB), every interface catalogue (about 240 kB; shipped
    // eagerly on purpose, see src/i18n/index.js) and the viewer and shell code.
    // Meshopt, the one large rarely used part, is loaded on demand. Deferring
    // every tool a session might never open (measuring, section, explode, first
    // use hints: about 70 kB) and even the help text would still leave the
    // entry above 1,100 kB, and a vendor split only moves bytes the first frame
    // still waits for, served by the local MeshCue service. The limit sits just
    // above today's entry so it still flags an unexpected addition.
    chunkSizeWarningLimit: 1300,
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
