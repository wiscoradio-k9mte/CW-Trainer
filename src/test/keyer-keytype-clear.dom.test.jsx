// @vitest-environment jsdom
//
// Fix 3 (pre-launch) — keyer cleanup on key-type change.
//
// When the operator switches key type (paddle ↔ straight ↔ bug) while a
// paddle loop is running or after a straight-key press, the keyer's
// `loopTimer`, `ditHeld`/`dahHeld`, and the decoded-text buffer must be
// cleared.  Without the useEffect-on-keyType fix, modeRef.current updates
// but `clear()` is never called, leaving the loop running and stale text
// in the display.
//
// The test below drives the straight-key path to put a decoded character
// in the display (using fake timers to fire the char-gap timeout), then
// switches key type and verifies the decoded display clears — which only
// happens if `keyer.clear()` was called.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";

// ---------------------------------------------------------------------------
// Fake-timer pattern per team feedback: real timers through render + splash,
// then vi.useFakeTimers() before the event sequence.  See feedback_test_patterns.md.
// ---------------------------------------------------------------------------
afterEach(() => {
  vi.useRealTimers();
});

async function renderKeyTab() {
  // Clean localStorage so key-type defaults to "paddle" (the app default).
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<CWTrainer />);
  // Dismiss the 5-second splash (real timers — userEvent.setup() uses real clock).
  await user.click(screen.getByText("tap to skip"));
  // Navigate to KEY tab.
  await user.click(screen.getByRole("button", { name: "KEY" }));
  return { user };
}

describe("Fix 3 — keyer.clear() fires when key type changes", () => {
  it("decoded display empties after switching from STRAIGHT KEY to PADDLE", async () => {
    const { user } = await renderKeyTab();

    // Switch to STRAIGHT KEY so we can send elements with the space bar.
    await user.click(screen.getByRole("button", { name: "STRAIGHT KEY" }));

    // Now arm fake timers.  From this point forward setTimeout is mocked.
    vi.useFakeTimers();

    // Default keyWpm is 15 wpm → u = 1200/15 = 80 ms.
    // Char-gap timer fires at 2.5u = 200 ms.
    // Send one dit: Space keydown then keyup.
    act(() => { fireEvent.keyDown(document, { code: "Space" }); });
    act(() => { fireEvent.keyUp(document,   { code: "Space" }); });

    // Advance past the char-gap timeout (200 ms) so the dit finalises to "E"
    // and gets pushed into the decoded display.
    act(() => { vi.advanceTimersByTime(300); });

    // Verify "E" (one dit) is in the decoded display before we switch.
    // The Display component renders keyer.decoded; "E" should be visible.
    expect(screen.getByText("E")).toBeInTheDocument();

    // Restore real timers before clicking — userEvent uses real clock.
    vi.useRealTimers();

    // Switch back to PADDLE.
    await user.click(screen.getByRole("button", { name: "PADDLE" }));

    // The useEffect on [settings.keyType] must have called keyer.clear(), which
    // sets decoded → "".  The Display now renders an empty string, so "E" is gone.
    // Without the fix: the decoded state is untouched, "E" stays in the DOM.
    expect(screen.queryByText("E")).not.toBeInTheDocument();
  });
});
