// @vitest-environment jsdom
//
// NARROW-MODE regression net for the responsive shell (Phase 1).
//
// The shared setup (setup.dom.js) mocks window.matchMedia with `matches: true`
// — i.e. every OTHER jsdom test renders the WIDE (desktop) arrangement. This
// file is the counterpart: it overrides matchMedia to `matches: false` so the
// useIsWide() hook returns false and the app renders the NARROW (single-column)
// arrangement, then asserts the app still renders the tabs and a tab's key
// controls.
//
// Why this matters now: Phase 1 only moves the shell (nav rail + empty options
// rail) and gates the options <aside> on `isWide`. As later phases start moving
// each tab's setup controls into the rail BASED ON isWide, the narrow branch
// becomes a real, divergent render path. Covering it now means the collapse path
// has a guard before any control's visibility starts depending on the width.
//
// Everything is asserted by role/text — never by structure or CSS — so it stays
// meaningful as the rail-split lands in later phases.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CWTrainer from "../../wr-cw-trainer.jsx";
import { chooseOption } from "./helpers.jsx";

// Save the wide-default mock the shared setup installed, override it with a
// narrow one for this file only, and restore it afterward so no other test file
// inherits a narrow matchMedia (test files share the jsdom global).
let savedMatchMedia;

beforeEach(() => {
  savedMatchMedia = window.matchMedia;
  window.matchMedia = (query) => ({
    matches: false, // narrow / mobile viewport — useIsWide() returns false
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  });
});

afterEach(() => {
  window.matchMedia = savedMatchMedia;
});

// Local renderApp that does NOT reach through helpers.jsx — it must run AFTER
// the per-test matchMedia override above is in place (the hook reads matchMedia
// once on first render via useMemo). Mirrors helpers.renderApp otherwise.
async function renderNarrow() {
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<CWTrainer />);
  await user.click(screen.getByText("tap to skip"));
  return { user };
}

describe("narrow (mobile) layout — collapse path", () => {
  it("renders the four-tab nav in narrow mode", async () => {
    await renderNarrow();
    for (const label of ["LEARN", "KEY", "COPY", "QSO"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // The nav keeps its accessible name in both orientations.
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeInTheDocument();
  });

  it("keeps aria-pressed on the tabs and switches view in narrow mode", async () => {
    const { user } = await renderNarrow();

    // Opens on LEARN, pressed.
    expect(screen.getByRole("button", { name: "LEARN" })).toHaveAttribute("aria-pressed", "true");

    // Switch to KEY — its NEW TEXT control (unique to KEY) appears, LEARN's
    // START DRILL goes away.
    await user.click(screen.getByRole("button", { name: "KEY" }));
    expect(screen.getByRole("button", { name: "KEY" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /NEW TEXT/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /START DRILL/ })).not.toBeInTheDocument();
  });

  it("renders a tab's key setup controls in narrow mode (COPY)", async () => {
    const { user } = await renderNarrow();
    await user.click(screen.getByRole("button", { name: "COPY" }));

    // The COPY setup controls still render in the single-column layout — they are
    // NOT gated out on narrow. (Once later phases gate the rail on isWide, this
    // catches a regression where narrow loses its setup controls.)
    expect(screen.getByText("What to copy — climb as you improve")).toBeInTheDocument();
    expect(screen.getByText("Conditions")).toBeInTheDocument();
    // The level ladder is a CompactSelect; the closed trigger carries the value.
    expect(screen.getByRole("combobox", { name: /What to copy/ })).toHaveTextContent("1 — 1 character");

    // And the practice input still accepts typing (located by placeholder; its
    // caption is an unassociated div — see the a11y testability note).
    const input = screen.getByPlaceholderText("...");
    await user.type(input, "k");
    expect(input).toHaveValue("k");
  });

  it("does NOT mount the options rail aside in narrow mode", async () => {
    await renderNarrow();
    // The empty options rail is `{isWide && <aside aria-label="Options" />}` — in
    // narrow mode isWide is false, so the aside must not be in the DOM at all
    // (no DOM noise on mobile, per the design). This is the behavioral
    // counterpart to the wide tests, which never assert its presence.
    expect(screen.queryByRole("complementary", { name: "Options" })).not.toBeInTheDocument();
  });

  it("keeps the always-mounted live regions present in narrow mode (QSO)", async () => {
    const { user } = await renderNarrow();
    await user.click(screen.getByRole("button", { name: "QSO" }));
    // stepLive + resultLive must still be mounted in the single-column layout —
    // the live regions are never gated by isWide.
    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(2);
  });
});

// The narrow KEY tab is reflowed into ONE compact practice card so the key/paddle
// surface clears the phone fold (headed geometry is the re-gate's job — jsdom has
// no layout). This suite locks the STRUCTURE that reflow depends on: every control
// still present + labeled, and the DOM order that keeps the key-type/mode controls
// WITH the key (instrument strip above the readouts; Iambic below the key). If a
// future edit drops a control or scrambles the order, these bite.
describe("narrow (mobile) layout — KEY compact practice card", () => {
  // a precedes b in document order
  const precedes = (a, b) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  async function keyNarrowWithTarget() {
    const { user } = await renderNarrow();
    await user.click(screen.getByRole("button", { name: "KEY" }));
    // Set a target so the intro auto-hides and the active practice card is shown.
    await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));
    return { user };
  }

  it("renders every KEY control present + labeled in the merged card", async () => {
    await keyNarrowWithTarget();
    // Category selector (fused stepper + dropdown) relocated to its own block.
    expect(screen.getByRole("combobox", { name: /Drill category/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous category" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next category" })).toBeInTheDocument();
    // Instrument strip: key-type toggle + swap (relocated from the options block).
    expect(screen.getByRole("button", { name: "PADDLE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "STRAIGHT KEY" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Swap dit and dah paddles/ })).toBeInTheDocument();
    // Iambic sub-toggle (paddle is the default keyType) — below the key on narrow.
    expect(screen.getByRole("button", { name: "MODE A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MODE B" })).toBeInTheDocument();
    // Action row + both readouts + key surface + CHECK.
    expect(screen.getByRole("button", { name: /NEW TEXT/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /HEAR IT/ })).toBeInTheDocument();
    expect(screen.getByText("Send this")).toBeInTheDocument();
    expect(screen.getByText(/Decoded from your key/)).toBeInTheDocument();
    expect(document.querySelector('[data-testid="key-surface"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "CHECK" })).toBeInTheDocument();
  });

  it("orders the card so the controls sit WITH the key (strip + Iambic-below-key)", async () => {
    await keyNarrowWithTarget();
    const strip = screen.getByRole("button", { name: "PADDLE" });
    const sendThis = screen.getByText("Send this");
    const key = document.querySelector('[data-testid="key-surface"]');
    const modeA = screen.getByRole("button", { name: "MODE A" });
    const check = screen.getByRole("button", { name: "CHECK" });

    // Instrument strip comes before the "Send this" readout (top of the card).
    expect(precedes(strip, sendThis)).toBe(true);
    // The target readout is above the key.
    expect(precedes(sendThis, key)).toBe(true);
    // Iambic Mode A/B is banked BELOW the key (keeps the strip to one row).
    expect(precedes(key, modeA)).toBe(true);
    // CHECK is below the key.
    expect(precedes(key, check)).toBe(true);
  });

  // Content-independence guard. The whole KEY-narrow fix rests on both readouts
  // (target ABOVE the key, decoded ABOVE the key) being height-CAPPED with an
  // internal scroll, so a long target — or a long decoded buffer during extended
  // keying — scrolls INSIDE the readout instead of pushing the key past the fold.
  // jsdom has no layout, so it cannot measure the fold (that is the headed re-gate,
  // measured: cap holds the key <=818 even with both readouts overflowing; ~1106
  // WITHOUT the cap). But jsdom CAN lock the load-bearing INLINE STYLE that makes
  // the cap real: if a future edit drops `compact` from these Displays or removes
  // the maxHeight/overflow cap, this bites — nothing else in the suite guards it.
  it("caps BOTH narrow readouts (content-independence — long content scrolls, key stays put)", async () => {
    await keyNarrowWithTarget();
    const targetReadout = screen.getByText("Send this").nextElementSibling;
    const decodedReadout = screen.getByText(/Decoded from your key/).nextElementSibling;
    for (const readout of [targetReadout, decodedReadout]) {
      expect(readout).not.toBeNull();
      expect(readout.style.maxHeight).toBe("76px");
      expect(readout.style.overflowY).toBe("auto");
    }
  });
});

// QSO SEND-STEP content-independence guard (gate hardening, 2026-07-19).
//
// The QSO fix bundle applies the SAME `Display compact` cap to the QSO send-step
// readouts (the revealed suggested script + the decoded buffer), so a long "Full
// QSO line" script cannot push the key/paddle surface below the 390x844 fold. The
// headed re-gate measured it (key bottom 651 collapsed / 699 revealed / 735 both
// readouts maxed, all <=844; and ~923 with the cap removed). But NOTHING in the
// jsdom suite guarded the WIRING: stripping `compact={!isWide}` from these two QSO
// Displays left the ENTIRE suite green (verified during the gate). This locks the
// load-bearing inline cap on the QSO send step, the counterpart to the KEY guard
// above — if a future edit drops `compact` from either QSO readout, this bites.
describe("narrow (mobile) layout — QSO send-step readouts capped", () => {
  it("caps BOTH QSO send-step readouts (suggested script + decoded) on narrow", async () => {
    const { user } = await renderNarrow();
    await user.click(screen.getByRole("button", { name: "QSO" }));

    // Ragchew + "Call CQ" role → the FIRST step is a you-send step (activator
    // calls CQ), so we land on a send step without walking the whole contact.
    await chooseOption(user, "Activity", /Ragchew/i);
    await chooseOption(user, "Role", /Call CQ/i);
    await user.click(screen.getByRole("button", { name: /CALL CQ|LISTEN FOR CQ/ }));

    // The decoded readout is always present on a send step; the suggested script
    // readout only renders after SHOW SUGGESTED SCRIPT is revealed.
    await user.click(screen.getByRole("button", { name: /SHOW SUGGESTED SCRIPT/ }));

    const decodedLabel = screen.getByText(/Decoded from your key/);
    const decodedReadout = decodedLabel.nextElementSibling; // <Display cursor compact>
    const suggestedReadout = decodedLabel.previousElementSibling; // revealed <Display compact>

    for (const readout of [suggestedReadout, decodedReadout]) {
      expect(readout).not.toBeNull();
      expect(readout.style.maxHeight).toBe("76px");
      expect(readout.style.overflowY).toBe("auto");
    }
  });
});
