// @vitest-environment jsdom
//
// GAP 2 (v2.0 gate): the QSO rail's live running score UPDATES mid-contact.
//
// qso-relocation.dom.test.jsx pins the STATIC context headings in the rail
// (In contact / DX / Difficulty / Step) once a contact starts. It does NOT
// assert the LIVE running score (Copy %/Send %) actually appears/updates after a
// graded step. The rail's "Running avg" block is gated on avgCopyLive/avgSendLive
// being non-null — i.e. it renders ONLY after at least one copy/send step has been
// graded. This test drives a graded copy step (CHECK COPY) and asserts the running
// Copy % appears in the rail where it was absent before.
//
// It asserts the produced output (rendered "Running avg" + "Copy:" + a percentage
// in the rail), not "an event fired". It is mutation-verified: rendering the
// avgCopyLive value off makes it fail (see the gate report).

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { gotoTab } from "./helpers.jsx";

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe("QSO rail — live running score updates after a graded step", () => {
  it("Copy % appears in the rail only AFTER a copy step is graded (was absent before)", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await gotoTab(user, "QSO");

    // Start a default Ragchew "Answer a CQ" contact from the rail control.
    const rail = screen.getByRole("complementary", { name: "Options" });
    await user.click(within(rail).getByRole("button", { name: /LISTEN FOR CQ|CALL CQ/ }));

    // Mid-contact: the context headings are present, but NO running score yet —
    // nothing has been graded. This is the "before" half of the bite.
    expect(within(rail).getByText("In contact")).toBeInTheDocument();
    expect(within(rail).queryByText("Running avg")).not.toBeInTheDocument();
    expect(within(rail).queryByText(/^Copy:/)).not.toBeInTheDocument();

    // First step is a DX (receiving) step in NORMAL difficulty → a copy input +
    // CHECK COPY are available in main. Type an answer and grade it.
    const copyInput = screen.getByRole("textbox", { name: /Your copy of what you heard/i });
    await user.type(copyInput, "TEST");
    await user.click(screen.getByRole("button", { name: "CHECK COPY" }));

    // "after": the rail now shows the running Copy % — the live score updated.
    expect(within(rail).getByText("Running avg")).toBeInTheDocument();
    const copyLine = within(rail).getByText(/^Copy:/);
    expect(copyLine).toBeInTheDocument();
    // The value rendered next to "Copy:" is a percentage (the avgCopyLive span).
    expect(copyLine.textContent).toMatch(/\d+%/);
  });
});
