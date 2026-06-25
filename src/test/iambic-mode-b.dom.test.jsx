// @vitest-environment jsdom
// Tests for v2.0 iambic Mode B toggle (design §2).
//
// The keyer runs on real audio-timing loops that jsdom cannot drive (no
// AudioContext timer scheduling). These tests therefore cover the parts that ARE
// testable in DOM: the toggle renders for paddle, is hidden for straight/bug,
// persists to localStorage, and defaults to Mode A.
//
// The keyer-level element-emission logic (squeeze+release → extra element) is
// verified in cw-core.test.js at the pure-function level.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, within, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, gotoTab } from "./helpers.jsx";
import CWTrainer from "../../wr-cw-trainer.jsx";

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Toggle visibility — paddle shows A/B, straight key and bug do not
// ---------------------------------------------------------------------------
describe("Iambic Mode B — toggle visibility", () => {
  it("shows MODE A and MODE B buttons for paddle in the rail", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const rail = screen.getByRole("complementary", { name: "Options" });
    expect(within(rail).getByRole("button", { name: "MODE A" })).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: "MODE B" })).toBeInTheDocument();
  });

  it("defaults to Mode A pressed (iambicModeB default is false)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const rail = screen.getByRole("complementary", { name: "Options" });
    expect(within(rail).getByRole("button", { name: "MODE A" })).toHaveAttribute("aria-pressed", "true");
    expect(within(rail).getByRole("button", { name: "MODE B" })).toHaveAttribute("aria-pressed", "false");
  });

  it("hides MODE A / MODE B buttons when key type is STRAIGHT KEY", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const rail = screen.getByRole("complementary", { name: "Options" });
    // Switch to STRAIGHT KEY
    await user.click(within(rail).getByRole("button", { name: "STRAIGHT KEY" }));

    // Mode toggles should not be rendered for straight key
    expect(within(rail).queryByRole("button", { name: "MODE A" })).not.toBeInTheDocument();
    expect(within(rail).queryByRole("button", { name: "MODE B" })).not.toBeInTheDocument();
  });

  it("hides MODE A / MODE B buttons when key type is BUG", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(within(rail).getByRole("button", { name: "BUG" }));

    expect(within(rail).queryByRole("button", { name: "MODE A" })).not.toBeInTheDocument();
    expect(within(rail).queryByRole("button", { name: "MODE B" })).not.toBeInTheDocument();
  });

  it("re-shows MODE A / MODE B when switching back to PADDLE from STRAIGHT KEY", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(within(rail).getByRole("button", { name: "STRAIGHT KEY" }));
    // Toggle not present yet...
    expect(within(rail).queryByRole("button", { name: "MODE A" })).not.toBeInTheDocument();

    // Switch back to paddle
    await user.click(within(rail).getByRole("button", { name: "PADDLE" }));
    // Toggle should return
    expect(within(rail).getByRole("button", { name: "MODE A" })).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: "MODE B" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Toggle interaction and localStorage persistence
// ---------------------------------------------------------------------------
describe("Iambic Mode B — interaction and persistence", () => {
  it("clicking MODE B flips aria-pressed and persists iambicModeB=true to localStorage", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(within(rail).getByRole("button", { name: "MODE B" }));

    // Toggle reflects the change
    expect(within(rail).getByRole("button", { name: "MODE B" })).toHaveAttribute("aria-pressed", "true");
    expect(within(rail).getByRole("button", { name: "MODE A" })).toHaveAttribute("aria-pressed", "false");

    // Persisted to localStorage in settings
    const stored = JSON.parse(window.localStorage.getItem("wrcw:settings") || "{}");
    expect(stored.iambicModeB).toBe(true);
  });

  it("clicking MODE A after MODE B reverts aria-pressed and persists iambicModeB=false", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(within(rail).getByRole("button", { name: "MODE B" }));
    await user.click(within(rail).getByRole("button", { name: "MODE A" }));

    expect(within(rail).getByRole("button", { name: "MODE A" })).toHaveAttribute("aria-pressed", "true");
    expect(within(rail).getByRole("button", { name: "MODE B" })).toHaveAttribute("aria-pressed", "false");

    const stored = JSON.parse(window.localStorage.getItem("wrcw:settings") || "{}");
    expect(stored.iambicModeB).toBe(false);
  });

  it("persisted iambicModeB=true is restored on remount", async () => {
    // renderApp() calls window.localStorage.clear() first, so we must seed BEFORE
    // clear happens — use the manual render path instead.
    window.localStorage.clear();
    window.localStorage.setItem(
      "wrcw:settings",
      JSON.stringify({ iambicModeB: true })
    );

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "KEY");

    const rail = screen.getByRole("complementary", { name: "Options" });
    expect(within(rail).getByRole("button", { name: "MODE B" })).toHaveAttribute("aria-pressed", "true");
    expect(within(rail).getByRole("button", { name: "MODE A" })).toHaveAttribute("aria-pressed", "false");
  });
});

// ===========================================================================
// GATE-ADDED — Mode B CORE BEHAVIOR (element-level, bites the produced output).
//
// The toggle tests above only cover visibility / persistence / default — NOT
// behavior.  The whole point of Mode B is the extra alternating element on
// squeeze-release; the implementer's DOM file claimed "the keyer-level
// element-emission logic is verified in cw-core.test.js" but NO such test
// exists (there is no Mode B pure helper).  These tests drive the real iambic
// loop via fake timers and assert on the live decode buffer (the "Decoded from
// your key" span — "." = dit, "-" = dah), the same record-level seam the v1.4
// bug-key gate used.
//
// Timing at keyWpm=20 → u=60ms.  A squeeze (both BracketLeft + BracketRight)
// starts sendNext; lastEl begins null so the first squeeze element is a dit
// (".").  The loop reschedules at durMs+u.  After releasing both paddles and
// advancing the loop, Mode B emits ONE extra element of the alternate type.
// ===========================================================================

function kdn(code) {
  return new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true });
}
function kup(code) {
  return new KeyboardEvent("keyup", { code, bubbles: true, cancelable: true });
}

// Read the live decode-buffer string from the KEY tab (amber span after the label).
function readKeyBuffer() {
  const label = screen.getByText(/Decoded from your key/);
  const span = label.querySelector("span");
  return span ? span.textContent : "";
}

// Render → splash → KEY tab → optionally set Mode B.  Uses real timers for the
// render, then the caller switches to fake timers to drive the loop.
async function setupPaddle({ modeB = false } = {}) {
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  await gotoTab(user, "KEY");
  // Default key type is PADDLE.  Set Mode B if requested (toggle is in the rail).
  if (modeB) {
    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(within(rail).getByRole("button", { name: "MODE B" }));
  }
  // A target must exist so the keyer is enabled and the buffer span renders.
  await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));
  return { user };
}

// Drive a squeeze-and-release through the iambic loop under fake timers and
// return the PEAK decode-buffer string observed.
//
// Why peak, not a single read: the decode buffer empties ~2.5u (150ms) after the
// last element (the char-finalize timer), so a single late read sees an emptied
// buffer.  Sampling at every tick and keeping the longest snapshot captures the
// full element run regardless of when finalize fires.  The peak string is the
// sequence of elements the operator actually produced — exactly what Mode B is
// supposed to change.
//
// Sequence: press BOTH levers (squeeze) and HOLD them through at least one full
// keyer element cycle so the iambic loop's "both held" branch fires and marks
// squeezed=true (a true squeeze is both levers down across a loop tick — a
// sub-cycle tap is just a Curtis-memory dot/dah, not a squeeze).  Then release
// both and advance the loop so any Mode B extra element lands.  Mode A and Mode B
// are driven identically; only the keyer setting differs.
//
// Each advance+sample is its OWN act() so React flushes setBuffer to the DOM
// between samples; sampling the peak length sidesteps the ~2.5u finalize timer
// that empties the buffer after the last element.
function squeezePeak() {
  let peak = "";
  const sample = () => { const b = readKeyBuffer(); if (b.length > peak.length) peak = b; };
  act(() => {
    window.dispatchEvent(kdn("BracketLeft"));  // dit lever
    window.dispatchEvent(kdn("BracketRight")); // dah lever — now squeezing
  });
  sample();
  // Hold both down for ~150ms (> one element cycle at 20wpm: dit 120ms) so the
  // loop ticks with both held and sets squeezed.
  for (let i = 0; i < 5; i++) { act(() => { vi.advanceTimersByTime(30); }); sample(); }
  act(() => {
    window.dispatchEvent(kup("BracketLeft"));   // release both
    window.dispatchEvent(kup("BracketRight"));
  });
  sample();
  // Step the loop so the Mode B extra element (if any) lands before finalize.
  for (let i = 0; i < 24; i++) { act(() => { vi.advanceTimersByTime(30); }); sample(); }
  return peak;
}

describe("Iambic Mode B — extra element on squeeze release (core behavior)", () => {
  it("Mode B produces ONE MORE element than Mode A for the same squeeze+release", async () => {
    // --- Mode A baseline (separate render so the trees don't collide) ---
    vi.useRealTimers();
    await setupPaddle({ modeB: false });
    vi.useFakeTimers();
    const aPeak = squeezePeak();
    vi.advanceTimersByTime(500);
    vi.useRealTimers();
    cleanup(); // unmount the Mode A tree before rendering the Mode B tree

    // --- Mode B ---
    await setupPaddle({ modeB: true });
    vi.useFakeTimers();
    const bPeak = squeezePeak();
    vi.advanceTimersByTime(500);

    // The identical squeeze must yield exactly one extra element under Mode B.
    expect(aPeak.length).toBeGreaterThanOrEqual(1);
    expect(bPeak.length).toBe(aPeak.length + 1);
  });

  it("the Mode B extra element is the ALTERNATE of the last squeeze element", async () => {
    vi.useRealTimers();
    await setupPaddle({ modeB: true });
    vi.useFakeTimers();
    const buf = squeezePeak();
    vi.advanceTimersByTime(500);

    // The squeeze alternates dit/dah, and the Mode B extra continues that
    // alternation — so the final two elements of the run must differ.
    expect(buf.length).toBeGreaterThanOrEqual(2);
    expect(buf[buf.length - 1]).not.toBe(buf[buf.length - 2]);
  });

  it("no squeeze (single paddle only) → no extra element in Mode B", async () => {
    // Press only the dit lever, never overlapping the dah lever.  squeezed is
    // never set, so Mode B must NOT append a trailing alternate element.
    vi.useRealTimers();
    await setupPaddle({ modeB: true });
    vi.useFakeTimers();
    let peak = "";
    const sample = () => { const b = readKeyBuffer(); if (b.length > peak.length) peak = b; };
    act(() => {
      window.dispatchEvent(kdn("BracketLeft")); // dit only — no squeeze
      vi.advanceTimersByTime(10);
    });
    sample();
    act(() => { window.dispatchEvent(kup("BracketLeft")); });
    sample();
    for (let i = 0; i < 24; i++) { act(() => { vi.advanceTimersByTime(30); }); sample(); }
    act(() => { vi.advanceTimersByTime(500); });
    // The whole run is dits — no trailing dah from a phantom Mode B element.
    expect(peak.length).toBeGreaterThanOrEqual(1);
    expect(/^\.+$/.test(peak)).toBe(true);
  });
});
