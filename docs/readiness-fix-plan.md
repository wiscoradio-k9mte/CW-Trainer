# CW Trainer — Readiness Fix Plan

Status: design only. Implementer executes against this; no app source changed in writing it.
The app builds clean today. The whole UI + logic lives in one file, `wr-cw-trainer.jsx`
(2253 lines), mounted by `src/main.jsx`, bundled by Vite. Line numbers below are
anchors against that file at the time of writing; the implementer should match on the
quoted code, not trust the number blindly if the file has shifted.

This plan is three buckets that **must be sequenced**: A (test baseline) before B
(accessibility, which churns the UI), B before/with C (onboarding). The reason for the
order is in "Sequencing & hazards" at the end. Read that section before starting.

A standing principle for the whole job: **behavior stays byte-identical except where a
bucket explicitly changes it.** Bucket A must not alter a single character of runtime
behavior — it only relocates pure functions so tests can import them. If A changes
behavior, the baseline it establishes is worthless.

---

## BUCKET A — Testability + test suite (do first)

### A0. The load-bearing decision: extract to `src/cw-core.js`, do not export from the JSX

**Decision: move the pure correctness-core functions into a new module
`src/cw-core.js`, and import them back into `wr-cw-trainer.jsx`.** The component file
imports the named exports and deletes its local copies. The JSX keeps every React
component, the audio engine, the keyer hook, and all UI.

**Why this over the alternative (adding `export` keywords in the JSX and importing the
`.jsx` into tests):**

- Importing a `.jsx` full of React, Web Audio, and `window`/`AudioContext` references
  into a Node/jsdom test runner drags the entire component tree and the audio engine
  into the test's module graph. Even with jsdom, `new AudioContext()` and the
  `window`-level keydown listeners are hostile to a clean unit test. A pure `.js`
  module with zero React and zero browser imports loads instantly and tests nothing
  but the math.
- It isolates the regression surface. The functions that move are pure and
  self-contained; moving them is a cut-and-paste with an import added, which is far
  lower risk on a 2253-line file than sprinkling `export` across it and leaving
  everything entangled.
- It reads cleanly: "the correctness core" becomes a named, testable thing a newcomer
  can open on its own. That matches the doctrine's legibility bar.

**The cost / tradeoff:** one new file and one import line, and the implementer must
verify the moved functions had no hidden dependency on something left behind in the
JSX (see the dependency check below). That cost is small and one-time.

#### Exact exported surface of `src/cw-core.js`

Move these, in this order (they have internal dependencies — keep the order so each is
defined before it is used):

| Symbol | Current location | Kind |
|---|---|---|
| `MORSE` | ~:32 | const object |
| `REV` | ~:42 (`Object.fromEntries(... MORSE ...)`) | derived const |
| `COMMON_WORDS` | ~:44 | const array |
| `QSO_PHRASES` | ~:45 | const array |
| `stateOf` | ~:47 | fn |
| `subTokens` | ~:52 | fn |
| `DX_PREFIXES` | ~:59 | const array |
| `IOTA_DX_PREFIXES` | ~:60 | const array |
| `NAMES` | ~:61 | const array |
| `QTHS` | ~:62 | const array |
| `RSTS` | ~:63 | const array |
| `KOCH` | ~:67 | const array |
| `glyphs` | ~:68 | fn |
| `SUMMITS` | ~:195 | const array |
| `IOTA_REFS` | ~:196 | const array |
| `randPark` | ~:197 | fn (uses `Math.random`) |
| `cutNum` | ~:199 | fn |
| `rand` | ~:201 | fn (uses `Math.random`) |
| `randCall` | ~:202 | fn (uses `Math.random`, default param `DX_PREFIXES`) |
| `timing` | ~:215 | fn |
| `similarity` | ~:701 | fn |
| `buildRagchew` | ~:1158 | fn |
| `buildPota` | ~:1199 | fn |
| `buildSota` | ~:1240 | fn |
| `buildIota` | ~:1280 | fn |
| `buildQso` | ~:1319 | fn |
| `isReadyToAdvance` | NEW — see A1 | fn |

Each becomes `export const` / `export function`. `REV` must be defined after `MORSE` in
the new file; the four QSO builders and `buildQso` depend on `randCall`, `rand`,
`cutNum`, `stateOf`, and the data arrays, so those must precede them.

**Data arrays that are referenced ONLY by UI rendering may stay in the JSX** — do not
move things the tests don't need and the core functions don't use. Specifically `LINGO`,
`CQ_ANATOMY`, `QSO_WALKTHROUGH`, `POTA_WALKTHROUGH`, `HISTORY`, `COPY_LEVELS` stay in
the JSX. Moving them adds surface for no test benefit. (If the implementer finds one of
the moved functions references one of these, stop and flag it — it would mean a function
isn't as pure as assumed.)

#### How the component re-imports (so behavior is byte-identical)

At the top of `wr-cw-trainer.jsx`, after the React import (~:1), add one import naming
every moved symbol that the component still uses:

```js
import {
  MORSE, REV, COMMON_WORDS, QSO_PHRASES, stateOf, subTokens,
  DX_PREFIXES, IOTA_DX_PREFIXES, NAMES, QTHS, RSTS, KOCH, glyphs,
  SUMMITS, IOTA_REFS, randPark, cutNum, rand, randCall, timing, similarity,
  buildRagchew, buildPota, buildSota, buildIota, buildQso, isReadyToAdvance,
} from "./src/cw-core.js";
```

Note the path: the JSX sits at repo root, the module under `src/`, so the import is
`"./src/cw-core.js"`. The implementer must confirm the relative path resolves from the
JSX's actual location (it is imported by `src/main.jsx` as `"../wr-cw-trainer.jsx"`, so
the JSX is at repo root — `./src/cw-core.js` is correct).

Then **delete the original definitions** from the JSX. Do not leave them shadowed —
duplicate top-level `const`/`function` of the same name in the same module is either a
redeclare error or silent shadowing, both wrong. The acceptance check is that each moved
symbol appears exactly once in the codebase: as an export in `cw-core.js`.

#### Dependency check before deleting (implementer must do this)

For each moved function, grep the JSX for any identifier it references that is NOT in
the moved set and NOT a JS builtin (`Math`, `Object`, `Array`, `String`). The candidates
are clean by inspection — `randPark`, `rand`, `randCall` use only `Math.random`;
`subTokens` takes `settings` as a parameter (not a closure); the builders take a profile
object as a parameter. But the implementer must verify, because a single missed closure
reference turns a silent extraction into a runtime `ReferenceError` that the build won't
catch until that code path runs.

#### Acceptance criteria (A0) — test-qa checks

- `src/cw-core.js` exists and exports exactly the surface listed above.
- `wr-cw-trainer.jsx` contains no local definition of any moved symbol (each name
  resolves to the import).
- `npm run build` (`vite build`) still succeeds.
- The app runs and every tab behaves as before — the human/QA does a smoke pass of
  LEARN drill, COPY, KEY, QSO. This is the byte-identical-behavior gate; without it,
  "tests pass" only proves the extracted copy works, not that the app still uses it
  correctly.

### A1. Extract the Koch advancement gate to `isReadyToAdvance(history)`

Currently inline in `LearnTab` at ~:1867:

```js
const ready = attempts >= 20 && accuracy >= 90;
```

where `attempts = history.length` (~:1865) and `accuracy` is
`Math.round((history.filter(Boolean).length / attempts) * 100)` with a 0-guard (~:1866).

**Change:** add to `cw-core.js`:

```js
// history is an array of booleans (true = correct answer). Advance when the
// learner has done at least 20 reps AND is at >= 90% rounded accuracy — the
// classic Koch gate.
export function isReadyToAdvance(history) {
  const attempts = history.length;
  if (attempts < 20) return false;
  const accuracy = Math.round((history.filter(Boolean).length / attempts) * 100);
  return accuracy >= 90;
}
```

The predicate must reproduce the **existing rounding** (`Math.round`) so the boundary
behaves identically — this matters for the 89/90/91 tests below. In `LearnTab`, replace
the inline `ready` with `const ready = isReadyToAdvance(history);`. Keep `attempts` and
`accuracy` as locals where they're still used for display (~:1980 shows `accuracy% ·
attempts/20`); `isReadyToAdvance` does not change those display lines.

**Acceptance (A1):** `ready` in `LearnTab` is computed by `isReadyToAdvance(history)`;
display of `accuracy`/`attempts` unchanged; the NEXT LESSON button (~:2009) still gates
on `ready`.

### A2. vitest setup

Add the dev dependency and config. vitest is the right choice — it shares Vite's
transform pipeline, so the same module resolution that builds the app runs the tests; no
separate Babel/Jest config to drift.

- **Dev dependency:** `vitest` (pin a current 2.x/3.x line compatible with the
  installed Vite 8; implementer picks the version that resolves against Vite 8 and
  records it). No jsdom environment is needed — every test target is pure logic, so the
  default `node` environment is correct and faster. Do NOT pull in
  `@testing-library/react`; there are no component tests in this bucket and adding it is
  scope creep.
- **Config:** vitest reads `vite.config.*` automatically. Add a `test` block (either in
  the existing Vite config or a `vitest.config.js`) with `environment: "node"`. Keep it
  minimal.
- **package.json script:** add `"test": "vitest run"` and optionally
  `"test:watch": "vitest"`. `vitest run` is the CI/gate form (exits non-zero on
  failure); the watch form is for the implementer's loop.
- **Test file location:** `src/cw-core.test.js` (co-located, single file is fine for
  this surface; split only if it gets unwieldy).

### A3. The test assertions

One file, `src/cw-core.test.js`, importing from `./cw-core.js`. Required cases:

**MORSE round-trip**
- For every key `ch` in `MORSE`: `REV[MORSE[ch]] === ch`. (Confirms the reverse map is
  total and collision-free over the defined alphabet.)
- Spot-check a few: `MORSE.A === ".-"`, `MORSE[0] === "-----"`, `MORSE["?"] === "..--.."`.

**similarity()**
- Identity: `similarity("PARIS", "PARIS") === 1`.
- Empty/empty: `similarity("", "") === 1` (matches the `if (!a && !b) return 1` guard).
- One empty: `similarity("ABC", "") === 0` and `similarity("", "ABC") === 0`.
- Transposition / one-edit: `similarity("ABC", "ACB")` is strictly between 0 and 1, and
  less than 1. (Levenshtein-based; exact value is `1 - 2/3` ≈ 0.333 for that pair —
  assert `closeTo` 0.3333 rather than exact float, or assert the bounds. Implementer
  picks; bounds are the safer assertion.)
- Case/whitespace normalization: `similarity("cq  cq", "CQ CQ") === 1` (the function
  uppercases and collapses runs of whitespace).

**timing()**
- When `effWpm === charWpm`, the Farnsworth branch is skipped, so `charSp === 3*u` and
  `wordSp === 7*u` where `u === 1.2/charWpm`. Assert for e.g. `timing(20, 20)`:
  `charSp` `closeTo` `3 * (1.2/20)` and `wordSp` `closeTo` `7 * (1.2/20)`. Use
  `closeTo` (floating point).
- When `effWpm < charWpm` (e.g. `timing(20, 8)`): `charSp` and `wordSp` are larger than
  the `eff===char` values (gaps stretched) while `u` is unchanged. Assert
  `charSp > 3*u` and the ratio `wordSp/charSp` `closeTo` `7/3` (the formula keeps the
  3:7 ratio).

**QSO builders — structure + mustContain**
For each of `buildRagchew`, `buildPota`, `buildSota`, `buildIota`, called with a fixed
profile (e.g. `{ myCall: "K9MTE", myName: "TRAVIS", myQth: "MADISON WI", cut: false }`):
- Returns an object with `dx` (string), `flavor` (the expected literal: `"RAGCHEW"`,
  `"POTA"`, `"SOTA"`, `"IOTA"`), `summary` (non-empty string), and `steps` (array).
- `steps.length === 5` for ragchew? — **No: ragchew has 5 steps, pota/sota/iota have 5
  each too.** Confirm against source: ragchew `steps` ~:1167 has 6 entries? Count in
  source — ragchew has 6 steps (dx, you, dx, you, dx... re-count). **Implementer:
  assert the actual count by reading the array, do not trust this sentence.** The robust
  assertion is structural, below, not a magic number — but pin the count once verified.
- Every step has a `who` of either `"dx"` or `"you"`.
- Every `dx` step has a non-empty `text` string. Every `you` step has a `suggested`
  string, a `prompt` string, and a `mustContain` array of non-empty strings.
- **mustContain integrity:** for each `you` step, every entry in `mustContain` actually
  appears as a substring of that step's `suggested` text. (This is the property the QSO
  grader relies on — if a `mustContain` token isn't in the suggested answer, the grader
  is checking for something the model answer doesn't contain.) Assert
  `step.suggested.includes(token)` for every token.
- `mustContain` includes `myCall` where the profile call is used (ragchew step 2, pota
  step 2, etc.) — verify `myCall` propagates: the returned object's strings contain
  `"K9MTE"`.

**cut numbers** (bonus, cheap and catches a real bug class)
- `buildPota({ ..., cut: true })` — the `dx`/`you` report text contains `5NN` or `N`/`T`
  cut forms and no bare `599`/`0` in the cut fields. Minimal assertion: the suggested
  text for the report step contains `"5NN"` when `cut: true`. (`cutNum("599", true)`
  → `"5NN"`.)

**isReadyToAdvance() — boundaries**
Build helper arrays of booleans:
- 19 attempts all correct → `false` (below the 20-rep floor even at 100%).
- 20 attempts all correct → `true`.
- 20 attempts at exactly 90% (18 true, 2 false → 90%) → `true`.
- 20 attempts at 89% — note 89% is not reachable with 20 reps (5% granularity), so test
  the rounding edge instead: an accuracy that rounds to 89 vs 90. Use a 100-rep array:
  89 true / 100 → `false`; 90 true / 100 → `true`; 91 true / 100 → `true`. This nails
  the 89/90/91 boundary the brief calls for and exercises the `Math.round` path.
- Empty history → `false` (0 attempts).

**Acceptance (A2/A3):** `npm test` runs vitest and all cases pass; each test would fail
if its target behavior regressed (e.g. flipping the `>= 90` to `> 90` breaks the 90%
case; dropping a `mustContain` token from a builder breaks the integrity test).

---

## BUCKET B — Accessibility (do after A's baseline is green)

These are DOM/markup changes inside the components. None of them touch the pure core, so
the Bucket A tests stay green throughout — that is the safety net. After B, re-run
`npm test` to confirm no accidental core edit, and smoke-test with keyboard + a screen
reader.

### B1. Live regions for drill feedback and accuracy

- **Drill feedback display** (~:1984, the `S.display` box showing `✓` / `✗ char glyphs`
  / `LISTEN...`): add `aria-live="polite"` and `aria-atomic="true"` to the container
  `div`. The visual content is unchanged; the attributes make a screen reader announce
  each result as it flips. `polite` (not `assertive`) so it queues behind the user's own
  input rather than interrupting.
- **Live accuracy counter** (~:1979, the `accuracy% · attempts/20` span): wrap or
  annotate so it announces on change. Give it `aria-live="polite"` and an
  `aria-label` that reads naturally, e.g. `aria-label={`${accuracy} percent, ${attempts}
  of 20`}` — the raw `90% · 18/20` reads poorly aloud. Keep the visible text as-is.
- **CopyTrainer `Score`** (~:863) and the live accuracy there: same treatment —
  `aria-live="polite"` on the result region so a copy attempt's score is announced.
  (Sam flagged drill specifically; Score is the same pattern and cheap — include it, and
  note it as a small scope addition in the status report.)

**Acceptance (B1):** with a screen reader, completing a drill answer announces the
result; the accuracy/score updates are announced; no visual change.

### B2. TouchKey and PaddleKey — make them real controls without breaking the keyer

This is the trickiest change. Read it fully before touching code.

**The conflict.** TouchKey (~:756) and PaddleKey zones (~:778) are `<div>`s driven by
`onPointerDown`/`onPointerUp` with pointer capture. They are invisible to keyboard and
AT. Meanwhile a **window-level** `keydown`/`keyup` handler in `useKeyer` (~:662–688)
already implements keyboard keying: Space for straight key, Z/X/Arrows for paddle. That
handler ignores events whose target is an `INPUT`/`TEXTAREA` (~:658–661) and ignores
`e.repeat`.

If the implementer naively converts these `div`s to `<button>`s, a focused button
pressed with Space or Enter will fire **twice**: once via the browser's native button
activation (a synthetic click / the button's own keydown behavior) and once via the
window keydown handler. That double-fire would send a spurious dit/dah. This is exactly
the hazard the brief calls out.

**Chosen approach: ARIA-annotated `div`s (role="button" + tabIndex + aria-label), NOT
native `<button>`, and keep keying on the existing window handler.**

Rationale: a native `<button>` brings its own Space/Enter activation semantics that
collide with the window keyer and are awkward for a press-and-hold instrument (a button
"clicks" on key-up, but keying needs separate down/up). The control here is not a
click-once button; it is a momentary contact. ARIA role="button" on the existing div
gives AT users the right announcement and focusability while leaving the
pointer-and-window-key model intact.

Concretely, for **TouchKey** (~:756) and each **PaddleKey zone** (~:780):

1. Add `role="button"`, `tabIndex={0}`, and a descriptive `aria-label`
   (TouchKey: `"Straight key — press and hold Space, or hold this control, to send"`;
   paddle dit zone: `"Dit paddle — press and hold Z or left arrow"`; dah:
   `"Dah paddle — press and hold X or right arrow"`). The aria-label is what an AT user
   hears; make it state the keyboard shortcut so a screen-reader user knows the real
   input path is the keyboard, which already works.
2. Keep the pointer handlers exactly as they are (they are the touch/mouse path and work
   today).
3. **Keyboard activation on the control itself:** the existing window handler ALREADY
   handles Space/Z/X/Arrows globally, so a keyboard user does not need the focused
   control to also respond — pressing Space anywhere on the KEY tab already keys. To
   avoid the double-fire, **do NOT add onKeyDown/onKeyUp to the control for the same keys
   the window handler owns.** The control becomes focusable and announced; the actual
   keying stays with the one window handler that already has the down/up + repeat-guard
   logic. This is the simplest correct design: one keyer code path, not two.
   - The window handler's `inField` guard (~:658) only skips INPUT/TEXTAREA, so a focused
     `role="button"` div does NOT get skipped — Space still reaches the keyer. Good.
   - One wrinkle: a `tabIndex={0}` element with `role="button"` may itself scroll the
     page on Space in some browsers. The window keydown handler already calls
     `e.preventDefault()` for Space in straight mode (~:665), which suppresses that
     scroll. Verify this holds when the div is focused; if a browser still scrolls,
     the fix is to ensure the window handler's `preventDefault` runs (it should, being
     window-level capture-agnostic). Do NOT add a competing handler on the div.
4. **Discoverability:** the existing helper text under TouchKey ("hold to send — or use
   SPACEBAR", ~:773) and PaddleKey ("Keyboard: Z / ← ... X / →", ~:807) already documents
   the keys. Keep it; it now matches the aria-labels.

**Why not also wire Enter on the control?** Enter has no role in keying and the window
handler doesn't listen for it; leaving it unbound avoids inventing a third activation
that would only confuse. If a reviewer insists keyboard users must be able to key *from
the focused control specifically* rather than from the global handler, that is a
**product decision** (see Decisions section) — the global handler already makes the app
fully keyboard-operable, so the marginal value is low and the double-fire risk is real.

**Acceptance (B2):** TouchKey and both paddle zones are reachable by Tab and announced
by a screen reader with a label that names the keyboard shortcut; pressing Space (straight)
or Z/X (paddle) keys the tone exactly once per press (no double dit/dah); pointer/touch
keying is unchanged; the Bucket A tests are still green (no core touched).

### B3. Labels and states on the remaining controls

- **Slider** (~:843): the visible `label` text is a `<span>` not associated with the
  `<input type="range">`. Add `aria-label={label}` to the range input (simplest — no DOM
  restructure, no `id` plumbing). The visible label span stays for sighted users.
- **Gear / settings button** (~:2222, `⚙`): add `aria-label="Settings"` and
  `aria-expanded={showSettings}` (it toggles the settings panel — `aria-expanded`
  communicates open/closed state to AT). The glyph alone announces as nothing useful.
- **Lesson arrows** (~:1940–1943, `←` / `→`): add `aria-label="Previous lesson"` and
  `"Next lesson"` respectively. Glyph-only buttons are unlabeled today.
- **Tab buttons** (main nav ~:2228, and the LearnTab section tabs ~:1922): these are a
  tablist pattern — selected tab is styled but not announced as selected. The minimal,
  legible fix is `aria-pressed={tab === v}` on each (toggle-button semantics), which
  every screen reader announces, without the full `role="tablist"/"tab"/"tabpanel"`
  plumbing (which would require `id`/`aria-controls` wiring across the panels and is more
  churn than warranted). Apply the same `aria-pressed` to the difficulty buttons in
  CopyTrainer and the keyType/RX-filter/cut-number toggle buttons — they are all
  styled-selected-but-unannounced.
  - Tradeoff noted: `aria-pressed` (toggle button) vs `role="tab"` (tablist) is a real
    fork. `aria-pressed` is simpler and correct enough for this app's needs; full
    tablist gives arrow-key navigation between tabs but costs significant wiring.
    Recommend `aria-pressed`; flag tablist as available if a reviewer wants richer
    keyboard nav (Decisions section).

**Acceptance (B3):** every interactive control has an accessible name when inspected via
AT; toggle/selected controls announce their pressed/expanded state; no visual change.

### B4. Fonts: hard-coded px → rem on the core path

The shared `S` object (~:738) and many inline styles use raw `px` font sizes. Hard px
ignores the user's browser font-size preference (an accessibility and low-vision issue).

**Strategy — minimal, layout-safe:**

1. Set a base on the root: in the app's outermost container (~:2209) or via the existing
   `<style>` block (~:2210), ensure the root font-size is the browser default (do not
   pin `html { font-size: }` to a fixed px — that would re-defeat user scaling). The rem
   base is the user's chosen size.
2. Convert the **core-path** font sizes in `S` to rem at a 16px reference: `fontSize:
   11` → `"0.6875rem"`, `14` → `"0.875rem"`, `18` → `"1.125rem"`, `20` → `"1.25rem"`.
   Specifically convert `S.label` (11), `S.btn`/`S.btnAmber` (14), `S.display` (20),
   `S.input` (18). These are the shared styles that propagate everywhere.
3. **Do NOT convert every inline px in the file** in this pass — that is a large, low-
   value sweep and a regression risk on a 560px layout. Convert the shared `S` sizes
   (which dominate the UI) plus the drill feedback sizes on the LEARN core path (the
   34px feedback glyph ~:1984, the `LISTEN...` 16px). Note the rest as a follow-up.
4. **Protect the 560px layout** (~:2211, `maxWidth: 560`): keep the container max-width
   in **px** — it is a layout boundary, not text, and converting it to rem would let the
   column grow with font scaling and break the design. Same for fixed structural
   paddings, gaps, border-radius: leave those px. Only **font sizes** go to rem.
   This is the rule that keeps the layout from blowing up: text scales, the frame
   doesn't.

**Acceptance (B4):** raising the browser's default font size scales the app's text
(labels, buttons, display, input, drill feedback) proportionally; the 560px column does
not widen; no overflow/clipping of buttons at the default size. The Bucket A tests are
untouched.

### B5. Contrast: replace the failing hint-text color

`#5A626C` is used for hint/help text on the dark `#1E2228` panel and `#14161A` page
background (e.g. ~:807, :835, :969, :1969, :2057, :2082, :2098, :2101, footer :2242).
Against those backgrounds it falls below the WCAG AA 4.5:1 ratio for normal text.

**Replacement:** raise to **`#8A929C`** (the color already used for `S.label` secondary
text, ~:740) for hint/help body text, OR a dedicated `#9AA2AC` if `#8A929C` still misses
4.5:1 against `#1E2228`. Implementer must **measure** the chosen value against both
backgrounds (`#1E2228` panels and `#14161A` page) with a contrast checker and pick the
lowest value that clears 4.5:1 on both — do not guess. `#8A929C` on `#1E2228` is the
first candidate to measure; if it clears, use it for consistency with existing label
color. Apply by replacing `#5A626C` where it is used for **readable text**; the footer's
decorative `#3A434E` (~:2245) and similar pure-decoration uses can stay if they are not
information-bearing — flag any borderline case rather than deciding silently.

**Acceptance (B5):** all information-bearing hint/help text meets ≥ 4.5:1 against its
actual background, verified with a contrast tool; the chosen replacement value is
recorded in the status report.

---

## BUCKET C — Onboarding (do after/with B)

These add affordances and copy. Some are genuine product decisions on wording and
thresholds — those are flagged. The implementer should not invent product policy.

### C1. Drill "cliff" — a path forward after a sub-90% set (Dale)

Today (LearnTab ~:1975–2015): while drilling, the NEXT LESSON button only appears when
`ready` is true (≥20 reps & ≥90%). A learner who does 20+ reps and lands below 90% gets
nothing — the drill just keeps looping silently. That is the cliff.

**Change:** when `attempts >= 20 && !ready` (i.e. they've done a full set but missed the
bar), render a small panel BELOW the answer grid (sibling to the `ready` button block at
~:2009) with: the current accuracy, an encouraging plain-language line, and an explicit
choice. Use `isReadyToAdvance` for the gate so the threshold stays single-sourced.
Affordances:
- A "Keep drilling" continuation (the drill already continues — make it explicit that
  more reps will raise the rolling accuracy, since history is a sliding window of 25).
- A clear statement of what's needed: "X% over your last set — reach 90% to unlock the
  next character." (The rolling window means accuracy can recover with good reps; say so.)

**Product decision flagged:** whether to also offer a "review the characters" shortcut
(jump back to the char chart / replay the new chars) or a "drop back a lesson" option is
a pedagogy choice. Recommend the simple "keep going, here's your number, here's the bar"
panel; flag the richer remediation as a product call.

**Acceptance (C1):** after completing ≥20 reps below 90%, the drill shows the learner's
accuracy and a plain statement of the bar plus a continue affordance — it does not loop
silently with no feedback. Threshold computed via `isReadyToAdvance`.

### C2. Placement — jump-to-lesson + "skip ahead" affordance (Carol/Marcus)

Today lesson is changed only by the `←`/`→` arrows (~:1940), one step at a time, from
lesson 1. A learner who already knows some Morse must click `→` many times.

**Change (near the lesson arrows, ~:1937–1945, in the not-drilling panel):**
- Add a **jump-to-lesson number input** (1..`maxLesson`), so a user can type a lesson
  number and go straight there. Clamp to `[1, maxLesson]`. On change, set lesson and
  clear history (mirroring what the arrows do at ~:1941). Give it an `aria-label`
  ("Jump to lesson") per B3.
- Add a **visible "Already know some? Skip ahead" affordance** beside the arrows — a
  short line or a small button that reveals/points to the jump input. The point is
  discoverability: a confident beginner shouldn't have to guess that the arrows let them
  skip.

**Note on persistence/safety:** jumping changes `lesson`, which persists (~:1860). That
is fine and expected. No data-loss path — history is per-session.

**Product decision flagged:** whether skipping ahead should warn ("the Koch method
assumes you've mastered earlier characters") is a pedagogy/wording call. Recommend a
one-line gentle note, not a blocking confirm. Flag for the human.

**Acceptance (C2):** a user can jump directly to any lesson 1..maxLesson via a labeled
input; a visible affordance near the arrows advertises that skipping ahead is possible;
clamping prevents out-of-range lessons.

### C3. Jargon — plain language alongside WPM/Farnsworth (pre-drill + Settings)

WPM and Farnsworth appear with no gloss on the pre-drill screen and in Settings
(~:1969–1971 mentions wpm; Settings sliders ~:2043–2044 label "Character speed",
"Effective speed (Farnsworth)"; the Farnsworth paragraph ~:2098 explains it but is far
down).

**Change:**
- On the **pre-drill panel** (~:1969 paragraph): the existing copy already says "every
  character plays at full speed (N wpm)". Add a short plain-language gloss of **wpm**
  ("words per minute — how fast the code is sent") on first encounter, and a one-line
  plain gloss of **Farnsworth** if it appears there. Keep it brief; the panel is
  already wordy.
- In **Settings** (~:2043–2044): add a short inline gloss under the "Effective speed
  (Farnsworth)" slider — one sentence in plain words ("characters stay fast; the gaps
  between them stretch so you have time to think"). The long paragraph at ~:2098 can
  stay as the deeper explanation, but the first-glance gloss belongs at the slider.

**Product decision flagged:** exact wording is the human's voice/brand call. Provide the
implementer with placeholder plain-language strings; flag that final copy is the human's.

**Acceptance (C3):** a first-time user encounters a plain-language definition of "wpm"
and "Farnsworth" at the point of use (pre-drill screen and the Farnsworth slider), not
only in a paragraph they may not read.

### C4. W1AW placeholder — one-time "this is an example" nudge

`DEFAULT_SETTINGS.myCall` is `"W1AW"` (~:2148), with name `PAT` / QTH `NEWINGTON CT`.
Settings already explains this (~:2062–2064), but a user who never opens Settings sees
their "own" callsign as W1AW in the header (~:2219) and in QSO contacts without knowing
it's a placeholder.

**Change:** a **one-time, dismissible** nudge shown when the user is still on the default
call (`settings.myCall === "W1AW"` and they haven't dismissed it). Content: "W1AW is an
example callsign (the ARRL's station). Set your own in Settings ⚙ to personalize your
practice contacts." Dismissal persists via the existing `store` layer (a new namespaced
key, e.g. `store.save("seenCallNudge", true)`) so it shows once. Place it where it's
seen early — under the header or at the top of the first tab. Tapping the gear or
changing the call should also satisfy/dismiss it.

**Why one-time + persisted:** matches the app's existing pattern (settings persist via
`store`, ~:2168) and respects the doctrine's "don't nag" instinct — surface it once, let
it go.

**Decision flagged (small):** trigger condition — "while call is still W1AW" vs "first
launch only." Recommend "while still the default call AND not dismissed", because it
keys off the actual thing that matters (an unpersonalized call) rather than launch count.
Flag if the human prefers strict first-launch.

**Acceptance (C4):** on first run with the default call, a dismissible nudge explains
W1AW is an example and points to Settings; once dismissed (or once the call is changed)
it does not reappear across launches.

---

## Sequencing & ordering hazards

**Order is A → B → C, and it is not optional:**

1. **A first** establishes the test baseline on the correctness core *before* B churns
   the UI. After A, the implementer can refactor markup in B with `npm test` proving the
   logic still behaves. If B went first, there'd be no automated proof that an
   accessibility edit didn't nick a shared function.
2. **B before/with C** because C's affordances (C1 cliff panel, C2 jump input, C4 nudge)
   are new interactive controls — building them after the B accessibility conventions
   exist means they're born labeled and live-region-aware, instead of needing a second
   accessibility pass. Specifically: C2's jump input and C4's nudge dismiss button should
   get the B3 `aria-label` treatment as they're built.

**Shared-region edit hazards (same lines touched by multiple items):**

- **LearnTab drill block (~:1975–2015)** is touched by A1 (replace `ready`), B1 (live
  regions on ~:1979 and ~:1984), B4 (rem on the 34px feedback), and C1 (the new
  sub-90% panel). Do these in bucket order on that block and re-read before each edit;
  don't batch them blindly. A1's change is a one-liner and should land first so B/C build
  on the extracted predicate.
- **The shared `S` object (~:738)** is touched by B4 (rem fonts) and is read by nearly
  every component. Edit it once, carefully; a typo here regresses the whole UI. The
  Bucket A tests won't catch an `S` regression (it's UI), so a visual smoke pass after
  B4 is the gate.
- **`#5A626C` (B5)** appears in many of the same paragraphs C3 edits (the hint text under
  sliders and the pre-drill copy). Do B5's color replacement before C3's copy edits so
  C3's new strings inherit the corrected color, or ensure C3's new hint text uses the
  B5 replacement value, not the old `#5A626C`.
- **Settings panel (~:2039–2104)** is touched by B3 (aria on toggles/sliders), B5
  (contrast on hint text), and C3 (Farnsworth gloss). Bucket order on this block too.
- **The window keydown handler (~:662–688)** is read-but-not-edited by B2. B2's whole
  design depends on NOT adding a competing keyboard handler. If a later change ever does
  add `onKeyDown` to the key controls, the double-fire returns — leave a `// why` comment
  at the controls noting the window handler owns keying.

**Re-run `npm test` after each bucket.** It is the cheap regression check that the core
wasn't disturbed by UI work. A green run is necessary but not sufficient — each bucket
also has its own behavioral acceptance (screen-reader pass for B, flow walk for C).

---

## Decisions for the human (not the implementer's to make)

1. **B2 / keyboard activation scope:** the global window handler already makes the app
   fully keyboard-operable. Do we also want keying *from the focused control itself*
   (Enter/Space on the button), accepting the double-fire engineering it requires? Recommend
   no — global handler is enough. Your call.
2. **B3 / tabs:** `aria-pressed` toggle semantics (simple, recommended) vs full
   `role="tablist"` with arrow-key navigation (richer, more wiring). Recommend
   `aria-pressed`.
3. **C1 / remediation depth:** beyond "keep drilling, here's your accuracy and the bar,"
   do you want a "review characters" or "drop back a lesson" option? Pedagogy call.
4. **C2 / skip-ahead warning:** gentle note vs nothing vs blocking confirm when a user
   jumps past lessons. Recommend gentle note.
5. **C3 / final copy:** the plain-language wpm/Farnsworth strings are placeholders;
   final wording is your brand voice.
6. **C4 / nudge trigger:** "while call still W1AW & not dismissed" (recommended) vs
   "first launch only."

None of these block starting Bucket A. Resolve them before the C work lands.

---

## What this plan does NOT do (scope honesty)

- No PCB/hardware work — this is a software product.
- No full px→rem sweep of every inline style (B4 converts the shared/core-path sizes;
  the long tail is noted as follow-up, not done).
- No component/integration tests or React Testing Library — Bucket A is pure-logic unit
  tests only, which is what the brief scopes and what the extracted core supports.
- No security/dependency work — that is the security-engineer's gate, separate from this.
- No new tabs, features, or audio-engine changes. Behavior outside the three buckets is
  byte-identical.
