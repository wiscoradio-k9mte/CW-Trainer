// @vitest-environment jsdom
//
// BASELINE: COPY (receiving) and LEARN (Koch lessons) tabs.
// What this locks:
//   COPY  — the "What to copy" level ladder + Conditions controls render, a
//           level can be selected (pressed), and the copy input accepts typing.
//   LEARN — the CHARS lesson setup renders (lesson nav, START DRILL), the sub-nav
//           (CHARS/LINGO/ON AIR/HISTORY) switches sections, and starting a drill
//           enters the drill view.
// By role/text/label so the rail-split in the refactor can't drop these.

import { describe, it, expect } from "vitest";
import { renderApp, gotoTab, screen } from "./helpers.jsx";

describe("COPY tab — setup and interaction", () => {
  it("renders the level ladder and the Conditions controls", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    expect(screen.getByText("What to copy — climb as you improve")).toBeInTheDocument();
    expect(screen.getByText("Conditions")).toBeInTheDocument();

    // A couple of the level options and all three conditions.
    expect(screen.getByRole("button", { name: /1 character/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Callsigns/ })).toBeInTheDocument();
    for (const label of ["EASY", "NORMAL", "REAL LIFE"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("selects a copy level (marks it pressed)", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    // Default source is "single" (1 character).
    expect(screen.getByRole("button", { name: /1 character/ })).toHaveAttribute("aria-pressed", "true");

    const groups = screen.getByRole("button", { name: /Letter groups/ });
    await user.click(groups);
    expect(groups).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /1 character/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("accepts typing into the copy input", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "COPY");

    // NOTE: the "Your copy — type what you hear" caption is a sibling <div>, not
    // an associated <label>, so the input has no accessible name — see the report.
    // We locate it by its placeholder ("...") instead, which is what's actually in
    // the DOM today; the test still proves the input accepts and reflects typing.
    expect(screen.getByText("Your copy — type what you hear")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("...");
    await user.type(input, "abc");
    expect(input).toHaveValue("abc");
  });
});

describe("LEARN tab — CHARS setup and drill", () => {
  it("renders the lesson setup with START DRILL", async () => {
    await renderApp(); // opens on LEARN/CHARS by default
    expect(screen.getByText(/Lesson 1 of/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /START DRILL/ })).toBeInTheDocument();
    expect(screen.getByText("Characters in play")).toBeInTheDocument();
  });

  it("switches LEARN sub-sections via the sub-nav", async () => {
    const { user } = await renderApp();

    // CHARS is the default sub-section and is pressed.
    expect(screen.getByRole("button", { name: "CHARS" })).toHaveAttribute("aria-pressed", "true");

    // Switch to ON AIR — START DRILL (a CHARS-only control) disappears.
    await user.click(screen.getByRole("button", { name: "ON AIR" }));
    expect(screen.getByRole("button", { name: "ON AIR" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /START DRILL/ })).not.toBeInTheDocument();

    // Back to CHARS restores it.
    await user.click(screen.getByRole("button", { name: "CHARS" }));
    expect(screen.getByRole("button", { name: /START DRILL/ })).toBeInTheDocument();
  });

  it("enters the drill view when START DRILL is pressed", async () => {
    const { user } = await renderApp();

    await user.click(screen.getByRole("button", { name: /START DRILL/ }));

    // The drill view shows the LISTEN prompt and a REPLAY control, and the
    // setup's START DRILL button is gone.
    expect(screen.getByText("LISTEN...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /REPLAY/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /START DRILL/ })).not.toBeInTheDocument();
  });
});
