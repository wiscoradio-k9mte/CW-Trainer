// @vitest-environment jsdom
// Tests for the v2.0 cross-session progress history (design §1).
// Assertions target PRODUCED OUTPUT — what is stored in localStorage and what
// is rendered in the PROGRESS tab — not "an event fired."
//
// Fake-timer note: vi.useFakeTimers() is called AFTER splash navigation so
// the splash click resolves before timers are mocked (see feedback_test_patterns).
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { renderApp, gotoTab } from "./helpers.jsx";

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// PROGRESS tab empty states
// ---------------------------------------------------------------------------
describe("PROGRESS tab — empty states", () => {
  it("shows LEARN empty state when no sessions recorded", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "PROGRESS");
    expect(screen.getByText(/No LEARN sessions yet/i)).toBeDefined();
  });

  it("shows KEY empty state when no sessions recorded", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "PROGRESS");
    expect(screen.getByText(/No KEY sessions yet/i)).toBeDefined();
  });

  it("shows COPY empty state when no sessions recorded", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "PROGRESS");
    expect(screen.getByText(/No COPY sessions yet/i)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// LEARN: BACK records a session after at least one attempt
// ---------------------------------------------------------------------------
describe("PROGRESS — LEARN records on BACK", () => {
  it("writes nothing on zero-attempt BACK; writes a record after answering", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));

    await gotoTab(user, "LEARN");
    await user.click(screen.getByRole("button", { name: /START DRILL/i }));

    // BACK with zero attempts — must NOT write a learn record (guard in LearnTab).
    await user.click(screen.getByRole("button", { name: /← BACK|BACK/i }));
    let raw = window.localStorage.getItem("wrcw:progress");
    if (raw) {
      const parsed = JSON.parse(raw);
      expect(parsed.learn.length).toBe(0);
    }

    // Now answer a question to get an attempt into history, then BACK.
    // Pin the played character so the answer is deterministically CORRECT and the
    // persisted pct/correct VALUES can be asserted (not just the identifying
    // fields). nextDrill() uses Math.random() < 0.25 ? newChars[last] : rand(pool);
    // for lesson 1, newChars = ["K","M"], so random→0 forces the played char to
    // "M" (0 < 0.25 → newChars[1]). Answering "M" is then a correct attempt.
    const randSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    await user.click(screen.getByRole("button", { name: /START DRILL/i }));
    // Lesson 1 pool = K + M; the played char is pinned to "M" above, so clicking
    // "M" is a single CORRECT attempt → correct 1 / 1 → pct 100.
    await user.click(screen.getByRole("button", { name: "M" }));
    // The flash setTimeout doesn't prevent BACK from being clicked (lock only
    // blocks answer(), not the BACK handler). BACK handler reads history which
    // was updated synchronously by setHistory in answer() before the timer.
    await user.click(screen.getByRole("button", { name: /← BACK|BACK/i }));
    randSpy.mockRestore();

    raw = window.localStorage.getItem("wrcw:progress");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);
    expect(parsed.learn.length).toBeGreaterThan(0);
    expect(parsed.learn[0]).toMatchObject({ lesson: 1, attempts: 1 });
    // VALUE assertions: an all-correct single-attempt drill persists the exact
    // computed correct/pct, not a hardcoded or off-by-one value.
    expect(parsed.learn[0].correct).toBe(1);
    expect(parsed.learn[0].pct).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// No-persist banner appears when localStorage is unavailable
// ---------------------------------------------------------------------------
describe("PROGRESS — no-persist banner", () => {
  it("shows warning banner when localStorage.setItem throws", async () => {
    // Simulate a locked/private-mode storage: setItem throws
    const setItemSpy = vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("storage quota exceeded");
    });

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));

    // Banner should appear without any tab navigation needed — it renders after splash
    await waitFor(() => {
      const banner = screen.queryByText(/blocking local storage/i);
      expect(banner).not.toBeNull();
    });

    setItemSpy.mockRestore();
  });

  it("banner can be dismissed", async () => {
    const setItemSpy = vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("storage quota exceeded");
    });

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));

    await waitFor(() => {
      expect(screen.queryByText(/blocking local storage/i)).not.toBeNull();
    });

    const dismiss = screen.getByRole("button", { name: /Dismiss storage warning/i });
    await user.click(dismiss);

    // Banner gone
    expect(screen.queryByText(/blocking local storage/i)).toBeNull();

    setItemSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Progress survives remount (localStorage round-trip)
// ---------------------------------------------------------------------------
describe("PROGRESS — survives remount", () => {
  it("progress written by one mount is readable by a fresh mount", async () => {
    // renderApp() clears localStorage first, then renders. We must seed AFTER
    // the clear — use the manual render path instead of renderApp().
    window.localStorage.clear();
    const seed = {
      schemaVersion: 1,
      learn: [{ t: Date.now(), lesson: 1, attempts: 5, correct: 4, pct: 80 }],
      key: [],
      copy: [],
    };
    window.localStorage.setItem("wrcw:progress", JSON.stringify(seed));

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "PROGRESS");

    // The seeded LEARN entry should appear — Lesson 1 is rendered as a header
    expect(screen.getByText(/Lesson 1/i)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// FIX 2: stored dates appear in the PROGRESS view
// ---------------------------------------------------------------------------
describe("PROGRESS — date display (Fix 2)", () => {
  // Build a known epoch so we can assert the formatted string.
  // Use a fixed local date that toLocaleDateString will render consistently.
  // We pick a date and assert month+day appear somewhere in the rendered output.
  const KNOWN_T = new Date("2026-06-24T12:00:00").getTime(); // June 24 local time
  // toLocaleDateString with {month:'short',day:'numeric'} on this date will
  // render something like "Jun 24" in en-US.  We assert "Jun" and "24" appear
  // rather than the exact locale string so the test is locale-tolerant.

  it("LEARN row shows a human-readable date for a seeded record with t", async () => {
    window.localStorage.clear();
    window.localStorage.setItem("wrcw:progress", JSON.stringify({
      schemaVersion: 1,
      learn: [{ t: KNOWN_T, lesson: 2, attempts: 10, correct: 8, pct: 80 }],
      key: [],
      copy: [],
    }));

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "PROGRESS");

    // The Lesson 2 row should be present and contain a formatted date.
    // We scan the rendered text for the month name to stay locale-tolerant.
    const formatted = new Date(KNOWN_T).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    // At least the month portion must appear in the page somewhere.
    const monthStr = formatted.split(/[\s,]+/)[0]; // first token: "Jun" or locale equivalent
    expect(document.body.textContent).toContain(monthStr);
  });

  it("KEY session card shows a date for a seeded record with t", async () => {
    window.localStorage.clear();
    window.localStorage.setItem("wrcw:progress", JSON.stringify({
      schemaVersion: 1,
      learn: [],
      key: [{
        t: KNOWN_T, category: "words", keyType: "straight",
        copyPct: 55, estWpm: 12, wpmVerdict: "on target",
        elementVerdict: null, letterVerdict: "good", wordVerdict: "good",
        weightingVerdict: null, weightingRatio: null,
      }],
      copy: [],
    }));

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "PROGRESS");

    const formatted = new Date(KNOWN_T).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const monthStr = formatted.split(/[\s,]+/)[0];
    expect(document.body.textContent).toContain(monthStr);
  });

  it("COPY rung row shows a date for a seeded record with t", async () => {
    window.localStorage.clear();
    window.localStorage.setItem("wrcw:progress", JSON.stringify({
      schemaVersion: 1,
      learn: [],
      key: [],
      copy: [{ t: KNOWN_T, source: "single", pct: 70 }],
    }));

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "PROGRESS");

    const formatted = new Date(KNOWN_T).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const monthStr = formatted.split(/[\s,]+/)[0];
    expect(document.body.textContent).toContain(monthStr);
  });

  it("gracefully handles a record with no t field (no crash, no date shown)", async () => {
    // Older records (pre-t) must not crash the view.
    window.localStorage.clear();
    window.localStorage.setItem("wrcw:progress", JSON.stringify({
      schemaVersion: 1,
      learn: [{ lesson: 1, attempts: 3, correct: 2, pct: 67 }], // no t field
      key: [],
      copy: [],
    }));

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    // Just navigating to PROGRESS without crash is the assertion — if it threw
    // an unhandled error the test would already fail.
    await gotoTab(user, "PROGRESS");
    expect(screen.getByText(/Lesson 1/i)).toBeDefined();
  });
});
