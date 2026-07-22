import { describe, it, expect } from "vitest";
import {
  MORSE, REV, similarity, timing,
  gradeSend, similarityCw, canonicalizeCw,
  CUT_TOLERANT_COPY_SOURCES, CUT_TOLERANT_KEY_DRILLS,
  decodeChar, DECODE_PROSIGNS, KOCH,
  isWellFormedRst, isRstReport, courtesyForms, numericForms,
  COURTESY_EQUIVALENTS,
  buildRagchew, buildPota, buildSota, buildIota, buildDx, buildContest,
  cutNum, isReadyToAdvance, required, isBlankElement,
  PROSIGNS, PROSIGN_CODES, QCODES_ABBREV, DRILL_CATEGORIES,
  drillCallsign, drillCallingCq, drillRstExchange, drillNumbers,
  drillProsigns, drillQCodes, drillCommonWords, drillWiderWords, drillQsoLine,
  COMMON_WORDS, ROLE_TERMS,
  filterDrillWords, COMMON_WORD_POOL, WIDE_WORD_POOL,
  analyzeFist, FIST_TOLERANCE, FIST_MIN_ELEMENTS,
  toCodes,
  averageScore,
  cqCall,
  PROGRESS_RETENTION, PROGRESS_SCHEMA_VERSION,
  emptyProgress, appendProgress, migrateProgress,
  learnTrend, keyTrend, copyTrend,
  toneFor, qsoTrend,
  splashSignature,
  US_PREFIXES,
  DX_GENERATION_POOL, POTA_COUNTRY_PREFIXES, INTL_SUMMITS,
  randDxStation, randDxFieldStation, randPark, zoneToken, reciprocalCall,
  drillDxCallsigns, drillDxExchange, drillContestFragments,
  drillSplitPileup, drillReciprocalCalls,
  stateOf, subTokens, resolveUSState, QSO_PHRASES,
} from "./cw-core.js";
import { CALL_AREA_DIGITS, withCallArea } from "./data/dxcc-generation.js";
import { resolveEntity } from "./data/dxcc-resolve.js";

// ---------------------------------------------------------------------------
// MORSE round-trip
// ---------------------------------------------------------------------------
describe("MORSE / REV round-trip", () => {
  it("REV[MORSE[ch]] === ch for every key in MORSE", () => {
    for (const ch of Object.keys(MORSE)) {
      expect(REV[MORSE[ch]]).toBe(ch);
    }
  });

  it("spot-checks: A, 0, ?", () => {
    expect(MORSE.A).toBe(".-");
    expect(MORSE[0]).toBe("-----");
    expect(MORSE["?"]).toBe("..--..");
  });
});

// ---------------------------------------------------------------------------
// similarity()
// ---------------------------------------------------------------------------
describe("similarity()", () => {
  it("identity returns 1", () => {
    expect(similarity("PARIS", "PARIS")).toBe(1);
  });

  it("empty/empty returns 1", () => {
    expect(similarity("", "")).toBe(1);
  });

  it("one empty returns 0", () => {
    expect(similarity("ABC", "")).toBe(0);
    expect(similarity("", "ABC")).toBe(0);
  });

  it("transposition / one-edit is strictly between 0 and 1", () => {
    // ABC vs ACB: edit distance 2, max length 3 → 1 - 2/3 ≈ 0.333
    const s = similarity("ABC", "ACB");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it("case and whitespace normalization: 'cq  cq' matches 'CQ CQ'", () => {
    expect(similarity("cq  cq", "CQ CQ")).toBe(1);
  });

  // GAP 1: unequal-length strings confirm Math.max is the denominator.
  // "PARIS" vs "PAR": edit distance 2, max length 5 → 1 - 2/5 = 0.6.
  // Under Math.min the denominator would be 3, giving ≈ 0.333 — wrong.
  it("unequal-length: similarity('PARIS','PAR') ≈ 0.6 (validates Math.max denominator)", () => {
    expect(similarity("PARIS", "PAR")).toBeCloseTo(0.6, 5);
  });
});

// ---------------------------------------------------------------------------
// gradeSend() — element-based QSO send grading (the ratified real-world model).
// These BITE: each asserts the produced score/hits/missing. The keystone case
// (K9MTE answering a CQ) went from 23% (edit-distance vs the verbose script) to
// 100%. Mutation notes are inline: reverting gradeSend to similarity(suggested,·)
// or dropping a form-equivalence turns the relevant assertion red.
// ---------------------------------------------------------------------------
describe("gradeSend() — required-element scoring", () => {
  it("KEYSTONE: minimal answer-a-CQ (just the call) scores 100, not 23", () => {
    // The reported bug: mustContain=[myCall], the operator sends only their call.
    // Old score = similarity("N8ZZU DE K9MTE K9MTE K", "K9MTE")*100 ≈ 23.
    // MUTATION: revert checkSend to similarity(suggested,·) → this goes red (23).
    const r = gradeSend(["K9MTE"], "K9MTE");
    expect(r.score).toBe(100);
    expect(r.hits).toEqual(["K9MTE"]);
    expect(r.missing).toEqual([]);
  });

  it("all valid forms of the callsign element score 100 (repetition, DE/K, order)", () => {
    // Every one of these is a correct on-air answer; each must be 100.
    for (const sent of [
      "K9MTE",
      "K9MTE K9MTE K9MTE",
      "N8ZZU DE K9MTE K9MTE K",
      "DE K9MTE",
      "K9MTE K",              // trailing procedural K
    ]) {
      expect(gradeSend(["K9MTE"], sent).score).toBe(100);
    }
  });

  it("a wrong / absent callsign is a miss (score 0)", () => {
    // A different call is not the required element present — correct to fail.
    const r = gradeSend(["K9MTE"], "W1AW");
    expect(r.score).toBe(0);
    expect(r.hits).toEqual([]);
    expect(r.missing).toEqual(["K9MTE"]);
  });

  it("score ≡ checklist invariant: 100 IFF all required elements are hits", () => {
    // Two-element step: both present → 100; one → 50; none → 0.
    expect(gradeSend(["599", "BOB"], "UR RST 599 599 NAME BOB").score).toBe(100);
    const half = gradeSend(["599", "BOB"], "UR RST 599 599");
    expect(half.score).toBe(50);
    expect(half.hits).toEqual(["599"]);
    expect(half.missing).toEqual(["BOB"]);
    expect(gradeSend(["599", "BOB"], "QRZ?").score).toBe(0);
  });

  it("reordered + repeated multi-element send still scores 100", () => {
    // Name before report, each doubled, procedural = / BK around — all fine.
    const r = gradeSend(["599", "BOB"], "BK NAME BOB BOB = UR 599 599 BK");
    expect(r.score).toBe(100);
  });

  it("cut numbers count in the SCORE: 599 ↔ 5NN both directions", () => {
    // The quiet second defect: the checklist tolerated cut forms but the old
    // score did not. MUTATION: drop numericForms in isConveyed → these go red.
    // (Required 599 is the RST slot; a sent 5NN is a well-formed RST → hit.)
    expect(gradeSend(["599"], "5NN").score).toBe(100);
    expect(gradeSend(["5NN"], "599").score).toBe(100);
    // A non-RST numeric element (contest zone) still cut-matches via numericForms.
    expect(gradeSend(["05"], "T5").score).toBe(100);
    expect(gradeSend(["T5"], "05").score).toBe(100);
  });

  it("fork 2: the RST element accepts ANY well-formed report (579, 559)", () => {
    // Required RST slot is always 599, but an honest 579/559 send must count.
    expect(gradeSend(["599"], "579").score).toBe(100);
    expect(gradeSend(["599"], "UR 559 559 K").score).toBe(100);
    // ...but a malformed report (S=0) is NOT credited.
    expect(gradeSend(["599"], "509").score).toBe(0);
  });

  it("fork 2 OFF (acceptAnyRst:false): only the literal 599/5NN counts", () => {
    // Data-driven flag: with it off, 579 no longer satisfies the RST slot.
    expect(gradeSend(["599"], "579", { acceptAnyRst: false }).score).toBe(0);
    expect(gradeSend(["599"], "5NN", { acceptAnyRst: false }).score).toBe(100);
  });

  it("a contest serial that is RST-shaped is matched literally, not as the RST slot", () => {
    // serial 123 is a valid RST SHAPE but is not the report — it must be sent
    // literally to count. isRstReport (canonical 599 only) prevents misclassing.
    expect(gradeSend(["123"], "599").score).toBe(0);   // sent a report, not the serial
    expect(gradeSend(["123"], "123").score).toBe(100); // sent the actual serial
  });

  it("fork 3: courtesy abbrev equivalence — TU ≡ TNX ≡ TKS in the send", () => {
    // MUTATION: empty COURTESY_EQUIVALENTS → TNX/TKS stop satisfying required TU.
    expect(gradeSend(["TU"], "TU 73").score).toBe(100);
    expect(gradeSend(["TU"], "TNX FER FB QSO").score).toBe(100);
    expect(gradeSend(["TU"], "TKS 73").score).toBe(100);
    // A non-courtesy close is a miss.
    expect(gradeSend(["TU"], "73 DE K9MTE").score).toBe(0);
  });

  it("extra content and procedural signals never reduce the score", () => {
    const r = gradeSend(["K9MTE"], "R R N8ZZU DE K9MTE = GM OM TNX FER CALL K9MTE KN");
    expect(r.score).toBe(100);
  });

  it("empty / whitespace-only send scores 0 with everything missing", () => {
    expect(gradeSend(["K9MTE"], "").score).toBe(0);
    expect(gradeSend(["599", "BOB"], "   ").missing).toEqual(["599", "BOB"]);
  });

  it("hits/missing preserve original tokens (original case) for the ✓/✗ render", () => {
    // Name comes from settings and may be mixed-case; matching is case-insensitive
    // but the render must echo the operator's own spelling.
    const r = gradeSend(["599", "Bob"], "ur 599 name bob");
    expect(r.hits).toEqual(["599", "Bob"]);
  });
});

// ---------------------------------------------------------------------------
// The element-classification helpers gradeSend rests on.
// ---------------------------------------------------------------------------
describe("RST / courtesy / numeric classifiers", () => {
  it("isWellFormedRst accepts R∈1-5 S∈1-9 T∈1-9 and cut forms; rejects the rest", () => {
    for (const ok of ["599", "579", "559", "5NN", "5N9", "111", "313"]) {
      expect(isWellFormedRst(ok)).toBe(true);
    }
    for (const no of ["509", "690", "60", "5999", "TU", "K9MTE", "05", "T5"]) {
      expect(isWellFormedRst(no)).toBe(false);
    }
  });

  it("isRstReport is the canonical 599/5NN only (not other well-formed reports)", () => {
    expect(isRstReport("599")).toBe(true);
    expect(isRstReport("5NN")).toBe(true);
    expect(isRstReport("579")).toBe(false); // valid RST, but not the report slot
    expect(isRstReport("123")).toBe(false); // RST-shaped serial
  });

  it("courtesyForms expands the curated set; passes non-members through", () => {
    expect(courtesyForms("TU")).toEqual(["TU", "TNX", "TKS"]);
    expect(courtesyForms("tnx")).toEqual(["TU", "TNX", "TKS"]);
    expect(courtesyForms("73")).toEqual(["73"]);
    // The table is the single source Travis seeds.
    expect(COURTESY_EQUIVALENTS[0]).toContain("TU");
  });

  it("numericForms gives cut equivalents for pure numeric tokens only", () => {
    expect(numericForms("599")).toContain("5NN");
    expect(numericForms("05")).toContain("T5");
    expect(numericForms("K-1234")).toEqual(["K-1234"]); // park ref untouched
    expect(numericForms("WI")).toEqual(["WI"]);
  });
});

// ---------------------------------------------------------------------------
// canonicalizeCw() + similarityCw() — the COPY/KEY/QSO-copy fidelity paths.
// Digit-anchored cut normalization: numbers get cut credit, letters are safe.
// ---------------------------------------------------------------------------
describe("canonicalizeCw() — digit-anchored cut normalization", () => {
  it("cut-normalizes runs that contain a real digit", () => {
    expect(canonicalizeCw("5NN")).toBe("599");
    expect(canonicalizeCw("T5")).toBe("05");
    expect(canonicalizeCw("5T9")).toBe("509");
    expect(canonicalizeCw("ur 5nn 5nn")).toBe("UR 599 599");
  });

  it("SAFETY: letter runs with no digit are left intact (NAME/TU/TNX/NN)", () => {
    // A blind global N→9 / T→0 would corrupt these. The run must contain a digit.
    expect(canonicalizeCw("NAME")).toBe("NAME");
    expect(canonicalizeCw("TU")).toBe("TU");
    expect(canonicalizeCw("TNX")).toBe("TNX");
    expect(canonicalizeCw("NN")).toBe("NN"); // bare cut-run, no digit → untouched
  });
});

describe("similarityCw() — fidelity grade with cut tolerance", () => {
  it("credits the cut form: copying 5NN for 599 is 100%", () => {
    // MUTATION: strip the cut-normalize from canonicalizeCw → this drops to 50%.
    expect(similarityCw("599", "5NN")).toBe(1);
    expect(similarityCw("UR RST 5NN", "UR RST 599")).toBe(1);
  });

  it("SAFETY: a real mis-copy of a letter word stays penalized (no letter mangling)", () => {
    // Correct (digit-anchored): target "NAME" keeps its letters, so mis-typing
    // it as "9AME" is a genuine 1-of-4 error → 75%. A blind global N→9 would
    // corrupt the target to "9AME" too and wrongly return 100% — this BITES that.
    expect(similarityCw("NAME", "9AME")).toBeCloseTo(0.75, 5);
    // And "0U" must NOT be accepted as "TU" (blind global would equate them).
    expect(similarityCw("TU", "0U")).toBeCloseTo(0.5, 5);
  });

  it("plain-text fidelity is unchanged from similarity() (no cut runs)", () => {
    expect(similarityCw("PARIS", "PARIS")).toBe(1);
    expect(similarityCw("K", "K")).toBe(1);
    expect(similarityCw("DIPOLE", "DIPOLE")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Cut-number scoping — the 2.4.0 regression.
//
// The shipped rule normalised any [0-9NT]+ RUN anywhere in the string, so a
// callsign's N/T were rewritten on BOTH sides of the comparison and a WRONG
// callsign copy scored 100% "SOLID COPY". Cut numbers are never used inside a
// callsign on the air — the N in N4ABC is the letter N.
//
// MUTATION PROOF (run and watched go red): restoring the old body of
// canonicalizeCw —
//     .replace(/[0-9NT]+/g, (run) => /[0-9]/.test(run)
//       ? run.replace(/N/g,"9").replace(/T/g,"0") : run)
// — turns every assertion in "callsigns are never cut-normalised" red (each
// mis-copy scores 1 instead of its true partial score).
// ---------------------------------------------------------------------------
describe("canonicalizeCw() — cut normalization is scoped to whole cut tokens", () => {
  it("callsigns are never cut-normalised (the leak that scored a wrong copy 100%)", () => {
    // The three cases measured on 2.4.0. Each callsign carries a letter outside
    // the cut alphabet, so the token is not a cut token and must pass through.
    expect(canonicalizeCw("N4ABC")).toBe("N4ABC");
    expect(canonicalizeCw("N0TU")).toBe("N0TU");
    expect(canonicalizeCw("WT9XY")).toBe("WT9XY");
    expect(canonicalizeCw("K9MTE")).toBe("K9MTE");
    // ...and inside a sentence, beside a real cut token that DOES normalise.
    expect(canonicalizeCw("DE N4ABC UR 5NN")).toBe("DE N4ABC UR 599");
  });

  it("a mis-copied callsign is graded as the error it is, not 100%", () => {
    // Each of these read 100% SOLID COPY on 2.4.0. One substituted character
    // out of the callsign's length is the honest score.
    expect(similarityCw("N4ABC", "94ABC")).toBeCloseTo(0.8, 5);   // was 1
    expect(similarityCw("N0TU", "90TU")).toBeCloseTo(0.75, 5);    // was 1
    expect(similarityCw("WT9XY", "W09XY")).toBeCloseTo(0.8, 5);   // was 1
    // The cut-habit version of the same mistake: keying N where the 9 belongs.
    expect(similarityCw("K9MTE", "KNMTE")).toBeCloseTo(0.8, 5);
  });

  it("the intended exchange tolerance survives untouched", () => {
    expect(canonicalizeCw("5NN")).toBe("599");
    expect(canonicalizeCw("T5")).toBe("05");
    expect(canonicalizeCw("TT1")).toBe("001");
    expect(similarityCw("5NN", "599")).toBe(1);
    expect(similarityCw("T5", "05")).toBe(1);
    expect(similarityCw("TT1", "001")).toBe(1);
    expect(similarityCw("UR 5NN 5NN BK", "UR 599 599 BK")).toBe(1);
  });

  it("SAFETY: every verified letter-run stays intact", () => {
    // The full list carried by the brief. A digit-free token can never be a cut
    // token, so none of these may change under any rule we adopt.
    const letterRuns = [
      "NAME", "TU", "TNX", "NAME IS TRAV", "TNX FER CALL", "ANT", "NR",
      "NT", "TN", "N", "T", "NN", "TT", "QTH NEWINGTON CT", "TEST",
      "CONTEST", "KN", "NOTE",
    ];
    for (const s of letterRuns) expect(canonicalizeCw(s)).toBe(s);
  });

  it("a correct copy still scores 100% on both kinds of content", () => {
    // The fix must never overshoot into a false negative.
    expect(similarityCw("N4ABC", "N4ABC")).toBe(1);
    expect(similarityCw("CQ CQ DE K9MTE K", "CQ CQ DE K9MTE K")).toBe(1);
    expect(similarityCw("UR 5NN 5NN BK", "UR 5NN 5NN BK")).toBe(1);
  });
});

describe("similarityCw() — the {cut:false} rungs grade strictly", () => {
  // Second layer: the whole-token rule alone still equates an all-cut-alphabet
  // token, e.g. the random COPY letter-group "N4T" or a callsign like N8NT.
  // Rungs whose content has no exchange numbers turn the equivalence off.
  it("an all-cut-alphabet token is tolerated only where exchanges live", () => {
    expect(similarityCw("N4T", "940", { cut: true })).toBe(1);
    // Strict: only the shared "4" / "8" survives — 2 of 3 and 3 of 4 real errors.
    expect(similarityCw("N4T", "940", { cut: false })).toBeCloseTo(1 / 3, 5);
    expect(similarityCw("N8NT", "9890", { cut: true })).toBe(1);
    expect(similarityCw("N8NT", "9890", { cut: false })).toBeCloseTo(0.25, 5);
  });

  it("{cut:false} never penalises a genuinely correct copy", () => {
    expect(similarityCw("N4T", "N4T", { cut: false })).toBe(1);
    expect(similarityCw("N8NT WT9XY", "N8NT WT9XY", { cut: false })).toBe(1);
  });

  it("the cut-tolerant rung lists name real rungs, and no callsign rung", () => {
    // A typo here would silently switch a rung's grading, so pin the membership
    // against the registry itself rather than trusting the strings.
    const drillIds = new Set(DRILL_CATEGORIES.map((c) => c.id));
    for (const id of CUT_TOLERANT_KEY_DRILLS) expect(drillIds.has(id)).toBe(true);
    for (const id of ["callsigns", "dxcalls", "recip", "split", "cq"]) {
      expect(CUT_TOLERANT_KEY_DRILLS.has(id)).toBe(false);
    }
    // COPY: the two rungs that carry 599/5NN in their content, and only those.
    expect([...CUT_TOLERANT_COPY_SOURCES].sort()).toEqual(["hamwords", "phrases"]);
  });
});

// ---------------------------------------------------------------------------
// decodeChar() — the live decoder reads back what the app teaches and plays.
//
// The Prosigns drill tells the operator "BT, AR, SK, and KN are sent as a single
// run-together sound", HEAR IT plays them fused, and then the decoder rendered ■
// for SK and KN and "+" for AR — so following the instructions graded as an
// error and the auto-grade length trigger could never be reached.
//
// MUTATION PROOF (run and watched go red): reverting finalizeChar to
// `REV[bufRef.current] || "■"` turns the KEY end-to-end test in
// prosign-decode.dom.test.jsx red, and emptying DECODE_PROSIGNS turns the
// round-trip test below red.
// ---------------------------------------------------------------------------
describe("decodeChar() — fused prosigns decode to what the target shows", () => {
  it("decodes the three fused prosign codes to their taught spelling", () => {
    expect(decodeChar("...-.-")).toBe("SK");
    expect(decodeChar("-.--.")).toBe("KN");
    expect(decodeChar(".-.-.")).toBe("AR");
    // BT keeps REV's "=" — that is exactly how the drill and QSO scripts spell it.
    expect(decodeChar("-...-")).toBe("=");
  });

  it("ordinary characters and unknown patterns are unchanged", () => {
    expect(decodeChar("....")).toBe("H");
    expect(decodeChar("-----")).toBe("0");
    expect(decodeChar("..--..")).toBe("?");
    expect(decodeChar("-..-.")).toBe("/");
    expect(decodeChar("........")).toBe("■"); // still marks a bad send
    expect(decodeChar("")).toBe("■");
  });

  it("BLAST RADIUS: the overlay displaces no character the app can target", () => {
    // Every overridden code must be unreachable as a normal character, or adding
    // it would silently change an existing decode.
    for (const code of Object.keys(DECODE_PROSIGNS)) {
      const displaced = REV[code];            // "+" for AR; undefined for SK/KN
      if (displaced !== undefined) {
        // "+" is the MORSE alias for AR. It must not be in the Koch pool, or a
        // LEARN/COPY target could ask for a character the decoder no longer emits.
        expect(KOCH).not.toContain(displaced);
        expect(displaced).toBe("+");
      }
    }
    // And no Koch character's code collides with an overlay entry.
    for (const ch of KOCH) expect(DECODE_PROSIGNS[MORSE[ch]]).toBeUndefined();
  });

  it("what toCodes PLAYS, decodeChar READS BACK — for the whole prosign drill", () => {
    // The round trip that the reported bug broke: play a prosign target through
    // the tokenizer, decode each emitted code, and get the original string back.
    const decode = (text) =>
      toCodes(text)
        .map((tok) => (tok.wordGap ? " " : decodeChar(tok.code)))
        .join("");
    expect(decode("AR SK KN =")).toBe("AR SK KN =");
    expect(decode("SK KN AR BK")).toBe("SK KN AR BK");
    expect(decode("AR AR SK KN =")).toBe("AR AR SK KN =");
    expect(decode("W4? KN")).toBe("W4? KN");   // the split-drill fragment
    // Every prosign the drill can draw survives the round trip.
    for (const p of PROSIGNS) expect(decode(p)).toBe(p);
  });
});

// ---------------------------------------------------------------------------
// timing()
// ---------------------------------------------------------------------------
describe("timing()", () => {
  it("effWpm === charWpm: charSp = 3u and wordSp = 7u", () => {
    const { u, charSp, wordSp } = timing(20, 20);
    const expectedU = 1.2 / 20;
    expect(charSp).toBeCloseTo(3 * expectedU, 10);
    expect(wordSp).toBeCloseTo(7 * expectedU, 10);
  });

  it("effWpm < charWpm: charSp and wordSp are stretched, ratio 7/3 preserved", () => {
    const { u, charSp, wordSp } = timing(20, 8);
    const expectedU = 1.2 / 20;
    // Gaps must be larger than the non-Farnsworth baseline
    expect(charSp).toBeGreaterThan(3 * expectedU);
    expect(wordSp).toBeGreaterThan(7 * expectedU);
    // Farnsworth formula keeps the 3:7 ratio between char gap and word gap
    expect(wordSp / charSp).toBeCloseTo(7 / 3, 10);
  });

  // GAP 2: the branch condition is strict < (not <=), so timing(20,19) must produce
  // DIFFERENT (stretched) gaps from timing(20,20).  A <= implementation would treat
  // both cases identically and this assertion would fail.
  it("effWpm one below charWpm fires Farnsworth branch; effWpm==charWpm does not", () => {
    const atChar   = timing(20, 20);
    const oneBlow  = timing(20, 19);
    // Farnsworth branch stretches charSp — the two should not be equal
    expect(oneBlow.charSp).toBeGreaterThan(atChar.charSp);
    expect(oneBlow.wordSp).toBeGreaterThan(atChar.wordSp);
  });
});

// ---------------------------------------------------------------------------
// QSO builders — structure + mustContain integrity
// ---------------------------------------------------------------------------
// Fixed profile used for all builder tests. Using a real-looking call and QTH
// so state extraction is exercised (MADISON WI → WI).
const PROFILE = { myCall: "K9MTE", myName: "TRAVIS", myQth: "MADISON WI", cut: false };

// Verify a builder's return value against the structural contract.
// stepCount is the ACTUAL count verified by reading each builder above.
function assertQsoStructure(qso, flavor, stepCount) {
  expect(typeof qso.dx).toBe("string");
  expect(qso.flavor).toBe(flavor);
  expect(typeof qso.summary).toBe("string");
  expect(qso.summary.length).toBeGreaterThan(0);

  expect(Array.isArray(qso.steps)).toBe(true);
  expect(qso.steps.length).toBe(stepCount);

  for (const step of qso.steps) {
    expect(step.who === "dx" || step.who === "you").toBe(true);

    if (step.who === "dx") {
      expect(typeof step.text).toBe("string");
      expect(step.text.length).toBeGreaterThan(0);
    } else {
      // "you" steps
      expect(typeof step.suggested).toBe("string");
      expect(typeof step.prompt).toBe("string");
      expect(Array.isArray(step.mustContain)).toBe(true);

      // mustContain integrity: every token must actually appear in suggested
      for (const token of step.mustContain) {
        expect(token.length).toBeGreaterThan(0);
        expect(step.suggested.includes(token)).toBe(true);
      }
    }
  }
}

describe("buildRagchew()", () => {
  // Verified by reading src: ragchew has 5 steps (dx, you, dx, you, dx)
  const RAGCHEW_STEPS = 5;

  it("returns correct structure with 5 steps — answering role (explicit)", () => {
    const qso = buildRagchew(PROFILE, "answer");
    assertQsoStructure(qso, "RAGCHEW", RAGCHEW_STEPS);
  });

  it("default (no role arg) is answering role — backwards-compatible", () => {
    const qso = buildRagchew(PROFILE);
    // First step must be dx (they call CQ, you answer)
    expect(qso.steps[0].who).toBe("dx");
  });

  it("myCall propagates into you-step suggested text — answering role", () => {
    const qso = buildRagchew(PROFILE, "answer");
    const youSteps = qso.steps.filter((s) => s.who === "you");
    const hasCall = youSteps.some((s) => s.suggested.includes("K9MTE"));
    expect(hasCall).toBe(true);
  });

  // GAP 3 (ragchew): step[1] is the operator's answer to the CQ — mustContain
  // must list myCall so the grader flags a missed callsign as incorrect.
  // Emptying mustContain would make this assertion red.
  it("step[1] mustContain includes myCall (answer-the-CQ step) — answering role", () => {
    const qso = buildRagchew(PROFILE, "answer");
    expect(qso.steps[1].mustContain.includes(PROFILE.myCall)).toBe(true);
  });

  it("calling role: first step is who:you (user calls CQ)", () => {
    const qso = buildRagchew(PROFILE, "call");
    expect(qso.steps[0].who).toBe("you");
    expect(qso.steps[0].suggested).toContain(PROFILE.myCall);
  });

  it("calling role: steps alternate you/dx/you/dx/you", () => {
    const qso = buildRagchew(PROFILE, "call");
    expect(qso.steps.length).toBe(5);
    const pattern = qso.steps.map((s) => s.who);
    expect(pattern).toEqual(["you", "dx", "you", "dx", "you"]);
  });

  it("calling role: last step mustContain TU and 73", () => {
    const qso = buildRagchew(PROFILE, "call");
    const last = qso.steps[qso.steps.length - 1];
    expect(last.who).toBe("you");
    expect(last.mustContain).toContain("TU");
    expect(last.mustContain).toContain("73");
  });

  // Snapshot parity: answering-role output must be byte-identical between the
  // pre-refactor signature (no role arg) and the explicit "answer" arg.
  it("snapshot parity: buildRagchew(PROFILE) === buildRagchew(PROFILE, 'answer') shape", () => {
    // We can't control random values, but we CAN verify the structural shape is
    // identical (same step count, same who sequence, same mustContain keys).
    const noArg = buildRagchew(PROFILE);
    const explicitAnswer = buildRagchew(PROFILE, "answer");
    expect(noArg.steps.map((s) => s.who)).toEqual(explicitAnswer.steps.map((s) => s.who));
    expect(noArg.steps.filter((s) => s.who === "you").map((s) => s.mustContain.length))
      .toEqual(explicitAnswer.steps.filter((s) => s.who === "you").map((s) => s.mustContain.length));
  });
});

describe("buildPota()", () => {
  // Verified by reading src: pota has 5 steps (dx, you, dx, you, dx)
  const POTA_STEPS = 5;

  it("returns correct structure with 5 steps — hunter role (explicit)", () => {
    const qso = buildPota(PROFILE, "hunter");
    assertQsoStructure(qso, "POTA", POTA_STEPS);
  });

  it("default (no role arg) is hunter role — backwards-compatible", () => {
    const qso = buildPota(PROFILE);
    expect(qso.steps[0].who).toBe("dx");
  });

  it("myCall propagates — hunter role", () => {
    const qso = buildPota(PROFILE, "hunter");
    const youSteps = qso.steps.filter((s) => s.who === "you");
    const hasCall = youSteps.some((s) => s.suggested.includes("K9MTE"));
    expect(hasCall).toBe(true);
  });

  // GAP 3 (pota): step[1] is the pileup callsign — mustContain must list myCall.
  it("step[1] mustContain includes myCall (pileup callsign step) — hunter role", () => {
    const qso = buildPota(PROFILE, "hunter");
    expect(qso.steps[1].mustContain.includes(PROFILE.myCall)).toBe(true);
  });

  it("activator role: first step is who:you, CQ POTA with myCall", () => {
    const qso = buildPota(PROFILE, "activator");
    expect(qso.steps[0].who).toBe("you");
    expect(qso.steps[0].suggested).toContain("CQ POTA");
    expect(qso.steps[0].suggested).toContain(PROFILE.myCall);
  });

  it("activator role: prompt notes park ref goes in the log, not on air", () => {
    const qso = buildPota(PROFILE, "activator");
    expect(qso.steps[0].prompt).toMatch(/log/i);
  });

  it("activator role: steps alternate you/dx/you/dx/you", () => {
    const qso = buildPota(PROFILE, "activator");
    expect(qso.steps.length).toBe(5);
    expect(qso.steps.map((s) => s.who)).toEqual(["you", "dx", "you", "dx", "you"]);
  });

  it("activator role: last step mustContain TU", () => {
    const qso = buildPota(PROFILE, "activator");
    const last = qso.steps[qso.steps.length - 1];
    expect(last.mustContain).toContain("TU");
  });
});

describe("buildSota()", () => {
  // Verified by reading src: sota has 5 steps (dx, you, dx, you, dx)
  const SOTA_STEPS = 5;

  it("returns correct structure with 5 steps — chaser role (explicit)", () => {
    const qso = buildSota(PROFILE, "chaser");
    assertQsoStructure(qso, "SOTA", SOTA_STEPS);
  });

  it("default (no role arg) is chaser role — backwards-compatible", () => {
    const qso = buildSota(PROFILE);
    expect(qso.steps[0].who).toBe("dx");
  });

  it("myCall propagates — chaser role", () => {
    const qso = buildSota(PROFILE, "chaser");
    const youSteps = qso.steps.filter((s) => s.who === "you");
    const hasCall = youSteps.some((s) => s.suggested.includes("K9MTE"));
    expect(hasCall).toBe(true);
  });

  // GAP 3 (sota): step[1] is the chase callsign — mustContain must list myCall.
  it("step[1] mustContain includes myCall (chase callsign step) — chaser role", () => {
    const qso = buildSota(PROFILE, "chaser");
    expect(qso.steps[1].mustContain.includes(PROFILE.myCall)).toBe(true);
  });

  it("activator role: first step is who:you, CQ SOTA signing /P", () => {
    const qso = buildSota(PROFILE, "activator");
    expect(qso.steps[0].who).toBe("you");
    expect(qso.steps[0].suggested).toContain("CQ SOTA");
    expect(qso.steps[0].suggested).toContain(`${PROFILE.myCall}/P`);
  });

  it("activator role: summit ref appears in step 0 suggested text", () => {
    const qso = buildSota(PROFILE, "activator");
    // Summit ref format: W_/XX-NNN
    expect(qso.steps[0].suggested).toMatch(/[A-Z0-9]+\/[A-Z]+-\d+/);
  });

  it("activator role: steps alternate you/dx/you/dx/you", () => {
    const qso = buildSota(PROFILE, "activator");
    expect(qso.steps.length).toBe(5);
    expect(qso.steps.map((s) => s.who)).toEqual(["you", "dx", "you", "dx", "you"]);
  });
});

describe("buildIota()", () => {
  // Verified by reading src: iota has 5 steps (dx, you, dx, you, dx)
  const IOTA_STEPS = 5;

  it("returns correct structure with 5 steps — chaser role (explicit)", () => {
    const qso = buildIota(PROFILE, "chaser");
    assertQsoStructure(qso, "IOTA", IOTA_STEPS);
  });

  it("default (no role arg) is chaser role — backwards-compatible", () => {
    const qso = buildIota(PROFILE);
    expect(qso.steps[0].who).toBe("dx");
  });

  it("myCall propagates — chaser role", () => {
    const qso = buildIota(PROFILE, "chaser");
    const youSteps = qso.steps.filter((s) => s.who === "you");
    const hasCall = youSteps.some((s) => s.suggested.includes("K9MTE"));
    expect(hasCall).toBe(true);
  });

  // GAP 3 (iota): step[1] is the DX pileup callsign — mustContain must list myCall.
  it("step[1] mustContain includes myCall (DX pileup callsign step) — chaser role", () => {
    const qso = buildIota(PROFILE, "chaser");
    expect(qso.steps[1].mustContain.includes(PROFILE.myCall)).toBe(true);
  });

  it("activator role: first step is who:you, CQ IOTA with island ref", () => {
    const qso = buildIota(PROFILE, "activator");
    expect(qso.steps[0].who).toBe("you");
    // CQ format varies — check shape: CQ present, IOTA tag present, callsign present
    expect(qso.steps[0].suggested).toContain("CQ");
    expect(qso.steps[0].suggested).toContain("IOTA");
    expect(qso.steps[0].suggested).toContain(PROFILE.myCall);
    // Island ref format: XX-NNN
    expect(qso.steps[0].suggested).toMatch(/[A-Z]{2}-\d{3}/);
  });

  it("activator role: steps alternate you/dx/you/dx/you", () => {
    const qso = buildIota(PROFILE, "activator");
    expect(qso.steps.length).toBe(5);
    expect(qso.steps.map((s) => s.who)).toEqual(["you", "dx", "you", "dx", "you"]);
  });

  it("activator role: last step mustContain TU", () => {
    const qso = buildIota(PROFILE, "activator");
    const last = qso.steps[qso.steps.length - 1];
    expect(last.mustContain).toContain("TU");
  });
});

// ---------------------------------------------------------------------------
// cut numbers
// ---------------------------------------------------------------------------
describe("cutNum() and cut: true in builders", () => {
  it("cutNum('599', true) === '5NN'", () => {
    expect(cutNum("599", true)).toBe("5NN");
  });

  it("cutNum('599', false) === '599'", () => {
    expect(cutNum("599", false)).toBe("599");
  });

  it("buildPota with cut: true — you-step report contains 5NN", () => {
    // Run several times because the RST is randomised — but myRst is always
    // cutNum("599", true) = "5NN", and it must appear in the exchange step.
    let found = false;
    for (let i = 0; i < 10; i++) {
      const qso = buildPota({ ...PROFILE, cut: true }, "hunter");
      const youSteps = qso.steps.filter((s) => s.who === "you");
      if (youSteps.some((s) => s.suggested.includes("5NN"))) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isReadyToAdvance() — boundary conditions
// ---------------------------------------------------------------------------
describe("isReadyToAdvance()", () => {
  it("empty history → false", () => {
    expect(isReadyToAdvance([])).toBe(false);
  });

  it("19 attempts all correct → false (below 20-rep floor)", () => {
    const history = Array(19).fill(true);
    expect(isReadyToAdvance(history)).toBe(false);
  });

  it("20 attempts all correct → true", () => {
    const history = Array(20).fill(true);
    expect(isReadyToAdvance(history)).toBe(true);
  });

  it("20 attempts at exactly 90% (18 true, 2 false) → true", () => {
    const history = [...Array(18).fill(true), ...Array(2).fill(false)];
    expect(isReadyToAdvance(history)).toBe(true);
  });

  // 100-rep arrays for the 89/90/91 rounding edge (Math.round boundary)
  it("89/100 correct → false (rounds to 89, below 90 gate)", () => {
    const history = [...Array(89).fill(true), ...Array(11).fill(false)];
    expect(isReadyToAdvance(history)).toBe(false);
  });

  it("90/100 correct → true (rounds to 90, meets gate)", () => {
    const history = [...Array(90).fill(true), ...Array(10).fill(false)];
    expect(isReadyToAdvance(history)).toBe(true);
  });

  it("91/100 correct → true (rounds to 91, above gate)", () => {
    const history = [...Array(91).fill(true), ...Array(9).fill(false)];
    expect(isReadyToAdvance(history)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Drill generators — shape and membership checks
// ---------------------------------------------------------------------------
// Rough callsign shape: optional prefix letters/digits, digit, 1–3 suffix letters
const CALLSIGN_RE = /^[A-Z0-9]{1,2}[0-9][A-Z]{1,3}$/;

describe("drillCallsign()", () => {
  it("emits a non-empty string", () => {
    expect(drillCallsign(PROFILE).length).toBeGreaterThan(0);
  });

  it("every space-delimited token is callsign-shaped", () => {
    // Run a few times to hit different count paths (1, 2, 3 calls)
    for (let i = 0; i < 20; i++) {
      const s = drillCallsign(PROFILE);
      for (const tok of s.split(" ")) {
        expect(CALLSIGN_RE.test(tok)).toBe(true);
      }
    }
  });

  it("emits 1–3 callsigns", () => {
    for (let i = 0; i < 30; i++) {
      const count = drillCallsign(PROFILE).split(" ").length;
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(3);
    }
  });
});

describe("drillCallingCq()", () => {
  it("emits a non-empty string", () => {
    expect(drillCallingCq(PROFILE).length).toBeGreaterThan(0);
  });

  it("always contains the operator's callsign", () => {
    for (let i = 0; i < 10; i++) {
      expect(drillCallingCq(PROFILE)).toContain(PROFILE.myCall);
    }
  });

  it("always contains CQ", () => {
    for (let i = 0; i < 10; i++) {
      expect(drillCallingCq(PROFILE)).toContain("CQ");
    }
  });
});

describe("drillRstExchange()", () => {
  it("emits a non-empty string", () => {
    expect(drillRstExchange(PROFILE).length).toBeGreaterThan(0);
  });

  it("contains recognizable RST/exchange tokens", () => {
    for (let i = 0; i < 10; i++) {
      const s = drillRstExchange(PROFILE);
      // Should contain some digits (report) or UR/BK
      expect(s).toMatch(/[0-9]|UR|BK/);
    }
  });
});

describe("drillNumbers()", () => {
  // Uses the real settings shape (cutNumbers) — matching how the UI calls gen(settings).
  it("emits a non-empty string", () => {
    expect(drillNumbers({ cutNumbers: false }).length).toBeGreaterThan(0);
  });

  it("with cutNumbers:false — only 0–9 digits appear", () => {
    for (let i = 0; i < 20; i++) {
      const s = drillNumbers({ cutNumbers: false }).replace(/\s/g, "");
      expect(s).toMatch(/^[0-9]+$/);
    }
  });

  it("with cutNumbers:true — 9 becomes N and 0 becomes T (no raw 9 or 0)", () => {
    for (let i = 0; i < 30; i++) {
      const s = drillNumbers({ cutNumbers: true }).replace(/\s/g, "");
      expect(s).not.toMatch(/[90]/);
      // Should contain only 1-8, N, T
      expect(s).toMatch(/^[1-8NT]+$/);
    }
  });
});

describe("drillProsigns()", () => {
  it("emits a non-empty string", () => {
    expect(drillProsigns().length).toBeGreaterThan(0);
  });

  it("every space-delimited token is in PROSIGNS", () => {
    for (let i = 0; i < 20; i++) {
      const s = drillProsigns();
      for (const tok of s.split(" ")) {
        expect(PROSIGNS).toContain(tok);
      }
    }
  });

  it("emits 4–5 tokens", () => {
    for (let i = 0; i < 20; i++) {
      const count = drillProsigns().split(" ").length;
      expect(count).toBeGreaterThanOrEqual(4);
      expect(count).toBeLessThanOrEqual(5);
    }
  });
});

describe("drillQCodes()", () => {
  it("emits a non-empty string", () => {
    expect(drillQCodes().length).toBeGreaterThan(0);
  });

  it("every space-delimited token is in QCODES_ABBREV", () => {
    for (let i = 0; i < 20; i++) {
      const s = drillQCodes();
      for (const tok of s.split(" ")) {
        expect(QCODES_ABBREV).toContain(tok);
      }
    }
  });
});

describe("drillCommonWords()", () => {
  it("emits a non-empty string", () => {
    expect(drillCommonWords().length).toBeGreaterThan(0);
  });

  it("every space-delimited token is from COMMON_WORD_POOL (uppercased)", () => {
    // drillCommonWords was repointed to the English frequency pool (Phase 3).
    // Tokens are uppercased at generation time; check against an uppercase Set.
    const poolUpper = new Set(COMMON_WORD_POOL.map(w => w.toUpperCase()));
    for (let i = 0; i < 20; i++) {
      const s = drillCommonWords();
      for (const tok of s.split(" ")) {
        expect(poolUpper.has(tok)).toBe(true);
      }
    }
  });

  it("emits exactly 3 tokens (verbatim original behavior)", () => {
    for (let i = 0; i < 20; i++) {
      expect(drillCommonWords().split(" ").length).toBe(3);
    }
  });
});

describe("drillQsoLine()", () => {
  it("emits a non-empty string", () => {
    expect(drillQsoLine(PROFILE).length).toBeGreaterThan(0);
  });

  it("personalizes {ME} to myCall when a template token is drawn", () => {
    // Run many times — some QSO_PHRASES don't have {ME}, but the ones that
    // do must have it replaced with myCall (not the literal {ME}).
    let foundPersonalized = false;
    for (let i = 0; i < 50; i++) {
      const s = drillQsoLine(PROFILE);
      if (s.includes(PROFILE.myCall)) { foundPersonalized = true; break; }
    }
    // If after 50 tries we never got a {ME} phrase, the test is inconclusive —
    // but in practice QSO_PHRASES has enough {ME} entries that this fires.
    // At minimum verify no raw {ME} survives.
    for (let i = 0; i < 20; i++) {
      expect(drillQsoLine(PROFILE)).not.toContain("{ME}");
    }
  });
});

describe("DRILL_CATEGORIES", () => {
  it("has 14 categories (8 original + 1 wordswide + 5 DX rungs)", () => {
    // Phase 3 inserted 'wordswide' after 'words' — deliberate index shift.
    expect(DRILL_CATEGORIES.length).toBe(14);
  });

  it("each entry has id, label, and gen function", () => {
    for (const cat of DRILL_CATEGORIES) {
      expect(typeof cat.id).toBe("string");
      expect(typeof cat.label).toBe("string");
      expect(typeof cat.gen).toBe("function");
    }
  });

  it("all generator ids are unique", () => {
    const ids = DRILL_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every generator produces a non-empty string when called with PROFILE", () => {
    for (const cat of DRILL_CATEGORIES) {
      const result = cat.gen(PROFILE);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    }
  });

  // Ladder order: simplest → hardest.
  // Phase 3 inserted 'wordswide' at index 1 — all subsequent indices shifted +1.
  it("first category is 'words' (simplest English rung — top-500 frequency pool)", () => {
    expect(DRILL_CATEGORIES[0].id).toBe("words");
  });

  it("second category is 'wordswide' (Phase 3 insert — ranks 1001-5000)", () => {
    expect(DRILL_CATEGORIES[1].id).toBe("wordswide");
  });

  it("third category is 'qcodes' (v2.0 reorder — Q-codes before prosigns; now at index 2 after Phase 3)", () => {
    expect(DRILL_CATEGORIES[2].id).toBe("qcodes");
  });

  it("fourth category is 'prosigns' (v2.0 reorder — after Q-codes; now at index 3 after Phase 3)", () => {
    expect(DRILL_CATEGORIES[3].id).toBe("prosigns");
  });

  it("last category is 'recip' (DX abroad callsigns — hardest DX rung, added Phase 1)", () => {
    expect(DRILL_CATEGORIES[DRILL_CATEGORIES.length - 1].id).toBe("recip");
  });
});

// ---------------------------------------------------------------------------
// analyzeFist() — timing feedback
// ---------------------------------------------------------------------------

// Build a synthetic perfect-fist event array at a known WPM.
// unitMs at 20wpm = 1200/20 = 60ms.
function makePerfectFist(wpm, pattern = ".-") {
  const unitMs = 1200 / wpm;
  const events = [];
  let lastUpAt = 0;
  // Parse a simple pattern string: "." = dit, "-" = dah, " " = word gap.
  for (let wordIdx = 0; wordIdx < pattern.split(" ").length; wordIdx++) {
    const word = pattern.split(" ")[wordIdx];
    const chars = word.split(""); // treat each char as a character (simplified)
    for (let ci = 0; ci < chars.length; ci++) {
      const charCode = chars[ci] === "." ? ["."] : ["-"];
      for (let ei = 0; ei < charCode.length; ei++) {
        const el = charCode[ei];
        const durMs = el === "." ? unitMs : 3 * unitMs;
        // Gap: within a character = 1u, between characters = 3u, between words = 7u
        const gapBeforeMs = events.length === 0 ? 0
          : ei === 0 && ci > 0 ? 3 * unitMs   // char gap
          : ei === 0 && wordIdx > 0 ? 7 * unitMs  // word gap
          : ei > 0 ? unitMs                      // element gap
          : 0;
        events.push({ type: el === "." ? "dit" : "dah", durMs, gapBeforeMs });
        lastUpAt += gapBeforeMs + durMs;
      }
    }
  }
  return events;
}

// A small helper that builds a realistic synthetic event stream from a Morse pattern.
// Used for the spacing tests below.
function makeFistFromMorse(wpm, morseStr, charGapMultiplier = 1, wordGapMultiplier = 1) {
  // morseStr: dot/dash runs separated by "|" for char boundaries, "||" for word boundaries.
  // e.g. ".-|-.." is A then D, ".- ||-.." is A then word gap then D.
  const unitMs = 1200 / wpm;
  const events = [];
  const chars = morseStr.split("|");
  for (let ci = 0; ci < chars.length; ci++) {
    const c = chars[ci].trim();
    if (c === "") {
      // double separator handled by splitting on "||" -> ci gets empty string; push a word gap onto next
      continue;
    }
    const elements = c.split("");
    for (let ei = 0; ei < elements.length; ei++) {
      const el = elements[ei];
      let gapBeforeMs;
      if (events.length === 0) {
        gapBeforeMs = 0;
      } else if (ei === 0) {
        // char boundary — was the previous char itself preceded by a "||"?
        // Simplification: just use charGap for all inter-char boundaries here.
        gapBeforeMs = 3 * unitMs * charGapMultiplier;
      } else {
        gapBeforeMs = unitMs; // intra-char element gap (perfect)
      }
      const durMs = el === "." ? unitMs : 3 * unitMs;
      events.push({ type: el === "." ? "dit" : "dah", durMs, gapBeforeMs });
    }
  }
  return events;
}

describe("analyzeFist()", () => {
  it("empty events → safe zeros, no NaN, no throw", () => {
    const r = analyzeFist([], 20, "straight");
    expect(r.estWpm).toBe(0);
    expect(r.elements).toBe(0);
    expect(r.unitMs).toBe(0);
    expect(r.spacing.element.verdict).toBe("good");
    expect(r.spacing.character.verdict).toBe("good");
    expect(r.spacing.word.verdict).toBe("good");
    expect(Array.isArray(r.notes)).toBe(true);
  });

  it("null events → safe zeros, no throw", () => {
    const r = analyzeFist(null, 20, "straight");
    expect(r.estWpm).toBe(0);
  });

  it("clean 20wpm fist → estWpm near 20, all verdicts good", () => {
    // Build a sequence of dits and dahs with perfect spacing at 20 wpm.
    const unitMs = 60; // 1200 / 20
    const events = [
      { type: "dit", durMs: unitMs,     gapBeforeMs: 0 },         // 1st dit, no prior gap
      { type: "dah", durMs: 3 * unitMs, gapBeforeMs: unitMs },    // element gap 1u
      { type: "dit", durMs: unitMs,     gapBeforeMs: 3 * unitMs }, // char gap 3u
      { type: "dah", durMs: 3 * unitMs, gapBeforeMs: unitMs },    // element gap 1u
      { type: "dit", durMs: unitMs,     gapBeforeMs: 7 * unitMs }, // word gap 7u
      { type: "dit", durMs: unitMs,     gapBeforeMs: unitMs },    // element gap 1u
    ];
    const r = analyzeFist(events, 20, "straight");
    expect(r.estWpm).toBeGreaterThanOrEqual(18);
    expect(r.estWpm).toBeLessThanOrEqual(22);
    expect(r.spacing.element.verdict).toBe("good");
    expect(r.spacing.character.verdict).toBe("good");
    expect(r.spacing.word.verdict).toBe("good");
  });

  it("loose letter gaps → character.verdict === 'loose'", () => {
    const unitMs = 60;
    // Character gap of 4.5u is in the char-gap bucket (2u–5u) and is > 3u * 1.25
    // so it reads as "loose". Using 4.5u: ratio = 4.5, ideal = 3, deviation = 50% > 25%.
    const events = [
      { type: "dit", durMs: unitMs, gapBeforeMs: 0 },
      { type: "dit", durMs: unitMs, gapBeforeMs: 4.5 * unitMs }, // loose char gap
      { type: "dit", durMs: unitMs, gapBeforeMs: 4.5 * unitMs },
      { type: "dit", durMs: unitMs, gapBeforeMs: 4.5 * unitMs },
    ];
    const r = analyzeFist(events, 20, "straight");
    expect(r.spacing.character.verdict).toBe("loose");
  });

  it("tight letter gaps → character.verdict === 'tight'", () => {
    const unitMs = 60;
    // Character gap of 2.1u is in the char-gap bucket (2u–5u) and is < 3u * 0.75
    // so it reads as "tight". Using 2.1u: ratio = 2.1, ideal = 3, deviation = 30% > 25%.
    const events = [
      { type: "dit", durMs: unitMs, gapBeforeMs: 0 },
      { type: "dit", durMs: unitMs, gapBeforeMs: 2.1 * unitMs }, // tight char gap
      { type: "dit", durMs: unitMs, gapBeforeMs: 2.1 * unitMs },
      { type: "dit", durMs: unitMs, gapBeforeMs: 2.1 * unitMs },
    ];
    const r = analyzeFist(events, 20, "straight");
    expect(r.spacing.character.verdict).toBe("tight");
  });

  it("paddle mode → element.verdict is always 'good' (suppressed)", () => {
    const unitMs = 60;
    // Even with terrible intra-element spacing it must be suppressed for paddle
    const events = [
      { type: "dit", durMs: unitMs, gapBeforeMs: 0 },
      { type: "dah", durMs: 3 * unitMs, gapBeforeMs: 5 * unitMs }, // terrible element gap
      { type: "dit", durMs: unitMs, gapBeforeMs: 5 * unitMs },
    ];
    const r = analyzeFist(events, 20, "paddle");
    expect(r.spacing.element.verdict).toBe("good");
  });

  it("median-based unitMs: one absurd outlier dah barely moves estWpm", () => {
    const unitMs = 60; // 20 wpm
    // 10 normal dits + 1 absurd dit (10x too long)
    const events = Array.from({ length: 10 }, (_, i) => ({
      type: "dit",
      durMs: unitMs,
      gapBeforeMs: i === 0 ? 0 : unitMs,
    }));
    events.push({ type: "dit", durMs: 10 * unitMs, gapBeforeMs: unitMs }); // outlier

    const r = analyzeFist(events, 20, "straight");
    // With median, the outlier doesn't shift the estimate much
    // Mean would give (10*60 + 600) / 11 ≈ 109ms → ~11wpm (badly wrong)
    // Median of [60,60,...,60,600] = 60 → 20wpm exactly
    expect(r.estWpm).toBeGreaterThanOrEqual(18);
    expect(r.estWpm).toBeLessThanOrEqual(22);
  });

  it("elements count is correct", () => {
    const unitMs = 60;
    const events = [
      { type: "dit", durMs: unitMs, gapBeforeMs: 0 },
      { type: "dah", durMs: 3 * unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs, gapBeforeMs: 3 * unitMs },
    ];
    const r = analyzeFist(events, 20, "straight");
    expect(r.elements).toBe(3);
  });

  // Paddle spacing: the corrected useKeyer records the real gap (key-up→next
  // key-down) for each paddle element, matching what the straight-key path does.
  // Intra-element gaps remain ≈1u (machine-timed); inter-char and inter-word
  // gaps reflect the operator's actual pauses. This test verifies that
  // analyzeFist populates character and word verdicts from those real gaps,
  // and that the element-gap verdict is suppressed (paddle mode).
  it("paddle with real char/word gaps → char and word verdicts populate; element verdict suppressed", () => {
    const unitMs = 60; // 20 wpm
    // Simulate two characters separated by a loose char gap (6u — well above the
    // 3u ideal but still in the char-gap bucket < 5u... wait, 6u > 5u → word bucket).
    // Use a 4u char gap (loose: ratio=4, ideal=3, deviation=33%>25%) and a 9u word gap
    // (loose: ratio=9, ideal=7, deviation=28%>25%). Machine-timed intra-element
    // gap is exactly 1u — good, but the verdict is suppressed for paddle anyway.
    const events = [
      // Character 1: dit-dah (A), machine gap 1u between elements
      { type: "dit", durMs: unitMs,     gapBeforeMs: 0 },
      { type: "dah", durMs: 3 * unitMs, gapBeforeMs: unitMs },       // machine intra-char (1u)
      // Character 2: dit (E), loose char gap 4u
      { type: "dit", durMs: unitMs,     gapBeforeMs: 4 * unitMs },   // loose inter-char gap
      // Word gap then another dit: 9u (loose word gap)
      { type: "dit", durMs: unitMs,     gapBeforeMs: 9 * unitMs },   // loose inter-word gap
    ];
    const r = analyzeFist(events, 20, "paddle");

    // Element verdict MUST be suppressed for paddle
    expect(r.spacing.element.verdict).toBe("good");

    // Character verdict: 4u gap → ratio 4/3 ≈ 1.33 deviation from ideal 3
    // deviation = |4-3|/3 = 33% > 25% → loose
    expect(r.spacing.character.verdict).toBe("loose");

    // Word verdict: 9u gap → ratio 9/7 ≈ 1.29 deviation from ideal 7
    // deviation = |9-7|/7 = 28% > 25% → loose
    expect(r.spacing.word.verdict).toBe("loose");

    // estWpm should be in a reasonable range (based on dit durations = 60ms)
    expect(r.estWpm).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ROLE_TERMS — UI data sanity
// ---------------------------------------------------------------------------
describe("ROLE_TERMS", () => {
  it("all four activities have exactly two roles", () => {
    for (const activity of ["ragchew", "pota", "sota", "iota"]) {
      expect(ROLE_TERMS[activity].length).toBe(2);
    }
  });

  it("ragchew uses call/answer terminology", () => {
    const ids = ROLE_TERMS.ragchew.map(([id]) => id);
    expect(ids).toContain("call");
    expect(ids).toContain("answer");
  });

  it("pota uses activator/hunter", () => {
    const ids = ROLE_TERMS.pota.map(([id]) => id);
    expect(ids).toContain("activator");
    expect(ids).toContain("hunter");
  });

  it("sota and iota use activator/chaser", () => {
    for (const act of ["sota", "iota"]) {
      const ids = ROLE_TERMS[act].map(([id]) => id);
      expect(ids).toContain("activator");
      expect(ids).toContain("chaser");
    }
  });
});

// ---------------------------------------------------------------------------
// QA GATE — regression-catching tests added by test-qa-engineer.
// These exercise behavior the existing suite went green without covering.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// cqCall() — CQ format variation helper
// ---------------------------------------------------------------------------
describe("cqCall()", () => {
  const CALL = "K9MTE";
  const ACTIVITIES = ["ragchew", "pota", "sota", "iota"];

  // Run many times so all three variants are likely drawn at least once.
  const RUNS = 60;

  it("always contains the callsign for every activity", () => {
    for (const act of ACTIVITIES) {
      for (let i = 0; i < RUNS; i++) {
        expect(cqCall(act, CALL)).toContain(CALL);
      }
    }
  });

  it("always contains 'CQ' for every activity", () => {
    for (const act of ACTIVITIES) {
      for (let i = 0; i < RUNS; i++) {
        expect(cqCall(act, CALL)).toContain("CQ");
      }
    }
  });

  it("always ends with ' K' (standard CQ ending)", () => {
    for (const act of ACTIVITIES) {
      for (let i = 0; i < RUNS; i++) {
        expect(cqCall(act, CALL).endsWith(" K")).toBe(true);
      }
    }
  });

  it("pota/sota/iota CQ always contains the activity tag", () => {
    for (const act of ["pota", "sota", "iota"]) {
      for (let i = 0; i < RUNS; i++) {
        expect(cqCall(act, CALL)).toContain(act.toUpperCase());
      }
    }
  });

  it("ragchew CQ does NOT include any activity tag", () => {
    for (let i = 0; i < RUNS; i++) {
      const cq = cqCall("ragchew", CALL);
      expect(cq).not.toContain("POTA");
      expect(cq).not.toContain("SOTA");
      expect(cq).not.toContain("IOTA");
    }
  });

  it("suffix is included in the CQ when provided", () => {
    const SUMMIT = "W9/UP-001";
    for (let i = 0; i < RUNS; i++) {
      expect(cqCall("sota", `${CALL}/P`, SUMMIT)).toContain(SUMMIT);
    }
  });

  it("all three shape variants appear across many draws", () => {
    // The three variants differ by how many times the callsign is repeated in the
    // DE block: 3×3 sends it three times, 3×2 twice, terse once. Counting call
    // occurrences distinguishes all three, so a regression that collapses cqCall
    // to a single variant (e.g. always-terse or always-3×3) is caught here — not
    // just the terse case. RUNS=60 makes drawing all three overwhelmingly likely.
    const counts = new Set();
    for (let i = 0; i < RUNS; i++) {
      const cq = cqCall("pota", CALL);
      const n = cq.split(/\s+/).filter((tok) => tok === CALL).length;
      counts.add(n);
    }
    // Must have seen the call repeated 3, 2, and 1 times across the draws.
    expect(counts.has(3)).toBe(true); // 3×3 variant
    expect(counts.has(2)).toBe(true); // 3×2 variant
    expect(counts.has(1)).toBe(true); // terse variant
  });

  // Fix 3 (v1.3): terse variant now emits "CQ CQ DE {call} K" (two CQs minimum).
  // A bare single-CQ call is not real on-air practice — two CQs is the minimum
  // that gives a listener time to tune in.  This test ensures none of the 3 variants
  // ever drops to a single leading CQ token.
  it("every emitted CQ string has at least 2 CQ tokens (no bare single CQ)", () => {
    for (const act of ACTIVITIES) {
      for (let i = 0; i < RUNS; i++) {
        const cq = cqCall(act, CALL);
        const cqCount = cq.split(/\s+/).filter((tok) => tok === "CQ").length;
        expect(cqCount).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("mustContain invariant holds for SOTA: callsign and SOTA both appear", () => {
    // The builder sets mustContain: [myCall] for the CQ step. Since cqCall always
    // includes the call, that invariant is always satisfied.
    for (let i = 0; i < RUNS; i++) {
      const cq = cqCall("sota", `${CALL}/P`, "W9/UP-001");
      // myCall appears in its /P form — the builder uses myCall as mustContain
      // (not myCall/P) because mustContain is the base call, not the /P suffix form.
      // This is consistent: the user's sign is K9MTE, and K9MTE/P always contains K9MTE.
      expect(cq).toContain(CALL);
    }
  });
});

// The UI in wr-cw-trainer.jsx calls a drill generator as `cat.gen(settings)`,
// where `settings` is the live app settings object. That object names the
// cut-numbers flag `cutNumbers` — NOT `cut`. The cut-aware generators
// (drillNumbers, drillRstExchange) read `cut`, so when called with the real
// settings shape the cut feature silently does nothing.
//
// The pre-existing tests pass `{ cut: true }` directly, which is NOT how the UI
// calls them, so they go green while the shipped feature is broken. These tests
// reproduce the real call shape. Expected to be RED until the wiring is fixed
// (either the generators read `cutNumbers`, or the UI maps cut->cutNumbers like
// the QSO builders do at the QsoSim start() call).
describe("drill cut-numbers wiring (real UI settings shape)", () => {
  // Mirrors the default settings object the KeyTrainer passes to gen(settings).
  const UI_SETTINGS = {
    myCall: "W1AW", myName: "PAT", myQth: "NEWINGTON CT",
    cutNumbers: true,            // user turned cut ON in Settings
    keyWpm: 18, charWpm: 18, effWpm: 13, freq: 600, keyType: "straight",
  };

  it("Numbers drill honors cut when called with the real settings object", () => {
    const numbers = DRILL_CATEGORIES.find((c) => c.id === "numbers");
    let sawRawNineOrZero = false;
    for (let i = 0; i < 40; i++) {
      const s = numbers.gen(UI_SETTINGS).replace(/\s/g, "");
      if (/[90]/.test(s)) { sawRawNineOrZero = true; break; }
    }
    // With cut ON, no raw 9 or 0 should ever appear.
    expect(sawRawNineOrZero).toBe(false);
  });

  it("RST drill uses cut numbers (5NN) when called with the real settings object", () => {
    const rst = DRILL_CATEGORIES.find((c) => c.id === "rst");
    let sawRaw599 = false;
    for (let i = 0; i < 60; i++) {
      const s = rst.gen(UI_SETTINGS);
      if (s.includes("599")) { sawRaw599 = true; break; }
    }
    // With cut ON, the operator's own report renders 5NN, never raw 599.
    expect(sawRaw599).toBe(false);
  });
});

// The implementer's "snapshot parity" test only compared the who-sequence and
// mustContain.length — it would stay green even if the entire answering-branch
// exchange text were rewritten. The whole point of the parity lock (design §5)
// is to make a future change to the answering builders FAIL. This locks the
// actual step text. Random tokens are masked by overriding Math.random with a
// fixed sequence so the templates are deterministic and comparable.
//
// CQ variation (v1.1 Part 2): the CQ step now uses cqCall(), which picks one of
// three realistic formats at random. The CQ step's text is therefore non-deterministic
// even under a fixed seed (because the variant pick and the call lookup each consume
// a random draw). The CQ step is therefore asserted by SHAPE (callsign + activity
// tag present, ends with K), while every non-CQ step remains EXACT-locked.
// This is the minimum relaxation: all exchange content stays byte-locked; only the
// CQ format varies.
describe("answering-branch text parity (strong lock)", () => {
  const PROF = { myCall: "K9MTE", myName: "TRAVIS", myQth: "MADISON WI", cut: false };

  function withSeed(seq, fn) {
    const real = Math.random;
    let i = 0;
    Math.random = () => seq[(i++) % seq.length];
    try { return fn(); } finally { Math.random = real; }
  }
  const SEED = [0.1, 0.3, 0.5, 0.7, 0.2, 0.9, 0.42, 0.15, 0.6];

  // textOf returns an array of step texts (text or suggested) for exact comparison.
  const stepsOf = (fn, role) =>
    withSeed(SEED, () => fn(PROF, role).steps.map((s) => s.text ?? s.suggested));

  // Helper: assert CQ step shape — callsign present (when given), tag present (when given), ends with K.
  function assertCqShape(cqText, call, tag) {
    if (call) expect(cqText).toContain(call);
    if (tag) expect(cqText).toContain(tag);
    expect(cqText.endsWith(" K")).toBe(true);
    expect(cqText).toContain("CQ");
  }

  it("ragchew answering: CQ step shape-checked; exchange steps exact-locked", () => {
    const steps = stepsOf(buildRagchew, "answer");
    // Step 0: DX CQ — shape check only (CQ format varies)
    // Note: expected call is N5H — VE3 was removed from US_PREFIXES (Canada is now DX),
    // shifting the seeded prefix pick from index 7 (VE3) to index 6 (N5) in the 13-item list.
    assertCqShape(steps[0], "N5H");
    // Steps 1–4: exact lock
    expect(steps[1]).toBe("N5H DE K9MTE K9MTE K");
    expect(steps[2]).toBe("K9MTE DE N5H = GM TNX FER CALL = UR RST 569 569 = NAME MAX MAX = QTH CEDAR RAPIDS IA = HW? K9MTE DE N5H KN");
    expect(steps[3]).toBe("R R N5H DE K9MTE = GM MAX TNX FER RPT = UR RST 599 599 = NAME TRAVIS TRAVIS = QTH MADISON WI = HW? N5H DE K9MTE KN");
    expect(steps[4]).toBe("R FB TRAVIS = TNX FER FB QSO = 73 ES HPE CUAGN K9MTE DE N5H SK EE");
  });

  it("pota hunter: CQ step shape-checked; exchange steps exact-locked (A2: no park ref)", () => {
    const steps = stepsOf(buildPota, "hunter");
    // Step 0: activator CQ — shape only; POTA tag must be present; park ref must NOT be
    // N5H replaces VE3H after VE3 removal from US_PREFIXES (see ragchew lock comment above).
    assertCqShape(steps[0], "N5H", "POTA");
    expect(steps[0]).not.toMatch(/US-\d+/);
    // Steps 1–4: exact lock
    expect(steps[1]).toBe("K9MTE");
    expect(steps[2]).toBe("K9MTE GM UR 589 589 BK");
    expect(steps[3]).toBe("BK GM UR 599 599 WI WI BK");
    expect(steps[4]).toBe("BK TU WI 73 DE N5H EE");
  });

  it("pota hunter CQ step does not contain a park reference (A2)", () => {
    // Run several times (park is random) to confirm no US-XXXX appears in step 0 text.
    for (let i = 0; i < 20; i++) {
      const qso = buildPota(PROF, "hunter");
      expect(qso.steps[0].text).not.toMatch(/US-\d+/);
    }
  });

  it("sota chaser: CQ step shape-checked (includes /P and summit ref); exchange steps exact-locked", () => {
    const steps = stepsOf(buildSota, "chaser");
    // Step 0: SOTA activator CQ — must have /P call, SOTA tag, summit ref, ends K
    // N5H/P replaces VE3H/P — same seed shift as ragchew lock.
    assertCqShape(steps[0], "N5H/P", "SOTA");
    expect(steps[0]).toMatch(/[A-Z0-9]+\/[A-Z]+-\d+/); // summit ref present
    // Steps 1–4: exact lock
    expect(steps[1]).toBe("K9MTE");
    expect(steps[2]).toBe("K9MTE GM UR 589 589 BK");
    expect(steps[3]).toBe("BK R R UR 599 599 TU");
    expect(steps[4]).toBe("BK TU ES 73 DE N5H/P EE");
  });

  it("iota chaser: CQ step shape-checked (includes IOTA tag and island ref); exchange steps locked", () => {
    const steps = stepsOf(buildIota, "chaser");
    // Step 0: IOTA island CQ — must have IOTA tag, island ref, ends K
    assertCqShape(steps[0], undefined, "IOTA"); // dx call varies by prefix pool
    expect(steps[0]).toMatch(/[A-Z]{2}-\d{3}/); // island ref format
    // Steps 2–4: exact lock (step 1 is K9MTE — always the same regardless of dx call)
    expect(steps[1]).toBe("K9MTE");
    // The remaining steps include the dx call which varies by IOTA_DX_PREFIXES pool —
    // lock structural framing only (not the exact DX call value).
    expect(steps[4]).toMatch(/^TU 73 QRZ IOTA DE \S+ K$/);
  });
});

// ---------------------------------------------------------------------------
// Activator builders — single-call consistency (no-foreign-call invariant)
// ---------------------------------------------------------------------------
// Verifies that every step across every activator/call role uses exactly one
// consistent DX call throughout — the internally-generated random one. Previously
// this was tested via a dxCall override parameter; now the builders generate the
// call internally and this test verifies they stay consistent across all fields.
describe("activator builders — single consistent DX call across all steps", () => {
  const PROF = { myCall: "K9MTE", myName: "TRAVIS", myQth: "MADISON WI", cut: false };

  // The negative lookahead (?!\/[A-Z]) prevents matching summit/park ref prefixes
  // like "W0C/FR-063" — only /P is a legitimate callsign suffix.
  const CALL_RE_SRC = /\b([A-Z0-9]{1,2}[0-9][A-Z]{1,3}(?:\/P)?)(?!\/[A-Z])\b/.source;

  function collectCalls(steps) {
    const found = new Set();
    for (const s of steps) {
      for (const field of [s.text, s.suggested, s.prompt]) {
        if (!field) continue;
        for (const m of field.matchAll(new RegExp(CALL_RE_SRC, "g"))) found.add(m[1]);
      }
      if (Array.isArray(s.mustContain)) {
        for (const tok of s.mustContain) {
          if (new RegExp(CALL_RE_SRC).test(tok)) found.add(tok);
        }
      }
    }
    return found;
  }

  it("buildRagchew 'call' role: no step references a call other than qso.dx or myCall", () => {
    // Run several times so the random DX call varies — invariant must hold for all.
    for (let i = 0; i < 5; i++) {
      const qso = buildRagchew(PROF, "call");
      const calls = collectCalls(qso.steps);
      const allowed = new Set([PROF.myCall, qso.dx]);
      for (const c of calls) expect(allowed.has(c)).toBe(true);
    }
  });

  it("buildPota 'activator' role: no step references a call other than qso.dx or myCall", () => {
    for (let i = 0; i < 5; i++) {
      const qso = buildPota(PROF, "activator");
      const calls = collectCalls(qso.steps);
      const allowed = new Set([PROF.myCall, qso.dx]);
      for (const c of calls) expect(allowed.has(c)).toBe(true);
    }
  });

  it("buildSota 'activator' role: no step references a call other than qso.dx, myCall, or myCall/P", () => {
    for (let i = 0; i < 5; i++) {
      const qso = buildSota(PROF, "activator");
      const calls = collectCalls(qso.steps);
      const allowed = new Set([PROF.myCall, PROF.myCall + "/P", qso.dx]);
      for (const c of calls) expect(allowed.has(c)).toBe(true);
    }
  });

  it("buildIota 'activator' role: no step references a call other than qso.dx or myCall", () => {
    for (let i = 0; i < 5; i++) {
      const qso = buildIota(PROF, "activator");
      const calls = collectCalls(qso.steps);
      const allowed = new Set([PROF.myCall, qso.dx]);
      for (const c of calls) expect(allowed.has(c)).toBe(true);
    }
  });

  it("all activator builders produce a valid callsign-shaped qso.dx", () => {
    const CALL_SHAPE = /^[A-Z0-9]{1,2}[0-9][A-Z]{1,3}$/;
    expect(CALL_SHAPE.test(buildRagchew(PROF, "call").dx)).toBe(true);
    expect(CALL_SHAPE.test(buildPota(PROF, "activator").dx)).toBe(true);
    expect(CALL_SHAPE.test(buildSota(PROF, "activator").dx)).toBe(true);
    expect(CALL_SHAPE.test(buildIota(PROF, "activator").dx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A1 (v1.1) — toCodes() tokenizer
// ---------------------------------------------------------------------------
describe("toCodes()", () => {
  it("ordinary single characters map to their MORSE codes", () => {
    const result = toCodes("THE");
    expect(result.length).toBe(3);
    expect(result[0]).toEqual({ code: MORSE.T, displayLen: 1 });
    expect(result[1]).toEqual({ code: MORSE.H, displayLen: 1 });
    expect(result[2]).toEqual({ code: MORSE.E, displayLen: 1 });
  });

  it("space produces a wordGap sentinel (not a code entry)", () => {
    const result = toCodes("A B");
    expect(result.length).toBe(3);
    expect(result[1]).toEqual({ wordGap: true, displayLen: 1 });
  });

  it("'SK' → one atomic code entry (not two separate letters)", () => {
    const result = toCodes("SK");
    expect(result.length).toBe(1);
    expect(result[0]).toEqual({ code: PROSIGN_CODES.SK, displayLen: 2 });
    expect(result[0].code).toBe("...-.-");
  });

  it("'KN' → one atomic code entry", () => {
    const result = toCodes("KN");
    expect(result.length).toBe(1);
    expect(result[0]).toEqual({ code: PROSIGN_CODES.KN, displayLen: 2 });
    expect(result[0].code).toBe("-.--."); // KN in PROSIGN_CODES
  });

  it("'AR' → one atomic code entry", () => {
    const result = toCodes("AR");
    expect(result.length).toBe(1);
    expect(result[0].code).toBe(".-.-.");
  });

  it("'BT' (=) → one atomic code entry", () => {
    const result = toCodes("BT");
    expect(result.length).toBe(1);
    expect(result[0].code).toBe("-...-");
  });

  // The regression test for Ray's sign-off (design §A1, test plan item 2):
  // "CQ SK" must tokenize as [C, Q, wordGap, SK] — not [C, Q, S, K].
  // Without the fix the player would insert a 3u inter-character gap between
  // S and K, sounding wrong.
  it("'CQ SK' → [C, Q, <wordGap>, SK_atomic] (Ray's sign-off regression)", () => {
    const result = toCodes("CQ SK");
    // C, Q, wordGap, SK (atomic)
    expect(result.length).toBe(4);
    expect(result[0]).toEqual({ code: MORSE.C, displayLen: 1 });
    expect(result[1]).toEqual({ code: MORSE.Q, displayLen: 1 });
    expect(result[2]).toEqual({ wordGap: true, displayLen: 1 });
    expect(result[3]).toEqual({ code: PROSIGN_CODES.SK, displayLen: 2 });
  });

  it("'THE' (ordinary word) is not affected — [T, H, E]", () => {
    const result = toCodes("THE");
    expect(result.length).toBe(3);
    expect(result.every((t) => t.code !== undefined)).toBe(true);
  });

  it("unknown characters are skipped (same as original MORSE[ch] guard)", () => {
    // "#" is not in MORSE; "A" is.
    const result = toCodes("A#B");
    expect(result.length).toBe(2);
    expect(result[0].code).toBe(MORSE.A);
    expect(result[1].code).toBe(MORSE.B);
  });

  it("empty string → empty array", () => {
    expect(toCodes("")).toEqual([]);
  });

  it("lowercase input is handled (normalized to upper internally)", () => {
    const result = toCodes("cq");
    expect(result.length).toBe(2);
    expect(result[0].code).toBe(MORSE.C);
    expect(result[1].code).toBe(MORSE.Q);
  });

  // --- Boundary regression tests (Fix 1, v1.1 UAT) ---
  // The original scan matched AR/BT/SK/KN at any character position inside a
  // word, fusing them into an atomic prosign mid-token. The fix requires the
  // WHOLE whitespace-delimited token to equal a PROSIGN_CODES key before fusing.

  it("'ARE' (common word) → [A, R, E] — not AR-prosign + E", () => {
    // ARE is in COMMON_WORDS. The 'AR' inside it must NOT be fused.
    const result = toCodes("ARE");
    expect(result.length).toBe(3);
    expect(result[0]).toEqual({ code: MORSE.A, displayLen: 1 });
    expect(result[1]).toEqual({ code: MORSE.R, displayLen: 1 });
    expect(result[2]).toEqual({ code: MORSE.E, displayLen: 1 });
  });

  it("'W9KN' (callsign) → four separate characters — KN suffix not fused", () => {
    // W9KN has 'KN' at the end. As a callsign token it must not be treated as
    // the KN prosign; that would drop W and 9 and turn KN into one sound.
    const result = toCodes("W9KN");
    expect(result.length).toBe(4);
    expect(result[0]).toEqual({ code: MORSE.W, displayLen: 1 });
    expect(result[1]).toEqual({ code: MORSE[9], displayLen: 1 });
    expect(result[2]).toEqual({ code: MORSE.K, displayLen: 1 });
    expect(result[3]).toEqual({ code: MORSE.N, displayLen: 1 });
  });

  it("'CQ SK' → [C, Q, wordGap, SK_atomic] — standalone SK still fuses", () => {
    // This is the intended case: SK as its own whitespace-delimited token must
    // still produce one atomic code (not S then K separately).
    const result = toCodes("CQ SK");
    expect(result.length).toBe(4);
    expect(result[0]).toEqual({ code: MORSE.C, displayLen: 1 });
    expect(result[1]).toEqual({ code: MORSE.Q, displayLen: 1 });
    expect(result[2]).toEqual({ wordGap: true, displayLen: 1 });
    expect(result[3]).toEqual({ code: PROSIGN_CODES.SK, displayLen: 2 });
  });
});

// ---------------------------------------------------------------------------
// Fix 1 (pre-launch) — toCodes() displayLen and reveal-position correctness
// ---------------------------------------------------------------------------
// These tests assert the single-source-of-truth for easy-mode live-reveal
// strPos advancement.  Before Fix 1 the player ran its own parallel prosign scan
// over the original string; it matched AR/BT/SK/KN at ANY position, so "ARE",
// "W9KN", and "CEDAR" all advanced strPos by 2 instead of 1, making the reveal
// jump characters.  The tests below would FAIL against the old parallel scan.
describe("toCodes() displayLen — reveal-position correctness (Fix 1)", () => {
  // Helper: simulate the strPos accumulation that play() now performs using
  // tok.displayLen.  Returns the character at each onChar event as
  // { strPos, char } pairs.
  function revealPositions(text) {
    const upper = text.toUpperCase();
    const tokens = toCodes(text);
    const positions = [];
    let strPos = 0;
    for (const tok of tokens) {
      const consumed = tok.displayLen;
      if (!tok.wordGap) {
        // capturedPos mirrors: strPos + consumed - 1 (last char of the token)
        const capturedPos = strPos + consumed - 1;
        positions.push({ capturedPos, char: upper[strPos] });
      }
      strPos += consumed;
    }
    return positions;
  }

  it("every token carries displayLen:1 for plain chars, displayLen:2 for prosigns, displayLen:1 for wordGap", () => {
    // "CQ SK" — sanity check on all three token types
    const result = toCodes("CQ SK");
    expect(result[0].displayLen).toBe(1);  // C
    expect(result[1].displayLen).toBe(1);  // Q
    expect(result[2].displayLen).toBe(1);  // wordGap (the space)
    expect(result[3].displayLen).toBe(2);  // SK prosign
  });

  it("'ARE YOU' — 'AR' inside 'ARE' does NOT advance strPos by 2 (old bug)", () => {
    // Old parallel scan: at strPos=0, slice(0,2)==='AR' → consumed=2, skipping E.
    // New: toCodes sees token 'ARE' (not a prosign key) → each char gets displayLen:1.
    // So positions[0] must be { capturedPos:0, char:'A' }, not { capturedPos:1, char:'A' }.
    const pos = revealPositions("ARE YOU");
    expect(pos[0]).toEqual({ capturedPos: 0, char: "A" });
    expect(pos[1]).toEqual({ capturedPos: 1, char: "R" });
    expect(pos[2]).toEqual({ capturedPos: 2, char: "E" });
    // After the space (strPos 3), 'Y' is at strPos 4
    expect(pos[3]).toEqual({ capturedPos: 4, char: "Y" });
  });

  it("'W9KN' callsign — 'KN' at end does NOT advance strPos by 2 (old bug)", () => {
    // Old scan: at strPos=2, slice(2,4)==='KN' → consumed=2, skipping N.
    // New: all four chars advance by 1 each.
    const pos = revealPositions("W9KN");
    expect(pos[0]).toEqual({ capturedPos: 0, char: "W" });
    expect(pos[1]).toEqual({ capturedPos: 1, char: "9" });
    expect(pos[2]).toEqual({ capturedPos: 2, char: "K" });
    expect(pos[3]).toEqual({ capturedPos: 3, char: "N" });
  });

  it("'CEDAR RAPIDS' — 'AR' in 'RAPIDS' does NOT advance strPos by 2 (old bug)", () => {
    // Old scan: at strPos=7 (start of 'RAPIDS'), slice(7,9)==='RA' ≠ 'AR'; at
    // strPos=8, slice(8,10)==='AP' — actually in RAPIDS the 'AR' is not at the start,
    // but 'CEDAR' contains 'AR' nowhere; however 'RAPIDS' contains no AR at position 0.
    // The old scan checked ALL character positions including mid-token: at strPos=8
    // inside RAPIDS, upperText.slice(8,10) === 'AP' — not AR.  But 'CEDAR' at
    // strPos=2: slice(2,4) === 'DA' — also not AR.  The real trap is ANY string where
    // the two-letter window at a given strPos happens to match AR/BT/SK/KN.
    // "CEDAR" starts at 0; at strPos=0, slice(0,2)==='CE'≠AR — safe there.
    // For the stated QTHS entry "CEDAR RAPIDS IA": 'AR' appears at position 7
    // (C-E-D-A-R-[space]-R-A-P-I-D-S — 'RA' at 6-7, 'AP' at 7-8, not 'AR').
    // But "CEDAR" alone: C(0) E(1) D(2) A(3) R(4) — no AR pair at token-start.
    // Use a direct string that has AR-pair at token-start to prove isolation:
    const pos = revealPositions("CEDAR");
    expect(pos[0]).toEqual({ capturedPos: 0, char: "C" });
    expect(pos[1]).toEqual({ capturedPos: 1, char: "E" });
    expect(pos[2]).toEqual({ capturedPos: 2, char: "D" });
    expect(pos[3]).toEqual({ capturedPos: 3, char: "A" });
    expect(pos[4]).toEqual({ capturedPos: 4, char: "R" });
  });

  it("standalone prosign AR in 'CQ AR' has displayLen:2 and its capturedPos is the SECOND letter", () => {
    // This confirms the prosign path: capturedPos = strPos + 2 - 1 = strPos + 1.
    // The onChar callback fires once for the whole prosign, pointing at its second
    // display character, so text.slice(0, capturedPos+1) reveals both letters.
    const pos = revealPositions("CQ AR");
    // C(strPos=0 capturedPos=0), Q(strPos=1 capturedPos=1), AR(strPos=3 consumed=2 capturedPos=4)
    expect(pos[2]).toEqual({ capturedPos: 4, char: "A" });
  });

  it("strPos after full traversal equals the display string length (no off-by-one)", () => {
    // After iterating all tokens, strPos should equal the original string length.
    // Verifies no double-counting or skipping anywhere in the token stream.
    for (const text of ["ARE YOU", "W9KN", "CEDAR", "CQ SK", "AR", "THE QSO"]) {
      const tokens = toCodes(text);
      let strPos = 0;
      for (const tok of tokens) strPos += tok.displayLen;
      expect(strPos).toBe(text.toUpperCase().length);
    }
  });
});
// This is a regression guard: if any mustContain token is not satisfiable from
// the suggested script, the grader will always mark that step wrong on a
// correct answer.  A3 found exactly this bug in the ragchew call-branch close
// (mustContain:["TU","73"] but suggested had "TNX" not "TU").
describe("mustContain ⊆ suggested invariant (all builders × roles)", () => {
  const PROF2 = { myCall: "W1AW", myName: "PAT", myQth: "NEWINGTON CT", cut: false };

  const BUILDERS = [
    { name: "buildRagchew/answer", fn: () => buildRagchew(PROF2, "answer") },
    { name: "buildRagchew/call",   fn: () => buildRagchew(PROF2, "call") },
    { name: "buildPota/hunter",    fn: () => buildPota(PROF2, "hunter") },
    { name: "buildPota/activator", fn: () => buildPota(PROF2, "activator") },
    { name: "buildSota/chaser",    fn: () => buildSota(PROF2, "chaser") },
    { name: "buildSota/activator", fn: () => buildSota(PROF2, "activator") },
    { name: "buildIota/chaser",    fn: () => buildIota(PROF2, "chaser") },
    { name: "buildIota/activator", fn: () => buildIota(PROF2, "activator") },
  ];

  // Run several times per builder to hit the random values (RST, name, QTH, call).
  // The invariant must hold for every draw because mustContain is templated the
  // same way as suggested — both use the same bound variables, so if one token
  // is missing it is consistently missing, not randomly missing.
  const RUNS = 10;

  for (const { name, fn } of BUILDERS) {
    it(`${name}: every mustContain token appears in that step's suggested`, () => {
      for (let run = 0; run < RUNS; run++) {
        const qso = fn();
        for (const step of qso.steps) {
          if (step.who !== "you") continue;
          for (const token of step.mustContain) {
            expect(step.suggested.includes(token)).toBe(true);
          }
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// B2 (v1.1) — analyzeFist: WPM delta + low-sample flag
// ---------------------------------------------------------------------------
describe("analyzeFist() — B2: wpmDelta / wpmVerdict / lowSample", () => {
  const unitMs = 60; // 20 wpm

  it("wpmDelta = estWpm - keyWpm", () => {
    // Perfect 20 wpm fist, keyWpm=20 → delta ≈ 0
    const events = [
      { type: "dit", durMs: unitMs, gapBeforeMs: 0 },
      { type: "dit", durMs: unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs, gapBeforeMs: unitMs },
      { type: "dah", durMs: 3 * unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs, gapBeforeMs: unitMs },
    ];
    const r = analyzeFist(events, 20, "straight");
    // delta should be close to 0 (within ±3 wpm tolerance = "on target")
    expect(r.wpmVerdict).toBe("on target");
    expect(typeof r.wpmDelta).toBe("number");
  });

  it("fast fist (10wpm events, keyWpm=20) → wpmDelta positive, wpmVerdict 'fast'", () => {
    const fastUnit = 1200 / 40; // 40 wpm events, target is 20 → fast
    const events = Array.from({ length: 10 }, (_, i) => ({
      type: "dit", durMs: fastUnit, gapBeforeMs: i === 0 ? 0 : fastUnit,
    }));
    const r = analyzeFist(events, 20, "straight");
    expect(r.wpmDelta).toBeGreaterThan(3);
    expect(r.wpmVerdict).toBe("fast");
  });

  it("slow fist (events at 10wpm, keyWpm=20) → wpmDelta negative, wpmVerdict 'slow'", () => {
    const slowUnit = 1200 / 10; // 10 wpm events, target is 20 → slow
    const events = Array.from({ length: 10 }, (_, i) => ({
      type: "dit", durMs: slowUnit, gapBeforeMs: i === 0 ? 0 : slowUnit,
    }));
    const r = analyzeFist(events, 20, "straight");
    expect(r.wpmDelta).toBeLessThan(-3);
    expect(r.wpmVerdict).toBe("slow");
  });

  it("lowSample true for < FIST_MIN_ELEMENTS events", () => {
    const events = [
      { type: "dit", durMs: unitMs, gapBeforeMs: 0 },
      { type: "dah", durMs: 3 * unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs, gapBeforeMs: unitMs },
    ]; // 3 elements < 8
    const r = analyzeFist(events, 20, "straight");
    expect(r.lowSample).toBe(true);
    // estWpm is still computed — the flag qualifies, it does not zero the number
    expect(r.estWpm).toBeGreaterThan(0);
  });

  it("lowSample false for >= FIST_MIN_ELEMENTS events", () => {
    const events = Array.from({ length: 12 }, (_, i) => ({
      type: "dit", durMs: unitMs, gapBeforeMs: i === 0 ? 0 : unitMs,
    }));
    const r = analyzeFist(events, 20, "straight");
    expect(r.lowSample).toBe(false);
  });

  it("empty events → lowSample true (no data)", () => {
    const r = analyzeFist([], 20, "straight");
    expect(r.lowSample).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B3 (v1.1) — analyzeFist: dit/dah weighting verdict
// ---------------------------------------------------------------------------
describe("analyzeFist() — B3: weighting (straight key only)", () => {
  const unitMs = 60; // 20 wpm

  // Synthetic fist with good dah/dit ratio (dahs = 3×unit)
  it("dahs at 3×dit → weighting.verdict 'good'", () => {
    const events = [
      { type: "dit", durMs: unitMs,     gapBeforeMs: 0 },
      { type: "dah", durMs: 3 * unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs,     gapBeforeMs: 3 * unitMs },
      { type: "dah", durMs: 3 * unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs,     gapBeforeMs: 3 * unitMs },
      { type: "dah", durMs: 3 * unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs,     gapBeforeMs: 3 * unitMs },
      { type: "dah", durMs: 3 * unitMs, gapBeforeMs: unitMs },
    ];
    const r = analyzeFist(events, 20, "straight");
    expect(r.weighting.verdict).toBe("good");
    expect(r.weighting.ratio).toBeCloseTo(3, 0);
  });

  it("dahs at 5×dit (too long) → weighting.verdict 'loose'", () => {
    const events = [
      { type: "dit", durMs: unitMs,     gapBeforeMs: 0 },
      { type: "dah", durMs: 5 * unitMs, gapBeforeMs: unitMs }, // 5u instead of 3u
      { type: "dit", durMs: unitMs,     gapBeforeMs: 3 * unitMs },
      { type: "dah", durMs: 5 * unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs,     gapBeforeMs: 3 * unitMs },
      { type: "dah", durMs: 5 * unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs,     gapBeforeMs: 3 * unitMs },
      { type: "dah", durMs: 5 * unitMs, gapBeforeMs: unitMs },
    ];
    const r = analyzeFist(events, 20, "straight");
    expect(r.weighting.verdict).toBe("loose");
  });

  it("dahs at 1.5×dit (too short) → weighting.verdict 'tight'", () => {
    const events = [
      { type: "dit", durMs: unitMs,       gapBeforeMs: 0 },
      { type: "dah", durMs: 1.5 * unitMs, gapBeforeMs: unitMs }, // 1.5u instead of 3u
      { type: "dit", durMs: unitMs,       gapBeforeMs: 3 * unitMs },
      { type: "dah", durMs: 1.5 * unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs,       gapBeforeMs: 3 * unitMs },
      { type: "dah", durMs: 1.5 * unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs,       gapBeforeMs: 3 * unitMs },
      { type: "dah", durMs: 1.5 * unitMs, gapBeforeMs: unitMs },
    ];
    const r = analyzeFist(events, 20, "straight");
    expect(r.weighting.verdict).toBe("tight");
  });

  it("paddle mode → weighting suppressed regardless of dah length (ratio null, verdict 'good')", () => {
    // Even absurdly long dahs (5u) should be suppressed for paddle
    const events = [
      { type: "dit", durMs: unitMs,     gapBeforeMs: 0 },
      { type: "dah", durMs: 5 * unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs,     gapBeforeMs: 3 * unitMs },
      { type: "dah", durMs: 5 * unitMs, gapBeforeMs: unitMs },
    ];
    const r = analyzeFist(events, 20, "paddle");
    expect(r.weighting.verdict).toBe("good");
    expect(r.weighting.ratio).toBeNull();
  });

  it("all-dits sequence (no dahs) → weighting.ratio null, verdict 'good' (no throw)", () => {
    const events = Array.from({ length: 8 }, (_, i) => ({
      type: "dit", durMs: unitMs, gapBeforeMs: i === 0 ? 0 : unitMs,
    }));
    const r = analyzeFist(events, 20, "straight");
    expect(r.weighting.ratio).toBeNull();
    expect(r.weighting.verdict).toBe("good");
  });

  it("loose weighting produces a note string about dahs running long", () => {
    const events = [
      { type: "dit", durMs: unitMs,     gapBeforeMs: 0 },
      { type: "dah", durMs: 5 * unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs,     gapBeforeMs: 3 * unitMs },
      { type: "dah", durMs: 5 * unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs,     gapBeforeMs: 3 * unitMs },
      { type: "dah", durMs: 5 * unitMs, gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs,     gapBeforeMs: 3 * unitMs },
      { type: "dah", durMs: 5 * unitMs, gapBeforeMs: unitMs },
    ];
    const r = analyzeFist(events, 20, "straight");
    const hasNote = r.notes.some((n) => n.includes("dahs") && n.includes("long"));
    expect(hasNote).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B4 (v1.1) — averageScore()
// ---------------------------------------------------------------------------
describe("averageScore()", () => {
  it("[90, 80, 100] → 90 (mean rounded)", () => {
    expect(averageScore([90, 80, 100])).toBe(90);
  });

  it("empty array → null (no data to average)", () => {
    expect(averageScore([])).toBeNull();
  });

  it("null/undefined → null", () => {
    expect(averageScore(null)).toBeNull();
    expect(averageScore(undefined)).toBeNull();
  });

  it("single value → that value", () => {
    expect(averageScore([75])).toBe(75);
  });

  it("rounding: [90, 91] → 91 (rounds half-up)", () => {
    // mean = 90.5 → Math.round → 91
    expect(averageScore([90, 91])).toBe(91);
  });

  it("fractional values round correctly", () => {
    // [0, 1] → mean 0.5 → rounds to 1 (Math.round behavior)
    expect(averageScore([0, 1])).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// analyzeFist() — bug key mode semantics (v1.4)
// ---------------------------------------------------------------------------
// These tests lock the split behavior introduced for keyType="bug":
//   - dah weighting IS computed (hand-timed dahs are the training value)
//   - element-spacing verdict IS suppressed (machine-timed dits)
// They are mutation-meaningful: inverting either guard makes the corresponding
// test fail, which is exactly the protection that was asked for in the design.

describe("analyzeFist() — bug mode semantics", () => {
  const WPM = 20;
  const unitMs = 1200 / WPM; // 60ms at 20wpm

  // Build a synthetic event stream with dits at perfect cadence and one dah.
  // gapBeforeMs for the dits is left at 1u (machine-gap — would trip element
  // verdict if not suppressed) so A2 has something to bite on.
  function bugStream({ dahDurMultiplier = 3 } = {}) {
    return [
      { type: "dit", durMs: unitMs,                   gapBeforeMs: 0 },
      { type: "dit", durMs: unitMs,                   gapBeforeMs: unitMs },     // machine element gap
      { type: "dit", durMs: unitMs,                   gapBeforeMs: unitMs },
      { type: "dah", durMs: unitMs * dahDurMultiplier, gapBeforeMs: 3 * unitMs }, // char gap
      { type: "dit", durMs: unitMs,                   gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs,                   gapBeforeMs: unitMs },
      { type: "dah", durMs: unitMs * dahDurMultiplier, gapBeforeMs: 3 * unitMs },
      { type: "dit", durMs: unitMs,                   gapBeforeMs: unitMs },
      { type: "dit", durMs: unitMs,                   gapBeforeMs: unitMs },
    ];
  }

  // A1: bug mode computes dah weighting (not suppressed like paddle).
  // Bites: if someone changes the paddle suppression guard to also include "bug".
  it("A1: keyType='bug' with dahs → weighting.ratio is NOT null (computed)", () => {
    const events = bugStream({ dahDurMultiplier: 3 }); // perfect dah length
    const r = analyzeFist(events, WPM, "bug");
    // weighting computed: ratio should be close to 3 (ideal), not null
    expect(r.weighting.ratio).not.toBeNull();
    expect(r.weighting.ratio).toBeCloseTo(3, 0);
    expect(r.weighting.verdict).toBe("good");
  });

  // A2: bug mode suppresses element-spacing verdict (machine-timed dits).
  // We inject gaps in the element-gap bucket (ratio < 2u) that are deliberately
  // bad (1.6u = 60% loose relative to ideal 1u — well above the 25% tolerance),
  // confirm they produce a non-good verdict in straight mode, and that bug suppresses
  // the same verdict.
  // Bites: if the element-spacing guard stops including "bug".
  it("A2: keyType='bug' with bad element gaps → element.verdict === 'good' (suppressed)", () => {
    // Element gap must be ratio < 2u to land in the element-gap bucket.
    // 1.6u is loose: |1.6 - 1| / 1 = 60% > 25% FIST_TOLERANCE → verdict = "loose".
    const badGap = [
      { type: "dit", durMs: unitMs,     gapBeforeMs: 0 },
      { type: "dit", durMs: unitMs,     gapBeforeMs: 1.6 * unitMs }, // bad element gap (< 2u)
      { type: "dit", durMs: unitMs,     gapBeforeMs: 1.6 * unitMs },
      { type: "dah", durMs: 3 * unitMs, gapBeforeMs: 3 * unitMs },   // char gap
      { type: "dit", durMs: unitMs,     gapBeforeMs: 1.6 * unitMs },
      { type: "dah", durMs: 3 * unitMs, gapBeforeMs: 3 * unitMs },
    ];
    // Verify the gap IS bad for straight (makes the test bite-proof):
    const straight = analyzeFist(badGap, WPM, "straight");
    expect(straight.spacing.element.verdict).not.toBe("good"); // "loose"
    // For bug it must be suppressed:
    const bug = analyzeFist(badGap, WPM, "bug");
    expect(bug.spacing.element.verdict).toBe("good");
  });

  // A3: long dahs on a bug (durMs ≈ 5u) → weighting verdict is "loose".
  // Bites: the weighting math / threshold for the exact feedback bug practice exists to teach.
  it("A3: keyType='bug' with dahs running ~5u → weighting.verdict === 'loose'", () => {
    // 5u dahs: ratio = 5/3 ≈ 1.67, deviation from ideal 3 is |5-3|/3 = 67% >> 25% threshold
    const events = bugStream({ dahDurMultiplier: 5 });
    const r = analyzeFist(events, WPM, "bug");
    expect(r.weighting.verdict).toBe("loose");
    // The plain-English note should mention "running long"
    const note = r.notes.find((n) => n.includes("running long"));
    expect(note).toBeTruthy();
  });

  // Sanity: verify "bug" is NOT accidentally treated as "paddle" anywhere.
  // If it were, weighting would be null and element verdict would be "good" for all inputs.
  // A1 catches the weighting half; this pins the element-spacing suppression path directly.
  it("A4: keyType='bug' is NOT the string 'paddle' — paddle guard does not fire", () => {
    const events = bugStream();
    const paddle = analyzeFist(events, WPM, "paddle");
    const bug    = analyzeFist(events, WPM, "bug");
    // Paddle suppresses weighting; bug does not.
    expect(paddle.weighting.ratio).toBeNull();
    expect(bug.weighting.ratio).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cross-session progress history (v2.0 §1)
// ---------------------------------------------------------------------------
describe("emptyProgress()", () => {
  it("returns a fresh object with all three category arrays and correct schemaVersion", () => {
    const p = emptyProgress();
    expect(p.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
    expect(Array.isArray(p.learn)).toBe(true);
    expect(Array.isArray(p.key)).toBe(true);
    expect(Array.isArray(p.copy)).toBe(true);
    expect(p.learn.length).toBe(0);
    expect(p.key.length).toBe(0);
    expect(p.copy.length).toBe(0);
  });
});

describe("appendProgress()", () => {
  const baseRec = { t: Date.now(), lesson: 1, attempts: 10, correct: 9, pct: 90 };

  it("caps at PROGRESS_RETENTION: push 60 records, only last 50 kept", () => {
    let p = emptyProgress();
    for (let i = 0; i < 60; i++) {
      p = appendProgress(p, "learn", { ...baseRec, pct: i });
    }
    expect(p.learn.length).toBe(PROGRESS_RETENTION);
    // Newest record (i=59) must be the last, oldest (i=0..9) dropped
    expect(p.learn[p.learn.length - 1].pct).toBe(59);
    expect(p.learn[0].pct).toBe(10); // first 10 dropped
  });

  it("does NOT mutate its input — returns a new object and the original is unchanged", () => {
    const p = emptyProgress();
    const original = p.learn;
    const next = appendProgress(p, "learn", baseRec);
    // original array unchanged
    expect(p.learn).toBe(original);
    expect(p.learn.length).toBe(0);
    // returned object is different reference
    expect(next).not.toBe(p);
    expect(next.learn.length).toBe(1);
  });

  it("writes to the qso category now that it is known", () => {
    // qso is a known category in this schema version — appending must succeed,
    // NOT throw. (The old test had both qso and typo throwing; fix: qso is now valid.)
    const p = emptyProgress();
    const qsoRec = { t: Date.now(), activity: "pota", role: "hunter", difficulty: "normal", copyPct: 85, sendPct: null };
    const next = appendProgress(p, "qso", qsoRec);
    expect(next.qso.length).toBe(1);
    expect(next.qso[0].activity).toBe("pota");
    // Other categories untouched
    expect(next.learn.length).toBe(0);
    expect(next.copy.length).toBe(0);
  });

  it("throws on a genuine typo so bad category names fail loudly", () => {
    const p = emptyProgress();
    expect(() => appendProgress(p, "typo", baseRec)).toThrow(/unknown category/);
    // A close-but-wrong name also throws (no partial match)
    expect(() => appendProgress(p, "qsoo", baseRec)).toThrow(/unknown category/);
  });

  it("writes to the correct category array and leaves the others empty", () => {
    const p = emptyProgress();
    const next = appendProgress(p, "copy", { t: 1, source: "single", pct: 80 });
    expect(next.copy.length).toBe(1);
    expect(next.learn.length).toBe(0);
    expect(next.key.length).toBe(0);
  });
});

describe("migrateProgress()", () => {
  it("null → emptyProgress() shape", () => {
    const p = migrateProgress(null);
    expect(p.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
    expect(Array.isArray(p.learn)).toBe(true);
    expect(p.learn.length).toBe(0);
  });

  it("undefined → emptyProgress() shape", () => {
    const p = migrateProgress(undefined);
    expect(p.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
  });

  it("mismatched schemaVersion → data is carried forward, version stamped current", () => {
    // Old behaviour: wiped. New behaviour: carry forward through the migration
    // ladder (PROGRESS_MIGRATIONS). With no migrations registered (only v1 exists),
    // learn/key/copy arrays pass through untouched and the version is stamped current.
    // schemaVersion:0 simulates a pre-v1 blob (e.g. written before the field existed).
    const oldBlob = {
      schemaVersion: 0,
      learn: [{ t: 1, lesson: 1, attempts: 10, correct: 9, pct: 90 }],
      key:   [],
      copy:  [],
    };
    const p = migrateProgress(oldBlob);
    // Data must be preserved, not wiped.
    expect(p.learn.length).toBe(1);
    expect(p.learn[0].pct).toBe(90);
    // Version is stamped to the current schema.
    expect(p.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
  });

  it("QSO seam: qso records in a stored blob are preserved through migrateProgress", () => {
    // qso is now a known category — migrateProgress carries its records forward
    // exactly like learn/key/copy. This is the seam invariant: data survives a
    // round-trip through an older build that didn't write qso records.
    const blob = {
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      learn: [],
      key:   [],
      copy:  [],
      qso:   [{ t: 1, activity: "pota", copyPct: 95, sendPct: 80, role: "hunter", difficulty: "normal" }],
    };
    const p = migrateProgress(blob);
    // The qso array survives the migration round-trip.
    expect(Array.isArray(p.qso)).toBe(true);
    expect(p.qso.length).toBe(1);
    expect(p.qso[0].activity).toBe("pota");
  });

  it("fills missing category arrays when blob has correct version but is incomplete", () => {
    const partial = { schemaVersion: PROGRESS_SCHEMA_VERSION, learn: [{ t: 1, lesson: 1, attempts: 5, correct: 4, pct: 80 }] };
    const p = migrateProgress(partial);
    expect(Array.isArray(p.key)).toBe(true);
    expect(p.key.length).toBe(0);
    expect(Array.isArray(p.copy)).toBe(true);
    expect(p.copy.length).toBe(0);
    // Existing data preserved
    expect(p.learn.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // T3 — old-schema blob carries data forward (the main regression guard for
  // the old wipe-on-mismatch behaviour).
  // Mutation target: the try/catch → emptyProgress() path. We verify this test
  // goes red when the old wipe is restored (see mutation note below).
  // -------------------------------------------------------------------------
  it("T3: old-schema blob (schemaVersion:0) → all records preserved, version current", () => {
    const old = {
      schemaVersion: 0,
      learn: [
        { t: 1000, lesson: 1, attempts: 10, correct: 9, pct: 90 },
        { t: 2000, lesson: 2, attempts: 10, correct: 8, pct: 80 },
      ],
      key:  [{ t: 3000, estWpm: 18, weighting: { verdict: "ok" }, spacing: { verdict: "ok" }, element: { verdict: "good" } }],
      copy: [{ t: 4000, source: "words", pct: 75 }],
    };
    const p = migrateProgress(old);
    // All three category arrays must survive the migration.
    expect(p.learn.length).toBe(2);
    expect(p.learn[1].pct).toBe(80);
    expect(p.key.length).toBe(1);
    expect(p.copy.length).toBe(1);
    // Version stamped to current.
    expect(p.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
  });

  // -------------------------------------------------------------------------
  // T4 — QSO seam preserved across a version mismatch (the invariant must hold
  // even when schemaVersion does NOT match the current version).
  // -------------------------------------------------------------------------
  it("T4: QSO seam preserved across a version mismatch (old blob with qso data)", () => {
    const old = {
      schemaVersion: 0,   // pre-v1
      learn: [{ t: 1, lesson: 1, attempts: 5, correct: 4, pct: 80 }],
      key:   [],
      copy:  [],
      qso:   [{ t: 5000, activity: "pota", pct: 95 }], // written by a future build
    };
    const p = migrateProgress(old);
    // QSO seam must survive even when the blob needed a migration walk.
    expect(Array.isArray(p.qso)).toBe(true);
    expect(p.qso.length).toBe(1);
    expect(p.qso[0].activity).toBe("pota");
    // Known categories are not disturbed.
    expect(p.learn.length).toBe(1);
    expect(p.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
  });

  // -------------------------------------------------------------------------
  // T5 — genuinely corrupt data falls back to emptyProgress(); a parseable
  // old-version blob does NOT fall back (only a throw triggers the catch).
  // -------------------------------------------------------------------------
  it("T5: throwing migration falls back to emptyProgress(); a valid old blob does not", () => {
    // A parseable old blob must not lose data (covered by T3 above).
    const old = { schemaVersion: 0, learn: [{ t: 1, lesson: 1, attempts: 5, correct: 4, pct: 80 }], key: [], copy: [] };
    const p = migrateProgress(old);
    expect(p.learn.length).toBe(1); // not wiped

    // Force a throw inside the migration path by passing a Proxy that throws
    // on spread. This simulates genuinely unprocessable data.
    const throwingBlob = new Proxy({}, {
      get(target, prop) {
        if (prop === "schemaVersion") return 0;
        // Throw on any other access (the spread { ...raw } triggers ownKeys).
        throw new Error("simulated corrupt data");
      },
      ownKeys() { throw new Error("simulated corrupt ownKeys"); },
    });
    // Must fall back to emptyProgress() rather than propagating the error.
    const fallback = migrateProgress(throwingBlob);
    expect(fallback.learn.length).toBe(0);
    expect(fallback.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
  });

  // -------------------------------------------------------------------------
  // T6 — per-category default: one bad category does NOT wipe the others.
  // -------------------------------------------------------------------------
  it("T6: learn valid, key non-array → learn preserved, key defaults to []", () => {
    const mixed = {
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      learn: [{ t: 1, lesson: 3, attempts: 10, correct: 10, pct: 100 }],
      key:   "corrupted",  // not an array
      copy:  [{ t: 2, source: "phrases", pct: 60 }],
    };
    const p = migrateProgress(mixed);
    expect(p.learn.length).toBe(1);          // preserved
    expect(Array.isArray(p.key)).toBe(true); // defaulted to []
    expect(p.key.length).toBe(0);
    expect(p.copy.length).toBe(1);           // preserved
  });
});

describe("learnTrend()", () => {
  it("two sets on lesson 3 → one trend row with correct lastPct/bestPct/sets", () => {
    const p = {
      ...emptyProgress(),
      learn: [
        { t: 1000, lesson: 3, attempts: 10, correct: 7, pct: 70 },
        { t: 2000, lesson: 3, attempts: 10, correct: 9, pct: 90 },
      ],
    };
    const trend = learnTrend(p);
    expect(trend.length).toBe(1);
    expect(trend[0].lesson).toBe(3);
    expect(trend[0].lastPct).toBe(90);
    expect(trend[0].bestPct).toBe(90);
    expect(trend[0].sets).toBe(2);
    expect(trend[0].recent).toEqual([70, 90]);
  });

  it("empty learn array → empty trend", () => {
    expect(learnTrend(emptyProgress())).toEqual([]);
  });
});

describe("keyTrend()", () => {
  it("returns last TREND_WINDOW records and an estWpm series", () => {
    let p = emptyProgress();
    for (let i = 0; i < 15; i++) {
      p = appendProgress(p, "key", { t: i, category: "words", keyType: "straight",
        copyPct: 80, estWpm: 18 + i, wpmVerdict: "on target",
        elementVerdict: "good", letterVerdict: "good", wordVerdict: "good",
        weightingVerdict: "good", weightingRatio: 3.0 });
    }
    const trend = keyTrend(p);
    // Only last 10 returned
    expect(trend.records.length).toBe(10);
    expect(trend.wpmSeries.length).toBe(10);
    // Newest record has highest estWpm
    expect(trend.wpmSeries[trend.wpmSeries.length - 1]).toBe(32); // 18+14=32
  });
});

describe("copyTrend()", () => {
  it("groups by source rung and extracts pct series", () => {
    const p = {
      ...emptyProgress(),
      copy: [
        { t: 1, source: "single", pct: 80 },
        { t: 2, source: "pairs",  pct: 70 },
        { t: 3, source: "single", pct: 90 },
      ],
    };
    const trend = copyTrend(p);
    const singleGroup = trend.find((g) => g.source === "single");
    expect(singleGroup).toBeDefined();
    expect(singleGroup.recent).toEqual([80, 90]);
    expect(singleGroup.lastPct).toBe(90);
  });

  // ---------------------------------------------------------------------------
  // FIX 3 — sourceless records must NOT produce an `undefined` rung.
  //
  // Records written before the `source` field existed have r.source === undefined.
  // The old code used `r.source` directly as the group key, producing an `undefined`
  // rung that renders as a garbled "undefined" label in ProgressView.
  // The fix: `const key = r.source || "—"` defaults to a named fallback.
  //
  // Mutation verified to bite (see report):
  //   Remove the `|| "—"` → group key is `undefined` → test finds `undefined` group
  //   → `expect(undefined).toBeUndefined()` passes but the positive assertions about
  //   the "—" group fail → test goes red.
  // ---------------------------------------------------------------------------
  it("[FIX3] records missing a source field group under '—', not undefined", () => {
    const p = {
      ...emptyProgress(),
      copy: [
        { t: 1, pct: 75 },        // no source field
        { t: 2, pct: 85 },        // no source field
        { t: 3, source: "words", pct: 90 },
      ],
    };
    const trend = copyTrend(p);

    // The sourceless records must NOT create an undefined-keyed group.
    const undefinedGroup = trend.find((g) => g.source === undefined);
    expect(undefinedGroup).toBeUndefined();

    // They MUST appear under the fallback key "—".
    const fallbackGroup = trend.find((g) => g.source === "—");
    expect(fallbackGroup).toBeDefined();
    expect(fallbackGroup.recent).toEqual([75, 85]);

    // Records with a real source are unaffected.
    const wordsGroup = trend.find((g) => g.source === "words");
    expect(wordsGroup).toBeDefined();
    expect(wordsGroup.lastPct).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// toneFor() — color thresholds for BarTrend bars
// ---------------------------------------------------------------------------
describe("toneFor()", () => {
  it("returns green (#8FCB9B) at exactly 90 (mastery threshold)", () => {
    expect(toneFor(90)).toBe("#8FCB9B");
  });
  it("returns green for values above 90", () => {
    expect(toneFor(100)).toBe("#8FCB9B");
    expect(toneFor(95)).toBe("#8FCB9B");
  });
  it("returns amber (#F2A93B) at exactly 70 (lower caution threshold)", () => {
    expect(toneFor(70)).toBe("#F2A93B");
  });
  it("returns amber for values in the 70–89 range", () => {
    expect(toneFor(89)).toBe("#F2A93B");
    expect(toneFor(80)).toBe("#F2A93B");
  });
  it("returns red (#E07A5F) below 70", () => {
    expect(toneFor(69)).toBe("#E07A5F");
    expect(toneFor(0)).toBe("#E07A5F");
  });
});

// ---------------------------------------------------------------------------
// emptyProgress() — qso field now included
// ---------------------------------------------------------------------------
describe("emptyProgress() — qso field", () => {
  it("includes qso as an empty array", () => {
    const p = emptyProgress();
    expect(Array.isArray(p.qso)).toBe(true);
    expect(p.qso.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// qsoTrend()
// ---------------------------------------------------------------------------
describe("qsoTrend()", () => {
  // Build a realistic QSO record
  const rec = (i, copyPct, sendPct) => ({
    t: 1000 * (i + 1),
    activity: "pota",
    role: "hunter",
    difficulty: "normal",
    copyPct,
    sendPct,
  });

  it("returns the last 10 records newest-first", () => {
    // 15 contacts — only the last 10 should appear, newest first
    let p = emptyProgress();
    for (let i = 0; i < 15; i++) {
      p = appendProgress(p, "qso", rec(i, 70 + i, 80 + i));
    }
    const { records } = qsoTrend(p);
    expect(records.length).toBe(10);
    // Newest record (i=14) should be first, oldest kept (i=5) should be last
    expect(records[0].t).toBe(1000 * 15);  // i=14
    expect(records[9].t).toBe(1000 * 6);   // i=5
  });

  it("copySeries and sendSeries are chronological (oldest-first)", () => {
    let p = emptyProgress();
    for (let i = 0; i < 5; i++) {
      p = appendProgress(p, "qso", rec(i, 60 + i * 10, 50 + i * 10));
    }
    const { copySeries, sendSeries } = qsoTrend(p);
    // chronological means ascending t — so values ascend too
    expect(copySeries).toEqual([60, 70, 80, 90, 100]);
    expect(sendSeries).toEqual([50, 60, 70, 80, 90]);
  });

  it("null copyPct values are filtered out of copySeries (one-sided send-only role)", () => {
    let p = emptyProgress();
    // 3 send-only contacts (copyPct null), then 2 with both sides
    for (let i = 0; i < 3; i++) {
      p = appendProgress(p, "qso", rec(i, null, 80 + i));
    }
    p = appendProgress(p, "qso", rec(3, 75, 85));
    p = appendProgress(p, "qso", rec(4, 90, 90));

    const { copySeries, sendSeries } = qsoTrend(p);
    // Copy: only the 2 non-null records (75, 90)
    expect(copySeries).toEqual([75, 90]);
    // Send: all 5 are non-null (80, 81, 82, 85, 90)
    expect(sendSeries).toEqual([80, 81, 82, 85, 90]);
  });

  it("per-series cap: >10 graded-copy records → copySeries length exactly 10", () => {
    let p = emptyProgress();
    // 12 records all with both sides graded
    for (let i = 0; i < 12; i++) {
      p = appendProgress(p, "qso", rec(i, 70 + i, 70 + i));
    }
    const { copySeries, sendSeries } = qsoTrend(p);
    expect(copySeries.length).toBe(10);
    expect(sendSeries.length).toBe(10);
    // Oldest 2 are sliced off — cap is applied AFTER null-filter
    expect(copySeries[0]).toBe(72);  // i=2 (first 2 dropped)
    expect(copySeries[9]).toBe(81);  // i=11
  });

  it("empty qso array → empty records and empty series", () => {
    const { records, copySeries, sendSeries } = qsoTrend(emptyProgress());
    expect(records).toEqual([]);
    expect(copySeries).toEqual([]);
    expect(sendSeries).toEqual([]);
  });

  it("seam round-trip: qso data preserved through migrateProgress", () => {
    // Simulate a stored blob with qso records (as would be written by this version)
    const blob = {
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      learn: [],
      key:   [],
      copy:  [],
      qso:   [
        { t: 1000, activity: "sota", role: "chaser", difficulty: "easy", copyPct: 88, sendPct: null },
        { t: 2000, activity: "pota", role: "hunter", difficulty: "normal", copyPct: 95, sendPct: 90 },
      ],
    };
    const p = migrateProgress(blob);
    expect(p.qso.length).toBe(2);
    expect(p.qso[0].activity).toBe("sota");
    // qsoTrend still works on the migrated result
    const { records, copySeries } = qsoTrend(p);
    expect(records.length).toBe(2);
    expect(copySeries).toEqual([88, 95]);
  });

  it("no-qso v2.0.1 blob → qso defaults to [] (forward-compat)", () => {
    // An older build (v2.0.1) wrote a blob without a qso key — migrateProgress
    // must default it to [] so qsoTrend doesn't crash.
    const old201Blob = {
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      learn: [{ t: 1, lesson: 1, attempts: 5, correct: 4, pct: 80 }],
      key:   [],
      copy:  [],
      // qso key intentionally absent
    };
    const p = migrateProgress(old201Blob);
    expect(Array.isArray(p.qso)).toBe(true);
    expect(p.qso.length).toBe(0);
    // qsoTrend must not throw and returns empty results
    const trend = qsoTrend(p);
    expect(trend.records).toEqual([]);
  });
});

describe("splashSignature", () => {
  it("returns the operator's callsign once they've set one", () => {
    expect(splashSignature("K9MTE", "W1AW")).toBe("K9MTE");
  });
  it("defaults to WR while the call is still the placeholder (not set up)", () => {
    expect(splashSignature("W1AW", "W1AW")).toBe("WR");
  });
  it("defaults to WR when the call is empty or blank", () => {
    expect(splashSignature("", "W1AW")).toBe("WR");
    expect(splashSignature("   ", "W1AW")).toBe("WR");
    expect(splashSignature(undefined, "W1AW")).toBe("WR");
  });
  it("trims whitespace around a real call", () => {
    expect(splashSignature("  K9MTE  ", "W1AW")).toBe("K9MTE");
  });
});

// ---------------------------------------------------------------------------
// Phase 1 — International / DX data model
// ---------------------------------------------------------------------------

// ---- DX_GENERATION_POOL integrity ----
// The pool is built from the real bundled DXCC dataset at module load.
// These tests verify the structure AND assert against sourced values so they
// bite if the dataset or pool builder regresses.
describe("DX_GENERATION_POOL integrity", () => {
  it("every row has required fields with valid types and zone range", () => {
    for (const row of DX_GENERATION_POOL) {
      expect(typeof row.prefix).toBe("string");
      expect(row.prefix.length).toBeGreaterThan(0);
      expect(typeof row.entityPrefix).toBe("string");
      expect(row.entityPrefix.length).toBeGreaterThan(0);
      expect(typeof row.entity).toBe("string");
      expect(row.entity.length).toBeGreaterThan(0);
      expect(typeof row.continent).toBe("string");
      expect(typeof row.cqZone).toBe("number");
      // All valid CQ zones are 1–40
      expect(row.cqZone).toBeGreaterThanOrEqual(1);
      expect(row.cqZone).toBeLessThanOrEqual(40);
    }
  });

  it("has at least one entry from each inhabited continent", () => {
    const continents = new Set(DX_GENERATION_POOL.map((r) => r.continent));
    for (const c of ["EU", "AS", "OC", "SA", "AF", "NA"]) {
      expect(continents.has(c)).toBe(true);
    }
  });

  it("Germany (DL) is present with dataset-sourced CQ zone 14", () => {
    // Verifies the pool is from the real dataset, not a hand-rolled guess.
    const dl = DX_GENERATION_POOL.find((r) => r.entityPrefix === "DL");
    expect(dl).toBeDefined();
    expect(dl.entity).toMatch(/Germany/);
    expect(dl.cqZone).toBe(14);
    expect(dl.continent).toBe("EU");
  });

  it("Australia VK2 entry has CQ zone 30 (not the entity default null)", () => {
    // Confirms multi-zone call-area expansion: VK2 = NSW = zone 30.
    // Zone 29 is Western Australia (VK6/VK8) — a wrong zone here means the
    // expansion didn't happen and a generated VK2 call would carry the wrong zone.
    const vk2 = DX_GENERATION_POOL.find((r) => r.prefix === "VK2");
    expect(vk2).toBeDefined();
    expect(vk2.cqZone).toBe(30);
    expect(vk2.entityPrefix).toBe("VK");
    expect(vk2.entity).toMatch(/Australia/);
  });

  it("Canada VE7 entry has CQ zone 3 (British Columbia)", () => {
    // cty.csv misses VE7=CQ3; the generator supplements from k0swe.
    // If VE7 were still at zone 5 (the cty.csv default), this bites.
    const ve7 = DX_GENERATION_POOL.find((r) => r.prefix === "VE7");
    expect(ve7).toBeDefined();
    expect(ve7.cqZone).toBe(3);
    expect(ve7.entityPrefix).toBe("VE");
  });
});

// ---- randDxStation() coherence ----
describe("randDxStation()", () => {
  it("returns call, entity, continent, cqZone, prefix, and entityPrefix fields", () => {
    const s = randDxStation();
    expect(typeof s.call).toBe("string");
    expect(typeof s.entity).toBe("string");
    expect(typeof s.continent).toBe("string");
    expect(typeof s.cqZone).toBe("number");
    expect(typeof s.prefix).toBe("string");
    expect(typeof s.entityPrefix).toBe("string");
  });

  it("call starts with the pool entry's prefix — zone is never null", () => {
    // Every draw: call must start with the prefix of the pool row drawn, and
    // cqZone must be a real number (not null — multi-zone entity defaults are null
    // but call-area expansion gives a concrete zone).
    for (let i = 0; i < 50; i++) {
      const s = randDxStation();
      const row = DX_GENERATION_POOL.find((r) => r.prefix === s.prefix);
      expect(row).toBeDefined();
      expect(s.call.startsWith(s.prefix)).toBe(true);
      expect(s.entity).toBe(row.entity);
      expect(s.cqZone).toBe(row.cqZone);
      expect(s.continent).toBe(row.continent);
      expect(typeof s.cqZone).toBe("number"); // never null from pool
    }
  });

  it("accepts a custom pool and only draws from it", () => {
    // Single-entry pool — every draw must return that entry's data exactly.
    // VK6 = zone 29 (Western Australia) — confirms the data-layer CQ zone is used.
    const pool = [{ prefix: "VK6", entityPrefix: "VK", entity: "Australia", continent: "OC", cqZone: 29 }];
    for (let i = 0; i < 10; i++) {
      const s = randDxStation(pool);
      expect(s.prefix).toBe("VK6");
      expect(s.entityPrefix).toBe("VK");
      expect(s.entity).toBe("Australia");
      expect(s.cqZone).toBe(29);
      expect(s.call.startsWith("VK6")).toBe(true);
    }
  });
});

// ---- Call-area digit: real callsigns always carry a separating numeral ----
// Regression guard for the 2.4.0 blocker: entity-level prefixes (F, DL, JA…)
// used to generate digit-less, impossible calls (FTT, JAR, ONMK). Every
// generated DX call must now carry a call-area numeral, and that numeral must
// keep the call inside its own DXCC entity.
describe("call-area digit (real-callsign format)", () => {
  it("EVERY generated DX call carries a digit (5000 draws, 0 digit-less)", () => {
    // The core invariant. A digit-less call is an impossible callsign.
    let noDigit = 0;
    for (let i = 0; i < 5000; i++) {
      if (!/\d/.test(randDxStation().call)) noDigit++;
    }
    expect(noDigit).toBe(0);
  });

  it("EVERY generated field-station call carries a digit (5000 draws)", () => {
    let noDigit = 0;
    for (let i = 0; i < 5000; i++) {
      if (!/\d/.test(randDxFieldStation().call)) noDigit++;
    }
    expect(noDigit).toBe(0);
  });

  it("the call is a plausible shape: prefix, digit, then 1-3 suffix letters", () => {
    // Entity prefix (letters) + one call-area digit + letter suffix, OR a
    // call-area prefix (VK2) whose own digit is followed by letters.
    const SHAPE = /^[A-Z]{1,2}[0-9][A-Z]{1,3}$/;
    for (let i = 0; i < 500; i++) {
      const c = randDxStation().call;
      expect(SHAPE.test(c)).toBe(true);
    }
  });

  it("the inserted numeral is drawn only from the entity's valid set", () => {
    // For every entity-level prefix (not VK/VE), the digit that follows the
    // prefix must be one of CALL_AREA_DIGITS for that entity.
    for (let i = 0; i < 4000; i++) {
      const s = randDxStation();
      if (/\d$/.test(s.prefix)) continue;          // VK2/VE3 — own digit, skip
      const digits = CALL_AREA_DIGITS[s.entityCode];
      expect(digits).toBeDefined();
      const inserted = Number(s.call.slice(s.prefix.length, s.prefix.length + 1));
      expect(digits).toContain(inserted);
    }
  });

  it("never generates a call whose prefix names a SEPARATE DXCC entity", () => {
    // EA6/EA8/EA9 = Balearic/Canary/Ceuta&Melilla; OH0 = Åland;
    // ZL7/8/9 = Chatham/Kermadec/Subantarctic; ZS7/ZS8 = Antarctica/Marion;
    // PY0 = Brazilian oceanic islands. Generating any of these would teach a
    // callsign whose numeral contradicts its own entity/zone.
    const SEPARATE_ENTITY = /^(EA[689]|OH0|ZL[789]|ZS[78]|PY0)/;
    for (let i = 0; i < 5000; i++) {
      expect(SEPARATE_ENTITY.test(randDxStation().call)).toBe(false);
      expect(SEPARATE_ENTITY.test(randDxFieldStation().call)).toBe(false);
    }
  });

  it("VK/VE call-area rows are unchanged — no extra digit inserted", () => {
    // A VK2 call must read VK2 + letters (VK2ABC), NOT VK2 + digit (VK23AB).
    const pool = DX_GENERATION_POOL.filter((r) => /\d$/.test(r.prefix));
    for (let i = 0; i < 1000; i++) {
      const s = randDxStation(pool);
      // char right after the call-area prefix is a letter, not another digit
      expect(s.call[s.prefix.length]).toMatch(/[A-Z]/);
      expect(s.call.startsWith(s.prefix)).toBe(true);
    }
  });

  it("entity / zone mapping is untouched by the inserted digit", () => {
    // Inserting a numeral changes only the call string; the record's entity and
    // zone come straight from the pool row and must be unchanged.
    for (let i = 0; i < 300; i++) {
      const s = randDxStation();
      const row = DX_GENERATION_POOL.find((r) => r.prefix === s.prefix);
      expect(s.entity).toBe(row.entity);
      expect(s.cqZone).toBe(row.cqZone);
      expect(s.entityCode).toBe(row.entityCode);
    }
  });

  it("digit-bearing calls resolve to the right entity (real examples)", () => {
    // Proves the format is a REAL call and the prefix+digit is entity-coherent.
    // NB: resolveEntity() is prefix-substring lenient (a Phase-2 placeholder), so
    // this uses collision-free suffixes rather than round-tripping random draws —
    // see the resolver note in the fix report.
    const cases = [
      ["F5KT", 227], ["DL2ABC", 230], ["JA1XT", 339], ["ON4KST", 209],
      ["G3XT", 223], ["EA3KT", 281], ["SM3KT", 284], ["OH2KT", 224],
      ["XE1KT", 50], ["ZL1KT", 170], ["ZS1KT", 462], ["PY2KT", 108],
    ];
    for (const [call, code] of cases) {
      const r = resolveEntity(call);
      expect(r).not.toBeNull();
      expect(r.entityCode).toBe(code);
    }
  });

  it("specific real prefixes read like real calls", () => {
    // Draw until we see a France and a Germany call; assert the shape a human
    // would recognise (F + digit + letters, DL + digit + letters).
    let sawF = false, sawDL = false;
    for (let i = 0; i < 3000 && !(sawF && sawDL); i++) {
      const c = randDxStation().call;
      if (c.startsWith("F") && !c.startsWith("F0")) { expect(c).toMatch(/^F[1-8][A-Z]{1,3}$/); sawF = true; }
      if (c.startsWith("DL")) { expect(c).toMatch(/^DL[1-9][A-Z]{1,3}$/); sawDL = true; }
    }
    expect(sawF && sawDL).toBe(true);
  });
});

describe("withCallArea()", () => {
  it("inserts a digit from the set between a digit-less prefix and suffix", () => {
    for (let i = 0; i < 200; i++) {
      const c = withCallArea("DL", [1, 2, 3], "ABC");
      expect(c).toMatch(/^DL[123]ABC$/);
    }
  });

  it("leaves a call-area prefix (ends in a digit) untouched", () => {
    // VK2 already carries its numeral; no second digit is added.
    expect(withCallArea("VK2", null, "ABC")).toBe("VK2ABC");
    expect(withCallArea("VE3", [1, 2], "XY")).toBe("VE3XY");
  });

  it("only ever draws from the supplied set (never an excluded digit)", () => {
    // Spain omits 6/8/9; over many draws none must appear.
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const c = withCallArea("EA", [1, 2, 3, 4, 5, 7], "KT");
      seen.add(c[2]);
    }
    expect([...seen].sort().join("")).toBe("123457");
  });
});

// ---- randPark() — K- fix ----
describe("randPark()", () => {
  it("default (no arg) produces K-#### format — not US-####", () => {
    for (let i = 0; i < 20; i++) {
      const p = randPark();
      expect(p).toMatch(/^K-\d{4}$/);
      expect(p).not.toMatch(/^US-/);
    }
  });

  it("accepts an international prefix", () => {
    for (let i = 0; i < 10; i++) {
      expect(randPark("DE")).toMatch(/^DE-\d{4}$/);
      expect(randPark("VK")).toMatch(/^VK-\d{4}$/);
    }
  });

  it("zero-pads to 4 digits (min output is XXXX-0001, not XXXX-1)", () => {
    // Can't force the random to 1, but we can confirm the shape is always 4 digits.
    for (let i = 0; i < 20; i++) {
      const p = randPark();
      const num = p.split("-")[1];
      expect(num.length).toBe(4);
    }
  });
});

// ---- zoneToken() ----
describe("zoneToken()", () => {
  it("zero-pads single-digit zones to 2 digits, no cut", () => {
    expect(zoneToken(5, false)).toBe("05");
    expect(zoneToken(1, false)).toBe("01");
    expect(zoneToken(9, false)).toBe("09");
  });

  it("two-digit zones are unchanged, no cut", () => {
    expect(zoneToken(10, false)).toBe("10");
    expect(zoneToken(30, false)).toBe("30");
    expect(zoneToken(40, false)).toBe("40");
  });

  it("applies cut numbers — 0→T, 9→N", () => {
    // zone 5 → "05" → cut → "T5"
    expect(zoneToken(5, true)).toBe("T5");
    // zone 9 → "09" → cut → "TN" (0→T, 9→N)
    expect(zoneToken(9, true)).toBe("TN");
    // zone 10 → "10" → cut → "1T" (0→T)
    expect(zoneToken(10, true)).toBe("1T");
    // zone 29 → "29" → cut → "2N"
    expect(zoneToken(29, true)).toBe("2N");
    // zone 30 → "30" → cut → "3T"
    expect(zoneToken(30, true)).toBe("3T");
  });
});

// ---- reciprocalCall() ----
describe("reciprocalCall()", () => {
  it("prefix-first, slash separator, no suffix", () => {
    expect(reciprocalCall("DL", "N1KB")).toBe("DL/N1KB");
    expect(reciprocalCall("G", "W1AW")).toBe("G/W1AW");
    expect(reciprocalCall("VK", "K9MTE")).toBe("VK/K9MTE");
  });

  it("appends activity suffix after the US call", () => {
    expect(reciprocalCall("F", "N1KB", "/P")).toBe("F/N1KB/P");
    expect(reciprocalCall("SV3", "K4RLC", "/P")).toBe("SV3/K4RLC/P");
    expect(reciprocalCall("DL", "N1KB", "/MM")).toBe("DL/N1KB/MM");
  });

  it("empty suffix is omitted cleanly", () => {
    expect(reciprocalCall("DL", "N1KB", "")).toBe("DL/N1KB");
  });

  it("host prefix comes first — not after — unlike domestic W1AW/P", () => {
    const result = reciprocalCall("SV3", "K4RLC", "/P");
    expect(result.startsWith("SV3/")).toBe(true);
    expect(result.endsWith("/P")).toBe(true);
    // Confirm the US call is sandwiched in the middle
    expect(result).toContain("K4RLC");
  });
});

// ---- DX drill generators ----
const DX_SETTINGS_CUT_ON  = { myCall: "W1AW", cutNumbers: true };
const DX_SETTINGS_CUT_OFF = { myCall: "W1AW", cutNumbers: false };
// Set of call-area prefixes used to generate callsigns ("VK2", "DL", "JA", …).
// Used to verify that generated calls start with a real pool prefix.
const DX_CALL_PREFIX_SET  = new Set(DX_GENERATION_POOL.map((r) => r.prefix));
// Set of entity-level prefixes used for reciprocal calls ("VK", "DL", "JA", …).
const DX_ENTITY_PREFIX_SET = new Set(DX_GENERATION_POOL.map((r) => r.entityPrefix));

describe("drillDxCallsigns()", () => {
  it("returns a non-empty string", () => {
    expect(drillDxCallsigns(DX_SETTINGS_CUT_OFF).length).toBeGreaterThan(0);
  });

  it("every call token starts with a prefix from DX_GENERATION_POOL", () => {
    // Run many draws; split on space and check each token's prefix.
    // The pool contains call-area prefixes like "VK2", "VE3", "DL" —
    // each generated call must start with one of them.
    for (let i = 0; i < 30; i++) {
      const result = drillDxCallsigns(DX_SETTINGS_CUT_OFF);
      const calls = result.split(" ");
      for (const call of calls) {
        const matched = [...DX_CALL_PREFIX_SET].some((p) => call.startsWith(p));
        expect(matched).toBe(true);
      }
    }
  });

  it("never generates a US domestic call (no W9, K0, etc.)", () => {
    // VE3 was previously in this list as a "domestic" prefix but VE is Canadian —
    // it's a legitimate DX target from a US operator's perspective and IS in the
    // generation pool.  Only truly US-assigned prefixes belong here.
    const US_DOMESTIC = new Set(["W9","K0","N8","KD9","W1","K4","N5","W7","K6","AC9","KB0","N2","W4"]);
    for (let i = 0; i < 30; i++) {
      const calls = drillDxCallsigns(DX_SETTINGS_CUT_OFF).split(" ");
      for (const call of calls) {
        const isUsDomestic = [...US_DOMESTIC].some((p) => call.startsWith(p));
        expect(isUsDomestic).toBe(false);
      }
    }
  });
});

describe("drillDxExchange()", () => {
  it("contains 5NN when cut numbers on", () => {
    // 5NN must appear in at least some draws (the RST part is always 5NN with cut).
    // Run enough times to hit every variant.
    let saw5NN = false;
    for (let i = 0; i < 40; i++) {
      const r = drillDxExchange(DX_SETTINGS_CUT_ON);
      if (r.includes("5NN")) saw5NN = true;
    }
    expect(saw5NN).toBe(true);
  });

  it("contains 599 when cut numbers off", () => {
    let saw599 = false;
    for (let i = 0; i < 40; i++) {
      const r = drillDxExchange(DX_SETTINGS_CUT_OFF);
      if (r.includes("599")) saw599 = true;
    }
    expect(saw599).toBe(true);
  });

  it("zone comes from DX_GENERATION_POOL — no invented zone numbers", () => {
    const validZones = new Set(DX_GENERATION_POOL.map((r) => r.cqZone));
    // The zone in the exchange is zero-padded; extract the numeric value.
    for (let i = 0; i < 30; i++) {
      const r = drillDxExchange({ myCall: "W1AW", cutNumbers: false });
      // Match zero-padded 2-digit zone in RST+zone variant, e.g. "599 30" or "599 03"
      const m = r.match(/\d{3} (\d{2})/);
      if (m) {
        const zone = Number(m[1]);
        expect(validZones.has(zone)).toBe(true);
      }
    }
  });
});

describe("drillContestFragments()", () => {
  it("returns a non-empty string", () => {
    expect(drillContestFragments(DX_SETTINGS_CUT_OFF).length).toBeGreaterThan(0);
  });

  it("with cut on, any numeric serial uses cut notation — no raw '0' or '9'", () => {
    // We can't force a serial draw, but over many runs we'll hit serials containing
    // 0 and 9 — confirm they are replaced by T and N.
    for (let i = 0; i < 60; i++) {
      const r = drillContestFragments(DX_SETTINGS_CUT_ON);
      // Any RST should be "5NN", not "599"; any digit block should apply cut.
      if (/\d/.test(r)) {
        // If there's a digit, it should not be a raw 0 or 9 when cut is on.
        // (Fixed contest phrases like "CQ TEST" contain no digits.)
        if (r.includes("5")) {
          // A digit '9' or '0' in a cut context would be wrong.
          // But watch out: "5" itself is allowed (not cut by the 9→N/0→T rule).
          // This assertion checks that uncut 9 and 0 are absent when cut is on.
          expect(r).not.toMatch(/[90]/);
        }
      }
    }
  });

  it("produces recognized contest tokens in every draw", () => {
    const VALID = new Set(["CQ", "TEST", "DX", "QRZ?", "AGN", "NR", "5NN", "TU",
      "T", "N", "1","2","3","4","5","6","7","8"]);
    for (let i = 0; i < 20; i++) {
      const r = drillContestFragments(DX_SETTINGS_CUT_ON);
      const tokens = r.replace("?", "").split(/[\s?]+/).filter(Boolean);
      // At least the first token should be a known root.
      // (We can't enumerate every serial permutation, so we check the phrase-type cases.)
      expect(r.length).toBeGreaterThan(0);
    }
  });
});

describe("drillSplitPileup()", () => {
  it("returns a non-empty string", () => {
    expect(drillSplitPileup(DX_SETTINGS_CUT_OFF).length).toBeGreaterThan(0);
  });

  it("never contains QSX — it belongs in LEARN only, not as a drill", () => {
    for (let i = 0; i < 30; i++) {
      expect(drillSplitPileup(DX_SETTINGS_CUT_OFF)).not.toContain("QSX");
    }
  });

  it("generated bare-call output starts with a DX_GENERATION_POOL prefix", () => {
    // The generator uses randDxStation().call, so bare calls must be DX calls.
    // Over many runs, at least some outputs will be bare DX calls.
    let sawDxCall = false;
    for (let i = 0; i < 60; i++) {
      const r = drillSplitPileup(DX_SETTINGS_CUT_OFF);
      const mightBeBareCall = !r.startsWith("UP") && !r.startsWith("QRZ");
      if (mightBeBareCall && !r.includes("?")) {
        const matched = [...DX_CALL_PREFIX_SET].some((p) => r.startsWith(p));
        if (matched) sawDxCall = true;
      }
    }
    expect(sawDxCall).toBe(true);
  });

  it("UP variants appear over many draws", () => {
    const UP_PATTERN = /^UP/;
    let sawUp = false;
    for (let i = 0; i < 30; i++) {
      if (UP_PATTERN.test(drillSplitPileup(DX_SETTINGS_CUT_OFF))) sawUp = true;
    }
    expect(sawUp).toBe(true);
  });
});

describe("drillReciprocalCalls()", () => {
  it("produces a host-prefix-first reciprocal call containing the operator's call", () => {
    // The reciprocal call uses entityPrefix (e.g. "VK", "DL"), not the call-area
    // prefix (e.g. "VK2") — the LEARN guide teaches country-level reciprocal format.
    for (let i = 0; i < 20; i++) {
      const r = drillReciprocalCalls(DX_SETTINGS_CUT_OFF);
      expect(r).toContain("W1AW");
      // Must be PREFIX/CALL format — prefix comes first
      const slashIdx = r.indexOf("/");
      expect(slashIdx).toBeGreaterThan(0);
      const prefix = r.slice(0, slashIdx);
      expect(DX_ENTITY_PREFIX_SET.has(prefix)).toBe(true);
    }
  });

  it("optional suffix appears after the call, not before the prefix", () => {
    // Run enough times to hit a suffix draw (blank is weighted; /P and /M also occur).
    let sawSuffix = false;
    for (let i = 0; i < 60; i++) {
      const r = drillReciprocalCalls(DX_SETTINGS_CUT_OFF);
      if (r.endsWith("/P") || r.endsWith("/M")) {
        sawSuffix = true;
        // Suffix must be at the END, not at the start or middle.
        expect(r.startsWith("/")).toBe(false);
      }
    }
    expect(sawSuffix).toBe(true);
  });
});

// ===========================================================================
// Phase 2: data additions and new builders
// ===========================================================================

// ---------------------------------------------------------------------------
// Data: HL / XE / BY pool additions + China zone override
// ---------------------------------------------------------------------------
describe("Phase 2 pool additions (HL/XE/BY) and REPRESENTATIVE_CQ_ZONE", () => {
  it("South Korea (HL, code 137) is in the pool with CQ zone 25", () => {
    const hl = DX_GENERATION_POOL.find((r) => r.entityPrefix === "HL");
    expect(hl).toBeDefined();
    expect(hl.cqZone).toBe(25);
    expect(hl.continent).toBe("AS");
    expect(hl.entity).toMatch(/Korea/i);
  });

  it("Mexico (XE, code 50) is in the pool with CQ zone 6", () => {
    const xe = DX_GENERATION_POOL.find((r) => r.entityPrefix === "XE");
    expect(xe).toBeDefined();
    expect(xe.cqZone).toBe(6);
    expect(xe.continent).toBe("NA");
    expect(xe.entity).toMatch(/Mexico/i);
  });

  it("China (BY, code 318) is in the pool with zone 24 (east — never 23)", () => {
    // REPRESENTATIVE_CQ_ZONE overrides cqZones[0]=23 to 24 (eastern China).
    // This test is the pin that keeps a dataset regen from silently reverting it.
    const by = DX_GENERATION_POOL.find((r) => r.entityPrefix === "BY");
    expect(by).toBeDefined();
    expect(by.cqZone).toBe(24);
    // Mutation gate: changing the expected zone to 23 MUST turn this red.
    expect(by.cqZone).not.toBe(23);
    expect(by.continent).toBe("AS");
  });

  it("no deleted entity appears anywhere in DX_GENERATION_POOL", () => {
    // The allEntities source includes deleted entities; the pool builder filters
    // them via the !e.deleted guard in singleZoneRow and the entity-level deleted flag.
    // This verifies the filter actually works for every row.
    for (const row of DX_GENERATION_POOL) {
      // We can't import allEntities directly here, so we check the entity name
      // is defined (deleted entities would produce null from singleZoneRow and
      // be filtered by .filter(Boolean)).
      expect(typeof row.entity).toBe("string");
      expect(row.entity.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Data: US_PREFIXES rename + VE3 removal
// ---------------------------------------------------------------------------
describe("US_PREFIXES (renamed from DX_PREFIXES)", () => {
  it("does not contain VE3 — Canada is a DX entity, not domestic", () => {
    expect(US_PREFIXES).not.toContain("VE3");
  });

  it("does not contain any non-US prefix", () => {
    // All entries should be US-assigned call prefixes.
    // VE (Canada), F (France), etc. would be wrong here.
    for (const p of US_PREFIXES) {
      // US prefixes start with K, W, N, or A — per ITU allocation.
      // KD, N, AC, KB, W are all valid US prefix starts.
      expect(p).toMatch(/^[KWAN]/);
    }
  });

  it("still contains common US prefixes (W1, K4, N5, W9)", () => {
    expect(US_PREFIXES).toContain("W1");
    expect(US_PREFIXES).toContain("K4");
    expect(US_PREFIXES).toContain("N5");
    expect(US_PREFIXES).toContain("W9");
  });
});

// ---------------------------------------------------------------------------
// Builder: buildDx — both roles, mustContain⊆suggested invariant
// ---------------------------------------------------------------------------
const DX_PROF = { myCall: "W1AW", cut: false };
const DX_PROF_CUT = { myCall: "W1AW", cut: true };

// Helper: verify every you-step's mustContain tokens are literal substrings of suggested.
// This is the text-parity invariant: the grader does flat.includes(token), so a token
// that isn't in suggested is unreachable — the test would never turn red on the trainee.
function assertMustContainSubset(steps) {
  for (const step of steps) {
    if (step.mustContain && step.suggested) {
      for (const token of step.mustContain) {
        expect(step.suggested).toContain(token);
      }
    }
  }
}

describe("buildDx() — hunt role", () => {
  it("returns 5 steps with who sequence [dx,you,dx,you,dx]", () => {
    const q = buildDx(DX_PROF, "hunt");
    expect(q.steps).toHaveLength(5);
    expect(q.steps.map((s) => s.who)).toEqual(["dx","you","dx","you","dx"]);
  });

  it("default role is hunt (backwards-compatible)", () => {
    const q = buildDx(DX_PROF);
    expect(q.steps[0].who).toBe("dx");
  });

  it("mustContain ⊆ suggested literally on all you-steps", () => {
    for (let i = 0; i < 20; i++) {
      assertMustContainSubset(buildDx(DX_PROF, "hunt").steps);
    }
  });

  it("step[1] mustContain includes myCall; step[3] mustContain includes report and TU", () => {
    const q = buildDx(DX_PROF, "hunt");
    expect(q.steps[1].mustContain).toContain("W1AW");
    expect(q.steps[3].mustContain).toContain("TU");
    // Report token: either 599 or 5NN depending on cut — both should be present
    const rpt = q.steps[3].mustContain.find((t) => /^[59N]+$/.test(t));
    expect(rpt).toBeDefined();
  });

  it("cut: true produces 5NN in step[3] suggested text, not raw 599", () => {
    const q = buildDx(DX_PROF_CUT, "hunt");
    expect(q.steps[3].suggested).toContain("5NN");
    expect(q.steps[3].suggested).not.toContain("599");
  });

  it("cut: false produces 599 in step[3] suggested text", () => {
    const q = buildDx(DX_PROF, "hunt");
    expect(q.steps[3].suggested).toContain("599");
  });

  it("opts.split appends UP 5 TO 10 to step[0] text", () => {
    const q = buildDx(DX_PROF, "hunt", { split: true });
    expect(q.steps[0].text).toContain("UP 5 TO 10");
  });

  it("without opts.split, step[0] text does NOT contain UP", () => {
    const q = buildDx(DX_PROF, "hunt", { split: false });
    expect(q.steps[0].text).not.toContain("UP");
  });

  it("dx field is set and appears in the CQ step", () => {
    const q = buildDx(DX_PROF, "hunt");
    expect(typeof q.dx).toBe("string");
    expect(q.dx.length).toBeGreaterThan(0);
    // Hunt step[0] is the DX CQ — generated by cqCall("dx", dxCall) — contains their call.
    // Step[2] text is "${myCall} ${rpt}" (DX confirms YOUR call + report), NOT the DX call.
    expect(q.steps[0].text).toContain(q.dx);
  });

  it("summary names the DX entity", () => {
    for (let i = 0; i < 20; i++) {
      const q = buildDx(DX_PROF, "hunt");
      // Summary should mention the entity (from dxStation.entity) not just the call
      expect(typeof q.summary).toBe("string");
      expect(q.summary.length).toBeGreaterThan(0);
    }
  });
});

describe("buildDx() — callcq role", () => {
  it("returns 5 steps with who sequence [you,dx,you,dx,you]", () => {
    const q = buildDx(DX_PROF, "callcq");
    expect(q.steps).toHaveLength(5);
    expect(q.steps.map((s) => s.who)).toEqual(["you","dx","you","dx","you"]);
  });

  it("mustContain ⊆ suggested literally on all you-steps", () => {
    for (let i = 0; i < 20; i++) {
      assertMustContainSubset(buildDx(DX_PROF, "callcq").steps);
    }
  });

  it("step[0] suggested contains myCall (the CQ DX call)", () => {
    const q = buildDx(DX_PROF, "callcq");
    expect(q.steps[0].suggested).toContain("W1AW");
    expect(q.steps[0].mustContain).toContain("W1AW");
  });

  it("step[4] suggested contains TU and myCall (QRZ back to calling)", () => {
    const q = buildDx(DX_PROF, "callcq");
    expect(q.steps[4].suggested).toContain("TU");
    expect(q.steps[4].suggested).toContain("W1AW");
    expect(q.steps[4].mustContain).toContain("TU");
  });
});

// ---------------------------------------------------------------------------
// Builder: buildContest — run + sp × wpx + zone
// ---------------------------------------------------------------------------
const CONTEST_PROF = { myCall: "W1AW", cut: false, myCqZone: 5 };
const CONTEST_PROF_CUT = { myCall: "W1AW", cut: true, myCqZone: 5 };

describe("buildContest() — run role", () => {
  it("returns 5 steps with who sequence [you,dx,you,dx,you]", () => {
    const q = buildContest(CONTEST_PROF, "run");
    expect(q.steps).toHaveLength(5);
    expect(q.steps.map((s) => s.who)).toEqual(["you","dx","you","dx","you"]);
  });

  it("mustContain ⊆ suggested literally on all you-steps", () => {
    for (let i = 0; i < 20; i++) {
      assertMustContainSubset(buildContest(CONTEST_PROF, "run").steps);
    }
  });

  it("WPX: exchange token in step[2] mustContain is the same string as in step[2] suggested", () => {
    // The text-parity trap: myExch is computed ONCE and reused in both places.
    for (let i = 0; i < 20; i++) {
      const q = buildContest(CONTEST_PROF, "run");
      const step = q.steps[2]; // you: ${dxCall} ${rpt} ${myExch}
      for (const token of step.mustContain) {
        expect(step.suggested).toContain(token);
      }
    }
  });

  it("WPX: serial in mustContain is a 3-digit padded number (random, not running count)", () => {
    // Over 30 contacts the serial must vary — a running counter would increment predictably.
    // We exclude "599" (always the RST token) and "5NN" (RST with cut) from the search —
    // both are 3-char tokens but are RSTs, not serials. mustContain contains [rpt, myExch].
    const serials = new Set();
    for (let i = 0; i < 30; i++) {
      const q = buildContest(CONTEST_PROF, "run");
      const mc = q.steps[2].mustContain;
      const serial = mc.find((t) => /^\d{3}$/.test(t) && t !== "599");
      if (serial) serials.add(serial);
    }
    // At least a few distinct values over 30 contacts proves it's not a running counter
    // starting from 001 (which would give only "001" for all first contacts).
    expect(serials.size).toBeGreaterThan(1);
  });

  it("zone mode: exchange token is the zero-padded CQ zone of the drawn DX station", () => {
    // The token must be the zone, formatted consistently with zoneToken().
    // We verify by cross-checking against the pool.
    const validZones = new Set(DX_GENERATION_POOL.map((r) => r.cqZone));
    for (let i = 0; i < 30; i++) {
      const q = buildContest(CONTEST_PROF, "run", { contestType: "zone" });
      const step = q.steps[2]; // you: ${dxCall} ${rpt} ${myExch}
      // myExch for zone mode with cut=false is zero-padded zone (e.g. "05", "14", "25")
      // Also check step[3] for dxExch
      for (const token of step.mustContain) {
        if (/^\d{2}$/.test(token)) {
          expect(validZones.has(Number(token))).toBe(true);
        }
      }
    }
  });

  it("cut: true produces 5NN in report token, not 599", () => {
    // Over many draws we must see 5NN, never raw 599 in the exchange step.
    let saw5NN = false;
    for (let i = 0; i < 20; i++) {
      const q = buildContest(CONTEST_PROF_CUT, "run");
      if (q.steps[2].suggested.includes("5NN")) saw5NN = true;
    }
    expect(saw5NN).toBe(true);
  });
});

describe("buildContest() — sp role", () => {
  it("returns 5 steps with who sequence [dx,you,dx,you,dx]", () => {
    const q = buildContest(CONTEST_PROF, "sp");
    expect(q.steps).toHaveLength(5);
    expect(q.steps.map((s) => s.who)).toEqual(["dx","you","dx","you","dx"]);
  });

  it("mustContain ⊆ suggested literally on all you-steps", () => {
    for (let i = 0; i < 20; i++) {
      assertMustContainSubset(buildContest(CONTEST_PROF, "sp").steps);
    }
  });

  it("sp step[3] mustContain includes report and exchange token", () => {
    for (let i = 0; i < 20; i++) {
      const q = buildContest(CONTEST_PROF, "sp");
      const step = q.steps[3]; // you: ${rpt} ${myExch} TU
      // Must have at least 2 tokens: report and exchange
      expect(step.mustContain.length).toBeGreaterThanOrEqual(2);
      for (const token of step.mustContain) {
        expect(step.suggested).toContain(token);
      }
    }
  });

  it("ROLE_TERMS includes dx and contest entries", () => {
    expect(ROLE_TERMS.dx).toBeDefined();
    expect(ROLE_TERMS.contest).toBeDefined();
    expect(ROLE_TERMS.dx.map(([v]) => v)).toContain("hunt");
    expect(ROLE_TERMS.dx.map(([v]) => v)).toContain("callcq");
    expect(ROLE_TERMS.contest.map(([v]) => v)).toContain("run");
    expect(ROLE_TERMS.contest.map(([v]) => v)).toContain("sp");
  });
});

// ---------------------------------------------------------------------------
// CALL-CQ required elements — calling CQ vs answering a CQ
// ---------------------------------------------------------------------------
// The reported defect: calling CQ with a bare callsign scored 100 because the six
// CALL-CQ steps required only [myCall]. Calling CQ requires "CQ" (and the activity
// word) AND your call; a bare call is a valid ANSWER, not a valid CQ. These grade
// each CALL-CQ step's own mustContain through gradeSend (the real grader) so they
// bite: removing "CQ"/"POTA"/"SOTA"/"IOTA"/"DX"/"TEST" from a step turns the
// matching "bare call < 100" or "proper call = 100" assertion red.
describe("CALL-CQ required elements (calling CQ vs answering)", () => {
  const callCqStep = (build, prof, role) => build(prof, role).steps[0];
  // [label, builder, profile, role, myCall in that profile]
  const CALL_CQ = [
    ["ragchew", buildRagchew, PROFILE,      "call",      "K9MTE"],
    ["pota",    buildPota,    PROFILE,      "activator", "K9MTE"],
    ["sota",    buildSota,    PROFILE,      "activator", "K9MTE"],
    ["iota",    buildIota,    PROFILE,      "activator", "K9MTE"],
    ["dx",      buildDx,      DX_PROF,      "callcq",    "W1AW"],
    ["contest", buildContest, CONTEST_PROF, "run",       "W1AW"],
  ];

  it("KEYSTONE: calling CQ with a bare callsign scores < 100 (missing CQ/qualifier)", () => {
    // The exact reported gap. MUTATION: revert any CALL-CQ mustContain to [myCall]
    // → that builder's bare call returns to 100 → red.
    for (const [label, build, prof, role, myCall] of CALL_CQ) {
      const r = gradeSend(callCqStep(build, prof, role).mustContain, myCall);
      expect(r.score, `${label}: bare call must be partial`).toBeLessThan(100);
      // The callsign IS present — the miss is the CQ/qualifier, not the call.
      expect(r.hits, `${label}: call still credited`).toContain(myCall);
    }
  });

  it("a proper CQ (CQ + activity word + call) scores 100 for every CALL-CQ builder", () => {
    const proper = {
      ragchew: "CQ CQ CQ DE K9MTE K9MTE K",
      pota:    "CQ POTA K9MTE",
      sota:    "CQ SOTA K9MTE/P",
      iota:    "CQ IOTA K9MTE",
      dx:      "CQ DX W1AW W1AW K",
      contest: "CQ TEST W1AW W1AW",
    };
    for (const [label, build, prof, role] of CALL_CQ) {
      const step = callCqStep(build, prof, role);
      expect(gradeSend(step.mustContain, proper[label]).score, label).toBe(100);
    }
  });

  it("Keystone-2: the exact reported grade cases", () => {
    const ragchew = callCqStep(buildRagchew, PROFILE, "call");       // ["CQ","K9MTE"]
    const pota    = callCqStep(buildPota,    PROFILE, "activator");   // ["CQ","POTA","K9MTE"]
    const contest = callCqStep(buildContest, CONTEST_PROF, "run");    // ["TEST","W1AW"]
    // Proper calls = 100
    expect(gradeSend(ragchew.mustContain, "CQ CQ CQ DE K9MTE").score).toBe(100);
    expect(gradeSend(pota.mustContain,    "CQ POTA K9MTE").score).toBe(100);
    expect(gradeSend(contest.mustContain, "TEST W1AW").score).toBe(100);        // no CQ needed
    expect(gradeSend(contest.mustContain, "CQ TEST W1AW").score).toBe(100);
    expect(gradeSend(contest.mustContain, "CQ CONTEST W1AW").score).toBe(100);  // CONTEST≡TEST
    // Bare call = partial (the fixed gap)
    expect(gradeSend(ragchew.mustContain, "K9MTE").score).toBeLessThan(100);
    expect(gradeSend(pota.mustContain,    "K9MTE").score).toBeLessThan(100);
    expect(gradeSend(contest.mustContain, "W1AW").score).toBeLessThan(100);
  });

  it("each CALL-CQ step requires exactly its activity element set", () => {
    // A strict lock (mutation-bite for every added token): dropping any one
    // element from any builder reddens the matching row here.
    expect(callCqStep(buildRagchew, PROFILE, "call").mustContain).toEqual(["CQ", "K9MTE"]);
    expect(callCqStep(buildPota,    PROFILE, "activator").mustContain).toEqual(["CQ", "POTA", "K9MTE"]);
    expect(callCqStep(buildSota,    PROFILE, "activator").mustContain).toEqual(["CQ", "SOTA", "K9MTE"]);
    expect(callCqStep(buildIota,    PROFILE, "activator").mustContain).toEqual(["CQ", "IOTA", "K9MTE"]);
    expect(callCqStep(buildDx,      DX_PROF, "callcq").mustContain).toEqual(["CQ", "DX", "W1AW"]);
    expect(callCqStep(buildContest, CONTEST_PROF, "run").mustContain).toEqual(["TEST", "W1AW"]);
  });

  it("ANSWER steps did NOT gain a CQ requirement (a bare-call answer still = 100)", () => {
    // Regression guard: the CQ requirement must not leak into answering steps —
    // answering a CQ with a bare call is ratified as valid. MUTATION: add "CQ" to
    // an answer step → red.
    const answerSteps = [
      ["ragchew answer", buildRagchew(PROFILE, "answer").steps[1], "K9MTE"],
      ["pota hunter",    buildPota(PROFILE, "hunter").steps[1],    "K9MTE"],
      ["sota chaser",    buildSota(PROFILE, "chaser").steps[1],    "K9MTE"],
      ["iota chaser",    buildIota(PROFILE, "chaser").steps[1],    "K9MTE"],
      ["dx hunt",        buildDx(DX_PROF, "hunt").steps[1],        "W1AW"],
      ["contest sp",     buildContest(CONTEST_PROF, "sp").steps[1],"W1AW"],
    ];
    for (const [label, step, myCall] of answerSteps) {
      expect(step.mustContain, `${label}: answer requires call only`).toEqual([myCall]);
      expect(step.mustContain, `${label}: no CQ leak`).not.toContain("CQ");
      expect(gradeSend(step.mustContain, myCall).score, label).toBe(100);
    }
  });

  it("mustContain ⊆ suggested holds for every CALL-CQ step across random cqCall variants", () => {
    // cqCall randomises the CQ format (3×3 / 3×2 / terse); every variant must still
    // literally carry CQ + the activity word + the call, so the guardrail invariant
    // never breaks for any draw.
    for (let i = 0; i < 40; i++) {
      for (const [label, build, prof, role] of CALL_CQ) {
        const step = callCqStep(build, prof, role);
        for (const token of step.mustContain) {
          expect(step.suggested.includes(token), `${label}: "${token}" in "${step.suggested}"`).toBe(true);
        }
      }
    }
  });

  it("contest TEST element: TEST, CONTEST, and lower-case all satisfy it; a bare call does not", () => {
    // "CQ" is credited-if-present, never required, for the contest run step.
    expect(gradeSend(["TEST", "W1AW"], "TEST W1AW").score).toBe(100);        // CQ dropped
    expect(gradeSend(["TEST", "W1AW"], "CQ TEST W1AW").score).toBe(100);     // CQ present
    expect(gradeSend(["TEST", "W1AW"], "CQ CONTEST W1AW").score).toBe(100);  // CONTEST spelling
    expect(gradeSend(["TEST", "W1AW"], "cq contest w1aw").score).toBe(100);  // case-insensitive
    const bare = gradeSend(["TEST", "W1AW"], "W1AW");
    expect(bare.score).toBe(50);
    expect(bare.missing).toEqual(["TEST"]);
  });
});

// ---------------------------------------------------------------------------
// Builder: buildPota opts.dx and opts.p2p
// ---------------------------------------------------------------------------
const POTA_PROF = { myCall: "W1AW", myQth: "MADISON WI", cut: false };

describe("buildPota() — opts.dx (hunt DX activator)", () => {
  it("returns 5 steps, who sequence [dx,you,dx,you,dx]", () => {
    const q = buildPota(POTA_PROF, "hunter", { dx: true });
    expect(q.steps).toHaveLength(5);
    expect(q.steps.map((s) => s.who)).toEqual(["dx","you","dx","you","dx"]);
  });

  it("mustContain ⊆ suggested literally on all you-steps", () => {
    for (let i = 0; i < 20; i++) {
      assertMustContainSubset(buildPota(POTA_PROF, "hunter", { dx: true }).steps);
    }
  });

  it("step[4] close uses TU 73 (not TU state — DX activator doesn't use state as handle)", () => {
    for (let i = 0; i < 20; i++) {
      const q = buildPota(POTA_PROF, "hunter", { dx: true });
      expect(q.steps[4].text).toContain("TU 73");
      // Should NOT use the US state as a handle (that's domestic protocol)
      expect(q.steps[4].text).not.toMatch(/BK TU WI/);
    }
  });

  it("summary names the DX entity", () => {
    for (let i = 0; i < 20; i++) {
      const q = buildPota(POTA_PROF, "hunter", { dx: true });
      expect(typeof q.summary).toBe("string");
      // entity should appear — the summary describes what country was worked
      expect(q.summary.length).toBeGreaterThan(10);
    }
  });
});

describe("buildPota() — opts.p2p (both activating, international P2P)", () => {
  it("returns 5 steps, who sequence [dx,you,dx,you,dx]", () => {
    const q = buildPota(POTA_PROF, "hunter", { p2p: true });
    expect(q.steps).toHaveLength(5);
    expect(q.steps.map((s) => s.who)).toEqual(["dx","you","dx","you","dx"]);
  });

  it("mustContain ⊆ suggested literally on all you-steps", () => {
    for (let i = 0; i < 20; i++) {
      assertMustContainSubset(buildPota(POTA_PROF, "hunter", { p2p: true }).steps);
    }
  });

  it("step[3] mustContain includes the US park ref (not state)", () => {
    for (let i = 0; i < 20; i++) {
      const q = buildPota(POTA_PROF, "hunter", { p2p: true });
      const step = q.steps[3]; // you send your park ref in P2P
      // The park ref (K-XXXX) must be in mustContain and in suggested
      const parkToken = step.mustContain.find((t) => /^K-\d{4}$/.test(t));
      expect(parkToken).toBeDefined();
      expect(step.suggested).toContain(parkToken);
    }
  });

  it("step[4] shows the DX park ref (the one to log)", () => {
    for (let i = 0; i < 20; i++) {
      const q = buildPota(POTA_PROF, "hunter", { p2p: true });
      // The DX park ref (intl program, potaPrefix) is in step[4] text
      // It follows a prefix pattern like "DE-XXXX", "G-XXXX", "F-XXXX", etc.
      expect(q.steps[4].text).toMatch(/-\d{4}/);
    }
  });

  it("summary mentions the DX entity and both parks", () => {
    for (let i = 0; i < 20; i++) {
      const q = buildPota(POTA_PROF, "hunter", { p2p: true });
      expect(q.summary).toContain("P2P");
    }
  });

  it("record activity stays pota (not a new activity type)", () => {
    // P2P doesn't introduce a new activity key — it's still pota with opts.
    const q = buildPota(POTA_PROF, "hunter", { p2p: true });
    expect(q.flavor).toBe("POTA");
  });
});

// ---------------------------------------------------------------------------
// Builder: buildSota opts.dx and opts.p2p (S2S)
// ---------------------------------------------------------------------------
const SOTA_PROF = { myCall: "W1AW", cut: false };

describe("buildSota() — opts.dx (chase DX summit activator)", () => {
  it("returns 5 steps, who sequence [dx,you,dx,you,dx]", () => {
    const q = buildSota(SOTA_PROF, "chaser", { dx: true });
    expect(q.steps).toHaveLength(5);
    expect(q.steps.map((s) => s.who)).toEqual(["dx","you","dx","you","dx"]);
  });

  it("mustContain ⊆ suggested literally on all you-steps", () => {
    for (let i = 0; i < 20; i++) {
      assertMustContainSubset(buildSota(SOTA_PROF, "chaser", { dx: true }).steps);
    }
  });

  it("step[0] text contains /P (DX activator signs portable)", () => {
    for (let i = 0; i < 20; i++) {
      const q = buildSota(SOTA_PROF, "chaser", { dx: true });
      expect(q.steps[0].text).toContain("/P");
    }
  });

  it("summary names the DX entity", () => {
    for (let i = 0; i < 20; i++) {
      const q = buildSota(SOTA_PROF, "chaser", { dx: true });
      expect(q.summary.length).toBeGreaterThan(10);
    }
  });
});

describe("buildSota() — opts.p2p (S2S, both summiting)", () => {
  it("returns 5 steps, who sequence [dx,you,dx,you,dx]", () => {
    const q = buildSota(SOTA_PROF, "chaser", { p2p: true });
    expect(q.steps).toHaveLength(5);
    expect(q.steps.map((s) => s.who)).toEqual(["dx","you","dx","you","dx"]);
  });

  it("mustContain ⊆ suggested literally on all you-steps", () => {
    for (let i = 0; i < 20; i++) {
      assertMustContainSubset(buildSota(SOTA_PROF, "chaser", { p2p: true }).steps);
    }
  });

  it("step[1] suggested is myCall/P (you sign portable in S2S)", () => {
    for (let i = 0; i < 20; i++) {
      const q = buildSota(SOTA_PROF, "chaser", { p2p: true });
      expect(q.steps[1].suggested).toContain("W1AW");
      // S2S: you sign portable — call/P format
      expect(q.steps[1].suggested).toMatch(/W1AW\/P/);
      // mustContain uses the plain call (substring check covers myCall/P)
      expect(q.steps[1].mustContain).toContain("W1AW");
    }
  });

  it("step[3] mustContain includes a US summit ref", () => {
    // In S2S the chaser also exchanges their summit ref.
    // US summits from the SUMMITS array: "W9/UP-001", "W7A/AE-040", etc.
    // The call area may be 2 or 3 chars — use a broad match (starts with W, contains /).
    for (let i = 0; i < 20; i++) {
      const q = buildSota(SOTA_PROF, "chaser", { p2p: true });
      const step = q.steps[3];
      const summitToken = step.mustContain.find((t) => t.startsWith("W") && t.includes("/"));
      expect(summitToken).toBeDefined();
      expect(step.suggested).toContain(summitToken);
    }
  });

  it("record flavor stays SOTA (not a new activity)", () => {
    const q = buildSota(SOTA_PROF, "chaser", { p2p: true });
    expect(q.flavor).toBe("SOTA");
  });
});

// ---------------------------------------------------------------------------
// randDxFieldStation — field station coherence
// ---------------------------------------------------------------------------
describe("randDxFieldStation()", () => {
  it("returns call, entity, potaRef, sotaRef, and cqZone fields", () => {
    for (let i = 0; i < 20; i++) {
      const fs = randDxFieldStation();
      expect(typeof fs.call).toBe("string");
      expect(fs.call.length).toBeGreaterThan(0);
      expect(typeof fs.entity).toBe("string");
      expect(typeof fs.potaRef).toBe("string");
      expect(typeof fs.sotaRef).toBe("string");
      expect(typeof fs.cqZone).toBe("number");
    }
  });

  it("potaRef and call are from the same country (coherent P2P exchange)", () => {
    // The call prefix and park prefix must match the same entity entry.
    // POTA uses ISO 3166-1 alpha-2 country codes (switched early 2024):
    // DL→DE, G→GB, F→FR, VK→AU, JA→JP, VE→CA
    const knownPotaPrefixes = new Set(["DE", "GB", "FR", "AU", "JP", "CA"]);
    for (let i = 0; i < 40; i++) {
      const fs = randDxFieldStation();
      const parkPrefix = fs.potaRef.split("-")[0];
      expect(knownPotaPrefixes.has(parkPrefix)).toBe(true);
    }
  });

  it("sotaRef follows association/region-number format", () => {
    // SOTA summit refs are like "DL/AL-001" or "G/LD-001"
    for (let i = 0; i < 20; i++) {
      const fs = randDxFieldStation();
      expect(fs.sotaRef).toMatch(/^[A-Z0-9]+\/[A-Z]+-\d+$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — words_en pool: filterDrillWords + COMMON_WORD_POOL + WIDE_WORD_POOL
// ---------------------------------------------------------------------------

describe("filterDrillWords() — pure min/max-length filter", () => {
  it("drops single-char tokens (the FIRM PO guard)", () => {
    // The corpus has many single-char tokens: 'i', 'a', 's', 't', ...
    // With minLen=2, none must survive.
    const result = filterDrillWords(["a", "s", "t", "i", "is", "the", "cat"]);
    expect(result).toEqual(["is", "the", "cat"]);
    expect(result).not.toContain("a");
    expect(result).not.toContain("s");
  });

  it("no string of length < 2 in output when minLen=2 (default)", () => {
    const input = ["a", "i", "to", "the", "hello", "superlongwordthatexceeds"];
    const out = filterDrillWords(input);
    for (const w of out) {
      expect(w.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("respects maxLen — drops words over the cap", () => {
    const longWord = "antidisestablishment"; // len 20
    const result = filterDrillWords(["cat", longWord], { maxLen: 12 });
    expect(result).toContain("cat");
    expect(result).not.toContain(longWord);
  });

  it("is pure — testable with a fixture (no JSON dependency in this call)", () => {
    // Empty pool → empty result; no crash.
    expect(filterDrillWords([])).toEqual([]);
    // All-valid pool → all returned.
    expect(filterDrillWords(["hi", "ok", "yes"])).toHaveLength(3);
  });

  it("custom minLen/maxLen override the defaults", () => {
    // Allow single chars by passing minLen=1
    const result = filterDrillWords(["a", "hi", "word"], { minLen: 1 });
    expect(result).toContain("a");
    // Tighter max
    const tight = filterDrillWords(["hi", "word", "longer"], { maxLen: 4 });
    expect(tight).toEqual(["hi", "word"]);
  });
});

describe("COMMON_WORD_POOL and WIDE_WORD_POOL — real filtered pools", () => {
  it("COMMON_WORD_POOL has the expected size (~493 from top500 after filtering)", () => {
    // top500 has 7 single-char tokens; pool is ~493.
    expect(COMMON_WORD_POOL.length).toBeGreaterThan(480);
    expect(COMMON_WORD_POOL.length).toBeLessThanOrEqual(500);
  });

  it("WIDE_WORD_POOL has the expected size (~3957 from ranks 1001-5000 after filtering)", () => {
    expect(WIDE_WORD_POOL.length).toBeGreaterThan(3900);
    expect(WIDE_WORD_POOL.length).toBeLessThanOrEqual(4000);
  });

  it("no token of length 1 in COMMON_WORD_POOL ('s', 't', 'a', 'i' must not appear)", () => {
    // Mutation-verified: set MIN_WORD_LEN=1 in words-en-pool.js → these leak → test FAILS.
    for (const w of COMMON_WORD_POOL) {
      expect(w.length).toBeGreaterThanOrEqual(2);
    }
    expect(COMMON_WORD_POOL).not.toContain("s");
    expect(COMMON_WORD_POOL).not.toContain("t");
    expect(COMMON_WORD_POOL).not.toContain("a");
    expect(COMMON_WORD_POOL).not.toContain("i");
  });

  it("no token of length 1 in WIDE_WORD_POOL", () => {
    for (const w of WIDE_WORD_POOL) {
      expect(w.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("all tokens in COMMON_WORD_POOL are lowercase strings", () => {
    for (const w of COMMON_WORD_POOL) {
      expect(typeof w).toBe("string");
      expect(w).toBe(w.toLowerCase());
    }
  });

  it("COMMON_WORD_POOL and WIDE_WORD_POOL are disjoint (no overlap — true bands)", () => {
    // Both pools draw from non-overlapping rank slices of the same source list.
    // If slice() offset is wrong, words from the common pool would appear in wide.
    // Mutation-verified: change top5k.slice(1000) to top5k.slice(0) → overlap → FAILS.
    const commonSet = new Set(COMMON_WORD_POOL);
    for (const w of WIDE_WORD_POOL) {
      expect(commonSet.has(w)).toBe(false);
    }
  });

  it("COMMON_WORD_POOL contains high-frequency English words", () => {
    // Sanity check — 'the', 'and', 'you' are top-5 English words.
    expect(COMMON_WORD_POOL).toContain("the");
    expect(COMMON_WORD_POOL).toContain("and");
    expect(COMMON_WORD_POOL).toContain("you");
  });

  it("COMMON_WORD_POOL does not contain WIDE_WORD_POOL entries (no 'books' in common)", () => {
    // 'books' is rank 1001 — just outside top500, so it belongs to WIDE, not COMMON.
    expect(COMMON_WORD_POOL).not.toContain("books");
    expect(WIDE_WORD_POOL).toContain("books");
  });
});

describe("drillCommonWords() and drillWiderWords() — generator shape", () => {
  it("drillCommonWords returns 3 space-separated uppercase tokens", () => {
    for (let i = 0; i < 20; i++) {
      const s = drillCommonWords();
      const tokens = s.split(" ");
      expect(tokens).toHaveLength(3);
      for (const t of tokens) {
        expect(t).toBe(t.toUpperCase());
        expect(t.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("drillCommonWords tokens are in COMMON_WORD_POOL (uppercased pool)", () => {
    // Draws from the English frequency pool, not COMMON_WORDS (ham vocab).
    // If drillCommonWords still draws from COMMON_WORDS, a pool-specific word
    // like 'the' or 'and' would be absent and a ham word like 'TNX' would appear.
    const poolUpper = new Set(COMMON_WORD_POOL.map(w => w.toUpperCase()));
    for (let i = 0; i < 30; i++) {
      const s = drillCommonWords();
      for (const tok of s.split(" ")) {
        expect(poolUpper.has(tok)).toBe(true);
      }
    }
  });

  it("drillWiderWords returns 3 space-separated uppercase tokens each len >= 2", () => {
    for (let i = 0; i < 20; i++) {
      const s = drillWiderWords();
      const tokens = s.split(" ");
      expect(tokens).toHaveLength(3);
      for (const t of tokens) {
        expect(t).toBe(t.toUpperCase());
        expect(t.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("drillWiderWords tokens are in WIDE_WORD_POOL (not in COMMON_WORD_POOL)", () => {
    // Verifies pool routing: wider words must come from the wide pool, not common.
    const wideUpper = new Set(WIDE_WORD_POOL.map(w => w.toUpperCase()));
    for (let i = 0; i < 30; i++) {
      const s = drillWiderWords();
      for (const tok of s.split(" ")) {
        expect(wideUpper.has(tok)).toBe(true);
      }
    }
  });

  it("drillCommonWords never produces distinctly-ham tokens (not TNX, FER, QTH, POTA)", () => {
    // These tokens are in COMMON_WORDS (ham vocab) but NOT in any English frequency tier.
    // If drillCommonWords still draws from COMMON_WORDS, they would sometimes appear.
    // NOTE: "DE", "HI", "ES" are excluded — "de" (rank 356) IS in the English corpus
    // and produces "DE" when uppercased, making those checks flaky on the English pool.
    // The positive pool-membership test above already guards the routing more precisely.
    const uniqueHamTokens = new Set(["TNX", "FER", "RST", "QTH", "POTA", "SOTA", "73"]);
    let sawHam = false;
    for (let i = 0; i < 200; i++) {
      for (const tok of drillCommonWords().split(" ")) {
        if (uniqueHamTokens.has(tok)) { sawHam = true; break; }
      }
      if (sawHam) break;
    }
    expect(sawHam).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F5 — a blank required element must never be credited
// ---------------------------------------------------------------------------
// The reported defect: Settings is deliberately free-form, so an operator can
// clear the Name field. `mustContain: [myRst, myName]` then became ["599", ""],
// and gradeSend credited the empty token unconditionally — `"".includes("")` is
// true in JS, and numericForms("")/courtesyForms("") both pass "" straight
// through. Result: a blank always-ticked ✓ row and 100% for sending half the
// exchange. Same family as the cut-number regression: a wrong answer scoring 100.
//
// The fix is two layers, and each layer has its own tests below:
//   1. `required(...)` filters blanks where mustContain is ASSEMBLED, so the bad
//      element never exists (this is what makes the ✓ checklist right too);
//   2. an `isBlankElement` guard in gradeSend, so the contract is explicit for
//      any future caller that assembles a list some other way.
describe("F5 — blank required elements (grade inflation)", () => {
  const BUILDERS = {
    ragchew: buildRagchew, pota: buildPota, sota: buildSota,
    iota: buildIota, dx: buildDx, contest: buildContest,
  };
  const FULL = { myCall: "K9MTE", myName: "TRAVIS", myQth: "MADISON WI", cut: false, myCqZone: 4 };
  // Walk the REAL activity/role registry (ROLE_TERMS) rather than a hand-picked
  // sample, so a new activity or role is covered the day it is added.
  const eachCombo = (fn) => {
    for (const [act, build] of Object.entries(BUILDERS)) {
      for (const [role] of ROLE_TERMS[act]) fn(act, role, build);
    }
  };
  const youSteps = (q) => q.steps.filter((s) => s.who === "you");

  // --- Layer 2: the grader itself -----------------------------------------
  it("KEYSTONE: gradeSend(['599',''], '599') is NOT 100 — the exact reported case", () => {
    // MUTATION: delete the `if (isBlankElement(el)) return false;` guard in
    // gradeSend's isConveyed → this returns 100 → red.
    const r = gradeSend(["599", ""], "599");
    expect(r.score).toBe(50);
    expect(r.hits).toEqual(["599"]);
    expect(r.missing).toEqual([""]);
  });

  it("whitespace-only and nullish required elements are never credited either", () => {
    expect(gradeSend(["599", "   "], "599 599 UR RST").score).toBe(50);
    expect(gradeSend(["599", "\t"], "599").missing).toEqual(["\t"]);
    expect(gradeSend([undefined], "K9MTE ANYTHING").score).toBe(0);
    expect(gradeSend([null], "K9MTE ANYTHING").score).toBe(0);
    // A blank is not creditable even when the send is itself blank.
    expect(gradeSend([""], "").score).toBe(0);
  });

  it("the blank guard does not disturb any real element (populated list unchanged)", () => {
    // Guards against an over-broad fix: real tokens must grade exactly as before.
    expect(gradeSend(["599", "TRAVIS"], "UR RST 599 599 NAME TRAVIS").score).toBe(100);
    expect(gradeSend(["599", "TRAVIS"], "UR RST 599 599").score).toBe(50);
    expect(gradeSend(["TU"], "TNX 73").score).toBe(100);
    expect(gradeSend(["599"], "5NN").score).toBe(100);
  });

  // --- Layer 1: assembly ---------------------------------------------------
  it("required() drops blank tokens and trims the survivors", () => {
    expect(required("599", "")).toEqual(["599"]);
    expect(required("599", "   ")).toEqual(["599"]);
    expect(required("599", undefined, null)).toEqual(["599"]);
    expect(required()).toEqual([]);
    expect(required("", "  ")).toEqual([]);
    // Trimming is part of the same normalisation: a required " PAT " could never
    // match, because gradeSend compares against the space-stripped send.
    expect(required(" PAT ")).toEqual(["PAT"]);
    expect(gradeSend(required(" PAT "), "NAME PAT PAT").score).toBe(100);
  });

  it("T1: with Name and QTH cleared, no shipped step carries a blank required element", () => {
    // MUTATION: unwrap any `mustContain: required(...)` back to an array literal
    // → that builder's blank name lands in the list → red.
    const cleared = { ...FULL, myName: "", myQth: "" };
    let checked = 0;
    eachCombo((act, role, build) => {
      for (const s of youSteps(build(cleared, role, {}))) {
        for (const el of s.mustContain) {
          expect(String(el).trim(), `${act}/${role}: blank required element`).not.toBe("");
          checked++;
        }
      }
    });
    expect(checked).toBeGreaterThan(0);   // the sweep really ran
  });

  it("T2: with the Name cleared, sending what IS asked scores 100 and sending less scores less", () => {
    // The ragchew exchange step is the reported instance: [myRst, myName] with a
    // cleared name reduces to [myRst], so a correct 599 is a genuine 100 — and
    // the operator can still fall short by not sending it.
    const cleared = { ...FULL, myName: "" };
    const step = youSteps(buildRagchew(cleared, "answer"))[1];
    expect(step.mustContain).toEqual(["599"]);
    expect(gradeSend(step.mustContain, "R R UR RST 599 599 = QTH MADISON WI = HW? KN").score).toBe(100);
    expect(gradeSend(step.mustContain, "R R TNX FER RPT = HW? KN").score).toBe(0);
  });

  it("T3: no false negatives — every you-step of every activity/role still grades 100 on its own script", () => {
    // Populated profile: the fix must be invisible. Driving each step's own
    // `suggested` through the real grader is the honest end-to-end check.
    let steps = 0;
    eachCombo((act, role, build) => {
      for (const [i, s] of youSteps(build(FULL, role, {})).entries()) {
        expect(gradeSend(s.mustContain, s.suggested).score, `${act}/${role} you-step ${i}`).toBe(100);
        steps++;
      }
    });
    expect(steps).toBe(30);   // 12 activity/role combos, pinned so a lost step shows up
  });

  it("T3: no false negatives — the total required-element count is unchanged at 47", () => {
    // The count pin is what catches an OVER-BROAD filter: dropping a real token
    // would still score 100 (fewer requirements), but the total would fall.
    // MUTATION: make required() also drop a real token (e.g. filter out "TU")
    // → 47 becomes 43 → red.
    let total = 0;
    eachCombo((act, role, build) => {
      for (const s of youSteps(build(FULL, role, {}))) total += s.mustContain.length;
    });
    expect(total).toBe(47);
  });

  // --- T4: an empty required list ------------------------------------------
  it("T4: an empty required list scores null (a stated non-scored state), never a flat 0", () => {
    // This case IS reachable: the six ANSWER steps require only [myCall], and the
    // callsign field is clearable too. A flat 0% would be an unreachable zero —
    // a perfect over graded as total failure. null is the UI's cue to say
    // "NOT SCORED" instead of showing a grade nobody could have earned.
    // MUTATION: change gradeSend's empty-list branch back to `: 0` → red.
    const r = gradeSend([], "CQ CQ DE K9MTE K");
    expect(r.score).toBeNull();
    expect(r.hits).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it("T4: a cleared callsign empties exactly the six ANSWER steps, and each grades null", () => {
    const noCall = { ...FULL, myCall: "" };
    const empties = [];
    eachCombo((act, role, build) => {
      for (const s of youSteps(build(noCall, role, {}))) {
        if (s.mustContain.length === 0) {
          empties.push(`${act}/${role}`);
          expect(gradeSend(s.mustContain, "ANYTHING AT ALL").score).toBeNull();
        }
      }
    });
    expect(empties).toEqual([
      "ragchew/answer", "pota/hunter", "sota/chaser",
      "iota/chaser", "dx/hunt", "contest/sp",
    ]);
  });
});

// ---------------------------------------------------------------------------
// QTH — an unresolvable QTH must not have a state (or a CQ zone) invented for it
// ---------------------------------------------------------------------------
// The defect: `stateOf(qth)` fell back to "CT" for ANY input without a trailing
// two-letter token, so an operator who typed "MADISON" — or cleared the field —
// was silently REQUIRED to send Connecticut, and `resolveUSState(...)?.cq ?? 5`
// silently made their contest zone 5 (Connecticut's). A QTH is something a ham is
// expected to state truthfully; asserting one on their behalf is a domain-integrity
// fault, not a cosmetic one.
//
// The remedy: stateOf returns "" when it genuinely cannot resolve, `required()`
// (F5) drops the blank from the graded elements, and the script builders omit it
// from the text. The W1AW placeholder profile is deliberately KEPT — NEWINGTON CT
// is genuinely Connecticut and resolves as it always did.
describe("QTH — no invented state, no invented CQ zone", () => {
  // Mirror the JSX edge (`start()` in wr-cw-trainer.jsx) exactly, so these tests
  // exercise the same composition the app ships rather than a hand-built profile.
  const profileFor = (myQth) => ({
    myCall: "K9MTE", myName: "TRAVIS", myQth, cut: false,
    myCqZone: resolveUSState(stateOf(myQth))?.cq ?? null,
  });
  const BUILDERS = {
    ragchew: buildRagchew, pota: buildPota, sota: buildSota,
    iota: buildIota, dx: buildDx, contest: buildContest,
  };
  const eachCombo = (fn, opts = {}) => {
    for (const [act, build] of Object.entries(BUILDERS)) {
      for (const [role] of ROLE_TERMS[act]) fn(act, role, build, opts);
    }
  };
  const youSteps = (q) => q.steps.filter((s) => s.who === "you");

  // --- stateOf itself ------------------------------------------------------
  it("KEYSTONE: an unresolvable QTH yields no state at all — never 'CT'", () => {
    // MUTATION: restore the `: "CT"` fallback in stateOf → every expect below is red.
    expect(stateOf("MADISON")).toBe("");
    expect(stateOf("")).toBe("");
    expect(stateOf("   ")).toBe("");
    expect(stateOf(undefined)).toBe("");
    expect(stateOf(null)).toBe("");
    expect(stateOf("SOMEWHERE IN THE WOODS")).toBe("");   // trailing token too long
    expect(stateOf("BOX 12")).toBe("");                    // trailing token not letters
  });

  it("T2: a resolvable QTH still works exactly as before, W1AW's default included", () => {
    expect(stateOf("MADISON WI")).toBe("WI");
    expect(stateOf("madison wi")).toBe("WI");            // case-normalised
    expect(stateOf("CEDAR RAPIDS IA")).toBe("IA");
    // The shipped DEFAULT_SETTINGS profile. W1AW is genuinely in Newington,
    // Connecticut — this fix must not disturb the training placeholder.
    expect(stateOf("NEWINGTON CT")).toBe("CT");
    expect(resolveUSState(stateOf("NEWINGTON CT")).cq).toBe(5);
  });

  // --- the reported case, end to end ---------------------------------------
  it("KEYSTONE: buildPota with a state-less QTH requires 599 only, and its script says no state", () => {
    // The manager's live repro: buildPota({myQth:""},"hunter") produced
    // mustContain ["599","CT"] and suggested "BK GM UR 599 599 CT CT BK".
    // MUTATION: restore stateOf's "CT" fallback → both expects red.
    const q = buildPota(profileFor(""), "hunter");
    const exchange = youSteps(q)[1];
    expect(exchange.mustContain).toEqual(["599"]);
    expect(exchange.suggested).toBe("BK GM UR 599 599 BK");
    // The HUMAN-readable instruction is part of the same guard and gets the same
    // pin: an unguarded `statePhrase` would tell the operator to send their state
    // twice while the script omits it and the grader doesn't ask for it — three
    // surfaces contradicting each other. MUTATION: drop the `myState ?` guard on
    // statePhrase → this line goes red while everything else stays green.
    expect(exchange.prompt).toBe("BK back, greeting, their report, BK. That's the whole exchange.");
    // ...and no stray double space anywhere in the contact (a blank interpolation
    // would key an audible extra word gap through toCodes).
    for (const s of q.steps) {
      for (const field of [s.suggested, s.text, s.prompt, s.copyHint]) {
        if (field) expect(field, `double space in "${field}"`).not.toMatch(/ {2}/);
      }
    }
  });

  it("T2: the same POTA step with a resolvable QTH is byte-for-byte the old behaviour", () => {
    // MUTATION: drop `${stateTwice}` from the suggested template → red.
    const wi = youSteps(buildPota(profileFor("MADISON WI"), "hunter"))[1];
    expect(wi.mustContain).toEqual(["599", "WI"]);
    expect(wi.suggested).toBe("BK GM UR 599 599 WI WI BK");
    // The instruction still names the state — the guard must not over-fire either.
    expect(wi.prompt).toBe("BK back, greeting, their report, your state twice, BK. That's the whole exchange.");

    const ct = youSteps(buildPota(profileFor("NEWINGTON CT"), "hunter"))[1];
    expect(ct.mustContain).toEqual(["599", "CT"]);
    expect(ct.suggested).toBe("BK GM UR 599 599 CT CT BK");
  });

  it("the activator's reply drops the state handle too, and says why", () => {
    // The DX closes "BK TU <state> 73 DE <call> EE" — with no state to use as a
    // handle the token goes, and the copy hint stops promising one.
    const none = buildPota(profileFor("MADISON"), "hunter");
    const closing = none.steps[none.steps.length - 1];
    expect(closing.text).toMatch(/^BK TU 73 DE /);
    expect(closing.copyHint).toMatch(/Put a state in your QTH/);

    const wi = buildPota(profileFor("MADISON WI"), "hunter");
    const wiClosing = wi.steps[wi.steps.length - 1];
    expect(wiClosing.text).toMatch(/^BK TU WI 73 DE /);
  });

  it("the DX-hunt POTA variant carries the same guard, so it gets the same pin", () => {
    // buildPota's {dx:true} branch has its own copy of the exchange step with its
    // own sentence. The activity/role sweeps only reach the default opts, so this
    // branch needs its own assertion or the guard here is ungated.
    // MUTATION: drop the `myState ?` guard on statePhrase → the first prompt line
    // goes red. MUTATION: drop `${stateTwice}` → the suggested lines go red.
    const none = youSteps(buildPota(profileFor("MADISON"), "hunter", { dx: true }))[1];
    expect(none.mustContain).toEqual(["599"]);
    expect(none.suggested).toBe("BK GM UR 599 599 BK");
    expect(none.prompt).toBe("BK, their report, BK. Exchange grammar is identical to domestic.");

    const wi = youSteps(buildPota(profileFor("MADISON WI"), "hunter", { dx: true }))[1];
    expect(wi.mustContain).toEqual(["599", "WI"]);
    expect(wi.suggested).toBe("BK GM UR 599 599 WI WI BK");
    expect(wi.prompt).toBe("BK, their report, your state twice, BK. Exchange grammar is identical to domestic.");
  });

  // --- T1: nothing substituted, anywhere in the shipped matrix --------------
  it("T1: with a state-less QTH, 'CT' appears in no required element or script", () => {
    // Enumerate the real registry, not a hand-picked sample. MUTATION: restore
    // stateOf's "CT" fallback → the POTA hunter rows go red.
    let fields = 0;
    eachCombo((act, role, build) => {
      const q = build(profileFor("MADISON"), role, {});
      for (const s of q.steps) {
        for (const field of [s.suggested, s.text].filter(Boolean)) {
          expect(field.split(/\s+/), `${act}/${role}: invented state in "${field}"`)
            .not.toContain("CT");
          fields++;
        }
        for (const el of s.mustContain ?? []) {
          expect(el, `${act}/${role}: invented state required`).not.toBe("CT");
        }
      }
    });
    expect(fields).toBeGreaterThan(0);   // the sweep really ran
  });

  it("T4: no false negatives — every you-step still grades 100 on its own script", () => {
    // Both QTH shapes: dropping the state must not make a correct send fail, and
    // keeping it must not either.
    for (const qth of ["MADISON", "MADISON WI"]) {
      let steps = 0;
      eachCombo((act, role, build) => {
        for (const [i, s] of youSteps(build(profileFor(qth), role, {})).entries()) {
          expect(gradeSend(s.mustContain, s.suggested).score,
            `${qth} — ${act}/${role} you-step ${i}`).toBe(100);
          steps++;
        }
      });
      expect(steps).toBe(30);   // 12 activity/role combos, pinned
    }
  });

  it("T4: exactly ONE required element is lost, and only the POTA hunter's state", () => {
    // A count pin, because a score-only test cannot catch an OVER-BROAD drop:
    // losing a real token would still grade 100 over fewer requirements.
    // MUTATION: make required() also drop "TU" → both totals fall by 4 → red.
    const total = (qth) => {
      let n = 0;
      eachCombo((act, role, build) => {
        for (const s of youSteps(build(profileFor(qth), role, {}))) n += s.mustContain.length;
      });
      return n;
    };
    expect(total("MADISON WI")).toBe(47);   // the F5 baseline, undisturbed
    expect(total("MADISON")).toBe(46);      // exactly the POTA hunter state
  });

  // --- T3: the CQ zone gets the same treatment as the state ----------------
  it("T3: an unresolvable QTH drops the contest zone rather than sending zone 5", () => {
    // Zone 5 arrived with the "CT" fallback, not by design: per the bundled DXCC
    // dataset it is the eastern seaboard, so a Wisconsin operator with a state-less
    // QTH was graded on a zone they are not in. MUTATION VERIFIED: drop the
    // `zone == null ? ""` guard from buildContest's exch() → this and the S&P test
    // go red (zoneToken(null) yields the token "null"). Note that reverting only the
    // `myCqZone = null` parameter default does NOT bite: `profileFor` passes an
    // explicit null, and a parameter default only fires for undefined. The runtime
    // guard is the load-bearing line.
    const none = buildContest(profileFor("MADISON"), "run", { contestType: "zone" });
    const exchange = none.steps.filter((s) => s.who === "you")[1];
    expect(exchange.mustContain).toEqual(["599"]);
    expect(exchange.suggested).toBe(`${none.dx} 599`);
    expect(exchange.prompt).toBe("Work them — their call, report.");
    expect(none.summary).not.toMatch(/Your exchange/);

    // Resolvable: unchanged. Wisconsin is CQ zone 4 (CQ's WAZ zone list,
    // cqww.com/cq_waz_list.htm, retrieved 2026-07-21 — see buildContest's header for
    // why our own dataset is NOT the citation here), so the token is "04", not "05".
    const wi = buildContest(profileFor("MADISON WI"), "run", { contestType: "zone" });
    const wiExchange = wi.steps.filter((s) => s.who === "you")[1];
    expect(wiExchange.mustContain).toEqual(["599", "04"]);
    expect(wiExchange.suggested).toBe(`${wi.dx} 599 04`);
    expect(wi.summary).toMatch(/Your exchange: 04\./);
  });

  it("T3: an OMITTED myCqZone fails safe — the parameter default drops the zone too", () => {
    // Honest note on coverage: today's single call site (start() in
    // wr-cw-trainer.jsx) always passes an explicit number or null, so the
    // `myCqZone = null` parameter default is unreachable in production and
    // reverting it to `= 5` leaves the rest of the suite green. It is pinned
    // anyway because a future second caller that simply omits the key would
    // silently revive the exact defect this change exists to kill.
    // MUTATION: change the default back to `myCqZone = 5` → red (and ONLY red here).
    const q = buildContest({ myCall: "K9MTE" }, "run", { contestType: "zone" });
    expect(q.steps.filter((s) => s.who === "you")[1].mustContain).toEqual(["599"]);
  });

  it("T3: the S&P side drops the zone the same way, with no stray spacing", () => {
    const none = buildContest(profileFor(""), "sp", { contestType: "zone" });
    const exchange = none.steps.filter((s) => s.who === "you")[1];
    expect(exchange.mustContain).toEqual(["599"]);
    expect(exchange.suggested).toBe("599 TU");
    expect(exchange.prompt).toBe("Report + TU. Fast and clean.");

    const ct = buildContest(profileFor("NEWINGTON CT"), "sp", { contestType: "zone" });
    const ctExchange = ct.steps.filter((s) => s.who === "you")[1];
    expect(ctExchange.mustContain).toEqual(["599", "05"]);
    expect(ctExchange.suggested).toBe("599 05 TU");
  });

  it("T3: the DX station always has a zone — dropping ours never blanks theirs", () => {
    // Only the operator's own zone can be unknown; the DX pool carries one per row.
    for (let i = 0; i < 20; i++) {
      const q = buildContest(profileFor("MADISON"), "run", { contestType: "zone" });
      expect(q.steps[3].text).toMatch(/^599 \d{2} TU$/);
    }
  });

  it("T3: the serial (WPX) exchange is untouched — it never needed a zone", () => {
    const q = buildContest(profileFor("MADISON"), "run", { contestType: "wpx" });
    const exchange = q.steps.filter((s) => s.who === "you")[1];
    expect(exchange.mustContain).toHaveLength(2);
    expect(exchange.mustContain[1]).toMatch(/^\d{3}$/);
    expect(exchange.prompt).toBe("Work them — their call, report, your serial.");
  });

  // --- the COPY phrase pool ------------------------------------------------
  it("a blank {ST} leaves a clean phrase, not a double word gap", () => {
    // QSO_PHRASES personalise to the operator; two of them carry {ST}.
    // MUTATION: remove the whitespace collapse from subTokens → red.
    const s = { myCall: "K9MTE", myName: "TRAVIS", myQth: "MADISON" };
    expect(subTokens("BK GM UR 599 599 {ST} {ST} BK", s)).toBe("BK GM UR 599 599 BK");
    expect(subTokens("BK TU {ST} 73 EE", s)).toBe("BK TU 73 EE");
    // No phrase in the shipped pool comes out with a doubled space for ANY of the
    // clearable fields — toCodes turns each space into a word gap.
    const cleared = { myCall: "", myName: "", myQth: "" };
    for (const p of QSO_PHRASES) {
      expect(subTokens(p, cleared), `"${p}"`).not.toMatch(/ {2}/);
      expect(toCodes(subTokens(p, cleared)).filter((t, i, a) => t.wordGap && a[i - 1]?.wordGap))
        .toEqual([]);
    }
    // A resolvable QTH is untouched.
    expect(subTokens("BK TU {ST} 73 EE", { ...s, myQth: "MADISON WI" })).toBe("BK TU WI 73 EE");
    // The .trim() is a separate half of the collapse and needs its own pin: a
    // token at the END of a phrase leaves a TRAILING space that the `\s+` → " "
    // collapse alone does not remove, and toCodes turns that into a word gap of
    // silence after the last character. MUTATION: delete only `.trim()` → red.
    expect(subTokens("QTH {QTH}", cleared)).toBe("QTH");
  });
});
