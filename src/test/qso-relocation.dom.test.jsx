// @vitest-environment jsdom
//
// RELOCATION net for QSO Phase 1 (menus → options rail).
//
// The baseline qso.dom.test.jsx asserts the QSO controls EXIST by role/text —
// but that passes whether they render inline or in the rail. This file asserts
// WHERE they render, which is the actual behavior Phase 1 changed:
//
//   WIDE  : Activity / Role / Conditions / start live INSIDE the options rail
//           (<aside aria-label="Options"> → role=complementary), reached via the
//           createPortal into railEl; the exchange surface stays in <main>.
//   NARROW: the same controls render inline (no rail mounted at all).
//
// These are mutation-meaningful: scoping the wide assertion to within(rail) means
// it FAILS if the portal stops targeting the rail (e.g. options render inline in
// main, or railEl is dropped). The narrow assertion fails if the rail is mounted
// or the options vanish. Together they pin the portal-to-rail wiring, not just
// "the control is somewhere on the page."

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, gotoTab } from "./helpers.jsx";
import CWTrainer from "../../wr-cw-trainer.jsx";

describe("QSO relocation — WIDE: options live in the rail, exchange in main", () => {
  // The shared setup.dom.js mocks matchMedia matches:true (wide), so renderApp
  // gives the wide arrangement directly.
  it("portals Activity / Role / Conditions / start into the Options rail", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    // The rail must be mounted on wide.
    const rail = screen.getByRole("complementary", { name: "Options" });

    // The QSO setup controls are reachable from WITHIN the rail — proving the
    // portal targets railEl, not the main column. within() scoping is what makes
    // this fail if the portal regressed to inline rendering.
    expect(within(rail).getByText("Activity")).toBeInTheDocument();
    expect(within(rail).getByText("Role")).toBeInTheDocument();
    expect(within(rail).getByText("Conditions")).toBeInTheDocument();
    expect(
      within(rail).getByRole("button", { name: /CALL CQ|LISTEN FOR CQ/ }),
    ).toBeInTheDocument();
    // A representative activity option also lives in the rail.
    expect(within(rail).getByRole("button", { name: /Ragchew/ })).toBeInTheDocument();
  });

  it("keeps the QSO setup controls OUT of <main> on wide (they are in the rail)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    // The Activity heading must NOT be found inside <main> — it was relocated to
    // the rail. (The intro panel stays in main per design §5, but the setup
    // cluster does not.) This is the direct mutation guard: if the portal failed
    // and options fell back to inline-in-main, this assertion fails.
    const main = screen.getByRole("main");
    expect(within(main).queryByText("Activity")).not.toBeInTheDocument();
    expect(within(main).queryByText("Role")).not.toBeInTheDocument();
    expect(
      within(main).queryByRole("button", { name: /CALL CQ|LISTEN FOR CQ/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps <main> before the Options rail in DOM/reading order", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    const main = screen.getByRole("main");
    const rail = screen.getByRole("complementary", { name: "Options" });
    // The practice surface (main) must precede the options rail in document order
    // so AT/keyboard reaches practice before setup (design §6). compareDocument-
    // Position: DOCUMENT_POSITION_FOLLOWING (4) means rail comes AFTER main.
    expect(main.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps both QSO live regions mounted in main on wide (ungated by isWide)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");
    const main = screen.getByRole("main");
    // stepLive + resultLive are sr-only role=status regions at the top of QsoSim,
    // which renders in main. They must be present on wide (never layout-gated).
    expect(within(main).getAllByRole("status").length).toBeGreaterThanOrEqual(2);
  });

  it("starts the QSO from the rail control and renders the exchange in main", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    const rail = screen.getByRole("complementary", { name: "Options" });
    // Start from the control that lives in the rail (default Ragchew/answer).
    await user.click(within(rail).getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ }));

    // Setup controls are gone once the QSO is live (no `!qso` block renders).
    expect(screen.queryByText("Activity")).not.toBeInTheDocument();
    // The two always-mounted live regions remain in the DOM in the live flow.
    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(2);
  });

  // v2.0 §3: when a contact is active, the rail shows context (In contact / DX /
  // Difficulty / Step) instead of the setup options. The blank-rail bug fix.
  it("shows context panel in the rail once a QSO starts (v2.0 §3)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(within(rail).getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ }));

    // Rail must now show context headings — NOT the setup options
    expect(within(rail).getByText("In contact")).toBeInTheDocument();
    expect(within(rail).getByText("DX")).toBeInTheDocument();
    expect(within(rail).getByText("Difficulty")).toBeInTheDocument();
    expect(within(rail).getByText("Step")).toBeInTheDocument();

    // Setup controls must be gone from the rail
    expect(within(rail).queryByText("Activity")).not.toBeInTheDocument();
    expect(within(rail).queryByText("Role")).not.toBeInTheDocument();
    expect(within(rail).queryByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ })).not.toBeInTheDocument();
  });
});

describe("QSO relocation — NARROW: options render inline, no rail", () => {
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

  it("renders Activity / Role / Conditions / start inline with no Options rail", async () => {
    const { user } = await renderNarrow();
    await user.click(screen.getByRole("button", { name: "QSO" }));

    // The rail must NOT be mounted on narrow.
    expect(screen.queryByRole("complementary", { name: "Options" })).not.toBeInTheDocument();

    // The same setup controls are present inline (in the single column / main).
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("Role")).toBeInTheDocument();
    expect(screen.getByText("Conditions")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /CALL CQ|LISTEN FOR CQ/ }),
    ).toBeInTheDocument();

    // And they are inside <main> (inline path), confirming the narrow branch did
    // not portal them away.
    const main = screen.getByRole("main");
    expect(within(main).getByText("Activity")).toBeInTheDocument();
  });
});
