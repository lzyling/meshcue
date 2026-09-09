import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: { proxy: { "/api": "http://127.0.0.1:43173" } },
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
});
