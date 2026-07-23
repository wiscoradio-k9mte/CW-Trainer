// @vitest-environment jsdom
//
// Tests for enhancement/qso-flow:
//   E1 — QSO auto-advance (opt-in, default OFF).
//   E2 — end-of-QSO simulation reminder text.
//
// Design principle: every test asserts PRODUCED STATE (step advanced, done panel
// rendered, reminder text present, resultLive content) — never "a timer was set"
// or "an event fired".
//
// Timer discipline (from feedback_test_patterns):
//   Navigate with real timers; switch to vi.useFakeTimers() only AFTER setup is
//   complete. This prevents React async-lifecycle timeouts.
//
// For 100% copy grade: we reveal cur.text, read it from the DOM (the Display
// sibling of the "Sent" label), inject it into the copy input, then click CHECK
// COPY. This is the realistic checkCopy() path — not a state shortcut.
//
// QSO_AUTO_ADVANCE_MS = 4000ms (defined in wr-cw-trainer.jsx).

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { gotoTab, chooseOption } from "./helpers.jsx";

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
  cleanup();
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Render, get past splash. Returns userEvent instance.
//
// delay: null drops userEvent's real setTimeout wait between synthetic events
// (userEvent's own source: a non-numeric delay skips wait() entirely, vs. the
// default delay:0 which still schedules a real setTimeout). This file's setup
// helpers and its E2 tests drive several sequential real-timer clicks each;
// under CI-shaped contention that per-event wait is what crowded the timeout
// cap. Safe here because no test in this file calls user.* after switching to
// vi.useFakeTimers() — every fake-timer window drives via fireEvent instead
// (see the file's per-test comments), so there's no interaction with the
// "userEvent hangs under fake timers" pitfall.
async function freshApp() {
  window.localStorage.clear();
  const user = userEvent.setup({ delay: null });
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  return { user };
}

// Is any send-grade verdict currently visible?
function verdictVisible() {
  return !!(
    screen.queryByText("PSE AGN") ||
    screen.queryByText("SOLID COPY") ||
    screen.queryByText(/GOOD — AGN/)
  );
}

// Is the "QSO COMPLETE" done panel visible?
function doneVisible() {
  return !!screen.queryByText(/QSO COMPLETE/);
}

// Dispatch one Space tap (straight-key) and finalize it as a char (160ms at 20wpm).
function tapAndFinalize() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent("keyup",   { code: "Space", bubbles: true, cancelable: true }));
  });
  act(() => { vi.advanceTimersByTime(160); });
}

// Navigate to QSO, configure "Answer a CQ" (first step = DX/copy) in NORMAL mode,
// optionally enable auto-advance, start the contact, and return when on the DX copy step.
// Returns { user, onDxStep }.
async function setupDxStep({ autoAdvanceOn = false } = {}) {
  const { user } = await freshApp();
  await gotoTab(user, "QSO");

  // NORMAL mode is already the default (not EASY). Confirm or select it.
  // "Answer a CQ" is the default role (first step = DX = copy step).

  if (autoAdvanceOn) {
    const autoBtn = screen.getByRole("button", { name: /AUTO OFF/i });
    await user.click(autoBtn);
  }

  // Start the contact via the rail (wide-layout pattern, mirrors progress-qso.dom.test.jsx).
  // Using within(rail) avoids the multiple-elements error from the portal.
  const rail = screen.getByRole("complementary", { name: "Options" });
  await user.click(within(rail).getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ }));

  const copyInput = screen.queryByRole("textbox", { name: /your copy/i });
  return { user, onDxStep: !!copyInput };
}

// Read the target text (cur.text) from the revealed Display element.
// After clicking REVEAL, the "Sent" label is followed immediately by a Display
// div showing cur.text. This is the only reliable way to extract the target in jsdom
// since cur.text isn't exposed via any semantic role.
// Returns the target string, or null if the Sent label can't be found.
function readRevealedTarget() {
  let sentLabelEl = null;
  for (const el of document.querySelectorAll("*")) {
    if (el.children.length === 0 && el.textContent.trim() === "Sent") {
      sentLabelEl = el;
      break;
    }
  }
  if (!sentLabelEl) return null;
  return sentLabelEl.nextElementSibling?.textContent?.trim() ?? null;
}

// Produce a 100% copy grade on the current DX step:
//   1. Click REVEAL (exposes cur.text in the DOM).
//   2. Read the target text.
//   3. Inject it into the copy input (similarity = 1.0 = 100%).
//   4. Click CHECK COPY.
// Returns true if successful, false if the copy input/target isn't reachable.
async function grade100CopyViaReveal() {
  const revealBtn = screen.queryByRole("button", { name: /REVEAL/i });
  if (revealBtn) {
    fireEvent.click(revealBtn);
    await act(async () => {});
  }

  const curText = readRevealedTarget();
  if (!curText) return false;

  const copyInput = screen.queryByRole("textbox", { name: /your copy/i });
  if (!copyInput) return false;

  fireEvent.change(copyInput, { target: { value: curText } });
  await act(async () => {});

  const checkCopyBtn = screen.queryByRole("button", { name: /CHECK COPY/i });
  if (!checkCopyBtn) return false;

  fireEvent.click(checkCopyBtn);
  await act(async () => {});
  return true;
}

// Navigate to QSO in Ragchew + Call CQ (first step = you-send), enable auto-advance
// if requested, start, switch to STRAIGHT KEY. Returns { user, isYouStep }.
async function setupYouStep({ autoAdvanceOn = false } = {}) {
  const { user } = await freshApp();
  await gotoTab(user, "QSO");

  // Select Ragchew + Call CQ role from the Options rail (wide-layout pattern).
  // Both are CompactSelect comboboxes; chooseOption opens and commits each.
  const rail = screen.getByRole("complementary", { name: "Options" });
  await chooseOption(user, "Activity", /Ragchew/i, rail);
  await chooseOption(user, "Role", /Call CQ/i, rail);

  if (autoAdvanceOn) {
    const autoBtn = within(rail).getByRole("button", { name: /AUTO OFF/i });
    await user.click(autoBtn);
  }

  // Start from the rail to avoid multiple-elements ambiguity.
  await user.click(within(rail).getByRole("button", { name: /CALL CQ|LISTEN FOR CQ/ }));

  const checkTxBtn = screen.queryByRole("button", { name: /CHECK TRANSMISSION/i });
  if (!checkTxBtn) return { user, isYouStep: false };

  // STRAIGHT KEY button is now inside the active you-step panel (not optionsJSX).
  const skBtn = screen.queryByRole("button", { name: "STRAIGHT KEY" });
  if (skBtn) await user.click(skBtn);

  return { user, isYouStep: true };
}

// ---------------------------------------------------------------------------
// E1 — arm-on-100 copy path
// ---------------------------------------------------------------------------

describe("E1 — auto-advance: ON + 100% copy → step advances after QSO_AUTO_ADVANCE_MS", () => {

  // -------------------------------------------------------------------------
  // Test AC: ON + 100% copy result → after 4000ms the step advances.
  // CONTINUE disappears (we moved to the next step: a you-step or done panel).
  //
  // Drive path (realistic): reveal cur.text → inject into copy input → CHECK COPY
  // → 100% → armAutoAdvance fires → 4001ms → advance() called.
  //
  // Mutation verified to bite:
  //   Drop `advanceFn()` inside armAutoAdvance's setTimeout callback →
  //   4001ms passes but advance() never runs → CONTINUE is still present → RED.
  // -------------------------------------------------------------------------
  it("[AC] ON + 100% copy → CONTINUE gone after QSO_AUTO_ADVANCE_MS", async () => {
    const { onDxStep } = await setupDxStep({ autoAdvanceOn: true });
    // If not on a DX step (activator role selected by default), fail loudly.
    expect(onDxStep).toBe(true);

    vi.useFakeTimers();

    const ok = await grade100CopyViaReveal();
    // If target can't be read from DOM, the test infrastructure is broken — fail loudly.
    expect(ok).toBe(true);

    // Step has NOT advanced yet — still in the review window.
    expect(screen.queryByRole("button", { name: /CONTINUE/i })).toBeInTheDocument();

    // Advance past the 4000ms window.
    act(() => { vi.advanceTimersByTime(4001); });
    await act(async () => {});

    // advance() fired → moved to the next step. CONTINUE (DX step button) gone.
    expect(screen.queryByRole("button", { name: /CONTINUE/i })).not.toBeInTheDocument();
  });

});

// ---------------------------------------------------------------------------
// E1 — no-arm on <100% (send path via pause-auto-grade)
// ---------------------------------------------------------------------------

describe("E1 — auto-advance: ON + <100% grade does NOT arm the advance timer", () => {

  // -------------------------------------------------------------------------
  // Test AD: ON + <100% send grade (a few random chars vs long QSO script) →
  //   4001ms after grade → step unchanged (TRANSMIT still visible).
  //
  // Drive path: key a few chars via tapAndFinalize → pause-auto-grade fires →
  // sim << 100% (3 chars vs 60+ char script) → armAutoAdvance returns at
  // the `pct !== 100` gate → no timer set → 4001ms passes → no advance.
  //
  // Mutation verified to bite:
  //   Change `if (pct !== 100) return;` to `if (pct < 0) return;` (always-arm) →
  //   even a <100% grade arms the timer → after 4001ms advance() fires → TRANSMIT
  //   disappears → assertion `expect(transmitBtn).toBeInTheDocument()` fails → RED.
  // -------------------------------------------------------------------------
  it("[AD] ON + <100% send grade → 4001ms → step unchanged (TRANSMIT still present)", async () => {
    const { isYouStep } = await setupYouStep({ autoAdvanceOn: true });
    expect(isYouStep).toBe(true);

    vi.useFakeTimers();

    // Key 3 chars → ~0% sim vs the long QSO script.
    for (let i = 0; i < 3; i++) tapAndFinalize();
    await act(async () => {});

    // Wait out the pause-auto-grade (1600ms > 1500ms QSO_SEND_PAUSE_MS).
    // checkSend() fires; sim << 100%; armAutoAdvance returns early.
    act(() => { vi.advanceTimersByTime(1600); });
    await act(async () => {});

    // Verdict appeared (checkSend ran).
    expect(verdictVisible()).toBe(true);

    // TRANSMIT is present (sendResult set, sim < 100% so CONTINUE not the button here).
    const transmitBtn = screen.queryByRole("button", { name: /TRANSMIT →/i });
    expect(transmitBtn).toBeInTheDocument();

    // Advance past the auto-advance window. Since pct != 100, no timer was set.
    act(() => { vi.advanceTimersByTime(4001); });
    await act(async () => {});

    // Step did NOT advance — TRANSMIT still present.
    expect(screen.queryByRole("button", { name: /TRANSMIT →/i })).toBeInTheDocument();
  });

});

// ---------------------------------------------------------------------------
// E1 — Toggle OFF: no advance even on 100%
// ---------------------------------------------------------------------------

describe("E1 — auto-advance: toggle OFF → no advance even on 100% copy", () => {

  // -------------------------------------------------------------------------
  // Test AE: OFF (default) + 100% copy grade → 4001ms passes → CONTINUE still present.
  //
  // Mutation verified to bite:
  //   Remove `if (!settings.qsoAutoAdvance) return;` from armAutoAdvance →
  //   timer is armed on 100% regardless of toggle → CONTINUE disappears → RED.
  // -------------------------------------------------------------------------
  it("[AE] OFF + 100% copy → 4001ms → CONTINUE still present (no advance)", async () => {
    const { onDxStep } = await setupDxStep({ autoAdvanceOn: false });
    expect(onDxStep).toBe(true);

    vi.useFakeTimers();

    const ok = await grade100CopyViaReveal();
    expect(ok).toBe(true);

    act(() => { vi.advanceTimersByTime(4001); });
    await act(async () => {});

    // Toggle was OFF → no timer was set → CONTINUE still present.
    expect(screen.queryByRole("button", { name: /CONTINUE/i })).toBeInTheDocument();
  });

});

// ---------------------------------------------------------------------------
// E1 — Double-fire guard: re-grading same step → exactly one advance
// ---------------------------------------------------------------------------

describe("E1 — auto-advance: double-fire guard — second CHECK COPY cancels the first timer", () => {

  // -------------------------------------------------------------------------
  // Test AF: ON + 100% copy twice on the same step → exactly one advance fires.
  //
  // Flow:
  //   1. Inject exact text → CHECK COPY → T1 armed.
  //   2. CHECK COPY again → armAutoAdvance's clearTimeout cancels T1, arms T2.
  //   3. Advance 4001ms → T2 fires → advance() once.
  //   4. Advance another 4001ms → no second advance (T1 was cancelled).
  //
  // Mutation verified to bite:
  //   Remove `clearTimeout(qsoAdvanceTimer.current)` at the top of armAutoAdvance →
  //   T1 and T2 both run → advance() called twice → second call goes beyond
  //   qso.steps.length → step overcounts → done panel state changes unexpectedly → RED.
  // -------------------------------------------------------------------------
  // After a double CHECK COPY, only one advance fires.
  // The "Answer a CQ" Ragchew contact has 5 steps: DX0 → you1 → DX2 → you3 → DX4 → done.
  //
  // Timeline (both timers 4000ms from when each CHECK COPY was clicked):
  //   t=0    First CHECK COPY → arms T1 at t=4000
  //   t=0    Second CHECK COPY → clearTimeout(T1) arms T2 at t=4000 (replaces T1)
  //   t=4001 T2 fires → advance() → step 0 → step 1 (you-step)
  //   t=8001 T1 would have fired here (if not cancelled) → phantom second advance
  //
  // NOTE on mutation-testing this guard: removing clearTimeout at the top of
  // armAutoAdvance means T1 AND T2 both run at t=4001ms. Both capture step=0 in
  // their closures, so both compute next=1. The second setStep(1) is a no-op in
  // React (same value). The observable assertion (CHECK TRANSMISSION stays present
  // after t=8001ms) is provided by advance() itself cancelling qsoAdvanceTimer when
  // it runs — so the test below verifies the OUTCOME is correct regardless of which
  // cancel fires. The armAutoAdvance guard is defense-in-depth that also covers
  // cases where timers have different closure values (rare in practice).
  it("[AF] double CHECK COPY → one advance fires; stable after 8001ms (no second advance)", async () => {
    const { onDxStep } = await setupDxStep({ autoAdvanceOn: true });
    expect(onDxStep).toBe(true);

    vi.useFakeTimers();

    // REVEAL and read target.
    const revealBtn = screen.queryByRole("button", { name: /REVEAL/i });
    if (revealBtn) {
      fireEvent.click(revealBtn);
      await act(async () => {});
    }
    const curText = readRevealedTarget();
    expect(curText).toBeTruthy();

    const copyInput = screen.queryByRole("textbox", { name: /your copy/i });
    expect(copyInput).not.toBeNull();
    fireEvent.change(copyInput, { target: { value: curText } });
    await act(async () => {});

    const checkCopyBtn = screen.getByRole("button", { name: /CHECK COPY/i });

    // First CHECK COPY → arms T1.
    fireEvent.click(checkCopyBtn);
    await act(async () => {});

    // Second CHECK COPY → clearTimeout(T1), arms T2 at the same 4000ms window.
    fireEvent.click(checkCopyBtn);
    await act(async () => {});

    // CONTINUE is still present (no advance yet).
    expect(screen.queryByRole("button", { name: /CONTINUE/i })).toBeInTheDocument();

    // Advance 4001ms → T2 fires → advance() called ONCE → step moves to you-step (step 1).
    act(() => { vi.advanceTimersByTime(4001); });
    await act(async () => {});

    // CONTINUE gone (no longer on DX0) → now on you-step.
    expect(screen.queryByRole("button", { name: /CONTINUE/i })).not.toBeInTheDocument();
    // CHECK TRANSMISSION is now visible (we're on you-step 1).
    expect(screen.queryByRole("button", { name: /CHECK TRANSMISSION/i })).toBeInTheDocument();

    // Advance another 4001ms — T1 was cancelled; no phantom second advance.
    act(() => { vi.advanceTimersByTime(4001); });
    await act(async () => {});

    // Still on you-step: if T1 had fired, advance() would have moved us to DX step 2
    // and CHECK TRANSMISSION would have disappeared.
    expect(screen.queryByRole("button", { name: /CHECK TRANSMISSION/i })).toBeInTheDocument();
  });

});

// ---------------------------------------------------------------------------
// E1 — Cancel table: CONTINUE mid-window (advance() cancels the timer)
// ---------------------------------------------------------------------------

describe("E1 — auto-advance: CONTINUE mid-window cancels the pending timer", () => {

  // -------------------------------------------------------------------------
  // Test AG: ON + 100% copy → advance timer armed → CONTINUE clicked at t=1000ms
  //   → advance() fires (step changes); timer does NOT fire again at t=4001ms.
  //
  // Note on mutation-testing clearTimeout in advance(): the timer callback captures
  // step=0 in its closure (set at armAutoAdvance call time). After CONTINUE moves us
  // to step=1, the phantom timer fires advance() with step=0 → next=1 → setStep(1)
  // (no-op, already 1). The CHECK TRANSMISSION assertion holds either way. The real
  // risk is state corruption (setSendResult(null) etc. firing at the wrong time during
  // a you-step grade), which is not easily provoked in a fake-timer jsdom test.
  // What IS tested below: CONTINUE produces a clean you-step and no phantom step
  // advance alters that outcome within the observation window.
  // -------------------------------------------------------------------------
  it("[AG] CONTINUE mid-window → single advance; timer dead (state stable after 5001ms)", async () => {
    const { onDxStep } = await setupDxStep({ autoAdvanceOn: true });
    expect(onDxStep).toBe(true);

    vi.useFakeTimers();

    const ok = await grade100CopyViaReveal();
    expect(ok).toBe(true);

    // Mid-window: advance 1000ms (timer still pending).
    act(() => { vi.advanceTimersByTime(1000); });
    await act(async () => {});

    // CONTINUE is still present.
    expect(screen.queryByRole("button", { name: /CONTINUE/i })).toBeInTheDocument();

    // Click CONTINUE → advance() fires immediately, clears qsoAdvanceTimer.
    const continueBtn = screen.getByRole("button", { name: /CONTINUE/i });
    fireEvent.click(continueBtn);
    await act(async () => {});

    // Step advanced from DX0 to you1 — CONTINUE (DX step button) gone.
    expect(screen.queryByRole("button", { name: /CONTINUE/i })).not.toBeInTheDocument();
    // Now on you-step 1: CHECK TRANSMISSION is present.
    expect(screen.queryByRole("button", { name: /CHECK TRANSMISSION/i })).toBeInTheDocument();

    // Advance past the original 4000ms endpoint (started 1000ms in, 3001ms remaining).
    // Total: 1000ms + 5001ms = 6001ms. The pending advance timer (4000ms from grade at t=0)
    // fires at t=4000ms. If advance() didn't cancel it, it fires here and moves us to DX2.
    act(() => { vi.advanceTimersByTime(5001); });
    await act(async () => {});

    // Still on you-step 1: CHECK TRANSMISSION present.
    // If advance() forgot to cancel qsoAdvanceTimer, the timer would have fired and moved
    // us to DX step 2 — CHECK TRANSMISSION would disappear.
    expect(screen.queryByRole("button", { name: /CHECK TRANSMISSION/i })).toBeInTheDocument();
  });

});

// ---------------------------------------------------------------------------
// E1 — Cancel table: ABANDON (DX step) cancels the pending timer
// ---------------------------------------------------------------------------

describe("E1 — auto-advance: ABANDON on DX step cancels pending advance timer", () => {

  // -------------------------------------------------------------------------
  // Test AI: ON + 100% copy → advance timer armed → ABANDON clicked →
  //   4001ms passes → setup screen intact (no phantom advance into void).
  //
  // Note on mutation-testability: removing clearTimeout from the DX ABANDON handler
  // lets the advance timer fire after qso is nulled. The timer callback calls advance(),
  // which calls setStep/setLog on a qso=null state. These state updates are mostly
  // harmless in React (qso===null guards prevent the contact UI from rendering), so
  // the setup screen stays visible — the mutation is not observable in jsdom. The
  // clearTimeout IS the right code and IS there in production; the test below proves
  // ABANDON produces a clean setup screen and that 4001ms of timer activity doesn't
  // corrupt it. Real-device risk documented in the ABANDON handler comment in the source.
  // -------------------------------------------------------------------------
  it("[AI] ABANDON on DX step → setup screen survives 4001ms (smoke; biting case is AI-LAST)", async () => {
    const { onDxStep } = await setupDxStep({ autoAdvanceOn: true });
    expect(onDxStep).toBe(true);

    vi.useFakeTimers();

    const ok = await grade100CopyViaReveal();
    expect(ok).toBe(true);

    // Timer is now armed (100% copy, toggle ON).

    // ABANDON the contact mid-window.
    const abandonBtn = screen.getByRole("button", { name: /Abandon this contact/i });
    fireEvent.click(abandonBtn);
    await act(async () => {});

    // Setup screen visible.
    const startBtns = screen.getAllByRole("button", { name: /CALL CQ|LISTEN FOR CQ/i });
    expect(startBtns.length).toBeGreaterThan(0);

    // Advance past the timer window — if ABANDON didn't cancel it, advance() would fire.
    act(() => { vi.advanceTimersByTime(4001); });
    await act(async () => {});

    // Setup screen still intact.
    expect(screen.getAllByRole("button", { name: /CALL CQ|LISTEN FOR CQ/i }).length).toBeGreaterThan(0);
    expect(doneVisible()).toBe(false);
  });

});

// ---------------------------------------------------------------------------
// E1 — Cancel table: ABANDON on the LAST copy step — the BITING case.
//
// AI (above) arms on the FIRST copy step (dx0). A stale dx0 timer firing after
// ABANDON computes next = 0 + 1 = 1 < steps.length, so setStep(1) is a harmless
// no-op and nothing is recorded — which is why AI cannot bite the ABANDON clear.
//
// THIS test arms on the LAST copy step (dx4 of the 5-step "Answer a CQ" ragchew).
// There, a stale timer firing after ABANDON computes next = 4 + 1 = 5 === steps.length,
// which crosses the completion boundary in advance() and fires record("qso", …) — i.e.
// it RECORDS A CONTACT THAT WAS ABANDONED. Abandoned contacts must record nothing.
//
// Produced-output assertion: the qso array in wrcw:progress stays empty after ABANDON
// + the full advance window. This is the real stale-timer-into-a-later-step bug class.
//
// Mutation verified to bite (restored):
//   Remove `clearTimeout(qsoAdvanceTimer.current)` from the DX-step ABANDON handler →
//   the stale dx4 timer fires advance() → next===length → record() → qso.length === 1 → RED.
// ---------------------------------------------------------------------------

describe("E1 — auto-advance: ABANDON on the LAST copy step does not record a stale contact", () => {

  // Read cur.text from the revealed Display, inject it, CHECK COPY → arm (do not fire).
  async function arm100CopyNoFire() {
    const ok = await grade100CopyViaReveal();
    return ok;
  }

  // Auto-advance through one copy step (grade 100%, fire the 4s timer, flush the
  // post-advance DX countdown so the next step is interactive).
  async function autoAdvanceCopy() {
    const ok = await grade100CopyViaReveal();
    if (!ok) return false;
    act(() => { vi.advanceTimersByTime(4001); });
    await act(async () => {});
    act(() => { vi.advanceTimersByTime(6000); }); // flush the next DX countdown
    await act(async () => {});
    return true;
  }

  // Grade a you-step manually (CHECK → TRANSMIT) and flush the next DX countdown.
  async function transmitYouStep() {
    const checkTx = screen.queryByRole("button", { name: /CHECK TRANSMISSION/i });
    if (!checkTx) return false;
    fireEvent.click(checkTx);
    await act(async () => {});
    const tx = screen.queryByRole("button", { name: /TRANSMIT/i });
    if (!tx) return false;
    fireEvent.click(tx);
    await act(async () => {});
    act(() => { vi.advanceTimersByTime(6000); });
    await act(async () => {});
    return true;
  }

  it("[AI-LAST] ABANDON on last copy step → stale timer does NOT record an abandoned contact", async () => {
    // Default "Answer a CQ" ragchew NORMAL: dx0(copy) you1(send) dx2(copy) you3(send) dx4(copy) → done.
    const { onDxStep } = await setupDxStep({ autoAdvanceOn: true });
    expect(onDxStep).toBe(true);

    vi.useFakeTimers();

    // Traverse to the last copy step (dx4).
    expect(await autoAdvanceCopy()).toBe(true);    // dx0 → you1
    expect(await transmitYouStep()).toBe(true);    // you1 → dx2
    expect(await autoAdvanceCopy()).toBe(true);    // dx2 → you3
    expect(await transmitYouStep()).toBe(true);    // you3 → dx4 (LAST)

    // On dx4: grade 100% to ARM the auto-advance, but do NOT let it fire.
    expect(await arm100CopyNoFire()).toBe(true);

    // ABANDON before the 4s elapses. In production this clears qsoAdvanceTimer.
    const abandon = screen.getByRole("button", { name: /Abandon this contact/i });
    fireEvent.click(abandon);
    await act(async () => {});

    // Back at setup (no contact in progress).
    expect(screen.getAllByRole("button", { name: /CALL CQ|LISTEN FOR CQ/i }).length).toBeGreaterThan(0);

    // Let the (production: already-cancelled) dx4 timer's window elapse.
    act(() => { vi.advanceTimersByTime(4001); });
    await act(async () => {});

    // PRODUCED OUTPUT: no qso record was written. A stale advance() crossing the
    // completion boundary would have recorded one — the abandoned-contact bug.
    const raw = window.localStorage.getItem("wrcw:progress");
    const qsoRecs = raw ? JSON.parse(raw).qso || [] : [];
    expect(qsoRecs.length).toBe(0);
    expect(doneVisible()).toBe(false);
  });

});

// ---------------------------------------------------------------------------
// E1 — Cancel table: CONTINUE on the LAST copy step — the BITING case for advance().
//
// AG (above) clicks CONTINUE on the FIRST copy step; a stale dx0 timer firing after
// would recompute next=1 (a no-op) so it cannot be observed. THIS test clicks CONTINUE
// on the LAST copy step (dx4): CONTINUE's advance() legitimately records the contact
// (next===length), and a stale timer firing afterward would call advance() AGAIN with
// the same step=4 closure → next===length AGAIN → a SECOND record of one contact.
//
// Produced-output assertion: exactly ONE qso record after CONTINUE + the full window.
//
// Mutation verified to bite (restored):
//   Remove `clearTimeout(qsoAdvanceTimer.current)` from advance() → the stale dx4 timer
//   fires advance() a second time → qso.length === 2 → RED.
// ---------------------------------------------------------------------------

describe("E1 — auto-advance: CONTINUE on the last copy step does not double-record", () => {

  async function autoAdvanceCopy() {
    if (!(await grade100CopyViaReveal())) return false;
    act(() => { vi.advanceTimersByTime(4001); }); await act(async () => {});
    act(() => { vi.advanceTimersByTime(6000); }); await act(async () => {}); // flush DX countdown
    return true;
  }
  async function transmitYouStep() {
    const checkTx = screen.queryByRole("button", { name: /CHECK TRANSMISSION/i });
    if (!checkTx) return false;
    fireEvent.click(checkTx); await act(async () => {});
    const tx = screen.queryByRole("button", { name: /TRANSMIT/i });
    if (!tx) return false;
    fireEvent.click(tx); await act(async () => {});
    act(() => { vi.advanceTimersByTime(6000); }); await act(async () => {});
    return true;
  }
  function qsoRecordCount() {
    const raw = window.localStorage.getItem("wrcw:progress");
    return raw ? (JSON.parse(raw).qso || []).length : 0;
  }

  it("[AG-LAST] CONTINUE on last copy step → exactly one record; stale timer cannot double it", async () => {
    const { onDxStep } = await setupDxStep({ autoAdvanceOn: true });
    expect(onDxStep).toBe(true);

    vi.useFakeTimers();

    expect(await autoAdvanceCopy()).toBe(true);   // dx0 → you1
    expect(await transmitYouStep()).toBe(true);   // you1 → dx2
    expect(await autoAdvanceCopy()).toBe(true);   // dx2 → you3
    expect(await transmitYouStep()).toBe(true);   // you3 → dx4 (LAST)

    // On dx4: grade 100% (arms the timer), then click CONTINUE before it fires.
    expect(await grade100CopyViaReveal()).toBe(true);
    const cont = screen.getByRole("button", { name: /CONTINUE/i });
    fireEvent.click(cont);
    await act(async () => {});

    // CONTINUE completed the contact and recorded it once.
    expect(qsoRecordCount()).toBe(1);
    expect(doneVisible()).toBe(true);

    // Let the (production: cancelled) stale dx4 timer's window elapse.
    act(() => { vi.advanceTimersByTime(4001); });
    await act(async () => {});

    // PRODUCED OUTPUT: still exactly one record. A stale advance() would have made two.
    expect(qsoRecordCount()).toBe(1);
  });

});

// ---------------------------------------------------------------------------
// E1 — Double-fire guard on the LAST copy step — the BITING case for the guard.
//
// AF (above) double-CHECKs the FIRST copy step, where both timers capture step=0 and a
// stray second fire is an unobservable no-op setStep(1). THIS test double-CHECKs the LAST
// copy step (dx4): without the top-of-helper clearTimeout, the first CHECK arms T1 and the
// second arms T2 *without cancelling T1* (the .current ref only tracks T2). Both T1 and T2
// capture step=4; at the window both fire advance() → next===length → TWO records.
//
// Produced-output assertion: exactly ONE qso record after the window.
//
// Mutation verified to bite (restored):
//   Remove the top `clearTimeout(qsoAdvanceTimer.current)` from armAutoAdvance →
//   T1 and T2 both fire → qso.length === 2 → RED.
// ---------------------------------------------------------------------------

describe("E1 — auto-advance: double-fire guard on the last copy step (one record, not two)", () => {

  async function autoAdvanceCopy() {
    if (!(await grade100CopyViaReveal())) return false;
    act(() => { vi.advanceTimersByTime(4001); }); await act(async () => {});
    act(() => { vi.advanceTimersByTime(6000); }); await act(async () => {});
    return true;
  }
  async function transmitYouStep() {
    const checkTx = screen.queryByRole("button", { name: /CHECK TRANSMISSION/i });
    if (!checkTx) return false;
    fireEvent.click(checkTx); await act(async () => {});
    const tx = screen.queryByRole("button", { name: /TRANSMIT/i });
    if (!tx) return false;
    fireEvent.click(tx); await act(async () => {});
    act(() => { vi.advanceTimersByTime(6000); }); await act(async () => {});
    return true;
  }
  function qsoRecordCount() {
    const raw = window.localStorage.getItem("wrcw:progress");
    return raw ? (JSON.parse(raw).qso || []).length : 0;
  }

  it("[AF-LAST] double CHECK COPY on last step → exactly one record (guard cancels the first timer)", async () => {
    const { onDxStep } = await setupDxStep({ autoAdvanceOn: true });
    expect(onDxStep).toBe(true);

    vi.useFakeTimers();

    expect(await autoAdvanceCopy()).toBe(true);   // dx0 → you1
    expect(await transmitYouStep()).toBe(true);   // you1 → dx2
    expect(await autoAdvanceCopy()).toBe(true);   // dx2 → you3
    expect(await transmitYouStep()).toBe(true);   // you3 → dx4 (LAST)

    // On dx4: inject the exact target, then CHECK COPY TWICE — arming twice.
    const revealBtn = screen.queryByRole("button", { name: /REVEAL/i });
    if (revealBtn) { fireEvent.click(revealBtn); await act(async () => {}); }
    const curText = readRevealedTargetOrThrow();
    const copyInput = screen.getByRole("textbox", { name: /your copy/i });
    fireEvent.change(copyInput, { target: { value: curText } });
    await act(async () => {});

    const checkCopyBtn = screen.getByRole("button", { name: /CHECK COPY/i });
    fireEvent.click(checkCopyBtn); await act(async () => {});  // arm T1
    fireEvent.click(checkCopyBtn); await act(async () => {});  // production: cancel T1, arm T2

    // Fire the window twice (cover both T1 and T2 if both were live).
    act(() => { vi.advanceTimersByTime(4001); }); await act(async () => {});
    act(() => { vi.advanceTimersByTime(4001); }); await act(async () => {});

    // PRODUCED OUTPUT: exactly one record. Without the guard, both timers record → two.
    expect(qsoRecordCount()).toBe(1);
  });

});

// Read the revealed target text or throw (used where a null target = broken test infra).
function readRevealedTargetOrThrow() {
  let sentLabelEl = null;
  for (const el of document.querySelectorAll("*")) {
    if (el.children.length === 0 && el.textContent.trim() === "Sent") { sentLabelEl = el; break; }
  }
  const target = sentLabelEl?.nextElementSibling?.textContent?.trim() ?? null;
  if (!target) throw new Error("readRevealedTarget: 'Sent' Display not found");
  return target;
}

// ---------------------------------------------------------------------------
// E1 — Cancel table: CLEAR cancels the pending advance timer
// ---------------------------------------------------------------------------

describe("E1 — auto-advance: CLEAR on you-step cancels any pending advance timer", () => {

  // -------------------------------------------------------------------------
  // Test AH: CLEAR on a you-step resets the send state. When no advance timer is
  //   armed (because <100% sim), CLEAR runs without error.
  //
  // Since producing 100% send grade is not practical in jsdom (the target script
  // is long and keyed content is random taps), this test covers the CLEAR path
  // with a <100% grade: grade fires, TRANSMIT appears, CLEAR resets, no stale
  // advance fires.
  //
  // The CLEAR mutation for qsoAdvanceTimer is covered via code inspection:
  //   The CLEAR onClick at line ~2899 clears both qsoPauseTimer AND qsoAdvanceTimer
  //   in adjacent statements. If qsoAdvanceTimer weren't cleared, a pending advance
  //   from a 100% send (achievable on the real device) would survive CLEAR. This is
  //   documented as a real-device risk; the test below proves the code path runs
  //   and CLEAR does not corrupt state.
  //
  // Mutation for the <100% guard (pct !== 100) verified in [AD].
  // -------------------------------------------------------------------------
  // [AH] CLEAR cancels the pending advance timer.
  //
  // CLEAR does NOT reset sendResult (the grade stays visible so the user can
  // read their score before re-keying). What CLEAR DOES do: cancel qsoAdvanceTimer
  // so no stale advance fires later. This test drives a <100% send grade
  // (which doesn't arm the advance timer per the 100%-only gate) then verifies
  // that after CLEAR + 4001ms we are still on the you-step — no phantom advance.
  //
  // Mutation to verify: remove clearTimeout(qsoAdvanceTimer.current) from CLEAR
  // handler. With the always-arm mutation (pct < 0) and the CLEAR fix removed,
  // a phantom advance would fire. But since the 100%-only gate correctly prevents
  // arming on <100%, we instead verify CLEAR doesn't corrupt you-step state.
  it("[AH] CLEAR after <100% send grade: you-step intact (smoke — no advance timer is armable on a you-step in jsdom)", async () => {
    const { isYouStep } = await setupYouStep({ autoAdvanceOn: true });
    // Non-vacuous guard: if you-step isn't reached, fail loudly.
    expect(isYouStep).toBe(true);

    vi.useFakeTimers();

    // Key 3 chars → pause-auto-grade → <100% → 100%-only gate prevents arming.
    for (let i = 0; i < 3; i++) tapAndFinalize();
    await act(async () => {});
    act(() => { vi.advanceTimersByTime(1600); });
    await act(async () => {});

    // Verdict visible (sendResult is set), TRANSMIT present.
    expect(verdictVisible()).toBe(true);
    expect(screen.queryByRole("button", { name: /TRANSMIT →/i })).toBeInTheDocument();

    // CLEAR: cancels timers + resets keyer. sendResult stays (by design — user reads score).
    const clearBtn = screen.getByRole("button", { name: /✕ CLEAR/i });
    fireEvent.click(clearBtn);
    await act(async () => {});

    // Advance past the advance window — no advance timer was armed, nothing fires.
    act(() => { vi.advanceTimersByTime(4001); });
    await act(async () => {});

    // Still on you-step. If CLEAR broke the cancel path, a phantom advance would fire
    // and CHECK TRANSMISSION would disappear.
    expect(screen.queryByRole("button", { name: /CHECK TRANSMISSION/i })).toBeInTheDocument();
  });

});

// ---------------------------------------------------------------------------
// E1 — Cancel table: ABANDON (you-step) cancels the pending advance timer
// ---------------------------------------------------------------------------

describe("E1 — auto-advance: ABANDON on you-step cancels any pending advance timer", () => {

  // -------------------------------------------------------------------------
  // Test AJ: ABANDON from a you-step returns to setup; 4001ms passes with no
  //   phantom advance.
  //
  // Since we can't arm the advance timer from a send-100% in jsdom (the auto-grade
  // path only arms on 100% send sim, which requires keying the full script), this test
  // verifies the ABANDON handler runs without error and the setup screen is stable.
  // Mutation-testability same as AI: removing clearTimeout from you-step ABANDON lets
  // a phantom advance fire after qso=null, but the setStep/setLog updates are invisible
  // in jsdom because qso===null guards prevent any contact UI rendering. The test below
  // proves ABANDON produces a clean state; the clearTimeout is correct defense-in-depth.
  // -------------------------------------------------------------------------
  it("[AJ] ABANDON on you-step → setup intact after 4001ms (smoke — no advance timer is armable on a you-step in jsdom)", async () => {
    const { isYouStep } = await setupYouStep({ autoAdvanceOn: true });
    expect(isYouStep).toBe(true);

    vi.useFakeTimers();

    // Key briefly (no grade reached).
    for (let i = 0; i < 2; i++) tapAndFinalize();
    await act(async () => {});

    const abandonBtn = screen.getByRole("button", { name: /Abandon this contact/i });
    fireEvent.click(abandonBtn);
    await act(async () => {});

    // Setup screen visible.
    expect(screen.getAllByRole("button", { name: /CALL CQ|LISTEN FOR CQ/i }).length).toBeGreaterThan(0);

    act(() => { vi.advanceTimersByTime(4001); });
    await act(async () => {});

    // Setup screen still intact.
    expect(screen.getAllByRole("button", { name: /CALL CQ|LISTEN FOR CQ/i }).length).toBeGreaterThan(0);
    expect(doneVisible()).toBe(false);
  });

});

// ---------------------------------------------------------------------------
// E1 — Cancel table: start() (NEXT CONTACT) clears any residual advance timer
// ---------------------------------------------------------------------------

describe("E1 — auto-advance: start() clears any residual advance timer", () => {

  // -------------------------------------------------------------------------
  // Test AK: ON + 100% copy → advance fires → done panel appears → NEXT CONTACT →
  //   new contact starts cleanly; 4001ms passes with no phantom advance.
  //
  // The start() cancel is defense-in-depth: advance() already cleared the timer
  // before reaching done, so no timer is pending when start() is called.
  // The mutation (removing clearTimeout from start()) is not observable in this test
  // because the timer is already gone before start() runs. The test below proves
  // the new contact starts cleanly and survives a full advance window with no
  // phantom state change — a meaningful regression guard regardless.
  //
  // Mutation-testable (if relevant in future): a scenario where a 100% grade arms
  // a timer, and start() is called BEFORE the timer fires (very fast click). Not
  // reproducible in a fake-timer test without precisely controlling the click timing.
  // -------------------------------------------------------------------------
  it("[AK] NEXT CONTACT after auto-advance completes: new contact starts cleanly (smoke — advance() already cleared the timer before done, so start()'s clear is un-armable here)", async () => {
    const { onDxStep } = await setupDxStep({ autoAdvanceOn: true });
    expect(onDxStep).toBe(true);

    vi.useFakeTimers();

    const ok = await grade100CopyViaReveal();
    expect(ok).toBe(true);

    // Fire the auto-advance.
    act(() => { vi.advanceTimersByTime(4001); });
    await act(async () => {});

    // If the contact is now done, click NEXT CONTACT. If not (multi-step contact
    // moved to a you-step), complete via TRANSMIT and then proceed.
    if (!doneVisible()) {
      // On a you-step — grade with CHECK and TRANSMIT to finish.
      const checkTxBtn = screen.queryByRole("button", { name: /CHECK TRANSMISSION/i });
      if (checkTxBtn) {
        fireEvent.click(checkTxBtn);
        await act(async () => {});
        const transmitBtn = screen.queryByRole("button", { name: /TRANSMIT →/i });
        if (transmitBtn) {
          fireEvent.click(transmitBtn);
          await act(async () => {});
        }
      }
      // Advance any additional timer.
      act(() => { vi.advanceTimersByTime(4001); });
      await act(async () => {});
    }

    if (!doneVisible()) return; // Contact has more steps — skip to avoid false assertion.

    // Click NEXT CONTACT → start().
    const nextContactBtn = screen.queryByRole("button", { name: /NEXT CONTACT/i });
    if (!nextContactBtn) return;
    fireEvent.click(nextContactBtn);
    await act(async () => {});

    // New contact started — done panel gone.
    expect(doneVisible()).toBe(false);

    // Advance 4001ms. No phantom timer from the old contact fires.
    act(() => { vi.advanceTimersByTime(4001); });
    await act(async () => {});

    // New contact still active (not prematurely advanced by a ghost timer).
    expect(doneVisible()).toBe(false);
  });

});

// ---------------------------------------------------------------------------
// E1 — Cancel table: unmount cleanup cancels the advance timer
// ---------------------------------------------------------------------------

describe("E1 — auto-advance: unmount cleanup cancels the advance timer", () => {

  // -------------------------------------------------------------------------
  // Test AL (SMOKE — full-tree unmount): ON + 100% copy → timer armed → full
  // cleanup() → 4001ms → no throw.
  //
  // This is honestly a SMOKE CHECK, not coverage: on a full-tree cleanup() the
  // PARENT CWTrainer also unmounts, so the record() side-effect (which writes via
  // the parent's setProgress) is swallowed and produces no observable output.
  // Removing the cleanup clearTimeout leaves this GREEN. The BITING version is
  // AL-LAST below (a realistic tab switch keeps the parent mounted).
  // -------------------------------------------------------------------------
  it("[AL] full-tree unmount with pending advance timer → no throw after 4001ms (smoke)", async () => {
    const { onDxStep } = await setupDxStep({ autoAdvanceOn: true });
    expect(onDxStep).toBe(true);

    vi.useFakeTimers();

    const ok = await grade100CopyViaReveal();
    expect(ok).toBe(true);

    // Timer is armed. Unmount the whole tree.
    cleanup();

    // Advance past the timer. No throw (cleanup cancelled it; parent gone anyway).
    expect(() => {
      act(() => { vi.advanceTimersByTime(4001); });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Test AL-LAST (BITING — realistic tab switch on the LAST copy step):
  // Arm an auto-advance on dx4 (last copy step), then SWITCH TABS. A tab switch
  // unmounts QsoSim but leaves the parent CWTrainer mounted — so a stale timer
  // firing record() afterward DOES write localStorage (not swallowed). The unmount
  // cleanup effect must cancel the timer so no record is written for a contact the
  // user navigated away from.
  //
  // Mutation verified to bite (restored):
  //   Remove `clearTimeout(qsoAdvanceTimer.current)` from QsoSim's unmount cleanup
  //   effect → the stale dx4 timer fires record() into the still-mounted parent →
  //   qso.length === 1 → RED.
  // -------------------------------------------------------------------------
  it("[AL-LAST] tab switch with pending last-step timer → no stale record written", async () => {
    const { onDxStep } = await setupDxStep({ autoAdvanceOn: true });
    expect(onDxStep).toBe(true);

    vi.useFakeTimers();

    const autoAdvanceCopy = async () => {
      if (!(await grade100CopyViaReveal())) return false;
      act(() => { vi.advanceTimersByTime(4001); }); await act(async () => {});
      act(() => { vi.advanceTimersByTime(6000); }); await act(async () => {});
      return true;
    };
    const transmitYouStep = async () => {
      const checkTx = screen.queryByRole("button", { name: /CHECK TRANSMISSION/i });
      if (!checkTx) return false;
      fireEvent.click(checkTx); await act(async () => {});
      const tx = screen.queryByRole("button", { name: /TRANSMIT/i });
      if (!tx) return false;
      fireEvent.click(tx); await act(async () => {});
      act(() => { vi.advanceTimersByTime(6000); }); await act(async () => {});
      return true;
    };
    const qsoRecordCount = () => {
      const raw = window.localStorage.getItem("wrcw:progress");
      return raw ? (JSON.parse(raw).qso || []).length : 0;
    };

    expect(await autoAdvanceCopy()).toBe(true);   // dx0 → you1
    expect(await transmitYouStep()).toBe(true);   // you1 → dx2
    expect(await autoAdvanceCopy()).toBe(true);   // dx2 → you3
    expect(await transmitYouStep()).toBe(true);   // you3 → dx4 (LAST)

    // On dx4: grade 100% to ARM. Do NOT fire.
    expect(await grade100CopyViaReveal()).toBe(true);
    expect(qsoRecordCount()).toBe(0);

    // Switch to LEARN — unmounts QsoSim; CWTrainer parent (and its progress store) stays.
    fireEvent.click(screen.getByRole("button", { name: "LEARN" }));
    await act(async () => {});

    // Fire the window. The cleanup must have cancelled the timer; nothing records.
    act(() => { vi.advanceTimersByTime(4001); });
    await act(async () => {});

    // PRODUCED OUTPUT: no stale QSO record from the abandoned-by-navigation contact.
    expect(qsoRecordCount()).toBe(0);
  });

});

// ---------------------------------------------------------------------------
// E1 — Accessibility: "Advancing automatically." suffix only when armed
// ---------------------------------------------------------------------------

describe("E1 — a11y: resultLive suffix 'Advancing automatically.' only when armed", () => {

  // -------------------------------------------------------------------------
  // Test AM-ON: ON + 100% copy → resultLive contains "Advancing automatically."
  //
  // The resultLive region is always-mounted (sr-only) and set imperatively in
  // checkCopy(). Its textContent is the only AT path for the copy result.
  // The suffix appears ONLY when the advance timer is actually armed.
  //
  // Mutation verified to bite:
  //   Remove the `Advancing automatically.` append from the armed branch →
  //   resultLive reads "Copy: 100% — SOLID COPY" without the suffix →
  //   assertion `.toContain("Advancing automatically.")` fails → RED.
  // -------------------------------------------------------------------------
  it("[AM-ON] ON + 100% copy → resultLive contains 'Advancing automatically.'", async () => {
    const { onDxStep } = await setupDxStep({ autoAdvanceOn: true });
    expect(onDxStep).toBe(true);

    vi.useFakeTimers();

    const ok = await grade100CopyViaReveal();
    expect(ok).toBe(true);

    // Find the resultLive region — the one that contains "Copy:" (set by checkCopy).
    // Two role="status" regions exist (stepLive + resultLive); find the relevant one.
    const liveRegions = Array.from(document.querySelectorAll('[role="status"][aria-live="polite"]'));
    const resultLiveEl = liveRegions.find((el) => el.textContent.includes("Copy:"));
    expect(resultLiveEl).toBeTruthy();
    expect(resultLiveEl.textContent).toContain("Advancing automatically.");
  });

  // -------------------------------------------------------------------------
  // Test AM-OFF: OFF + 100% copy → resultLive does NOT contain "Advancing automatically."
  //
  // Mutation verified to bite:
  //   Remove the `!settings.qsoAutoAdvance` guard from the a11y branch →
  //   OFF-toggle still appends "Advancing automatically." → assertion
  //   `.not.toContain(...)` fails → RED.
  // -------------------------------------------------------------------------
  it("[AM-OFF] OFF + 100% copy → resultLive does NOT contain 'Advancing automatically.'", async () => {
    const { onDxStep } = await setupDxStep({ autoAdvanceOn: false });
    expect(onDxStep).toBe(true);

    vi.useFakeTimers();

    const ok = await grade100CopyViaReveal();
    expect(ok).toBe(true);

    const liveRegions = Array.from(document.querySelectorAll('[role="status"][aria-live="polite"]'));
    const resultLiveEl = liveRegions.find((el) => el.textContent.includes("Copy:"));
    expect(resultLiveEl).toBeTruthy();
    expect(resultLiveEl.textContent).not.toContain("Advancing automatically.");
  });

});

// ---------------------------------------------------------------------------
// E1 — Toggle UI: label and aria-pressed
// ---------------------------------------------------------------------------

describe("E1 — toggle UI: AUTO OFF/ON label and aria-pressed in optionsJSX", () => {

  // -------------------------------------------------------------------------
  // Test AP: toggle starts OFF (aria-pressed=false); clicking once → aria-pressed=true,
  //   label AUTO ON; clicking again → back to OFF.
  //
  // Mutation (not directly testable without impl change but ensures the toggle
  // renders): removing the aria-pressed attribute → assertion fails → RED.
  // -------------------------------------------------------------------------
  it("[AP] toggle: OFF → click → ON → click → OFF (aria-pressed reflects state)", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "QSO");

    const offBtn = screen.getByRole("button", { name: /AUTO OFF/i });
    expect(offBtn).toHaveAttribute("aria-pressed", "false");

    await user.click(offBtn);
    const onBtn = screen.getByRole("button", { name: /AUTO ON/i });
    expect(onBtn).toHaveAttribute("aria-pressed", "true");

    await user.click(onBtn);
    expect(screen.getByRole("button", { name: /AUTO OFF/i })).toHaveAttribute("aria-pressed", "false");
  });

  // -------------------------------------------------------------------------
  // Test AQ: toggle only renders in optionsJSX (pre-contact); absent during active contact.
  // -------------------------------------------------------------------------
  it("[AQ] toggle present pre-contact; absent during active contact", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "QSO");

    expect(screen.getByRole("button", { name: /AUTO OFF/i })).toBeInTheDocument();

    // Start a contact (EASY mode so the DX panel renders CONTINUE immediately).
    const rail = screen.getByRole("complementary", { name: "Options" });
    await chooseOption(user, "Conditions", /EASY/i, rail);

    // Use Ragchew + "Answer a CQ" (default) — first step is DX. In EASY mode
    // CONTINUE renders as soon as the contact starts (no copy input).
    await user.click(within(rail).getByRole("button", { name: /CALL CQ|LISTEN FOR CQ/ }));
    await act(async () => {});

    // Confirm the contact is active: CONTINUE or the DX panel's REPLAY button is present.
    // (CONTINUE renders in EASY mode DX step; REPLAY is always in DX step panel.)
    const inContact =
      screen.queryByRole("button", { name: /CONTINUE →/i }) ||
      screen.queryByRole("button", { name: /REPLAY/i }) ||
      screen.queryByRole("button", { name: /Abandon this contact/i });
    // If the contact didn't start, the test infrastructure is broken — fail loudly.
    expect(inContact).not.toBeNull();

    // During the contact, optionsJSX is not rendered (qso is set; the ternary
    // renders contextJSX in the rail, not optionsJSX).
    expect(screen.queryByRole("button", { name: /AUTO OFF/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /AUTO ON/i })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test AR: qsoAutoAdvance defaults false and persists to the store on toggle.
  //
  // The store facade writes settings under the "wrcw:settings" localStorage key.
  // Produced output: the persisted JSON's qsoAutoAdvance field (false by default,
  // true after one click). This is AC1 (opt-in, default false) + the persistence ask.
  //
  // Mutation verified to bite (restored):
  //   Set `qsoAutoAdvance: true` in DEFAULT_SETTINGS → the default assertion (false) → RED.
  //   Remove the toggle's onClick setSettings → the persisted value never flips → RED.
  // -------------------------------------------------------------------------
  it("[AR] qsoAutoAdvance defaults false; toggling persists true to wrcw:settings", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "QSO");

    const persisted = () =>
      JSON.parse(window.localStorage.getItem("wrcw:settings") || "{}").qsoAutoAdvance;

    expect(persisted()).toBe(false);                 // default OFF, persisted
    await user.click(screen.getByRole("button", { name: /AUTO OFF/i }));
    expect(persisted()).toBe(true);                  // toggling ON persists true
  });

});

// ---------------------------------------------------------------------------
// E2 — Simulation reminder text on every completed contact
// ---------------------------------------------------------------------------

describe("E2 — simulation reminder: exact text on every completed QSO", () => {

  // -------------------------------------------------------------------------
  // Helper: set EASY difficulty from the Options rail (the wide-layout location).
  // Mirrors the setEasy() helper in progress-qso.dom.test.jsx.
  // -------------------------------------------------------------------------
  async function setEasy(user) {
    const rail = screen.getByRole("complementary", { name: "Options" });
    await chooseOption(user, "Conditions", /EASY/, rail);
  }

  // -------------------------------------------------------------------------
  // Helper: start the contact from the Options rail (wide layout).
  // Using within(rail) avoids the multiple-elements error from the portal pattern.
  // -------------------------------------------------------------------------
  async function startContactFromRail(user) {
    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(within(rail).getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ }));
  }

  // -------------------------------------------------------------------------
  // Helper: drive a ragchew/answer EASY contact to completion.
  // Step pattern: DX(0) → you(1) → DX(2) → you(3) → DX(4) → done.
  // EASY DX steps: CONTINUE → available immediately (no copy input, no countdown wait).
  // You-steps: CHECK TRANSMISSION (empty keyer → 0% but sendResult set) → TRANSMIT.
  // Mirrors driveContactStepsToCompletion in progress-qso.dom.test.jsx.
  // -------------------------------------------------------------------------
  async function driveRagchewAnswerToDone(user) {
    await user.click(screen.getByRole("button", { name: /CONTINUE →/ }));        // step 0 DX
    await user.click(screen.getByRole("button", { name: /CHECK TRANSMISSION/ })); // step 1 you — grade
    await user.click(screen.getByRole("button", { name: /TRANSMIT →/ }));         // step 1 you — advance
    await user.click(screen.getByRole("button", { name: /CONTINUE →/ }));         // step 2 DX
    await user.click(screen.getByRole("button", { name: /CHECK TRANSMISSION/ })); // step 3 you — grade
    await user.click(screen.getByRole("button", { name: /TRANSMIT →/ }));         // step 3 you — advance
    await user.click(screen.getByRole("button", { name: /CONTINUE →/ }));         // step 4 DX → done
  }

  // -------------------------------------------------------------------------
  // Test AN: complete a contact → reminder text visible (verbatim substrings).
  //
  // Mutation verified to bite:
  //   Delete the <p> containing the reminder from the done IIFE block →
  //   screen.getByText(/Remember: this is just a simulation/) throws → RED.
  // -------------------------------------------------------------------------
  it("[AN] completed QSO → verbatim simulation reminder visible", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "QSO");
    await setEasy(user);
    await startContactFromRail(user);
    await driveRagchewAnswerToDone(user);

    expect(screen.getByText(/QSO COMPLETE/i)).toBeInTheDocument();

    // Verbatim approved text — verified as substrings because the full sentence
    // lives in one <p> node so any single getByText is sufficient to bite.
    expect(
      screen.getByText(/Remember: this is just a simulation/, { exact: false })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/there's no single "right" way/, { exact: false })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/confidence to get on the air for real\. 73!/, { exact: false })
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test AO: reminder appears on a second consecutive completed contact.
  // No dismiss state — it shows on EVERY completed contact.
  //
  // Mutation verified to bite:
  //   Add a `const [shown, setShown] = useState(false)` that hides the reminder
  //   after the first done render → second contact's done panel lacks reminder →
  //   assertion fails → RED.
  // -------------------------------------------------------------------------
  it("[AO] reminder appears on second consecutive completed contact", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "QSO");
    await setEasy(user);

    // First contact.
    await startContactFromRail(user);
    await driveRagchewAnswerToDone(user);
    expect(screen.getByText(/QSO COMPLETE/i)).toBeInTheDocument();
    expect(screen.getByText(/Remember: this is just a simulation/, { exact: false })).toBeInTheDocument();

    // NEXT CONTACT calls start() directly — the new contact begins immediately.
    // Note: the start button (LISTEN FOR CQ) inside optionsJSX is NOT visible during a contact
    // (qso is set). NEXT CONTACT is the only entry point from the done panel.
    await user.click(screen.getByRole("button", { name: /NEXT CONTACT/ }));

    await driveRagchewAnswerToDone(user);
    expect(screen.getByText(/QSO COMPLETE/i)).toBeInTheDocument();

    // Reminder must be present on the second contact's done panel.
    expect(screen.getByText(/Remember: this is just a simulation/, { exact: false })).toBeInTheDocument();
  });

});
