// @vitest-environment jsdom
//
// fix/a11y-labelname-h1 — two independent a11y defects, both fully code-verifiable:
//
//   A. WCAG 2.5.3 Label in Name (failure technique F96) — a sweep of the app's
//      aria-label uses found FIVE controls whose accessible name did not contain
//      the visible text a sighted (or speech-input) user actually reads:
//        1. COPY answer input   — aria-label="Your copy" dropped the rest of the
//           visible caption "Your copy — type what you hear".
//        2. "HEAR THE WHOLE CALL" button — "CQ" inserted between "whole" and
//           "call" broke the contiguous match.
//        3/4. Both "ABANDON CONTACT / back to setup" buttons (DX step + your-turn
//           step) — "this"/"and" inserted between "Abandon" and "contact".
//        5. "Close settings" (Done) button — the name never said "Done" at all.
//
//   B. No <h1> anywhere in the app — the top header ("CW TRAINER") is now a real
//      <h1>, reusing the S.head neutralisation recipe (zero the four UA heading
//      margins; fontWeight/fontSize/color were already explicit inline, so they
//      needed no change) so the rendered box is unchanged.
//
// Every assertion here uses the REAL computed accessible name (dom-accessibility-api,
// the same engine Testing Library's role queries use under the hood) — not the raw
// aria-label string — so a regression that reintroduces a mismatch is caught even
// if some future edit routes the name through aria-labelledby instead.

import { describe, it, expect } from "vitest";
import { computeAccessibleName } from "dom-accessibility-api";
import { screen, within } from "@testing-library/react";
import { renderApp, gotoTab } from "./helpers.jsx";

// Case-insensitive "does the accessible name contain this visible text" check —
// the literal WCAG 2.5.3 / F96 rule this whole branch fixes.
function expectNameContains(el, visibleText) {
  const name = computeAccessibleName(el);
  expect(name.toLowerCase()).toContain(visibleText.toLowerCase());
}

async function startDxCopyStep(user) {
  await gotoTab(user, "QSO");
  await user.click(screen.getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ }));
}

// ---------------------------------------------------------------------------
// A1. COPY answer input
// ---------------------------------------------------------------------------
describe("COPY answer input — label in name (F96)", () => {
  const CAPTION = "Your copy — type what you hear";

  // Located by role alone (NOT by name) — COPY has exactly one textbox — so a
  // mutation that breaks the name assertion below fails that assertion cleanly
  // instead of failing earlier with a "no such element" crash from the query.

  it("the accessible name IS the visible caption, via a real <label htmlFor>", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const input = screen.getByRole("textbox");
    expect(input.tagName).toBe("INPUT");
    expectNameContains(input, CAPTION);

    const labelEl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    expect(labelEl).not.toBeNull();
    expect(labelEl.textContent).toBe(CAPTION);
    // No parallel aria-label left to drift out of sync with the caption.
    expect(input.getAttribute("aria-label")).toBeNull();
  });

  it("clicking the caption focuses the input (a real label, not text-only)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const input = screen.getByRole("textbox");
    const labelEl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    input.blur();
    await user.click(labelEl);
    expect(document.activeElement).toBe(input);
  });

  it("the caption still renders as a block (geometry unchanged from the old <div>)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const input = screen.getByRole("textbox");
    const labelEl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    // <label> is display:inline by default; without an explicit block override the
    // caption's marginBottom stops applying and the box shrinks to fit the text.
    expect(window.getComputedStyle(labelEl).display).toBe("block");
  });
});

// ---------------------------------------------------------------------------
// A2. "HEAR THE WHOLE CALL" button (LEARN → ON AIR → the CQ guide)
// ---------------------------------------------------------------------------
describe("HEAR THE WHOLE CALL button — label in name (F96)", () => {
  it("the accessible name contains the full visible caption", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN");
    await user.click(screen.getByRole("button", { name: "ON AIR" }));

    const btn = screen.getByText("♪ HEAR THE WHOLE CALL");
    expectNameContains(btn, "HEAR THE WHOLE CALL");
  });
});

// ---------------------------------------------------------------------------
// A3/A4. "ABANDON CONTACT / back to setup" — both instances (DX step, your-turn step)
// ---------------------------------------------------------------------------
describe("ABANDON CONTACT button — label in name (F96)", () => {
  it("on the DX step, the accessible name contains the full visible caption", async () => {
    const { user } = await renderApp();
    await startDxCopyStep(user);

    const btn = screen.getByText("✕ ABANDON CONTACT / back to setup");
    expectNameContains(btn, "ABANDON CONTACT");
  });

  it("on the your-turn (send) step, the accessible name contains the full visible caption", async () => {
    const { user } = await renderApp();
    await startDxCopyStep(user);
    await user.click(screen.getByRole("button", { name: "CONTINUE → YOUR TURN" }));

    const btn = screen.getByText("✕ ABANDON CONTACT / back to setup");
    expectNameContains(btn, "ABANDON CONTACT");
  });
});

// ---------------------------------------------------------------------------
// A5. "Close settings" (Done) button, wide rail
// ---------------------------------------------------------------------------
describe("Close settings (Done) button — label in name (F96)", () => {
  it("the accessible name contains the visible 'Done' caption", async () => {
    // renderApp() uses the wide matchMedia mock, so Settings portals into the
    // rail with its onClose control (only rendered there — narrow uses the gear).
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const rail = screen.getByRole("complementary", { name: "Options" });
    const btn = within(rail).getByText("✕ Done");
    expectNameContains(btn, "Done");
  });
});

// ---------------------------------------------------------------------------
// B. Exactly one <h1>, and no heading-level skips
// ---------------------------------------------------------------------------
describe("document heading structure", () => {
  it("has exactly one <h1>, reading CW TRAINER", async () => {
    await renderApp();

    // Plain DOM query, not getAllByRole/getByRole: those throw on ZERO matches,
    // which would turn a "the h1 got removed" mutation into a crash rather than
    // a clean assertion failure.
    const h1s = document.querySelectorAll("h1");
    expect(h1s.length).toBe(1);
    expect(h1s[0]?.textContent.trim()).toBe("CW TRAINER");
  });

  it("the <h1> renders with the same box the old <div> title had (zero visual change)", async () => {
    await renderApp();

    const h1 = screen.getByRole("heading", { level: 1 });
    const cs = window.getComputedStyle(h1);
    // fontWeight/fontSize/color were already explicit on the old <div> — a plain
    // <h1> swap leaves those alone. Only the four UA heading margins are new and
    // need zeroing (same pattern as S.head, see the file-header comment).
    //
    // COVERAGE LIMIT, measured not assumed (same gap the accessible-names batch
    // found for <h2>): jsdom's UA sheet applies `h1 { font-weight: bold }` — so
    // dropping the explicit fontWeight:700 DOES bite here (mutation-verified,
    // "bold" vs "700") — but it does NOT apply the spec's block-margin default,
    // so dropping the marginTop/Bottom/Left/Right zeroing does NOT bite: jsdom's
    // unset default computes as the unitless "0", one string away from this
    // assertion's "0px", not a real nonzero margin. Real Chrome disagrees (see
    // the accessible-names-batch memory: ~9px of real margin-top). The margin
    // assertions below are a documented pin of intent, not jsdom-provable proof.
    expect(cs.fontWeight).toBe("700");
    expect(cs.fontSize).toBe("22px");
    expect(cs.color).toBe("rgb(242, 169, 59)");
    expect(cs.marginTop).toBe("0px");
    expect(cs.marginRight).toBe("0px");
    expect(cs.marginBottom).toBe("0px");
    expect(cs.marginLeft).toBe("0px");
  });

  it("has no heading-level skips anywhere reachable from the shell", async () => {
    const { user } = await renderApp();
    // Open Settings too, so its <h2>s (the only other headings in the app) are
    // in the tree at the same time as the <h1>.
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const headings = screen.getAllByRole("heading");
    const levels = headings.map((h) => Number(h.getAttribute("aria-level") || h.tagName.slice(1)));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }
  });
});
