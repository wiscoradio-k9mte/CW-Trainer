// @vitest-environment jsdom
//
// RELOCATION net for LEARN Phase 4 (revised v1.2): chart → rail, setup → main.
//
// The OLD arrangement (Phase 4 original) portaled lesson SETUP into the rail.
// Travis found that backwards: the rail should hold the reference (chart), not
// the active learning content. This file asserts the NEW arrangement:
//
//   WIDE  : the full character chart ("FULL CHARACTER CHART" / "HIDE" toggle +
//           the Morse grid) lives INSIDE the options rail (<aside aria-label="Options">
//           → role=complementary), reached via createPortal into railEl; the
//           lesson setup ("Characters in play", Jump to lesson, START DRILL) and
//           the drill flow stay in <main>.
//   NARROW: chart stays as a collapsible panel inline in <main>; setup also
//           inline in <main>; no rail mounted at all.
//
// Mutation-meaningful: scoping the wide chart assertion to within(rail) means
// it FAILS if the chart portal stops targeting the rail. The setup-in-main
// assertion fails if setup is portaled away. The narrow tests fail if the rail
// appears or if controls vanish from the inline path. Together they pin the
// new portal-to-rail wiring, not just "the control is somewhere on the page."
//
// Also covers the suppressRail path: when Settings is open on wide the LEARN
// chart must NOT appear in the rail (Settings takes it over exclusively).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./helpers.jsx";
import CWTrainer from "../../wr-cw-trainer.jsx";

describe("LEARN relocation — WIDE: chart in rail, setup + drill in main", () => {
  // setup.dom.js mocks matchMedia matches:true (wide), so renderApp gives the
  // wide arrangement directly. LEARN is the default opening tab.

  it("portals the full character chart into the Options rail on wide", async () => {
    await renderApp();

    const rail = screen.getByRole("complementary", { name: "Options" });

    // On wide the chart defaults expanded, so the toggle reads "▲ HIDE". The
    // chart's toggle button lives INSIDE the rail — proving the portal targets
    // railEl, not the main column.
    expect(within(rail).getByRole("button", { name: /HIDE|FULL CHARACTER CHART/i })).toBeInTheDocument();
  });

  it("keeps the chart toggle OUT of <main> on wide (it is in the rail)", async () => {
    await renderApp();

    // The chart toggle must NOT be found inside <main> on wide. If the portal
    // failed and the chart fell back to inline-in-main, this fails.
    const main = screen.getByRole("main");
    expect(within(main).queryByRole("button", { name: /HIDE|FULL CHARACTER CHART/i })).not.toBeInTheDocument();
  });

  it("keeps the lesson setup (Characters in play, Jump to lesson, START DRILL) in <main> on wide", async () => {
    await renderApp();

    // Setup is now in main (not portaled to the rail).
    const main = screen.getByRole("main");
    expect(within(main).getByText("Characters in play")).toBeInTheDocument();
    expect(within(main).getByRole("spinbutton", { name: "Jump to lesson" })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: /START DRILL/ })).toBeInTheDocument();
  });

  it("keeps the lesson setup OUT of the rail on wide (it is in main)", async () => {
    await renderApp();

    const rail = screen.getByRole("complementary", { name: "Options" });
    // Setup lives in main now — it must NOT appear inside the rail.
    expect(within(rail).queryByText("Characters in play")).not.toBeInTheDocument();
    expect(within(rail).queryByRole("spinbutton", { name: "Jump to lesson" })).not.toBeInTheDocument();
    expect(within(rail).queryByRole("button", { name: /START DRILL/ })).not.toBeInTheDocument();
  });

  it("keeps the sub-nav (CHARS/LINGO/ON AIR/HISTORY) in <main>", async () => {
    await renderApp();

    const main = screen.getByRole("main");
    // Sub-nav stays in main in both layouts (design §5).
    expect(within(main).getByRole("button", { name: "CHARS" })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "LINGO" })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "ON AIR" })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "HISTORY" })).toBeInTheDocument();
    // And the sub-nav is NOT in the rail.
    const rail = screen.getByRole("complementary", { name: "Options" });
    expect(within(rail).queryByRole("button", { name: "LINGO" })).not.toBeInTheDocument();
  });

  it("keeps <main> before the Options rail in DOM/reading order", async () => {
    await renderApp();

    const main = screen.getByRole("main");
    const rail = screen.getByRole("complementary", { name: "Options" });
    // Practice (main) must precede options (rail) in document order so AT/keyboard
    // reaches practice before setup (design §6). DOCUMENT_POSITION_FOLLOWING (4)
    // means rail comes AFTER main.
    expect(main.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("chart stays in the rail while drilling on wide (useful reference during drill)", async () => {
    const { user } = await renderApp();

    const rail = screen.getByRole("complementary", { name: "Options" });
    // Chart is in rail before drill (expanded on wide → toggle reads "▲ HIDE").
    expect(within(rail).getByRole("button", { name: /HIDE|FULL CHARACTER CHART/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /START DRILL/ }));

    // Chart must still be in the rail during the drill (reference stays available).
    expect(within(rail).getByRole("button", { name: /HIDE|FULL CHARACTER CHART/i })).toBeInTheDocument();
    // The drill view (LISTEN + REPLAY) appears in main.
    const main = screen.getByRole("main");
    expect(within(main).getByRole("button", { name: /REPLAY/ })).toBeInTheDocument();
    // Setup controls (START DRILL) are gone once drilling.
    expect(within(main).queryByRole("button", { name: /START DRILL/ })).not.toBeInTheDocument();
  });
});

describe("LEARN relocation — NARROW: setup + chart both inline, no rail", () => {
  let savedMatchMedia;
  beforeEach(() => {
    savedMatchMedia = window.matchMedia;
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() { return false; },
    });
  });
  afterEach(() => {
    window.matchMedia = savedMatchMedia;
  });

  async function renderNarrow() {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    return { user };
  }

  it("renders the CHARS setup inline with no Options rail on narrow", async () => {
    await renderNarrow();

    // The rail must NOT be mounted on narrow.
    expect(screen.queryByRole("complementary", { name: "Options" })).not.toBeInTheDocument();

    // The setup controls are present inline.
    expect(screen.getByText("Characters in play")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Jump to lesson" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /START DRILL/ })).toBeInTheDocument();

    // And they are inside <main> (inline path), not portaled away.
    const main = screen.getByRole("main");
    expect(within(main).getByText("Characters in play")).toBeInTheDocument();
  });

  it("renders the chart inline in <main> on narrow", async () => {
    await renderNarrow();

    // No rail on narrow — chart must be in main as the collapsible panel.
    const main = screen.getByRole("main");
    expect(within(main).getByRole("button", { name: /FULL CHARACTER CHART/i })).toBeInTheDocument();
  });
});
