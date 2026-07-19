// @vitest-environment jsdom
//
// BASELINE: QSO simulator tab.
// What this locks:
//   - Activity / Role / Conditions controls all render (as CompactSelect comboboxes)
//   - selecting an Activity updates the Role options (POTA → Activator/Hunter,
//     not Ragchew's Call CQ / Answer a CQ)
//   - the start button enters the QSO flow (leaves the setup view)
// All by role/text, so QSO's setup→rail move can't drop a control or break the
// activity→role linkage unnoticed.
//
// The compact-selector refactor turned Activity/Role/Conditions from button rows
// into CompactSelect comboboxes: the options render only when the combobox is
// opened, and selection is programmatic aria-selected (equal-or-stronger than the
// old aria-pressed). Each assertion opens the relevant combobox first.

import { describe, it, expect } from "vitest";
import { renderApp, gotoTab, chooseOption, screen } from "./helpers.jsx";

describe("QSO tab — setup controls", () => {
  it("renders Activity, Role, and Conditions comboboxes with their options", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    // The three section comboboxes exist, named by their visible labels.
    const activity = screen.getByRole("combobox", { name: "Activity" });
    expect(activity).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Role" })).toBeInTheDocument();
    const conditions = screen.getByRole("combobox", { name: "Conditions" });
    expect(conditions).toBeInTheDocument();

    // The four activities are present as options once the Activity combobox opens.
    await user.click(activity);
    for (const label of ["Ragchew", "POTA", "SOTA", "IOTA"]) {
      expect(screen.getByRole("option", { name: new RegExp(label) })).toBeInTheDocument();
    }
    await user.keyboard("{Escape}");

    // The three difficulty options live in the Conditions combobox.
    await user.click(conditions);
    for (const label of ["EASY", "NORMAL", "REAL LIFE"]) {
      expect(screen.getByRole("option", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("updates the Role options when the Activity changes", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    // Default activity is Ragchew → roles are "Call CQ" / "Answer a CQ".
    const role = screen.getByRole("combobox", { name: "Role" });
    await user.click(role);
    expect(screen.getByRole("option", { name: /Answer a CQ/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Activator/ })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    // Switch to POTA → roles become "Activator" / "Hunter".
    await chooseOption(user, "Activity", /POTA/);
    await user.click(screen.getByRole("combobox", { name: "Role" }));
    expect(screen.getByRole("option", { name: /Activator/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Hunter/ })).toBeInTheDocument();
    // Ragchew's role label is gone.
    expect(screen.queryByRole("option", { name: /Answer a CQ/ })).not.toBeInTheDocument();
  });

  it("marks the selected activity selected", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    // Commit SOTA via the Activity combobox.
    const activity = await chooseOption(user, "Activity", /SOTA/);
    expect(activity).toHaveTextContent("SOTA");

    // Reopen: SOTA is programmatically selected; Ragchew is not.
    await user.click(activity);
    expect(screen.getByRole("option", { name: /SOTA/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /Ragchew/ })).toHaveAttribute("aria-selected", "false");
  });
});

describe("QSO tab — starting the flow", () => {
  it("leaves the setup view when the QSO starts", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    // Default Ragchew + "Answer a CQ" → the start button reads "LISTEN FOR CQ".
    const startBtn = screen.getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ });
    expect(startBtn).toBeInTheDocument();

    await user.click(startBtn);

    // Once started, the setup panel (the Activity heading) is no longer shown —
    // the exchange flow has taken over.
    expect(screen.queryByText("Activity")).not.toBeInTheDocument();
  });
});
