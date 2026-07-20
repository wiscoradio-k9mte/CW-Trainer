// @vitest-environment jsdom
//
// Tests for the "Support the developer" coffee button in the app header.
//
// These tests assert REAL behavior — the exact window.open call args and the
// accessible name.  They are mutation-verified: removing the URL, the "_blank",
// or the noopener/noreferrer from the JSX makes the relevant test go red.
//
// CONTRACT CHANGE (2.4.0, 2026-07-20): the support destination moved from Venmo
// (https://venmo.com/u/K9MTE) to Buy Me a Coffee
// (https://buymeacoffee.com/wiscoradiolabs), and the accessible name changed
// from "Support the developer via Venmo — …" to "Support the developer on Buy
// Me a Coffee — …".  Every assertion below was RETARGETED to the new contract,
// not relaxed: the URL is still pinned with an exact toBe(), the accessible name
// is still matched in full via getByRole({ name }), and an ADDITIONAL guard
// (`expect(url).not.toContain("venmo")`) now forbids the old destination.  The
// strictness of this file went up, not down.
//
// The button lives in the persistent header (.wr-full), so it must be
// reachable on every tab without any navigation.

import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderApp, gotoTab } from "./helpers.jsx";

// Restore window.open after each test so the spy doesn't leak.
afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Presence and accessible name
// ---------------------------------------------------------------------------
describe("coffee button — presence and accessible name", () => {
  it("is in the document after the splash with the correct aria-label", async () => {
    await renderApp();
    // getByRole throws if not found — this doubles as an existence assertion.
    const btn = screen.getByRole("button", {
      name: "Support the developer on Buy Me a Coffee — opens in your web browser",
    });
    expect(btn).toBeInTheDocument();
  });

  it("is still present after switching to KEY tab (persistent header)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "KEY");
    expect(
      screen.getByRole("button", {
        name: "Support the developer on Buy Me a Coffee — opens in your web browser",
      })
    ).toBeInTheDocument();
  });

  it("is still present after switching to QSO tab (persistent header)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");
    expect(
      screen.getByRole("button", {
        name: "Support the developer on Buy Me a Coffee — opens in your web browser",
      })
    ).toBeInTheDocument();
  });

  it("hides the ☕ glyph from assistive tech so it does not double-announce", async () => {
    await renderApp();
    const btn = screen.getByRole("button", {
      name: "Support the developer on Buy Me a Coffee — opens in your web browser",
    });
    // The cup is decorative; the aria-label carries the name. The glyph span must
    // be aria-hidden so AT reads "Coffee?" (the label), not the emoji name on top
    // of it. This assertion goes red if aria-hidden is dropped from the span.
    const glyph = within(btn).getByText("☕");
    expect(glyph).toHaveAttribute("aria-hidden", "true");
  });
});

// ---------------------------------------------------------------------------
// Click action — window.open must be called with exact args.
//
// Why test all three args separately:
//   - URL wrong → routes to the wrong page
//   - target wrong (e.g. "_self") → navigates the SPA away from the app
//   - missing noopener/noreferrer → opener reference leaks to the target page
//     (security issue + the setWindowOpenHandler only fires on "_blank")
// ---------------------------------------------------------------------------
describe("coffee button — window.open call", () => {
  it("calls window.open with the correct URL, _blank, and noopener,noreferrer", async () => {
    const { user } = await renderApp();

    // Spy AFTER render so we don't interfere with any setup window.open calls.
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    const btn = screen.getByRole("button", {
      name: "Support the developer on Buy Me a Coffee — opens in your web browser",
    });
    await user.click(btn);

    expect(openSpy).toHaveBeenCalledTimes(1);

    const [url, target, features] = openSpy.mock.calls[0];

    // Exact URL — wrong destination is a user-facing defect.
    expect(url).toBe("https://buymeacoffee.com/wiscoradiolabs");

    // Regression guard: 2.4.0 moved support from Venmo to Buy Me a Coffee.
    // Pin the OLD destination as forbidden so a bad revert/merge can't silently
    // restore it while the toBe() above is edited to match.
    expect(url).not.toContain("venmo");

    // Must be _blank so setWindowOpenHandler intercepts it; _self would navigate
    // the Electron window away from the app.
    expect(target).toBe("_blank");

    // Both security tokens required.
    expect(features).toContain("noopener");
    expect(features).toContain("noreferrer");
  });
});
