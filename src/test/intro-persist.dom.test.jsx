// @vitest-environment jsdom
//
// Intro-panel dismissal — COPY / KEY / QSO
//
// Each practice tab opens with orientation prose. Because the tab components
// unmount on every tab switch (see the `tab === "copy" && <CopyTrainer/>`
// render sites), the orientation returned on EVERY entry and every app launch —
// a returning operator was re-taught the tab each time, scrolling past 541–629px
// of prose at 390 wide to reach the control they came for.
//
// The fix: each tab's intro is a disclosure whose collapsed flag persists under
// that tab's own store key, and the tab collapses it once the operator has
// actually started a session there. COPY had no control at all before this.
//
// The guardrail these tests exist to hold is T3: a FIRST-TIME operator must
// still get the full orientation. Hiding the teaching is not a way to win
// geometry.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { gotoTab } from "./helpers.jsx";

// The three tabs under test, with the store key each one owns, the leaf prose
// that proves the orientation is actually rendered, and how a session starts.
const TABS = {
  COPY: {
    key: "introCopyCollapsed",
    title: "Copy practice",
    body: /receiving ear gets built/,
  },
  KEY: {
    key: "introKeyCollapsed",
    title: "Sending practice",
    body: /Now the other half: the fist/,
  },
  QSO: {
    key: "introQsoCollapsed",
    title: "Simulated contact",
    body: /Pick your activity and role/,
  },
};

// Boot the app from a chosen storage state. Deliberately NOT renderApp() —
// that clears localStorage, which is the very thing under test here.
async function launch(seed = {}) {
  window.localStorage.clear();
  for (const [k, v] of Object.entries(seed)) {
    window.localStorage.setItem("wrcw:" + k, JSON.stringify(v));
  }
  return await boot();
}

// Quit and relaunch: unmount everything, mount a fresh app against whatever
// localStorage now holds. This is the "including after quitting and
// relaunching" half of the acceptance criteria.
async function relaunch() {
  cleanup();
  return await boot();
}

async function boot() {
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  return user;
}

// Start a real session on `tab` — the thing that tells us the operator no
// longer needs orienting.
async function startSession(user, tab) {
  if (tab === "COPY") {
    // ▶ NEW runs a 5-second listen countdown before the target is generated.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /▶ NEW/ }));
    act(() => { vi.advanceTimersByTime(6000); });
    vi.useRealTimers();
    await act(async () => {});
  } else if (tab === "KEY") {
    await user.click(screen.getByRole("button", { name: /▶ NEW TEXT/ }));
  } else {
    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(
      within(rail).getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ })
    );
  }
  // The session really started: the setup-screen orientation has unmounted.
  expect(screen.queryByText(TABS[tab].title)).toBeNull();
}

const introToggle = () =>
  screen.getByRole("button", { name: /^(Show|Hide) intro$/ });

afterEach(() => { vi.useRealTimers(); });

describe("intro panel — first-time operator (T3)", () => {
  for (const [tab, t] of Object.entries(TABS)) {
    it(`${tab}: with no stored state the orientation is fully expanded`, async () => {
      const user = await launch();
      await gotoTab(user, tab);

      // The teaching prose itself, not just the header.
      expect(screen.getByText(t.body)).toBeInTheDocument();
      const btn = introToggle();
      expect(btn).toHaveAccessibleName("Hide intro");
      expect(btn).toHaveAttribute("aria-expanded", "true");
      expect(btn).toHaveTextContent("▾ hide intro");
      // Nothing was written on a mere visit — only starting a session collapses.
      expect(window.localStorage.getItem("wrcw:" + t.key)).toBeNull();
    });
  }
});

describe("intro panel — collapses once a session has been started (T1)", () => {
  for (const [tab, t] of Object.entries(TABS)) {
    it(`${tab}: re-entering the tab after a session shows it collapsed`, async () => {
      const user = await launch();
      await gotoTab(user, tab);
      expect(screen.getByText(t.body)).toBeInTheDocument();

      await startSession(user, tab);

      // Leave and come back — the tab component unmounts, so this is the same
      // path a returning operator takes.
      await gotoTab(user, "LEARN");
      await gotoTab(user, tab);

      expect(screen.getByText(t.title)).toBeInTheDocument(); // never destroyed
      expect(screen.queryByText(t.body)).toBeNull();
      const btn = introToggle();
      expect(btn).toHaveAccessibleName("Show intro");
      expect(btn).toHaveAttribute("aria-expanded", "false");
      expect(btn).toHaveTextContent("▸ show intro");
      expect(window.localStorage.getItem("wrcw:" + t.key)).toBe("true");
    });

    it(`${tab}: the collapsed state survives quitting and relaunching`, async () => {
      let user = await launch();
      await gotoTab(user, tab);
      await startSession(user, tab);

      user = await relaunch();
      await gotoTab(user, tab);

      expect(screen.queryByText(t.body)).toBeNull();
      expect(introToggle()).toHaveAccessibleName("Show intro");
    });
  }
});

describe("intro panel — the orientation is never destroyed (T2)", () => {
  for (const [tab, t] of Object.entries(TABS)) {
    it(`${tab}: one tap brings it back, and that choice survives a relaunch`, async () => {
      let user = await launch({ [t.key]: true });
      await gotoTab(user, tab);
      expect(screen.queryByText(t.body)).toBeNull();

      await user.click(introToggle());

      // Restored in place, with the full prose.
      expect(screen.getByText(t.body)).toBeInTheDocument();
      expect(introToggle()).toHaveAccessibleName("Hide intro");
      expect(window.localStorage.getItem("wrcw:" + t.key)).toBe("false");

      user = await relaunch();
      await gotoTab(user, tab);
      expect(screen.getByText(t.body)).toBeInTheDocument();
    });
  }
});

describe("intro panel — all three tabs carry the same control (T4)", () => {
  it("same accessible name, same visible label, same aria-expanded, on COPY, KEY and QSO", async () => {
    const user = await launch();
    const seen = [];
    for (const tab of Object.keys(TABS)) {
      await gotoTab(user, tab);
      const btn = introToggle();
      seen.push({
        tab,
        name: btn.getAttribute("aria-label"),
        text: btn.textContent,
        expanded: btn.getAttribute("aria-expanded"),
        tag: btn.tagName,
      });
    }
    expect(seen).toEqual([
      { tab: "COPY", name: "Hide intro", text: "▾ hide intro", expanded: "true", tag: "BUTTON" },
      { tab: "KEY", name: "Hide intro", text: "▾ hide intro", expanded: "true", tag: "BUTTON" },
      { tab: "QSO", name: "Hide intro", text: "▾ hide intro", expanded: "true", tag: "BUTTON" },
    ]);
  });

  it("the control is operable from the keyboard on all three tabs", async () => {
    const user = await launch();
    for (const [tab, t] of Object.entries(TABS)) {
      await gotoTab(user, tab);
      introToggle().focus();
      await user.keyboard("{Enter}");
      expect(screen.queryByText(t.body)).toBeNull();
      expect(introToggle()).toHaveAccessibleName("Show intro");
    }
  });
});

describe("intro panel — dismissal is per tab (T5)", () => {
  it("starting a COPY session leaves KEY's and QSO's orientation expanded", async () => {
    const user = await launch();
    await gotoTab(user, "COPY");
    await startSession(user, "COPY");

    await gotoTab(user, "KEY");
    expect(screen.getByText(TABS.KEY.body)).toBeInTheDocument();
    await gotoTab(user, "QSO");
    expect(screen.getByText(TABS.QSO.body)).toBeInTheDocument();

    expect(window.localStorage.getItem("wrcw:introCopyCollapsed")).toBe("true");
    expect(window.localStorage.getItem("wrcw:introKeyCollapsed")).toBeNull();
    expect(window.localStorage.getItem("wrcw:introQsoCollapsed")).toBeNull();
  });
});

describe("intro panel — existing operator settings are not reset (T6)", () => {
  it("a stored introKeyCollapsed / introQsoCollapsed is honoured on first entry", async () => {
    const user = await launch({ introKeyCollapsed: true, introQsoCollapsed: true });

    await gotoTab(user, "KEY");
    expect(screen.queryByText(TABS.KEY.body)).toBeNull();
    await gotoTab(user, "QSO");
    expect(screen.queryByText(TABS.QSO.body)).toBeNull();

    // Untouched, not rewritten.
    expect(window.localStorage.getItem("wrcw:introKeyCollapsed")).toBe("true");
    expect(window.localStorage.getItem("wrcw:introQsoCollapsed")).toBe("true");
  });

  it("a stored expanded choice (false) is honoured on first entry", async () => {
    const user = await launch({ introKeyCollapsed: false, introQsoCollapsed: false });

    await gotoTab(user, "KEY");
    expect(screen.getByText(TABS.KEY.body)).toBeInTheDocument();
    await gotoTab(user, "QSO");
    expect(screen.getByText(TABS.QSO.body)).toBeInTheDocument();
  });
});
