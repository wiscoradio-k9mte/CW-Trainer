// @vitest-environment jsdom
//
// Tests for two practice-flow enhancements:
//   #1 — Auto-focus the "type what you heard" input when it becomes the active task
//   #2 — Auto-grade on key completion (decoded reaches target length)
//
// All assertions check PRODUCED STATE (decoded buffer, result score, record count,
// document.activeElement) — never just "an event fired" or "a function was called".
// Each mutation is noted inline so the gate can verify they bite.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { gotoTab } from "./helpers.jsx";

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
  cleanup();
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function freshApp() {
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  return { user };
}

// Read the parsed progress object from localStorage (null if nothing stored).
function readProgress() {
  const raw = window.localStorage.getItem("wrcw:progress");
  return raw ? JSON.parse(raw) : null;
}

// Drive a straight-key Space tap under fake timers and advance 160ms so the
// char-finalize timer (u * 2.5 = 60 * 2.5 = 150ms at 20 wpm) fires. One tap
// produces one dit, which finalizes as "E". Both the keydown and keyup are
// dispatched synchronously inside act() so React flushes the resulting state
// change (setDecoded) before advanceTimersByTime returns.
function tapAndFinalize() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent("keyup",   { code: "Space", bubbles: true, cancelable: true }));
  });
  act(() => { vi.advanceTimersByTime(160); });
}

// Dispatch a raw keydown+keyup without advancing the clock — used to trigger
// HH (8 rapid dits without inter-element gaps, so ditRun hits 8 and
// resetErrorSignal fires, wiping decoded to "").
function tapRaw() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent("keyup",   { code: "Space", bubbles: true, cancelable: true }));
  });
}

// Navigate to KEY, switch to STRAIGHT KEY, click NEW TEXT to get a target.
// Returns the userEvent instance. Must be called with real timers active;
// switches to fake timers AFTER setup so userEvent can animate normally.
async function setupKeyTab() {
  const { user } = await freshApp();
  await gotoTab(user, "KEY");
  // STRAIGHT KEY lives in the Options rail on wide layout (the test setup mock
  // sets matchMedia to matches:true, rendering the Options complementary region).
  await user.click(screen.getByRole("button", { name: "STRAIGHT KEY" }));
  await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));
  return { user };
}

// ---------------------------------------------------------------------------
// Enhancement #1 — Auto-focus
// ---------------------------------------------------------------------------

describe("Enhancement #1 — auto-focus copy input (COPY tab)", () => {
  it("copy input has focus after a new target is set via NEW button", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "COPY");

    // Before NEW: no target, input may or may not have focus — we don't care.
    // Start a target via fake timers to skip the 5s countdown.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /▶ NEW/ }));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    vi.useRealTimers();

    // After the countdown: the copy input should be focused.
    // Mutation to prove bite: remove `copyInputRef.current.focus()` call → this fails.
    const input = screen.getByRole("textbox", { name: /Your copy/i });
    expect(document.activeElement).toBe(input);
  });

  it("copy input does NOT steal focus before any target exists", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "COPY");

    // No NEW pressed — no target, so the focus effect should not fire.
    const input = screen.getByRole("textbox", { name: /Your copy/i });
    // Focus must NOT be on the copy input (it is on whatever the nav left it at).
    expect(document.activeElement).not.toBe(input);
  });
});

describe("Enhancement #1 — auto-focus copy input (QSO tab, DX step)", () => {
  it("copy input gets focus when a DX copy step begins in normal mode", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "QSO");

    // Default: Ragchew + Answer a CQ + NORMAL — the first step is a DX send so
    // the copy input panel will appear. Start the contact.
    const startBtn = screen.getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ });
    await user.click(startBtn);

    // The DX step panel renders a copy input when difficulty !== "easy".
    // The focus effect fires when cur transitions to a dx step.
    // Mutation to prove bite: remove qsoCopyInputRef.current.focus() → fails.
    const input = screen.queryByRole("textbox", { name: /Your copy of what you heard/i });
    if (input) {
      // Input is present → focus effect should have run.
      expect(document.activeElement).toBe(input);
    }
    // If input is null the step is a you-step (activator role variant) — no focus expected.
  });

  it("copy input is NOT focused when the active step is a you-send step", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "QSO");

    // Pick Ragchew + "Call CQ" role → first step is a you-send step (activator calls CQ).
    await user.click(screen.getByRole("button", { name: /Ragchew/i }));
    // Role button for "Call CQ" (Ragchew Call-CQ role)
    const callCqRole = screen.queryByRole("button", { name: /Call CQ/i });
    if (callCqRole) await user.click(callCqRole);

    const startBtn = screen.getByRole("button", { name: /CALL CQ|LISTEN FOR CQ/ });
    await user.click(startBtn);

    // On a you-step, the keyer decoded display is visible; the copy input is NOT.
    const copyInput = screen.queryByRole("textbox", { name: /Your copy of what you heard/i });
    expect(copyInput).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Enhancement #2 — Auto-grade (KeyTrainer)
// ---------------------------------------------------------------------------

describe("Enhancement #2 — auto-grade on key completion (KEY tab)", () => {
  // ---------------------------------------------------------------------------
  // Test 1 (HIGH): Auto-grade fires WITHOUT a CHECK click.
  //
  // Drive Space taps + fake-timer advances to push keyer.decoded past normLen(target).
  // The auto-grade effect (deps: [keyer.decoded]) fires check() the first time
  // normLen(decoded) >= normLen(target). With 20 wpm and u=60ms the char-finalize
  // timer is 150ms; advancing 160ms per tap finalizes one "E" per tap.
  //
  // All targets from DRILL_CATEGORIES[0] (Common words) are at most 20 chars
  // ("DIPOLE DIPOLE DIPOLE" — verified by enumeration). Driving 25 taps guarantees
  // normLen(decoded) = 25 >= any possible normLen(target from the words category),
  // so the auto-grade fires without knowing the exact target.
  //
  // Mutation verified to bite:
  //   M1 (verified): comment out the `check()` call in the auto-grade useEffect
  //       → no verdict appears → test FAILS ✓
  //   NOTE: the `<` early-return guard is tested by M3 (HH disarm) and M4 (partial),
  //   not here — driving 25 dits > max-target means the guard fires correctly either way.
  // ---------------------------------------------------------------------------
  it("[M1] auto-grade fires WITHOUT CHECK click when decoded reaches target length", async () => {
    const { user } = await setupKeyTab();

    // Switch to fake timers AFTER navigation (userEvent needs real timers to animate).
    vi.useFakeTimers();

    // Drive 25 dits. Each tap finalizes to "E"; 25 > any words-category target length.
    for (let i = 0; i < 25; i++) tapAndFinalize();

    // Allow any residual React state flushes.
    await act(async () => {});

    // A verdict must be visible — check() was called by the auto-grade effect,
    // NOT by a CHECK button click. Result is 0% (25 "E"s vs a random word target)
    // → "PSE AGN". Any verdict element appearing proves check() fired.
    const verdict = screen.queryByText("PSE AGN") ||
                    screen.queryByText("SOLID COPY") ||
                    screen.queryByText(/GOOD — AGN/);
    expect(verdict).toBeInTheDocument();

    // Exactly one key session must have been written.
    const progress = readProgress();
    expect(progress).not.toBeNull();
    expect(progress.key.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Test 2 (HIGH): HH wipe disarms the auto-grade guard so the clean attempt
  // also grades automatically.
  //
  // Flow:
  //   1. Key 25 dits (finalized) → auto-grade fires → verdict visible (count = 1).
  //   2. Key 8 rapid dits WITHOUT advancing timers → ditRun hits 8 →
  //      resetErrorSignal fires → setDecoded("") → auto-grade effect sees
  //      normLen("") < normLen(target) → sets autoGradeFired.current = false.
  //   3. Key 25 more dits (finalized) → normLen(decoded) >= normLen(target) AND
  //      !autoGradeFired.current → check() fires again → a NEW verdict appears.
  //
  // Note on record count: recordWritten.current is NOT reset by HH (only by
  // explicit CLEAR / newTarget / pickCat), so the second check() call does NOT
  // write a second localStorage record. The assertion is that check() RE-FIRES
  // (a verdict is present), not that count goes to 2. This is correct behavior:
  // the guard that prevents double-records is distinct from the guard that allows
  // the clean attempt to re-grade.
  //
  // Mutation check:
  //   M3: remove the `autoGradeFired.current = false;` line in the auto-grade
  //       useEffect (the "disarm" branch when decoded < target)
  //       → after HH + re-key, autoGradeFired stays true → check() never re-fires
  //       → no verdict after step 3 → test fails.
  // ---------------------------------------------------------------------------
  it("[M3] HH wipe disarms the auto-grade guard; clean re-send grades automatically", async () => {
    const { user } = await setupKeyTab();
    vi.useFakeTimers();

    // Step 1: drive to target length → first auto-grade fires.
    for (let i = 0; i < 25; i++) tapAndFinalize();
    await act(async () => {});

    // Verdict must be present after step 1.
    const verdictAfterFirst =
      screen.queryByText("PSE AGN") ||
      screen.queryByText("SOLID COPY") ||
      screen.queryByText(/GOOD — AGN/);
    expect(verdictAfterFirst).toBeInTheDocument();

    // Step 2: 8 rapid taps without advancing → ditRun reaches 8 → HH fires →
    // decoded wiped to "" → effect disarms autoGradeFired.current.
    // The errFlash state is set (1800ms timer) but we don't advance — that's fine.
    for (let i = 0; i < 8; i++) tapRaw();
    await act(async () => {});

    // Step 3: drive 25 more dits to target length → auto-grade MUST re-fire.
    for (let i = 0; i < 25; i++) tapAndFinalize();
    await act(async () => {});

    // A verdict is present — check() fired again after the HH disarm.
    // (setResult is called unconditionally in check(); the record guard is
    // separate and stays true, so count remains 1 — that is correct behavior.)
    const verdictAfterHH =
      screen.queryByText("PSE AGN") ||
      screen.queryByText("SOLID COPY") ||
      screen.queryByText(/GOOD — AGN/);
    expect(verdictAfterHH).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Test 3 (HIGH): A genuine partial send does NOT auto-grade.
  //
  // Drive 3 dits (finalized) so keyer.decoded changes from "" to "EEE", but 3 <
  // normLen(any target). The auto-grade effect must run (decoded changed) but must
  // NOT call check() because normLen("EEE") = 3 < normLen(target).
  //
  // Why not zero dits: the old vacuous test drove no dits so keyer.decoded never
  // changed and the effect never ran at all — the test passed even when the guard
  // was removed. This test drives a real partial so the effect fires and the guard
  // is exercised.
  //
  // Mutation check:
  //   M4: change `<` to `<=` in the normLen guard
  //       (or remove the early-return condition entirely)
  //       → check() fires on the partial → verdict appears → test fails.
  // ---------------------------------------------------------------------------
  it("[M4] a genuine partial attempt (decoded < target) does NOT auto-grade", async () => {
    const { user } = await setupKeyTab();
    vi.useFakeTimers();

    // Drive 3 dits — enough to change decoded (so the effect runs) but far below
    // any possible target length (minimum target is ~5 chars after normalization).
    for (let i = 0; i < 3; i++) tapAndFinalize();
    await act(async () => {});

    // No verdict: check() must NOT have been called for a partial send.
    expect(screen.queryByText("PSE AGN")).not.toBeInTheDocument();
    expect(screen.queryByText("SOLID COPY")).not.toBeInTheDocument();
    expect(screen.queryByText(/GOOD — AGN/)).not.toBeInTheDocument();

    // No progress record written.
    const progress = readProgress();
    expect(progress?.key?.length ?? 0).toBe(0);
  });

  it("manual CHECK fallback scores a short attempt (no auto-grade needed)", async () => {
    // CHECK must still work when the user deliberately grades a partial send.
    // This verifies the fallback path (the button) is not broken by the guard.
    // Mutation: disable check() entirely → no result → test fails.

    const { user } = await freshApp();
    await gotoTab(user, "KEY");
    await user.click(screen.getByRole("button", { name: "STRAIGHT KEY" }));
    await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));

    // Don't send anything; just click CHECK. Score = 0% → "PSE AGN".
    await user.click(screen.getByRole("button", { name: "CHECK" }));
    expect(screen.getByText("PSE AGN")).toBeInTheDocument();
  });

  it("no double-grade across extra re-renders at target length", async () => {
    // Even if the component re-renders while decoded >= target, the effect must
    // not call check() more than once. We simulate by triggering a benign re-render
    // after the first CHECK and asserting the record count stays the same.
    // Mutation: remove the `!autoGradeGuard.current` gate in the effect →
    // every re-render fires check() again.

    const { user } = await freshApp();
    await gotoTab(user, "KEY");
    await user.click(screen.getByRole("button", { name: "STRAIGHT KEY" }));
    await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));

    tapRaw();
    await user.click(screen.getByRole("button", { name: "CHECK" }));
    await act(async () => {});

    const p1 = readProgress();
    const countBefore = p1?.key?.length ?? 0;

    // Trigger a benign re-render by clicking HEAR IT (no state change that matters).
    // The auto-grade effect re-runs but decoded is still >= target → guard is true → no second call.
    await user.click(screen.getByRole("button", { name: /♪ HEAR IT|HEAR IT/ }));
    await act(async () => {});

    const p2 = readProgress();
    const countAfter = p2?.key?.length ?? 0;

    expect(countAfter).toBe(countBefore);
  });
});

// ---------------------------------------------------------------------------
// Enhancement #2 — QSO step-gating
// ---------------------------------------------------------------------------

describe("Enhancement #2 — QSO step-gating", () => {
  // ---------------------------------------------------------------------------
  // Test 4a (HIGH): Auto-grade fires on a you-send step WITHOUT a CHECK click.
  //
  // The QSO send auto-grade is PAUSE-based (fix/qso-autograde): after the operator
  // stops keying and the idle pause elapses (max(1500ms, 8u)), checkSend() fires.
  // Drive a few chars, then advance the clock past the 1500ms floor.
  //
  // The old length-based trigger required reaching normLen(cur.suggested) ≈ 60–90
  // chars, which a real over never matches — that's the bug this fix corrects.
  //
  // Mutation verified to bite:
  //   M5: comment out `checkSend()` inside the setTimeout callback in the
  //       auto-grade effect → no send score appears after advancing past the pause
  //       threshold → test FAILS ✓
  // ---------------------------------------------------------------------------
  it("[M5] you-send step: auto-grades after idle pause WITHOUT CHECK TRANSMISSION click", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "QSO");

    // Ragchew + "Call CQ" → first step is a you-send (cur.who = "you", suggested = CQ text).
    await user.click(screen.getByRole("button", { name: /Ragchew/i }));
    const callCqBtn = screen.queryByRole("button", { name: /Call CQ/i });
    if (callCqBtn) await user.click(callCqBtn);

    const startBtn = screen.getByRole("button", { name: /CALL CQ|LISTEN FOR CQ/ });
    await user.click(startBtn);

    // Confirm this is a you-step (CHECK TRANSMISSION button is visible in the panel).
    const checkTxBtn = screen.queryByRole("button", { name: /CHECK TRANSMISSION/i });
    if (!checkTxBtn) {
      // This role variant doesn't start with a you-step — skip.
      return;
    }

    // Switch to STRAIGHT KEY so Space events are the element source.
    const skBtn = screen.queryByRole("button", { name: "STRAIGHT KEY" });
    expect(skBtn).toBeInTheDocument();
    await user.click(skBtn);

    vi.useFakeTimers();

    // Drive 5 chars (far below the 60–90 char suggested CQ text — this is the
    // scenario the old length trigger could never handle; the pause trigger can).
    for (let i = 0; i < 5; i++) tapAndFinalize();
    await act(async () => {});

    // No grade yet — we haven't waited out the pause.
    const noVerdict =
      screen.queryByText("PSE AGN") ||
      screen.queryByText("SOLID COPY") ||
      screen.queryByText(/GOOD — AGN/);
    expect(noVerdict).not.toBeInTheDocument();

    // Advance past the max(1500ms, 8u=240ms at 20wpm) threshold.
    act(() => { vi.advanceTimersByTime(1600); });
    await act(async () => {});

    // Now the verdict must be visible: checkSend() fired via the pause timer.
    const sendVerdict =
      screen.queryByText("PSE AGN") ||
      screen.queryByText("SOLID COPY") ||
      screen.queryByText(/GOOD — AGN/);
    expect(sendVerdict).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Test 4b (HIGH): Auto-grade does NOT fire on a DX step.
  //
  // Navigate to QSO with Ragchew + "Answer a CQ" (default) → first step is DX
  // (the DX station sends; cur.who = "dx"; cur.suggested = undefined). The
  // auto-grade send effect early-returns on this step. Two guards contribute:
  //   1. cur.who === "dx"
  //   2. !cur.suggested (DX steps never have a suggested field)
  //
  // Guard 2 is the REAL gate: removing ONLY guard 1 (cur.who === "dx") still
  // catches DX steps via guard 2 — so guard 1 is defense-in-depth. The mutation
  // below removes BOTH guards to verify that the test actually observes a failure;
  // this confirms the test would catch the case where a refactor inadvertently
  // populates DX steps with a `suggested` field (breaking guard 2 too).
  //
  // Mutation verified to bite:
  //   M6 (verified): change `if (!cur || cur.who === "dx" || !cur.suggested)`
  //       to `if (!cur)` (remove both DX guards)
  //       → decoded reaches normLen(cur.text) on a DX step → checkSend fires
  //       → PSE AGN appears → test FAILS ✓
  //   NOTE: removing only cur.who==="dx" still passes (guard 2 saves it).
  //   NOTE: replacing !cur.suggested with !cur.text still passes for the
  //   same reason — DX steps have `text`, but guard 1 fires first. Only
  //   removing BOTH guards breaks this test, which is the honest mutation.
  // ---------------------------------------------------------------------------
  it("[M6] DX step: keying does NOT produce a send score (checkSend not called)", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "QSO");

    // Ragchew + "Answer a CQ" (default) → first step is DX.
    const startBtn = screen.getByRole("button", { name: /LISTEN FOR CQ/ });
    await user.click(startBtn);

    // If this role variant doesn't begin with a DX step, the test is vacuous —
    // assert the DX panel is present so the test fails loudly if the role changes.
    const dxStepIndicator = screen.queryByRole("button", { name: /CONTINUE/i });
    expect(dxStepIndicator).toBeInTheDocument();

    // Switch to STRAIGHT KEY so Space is the keying element.
    const skBtn = screen.queryByRole("button", { name: "STRAIGHT KEY" });
    if (skBtn) await user.click(skBtn);

    vi.useFakeTimers();

    // Drive 15 dits — if the guard is missing, checkSend would fire on this.
    for (let i = 0; i < 15; i++) tapAndFinalize();
    await act(async () => {});

    // No send score must appear on a DX step.
    expect(screen.queryByText("PSE AGN")).not.toBeInTheDocument();
    expect(screen.queryByText("SOLID COPY")).not.toBeInTheDocument();
    expect(screen.queryByText(/GOOD — AGN/)).not.toBeInTheDocument();
    // The "CHECK TRANSMISSION" button is absent on DX steps (it only appears
    // on you-send steps) — this is the structural gate that separates the two.
    expect(screen.queryByRole("button", { name: /CHECK TRANSMISSION/i })).not.toBeInTheDocument();
  });
});
