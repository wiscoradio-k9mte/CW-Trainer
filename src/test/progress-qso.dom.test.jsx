// @vitest-environment jsdom
//
// Tests for Part B/C of the progress-graph redesign:
//   1. QSO record-on-completion: completing a full contact writes exactly one
//      "qso" record to localStorage with the correct averaged scores.
//   2. Abandoned/partial contact: no record written.
//   3. One-sided contact (only copy graded, or only send graded): the absent
//      side is recorded as null, not 0.
//   4. Graph render: bars appear for LEARN/COPY (accuracy variant has a mastery
//      line); KEY bars present, no mastery line; QSO section renders when seeded.
//
// All assertions target produced output — stored values and rendered elements,
// never "an event fired" or "a function was called."
//
// Driving strategy: EASY mode, ragchew/answer contact (DX→you→DX→you→DX, 5 steps).
//   DX steps: click CONTINUE → (no copy grading required in easy mode).
//   you steps: click CHECK TRANSMISSION (keyer.decoded is "" in jsdom — sim = 0%
//              but sendResult is set so TRANSMIT appears), then click TRANSMIT →.
// This drives the contact to completion with only real user events.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { gotoTab, chooseOption } from "./helpers.jsx";

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
  cleanup();
});

// Render the app past the splash, clear storage first.
async function freshApp() {
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  return { user };
}

// Switch difficulty to EASY — needed so DX steps show CONTINUE without waiting
// for audio. The Conditions selector is a CompactSelect combobox in the Options
// rail on wide; chooseOption opens it and commits the EASY option.
async function setEasy(user) {
  const rail = screen.getByRole("complementary", { name: "Options" });
  await chooseOption(user, "Conditions", /EASY/, rail);
}

// Drive a ragchew/answer contact in EASY mode all the way to "QSO COMPLETE".
// Expects the contact to already be in progress (qso state set, step 0).
// Call startContact() first to kick off the contact from setup, OR use after
// NEXT CONTACT (which calls start() directly with a new qso).
//
// Ragchew/answer has 5 steps: dx(0) → you(1) → dx(2) → you(3) → dx(4).
// DX steps in EASY: CONTINUE → available immediately (no countdown wait needed).
// you steps: CHECK TRANSMISSION (always clickable; empty decoded = 0% send) → TRANSMIT.
async function driveContactStepsToCompletion(user) {
  // Step 0: DX → CONTINUE (easy mode).
  await user.click(screen.getByRole("button", { name: /CONTINUE →/ }));

  // Step 1: you → CHECK TRANSMISSION → wait for TRANSMIT → TRANSMIT.
  await user.click(screen.getByRole("button", { name: /CHECK TRANSMISSION/ }));
  await user.click(screen.getByRole("button", { name: /TRANSMIT →/ }));

  // Step 2: DX → CONTINUE.
  await user.click(screen.getByRole("button", { name: /CONTINUE →/ }));

  // Step 3: you → CHECK TRANSMISSION → TRANSMIT.
  await user.click(screen.getByRole("button", { name: /CHECK TRANSMISSION/ }));
  await user.click(screen.getByRole("button", { name: /TRANSMIT →/ }));

  // Step 4: DX → CONTINUE → contact done.
  await user.click(screen.getByRole("button", { name: /CONTINUE →/ }));

  // Confirm done panel is visible before returning.
  expect(screen.getByText(/QSO COMPLETE/i)).toBeInTheDocument();
}

// Start the contact from the Options rail (only valid when in setup, i.e. !qso).
async function startContactFromRail(user) {
  const rail = screen.getByRole("complementary", { name: "Options" });
  await user.click(within(rail).getByRole("button", { name: /LISTEN FOR CQ/ }));
}

// Full contact from setup → done.
async function driveContactToCompletion(user) {
  await startContactFromRail(user);
  await driveContactStepsToCompletion(user);
}

// ---------------------------------------------------------------------------
// Completed contact writes exactly one qso record
// ---------------------------------------------------------------------------
describe("QSO record — completed contact writes one record", () => {
  it("completing a full ragchew/answer EASY contact writes exactly one qso record", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "QSO");
    await setEasy(user);

    await driveContactToCompletion(user);

    // Assert the produced output: a qso record in localStorage.
    const raw = window.localStorage.getItem("wrcw:progress");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);

    // Exactly one record (not zero, not two).
    expect(parsed.qso.length).toBe(1);

    const rec = parsed.qso[0];
    // Core fields must be present.
    expect(rec).toHaveProperty("t");
    expect(typeof rec.t).toBe("number");
    expect(rec.activity).toBe("ragchew");
    expect(rec.role).toBe("answer");
    expect(rec.difficulty).toBe("easy");

    // In EASY mode the DX steps have no copy input, so copyPct = null (no graded copy steps).
    // The you steps were graded via checkSend (empty decoded → sim=0), so sendPct is 0
    // (averageScore([0,0]) = 0, not null). This validates both null and 0 are correct.
    expect(rec.copyPct).toBeNull();
    // Assert the VALUE, not just typeof: in jsdom both you-steps grade with an
    // empty decode buffer → send sim = 0%, so averageScore([0,0]) = 0. A hardcoded
    // or wrongly-averaged sendPct would pass a typeof check but fail this.
    expect(rec.sendPct).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Abandoned contact writes NO record
// ---------------------------------------------------------------------------
describe("QSO record — abandoned contact does NOT write a record", () => {
  it("ABANDON mid-contact does not write a qso record", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "QSO");
    await setEasy(user);

    // Start the contact.
    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(within(rail).getByRole("button", { name: /LISTEN FOR CQ/ }));

    // Advance one step (not done yet).
    await user.click(screen.getByRole("button", { name: /CONTINUE →/ }));

    // Abandon mid-contact. Aria-label is "Abandon this contact and return to setup".
    await user.click(screen.getByRole("button", { name: /Abandon this contact/i }));

    // Confirm we're back to setup (no qso in progress).
    expect(screen.queryByText(/QSO COMPLETE/i)).not.toBeInTheDocument();

    // No qso record must have been written.
    const raw = window.localStorage.getItem("wrcw:progress");
    if (raw) {
      const parsed = JSON.parse(raw);
      expect(parsed.qso.length).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// One-sided contact: absent side recorded as null
// ---------------------------------------------------------------------------
describe("QSO record — one-sided contact records absent side as null", () => {
  it("EASY mode contact records copyPct=null (no copy grades in easy DX steps)", async () => {
    // Easy mode never invokes checkCopy on DX steps (the UI skips the copy box).
    // Result: copyScores stays empty → averageScore([]) → null.
    // sendScores gets 0% from each graded you step.
    const { user } = await freshApp();
    await gotoTab(user, "QSO");
    await setEasy(user);

    await driveContactToCompletion(user);

    const parsed = JSON.parse(window.localStorage.getItem("wrcw:progress"));
    expect(parsed.qso[0].copyPct).toBeNull();   // absent side → null, not 0
    expect(parsed.qso[0].sendPct).not.toBeNull(); // send WAS graded
  });
});

// ---------------------------------------------------------------------------
// Second contact appends (does not overwrite)
// ---------------------------------------------------------------------------
describe("QSO record — two completed contacts produce two records", () => {
  it("completing two contacts appends a second record (total: 2)", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "QSO");
    await setEasy(user);

    // First contact: start from rail → drive to completion.
    await driveContactToCompletion(user);

    // NEXT CONTACT calls start() directly — a new qso is already in progress;
    // the setup options (start button) do NOT reappear between contacts.
    // Drive the second contact from step 0 without a rail-start.
    await user.click(screen.getByRole("button", { name: /▶ NEXT CONTACT/ }));
    await driveContactStepsToCompletion(user);

    const parsed = JSON.parse(window.localStorage.getItem("wrcw:progress"));
    expect(parsed.qso.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Graph render: bars present / mastery line present-or-absent correctly
// ---------------------------------------------------------------------------
describe("PROGRESS graph render — BarTrend", () => {
  it("LEARN section shows bars (role=img) for seeded sessions", async () => {
    window.localStorage.setItem("wrcw:progress", JSON.stringify({
      schemaVersion: 1,
      learn: [
        { t: 1000, lesson: 1, attempts: 10, correct: 9, pct: 90 },
        { t: 2000, lesson: 1, attempts: 10, correct: 7, pct: 70 },
      ],
      key: [], copy: [], qso: [],
    }));

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "PROGRESS");

    // BarTrend renders with role="img" + aria-label. At least one LEARN chart.
    const learnCharts = screen.getAllByRole("img").filter((el) =>
      el.getAttribute("aria-label")?.toLowerCase().includes("lesson")
    );
    expect(learnCharts.length).toBeGreaterThan(0);

    // Assert KNOWN bar heights reflect the percentages (not just "a bar exists"):
    // the seeded recent series is 90% and 70%, so the bars are 90%/70% tall. An
    // inverted height (100-pct → 10%/30%) would fail this.
    const firstChart = learnCharts[0];
    const bars = firstChart.querySelectorAll("div:not([aria-hidden])");
    expect(bars.length).toBeGreaterThan(0);
    const heights = Array.from(bars).map((b) => b.style.height);
    expect(heights).toContain("90%");
    expect(heights).toContain("70%");
  });

  it("KEY section speed chart has no mastery line (variant=speed, accuracy line absent)", async () => {
    window.localStorage.setItem("wrcw:progress", JSON.stringify({
      schemaVersion: 1,
      learn: [],
      key: [{
        t: 1000, category: "words", keyType: "straight",
        copyPct: 80, estWpm: 18, wpmVerdict: "on target",
        elementVerdict: null, letterVerdict: "good", wordVerdict: "good",
        weightingVerdict: null, weightingRatio: null,
      }],
      copy: [], qso: [],
    }));

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "PROGRESS");

    // The KEY speed chart has no mastery line (aria-hidden dashed line element).
    // The accuracy charts do have one. We check by looking for the single speed
    // chart and inspecting its children for the dashed-line element.
    const keyChart = screen.getByRole("img", { name: /keying speed/i });
    expect(keyChart).toBeInTheDocument();
    // The mastery line (aria-hidden) must NOT be inside the KEY speed chart.
    const masteryLine = keyChart.querySelector("[aria-hidden='true']");
    expect(masteryLine).toBeNull();

    // Speed bars scale to 40 wpm (not 35, not 100): seeded estWpm 18 → 18/40 = 45%
    // tall. Changing maxVal to 100 would make it 18% and fail this.
    const speedBars = keyChart.querySelectorAll("div:not([aria-hidden])");
    expect(speedBars.length).toBeGreaterThan(0);
    expect(speedBars[0].style.height).toBe("45%");
  });

  it("accuracy charts (LEARN/COPY) include a mastery line element (aria-hidden)", async () => {
    window.localStorage.setItem("wrcw:progress", JSON.stringify({
      schemaVersion: 1,
      learn: [{ t: 1000, lesson: 1, attempts: 5, correct: 4, pct: 80 }],
      key: [],
      copy: [{ t: 2000, source: "single", pct: 75 }],
      qso: [],
    }));

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "PROGRESS");

    // LEARN chart
    const learnChart = screen.getByRole("img", { name: /lesson 1 accuracy/i });
    expect(learnChart.querySelector("[aria-hidden='true']")).not.toBeNull();

    // COPY chart
    const copyChart = screen.getByRole("img", { name: /single copy accuracy/i });
    expect(copyChart.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("QSO section shows empty state before any contacts", async () => {
    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "PROGRESS");

    expect(screen.getByText(/No QSO sessions yet/i)).toBeInTheDocument();
  });

  it("QSO section renders accuracy charts and record list when seeded", async () => {
    const NOW = Date.now();
    window.localStorage.setItem("wrcw:progress", JSON.stringify({
      schemaVersion: 1,
      learn: [], key: [], copy: [],
      qso: [
        { t: NOW, activity: "pota", role: "hunter", difficulty: "normal", copyPct: 88, sendPct: 75 },
        { t: NOW + 1, activity: "sota", role: "chaser", difficulty: "easy", copyPct: null, sendPct: 92 },
      ],
    }));

    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "PROGRESS");

    // Copy % and Send % charts render (two accuracy-variant charts in QSO section).
    expect(screen.getByRole("img", { name: /qso copy accuracy/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /qso send accuracy/i })).toBeInTheDocument();

    // Records list: the two contacts appear newest-first (sota second record is newest).
    // Activity + role + difficulty are rendered as "{activity} · {role} · {difficulty}".
    expect(screen.getByText(/sota · chaser · easy/i)).toBeInTheDocument();
    expect(screen.getByText(/pota · hunter · normal/i)).toBeInTheDocument();

    // null copyPct renders as "—" (not "0%") — scoped to the sota record ROW, since
    // "—" is pervasive in the app's help/glossary text (a body-wide check is vacuous).
    const sotaRow = screen.getByText(/sota · chaser · easy/i).closest("div").parentElement;
    expect(within(sotaRow).getByText("—")).toBeInTheDocument();
    // The pota row (both sides graded) has NO dash — proves "—" is the null marker,
    // not incidental text.
    const potaRow = screen.getByText(/pota · hunter · normal/i).closest("div").parentElement;
    expect(within(potaRow).queryByText("—")).toBeNull();

    // No empty state message.
    expect(screen.queryByText(/No QSO sessions yet/i)).not.toBeInTheDocument();
  });
});
