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
    expect(screen.getByRole("button", { name: /1 character/ })).toBeInTheDocument();

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

// The narrow KEY tab is reflowed into ONE practice card so the key/paddle pads
// clear the phone fold. This suite locks the STRUCTURE that reflow depends on:
// every control still present + labeled, and the DOM order that puts every
// SET-ONCE control (instrument strip, Iambic, drill category) BELOW the key.
//
// WHAT THESE TESTS CAN AND CANNOT HOLD — read before trusting them:
//   * They pin the ORDER of known landmarks and the load-bearing inline cap
//     styles. Nothing more. jsdom has no layout engine, so no assertion here can
//     see a pixel. Proven on the sibling branch, not assumed: 74px of brand-new
//     content inserted directly above the key left all 632 tests GREEN.
//   * The pixel contract lives ONLY in ops/uat-harness/cw-scroll-baseline.py and
//     NOTHING runs it in CI. If you add a row above the key, re-measure by hand.
//
// Recorded measurement (headed Chromium, realistic installed state, 375x667,
// dit-pad bottom = rect.bottom + scrollY after scrollTo(0,0), seed 20260722):
// KEY 704 -> 542, QSO copy 748 -> 554, QSO send 699 -> 577, against a 667 fold.
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

  // M1/M2/M7: only the two readouts are left above the key. Everything the
  // operator sets once — key type, L/R swap, Iambic mode, drill category — is
  // below it. Each of these four is a row that used to sit above the pads, and
  // each is worth real pixels there (52px for the strip, 96px for the category).
  it("puts every set-once control BELOW the key, readouts above it", async () => {
    await keyNarrowWithTarget();
    const key = document.querySelector('[data-testid="key-surface"]');
    const sendThis = screen.getByText("Send this");
    const decodedLabel = screen.getByText(/Decoded from your key/);

    // Only the readouts stay above the key.
    expect(precedes(sendThis, key)).toBe(true);
    expect(precedes(decodedLabel, key)).toBe(true);

    // …and every set-once control follows it.
    const below = {
      "instrument strip (key type)": screen.getByRole("button", { name: "PADDLE" }),
      "instrument strip (L/R swap)": screen.getByRole("button", { name: /Swap dit and dah paddles/ }),
      "Iambic mode": screen.getByRole("button", { name: "MODE A" }),
      "drill category": screen.getByRole("combobox", { name: /Drill category/ }),
      "drill category (prev)": screen.getByRole("button", { name: "Previous category" }),
      CHECK: screen.getByRole("button", { name: "CHECK" }),
    };
    for (const [what, el] of Object.entries(below)) {
      expect(`${what}: ${precedes(key, el)}`).toBe(`${what}: true`);
    }
  });

  // Content-independence guard. The key's position must not depend on how much
  // text is in either readout, so both are height-CAPPED with an internal scroll.
  // The two caps are DIFFERENT on purpose and the difference is the point:
  //   target  — reading material — keeps two lines (maxHeight 76)
  //   decoded — your own live output — is one line (maxHeight 40, tail-scrolled)
  // Halving the decoded cap is what pays for the target keeping two lines while
  // the stuffed worst case still fits: measured stuff-delta at 375x667 fell from
  // +72px to +36px. jsdom cannot see the fold; it CAN lock the inline styles that
  // make the cap real, and nothing else in the suite guards them.
  it("caps the target readout at two lines and the decoded readout at one", async () => {
    await keyNarrowWithTarget();
    const targetReadout = screen.getByText("Send this").nextElementSibling;
    const decodedReadout = screen.getByText(/Decoded from your key/).nextElementSibling;

    expect(targetReadout.style.maxHeight).toBe("76px");
    expect(targetReadout.style.overflowY).toBe("auto");
    expect(decodedReadout.style.maxHeight).toBe("40px");
    expect(decodedReadout.style.overflowY).toBe("auto");
  });

  // The one-line cap hides the head of your own send, which makes the readout a
  // scrollable region a keyboard-only user has to be able to reach and read.
  // That obligation is created BY the cap, so it is guarded beside it.
  it("makes the capped decoded readout reachable and named for keyboard/AT", async () => {
    await keyNarrowWithTarget();
    const decoded = screen.getByRole("group", { name: "Decoded from your key" });
    expect(decoded.getAttribute("tabindex")).toBe("0");
    expect(decoded.style.maxHeight).toBe("40px");
  });

  // M3: the "Keyboard: Z / ← …" line is a desktop affordance. It goes on narrow;
  // the information survives verbatim in each pad's accessible name, which is
  // what makes the removal safe rather than a quiet loss. Both halves are pinned
  // — dropping the line without keeping the labels must NOT pass.
  it("drops the visible keyboard hint on narrow but keeps it in the pad labels", async () => {
    await keyNarrowWithTarget();
    expect(screen.queryByText(/Keyboard: Z/)).toBeNull();
    // Read the labels off the surface by POSITION, not by querying for the label
    // text. Querying by name would make a renamed label fail as "element not
    // found", which is a query failure rather than an assertion about the name —
    // and the name is the whole thing this test is protecting.
    const surface = document.querySelector('[data-testid="key-surface"]');
    const labels = Array.from(surface.querySelectorAll('[role="button"]'))
      .map((e) => e.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Dit paddle — press and hold Z or left arrow",
      "Dah paddle — press and hold X or right arrow",
    ]);
  });
});

// The wide counterpart to the M3 test above. The hint is narrow-only removal, so
// a mutation that drops the line unconditionally has to go red somewhere — this
// is where. (The rest of this file overrides matchMedia to narrow; the shared
// setup.dom.js default is wide, which is what this describe block uses.)
describe("wide layout — the keyboard hint line is KEPT", () => {
  it("still shows the Keyboard: Z / ← hint on the wide KEY tab", async () => {
    const user = userEvent.setup();
    window.matchMedia = savedMatchMedia; // wide default from setup.dom.js
    window.localStorage.clear();
    render(<CWTrainer />);
    await user.click(screen.getByText("tap to skip"));
    await user.click(screen.getByRole("button", { name: "KEY" }));
    await user.click(screen.getByRole("button", { name: /NEW TEXT/ }));
    // queryBy + not.toBeNull, not getBy: deleting the line must red with an
    // assertion diff, not with "unable to find an element".
    expect(screen.queryByText(/Keyboard: Z \/ ← is the left zone/)).not.toBeNull();
  });
});

// QSO SEND-STEP guards.
//
// Two things must hold on this surface, and NOTHING else in the suite holds
// either: the readouts stay capped (a long "Full QSO line" reveal must scroll
// inside its box rather than push the pads down), and the instrument controls
// sit BELOW the key. The second is the QSO half of M2 — the same relocation the
// KEY tab gets — and it is worth a measured 122px above the pads at 375x667,
// because the QSO callers were rendering the FULL SwapToggle with its help
// sentence. Stripping `compact={!isWide}` from these Displays once left the
// entire suite green (verified during a previous gate), which is why the wiring
// is asserted here rather than assumed.
describe("narrow (mobile) layout — QSO send step", () => {
  const precedes = (a, b) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  async function qsoSendStep() {
    const { user } = await renderNarrow();
    await user.click(screen.getByRole("button", { name: "QSO" }));
    // Ragchew + "Call CQ" role → the FIRST step is a you-send step (activator
    // calls CQ), so we land on a send step without walking the whole contact.
    await chooseOption(user, "Activity", /Ragchew/i);
    await chooseOption(user, "Role", /Call CQ/i);
    await user.click(screen.getByRole("button", { name: /CALL CQ|LISTEN FOR CQ/ }));
    // The suggested-script readout only renders once revealed.
    await user.click(screen.getByRole("button", { name: /SHOW SUGGESTED SCRIPT/ }));
    return { user };
  }

  it("caps the suggested script at two lines and the decoded readout at one", async () => {
    await qsoSendStep();
    const decodedLabel = screen.getByText(/Decoded from your key/);
    const decodedReadout = decodedLabel.nextElementSibling;   // <Display tail>
    const suggestedReadout = decodedLabel.previousElementSibling; // <Display compact>

    expect(suggestedReadout.style.maxHeight).toBe("76px");
    expect(suggestedReadout.style.overflowY).toBe("auto");
    expect(decodedReadout.style.maxHeight).toBe("40px");
    expect(decodedReadout.style.overflowY).toBe("auto");
  });

  it("puts the key-type and swap controls BELOW the key on narrow", async () => {
    await qsoSendStep();
    const key = screen.getByRole("button", { name: /Dit paddle/ });
    expect(precedes(key, screen.getByRole("button", { name: "PADDLE" }))).toBe(true);
    expect(precedes(key, screen.getByRole("button", { name: "STRAIGHT KEY" }))).toBe(true);
    expect(
      precedes(key, screen.getByRole("button", { name: /Swap dit and dah paddles/ })),
    ).toBe(true);
    // The decoded readout stays ABOVE the key — you read what you keyed directly
    // above the pads. Pinning both directions stops a wholesale reorder passing.
    expect(precedes(screen.getByText(/Decoded from your key/), key)).toBe(true);
  });
});

// QSO COPY (DX) STEP — the break-in key block.
//
// Same two guards as the send step, plus the one that is unique here: this
// decode readout was the ONLY uncapped one on any contract-bound surface, so the
// key's position was content-DEPENDENT — stuffing it moved the pads 520px down
// the page at 375x667. The cap is what makes this surface's geometry stable at
// all, so it gets its own assertion rather than riding on the send step's.
describe("narrow (mobile) layout — QSO copy step break-in key", () => {
  const precedes = (a, b) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  async function qsoCopyStep({ difficulty } = {}) {
    const { user } = await renderNarrow();
    await user.click(screen.getByRole("button", { name: "QSO" }));
    // Ragchew + "Answer a CQ" → the FIRST step is a DX (copy) step.
    await chooseOption(user, "Activity", /Ragchew/i);
    await chooseOption(user, "Role", /Answer/i);
    if (difficulty) await chooseOption(user, "Conditions", difficulty);
    await user.click(screen.getByRole("button", { name: /CALL CQ|LISTEN FOR CQ/ }));
    return { user };
  }

  // EASY renders one extra readout above the key: the live letter-by-letter
  // transcription of what the DX is sending. It was UNCAPPED, and it is the
  // reason the easy copy step is the worst cell on this surface rather than the
  // "looser" one it was assumed to be — the stuff probe moved the pads +496px
  // through this one box at 375x667. Two lines, not one: it is reading material.
  it("caps the EASY live 'Sending' readout at two lines on narrow", async () => {
    const { user } = await qsoCopyStep({ difficulty: /EASY/i });
    // A DX step opens with the 5s "Get ready" countdown, which occupies this slot
    // until it expires. Wait it out on the REAL clock: the interval was scheduled
    // before this line, so switching to fake timers here would not advance it —
    // it would just hang. One real 5s wait in one test is the honest cost.
    const label = await screen.findByText("Sending", {}, { timeout: 9000 });
    const readout = label.nextElementSibling;
    expect(readout).not.toBeNull();
    expect(readout.style.maxHeight).toBe("76px");
    expect(readout.style.overflowY).toBe("auto");
    expect(user).toBeTruthy();
  });

  it("caps the break-in decode readout at one line on narrow", async () => {
    await qsoCopyStep();
    const readout = screen.getByText(/Break in with your key/).nextElementSibling;
    expect(readout).not.toBeNull();
    expect(readout.style.maxHeight).toBe("40px");
    expect(readout.style.overflowY).toBe("auto");
  });

  // The REPLAY / SLOWER / STOP row sits directly above the break-in key. At 375
  // the default S.btn padding wrapped it onto TWO rows, costing a measured 46px
  // there (84px tall -> 40px). The fix is equal thirds, the pattern KEY's action
  // row already uses. jsdom cannot see a flex width, so this pins the inline
  // styles that produce it — the same standard as the maxHeight caps above, and
  // with the same limit: it proves the mechanism is wired, not that it renders.
  it("packs the transport row onto ONE row on narrow", async () => {
    await qsoCopyStep();
    const replay = screen.getByRole("button", { name: /REPLAY/ });
    const row = replay.parentElement;
    expect(row.style.flexWrap).toBe("nowrap");
    for (const label of [/REPLAY/, /SLOWER/, /STOP/]) {
      const btn = screen.getByRole("button", { name: label });
      expect(btn.parentElement).toBe(row);
      expect(btn.style.flex).toBe("1 1 0%"); // jsdom expands the `flex: 1` shorthand

      expect(btn.style.minHeight).toBe("40px");
    }
  });

  it("puts the key-type and swap controls BELOW the break-in key on narrow", async () => {
    await qsoCopyStep();
    const key = screen.getByRole("button", { name: /Dit paddle/ });
    expect(precedes(key, screen.getByRole("button", { name: "PADDLE" }))).toBe(true);
    expect(
      precedes(key, screen.getByRole("button", { name: /Swap dit and dah paddles/ })),
    ).toBe(true);
    expect(precedes(screen.getByText(/Break in with your key/), key)).toBe(true);
  });
});
