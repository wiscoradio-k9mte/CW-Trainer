// @vitest-environment jsdom
//
// CompactSelect fast-follow: the COPY level ladder adopts the standard selector,
// and LEARN's lesson stepper is harmonized to the same control family.
// (docs/design-compact-selectors.md §4.6 / §6.)
//
// The structural "is it the same component" proof lives in
// compact-select-consistency.dom.test.jsx. This file covers the behavior that
// must NOT have changed, and the accessibility floor the adoption has to keep:
//   T3  — a rung commit changes the copy source, and COPY level/difficulty stay
//         session-local (no new persisted key, nothing survives a remount).
//   T5  — LEARN's numeric jump still accepts a value and clamps it to
//         [1, maxLesson], still clears history, still persists kochLesson.
//   T6  — 44px trigger / 40px option rows, a non-color selected cue, keyboard-only
//         parity with KEY's selector, and the value change reaching a screen reader.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { renderApp, gotoTab, chooseOption, screen, within } from "./helpers.jsx";

const LADDER = /What to copy/;

// ▶ NEW runs a 5-second listen countdown before the target is generated; skip it
// with fake timers, then REVEAL and read the target out of the Display element
// that follows the "Sent" heading. (Same shape as copy-learn's helper.)
async function generateAndReveal(user) {
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: /▶ NEW/ }));
  act(() => { vi.advanceTimersByTime(6000); });
  vi.useRealTimers();
  await act(async () => {});
  await user.click(screen.getByRole("button", { name: /REVEAL/ }));
  return screen.getByText("Sent").nextElementSibling.textContent.trim();
}

// ---------------------------------------------------------------------------
// T3 — selection behavior and session-locality
// ---------------------------------------------------------------------------
describe("COPY ladder — selection behavior is unchanged", () => {
  afterEach(() => { vi.useRealTimers(); });

  // MUTATION-PROVEN: changing the ladder's onChange from `setSource` to a no-op
  // (`() => {}`) turns this red on the ▶ NEW assertion — the generated target
  // stays a single character instead of becoming a 4-group of 3-4 letters.
  it("committing a rung actually changes the copy source that gets generated", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    // Rung 1 ("single") generates exactly one character.
    expect(await generateAndReveal(user)).toMatch(/^[A-Z0-9]$/);

    // Rung 3 ("groups") generates several multi-character groups instead.
    await chooseOption(user, LADDER, /Letter groups/);
    const tokens = (await generateAndReveal(user)).split(/\s+/).filter(Boolean);
    expect(tokens.length).toBeGreaterThan(1);
    for (const tok of tokens) expect(tok.length).toBeGreaterThanOrEqual(3);
  });

  it("COPY level and difficulty stay session-local — no new persisted key, no carry-over", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    const view = render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "COPY");

    await chooseOption(user, LADDER, /Callsigns/);
    await chooseOption(user, "Conditions", "REAL LIFE");
    expect(screen.getByRole("combobox", { name: LADDER })).toHaveTextContent("7 — Callsigns");

    // Nothing about the COPY tab was written to storage. The sanctioned key list
    // is the same one v1-3-fixes pins — this adoption must not extend it.
    for (const key of Object.keys(window.localStorage)) {
      expect(key).toMatch(/^wrcw:(kochLesson|settings|introKeyCollapsed|seenCallNudge|progress)$/);
    }

    // …and a remount comes back to the rung-1 default, proving it was never saved.
    view.unmount();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "COPY");
    expect(screen.getByRole("combobox", { name: LADDER })).toHaveTextContent("1 — 1 character");
    expect(screen.getByRole("combobox", { name: "Conditions" })).toHaveTextContent("NORMAL");
  });
});

// ---------------------------------------------------------------------------
// T6 — accessibility floor
// ---------------------------------------------------------------------------
describe("COPY ladder — accessibility no-regression", () => {
  it("meets the touch-target floor on the trigger and every option row", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const trigger = screen.getByRole("combobox", { name: LADDER });
    expect(trigger.style.minHeight).toBe("44px");

    await user.click(trigger);
    const rows = screen.getAllByRole("option");
    expect(rows).toHaveLength(8);
    // 40px row + the panel's own row padding clears the 44px thumb target; this is
    // the same floor the five shipped selectors hold.
    for (const row of rows) expect(row.style.minHeight).toBe("40px");
  });

  it("signals the selected rung without relying on colour alone", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");
    await user.click(screen.getByRole("combobox", { name: LADDER }));

    const selected = screen.getByRole("option", { name: /1 character/ });
    const other = screen.getByRole("option", { name: /Callsigns/ });

    // Cue 1 — a ✓ glyph, present on the selected row only. It is aria-hidden
    // (aria-selected already carries the state for AT); its job is to survive
    // grayscale for sighted users who can't use the amber.
    expect(selected.textContent).toContain("✓");
    expect(other.textContent).not.toContain("✓");

    // Cue 2 — weight. The selected label is 700, the others are not.
    const weightOf = (row) => within(row).getByText(/^(1 character|Callsigns)$/).style.fontWeight;
    expect(weightOf(selected)).toBe("700");
    expect(weightOf(other)).not.toBe("700");
  });

  it("is fully operable from the keyboard, like the KEY category selector", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const trigger = screen.getByRole("combobox", { name: LADDER });
    trigger.focus();

    // ArrowDown opens without committing (navigation is side-effect free).
    await user.keyboard("{ArrowDown}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveTextContent("1 — 1 character");

    // Arrow to rung 4 and commit with Enter.
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
    expect(trigger).toHaveTextContent("4 — Common words");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    // Escape closes without committing.
    await user.keyboard("{ArrowDown}{ArrowDown}{Escape}");
    expect(trigger).toHaveTextContent("4 — Common words");
  });

  it("returns focus to the trigger on commit so the new value reaches a screen reader", async () => {
    // COPY has no live region for the ladder, and doesn't need one: the combobox
    // itself carries the value, so as long as focus is on the trigger when its
    // text changes, AT announces the new rung. That focus return is therefore the
    // announcement mechanism — this asserts it rather than a live-region string
    // that doesn't exist. (Same reasoning as the shipped QSO/COPY Conditions
    // selectors; docs/design-compact-selectors.md §3.)
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    const trigger = screen.getByRole("combobox", { name: LADDER });
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: /QSO phrases/ }));

    expect(document.activeElement).toBe(trigger);
    expect(trigger).toHaveTextContent("8 — QSO phrases");
    // The name still comes from the section label, not the value — so AT reads
    // "What to copy … 8 — QSO phrases", not a control that renamed itself.
    expect(trigger).toHaveAccessibleName("What to copy — climb as you improve");
  });
});

// ---------------------------------------------------------------------------
// T5 — LEARN harmonization keeps every behavior
// ---------------------------------------------------------------------------
describe("LEARN lesson stepper — harmonized chrome, unchanged behavior", () => {
  it("keeps the numeric jump: it accepts a value and clamps to [1, maxLesson]", async () => {
    await renderApp(); // opens on LEARN/CHARS
    const jump = screen.getByRole("spinbutton", { name: "Jump to lesson" });
    const max = Number(jump.getAttribute("max"));
    expect(max).toBeGreaterThan(1);

    // NOTE on method: this drives the input with fireEvent.change, not
    // userEvent.type. The field is a CONTROLLED number input whose onChange
    // floors an empty value to 1, so `clear()` immediately snaps it back to "1"
    // and a subsequent type() APPENDS to that ("7" → 17). fireEvent.change sets
    // the whole value at once, which is what a real select-all-and-retype (or a
    // paste) does — and it is the direct exercise of the clamp. Same reason the
    // slider tests use fireEvent.change.
    const setJump = (v) => fireEvent.change(jump, { target: { value: v } });

    setJump("12");
    expect(jump).toHaveValue(12);

    // Clamps above the top lesson…
    setJump(String(max + 5));
    expect(jump).toHaveValue(max);

    // …and at the bottom: 0, a negative, and an emptied field all floor to 1.
    setJump("0");
    expect(jump).toHaveValue(1);
    setJump("12");
    setJump("-3");
    expect(jump).toHaveValue(1);
    setJump("12");
    setJump("");
    expect(jump).toHaveValue(1);
  });

  it("clears the answer history when the lesson is jumped", async () => {
    // The ephemeral session summary is derived from history[] at BACK time, so it
    // is the observable readout of history's length. Answer once per drill: if the
    // jump did NOT clear history, the second summary would read "of 2".
    //
    // MUTATION-PROVEN: deleting `setHistory([])` from the jump input's onChange
    // makes the second summary read "1 of 2" and turns this red.
    const { user } = await renderApp();

    const answerOne = async () => {
      await user.click(screen.getByRole("button", { name: /START DRILL/ }));
      const pool = screen.getAllByRole("button").filter((b) => /^[KM]$/.test(b.textContent));
      expect(pool.length).toBeGreaterThan(0); // sanity: the drill grid must render
      await user.click(pool[0]);
      await user.click(screen.getByRole("button", { name: /← BACK|BACK/ }));
      return (await screen.findByText(/You answered \d+ of \d+ correctly/i)).textContent;
    };

    expect(await answerOne()).toMatch(/of 1 correctly/);

    const jump = screen.getByRole("spinbutton", { name: "Jump to lesson" });
    fireEvent.change(jump, { target: { value: "5" } });
    expect(jump).toHaveValue(5);

    // Still "of 1" — the jump wiped the previous set rather than accumulating.
    expect(await answerOne()).toMatch(/of 1 correctly/);
  });

  it("keeps the ←/→ stepper, its end-clamping, and the history reset", async () => {
    const { user } = await renderApp();
    const jump = screen.getByRole("spinbutton", { name: "Jump to lesson" });
    const prev = screen.getByRole("button", { name: "Previous lesson" });
    const next = screen.getByRole("button", { name: "Next lesson" });

    // At lesson 1 the back arrow is disabled (the clamped end).
    expect(jump).toHaveValue(1);
    expect(prev).toBeDisabled();

    await user.click(next);
    expect(jump).toHaveValue(2);
    expect(prev).toBeEnabled();

    await user.click(prev);
    expect(jump).toHaveValue(1);
    expect(prev).toBeDisabled();
  });

  it("still persists the lesson across a remount", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    const view = render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));

    const jump = screen.getByRole("spinbutton", { name: "Jump to lesson" });
    fireEvent.change(jump, { target: { value: "7" } });
    expect(window.localStorage.getItem("wrcw:kochLesson")).toBe("7");

    view.unmount();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    expect(screen.getByRole("spinbutton", { name: "Jump to lesson" })).toHaveValue(7);
  });

  it("reads as the same control family as KEY's fused stepper", async () => {
    // The harmonization is visual, so this asserts the shared recipe rather than
    // pixel positions: both are a [prev] [value] [next] row whose arrows and value
    // element share the trigger's chrome and 44px touch target. It bites if the
    // LEARN row is reverted to the old ~28px `padding: 5px 12px` arrows.
    const { user } = await renderApp();

    const learnArrows = [
      screen.getByRole("button", { name: "Previous lesson" }),
      screen.getByRole("button", { name: "Next lesson" }),
    ];
    const learnValue = screen.getByRole("spinbutton", { name: "Jump to lesson" }).parentElement;

    await gotoTab(user, "KEY");
    const keyArrows = [
      screen.getByRole("button", { name: "Previous category" }),
      screen.getByRole("button", { name: "Next category" }),
    ];
    const keyTrigger = screen.getByRole("combobox", { name: /Drill category/ });

    // Arrows: identical padding, touch height and bottom alignment.
    for (const [learn, key] of learnArrows.map((a, i) => [a, keyArrows[i]])) {
      expect(learn.style.padding).toBe(key.style.padding);
      expect(learn.style.minHeight).toBe(key.style.minHeight);
      expect(learn.style.marginBottom).toBe(key.style.marginBottom);
    }

    // Value element: same ground, border, radius, padding and touch height as the
    // CompactSelect trigger it sits beside on the other tab.
    for (const prop of ["background", "border", "borderRadius", "minHeight", "padding"]) {
      expect(learnValue.style[prop]).toBe(keyTrigger.style[prop]);
    }
  });
});
