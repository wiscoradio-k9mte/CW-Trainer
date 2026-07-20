// @vitest-environment jsdom
//
// Zone-system attribution — a HAM-FACT regression net.
//
// The trainer teaches three easily-confused zone systems (3 ITU regions /
// 40 CQ zones / 90 ITU zones) in two places: the LINGO glossary entries and the
// ON AIR "Zone systems, disambiguated" panel. Before 2.4.0 BOTH said the 90 ITU
// zones were "used in the WAZ award" — which is wrong, and wrong inside a panel
// whose whole job is disambiguating these systems.
//
// The facts these tests pin, with sources:
//   * WAZ (Worked All Zones) is a CQ Magazine award based on the 40 CQ ZONES.
//     - https://cq-amateur-radio.com/cq_awards/cq_waz_awards/index_cq_waz_award.html
//     - https://cqww.com/cq_waz_list.htm
//     - https://www.arrl.org/news/lotw-support-for-cq-worked-all-zones-waz-award-goes-live
//   * The 90 ITU ZONES are used by the IARU HF World Championship exchange and
//     its per-ITU-zone certificates.
//     - https://contests.arrl.org/ContestRules/IARU-HF-Rules.pdf
//
// These assert BOTH directions on purpose: that WAZ is attributed to the CQ
// zones, AND that it is NOT attributed to the ITU zones. A one-directional test
// would stay green if someone re-added "WAZ" to the ITU line.

import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderApp, gotoTab } from "./helpers.jsx";

// Open LEARN and switch to one of its sub-guides (CHARS / LINGO / ON AIR / HISTORY).
async function gotoGuide(user, label) {
  await gotoTab(user, "LEARN");
  await user.click(screen.getByRole("button", { name: label }));
}

// The zone panel lives under ON AIR → WORK DX (OnAirGuide's `dx` sub-guide).
async function gotoOnAirDx(user) {
  await gotoGuide(user, "ON AIR");
  await user.click(screen.getByRole("button", { name: "WORK DX" }));
}

// LINGO groups its terms into collapsible categories; the zone entries live in
// "CONTEST & ZONES", which is collapsed by default. Expand it.
async function gotoLingoZones(user) {
  await gotoGuide(user, "LINGO");
  const toggle = [...document.querySelectorAll("button")]
    .find(b => /CONTEST & ZONES/i.test(b.textContent));
  if (!toggle) throw new Error("LINGO 'CONTEST & ZONES' category not found");
  await user.click(toggle);
}

// The text of the entry (<li>/<div>/<p>) that contains `needle` AND its
// surrounding description — searched across the whole document so the test
// doesn't depend on layout or nesting.
//
// Two traps this helper exists to avoid, both hit for real while writing it:
//   1. The headline term is wrapped in its own colored <span> whose text is
//      EXACTLY the term ("90 ITU zones"). It's the shortest match but carries no
//      attribution — picking it would make the assertions vacuously pass.
//   2. The entries CROSS-REFERENCE each other: the ITU entry ends "...Different
//      numbering from the 40 CQ zones", so a plain `includes("40 CQ zones")`
//      matches the ITU line too — and it's the shorter of the two, so it wins a
//      shortest-match sort. That would have asserted the WRONG line.
// So: require the entry to START with the term (that's the entry's own headline),
// and to carry real description text after it.
function lineContaining(term) {
  // <span> is included because LINGO renders each definition in one; the
  // startsWith + length anchors above are what keep trap 1 from biting.
  const hit = [...document.querySelectorAll("li, div, p, span")]
    .filter(n => n.textContent.trim().startsWith(term))
    .filter(n => n.textContent.trim().length > term.length + 20)
    // innermost such element — the entry itself, not an outer container
    .sort((a, b) => a.textContent.length - b.textContent.length)[0];
  return hit ? hit.textContent : "";
}

describe("zone systems — WAZ is a CQ-zone award, not an ITU-zone award", () => {
  it("ON AIR panel: the 40 CQ zones line credits WAZ", async () => {
    const { user } = await renderApp();
    await gotoOnAirDx(user);

    const cqLine = lineContaining("40 CQ zones");
    expect(cqLine).toMatch(/WAZ/);
    expect(cqLine).toMatch(/Worked All Zones/);
    expect(cqLine).toMatch(/CQ World Wide/);
  });

  it("ON AIR panel: the 90 ITU zones line credits IARU HF, and does NOT claim WAZ", async () => {
    const { user } = await renderApp();
    await gotoOnAirDx(user);

    const ituLine = lineContaining("90 ITU zones");
    expect(ituLine).toMatch(/IARU HF World Championship/);
    // The actual bug: WAZ must not be attached to the ITU zones.
    expect(ituLine).not.toMatch(/WAZ/);
    expect(ituLine).not.toMatch(/Worked All Zones/);
  });

  it("LINGO glossary: the CQ zone entry credits WAZ and the ITU zone entry does not", async () => {
    const { user } = await renderApp();
    await gotoLingoZones(user);

    const body = document.body.textContent;
    // Both glossary entries are present in the LINGO guide.
    expect(body).toMatch(/One of 40 geographic zones worldwide/);
    expect(body).toMatch(/One of 90 zones/);

    const cqEntry = lineContaining("One of 40 geographic zones worldwide");
    expect(cqEntry).toMatch(/WAZ \(Worked All Zones\)/);

    const ituEntry = lineContaining("One of 90 zones");
    expect(ituEntry).toMatch(/IARU HF World Championship/);
    expect(ituEntry).not.toMatch(/WAZ/);
  });

  it("nowhere in the app is WAZ described as an ITU-zone award", async () => {
    const { user } = await renderApp();
    for (const go of [gotoLingoZones, gotoOnAirDx]) {
      await go(user);
      const text = document.body.textContent;
      // Catch the specific false pairing in either word order.
      expect(text).not.toMatch(/ITU zones[^.]*WAZ/);
      expect(text).not.toMatch(/WAZ[^.]*ITU zones/);
    }
  });
});
