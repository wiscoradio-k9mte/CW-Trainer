/**
 * duration-budget-reporter.mjs
 *
 * Wires the pure checker (duration-budget.js) into a real vitest run: collects
 * every finished test's ACTUAL duration via vitest's Reporter API, then applies
 * the budget once the run ends. See duration-budget.js for the 8000ms line's
 * full provenance and arithmetic, and vite.config.mjs's testTimeout comment for
 * why this budget exists separately from that 10000ms hang-kill cap.
 *
 * CI-ONLY HARD FAIL, ADVISORY LOCALLY — deliberately, not an oversight:
 * A wall-clock gate can flake on its own if it's bound to an inconsistent
 * runner. This shop's dev box is NOT consistent — Travis routinely runs
 * several autonomous agents' full test suites concurrently on one 8-core
 * machine, and that contention alone (not any single test's own fix regressing)
 * pushed already-`delay:null`-fixed tests (qth-state-fallback,
 * qso-blank-required-element) all the way to the real 10000ms testTimeout
 * (measured 2026-07-25). A GitHub Actions hosted runner is a dedicated VM for
 * that one job — no sibling agent load — so that specific hazard doesn't
 * apply there, which is what makes CI the right place to actually enforce this
 * and a local dev box the wrong one.
 *
 * `process.env.CI` is the flag GitHub Actions (and effectively every CI
 * provider) sets automatically — no repo-specific wiring needed.
 */
import { checkTestDurations, formatViolation, DURATION_BUDGET_MS } from './duration-budget.js';

export class DurationBudgetReporter {
  #records = [];

  onTestCaseResult(testCase) {
    const diagnostic = testCase.diagnostic();
    if (!diagnostic) return; // skipped or never finished — nothing to budget
    // Round: vitest's own duration is a float (sub-ms precision); the budget
    // and every fixture in duration-budget.test.js are whole milliseconds, and
    // a maintainer reading a violation shouldn't have to parse a float.
    this.#records.push({ name: testCase.fullName, duration: Math.round(diagnostic.duration) });
  }

  onTestRunEnd() {
    const { ok, violations } = checkTestDurations(this.#records, DURATION_BUDGET_MS);
    if (ok) return;

    console.error(`\nDURATION BUDGET: ${violations.length} test(s) exceeded ${DURATION_BUDGET_MS}ms:\n`);
    for (const violation of violations) {
      console.error(`  ${formatViolation(violation, DURATION_BUDGET_MS)}`);
    }

    if (process.env.CI) {
      // Vitest does not reset process.exitCode after reporters run (confirmed
      // against vitest 4.1.10's own end-of-run sequence: the pass/fail check
      // that sets exitCode happens BEFORE onTestRunEnd is awaited, and nothing
      // after it touches exitCode again) — so this sticks through to the CI
      // job's final status, even though every individual test assertion passed.
      process.exitCode = 1;
    } else {
      console.error('  (local run — advisory only; this budget is enforced in CI)\n');
    }
  }
}
