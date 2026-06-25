// @vitest-environment jsdom
//
// SETTINGS RAIL-TAKEOVER net (Phase 4 / Phase 5).
//
// When the ⚙ Settings button is toggled:
//
//   WIDE  : Settings must appear INSIDE the options rail (role=complementary,
//           "Options"). The active tab's setup options must NOT simultaneously be
//           in the rail — Settings takes it over exclusively (one thing in the
//           rail at a time). Closing Settings restores the tab's options to the
//           rail. These are the "portal hygiene" invariants for the Settings path.
//
//   NARROW: Settings appears as the inline full-width panel it always was (today's
//           unchanged behavior). The Options rail aside is not mounted on narrow,
//           so there is no portal involved.
//
// These are mutation-meaningful: within(rail) scoping fails if Settings renders
// outside the rail; the mutual-exclusion test fails if both Settings AND the tab's
// options appear in the rail together. The narrow test fails if the inline panel
// regresses.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./helpers.jsx";
import CWTrainer from "../../wr-cw-trainer.jsx";

describe("Settings rail-takeover — WIDE", () => {
  // setup.dom.js mocks matchMedia matches:true (wide), so renderApp gives the
  // wide arrangement directly.

  it("portals Settings into the Options rail when the gear is toggled on wide", async () => {
    const { user } = await renderApp();

    // Settings is closed on load — the rail holds the LEARN setup.
    const rail = screen.getByRole("complementary", { name: "Options" });
    expect(within(rail).queryByRole("slider", { name: /Character speed/ })).not.toBeInTheDocument();

    // Open Settings.
    await user.click(screen.getByRole("button", { name: "Settings" }));

    // Settings content is now in the rail.
    expect(within(rail).getByRole("slider", { name: /Character speed/ })).toBeInTheDocument();
  });

  it("removes the active tab's options from the rail while Settings is open (mutual exclusion)", async () => {
    const { user } = await renderApp();

    // Before opening Settings, LEARN setup is in the rail.
    const rail = screen.getByRole("complementary", { name: "Options" });
    expect(within(rail).getByText("Characters in play")).toBeInTheDocument();

    // Open Settings — LEARN setup must leave the rail.
    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(within(rail).getByRole("slider", { name: /Character speed/ })).toBeInTheDocument();
    // The tab's options must NOT be simultaneously in the rail.
    expect(within(rail).queryByText("Characters in play")).not.toBeInTheDocument();
    expect(within(rail).queryByRole("button", { name: /START DRILL/ })).not.toBeInTheDocument();
  });

  it("restores the tab's options to the rail after closing Settings on wide", async () => {
    const { user } = await renderApp();

    const rail = screen.getByRole("complementary", { name: "Options" });

    // Open then close Settings.
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(within(rail).getByRole("slider", { name: /Character speed/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Settings" }));

    // Settings is gone; the tab's options are back in the rail.
    expect(within(rail).queryByRole("slider", { name: /Character speed/ })).not.toBeInTheDocument();
    expect(within(rail).getByText("Characters in play")).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: /START DRILL/ })).toBeInTheDocument();
  });

  it("works the same way on QSO tab — Settings takes over the rail, options suppressed", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "QSO" }));

    const rail = screen.getByRole("complementary", { name: "Options" });
    expect(within(rail).getByText("Activity")).toBeInTheDocument();

    // Open Settings — QSO options must leave the rail.
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(within(rail).getByRole("slider", { name: /Character speed/ })).toBeInTheDocument();
    expect(within(rail).queryByText("Activity")).not.toBeInTheDocument();

    // Close Settings — QSO options return.
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(within(rail).queryByRole("slider", { name: /Character speed/ })).not.toBeInTheDocument();
    expect(within(rail).getByText("Activity")).toBeInTheDocument();
  });

  it("keeps the rail Settings-only when switching tabs WHILE Settings is open (no option leak), then shows the new tab's options on close", async () => {
    const { user } = await renderApp();

    // Open Settings on LEARN (the default tab); the rail now holds Settings only.
    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(within(rail).getByRole("slider", { name: /Character speed/ })).toBeInTheDocument();
    expect(within(rail).queryByText("Characters in play")).not.toBeInTheDocument();

    // Switch to QSO WITHOUT closing Settings — showSettings is shell-level state
    // and persists across the tab switch. The rail must STILL be Settings-only:
    // neither the LEARN setup nor the QSO setup may leak in (suppressRail holds
    // for the newly-active tab too).
    await user.click(screen.getByRole("button", { name: "QSO" }));
    expect(within(rail).getByRole("slider", { name: /Character speed/ })).toBeInTheDocument();
    expect(within(rail).queryByText("Characters in play")).not.toBeInTheDocument();
    expect(within(rail).queryByText("Activity")).not.toBeInTheDocument();

    // Close Settings — now the active tab (QSO) options appear in the rail, and
    // no stale LEARN node remains.
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(within(rail).queryByRole("slider", { name: /Character speed/ })).not.toBeInTheDocument();
    expect(within(rail).getByText("Activity")).toBeInTheDocument();
    expect(within(rail).queryByText("Characters in play")).not.toBeInTheDocument();
  });

  it("portals exactly one Settings panel into the rail (no duplicate) and removes it cleanly on close", async () => {
    const { user } = await renderApp();
    const rail = screen.getByRole("complementary", { name: "Options" });

    await user.click(screen.getByRole("button", { name: "Settings" }));
    // Exactly one Character-speed slider in the whole document — no duplicate from
    // a stale portal, and it lives in the rail.
    expect(screen.getAllByRole("slider", { name: /Character speed/ })).toHaveLength(1);
    expect(within(rail).getByRole("slider", { name: /Character speed/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    // Gone everywhere — no orphan left behind.
    expect(screen.queryByRole("slider", { name: /Character speed/ })).not.toBeInTheDocument();
  });
});

describe("Settings behavior — NARROW", () => {
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

  it("renders Settings as the inline full-width panel on narrow (unchanged behavior)", async () => {
    const { user } = await renderNarrow();

    // No rail on narrow.
    expect(screen.queryByRole("complementary", { name: "Options" })).not.toBeInTheDocument();

    // Settings not open yet.
    expect(screen.queryByRole("slider", { name: /Character speed/ })).not.toBeInTheDocument();

    // Toggle Settings open — it renders inline.
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("slider", { name: /Character speed/ })).toBeInTheDocument();

    // Still no rail after toggle (narrow is always rail-free).
    expect(screen.queryByRole("complementary", { name: "Options" })).not.toBeInTheDocument();
  });

  it("closes Settings inline on narrow when toggled again", async () => {
    const { user } = await renderNarrow();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("slider", { name: /Character speed/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.queryByRole("slider", { name: /Character speed/ })).not.toBeInTheDocument();
  });
});
