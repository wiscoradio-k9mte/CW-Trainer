// @vitest-environment jsdom
//
// Settings — callsign format validation (board card: "Settings never validates
// the callsign format (myCall accepts anything)").
//
// settings.myCall is interpolated into every CQ/exchange script AND is what a
// QSO send is graded against (gradeSend's `required(myCall)` — see checkSend in
// wr-cw-trainer.jsx), so an unformatted value there teaches a wrong fist. The
// pure grammar check lives in cw-core.js (`validateCallsign`, gate-tested in
// cw-core.test.js with the real accept/reject corpus); these tests cover the
// UI WIRING: when the message renders, what it says, and that the operator's
// typed input is never discarded or blocked from saving.
//
// UX decision (validate on blur, warn-and-save, never block): reject-on-type
// is hostile — you cannot type K9MTE without passing through "K" — and this
// panel's whole design autosaves every field on every keystroke (see the
// `store.save` effect keyed on `settings`), so blocking the save for JUST this
// one field would break that established, consistent pattern and would mean
// snapping the operator's own typing back, which the brief explicitly rules
// out. So: keep saving whatever is typed (matches every sibling field), and
// only ever ADD an inline warning once there's a finished value to judge.
//
// Mutation-proven (see the implementer's report): inverting validateCallsign's
// return reds T2/T3/T5; deleting the error-message render reds T2/T3.

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderApp } from "./helpers.jsx";

async function openSettings(user) {
  await user.click(screen.getByRole("button", { name: "Settings" }));
}

function readStoredCall() {
  return JSON.parse(window.localStorage.getItem("wrcw:settings")).myCall;
}

const ERROR_TEXT = /Doesn't look like a callsign/;

describe("Settings — callsign format validation", () => {
  it("T1 — the shipped default (W1AW) shows no error on open", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const input = screen.getByRole("textbox", { name: "Your callsign" });
    expect(input.value).toBe("W1AW");
    expect(screen.queryByText(ERROR_TEXT)).toBeNull();
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("T2 — typing garbage and leaving the field shows the error message, and the typed value is still saved verbatim (not reverted)", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const input = screen.getByRole("textbox", { name: "Your callsign" });
    await user.clear(input);
    await user.type(input, "asdf");
    // Leave the field (Tab moves focus to the next field, firing blur).
    await user.tab();

    // Produced output #1, checked FIRST so it can independently fail: the
    // operator's own input is what's on screen and what persisted — never
    // silently discarded or reverted to the old default, even though it's
    // invalid-shaped. (Ordered ahead of the message check below so a mutation
    // that breaks ONLY this claim, e.g. reverting/blocking an invalid value,
    // reds here rather than being masked by the message assertion.)
    expect(input.value).toBe("ASDF");
    expect(readStoredCall()).toBe("ASDF");

    // Produced output #2: the rendered message text, not just "an error showed".
    expect(screen.getByText(ERROR_TEXT)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("T3 — the error is absent WHILE typing (only appears after blur)", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const input = screen.getByRole("textbox", { name: "Your callsign" });
    await user.clear(input);
    await user.type(input, "asdf");

    // Still focused, not yet blurred: reject-on-type would be hostile, so no
    // message yet even though the current value is already invalid-shaped.
    expect(screen.queryByText(ERROR_TEXT)).toBeNull();
  });

  it("T4 — an empty callsign is NOT flagged as a format error (it's the app's already-explained 'not set' state)", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const input = screen.getByRole("textbox", { name: "Your callsign" });
    await user.clear(input);
    await user.tab();

    expect(input.value).toBe("");
    expect(screen.queryByText(ERROR_TEXT)).toBeNull();
    expect(readStoredCall()).toBe("");
  });

  it("T5 — refocusing a flagged field clears the message, and fixing the value to a real callsign clears it on the next blur", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    const input = screen.getByRole("textbox", { name: "Your callsign" });
    await user.clear(input);
    await user.type(input, "asdf");
    await user.tab();
    expect(screen.getByText(ERROR_TEXT)).toBeInTheDocument();

    // Click back into the flagged field: the message clears immediately, before
    // any new keystroke — re-editing shouldn't re-flicker the warning at every
    // intermediate character of the correction either.
    await user.click(input);
    expect(screen.queryByText(ERROR_TEXT)).toBeNull();

    await user.clear(input);
    await user.type(input, "K9MTE");
    await user.tab();

    expect(screen.queryByText(ERROR_TEXT)).toBeNull();
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(readStoredCall()).toBe("K9MTE");
  });
});
