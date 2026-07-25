// @vitest-environment jsdom
//
// KEY fist panel — end-to-end reproduction of the word-gap misclassification
// bug (fix/word-gap-misclassification): a genuine inter-letter HESITATION on a
// target with no real word boundary must not render a fabricated "Word gaps"
// row. The unit tests in cw-core.test.js pin analyzeFist's classifier directly;
// this one drives the real KEY screen (real category pick, real keystrokes,
// real gap timings) so the fix is proven at the surface an operator sees, not
// only at the pure-function boundary — the same "wiring, not just the rule"
// split fist-panel-unmeasured.dom.test.jsx uses for the sibling F3 fix.
//
// Category choice: "Abroad callsigns" (drillReciprocalCalls / DRILL_CATEGORIES
// id "recip") is the one category whose generator can NEVER produce a
// multi-word target — reciprocalCall() joins host prefix + call + suffix with
// no space, always. See the sweep documented beside PROGRESS_MIGRATIONS in
// cw-core.js. That makes it the deterministic category to reproduce this bug
// with; every other single-token-capable category (Callsigns, DX callsigns,
// DX exchanges, Contest fragments, Split & pileup) also sometimes draws a
// multi-word target, so a test built on one of THEM could pass or fail
// depending on the RNG draw it happened to get — not a reproducible test.
//
// keyType is seeded to "straight" up front — the app's default is "paddle",
// whose DIT/DAH surfaces don't respond to the Space key this test drives.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { gotoTab, chooseOption } from "./helpers.jsx";

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

const U = 60; // one unit at the default 20 wpm

function press(ms) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true }));
  });
  act(() => { vi.advanceTimersByTime(ms); });
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", bubbles: true, cancelable: true }));
  });
}

describe("KEY fist panel — a thinking-pause on a one-word target is not a fabricated word gap", () => {
  it("a 7u hesitation mid-send on an Abroad-callsigns target shows NO Word gaps row", async () => {
    window.localStorage.clear();
    window.localStorage.setItem("wrcw:settings", JSON.stringify({ keyType: "straight" }));
    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "KEY");
    await chooseOption(user, /Drill category/, "Abroad callsigns");
    await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));

    vi.useFakeTimers();
    // Four single-dit characters ("E E E E"), letter gaps of 3u (ideal) between
    // the first three and then a 7u HESITATION before the last — exactly the
    // "~7u thinking pause" scenario the card describes. The displayed target has
    // no word boundary, so this must never surface as a word-gap reading, no
    // matter how close 7u sits to the 7u word-gap ideal.
    press(U);
    act(() => { vi.advanceTimersByTime(3 * U); }); press(U);
    act(() => { vi.advanceTimersByTime(3 * U); }); press(U);
    act(() => { vi.advanceTimersByTime(7 * U); }); press(U); // the hesitation
    act(() => { vi.advanceTimersByTime(10 * U); }); // let the last character finalize

    await act(async () => { vi.useRealTimers(); });
    await user.click(screen.getByRole("button", { name: /^CHECK$/ }));

    // The panel IS up and reports what was actually measured…
    expect(screen.getByText("Fist feedback")).toBeInTheDocument();
    expect(screen.getByText("Letter gaps")).toBeInTheDocument();
    // …but makes no claim about word spacing, which this target never had.
    expect(screen.queryByText("Word gaps")).toBeNull();
  });
});
