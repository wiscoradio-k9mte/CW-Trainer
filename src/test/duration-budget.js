/**
 * duration-budget.js
 *
 * Pure per-test duration BUDGET checker — durations in, verdict out. No I/O, no
 * vitest coupling, so this is directly unit-testable (duration-budget.test.js)
 * and reusable from the custom reporter that wires it into a real test run
 * (duration-budget-reporter.mjs).
 *
 * WHY THIS EXISTS, SEPARATE FROM `testTimeout` (vite.config.mjs)
 * `testTimeout` (10000ms) is the point a test is KILLED as hung — it answers
 * "did this test ever finish?" This budget answers a different, earlier
 * question: "did this test finish suspiciously slowly?" A test that takes
 * 9000ms passes `testTimeout` clean but is already most of the way to a real
 * hang, and left alone it WILL eventually cross that line under load — see the
 * git history on vite.config.mjs's testTimeout comment for the incident this
 * guard exists to prevent (tests that were already fixed for one slowness
 * cause still hit the real 10000ms cap under a different one).
 *
 * PROVENANCE OF THE 8000ms LINE (measured 2026-07-25, clean/uncontended box,
 * full suite, 863 tests, 834 passed / 0 failed):
 *   worst single test   6104ms  narrow.dom.test.jsx ("gives the EASY live
 *                                'Sending' readout two lines AND tail
 *                                semantics" — holds a deliberate real 5000ms
 *                                wait; see that file's own comment for why)
 *   next-worst          5334ms
 *                       5116ms
 *                       4700ms
 *                       4507ms  (qth-state-fallback / progress-qso / qso-autoadvance)
 *
 * A prior proposal used 7000ms. Headroom over the measured worst:
 *   7000ms:  (7000-6104)/6104  = 14.7%  — REJECTED: that's inside ordinary
 *            scheduler noise (the same suite has shown +/-20% run-to-run
 *            variance on this exact test in past load comparisons), so a
 *            7000ms budget would itself flake — the one thing a flake guard
 *            must never do.
 *   8000ms:  (8000-6104)/6104  = 31.1%  — SHIPPED. Real margin over the worst
 *            observed test, comfortable margin over the whole next-worst
 *            cluster (5334ms sits at 50% headroom), and still 20% under the
 *            real testTimeout cap (10000ms) so a budget violation is a genuine
 *            early warning, not just a restatement of the hang-kill.
 *
 * narrow.dom.test.jsx's deliberate 5000ms wait already spends 62% of this
 * 8000ms budget by design. It was deliberately NOT exempted or refactored: the
 * flat 8000ms line already covers its measured 6104ms with room to spare, and
 * a per-test exemption is untested extra machinery for a case the budget
 * already handles — simpler to leave it in the one shared rule.
 */
export const DURATION_BUDGET_MS = 8000;

export const DOCTRINE_LINE =
  "fix the test's clock structure (delay:null / fake timers); do NOT raise testTimeout or this budget without a load test.";

/**
 * @param {{name: string, duration: number}[]} records one entry per finished test
 * @param {number} [budgetMs]
 * @returns {{ok: boolean, violations: {name: string, duration: number}[]}}
 */
export function checkTestDurations(records, budgetMs = DURATION_BUDGET_MS) {
  const violations = records.filter((record) => record.duration > budgetMs);
  return { ok: violations.length === 0, violations };
}

/** One human-readable line per violation: the test name, its duration, and the fix doctrine. */
export function formatViolation(record, budgetMs = DURATION_BUDGET_MS) {
  return `${record.name} took ${record.duration}ms — over the ${budgetMs}ms per-test duration budget. ${DOCTRINE_LINE}`;
}
