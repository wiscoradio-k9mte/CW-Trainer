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
import { renderApp, gotoTab, screen } from "./helpers.jsx";

describe("COPY tab — setup and interaction", () => {
  it("renders the level ladder and the Conditions controls", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    expect(screen.getByText("What to copy — climb as you improve")).toBeInTheDocument();
    expect(screen.getByText("Conditions")).toBeInTheDocument();

    // A couple of the level options and all three conditions.
    expect(screen.getByRole("button", { name: /1 character/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Callsigns/ })).toBeInTheDocument();
    for (const label of ["EASY", "NORMAL", "REAL LIFE"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("selects a copy level (marks it pressed)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    // Default source is "single" (1 character).
    expect(screen.getByRole("button", { name: /1 character/ })).toHaveAttribute("aria-pressed", "true");

    const groups = screen.getByRole("button", { name: /Letter groups/ });
    await user.click(groups);
    expect(groups).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /1 character/ })).toHaveAttribute("aria-pressed", "false");
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
    expect(screen.getByText(/Lesson 1 of/)).toBeInTheDocument();
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
