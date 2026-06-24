// @vitest-environment jsdom
//
// BASELINE: QSO simulator tab.
// What this locks:
//   - Activity / Role / Conditions controls all render
//   - selecting an Activity updates the Role options (POTA → Activator/Hunter,
//     not Ragchew's Call CQ / Answer a CQ)
//   - the start button enters the QSO flow (leaves the setup view)
// All by role/text, so QSO's setup→rail move in the refactor can't drop a control
// or break the activity→role linkage unnoticed.

import { describe, it, expect } from "vitest";
import { renderApp, gotoTab, screen } from "./helpers.jsx";

describe("QSO tab — setup controls", () => {
  it("renders Activity, Role, and Conditions sections", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("Role")).toBeInTheDocument();
    expect(screen.getByText("Conditions")).toBeInTheDocument();

    // The four activities are present as pressable options.
    for (const label of ["Ragchew", "POTA", "SOTA", "IOTA"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
    // The three difficulty options.
    for (const label of ["EASY", "NORMAL", "REAL LIFE"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("updates the Role options when the Activity changes", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    // Default activity is Ragchew → roles are "Call CQ" / "Answer a CQ".
    expect(screen.getByRole("button", { name: /Answer a CQ/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Activator/ })).not.toBeInTheDocument();

    // Switch to POTA → roles become "Activator" / "Hunter".
    await user.click(screen.getByRole("button", { name: /POTA/ }));
    expect(screen.getByRole("button", { name: /Activator/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hunter/ })).toBeInTheDocument();
    // Ragchew's role label is gone.
    expect(screen.queryByRole("button", { name: /Answer a CQ/ })).not.toBeInTheDocument();
  });

  it("marks the selected activity pressed", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    const sota = screen.getByRole("button", { name: /SOTA/ });
    await user.click(sota);
    expect(sota).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Ragchew/ })).toHaveAttribute("aria-pressed", "false");
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
