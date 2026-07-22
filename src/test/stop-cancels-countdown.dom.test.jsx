// @vitest-environment jsdom
//
// ■ STOP during the pre-play "Get ready" countdown.
//
// The defect (measured on `main` by the manager's CDP probe, and reproduced here
// by mutation): both STOP buttons called player.stop() only. Nothing is playing
// during the 5-second countdown, so STOP was a visible no-op — the readout kept
// counting and the transmission fired ~6s after the press. This is the likely seed
// of the long-standing "ghost audio" reports; useCountdown itself was never at
// fault (it self-cancels on restart and cleans up on unmount).
//
// The contract these tests pin: STOP cancels the countdown AND disarms — no
// transmission, and on COPY no target generated either — while leaving the surface
// immediately usable again.
//
// Instruments, all measured rather than reasoned about:
//   * createOscillator call count — the only honest "did a transmission happen"
//     signal, since the Web Audio mock makes no sound.
//   * vi.getTimerCount() — the countdown interval is the ONLY pending timer at
//     the moment of the press (measured: COPY 1, QSO 1 after the first second),
//     so a clean cancel must take it to 0.
//   * the rendered "Get ready" readout, read from its own label's container.
//
// Mutations actually run (all failed by ASSERTION, none by crash):
//   1. onClick={stopAll} → onClick={() => player.stop()} on both surfaces — the
//      exact pre-fix production shape. Both countdown tests red on the readout
//      ("expected 'Get ready3' to be null").
//   2. useCountdown's cancel() → setCountdown(null) only, no clearInterval — the
//      plausible half-fix. Both countdown tests red on getTimerCount (1 vs 0);
//      with that assertion temporarily removed they red on createOscillator
//      (1 vs 0), so the audio assertion bites independently of the timer one.
//   3. stopAll → cancelCountdown() only, no player.stop() — both T2 tests red
//      (the created oscillator is never stopped).

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
// number. Reading the label's parent gives the whole readout as one string, scoped
// to that block — never a document-wide substring match.
const readout = () => screen.queryByText("Get ready")?.parentElement?.textContent ?? null;

describe("COPY — ■ STOP cancels the pre-play countdown", () => {
  it("clears the readout, plays nothing, generates no target, and leaves no timer", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const osc = vi.spyOn(window.AudioContext.prototype, "createOscillator");

    // Fake the clock only around the countdown; fireEvent for the clicks inside
    // that window (userEvent deadlocks under fake timers in this harness).
    vi.useFakeTimers();
    act(() => { fireEvent.click(screen.getByRole("button", { name: /NEW$/ })); });
    act(() => { vi.advanceTimersByTime(2000); });

    // Mid-countdown: the readout is up, the interval is the one pending timer,
    // and — the premise of the whole defect — no audio has started yet, so
    // player.stop() alone has nothing to act on.
    expect(readout()).toBe("Get ready3");
    expect(vi.getTimerCount()).toBe(1);
    expect(osc).toHaveBeenCalledTimes(0);

    act(() => { fireEvent.click(screen.getByRole("button", { name: /STOP/ })); });

    // T1: the readout clears immediately and the interval is gone.
    expect(readout()).toBeNull();
    expect(vi.getTimerCount()).toBe(0); // T4: no orphaned timer

    // T1: nothing plays afterwards. 8s is well past the 5s the countdown had left.
    act(() => { vi.advanceTimersByTime(8000); });
    expect(osc).toHaveBeenCalledTimes(0);
    expect(vi.getTimerCount()).toBe(0);

    // The countdown callback is what generates the target, so a cancelled
    // countdown must leave COPY target-less — REVEAL/REPLAY stay disabled.
    // (This also bites a "cancel after generating" mis-fix.)
    expect(screen.getByRole("button", { name: /REVEAL/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /REPLAY/ })).toBeDisabled();

    // T4: ▶ NEW works immediately — a fresh countdown arms, counts, and fires.
    act(() => { fireEvent.click(screen.getByRole("button", { name: /NEW$/ })); });
    expect(readout()).toBe("Get ready5");
    act(() => { vi.advanceTimersByTime(5000); });
    expect(readout()).toBeNull();
    expect(osc.mock.calls.length).toBeGreaterThan(0); // the transmission really played
    expect(screen.getByRole("button", { name: /REVEAL/ })).toBeEnabled();
  });

  it("STOP during actual playback still stops the audio (T2 — no regression)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const osc = vi.spyOn(window.AudioContext.prototype, "createOscillator");

    vi.useFakeTimers();
    act(() => { fireEvent.click(screen.getByRole("button", { name: /NEW$/ })); });
    act(() => { vi.advanceTimersByTime(5000); }); // countdown expires → playback starts
    expect(readout()).toBeNull();
    const oscDuringPlay = osc.mock.calls.length;
    expect(oscDuringPlay).toBeGreaterThan(0);

    // Every scheduled oscillator gets .stop() called on it by player.stop()'s
    // teardown. Count the stops across the nodes the engine created.
    const stops = osc.mock.results.map((r) => vi.spyOn(r.value, "stop"));
    act(() => { fireEvent.click(screen.getByRole("button", { name: /STOP/ })); });
    expect(stops.filter((s) => s.mock.calls.length > 0).length).toBe(stops.length);

    // ...and STOP mid-playback must not throw away the target the user was copying.
    expect(screen.getByRole("button", { name: /REVEAL/ })).toBeEnabled();
  });
});

describe("QSO DX step — ■ STOP cancels the pre-play countdown", () => {
  it("clears the readout, plays nothing, holds the step, and leaves no timer", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    // Wide layout portals the setup controls into the rail (see test memory).
    const rail = screen.getByRole("complementary", { name: "Options" });
    const startBtn = within(rail).getByRole("button", { name: /LISTEN FOR CQ/ });

    const osc = vi.spyOn(window.AudioContext.prototype, "createOscillator");

    vi.useFakeTimers();
    act(() => { fireEvent.click(startBtn); });
    act(() => { vi.advanceTimersByTime(2000); });

    expect(readout()).toBe("Get ready3");
    expect(vi.getTimerCount()).toBe(1);
    expect(osc).toHaveBeenCalledTimes(0);

    act(() => { fireEvent.click(screen.getByRole("button", { name: /STOP/ })); });

    expect(readout()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    act(() => { vi.advanceTimersByTime(8000); });
    expect(osc).toHaveBeenCalledTimes(0);
    expect(vi.getTimerCount()).toBe(0);

    // T4/T6: cancelling the countdown must NOT move the contact along. The user
    // is still on the receiving step; REPLAY is the affordance that plays it.
    expect(screen.getByText(/Receiving — step 1 of \d+/)).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByRole("button", { name: /REPLAY/ })); });
    expect(osc.mock.calls.length).toBeGreaterThan(0);
  });

  it("STOP during actual playback still stops the audio (T2 — no regression)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    const rail = screen.getByRole("complementary", { name: "Options" });
    const startBtn = within(rail).getByRole("button", { name: /LISTEN FOR CQ/ });
    const osc = vi.spyOn(window.AudioContext.prototype, "createOscillator");

    vi.useFakeTimers();
    act(() => { fireEvent.click(startBtn); });
    act(() => { vi.advanceTimersByTime(5000); }); // countdown expires → DX transmits
    expect(readout()).toBeNull();
    expect(osc.mock.calls.length).toBeGreaterThan(0);

    const stops = osc.mock.results.map((r) => vi.spyOn(r.value, "stop"));
    act(() => { fireEvent.click(screen.getByRole("button", { name: /STOP/ })); });
    expect(stops.filter((s) => s.mock.calls.length > 0).length).toBe(stops.length);

    // The contact is untouched — STOP silences audio, it does not abandon.
    expect(screen.getByText(/Receiving — step 1 of \d+/)).toBeInTheDocument();
  });
});
