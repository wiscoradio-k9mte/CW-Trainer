// @vitest-environment jsdom
//
// BASELINE: KEY (sending) tab.
// What this locks:
//   - the drill-category selector renders BOTH ways: the prev/next stepper and
//     the direct-pick dropdown (a CompactSelect combobox listing all categories)
//   - choosing a category marks it selected (the category actually changes),
//     whether picked from the dropdown or stepped with the arrows
//   - NEW TEXT produces a non-empty target in the "Send this" display
//   - CHECK surfaces a visible score verdict (feedback path works)
// Asserted by role/label/text so the KEY-tab split (mode controls → rail, key →
// main) can't silently drop any of these affordances.
//
// The compact-selector refactor replaced the 14-button direct-pick WRAP with one
// CompactSelect combobox; the prev/next STEPPER arrows are unchanged (F2). So the
// direct-pick assertions now open the combobox and check role=option/aria-selected
// (equal-or-stronger than the old aria-pressed buttons), and the arrow tests are
// kept verbatim in intent.

import { describe, it, expect } from "vitest";
import { renderApp, gotoTab, chooseOption, screen } from "./helpers.jsx";
import { DRILL_CATEGORIES } from "../cw-core.js";

describe("KEY tab — drill category selector", () => {
  it("renders the stepper (prev/next) and the direct-pick dropdown of all categories", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    // Stepper arrows, by their accessible labels — unchanged by the refactor.
    expect(screen.getByRole("button", { name: "Previous category" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next category" })).toBeInTheDocument();

    // Direct-pick: one combobox trigger, named by the section label.
    const trigger = screen.getByRole("combobox", { name: /Drill category/ });
    expect(trigger).toBeInTheDocument();

    // Opening it reveals one role=option per category, identified by its label.
    await user.click(trigger);
    for (const cat of DRILL_CATEGORIES) {
      expect(screen.getByRole("option", { name: cat.label })).toBeInTheDocument();
    }
  });

  it("marks the chosen category selected when direct-picked from the dropdown", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const trigger = screen.getByRole("combobox", { name: /Drill category/ });
    // First category starts selected (catIdx defaults to 0).
    await user.click(trigger);
    expect(screen.getByRole("option", { name: DRILL_CATEGORIES[0].label })).toHaveAttribute("aria-selected", "true");

    // Pick a different category; committing closes the panel and updates the trigger.
    await user.click(screen.getByRole("option", { name: DRILL_CATEGORIES[3].label }));
    expect(trigger).toHaveTextContent(DRILL_CATEGORIES[3].label);

    // Reopen: the new category is selected and the first is not.
    await user.click(trigger);
    expect(screen.getByRole("option", { name: DRILL_CATEGORIES[3].label })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: DRILL_CATEGORIES[0].label })).toHaveAttribute("aria-selected", "false");
  });

  it("advances the category with the Next stepper (drives the same state as the dropdown)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const trigger = screen.getByRole("combobox", { name: /Drill category/ });
    // First category is selected before stepping.
    await user.click(trigger);
    expect(screen.getByRole("option", { name: DRILL_CATEGORIES[0].label })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Escape}"); // close without committing

    await user.click(screen.getByRole("button", { name: "Next category" }));

    // The arrow moved the shared catIdx: the dropdown now reflects category 2.
    expect(trigger).toHaveTextContent(DRILL_CATEGORIES[1].label);
    await user.click(trigger);
    expect(screen.getByRole("option", { name: DRILL_CATEGORIES[1].label })).toHaveAttribute("aria-selected", "true");
  });
});

describe("KEY tab — target and check", () => {
  it("NEW TEXT puts a target in the Send-this display", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    // Before: the display prompts to press NEW TEXT.
    expect(screen.getByText("press NEW TEXT")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));

    // After: the placeholder prompt is gone — a real target now occupies it.
    expect(screen.queryByText("press NEW TEXT")).not.toBeInTheDocument();
  });

  it("CHECK surfaces a score verdict after a target is set", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));
    await user.click(screen.getByRole("button", { name: "CHECK" }));

    // With nothing keyed, the score is 0% → "PSE AGN" verdict. The point is that
    // the feedback path fires and a verdict becomes visible at all.
    expect(screen.getByText("PSE AGN")).toBeInTheDocument();
  });
});
