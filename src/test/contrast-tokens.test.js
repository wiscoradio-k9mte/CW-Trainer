// @vitest-environment jsdom
//
// contrast-tokens.test.js
//
// THE GATE — makes the pairing rule from
// docs/design-a11y-contrast-fix-2026-08-11.md §3 bite:
//
//   S.text.dim must be AA (>= 4.5:1) against EVERY ground in S that can
//   carry text — not just S.ground.panel, the one it was originally
//   certified against.
//
// Before this file the app had NO contrast test at all, which is exactly how
// a token certified against one ground shipped paired with four others it
// had never been checked against (16 failing sites at 100%/150% text scale).
//
// The luminance/contrast math below is a LOCAL implementation of the WCAG 2.x
// formula (spec §1), not an imported library and not a table of hardcoded
// expected ratios — the point is that this file states the standard it
// enforces, and a hex change is judged against that standard, not against a
// number someone typed in after eyeballing a passing run.
//
// Formula source: WCAG 2.2, Success Criterion 1.4.3 Contrast (Minimum) +
// the "relative luminance" definition in the WCAG 2.2 glossary.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { S } from "../../wr-cw-trainer.jsx";

// import.meta.url resolves to a non-file:// scheme under the jsdom
// environment in this vitest setup, so path resolution is anchored to the
// process working directory instead — `vitest run` (via `npm test`) is
// always invoked from the repo root, same as every other config path here.
const SOURCE_PATH = join(process.cwd(), "wr-cw-trainer.jsx");

// --- WCAG 2.x relative luminance + contrast ratio -----------------------

function srgbChannelToLinear(c8bit) {
  const cs = c8bit / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

function contrast(hexA, hexB) {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// --- Self-check: prove the implementation reproduces known numbers ------
// A contrast checker that cannot reproduce a known failing ratio is not
// evidence of anything. #8A929C/#2A313A is the RETIRED pair (4.17:1, the
// measured WCAG 1.4.3 defect this fix closes) — used here only as a fixed
// external reference point for the formula, not as a claim about current code.

describe("contrast() self-check — the formula matches known WCAG numbers", () => {
  it("white on black is exactly 21:1 (the maximum possible ratio)", () => {
    expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21, 2);
  });

  it("the retired #8A929C on #2A313A reproduces the measured 4.17:1 failure", () => {
    expect(contrast("#8A929C", "#2A313A")).toBeCloseTo(4.17, 2);
  });
});

// --- The invariant: S.text.dim vs every ground that carries text --------
// #2A313A is duplicated as a raw literal (S.btn plus a couple of CSS sites —
// design doc finding F3) alongside the tokenized S.btn.background. Both are
// asserted so a future divergence between the token and the literal is
// caught by this gate, not discovered on a render.

describe("S.text.dim clears AA (>= 4.5:1, SC 1.4.3) against every text-bearing ground", () => {
  it(`S.ground.app ${S.ground.app} — page background`, () => {
    expect(contrast(S.text.dim, S.ground.app)).toBeGreaterThanOrEqual(4.5);
  });

  it(`S.ground.panel ${S.ground.panel} — card / panel surface (the original certification ground)`, () => {
    expect(contrast(S.text.dim, S.ground.panel)).toBeGreaterThanOrEqual(4.5);
  });

  it(`S.ground.well ${S.ground.well} — inset readout / input well`, () => {
    expect(contrast(S.text.dim, S.ground.well)).toBeGreaterThanOrEqual(4.5);
  });

  it(`S.btn.background ${S.btn.background} — every button; also the CompactSelect active row + option hover`, () => {
    expect(contrast(S.text.dim, S.btn.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("raw literal #2A313A — the un-tokenized duplicate of S.btn.background (finding F3)", () => {
    expect(contrast(S.text.dim, "#2A313A")).toBeGreaterThanOrEqual(4.5);
  });

  it("keySurface gradient light stop #3A3128 — the binding ground for the key-surface label", () => {
    expect(contrast(S.text.dim, "#3A3128")).toBeGreaterThanOrEqual(4.5);
  });
});

// --- Icon tier, separately — SC 1.4.11 Non-text Contrast, 3:1 -----------
// The CompactSelect trigger chevron sits on #303842 (hover-only, the app's
// lightest ground) and is an icon (aria-hidden glyph), not text, so it is
// judged at 3:1 rather than 1.4.3's 4.5:1. Kept as its own leg so the
// different threshold reads as deliberate rather than a typo.

describe("S.text.dim clears the icon-tier 3:1 floor (SC 1.4.11 Non-text Contrast)", () => {
  it("trigger-hover ground #303842 (CompactSelect chevron, hover-only)", () => {
    expect(contrast(S.text.dim, "#303842")).toBeGreaterThanOrEqual(3.0);
  });
});

// --- Drift guard: the literal sweep has to actually hold -------------
// A contrast test on the token proves nothing while raw literals bypass it.
// This reads the source as text (same technique as
// src/test/metainfo-sync.test.js) so a reintroduced "#8A929C" fails CI even
// though it would never appear in the S object this file imports.

describe("drift guard — the retired literal cannot creep back in", () => {
  const source = readFileSync(SOURCE_PATH, "utf8");

  it("no occurrence of the retired #8A929C literal remains (comments included)", () => {
    const occurrences = source.match(/#8A929C/g) || [];
    expect(occurrences.length).toBe(0);
  });

  it("the DIM token's value #959DA7 is defined exactly once (only the const itself)", () => {
    const occurrences = source.match(/#959DA7/g) || [];
    expect(occurrences.length).toBe(1);
  });
});
