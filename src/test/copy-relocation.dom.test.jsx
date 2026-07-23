// @vitest-environment jsdom
//
// RELOCATION net for COPY Phase 2 (menus → options rail).
//
// The baseline copy-learn.dom.test.jsx asserts the COPY controls EXIST by
// role/text — but that passes whether they render inline or in the rail. This
// file asserts WHERE they render, which is the actual behavior Phase 2 changed:
//
//   WIDE  : the level ladder ("What to copy — climb as you improve" + the six
//           rungs) and the Conditions (Easy / Normal / Real life) selector live
//           INSIDE the options rail (<aside aria-label="Options"> →
//           role=complementary), reached via createPortal into railEl; the
//           practice surface (▶ NEW / answer input / CHECK / CharDiff / session
//           score) stays in <main>.
//   NARROW: the same options render inline (no rail mounted at all).
//
// Mutation-meaningful: scoping the wide assertion to within(rail) means it FAILS
// if the portal stops targeting the rail (options render inline in main, or
// railEl is dropped). The narrow assertion fails if the rail is mounted or the
// options vanish from the narrow branch. Together they pin the portal-to-rail
// wiring — not just "the control is somewhere on the page." Mirrors the QSO
// reference net (qso-relocation.dom.test.jsx).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, gotoTab } from "./helpers.jsx";
import CWTrainer from "../../wr-cw-trainer.jsx";

describe("COPY relocation — WIDE: options live in the rail, practice in main", () => {
  // setup.dom.js mocks matchMedia matches:true (wide), so renderApp gives the
  // wide arrangement directly.
  it("portals the level ladder + Conditions into the Options rail", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const rail = screen.getByRole("complementary", { name: "Options" });

    // The COPY setup controls are reachable from WITHIN the rail — proving the
    // portal targets railEl, not the main column. within() scoping is what makes
    // this fail if the portal regressed to inline-in-main.
    expect(within(rail).getByText("What to copy — climb as you improve")).toBeInTheDocument();
    expect(within(rail).getByText("Conditions")).toBeInTheDocument();
    // The level ladder is now a CompactSelect too; open it and confirm its rungs
    // are reachable from within the rail (proving the portal targets railEl).
    // Stronger than the old "a rung button exists" check: it asserts the rung's
    // selected state and its guidance description are both in the rail.
    const ladder = within(rail).getByRole("combobox", { name: /What to copy/ });
    await user.click(ladder);
    expect(within(rail).getByRole("option", { name: /1 character/ })).toHaveAttribute("aria-selected", "true");
    expect(within(rail).getByRole("option", { name: /Callsigns/ })).toHaveAttribute("aria-selected", "false");
    await user.keyboard("{Escape}");
    // Conditions is a CompactSelect combobox in the rail; open it to confirm its
    // options are reachable from within the rail (the portal targets railEl).
    await user.click(within(rail).getByRole("combobox", { name: "Conditions" }));
    for (const label of ["EASY", "NORMAL", "REAL LIFE"]) {
      expect(within(rail).getByRole("option", { name: label })).toBeInTheDocument();
    }
  });

  it("keeps the COPY setup controls OUT of <main> on wide (they are in the rail)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    // The level-ladder heading and Conditions must NOT be found inside <main> —
    // they were relocated to the rail. This is the direct mutation guard: if the
    // portal failed and options fell back to inline-in-main, this fails.
    const main = screen.getByRole("main");
    expect(within(main).queryByText("What to copy — climb as you improve")).not.toBeInTheDocument();
    expect(within(main).queryByText("Conditions")).not.toBeInTheDocument();
    // The level ladder combobox was relocated to the rail — not in main.
    expect(within(main).queryByRole("combobox", { name: /What to copy/ })).not.toBeInTheDocument();
    // The Conditions combobox was relocated to the rail — not in main.
    expect(within(main).queryByRole("combobox", { name: "Conditions" })).not.toBeInTheDocument();
  });

  it("keeps the practice surface (CHECK + answer input) in <main>", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const main = screen.getByRole("main");
    // The practice cluster stays in main in both layouts (design §5).
    expect(within(main).getByRole("textbox", { name: "Your copy" })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "CHECK" })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: /NEW/ })).toBeInTheDocument();
    // And the practice surface is NOT in the rail.
    const rail = screen.getByRole("complementary", { name: "Options" });
    expect(within(rail).queryByRole("button", { name: "CHECK" })).not.toBeInTheDocument();
  });

  it("keeps <main> before the Options rail in DOM/reading order", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const main = screen.getByRole("main");
    const rail = screen.getByRole("complementary", { name: "Options" });
    // Practice (main) must precede options (rail) in document order so AT/keyboard
    // reaches practice before setup (design §6). DOCUMENT_POSITION_FOLLOWING (4)
    // means rail comes AFTER main.
    expect(main.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the scoreLive region mounted in main on wide (ungated by isWide)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");
    const main = screen.getByRole("main");
    // scoreLive is an sr-only role=status region at the CopyTrainer root, which
    // renders in main. It must be present on wide (never layout-gated).
    expect(within(main).getAllByRole("status").length).toBeGreaterThanOrEqual(1);
  });

  it("selecting a level from the rail control updates the committed value", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const rail = screen.getByRole("complementary", { name: "Options" });
    const ladder = within(rail).getByRole("combobox", { name: /What to copy/ });
    // Default source is "single" (rung 1, "1 character") — read off the trigger,
    // which is the value a user actually sees when the menu is closed.
    expect(ladder).toHaveTextContent("1 — 1 character");
    // Commit a different rung from inside the rail — the handler closes over local
    // state, so selection works even though the control is portaled.
    await user.click(ladder);
    await user.click(within(rail).getByRole("option", { name: /Letter groups/ }));
    expect(ladder).toHaveTextContent("3 — Letter groups");
    // …and the selected state moved with it (re-open to inspect the rows).
    await user.click(ladder);
    expect(within(rail).getByRole("option", { name: /Letter groups/ })).toHaveAttribute("aria-selected", "true");
    expect(within(rail).getByRole("option", { name: /1 character/ })).toHaveAttribute("aria-selected", "false");
  });
});

describe("COPY relocation — NARROW: options render inline, no rail", () => {
  // Override matchMedia to narrow for this block only; the hook reads matchMedia
  // once on first render, so the override must precede render() (local renderer).
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
      dispatchEvent() {
        return false;
      },
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

  it("renders the level ladder + Conditions inline with no Options rail", async () => {
    const { user } = await renderNarrow();
    await user.click(screen.getByRole("button", { name: "COPY" }));

    // The rail must NOT be mounted on narrow.
    expect(screen.queryByRole("complementary", { name: "Options" })).not.toBeInTheDocument();

    // The same setup controls are present inline (in the single column / main).
    expect(screen.getByText("What to copy — climb as you improve")).toBeInTheDocument();
    expect(screen.getByText("Conditions")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /What to copy/ })).toHaveTextContent("1 — 1 character");

    // And they are inside <main> (inline path), confirming the narrow branch did
    // not portal them away. This fails if optionsJSX is dropped from the narrow
    // branch.
    const main = screen.getByRole("main");
    expect(within(main).getByText("What to copy — climb as you improve")).toBeInTheDocument();
    expect(within(main).getByText("Conditions")).toBeInTheDocument();
    // Practice surface is also inline in main on narrow.
    expect(within(main).getByRole("textbox", { name: "Your copy" })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "CHECK" })).toBeInTheDocument();
  });
});
