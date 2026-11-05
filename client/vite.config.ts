import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths so the same build loads from file:// inside the desktop app.
  base: "./",
  server: { port: 5173 },
  build: { outDir: "dist", chunkSizeWarningLimit: 2000 },
});
