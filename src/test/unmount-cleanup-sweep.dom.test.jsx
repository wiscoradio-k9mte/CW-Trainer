// @vitest-environment jsdom
//
// The unmount-cleanup CLASS, closed — not just the two instances that got carded.
//
// PR #67 pinned useCountdown's own unmount cleanup after finding it was the one
// ghost-audio route nothing guarded (countdown-unmount-cleanup.dom.test.jsx — read
// that file's header first, this one reuses its shape exactly: drive real state,
// unmount by clicking ANOTHER TAB, assert on a CONSEQUENCE — an oscillator/buffer-
// source actually created or actually stopped — never on "a cleanup function ran").
//
// Closing that hole exposed the rest of the class: every OTHER effect in this file
// that starts a timer, an oscillator, a noise generator, or a loop already HAD its
// own unmount cleanup written — but four of them were never proven to bite. Deleting
// any one of the four left the full 897-test suite green (measured 2026-08-21,
// npm test, exit 0 each time):
//
//   1. LearnTab's drill timerRef (wr-cw-trainer.jsx:4610) — nextDrill() schedules
//      playChar() 350ms out. useMorsePlayer lives in the ROOT component and
//      outlives a tab switch, so an uncleared timer keeps speaking characters at
//      an operator who has left LEARN.
//   2/3. Band-noise teardown on COPY (:2162) and QSO (:3262) — two INDEPENDENT
//      effects on two INDEPENDENT components. Leaving a Real-life-conditions tab
//      should silence the noise generator; nothing proved either one does.
//   4. useKeyer's sidetone/loop teardown (:938-948) — its own comment is the spec:
//      "Switching away mid-key must not leave a sidetone ringing or a paddle/bug
//      looping." Two separate harms in one comment, so this file proves both
//      halves independently (a cleanup that clears one but not the other still
//      reds exactly one of the two tests below — see the mutation notes in the
//      branch report).
//
// A class sweep of every OTHER timer/oscillator/noise/loop effect in the file
// (which already has a cleanup + is tested elsewhere, which is cleanup+untested but
// outside this harm class, which has no cleanup at all) is reported in the branch's
// build notes, not repeated here.

import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, within } from "@testing-library/react";
import { renderApp, gotoTab, chooseOption, screen } from "./helpers.jsx";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
  cleanup();
});

const rail = () => screen.getByRole("complementary", { name: "Options" });

// Wraps an AudioContext factory method so each call is captured by NODE, not just
// by count. The noise and sidetone assertions need to know that the SAME node a
// component created is the one that got `.stop()`-ed, not merely that some call to
// the factory happened since — a fresh createBufferSource that never gets stopped
// would still leave the noise audible even while "a stop() happened somewhere" is
// true for an unrelated node.
function spyAudioFactory(methodName) {
  const proto = window.AudioContext.prototype;
  const orig = proto[methodName];
  const nodes = [];
  vi.spyOn(proto, methodName).mockImplementation(function (...args) {
    const node = orig.apply(this, args);
    vi.spyOn(node, "stop");
    nodes.push(node);
    return node;
  });
  return nodes;
}

// ---------------------------------------------------------------------------
// 1. LearnTab timerRef
// ---------------------------------------------------------------------------

describe("LearnTab — leaving mid-drill plays no ghost character afterwards", () => {
  it("does not fire the scheduled playChar() once LearnTab has unmounted", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN"); // LEARN is already the default tab; explicit for clarity

    const osc = vi.spyOn(window.AudioContext.prototype, "createOscillator");

    vi.useFakeTimers();
    act(() => {
      screen.getByRole("button", { name: /START DRILL/ }).click();
    });

    // Premise: nextDrill()'s 350ms timer is genuinely the one pending timer, and
    // nothing has spoken yet.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(vi.getTimerCount()).toBe(1);
    expect(osc).toHaveBeenCalledTimes(0);

    // The operator gives up on this lesson mid-drill and switches to KEY.
    act(() => {
      screen.getByRole("button", { name: "KEY" }).click();
    });

    // Premise: LEARN really is gone (not merely mid-drill-paused while mounted).
    expect(screen.getByRole("button", { name: "KEY" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /START DRILL/ })).toBeNull();

    // BITE 1 — the leak itself: the drill timer did not survive its component.
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // BITE 2 — the harm: no character was ever spoken into a tab the user left.
    expect(osc).toHaveBeenCalledTimes(0);
  });
});

describe("control — a drill left mounted does speak its scheduled character", () => {
  // Vacuity guard for BITE 2 above: same setup, but LEARN stays mounted, so the
  // 350ms timer MUST fire and speak the character. Without this, a broken spy or
  // a ▶ START DRILL that stopped scheduling would make the zero-count above pass
  // for the wrong reason.
  it("plays the character once the drill timer fires, when LEARN stays mounted", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN");

    const osc = vi.spyOn(window.AudioContext.prototype, "createOscillator");

    vi.useFakeTimers();
    act(() => {
      screen.getByRole("button", { name: /START DRILL/ }).click();
    });
    expect(osc).toHaveBeenCalledTimes(0);

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(osc.mock.calls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2/3. Band-noise teardown — COPY and QSO are separate effects, separate proofs.
// ---------------------------------------------------------------------------

describe("COPY — leaving a Real-life tab silences the noise generator", () => {
  it("stops the band-noise source once CopyTrainer has unmounted", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const noiseNodes = spyAudioFactory("createBufferSource");
    await chooseOption(user, "Conditions", "REAL LIFE");

    // Premise: REAL LIFE genuinely started the noise generator, and it has not
    // been stopped yet.
    expect(noiseNodes.length).toBe(1);
    expect(noiseNodes[0].stop).not.toHaveBeenCalled();

    // The operator leaves for KEY with noise still running.
    await user.click(screen.getByRole("button", { name: "KEY" }));
    expect(screen.getByRole("button", { name: "KEY" })).toHaveAttribute("aria-pressed", "true");

    // BITE — the source that was created is the one that gets stopped; nothing
    // else restarts noise on the tab the user left.
    expect(noiseNodes[0].stop).toHaveBeenCalledTimes(1);
    expect(noiseNodes.length).toBe(1);
  });
});

describe("QSO — leaving a Real-life contact silences the noise generator", () => {
  it("stops the band-noise source once QsoSim has unmounted", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    const optionsRail = rail();
    await chooseOption(user, "Conditions", /REAL LIFE/, optionsRail);

    const noiseNodes = spyAudioFactory("createBufferSource");

    // Default Ragchew role is "answer" — LISTEN FOR CQ. start() arms noise with
    // its OWN synchronous player.startNoise() call (:3340) so it's live before the
    // DX "Get ready" countdown even begins — but the mount-time band-noise effect
    // (qso was null) is still registered from before the click, so React tears it
    // down first: with the cleanup INTACT, that stale run's player.stopNoise()
    // stops the node start() just created, and the effect's own body (now qso is
    // truthy) immediately opens a second one, so 2 sources get created for one
    // "arm noise" action (MEASURED 2026-08-21). That churn count is a property of
    // the correct code's shape, not of the invariant this test guards — deleting
    // the cleanup collapses it back to 1 source, which is real and fine. Don't
    // pin the count; pin the node that's actually LIVE once the dust settles,
    // whichever index it lands on.
    await user.click(within(optionsRail).getByRole("button", { name: /LISTEN FOR CQ/ }));

    expect(noiseNodes.length).toBeGreaterThanOrEqual(1);
    const liveNode = noiseNodes[noiseNodes.length - 1];
    expect(liveNode.stop).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "KEY" }));
    expect(screen.getByRole("button", { name: "KEY" })).toHaveAttribute("aria-pressed", "true");

    // BITE — the node actually left running when we navigated away is the one
    // that gets stopped; nothing else restarts noise on the tab we left.
    expect(liveNode.stop).toHaveBeenCalledTimes(1);
  });
});

describe("control — the instrument reads a real noise stop", () => {
  // Vacuity guard for the two "stopped once we left" assertions above: same
  // startNoise() call, but the stop this time comes from the effect's OWN body
  // (Conditions changing away from REAL LIFE) rather than its unmount cleanup —
  // a different code path, proving the spy genuinely observes a real .stop() call
  // and isn't just reporting "not called" by construction.
  it("stops the band-noise source when Conditions changes away from REAL LIFE (no navigation)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const noiseNodes = spyAudioFactory("createBufferSource");
    await chooseOption(user, "Conditions", "REAL LIFE");
    expect(noiseNodes.length).toBe(1);
    expect(noiseNodes[0].stop).not.toHaveBeenCalled();

    await chooseOption(user, "Conditions", "NORMAL");

    expect(noiseNodes[0].stop).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 4. useKeyer sidetone/loop teardown — one comment, two harms, two proofs.
// ---------------------------------------------------------------------------

describe("useKeyer — leaving mid-key silences a ringing sidetone", () => {
  it("stops the held straight-key sidetone once KeyTrainer has unmounted", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const keyRail = rail();
    await user.click(within(keyRail).getByRole("button", { name: "STRAIGHT KEY" }));

    const toneNodes = spyAudioFactory("createOscillator");

    // Press and HOLD the straight key — no keyup. This is "switching away
    // mid-key" literally: the operator's hand is still down when they reach for
    // the mouse to click another tab.
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true }));
    });

    // Premise: exactly one sidetone oscillator is ringing, unstopped.
    expect(toneNodes.length).toBe(1);
    expect(toneNodes[0].stop).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "COPY" }));
    expect(screen.getByRole("button", { name: "COPY" })).toHaveAttribute("aria-pressed", "true");

    // BITE — the tone that was ringing gets silenced; nothing new starts ringing.
    expect(toneNodes[0].stop).toHaveBeenCalledTimes(1);
    expect(toneNodes.length).toBe(1);
  });
});

describe("useKeyer — leaving mid-key stops a looping paddle", () => {
  it("stops the sending loop once KeyTrainer has unmounted (no further elements are keyed)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY"); // default keyType is "paddle" — no switch needed

    vi.useFakeTimers();
    const toneNodes = spyAudioFactory("createOscillator");

    // Hold the dit lever — no keyup. paddleDown() starts sendNext()'s loop, which
    // reschedules itself via loopTimer for as long as the lever stays held.
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "BracketLeft", bubbles: true, cancelable: true }));
    });
    // sendNext()'s first element fires synchronously off the keydown.
    expect(toneNodes.length).toBe(1);

    // Advance far enough for the loop to have cycled again — premise: the loop
    // is genuinely still running, one pending loopTimer, more than one element
    // keyed so far.
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(toneNodes.length).toBeGreaterThan(1);
    expect(vi.getTimerCount()).toBe(1);
    const countBeforeLeaving = toneNodes.length;

    // The operator's hand is still on the paddle when they click away.
    act(() => {
      screen.getByRole("button", { name: "COPY" }).click();
    });
    expect(screen.getByRole("button", { name: "COPY" })).toHaveAttribute("aria-pressed", "true");

    // BITE 1 — the loop's own pending timer did not survive the unmount.
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // BITE 2 — the harm: no further element was ever keyed into a tab the user left.
    expect(toneNodes.length).toBe(countBeforeLeaving);
  });
});
