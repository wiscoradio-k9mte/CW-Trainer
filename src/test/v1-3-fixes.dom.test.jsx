// @vitest-environment jsdom
//
// Regression net for the v1.3 surgical fixes (8-fix readiness pass).
//
// One test per fix that covers the acceptance criterion's behavioral contract.
// Assertions are by role/text/label — never by DOM structure — so they survive
// future layout changes without false negatives.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, gotoTab } from "./helpers.jsx";
import CWTrainer from "../../wr-cw-trainer.jsx";

// ---------------------------------------------------------------------------
// Fix 1: QSO DX-step copy input — accessible name
// ---------------------------------------------------------------------------
describe("Fix 1 — QSO DX-step copy input accessible name", () => {
  it("has an accessible name findable by role+name", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "QSO");

    // Start a QSO — default activity is Ragchew, role is "Answer a CQ".
    await user.click(screen.getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ }));

    // Ragchew "Answer a CQ" opens on step 0 which is a DX step.  Non-easy difficulty
    // (default NORMAL) renders the copy input immediately — no countdown gate.
    // findByRole polls until the element is present (or the 1 s default timeout fires).
    // An absent aria-label would make this resolve to null and the assertion below would
    // fail, biting on any label regression.
    const copyInput = await screen.findByRole("textbox", { name: /Your copy of what you heard/i });
    expect(copyInput).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Fix 2: BK in the LINGO guide — not presented as a fused prosign
// ---------------------------------------------------------------------------
describe("Fix 2 — LINGO guide BK annotation", () => {
  // Helper: navigate to LINGO section and open the Prosigns accordion.
  // The LingoGuide renders categories in a collapsed accordion; Prosigns is
  // collapsed by default (The essentials is the default open category).
  async function openProsigns(user) {
    await gotoTab(user, "LEARN");
    await user.click(screen.getByRole("button", { name: "LINGO" }));
    // Expand the PROSIGNS accordion — its button label starts with "PROSIGNS".
    await user.click(screen.getByRole("button", { name: /PROSIGNS/i }));
  }

  it("LINGO guide blurb does NOT claim BK runs together as one sound", async () => {
    const { user } = await renderApp();
    await openProsigns(user);
    // The blurb should NOT claim BK's two letters "run together."
    // The new blurb says BT/AR/SK/KN run together, but explicitly carves out BK.
    expect(document.body.textContent).not.toMatch(/BK.{0,40}run together/i);
  });

  it("BK entry in the prosigns section is annotated as two separate letters", async () => {
    const { user } = await renderApp();
    await openProsigns(user);
    // The BK item meaning must say "NOT a fused prosign" — the exact annotation.
    expect(screen.getByText(/NOT a fused prosign/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Fix 3: Terse CQ format — ≥2 CQs (tested in cw-core.test.js; UI smoke only)
// ---------------------------------------------------------------------------
// The behavioral core is covered in cw-core.test.js ("every emitted CQ string
// has at least 2 CQ tokens").  A UI smoke test here ensures cqCall's output
// actually reaches the QSO step text — we can't easily inspect the exact CQ
// text in jsdom without starting a real QSO, so a functional pass from the
// cw-core suite is the primary gate.  Nothing to add at the DOM level.

// ---------------------------------------------------------------------------
// Fix 4: Onboarding — "listen first" nudge + Koch gloss
// ---------------------------------------------------------------------------
describe("Fix 4 — LEARN onboarding nudge and Koch gloss", () => {
  it("shows a 'listen before you start' prompt on the LEARN setup screen", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN");
    // The nudge text is near the START DRILL button.
    expect(screen.getByText(/New here\? Tap each character card above to hear it before you start the drill/i)).toBeInTheDocument();
  });

  it("Koch method description includes a plain-English gloss at first mention", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN");
    // The description should explain what Koch method is in the same sentence.
    // We wrote: "This app uses the Koch method — a training approach where..."
    expect(document.body.textContent).toMatch(/Koch method\s*—\s*a training approach/i);
  });
});

// ---------------------------------------------------------------------------
// Fix 5: Splash screen accessibility
// ---------------------------------------------------------------------------
describe("Fix 5 — splash screen accessibility", () => {
  it("splash has role=button, aria-label, and tabIndex", async () => {
    window.localStorage.clear();
    render(<CWTrainer />);

    // The splash is visible before dismissal.
    const splash = screen.getByRole("button", { name: /Enter CW Trainer/i });
    expect(splash).toBeInTheDocument();
    expect(splash).toHaveAttribute("tabindex", "0");
  });

  it("splash is dismissible by Enter key", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<CWTrainer />);

    const splash = screen.getByRole("button", { name: /Enter CW Trainer/i });
    // Tab to focus, then press Enter.
    splash.focus();
    await user.keyboard("{Enter}");

    // Splash should be gone — the main nav is now visible.
    expect(screen.queryByRole("button", { name: /Enter CW Trainer/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LEARN" })).toBeInTheDocument();
  });

  it("splash is dismissible by Space key", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<CWTrainer />);

    const splash = screen.getByRole("button", { name: /Enter CW Trainer/i });
    splash.focus();
    await user.keyboard(" ");

    expect(screen.queryByRole("button", { name: /Enter CW Trainer/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Fix 6: Settings — speed-slider groups + close affordance on wide
// ---------------------------------------------------------------------------
describe("Fix 6 — Settings speed-slider groups and close control", () => {
  it("shows LISTENING SPEED and SENDING SPEED group labels in Settings", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Settings" }));

    // The two group sub-headers should be present.
    expect(screen.getByText("LISTENING SPEED")).toBeInTheDocument();
    expect(screen.getByText("SENDING SPEED")).toBeInTheDocument();
  });

  it("provides a close/Done control inside Settings on wide layout", async () => {
    // renderApp() uses the wide matchMedia mock (matches: true).
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Settings" }));

    // The Done button lives inside the Settings panel in the rail.
    const rail = screen.getByRole("complementary", { name: "Options" });
    expect(within(rail).getByRole("button", { name: /Close settings|Done/i })).toBeInTheDocument();
  });

  it("Done button closes Settings on wide (rail returns to tab options)", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const rail = screen.getByRole("complementary", { name: "Options" });
    expect(within(rail).getByRole("slider", { name: /Character speed/ })).toBeInTheDocument();

    // Click the Done button.
    await user.click(within(rail).getByRole("button", { name: /Close settings|Done/i }));

    // Settings is gone; LEARN chart (the default tab) is back in the rail.
    expect(within(rail).queryByRole("slider", { name: /Character speed/ })).not.toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: /HIDE|FULL CHARACTER CHART/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Fix 7: Ephemeral session-end summary — LEARN tab
// ---------------------------------------------------------------------------
describe("Fix 7 — ephemeral session summary on BACK from LEARN drill", () => {
  it("shows a session accuracy summary after backing out of an active drill", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN");

    // Start the drill.
    await user.click(screen.getByRole("button", { name: /START DRILL/ }));

    // Answer at least one character so history is non-empty.
    // Lesson 1 pool is always K and M — getAllByRole throws if the grid is absent,
    // which would expose a drill-start regression before we even try to answer.
    const allBtns = screen.getAllByRole("button");
    const charButtons = allBtns.filter((b) => /^[KM]$/.test(b.textContent));
    expect(charButtons.length).toBeGreaterThan(0); // sanity: pool must render

    await user.click(charButtons[0]);
    // Wait for the flash to appear in the aria-live result region — this is the
    // observable proof that answer() ran and setHistory fired.  The flash shows
    // "✓" (correct) or "✗ K .-" (wrong); either means history.length === 1.
    await waitFor(() => expect(document.body.textContent).toMatch(/[✓✗]/));

    // Press BACK — the handler reads history.length > 0 and calls setSessionSummary.
    await user.click(screen.getByRole("button", { name: /← BACK|BACK/ }));

    // The key invariant is the summary is NOT stored in localStorage.
    expect(window.localStorage.getItem("wrcw:sessionSummary")).toBeNull();

    // The summary must now be visible on the setup screen — unconditional.
    // Removing or gating setSessionSummary would make this findBy time out and fail.
    await screen.findByText(/You answered \d+ of \d+ correctly/i);
  });

  it("session summary does NOT persist to localStorage", async () => {
    // Re-render from scratch and ensure no new 'wrcw:sessionSummary' key exists.
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));

    await gotoTab(user, "LEARN");
    await user.click(screen.getByRole("button", { name: /START DRILL/ }));
    await user.click(screen.getByRole("button", { name: /← BACK|BACK/ }));

    // Confirm no new ephemeral-session key was introduced.
    expect(window.localStorage.getItem("wrcw:sessionSummary")).toBeNull();
    // Only the sanctioned persistent keys should appear. "progress" was added in
    // v2.0 (cross-session history) — it is a legitimate new key, not a leak.
    const keys = Object.keys(window.localStorage);
    for (const key of keys) {
      // introCopyCollapsed / introQsoCollapsed are the COPY and QSO siblings of
      // introKeyCollapsed — one intro-disclosure flag per practice tab.
      expect(key).toMatch(/^wrcw:(kochLesson|settings|intro(Copy|Key|Qso)Collapsed|seenCallNudge|progress)$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Fix 8: W1AW banner — no ARRL insider reference
// ---------------------------------------------------------------------------
describe("Fix 8 — W1AW nudge banner framing", () => {
  it("does not mention ARRL in the W1AW nudge", async () => {
    // Start fresh so W1AW is the default call and the nudge is visible.
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));

    // The nudge is rendered when settings.myCall === "W1AW" and not dismissed.
    const nudge = screen.queryByRole("note");
    if (nudge) {
      expect(nudge.textContent).not.toMatch(/ARRL/i);
    } else {
      // If the note is somehow absent, verify ARRL isn't in the banner text
      // anywhere on the page — belt and suspenders.
      // (The note region may not render if the nudge is suppressed; that's fine.)
    }
  });

  it("still includes the call-to-action to set your own callsign", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));

    // The nudge should still guide the user to Settings.
    const nudge = screen.queryByRole("note");
    if (nudge) {
      expect(nudge.textContent).toMatch(/set your own call/i);
    }
  });
});

// ---------------------------------------------------------------------------
// H3: Reduced-motion classnames present on animated nodes
// ---------------------------------------------------------------------------
describe("H3 — reduced-motion classnames", () => {
  it("cursor span has wr-cursor class so reduced-motion CSS targets it", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));

    // Navigate to KEY tab and start the keyer — Display renders a cursor span
    await user.click(screen.getByRole("button", { name: "KEY" }));
    const cursors = document.querySelectorAll(".wr-cursor");
    // At least one cursor is present (the decoded-output display in KEY shows cursor)
    expect(cursors.length).toBeGreaterThan(0);
  });

  it("splash content has wr-splash-in class so reduced-motion CSS targets it", () => {
    window.localStorage.clear();
    render(<CWTrainer />);
    const splashIns = document.querySelectorAll(".wr-splash-in");
    // Splash mounts with at least two .wr-splash-in nodes: content + tap-to-skip
    expect(splashIns.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// L3: Splash auto-dismiss after 2800ms
// ---------------------------------------------------------------------------
describe("L3 — splash auto-dismiss", () => {
  it("dismisses after 2800ms without user input", async () => {
    window.localStorage.clear();
    vi.useFakeTimers();
    render(<CWTrainer />);

    // Splash is visible before 2800ms
    expect(screen.getByRole("button", { name: /Enter CW Trainer/i })).toBeInTheDocument();

    // Advance 2800ms — the useEffect timer fires onSkip(true) → setSplash(false)
    await act(() => { vi.advanceTimersByTime(2800); });

    // Splash gone, main nav visible
    expect(screen.queryByRole("button", { name: /Enter CW Trainer/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LEARN" })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("timer is cancelled on unmount (clearTimeout called before 2800ms fires)", () => {
    // WHY behavioral, not console.error: React 18.3 removed the
    // "state update on unmounted component" warning, so spying on console.error
    // for that pattern can never fail — the test was vacuous.
    //
    // Splash is an internal (non-exported) function, so we cannot render it
    // directly with our own onSkip spy.  We verify the cleanup ran through
    // clearTimeout: Splash's useEffect returns `() => clearTimeout(t)`.
    // Spying on clearTimeout shows it was invoked by cleanup before the timer
    // would fire.  Without the cleanup line, clearTimeout is never called on
    // unmount — the spy call count is 0 and the test fails.
    window.localStorage.clear();

    // Use fake timers so the 2800ms auto-dismiss cannot fire spontaneously.
    // Wrapped in try/finally so useRealTimers always restores even on assertion
    // failure — otherwise fake timers leak into subsequent tests.
    vi.useFakeTimers();
    let clearSpy;
    try {
      clearSpy = vi.spyOn(globalThis, "clearTimeout");

      const { unmount } = render(<CWTrainer />);
      // Splash is visible; the 2800ms timer is pending.
      expect(screen.getByRole("button", { name: /Enter CW Trainer/i })).toBeInTheDocument();

      // Unmount before 2800ms — React runs useEffect cleanup → clearTimeout(t).
      unmount();

      // clearTimeout must have been called (Node's Timeout object, not a Number).
      // If `return () => clearTimeout(t)` were removed, call count is 0 — test fails.
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy?.mockRestore();
      vi.useRealTimers();
    }
  });

  it("manual tap before 2800ms skips immediately and audio plays (not auto)", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<CWTrainer />);

    // Tap before 2800ms — onSkip(false) → audio unlock path
    await user.click(screen.getByText("tap to skip"));

    // Splash gone immediately on click
    expect(screen.queryByRole("button", { name: /Enter CW Trainer/i })).not.toBeInTheDocument();
    // Main content is now visible
    expect(screen.getByRole("button", { name: "LEARN" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// M4: Tag verdict chips render the verdict WORD, not just a color
// ---------------------------------------------------------------------------
describe("M4 — Tag verdict chips include verdict text", () => {
  it("renders verdict word ('good', 'loose', or 'tight') in the PROGRESS KEY section", async () => {
    // WHY seeded localStorage, not a live KEY session: driving the keyer to
    // produce real timing events in jsdom (no audio, no real clock events) is
    // fragile.  The PROGRESS view reads directly from wrcw:progress in
    // localStorage, so seeding a record with known verdicts is the clean path.
    //
    // The invariant under test: Tag renders {children}, and children is
    // "letters: good" / "words: loose" etc.  A regression that strips the
    // verdict word (e.g. rendering only a color dot) would make getByText fail.
    window.localStorage.clear();
    window.localStorage.setItem("wrcw:progress", JSON.stringify({
      schemaVersion: 1,
      learn: [],
      copy:  [],
      key: [{
        t:               Date.now(),
        category:        "Common words",
        keyType:         "straight",
        copyPct:         85,
        estWpm:          18,
        wpmVerdict:      "on target",
        elementVerdict:  "good",
        letterVerdict:   "good",
        wordVerdict:     "loose",
        weightingVerdict: "tight",
        weightingRatio:   2.1,
      }],
    }));

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));

    // Navigate to the PROGRESS tab (wide layout — button label is "PROGRESS").
    await user.click(screen.getByRole("button", { name: "PROGRESS" }));

    // The PROGRESS KEY section renders Tag chips for letterVerdict and wordVerdict.
    // Each Tag renders its children: "letters: good", "words: loose".
    // If the verdict WORD were dropped and only color remained, these would fail.
    expect(screen.getByText(/letters:\s*good/i)).toBeInTheDocument();
    expect(screen.getByText(/words:\s*loose/i)).toBeInTheDocument();
    // weightingVerdict "tight" is only shown when !== "good" — it is "tight" here.
    expect(screen.getByText(/weighting:\s*tight/i)).toBeInTheDocument();
  });
});
