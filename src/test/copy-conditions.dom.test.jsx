// @vitest-environment jsdom
//
// F4 — COPY progress must not pool EASY and REAL LIFE attempts.
//
// The defect: a COPY record stored only the rung, so turning on noise/QSB made
// the operator's accuracy trend fall. The app was telling them they got worse
// when they had raised the difficulty.
//
// These tests drive the REAL path (Conditions selector -> NEW -> type -> CHECK)
// and assert PRODUCED OUTPUT: the object written to localStorage, and the exact
// rendered row header + BarTrend accessible name in the PROGRESS tab. The
// BarTrend name is the strongest single assertion available here — it carries
// the group's identity AND its whole data series in one string, scoped to one
// element.
//
// NOTE on spacing: RTL normalises whitespace, so nothing here is coverage for
// spacing/format. The label VALUES are pinned with exact `toBe` in
// cw-core.test.js (copyConditionsLabel).

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { gotoTab, chooseOption } from "./helpers.jsx";
import { PROGRESS_SCHEMA_VERSION } from "../cw-core.js";

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

async function freshApp() {
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  return { user };
}

// Mount from whatever is already in localStorage (no clear) — the read-back path.
async function remountFromStore() {
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  return { user };
}

// Run one COPY attempt at the default "single" rung with the target pinned.
//
// newTarget() for source "single" does pick(easyPool) where easyPool =
// KOCH.slice(0,14) filtered to alnum, and pick() uses Math.floor(random*len).
// Stubbing random -> 0 pins the target to easyPool[0] = "K", so typing "K" is a
// perfect copy (pct 100) and typing "M" is a total miss (pct 0) — known VALUES,
// not "some number".
//
// "▶ NEW" runs a 5-second listen countdown before it sets the target, so the
// clock has to be advanced past it. Fake timers are switched on only here, after
// all userEvent navigation has happened on real timers (see feedback_test_patterns).
function copyAttempt(typed) {
  const randSpy = vi.spyOn(Math, "random").mockReturnValue(0);
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: /▶ NEW/ }));
  act(() => {
    vi.advanceTimersByTime(6000);
  });
  fireEvent.change(screen.getByRole("textbox", { name: /Your copy/i }), {
    target: { value: typed },
  });
  fireEvent.click(screen.getByRole("button", { name: "CHECK" }));
  vi.useRealTimers();
  randSpy.mockRestore();
}

// The COPY row header is one <span> holding the rung plus a NESTED dim <span>
// for the conditions, so RTL's default matcher — which sees only an element's
// DIRECT text nodes — can't see the whole string. Match on the span's full
// textContent instead. The outer span is the only element that matches exactly:
// its child span is just " · easy", and its parent row also carries "last N%".
const rowHeader = (text) => (_content, el) =>
  el?.tagName === "SPAN" && el.textContent === text;

function storedProgress() {
  const raw = window.localStorage.getItem("wrcw:progress");
  expect(raw).not.toBeNull();
  return JSON.parse(raw);
}

describe("COPY conditions — what gets STORED", () => {
  it("[T1] a REAL LIFE attempt stores conditions:'real' at schema v3", async () => {
    // MUTATION RUN: dropping `conditions: difficulty` from the record() call in
    // CopyTrainer.check() turns this red on the conditions assertion.
    const { user } = await freshApp();
    await gotoTab(user, "COPY");
    await chooseOption(user, "Conditions", "REAL LIFE");

    copyAttempt("K");

    const p = storedProgress();
    expect(p.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
    expect(p.copy.length).toBe(1);
    expect(p.copy[0].source).toBe("single");
    expect(p.copy[0].conditions).toBe("real");
    expect(p.copy[0].pct).toBe(100);
  });

  it("[T1] the selector's value is what is stored — EASY stores 'easy'", async () => {
    // Guards against a hardcoded constant satisfying the test above.
    const { user } = await freshApp();
    await gotoTab(user, "COPY");
    await chooseOption(user, "Conditions", "EASY");

    copyAttempt("K");

    expect(storedProgress().copy[0].conditions).toBe("easy");
  });
});

describe("COPY conditions — what gets RENDERED in PROGRESS", () => {
  it("[T1][T2] two conditions on one rung render as two distinct, plainly labelled rows", async () => {
    // MUTATION RUN: removing `conditions` from copyTrend()'s group key collapses
    // these into one row → both getByRole("img") lookups fail.
    const { user } = await freshApp();
    await gotoTab(user, "COPY");

    // A strong EASY attempt, then a weak REAL LIFE one — the exact shape that
    // used to read as "your accuracy fell off a cliff".
    await chooseOption(user, "Conditions", "EASY");
    copyAttempt("K"); // 100%
    await chooseOption(user, "Conditions", "REAL LIFE");
    copyAttempt("M"); // 0% — wrong character

    const stored = storedProgress();
    expect(stored.copy.map((r) => [r.conditions, r.pct])).toEqual([
      ["easy", 100],
      ["real", 0],
    ]);

    await gotoTab(user, "PROGRESS");

    // Row headers: plain English, never the raw enum.
    expect(screen.getByText(rowHeader("single · easy"))).toBeInTheDocument();
    expect(screen.getByText(rowHeader("single · real life"))).toBeInTheDocument();
    expect(screen.queryByText(rowHeader("single · real"))).not.toBeInTheDocument();

    // Per-group series, scoped to one element each. Each chart's accessible name
    // carries its own condition AND its own values — proof they are not pooled.
    expect(
      screen.getByRole("img", {
        name: "single copy accuracy, easy over last 1 session: 100 percent — trending flat",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "single copy accuracy, real life over last 1 session: 0 percent — trending flat",
      })
    ).toBeInTheDocument();

    // The pooled series that caused the defect must not exist anywhere.
    expect(
      screen.queryByRole("img", {
        name: /single copy accuracy over last 2 sessions: 100, 0 percent/,
      })
    ).not.toBeInTheDocument();
  });

  it("[T3] a pre-v3 record renders in its own 'conditions not recorded' row", async () => {
    // Seeded as a v1 build would have written it: a copy record with no
    // `conditions` field at all, beside one written by this build.
    window.localStorage.clear();
    window.localStorage.setItem(
      "wrcw:progress",
      JSON.stringify({
        schemaVersion: 1,
        learn: [],
        key: [],
        copy: [
          { t: 1000, source: "words", pct: 64 },                        // pre-v3
          { t: 2000, source: "words", conditions: "real", pct: 88 },    // post-v3
        ],
      })
    );

    const { user } = await remountFromStore();
    await gotoTab(user, "PROGRESS");

    // The old record must NOT be attributed to a condition it may not have used.
    expect(screen.getByText(rowHeader("words · conditions not recorded"))).toBeInTheDocument();
    expect(screen.getByText(rowHeader("words · real life"))).toBeInTheDocument();
    expect(screen.queryByText(rowHeader("words · normal"))).not.toBeInTheDocument();

    expect(
      screen.getByRole("img", {
        name: "words copy accuracy, conditions not recorded over last 1 session: 64 percent — trending flat",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "words copy accuracy, real life over last 1 session: 88 percent — trending flat",
      })
    ).toBeInTheDocument();
  });

  it("[T4] a v1 blob MIGRATES rather than wiping — LEARN/KEY/COPY/QSO all survive", async () => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "wrcw:progress",
      JSON.stringify({
        schemaVersion: 1,
        learn: [{ t: 1, lesson: 7, attempts: 10, correct: 9, pct: 90 }],
        key: [{
          t: 2, category: "words", keyType: "straight", copyPct: 55, estWpm: 12,
          wpmVerdict: "on target", elementVerdict: null, letterVerdict: "good",
          wordVerdict: "good", weightingVerdict: null, weightingRatio: null,
        }],
        copy: [{ t: 3, source: "calls", pct: 41 }],
        qso: [{ t: 4, activity: "pota", role: "hunter", difficulty: "normal", copyPct: 70, sendPct: 60 }],
      })
    );

    const { user } = await remountFromStore();
    await gotoTab(user, "PROGRESS");

    // Every category still renders its record (none of the empty states appear).
    expect(screen.getByText(/Lesson 7/)).toBeInTheDocument();
    expect(screen.getByText(/words · straight/)).toBeInTheDocument();
    expect(screen.getByText(rowHeader("calls · conditions not recorded"))).toBeInTheDocument();
    expect(screen.queryByText(/No COPY sessions yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No QSO sessions yet/i)).not.toBeInTheDocument();

    // And the blob is stamped forward, with the old record's data intact.
    cleanup();
    const p = storedProgress();
    expect(p.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
    expect(p.copy).toEqual([{ t: 3, source: "calls", pct: 41 }]);
    expect(p.qso.length).toBe(1);
  });

  it("[T5] with no COPY records the empty state shows — no 0% row for any condition", async () => {
    const { user } = await freshApp();
    await gotoTab(user, "PROGRESS");
    expect(screen.getByText(/No COPY sessions yet/i)).toBeInTheDocument();
    // No fabricated per-condition rows.
    expect(
      screen.queryByText(
        (_c, el) =>
          el?.tagName === "SPAN" &&
          / · (easy|normal|real life|conditions not recorded)$/.test(el.textContent)
      )
    ).not.toBeInTheDocument();
  });
});
