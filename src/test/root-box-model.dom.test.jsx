// @vitest-environment jsdom
//
// Regression tripwire for the app root's box model.
//
// THE DEFECT THIS GUARDS (measured 2026-07-21, see the mobile no-scroll baseline):
// the app root declares `minHeight: 100vh` AND `padding: 16px 12px 60px`. This app
// has no global `box-sizing` reset, so under the browser default `content-box` the
// 76px of vertical padding is ADDED to the full-viewport minimum — every screen in
// the app, including a completely empty PROGRESS tab, was at least 76px taller than
// the viewport. Live measurement over CDP: empty PROGRESS overflowed by exactly
// +76px at five of six viewports, and flipping this ONE element to border-box took
// it to 0 at all five (the sixth, 360x640, is genuinely content-bound and correctly
// reclaimed nothing).
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
// element declaring a full-viewport minimum height. Keyed on behaviour, not on DOM
// position, so it survives re-parenting.
function findShell() {
  return Array.from(document.querySelectorAll("div"))
    .filter((el) => el.style && el.style.minHeight === "100vh");
}

describe("app root box model", () => {
  it("has exactly one full-viewport-minimum shell", async () => {
    await renderApp();
    // Sanity that we are past the splash and looking at the real app, so the
    // assertion below can never pass vacuously against an unrendered tree.
    expect(screen.getByRole("button", { name: "KEY" })).toBeInTheDocument();
    expect(findShell()).toHaveLength(1);
  });

  it("does not add its own padding to its 100vh minimum", async () => {
    await renderApp();
    const [shell] = findShell();
    expect(shell).toBeTruthy();

    // The invariant, stated as the geometry actually requires it: vertical padding
    // on a 100vh minimum is only safe under border-box. Written as a conditional so
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
