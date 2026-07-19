// @vitest-environment jsdom
//
// QSO panel fix bundle (2026-07-19) — the two jsdom-testable fixes.
//
//   FIX 2 — the Role auto-reset (triggered when the Activity changes) must be
//           PERCEPTIBLE: a polite live-region announcement for AT + an amber pulse
//           on the Role trigger for sighted users. It must fire ONLY on an
//           Activity-driven reset — never when the user picks a Role directly.
//   FIX 3 — the option descriptions were reworded to lead with plain meaning
//           (plain-anchor-first). Assert the reworded text renders on the exact
//           option row that carries it.
//
// FIX 1 (QSO send-step key above the 390x844 fold) is a GEOMETRY change with no
// jsdom-observable output (jsdom has no layout). It is verified by the headed
// Chromium measurement, not here — do NOT assert "it fits" in jsdom.

import { describe, it, expect } from "vitest";
import { renderApp, gotoTab, chooseOption, screen } from "./helpers.jsx";

describe("QSO — Role auto-change is perceptible (Fix 2)", () => {
  it("announces the Role in a live region when the Activity resets it", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    // No announcement before any change (the region starts empty).
    expect(screen.queryByText(/Role set to/)).not.toBeInTheDocument();

    // Switching Activity → POTA resets Role to the answering role "Hunter"; the
    // polite region must carry "Role set to Hunter" so AT hears the silent reset.
    // Mutation: dropping setRoleLive from the Activity onChange makes this throw.
    await chooseOption(user, "Activity", /POTA/);
    expect(screen.getByText("Role set to Hunter")).toBeInTheDocument();
  });

  it("does NOT announce when the user picks a Role directly", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    // Default Ragchew Role is "Answer a CQ". Pick the OTHER role directly.
    const role = await chooseOption(user, "Role", /Call CQ/);

    // The pick took effect (non-vacuous)...
    expect(role).toHaveTextContent("Call CQ");
    // ...but a direct pick must produce NO "Role set to ..." announcement.
    // Mutation: wiring setRoleLive into the Role onChange makes this find a match.
    expect(screen.queryByText(/Role set to/)).not.toBeInTheDocument();
  });

  it("pulses the Role trigger on an Activity reset but not on a direct pick", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    // Direct Role pick: no pulse class (visual cue is only for the silent reset).
    const roleAfterPick = await chooseOption(user, "Role", /Call CQ/);
    expect(roleAfterPick).not.toHaveClass("wr-select-pulse");

    // Activity change → the Role trigger gets the amber-glow class. The 1s cleanup
    // timer has not fired within the synchronous test, so the class is present.
    // Mutation: removing pulseKey / the pulse effect leaves the class off → red.
    await chooseOption(user, "Activity", /SOTA/);
    expect(screen.getByRole("combobox", { name: "Role" })).toHaveClass("wr-select-pulse");
  });
});

describe("QSO — plain-anchored option descriptions (Fix 3)", () => {
  it("leads the Work DX and Contest activity descriptions with plain meaning", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    // The description is part of each option's accessible name, so a regex on the
    // reworded plain-first text resolves to exactly the one option that carries it.
    await user.click(screen.getByRole("combobox", { name: "Activity" }));
    // Work DX: was "terse pileup exchange — 5NN and QRZ" (jargon-first).
    expect(
      screen.getByRole("option", { name: /work a far-off or rare station/ })
    ).toHaveTextContent("Work DX");
    // Contest: was "CQ TEST — serial or zone exchange" (jargon-first, abbreviation).
    expect(
      screen.getByRole("option", { name: /trade a quick serial number or zone/ })
    ).toHaveTextContent("Contest");
    // The old jargon-first lead is gone from the Work DX row.
    expect(screen.queryByRole("option", { name: /terse pileup exchange/ })).not.toBeInTheDocument();
  });

  it("spells out the signal report in the Hunter role description", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    // POTA's Hunter role: was "...give a report" → now "...give a signal report".
    await chooseOption(user, "Activity", /POTA/);
    await user.click(screen.getByRole("combobox", { name: "Role" }));
    const hunter = screen.getByRole("option", { name: /Hunter/ });
    expect(hunter).toHaveTextContent("give a signal report");
  });
});
