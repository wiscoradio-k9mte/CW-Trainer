import { describe, it, expect } from "vitest";
import {
  MORSE, REV, similarity, timing,
  buildRagchew, buildPota, buildSota, buildIota,
  cutNum, isReadyToAdvance,
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

  it("returns correct structure with 5 steps", () => {
    const qso = buildRagchew(PROFILE);
    assertQsoStructure(qso, "RAGCHEW", RAGCHEW_STEPS);
  });

  it("myCall propagates into you-step suggested text", () => {
    const qso = buildRagchew(PROFILE);
    const youSteps = qso.steps.filter((s) => s.who === "you");
    const hasCall = youSteps.some((s) => s.suggested.includes("K9MTE"));
    expect(hasCall).toBe(true);
  });

  // GAP 3 (ragchew): step[1] is the operator's answer to the CQ — mustContain
  // must list myCall so the grader flags a missed callsign as incorrect.
  // Emptying mustContain would make this assertion red.
  it("step[1] mustContain includes myCall (answer-the-CQ step)", () => {
    const qso = buildRagchew(PROFILE);
    expect(qso.steps[1].mustContain.includes(PROFILE.myCall)).toBe(true);
  });
});

describe("buildPota()", () => {
  // Verified by reading src: pota has 5 steps (dx, you, dx, you, dx)
  const POTA_STEPS = 5;

  it("returns correct structure with 5 steps", () => {
    const qso = buildPota(PROFILE);
    assertQsoStructure(qso, "POTA", POTA_STEPS);
  });

  it("myCall propagates", () => {
    const qso = buildPota(PROFILE);
    const youSteps = qso.steps.filter((s) => s.who === "you");
    const hasCall = youSteps.some((s) => s.suggested.includes("K9MTE"));
    expect(hasCall).toBe(true);
  });

  // GAP 3 (pota): step[1] is the pileup callsign — mustContain must list myCall.
  it("step[1] mustContain includes myCall (pileup callsign step)", () => {
    const qso = buildPota(PROFILE);
    expect(qso.steps[1].mustContain.includes(PROFILE.myCall)).toBe(true);
  });
});

describe("buildSota()", () => {
  // Verified by reading src: sota has 5 steps (dx, you, dx, you, dx)
  const SOTA_STEPS = 5;

  it("returns correct structure with 5 steps", () => {
    const qso = buildSota(PROFILE);
    assertQsoStructure(qso, "SOTA", SOTA_STEPS);
  });

  it("myCall propagates", () => {
    const qso = buildSota(PROFILE);
    const youSteps = qso.steps.filter((s) => s.who === "you");
    const hasCall = youSteps.some((s) => s.suggested.includes("K9MTE"));
    expect(hasCall).toBe(true);
  });

  // GAP 3 (sota): step[1] is the chase callsign — mustContain must list myCall.
  it("step[1] mustContain includes myCall (chase callsign step)", () => {
    const qso = buildSota(PROFILE);
    expect(qso.steps[1].mustContain.includes(PROFILE.myCall)).toBe(true);
  });
});

describe("buildIota()", () => {
  // Verified by reading src: iota has 5 steps (dx, you, dx, you, dx)
  const IOTA_STEPS = 5;

  it("returns correct structure with 5 steps", () => {
    const qso = buildIota(PROFILE);
    assertQsoStructure(qso, "IOTA", IOTA_STEPS);
  });

  it("myCall propagates", () => {
    const qso = buildIota(PROFILE);
    const youSteps = qso.steps.filter((s) => s.who === "you");
    const hasCall = youSteps.some((s) => s.suggested.includes("K9MTE"));
    expect(hasCall).toBe(true);
  });

  // GAP 3 (iota): step[1] is the DX pileup callsign — mustContain must list myCall.
  it("step[1] mustContain includes myCall (DX pileup callsign step)", () => {
    const qso = buildIota(PROFILE);
    expect(qso.steps[1].mustContain.includes(PROFILE.myCall)).toBe(true);
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
      const qso = buildPota({ ...PROFILE, cut: true });
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
