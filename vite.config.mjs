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
    // STRUCTURAL FIX landed 2026-07-23 (was a 15s->30s band-aid before this;
    // see git history for that comment if you need the old numbers).
    //
    // Root cause, confirmed in userEvent's own source (dist/cjs/utils/misc/wait.js):
    // userEvent.setup()'s default `delay: 0` still schedules a real
    // `setTimeout(fn, 0)` between every synthetic event; a real setTimeout,
    // however short, competes for the event loop like any other timer, so under
    // CPU contention a contact-drive test's MANY sequential clicks (open+commit a
    // CompactSelect combobox, LISTEN FOR CQ, repeated CONTINUE/CHECK/TRANSMIT)
    // compounded into several extra seconds. `userEvent.setup({ delay: null })`
    // makes `wait()` a same-tick no-op (a non-numeric delay skips the setTimeout
    // entirely) — no DOM events change, only the dead time between them.
    //
    // Applied to the jsdom files that drive part or all of a real QSO contact
    // with real-timer userEvent: progress-qso, qso-live-score, qso-autoadvance,
    // qth-state-fallback, qso-blank-required-element, qso-send-grading, AND
    // cut-number-scoping (a real-clock userEvent drive that idle looked fine at
    // ~1.5s but was carded as a 13.9s-under-load timeout — the delay:null sweep
    // dropped it out of the suite's slowest 12 entirely). No test needed a
    // fake-timer rewrite — qso-autoadvance already switches to vi.useFakeTimers()
    // + fireEvent for its timed windows (never user.* once fake timers are on),
    // so delay:null and that pattern don't collide.
    //
    // Measured with --reporter=json, matching the method the old comment used
    // (idle vs. --maxWorkers=2 + 8 CPU hogs on this 8-core box), 3 repeats each
    // shape to average out scheduler noise:
    //
    //   BEFORE (CI-shaped, maxWorkers=2 + 8 hogs), isolated 6-file runs:
    //     worst single test   8470ms  qth-state-fallback "a state-less QTH..."
    //     sum of all 6 files' durations: 111-125s across 3 runs
    //
    //   AFTER, same shape, same 3-repeat method:
    //     worst single test   6382ms  (same test)               -25% worst-case
    //     sum of all 6 files' durations: 108-112s across 3 runs
    //
    //   AFTER, full 844-test suite, one clean run (815 passed / 29 skipped, as
    //   before — no test lost): worst test in the WHOLE suite is 6406ms, and it
    //   is narrow.dom.test.jsx's "...gives the EASY live 'Sending' readout..." —
    //   NOT one of the six files above. That test keeps one deliberate real
    //   5000ms wait (a DX-step "Get ready" countdown; its own file comment
    //   explains why fake timers would just hang there instead of advancing it),
    //   so it — not the fixed contact-drive band — now sets the suite's floor.
    //
    // 10000ms gives that measured 6406ms worst case a ~56% margin: comfortable
    // headroom for scheduler noise (the repeated runs above varied +/-20% on the
    // same test) without re-opening the old crowded-cap problem. Still a 67%
    // reduction from the prior 30000ms. A wrong assertion still fails in
    // milliseconds; only a genuine hang would ever approach this cap.
    //
    // Cap safety re-verified UNDER LOAD (2026-07-23): a full 844-test run pinned
    // to 2 cores (taskset -c 0,1 — harsher than a real 2-core CI runner, which
    // caps workers rather than over-subscribing) → 815 passed / 0 failed, and the
    // worst test was 5554ms (narrow's deliberate-wait). Every test cleared 10000ms
    // with >=44% margin. Because delay:null removed the CPU-bound userEvent
    // ballooning, only the fixed deliberate waits remain, and a fixed wall-clock
    // wait does not grow under CPU contention — which is why the cap holds.
    testTimeout: 10000,
  },
});
