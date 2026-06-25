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
    await user.click(screen.getByRole("button", { name: /START DRILL/i }));
    // Lesson 1 pool = K + M. Clicking either constitutes an attempt.
    await user.click(screen.getByRole("button", { name: "K" }));
    // Wait for the flash timer to clear the lock (600ms / 1200ms) — we need to
    // advance time. Use waitFor to avoid real delay in CI.
    // Actually we don't need to wait — we just need to see history.length > 0.
    // The flash setTimeout doesn't prevent BACK from being clicked (lock only
    // blocks answer(), not the BACK handler). BACK handler reads history which
    // was updated synchronously by setHistory in answer() before the timer.
    await user.click(screen.getByRole("button", { name: /← BACK|BACK/i }));

    raw = window.localStorage.getItem("wrcw:progress");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);
    expect(parsed.learn.length).toBeGreaterThan(0);
    expect(parsed.learn[0]).toMatchObject({ lesson: 1, attempts: 1 });
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
