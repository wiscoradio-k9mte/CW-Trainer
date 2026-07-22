// @vitest-environment jsdom
//
// Accessible-names batch — four controls whose visible caption was a styled <div>
// standing in for real semantics, so assistive tech announced state or nothing at
// all where it should have announced purpose.
//
//   1. QSO copy input  — visible caption vs a parallel aria-label that did not
//      contain it (WCAG 2.5.3 label-in-name, failure technique F96).
//   2. RX filter group — three aria-pressed buttons with an unassociated caption
//      (WCAG 1.3.1: the grouping relationship existed visually only).
//   3. Cut-numbers toggle — the accessible name was the button's own STATE
//      ("599 OFF"), never its purpose (WCAG 1.3.1).
//   4. Settings section captions — styled like headings but not headings, so the
//      panel could not be navigated by heading (WCAG 1.3.1, and 2.4.10 at AAA).
//
// The layout assertions matter as much as the ARIA ones: <label> and <h2> carry UA
// default styles (inline display; bold weight and em-relative block margins) that
// silently reflow a <div>-shaped caption. Each replacement neutralises those
// explicitly, and each neutralisation is pinned below so a future tidy-up that
// drops one fails here rather than in a screenshot nobody takes.

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderApp, gotoTab } from "./helpers.jsx";

// The QSO copy input's visible caption, verbatim. Used for BOTH the visible-text
// assertion and the accessible-name lookup — if those two ever need different
// strings, that IS the 2.5.3 defect this batch fixed.
const QSO_COPY_CAPTION = "Your copy (optional — check it or just answer)";

const openSettings = (user) => user.click(screen.getByRole("button", { name: "Settings" }));

// ---------------------------------------------------------------------------
// 1. QSO copy input
// ---------------------------------------------------------------------------
describe("QSO copy input — label in name", () => {
  async function startDxCopyStep(user) {
    await gotoTab(user, "QSO");
    // Default Ragchew + "Answer a CQ" + NORMAL: step 0 is a DX step, which renders
    // the copy input immediately (EASY would show CONTINUE instead).
    await user.click(screen.getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ }));
  }

  it("the accessible name IS the visible caption, with no parallel aria-label", async () => {
    const { user } = await renderApp();
    await startDxCopyStep(user);

    const input = await screen.findByRole("textbox", { name: QSO_COPY_CAPTION });
    expect(input.tagName).toBe("INPUT");

    // Walk the association back to the element supplying the name and check the
    // text a sighted user reads is that same string.
    const labelEl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    expect(labelEl).not.toBeNull();
    expect(labelEl.textContent).toBe(QSO_COPY_CAPTION);

    // The old defect in one assertion: an aria-label here overrides the label and
    // becomes the accessible name, and nothing then keeps it in step with the
    // caption. Its absence is what makes the two strings provably identical.
    expect(input.getAttribute("aria-label")).toBeNull();
  });

  it("clicking the caption focuses the input (a real label, not an aria-label)", async () => {
    const { user } = await renderApp();
    await startDxCopyStep(user);

    const input = await screen.findByRole("textbox", { name: QSO_COPY_CAPTION });
    const labelEl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    expect(labelEl).not.toBeNull();
    input.blur();
    await user.click(labelEl);
    expect(document.activeElement).toBe(input);
  });

  it("the caption still renders as a block, so the field layout is unchanged", async () => {
    const { user } = await renderApp();
    await startDxCopyStep(user);

    const input = await screen.findByRole("textbox", { name: QSO_COPY_CAPTION });
    const labelEl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    expect(labelEl).not.toBeNull();
    // <label> is display:inline by default, and vertical margins do not apply to
    // inline boxes — so without the explicit block the caption loses its 6px bottom
    // margin and its box shrinks to fit the text.
    expect(window.getComputedStyle(labelEl).display).toBe("block");
    expect(window.getComputedStyle(labelEl).marginBottom).toBe("6px");
  });
});

// ---------------------------------------------------------------------------
// 2. RX filter group
// ---------------------------------------------------------------------------
describe("RX filter — the three buttons are a named group", () => {
  it("is a group whose accessible name is its visible caption", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const group = screen.getByRole("group", { name: "RX filter (band noise voicing)" });
    // The name must come from the caption the user can see, not a duplicate string.
    const labelledBy = group.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy).textContent).toBe("RX filter (band noise voicing)");
  });

  it("contains exactly the three filter buttons, still aria-pressed toggles", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const group = screen.getByRole("group", { name: "RX filter (band noise voicing)" });
    const buttons = [...group.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["WIDE", "CW 500", "APF"]);
    // State stays on aria-pressed — it was never moved into the names. CW 500 is the
    // shipped default (DEFAULTS.rxFilter === "cw").
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([null, null, null]);
  });
});

// ---------------------------------------------------------------------------
// 3. Cut-numbers toggle
// ---------------------------------------------------------------------------
describe("Cut numbers toggle — the name says what it does", () => {
  // Purpose first, then the button's own visible text. Both halves are load-bearing:
  // the caption is the fix (AT used to hear only the state); the trailing visible
  // text is what keeps the control reachable by speech input under WCAG 2.5.3.
  const NAME_OFF = "Cut numbers (contest style) 599 OFF";
  const NAME_ON = "Cut numbers (contest style) 5NN ON";

  it("names the purpose and contains the visible text, in both states", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const btn = screen.getByRole("button", { name: NAME_OFF, pressed: false });
    expect(btn.textContent).toBe("599 OFF");
    // The visible text is inside the accessible name — the label-in-name requirement.
    expect(NAME_OFF).toContain(btn.textContent);

    await user.click(btn);
    const onBtn = screen.getByRole("button", { name: NAME_ON, pressed: true });
    expect(onBtn).toBe(btn);
    expect(NAME_ON).toContain(btn.textContent);
  });

  it("the state is carried by aria-pressed, not only by the name", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const btn = screen.getByRole("button", { name: NAME_OFF });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    await user.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("the 599 → 5NN gloss is announced as the button's description", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const btn = screen.getByRole("button", { name: NAME_OFF });
    const describedBy = btn.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy).textContent.trim())
      .toBe("599 → 5NN, 0 → T in QSO exchanges");
  });
});

// ---------------------------------------------------------------------------
// 4. Settings section headings
// ---------------------------------------------------------------------------
describe("Settings section captions are real headings", () => {
  const SECTIONS = ["LISTENING SPEED", "SENDING SPEED", "Your station"];

  it("all three sections are level-2 headings a screen reader can jump between", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const found = SECTIONS.map((name) => screen.getByRole("heading", { name, level: 2 }));
    expect(found.map((h) => h.tagName)).toEqual(["H2", "H2", "H2"]);
    expect(new Set(found).size).toBe(3);
    // Document order matches the visual order, so heading navigation walks the
    // panel top to bottom.
    expect(found[0].compareDocumentPosition(found[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(found[1].compareDocumentPosition(found[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the headings render with the same box the <div> captions had", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    // Each expected margin is the one the <div> carried before the swap; the UA
    // heading defaults (bold, 1.5em, 0.83em block margins) would override all of
    // these if S.head stopped neutralising them.
    const expected = {
      "LISTENING SPEED": { marginTop: "0px", marginBottom: "6px" },
      "SENDING SPEED": { marginTop: "0px", marginBottom: "6px" },
      "Your station": { marginTop: "4px", marginBottom: "8px" },
    };
    for (const name of SECTIONS) {
      const h = screen.getByRole("heading", { name, level: 2 });
      const cs = window.getComputedStyle(h);
      expect(cs.fontWeight).toBe("400");
      expect(cs.fontSize).toBe("0.6875rem");
      expect(cs.marginLeft).toBe("0px");
      expect(cs.marginRight).toBe("0px");
      expect(cs.marginTop).toBe(expected[name].marginTop);
      expect(cs.marginBottom).toBe(expected[name].marginBottom);
    }
    // "Your station" keeps its amber accent — the heading swap must not have
    // dropped the per-caption override that follows the S.head spread.
    expect(window.getComputedStyle(screen.getByRole("heading", { name: "Your station" })).color)
      .toBe("rgb(242, 169, 59)");
  });
});
