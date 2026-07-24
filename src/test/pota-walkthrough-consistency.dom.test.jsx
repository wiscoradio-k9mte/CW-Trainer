/**
 * pota-walkthrough-consistency.dom.test.jsx
 *
 * Guards a real internal contradiction found in a content-accuracy audit
 * (2026-07-24): the POTA ON-AIR walkthrough once showed the activator SENDING
 * the park reference in the CQ ("…DE W9ABC W9ABC US-4361 K"), which contradicts
 *   (a) the app's own QSO simulator — cw-core.js: "POTA activators do NOT send
 *       the park ref in the CQ — it goes in the log", and
 *   (b) POTA's official CW guide (https://docs.pota.app/docs/cw_guide.html):
 *       the standard activator CQ is "CQ CQ POTA DE <CALL> K", ref omitted.
 *
 * INVARIANT: no walkthrough step's TRANSMITTED text (`text`) may contain a park
 * reference token — the ref is logged/spotted, never keyed on the air. The
 * reference format is still TAUGHT, but only in the explanation (`why`), which
 * is exactly the right place for it. This ties the walkthrough to the
 * simulator's rule so the two can't silently diverge again.
 */

// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { POTA_WALKTHROUGH } from "../../wr-cw-trainer.jsx";

// A POTA reference as it would appear keyed on the air: US-#### (current ISO) or
// the retired K-#### — either one showing up in transmitted text is the bug.
const PARK_REF = /\b(?:US|K)-\d{3,5}\b/;

describe("POTA walkthrough — the park ref is never transmitted (matches the simulator + POTA guide)", () => {
  it("no walkthrough step's transmitted text contains a park reference", () => {
    const offenders = POTA_WALKTHROUGH.filter((l) => PARK_REF.test(l.text)).map(
      (l) => l.text
    );
    expect(offenders).toEqual([]);
  });

  it("the activator CQ is still a well-formed POTA CQ (ref omitted, not the whole line gutted)", () => {
    const cq = POTA_WALKTHROUGH.find((l) => l.who === "ACTIVATOR")?.text || "";
    expect(cq).toMatch(/CQ POTA/); // still a POTA CQ
    expect(cq).toMatch(/\bDE\b/); // still identifies the station
    expect(cq.trim()).toMatch(/\bK$/); // still an over-to-you invitation
    expect(cq).not.toMatch(PARK_REF); // and without the ref
  });

  it("the reference format is still TAUGHT in the explanation (why), just not keyed", () => {
    // The learner should still meet the US-#### format — in the why-text, where
    // it belongs, so removing it from the air doesn't erase the lesson.
    const anyWhyTeachesRef = POTA_WALKTHROUGH.some((l) => PARK_REF.test(l.why || ""));
    expect(anyWhyTeachesRef).toBe(true);
  });
});
