// @vitest-environment jsdom
//
// QTH — the app must not invent a state (or a CQ zone) for an operator who
// didn't give one.
//
// The defect: `stateOf(qth)` fell back to "CT" for any QTH without a trailing
// two-letter token, so an operator who typed "MADISON" was silently REQUIRED to
// send Connecticut, and the contest edge (`resolveUSState(stateOf(...))?.cq ?? 5`)
// silently made their CQ zone 5 — Connecticut's. A QTH is something a ham states
// truthfully; asserting one on their behalf is a domain-integrity fault.
//
// These drive the REAL surface — the operator edits Settings, runs a contact, and
// we read the RENDERED ✓/✗ checklist and the RENDERED example script. That is the
// only coverage of the `?? null` composition in wr-cw-trainer.jsx's start(); the
// pure-core sweep in cw-core.test.js mirrors the same expression but cannot reach
// the JSX line itself.
//
// The W1AW placeholder (NEWINGTON CT) is deliberately KEPT — the first test pins
// that it still resolves, because it is genuinely Connecticut.
//
// NOT spacing coverage: RTL's getByText NORMALISES whitespace, so
// getByText("BK GM UR 599 599 BK") matches even when the rendered script carries a
// doubled space. The double-space / extra-wordGap regression is catchable ONLY at
// the cw-core layer with an exact `toBe` — see the sibling tests in cw-core.test.js.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { gotoTab, chooseOption } from "./helpers.jsx";

afterEach(() => {
  window.localStorage.clear();
  cleanup();
});

// Render past the splash and (optionally) retype the QTH through the real input.
// The Settings profile inputs carry no accessible name (a pre-existing gap, out
// of scope here), so they are located by their current displayed value.
async function appWithQth(newQth) {
  window.localStorage.clear();
  // delay: null drops userEvent's real setTimeout wait between synthetic events
  // (a no-op cost fix, not a behavior change — see progress-qso.dom.test.jsx for
  // the full rationale). This file drives a full QSO contact per test on the
  // real clock; that per-event wait is what made it the single slowest test in
  // the suite under CI-shaped contention.
  const user = userEvent.setup({ delay: null });
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  await user.click(screen.getByRole("button", { name: "Settings" }));

  // Pin the shipped default before touching it: DEFAULT_SETTINGS is untouched by
  // this fix, and W1AW's Newington CT is a real Connecticut QTH.
  const qth = screen.getByDisplayValue("NEWINGTON CT");
  if (newQth !== null) {
    await user.clear(qth);
    await user.type(qth, newQth);
    // Loud check that the edit took — a silently-unchanged input would make every
    // assertion below vacuous.
    expect(screen.getByDisplayValue(newQth)).toBeInTheDocument();
  }

  // Close Settings by toggling the gear again (the ✕ Done button only renders on
  // the wide portal). Assert it really closed so the QSO drive isn't obstructed.
  await user.click(screen.getByRole("button", { name: "Settings" }));
  expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-expanded", "false");
  return { user };
}

// The ✓/✗ rows live in one monospace div; every row is a direct child span.
function checklistRows() {
  const anyRow = screen.getAllByText(/^[✓✗] /);
  return Array.from(anyRow[0].parentElement.children).map((el) => el.textContent);
}

// POTA / hunter in EASY: dx(0) → you(1)[myCall] → dx(2) → you(3)[myRst, myState].
async function startPotaHunterAndReachExchange(user) {
  await gotoTab(user, "QSO");
  const rail = screen.getByRole("complementary", { name: "Options" });
  await chooseOption(user, "Activity", /POTA/i, rail);
  await chooseOption(user, "Role", /Hunter/i, rail);
  await chooseOption(user, "Conditions", /EASY/, rail);
  await user.click(within(rail).getByRole("button", { name: /LISTEN FOR CQ/ }));
  await user.click(screen.getByRole("button", { name: /CONTINUE →/ }));   // dx(0)
  // you(1) — nothing keyed; step through to the exchange step.
  await user.click(screen.getByRole("button", { name: /CHECK TRANSMISSION/ }));
  await user.click(screen.getByRole("button", { name: /TRANSMIT →/ }));
  await user.click(screen.getByRole("button", { name: /CONTINUE →/ }));   // dx(2)
  // Reveal the example script — it sits behind a button so the learner tries first.
  await user.click(screen.getByRole("button", { name: /SHOW SUGGESTED SCRIPT/ }));
  await user.click(screen.getByRole("button", { name: /CHECK TRANSMISSION/ }));
}

// The graded outcome as the app states it, e.g.
// "Send: 0% — PSE AGN. Sent: none; missing: 599, CT."
function sendVerdict() {
  return screen.getByText(/^Send: /).textContent;
}

describe("QTH — the app never sends a state the operator didn't give", () => {
  it("a state-less QTH requires the report ALONE — no 'CT' row, no CT in the script", async () => {
    // MUTATION verified: restore stateOf's `: "CT"` fallback in cw-core.js →
    // the checklist renders ["✗ 599", "✗ CT"] and the example script reads
    // "BK GM UR 599 599 CT CT BK" → both assertions red.
    const { user } = await appWithQth("MADISON");
    await startPotaHunterAndReachExchange(user);

    expect(checklistRows()).toEqual(["✗ 599"]);
    expect(sendVerdict()).toBe("Send: 0% — PSE AGN. Sent: none; missing: 599.");
    expect(screen.getByText("BK GM UR 599 599 BK")).toBeInTheDocument();
  });

  it("a resolvable QTH is unchanged — Wisconsin is still required and still shown", async () => {
    // The other half of the contract: the fix must be invisible to an operator
    // who gave a state. MUTATION verified: drop `${stateTwice}` from buildPota's
    // suggested template → the script assertion goes red.
    const { user } = await appWithQth("MADISON WI");
    await startPotaHunterAndReachExchange(user);

    expect(checklistRows()).toEqual(["✗ 599", "✗ WI"]);
    expect(sendVerdict()).toBe("Send: 0% — PSE AGN. Sent: none; missing: 599, WI.");
    expect(screen.getByText("BK GM UR 599 599 WI WI BK")).toBeInTheDocument();
  });

  it("the shipped W1AW default still resolves to CT — the placeholder is kept on purpose", async () => {
    // Travis's ruling: fix the silent fallback, KEEP the W1AW / PAT / NEWINGTON CT
    // training identity. Newington CT is genuinely Connecticut, so it must keep
    // producing a CT requirement. Passing null leaves Settings untouched.
    const { user } = await appWithQth(null);
    await startPotaHunterAndReachExchange(user);

    expect(checklistRows()).toEqual(["✗ 599", "✗ CT"]);
    expect(screen.getByText("BK GM UR 599 599 CT CT BK")).toBeInTheDocument();
  });

  it("the CQ WW zone exchange drops the zone rather than sending eastern-US zone 5", async () => {
    // This is the ONLY test that exercises wr-cw-trainer.jsx's
    // `resolveUSState(stateOf(settings.myQth))?.cq ?? null`.
    // MUTATION verified: change that `?? null` back to `?? 5` → the checklist
    // renders ["✗ 599", "✗ 05"] → red. (Restoring stateOf's "CT" fallback turns it
    // red too, by the same composed path: CT resolves to zone 5.)
    const { user } = await appWithQth("MADISON");
    await gotoTab(user, "QSO");
    const rail = screen.getByRole("complementary", { name: "Options" });
    await chooseOption(user, "Activity", /Contest/i, rail);
    await chooseOption(user, "Role", /Running/i, rail);
    await chooseOption(user, "Conditions", /EASY/, rail);
    await user.click(within(rail).getByRole("button", { name: /Zone \(CQ WW\)/ }));
    await user.click(within(rail).getByRole("button", { name: /CALL CQ/ }));

    // Contest/run starts on a you-step: you(0)[TEST,call] → dx(1) → you(2)[rpt,exch].
    await user.click(screen.getByRole("button", { name: /CHECK TRANSMISSION/ }));
    await user.click(screen.getByRole("button", { name: /TRANSMIT →/ }));
    await user.click(screen.getByRole("button", { name: /CONTINUE →/ }));
    await user.click(screen.getByRole("button", { name: /CHECK TRANSMISSION/ }));

    expect(checklistRows()).toEqual(["✗ 599"]);
    expect(screen.queryByText(/^✗ 05$/)).not.toBeInTheDocument();
  });

  it("a Wisconsin operator running CQ WW is asked for zone 04, not 05", async () => {
    // The domain fact under the fix, sourced externally (CQ's own WAZ zone list,
    // cqww.com/cq_waz_list.htm, retrieved 2026-07-21 — NOT our bundled dataset,
    // whose state table is hand-coded and would be circular): Wisconsin is CQ zone
    // 4 and Connecticut is zone 5. The old `?? 5` sent a WI operator with a
    // state-less QTH into Connecticut's zone; with a full QTH they get their own.
    const { user } = await appWithQth("MADISON WI");
    await gotoTab(user, "QSO");
    const rail = screen.getByRole("complementary", { name: "Options" });
    await chooseOption(user, "Activity", /Contest/i, rail);
    await chooseOption(user, "Role", /Running/i, rail);
    await chooseOption(user, "Conditions", /EASY/, rail);
    await user.click(within(rail).getByRole("button", { name: /Zone \(CQ WW\)/ }));
    await user.click(within(rail).getByRole("button", { name: /CALL CQ/ }));

    await user.click(screen.getByRole("button", { name: /CHECK TRANSMISSION/ }));
    await user.click(screen.getByRole("button", { name: /TRANSMIT →/ }));
    await user.click(screen.getByRole("button", { name: /CONTINUE →/ }));
    await user.click(screen.getByRole("button", { name: /CHECK TRANSMISSION/ }));

    expect(checklistRows()).toEqual(["✗ 599", "✗ 04"]);
  });
});
