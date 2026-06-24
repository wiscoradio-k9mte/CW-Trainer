// @vitest-environment jsdom
//
// NARROW-MODE regression net for the responsive shell (Phase 1).
//
// The shared setup (setup.dom.js) mocks window.matchMedia with `matches: true`
// — i.e. every OTHER jsdom test renders the WIDE (desktop) arrangement. This
// file is the counterpart: it overrides matchMedia to `matches: false` so the
// useIsWide() hook returns false and the app renders the NARROW (single-column)
// arrangement, then asserts the app still renders the tabs and a tab's key
// controls.
//
// Why this matters now: Phase 1 only moves the shell (nav rail + empty options
// rail) and gates the options <aside> on `isWide`. As later phases start moving
// each tab's setup controls into the rail BASED ON isWide, the narrow branch
// becomes a real, divergent render path. Covering it now means the collapse path
// has a guard before any control's visibility starts depending on the width.
//
// Everything is asserted by role/text — never by structure or CSS — so it stays
// meaningful as the rail-split lands in later phases.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";

// Save the wide-default mock the shared setup installed, override it with a
// narrow one for this file only, and restore it afterward so no other test file
// inherits a narrow matchMedia (test files share the jsdom global).
let savedMatchMedia;

beforeEach(() => {
  savedMatchMedia = window.matchMedia;
  window.matchMedia = (query) => ({
    matches: false, // narrow / mobile viewport — useIsWide() returns false
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

// Local renderApp that does NOT reach through helpers.jsx — it must run AFTER
// the per-test matchMedia override above is in place (the hook reads matchMedia
// once on first render via useMemo). Mirrors helpers.renderApp otherwise.
async function renderNarrow() {
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  return { user };
}

describe("narrow (mobile) layout — collapse path", () => {
  it("renders the four-tab nav in narrow mode", async () => {
    await renderNarrow();
    for (const label of ["LEARN", "KEY", "COPY", "QSO"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // The nav keeps its accessible name in both orientations.
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeInTheDocument();
  });

  it("keeps aria-pressed on the tabs and switches view in narrow mode", async () => {
    const { user } = await renderNarrow();

    // Opens on LEARN, pressed.
    expect(screen.getByRole("button", { name: "LEARN" })).toHaveAttribute("aria-pressed", "true");

    // Switch to KEY — its NEW TEXT control (unique to KEY) appears, LEARN's
    // START DRILL goes away.
    await user.click(screen.getByRole("button", { name: "KEY" }));
    expect(screen.getByRole("button", { name: "KEY" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /NEW TEXT/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /START DRILL/ })).not.toBeInTheDocument();
  });

  it("renders a tab's key setup controls in narrow mode (COPY)", async () => {
    const { user } = await renderNarrow();
    await user.click(screen.getByRole("button", { name: "COPY" }));

    // The COPY setup controls still render in the single-column layout — they are
    // NOT gated out on narrow. (Once later phases gate the rail on isWide, this
    // catches a regression where narrow loses its setup controls.)
    expect(screen.getByText("What to copy — climb as you improve")).toBeInTheDocument();
    expect(screen.getByText("Conditions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1 character/ })).toBeInTheDocument();

    // And the practice input still accepts typing (located by placeholder; its
    // caption is an unassociated div — see the a11y testability note).
    const input = screen.getByPlaceholderText("...");
    await user.type(input, "k");
    expect(input).toHaveValue("k");
  });

  it("does NOT mount the options rail aside in narrow mode", async () => {
    await renderNarrow();
    // The empty options rail is `{isWide && <aside aria-label="Options" />}` — in
    // narrow mode isWide is false, so the aside must not be in the DOM at all
    // (no DOM noise on mobile, per the design). This is the behavioral
    // counterpart to the wide tests, which never assert its presence.
    expect(screen.queryByRole("complementary", { name: "Options" })).not.toBeInTheDocument();
  });

  it("keeps the always-mounted live regions present in narrow mode (QSO)", async () => {
    const { user } = await renderNarrow();
    await user.click(screen.getByRole("button", { name: "QSO" }));
    // stepLive + resultLive must still be mounted in the single-column layout —
    // the live regions are never gated by isWide.
    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(2);
  });
});
