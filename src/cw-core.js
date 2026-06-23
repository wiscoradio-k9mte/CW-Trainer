/* ================= CW CORE ================
   Pure, browser-free functions extracted from wr-cw-trainer.jsx so they can be
   unit-tested in a Node environment without dragging in React or the Web Audio API.

   Dependency order is intentional: each symbol is defined before anything
   that uses it. Do not reorder without re-checking the transitive deps. */

/* ================= MORSE DATA ================= */
// PROSIGN_CODES: atomic codes for prosigns that must sound run-together (no 3u
// inter-character gap between their elements).  Kept SEPARATE from MORSE so the
// REV round-trip and the live decoder are untouched — they continue to operate
// on single characters only.  The audio players consult this table via toCodes();
// the decoder never sees it.
//
// BK is intentionally absent: on the air BK is keyed as two separate letters with
// a normal gap.  It is a "break" turnover, not a fused prosign.  See the OnAir
// guide for reference.
export const PROSIGN_CODES = {
  AR: ".-.-.",   // also stored as MORSE["+"]
  BT: "-...-",   // also stored as MORSE["="]
  SK: "...-.-",  // new — not in MORSE to preserve REV round-trip
  KN: "-.--.",   // new — same reason
};

// toCodes(text) → [{code: string} | {wordGap: true}]
//
// Tokenizes a display string into an array the audio players iterate over.
// Each entry is one of:
//   { code: ".-" }    — a Morse code string to key (one character)
//   { wordGap: true } — a word boundary (player inserts wordSp - charSp)
//
// Prosigns AR, BT, SK, KN are recognized ONLY when the WHOLE whitespace-
// delimited token equals a PROSIGN_CODES key.  The earlier character-position
// scan fused "AR" inside ordinary words like "ARE", callsign suffixes like
// "W9KN", and place names like "CEDAR RAPIDS" — all wrong.  Prosigns are
// standalone tokens on the air; they never appear mid-word.
//
// Why here instead of inline in each player loop: three players (play, and two
// loops in playMany) used to all do `MORSE[ch]` independently.  One tested
// tokenizer is simpler than teaching each loop to peek ahead, and it makes the
// prosign parse unit-testable without the Web Audio API.
export function toCodes(text) {
  const upper = text.toUpperCase();
  const result = [];
  // Split on spaces; spaces become wordGap sentinels between tokens.
  const tokens = upper.split(" ");
  tokens.forEach((token, idx) => {
    // Word boundary: insert a wordGap before every token after the first.
    // We must mirror the original behaviour: one gap per space in the input.
    if (idx > 0) result.push({ wordGap: true });

    if (token === "") return; // consecutive spaces produce an empty token; skip

    // A whole token that is exactly a prosign key → emit one atomic code.
    if (PROSIGN_CODES[token] !== undefined) {
      result.push({ code: PROSIGN_CODES[token] });
      return;
    }

    // Otherwise emit each character individually.
    for (const ch of token) {
      const code = MORSE[ch];
      if (code) result.push({ code }); // unknown characters are silently skipped
    }
  });
  return result;
}

export const MORSE = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.",
  H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.",
  O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-",
  V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
  0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-",
  5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "/": "-..-.", "=": "-...-",
  "+": ".-.-.", "@": ".--.-.", "-": "-....-",
};
export const REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

export const COMMON_WORDS = ["THE","AND","YOU","FOR","ARE","HAM","RIG","ANT","QTH","RST","NAME","TNX","FER","AGN","HW","CPY","WX","HR","ES","DE","UR","73","599","CQ","DX","PWR","WATT","DIPOLE","BAND","CALL","OM","GM","GA","GE","FB","HI","VY","PSE","RPT","NR","TU","POTA","SOTA","IOTA","BK","QRZ","P2P","S2S","EE","QRP","QRS"];
export const QSO_PHRASES = ["CQ POTA CQ POTA DE {ME} K","UR 5NN 5NN BK","BK GM UR 599 599 {ST} {ST} BK","BK TU {ST} 73 EE","CQ SOTA DE {ME}/P","P2P P2P US-4361","S2S S2S","QRZ POTA?","CQ CQ DE {ME}","UR RST 599 599","NAME IS {NAME}","QTH {QTH}","TNX FER CALL","HW CPY?","73 ES GD DX","PSE AGN","RIG IS KX2","ANT IS DIPOLE","WX HR SUNNY","PWR 5 WATTS"];

// Pull a two-letter state from the end of a QTH like "NEWINGTON CT"
export const stateOf = (qth) => {
  const tok = (qth || "").trim().split(/\s+/).pop() || "";
  return /^[A-Za-z]{2}$/.test(tok) ? tok.toUpperCase() : "CT";
};

// Personalize practice/teaching text to the configured operator
export function subTokens(s, settings) {
  return s
    .replaceAll("{ME}", settings.myCall)
    .replaceAll("{NAME}", settings.myName)
    .replaceAll("{QTH}", settings.myQth)
    .replaceAll("{ST}", stateOf(settings.myQth));
}

export const DX_PREFIXES = ["W9","K0","N8","KD9","W1","K4","N5","VE3","W7","K6","AC9","KB0","N2","W4"];
export const IOTA_DX_PREFIXES = ["G4","EI5","OH2","JA1","9A2","F5","ON4","SM5","GM3","CT1"];
export const NAMES = ["BOB","JIM","SUE","ANN","TOM","DAN","RAY","KEN","JOE","AL","ED","MAX","SAM","LEE","ART","HAL"];
export const QTHS = ["MADISON WI","DULUTH MN","CEDAR RAPIDS IA","TOLEDO OH","FARGO ND","BOISE ID","TUCSON AZ","BANGOR ME","SPARTA WI","MOLINE IL","TOPEKA KS","DENVER CO"];
export const RSTS = ["599","579","559","589","569"];

// Classic 40-lesson Koch sequence (the LCWO/G4FON family — exact order varies
// slightly between traditions): full-speed characters from day one,
// two to start, one new character per lesson at 90% accuracy.
export const KOCH = ["K","M","U","R","E","S","N","A","P","T","L","W","I",".","J","Z","=","F","O","Y",",","V","G","5","/","Q","9","2","H","3","8","B","?","4","7","C","1","D","6","0","X"];

export const glyphs = (code) => code.split("").map((c) => (c === "." ? "·" : "−")).join(" ");

export const SUMMITS = ["W9/UP-001","W7A/AE-040","W0C/FR-063","W4G/NG-006","W6/CT-225","W2/GA-010"];
export const IOTA_REFS = ["NA-128","EU-005","OC-001","NA-067","EU-115","AF-004"];

export const randPark = () => "US-" + (1000 + Math.floor(Math.random() * 9000));

// Contest cut numbers: 9 → N, 0 → T (599 → 5NN)
export const cutNum = (s, cut) => (cut ? s.replace(/9/g, "N").replace(/0/g, "T") : s);

export const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const randCall = (prefixes = DX_PREFIXES) => {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  // Suffix 1–3 letters. Combined with the 1- and 2-letter prefixes, this yields
  // every common format — 1×2, 1×3, 2×1, 2×2, 2×3 (a 1-letter suffix gives the
  // shorter 2×1 / 1×1 calls). Weighted so 2- and 3-letter suffixes dominate,
  // matching how often each length is actually heard on the air.
  const suffixLen = [1, 2, 2, 2, 3, 3][Math.floor(Math.random() * 6)];
  let s = "";
  for (let i = 0; i < suffixLen; i++) s += letters[Math.floor(Math.random() * 26)];
  return rand(prefixes) + s;
};

/* ================= TIMING ================= */
export function timing(charWpm, effWpm) {
  const u = 1.2 / charWpm; // seconds per unit at character speed
  let charSp = 3 * u, wordSp = 7 * u;
  if (effWpm < charWpm) {
    const ta = (60 * charWpm - 37.2 * effWpm) / (effWpm * charWpm);
    charSp = (3 * ta) / 19;
    wordSp = (7 * ta) / 19;
  }
  return { u, charSp, wordSp };
}

/* ================= GRADING ================= */
export function similarity(a, b) {
  a = a.trim().toUpperCase().replace(/\s+/g, " ");
  b = b.trim().toUpperCase().replace(/\s+/g, " ");
  if (!a && !b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return 1 - dp[m][n] / Math.max(m, n);
}

/* ================= KEYING DRILL GENERATORS ================= */
/* Each generator returns a plain string suitable for display in the KeyTrainer.
   The two pre-existing inline behaviors (common words, QSO line) are moved here
   verbatim so they gain tests and the UI calls a generator, not inline logic. */

// Prosign set as on-air symbols: AR(+), SK, BK, KN, BT(=).
// AR and BT are in the MORSE table as "+" and "=" respectively; SK and KN are
// taught as letter pairs here, matching the LINGO guide's treatment.
export const PROSIGNS = ["AR", "SK", "BK", "KN", "="];

// Q-codes and CW abbreviations drawn from COMMON_WORDS and the LINGO guide.
// Kept small so every token is something an operator will actually encounter.
export const QCODES_ABBREV = [
  "QTH", "QRZ", "QSB", "QRS", "QRP", "QSL", "QSY", "QRM", "QRQ",
  "FB", "TNX", "ES", "UR", "HW", "AGN", "RST", "DE", "CQ", "DX",
  "TU", "BK", "PSE", "RPT", "NR", "HR",
];

// Drill: random callsigns (1–3 calls in a run, simulating a string of calls heard
// during a pileup or a series of contacts).
export function drillCallsign(settings) {
  // One call for the early rung; a short run of 2–3 for harder variety.
  // The count is random so the learner can't predict the length.
  const count = [1, 1, 2, 2, 3][Math.floor(Math.random() * 5)];
  return Array.from({ length: count }, () => randCall()).join(" ");
}

// Drill: calling-CQ phrase personalized to the configured operator.
export function drillCallingCq(settings) {
  const variants = [
    `CQ CQ CQ DE ${settings.myCall} ${settings.myCall} K`,
    `CQ POTA CQ POTA DE ${settings.myCall} ${settings.myCall} K`,
    `CQ SOTA DE ${settings.myCall}/P ${settings.myCall}/P K`,
    `CQ CQ DE ${settings.myCall} ${settings.myCall} ${settings.myCall} K`,
  ];
  return rand(variants);
}

// Drill: RST exchange fragment — realistic, not always 599.
export function drillRstExchange(settings) {
  // Apply cut to both the dx's report and ours — if the user is drilling cut
  // numbers the whole exchange should use cut notation, not just one side.
  const rst = cutNum(rand(RSTS), settings.cutNumbers);
  // Read cutNumbers (the real settings field) — not the old `cut` shim.
  const myRst = cutNum("599", settings.cutNumbers);
  const name = rand(NAMES);
  const qth = rand(QTHS);
  // Vary the format so the user hears different exchange shapes.
  const variants = [
    `UR ${rst} ${rst} NAME ${name} QTH ${qth}`,
    `UR RST ${rst} ${rst} ${name} ${name} BK`,
    `${myRst} ${myRst} ${stateOf(qth)} ${stateOf(qth)} BK`,
    `UR ${rst} ${rst} NAME ${name} ${name} QTH ${stateOf(qth)} BK`,
  ];
  return rand(variants);
}

// Drill: number groups, honoring the cut-numbers setting.
// When cut is on, 9→N and 0→T so the user practices reading cut numbers.
// Takes the full settings object (matching how DRILL_CATEGORIES.gen is called)
// and reads `settings.cutNumbers` — consistent with every other generator.
export function drillNumbers(settings) {
  const cut = settings.cutNumbers;
  const digits = cut
    ? ["1","2","3","4","5","6","7","8","N","T"]   // 9→N, 0→T
    : ["0","1","2","3","4","5","6","7","8","9"];
  const group = (len) =>
    Array.from({ length: len }, () => digits[Math.floor(Math.random() * digits.length)]).join("");
  // Mix: typical RST-style groups and longer numbers.
  return [group(3), group(3), group(4), group(2)].join(" ");
}

// Drill: prosigns drawn from PROSIGNS.
export function drillProsigns() {
  // Draw 4–5 prosigns (with possible repeats — repetition is fine for keying drill).
  const count = 4 + Math.floor(Math.random() * 2);
  return Array.from({ length: count }, () => rand(PROSIGNS)).join(" ");
}

// Drill: Q-codes and common abbreviations.
export function drillQCodes() {
  const count = 4 + Math.floor(Math.random() * 2);
  return Array.from({ length: count }, () => rand(QCODES_ABBREV)).join(" ");
}

// Drill: common ham words — verbatim from the original KeyTrainer branch.
export function drillCommonWords() {
  return Array.from({ length: 3 }, () => rand(COMMON_WORDS)).join(" ");
}

// Drill: full QSO line — verbatim from the original KeyTrainer branch.
export function drillQsoLine(settings) {
  return subTokens(rand(QSO_PHRASES), settings);
}

// Registry: single source of truth for the UI ladder AND the direct-pick row.
// Array order IS the ladder (simplest → hardest). The UI renders this directly;
// adding a category is a one-line change here.
//
// Reordered in v1.1 UAT pass (B1): previous order had Callsigns first, which was
// the hardest category — wrong for a first-run learner.  Common words are the
// gentlest start; callsigns are the hardest (variable length, no common patterns).
export const DRILL_CATEGORIES = [
  { id: "words",     label: "Common words",        gen: drillCommonWords },
  { id: "prosigns",  label: "Prosigns",            gen: drillProsigns },
  { id: "qcodes",    label: "Q-codes & abbrev",    gen: drillQCodes },
  { id: "numbers",   label: "Numbers (incl. cut)", gen: drillNumbers },
  { id: "rst",       label: "RST & exchanges",     gen: drillRstExchange },
  { id: "cq",        label: "Calling CQ",          gen: drillCallingCq },
  { id: "qso",       label: "Full QSO lines",      gen: drillQsoLine },
  { id: "callsigns", label: "Callsigns",           gen: drillCallsign },
];

/* ================= FIST TIMING ANALYZER ================= */
/* Consumes the keyer's timed-event array and produces spacing feedback.

   Events are { type: "dit"|"dah", durMs, gapBeforeMs }, in send order, where
   gapBeforeMs is the key-up time before this element (0 for the very first).

   Spacing verdicts compare measured gap ratios against ITU timing:
     intra-character (element) gap  → ideal 1u
     inter-character gap            → ideal 3u
     inter-word gap                 → ideal 7u

   Tolerance: ±25% of the ideal is "good"; outside that is "loose" (too long)
   or "tight" (too short). This band is conservative on purpose — real fists
   vary, and false-precision feedback discourages learners. The constant is
   named FIST_TOLERANCE so real-operator validation can tighten it without a
   code hunt.

   B2 (v1.1): returns wpmDelta (estWpm - keyWpm), wpmVerdict, and lowSample flag.
   B3 (v1.1): returns weighting { ratio, verdict } — median dah vs 3×unit.
              Straight key only; suppressed for paddle (dahs are machine-timed). */
export const FIST_TOLERANCE = 0.25;

// WPM verdict tolerance: ±3 wpm from target is "on target".  Conservative —
// tune down with real-operator data once the threshold has been validated.
const FIST_WPM_TOLERANCE = 3;

// Minimum elements before the estimate is considered reliable.
// 8 ≈ two characters' worth of elements.  Below this the sample is too small
// to mean much; the UI should suppress or qualify the reading.
export const FIST_MIN_ELEMENTS = 8;

export function analyzeFist(events, keyWpm, keyType = "straight") {
  // Safe empty-events case: no data to analyze, return neutral zeroes.
  if (!events || events.length === 0) {
    return {
      estWpm: 0,
      unitMs: 0,
      elements: 0,
      wpmDelta: 0,
      wpmVerdict: "on target",
      lowSample: true,
      spacing: {
        element:   { ratio: null, verdict: "good" },
        character: { ratio: null, verdict: "good" },
        word:      { ratio: null, verdict: "good" },
      },
      weighting: { ratio: null, verdict: "good" },
      notes: [],
    };
  }

  // Derive unit length (ms) from the median of all dit durations.
  // Median is more robust than mean against occasional long or short dits —
  // a human fist has outliers; the median gives a stable baseline.
  const dits = events.filter((e) => e.type === "dit").map((e) => e.durMs);
  let unitMs;
  if (dits.length > 0) {
    const sorted = [...dits].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    unitMs = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  } else {
    // No dits at all (all dahs) — derive unit from dah durations / 3
    const dahs = events.map((e) => e.durMs);
    const sorted = [...dahs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medDah = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
    unitMs = medDah / 3;
  }

  // WPM: PARIS standard — one word = 50 units, 1200 ms/unit → wpm = 1200/u
  const estWpm = unitMs > 0 ? Math.round(1200 / unitMs) : 0;

  // B2: delta and verdict vs. the configured key speed.
  const wpmDelta = estWpm - (keyWpm || 0);
  let wpmVerdict;
  if (Math.abs(wpmDelta) <= FIST_WPM_TOLERANCE) wpmVerdict = "on target";
  else wpmVerdict = wpmDelta > 0 ? "fast" : "slow";

  // B2: low-sample flag — estimate exists but is unreliable below threshold.
  const lowSample = events.length < FIST_MIN_ELEMENTS;

  // Classify each gap by its expected ideal multiple of the unit.
  // The keyer reports gapBeforeMs for every element. We split them into:
  //   element gaps  — short gaps that separate elements *within* a character (ideal 1u)
  //   char gaps     — longer gaps between characters (ideal 3u)
  //   word gaps     — longest gaps between words (ideal 7u)
  //
  // Boundary heuristic: < 2u → element gap, 2u–5u → char gap, > 5u → word gap.
  // These thresholds are loose to handle uneven fists without over-splitting.
  const elementGaps = [];
  const charGaps = [];
  const wordGaps = [];

  for (const ev of events) {
    const g = ev.gapBeforeMs;
    if (g <= 0) continue; // skip the first element (no prior gap)
    if (unitMs <= 0) continue;
    const ratio = g / unitMs;
    if (ratio < 2) elementGaps.push(ratio);
    else if (ratio < 5) charGaps.push(ratio);
    else wordGaps.push(ratio);
  }

  const median = (arr) => {
    if (arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
  };

  const verdict = (ratio, ideal) => {
    if (ratio === null) return "good"; // no data → no verdict
    const deviation = Math.abs(ratio - ideal) / ideal;
    if (deviation <= FIST_TOLERANCE) return "good";
    return ratio > ideal ? "loose" : "tight";
  };

  const elemRatio  = median(elementGaps);  // ideal 1u
  const charRatio  = median(charGaps);     // ideal 3u
  const wordRatio  = median(wordGaps);     // ideal 7u

  // Paddle keyers machine-time intra-character spacing — only the operator
  // controls when to start the next character or word. So the element-gap
  // verdict is not meaningful for paddle mode and is suppressed.
  const elementVerdict = keyType === "paddle" ? "good" : verdict(elemRatio, 1);

  // B3: dah weighting — median dah vs 3×unit.
  // Straight key only: for paddle, dahs are machine-timed 3u so the verdict is
  // meaningless and is suppressed (returned as { ratio: null, verdict: "good" }).
  const dahs = events.filter((e) => e.type === "dah").map((e) => e.durMs);
  let weighting;
  if (keyType === "paddle" || unitMs <= 0) {
    // Suppressed for paddle — paddle timing is machine-controlled, not operator fist.
    weighting = { ratio: null, verdict: "good" };
  } else if (dahs.length === 0) {
    // No dahs sent — can't assess weighting (all-dit sequence).
    weighting = { ratio: null, verdict: "good" };
  } else {
    const sortedDahs = [...dahs].sort((a, b) => a - b);
    const m = Math.floor(sortedDahs.length / 2);
    const medDah = sortedDahs.length % 2 === 0
      ? (sortedDahs[m - 1] + sortedDahs[m]) / 2
      : sortedDahs[m];
    const dahRatio = medDah / unitMs; // ideal 3
    weighting = { ratio: dahRatio, verdict: verdict(dahRatio, 3) };
  }

  const notes = [];
  if (keyType !== "paddle" && elemRatio !== null && verdict(elemRatio, 1) !== "good") {
    notes.push(`element spacing ${verdict(elemRatio, 1)} (measured ${elemRatio.toFixed(1)}u, ideal 1u)`);
  }
  if (charRatio !== null && verdict(charRatio, 3) !== "good") {
    const dir = verdict(charRatio, 3) === "loose" ? "too long" : "too short";
    notes.push(`you're pausing ${dir} between letters (${charRatio.toFixed(1)}u, ideal 3u)`);
  }
  if (wordRatio !== null && verdict(wordRatio, 7) !== "good") {
    const dir = verdict(wordRatio, 7) === "loose" ? "too long" : "too short";
    notes.push(`word spacing is ${dir} (${wordRatio.toFixed(1)}u, ideal 7u)`);
  }
  // B3: plain-English weighting note
  if (keyType !== "paddle" && weighting.verdict !== "good" && weighting.ratio !== null) {
    const dir = weighting.verdict === "loose" ? "running long" : "running short";
    notes.push(`your dahs are ${dir} relative to your dits (${weighting.ratio.toFixed(1)}u, ideal 3u)`);
  }

  return {
    estWpm,
    unitMs: Math.round(unitMs),
    elements: events.length,
    wpmDelta,
    wpmVerdict,
    lowSample,
    spacing: {
      element:   { ratio: elemRatio,  verdict: elementVerdict },
      character: { ratio: charRatio,  verdict: verdict(charRatio, 3) },
      word:      { ratio: wordRatio,  verdict: verdict(wordRatio, 7) },
    },
    weighting,
    notes,
  };
}

/* ================= QSO SIMULATOR ================= */
/* Contact scripts follow current on-air practice:
   - Ragchew: 3x2 CQ, BT (=) separators, KN to hold the frequency, SK + dit-dit to close.
   - POTA: hunters send their call ONCE — no DE, no K. Short exchange with BK turnovers,
     state as QTH, activator closes "TU <state> 73 EE". Park refs use the US- prefix.
     NOTE: park reference is NOT sent on the air — the activator logs it, not sends it.
   - SOTA: activator signs /P, summit ref (assoc/region-number) in the CQ, chaser-style exchange.
   - IOTA: DX island station, contest-style — report + island ref, quick TU. */

/* Role terms for the UI — single source of truth for labels.
   Each activity maps to [[roleValue, displayLabel], ...]. */
export const ROLE_TERMS = {
  ragchew: [["call", "Call CQ"], ["answer", "Answer a CQ"]],
  pota:    [["activator", "Activator"], ["hunter", "Hunter"]],
  sota:    [["activator", "Activator"], ["chaser", "Chaser"]],
  iota:    [["activator", "Activator"], ["chaser", "Chaser"]],
};

// Optional dxCall parameter: when supplied (pileup pickup), the picked caller's
// call is used directly instead of generating a fresh random one. This means
// every field — text, suggested, mustContain, prompt — is built with the
// concrete call from the start. No post-hoc regex patching needed or used.
export function buildRagchew({ myCall, myName, myQth, cut }, role = "answer", dxCall = null) {
  const dx = dxCall ?? randCall();
  const name = rand(NAMES);
  const qth = rand(QTHS);
  const rst = cutNum(rand(RSTS), cut);
  const myRst = cutNum("599", cut);

  // Answering role: behavior-identical to the original — this branch is
  // snapshot-locked by tests to guarantee no regression from the refactor.
  if (role === "answer") {
    return {
      dx, flavor: "RAGCHEW",
      summary: `Worked ${dx} — ${name} in ${qth}, ${rst} out. A proper sit-down QSO.`,
      steps: [
        {
          who: "dx",
          text: `CQ CQ CQ DE ${dx} ${dx} ${dx} K`,
          copyHint: "A classic 3x2 CQ. The callsign is what matters — you'll hear it three times.",
        },
        {
          who: "you",
          suggested: `${dx} DE ${myCall} ${myCall} K`,
          prompt: "Answer the CQ — their call once, DE, your call twice, K.",
          mustContain: [myCall],
        },
        {
          who: "dx",
          text: `${myCall} DE ${dx} = GM TNX FER CALL = UR RST ${rst} ${rst} = NAME ${name} ${name} = QTH ${qth} = HW? ${myCall} DE ${dx} KN`,
          copyHint: "The full exchange — RST, name, QTH, separated by BT (=). KN at the end means only you should answer.",
        },
        {
          who: "you",
          suggested: `R R ${dx} DE ${myCall} = GM ${name} TNX FER RPT = UR RST ${myRst} ${myRst} = NAME ${myName} ${myName} = QTH ${myQth} = HW? ${dx} DE ${myCall} KN`,
          prompt: "Roger it, then send your exchange back — report, name, QTH, with = between thoughts.",
          mustContain: [myRst, myName],
        },
        {
          who: "dx",
          text: `R FB ${myName} = TNX FER FB QSO = 73 ES HPE CUAGN ${myCall} DE ${dx} SK EE`,
          copyHint: "The sign-off — SK closes the contact, and the dit-dit (EE) is the handshake.",
        },
      ],
    };
  }

  // Calling (activator) role: you call CQ and run the exchange.
  // The exchange content mirrors the answering side but the speakers are swapped.
  return {
    dx, flavor: "RAGCHEW",
    summary: `Called CQ, worked ${dx} — ${name} in ${qth}. A proper sit-down QSO.`,
    steps: [
      {
        who: "you",
        suggested: `CQ CQ CQ DE ${myCall} ${myCall} ${myCall} K`,
        prompt: "Call CQ — CQ three times, DE, your call three times, K.",
        mustContain: [myCall],
      },
      {
        who: "dx",
        text: `${myCall} DE ${dx} ${dx} K`,
        copyHint: "A station answers — their call twice, DE, your call once. Write down their call.",
      },
      {
        who: "you",
        suggested: `${dx} DE ${myCall} = GM TNX FER CALL = UR RST ${myRst} ${myRst} = NAME ${myName} ${myName} = QTH ${myQth} = HW? ${dx} DE ${myCall} KN`,
        prompt: "Open the exchange — GM, their report, your name, QTH. KN to hold the frequency.",
        mustContain: [myRst, myName],
      },
      {
        who: "dx",
        text: `R R ${myCall} DE ${dx} = GM ${myName} TNX FER RPT = UR RST ${rst} ${rst} = NAME ${name} ${name} = QTH ${qth} = HW? ${myCall} DE ${dx} KN`,
        copyHint: "They come back with their half — RST, name, QTH. Copy it carefully.",
      },
      {
        // A3 (v1.1): "TU" added to the script to satisfy mustContain:["TU","73"].
        // The old script had "TNX" but not "TU" — the grader marked TU missing on
        // a correct close.  "TU" (thank you) is valid ragchew sign-off form and
        // reinforces the abbreviation the app teaches.
        who: "you",
        suggested: `R FB ${name} = TU FER FB QSO = 73 ES HPE CUAGN ${dx} DE ${myCall} SK EE`,
        prompt: "Close it — FB, TU for the QSO, 73, SK and dit-dit. Their first name as the handle.",
        mustContain: ["TU", "73"],
      },
    ],
  };
}

// Optional dxCall: when the pileup picks a specific caller, pass their call here
// so all steps reference that call from the start — no regex substitution later.
export function buildPota({ myCall, myQth, cut }, role = "hunter", dxCall = null) {
  const myState = stateOf(myQth);
  const dx = dxCall ?? randCall();
  const rst = cutNum(rand(RSTS), cut);
  const myRst = cutNum("599", cut);
  const park = randPark();

  // Hunter (answering) role: behavior-identical to the original except the CQ
  // text no longer includes the park reference.
  // A2 (v1.1): On the air, POTA activators do NOT send the park ref in the CQ —
  // it goes in the log.  The activator branch was already correct; this aligns
  // the hunter branch to match real operating practice.
  if (role === "hunter") {
    return {
      dx, flavor: "POTA",
      summary: `Hunted ${dx} at ${park} — ${rst} from the park. In the log.`,
      steps: [
        {
          who: "dx",
          text: `CQ POTA CQ POTA DE ${dx} ${dx} K`,
          copyHint: "A park activator calling CQ. Grab the callsign — the park reference isn't sent on the air, the activator logs it.",
        },
        {
          who: "you",
          suggested: `${myCall}`,
          prompt: "POTA protocol: send your callsign ONCE. No DE, no K — you're one voice in a pileup.",
          mustContain: [myCall],
        },
        {
          who: "dx",
          text: `${myCall} GM UR ${rst} ${rst} BK`,
          copyHint: "Short and sweet — your report twice, then BK turns it back to you.",
        },
        {
          who: "you",
          suggested: `BK GM UR ${myRst} ${myRst} ${myState} ${myState} BK`,
          prompt: "BK back, greeting, their report, your state twice, BK. That's the whole exchange.",
          mustContain: [myRst, myState],
        },
        {
          who: "dx",
          text: `BK TU ${myState} 73 DE ${dx} EE`,
          copyHint: "Activators often use your state as your handle — TU, your state, 73, dit-dit, next hunter.",
        },
      ],
    };
  }

  // Activator role: you call CQ POTA and run the exchange.
  // On the air the park reference (US-XXXX) is NOT sent — it goes in the log.
  // The prompt notes this because it surprises new POTA ops.
  const dxState = stateOf(rand(QTHS));
  const dxRst   = cutNum(rand(RSTS), cut);
  return {
    dx, flavor: "POTA",
    summary: `Activated — ${dx} hunted you. Park in the log. Exchange complete.`,
    steps: [
      {
        who: "you",
        suggested: `CQ POTA CQ POTA DE ${myCall} ${myCall} K`,
        prompt: `Call CQ POTA — your call twice, K. The park reference (${park}) goes in your log, not on the air.`,
        mustContain: [myCall],
      },
      {
        who: "dx",
        text: `${dx}`,
        copyHint: "A hunter answers with their call once — write it down. No DE, no K.",
      },
      {
        who: "you",
        suggested: `${dx} GM UR ${myRst} ${myRst} BK`,
        prompt: "Acknowledge the hunter — their call, GM, their report twice, BK.",
        mustContain: [myRst],
      },
      {
        who: "dx",
        text: `BK GM UR ${dxRst} ${dxRst} ${dxState} ${dxState} BK`,
        copyHint: "Hunter returns their report and state twice — copy the state, that's the exchange.",
      },
      {
        who: "you",
        suggested: `BK TU ${dxState} 73 DE ${myCall} EE`,
        prompt: "Close with BK TU, their state, 73, your call, dit-dit. On to the next one.",
        mustContain: ["TU"],
      },
    ],
  };
}

// Optional dxCall: when supplied for a pileup, the chaser's call is the picked
// caller, not a random one. For SOTA/IOTA the activator signs /P; dxCall is the
// base call and the /P form is derived here — consistent, no patchwork needed.
export function buildSota({ myCall, cut }, role = "chaser", dxCall = null) {
  const dx = dxCall ?? randCall();
  const rst = cutNum(rand(RSTS), cut);
  const myRst = cutNum("599", cut);
  const summit = rand(SUMMITS);

  // Chaser (answering) role: behavior-identical to the original.
  if (role === "chaser") {
    return {
      dx, flavor: "SOTA",
      // dxSigned: the other station's call as it appears on-air (activator signs /P)
      dxSigned: `${dx}/P`,
      summary: `Chased ${dx}/P on ${summit} — ${rst}. Summit in the log.`,
      steps: [
        {
          who: "dx",
          text: `CQ SOTA DE ${dx}/P ${dx}/P ${summit} K`,
          copyHint: "A summit activator, signing portable. The slash-P and the summit ref are the tells.",
        },
        {
          who: "you",
          suggested: `${myCall}`,
          prompt: "Chase it — your callsign once, like a POTA pileup.",
          mustContain: [myCall],
        },
        {
          who: "dx",
          text: `${myCall} GM UR ${rst} ${rst} BK`,
          copyHint: "QRP from a mountaintop — the report may not be pretty, but it's honest.",
        },
        {
          who: "you",
          suggested: `BK R R UR ${myRst} ${myRst} TU`,
          prompt: "Roger, send their report, TU. Summit ops are on battery — keep it tight.",
          mustContain: [myRst],
        },
        {
          who: "dx",
          text: `BK TU ES 73 DE ${dx}/P EE`,
          copyHint: "TU 73 and the dit-dit — they're already listening for the next chaser.",
        },
      ],
    };
  }

  // Activator role: you're on the summit, calling CQ SOTA.
  // You sign /P. The summit reference is in the CQ (chasers expect it there).
  const dxRst = cutNum(rand(RSTS), cut);
  return {
    dx, flavor: "SOTA",
    summary: `Activated ${summit} — worked ${dx} as a chaser. Summit complete.`,
    steps: [
      {
        who: "you",
        suggested: `CQ SOTA DE ${myCall}/P ${myCall}/P ${summit} K`,
        prompt: `Call CQ SOTA signing portable. Summit ref ${summit} goes in the CQ — chasers expect it there.`,
        mustContain: [myCall],
      },
      {
        who: "dx",
        text: `${dx}`,
        copyHint: "A chaser answers with their call once — same quick protocol as POTA.",
      },
      {
        who: "you",
        suggested: `${dx} GM UR ${myRst} ${myRst} BK`,
        prompt: "Work the chaser — their call, GM, their report twice, BK.",
        mustContain: [myRst],
      },
      {
        who: "dx",
        text: `BK R R UR ${dxRst} ${dxRst} TU`,
        copyHint: "Chaser comes back with your report — copy it and close.",
      },
      {
        who: "you",
        suggested: `BK TU ES 73 DE ${myCall}/P EE`,
        prompt: "Close with BK TU, 73, your portable call, dit-dit. Battery doesn't wait.",
        mustContain: ["TU"],
      },
    ],
  };
}

// Optional dxCall: in the activator branch it supplies the chaser's call (the
// station answering your CQ IOTA). The island station is always myCall; dxCall
// only applies when a pileup caller has been picked.
export function buildIota({ myCall, cut }, role = "chaser", dxCall = null) {
  const dx = randCall(IOTA_DX_PREFIXES);
  const ref = rand(IOTA_REFS);
  const rpt = cutNum("599", cut);

  // Chaser (answering) role: behavior-identical to the original.
  if (role === "chaser") {
    return {
      dx, flavor: "IOTA",
      summary: `Worked ${dx} on ${ref} — 599 to the island. New one for the log.`,
      steps: [
        {
          who: "dx",
          text: `CQ CQ IOTA DE ${dx} ${dx} ${ref} K`,
          copyHint: "An island station — DX prefix, and the ref is continent-number (NA, EU, OC...).",
        },
        {
          who: "you",
          suggested: `${myCall}`,
          prompt: "DX-style pileup — your callsign once, then listen hard.",
          mustContain: [myCall],
        },
        {
          who: "dx",
          text: `${myCall} ${rpt} ${rpt} ${ref} ${ref} TU`,
          copyHint: "Contest pace: report and island reference, nothing else. Copy that ref.",
        },
        {
          who: "you",
          suggested: `R ${rpt} ${rpt} TU`,
          prompt: "Confirm and report — fast and clean. The pileup is waiting.",
          mustContain: [rpt],
        },
        {
          who: "dx",
          text: `TU 73 QRZ IOTA DE ${dx} K`,
          copyHint: "TU, and straight back to QRZ — island stations don't linger.",
        },
      ],
    };
  }

  // Activator role: you're the DX island station, calling CQ IOTA.
  // Use the supplied dxCall (pileup pickup) or generate a random stateside chaser.
  const chaser = dxCall ?? randCall(DX_PREFIXES);
  const myRpt = cutNum("599", cut);
  return {
    dx: chaser, flavor: "IOTA",
    summary: `Activated ${ref} — ${chaser} in the log. Island QSO complete.`,
    steps: [
      {
        who: "you",
        suggested: `CQ CQ IOTA DE ${myCall} ${myCall} ${ref} K`,
        prompt: `Call CQ IOTA — your call twice, island ref ${ref}, K. Contest pace.`,
        mustContain: [myCall],
      },
      {
        who: "dx",
        text: `${chaser}`,
        copyHint: "A chaser fires their call once — write it down, fast.",
      },
      {
        who: "you",
        suggested: `${chaser} ${myRpt} ${myRpt} ${ref} ${ref} TU`,
        prompt: "Give them report and island ref twice, TU. That's the whole IOTA exchange.",
        mustContain: [myRpt],
      },
      {
        who: "dx",
        text: `R ${myRpt} ${myRpt} TU`,
        copyHint: "They confirm with your report back and TU. Contact logged.",
      },
      {
        who: "you",
        suggested: `TU 73 QRZ IOTA DE ${myCall} K`,
        prompt: "TU, straight to QRZ, back to calling. Island stations keep the rate up.",
        mustContain: ["TU"],
      },
    ],
  };
}

// buildQso is removed — callers now select activity + role explicitly via the
// activity/role dispatcher in QsoSim. The random picker added non-determinism
// that made it impossible to practice a specific role. If a thin shim is ever
// needed for backwards compatibility, add a dispatcher here.

/* ================= PILEUP MODEL ================= */
/* Pure data model for the Activator + Real life pileup (Phase 4).
   No audio, no React — the UI builds from this and drives playMany().

   Design constraints (from the architect's brief):
   - 2–4 callers, weighted toward 2–3 (more than 4 is mush on any receiver)
   - Signal strengths SPREAD deliberately: one loud, one mid, one weak — not
     uniform random. This makes "work the strongest first" a real teaching point.
   - offsetMs 0..~600ms models timing overlap: not everyone keys simultaneously.
   - Expose tuning constants so UAT feedback can change behavior without a code hunt. */

// Tuning constants — named so UAT feedback translates directly to a single change.
export const PILEUP_MAX_CALLERS = 4;       // absolute ceiling
export const PILEUP_MAX_OFFSET_MS = 600;   // latest a caller can start after the group
export const PILEUP_DETUNE_MIN_HZ = 30;    // minimum pitch offset from center freq
export const PILEUP_DETUNE_MAX_HZ = 80;    // maximum pitch offset from center freq

// Signal strength tiers for PILEUP_SPREAD_SIGNALS — one value per tier.
// "Loud" at 0.85 so the strongest caller is clearly above mid; "weak" at 0.25
// so it is genuinely difficult to pull but not inaudible. Values are 0..1 (gain).
const SIGNAL_TIERS = [0.85, 0.55, 0.30, 0.15]; // index 0 = loudest

// Build a spread signal array for `count` callers.
// Returns signals in shuffled order (no positional loudness bias) so the user
// can't predict which callsign will be loud just from hearing the order.
function spreadSignals(count) {
  // Take the first `count` tiers, then shuffle so position isn't predictable.
  const tiers = SIGNAL_TIERS.slice(0, count);
  // Fisher-Yates shuffle (in-place on a copy)
  const arr = [...tiers];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// buildPileup — pure data model for a pileup round.
// activity: "pota" | "sota" | "iota" | "ragchew" — drives prefix selection
//   (IOTA uses DX prefixes; everything else uses domestic).
// Returns { callers: [{ call, rst, signal, offsetMs }, ...] }
//
// C3 (v1.1 UAT): the `partial` field has been removed.  It was set but never
// read by the audio path — dead data.  The pileup already provides a difficulty
// gradient through signal strength (the weak caller is genuinely hard to pull)
// plus pitch detune and offset; `partial` added a second overlapping axis that
// the audio never realized.  Removing it keeps the model honest.  If audible
// partial-copy is wanted in a future pass, it belongs as an audio behavior, not
// a boolean the player never consults.
export function buildPileup(settings, activity) {
  // 2–4 callers, weighted toward 2–3: [2,2,2,3,3,4] → ~50% twos, ~33% threes, ~17% fours.
  const counts = [2, 2, 2, 3, 3, 4];
  const count = counts[Math.floor(Math.random() * counts.length)];

  // IOTA is a DX pileup — callers sound exotic (G4, JA1, etc.)
  const prefixes = activity === "iota" ? IOTA_DX_PREFIXES : DX_PREFIXES;

  const signals = spreadSignals(count);

  const callers = Array.from({ length: count }, (_, i) => {
    // Stagger offsets so not everyone keys at once — first caller at 0ms,
    // the rest somewhere in 0..PILEUP_MAX_OFFSET_MS.
    const offsetMs = i === 0 ? 0 : Math.floor(Math.random() * PILEUP_MAX_OFFSET_MS);
    return {
      call: randCall(prefixes),
      rst:  "599",     // pileup callers send their call only, report at exchange stage
      signal: signals[i],
      offsetMs,
    };
  });

  return { callers };
}

// matchPickup — pure function; the testable heart of the pileup interaction.
// pileup:  the { callers } object from buildPileup
// sent:    what the user keyed (string, already decoded and trimmed)
// worked:  Set of call strings already worked this round
//
// Returns one of:
//   { matched: caller }      — exactly one un-worked caller matches
//   { ambiguous: [c1, c2] }  — fragment matches more than one un-worked caller
//   null                     — nothing matches
//
// Matching rules (from the design, §2.4):
//   1. Exact call match (case-insensitive)
//   2. Unambiguous prefix/suffix fragment — the sent string is a prefix OR suffix
//      of exactly ONE un-worked caller's call. Minimum fragment length: 2 chars
//      (single-letter matches would hit too many calls to be useful).
export function matchPickup(pileup, sent, worked = new Set()) {
  if (!sent || sent.length === 0) return null;

  const upper = sent.toUpperCase().replace(/\s+/g, "");
  if (upper.length === 0) return null;

  const unworked = pileup.callers.filter((c) => !worked.has(c.call));
  if (unworked.length === 0) return null;

  // Pass 1: exact match on the full call (case-insensitive)
  const exact = unworked.find((c) => c.call.toUpperCase() === upper);
  if (exact) return { matched: exact };

  // Pass 2: fragment — prefix or suffix of the full call.
  // Require at least 2 characters so "W" doesn't ambiguously match everyone.
  if (upper.length < 2) return null;

  const fragmentMatches = unworked.filter((c) => {
    const call = c.call.toUpperCase();
    return call.startsWith(upper) || call.endsWith(upper);
  });

  if (fragmentMatches.length === 1) return { matched: fragmentMatches[0] };
  if (fragmentMatches.length > 1)  return { ambiguous: fragmentMatches };
  return null;
}

/* ================= AGGREGATE SCORE HELPER (B4) ================= */
// averageScore(nums) — mean of a numeric array, rounded to the nearest integer.
// Returns null for an empty array so the caller can suppress the display cleanly.
// Kept minimal: the accumulation of per-step scores lives in component state;
// only the math is here so it is testable and the component stays thin.
export function averageScore(nums) {
  if (!nums || nums.length === 0) return null;
  const sum = nums.reduce((acc, n) => acc + n, 0);
  return Math.round(sum / nums.length);
}

/* ================= KOCH ADVANCEMENT GATE ================= */
// history is an array of booleans (true = correct answer). Advance when the
// learner has done at least 20 reps AND is at >= 90% rounded accuracy — the
// classic Koch gate.
export function isReadyToAdvance(history) {
  const attempts = history.length;
  if (attempts < 20) return false;
  const accuracy = Math.round((history.filter(Boolean).length / attempts) * 100);
  return accuracy >= 90;
}
