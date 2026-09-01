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
//      ("599 OFF"), never its purpose (WCAG 1.3.1); the follow-up fix made the
//      name STABLE across both states (fix/cut-numbers-state-free-label).
//   4. Settings section captions — styled like headings but not headings, so the
//      panel could not be navigated by heading (WCAG 1.3.1, and 2.4.10 at AAA).
//   5/6. QSO AUTO / SPLIT toggles — the identical cut-numbers defect (card
//      "…zg3EJlQ", 2026-08-31): the name WAS "AUTO ON"/"AUTO OFF" and
//      "SPLIT ON"/"SPLIT OFF", so it changed on click. Fixed with the same
//      pattern: aria-labelledby → the caption alone, aria-pressed carries state,
//      visible text unchanged (enhancement/toggle-stable-names).
//
// The layout assertions matter as much as the ARIA ones: <label> and <h2> carry UA
// default styles (inline display; bold weight and em-relative block margins) that
// silently reflow a <div>-shaped caption. Each replacement neutralises those
// explicitly, and the neutralisations that jsdom can see are pinned below.
//
// COVERAGE LIMIT, measured not assumed. jsdom implements only PART of the UA heading
// sheet: `h2 { font-weight: bold }` and `font-size: 1.5em` apply, but the block
// margins do NOT (a bare <h2> in jsdom computes margin-top "0"; the spec's suggested
// rendering states them as the logical `margin-block-*`, which jsdom's cascade does
// not map to margin-top/bottom). So the `fontWeight: 400` in S.head IS mutation-proven
// here, and the margin zeroing is NOT: stripping it leaves this file green. Real
// Chrome disagrees — the same strip, measured on the built app, adds 9.13px of
// margin-top to each heading (0.83em of an 11px caption) and grows the narrow
// Settings page from 2017px to 2026px. The margin assertions below are kept as a
// documented pin of intent; the evidence that they matter is the headed run.

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
// The REAL ARIA accname algorithm — the same one getByRole's `name` matcher runs
// under the hood (see @testing-library/dom's queries/role.js). Used below (LOW-2)
// to prove WCAG 2.5.3 as a computed RELATIONSHIP between the name and the visible
// text, not as two independently-hardcoded string literals that happen to agree.
import { computeAccessibleName } from "dom-accessibility-api";
import { renderApp, gotoTab, chooseOption } from "./helpers.jsx";

// The QSO copy input's visible caption, verbatim. Used for BOTH the visible-text
// assertion and the accessible-name lookup — if those two ever need different
// strings, that IS the 2.5.3 defect this batch fixed.
const QSO_COPY_CAPTION = "Your copy — what did you hear?";

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
    // inline boxes — so without the explicit block the caption loses its bottom
    // margin and its box shrinks to fit the text.
    //
    // The margin is 2px, not the 6px this branch pinned against main: composing
    // with fix/qso-step1-keyboard-and-affordance put a scoring sub-line between
    // the caption and the input, and that line now owns the 6px gap down to the
    // field. The invariant is unchanged — the <label> keeps the geometry the
    // <div> it replaced had — only the caption's neighbour moved.
    expect(window.getComputedStyle(labelEl).display).toBe("block");
    expect(window.getComputedStyle(labelEl).marginBottom).toBe("2px");
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
describe("Cut numbers toggle — the name is stable, the state is not in it", () => {
  // The accessible name is the caption alone, and per the APG toggle-button/switch
  // patterns ("the label on a toggle does not change when its state changes") it must
  // be IDENTICAL off and on — that is the defect this test suite now guards.
  const NAME = "Cut numbers (contest style)";

  it("the accessible name is the SAME string off and on", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const offBtn = screen.getByRole("button", { name: NAME, pressed: false });
    await user.click(offBtn);
    const onBtn = screen.getByRole("button", { name: NAME, pressed: true });
    // Same element, same computed name — a query for the OFF-state name still finds
    // it after the click, which is only possible if the name never changed.
    expect(onBtn).toBe(offBtn);
  });

  it("aria-pressed still flips on click", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const btn = screen.getByRole("button", { name: NAME });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    await user.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("the current value is still rendered VISIBLY, in both states", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const btn = screen.getByRole("button", { name: NAME });
    // A stable accessible name must not make the control mute for sighted users —
    // the literal value that will be sent still has to be on screen.
    expect(btn.textContent).toBe("CUT NUMBERS 599");
    await user.click(btn);
    expect(btn.textContent).toBe("CUT NUMBERS 5NN");
  });

  it("the value display does not leak into the accessible name", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const btn = screen.getByRole("button", { name: NAME });
    await user.click(btn);
    // "5NN" is on screen (previous test) but must not have joined the computed name —
    // that would silently reintroduce the state-in-name defect via a back door.
    expect(screen.getByRole("button", { name: NAME })).toBe(btn);
    expect(screen.queryByRole("button", { name: /5NN/ })).toBeNull();
  });

  it("the 599 → 5NN gloss is announced as the button's description", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const btn = screen.getByRole("button", { name: NAME });
    const describedBy = btn.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy).textContent.trim())
      .toBe("599 → 5NN, 0 → T in QSO exchanges");
  });
});

// ---------------------------------------------------------------------------
// 5. QSO AUTO toggle
// ---------------------------------------------------------------------------
describe("QSO auto-advance toggle — the name is stable, the state is not in it", () => {
  const NAME = "Auto-advance on a perfect over";
  const GLOSS = "When you score 100% on an over, automatically continue after a few seconds — no click needed.";

  it("the accessible name is the SAME string off and on", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    const offBtn = screen.getByRole("button", { name: NAME, pressed: false });
    await user.click(offBtn);
    const onBtn = screen.getByRole("button", { name: NAME, pressed: true });
    // Same element, same computed name — only possible if the name never changed.
    expect(onBtn).toBe(offBtn);
  });

  it("aria-pressed still flips on click", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    const btn = screen.getByRole("button", { name: NAME });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    await user.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("the visible text is byte-identical to the pre-fix ON/OFF string, in both states", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    const btn = screen.getByRole("button", { name: NAME });
    // Before this fix the button's own textContent WAS its accessible name
    // ("AUTO OFF"/"AUTO ON"). The fix moves the state word behind aria-hidden but
    // must not change a single rendered character — that's what keeps the phone-gate
    // geometry from PR #70's era untouched.
    expect(btn.textContent).toBe("AUTO OFF");
    await user.click(btn);
    expect(btn.textContent).toBe("AUTO ON");
  });

  it("the ON/OFF word does not leak into the accessible name", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    const btn = screen.getByRole("button", { name: NAME });
    await user.click(btn);
    expect(screen.getByRole("button", { name: NAME })).toBe(btn);
    expect(screen.queryByRole("button", { name: /AUTO ON/ })).toBeNull();
  });

  // MED-1: mirrors the cut-numbers "gloss is announced as the description" cell —
  // the missing 5th cut-numbers-parity cell, and the LIVE survivor the gate found:
  // dropping aria-describedby from BOTH toggles, or swapping the two glosses
  // (SPLIT announcing AUTO's text and vice versa), both shipped at 912 green
  // without this. Two independent checks: the role query itself filtered by
  // `description` (proves getByRole's own accdescription resolution agrees), and
  // the raw DOM walk (proves it's THIS toggle's own gloss, not a coincidence of
  // two toggles sharing identical description text).
  it("the gloss is announced as the button's description", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    const btn = screen.getByRole("button", { name: NAME, description: GLOSS });
    expect(btn).toBe(screen.getByRole("button", { name: NAME }));
    expect(document.getElementById(btn.getAttribute("aria-describedby")).textContent.trim()).toBe(GLOSS);
  });

  // LOW-1: pins the aria-hidden ATTRIBUTE on the state span. Limit stated plainly
  // (same shape as the RX-filter aria-label-null pin above): this does NOT prove
  // AT reading order or that a screen reader actually skips it — jsdom has no AT,
  // only a DOM. It proves the attribute a real AT would honor is present.
  it("the ON/OFF value span is marked aria-hidden", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    const btn = screen.getByRole("button", { name: NAME });
    const span = btn.querySelector("span");
    expect(span).not.toBeNull();
    expect(span.getAttribute("aria-hidden")).toBe("true");
  });

  // LOW-2: WCAG 2.5.3 as a RELATIONSHIP, not two string literals that happen to
  // agree. `NAME` above and the button's own visible prefix are independently
  // typed constants — renaming the caption and updating NAME in lockstep would
  // leave this file green even if the real computed name no longer contained the
  // visible text. Running the actual accname algorithm (computeAccessibleName,
  // the same one getByRole uses) against the button's own rendered first child
  // closes that: it fails if the two ever drift apart for real.
  it("the computed accessible name genuinely contains the visible prefix (2.5.3, not by coincidence)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    const btn = screen.getByRole("button", { name: NAME });
    expect(computeAccessibleName(btn).toLowerCase()).toContain(btn.firstChild.textContent.trim().toLowerCase());
  });
});

// ---------------------------------------------------------------------------
// 6. QSO SPLIT toggle (dx / hunt only)
// ---------------------------------------------------------------------------
describe("QSO split toggle — the name is stable, the state is not in it", () => {
  const NAME = "Split (UP)";
  const GLOSS = 'DX CQ includes a QSX directive — practice copying "UP 5 TO 10".';

  async function showSplitToggle(user) {
    await gotoTab(user, "QSO");
    // Split only renders for activity=dx, role=hunt. Picking "Work DX" auto-resets
    // Role to its last term, "Hunt the DX" — exactly the role that shows Split.
    await chooseOption(user, "Activity", /Work DX/);
  }

  it("the accessible name is the SAME string off and on", async () => {
    const { user } = await renderApp();
    await showSplitToggle(user);

    const offBtn = screen.getByRole("button", { name: NAME, pressed: false });
    await user.click(offBtn);
    const onBtn = screen.getByRole("button", { name: NAME, pressed: true });
    expect(onBtn).toBe(offBtn);
  });

  it("aria-pressed still flips on click", async () => {
    const { user } = await renderApp();
    await showSplitToggle(user);

    const btn = screen.getByRole("button", { name: NAME });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    await user.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("the visible text is byte-identical to the pre-fix ON/OFF string, in both states", async () => {
    const { user } = await renderApp();
    await showSplitToggle(user);

    const btn = screen.getByRole("button", { name: NAME });
    expect(btn.textContent).toBe("SPLIT OFF");
    await user.click(btn);
    expect(btn.textContent).toBe("SPLIT ON");
  });

  it("the ON/OFF word does not leak into the accessible name", async () => {
    const { user } = await renderApp();
    await showSplitToggle(user);

    const btn = screen.getByRole("button", { name: NAME });
    await user.click(btn);
    expect(screen.getByRole("button", { name: NAME })).toBe(btn);
    expect(screen.queryByRole("button", { name: /SPLIT ON/ })).toBeNull();
  });

  // MED-1 — see the matching AUTO test above for the full rationale. This is the
  // half of the live survivor that catches a TARGET SWAP (SPLIT announcing AUTO's
  // gloss text) — the AUTO cell alone can't, since a swap still leaves AUTO's own
  // describedby resolving to AUTO's own gloss.
  it("the gloss is announced as the button's description", async () => {
    const { user } = await renderApp();
    await showSplitToggle(user);

    const btn = screen.getByRole("button", { name: NAME, description: GLOSS });
    expect(btn).toBe(screen.getByRole("button", { name: NAME }));
    expect(document.getElementById(btn.getAttribute("aria-describedby")).textContent.trim()).toBe(GLOSS);
  });

  // LOW-1 — see the matching AUTO test above for the stated limit.
  it("the ON/OFF value span is marked aria-hidden", async () => {
    const { user } = await renderApp();
    await showSplitToggle(user);

    const btn = screen.getByRole("button", { name: NAME });
    const span = btn.querySelector("span");
    expect(span).not.toBeNull();
    expect(span.getAttribute("aria-hidden")).toBe("true");
  });

  // LOW-2 — see the matching AUTO test above for the full rationale.
  it("the computed accessible name genuinely contains the visible prefix (2.5.3, not by coincidence)", async () => {
    const { user } = await renderApp();
    await showSplitToggle(user);

    const btn = screen.getByRole("button", { name: NAME });
    expect(computeAccessibleName(btn).toLowerCase()).toContain(btn.firstChild.textContent.trim().toLowerCase());
  });
});

// ---------------------------------------------------------------------------
// ADDITIVE (announced, gate-found 2026-08-31): a PRE-EXISTING hole adjacent to
// the SPLIT toggle's surface, unrelated to the name-stability fix above.
// `opts = { split: dxSplit }` (wr-cw-trainer.jsx, QsoSim.start) can be severed to
// `{ split: false }` and every one of this file's OTHER tests — including the
// four SPLIT tests above, which only ever check aria-pressed and the button's
// OWN text — stayed green. aria-pressed was announcing a state that reached
// nothing: the DX CQ never gained "UP 5 TO 10" no matter what the toggle said.
// Closing cell drives the REALISTIC path end-to-end: toggle SPLIT on, start the
// contact, REVEAL the DX CQ text, and read what's actually IN the DOM — not a
// shortcut into QsoSim's internal state.
// ---------------------------------------------------------------------------
describe("QSO split toggle — the setting actually reaches the transmitted CQ text", () => {
  // Duplicated from qso-autoadvance.dom.test.jsx's readRevealedTarget rather than
  // shared — this file has no existing cross-file helper import, and one more
  // small DOM-walk is cheaper than introducing that coupling for a single site.
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

  it("SPLIT on: the revealed DX CQ carries the UP 5 TO 10 directive", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");
    await chooseOption(user, "Activity", /Work DX/); // role auto-resets to hunt

    await user.click(screen.getByRole("button", { name: "Split (UP)", pressed: false }));
    await user.click(screen.getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ }));
    await user.click(await screen.findByRole("button", { name: /REVEAL/i }));

    const revealed = readRevealedTarget();
    expect(revealed).not.toBeNull();
    expect(revealed).toContain("UP 5 TO 10");
  });

  it("SPLIT off (default): the revealed DX CQ carries no split directive", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");
    await chooseOption(user, "Activity", /Work DX/);

    // No click on the toggle — confirm it's really off before trusting the negative.
    expect(screen.getByRole("button", { name: "Split (UP)" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ }));
    await user.click(await screen.findByRole("button", { name: /REVEAL/i }));

    const revealed = readRevealedTarget();
    expect(revealed).not.toBeNull();
    expect(revealed).toContain("CQ"); // positive control: prove we read the CQ, not an empty sibling
    expect(revealed).not.toContain("UP 5 TO 10");
  });
});

// ---------------------------------------------------------------------------
// Keyboard integrity — none of the four fixes may add or remove a tab stop.
// A <label>, an <h2> and a role="group" wrapper are all non-focusable; this pins
// that, so a later "let's make the group focusable" tidy-up fails loudly.
// ---------------------------------------------------------------------------
describe("the new elements are not tab stops", () => {
  it("tabbing walks WIDE → CW 500 → APF with nothing inserted between them", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const group = screen.getByRole("group", { name: "RX filter (band noise voicing)" });
    expect(group.getAttribute("tabindex")).toBeNull();

    const [wide, cw, apf] = [...group.querySelectorAll("button")];
    wide.focus();
    await user.tab();
    expect(document.activeElement).toBe(cw);
    await user.tab();
    expect(document.activeElement).toBe(apf);
  });

  it("the section headings and the copy caption carry no tabindex", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    for (const h of screen.getAllByRole("heading", { level: 2 })) {
      expect(h.getAttribute("tabindex")).toBeNull();
    }
    // Same for the QSO caption, on its own screen.
    await user.click(screen.getByRole("button", { name: "Settings" })); // close
    await gotoTab(user, "QSO");
    await user.click(screen.getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ }));
    const input = await screen.findByRole("textbox", { name: QSO_COPY_CAPTION });
    const labelEl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    expect(labelEl).not.toBeNull();
    expect(labelEl.getAttribute("tabindex")).toBeNull();
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

    // Each expected value is the one the <div> carried before the swap. fontWeight
    // and fontSize bite here; the margins do not (see the COVERAGE LIMIT at the top
    // of this file) and are pinned as intent, proven in the headed run.
    const expected = {
      "LISTENING SPEED": { marginTop: "0px", marginBottom: "6px" },
      "SENDING SPEED": { marginTop: "0px", marginBottom: "6px" },
      "Your station": { marginTop: "4px", marginBottom: "8px" },
    };
    for (const name of SECTIONS) {
      const h = screen.getByRole("heading", { name, level: 2 });
      const cs = window.getComputedStyle(h);
      expect(cs.fontWeight).toBe("400");
      expect(cs.fontSize).toBe("11px"); // jsdom 30 normalizes computed lengths to px (0.6875rem × 16)
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
