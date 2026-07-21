// @vitest-environment jsdom
//
// F5 — a blank profile field must never become a credited required element.
//
// Settings is deliberately free-form (the operator can clear Name or Callsign),
// and the QSO send steps build `mustContain` straight from the profile. Before
// the fix, a cleared field produced an empty required token that the substring
// matcher credited unconditionally (`"".includes("")` is true in JS) — so the
// operator saw a blank, always-ticked ✓ row and a score they had not earned.
//
// These drive the REAL surface: the operator clears the field in Settings, then
// runs a contact, and we assert the RENDERED score text and the RENDERED ✓/✗
// checklist rows — not that a function was called.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, within, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { MORSE } from "../cw-core.js";
import { gotoTab, chooseOption } from "./helpers.jsx";

// Real straight-key keying under fake timers (vitest fake timers advance
// performance.now(), which is exactly what the keyer measures). u = 60ms at the
// default 20 wpm: held < 2u is a dit, >= 2u a dah; a char finalises after 2.5u.
function keyText(text) {
  for (const ch of text) {
    for (const el of MORSE[ch]) {
      act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true })); });
      act(() => { vi.advanceTimersByTime(el === "-" ? 140 : 40); });
      act(() => { window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", bubbles: true, cancelable: true })); });
      act(() => { vi.advanceTimersByTime(60); });
    }
    act(() => { vi.advanceTimersByTime(170); });   // finalise this character
  }
}

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
  cleanup();
});

// Render past the splash, then clear one Settings field through the real input.
// The Settings inputs carry no accessible name (a pre-existing gap, out of scope
// here), so they are located by their current displayed value.
async function appWithClearedField(currentValue) {
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const input = screen.getByDisplayValue(currentValue);
  await user.clear(input);
  // Loud check that the clear really took — a silently-unchanged input would
  // make every assertion below vacuous.
  expect(screen.queryByDisplayValue(currentValue)).not.toBeInTheDocument();
  // Close Settings by toggling the gear again (the ✕ Done button only renders on
  // the wide portal). Assert it really closed so the QSO drive isn't obstructed.
  await user.click(screen.getByRole("button", { name: "Settings" }));
  expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-expanded", "false");
  return { user };
}

// Ragchew / answer in EASY: dx(0) → you(1) → dx(2) → you(3) → dx(4).
// Step 1 requires [myCall]; step 3 requires [myRst, myName].
async function startRagchewAnswer(user) {
  await gotoTab(user, "QSO");
  const rail = screen.getByRole("complementary", { name: "Options" });
  await chooseOption(user, "Conditions", /EASY/, rail);
  await user.click(within(rail).getByRole("button", { name: /LISTEN FOR CQ/ }));
  await user.click(screen.getByRole("button", { name: /CONTINUE →/ }));
}

// The ✓/✗ rows live in one monospace div; every row is a direct child span.
// Reading the container back is how we prove no BLANK row was rendered.
function checklistRows() {
  const anyRow = screen.getAllByText(/^[✓✗] /);
  const container = anyRow[0].parentElement;
  return Array.from(container.children).map((el) => el.textContent);
}

describe("F5 — cleared Settings field never becomes a credited required element", () => {
  it("a cleared NAME leaves one real requirement — an unsent RST scores 0%, not 50%", async () => {
    // MUTATION verified: unwrap `mustContain: required(myRst, myName)` in
    // buildRagchew back to `[myRst, myName]` → the empty name is credited again,
    // the score renders 50% and a blank "✓ " row appears → both assertions red.
    const { user } = await appWithClearedField("PAT");
    await startRagchewAnswer(user);

    // Step 1 (requires the callsign) — nothing keyed, so it grades 0. Move on.
    await user.click(screen.getByRole("button", { name: /CHECK TRANSMISSION/ }));
    await user.click(screen.getByRole("button", { name: /TRANSMIT →/ }));
    await user.click(screen.getByRole("button", { name: /CONTINUE →/ }));

    // Step 3 is the reported step: [myRst, myName] with the name cleared.
    await user.click(screen.getByRole("button", { name: /CHECK TRANSMISSION/ }));

    // Nothing was keyed, so the one real requirement (the RST) is genuinely missed.
    expect(screen.getByText(/Send: 0% — PSE AGN/)).toBeInTheDocument();
    // Exactly one row, and it is the RST — no blank, always-ticked row beside it.
    expect(checklistRows()).toEqual(["✗ 599"]);
  });

  it("a cleared NAME still allows a genuine 100% for sending what IS asked", async () => {
    // The other half of the contract: filtering the blank must not create a false
    // negative. With the name gone, the RST alone IS the whole requirement — and
    // the operator must still be able to reach 100 by actually keying it.
    const { user } = await appWithClearedField("PAT");
    await startRagchewAnswer(user);
    await user.click(screen.getByRole("button", { name: /CHECK TRANSMISSION/ }));
    await user.click(screen.getByRole("button", { name: /TRANSMIT →/ }));
    await user.click(screen.getByRole("button", { name: /CONTINUE →/ }));
    const sk = screen.queryByRole("button", { name: "STRAIGHT KEY" });
    if (sk) await user.click(sk);

    // Key a real 599 on the straight key and let the idle-pause timer grade it.
    vi.useFakeTimers();
    keyText("599");
    act(() => { vi.advanceTimersByTime(3000); });
    await act(async () => {});

    expect(screen.getByText(/Send: 100% — SOLID COPY/)).toBeInTheDocument();
    expect(checklistRows()).toEqual(["✓ 599"]);
  });

  it("a cleared CALLSIGN renders a stated NOT SCORED state, never a 100% for sending nothing", async () => {
    // T4. With no callsign the ANSWER step's required list is empty. Before the
    // fix it was [""] and the empty token was credited: 100% — SOLID COPY for an
    // over that contained nothing at all. A flat 0% would be just as dishonest
    // (unreachable), so the step degrades to an explicitly non-scored state.
    //
    // MUTATION verified: restore gradeSend's empty-list branch to `: 0` → the
    // "NOT SCORED" assertion goes red (a 0% Score renders instead).
    const { user } = await appWithClearedField("W1AW");
    await startRagchewAnswer(user);
    await user.click(screen.getByRole("button", { name: /CHECK TRANSMISSION/ }));

    expect(
      screen.getByText(/NOT SCORED — this step has no required elements/)
    ).toBeInTheDocument();
    expect(screen.queryByText("SOLID COPY")).not.toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    // No checklist rows at all — and specifically no blank one.
    expect(screen.queryByText(/^[✓✗] /)).not.toBeInTheDocument();
    // The contact is not stuck: TRANSMIT still advances it by hand.
    expect(screen.getByRole("button", { name: /TRANSMIT →/ })).toBeInTheDocument();
  });
});
