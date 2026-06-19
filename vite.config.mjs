import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" is essential. The packaged Electron app loads the production
// build off the filesystem (file://), so every asset URL must be RELATIVE.
// With the default "/" base the app would load a blank white screen inside
// Electron, Snap, and Flatpak. strictPort keeps the dev URL stable so the
// "wait-on" step in `npm run dev` always matches.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
  // vitest reads this block automatically — no separate vitest.config needed.
  // environment: "node" because every test target is pure logic (no DOM, no browser APIs).
  test: { environment: "node" },
});
