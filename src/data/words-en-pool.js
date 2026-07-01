/**
 * words-en-pool.js
 *
 * Adapter: imports the bundled words_en frequency list and exports two filtered
 * drill pools, plus the pure filter function used to build them.
 *
 * No network — the JSON is bundle-inlined by Vite (same as dxcc_dataset.json).
 * No re-validation here — scripts/validate-words-en.mjs is the change-time gate;
 * this adapter only filters.
 *
 * This module does NOT import cw-core (no import cycle); cw-core imports it —
 * the same pattern as dxcc-generation.js / dxcc-resolve.js.
 */

// PLAIN import — no assert { type: 'json' }. Vitest (vite bundler) and Vite
// production build both resolve this from repo-root data/generated/. Verified
// in both environments before wiring (2026-07-01).
import wordsEn from '../../data/generated/words_en.json';

// ---------------------------------------------------------------------------
// Length bounds
// ---------------------------------------------------------------------------

// FIRM PO constraint: no drill ever serves a single-character token as a "word."
// The bundled corpus contains many single-char tokens (i, a, s, t, …); MIN_WORD_LEN=2
// is the structural enforcement. It is exported so tests can mutate it to confirm
// single chars would leak without the guard.
export const MIN_WORD_LEN = 2;

// Long-tail cap — "antidisestablishmentarianism" is not CW drill content.
// Tunable constant; the design chose 12 for realism.
export const MAX_WORD_LEN = 12;

// ---------------------------------------------------------------------------
// Pure filter
// ---------------------------------------------------------------------------

/**
 * filterDrillWords(words, {minLen, maxLen}) — pure; no JSON dependency.
 *
 * Returns words where minLen <= word.length <= maxLen.
 * Default bounds come from MIN_WORD_LEN / MAX_WORD_LEN.
 * Testable in isolation with a plain string-array fixture (no JSON needed).
 */
export function filterDrillWords(words, { minLen = MIN_WORD_LEN, maxLen = MAX_WORD_LEN } = {}) {
  return words.filter(w => w.length >= minLen && w.length <= maxLen);
}

// ---------------------------------------------------------------------------
// Drill pools — BANDS, not nested supersets
// ---------------------------------------------------------------------------
// Using distinct rank bands means each rung targets a different difficulty region
// rather than a subset of the easier one.  The "slice(1000)" exploit works because
// the generator guarantees strict-prefix ordering (validator check #5).

/**
 * COMMON_WORD_POOL — ranks 1–500 (easy, familiar, high-frequency English).
 * 493 words after the min/max-length filter (7 single-char tokens dropped).
 */
export const COMMON_WORD_POOL = filterDrillWords(wordsEn.top500);

/**
 * WIDE_WORD_POOL — ranks 1001–5000 (harder; less common but still realistic English).
 * 3957 words after the length filter (43 single-char tokens dropped from 4000 in band).
 */
export const WIDE_WORD_POOL = filterDrillWords(wordsEn.top5k.slice(1000));
