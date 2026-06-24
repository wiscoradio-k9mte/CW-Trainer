// @vitest-environment jsdom
//
// PORTAL HYGIENE net for QSO Phase 1 (criterion 3).
//
// The options rail is fed by a callback-ref portal: CWTrainer holds railEl via
// `ref={setRailEl}` on the <aside>, and QsoSim createPortals its options into
// railEl when `isWide && railEl`. The risk with that pattern is orphaned or
// duplicated portaled nodes when the tab or width changes:
//   - switching away from QSO unmounts QsoSim → its portal children must be
//     removed from the rail (React unmount cleans the portal), leaving no stale
//     "Activity" cluster behind for the next tab.
//   - switching back must re-portal exactly ONE copy, not stack a second.
// These assert exactly-one / exactly-zero occurrences, so a leak (duplicate) or
// an orphan (stale node) fails the count.

import { describe, it, expect } from "vitest";
import { renderApp, gotoTab, screen } from "./helpers.jsx";

describe("QSO portal hygiene — tab switching (wide)", () => {
  it("portals exactly one options cluster into the rail on QSO", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");
    // Exactly one Activity heading — no duplicate from a double-mounted portal.
    expect(screen.getAllByText("Activity")).toHaveLength(1);
    expect(screen.getAllByText("Conditions")).toHaveLength(1);
  });

  it("removes the portaled options when switching away from QSO (no orphan)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");
    expect(screen.getByText("Activity")).toBeInTheDocument();

    // Leave QSO → QsoSim unmounts; its portal children must clear from the rail.
    await gotoTab(user, "KEY");
    expect(screen.queryByText("Activity")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ })).not.toBeInTheDocument();
  });

  it("re-portals exactly one cluster when returning to QSO (no leak)", async () => {
    const { user } = await renderApp();
    // Cycle QSO → KEY → QSO → COPY → QSO to stress the mount/unmount path.
    await gotoTab(user, "QSO");
    await gotoTab(user, "KEY");
    await gotoTab(user, "QSO");
    await gotoTab(user, "COPY");
    await gotoTab(user, "QSO");

    // After all the churn, still exactly one of each control in the rail.
    expect(screen.getAllByText("Activity")).toHaveLength(1);
    expect(screen.getAllByText("Role")).toHaveLength(1);
    expect(screen.getAllByText("Conditions")).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ }),
    ).toHaveLength(1);
  });
});
