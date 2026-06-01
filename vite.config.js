import { defineConfig } from "vite";
import { resolve } from "node:path";

const PORT = 5173;

export default defineConfig({
  root: ".",
  base: "/static/dist/",
  server: {
    host: "localhost",
    port: PORT,
    origin: `http://localhost:${PORT}`,
  },
  build: {
    manifest: "manifest.json",
    outDir: resolve(__dirname, "static/dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "assets/main.js"),
      },
    },
  },
});
