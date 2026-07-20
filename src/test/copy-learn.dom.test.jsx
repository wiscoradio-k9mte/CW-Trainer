// @vitest-environment jsdom
//
// BASELINE: COPY (receiving) and LEARN (Koch lessons) tabs.
// What this locks:
//   COPY  — the "What to copy" level ladder + Conditions controls render, a
//           level can be selected (pressed), and the copy input accepts typing.
//   LEARN — the CHARS lesson setup renders (lesson nav, START DRILL), the sub-nav
//           (CHARS/LINGO/ON AIR/HISTORY) switches sections, and starting a drill
//           enters the drill view.
// By role/text/label so the rail-split in the refactor can't drop these.

import { describe, it, expect, afterEach, vi } from "vitest";
import { fireEvent, act } from "@testing-library/react";
import { renderApp, gotoTab, chooseOption, screen } from "./helpers.jsx";
import { WIDE_WORD_POOL, COMMON_WORDS } from "../cw-core.js";

describe("COPY tab — setup and interaction", () => {
  it("renders the level ladder and the Conditions control", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    expect(screen.getByText("What to copy — climb as you improve")).toBeInTheDocument();
    expect(screen.getByText("Conditions")).toBeInTheDocument();

    // The level ladder is a CompactSelect too now. Its trigger shows the current
    // rung (number + label) and its panel holds every rung.
    const ladder = screen.getByRole("combobox", { name: /What to copy/ });
    expect(ladder).toHaveTextContent("1 — 1 character");
    await user.click(ladder);
    expect(screen.getByRole("option", { name: /Callsigns/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    // Conditions is now a CompactSelect combobox; all three difficulties are its
    // options (label-only for COPY, no descriptions per DoR T2).
    await user.click(screen.getByRole("combobox", { name: "Conditions" }));
    for (const label of ["EASY", "NORMAL", "REAL LIFE"]) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
  });

  it("selects a copy level (commits the new rung)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const ladder = screen.getByRole("combobox", { name: /What to copy/ });
    // Default source is "single" — rung 1, "1 character".
    expect(ladder).toHaveTextContent("1 — 1 character");

    await user.click(ladder);
    await user.click(screen.getByRole("option", { name: /Letter groups/ }));
    // The committed value is what the closed trigger shows.
    expect(ladder).toHaveTextContent("3 — Letter groups");

    await user.click(ladder);
    expect(screen.getByRole("option", { name: /Letter groups/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /1 character/ })).toHaveAttribute("aria-selected", "false");
  });

  it("accepts typing into the copy input", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    // The answer input now carries aria-label="Your copy" (the a11y fix added in
    // the COPY-into-rail phase), so we locate it by its accessible name via the
    // textbox role — cleaner and stronger than the old placeholder lookup, and it
    // doubles as the guard that the accessible name is present and correct.
    expect(screen.getByText("Your copy — type what you hear")).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Your copy" });
    await user.type(input, "abc");
    expect(input).toHaveValue("abc");
  });
});

describe("LEARN tab — CHARS setup and drill", () => {
  it("renders the lesson setup with START DRILL", async () => {
    await renderApp(); // opens on LEARN/CHARS by default
    // The lesson stepper's centre is the jump input itself now (harmonized with
    // KEY's fused row). Asserting its VALUE is stronger than the old
    // getByText(/Lesson 1 of/) caption check — that only proved a string rendered,
    // this proves the control reports the lesson the app is actually on.
    expect(screen.getByRole("spinbutton", { name: "Jump to lesson" })).toHaveValue(1);
    expect(screen.getByText("Lesson")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /START DRILL/ })).toBeInTheDocument();
    expect(screen.getByText("Characters in play")).toBeInTheDocument();
  });

  it("switches LEARN sub-sections via the sub-nav", async () => {
    const { user } = await renderApp();

    // CHARS is the default sub-section and is pressed.
    expect(screen.getByRole("button", { name: "CHARS" })).toHaveAttribute("aria-pressed", "true");

    // Switch to ON AIR — START DRILL (a CHARS-only control) disappears.
    await user.click(screen.getByRole("button", { name: "ON AIR" }));
    expect(screen.getByRole("button", { name: "ON AIR" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /START DRILL/ })).not.toBeInTheDocument();

    // Back to CHARS restores it.
    await user.click(screen.getByRole("button", { name: "CHARS" }));
    expect(screen.getByRole("button", { name: /START DRILL/ })).toBeInTheDocument();
  });

  it("enters the drill view when START DRILL is pressed", async () => {
    const { user } = await renderApp();

    await user.click(screen.getByRole("button", { name: /START DRILL/ }));

    // The drill view shows the LISTEN prompt and a REPLAY control, and the
    // setup's START DRILL button is gone.
    expect(screen.getByText("LISTEN...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /REPLAY/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /START DRILL/ })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// v2.0 §4: LEARN correct-answer parity — both ✓ and ✗ show char + pattern
// ---------------------------------------------------------------------------
// The Lesson 1 pool is K + M (ARRL Koch order). Clicking either button after
// START DRILL always triggers a flash, whether right or wrong.
// After clicking, flash is visible until a 600ms / 1200ms timer fires — in
// real timers (default for this suite) the assertion runs synchronously before
// any timer callback, so the flash is still on screen.
// GATE-REWRITE.  The original two §4 tests asserted only that SOME [✓✗] and SOME
// Morse glyph appeared ANYWHERE in document.body.textContent.  That does NOT bite
// the §4 change for two reasons:
//   1. The LEARN character chart in the rail renders a Morse glyph for every
//      character permanently, so [·−] is always present regardless of the flash.
//   2. The whole point of §4 is the CORRECT (✓) branch now showing char+pattern;
//      the original tests never forced a correct answer and never scoped to the
//      flash, so reverting the correct branch to bare "✓" left both tests GREEN
//      (verified by the gate via mutation).
//
// These rewritten tests force a deterministic CORRECT answer (Math.random mocked
// so nextDrill picks a known target) and scope the assertion to the flash element
// (the span carrying the ✓/✗ mark), asserting the correct flash shows the
// character AND its Morse pattern — the exact §4 behavior.
describe("LEARN — correct-answer flash shows char + Morse pattern (v2.0 §4)", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  // Find the flash span (the colored mark element) and return its text, or "".
  function flashText() {
    // The flash mark always begins with ✓ (correct) or ✗ (wrong). Find the
    // deepest element whose text starts with one of those marks.
    const all = Array.from(document.querySelectorAll("span"));
    const hit = all.find((el) => /^[✓✗]/.test((el.textContent || "").trim()));
    return hit ? (hit.textContent || "").trim() : "";
  }

  it("a CORRECT answer flash shows ✓, the character, AND its Morse glyphs", async () => {
    // nextDrill: Math.random() < 0.25 ? newChars[last] : rand(pool).
    // Mock to 0.5 → takes rand(pool); rand = pool[floor(0.5*2)] = pool[1] = "M"
    // (lesson 1 pool = [K, M]). So the target is deterministically M.
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: /START DRILL/ }));
    // Click M — matches the target → CORRECT (✓) branch.
    await user.click(screen.getByRole("button", { name: "M" }));

    const text = flashText();
    // Must be the correct branch.
    expect(text.startsWith("✓")).toBe(true);
    // §4: the correct flash must also carry the character...
    expect(text).toContain("M");
    // ...and its Morse pattern glyphs (M = "−−" → "− −"). A bare "✓" has none.
    expect(text).toMatch(/[·−]/);
  });

  it("a WRONG answer flash still shows ✗, the character, and its glyphs (regression)", async () => {
    // Target M again; click K → WRONG (✗) branch. The wrong branch already showed
    // char+pattern pre-v2.0 — this is the regression guard that the refactor to a
    // shared expression didn't break it.
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: /START DRILL/ }));
    await user.click(screen.getByRole("button", { name: "K" }));

    const text = flashText();
    expect(text.startsWith("✗")).toBe(true);
    expect(text).toContain("M");      // the TARGET char (what they should have sent)
    expect(text).toMatch(/[·−]/);
  });
});

// ---------------------------------------------------------------------------
// COPY tab — Phase 3 pool routing (words_en wiring)
//
// Guards that:
//   1. All 8 rungs exist in the level ladder (including the two new ones).
//   2. Selecting "wordswide" produces tokens from WIDE_WORD_POOL.
//   3. Selecting "hamwords" produces tokens from COMMON_WORDS (ham vocab).
//
// Each test must BITE: deleting the wordswide rung, or mis-wiring hamwords
// to the wrong pool, must turn it RED — verified via mutation before commit.
// ---------------------------------------------------------------------------

// Helper: navigate to COPY, select a rung, generate a target, reveal it,
// and return the raw target string for pool-membership assertions.
async function generateAndReveal(user, rungLabel) {
  await gotoTab(user, "COPY");
  // The ladder is a CompactSelect: open the trigger, then commit the rung.
  await chooseOption(user, /What to copy/, new RegExp(rungLabel));

  // ▶ NEW starts a 5-second countdown; skip it with fake timers.
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: /▶ NEW/ }));
  act(() => { vi.advanceTimersByTime(6000); });
  vi.useRealTimers();

  // Flush any remaining React state updates.
  await act(async () => {});

  // Reveal the target (CHECK has not been clicked so result===null → Display shows raw target).
  await user.click(screen.getByRole("button", { name: /REVEAL/ }));

  // The "Sent" heading directly precedes the Display element in the DOM.
  const sentEl = screen.getByText("Sent");
  return sentEl.nextElementSibling.textContent.trim();
}

describe("COPY tab — Phase 3 pool routing", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("level ladder panel shows all 8 rungs with their number AND their description", async () => {
    // Mutation to prove bite: delete the wordswide or hamwords row from COPY_LEVELS
    // → the corresponding getByRole call throws → test FAILS.
    //
    // This also pins the COPY-ladder adoption's user-visible gain: before, only
    // the SELECTED rung showed its guidance; now every rung's description is in
    // the open panel, at the moment of choice. Dropping `description` from the
    // options mapping turns the textContent assertions red.
    const { user } = await renderApp();
    await gotoTab(user, "COPY");
    await user.click(screen.getByRole("combobox", { name: /What to copy/ }));

    // [rung number, label, a distinctive phrase from that rung's description]
    const expected = [
      ["1", "1 character",      "One character at a time"],
      ["2", "2-char groups",    "Two characters together"],
      ["3", "Letter groups",    "Short random groups of 3-4"],
      ["4", "Common words",     "The 500 most common English words"],
      ["5", "Wider vocabulary", "ranks 1001–5000"],   // bites if the wordswide rung is removed
      ["6", "Ham words",        "TNX, FER, RST, QTH"], // bites if the hamwords rung is removed
      ["7", "Callsigns",        "no rhythm to predict"],
      ["8", "QSO phrases",      "Full exchange fragments"],
    ];
    const rows = screen.getAllByRole("option");
    expect(rows).toHaveLength(8);
    expected.forEach(([num, label, descPhrase], i) => {
      // Rows are in ladder order, and each carries its rung numeral, its label,
      // and its guidance description — all three visible without selecting it.
      expect(rows[i]).toHaveTextContent(num);
      expect(rows[i]).toHaveTextContent(label);
      expect(rows[i]).toHaveTextContent(descPhrase);
    });
  });

  it("'wordswide' rung produces tokens exclusively from WIDE_WORD_POOL", async () => {
    // WIDE_WORD_POOL and COMMON_WORD_POOL are DISJOINT (verified; 0 overlap).
    // Any token from the wrong pool cannot be in wideUpper → assertion fails.
    //
    // Mutation to prove bite: change "wordswide" newTarget branch to use
    // drillCommonWords(4) instead of drillWiderWords(4) → tokens like "THE"
    // are in COMMON_WORD_POOL but NOT in wideUpper → FAILS.
    const wideUpper = new Set(WIDE_WORD_POOL.map(w => w.toUpperCase()));
    const { user } = await renderApp();
    const targetText = await generateAndReveal(user, "Wider vocabulary");

    const tokens = targetText.split(/\s+/).filter(Boolean);
    expect(tokens.length).toBeGreaterThan(0);
    for (const tok of tokens) {
      expect(wideUpper.has(tok)).toBe(true);
    }
  });

  it("'hamwords' rung produces tokens exclusively from COMMON_WORDS (ham vocab)", async () => {
    // If hamwords is mis-wired to an English pool (e.g. WIDE_WORD_POOL), it would
    // produce tokens like "BOOKS" or "STUMP" — neither is in COMMON_WORDS → FAILS.
    //
    // Mutation to prove bite: change "hamwords" branch to drillWiderWords(4)
    // → English words appear → not in COMMON_WORDS → FAILS.
    const { user } = await renderApp();
    const targetText = await generateAndReveal(user, "Ham words");

    const tokens = targetText.split(/\s+/).filter(Boolean);
    expect(tokens.length).toBeGreaterThan(0);
    for (const tok of tokens) {
      expect(COMMON_WORDS).toContain(tok);
    }
  });
});
