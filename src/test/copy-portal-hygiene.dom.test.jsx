// @vitest-environment jsdom
//
// PORTAL HYGIENE net for COPY Phase 2 (criterion 3).
//
// The options rail is fed by a callback-ref portal: CWTrainer holds railEl via
// `ref={setRailEl}` on the <aside>, and CopyTrainer createPortals its options
// into railEl when `isWide && railEl`. The risk with that pattern is orphaned or
// duplicated portaled nodes when the tab changes:
//   - switching away from COPY unmounts CopyTrainer → its portal children must be
//     removed from the rail (React unmount cleans the portal), leaving no stale
//     ladder/Conditions cluster behind for the next tab.
//   - switching back must re-portal exactly ONE copy, not stack a second.
// These assert exactly-one / exactly-zero occurrences, so a leak (duplicate) or
// an orphan (stale node) fails the count. Mirrors qso-portal-hygiene.dom.test.jsx.

import { describe, it, expect } from "vitest";
import { renderApp, gotoTab, screen } from "./helpers.jsx";

describe("COPY portal hygiene — tab switching (wide)", () => {
  it("portals exactly one options cluster into the rail on COPY", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");
    // Exactly one of each heading — no duplicate from a double-mounted portal.
    expect(screen.getAllByText("What to copy — climb as you improve")).toHaveLength(1);
    expect(screen.getAllByText("Conditions")).toHaveLength(1);
    // The level ladder is one CompactSelect trigger now (it used to be 8 stacked
    // buttons) — count the trigger, which is what a duplicated portal would double.
    expect(screen.getAllByRole("combobox", { name: /What to copy/ })).toHaveLength(1);
  });

  it("removes the portaled options when switching away from COPY (no orphan)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");
    expect(screen.getByText("What to copy — climb as you improve")).toBeInTheDocument();

    // Leave COPY → CopyTrainer unmounts; its portal children must clear from the rail.
    await gotoTab(user, "KEY");
    expect(screen.queryByText("What to copy — climb as you improve")).not.toBeInTheDocument();
    expect(screen.queryByText("Conditions")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /What to copy/ })).not.toBeInTheDocument();
  });

  it("re-portals exactly one cluster when returning to COPY (no leak)", async () => {
    const { user } = await renderApp();
    // Cycle COPY → KEY → COPY → QSO → COPY to stress the mount/unmount path,
    // including handing the same rail back and forth with QSO.
    await gotoTab(user, "COPY");
    await gotoTab(user, "KEY");
    await gotoTab(user, "COPY");
    await gotoTab(user, "QSO");
    await gotoTab(user, "COPY");

    // After all the churn, still exactly one of each control in the rail.
    expect(screen.getAllByText("What to copy — climb as you improve")).toHaveLength(1);
    expect(screen.getAllByText("Conditions")).toHaveLength(1);
    const ladders = screen.getAllByRole("combobox", { name: /What to copy/ });
    expect(ladders).toHaveLength(1);
    // Opening the one trigger yields exactly one listbox holding exactly the 8
    // rungs — a duplicated portal would surface a second set of option rows.
    await user.click(ladders[0]);
    expect(screen.getAllByRole("listbox")).toHaveLength(1);
    expect(screen.getAllByRole("option")).toHaveLength(8);
    expect(screen.getAllByRole("option", { name: /Callsigns/ })).toHaveLength(1);
  });

  it("does not leave COPY options in the rail after switching to QSO (no cross-tab orphan)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");
    expect(screen.getByText("What to copy — climb as you improve")).toBeInTheDocument();

    // COPY and QSO share the one rail. Switching to QSO must show QSO's options
    // and none of COPY's — proving the rail is cleared, not stacked.
    await gotoTab(user, "QSO");
    expect(screen.queryByText("What to copy — climb as you improve")).not.toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument(); // QSO's options are present
  });
});
