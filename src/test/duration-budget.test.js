/**
 * duration-budget.test.js
 *
 * TIER 2 — cheap, fixture-driven guard for the duration-budget checker itself.
 * Pure logic, no vitest reporter plumbing here: durations in, verdict out.
 * See duration-budget.js for the 8000ms line's provenance and arithmetic.
 */

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { checkTestDurations, formatViolation, DURATION_BUDGET_MS, DOCTRINE_LINE } from './duration-budget.js';

describe('checkTestDurations — pure verdict from a list of {name, duration}', () => {
  it('passes when every duration is at or under budget (boundary is inclusive)', () => {
    const records = [
      { name: 'a fast test', duration: 100 },
      { name: 'exactly at budget', duration: DURATION_BUDGET_MS },
    ];
    const result = checkTestDurations(records, DURATION_BUDGET_MS);
    expect(result).toEqual({ ok: true, violations: [] });
  });

  it('flags each test over budget by name and duration, and leaves in-budget tests out', () => {
    const records = [
      { name: 'fast test', duration: 50 },
      { name: 'over by one ms', duration: DURATION_BUDGET_MS + 1 },
      { name: 'way over', duration: DURATION_BUDGET_MS + 5000 },
    ];
    const result = checkTestDurations(records, DURATION_BUDGET_MS);
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      { name: 'over by one ms', duration: DURATION_BUDGET_MS + 1 },
      { name: 'way over', duration: DURATION_BUDGET_MS + 5000 },
    ]);
  });

  it('passes the real measured worst-case (6104ms, narrow.dom.test.jsx, 2026-07-25) at the shipped 8000ms line', () => {
    // Regression pin for the arithmetic in duration-budget.js: if
    // DURATION_BUDGET_MS is ever lowered below the measured worst, THIS is the
    // test that goes red first and says exactly why.
    const result = checkTestDurations([{ name: 'narrow.dom.test.jsx (measured worst)', duration: 6104 }], DURATION_BUDGET_MS);
    expect(result.ok).toBe(true);
  });

  it('still passes the measured worst-case against the REJECTED 7000ms proposal too (it fails on thin margin, not on crossing the line)', () => {
    // The 7000ms proposal wasn't rejected because 6104ms trips it — it doesn't
    // (6104 < 7000, so a strict compare passes it clean). It was rejected
    // because the resulting 14.7% headroom is inside this suite's own observed
    // run-to-run noise, which would make the GUARD the flake. That's a margin
    // judgment call (see duration-budget.js's arithmetic), not something a
    // boolean over/under check can express — this test exists so that
    // distinction isn't lost: a passing boolean checker result is NOT the same
    // claim as "this budget has adequate headroom."
    const result = checkTestDurations([{ name: 'narrow.dom.test.jsx (measured worst)', duration: 6104 }], 7000);
    expect(result.ok).toBe(true);
  });

  it('defaults to DURATION_BUDGET_MS when no budget argument is given', () => {
    const result = checkTestDurations([{ name: 'x', duration: DURATION_BUDGET_MS + 1 }]);
    expect(result.ok).toBe(false);
  });
});

describe('formatViolation — the message a maintainer actually reads', () => {
  it('names the test, states its duration, states the budget, and carries the fix doctrine', () => {
    const message = formatViolation({ name: 'a slow test', duration: 9123 }, DURATION_BUDGET_MS);
    expect(message).toContain('a slow test');
    expect(message).toContain('9123ms');
    expect(message).toContain(`${DURATION_BUDGET_MS}ms`);
    expect(message).toContain(DOCTRINE_LINE);
  });
});
