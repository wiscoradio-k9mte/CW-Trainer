// @vitest-environment jsdom
//
// The QSO send-grading fix (fix/qso-send-grading): the send score is now the
// element-based checklist (gradeSend), NOT edit-distance against the verbose
// `suggested` script. This proves the REPORTED bug is gone end-to-end.
//
// Drives the REALISTIC path — the keyer decodes an actual callsign from real
// dit/dah timing, and the idle-pause timer fires checkSend on its own — NOT a
// shortcut that pokes sendResult straight to the trigger (the shop lesson: a
// QSO auto-grade once passed in tests but "never fired on a real key").
//
// Every assertion checks PRODUCED, RENDERED output (the visible score text and
// the AT status line), never "an event fired".

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { MORSE } from "../cw-core.js";
import { gotoTab, chooseOption } from "./helpers.jsx";

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
  cleanup();
});

// --- Real straight-key keying under fake timers ---------------------------
// The keyer classifies a Space element as a dit when held < 2u and a dah when
// held >= 2u (u = 1200/keyWpm = 60ms at the default 20 wpm). A char finalizes
// after a 2.5u = 150ms idle gap. vitest fake timers advance performance.now(),
// which is exactly what the keyer measures — so these dispatches produce a
// genuine decoded callsign, not a poked string.
const DIT_MS = 40;   // < 120ms threshold  → dit
const DAH_MS = 140;  // >= 120ms threshold → dah
const ELEM_GAP_MS = 60;   // between elements of one char (< 150ms finalize)
const CHAR_FINALIZE_MS = 170; // idle long enough to finalize the char

function keyElement(el) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true }));
  });
  act(() => { vi.advanceTimersByTime(el === "-" ? DAH_MS : DIT_MS); });
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", bubbles: true, cancelable: true }));
  });
  act(() => { vi.advanceTimersByTime(ELEM_GAP_MS); });
}

// Key a whole callsign character-by-character from the MORSE table.
function keyCallsign(call) {
  for (const ch of call) {
    for (const el of MORSE[ch]) keyElement(el);
    act(() => { vi.advanceTimersByTime(CHAR_FINALIZE_MS); }); // finalize this char
  }
}

async function startRagchewCallCq({ autoAdvance = false } = {}) {
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  await gotoTab(user, "QSO");
  await chooseOption(user, "Activity", /Ragchew/i);
  await chooseOption(user, "Role", /Call CQ/i);
  // Opt in to hands-free auto-advance (default OFF) BEFORE starting the contact.
  if (autoAdvance) {
    const autoBtn = screen.queryByRole("button", { name: /AUTO OFF/i });
    if (autoBtn) await user.click(autoBtn);
  }
  // Call CQ → step 0 is a you-send whose only required element is your call.
  await user.click(screen.getByRole("button", { name: /CALL CQ|LISTEN FOR CQ/ }));
  const skBtn = screen.queryByRole("button", { name: "STRAIGHT KEY" });
  if (skBtn) await user.click(skBtn);
  return { user };
}

describe("QSO send grading — reported bug is fixed end-to-end", () => {
  // The default operator call is W1AW (settings default). On the Call-CQ first
  // step, mustContain = [myCall] = ["W1AW"] — a minimal valid send is just the
  // call. Under the OLD code this keyed send scored ~20% ("PSE AGN") against the
  // long `suggested` CQ script while the ✓ checklist said ✓ W1AW — the exact
  // 23%-with-✓ contradiction. Now the score IS the checklist → 100%.
  //
  // MUTATION verified: reverting checkSend to
  //   const { score } = { score: Math.round(similarity(cur.suggested, sent)*100) }
  // makes the keyed W1AW score ~20 → the "Send: 100% — SOLID COPY" assertion and
  // the "SOLID COPY" text both go red (PSE AGN renders instead).
  it("keying just your call on a call-CQ step scores 100%, not ~23%", async () => {
    const { user } = await startRagchewCallCq();

    // Confirm we're on a you-send step (loud fail if the harness drifts).
    expect(screen.getByRole("button", { name: /CHECK TRANSMISSION/i })).toBeInTheDocument();

    vi.useFakeTimers();

    // Genuinely key W1AW on the straight key.
    keyCallsign("W1AW");
    await act(async () => {});

    // Sanity: the decoder produced the real callsign (drives the realistic path).
    expect(screen.getByText("W1AW", { selector: "*" })).toBeTruthy();

    // No grade yet — the idle pause hasn't elapsed.
    expect(screen.queryByText("SOLID COPY")).not.toBeInTheDocument();

    // Let the idle-pause timer fire checkSend on its own (no CHECK click).
    // The word-gap space re-arms the pause once more, so clear well past it.
    act(() => { vi.advanceTimersByTime(3000); });
    await act(async () => {});

    // The rendered score is 100% and the verdict is SOLID COPY — the AT status
    // line carries the whole story and is unambiguous.
    expect(
      screen.getByText(/Send: 100% — SOLID COPY\. Sent: W1AW\./)
    ).toBeInTheDocument();
    expect(screen.getByText("SOLID COPY")).toBeInTheDocument();

    // The old contradiction — a red PSE AGN over a green ✓ — must be gone.
    expect(screen.queryByText("PSE AGN")).not.toBeInTheDocument();
    // The ✓ checklist still shows the required element as met.
    expect(screen.getByText("✓ W1AW")).toBeInTheDocument();
  });

  // Send-step auto-advance was practically DEAD under the old score: reaching
  // sim===100 on a verbose `suggested` script was near-impossible, so the
  // hands-free advance silently never fired on a send step. Element grading
  // makes a correct minimal send score 100, which UNBLOCKS the advance gate.
  // This proves it now actually FIRES on the realistic keyer-driven send path —
  // asserting produced state (the send step gives way to the next step), not
  // "a timer was set".
  //
  // MUTATION verified: gating armAutoAdvance on the old sim (never 100 here) —
  // or forcing `if (pct !== 100) return` to never arm — leaves CHECK TRANSMISSION
  // present after the advance window → this assertion goes red.
  it("with AUTO on, a 100% keyed send auto-advances off the send step (fires)", async () => {
    const { user } = await startRagchewCallCq({ autoAdvance: true });

    // On the you-send step: CHECK TRANSMISSION is the tell.
    expect(screen.getByRole("button", { name: /CHECK TRANSMISSION/i })).toBeInTheDocument();

    vi.useFakeTimers();
    keyCallsign("W1AW");
    await act(async () => {});

    // Let the idle-pause timer fire checkSend → score 100 → arm the advance timer.
    act(() => { vi.advanceTimersByTime(3000); });
    await act(async () => {});
    expect(screen.getByText(/Send: 100% — SOLID COPY/)).toBeInTheDocument();
    // Still on the send step — the 4s advance window hasn't elapsed yet.
    expect(screen.getByRole("button", { name: /CHECK TRANSMISSION/i })).toBeInTheDocument();

    // Elapse QSO_AUTO_ADVANCE_MS (4000ms) — the same advance the TRANSMIT button
    // calls now fires on its own, leaving the send step.
    act(() => { vi.advanceTimersByTime(4001); });
    await act(async () => {});
    expect(
      screen.queryByRole("button", { name: /CHECK TRANSMISSION/i })
    ).not.toBeInTheDocument();
  });
});
