// @vitest-environment jsdom
//
// GAP 1 (v2.0 gate): KEY-CHECK and COPY-CHECK persist round-trip.
//
// The LEARN write path already has an end-to-end DOM round-trip test
// (progress.dom.test.jsx → "PROGRESS — LEARN records on BACK"). The KEY and COPY
// write paths did NOT — only their pure appendProgress was covered. These tests
// close that gap by driving each CHECK through the real component, then proving
// the record PERSISTED two ways:
//   (a) it round-trips through localStorage and is RE-READ by a fresh remount, and
//   (b) it renders in the PROGRESS tab (the visible round-trip the user sees).
//
// Both assert PRODUCED OUTPUT (stored object + rendered text), never "an event
// fired". Each is mutation-verified: disabling the respective record(...) call
// makes the test fail (see the gate report).
//
// KEY input is driven by dispatching real keyboard events on window and reading
// the live decode buffer — the same observable seam the v1.4 bug-key record tests
// use (useKeyer is not exported). STRAIGHT KEY is selected so a Space tap records
// one deterministic element (fist.elements > 0 → the record() guard passes).

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, within, cleanup, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { gotoTab } from "./helpers.jsx";

// Tear down the current React tree so a second render() in the same test starts
// clean (two mounted CWTrainer trees would collide on getByText etc.).
function cleanupCurrentTree() {
  cleanup();
}

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

// Fresh render past the splash, clean storage. Wide layout (setup.dom.js mocks
// matchMedia matches:true), so KEY/COPY setup controls live in the Options rail.
async function freshApp() {
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  return { user };
}

// Re-mount the app from whatever is in localStorage WITHOUT clearing first, so we
// read back what a prior mount persisted. Returns the userEvent instance.
async function remountFromStore() {
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  return { user };
}

// ---------------------------------------------------------------------------
// KEY-CHECK persists a `key` record
// ---------------------------------------------------------------------------
describe("PROGRESS — KEY records a fist session on CHECK (round-trip)", () => {
  it("a STRAIGHT-KEY drill + CHECK persists a `key` record (stored + remount + PROGRESS)", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "KEY");

    // Switch to STRAIGHT KEY so Space is the (only) element source. The toggle is
    // in the Options rail on wide.
    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(within(rail).getByRole("button", { name: "STRAIGHT KEY" }));

    // Get a target so the keyer is enabled.
    await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));

    // Send one element with the straight key, but with a KNOWN held duration so the
    // persisted estWpm is a pinnable value (not whatever a zero-duration synchronous
    // tap produces). The keyer measures durMs via performance.now(), which vitest's
    // fake timers also drive. Default keyWpm = 20 → unit = 1200/20 = 60ms; a 60ms
    // hold is < 2u (120ms) so it classifies as a dit with durMs = 60. analyzeFist
    // then computes estWpm = round(1200 / medianDit) = round(1200/60) = 20, and
    // wpmDelta = 20 - 20 = 0 → wpmVerdict "on target".
    vi.useFakeTimers();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true }));
    });
    act(() => {
      vi.advanceTimersByTime(60); // advances performance.now() by 60ms
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", bubbles: true, cancelable: true }));
    });

    // CHECK grades it and records a `key` session (synchronous fireEvent under fake
    // timers — userEvent needs real timers).
    fireEvent.click(screen.getByRole("button", { name: "CHECK" }));
    vi.useRealTimers();

    // (a) The record is in localStorage — the actual persisted output.
    const raw = window.localStorage.getItem("wrcw:progress");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);
    expect(parsed.key.length).toBeGreaterThan(0);
    // Default category is "words"; STRAIGHT KEY persists keyType "straight".
    expect(parsed.key[0]).toMatchObject({ category: "words", keyType: "straight" });
    // VALUE assertions: the persisted fist estimate matches the known 60ms hold —
    // estWpm 20, "on target" — not a hardcoded or mis-derived value.
    expect(parsed.key[0].estWpm).toBe(20);
    expect(parsed.key[0].wpmVerdict).toBe("on target");

    // (b) Visible round-trip: the PROGRESS tab shows the persisted session, and a
    // FRESH remount (new component tree reading from the store) shows it too.
    cleanupCurrentTree();
    const { user: u2 } = await remountFromStore();
    await gotoTab(u2, "PROGRESS");
    // KEY records render as "{category} · {keyType}" in the Fist sessions list.
    expect(screen.getByText(/words · straight/)).toBeInTheDocument();
    // The empty-state text must be gone — a record exists now.
    expect(screen.queryByText(/No KEY sessions yet/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// FIX 1: empty-answer COPY-CHECK must NOT write a progress record
// ---------------------------------------------------------------------------
describe("PROGRESS — COPY empty-answer guard (Fix 1)", () => {
  it("CHECK with empty answer box does NOT write a copy progress record", async () => {
    // Drive a target to appear so CHECK becomes enabled, then CHECK without typing
    // anything.  The fix guards record() on attempt.trim() — an empty box must
    // produce zero copy records in localStorage.
    const { user } = await freshApp();
    await gotoTab(user, "COPY");

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /▶ NEW/ }));
    act(() => {
      vi.advanceTimersByTime(6000); // wait out the 5-second countdown
    });

    // Do NOT type anything — the input stays empty.  CHECK is now enabled
    // (a target exists), so click it.
    fireEvent.click(screen.getByRole("button", { name: "CHECK" }));
    vi.useRealTimers();

    // No copy record should have been written.
    const raw = window.localStorage.getItem("wrcw:progress");
    if (raw) {
      const parsed = JSON.parse(raw);
      expect(parsed.copy.length).toBe(0);
    }
    // If raw is null that's also fine — nothing was persisted at all.
  });

  it("CHECK with a non-empty answer DOES write a copy progress record", async () => {
    // Regression guard: the guard must not swallow a real attempt.
    const { user } = await freshApp();
    await gotoTab(user, "COPY");

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /▶ NEW/ }));
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    const input = screen.getByRole("textbox", { name: /Your copy/i });
    fireEvent.change(input, { target: { value: "E" } });
    fireEvent.click(screen.getByRole("button", { name: "CHECK" }));
    vi.useRealTimers();

    const raw = window.localStorage.getItem("wrcw:progress");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);
    expect(parsed.copy.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// COPY-CHECK persists a `copy` record
// ---------------------------------------------------------------------------
describe("PROGRESS — COPY records a session on CHECK (round-trip)", () => {
  it("a COPY check persists a `copy` record (stored + remount + PROGRESS)", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "COPY");

    // Pin the generated target so the persisted pct is a KNOWN value. The default
    // COPY source is "single": newTarget() does t = pick(easyPool) where easyPool =
    // KOCH.slice(0,14).filter(alnum) and pick uses Math.floor(random*len). Stubbing
    // random→0 forces t = easyPool[0] = "K" (KOCH[0]). Typing "K" is then a perfect
    // copy → similarity("K","K") = 1 → pct 100, an exact value to assert.
    const randSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    // CHECK is disabled until a target exists. NEW runs a 5-second countdown then
    // sets the target. Switch to fake timers (after the real-timer nav above) and
    // advance the countdown so a target lands.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /▶ NEW/ }));
    act(() => {
      vi.advanceTimersByTime(6000); // 5×1000ms countdown ticks + margin
    });

    // Type the (pinned) target into the copy input and CHECK it (synchronous
    // fireEvent so we don't need real-timer userEvent under fake timers).
    const input = screen.getByRole("textbox", { name: /Your copy/i });
    fireEvent.change(input, { target: { value: "K" } });
    fireEvent.click(screen.getByRole("button", { name: "CHECK" }));
    vi.useRealTimers();
    randSpy.mockRestore();

    // (a) Persisted output in localStorage.
    const raw = window.localStorage.getItem("wrcw:progress");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);
    expect(parsed.copy.length).toBeGreaterThan(0);
    expect(parsed.copy[0]).toHaveProperty("source");
    expect(parsed.copy[0]).toHaveProperty("pct");
    // VALUE assertion: a perfect copy of the pinned target persists pct 100, not a
    // hardcoded constant (a `pct = 42` in check() sailed through 26 tests before).
    expect(parsed.copy[0].pct).toBe(100);

    // (b) Visible round-trip via a fresh remount + PROGRESS tab. The COPY section
    // groups by source rung; the first rung's stored source value renders as a
    // header. Assert the empty state is gone and a source row appears.
    const source = parsed.copy[0].source;
    cleanupCurrentTree();
    const { user: u2 } = await remountFromStore();
    await gotoTab(u2, "PROGRESS");
    expect(screen.queryByText(/No COPY sessions yet/i)).not.toBeInTheDocument();
    expect(screen.getByText(source)).toBeInTheDocument();
  });
});
