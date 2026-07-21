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

async function openKeyDrill() {
  window.localStorage.clear();
  window.localStorage.setItem("wrcw:settings", JSON.stringify({ keyType: "straight" }));
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
