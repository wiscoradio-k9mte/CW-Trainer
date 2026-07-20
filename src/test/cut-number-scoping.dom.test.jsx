// @vitest-environment jsdom
//
// Cut-number scoping, end-to-end through the real grading path.
//
// 2.4.0 applied the cut-number equivalence (N→9, T→0) to any [0-9NT] run in the
// string, on every fidelity path, unconditionally — so a callsign's letters were
// rewritten on BOTH sides of the comparison and a WRONG callsign copy scored
// 100% SOLID COPY. Cut numbers belong to the number slots of a QSO exchange;
// they are never used inside a callsign on the air.
//
// The unit tests in cw-core.test.js pin the rule. THESE tests pin the WIRING —
// that the callsign rungs actually pass {cut:false} — which a pure-function test
// cannot see. Both drive the real UI and assert the rendered score.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { MORSE } from "../cw-core.js";
import { gotoTab, chooseOption } from "./helpers.jsx";

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

// randCall() consumes Math.random in this order: suffix length (index into
// [1,2,2,2,3,3]), then one value per suffix letter (index into A–Z), then the
// prefix (index into US_PREFIXES). This queue yields "N8NT" — deliberately a
// callsign made ENTIRELY of cut-number material, the one shape the whole-token
// rule alone cannot tell from an exchange number. Only the rung scoping saves it.
const N8NT_QUEUE = [
  0.35, // suffixLen → index 2 → 2 letters
  0.51, // 'N'
  0.74, // 'T'
  0.18, // prefix index 2 → "N8"
];

// COPY's "▶ NEW" runs a 5-second listen countdown BEFORE it generates the target,
// so the target only exists once that interval has run out. Advance it on fake
// timers, then hand the clock back for the typing that follows.
// COPY's "▶ NEW" runs a 5-second listen countdown and only generates the target
// when it expires. The countdown interval is created by the click itself, so
// swapping to fake timers afterwards can't drive it (the interval is already a
// real one) and installing fake timers beforehand deadlocks userEvent. So this
// waits the real five seconds — the honest cost of driving the real flow.
//
// COPY also hides the target until it is revealed, so REVEAL is how the test
// reads back what was actually generated (before CHECK the reveal panel renders
// the plain string; after CHECK it becomes a per-character CharDiff).
async function newCopyTarget(user) {
  await user.click(screen.getByRole("button", { name: /NEW$/ }));
  await act(() => new Promise((r) => setTimeout(r, 5300)));
  await user.click(screen.getByRole("button", { name: /REVEAL/ }));
}

describe("COPY callsign rung — a cut-digit mis-copy is not a perfect copy", () => {
  it("typing 9890 for the callsign N8NT scores 36%, not 100%", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "COPY");
    await user.click(screen.getByRole("button", { name: /Callsigns/ }));

    // The rung draws three calls; the cycling queue makes all three "N8NT".
    let i = 0;
    const rnd = vi.spyOn(Math, "random").mockImplementation(() => N8NT_QUEUE[i++ % N8NT_QUEUE.length]);
    await newCopyTarget(user);
    rnd.mockRestore();
    expect(screen.getByText("N8NT N8NT N8NT")).toBeTruthy(); // the seed took

    await user.type(screen.getByRole("textbox", { name: "Your copy" }), "9890 9890 9890");
    await user.click(screen.getByRole("button", { name: "CHECK" }));

    // Only each call's "8" and the two spaces survive: 5 of 14 characters.
    const status = screen.getAllByRole("status").map((n) => n.textContent).join(" | ");
    expect(status).toContain("36% — PSE AGN");
    expect(status).not.toContain("100%");
    expect(screen.getByText("5 of 14 characters correct")).toBeTruthy();
  });

  it("the exchange rungs keep their cut tolerance — 5NN copied as 599 is 100%", async () => {
    // The other side of the same switch: the fix must not overshoot into a false
    // negative on the rung where cut numbers are the point. QSO phrases carry a
    // literal "UR 5NN 5NN BK".
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "COPY");
    await user.click(screen.getByRole("button", { name: /QSO phrases/ }));

    // QSO_PHRASES[1] is "UR 5NN 5NN BK"; rand() indexes it at 1/20.
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0.06);
    await newCopyTarget(user);
    rnd.mockRestore();
    expect(screen.getByText("UR 5NN 5NN BK")).toBeTruthy();

    await user.type(screen.getByRole("textbox", { name: "Your copy" }), "UR 599 599 BK");
    await user.click(screen.getByRole("button", { name: "CHECK" }));

    const status = screen.getAllByRole("status").map((n) => n.textContent).join(" | ");
    expect(status).toContain("100% — SOLID COPY");
    // The visible score agrees. (The CharDiff below it still marks the N/9
    // characters as different — it is a literal character-by-character view and
    // has never applied the cut equivalence. Pre-existing, out of scope here.)
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
  });
});

// --- KEY: same rule on the keyed path ------------------------------------
const DIT_MS = 40, DAH_MS = 140, ELEM_GAP_MS = 60, CHAR_FINALIZE_MS = 170;

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

function keyString(s) {
  for (const ch of s) {
    for (const el of MORSE[ch]) keyElement(el);
    act(() => { vi.advanceTimersByTime(CHAR_FINALIZE_MS); });
  }
}

describe("KEY callsign drill — keying cut digits into a callsign is an error", () => {
  it("keying 9890 for the target N8NT scores 25%, not 100%", async () => {
    window.localStorage.clear();
    window.localStorage.setItem("wrcw:settings", JSON.stringify({ keyType: "straight" }));
    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "KEY");
    await chooseOption(user, /Drill category/, /Callsigns/);

    // drillCallsign draws the call COUNT first (index into [1,1,2,2,3]); 0.0
    // gives one call, then the randCall queue gives "N8NT".
    const queue = [0.0, ...N8NT_QUEUE];
    let i = 0;
    const rnd = vi.spyOn(Math, "random").mockImplementation(() => queue[Math.min(i++, queue.length - 1)]);
    await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));
    rnd.mockRestore();
    expect(screen.getByText("N8NT")).toBeTruthy();

    vi.useFakeTimers();
    keyString("9890");
    act(() => { vi.advanceTimersByTime(400) }); // let the gap timers run out

    const status = screen.getAllByRole("status").map((n) => n.textContent).join(" | ");
    expect(status).toContain("25%");
    expect(status).not.toContain("100%");
  });
});
