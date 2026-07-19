// @vitest-environment jsdom
//
// Phase 1 — International / DX: LEARN + KEY surface tests.
//
// What this locks:
//   KEY: the five new DX drill categories are present in the picker and
//        are selectable (aria-pressed toggles, a target is produced).
//   LEARN LINGO: the three new DX glossary categories expand and show terms.
//   LEARN ON AIR: the "WORK DX" guide button appears and the DX walkthrough
//                 renders with the worked-example content.
//
// findByText and findByRole strategy:
//   RTL's findBy* wraps queryBy* in waitFor — it retries on BOTH "not found"
//   AND "multiple elements" until timeout.  For elements that appear in many
//   ancestor containers (any regex on VK2XX, DXpedition, etc.) we use one of:
//     a) findByRole with an exact aria-label (one element per LINGO term button)
//     b) findByText with a string that is the EXACT text content of a leaf div
//        (parent divs have more text, so exact-match finds only the one leaf)
//     c) findAllByText (resolves as soon as ≥1 match appears; never retries on
//        multiple) when we just need to confirm the content is present at all.

import { describe, it, expect } from "vitest";
import { renderApp, gotoTab, chooseOption, screen } from "./helpers.jsx";

// ---- KEY: new DX drill categories ----
//
// The direct-pick row became a CompactSelect dropdown; the five DX categories are
// now role=option rows inside it. Selecting one commits via the combobox (the
// trigger then reflects the chosen category), equal-or-stronger than the old
// aria-pressed button assertion.

describe("KEY tab — DX drill categories present", () => {
  it("all five DX categories appear in the drill-category dropdown", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    await user.click(screen.getByRole("combobox", { name: /Drill category/ }));
    const expected = [
      "DX callsigns",
      "DX exchanges",
      "Contest fragments",
      "Split & pileup",
      "Abroad callsigns",
    ];
    for (const label of expected) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
  });
});

describe("KEY tab — DX category selectable and produces a target", () => {
  it("'DX callsigns' can be picked and NEW TEXT produces a non-empty target", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const trigger = await chooseOption(user, /Drill category/, "DX callsigns");
    expect(trigger).toHaveTextContent("DX callsigns");

    // Before: placeholder present.
    expect(screen.getByText("press NEW TEXT")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));

    // After: placeholder gone — a real DX target now occupies the display.
    expect(screen.queryByText("press NEW TEXT")).not.toBeInTheDocument();
  });

  it("'DX exchanges' category produces a target that clears the placeholder", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    await chooseOption(user, /Drill category/, "DX exchanges");
    await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));

    // The display must contain something — DX exchange targets are never blank.
    expect(screen.queryByText("press NEW TEXT")).not.toBeInTheDocument();
  });

  it("'Contest fragments' category is selectable", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const trigger = await chooseOption(user, /Drill category/, "Contest fragments");
    expect(trigger).toHaveTextContent("Contest fragments");
  });

  it("'Split & pileup' category is selectable", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const trigger = await chooseOption(user, /Drill category/, "Split & pileup");
    expect(trigger).toHaveTextContent("Split & pileup");
  });

  it("'Abroad callsigns' category is selectable", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const trigger = await chooseOption(user, /Drill category/, "Abroad callsigns");
    expect(trigger).toHaveTextContent("Abroad callsigns");
  });
});

// ---- LEARN LINGO: DX glossary categories ----

describe("LEARN LINGO — DX glossary categories present and expandable", () => {
  it("'DX essentials' category is present in the LINGO accordion", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN");
    await user.click(screen.getByRole("button", { name: "LINGO" }));

    expect(screen.getByRole("button", { name: /DX ESSENTIALS/i })).toBeInTheDocument();
  });

  it("'DX essentials' expands and shows DXpedition term button", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN");
    await user.click(screen.getByRole("button", { name: "LINGO" }));
    await user.click(screen.getByRole("button", { name: /DX ESSENTIALS/i }));

    // The LINGO item button has aria-label="Hear DXpedition in Morse" — unique, one per term.
    // findByRole doesn't retry-to-timeout on multiple matches; it expects exactly one.
    expect(
      await screen.findByRole("button", { name: "Hear DXpedition in Morse" })
    ).toBeInTheDocument();
  });

  it("'Contest & zones' category is present and expands to show CQ zone term", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN");
    await user.click(screen.getByRole("button", { name: "LINGO" }));
    await user.click(screen.getByRole("button", { name: /CONTEST & ZONES/i }));

    expect(
      await screen.findByRole("button", { name: "Hear CQ zone in Morse" })
    ).toBeInTheDocument();
  });

  it("'Operating abroad' category is present and expands to show CEPT term", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN");
    await user.click(screen.getByRole("button", { name: "LINGO" }));
    await user.click(screen.getByRole("button", { name: /OPERATING ABROAD/i }));

    expect(
      await screen.findByRole("button", { name: "Hear CEPT in Morse" })
    ).toBeInTheDocument();
  });
});

// ---- LEARN ON AIR: DX guide ----

describe("LEARN ON AIR — DX guide renders the worked example", () => {
  it("'WORK DX' button appears in the ON AIR sub-nav", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN");
    await user.click(screen.getByRole("button", { name: "ON AIR" }));

    expect(screen.getByRole("button", { name: "WORK DX" })).toBeInTheDocument();
  });

  it("clicking WORK DX renders the DX walkthrough panel", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN");
    await user.click(screen.getByRole("button", { name: "ON AIR" }));
    await user.click(screen.getByRole("button", { name: "WORK DX" }));

    // "A complete DX contact, line by line" is a leaf <div> whose text content is
    // exactly this string.  Parent panels contain more text, so exact string matching
    // finds only the one element — no multiple-match ambiguity.
    expect(
      await screen.findByText("A complete DX contact, line by line")
    ).toBeInTheDocument();
  });

  it("DX guide explains 5NN as a convention, not an honest report", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN");
    await user.click(screen.getByRole("button", { name: "ON AIR" }));
    await user.click(screen.getByRole("button", { name: "WORK DX" }));

    // Wait for the guide to mount (panel heading is the unambiguous sentinel).
    await screen.findByText("A complete DX contact, line by line");
    // "convention" appears in the step-3 why paragraph (5NN is a near-universal convention...).
    // getAllByText resolves synchronously once the panel is confirmed present above.
    expect(screen.getAllByText(/convention/i).length).toBeGreaterThan(0);
  });

  it("DX guide explains QRZ? as the DX calling the next station, not a repeat request", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN");
    await user.click(screen.getByRole("button", { name: "ON AIR" }));
    await user.click(screen.getByRole("button", { name: "WORK DX" }));

    await screen.findByText("A complete DX contact, line by line");
    // The final walkthrough step's why-text uses "who's next?" to explain QRZ?.
    expect(screen.getAllByText(/who.*next/i).length).toBeGreaterThan(0);
  });

  it("DX guide states the simulator does not log contacts", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN");
    await user.click(screen.getByRole("button", { name: "ON AIR" }));
    await user.click(screen.getByRole("button", { name: "WORK DX" }));

    await screen.findByText("A complete DX contact, line by line");
    // The "Worked vs confirmed" footer explicitly says "does not log contacts".
    expect(screen.getAllByText(/does not log contacts/i).length).toBeGreaterThan(0);
  });
});
