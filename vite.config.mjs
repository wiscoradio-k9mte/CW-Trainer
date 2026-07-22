import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
// Read the version once at build time. Exposed as __APP_VERSION__ so the
// component can display it without a network fetch or a hardcoded string.
// The 2.0.0 bump is Travis's call — the define just tracks whatever package.json
// has, so the display stays accurate on every future bump too.
const pkg = require("./package.json");

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
  // Inject build-time constants. __APP_VERSION__ is a string literal baked in
  // at bundle time — no runtime lookup needed.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
    // The QSO-flow jsdom tests drive a full multi-step contact with REAL timers
    // and userEvent (no fake clock), so they legitimately take several seconds —
    // and more under the parallel run's CPU contention. The CompactSelect setup
    // (open + commit a combobox) adds a small real-time cost per selection, which
    // pushed the heaviest contact-drive test past the 5s default. 15s gives these
    // real-timer integration tests headroom; a logic error still fails fast (as a
    // wrong assertion), so this doesn't mask a hang — it only absorbs contention.
    //
    // RAISED 15s -> 30s, 2026-07-22, on MEASURED evidence rather than a hunch.
    // The problem is not one flaky test, it is a BAND of them crowding the cap.
    // Measured with --reporter=json across three pool shapes:
    //
    //   idle, 8 workers   87s   green   worst: progress-qso "...EASY contact
    //                                   writes exactly one qso record"  6380ms
    //   + 8 CPU hogs      267s  2 TIMEOUTS  that same test at 15101ms, and
    //                                   qso-autoadvance [AL-LAST] at 15251ms
    //   --maxWorkers=2    479s  green   worst: qso-autoadvance [AO] "reminder
    //     (CI-shaped)                   appears on second consecutive completed
    //                                   contact"  13497ms  <- 10% margin
    //
    // 14 tests exceed 4s idle; 47 exceed 8s under load; 12 exceed 12s. At
    // CI-shaped parallelism the worst sits 10% under the cap, which is a
    // scheduled outage, not bad luck. Four independent observers (two gates,
    // two implementers) hit spurious reds within one day, each a different
    // test, each a pure "Test timed out" with NO assertion involved.
    //
    // Why this cannot mask a defect: a wrong assertion still fails instantly.
    // Only a genuine HANG takes longer -- the same argument this file already
    // makes for the 5s -> 15s bump above.
    //
    // This is the CHEAP mitigation, not the fix. The structural fix is fake
    // timers on the drive-a-whole-contact tests; it is carded, not done.
    testTimeout: 30000,
  },
});
