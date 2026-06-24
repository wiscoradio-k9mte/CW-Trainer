// @vitest-environment jsdom
//
// BASELINE: KEY (sending) tab.
// What this locks:
//   - the drill-category selector renders BOTH ways: the prev/next stepper and
//     the direct-pick row of all categories
//   - choosing a category marks it pressed (the category actually changes)
//   - NEW TEXT produces a non-empty target in the "Send this" display
//   - CHECK surfaces a visible score verdict (feedback path works)
// Asserted by role/label/text so the KEY-tab split (mode controls → rail, key →
// main) in the refactor can't silently drop any of these affordances.

import { describe, it, expect } from "vitest";
import { renderApp, gotoTab, screen } from "./helpers.jsx";
import { DRILL_CATEGORIES } from "../cw-core.js";

describe("KEY tab — drill category selector", () => {
  it("renders the stepper (prev/next) and the direct-pick category row", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    // Stepper arrows, by their accessible labels.
    expect(screen.getByRole("button", { name: "Previous category" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next category" })).toBeInTheDocument();

    // Direct-pick: one toggle button per category, identified by its label text.
    for (const cat of DRILL_CATEGORIES) {
      expect(screen.getByRole("button", { name: cat.label })).toBeInTheDocument();
    }
  });

  it("marks the chosen category pressed when direct-picked", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    // First category starts pressed (catIdx defaults to 0).
    const first = screen.getByRole("button", { name: DRILL_CATEGORIES[0].label });
    expect(first).toHaveAttribute("aria-pressed", "true");

    // Pick a different category; it becomes pressed and the first does not stay.
    const target = screen.getByRole("button", { name: DRILL_CATEGORIES[3].label });
    await user.click(target);
    expect(target).toHaveAttribute("aria-pressed", "true");
    expect(first).toHaveAttribute("aria-pressed", "false");
  });

  it("advances the category with the Next stepper", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const first = screen.getByRole("button", { name: DRILL_CATEGORIES[0].label });
    expect(first).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Next category" }));
    expect(screen.getByRole("button", { name: DRILL_CATEGORIES[1].label })).toHaveAttribute("aria-pressed", "true");
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
