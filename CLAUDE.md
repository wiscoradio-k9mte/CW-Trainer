# Project Brief — WISCO RADIO CW Trainer

This file is the product's standing memory. The team reads it at the start of every
engagement and tightens it at the end. Keep it terse and accurate; it is loaded each
session, so narration costs tokens forever.

## What it is
A ham-radio Morse-code (CW) trainer: Koch-method character lessons, copy & sending
practice, and a QSO simulator (POTA/SOTA/IOTA/ragchew). Fully offline. By Travis Engh
(K9MTE) / Wisco Radio. GPL-3.0-or-later. App ID `io.github.wiscoradio_k9mte.CWTrainer`.

## Product profile (the rules in force)
- **Finished software product**, not a kit → **software doctrine** applies
  (modern/best-available; the through-hole/parts-forever hardware rules do NOT apply).
- **Platform (now):** Electron desktop, **Linux first**, targeting **Snap Store + Flathub**.
- **Platform roadmap (planned, sequenced):** Linux → Windows (Microsoft Store) →
  macOS (App Store) → iOS + Android. Multi-platform is the intended direction, not an
  open question — the code is pure React + Web Audio and the `store` persistence facade
  was written anticipating Capacitor/browser targets. Linux-only is the starting point,
  not the end state. Weigh portable/field features (pause-resume, master volume,
  touch-first paddle) against this roadmap, not against the current desktop build alone.
- **Offline:** no network requested or used. Don't add network without a feature that
  needs it (and a profile revisit).
- **Layout/distribution intent:** self-distributable `.flatpak`/`.snap` plus Flathub
  submission (manifest-based).

## Architecture (as of 2026-06-18)
- The whole app is one file, `wr-cw-trainer.jsx` (~2000 lines), mounted by
  `src/main.jsx`, bundled by Vite, wrapped by `electron/main.cjs`.
- **It is one *file*, not one tangled component** — internal seams are clean: audio
  engine (`useMorsePlayer`), keyer/decoder (`useKeyer`), grading (`similarity`),
  QSO builders (`buildRagchew/Pota/Sota/Iota`), persistence facade (`store`).
- **`src/cw-core.js`** holds the pure correctness-core (Morse table, `timing`,
  `similarity`, QSO builders, `isReadyToAdvance`, etc.), imported back into the JSX.
  This is the testable surface — keep pure logic here, not inline in the component.
- Persistence: `localStorage` via the `store` facade. Only `settings` and `kochLesson`
  persist; session/accuracy history is intentionally ephemeral (see open decisions).
- Electron security is correct: contextIsolation on, nodeIntegration off, sandbox on,
  external links shelled out, tight CSP in `index.html` (no `unsafe-eval`).

## Tooling & gates
- `npm run dev` (Vite + Electron, hot reload); `npm start` (prod build + Electron);
  `npm run build` (vite build, must pass); `npm test` (**vitest**, currently 33 tests,
  must stay green); `npm run dist:snap` / `dist:flatpak` (packaging).
- Packaging artifacts present & tracked: `electron-builder.yml`, `build/icon.{png,svg}`,
  `build/io.github.wiscoradio_k9mte.CWTrainer.metainfo.xml`.

## Current readiness (as of 2026-06-18)
Moved from *not-ready* to **ready-with-two-known-gaps** after a full readiness review +
fix pass (branch `readiness-fixes`). Done: vitest suite (was zero tests); accessibility
(screen-reader live regions, focusable/labeled keyer, rem fonts, AA contrast at
`#8A929C` = 5.25:1); onboarding (sub-90% drill feedback, jump-to-lesson/placement,
plain-language jargon glosses, one-time W1AW example-callsign nudge).

### Known gaps / blockers to ship
- **Flathub screenshots missing** — `metainfo.xml` references `build/screenshots/*.png`
  that don't exist; must be captured from the running GUI (needs a real display).
  Blocks the Flathub submission specifically.
- **Real-device AT testing** unverified: Space-key interception in screen-reader
  virtual-cursor mode, and live-region announcement timing. Confirm on TalkBack/VoiceOver.
- `StartupWMClass` unset in `electron-builder.yml` (needs a real build to determine).

## Open product decisions (need the human, not the team)
- **Persistent cross-session progress history** — currently only lesson number persists.
  The storage seam supports it; scope is a product call (Marcus's headline request).
- **Free-recall answer entry** vs. the multiple-choice drill grid (enhancement).
- (Platform expansion is decided — see the roadmap in the profile above. The open part
  is only *sequencing/timing*, owned by the human. Linux → Windows → macOS → iOS/Android.)

## Usability panel
Matched ham cast in `~/WiscoRadio/Workshop/personas/cast/cw-trainer-panel.md`
(Dale/Carol/Marcus/Ray/Priya/Sam). Panel findings are hypotheses — verify with real
hams before treating as verdicts. Note: the cast assumes phone/tablet contexts, but the
product is desktop-only — relevant when platform expansion is decided.
