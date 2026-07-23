// @vitest-environment jsdom
//
// Regression tripwire for the app root's box model AND its viewport unit.
//
// DEFECT 1 — THE BOX MODEL (measured 2026-07-21, see the mobile no-scroll baseline):
// the app root declares a full-viewport `minHeight` AND `padding: 16px 12px 60px`.
// This app has no global `box-sizing` reset, so under the browser default
// `content-box` the 76px of vertical padding is ADDED to that minimum: the page
// height is `max(100svh, content) + 76` where it should be `max(100svh, content+76)`.
// Those two are EQUAL once content already exceeds the viewport, so the 76px is a
// FLOOR under the page height, not a tax on every screen — a within-cell control
// moved 3 of 16 no-scroll-contract cells and none of the eight phone-portrait ones.
// Its value is measurement-baseline integrity: every layout budget taken against
// this root was previously measured against a 76px artifact.
//
// DEFECT 2 — THE UNIT: `vh` is defined by CSS Values 4 as `lvh`, the LARGE viewport
// (dynamically-retracting UA chrome assumed retracted). In a mobile browser — the
// phone-preview path — that is taller than the visible area, a second overflow
// source independent of defect 1. `svh` is the small viewport and can never exceed
// what is visible. Electron/Capacitor have no dynamic chrome, so it is a no-op
// there (confirmed by headed measurement: desktop rects unchanged to the pixel).
//
// WHAT THIS TEST PROVES — and what it does not.
// jsdom performs NO layout: it cannot compute a height, so it cannot observe the
// overflow itself. The real proof is the headed geometry measurement recorded with
// the fix. What this test does prove is the DECLARATION that produces that geometry:
// the shell may not carry vertical padding on top of a viewport-height minimum
// without border-box. That is enough to stop a silent regression — which is the job
// here, not to re-derive the pixels.
import { describe, it, expect } from "vitest";
import { renderApp, screen } from "./helpers.jsx";

// The shell is identified the same way the measurement harness identifies it: the
// element declaring a full-viewport minimum height, in ANY of the viewport units.
// Keyed on behaviour, not on DOM position or one unit, so it survives re-parenting
// and so the unit assertion below is what reports a unit regression — not a
// confusing "found 0 shells".
function findShell() {
  return Array.from(document.querySelectorAll("div"))
    .filter((el) => el.style && /^100(v|sv|lv|dv)h$/.test(el.style.minHeight));
}

describe("app root box model", () => {
  it("has exactly one full-viewport-minimum shell", async () => {
    await renderApp();
    // Sanity that we are past the splash and looking at the real app, so the
    // assertion below can never pass vacuously against an unrendered tree.
    expect(screen.getByRole("button", { name: "KEY" })).toBeInTheDocument();
    expect(findShell()).toHaveLength(1);
  });

  it("sizes to the SMALL viewport, so retracting browser chrome cannot overflow it", async () => {
    await renderApp();
    const [shell] = findShell();
    expect(shell).toBeTruthy();
    // `vh` == `lvh` per CSS Values 4, which assumes browser chrome retracted and is
    // therefore taller than the visible area in a mobile browser. Only `svh` (or an
    // equal-or-smaller `dvh`) is safe here. Pinned exactly, because "100vh" would
    // otherwise silently pass any looser check.
    expect(shell.style.minHeight).toBe("100svh");
  });

  it("does not add its own padding to its full-viewport minimum", async () => {
    await renderApp();
    const [shell] = findShell();
    expect(shell).toBeTruthy();

    // The invariant, stated as the geometry actually requires it: vertical padding
    // on a full-viewport minimum is only safe under border-box. Written as a conditional so
    // that removing the padding would ALSO be an honest fix — but it can never pass
    // by accident, because the padding assertion below pins that padding still exists.
    const padTop = parseFloat(shell.style.paddingTop || "0");
    const padBottom = parseFloat(shell.style.paddingBottom || "0");
    if (padTop + padBottom > 0) {
      expect(shell.style.boxSizing).toBe("border-box");
    }

    // Pin the numbers the fix comment and the baseline document both quote, so the
    // "76px" claim in each cannot silently drift away from the code.
    expect(padTop).toBe(16);
    expect(padBottom).toBe(60);
    expect(padTop + padBottom).toBe(76);
  });

  it("still renders its bottom breathing room (the fix removes a tax, not the padding)", async () => {
    await renderApp();
    const [shell] = findShell();
    // The point of the fix is that the 60px bottom padding stops ADDING to the
    // minimum height — not that it disappears. If a future "fix" deletes the
    // padding to hit a number, this fails.
    expect(shell.style.padding).toBe("16px 12px 60px");
  });
});
