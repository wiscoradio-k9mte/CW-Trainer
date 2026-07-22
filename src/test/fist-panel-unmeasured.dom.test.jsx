// @vitest-environment jsdom
//
// KEY fist panel: a spacing row appears ONLY when that spacing was measured.
//
// The unit tests in cw-core.test.js pin the analyzer's NOT-MEASURED rule. THESE
// tests pin the WIRING — that the panel gates each row on the verdict rather
// than printing "GOOD" for a gap class the operator never sent. They drive the
// real straight-key path (real keydown/keyup, real gap timings) and assert the
// rendered rows, so a fabricated verdict would be visible here exactly as it is
// to an operator mid-drill.
//
// Timing note: at the default 20 wpm one unit is 60 ms. The keyer classifies a
// press under 2u (120 ms) as a dit, and finalizes a character after 2.5u (150 ms)
// of idle — so a 3u (180 ms) letter gap both finalizes the character and lands in
// the analyzer's letter-gap bucket, and a 7u (420 ms) gap lands in the word-gap
// bucket. Fake timers advance performance.now() in this vitest, so these are real
// measured durations, not stubs.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { MORSE } from "../cw-core.js";
import { gotoTab } from "./helpers.jsx";

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

// Key one word with ideal ITU spacing: 1u between elements, 3u between letters.
function keyWord(word) {
  word.split("").forEach((ch, ci) => {
    if (ci > 0) act(() => { vi.advanceTimersByTime(3 * U); }); // letter gap
    MORSE[ch].split("").forEach((el, ei) => {
      if (ei > 0) act(() => { vi.advanceTimersByTime(U); });   // element gap
      press(el === "-" ? 3 * U : U);
    });
  });
}

// "MOM" is all dahs — no dit run, so the eight-dit error signal (which wipes the
// event buffer) can never fire mid-send and spoil the measurement.
function keyWords(words) {
  words.forEach((w, i) => {
    if (i > 0) act(() => { vi.advanceTimersByTime(7 * U); }); // word gap
    keyWord(w);
  });
  act(() => { vi.advanceTimersByTime(10 * U); }); // let the final character finalize
}

// Paddle mode is a different input path entirely: KeyX is the dah lever, and the
// iambic loop — not the operator — times each element, re-firing every durMs + 1u
// (4u = 240 ms for a dah). Holding the lever across three cycles emits three
// machine-timed dahs, which is exactly the case where a dah-length verdict would
// be a verdict on the machine rather than on the operator.
function paddleHoldDah(cycles = 3) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyX", bubbles: true, cancelable: true }));
  });
  act(() => { vi.advanceTimersByTime(cycles * 4 * U - U); });
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyX", bubbles: true, cancelable: true }));
  });
  act(() => { vi.advanceTimersByTime(10 * U); }); // let the character finalize
}

async function openKeyDrill(keyType = "straight") {
  window.localStorage.clear();
  window.localStorage.setItem("wrcw:settings", JSON.stringify({ keyType }));
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  await gotoTab(user, "KEY");
  await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));
  return user;
}

async function check(user) {
  await act(async () => { vi.useRealTimers(); });
  await user.click(screen.getByRole("button", { name: /^CHECK$/ }));
}

describe("KEY fist panel — no word gaps sent, no word-gap verdict shown", () => {
  it("a single-word send shows the letter-gap row but NO word-gap row", async () => {
    const user = await openKeyDrill();
    vi.useFakeTimers();
    keyWords(["MOM"]);
    await check(user);

    // The panel is up and reporting the gaps that WERE sent…
    expect(screen.getByText("Fist feedback")).toBeInTheDocument();
    expect(screen.getByText("Letter gaps")).toBeInTheDocument();
    // …and says nothing at all about word spacing, which never happened.
    expect(screen.queryByText("Word gaps")).toBeNull();
  });

  it("the same send with real 7u word gaps DOES show a word-gap row reading GOOD", async () => {
    const user = await openKeyDrill();
    vi.useFakeTimers();
    keyWords(["MOM", "MOM", "MOM"]);
    await check(user);

    const row = screen.getByText("Word gaps").closest("div");
    expect(row).not.toBeNull();
    // Produced text, scoped to the row: the verdict WORD is present (T5 — the
    // meaning is in the text, not only the chip colour) and it is GOOD.
    expect(row.textContent).toContain("GOOD");
    expect(row.textContent).toContain("7.0u");
  });
});

// ---------------------------------------------------------------------------
// The same rule on the Dah length row — the third of the three readings
// ---------------------------------------------------------------------------
// This row had NO test coverage of its own, in any mode. That mattered: with the
// gate opened, the row's own internal ratio-guard (the shape its three sibling
// spacing rows already use) stops it crashing, so the whole suite stayed green
// while the panel rendered a "Dah length" row with a blank verdict chip for
// every paddle drill and every all-dit send. The crash was the only thing
// catching it, and a maintainer tidying this row to match its siblings would
// have deleted the crash and shipped the hole. These pin the behaviour instead.
describe("KEY fist panel — no dahs sent, no dah-length verdict shown", () => {
  it("an all-dit send shows NO 'Dah length' row", async () => {
    const user = await openKeyDrill();
    vi.useFakeTimers();
    keyWords(["EEE"]); // E is a single dit — three dits, no dah to weigh
    await check(user);

    // The panel is up and grading what WAS sent…
    expect(screen.getByText("Fist feedback")).toBeInTheDocument();
    expect(screen.getByText("Letter gaps")).toBeInTheDocument();
    // …and makes no claim about dah length, which the operator never sent.
    expect(screen.queryByText("Dah length")).toBeNull();
  });

  it("a paddle send with real dahs in the stream still shows NO 'Dah length' row", async () => {
    const user = await openKeyDrill("paddle");
    vi.useFakeTimers();
    paddleHoldDah(); // dahs ARE sent — the machine, not the operator, timed them
    await check(user);

    expect(screen.getByText("Fist feedback")).toBeInTheDocument();
    // Distinguishes paddle suppression from the all-dit case above: there are
    // dahs to measure here, and still no verdict, because they aren't the
    // operator's. Element gaps are suppressed for the same reason.
    expect(screen.queryByText("Dah length")).toBeNull();
    expect(screen.queryByText("Element gaps")).toBeNull();
  });

  it("a send WITH hand-timed dahs shows the row, its verdict word and its ratio", async () => {
    const user = await openKeyDrill();
    vi.useFakeTimers();
    keyWords(["MOM"]); // M and O are all dahs, keyed at 3u — the ideal
    await check(user);

    const row = screen.getByText("Dah length").closest("div");
    expect(row).not.toBeNull();
    // Produced text, scoped to the row: the verdict WORD (T5 — meaning is in the
    // text, not only the chip colour) and the measured value beside it.
    expect(row.textContent).toContain("GOOD");
    expect(row.textContent).toContain("3.0u");
  });
});

// ---------------------------------------------------------------------------
// The machine-timed footnote must not promise a grade that isn't on screen
// ---------------------------------------------------------------------------
// The BUG variant of this footnote said "Your dah length is graded above," which
// is false on an all-dit send now that the Dah length row can be absent — a
// positive claim about a row that isn't there, the same defect family as F3.
// It is now conditional on the row's presence.
//
// COVERAGE LIMIT, stated plainly: BUG mode is unreachable in the shipped app
// (BUG_KEY_ENABLED is false and a persisted keyType:"bug" is coerced to paddle
// at load), so the bug branch of that footnote CANNOT be driven here. The
// dormant-path test for it lives with the other BUG dormant tests in
// bug-key.dom.test.jsx, skipped until the flag is flipped — a skipped test is
// not a bite, and this one is not claimed as coverage. What IS reachable, and
// pinned below, is the paddle variant, which must never carry the sentence.
describe("KEY fist panel — the machine-timed footnote claims no grade it can't show", () => {
  it("the paddle footnote never promises a dah grade (there is no dah row in paddle)", async () => {
    const user = await openKeyDrill("paddle");
    vi.useFakeTimers();
    paddleHoldDah();
    await check(user);

    expect(screen.queryByText("Dah length")).toBeNull();
    // Full leaf string, so this scopes to the one footnote element and would
    // catch the sentence being appended to the wrong branch.
    expect(screen.getByText(/machine-timed/).textContent)
      .toBe("Element spacing is machine-timed in paddle mode — spacing feedback covers letter and word gaps only.");
    expect(screen.queryByText(/graded above/)).toBeNull();
  });
});
