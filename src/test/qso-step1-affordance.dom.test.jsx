// @vitest-environment jsdom
//
// QSO STEP-1 AFFORDANCE + THE KEYBOARD-DEAF BUG (2.4.1)
//
// THE DEFECT THIS FILE EXISTS FOR (pre-existing since at least 2.3.0):
//   At any QSO dx (copy) step on normal/real difficulty the keyer was DEAF to the
//   keyboard. Two correct-in-isolation mechanisms combined into a dead cell:
//     1. the copy <input> auto-focuses on every dx step, and
//     2. the keyer is a WINDOW keydown listener whose inField guard drops any
//        event whose target is an INPUT/TEXTAREA.
//   So SPACEBAR typed a space into the copy field instead of keying, the decode
//   box stayed empty, and break-in (? / AGN / QRS — a real, implemented feature)
//   could not be reached by keyboard at all. It survived because it fails in
//   exactly one quadrant: touch worked (pointer handlers never meet the guard)
//   and easy mode worked (no copy field to focus).
//
// THE FIX has two halves and they are NOT interchangeable:
//   - Behaviour: the two inputs are now mutually exclusive. Arming break-in
//     UNMOUNTS the copy field (swap, not stack) and moves focus onto the key
//     surface, so e.target is a div and the guard passes. The keyer's `enabled`
//     flag is additionally gated on `armed` for dx steps.
//   - Presentation: the key block collapses behind one 44px disclosure, and
//     CONTINUE names its destination ("CONTINUE → YOUR TURN").
//
// HONEST NOTE ON WHICH GUARD CARRIES THE BEHAVIOUR (see the mutation log in
// [KB-2]): because the copy field UNMOUNTS when armed, the `&& !armed` guard on
// the auto-focus effect is defence-in-depth here rather than the load-bearing
// line. Reproducing the original bug takes removing BOTH the swap and the guard.
// That is stated in the test comments rather than claimed as a single-line bite.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";

const BREAK_IN_TRIGGER = /BREAK IN — ASK FOR A REPEAT/;
const ARMED_TRIGGER = /BREAK-IN ARMED — KEYING/;
const COPY_INPUT = /Your copy of what you heard/i;

// Start a contact sitting on step 1 — a dx (copy) step — at `normal` difficulty,
// which is the exact quadrant the bug lived in.
//
// renderApp() clears localStorage, so settings must be seeded on the manual render
// path instead. keyType is seeded rather than clicked because switching key type
// mid-panel remounts the key surface (and would drop the focus this file measures).
async function startDxStep({ keyType = "straight" } = {}) {
  window.localStorage.clear();
  window.localStorage.setItem("wrcw:settings", JSON.stringify({ keyType }));
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  await user.click(screen.getByRole("button", { name: "QSO" }));
  // Wide layout (setup.dom.js matchMedia default) portals the setup controls into
  // the rail, so scope the start button there — a document-wide getAllByRole()[0]
  // does not reliably fire it.
  const rail = screen.getByRole("complementary", { name: "Options" });
  await user.click(within(rail).getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ }));
  return { user };
}

// One real straight-key element from the currently-focused element.
// Fake timers advance performance.now() in this vitest, so the keyer classifies a
// genuine duration: <2u (120ms @20wpm) is a dit, longer is a dah.
function keyElement(target, holdMs) {
  fireEvent.keyDown(target, { key: " ", code: "Space" });
  act(() => { vi.advanceTimersByTime(holdMs); });
  fireEvent.keyUp(target, { key: " ", code: "Space" });
  act(() => { vi.advanceTimersByTime(60); }); // inter-element gap (1u)
}

// Key a whole character as dits/dahs, then let the 2.5u char timer finalize it.
function keyChar(target, pattern) {
  for (const el of pattern) keyElement(target, el === "-" ? 140 : 40);
  act(() => { vi.advanceTimersByTime(200); }); // > 2.5u = 150ms → finalizeChar
}

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// KB — the behaviour fix. These are the tests that had to exist.
// ---------------------------------------------------------------------------
describe("KB — QSO dx step: the keyer can actually hear the keyboard", () => {
  it("[KB-1] COPY mode: the copy field is focused and SPACEBAR types a space, it does not key", async () => {
    const { user } = await startDxStep();

    const input = screen.getByRole("textbox", { name: COPY_INPUT });
    expect(document.activeElement).toBe(input);

    // A real user's spacebar press with the field focused. This is the CORRECT
    // behaviour in COPY mode — the point is that it goes to the field, and that
    // nothing was silently keyed behind the scenes.
    await user.keyboard(" ");
    expect(input).toHaveValue(" ");

    // Open break-in and look at the decode readout: it must be empty. If that
    // space had reached the keyer it would decode as a dit ("E").
    await user.click(screen.getByRole("button", { name: BREAK_IN_TRIGGER }));
    expect(screen.getByTestId("breakin-decode")).toHaveTextContent("");
  });

  it("[KB-2] BREAK-IN mode: a spacebar press from the focused surface reaches the keyer and decodes", async () => {
    const { user } = await startDxStep();

    // Precondition, asserted loudly rather than guarded — if the copy field is
    // not focused here the app is not in the state this test is about.
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: COPY_INPUT }));

    await user.click(screen.getByRole("button", { name: BREAK_IN_TRIGGER }));

    // The copy field is GONE (swap, not stack) — this is what actually stops the
    // auto-focus effect from re-stealing focus into an INPUT.
    expect(screen.queryByRole("textbox", { name: COPY_INPUT })).not.toBeInTheDocument();

    // Focus landed on the key surface, which is where a keyboard user must be.
    const surface = screen.getByRole("button", { name: /Straight key/ });
    expect(document.activeElement).toBe(surface);

    // Key one dit FROM the focused element, exactly as a browser dispatches it.
    vi.useFakeTimers();
    keyChar(document.activeElement, ".");
    vi.useRealTimers();

    // A single dit is "E". Asserting the DECODED OUTPUT — not "a keydown fired".
    expect(screen.getByTestId("breakin-decode")).toHaveTextContent("E");

    // MUTATIONS VERIFIED against this test:
    //   • keyer `enabled`: drop `|| armed` from the dx-step clause → the keyer
    //     never attaches its listener → decode stays empty → RED.
    //   • BreakInPanel's `surfaceRef.current?.focus()` → focus falls to <body>
    //     → the `activeElement` assertion above → RED. (The decode assertion
    //     alone would still pass: body is not an INPUT, so the guard lets it
    //     through. That is why the focus assertion is here as well.)
    //   • The ORIGINAL bug needs BOTH the swap and the `!armed` guard removed —
    //     either one alone keeps focus out of the input. Documented, not claimed
    //     as a single-line bite.
  });

  it("[KB-3] disarming returns focus to the copy field so typing resumes", async () => {
    const { user } = await startDxStep();

    await user.click(screen.getByRole("button", { name: BREAK_IN_TRIGGER }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Straight key/ }));

    await user.click(screen.getByRole("button", { name: /BACK TO COPY/ }));

    const input = screen.getByRole("textbox", { name: COPY_INPUT });
    expect(document.activeElement).toBe(input);
    // And it is a live text field again, not a decoration.
    await user.keyboard("W1AW");
    expect(input).toHaveValue("W1AW");

    // MUTATION VERIFIED: removing `armed` from the auto-focus effect's dep list
    // → the effect never re-runs on disarm → focus stays on the trigger button
    // → the activeElement assertion → RED.
  });

  it("[KB-4] end-to-end: keying ? while armed makes the station repeat", async () => {
    const { user } = await startDxStep();
    await user.click(screen.getByRole("button", { name: BREAK_IN_TRIGGER }));

    vi.useFakeTimers();
    keyChar(document.activeElement, "..--.."); // "?"
    vi.useRealTimers();

    // The sim understood the "?" and answered it — this is the whole feature the
    // blocked door was hiding. The fill message is the assertion rather than the
    // decode box because respond() calls keyer.clear() on a successful fill, so
    // by the time we look the readout has correctly been wiped for the next thought.
    expect(await screen.findByText(/REPEATING/)).toBeInTheDocument();
    expect(screen.getByTestId("breakin-decode")).toHaveTextContent("");
  });

  it("[KB-5] Esc is the symmetric mode toggle from the copy field", async () => {
    const { user } = await startDxStep();

    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: COPY_INPUT }));
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: ARMED_TRIGGER })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Straight key/ }));

    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: BREAK_IN_TRIGGER })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: COPY_INPUT }));
  });
});

// ---------------------------------------------------------------------------
// M1/M2/M3 — the presentation moves.
// ---------------------------------------------------------------------------
describe("M1 — break-in collapses behind one disclosure", () => {
  it("at rest a dx step shows the copy field and NO key block", async () => {
    await startDxStep();

    // The required path is present and prominent.
    expect(screen.getByRole("textbox", { name: COPY_INPUT })).toBeInTheDocument();
    // The repair tool is put away: no key surface, no decode readout, no legend.
    expect(screen.queryByRole("button", { name: /Straight key/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Decoded from your key")).not.toBeInTheDocument();
    expect(screen.queryByText(/repeat the whole transmission/)).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: BREAK_IN_TRIGGER });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("expanding swaps rather than stacks: the copy row collapses to a summary", async () => {
    const { user } = await startDxStep();

    const input = screen.getByRole("textbox", { name: COPY_INPUT });
    await user.type(input, "W1AW 599");

    await user.click(screen.getByRole("button", { name: BREAK_IN_TRIGGER }));

    // Copy block replaced by a one-line summary that carries the typed text, so
    // arming never costs the user their work-in-progress copy.
    expect(screen.queryByRole("textbox", { name: COPY_INPUT })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /YOUR COPY · W1AW 599.*BACK TO COPY/ })).toBeInTheDocument();
    // CHECK COPY / REVEAL / CONTINUE go with it — that is what pays for the key block.
    expect(screen.queryByRole("button", { name: /CHECK COPY/ })).not.toBeInTheDocument();

    // ...and the key block is now present.
    expect(screen.getByRole("button", { name: /Straight key/ })).toBeInTheDocument();
    expect(screen.getByText(/repeat the whole transmission/)).toBeInTheDocument();
  });

  it("an untouched copy summarises as 'not started', never as an empty row", async () => {
    const { user } = await startDxStep();
    await user.click(screen.getByRole("button", { name: BREAK_IN_TRIGGER }));
    expect(screen.getByRole("button", { name: /YOUR COPY · not started/ })).toBeInTheDocument();
  });
});

describe("M2 — CONTINUE names its destination", () => {
  it("the dx-step advance button reads CONTINUE → YOUR TURN on normal difficulty", async () => {
    await startDxStep();
    expect(screen.getByRole("button", { name: "CONTINUE → YOUR TURN" })).toBeInTheDocument();
    // The bare form is gone — that string is what let the user believe this step
    // was where they answer.
    expect(screen.queryByRole("button", { name: "CONTINUE →" })).not.toBeInTheDocument();
  });

  it("easy difficulty gets the same wording", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await user.click(screen.getByRole("button", { name: "QSO" }));
    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(within(rail).getByRole("combobox", { name: "Conditions" }));
    await user.click(within(rail).getByRole("option", { name: /Easy/i }));
    await user.click(within(rail).getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ }));

    expect(screen.getByRole("button", { name: "CONTINUE → YOUR TURN" })).toBeInTheDocument();
  });
});

describe("M3 — the mode is announced and non-colour-coded", () => {
  it("arming and disarming each announce through a live region", async () => {
    const { user } = await startDxStep();

    await user.click(screen.getByRole("button", { name: BREAK_IN_TRIGGER }));
    expect(screen.getByText(/Break-in armed\. Key question mark, or A G N/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /BACK TO COPY/ }));
    expect(screen.getByText("Copy field. Type what you heard.")).toBeInTheDocument();
  });

  it("the armed state changes the WORDS and aria-expanded, not only the colour", async () => {
    const { user } = await startDxStep();

    const collapsed = screen.getByRole("button", { name: BREAK_IN_TRIGGER });
    expect(collapsed).toHaveAttribute("aria-expanded", "false");

    await user.click(collapsed);

    // Same button, different accessible name — a colourblind or screen-reader
    // user gets the state from the text, not from the amber.
    const armed = screen.getByRole("button", { name: ARMED_TRIGGER });
    expect(armed).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("button", { name: BREAK_IN_TRIGGER })).not.toBeInTheDocument();
  });

  it("the disambiguation line states where the answer actually goes", async () => {
    const { user } = await startDxStep();
    await user.click(screen.getByRole("button", { name: BREAK_IN_TRIGGER }));
    expect(
      screen.getByText(/It is not your answer — you answer on the next step\./)
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// C1 — the copy label. "or just answer" instructed users to do the impossible.
// ---------------------------------------------------------------------------
describe("C1 — the copy field label", () => {
  it("prompts for the copy and no longer says 'or just answer'", async () => {
    await startDxStep();
    expect(screen.getByText("Your copy — what did you hear?")).toBeInTheDocument();
    expect(screen.queryByText(/optional/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/just answer/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// HINT — the copyHint is a focus aid, and the grader wants the whole transmission.
//
// THE DEFECT: every copyHint in cw-core.js names the ONE element that matters
// ("the callsign is what matters", "Grab the call", "copy that zone") — ~16 of
// them share the shape. Copy is graded by fidelity edit-distance against the FULL
// transmission. Rendered as unlabelled prose under the step heading the hint read
// as an instruction, so copying exactly what it said scored 20% — PSE AGN with no
// explanation. Travis's ruling: fidelity grading is correct and the hints are
// correct; only their ROLE was invisible. So these tests pin the LABEL and the
// scoring cue, and deliberately do NOT pin hint wording or grading behaviour.
// ---------------------------------------------------------------------------
describe("HINT — the focus aid is marked as guidance, not instruction", () => {
  it("the copyHint carries a 'Listen for' role label, and the hint text is untouched", async () => {
    await startDxStep();

    const label = screen.getByText("Listen for");
    expect(label).toBeInTheDocument();
    // Role label, not decoration: it sits immediately before the hint prose, so a
    // reader meets "what this sentence is for" before the sentence itself.
    const hint = label.nextElementSibling;
    expect(hint).not.toBeNull();
    // The default Ragchew answer-role step 1 hint. Asserting the REAL string means
    // this fails if the hint is silently reworded — which the ruling forbids.
    expect(hint).toHaveTextContent("the callsign is what matters");
  });

  it("the copy field states that the WHOLE transmission is graded", async () => {
    await startDxStep();
    expect(
      screen.getByText("Type everything you heard — the whole transmission is graded.")
    ).toBeInTheDocument();
  });

  it("the scoring cue stands alone on 'real', where the hint is hidden", async () => {
    // real difficulty renders no copyHint (and no 'Listen for' label), so the cue
    // must not back-reference it — a dangling "not just the part above" would be
    // pointing at nothing. This is why the sentence is self-contained.
    window.localStorage.clear();
    window.localStorage.setItem("wrcw:settings", JSON.stringify({ keyType: "straight" }));
    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await user.click(screen.getByRole("button", { name: "QSO" }));
    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(within(rail).getByRole("combobox", { name: "Conditions" }));
    await user.click(within(rail).getByRole("option", { name: /Real life/i }));
    await user.click(within(rail).getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ }));

    expect(screen.queryByText("Listen for")).not.toBeInTheDocument();
    expect(
      screen.getByText("Type everything you heard — the whole transmission is graded.")
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Edge cases from the spec that silently break the mode model.
// ---------------------------------------------------------------------------
describe("break-in mode never survives a step transition", () => {
  it("advancing while armed opens the next step in COPY mode", async () => {
    const { user } = await startDxStep();
    await user.click(screen.getByRole("button", { name: BREAK_IN_TRIGGER }));
    expect(screen.getByRole("button", { name: ARMED_TRIGGER })).toBeInTheDocument();

    // Back to copy so CONTINUE is reachable, then advance to the you-send step.
    await user.click(screen.getByRole("button", { name: /BACK TO COPY/ }));
    await user.click(screen.getByRole("button", { name: "CONTINUE → YOUR TURN" }));

    // Step 2 is a send step — it has no break-in disclosure at all, and the key
    // is unconditionally live there (unchanged behaviour).
    expect(screen.queryByRole("button", { name: ARMED_TRIGGER })).not.toBeInTheDocument();
    expect(screen.getByText(/Your turn — step 2 of/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Straight key/ })).toBeInTheDocument();
  });

  it("abandoning while armed leaves no stale mode behind on the next contact", async () => {
    const { user } = await startDxStep();
    await user.click(screen.getByRole("button", { name: BREAK_IN_TRIGGER }));

    await user.click(screen.getByRole("button", { name: /Abandon this contact/i }));
    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(within(rail).getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ }));

    expect(screen.getByRole("button", { name: BREAK_IN_TRIGGER })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: COPY_INPUT }));
  });
});
