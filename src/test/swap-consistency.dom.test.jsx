// @vitest-environment jsdom
//
// SWAP-TOGGLE CONSISTENCY — KEY and QSO tabs.
//
// Design intent: in both KEY and QSO, the ⇄ R/L swap toggle sits clustered with
// the PADDLE / STRAIGHT KEY type selector, not floating above the key surface.
// This matches QSO's existing KeyInput pattern (toggle → swap → surface) and makes
// the layout consistent between tabs regardless of the rail/inline split.
//
// KEY tab (wide)  : type selector + swap both portal into the Options rail via optionsJSX.
// KEY tab (narrow): type selector + swap both render inline in main with optionsJSX.
// QSO tab         : type selector + swap both render in main via KeyInput (never portaled).
//
// Each test is written to BITE:
//   - If swap drifts back above the key surface in KEY (into practicePanels/main on wide),
//     the "swap in rail" and "swap NOT in main" assertions fail.
//   - If swap separates from the type selector on KEY narrow (e.g. moves to a different
//     container than PADDLE/STRAIGHT KEY), the co-location assertion fails.
//   - On QSO, if swap moves out of the exchange panel containing the type selector, the
//     co-location assertion fails.
//   - Straight key (no levers) correctly hides swap on both tabs.
//
// BUG key is shelved (BUG_KEY_ENABLED=false) so only PADDLE and STRAIGHT KEY are tested.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, gotoTab } from "./helpers.jsx";
import CWTrainer from "../../wr-cw-trainer.jsx";

// ---------------------------------------------------------------------------
// KEY tab — wide layout (matchMedia wide = true via setup.dom.js default)
// ---------------------------------------------------------------------------
describe("swap-toggle consistency — KEY tab wide", () => {
  it("swap toggle is in the Options rail alongside the type selector (paddle default)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const rail = screen.getByRole("complementary", { name: "Options" });
    // Both must be in the rail — they travel together via optionsJSX.
    expect(within(rail).getByRole("button", { name: "PADDLE" })).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: /Swap dit and dah/ })).toBeInTheDocument();
  });

  it("swap toggle is absent from <main> on wide (not above the key surface)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const main = screen.getByRole("main");
    // If this fails, swap drifted back into practicePanels — the regression we're guarding.
    expect(within(main).queryByRole("button", { name: /Swap dit and dah/ })).not.toBeInTheDocument();
  });

  it("swap toggle disappears from rail when type switches to STRAIGHT KEY", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");

    const rail = screen.getByRole("complementary", { name: "Options" });
    // Swap present for paddle.
    expect(within(rail).getByRole("button", { name: /Swap dit and dah/ })).toBeInTheDocument();

    // Switch to straight key — SwapToggle returns null (no levers to swap).
    await user.click(within(rail).getByRole("button", { name: "STRAIGHT KEY" }));
    expect(within(rail).queryByRole("button", { name: /Swap dit and dah/ })).not.toBeInTheDocument();
    // Also absent from main (it was never there on wide).
    const main = screen.getByRole("main");
    expect(within(main).queryByRole("button", { name: /Swap dit and dah/ })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// KEY tab — narrow layout
// ---------------------------------------------------------------------------
describe("swap-toggle consistency — KEY tab narrow", () => {
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

  it("swap toggle is in <main> alongside the type selector on narrow (no rail)", async () => {
    const { user } = await renderNarrow();
    await user.click(screen.getByRole("button", { name: "KEY" }));

    // No rail on narrow.
    expect(screen.queryByRole("complementary", { name: "Options" })).not.toBeInTheDocument();

    const main = screen.getByRole("main");
    // Both type selector and swap are inline in main — they travel together via optionsJSX.
    expect(within(main).getByRole("button", { name: "PADDLE" })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: /Swap dit and dah/ })).toBeInTheDocument();
  });

  it("swap toggle absent for STRAIGHT KEY on narrow", async () => {
    const { user } = await renderNarrow();
    await user.click(screen.getByRole("button", { name: "KEY" }));
    await user.click(screen.getByRole("button", { name: "STRAIGHT KEY" }));

    expect(screen.queryByRole("button", { name: /Swap dit and dah/ })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// QSO tab — swap co-located with type selector in main (both wide and narrow)
// ---------------------------------------------------------------------------
describe("swap-toggle consistency — QSO tab", () => {
  // QSO always renders KeyInput inline in the exchange panel (never portaled to the rail).
  // Swap and type selector are always together in main, regardless of layout width.

  // 2.4.1: the first step of the default Ragchew "Answer a CQ" contact is a DX
  // (copy) step, and the key block there now lives behind the BREAK IN disclosure.
  // These tests therefore arm break-in first. The contract under test is unchanged
  // — swap stays clustered with the type selector, in main, never in the rail —
  // only its container moved behind a disclosure.
  async function startQso(user) {
    await gotoTab(user, "QSO");
    // KeyInput only renders once a QSO is active. Start with the default Ragchew role.
    const startBtn = screen.getByRole("button", { name: /CALL CQ|LISTEN FOR CQ/ });
    await user.click(startBtn);
  }

  async function armBreakIn(user) {
    await user.click(screen.getByRole("button", { name: /BREAK IN — ASK FOR A REPEAT/ }));
  }

  it("type selector and swap are both in <main> on QSO wide (exchange panel, not the rail)", async () => {
    const { user } = await renderApp();
    await startQso(user);

    const main = screen.getByRole("main");
    const rail = screen.getByRole("complementary", { name: "Options" });

    // ADDED (2.4.1, strictly stronger): at rest on a DX step the key block is
    // collapsed, so neither control is on screen. This pins the M1 contract —
    // step 1 presents ONE prominent input, the copy field.
    expect(within(main).queryByRole("button", { name: "PADDLE" })).not.toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: /Swap dit and dah/ })).not.toBeInTheDocument();

    await armBreakIn(user);

    // KeyInput renders in main — both controls are there together.
    // Exact text "PADDLE" avoids matching the PaddleKey surface buttons.
    expect(within(main).getByRole("button", { name: "PADDLE" })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: /Swap dit and dah/ })).toBeInTheDocument();

    // The rail must NOT hold either (context panel is there during a QSO, not the type selector).
    expect(within(rail).queryByRole("button", { name: "PADDLE" })).not.toBeInTheDocument();
    expect(within(rail).queryByRole("button", { name: /Swap dit and dah/ })).not.toBeInTheDocument();
  });

  it("swap absent for STRAIGHT KEY in QSO", async () => {
    const { user } = await renderApp();
    await startQso(user);
    await armBreakIn(user);

    // Switch to straight key — swap must disappear.
    const main = screen.getByRole("main");
    await user.click(within(main).getByRole("button", { name: "STRAIGHT KEY" }));
    expect(within(main).queryByRole("button", { name: /Swap dit and dah/ })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Cross-tab: KEY and QSO both cluster swap with the type selector (the core
// consistency contract). Fails if KEY's swap drifts back above the key surface
// while QSO's stays grouped with the selector (or vice versa).
// ---------------------------------------------------------------------------
describe("swap-toggle consistency — cross-tab contract", () => {
  async function startQso(user) {
    await gotoTab(user, "QSO");
    const startBtn = screen.getByRole("button", { name: /CALL CQ|LISTEN FOR CQ/ });
    await user.click(startBtn);
  }

  it("both KEY and QSO show swap adjacent to type selector (same session, wide)", async () => {
    const { user } = await renderApp();

    // KEY: type selector + swap both in the rail.
    await gotoTab(user, "KEY");
    const rail = screen.getByRole("complementary", { name: "Options" });
    expect(within(rail).getByRole("button", { name: "PADDLE" })).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: /Swap dit and dah/ })).toBeInTheDocument();
    // Swap must NOT have drifted into main.
    const main = screen.getByRole("main");
    expect(within(main).queryByRole("button", { name: /Swap dit and dah/ })).not.toBeInTheDocument();

    // QSO: type selector + swap both in main (exchange panel), behind the 2.4.1
    // BREAK IN disclosure on a DX step.
    await startQso(user);
    await user.click(screen.getByRole("button", { name: /BREAK IN — ASK FOR A REPEAT/ }));
    const main2 = screen.getByRole("main");
    expect(within(main2).getByRole("button", { name: "PADDLE" })).toBeInTheDocument();
    expect(within(main2).getByRole("button", { name: /Swap dit and dah/ })).toBeInTheDocument();
  });
});
