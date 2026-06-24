// @vitest-environment jsdom
//
// BASELINE: the tab shell and the cross-cutting accessibility net.
// What this locks:
//   - the four-tab nav renders and switching tabs swaps the visible view
//   - tab buttons expose aria-pressed reflecting the active tab
//   - the four always-mounted sr-only live regions exist in the DOM at all times
// These are exactly the surfaces the responsive-layout refactor moves around, so
// asserting them by role/text (not structure) is the regression net's backbone.

import { describe, it, expect } from "vitest";
import { renderApp, gotoTab, screen } from "./helpers.jsx";

describe("tab shell", () => {
  it("renders the four-tab nav", async () => {
    await renderApp();
    for (const label of ["LEARN", "KEY", "COPY", "QSO"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("opens on LEARN with LEARN pressed and the others not", async () => {
    await renderApp();
    expect(screen.getByRole("button", { name: "LEARN" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "KEY" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "COPY" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "QSO" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches the visible view when a tab is chosen", async () => {
    const { user } = await renderApp();

    // KEY view: its NEW TEXT control is unique to the KEY tab.
    await gotoTab(user, "KEY");
    expect(screen.getByRole("button", { name: "KEY" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /NEW TEXT/ })).toBeInTheDocument();

    // COPY view: its "type what you hear" input label is unique to COPY.
    await gotoTab(user, "COPY");
    expect(screen.getByRole("button", { name: "COPY" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Your copy — type what you hear")).toBeInTheDocument();
    // KEY's control is gone now that COPY is active.
    expect(screen.queryByRole("button", { name: /NEW TEXT/ })).not.toBeInTheDocument();

    // QSO view: the Activity heading is unique to QSO.
    await gotoTab(user, "QSO");
    expect(screen.getByRole("button", { name: "QSO" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Activity")).toBeInTheDocument();

    // Back to LEARN: its START DRILL control returns.
    await gotoTab(user, "LEARN");
    expect(screen.getByRole("button", { name: "LEARN" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /START DRILL/ })).toBeInTheDocument();
  });
});

describe("accessibility net — always-mounted live regions", () => {
  // The four sr-only role=status regions (scoreLive, catLive, stepLive,
  // resultLive) must stay mounted-and-empty in the DOM so screen readers see a
  // text CHANGE when an event sets them. The refactor re-parents these into the
  // main pane; this test guards that they remain present on the relevant tabs.
  // We count role=status regions per tab rather than asserting structure.

  it("KEY mounts its two status live regions (scoreLive + catLive)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");
    // role=status maps to aria-live=polite regions. KEY has exactly two.
    const regions = screen.getAllByRole("status");
    expect(regions.length).toBeGreaterThanOrEqual(2);
  });

  it("COPY mounts its status live region (scoreLive)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");
    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(1);
  });

  it("QSO mounts its two status live regions (stepLive + resultLive)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");
    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(2);
  });
});
