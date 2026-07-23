// @vitest-environment jsdom
//
// CROSS-SECTION consistency net (spec §7 / DoR T1).
//
// One shared component ⇒ one shared role structure. This asserts that all FIVE
// live uses of CompactSelect — KEY drill category, QSO Activity, QSO Role, QSO
// Conditions, COPY Conditions — expose the identical select-only-combobox shape:
//   1. a role="combobox" trigger with an accessible name,
//   2. that opens exactly ONE role="listbox",
//   3. whose children are role="option" rows each carrying aria-selected, with
//      exactly one selected,
//   4. and committing an option fires the section's change (the trigger's value
//      updates to the committed label — real produced output, per section).
//
// If any of the five diverged into a bespoke control (a second implementation, a
// variant flag), one of these steps would fail for that section — which is the
// T1 "two implementations = fail" guard made executable.

import { describe, it, expect } from "vitest";
import { renderApp, gotoTab, screen, within } from "./helpers.jsx";

// Assert the shared structure for one combobox, then commit `optionName` and
// confirm the trigger now reflects `expectedText`. Returns nothing — it throws on
// any structural or behavioral divergence.
async function assertSharedCompactSelect(user, comboName, optionName, expectedText) {
  const trigger = screen.getByRole("combobox", { name: comboName });
  // (1) accessible name present.
  expect(trigger).toHaveAccessibleName();

  await user.click(trigger);

  // (2) exactly one listbox open on the whole page.
  const listboxes = screen.getAllByRole("listbox");
  expect(listboxes).toHaveLength(1);
  const listbox = listboxes[0];

  // (3) children are role=option, each with aria-selected, exactly one selected.
  const options = within(listbox).getAllByRole("option");
  expect(options.length).toBeGreaterThan(1);
  for (const opt of options) {
    expect(opt).toHaveAttribute("aria-selected");
  }
  const selected = options.filter((o) => o.getAttribute("aria-selected") === "true");
  expect(selected).toHaveLength(1);

  // (4) committing fires the section's change: the trigger reflects the new value
  //     and the panel closes.
  await user.click(within(listbox).getByRole("option", { name: optionName }));
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(trigger).toHaveTextContent(expectedText);
}

describe("CompactSelect — all five uses share one role structure", () => {
  it("KEY drill category is a CompactSelect combobox and commits a change", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");
    await assertSharedCompactSelect(user, /Drill category/, "Prosigns", "Prosigns");
  });

  it("QSO Activity is a CompactSelect combobox and commits a change", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");
    await assertSharedCompactSelect(user, "Activity", /POTA/, "POTA");
  });

  it("QSO Role is a CompactSelect combobox and commits a change", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");
    // Default ragchew role is "Answer a CQ"; commit "Call CQ".
    await assertSharedCompactSelect(user, "Role", /Call CQ/, "Call CQ");
  });

  it("QSO Conditions is a CompactSelect combobox and commits a change", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");
    await assertSharedCompactSelect(user, "Conditions", /REAL LIFE/, "REAL LIFE");
    // The section's own side effect also fired: REAL LIFE reveals the noise slider.
    expect(screen.getByText("Band noise")).toBeInTheDocument();
  });

  it("COPY Conditions is a CompactSelect combobox and commits a change", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");
    await assertSharedCompactSelect(user, "Conditions", /EASY/, "EASY");
    // The section's own side effect also fired: EASY reveals its helper line.
    expect(screen.getByText(/letter by letter as it plays/)).toBeInTheDocument();
  });

  it("COPY level ladder is a CompactSelect combobox and commits a change", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");
    await assertSharedCompactSelect(user, /What to copy/, /Ham words/, "6 — Ham words");
  });
});

// T1 — the COPY ladder must be the SAME component as KEY's category selector, not
// a look-alike. Rather than trust that both call CompactSelect, this compares the
// two triggers' full ARIA contracts attribute-by-attribute: same role, same
// haspopup, same collapsed/expanded transitions, same aria-controls→listbox wiring,
// same aria-activedescendant→option-row wiring, and a name that comes from the
// visible section label (aria-labelledby) rather than the current value.
//
// A forked copy of the control — or a variant flag that changed the ladder's
// markup — would diverge on at least one of these and turn this red.
describe("COPY level ladder exposes the identical ARIA contract as KEY drill category", () => {
  async function contractOf(user, comboName) {
    const trigger = screen.getByRole("combobox", { name: comboName });
    const closed = {
      tag: trigger.tagName,
      role: trigger.getAttribute("role"),
      haspopup: trigger.getAttribute("aria-haspopup"),
      expanded: trigger.getAttribute("aria-expanded"),
      // The name is carried by aria-labelledby pointing at the visible label, so a
      // value change never renames the control.
      namedBy: trigger.hasAttribute("aria-labelledby"),
      labelText: document.getElementById(trigger.getAttribute("aria-labelledby"))?.textContent,
      activedescendant: trigger.getAttribute("aria-activedescendant"),
    };

    await user.click(trigger);
    const listbox = screen.getByRole("listbox");
    const active = document.getElementById(trigger.getAttribute("aria-activedescendant"));
    const open = {
      expanded: trigger.getAttribute("aria-expanded"),
      // aria-controls resolves to the open listbox…
      controlsIsListbox: document.getElementById(trigger.getAttribute("aria-controls")) === listbox,
      listboxRole: listbox.getAttribute("role"),
      listboxNamedBy: listbox.getAttribute("aria-labelledby") === trigger.getAttribute("aria-labelledby"),
      // …and aria-activedescendant resolves to an option row inside it.
      activeIsOptionInListbox: !!active && active.getAttribute("role") === "option" && listbox.contains(active),
      optionsAllHaveSelected: within(listbox).getAllByRole("option").every((o) => o.hasAttribute("aria-selected")),
    };
    await user.keyboard("{Escape}");
    return { closed, open };
  }

  it("matches on every ARIA attribute of the contract", async () => {
    const { user } = await renderApp();

    await gotoTab(user, "KEY");
    const key = await contractOf(user, /Drill category/);

    await gotoTab(user, "COPY");
    const copy = await contractOf(user, /What to copy/);

    // Sanity: the two are genuinely different controls with different labels…
    expect(key.closed.labelText).toBe("Drill category — climb as you improve");
    expect(copy.closed.labelText).toBe("What to copy — climb as you improve");

    // …and identical in every other respect.
    expect(copy.closed).toEqual({ ...key.closed, labelText: copy.closed.labelText });
    expect(copy.open).toEqual(key.open);

    // Pin the actual contract values, so this can't pass by both sides being
    // equally wrong (e.g. both losing role="combobox").
    expect(copy.closed).toMatchObject({
      tag: "BUTTON", role: "combobox", haspopup: "listbox",
      expanded: "false", namedBy: true, activedescendant: null,
    });
    expect(copy.open).toMatchObject({
      expanded: "true", controlsIsListbox: true, listboxRole: "listbox",
      listboxNamedBy: true, activeIsOptionInListbox: true, optionsAllHaveSelected: true,
    });
  });
});
