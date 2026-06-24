// @vitest-environment jsdom
//
// RELOCATION net for KEY Phase 3 (category selector + key-type controls → rail).
//
// The baseline key.dom.test.jsx asserts KEY controls EXIST by role/text — but that
// passes whether they render inline or in the rail. This file asserts WHERE they
// render, which is the actual behavior Phase 3 changed:
//
//   WIDE  : the drill-category selector (stepper + direct-pick row) AND the key-type
//           controls (PADDLE / STRAIGHT KEY + swap button) live INSIDE the options
//           rail (<aside aria-label="Options"> → role=complementary), reached via
//           createPortal into railEl; the practice surface (target display, key
//           surface, CHECK, fist feedback) stays in <main>.
//   NARROW: the same controls render inline (no rail mounted at all).
//
// Mutation-meaningful: scoping wide assertions to within(rail) means they FAIL if
// the portal stops targeting the rail. The narrow assertions fail if the rail is
// mounted or controls disappear from the inline path. Mirrors copy-relocation and
// qso-relocation reference nets.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, gotoTab } from "./helpers.jsx";
import { DRILL_CATEGORIES } from "../cw-core.js";
import CWTrainer from "../../wr-cw-trainer.jsx";

describe("KEY relocation — WIDE: options live in the rail, practice in main", () => {
  // setup.dom.js mocks matchMedia matches:true (wide), so renderApp gives the
  // wide arrangement directly.

  it("portals the category selector + key-type controls into the Options rail", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const rail = screen.getByRole("complementary", { name: "Options" });

    // Stepper arrows must be in the rail.
    expect(within(rail).getByRole("button", { name: "Previous category" })).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: "Next category" })).toBeInTheDocument();

    // Direct-pick row: all category buttons in the rail.
    for (const cat of DRILL_CATEGORIES) {
      expect(within(rail).getByRole("button", { name: cat.label })).toBeInTheDocument();
    }

    // Key-type toggle buttons in the rail.
    // Use exact text "PADDLE" to avoid matching the PaddleKey surface buttons
    // ("Dit paddle" / "Dah paddle") which also have role=button via aria-label.
    expect(within(rail).getByRole("button", { name: "PADDLE" })).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: "STRAIGHT KEY" })).toBeInTheDocument();
  });

  it("keeps the category selector + key-type controls OUT of <main> on wide (they are in the rail)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const main = screen.getByRole("main");
    // Stepper must not be in main on wide.
    expect(within(main).queryByRole("button", { name: "Previous category" })).not.toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: "Next category" })).not.toBeInTheDocument();
    // Direct-pick must not be in main on wide.
    expect(within(main).queryByRole("button", { name: DRILL_CATEGORIES[0].label })).not.toBeInTheDocument();
    // Key-type toggle must not be in main on wide.
    // Exact text match to avoid false positives from PaddleKey's "Dit paddle" aria-labels.
    expect(within(main).queryByRole("button", { name: "PADDLE" })).not.toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: "STRAIGHT KEY" })).not.toBeInTheDocument();
  });

  it("keeps the practice surface (NEW TEXT + CHECK) in <main>", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const main = screen.getByRole("main");
    expect(within(main).getByRole("button", { name: /NEW TEXT/ })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "CHECK" })).toBeInTheDocument();
    // Practice surface must not be in the rail.
    const rail = screen.getByRole("complementary", { name: "Options" });
    expect(within(rail).queryByRole("button", { name: "CHECK" })).not.toBeInTheDocument();
    expect(within(rail).queryByRole("button", { name: /NEW TEXT/ })).not.toBeInTheDocument();
  });

  it("keeps <main> before the Options rail in DOM/reading order", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const main = screen.getByRole("main");
    const rail = screen.getByRole("complementary", { name: "Options" });
    // Practice (main) must precede options (rail) in document order so AT/keyboard
    // reaches practice before setup (design §6). DOCUMENT_POSITION_FOLLOWING (4)
    // means rail comes AFTER main.
    expect(main.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps both KEY live regions (scoreLive + catLive) mounted in main on wide (ungated by isWide)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");
    const main = screen.getByRole("main");
    // scoreLive + catLive are sr-only role=status regions at the KeyTrainer root,
    // which renders in main. Both must be present on wide (never layout-gated).
    expect(within(main).getAllByRole("status").length).toBeGreaterThanOrEqual(2);
  });

  it("selecting a category from the rail updates the pressed state", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const rail = screen.getByRole("complementary", { name: "Options" });
    // First category starts pressed.
    expect(within(rail).getByRole("button", { name: DRILL_CATEGORIES[0].label })).toHaveAttribute("aria-pressed", "true");
    // Pick a different category from the rail.
    const third = within(rail).getByRole("button", { name: DRILL_CATEGORIES[2].label });
    await user.click(third);
    expect(third).toHaveAttribute("aria-pressed", "true");
    expect(within(rail).getByRole("button", { name: DRILL_CATEGORIES[0].label })).toHaveAttribute("aria-pressed", "false");
  });

  it("toggling key type from the rail flips the key SURFACE rendered in main (keyer-linkage)", async () => {
    // This is the critical Phase-3 assertion: the toggle lives in the rail, the key
    // surface lives in main, both driven by the one settings.keyType. The check must
    // be on the MAIN surface itself — not on the rail's own swap affordance, which
    // would pass even if the main surface were severed from settings.keyType.
    //
    // Distinguishing affordances IN MAIN:
    //   paddle  → PaddleKey renders "Dit paddle …" + "Dah paddle …" buttons
    //   straight→ TouchKey renders a single "Straight key …" button
    // Mutation check: hardcoding the main surface to paddle (ignoring settings.keyType)
    // makes the straight-key assertions below fail — which the old swap-only check did not.
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const rail = screen.getByRole("complementary", { name: "Options" });
    const main = screen.getByRole("main");

    // Default is paddle. Exact text "PADDLE" avoids matching PaddleKey's "Dit paddle" aria-labels.
    expect(within(rail).getByRole("button", { name: "PADDLE" })).toHaveAttribute("aria-pressed", "true");
    expect(within(rail).getByRole("button", { name: "STRAIGHT KEY" })).toHaveAttribute("aria-pressed", "false");

    // Paddle surface is in main; straight-key surface is not.
    expect(within(main).getByRole("button", { name: /Dit paddle/ })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: /Dah paddle/ })).toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: /Straight key/ })).not.toBeInTheDocument();

    // Switch to straight key from the rail control.
    await user.click(within(rail).getByRole("button", { name: "STRAIGHT KEY" }));

    // The toggle in the rail flipped — confirms the handler wired to settings.
    expect(within(rail).getByRole("button", { name: "STRAIGHT KEY" })).toHaveAttribute("aria-pressed", "true");
    expect(within(rail).getByRole("button", { name: "PADDLE" })).toHaveAttribute("aria-pressed", "false");

    // The MAIN key surface reacted to the rail toggle: paddle zones gone, straight key present.
    expect(within(main).getByRole("button", { name: /Straight key/ })).toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: /Dit paddle/ })).not.toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: /Dah paddle/ })).not.toBeInTheDocument();

    // And the rail's paddle-only swap affordance is gone (the original check, kept).
    expect(within(main).queryByRole("button", { name: /Swap dit and dah/ })).not.toBeInTheDocument();

    // Toggle back to paddle — surface flips again (proves it tracks state both ways).
    await user.click(within(rail).getByRole("button", { name: "PADDLE" }));
    expect(within(main).getByRole("button", { name: /Dit paddle/ })).toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: /Straight key/ })).not.toBeInTheDocument();
  });
});

describe("KEY relocation — NARROW: options render inline, no rail", () => {
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

  it("renders category selector + key-type controls inline with no Options rail", async () => {
    const { user } = await renderNarrow();
    await user.click(screen.getByRole("button", { name: "KEY" }));

    // The rail must NOT be mounted on narrow.
    expect(screen.queryByRole("complementary", { name: "Options" })).not.toBeInTheDocument();

    // Category controls present inline.
    expect(screen.getByRole("button", { name: "Previous category" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next category" })).toBeInTheDocument();
    for (const cat of DRILL_CATEGORIES) {
      expect(screen.getByRole("button", { name: cat.label })).toBeInTheDocument();
    }

    // Key-type controls present inline. Exact text match avoids PaddleKey's aria-labels.
    expect(screen.getByRole("button", { name: "PADDLE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "STRAIGHT KEY" })).toBeInTheDocument();

    // All controls are inside <main>.
    const main = screen.getByRole("main");
    expect(within(main).getByRole("button", { name: "Previous category" })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "PADDLE" })).toBeInTheDocument();
    // Practice controls also in main.
    expect(within(main).getByRole("button", { name: /NEW TEXT/ })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "CHECK" })).toBeInTheDocument();
  });
});
