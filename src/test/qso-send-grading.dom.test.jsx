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
  // delay: null drops userEvent's real setTimeout wait between synthetic events
  // (a no-op cost fix, not a behavior change — see progress-qso.dom.test.jsx for
  // the full rationale). The fake-timer keying below is unaffected: it drives
  // raw KeyboardEvent dispatches inside act(), never user.*, once fake timers
  // are on.
  const user = userEvent.setup({ delay: null });
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
  // Call CQ → step 0 is a you-send. Required elements = CQ + your call (calling CQ
  // is not a bare callsign — that's how you ANSWER a CQ). mustContain = ["CQ","W1AW"].
  await user.click(screen.getByRole("button", { name: /CALL CQ|LISTEN FOR CQ/ }));
  const skBtn = screen.queryByRole("button", { name: "STRAIGHT KEY" });
  if (skBtn) await user.click(skBtn);
  return { user };
}

describe("QSO send grading — reported bug is fixed end-to-end", () => {
  // The default operator call is W1AW (settings default). On the Call-CQ first
  // step, mustContain = ["CQ", "W1AW"]. Two facts must hold end-to-end on the real
  // keyer path: (1) a correct CQ (CQ + call) renders 100% via the element checklist
  // — NOT a low edit-distance score against the verbose `suggested` script; and
  // (2) a bare callsign (a valid ANSWER, not a valid CALL) is now graded partial,
  // which is the gap Travis found (a bare call used to score 100 on a call-CQ step).

  // MUTATION verified: reverting checkSend to score = similarity(suggested,·) makes
  // the keyed "CQ W1AW" score ~20 → the "Send: 100% — SOLID COPY" assertion and the
  // "SOLID COPY" text both go red (PSE AGN renders instead).
  it("keying CQ + your call on a call-CQ step scores 100% (element checklist, not edit-distance)", async () => {
    await startRagchewCallCq();

    // Confirm we're on a you-send step (loud fail if the harness drifts).
    expect(screen.getByRole("button", { name: /CHECK TRANSMISSION/i })).toBeInTheDocument();

    vi.useFakeTimers();

    // Genuinely key CQ then W1AW on the straight key (contiguous → "CQW1AW").
    keyCallsign("CQ");
    keyCallsign("W1AW");
    await act(async () => {});

    // No grade yet — the idle pause hasn't elapsed.
    expect(screen.queryByText("SOLID COPY")).not.toBeInTheDocument();

    // Let the idle-pause timer fire checkSend on its own (no CHECK click).
    act(() => { vi.advanceTimersByTime(3000); });
    await act(async () => {});

    // Score is 100% / SOLID COPY, and both required elements are credited.
    expect(
      screen.getByText(/Send: 100% — SOLID COPY\. Sent: CQ, W1AW\./)
    ).toBeInTheDocument();
    expect(screen.getByText("SOLID COPY")).toBeInTheDocument();
    expect(screen.queryByText("PSE AGN")).not.toBeInTheDocument();
    // The ✓ checklist shows BOTH required elements met.
    expect(screen.getByText("✓ CQ")).toBeInTheDocument();
    expect(screen.getByText("✓ W1AW")).toBeInTheDocument();
  });

  // The corrected gap, end-to-end on the real keyer: keying only your callsign on a
  // CALL-CQ step is missing the CQ element → partial, not 100. MUTATION verified:
  // reverting the ragchew call step's mustContain to ["W1AW"] makes this send score
  // 100 again → the "50% / PSE AGN / missing: CQ" assertions go red (the exact bug).
  it("keying just your call on a call-CQ step now scores partial — missing CQ", async () => {
    await startRagchewCallCq();
    expect(screen.getByRole("button", { name: /CHECK TRANSMISSION/i })).toBeInTheDocument();

    vi.useFakeTimers();

    // Key only the callsign — a valid ANSWER, but NOT a valid CQ.
    keyCallsign("W1AW");
    await act(async () => {});

    act(() => { vi.advanceTimersByTime(3000); });
    await act(async () => {});

    // One of two required elements present → 50% / PSE AGN, with CQ flagged missing.
    expect(
      screen.getByText(/Send: 50% — PSE AGN\. Sent: W1AW; missing: CQ\./)
    ).toBeInTheDocument();
    expect(screen.getByText("PSE AGN")).toBeInTheDocument();
    expect(screen.queryByText("SOLID COPY")).not.toBeInTheDocument();
    // The checklist shows CQ missing (✗) and the call met (✓).
    expect(screen.getByText("✗ CQ")).toBeInTheDocument();
    expect(screen.getByText("✓ W1AW")).toBeInTheDocument();
  });

  // Send-step auto-advance was practically DEAD under the old score: reaching
  // sim===100 on a verbose `suggested` script was near-impossible, so the
  // hands-free advance silently never fired on a send step. Element grading makes a
  // correct send score 100, which UNBLOCKS the advance gate. This proves it now
  // actually FIRES on the realistic keyer-driven send path — asserting produced
  // state (the send step gives way to the next step), not "a timer was set".
  //
  // MUTATION verified: gating armAutoAdvance on the old sim (never 100 here) — or
  // forcing `if (pct !== 100) return` to never arm — leaves CHECK TRANSMISSION
  // present after the advance window → this assertion goes red.
  it("with AUTO on, a 100% keyed CQ auto-advances off the send step (fires)", async () => {
    await startRagchewCallCq({ autoAdvance: true });

    // On the you-send step: CHECK TRANSMISSION is the tell.
    expect(screen.getByRole("button", { name: /CHECK TRANSMISSION/i })).toBeInTheDocument();

    vi.useFakeTimers();
    keyCallsign("CQ");
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
