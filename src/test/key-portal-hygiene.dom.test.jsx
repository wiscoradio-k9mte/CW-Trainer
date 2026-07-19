// @vitest-environment jsdom
//
// PORTAL HYGIENE net for KEY Phase 3 (criterion 3).
//
// The options rail is fed by a callback-ref portal: CWTrainer holds railEl via
// `ref={setRailEl}` on the <aside>, and KeyTrainer createPortals its options
// into railEl when `isWide && railEl`. The risk with that pattern is orphaned or
// duplicated portaled nodes when the tab changes:
//   - switching away from KEY unmounts KeyTrainer → its portal children must be
//     removed from the rail (React unmount cleans the portal), leaving no stale
//     category selector or toggle cluster behind for the next tab.
//   - switching back must re-portal exactly ONE copy, not stack a second.
// These assert exactly-one / exactly-zero occurrences of a representative heading
// ("Drill category — climb as you improve") and the key-type buttons, so a leak
// (duplicate) or an orphan (stale node) fails the count.
// Mirrors qso-portal-hygiene.dom.test.jsx and copy-portal-hygiene.dom.test.jsx.

import { describe, it, expect } from "vitest";
import { renderApp, gotoTab, screen } from "./helpers.jsx";

describe("KEY portal hygiene — tab switching (wide)", () => {
  it("portals exactly one options cluster into the rail on KEY", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");
    // Exactly one heading — no duplicate from a double-mounted portal.
    expect(screen.getAllByText("Drill category — climb as you improve")).toHaveLength(1);
    // Exactly one set of category buttons.
    expect(screen.getAllByRole("combobox", { name: /Drill category/ })).toHaveLength(1);
    // Exactly one key-type toggle button (exact text to avoid PaddleKey's "Dit paddle" aria-labels).
    expect(screen.getAllByRole("button", { name: "PADDLE" })).toHaveLength(1);
  });

  it("removes the portaled options when switching away from KEY (no orphan)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");
    expect(screen.getByText("Drill category — climb as you improve")).toBeInTheDocument();

    // Leave KEY → KeyTrainer unmounts; its portal children must clear from the rail.
    await gotoTab(user, "COPY");
    expect(screen.queryByText("Drill category — climb as you improve")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Drill category/ })).not.toBeInTheDocument();
  });

  it("re-portals exactly one cluster when returning to KEY (no leak)", async () => {
    const { user } = await renderApp();
    // Cycle KEY → COPY → KEY → QSO → KEY to stress the mount/unmount path,
    // including handing the same rail back and forth with other tabs.
    await gotoTab(user, "KEY");
    await gotoTab(user, "COPY");
    await gotoTab(user, "KEY");
    await gotoTab(user, "QSO");
    await gotoTab(user, "KEY");

    // After all the churn, still exactly one of each control in the rail.
    expect(screen.getAllByText("Drill category — climb as you improve")).toHaveLength(1);
    expect(screen.getAllByRole("combobox", { name: /Drill category/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "PADDLE" })).toHaveLength(1);
  });

  it("does not leave KEY options in the rail after switching to QSO (no cross-tab orphan)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");
    expect(screen.getByText("Drill category — climb as you improve")).toBeInTheDocument();

    // KEY and QSO share the one rail. Switching to QSO must show QSO's options
    // and none of KEY's — proving the rail is cleared, not stacked.
    await gotoTab(user, "QSO");
    expect(screen.queryByText("Drill category — climb as you improve")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Drill category/ })).not.toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument(); // QSO's options are present
  });

  it("does not leave KEY options in the rail after switching to COPY (no cross-tab orphan)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");
    expect(screen.getByText("Drill category — climb as you improve")).toBeInTheDocument();

    await gotoTab(user, "COPY");
    expect(screen.queryByText("Drill category — climb as you improve")).not.toBeInTheDocument();
    expect(screen.getByText("What to copy — climb as you improve")).toBeInTheDocument(); // COPY's options
  });
});
