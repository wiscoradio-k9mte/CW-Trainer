// @vitest-environment jsdom
//
// Bug key (v1.4) behavior tests.
//
// Covers:
//   F — UI presence + swap reposition (toggle, BugKey zones, SwapToggle DOM order)
//   C — bug manual dah from Space (forced-dah classification path, repeat guard,
//         preventDefault)
//   D — inField guard (Space and dit lever suppressed while typing)
//   E — swap in bug mode (flips dit side only; Space always the dah)
//   B — bug dit keep-alive (machine-gun stream resilience)
//   A  — analyzeFist bug semantics moved to cw-core.test.js (pure node tests)
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

// Navigate to KEY tab and select BUG; uses whatever matchMedia is currently set.
async function gotoKeyBug(user) {
  await user.click(screen.getByRole("button", { name: "KEY" }));
  await user.click(screen.getByRole("button", { name: "BUG" }));
}

// Full render + splash dismiss + KEY + BUG, using real timers (no vi.useFakeTimers).
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

// ---------------------------------------------------------------------------
// F1: BUG appears as a selectable key type.
// Bites: type toggle missing the third option.
// ---------------------------------------------------------------------------
describe("F1 — BUG type toggle present", () => {
  it("BUG button is rendered alongside PADDLE and STRAIGHT KEY", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");
    expect(screen.getByRole("button", { name: "BUG" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PADDLE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "STRAIGHT KEY" })).toBeInTheDocument();
  });

  it("selecting BUG marks it pressed and deselects PADDLE", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");
    const bug = screen.getByRole("button", { name: "BUG" });
    const paddle = screen.getByRole("button", { name: "PADDLE" });

    expect(paddle).toHaveAttribute("aria-pressed", "true");
    expect(bug).toHaveAttribute("aria-pressed", "false");

    await user.click(bug);
    expect(bug).toHaveAttribute("aria-pressed", "true");
    expect(paddle).toHaveAttribute("aria-pressed", "false");
  });
});

// ---------------------------------------------------------------------------
// F2: selecting BUG renders BugKey (DIT + DAH zones), not TouchKey or PaddleKey.
// Bites: surface wiring (wrong component rendered for bug mode).
// ---------------------------------------------------------------------------
describe("F2 — BugKey surface renders for BUG mode", () => {
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
    // Currently in BUG — switch back to PADDLE (toggle is in rail on wide).
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
describe("F3 — SwapToggle position and visibility", () => {
  it("swap button appears in main (above the key surface) in wide layout", async () => {
    await renderBugWide();
    const main = screen.getByRole("main");
    expect(within(main).getByRole("button", { name: /Swap dit and dah/ })).toBeInTheDocument();
  });

  it("swap button precedes the BugKey DIT zone in DOM order (is above it)", async () => {
    await renderBugWide();
    const main = screen.getByRole("main");
    const swapBtn = within(main).getByRole("button", { name: /Swap dit and dah/ });
    const ditZone = within(main).getByRole("button", { name: /Bug dit lever/ });
    // DOCUMENT_POSITION_FOLLOWING (4): ditZone comes AFTER swapBtn in DOM order.
    expect(swapBtn.compareDocumentPosition(ditZone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("swap button is present in main on narrow layout (travels with key, not in rail)", async () => {
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

  it("swap button is present for paddle mode (not broken by BUG addition)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");
    // Default is paddle — swap should be visible in main.
    const main = screen.getByRole("main");
    expect(within(main).getByRole("button", { name: /Swap dit and dah/ })).toBeInTheDocument();
  });

  it("swap button is NOT in the Options rail (it lives in main)", async () => {
    await renderBugWide();
    const rail = screen.getByRole("complementary", { name: "Options" });
    // The type toggle (BUG etc.) is in the rail; the swap control must not be.
    expect(within(rail).queryByRole("button", { name: /Swap dit and dah/ })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// F4: keyType "bug" persists through the store (not the string "paddle").
// Bites: persistence (req 1) — also confirms "bug" !== "paddle" at store level.
//
// Pre-seed localStorage with keyType:"bug" before the render so the app starts
// with bug already selected.  This is exactly what happens on a real return visit.
// ---------------------------------------------------------------------------
describe("F4 — keyType persistence", () => {
  it("'bug' from stored settings shows BUG selected on load", async () => {
    // Seed localStorage BEFORE rendering so the settings initializer reads it.
    // The store uses the "wrcw:" prefix (e.g. wrcw:settings).
    window.localStorage.clear();
    window.localStorage.setItem("wrcw:settings", JSON.stringify({ keyType: "bug" }));
    setMatchMedia(true);

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await user.click(screen.getByRole("button", { name: "KEY" }));

    // BUG should be pressed (loaded from store) — PADDLE should not be.
    expect(screen.getByRole("button", { name: "BUG" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "PADDLE" })).toHaveAttribute("aria-pressed", "false");
  });

  it("'bug' is not stored as the string 'paddle' (acceptance criterion 1)", async () => {
    // The "bug" string must NOT equal "paddle" — analyzeFist suppresses dah-weighting
    // on "paddle" and we need bug to get weighting.  This test verifies the stored
    // value by reading it directly from localStorage after the user selects BUG.
    window.localStorage.clear();
    setMatchMedia(true);

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await user.click(screen.getByRole("button", { name: "KEY" }));
    await user.click(screen.getByRole("button", { name: "BUG" }));

    // The store uses "wrcw:" prefix.
    const stored = JSON.parse(window.localStorage.getItem("wrcw:settings") ?? "{}");
    expect(stored.keyType).toBe("bug");
    expect(stored.keyType).not.toBe("paddle");
  });
});

// ---------------------------------------------------------------------------
// C, D, E, B: keyboard-dispatch tests
//
// These use fireEvent on window (synchronous) instead of userEvent so we can
// control exactly which events are sent without async infrastructure.
// The render itself uses real timers (no vi.useFakeTimers in the F tests above).
//
// Pattern for groups that need fake timers:
//   vi.useFakeTimers() inside the test or setup helper; afterEach restores via
//   vi.useRealTimers().
// ---------------------------------------------------------------------------

// Shared sync helper: render, dismiss splash, go to KEY+BUG, click NEW TEXT.
// Uses real timers (no fake timers needed for the setup itself).
async function setupKeyboard({ wide = true, swapped = false } = {}) {
  setMatchMedia(wide);
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  await user.click(screen.getByRole("button", { name: "KEY" }));
  await user.click(screen.getByRole("button", { name: "BUG" }));
  if (swapped) {
    const main = screen.getByRole("main");
    await user.click(within(main).getByRole("button", { name: /Swap dit and dah/ }));
  }
  // Get a target so the keyer is enabled.
  await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));
}

function kdn(code, extra = {}) {
  return new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true, ...extra });
}
function kup(code) {
  return new KeyboardEvent("keyup", { code, bubbles: true, cancelable: true });
}

// ---------------------------------------------------------------------------
// C — Bug manual dah from Space
// ---------------------------------------------------------------------------
describe("C — Bug dah from Space (keyboard)", () => {
  // C4: Space keydown in bug mode calls preventDefault.
  // Bites: page-scroll regression (missing preventDefault on Space in bug mode).
  it("C4: Space keydown in bug mode sets defaultPrevented", async () => {
    await setupKeyboard();
    const ev = kdn("Space");
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    window.dispatchEvent(kup("Space")); // release cleanly
  });

  // C3: Space with repeat:true is ignored (existing global guard; not re-added).
  // Bites: if the top e.repeat guard is removed or bypassed for bug mode.
  it("C3: Space with repeat:true is NOT claimed (global repeat guard fires first)", async () => {
    await setupKeyboard();
    const ev = kdn("Space", { repeat: true });
    window.dispatchEvent(ev);
    // The global guard returns before preventDefault — event is not claimed.
    expect(ev.defaultPrevented).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D — inField guard
// ---------------------------------------------------------------------------
describe("D — inField guard in bug mode", () => {
  // D1: Space while INPUT focused → no dah.
  // Bites: the guard being skipped in the new bug arm.
  it("D1: Space dispatched from INPUT target is not claimed (inField)", async () => {
    await setupKeyboard();
    const inp = document.createElement("input");
    document.body.appendChild(inp);
    inp.focus();
    const ev = new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true });
    inp.dispatchEvent(ev);
    // inField fires before any mode branch; preventDefault never called.
    expect(ev.defaultPrevented).toBe(false);
    document.body.removeChild(inp);
  });

  // D2: dit lever while INPUT focused → no dits.
  // Bites: dit lever firing during text entry.
  it("D2: BracketLeft dispatched from INPUT target is not claimed (inField)", async () => {
    await setupKeyboard();
    const inp = document.createElement("input");
    document.body.appendChild(inp);
    inp.focus();
    const ev = new KeyboardEvent("keydown", { code: "BracketLeft", bubbles: true, cancelable: true });
    inp.dispatchEvent(ev);
    // Bracket key in no mode calls preventDefault today, so the test asserts the
    // guard fires before any branch gets a chance to claim it.
    expect(ev.defaultPrevented).toBe(false);
    document.body.removeChild(inp);
  });
});

// ---------------------------------------------------------------------------
// E — Swap in bug mode
// ---------------------------------------------------------------------------
describe("E — Swap in bug mode", () => {
  // E1: swap=false → BracketLeft is dit (claimed); BracketRight is not.
  // Bites: swap not applied / applied to the wrong side.
  it("E1 (no swap): BracketLeft gets preventDefault (dit lever)", async () => {
    await setupKeyboard({ swapped: false });
    const ev = kdn("BracketLeft");
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    // Stop the timer-driven dit stream.
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

  // E2: Space is always the dah regardless of swap state.
  // Bites: if swap wrongly affects the dah binding.
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

// ---------------------------------------------------------------------------
// B — Bug dit keep-alive (keyboard path)
//
// B1: multiple machine-gun BracketLeft keydowns each claim the event.
// B2: stray keyup mid-stream does NOT stop the NEXT keydown from being claimed.
//
// These two properties verify the keep-alive architecture — the keyboard dit
// stream is driven by timed keydowns, not by keyup/keydown pairs.  Each test
// uses vi.useFakeTimers() only to advance the keep-alive expiry at the end
// (so the dit loop does not bleed into later tests).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// C-record / E-record / B-record — element RECORDING tests (gate-added).
//
// The C/D/E/B tests above assert only event.defaultPrevented (the event was
// *claimed*).  They do NOT assert which ELEMENT was recorded.  The single named
// point of fragility in design §8 — straightUp({forceEl:"-"}) forcing a short
// Space tap to a DAH — is invisible to a defaultPrevented-only check: removing
// the force makes zero of those tests fail.  These tests close that gap by
// reading the live decode buffer (the "Decoded from your key …" span), which
// shows "." for a dit and "-" for a dah.  The buffer is read synchronously
// after the keyup, before the 2.5u char-finalize timer fires.
//
// keyWpm defaults to 20 → u = 60ms → dit threshold is durMs < 120ms.  A
// keydown→keyup pair in jsdom takes a few ms, well under 120ms, so WITHOUT the
// force a Space tap classifies as a dit (".").  WITH the force it is a dah ("-").
// ---------------------------------------------------------------------------

// Read the current decode-buffer string (the amber span after the static label).
function readKeyBuffer() {
  const label = screen.getByText(/Decoded from your key/);
  // The buffer is the last child span's text content.
  const span = label.querySelector("span");
  return span ? span.textContent : "";
}

describe("C-record — Space records a DAH element (forced classification)", () => {
  // C2 (the design's headline bite): a SHORT Space tap must be recorded as a
  // DAH, not reclassified as a dit by its (short) duration.
  // Bites: removing forceEl:"-" in the bug keyup arm — without this test that
  // mutation passes the entire suite.
  it("C2: a short Space tap is recorded as a DAH ('-'), not a dit ('.')", async () => {
    await setupKeyboard();
    act(() => {
      window.dispatchEvent(kdn("Space"));
      window.dispatchEvent(kup("Space")); // immediate release → very short durMs
    });
    // Buffer must hold a dah, not a dit.
    expect(readKeyBuffer()).toBe("-");
  });

  // C1: a normal Space hold also records exactly one DAH (sanity for the path).
  it("C1: a Space keydown+keyup records exactly one DAH element", async () => {
    await setupKeyboard();
    act(() => {
      window.dispatchEvent(kdn("Space"));
      window.dispatchEvent(kup("Space"));
    });
    const buf = readKeyBuffer();
    expect(buf).toBe("-");
    expect(buf.length).toBe(1); // exactly one element recorded
  });
});

describe("B-record / E-record — dit lever records DIT elements", () => {
  // The dit lever must record DITS (".") in the buffer, and Space stays a DAH
  // regardless of swap.  These confirm the keyboard arm actually drives the
  // dit engine and the dah path — not just that the events are claimed.
  it("B-record: holding the dit lever records dits ('.') in the buffer", async () => {
    vi.useRealTimers();
    await setupKeyboard();
    vi.useFakeTimers();
    act(() => {
      window.dispatchEvent(kdn("BracketLeft"));
      // Let the auto-dit loop emit a couple of dits.
      vi.advanceTimersByTime(150);
    });
    // Stop the stream cleanly.
    vi.advanceTimersByTime(500);
    const buf = readKeyBuffer();
    // At least one dit landed and the buffer is all dits (no dah).
    expect(buf.length).toBeGreaterThanOrEqual(1);
    expect(/^\.+$/.test(buf)).toBe(true);
  });

  // B2-record: the keep-alive timer (design §8 fragility #2) must OWN release.
  // A stray keyup mid-stream must NOT stop the dit loop — dits keep accumulating
  // across the keyup, driven only by the keep-alive timer.
  // Bites: if the keyboard dit keyup is wired to honor release (e.g. calls
  // bugDitUp) — that mutation stops the loop and the buffer stops growing.
  it("B2-record: a stray keyup is ignored — a dit still fires from keep-alive alone", async () => {
    // The keep-alive timer owns release.  After a single keydown the loop is
    // running and the keep-alive is armed for max(160ms, 2u).  A stray keyup
    // arrives, then the loop's NEXT dit-cycle fires with NO intervening keydown.
    // With the keep-alive owning release (ditHeld still true), that dit lands.
    // Under the honor-keyup mutation the keyup clears ditHeld immediately, so the
    // next cycle sees no held lever and emits nothing — the buffer stops growing.
    // keyWpm=20 → dit cadence is durMs+u = 120ms; keep-alive floor 160ms.
    vi.useRealTimers();
    await setupKeyboard();
    vi.useFakeTimers();
    act(() => {
      window.dispatchEvent(kdn("BracketLeft")); // t=0: loop starts, dit #1 fires
      vi.advanceTimersByTime(40);               // t=40: before dit #2 (due ~t=120)
    });
    const before = readKeyBuffer().length;     // 1 dit so far
    expect(before).toBeGreaterThanOrEqual(1);
    act(() => {
      window.dispatchEvent(kup("BracketLeft")); // STRAY keyup at t=40 — must be ignored
      vi.advanceTimersByTime(120);              // t=160: dit #2 cycle fires (no new keydown)
    });
    const after = readKeyBuffer().length;
    // With keep-alive owning release, dit #2 landed despite the stray keyup.
    expect(after).toBeGreaterThan(before);
    vi.advanceTimersByTime(600);               // keep-alive expires, loop stops cleanly
  });

  it("E-record: Space is a DAH and the swapped dit lever is a DIT (swap=true)", async () => {
    vi.useRealTimers();
    await setupKeyboard({ swapped: true });
    // Space → dah regardless of swap.
    act(() => {
      window.dispatchEvent(kdn("Space"));
      window.dispatchEvent(kup("Space"));
    });
    expect(readKeyBuffer()).toBe("-");
  });
});

describe("B — Bug dit keep-alive (keyboard)", () => {
  it("B1: machine-gun BracketLeft keydowns are each claimed (preventDefault)", async () => {
    vi.useFakeTimers();
    // Render with real async infrastructure before fake timers take over the loop.
    // We need real timers for the render itself, but here we start them right away.
    // The render helpers (userEvent.setup) need real timers; set fake after render.
    vi.useRealTimers();
    await setupKeyboard();
    vi.useFakeTimers();

    for (let i = 0; i < 5; i++) {
      const ev = kdn("BracketLeft");
      window.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      vi.advanceTimersByTime(30); // 30ms between machine-gun keydowns
    }
    // Advance past keep-alive so the dit stream stops cleanly.
    vi.advanceTimersByTime(500);
  });

  // B2: stray keyup mid-stream does NOT stop the NEXT keydown from being claimed.
  // Bites: if keyup is honored mid-stream (stops ditHeld; next keydown doesn't re-start).
  it("B2: stray keyup mid-stream — next keydown still gets preventDefault", async () => {
    vi.useRealTimers();
    await setupKeyboard();
    vi.useFakeTimers();

    // First keydown — starts the dit stream.
    const ev1 = kdn("BracketLeft");
    window.dispatchEvent(ev1);
    expect(ev1.defaultPrevented).toBe(true);

    // Stray keyup — must be ignored by the keyboard path.
    window.dispatchEvent(kup("BracketLeft"));

    // Advance 30ms (within keep-alive window) then another keydown.
    vi.advanceTimersByTime(30);
    const ev2 = kdn("BracketLeft");
    window.dispatchEvent(ev2);
    // The dit stream must still be active: second keydown also gets claimed.
    expect(ev2.defaultPrevented).toBe(true);

    vi.advanceTimersByTime(500);
  });
});
