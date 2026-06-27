// @vitest-environment jsdom
//
// T1 + T2: WPM set→reload→persists (regression guard for the charWpm/effWpm
// data-persistence bug report: "character speed set to 20 reverts to 15 after
// relaunch").
//
// Step A: write the reproduction test FIRST (per the brief). Run it; report
// RED (JS-layer bug found) or GREEN (JS-layer is innocent — environment-
// specific origin issue) in the implementer's summary.
//
// Note on approach: the Settings panel in wide mode (the jsdom mock default)
// lives in the Options rail. We open it via the ⚙ Settings button (aria-label
// "Settings"), fire fireEvent.change on the range input (userEvent doesn't
// natively support range sliders), then unmount and re-mount to simulate a
// reload (jsdom localStorage persists across mounts in a single test).
//
// Fake-timer rule (see feedback_test_patterns): vi.useFakeTimers() is NOT used
// here — no timer-driven behavior is under test.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";

afterEach(() => {
  window.localStorage.clear();
  cleanup();
});

// ---------------------------------------------------------------------------
// T1 — charWpm set then reload: persisted value is the NEW value, not the old
// ---------------------------------------------------------------------------
describe("T1 — charWpm persists across simulated reload", () => {
  it("slider changed to 20, reload, loaded value is 20 (not a prior saved value)", async () => {
    // Seed a prior session that had charWpm=15 so the bug scenario is live:
    // prior save had 15; user bumps to 20; reload must show 20.
    window.localStorage.clear();
    window.localStorage.setItem("wrcw:settings", JSON.stringify({ charWpm: 15, effWpm: 12 }));

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));

    // Open Settings (wide layout — gear opens in the rail).
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const rail = screen.getByRole("complementary", { name: "Options" });
    const charSlider = within(rail).getByRole("slider", { name: "Character speed" });

    // Confirm the slider loaded the prior-saved value (15).
    expect(charSlider.value).toBe("15");

    // Change to 20.
    fireEvent.change(charSlider, { target: { value: "20" } });

    // Confirm the slider now shows 20.
    expect(charSlider.value).toBe("20");

    // Confirm localStorage was updated to 20.
    const afterChange = JSON.parse(window.localStorage.getItem("wrcw:settings"));
    expect(afterChange.charWpm).toBe(20);

    // --- Simulate reload ---
    cleanup();  // unmount

    // jsdom localStorage persists; remount a fresh app — same as restarting.
    const user2 = userEvent.setup();
    render(<CWTrainer />);
    await user2.click(screen.getByText("tap to skip"));

    await user2.click(screen.getByRole("button", { name: "Settings" }));
    const rail2 = screen.getByRole("complementary", { name: "Options" });
    const charSlider2 = within(rail2).getByRole("slider", { name: "Character speed" });

    // Core assertion: the reloaded app must show 20, not the old 15.
    expect(charSlider2.value).toBe("20");

    // Belt-and-suspenders: the raw stored value must also be 20.
    const afterReload = JSON.parse(window.localStorage.getItem("wrcw:settings"));
    expect(afterReload.charWpm).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// T2 — Farnsworth boundary: charWpm low, effWpm set high then saved
//       On reload: charWpm is exactly what was set; effWpm is clamped to
//       [4, charWpm], not corrupted and not corrupting charWpm.
// ---------------------------------------------------------------------------
describe("T2 — effWpm is clamped to [4, charWpm] at load; charWpm unaffected", () => {
  it("stored effWpm > charWpm → on reload effWpm is clamped, charWpm unchanged", async () => {
    // Simulate a blob that could exist if a future code path wrote an
    // inconsistent state (or a direct localStorage edit): effWpm > charWpm.
    // The app should clamp effWpm to charWpm on load rather than rely only
    // on the slider's max= attribute, which is a UI-only guard.
    window.localStorage.clear();
    window.localStorage.setItem("wrcw:settings", JSON.stringify({ charWpm: 18, effWpm: 25 }));

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const rail = screen.getByRole("complementary", { name: "Options" });

    // charWpm must be exactly what was stored.
    const charSlider = within(rail).getByRole("slider", { name: "Character speed" });
    expect(charSlider.value).toBe("18");

    // effWpm must be clamped to charWpm (18), not the stored 25.
    const effSlider = within(rail).getByRole("slider", { name: "Effective speed (Farnsworth)" });
    expect(Number(effSlider.value)).toBeLessThanOrEqual(18);

    // The stored value must also reflect the clamped effWpm (the initializer
    // should write back, or the effect should flush the corrected value).
    // At minimum: charWpm in storage must still be 18 (not corrupted).
    const stored = JSON.parse(window.localStorage.getItem("wrcw:settings"));
    expect(stored.charWpm).toBe(18);
    expect(stored.effWpm).toBeLessThanOrEqual(18);
  });

  it("effWpm below 4 is not a corrupt wipe — charWpm unaffected", async () => {
    // effWpm=3 is below the slider min (4). The clamp at load should floor it
    // to 4, not corrupt charWpm.
    window.localStorage.clear();
    window.localStorage.setItem("wrcw:settings", JSON.stringify({ charWpm: 20, effWpm: 3 }));

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const rail = screen.getByRole("complementary", { name: "Options" });
    const charSlider = within(rail).getByRole("slider", { name: "Character speed" });
    expect(charSlider.value).toBe("20");

    // effWpm should be floored to at least 4. Assert the STORED (persisted)
    // value, not the slider's DOM readout — an <input type=range min=4> coerces
    // its .value to "4" regardless of state, so reading it wouldn't catch a
    // missing clamp. The stored value is the real produced state.
    const stored = JSON.parse(window.localStorage.getItem("wrcw:settings"));
    expect(stored.effWpm).toBeGreaterThanOrEqual(4);
  });
});
