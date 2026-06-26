// @vitest-environment jsdom
//
// Bug key (v1.4) behavior tests.
//
// BUG_KEY_ENABLED is currently false (shelved 2026-06-25 pending research —
// see docs/design-bug-key.md + the brief).  Tests are grouped accordingly:
//
//   HIDDEN-STATE tests (run now, BUG_KEY_ENABLED=false):
//     F1-hidden  — BUG is NOT offered in the selector; only PADDLE + STRAIGHT KEY
//     F4-hidden  — persisted keyType:"bug" falls back to PADDLE; no BugKey surface
//
//   DORMANT-PATH tests (skipped while BUG_KEY_ENABLED=false; re-enable by
//   removing .skip when the flag is flipped back to true):
//     F2, F3, C, D, E, B — test behavior that requires selecting BUG in the UI
//
// The pure/hook-level bug-behavior tests (analyzeFist bug semantics, the bug
// keyer element tests) live in cw-core.test.js and run green as dormant coverage.
//
// Tests that need fake timers call vi.useFakeTimers() locally and clean up in
// afterEach.  Tests that do NOT need fake timers use real timers (renderApp /
// renderBugMode helpers below).  The two groups are in separate describe blocks
// so they cannot cross-contaminate each other's timer state.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, gotoTab } from "./helpers.jsx";
import CWTrainer from "../../wr-cw-trainer.jsx";

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------
let savedMatchMedia;

function setMatchMedia(wide) {
  window.matchMedia = (query) => ({
    matches: wide,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() { return false; },
  });
}

beforeEach(() => {
  savedMatchMedia = window.matchMedia;
});
afterEach(() => {
  window.matchMedia = savedMatchMedia;
  vi.useRealTimers(); // always restore real timers — no-op if already real
});

// Navigate to KEY tab. When BUG_KEY_ENABLED=true also select BUG; used by
// the dormant tests below.
async function gotoKeyBug(user) {
  await user.click(screen.getByRole("button", { name: "KEY" }));
  await user.click(screen.getByRole("button", { name: "BUG" }));
}

// Full render + splash dismiss + KEY, wide layout. Used by hidden-state tests.
async function renderKeyWide() {
  setMatchMedia(true);
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  await user.click(screen.getByRole("button", { name: "KEY" }));
  return { user };
}

// Full render + splash dismiss + KEY + BUG (dormant path), wide layout.
// Only valid when BUG_KEY_ENABLED is true.
async function renderBugWide() {
  setMatchMedia(true);
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  await gotoKeyBug(user);
  return { user };
}

async function renderBugNarrow() {
  setMatchMedia(false);
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  await gotoKeyBug(user);
  return { user };
}

// ===========================================================================
// HIDDEN-STATE TESTS (active while BUG_KEY_ENABLED=false)
//
// These are the "biting" tests: they FAIL if BUG reappears in the selector
// while the flag is false, and they verify the persisted-bug fallback.
// ===========================================================================

// ---------------------------------------------------------------------------
// F1-hidden: BUG is NOT offered in the key-type selector.
// Bites: if BUG_KEY_ENABLED is accidentally flipped true, these fail.
// ---------------------------------------------------------------------------
describe("F1-hidden — BUG absent from selector (BUG_KEY_ENABLED=false)", () => {
  it("key-type selector offers PADDLE and STRAIGHT KEY but NOT BUG", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");
    expect(screen.getByRole("button", { name: "PADDLE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "STRAIGHT KEY" })).toBeInTheDocument();
    // BUG must not be reachable — this is the bite that guards the hidden state.
    expect(screen.queryByRole("button", { name: "BUG" })).not.toBeInTheDocument();
  });

  it("PADDLE starts pressed and STRAIGHT KEY is visible (selector works without BUG)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");
    expect(screen.getByRole("button", { name: "PADDLE" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "STRAIGHT KEY" })).toHaveAttribute("aria-pressed", "false");
    // Switching to STRAIGHT KEY works normally — two-option selector is functional.
    await user.click(screen.getByRole("button", { name: "STRAIGHT KEY" }));
    expect(screen.getByRole("button", { name: "STRAIGHT KEY" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "PADDLE" })).toHaveAttribute("aria-pressed", "false");
  });
});

// ---------------------------------------------------------------------------
// F4-hidden: persisted keyType:"bug" falls back to "paddle" at load time;
// the BugKey surface is never rendered.
// Bites: if the coercion is missing, a returning user with stored "bug" would
// find the app in an unreachable mode (no selector option, no key surface).
// ---------------------------------------------------------------------------
describe("F4-hidden — persisted keyType:\"bug\" falls back to PADDLE (BUG_KEY_ENABLED=false)", () => {
  it("a stored keyType:\"bug\" lands the user on PADDLE, not BUG", async () => {
    window.localStorage.clear();
    window.localStorage.setItem("wrcw:settings", JSON.stringify({ keyType: "bug" }));
    setMatchMedia(true);

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await user.click(screen.getByRole("button", { name: "KEY" }));

    // PADDLE must be selected (the coercion ran); BUG must not appear at all.
    expect(screen.getByRole("button", { name: "PADDLE" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "BUG" })).not.toBeInTheDocument();
  });

  it("a stored keyType:\"bug\" does NOT render the BugKey surface (no DIT/DAH zones)", async () => {
    window.localStorage.clear();
    window.localStorage.setItem("wrcw:settings", JSON.stringify({ keyType: "bug" }));
    setMatchMedia(true);

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await user.click(screen.getByRole("button", { name: "KEY" }));

    // The BugKey zones must not be in the DOM — the paddle surface is shown instead.
    expect(screen.queryByRole("button", { name: /Bug dit lever/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bug dah/ })).not.toBeInTheDocument();
    // The paddle surface renders.
    const main = screen.getByRole("main");
    expect(within(main).getByRole("button", { name: /Dit paddle/ })).toBeInTheDocument();
  });

  it("coercion does not corrupt other persisted settings (keyWpm stays at stored value)", async () => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "wrcw:settings",
      JSON.stringify({ keyType: "bug", keyWpm: 18 })
    );
    setMatchMedia(true);

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    // Open Settings so the keyWpm slider renders; the amber value display shows
    // the live value as "{value}{suffix}" text (e.g. "18 wpm").
    await user.click(screen.getByRole("button", { name: /Settings/ }));
    // The slider group renders "18 wpm" next to the keying-speed label.
    expect(screen.getByText("18 wpm")).toBeInTheDocument();
  });
});

// ===========================================================================
// DORMANT-PATH TESTS — skipped while BUG_KEY_ENABLED=false.
//
// These tests exercise behavior that requires the BUG option in the selector.
// They are preserved so re-enabling is trivial: remove the .skip when
// BUG_KEY_ENABLED is set back to true.  The underlying keyer and cw-core logic
// they cover is green in cw-core.test.js already (hook/pure-function level).
// ===========================================================================

// ---------------------------------------------------------------------------
// F2: selecting BUG renders BugKey (DIT + DAH zones), not TouchKey or PaddleKey.
// Bites: surface wiring (wrong component rendered for bug mode).
// ---------------------------------------------------------------------------
describe.skip("F2 — BugKey surface renders for BUG mode [DORMANT: BUG_KEY_ENABLED=false]", () => {
  it("BUG mode shows a DIT zone and a DAH zone in main", async () => {
    await renderBugWide();
    const main = screen.getByRole("main");
    expect(within(main).getByRole("button", { name: /Bug dit lever/ })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: /Bug dah/ })).toBeInTheDocument();
  });

  it("BUG mode does NOT render the straight TouchKey or PaddleKey", async () => {
    await renderBugWide();
    const main = screen.getByRole("main");
    expect(within(main).queryByRole("button", { name: /Straight key/ })).not.toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: /Dit paddle/ })).not.toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: /Dah paddle/ })).not.toBeInTheDocument();
  });

  it("switching from BUG back to PADDLE restores the paddle surface", async () => {
    const { user } = await renderBugWide();
    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(within(rail).getByRole("button", { name: "PADDLE" }));
    const main = screen.getByRole("main");
    expect(within(main).getByRole("button", { name: /Dit paddle/ })).toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: /Bug dit lever/ })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// F3: SwapToggle above key surface in main; absent for straight key.
// Bites: the reposition (req 6) and the visibility condition.
// ---------------------------------------------------------------------------
// NOTE (updated 2026-06-25): SwapToggle was moved from above the key surface in
// main into optionsJSX (alongside KeyModeControls), matching QSO's KeyInput pattern.
// On wide it portals into the rail with the type selector; on narrow it is inline in
// main with the type selector. Tests below are updated to match the new placement.
describe.skip("F3 — SwapToggle position and visibility [DORMANT: BUG_KEY_ENABLED=false]", () => {
  it("swap button appears in the Options rail in wide layout (travels with type selector)", async () => {
    await renderBugWide();
    const rail = screen.getByRole("complementary", { name: "Options" });
    expect(within(rail).getByRole("button", { name: /Swap dit and dah/ })).toBeInTheDocument();
  });

  it("swap button is absent from main on wide (it is in the rail with optionsJSX)", async () => {
    await renderBugWide();
    const main = screen.getByRole("main");
    expect(within(main).queryByRole("button", { name: /Swap dit and dah/ })).not.toBeInTheDocument();
  });

  it("swap button is present in main on narrow layout (inline with type selector, no rail)", async () => {
    await renderBugNarrow();
    const main = screen.getByRole("main");
    expect(within(main).getByRole("button", { name: /Swap dit and dah/ })).toBeInTheDocument();
  });

  it("swap button is ABSENT for straight key mode", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");
    await user.click(screen.getByRole("button", { name: "STRAIGHT KEY" }));
    expect(screen.queryByRole("button", { name: /Swap dit and dah/ })).not.toBeInTheDocument();
  });

  it("swap button is present for paddle mode in the rail on wide (not broken by BUG addition)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");
    const rail = screen.getByRole("complementary", { name: "Options" });
    expect(within(rail).getByRole("button", { name: /Swap dit and dah/ })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// F4: keyType "bug" persists through the store (not the string "paddle").
// [DORMANT — tests that require clicking BUG in the selector]
// ---------------------------------------------------------------------------
describe.skip("F4 — keyType bug stores as \"bug\" not \"paddle\" [DORMANT: BUG_KEY_ENABLED=false]", () => {
  it("'bug' from stored settings shows BUG selected on load", async () => {
    window.localStorage.clear();
    window.localStorage.setItem("wrcw:settings", JSON.stringify({ keyType: "bug" }));
    setMatchMedia(true);

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await user.click(screen.getByRole("button", { name: "KEY" }));

    expect(screen.getByRole("button", { name: "BUG" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "PADDLE" })).toHaveAttribute("aria-pressed", "false");
  });

  it("'bug' is not stored as the string 'paddle' (acceptance criterion 1)", async () => {
    window.localStorage.clear();
    setMatchMedia(true);

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await user.click(screen.getByRole("button", { name: "KEY" }));
    await user.click(screen.getByRole("button", { name: "BUG" }));

    const stored = JSON.parse(window.localStorage.getItem("wrcw:settings") ?? "{}");
    expect(stored.keyType).toBe("bug");
    expect(stored.keyType).not.toBe("paddle");
  });
});

// ---------------------------------------------------------------------------
// C, D, E, B: keyboard-dispatch tests (all dormant — require BUG mode active)
// ---------------------------------------------------------------------------

async function setupKeyboard({ wide = true, swapped = false } = {}) {
  setMatchMedia(wide);
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  await user.click(screen.getByRole("button", { name: "KEY" }));
  await user.click(screen.getByRole("button", { name: "BUG" }));
  if (swapped) {
    // SwapToggle is now in the rail on wide (travels with optionsJSX).
    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(within(rail).getByRole("button", { name: /Swap dit and dah/ }));
  }
  await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));
}

function kdn(code, extra = {}) {
  return new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true, ...extra });
}
function kup(code) {
  return new KeyboardEvent("keyup", { code, bubbles: true, cancelable: true });
}

describe.skip("C — Bug dah from Space (keyboard) [DORMANT: BUG_KEY_ENABLED=false]", () => {
  it("C4: Space keydown in bug mode sets defaultPrevented", async () => {
    await setupKeyboard();
    const ev = kdn("Space");
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    window.dispatchEvent(kup("Space"));
  });

  it("C3: Space with repeat:true is NOT claimed (global repeat guard fires first)", async () => {
    await setupKeyboard();
    const ev = kdn("Space", { repeat: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe.skip("D — inField guard in bug mode [DORMANT: BUG_KEY_ENABLED=false]", () => {
  it("D1: Space dispatched from INPUT target is not claimed (inField)", async () => {
    await setupKeyboard();
    const inp = document.createElement("input");
    document.body.appendChild(inp);
    inp.focus();
    const ev = new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true });
    inp.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    document.body.removeChild(inp);
  });

  it("D2: BracketLeft dispatched from INPUT target is not claimed (inField)", async () => {
    await setupKeyboard();
    const inp = document.createElement("input");
    document.body.appendChild(inp);
    inp.focus();
    const ev = new KeyboardEvent("keydown", { code: "BracketLeft", bubbles: true, cancelable: true });
    inp.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    document.body.removeChild(inp);
  });
});

describe.skip("E — Swap in bug mode [DORMANT: BUG_KEY_ENABLED=false]", () => {
  it("E1 (no swap): BracketLeft gets preventDefault (dit lever)", async () => {
    await setupKeyboard({ swapped: false });
    const ev = kdn("BracketLeft");
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    vi.useFakeTimers();
    vi.advanceTimersByTime(500);
    vi.useRealTimers();
  });

  it("E1 (no swap): BracketRight NOT claimed (not the dit lever)", async () => {
    await setupKeyboard({ swapped: false });
    const ev = kdn("BracketRight");
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("E1 (swap=true): BracketRight gets preventDefault (becomes dit lever)", async () => {
    await setupKeyboard({ swapped: true });
    const ev = kdn("BracketRight");
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    vi.useFakeTimers();
    vi.advanceTimersByTime(500);
    vi.useRealTimers();
  });

  it("E1 (swap=true): BracketLeft NOT claimed (no longer the dit lever)", async () => {
    await setupKeyboard({ swapped: true });
    const ev = kdn("BracketLeft");
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("E2: Space claimed as dah with swap=false", async () => {
    await setupKeyboard({ swapped: false });
    const ev = kdn("Space");
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    window.dispatchEvent(kup("Space"));
  });

  it("E2: Space claimed as dah with swap=true", async () => {
    await setupKeyboard({ swapped: true });
    const ev = kdn("Space");
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    window.dispatchEvent(kup("Space"));
  });
});

function readKeyBuffer() {
  const label = screen.getByText(/Decoded from your key/);
  const span = label.querySelector("span");
  return span ? span.textContent : "";
}

describe.skip("C-record — Space records a DAH element [DORMANT: BUG_KEY_ENABLED=false]", () => {
  it("C2: a short Space tap is recorded as a DAH ('-'), not a dit ('.')", async () => {
    await setupKeyboard();
    act(() => {
      window.dispatchEvent(kdn("Space"));
      window.dispatchEvent(kup("Space"));
    });
    expect(readKeyBuffer()).toBe("-");
  });

  it("C1: a Space keydown+keyup records exactly one DAH element", async () => {
    await setupKeyboard();
    act(() => {
      window.dispatchEvent(kdn("Space"));
      window.dispatchEvent(kup("Space"));
    });
    const buf = readKeyBuffer();
    expect(buf).toBe("-");
    expect(buf.length).toBe(1);
  });
});

describe.skip("B-record / E-record — dit lever records DIT elements [DORMANT: BUG_KEY_ENABLED=false]", () => {
  it("B-record: holding the dit lever records dits ('.') in the buffer", async () => {
    vi.useRealTimers();
    await setupKeyboard();
    vi.useFakeTimers();
    act(() => {
      window.dispatchEvent(kdn("BracketLeft"));
      vi.advanceTimersByTime(150);
    });
    vi.advanceTimersByTime(500);
    const buf = readKeyBuffer();
    expect(buf.length).toBeGreaterThanOrEqual(1);
    expect(/^\.+$/.test(buf)).toBe(true);
  });

  it("B2-record: a stray keyup is ignored — a dit still fires from keep-alive alone", async () => {
    vi.useRealTimers();
    await setupKeyboard();
    vi.useFakeTimers();
    act(() => {
      window.dispatchEvent(kdn("BracketLeft"));
      vi.advanceTimersByTime(40);
    });
    const before = readKeyBuffer().length;
    expect(before).toBeGreaterThanOrEqual(1);
    act(() => {
      window.dispatchEvent(kup("BracketLeft"));
      vi.advanceTimersByTime(120);
    });
    const after = readKeyBuffer().length;
    expect(after).toBeGreaterThan(before);
    vi.advanceTimersByTime(600);
  });

  it("E-record: Space is a DAH and the swapped dit lever is a DIT (swap=true)", async () => {
    vi.useRealTimers();
    await setupKeyboard({ swapped: true });
    act(() => {
      window.dispatchEvent(kdn("Space"));
      window.dispatchEvent(kup("Space"));
    });
    expect(readKeyBuffer()).toBe("-");
  });
});

describe.skip("B — Bug dit keep-alive (keyboard) [DORMANT: BUG_KEY_ENABLED=false]", () => {
  it("B1: machine-gun BracketLeft keydowns are each claimed (preventDefault)", async () => {
    vi.useRealTimers();
    await setupKeyboard();
    vi.useFakeTimers();

    for (let i = 0; i < 5; i++) {
      const ev = kdn("BracketLeft");
      window.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      vi.advanceTimersByTime(30);
    }
    vi.advanceTimersByTime(500);
  });

  it("B2: stray keyup mid-stream — next keydown still gets preventDefault", async () => {
    vi.useRealTimers();
    await setupKeyboard();
    vi.useFakeTimers();

    const ev1 = kdn("BracketLeft");
    window.dispatchEvent(ev1);
    expect(ev1.defaultPrevented).toBe(true);

    window.dispatchEvent(kup("BracketLeft"));

    vi.advanceTimersByTime(30);
    const ev2 = kdn("BracketLeft");
    window.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(true);

    vi.advanceTimersByTime(500);
  });
});
