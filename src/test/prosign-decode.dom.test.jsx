// @vitest-environment jsdom
//
// The Prosigns drill graded you wrong for following its own instructions.
//
// The KEY guide says "BT, AR, SK, and KN are sent as a single run-together sound
// (no gap between the letters)" and HEAR IT plays them that way. But the live
// decoder had no entry for SK or KN, so a correctly fused prosign came back as
// "■" — a correct send scored 40% PSE AGN, and because a fused prosign consumes
// two target characters while producing one decoded character, the auto-grade
// length trigger (normLen(decoded) >= normLen(target)) could never be satisfied
// either. Both failures are proven gone here on the REAL keyer path.
//
// Every assertion checks produced, rendered output — the decoded readout, the
// score text, and the AT status line — never "an event fired".

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { MORSE, PROSIGN_CODES } from "../cw-core.js";
import { gotoTab, chooseOption } from "./helpers.jsx";

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

// --- Real straight-key keying under fake timers ---------------------------
// Same technique as qso-send-grading: vitest fake timers advance
// performance.now(), which is what the keyer measures, so these dispatches
// produce a genuinely decoded string rather than a poked one.
// u = 1200/keyWpm = 60ms at the default 20 wpm.
const DIT_MS = 40;            // < 2u = 120ms  → dit
const DAH_MS = 140;           // >= 2u         → dah
const ELEM_GAP_MS = 60;       // 1u, inside one character (< 2.5u finalize)
const CHAR_FINALIZE_MS = 170; // pushes total idle past 2.5u = 150ms
const WORD_GAP_MS = 260;      // takes total idle past 6.5u = 390ms → a space

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

// Key one whole-string token the way the guide teaches it: a fused prosign is
// ONE run of elements with no inter-letter gap; anything else is keyed letter by
// letter. This is the operator behaviour under test — key it "correctly" and see
// what the app says.
function keyToken(token) {
  if (PROSIGN_CODES[token]) {
    for (const el of PROSIGN_CODES[token]) keyElement(el);
    act(() => { vi.advanceTimersByTime(CHAR_FINALIZE_MS); });
    return;
  }
  for (const ch of token) {
    for (const el of MORSE[ch]) keyElement(el);
    act(() => { vi.advanceTimersByTime(CHAR_FINALIZE_MS); });
  }
}

function keyTarget(target) {
  const tokens = target.split(" ");
  tokens.forEach((tok, i) => {
    if (i > 0) act(() => { vi.advanceTimersByTime(WORD_GAP_MS); }); // word gap → a space
    keyToken(tok);
  });
}

// drillProsigns draws `4 + floor(random()*2)` items from
// PROSIGNS = ["AR","SK","BK","KN","="]. Feeding it this queue yields the exact
// target from the bug report. The generated target is asserted afterwards, so a
// stub that fails to take fails the test loudly instead of silently drifting.
const PROSIGN_QUEUE = [0.1, 0.05, 0.25, 0.65, 0.9]; // count=4, then AR, SK, KN, =

async function keyTabWithProsignTarget() {
  window.localStorage.clear();
  // Straight key: the Space-bar element path this harness drives. (Default is
  // paddle, whose elements are machine-timed and can't express a fused prosign
  // by hand.)
  window.localStorage.setItem("wrcw:settings", JSON.stringify({ keyType: "straight" }));
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  await gotoTab(user, "KEY");
  await chooseOption(user, /Drill category/, /Prosigns/);

  let i = 0;
  const rnd = vi.spyOn(Math, "random").mockImplementation(() => PROSIGN_QUEUE[i++ % PROSIGN_QUEUE.length]);
  await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));
  rnd.mockRestore();

  // Loud check that the seed took — everything below depends on this target.
  expect(screen.getByText("AR SK KN =")).toBeTruthy();
  return { user, target: "AR SK KN =" };
}

describe("Prosigns drill — keying a fused prosign the taught way now grades correctly", () => {
  it("decodes AR/SK/KN as the letters the target shows, and auto-grades 100%", async () => {
    const { target } = await keyTabWithProsignTarget();
    vi.useFakeTimers();

    keyTarget(target);
    // Let the final character's gap timers run out.
    act(() => { vi.advanceTimersByTime(WORD_GAP_MS); });

    // 1. The decoded readout reproduces the target. Before the fix this read
    //    "+ ■ ■ =". Two readouts exist on screen (target + decoded), so match the
    //    decoded one by asserting BOTH are present rather than a single node.
    expect(screen.getAllByText(target).length).toBe(2);

    // 2. The auto-grade fired on its own — CHECK was never clicked. Before the
    //    fix normLen("+ ■ ■ =") = 7 < 10 so the trigger could not be satisfied.
    const status = screen.getAllByRole("status").map((n) => n.textContent).join(" | ");
    expect(status).toContain("100% — SOLID COPY");

    // 3. And the visible score agrees with it.
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText("SOLID COPY")).toBeTruthy();
  });

  it("an actually-wrong prosign send still scores below 100%", async () => {
    // The fix must not turn the decoder into a rubber stamp: send AR where SK
    // belongs and the grade has to notice.
    const { } = await keyTabWithProsignTarget();
    vi.useFakeTimers();

    keyTarget("AR AR KN =");   // second token wrong
    act(() => { vi.advanceTimersByTime(WORD_GAP_MS); });

    expect(screen.getAllByText("AR AR KN =").length).toBe(1); // decoded readout only
    const status = screen.getAllByRole("status").map((n) => n.textContent).join(" | ");
    expect(status).toContain("80%");
    expect(status).not.toContain("100%");
  });
});
