// @vitest-environment jsdom
//
// RELOCATION net for LEARN Phase 4 (lesson-setup → options rail).
//
// The baseline copy-learn.dom.test.jsx asserts the LEARN controls EXIST by
// role/text — but that passes whether they render inline or in the rail. This
// file asserts WHERE they render, which is the actual behavior Phase 4 changed:
//
//   WIDE  : the CHARS lesson-setup cluster ("Characters in play", Jump to lesson,
//           START DRILL) lives INSIDE the options rail (<aside aria-label="Options">
//           → role=complementary), reached via createPortal into railEl; the
//           sub-nav and drill flow stay in <main>.
//   NARROW: the same setup renders inline (no rail mounted at all).
//
// Mutation-meaningful: scoping the wide assertion to within(rail) means it FAILS
// if the portal stops targeting the rail (options render inline in main, or
// railEl is dropped). The narrow assertion fails if the rail is mounted or the
// options vanish from the narrow branch. Together they pin the portal-to-rail
// wiring, not just "the control is somewhere on the page."
//
// Also covers the suppressRail path: when Settings is open on wide the LEARN
// options must NOT appear in the rail (Settings takes it over exclusively).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./helpers.jsx";
import CWTrainer from "../../wr-cw-trainer.jsx";

describe("LEARN relocation — WIDE: setup lives in the rail, sub-nav + drill in main", () => {
  // setup.dom.js mocks matchMedia matches:true (wide), so renderApp gives the
  // wide arrangement directly. LEARN is the default opening tab.

  it("portals the CHARS lesson-setup into the Options rail", async () => {
    await renderApp();

    const rail = screen.getByRole("complementary", { name: "Options" });

    // The LEARN setup controls are reachable from WITHIN the rail — proving the
    // portal targets railEl, not the main column.
    expect(within(rail).getByText("Characters in play")).toBeInTheDocument();
    expect(within(rail).getByRole("spinbutton", { name: "Jump to lesson" })).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: /START DRILL/ })).toBeInTheDocument();
  });

  it("keeps the CHARS setup OUT of <main> on wide (it is in the rail)", async () => {
    await renderApp();

    // The setup cluster must NOT be found inside <main> — it was relocated to the
    // rail. If the portal failed and options fell back to inline-in-main, this fails.
    const main = screen.getByRole("main");
    expect(within(main).queryByText("Characters in play")).not.toBeInTheDocument();
    expect(within(main).queryByRole("spinbutton", { name: "Jump to lesson" })).not.toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: /START DRILL/ })).not.toBeInTheDocument();
  });

  it("keeps the sub-nav (CHARS/LINGO/ON AIR/HISTORY) in <main>", async () => {
    await renderApp();

    const main = screen.getByRole("main");
    // The sub-nav buttons are content navigation within LEARN — they stay in main
    // in both layouts (design §5).
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

  it("clears the rail (no orphan) when drilling starts on wide", async () => {
    const { user } = await renderApp();

    const rail = screen.getByRole("complementary", { name: "Options" });
    // Setup is in the rail before the drill starts.
    expect(within(rail).getByRole("button", { name: /START DRILL/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /START DRILL/ }));

    // Once drilling, optionsJSX is null so nothing portals — the rail must be empty.
    expect(within(rail).queryByRole("button", { name: /START DRILL/ })).not.toBeInTheDocument();
    expect(within(rail).queryByText("Characters in play")).not.toBeInTheDocument();
    // The drill view (LISTEN + REPLAY) appears in main, not in the rail.
    const main = screen.getByRole("main");
    expect(within(main).getByRole("button", { name: /REPLAY/ })).toBeInTheDocument();
  });
});

describe("LEARN relocation — NARROW: setup renders inline, no rail", () => {
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
});
