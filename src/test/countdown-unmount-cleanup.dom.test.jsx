// @vitest-environment jsdom
//
// useCountdown's UNMOUNT cleanup — the leak nothing was pinning.
//
// `useCountdown` runs a 1s setInterval for the 5-beat "Get ready" count and then
// fires its callback (COPY: generate a target and transmit it; QSO: transmit the
// DX step). Every *in-component* route out of a live countdown already cancels it
// (STOP, QSO advance(), both ABANDONs, and start() self-cancelling) and those are
// covered by stop-cancels-countdown.dom.test.jsx and qso-autograde-pause.dom.test.jsx.
//
// The route NONE of them covers is the user simply LEAVING: the tab component that
// owns the hook unmounts while the interval is still running. `player` is owned by
// the parent CWTrainer and survives the tab switch, so an interval that outlives its
// component still resolves to a real transmission — audio arriving in a section the
// operator walked away from ~5 seconds ago, on top of whatever they are doing now.
// The ONLY thing preventing that is `useCountdown`'s own unmount effect
// (`useEffect(() => () => clearInterval(intervalRef.current), [])`), and deleting
// that line left the whole 879-test suite green (measured 2026-08-18) — hence this
// file.
//
// What is asserted, and why it is a CONSEQUENCE and not an implementation detail:
// `createOscillator` call count. The Web Audio mock is silent and asserts nothing,
// and only three sites in the app ever create an oscillator — play() (one per
// transmission), beep() (a paddle element) and keyDownTone() (sidetone). These tests
// never key, so after the tab switch the count can only move if a transmission
// actually started. That is the user-visible harm itself, not "clearInterval was
// called" — a test on the latter would pass on a hook that cleared the wrong id.
//
// The last test is the vacuity control: the same countdown, left mounted, MUST
// transmit. Without it a broken spy or a ▶ NEW that stopped arming would make the
// two zero-counts above pass for the wrong reason.
//
// MEASURED, both surfaces, at the moment of the tab switch and after a 15s advance
// (the numbers the assertions below are set from):
//
//              | with cleanup        | cleanup deleted
//   pre-switch | timers 1, osc 0     | timers 1, osc 0
//  post-switch | timers 0, osc 0     | timers 1, osc 0
// post-advance | timers 0, osc 0     | timers 0*, osc 1     (* it clears itself when it fires)
//
// Mutations run against this file (every red an AssertionError, no crashes; the
// control test stayed green in all of them, so the reds are attributable):
//   M1  delete the unmount effect entirely
//         -> both tests red on BITE 1 ("expected 1 to be +0").
//         -> with BITE 1 suppressed, both red on BITE 2
//            ("expected createOscillator to be called +0 times, but got 1 times"),
//            so the audio assertion bites independently of the timer one.
//   M2  cleanup still CALLS clearInterval, but on the id captured at mount (null)
//         -> both tests red on BITE 1. This is the cell that makes the point of
//            asserting consequences: a "clearInterval was called on unmount" test
//            passes here, and the ghost transmission still happens.

import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { renderApp, gotoTab, screen } from "./helpers.jsx";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
  cleanup();
});

// The countdown readout is a "Get ready" label followed by a Display carrying the
// number; reading the label's parent scopes it to that block (never a document-wide
// substring match). Same helper shape as stop-cancels-countdown.dom.test.jsx.
const readout = () => screen.queryByText("Get ready")?.parentElement?.textContent ?? null;

// Leaving the tab is what unmounts the component that owns the hook. fireEvent, not
// userEvent: fake timers are already running by this point and userEvent deadlocks
// under them in this harness.
const leaveForKeyTab = () => {
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "KEY" }));
  });
};

describe("COPY — leaving the tab mid-countdown transmits nothing afterwards", () => {
  it("plays no ghost transmission once CopyTrainer has unmounted", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const osc = vi.spyOn(window.AudioContext.prototype, "createOscillator");

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /NEW$/ }));
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Premise: the countdown is genuinely mid-flight with 3 beats to go, its
    // interval is the one pending timer, and nothing has been transmitted yet —
    // so any oscillator from here on is the countdown's callback firing.
    expect(readout()).toBe("Get ready3");
    expect(vi.getTimerCount()).toBe(1);
    expect(osc).toHaveBeenCalledTimes(0);

    // The operator gives up waiting and goes to practise sending instead.
    leaveForKeyTab();

    // Premise: COPY really is gone (not merely cancelled while still mounted).
    expect(screen.getByRole("button", { name: "KEY" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /REVEAL/ })).toBeNull();
    expect(readout()).toBeNull();

    // BITE 1 — the leak itself: the interval did not survive its component.
    // (Measured 0 here with the cleanup, 1 without it.)
    expect(vi.getTimerCount()).toBe(0);

    // 15s is three times the beats the countdown had left.
    act(() => {
      vi.advanceTimersByTime(15000);
    });

    // BITE 2 — the harm: no transmission was ever created for a surface the user
    // left. Proven to fail independently of BITE 1 (see the header note).
    //
    // There is deliberately no trailing getTimerCount() assertion after the
    // advance, on either surface. Measured on COPY: once the orphaned interval
    // fires it clears ITSELF, so the count reads 0 in both worlds and the
    // assertion would be decorative. (On QSO it reads 1 vs 0, but only because
    // the ghost transmission schedules its own cleanup timeout — that is an
    // artifact of the harm BITE 2 already pins, not evidence of the leak.)
    // The leak is pinned where the two worlds actually diverge: BITE 1, above.
    expect(osc).toHaveBeenCalledTimes(0);
  });
});

describe("QSO — leaving the tab mid-countdown transmits nothing afterwards", () => {
  it("plays no ghost DX transmission once QsoSim has unmounted", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    // Wide layout portals the setup controls into the rail (see test memory).
    const rail = screen.getByRole("complementary", { name: "Options" });
    const startBtn = within(rail).getByRole("button", { name: /LISTEN FOR CQ/ });

    const osc = vi.spyOn(window.AudioContext.prototype, "createOscillator");

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(startBtn);
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(readout()).toBe("Get ready3");
    expect(vi.getTimerCount()).toBe(1);
    expect(osc).toHaveBeenCalledTimes(0);

    // The operator walks out of the contact by switching sections.
    leaveForKeyTab();

    expect(screen.getByRole("button", { name: "KEY" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/Receiving — step 1 of \d+/)).toBeNull();
    expect(readout()).toBeNull();

    // BITE 1 — the leak itself.
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(15000);
    });

    // BITE 2 — the harm.
    expect(osc).toHaveBeenCalledTimes(0);
  });
});

describe("control — the instrument reads a real transmission", () => {
  // Vacuity guard for the two zero-counts above: identical setup, but the surface
  // stays mounted, so the countdown MUST run out and transmit. If this ever goes
  // red, the tests above are measuring nothing rather than proving a clean unmount.
  it("a countdown left mounted does transmit when it expires", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const osc = vi.spyOn(window.AudioContext.prototype, "createOscillator");

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /NEW$/ }));
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(readout()).toBe("Get ready3");
    expect(osc).toHaveBeenCalledTimes(0);

    act(() => {
      vi.advanceTimersByTime(15000);
    });

    expect(readout()).toBeNull();
    expect(osc.mock.calls.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /REVEAL/ })).toBeEnabled();
  });
});
