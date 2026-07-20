// @vitest-environment jsdom
//
// GATE-ADDED — biting tests for v2.0 quick wins that shipped WITHOUT tests:
//   Item 6 — version display sourced from the real package version (Vite define),
//            not a hardcoded string.
//   Item 7 — autoCapitalize on the three Settings profile inputs
//            (callsign="characters", name="words", QTH="words").
//   Item 8 — HEAR / 🔊 emoji play buttons carry an aria-label so screen readers
//            announce an action, not the raw loudspeaker emoji.
//
// These were implemented in the product but had no regression net.  Each test
// asserts the produced DOM attribute/text so a revert (drop the attribute, drop
// the define wiring, drop the aria-label) makes it fail.

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRequire } from "node:module";
import { renderApp, gotoTab } from "./helpers.jsx";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

// Open the Settings panel via the gear button.  On the wide default layout the
// panel portals into the rail; the inputs are reachable from the document either
// way, so we query at the screen level after opening.
async function openSettings(user) {
  await user.click(screen.getByRole("button", { name: "Settings" }));
}

// ---------------------------------------------------------------------------
// Item 6 — version display tracks the real package.json version.
// ---------------------------------------------------------------------------
describe("v2.0 item 6 — version display sources the real package version", () => {
  it("renders v{package.json version} in Settings (Vite define), not a hardcode", async () => {
    // vitest evaluates vite.config.mjs, so __APP_VERSION__ is defined as
    // JSON.stringify(pkg.version).  Settings must show that exact value.
    const { user } = await renderApp();
    await openSettings(user);
    // RETARGET (2.4.1): the version now ALSO appears in the footer, so an
    // unscoped getByText matches twice.  Scoping to the Settings panel (portaled
    // into the rail on wide) is strictly stronger than the old document-wide
    // query — that one would have passed on any element anywhere carrying the
    // string, including the footer, even if Settings had lost its version.
    const settingsPanel = screen.getByRole("complementary", { name: "Options" });
    // Asserting against pkg.version — not a literal — means the test tracks the
    // real bump and fails if the display reverts to "dev" or a stale hardcode.
    expect(within(settingsPanel).getByText(`v${pkg.version}`)).toBeInTheDocument();
  });

  // 2.4.1 (N-2): the version also rides the footer tagline, because that is where
  // someone filing a bug report looks — Settings is a rail takeover you must leave
  // your practice to open.
  it("footer tagline carries the same version, with a screen-reader-friendly twin", async () => {
    await renderApp();

    const footer = screen.getByRole("contentinfo");
    // The visible token is the literal "v2.4.0" form...
    expect(within(footer).getByText(`v${pkg.version}`)).toBeInTheDocument();
    // ...and an sr-only twin spells it as words so AT does not read it as
    // "vee two point four point zero".  Both must track package.json.
    expect(within(footer).getByText(`Version ${pkg.version}`)).toBeInTheDocument();
    // The wordmark line is untouched — the version rides the tagline, not the brand mark.
    expect(within(footer).getByText(/WISCO RADIO LABS/)).not.toHaveTextContent(pkg.version);
  });
});

// ---------------------------------------------------------------------------
// Item 7 — autoCapitalize on the three Settings profile inputs.
// ---------------------------------------------------------------------------
describe("v2.0 item 7 — Settings inputs carry autoCapitalize", () => {
  it("callsign input has autoCapitalize=characters; name and QTH have words", async () => {
    const { user } = await renderApp();
    await openSettings(user);

    // The three profile inputs default to W1AW / PAT / NEWINGTON CT — find each by
    // its display value (the labels are sibling divs, not associated <label>s).
    const call = screen.getByDisplayValue("W1AW");
    const name = screen.getByDisplayValue("PAT");
    const qth = screen.getByDisplayValue("NEWINGTON CT");

    // getAttribute (lowercase DOM reflection of the React autoCapitalize prop).
    expect(call.getAttribute("autocapitalize")).toBe("characters");
    expect(name.getAttribute("autocapitalize")).toBe("words");
    expect(qth.getAttribute("autocapitalize")).toBe("words");
  });
});

// ---------------------------------------------------------------------------
// Item 8 — emoji-only / HEAR play buttons have accessible names.
// ---------------------------------------------------------------------------
describe("v2.0 item 8 — HEAR / 🔊 buttons have aria-labels", () => {
  it("LINGO term play buttons announce 'Hear {term} in Morse'", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN");
    // Sub-nav: LINGO holds the term play buttons.
    await user.click(screen.getByRole("button", { name: "LINGO" }));
    // At least one play button is named "Hear … in Morse" (not just "🔊").
    const hearButtons = screen.getAllByRole("button", { name: /Hear .+ in Morse/i });
    expect(hearButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("HISTORY per-era 🔊 button (emoji-only) has an accessible name", async () => {
    const { user } = await renderApp();
    await gotoTab(user, "LEARN");
    await user.click(screen.getByRole("button", { name: "HISTORY" }));
    // The per-era buttons render only "🔊" as visible text — their accessible
    // name must come from aria-label ("Hear … in Morse"), or a screen reader
    // would announce the raw loudspeaker glyph.
    const hearButtons = screen.getAllByRole("button", { name: /Hear .+ in Morse/i });
    expect(hearButtons.length).toBeGreaterThanOrEqual(1);
  });
});
