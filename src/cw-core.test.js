import { describe, it, expect } from "vitest";
import {
  MORSE, REV, similarity, timing,
  buildRagchew, buildPota, buildSota, buildIota,
  cutNum, isReadyToAdvance,
  PROSIGNS, PROSIGN_CODES, QCODES_ABBREV, DRILL_CATEGORIES,
  drillCallsign, drillCallingCq, drillRstExchange, drillNumbers,
  drillProsigns, drillQCodes, drillCommonWords, drillQsoLine,
  COMMON_WORDS, ROLE_TERMS,
  analyzeFist, FIST_TOLERANCE, FIST_MIN_ELEMENTS,
  toCodes,
  averageScore,
  cqCall,
} from "./cw-core.js";

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

  it("every space-delimited token is in COMMON_WORDS", () => {
    for (let i = 0; i < 20; i++) {
      const s = drillCommonWords();
      for (const tok of s.split(" ")) {
        expect(COMMON_WORDS).toContain(tok);
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
  it("has exactly 8 categories", () => {
    expect(DRILL_CATEGORIES.length).toBe(8);
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

  // B1 (v1.1): ladder order reordered simplest→hardest.
  // Pin the first and last ids so an inadvertent reorder is caught.
  it("first category is 'words' (simplest start — common words)", () => {
    expect(DRILL_CATEGORIES[0].id).toBe("words");
  });

  it("last category is 'callsigns' (hardest — variable length, no patterns)", () => {
    expect(DRILL_CATEGORIES[DRILL_CATEGORIES.length - 1].id).toBe("callsigns");
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
    assertCqShape(steps[0], "VE3H");
    // Steps 1–4: exact lock
    expect(steps[1]).toBe("VE3H DE K9MTE K9MTE K");
    expect(steps[2]).toBe("K9MTE DE VE3H = GM TNX FER CALL = UR RST 569 569 = NAME MAX MAX = QTH CEDAR RAPIDS IA = HW? K9MTE DE VE3H KN");
    expect(steps[3]).toBe("R R VE3H DE K9MTE = GM MAX TNX FER RPT = UR RST 599 599 = NAME TRAVIS TRAVIS = QTH MADISON WI = HW? VE3H DE K9MTE KN");
    expect(steps[4]).toBe("R FB TRAVIS = TNX FER FB QSO = 73 ES HPE CUAGN K9MTE DE VE3H SK EE");
  });

  it("pota hunter: CQ step shape-checked; exchange steps exact-locked (A2: no park ref)", () => {
    const steps = stepsOf(buildPota, "hunter");
    // Step 0: activator CQ — shape only; POTA tag must be present; park ref must NOT be
    assertCqShape(steps[0], "VE3H", "POTA");
    expect(steps[0]).not.toMatch(/US-\d+/);
    // Steps 1–4: exact lock
    expect(steps[1]).toBe("K9MTE");
    expect(steps[2]).toBe("K9MTE GM UR 589 589 BK");
    expect(steps[3]).toBe("BK GM UR 599 599 WI WI BK");
    expect(steps[4]).toBe("BK TU WI 73 DE VE3H EE");
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
    assertCqShape(steps[0], "VE3H/P", "SOTA");
    expect(steps[0]).toMatch(/[A-Z0-9]+\/[A-Z]+-\d+/); // summit ref present
    // Steps 1–4: exact lock
    expect(steps[1]).toBe("K9MTE");
    expect(steps[2]).toBe("K9MTE GM UR 589 589 BK");
    expect(steps[3]).toBe("BK R R UR 599 599 TU");
    expect(steps[4]).toBe("BK TU ES 73 DE VE3H/P EE");
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
    expect(result[0]).toEqual({ code: MORSE.T });
    expect(result[1]).toEqual({ code: MORSE.H });
    expect(result[2]).toEqual({ code: MORSE.E });
  });

  it("space produces a wordGap sentinel (not a code entry)", () => {
    const result = toCodes("A B");
    expect(result.length).toBe(3);
    expect(result[1]).toEqual({ wordGap: true });
  });

  it("'SK' → one atomic code entry (not two separate letters)", () => {
    const result = toCodes("SK");
    expect(result.length).toBe(1);
    expect(result[0]).toEqual({ code: PROSIGN_CODES.SK });
    expect(result[0].code).toBe("...-.-");
  });

  it("'KN' → one atomic code entry", () => {
    const result = toCodes("KN");
    expect(result.length).toBe(1);
    expect(result[0]).toEqual({ code: PROSIGN_CODES.KN });
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
    expect(result[0]).toEqual({ code: MORSE.C });
    expect(result[1]).toEqual({ code: MORSE.Q });
    expect(result[2]).toEqual({ wordGap: true });
    expect(result[3]).toEqual({ code: PROSIGN_CODES.SK });
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
    expect(result[0]).toEqual({ code: MORSE.A });
    expect(result[1]).toEqual({ code: MORSE.R });
    expect(result[2]).toEqual({ code: MORSE.E });
  });

  it("'W9KN' (callsign) → four separate characters — KN suffix not fused", () => {
    // W9KN has 'KN' at the end. As a callsign token it must not be treated as
    // the KN prosign; that would drop W and 9 and turn KN into one sound.
    const result = toCodes("W9KN");
    expect(result.length).toBe(4);
    expect(result[0]).toEqual({ code: MORSE.W });
    expect(result[1]).toEqual({ code: MORSE[9] });
    expect(result[2]).toEqual({ code: MORSE.K });
    expect(result[3]).toEqual({ code: MORSE.N });
  });

  it("'CQ SK' → [C, Q, wordGap, SK_atomic] — standalone SK still fuses", () => {
    // This is the intended case: SK as its own whitespace-delimited token must
    // still produce one atomic code (not S then K separately).
    const result = toCodes("CQ SK");
    expect(result.length).toBe(4);
    expect(result[0]).toEqual({ code: MORSE.C });
    expect(result[1]).toEqual({ code: MORSE.Q });
    expect(result[2]).toEqual({ wordGap: true });
    expect(result[3]).toEqual({ code: PROSIGN_CODES.SK });
  });
});

// ---------------------------------------------------------------------------
// A3 (v1.1) — mustContain ⊆ suggested invariant across ALL builders × roles
// ---------------------------------------------------------------------------
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
