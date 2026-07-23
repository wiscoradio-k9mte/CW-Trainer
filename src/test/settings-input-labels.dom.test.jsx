// @vitest-environment jsdom
//
// Settings "Your station" profile inputs — accessible names.
//
// The three inputs (callsign / name / QTH) rendered their captions as styled
// <div>s with no htmlFor and no aria-label, so a screen-reader user reaching them
// heard three unlabelled text fields.  They now carry real <label htmlFor>
// associations.  These tests pin:
//   T1  each input has a unique accessible name, findable by that name
//   T3  the accessible name is the SAME string a sighted user reads (WCAG 2.5.3)
//   T4  the caption is still display:block — a <label> is inline by default, and
//       losing the explicit block costs the caption's bottom margin and shrinks
//       its box to fit its text. Measured at 1280x800 against a build with the
//       three display:"block" declarations stripped: page scrollHeight 1230 ->
//       1228, captions +2px, inputs -1 to -2px, and the callsign caption's box
//       306px -> 103.5px wide. Small, but not nothing — and it is a real reflow.
//   T5  clicking the caption focuses its input, and tab order is call → name → QTH
//
// Mutation-proven: removing htmlFor/id from a field reds T1/T5 for that field;
// pointing a label at the wrong input reds the mapping check; dropping
// display:"block" reds T4.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderApp } from "./helpers.jsx";

async function openSettings(user) {
  await user.click(screen.getByRole("button", { name: "Settings" }));
}

// The visible captions, verbatim.  T3 says the accessible name must be exactly
// what a sighted user reads — so this one list is used for BOTH the visible-text
// assertion and the accessible-name lookup.  If they ever diverge, that is the bug.
const CAPTIONS = ["Your callsign", "Your name", "Your QTH"];

describe("Settings profile inputs — accessible names", () => {
  it("each of the three inputs is reachable by its accessible name (T1)", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    // getByRole throws on multiple matches, so a pass here also proves the three
    // names are unique in the document.
    const found = CAPTIONS.map((name) => screen.getByRole("textbox", { name }));
    expect(found).toHaveLength(3);
    for (const el of found) expect(el.tagName).toBe("INPUT");
    // Three DISTINCT elements — two labels pointing at the same input would
    // otherwise slip through.
    expect(new Set(found).size).toBe(3);
  });

  it("the accessible name matches the visible caption text (T3)", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    for (const caption of CAPTIONS) {
      const input = screen.getByRole("textbox", { name: caption });
      // Walk the association back to the element that supplies the name and
      // check the text a sighted user actually reads is that same string.
      const labelEl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      expect(labelEl).not.toBeNull();
      expect(labelEl.textContent).toBe(caption);
      // No parallel invisible name that could drift from the visible one.
      expect(input.getAttribute("aria-label")).toBeNull();
    }
  });

  it("each label is bound to the RIGHT input, not just to some input", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    // Deliberately value-based: the shipped defaults are the only field-identity
    // signal independent of the labels themselves, so this is the cross-check that
    // catches two htmlFor values swapped.  (The lookups above are value-free; this
    // one assertion is not, on purpose.)
    expect(screen.getByRole("textbox", { name: "Your callsign" })).toHaveValue("W1AW");
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveValue("PAT");
    expect(screen.getByRole("textbox", { name: "Your QTH" })).toHaveValue("NEWINGTON CT");
  });

  it("captions still render as blocks, so the field layout is unchanged (T4)", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    for (const caption of CAPTIONS) {
      const input = screen.getByRole("textbox", { name: caption });
      const labelEl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      // <label> defaults to display:inline, whose vertical margins don't apply;
      // the explicit block is what preserves the pre-fix <div> geometry exactly.
      expect(window.getComputedStyle(labelEl).display).toBe("block");
    }
  });

  it("clicking a caption focuses its input, and tab order is call → name → QTH (T5)", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const call = screen.getByRole("textbox", { name: "Your callsign" });
    const name = screen.getByRole("textbox", { name: "Your name" });
    const qth = screen.getByRole("textbox", { name: "Your QTH" });

    // Label activation — the usability win of a real <label> over an aria-label.
    const qthLabel = document.querySelector(`label[for="${CSS.escape(qth.id)}"]`);
    await user.click(qthLabel);
    expect(document.activeElement).toBe(qth);

    // Tab order follows document order; no tabindex was introduced.
    call.focus();
    await user.tab();
    expect(document.activeElement).toBe(name);
    await user.tab();
    expect(document.activeElement).toBe(qth);
  });

  it("ids are unique when two Settings panels are mounted at once", async () => {
    // Guards the useId choice: hard-coded ids would collide and both labels would
    // resolve to the first panel's inputs.
    // SYNTHETIC BY NECESSITY — the app cannot do this today. Its two Settings
    // render sites gate on `showSettings && !isWide` and `isWide && showSettings`,
    // so only one is ever live; mounting a second whole app instance is the only
    // way to force the collision. This guards a future refactor, not a live bug.
    const { user } = await renderApp();
    await openSettings(user);
    const first = CAPTIONS.map((c) => screen.getByRole("textbox", { name: c }).id);

    // Mount a second independent app instance in its own container.
    const extra = document.createElement("div");
    document.body.appendChild(extra);
    const { default: CWTrainer } = await import("../../wr-cw-trainer.jsx");
    render(<CWTrainer />, { container: extra });
    await user.click(screen.getByLabelText("Enter CW Trainer"));
    await user.click(
      [...extra.querySelectorAll('button[aria-label="Settings"]')][0]
    );

    const second = CAPTIONS.map(
      (c) => [...extra.querySelectorAll("label")].find((l) => l.textContent === c).htmlFor
    );
    expect(second.every((id) => id && !first.includes(id))).toBe(true);
  });
});
