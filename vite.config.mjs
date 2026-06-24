import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" is essential. The packaged Electron app loads the production
// build off the filesystem (file://), so every asset URL must be RELATIVE.
// With the default "/" base the app would load a blank white screen inside
// Electron and Snap. strictPort keeps the dev URL stable so the
// "wait-on" step in `npm run dev` always matches.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
  // vitest reads this block automatically — no separate vitest.config needed.
  test: {
    // Default stays "node": the cw-core suite (src/cw-core.test.js) is pure logic
    // with no DOM and no browser APIs, and must keep running exactly as before —
    // 151 tests, green. UI behavior tests opt INTO jsdom per-file with a
    //   // @vitest-environment jsdom
    // pragma at the top of each *.dom.test.jsx file. vitest 4 removed the old
    // `environmentMatchGlobs` option, so the per-file pragma is the supported,
    // minimal way to mix environments without a second config or a projects split.
    environment: "node",
    // The DOM harness setup (Web Audio + matchMedia mocks, jest-dom matchers).
    // setupFiles run for EVERY test file regardless of environment, so the setup
    // is written to no-op when there is no `window` (i.e. the node suite) — see
    // src/test/setup.dom.js. That keeps the node suite's purity intact.
    setupFiles: ["./src/test/setup.dom.js"],
  },
});
