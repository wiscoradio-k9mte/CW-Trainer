// Shared helpers for the jsdom UI baseline tests.
//
// These tests are a REGRESSION NET for the upcoming responsive-layout refactor,
// which re-parents every tab into a two-pane shell. So every assertion is by
// ROLE / TEXT / LABEL — never by DOM structure, CSS, or element nesting — so the
// tests survive the controls moving between columns and stay meaningful: each
// one fails if the *behavior or affordance* disappears, not if the layout moves.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";

// Render the app and get past the splash. Clicking the splash is how a real user
// starts (it also unlocks/plays audio through the mock), and it avoids fake timers.
// The splash auto-dismisses at 2800ms; clicking is faster and more reliable.
// Returns the userEvent instance for the test to drive.
export async function renderApp() {
  // Each test starts from a clean slate: settings/lesson persist via localStorage
  // in jsdom and would otherwise leak between tests.
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  return { user };
}

// Switch to a top-level tab by its visible label (LEARN/KEY/COPY/QSO).
export async function gotoTab(user, label) {
  await user.click(screen.getByRole("button", { name: label }));
}

// Open a CompactSelect (found by its combobox accessible name) and commit the
// option whose accessible name matches `optionName`. Mirrors the real interaction:
// click the trigger to open the listbox, then click the option to commit + close.
//
// `scope` optionally narrows the search (pass the rail/main element or a within()
// result) so a portaled selector isn't ambiguous with another copy on the page.
// `comboName` / `optionName` accept a string (exact) or RegExp (substring), like
// Testing Library's own name matchers.
export async function chooseOption(user, comboName, optionName, scope) {
  const q = scope ? within(scope) : screen;
  const trigger = q.getByRole("combobox", { name: comboName });
  await user.click(trigger);
  await user.click(q.getByRole("option", { name: optionName }));
  return trigger;
}

export { screen, within };
