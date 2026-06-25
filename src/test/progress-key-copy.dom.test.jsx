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

    // Send one element with the straight key (Space down→up). A short tap decodes
    // as a dit; what matters for the record is fist.elements > 0.
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", bubbles: true, cancelable: true }));
    });

    // CHECK grades it and (if wired) records a `key` session.
    await user.click(screen.getByRole("button", { name: "CHECK" }));

    // (a) The record is in localStorage — the actual persisted output.
    const raw = window.localStorage.getItem("wrcw:progress");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);
    expect(parsed.key.length).toBeGreaterThan(0);
    // Default category is "words"; STRAIGHT KEY persists keyType "straight".
    expect(parsed.key[0]).toMatchObject({ category: "words", keyType: "straight" });

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
// COPY-CHECK persists a `copy` record
// ---------------------------------------------------------------------------
describe("PROGRESS — COPY records a session on CHECK (round-trip)", () => {
  it("a COPY check persists a `copy` record (stored + remount + PROGRESS)", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "COPY");

    // CHECK is disabled until a target exists. NEW runs a 5-second countdown then
    // sets the target. Switch to fake timers (after the real-timer nav above) and
    // advance the countdown so a target lands; the score doesn't matter for the
    // record — only that check() ran and persisted a `copy` record.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /▶ NEW/ }));
    act(() => {
      vi.advanceTimersByTime(6000); // 5×1000ms countdown ticks + margin
    });

    // Type an answer into the copy input and CHECK it (synchronous fireEvent so we
    // don't need real-timer userEvent under fake timers).
    const input = screen.getByRole("textbox", { name: /Your copy/i });
    fireEvent.change(input, { target: { value: "E" } });
    fireEvent.click(screen.getByRole("button", { name: "CHECK" }));
    vi.useRealTimers();

    // (a) Persisted output in localStorage.
    const raw = window.localStorage.getItem("wrcw:progress");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);
    expect(parsed.copy.length).toBeGreaterThan(0);
    expect(parsed.copy[0]).toHaveProperty("source");
    expect(parsed.copy[0]).toHaveProperty("pct");

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
