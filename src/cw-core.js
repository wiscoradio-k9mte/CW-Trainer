/* ================= CW CORE ================
   Pure, browser-free functions extracted from wr-cw-trainer.jsx so they can be
   unit-tested in a Node environment without dragging in React or the Web Audio API.

   Dependency order is intentional: each symbol is defined before anything
   that uses it. Do not reorder without re-checking the transitive deps. */

// DX generation pool and station generators are in a separate module because they
// import from the bundled DXCC dataset (src/data/dxcc_dataset.json via
// dxcc-resolve.js).  Keeping dataset imports out of the core avoids pulling the
// 286 kB JSON into unit-test environments that don't need it for non-DX tests.
import { DX_GENERATION_POOL, randDxStation, randDxFieldStation } from './data/dxcc-generation.js';
export { DX_GENERATION_POOL, randDxStation, randDxFieldStation };

// Re-export resolveUSState so the JSX has one import source for all CW utilities.
// (dxcc-resolve is already a transitive dep via dxcc-generation, so no extra load.)
import { resolveUSState } from './data/dxcc-resolve.js';
export { resolveUSState };

// English word frequency pools — two filtered bands for the COPY/KEY English rungs.
// Re-exported here so the JSX has one import source for all CW utilities.
import { COMMON_WORD_POOL, WIDE_WORD_POOL, filterDrillWords } from './data/words-en-pool.js';
export { COMMON_WORD_POOL, WIDE_WORD_POOL, filterDrillWords };

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

// toCodes(text) → [{code: string, displayLen: number} | {wordGap: true, displayLen: number}]
//
// Tokenizes a display string into an array the audio players iterate over.
// Each entry is one of:
//   { code: ".-", displayLen: 1 }    — one character (advances strPos by 1)
//   { code: ".-.-.", displayLen: 2 } — a fused prosign (advances strPos by 2)
//   { wordGap: true, displayLen: 1 } — a space in the original string (advances strPos by 1)
//
// displayLen is the single source of truth for how far to advance strPos in the
// easy-mode live-reveal.  Before this field existed, play() ran its own prosign
// scan over the original string to decide the consumed width; that parallel scan
// matched AR/BT/SK/KN at ANY position, so "ARE YOU", "W9KN", and "CEDAR" all
// triggered a false prosign match and desynchronised the reveal.
//
// Prosigns AR, BT, SK, KN are recognised ONLY when the WHOLE whitespace-
// delimited token equals a PROSIGN_CODES key.  The earlier character-position
// scan fused "AR" inside ordinary words like "ARE", callsign suffixes like
// "W9KN", and place names like "CEDAR RAPIDS" — all wrong.  Prosigns are
// standalone tokens on the air; they never appear mid-word.
//
// Why here instead of inline in the player loop: one tested tokenizer is simpler
// than teaching the audio loop to peek ahead, and it makes the prosign parse
// unit-testable without the Web Audio API.
export function toCodes(text) {
  const upper = text.toUpperCase();
  const result = [];
  // Split on spaces; spaces become wordGap sentinels between tokens.
  const tokens = upper.split(" ");
  tokens.forEach((token, idx) => {
    // Word boundary: insert a wordGap before every token after the first.
    // We must mirror the original behaviour: one gap per space in the input.
    // displayLen:1 because the space occupies one position in the original string.
    if (idx > 0) result.push({ wordGap: true, displayLen: 1 });

    if (token === "") return; // consecutive spaces produce an empty token; skip

    // A whole token that is exactly a prosign key → emit one atomic code.
    // displayLen:2 because the prosign is spelled as two letters in the source text.
    if (PROSIGN_CODES[token] !== undefined) {
      result.push({ code: PROSIGN_CODES[token], displayLen: 2 });
      return;
    }

    // Otherwise emit each character individually (displayLen:1 each).
    for (const ch of token) {
      const code = MORSE[ch];
      if (code) result.push({ code, displayLen: 1 }); // unknown characters are silently skipped
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

// DECODE_PROSIGNS — what the live decoder renders for a code that was keyed as one
// run-together sound.  The app TEACHES and PLAYS BT/AR/SK/KN fused (see the OnAir
// guide and toCodes/PROSIGN_CODES above); the decoder has to be able to read that
// back, or following the instructions grades as an error.
//
// The value is the spelling the app puts on screen, so a correct send matches its
// target character-for-character:
//   ".-.-."  → "AR"  (REV would give "+", the MORSE alias — no target ever shows "+";
//                     the KEY drill and the guide both spell this prosign "AR")
//   "...-.-" → "SK"  (absent from MORSE — no REV entry at all, so it decoded as ■)
//   "-.--."  → "KN"  (same)
//   "-...-"  → left to REV, which yields "=" — that is exactly how the drill and the
//                     QSO scripts spell BT, so no override is needed or wanted.
//
// None of these codes is reachable any other way: MORSE has no other character whose
// code is "...-.-" or "-.--.", and the decoder only ever looks up a whole buffered
// character, so adding them displaces nothing.  "+" is not in KOCH and is not emitted
// by any drill generator or QSO script, so re-pointing ".-.-." costs no target.
export const DECODE_PROSIGNS = {
  ".-.-.": "AR",
  "...-.-": "SK",
  "-.--.": "KN",
};

// decodeChar(code) — the live decoder's single lookup. "■" marks an unrecognised
// pattern so the operator sees WHERE the send went wrong rather than a silent gap.
export function decodeChar(code) {
  return DECODE_PROSIGNS[code] || REV[code] || "■";
}

export const COMMON_WORDS = ["THE","AND","YOU","FOR","ARE","HAM","RIG","ANT","QTH","RST","NAME","TNX","FER","AGN","HW","CPY","WX","HR","ES","DE","UR","73","599","CQ","DX","PWR","WATT","DIPOLE","BAND","CALL","OM","GM","GA","GE","FB","HI","VY","PSE","RPT","NR","TU","POTA","SOTA","IOTA","BK","QRZ","P2P","S2S","EE","QRP","QRS"];
export const QSO_PHRASES = ["CQ POTA CQ POTA DE {ME} K","UR 5NN 5NN BK","BK GM UR 599 599 {ST} {ST} BK","BK TU {ST} 73 EE","CQ SOTA DE {ME}/P","P2P P2P US-4361","S2S S2S","QRZ POTA?","CQ CQ DE {ME}","UR RST 599 599","NAME IS {NAME}","QTH {QTH}","TNX FER CALL","HW CPY?","73 ES GD DX","PSE AGN","RIG IS KX2","ANT IS DIPOLE","WX HR SUNNY","PWR 5 WATTS"];

// stateOf(qth) — pull the trailing two-letter state token out of a QTH like
// "NEWINGTON CT". Returns "" when the QTH carries no such token.
//
// The empty return is load-bearing, not a convenience. This used to fall back to
// "CT", so an operator who typed "MADISON" (or cleared the field) was silently
// REQUIRED to send Connecticut — we asserted a QTH on their behalf, which is
// exactly the kind of thing a ham is expected to state truthfully. When we can't
// resolve one honestly we drop it: `required()` filters the blank out of a step's
// mustContain, and the script builders below omit it from the text rather than
// interpolating a gap (toCodes turns every space into a word gap, so a blank
// substitution would key an audible double pause).
//
// The test is deliberately shape-only (any two letters), not a lookup against the
// 50-state table: it echoes what the operator typed rather than judging it, and a
// token we can't map to a zone is handled downstream by resolveUSState returning
// null.
export const stateOf = (qth) => {
  const tok = (qth || "").trim().split(/\s+/).pop() || "";
  return /^[A-Za-z]{2}$/.test(tok) ? tok.toUpperCase() : "";
};

// Personalize practice/teaching text to the configured operator.
// The whitespace collapse is required, not cosmetic: any of these tokens can
// substitute to "" (Settings is free-form and clearable; {ST} is empty whenever
// the QTH has no state), and a leftover double space would key an extra word gap.
export function subTokens(s, settings) {
  return s
    .replaceAll("{ME}", settings.myCall)
    .replaceAll("{NAME}", settings.myName)
    .replaceAll("{QTH}", settings.myQth)
    .replaceAll("{ST}", stateOf(settings.myQth))
    .replace(/\s+/g, " ")
    .trim();
}

// US domestic pool for randCall() — home station and contest chaser prefixes.
// VE3 is intentionally absent: Canada is a first-class DX entity in this trainer
// (it has call-area rows in DX_GENERATION_POOL).  A Canadian call in the domestic
// pool would produce an incoherent "domestic" partner in ragchew/POTA/SOTA.
export const US_PREFIXES = ["W9","K0","N8","KD9","W1","K4","N5","W7","K6","AC9","KB0","N2","W4"];
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

/* ================= INTERNATIONAL / DX DATA ================= */
//
// DX_GENERATION_POOL and randDxStation are imported from src/data/dxcc-generation.js
// (re-exported above).  The pool is built from the real bundled DXCC dataset —
// no hand-rolled table, no NEEDS-SOURCING markers.

// randPark(prefix) — generates a program-prefixed park reference.
// POTA migrated ALL US parks from the retired callsign-style "K-####" to the
// ISO 3166-1 alpha-2 country code "US-####" in its April-2024 prefix migration
// (see https://docs.pota.app/docs/changes.html — "K-0001" → "US-0001"). The
// field-station table in src/data/dxcc-generation.js already uses the current
// ISO codes (DE, GB, FR, AU, JP, CA); this default keeps the US side on the
// same, current convention instead of the retired one.
// randPark()       → "US-1234"  (US default)
// randPark("DE")   → "DE-0031"  (Germany)
// randPark("VK")   → "VK-0456"  (Australia) — non-US prefixes are unchanged by
//   the migration (POTA's ISO switch only affected the US program).
export const randPark = (prefix = "US") =>
  `${prefix}-${String(1 + Math.floor(Math.random() * 9999)).padStart(4, "0")}`;

// zoneToken(zone, cut) — formats a CQ zone for a contest exchange.
// Zero-pads to two digits, then applies cut-number substitution consistently
// with the rest of the app: 0→T, 9→N.
// zoneToken(5, false)  → "05"
// zoneToken(5, true)   → "T5"
// zoneToken(30, false) → "30"
export const zoneToken = (zone, cut) => cutNum(String(zone).padStart(2, "0"), cut);

// reciprocalCall(hostPrefix, myCall, activitySuffix) — builds the callsign format
// used when operating abroad.  Host prefix comes FIRST (the reverse of domestic
// W1AW/P style), then slash, then the US call, then optional activity suffix.
// reciprocalCall("DL", "N1KB")          → "DL/N1KB"
// reciprocalCall("F", "N1KB", "/P")     → "F/N1KB/P"
// reciprocalCall("SV3", "K4RLC", "/P")  → "SV3/K4RLC/P"
export function reciprocalCall(hostPrefix, myCall, activitySuffix = "") {
  return `${hostPrefix}/${myCall}${activitySuffix}`;
}

// Contest cut numbers: 9 → N, 0 → T (599 → 5NN)
export const cutNum = (s, cut) => (cut ? s.replace(/9/g, "N").replace(/0/g, "T") : s);

export const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const randCall = (prefixes = US_PREFIXES) => {
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

/* ================= SEND GRADING (element-based) =================
   The QSO send grade scores a send on whether each REQUIRED element was
   conveyed in ANY valid on-air form — the ratified real-world model — NOT on
   fidelity to the verbose `suggested` example script (that stays reveal-only).
   Because scoring is a presence test ("was each required element conveyed?"),
   Travis's requirements fall out for free: repetition, surrounding procedural
   signals (DE/K/KN/BK/=/R), word order, extra pleasantries, and a minimal valid
   send are all fine — there is nothing to penalise and nothing to order. The
   score IS the ✓ checklist (one computation), so they can never disagree. */

// On-air spelling equivalence (fork 3): sets of tokens that convey the SAME
// required element. A small EXPLICIT curated table — not fuzzy matching — so it
// stays predictable and Travis can seed more. Any member satisfies a required
// member of the same set (e.g. required "TU" is met by a sent "TNX").
export const COURTESY_EQUIVALENTS = [
  ["TU", "TNX", "TKS"],
  // TEST is short for CONTEST in a contest CQ ("CQ TEST"); the operator may key
  // either spelling, so both satisfy the contest CALL-CQ's required "TEST".
  // Explicit/documentary: with today's substring matcher "TEST" already matches
  // inside "CONTEST", so this pair only bites if the matcher ever goes token-based.
  ["TEST", "CONTEST"],
];

// courtesyForms(token) → accepted spellings for a courtesy literal. Returns
// [token] when the token is in no set, so non-courtesy tokens pass through.
export function courtesyForms(token) {
  const t = String(token).toUpperCase();
  for (const set of COURTESY_EQUIVALENTS) if (set.includes(t)) return set;
  return [t];
}

// numericForms(token) → cut-number equivalents of a pure numeric/cut token:
// 599 ↔ 5NN, 05 ↔ T5. Only fires on a whole [0-9NT] token; a park number like
// "1234" only appears as a substring inside "US-1234", never a whole required
// token, so a park ref is never cut-mangled. Non-numeric tokens pass through.
export function numericForms(token) {
  const t = String(token);
  return /^[0-9NT]+$/.test(t)
    ? [t, t.replace(/9/g, "N").replace(/0/g, "T"), t.replace(/N/g, "9").replace(/T/g, "0")]
    : [t];
}

// isWellFormedRst(token) → true for ANY valid RST report: R∈1–5, S∈1–9, T∈1–9,
// cut numbers (N=9, T=0) accepted. Fork 2: the send credits the RST element for
// any honest report (579, 559, 5NN…), not only the 599 the script models —
// "there are multiple valid ways to give the RST and all must count."
export function isWellFormedRst(token) {
  const decut = String(token).toUpperCase().replace(/N/g, "9").replace(/T/g, "0");
  return /^[1-5][1-9][1-9]$/.test(decut);
}

// isRstReport(token) → the CANONICAL report 599 (or its 5NN cut form). Every
// required RST slot holds exactly this (myRst/rpt = cutNum("599", cut)), so it
// identifies "this required element is the RST" precisely — WITHOUT misclassing
// a contest serial that happens to be RST-shaped (e.g. serial 123 is a valid
// RST shape but is not the report, so it must still be matched literally).
export function isRstReport(token) {
  return String(token).toUpperCase().replace(/N/g, "9").replace(/T/g, "0") === "599";
}

// Fork-2 flag: accept any well-formed RST for the RST element. Flip to false to
// require the literal 599/5NN report only (then the RST slot falls through to
// exact cut-form matching). Data-driven so Travis can adjust before the edge push.
export const RST_ACCEPT_ANY_WELLFORMED = true;

// isBlankElement(el) → true for a required element that carries no content:
// undefined, null, "", or whitespace only. The operator's Settings fields are
// deliberately free-form (they can be cleared), so any PROFILE-DERIVED element
// — callsign, name, QTH-derived state, zone — can in principle arrive blank.
export function isBlankElement(el) {
  return String(el ?? "").trim() === "";
}

// required(...tokens) → a step's `mustContain` list with blank tokens dropped
// and the survivors trimmed.
//
// THIS IS THE REAL FIX for the blank-element grade inflation (F5). An operator
// who clears the Settings Name field turned a step's required list into
// [myRst, ""], and the substring matcher credited the empty token
// unconditionally (`"".includes("")`
// is true in JS) — so half an exchange scored 100% beside a blank, always-ticked
// ✓ row. Filtering at ASSEMBLY means the bad element never exists: nothing to
// render, nothing to grade, and the score denominator counts only real
// requirements, so what IS asked for still reaches 100%. gradeSend carries a
// matching guard (below) to make the contract explicit for future callers.
//
// Settings stays free-form on purpose — the defect is ours, not the operator's,
// so the remedy lives here and not in an input validator.
export function required(...tokens) {
  return tokens.filter((t) => !isBlankElement(t)).map((t) => String(t).trim());
}

// gradeSend(requiredElements, sent, opts) → { score, hits, missing }
// score = round(hits / required × 100), coarse by design (fork 5): with one
// required element it is 0 or 100; with two, 0 / 50 / 100. `hits`/`missing`
// preserve the original required tokens (original case) for the ✓/✗ render.
//
// score is `null` — NOT 0 — when there is nothing to require. A step reduced to
// an empty list (the `[myCall]` ANSWER steps when the operator has cleared their
// callsign) is unscoreable, and a flat 0% would be an unreachable zero: the
// operator could send a perfect over and still be told they failed. `null` is the
// caller's cue to render a stated non-scored state instead of a grade.
export function gradeSend(requiredElements, sent, opts = {}) {
  const acceptAnyRst = opts.acceptAnyRst ?? RST_ACCEPT_ANY_WELLFORMED;
  const norm = String(sent).trim().toUpperCase().replace(/\s+/g, " ");
  const tokens = norm ? norm.split(" ") : [];
  const flat = norm.replace(/\s+/g, "");
  const sentHasRst = tokens.some(isWellFormedRst);

  const isConveyed = (el) => {
    // 0. A blank element can never be conveyed. Guard first, because every branch
    //    below would credit it: `flat.includes("")` is unconditionally true, and
    //    `numericForms("")`/`courtesyForms("")` both pass "" straight through.
    //    Shipped scripts can't reach here (`required()` filters at assembly), so a
    //    blank arriving means a caller built its list wrong — count it MISSING and
    //    let the resulting sub-100 score make that loud, rather than silently
    //    forgiving a malformed list and re-inflating the grade.
    if (isBlankElement(el)) return false;
    const E = String(el).toUpperCase();
    // 1. RST slot (the canonical 599 report): any well-formed report counts.
    if (acceptAnyRst && isRstReport(E)) return sentHasRst;
    // 2. Courtesy literal: any curated-equivalent spelling counts.
    const courtesy = courtesyForms(E);
    if (courtesy.length > 1) return courtesy.some((f) => flat.includes(f));
    // 3. Everything else (callsign, park, state, name, zone, serial, 73, and the
    //    CALL-CQ "CQ" / activity qualifier): the token in any cut-number form, as
    //    a substring of the space-stripped send — so repetition / adjacency /
    //    surrounding signals are all fine. Accepted edge (per design): a required
    //    "CQ" also matches when the operator's OWN callsign contains the letters
    //    "CQ" — vanishingly rare, and the same substring edge every element carries.
    return numericForms(E).some((f) => flat.includes(f.replace(/\s+/g, "")));
  };

  const hits = [];
  const missing = [];
  for (const el of requiredElements) (isConveyed(el) ? hits : missing).push(el);
  const score = requiredElements.length
    ? Math.round((hits.length / requiredElements.length) * 100)
    : null;
  return { score, hits, missing };
}

// CUT_TOKEN_RE — a whole token made of nothing but cut-number material ([0-9NT])
// that carries at least one real digit: "5NN", "599", "T5", "TT1", "T1T".
//
// The token must be WHOLE. Cut numbers occupy the number slots of a QSO exchange —
// an RST, a serial, a zone. They are NEVER used inside a callsign on the air: the N
// in N4ABC is the letter N, always. Matching a mere [0-9NT]+ RUN anywhere in the
// string (the pre-2.4.0-fix rule) rewrote N4ABC → 94ABC on BOTH sides of the
// comparison, so a learner who copied the wrong callsign was told it was perfect.
// An audit measured 29.2% of generated callsign targets altered that way.
const CUT_TOKEN_RE = /^[0-9NT]*[0-9][0-9NT]*$/;

// canonicalizeCw(s, {cut}) — normalisation for the COPY/KEY/QSO-copy FIDELITY paths:
// uppercase, collapse whitespace, and — when `cut` is on — apply the cut-number
// equivalence to whole cut tokens only (5NN→599, T5→05, TT1→001). Everything else
// is left exactly as sent: callsigns, letter groups, and any digit-free run (NAME,
// TU, TNX, NN, TT, KN, CONTEST). Fork 4: cut-number + whitespace + case only on the
// fidelity paths; NO semantic abbrev equivalence there (copy = write what was sent).
export function canonicalizeCw(s, { cut = true } = {}) {
  const norm = String(s).trim().toUpperCase().replace(/\s+/g, " ");
  if (!cut) return norm;
  return norm
    .split(" ")
    .map((token) =>
      CUT_TOKEN_RE.test(token) ? token.replace(/N/g, "9").replace(/T/g, "0") : token
    )
    .join(" ");
}

// similarityCw(a, b, {cut}) — edit-distance fidelity score with cut-number tolerance.
// Used by COPY/KEY/QSO-copy so copying 5NN for 599 (or T for 0) isn't penalised.
//
// `cut` defaults to true (the exchange case, and what QSO copy always wants). Pass
// {cut:false} on a rung whose content has no exchange numbers in it — see
// CUT_TOLERANT_COPY_SOURCES / CUT_TOLERANT_KEY_DRILLS below.
export function similarityCw(a, b, { cut = true } = {}) {
  return similarity(canonicalizeCw(a, { cut }), canonicalizeCw(b, { cut }));
}

// Which rungs get the cut-number equivalence at all.
//
// The whole-token rule above is what stops a callsign being rewritten, and it holds
// everywhere. These two sets are the second layer: they switch the equivalence OFF
// entirely on rungs whose content contains no exchange numbers, so the residual
// ambiguous case — a token that is ALL cut material yet is not an exchange number,
// e.g. the callsign N8NT or a random letter group "N4T" on the COPY groups rung —
// cannot be leniently matched there either.
//
// Membership is by content, not by difficulty:
//   COPY "hamwords" carries 599/73; COPY "phrases" carries a literal "UR 5NN 5NN BK"
//   (and the operator's own callsign — which is exactly why the whole-token rule has
//   to do the callsign work even on a cut-tolerant rung).
//   KEY numbers/rst/qso/dxexch/contest all run their content through cutNum().
// Every other rung — callsigns, DX calls, reciprocal calls, split/pileup fragments,
// CQ calls, words, Q-codes, prosigns, letter groups — is graded strictly.
export const CUT_TOLERANT_COPY_SOURCES = new Set(["hamwords", "phrases"]);
export const CUT_TOLERANT_KEY_DRILLS = new Set(["numbers", "rst", "qso", "dxexch", "contest"]);

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

// Drill: common English words — repointed to the top-500 frequency pool.
// Words are lowercase in the JSON; uppercase them for the CW display.
// Was rand(COMMON_WORDS): that curated ham-vocabulary pool is now the KEY/COPY
// "hamwords" rung (unchanged); this rung is now English frequency content.
//
// `n` defaults to 3 (KEY); COPY passes 4 for a slightly longer target.
// DRILL_CATEGORIES calls cat.gen(settings) with a settings object — the typeof
// guard treats any non-number first arg as "use default count=3", keeping the
// calling convention compatible without a separate function per surface.
export function drillCommonWords(n = 3) {
  const count = typeof n === 'number' ? n : 3;
  return Array.from({ length: count }, () => rand(COMMON_WORD_POOL).toUpperCase()).join(" ");
}

// Drill: wider English vocabulary — ranks 1001-5000 (harder rung).
// Same n parameterization as drillCommonWords (KEY default=3, COPY passes 4).
export function drillWiderWords(n = 3) {
  const count = typeof n === 'number' ? n : 3;
  return Array.from({ length: count }, () => rand(WIDE_WORD_POOL).toUpperCase()).join(" ");
}

// Drill: full QSO line — verbatim from the original KeyTrainer branch.
export function drillQsoLine(settings) {
  return subTokens(rand(QSO_PHRASES), settings);
}

/* ================= DX DRILL GENERATORS (Phase 1) ================= */
//
// Five new categories placed after Callsigns — the DX rungs are harder than
// domestic callsigns because they combine international prefixes, cut numbers,
// and split/pileup conventions that require DX-specific knowledge.

// Drill: 1–3 DX callsigns drawn from DX_GENERATION_POOL.  Mirrors drillCallsign
// but uses international prefixes so every call is a real foreign station.
export function drillDxCallsigns(settings) {
  const count = [1, 1, 2, 2, 3][Math.floor(Math.random() * 5)];
  return Array.from({ length: count }, () => randDxStation().call).join(" ");
}

// Drill: DX signal-report exchanges.  5NN is the near-universal DX convention
// (not an honest report); the zone comes from the generation pool — a real zone,
// so "5NN 25" is Japan (zone 25), not an invented number.
export function drillDxExchange(settings) {
  const cut = settings.cutNumbers;
  const rst = cutNum("599", cut);      // 5NN with cut on, 599 with cut off
  const zone = zoneToken(randDxStation().cqZone, cut);
  const variants = [
    rst,                                // bare report — simplest
    `${rst} ${zone}`,                   // RST + CQ zone (CQ WW style)
    `TU ${rst}`,                        // confirming contact
    `${rst} TU`,                        // common "report then TU" order
  ];
  return rand(variants);
}

// Drill: contest fragments — the short tokens you hear most often during a CW
// contest weekend.  Fixed phrases plus a WPX-style serial (cut-aware).
export function drillContestFragments(settings) {
  const cut = settings.cutNumbers;
  const rst = cutNum("599", cut);
  // Build a random serial 001–099; cut it (0→T, so 001 → TT1, 010 → T1T).
  const serial = cutNum(String(1 + Math.floor(Math.random() * 99)).padStart(3, "0"), cut);
  const fixed = ["CQ TEST", "CQ DX", "QRZ?", "AGN", "NR"];
  const serials = [`${rst} ${serial}`, `${rst} TU`];
  const pool = [...fixed, ...serials, ...serials]; // weight serials higher
  return rand(pool);
}

// Drill: split & pileup fragments.  Teaches the caller-moves mechanic and
// pileup brevity.  QSX is intentionally ABSENT (rarely heard on modern CW —
// see the LINGO DX glossary where it is defined as a read-only reference).
export function drillSplitPileup(settings) {
  // A bare DX callsign — correct pileup practice (send only your call).
  const dxCall = randDxStation().call;
  // Partial-call format: first letter of a random call + "? KN"
  const partial = randDxStation().call[0] + "? KN";
  const fragments = [
    "UP",
    "UP 5",
    "UP 5 TO 10",
    dxCall,          // bare call — pileup etiquette
    partial,         // partial call + KN ("W4? KN")
    "QRZ?",
  ];
  return rand(fragments);
}

// Drill: reciprocal / abroad callsigns.  Teaches the host-prefix-FIRST convention
// using the operator's own call so the format is immediately personal.
// Uses entityPrefix (e.g. "VK", "DL") not a call-area prefix (e.g. "VK2") —
// the reciprocal format targets the country, which is what the LEARN guide teaches.
export function drillReciprocalCalls(settings) {
  const myCall = settings.myCall || "W1AW";
  const hostPrefix = rand(DX_GENERATION_POOL).entityPrefix;
  const suffixOptions = ["", "", "/P", "/M"];   // blank weighted — bare is most common
  const suffix = rand(suffixOptions);
  return reciprocalCall(hostPrefix, myCall, suffix);
}

// Registry: single source of truth for the UI ladder AND the direct-pick row.
// Array order IS the ladder (simplest → hardest). The UI renders this directly;
// adding a category is a one-line change here.
//
// Reordered in v1.1 UAT pass (B1): previous order had Callsigns first, which was
// the hardest category — wrong for a first-run learner.  Common words are the
// gentlest start; callsigns are the hardest (variable length, no common patterns).
// Item 8 (v2.0): Q-codes & abbrev moved before Prosigns — Q-codes appear far
// more often on the air than prosigns, so they're the better step up from
// Common words. Prosigns are less frequent and slightly harder to memorize.
// catIdx is NOT persisted, so no state migration is needed (useState(0) resets
// each mount). Tests that pin labels by index are updated in this commit.
//
// Items 9–13 (Phase 1, intl-dx-p1): five DX rungs appended after Callsigns.
// They sit at the hard end of the ladder — they require knowing DX conventions,
// international prefixes, and split/pileup behaviour before they make sense.
export const DRILL_CATEGORIES = [
  { id: "words",     label: "Common words",        gen: drillCommonWords },
  { id: "wordswide", label: "Wider vocabulary",    gen: drillWiderWords },
  { id: "qcodes",    label: "Q-codes & abbrev",    gen: drillQCodes },
  { id: "prosigns",  label: "Prosigns",            gen: drillProsigns },
  { id: "numbers",   label: "Numbers (incl. cut)", gen: drillNumbers },
  { id: "rst",       label: "RST & exchanges",     gen: drillRstExchange },
  { id: "cq",        label: "Calling CQ",          gen: drillCallingCq },
  { id: "qso",       label: "Full QSO lines",      gen: drillQsoLine },
  { id: "callsigns", label: "Callsigns",           gen: drillCallsign },
  // DX rungs — harder end of the ladder; require LINGO DX knowledge first.
  { id: "dxcalls",   label: "DX callsigns",        gen: drillDxCallsigns },
  { id: "dxexch",    label: "DX exchanges",        gen: drillDxExchange },
  { id: "contest",   label: "Contest fragments",   gen: drillContestFragments },
  { id: "split",     label: "Split & pileup",      gen: drillSplitPileup },
  { id: "recip",     label: "Abroad callsigns",    gen: drillReciprocalCalls },
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

   NOT-MEASURED RULE (load-bearing, one rule for every verdict this returns):
   a verdict is `null` when the thing was never measured — the drill contained
   no gaps of that class (a callsign has no word gaps), or the key mode
   machine-times them so the operator never controlled it. `null` is NOT a
   verdict; every surface must omit the reading rather than render it. Before
   this rule the unmeasured case returned "good", so PROGRESS praised operators
   for word spacing they had never sent — fabricated progress.

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
      // Nothing was keyed, so nothing was measured — no verdicts (see the
      // NOT-MEASURED RULE above).
      spacing: {
        element:   { ratio: null, verdict: null },
        character: { ratio: null, verdict: null },
        word:      { ratio: null, verdict: null },
      },
      weighting: { ratio: null, verdict: null },
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
    if (ratio === null) return null; // never measured → no verdict (see NOT-MEASURED RULE)
    const deviation = Math.abs(ratio - ideal) / ideal;
    if (deviation <= FIST_TOLERANCE) return "good";
    return ratio > ideal ? "loose" : "tight";
  };

  const elemRatio  = median(elementGaps);  // ideal 1u
  const charRatio  = median(charGaps);     // ideal 3u
  const wordRatio  = median(wordGaps);     // ideal 7u

  // Paddle and bug keyers machine-time intra-character dit spacing — only the
  // operator controls when to start the next character or word. Those gaps are
  // the machine's, not the operator's fist, so neither the ratio nor a verdict
  // is reported: it is a not-measured reading, the same shape as suppressed
  // paddle weighting below.
  const elementMachineTimed = keyType === "paddle" || keyType === "bug";
  const elementSpacing = elementMachineTimed
    ? { ratio: null, verdict: null }
    : { ratio: elemRatio, verdict: verdict(elemRatio, 1) };
  const charVerdict = verdict(charRatio, 3);
  const wordVerdict = verdict(wordRatio, 7);

  // B3: dah weighting — median dah vs 3×unit.
  // Suppressed for paddle (dahs machine-timed 3u; verdict is meaningless).
  // Bug dahs are hand-timed (the point of bug practice) so weighting IS computed —
  // "bug" must NOT match the paddle suppression check here.
  const dahs = events.filter((e) => e.type === "dah").map((e) => e.durMs);
  let weighting;
  if (keyType === "paddle" || unitMs <= 0) {
    // Suppressed for paddle — paddle timing is machine-controlled, not operator fist.
    weighting = { ratio: null, verdict: null };
  } else if (dahs.length === 0) {
    // No dahs sent — can't assess weighting (all-dit sequence).
    weighting = { ratio: null, verdict: null };
  } else {
    const sortedDahs = [...dahs].sort((a, b) => a - b);
    const m = Math.floor(sortedDahs.length / 2);
    const medDah = sortedDahs.length % 2 === 0
      ? (sortedDahs[m - 1] + sortedDahs[m]) / 2
      : sortedDahs[m];
    const dahRatio = medDah / unitMs; // ideal 3
    weighting = { ratio: dahRatio, verdict: verdict(dahRatio, 3) };
  }

  // Notes are problem-only: a null verdict (never measured) and a "good" verdict
  // both produce nothing to say, so every guard here tests for a real non-good
  // verdict rather than "!== good" alone.
  const notes = [];
  // Element-spacing note is absent for paddle and bug — the verdict is null there.
  if (elementSpacing.verdict && elementSpacing.verdict !== "good") {
    notes.push(`element spacing ${elementSpacing.verdict} (measured ${elementSpacing.ratio.toFixed(1)}u, ideal 1u)`);
  }
  if (charVerdict && charVerdict !== "good") {
    const dir = charVerdict === "loose" ? "too long" : "too short";
    notes.push(`you're pausing ${dir} between letters (${charRatio.toFixed(1)}u, ideal 3u)`);
  }
  if (wordVerdict && wordVerdict !== "good") {
    const dir = wordVerdict === "loose" ? "too long" : "too short";
    notes.push(`word spacing is ${dir} (${wordRatio.toFixed(1)}u, ideal 7u)`);
  }
  // B3: plain-English weighting note — bug mode keeps this (hand-timed dahs).
  if (weighting.verdict && weighting.verdict !== "good") {
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
      element:   elementSpacing,
      character: { ratio: charRatio,  verdict: charVerdict },
      word:      { ratio: wordRatio,  verdict: wordVerdict },
    },
    weighting,
    notes,
  };
}

/* ================= CQ FORMAT HELPER ================= */
// Real CW CQ calling is inconsistent — operators vary how many times they repeat
// their call depending on conditions, habit, and how busy the band is. This helper
// models three common forms so the simulator presents varied CQ formats rather than
// the same fixed string every session, which would train rote recognition instead of
// real-ear copy.
//
// Variants (matching on-air practice per ARRL and POTA/SOTA operator surveys):
//   3×3: "CQ CQ CQ <TAG> DE <call> <call> <call> <suffix> K"  (long, slower bands)
//   3×2: "CQ CQ CQ <TAG> DE <call> <call> <suffix> K"         (most common)
//   terse: "CQ <TAG> DE <call> <suffix> K"                     (quick, busy bands)
//
// activity: "ragchew"|"pota"|"sota"|"iota" — omitted for ragchew, prepended otherwise.
// call: the caller's sign as it sounds on the air (includes /P for SOTA activator).
// suffix: optional string appended after the call repetitions, before K
//   (used for SOTA summit ref and IOTA island ref that chasers listen for).
//
// Returns a complete CQ line string.
export function cqCall(activity, call, suffix = "") {
  const tag = activity === "ragchew" ? "" : activity.toUpperCase();
  // Compose the middle section: optional tag + "DE" + repeated call + optional suffix.
  // Tag and suffix are only added when non-empty.
  const tagStr    = tag    ? ` ${tag}` : "";
  const suffixStr = suffix ? ` ${suffix}` : "";

  const v = Math.floor(Math.random() * 3); // 0, 1, or 2
  if (v === 0) return `CQ CQ CQ${tagStr} DE ${call} ${call} ${call}${suffixStr} K`;
  if (v === 1) return `CQ CQ CQ${tagStr} DE ${call} ${call}${suffixStr} K`;
  // Terse variant: two CQs, one call — a quick call on a busy band.  A bare single
  // "CQ DE {call} K" is not a real on-air call (one CQ isn't enough to get tuned in);
  // two CQs is the minimum that's actually done in practice.
  return             `CQ CQ${tagStr} DE ${call}${suffixStr} K`;
}

/* ================= QSO SIMULATOR ================= */
/* Contact scripts follow current on-air practice:
   - Ragchew: 3x2 CQ, BT (=) separators, KN to hold the frequency, SK + dit-dit to close.
   - POTA: hunters send their call ONCE — no DE, no K. Short exchange with BK turnovers,
     state as QTH, activator closes "TU <state> 73 EE". US park refs use the US-
     prefix (e.g. US-1234, the current ISO code since POTA's April-2024 migration —
     see randPark() above); international parks carry their own prefix (e.g. DE-0031).
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
  dx:      [["callcq", "Call CQ DX"], ["hunt", "Hunt the DX"]],
  contest: [["run", "Running (CQ TEST)"], ["sp", "Search & pounce"]],
};

export function buildRagchew({ myCall, myName, myQth, cut }, role = "answer") {
  const dx = randCall();
  const name = rand(NAMES);
  const qth = rand(QTHS);
  const rst = cutNum(rand(RSTS), cut);
  const myRst = cutNum("599", cut);

  // Answering role: you hear the DX call CQ, then you answer.
  if (role === "answer") {
    // The CQ format varies per cqCall — 3×3, 3×2, or terse. The copy hint is
    // kept generic so it stays accurate for all three variants.
    const dxCq = cqCall("ragchew", dx);
    return {
      dx, flavor: "RAGCHEW",
      summary: `Worked ${dx} — ${name} in ${qth}, ${rst} out. A proper sit-down QSO.`,
      steps: [
        {
          who: "dx",
          text: dxCq,
          copyHint: "A CQ — the callsign is what matters. You may hear it two or three times.",
        },
        {
          who: "you",
          suggested: `${dx} DE ${myCall} ${myCall} K`,
          prompt: "Answer the CQ — their call once, DE, your call twice, K.",
          mustContain: required(myCall),
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
          mustContain: required(myRst, myName),
        },
        {
          who: "dx",
          text: `R FB ${myName} = TNX FER FB QSO = 73 ES HPE CUAGN ${myCall} DE ${dx} SK EE`,
          copyHint: "The sign-off — SK closes the contact, and the dit-dit (EE) is the handshake.",
        },
      ],
    };
  }

  // Calling role: you call CQ and run the exchange.
  // The exchange content mirrors the answering side but the speakers are swapped.
  // cqCall generates a realistic varied format; all variants contain myCall.
  return {
    dx, flavor: "RAGCHEW",
    summary: `Called CQ, worked ${dx} — ${name} in ${qth}. A proper sit-down QSO.`,
    steps: [
      {
        who: "you",
        suggested: cqCall("ragchew", myCall),
        prompt: "Call CQ — CQ, DE, your call, K. The number of repeats varies by habit and conditions.",
        // CALL-CQ archetype: calling CQ requires "CQ" AND your callsign. A bare
        // callsign is how you ANSWER a CQ, not how you call one — so this differs
        // intentionally from the answer steps below, which require [myCall] only.
        mustContain: required("CQ", myCall),
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
        mustContain: required(myRst, myName),
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
        mustContain: required("TU", "73"),
      },
    ],
  };
}

export function buildPota({ myCall, myQth, cut }, role = "hunter", opts = {}) {
  // myState is "" when the operator's QTH has no state token (see stateOf). The
  // POTA exchange is the one script that carries it, so the state is dropped from
  // the send, from the graded elements, and from the activator's reply rather than
  // substituted — we won't put a state the operator never gave on their air.
  const myState = stateOf(myQth);
  const stateTwice = myState ? ` ${myState} ${myState}` : "";
  const stateOnce  = myState ? ` ${myState}` : "";
  const statePhrase = myState ? ", your state twice" : "";
  const dx = randCall();
  const rst = cutNum(rand(RSTS), cut);
  const myRst = cutNum("599", cut);
  const park = randPark();

  // Hunter (answering) role: you hear the POTA activator call CQ.
  // A2 (v1.1): POTA activators do NOT send the park ref in the CQ — it goes in
  // the log. The CQ format varies via cqCall; all variants contain "POTA".
  if (role === "hunter") {
    // P2P variant: both stations are activating in different parks.
    // Exchange swaps your US state for your park ref — both parks end up on air.
    if (opts.p2p) {
      const field = randDxFieldStation();
      const myPark = randPark();
      const dxCq = cqCall("pota", field.call);
      return {
        dx: field.call, flavor: "POTA",
        summary: `P2P — worked ${field.entity} (${field.call}) at ${field.potaRef}. Your park: ${myPark}. Both in the log.`,
        steps: [
          {
            who: "dx",
            text: dxCq,
            copyHint: `A DX park activator (${field.entity}). Grab the call — both of you are activating.`,
          },
          {
            who: "you",
            suggested: `${myCall}`,
            prompt: "P2P — your callsign once, same as any POTA pileup.",
            mustContain: required(myCall),
          },
          {
            who: "dx",
            text: `${myCall} GM UR ${rst} ${rst} BK`,
            copyHint: "Your report twice, BK.",
          },
          {
            who: "you",
            suggested: `BK GM UR ${myRst} ${myRst} ${myPark} ${myPark} BK`,
            prompt: "BK, greeting, their report, your park ref twice. P2P exchanges park refs, not states.",
            mustContain: required(myRst, myPark),
          },
          {
            who: "dx",
            text: `BK TU ${myPark} 73 ${field.potaRef} DE ${field.call} EE`,
            copyHint: `Copy their park ref (${field.potaRef}) — that's what goes in YOUR log.`,
          },
        ],
      };
    }

    // DX variant: the activator is an international station (DX prefix).
    // Exchange grammar is the same; you still send your US state.
    // The DX station closes with "TU 73" (no US-state-as-handle).
    if (opts.dx) {
      const dxStation = randDxStation();
      const dxCall = dxStation.call;
      const dxCq = cqCall("pota", dxCall);
      return {
        dx: dxCall, flavor: "POTA",
        summary: `DX hunt — worked ${dxStation.entity} (${dxCall}). In the log.`,
        steps: [
          {
            who: "dx",
            text: dxCq,
            copyHint: `A DX park activator (${dxStation.entity}). Same pileup protocol, exotic prefix.`,
          },
          {
            who: "you",
            suggested: `${myCall}`,
            prompt: "Your callsign once — pileup protocol is the same regardless of where they're activating.",
            mustContain: required(myCall),
          },
          {
            who: "dx",
            text: `${myCall} GM UR ${rst} ${rst} BK`,
            copyHint: "Report twice, BK.",
          },
          {
            who: "you",
            suggested: `BK GM UR ${myRst} ${myRst}${stateTwice} BK`,
            prompt: `BK, their report${statePhrase}, BK. Exchange grammar is identical to domestic.`,
            mustContain: required(myRst, myState),
          },
          {
            who: "dx",
            text: `BK TU 73 DE ${dxCall} EE`,
            copyHint: "TU 73 — a DX activator won't use your state as a handle; they just close.",
          },
        ],
      };
    }

    // Domestic hunter (default): works a US activator.
    const dxCq = cqCall("pota", dx);
    return {
      dx, flavor: "POTA",
      summary: `Hunted ${dx} at ${park} — ${rst} from the park. In the log.`,
      steps: [
        {
          who: "dx",
          text: dxCq,
          copyHint: "A park activator calling CQ. Grab the callsign — the park ref isn't sent on the air, the activator logs it.",
        },
        {
          who: "you",
          suggested: `${myCall}`,
          prompt: "POTA protocol: send your callsign ONCE. No DE, no K — you're one voice in a pileup.",
          mustContain: required(myCall),
        },
        {
          who: "dx",
          text: `${myCall} GM UR ${rst} ${rst} BK`,
          copyHint: "Short and sweet — your report twice, then BK turns it back to you.",
        },
        {
          who: "you",
          suggested: `BK GM UR ${myRst} ${myRst}${stateTwice} BK`,
          prompt: `BK back, greeting, their report${statePhrase}, BK. That's the whole exchange.`,
          mustContain: required(myRst, myState),
        },
        {
          who: "dx",
          text: `BK TU${stateOnce} 73 DE ${dx} EE`,
          copyHint: myState
            ? "Activators often use your state as your handle — TU, your state, 73, dit-dit, next hunter."
            : "TU, 73, dit-dit, next hunter. (Put a state in your QTH and the activator will use it as your handle.)",
        },
      ],
    };
  }

  // Activator role: you call CQ POTA and run the exchange.
  // On the air the park reference (K-XXXX) is NOT sent — it goes in the log.
  // cqCall generates a realistic varied POTA CQ; all variants include myCall.
  const dxState = stateOf(rand(QTHS));
  const dxRst   = cutNum(rand(RSTS), cut);
  return {
    dx, flavor: "POTA",
    summary: `Activated — ${dx} hunted you. Park in the log. Exchange complete.`,
    steps: [
      {
        who: "you",
        suggested: cqCall("pota", myCall),
        prompt: `Call CQ POTA. The park reference (${park}) goes in your log, not on the air.`,
        mustContain: required("CQ", "POTA", myCall),
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
        mustContain: required(myRst),
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
        mustContain: required("TU"),
      },
    ],
  };
}

export function buildSota({ myCall, cut }, role = "chaser", opts = {}) {
  const dx = randCall();
  const rst = cutNum(rand(RSTS), cut);
  const myRst = cutNum("599", cut);
  const summit = rand(SUMMITS);

  // Chaser (answering) role: you hear the SOTA activator call CQ.
  // The activator signs /P and includes the summit ref in the CQ so chasers can
  // log it. The summit ref is passed as the suffix to cqCall.
  if (role === "chaser") {
    // S2S variant: both stations are activating on different summits.
    // You sign /P; your US summit ref is exchanged on air.
    if (opts.p2p) {
      const field = randDxFieldStation();
      const mySummit = rand(SUMMITS);
      const dxCq = cqCall("sota", `${field.call}/P`, field.sotaRef);
      return {
        dx: field.call, flavor: "SOTA",
        dxSigned: `${field.call}/P`,
        summary: `S2S with ${field.entity} (${field.call}/P) on ${field.sotaRef} — ${rst}. Your summit: ${mySummit}.`,
        steps: [
          {
            who: "dx",
            text: dxCq,
            copyHint: `A DX summit activator — the ref in the CQ (${field.sotaRef}) goes in your log. Note the /P.`,
          },
          {
            who: "you",
            suggested: `${myCall}/P`,
            prompt: "S2S: send your call signing /P — you're also activating. Callsign once.",
            mustContain: required(myCall),
          },
          {
            who: "dx",
            text: `${myCall} GM UR ${rst} ${rst} BK`,
            copyHint: "Your report twice, BK — same terse pace as any SOTA.",
          },
          {
            who: "you",
            suggested: `BK R R UR ${myRst} ${myRst} ${mySummit} TU`,
            prompt: "Roger, their report, your summit ref, TU. S2S: both refs get logged.",
            mustContain: required(myRst, mySummit),
          },
          {
            who: "dx",
            text: `BK TU ES 73 DE ${field.call}/P EE`,
            copyHint: "TU, 73, and the dit-dit — your S2S logs their ref, they log yours.",
          },
        ],
      };
    }

    // DX variant: the activator is on a summit abroad.
    // Exchange is identical to domestic chaser — grab the call, report back.
    if (opts.dx) {
      const dxStation = randDxFieldStation(); // field station so call/summit are coherent
      const dxCall = dxStation.call;
      const dxCq = cqCall("sota", `${dxCall}/P`, dxStation.sotaRef);
      return {
        dx: dxCall, flavor: "SOTA",
        dxSigned: `${dxCall}/P`,
        summary: `Chased ${dxStation.entity} (${dxCall}/P) on ${dxStation.sotaRef} — ${rst}. New entity.`,
        steps: [
          {
            who: "dx",
            text: dxCq,
            copyHint: `DX summit activator — ${dxStation.entity}. Grab the call; the summit ref is in the CQ.`,
          },
          {
            who: "you",
            suggested: `${myCall}`,
            prompt: "Chase it — your callsign once. SOTA pileup protocol is the same everywhere.",
            mustContain: required(myCall),
          },
          {
            who: "dx",
            text: `${myCall} GM UR ${rst} ${rst} BK`,
            copyHint: "QRP from a DX peak — copy the report.",
          },
          {
            who: "you",
            suggested: `BK R R UR ${myRst} ${myRst} TU`,
            prompt: "Roger, their report, TU. Short is right — they're on battery.",
            mustContain: required(myRst),
          },
          {
            who: "dx",
            text: `BK TU ES 73 DE ${dxCall}/P EE`,
            copyHint: "TU 73 and the dit-dit. New entity in the log.",
          },
        ],
      };
    }

    // Domestic chaser (default): works a US activator.
    const dxCq = cqCall("sota", `${dx}/P`, summit);
    return {
      dx, flavor: "SOTA",
      // dxSigned: the other station's call as it appears on-air (activator signs /P)
      dxSigned: `${dx}/P`,
      summary: `Chased ${dx}/P on ${summit} — ${rst}. Summit in the log.`,
      steps: [
        {
          who: "dx",
          text: dxCq,
          copyHint: "A summit activator, signing portable. The slash-P and the summit ref are the tells.",
        },
        {
          who: "you",
          suggested: `${myCall}`,
          prompt: "Chase it — your callsign once, like a POTA pileup.",
          mustContain: required(myCall),
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
          mustContain: required(myRst),
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
  // You sign /P. The summit reference goes in the CQ — chasers expect it there.
  // cqCall is given the portable call and the summit ref as suffix.
  const dxRst = cutNum(rand(RSTS), cut);
  return {
    dx, flavor: "SOTA",
    summary: `Activated ${summit} — worked ${dx} as a chaser. Summit complete.`,
    steps: [
      {
        who: "you",
        suggested: cqCall("sota", `${myCall}/P`, summit),
        prompt: `Call CQ SOTA signing portable. Summit ref ${summit} goes in the CQ — chasers expect it there.`,
        mustContain: required("CQ", "SOTA", myCall),
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
        mustContain: required(myRst),
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
        mustContain: required("TU"),
      },
    ],
  };
}

export function buildIota({ myCall, cut }, role = "chaser") {
  const dx = randCall(IOTA_DX_PREFIXES);
  const ref = rand(IOTA_REFS);
  const rpt = cutNum("599", cut);

  // Chaser (answering) role: you hear the IOTA island station call CQ.
  // The ref follows the call in the CQ — passed as suffix to cqCall.
  if (role === "chaser") {
    const dxCq = cqCall("iota", dx, ref);
    return {
      dx, flavor: "IOTA",
      summary: `Worked ${dx} on ${ref} — 599 to the island. New one for the log.`,
      steps: [
        {
          who: "dx",
          text: dxCq,
          copyHint: "An island station — DX prefix, and the ref is continent-number (NA, EU, OC...).",
        },
        {
          who: "you",
          suggested: `${myCall}`,
          prompt: "DX-style pileup — your callsign once, then listen hard.",
          mustContain: required(myCall),
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
          mustContain: required(rpt),
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
  // The island ref follows the call in the CQ — passed as suffix to cqCall.
  const chaser = randCall(US_PREFIXES);
  const myRpt = cutNum("599", cut);
  return {
    dx: chaser, flavor: "IOTA",
    summary: `Activated ${ref} — ${chaser} in the log. Island QSO complete.`,
    steps: [
      {
        who: "you",
        suggested: cqCall("iota", myCall, ref),
        prompt: `Call CQ IOTA with your island ref ${ref}. Contest pace.`,
        mustContain: required("CQ", "IOTA", myCall),
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
        mustContain: required(myRpt),
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
        mustContain: required("TU"),
      },
    ],
  };
}

/* ================= WORK DX ================= */
/* Terse DX pileup exchange: DX CQ → you call → 5NN exchange → QRZ.
   No names, no QTH — fast and to the point, like a real DX pileup.

   opts.split (hunt role only): adds "UP 5 TO 10" to the DX CQ step so the
   trainee copies the QSX directive.  Presentational only — no real frequency
   offset is modeled; this trains copy, not dial control. */

export function buildDx({ myCall, cut }, role = "hunt", opts = {}) {
  const dxStation = randDxStation();
  const dxCall = dxStation.call;
  const rpt = cutNum("599", cut);

  // Hunt role: you hear a DX station calling CQ DX and answer.
  if (role === "hunt") {
    const baseCq = cqCall("dx", dxCall);
    // Split: append QSX directive to the CQ text only — no change to mustContain.
    const dxCqText = opts.split ? `${baseCq} UP 5 TO 10` : baseCq;
    const step2Prompt = opts.split
      ? "They're listening UP — throw your call on the split frequency."
      : "Terse pileup answer — your call once, then listen.";
    return {
      dx: dxCall, flavor: "DX",
      summary: `Worked ${dxStation.entity} (${dxCall}) — 5NN out.`,
      steps: [
        {
          who: "dx",
          text: dxCqText,
          copyHint: `DX CQ — the prefix names the country (${dxStation.entity}). The call is everything.`,
        },
        {
          who: "you",
          suggested: `${myCall}`,
          prompt: step2Prompt,
          mustContain: required(myCall),
        },
        {
          who: "dx",
          text: `${myCall} ${rpt}`,
          copyHint: "5NN is convention on DX — they didn't measure your signal, and neither did you.",
        },
        {
          who: "you",
          suggested: `${rpt} TU`,
          prompt: "Their report back, TU. That's the full DX exchange.",
          mustContain: required(rpt, "TU"),
        },
        {
          who: "dx",
          text: "QRZ?",
          copyHint: "Done — who's next in the pileup.",
        },
      ],
    };
  }

  // Call CQ DX role: you run the frequency, a DX station answers.
  // Symmetric: same 5-step shape, speakers swapped.
  return {
    dx: dxCall, flavor: "DX",
    summary: `Called CQ DX — worked ${dxStation.entity} (${dxCall}). 5NN given.`,
    steps: [
      {
        who: "you",
        suggested: cqCall("dx", myCall),
        prompt: "Call CQ DX — CQ DX, DE, your call. Keep calling until someone answers.",
        mustContain: required("CQ", "DX", myCall),
      },
      {
        who: "dx",
        text: `${myCall} DE ${dxCall} ${dxCall} K`,
        copyHint: "A station answers — their call twice, DE, your call first. Write down their call.",
      },
      {
        who: "you",
        suggested: `${dxCall} ${rpt} ${rpt}`,
        prompt: "Work them — their call, then report twice. Short and clean.",
        mustContain: required(rpt),
      },
      {
        who: "dx",
        text: `${rpt} TU`,
        copyHint: "Their report and TU — fast turnover on DX.",
      },
      {
        who: "you",
        suggested: `TU QRZ DX DE ${myCall}`,
        prompt: "TU, then back to calling — QRZ DX, DE, your call.",
        mustContain: required("TU"),
      },
    ],
  };
}

/* ================= CONTEST ================= */
/* Two contest exchange types controlled by opts.contestType:
   "wpx" (default) — send a serial number; random plausible per contact (NOT a
     running count — contacts are independent in this trainer and there is no log
     to increment against; a fake running counter would imply continuity we don't model).
   "zone" — send the CQ zone (CQ World Wide style).

   myCqZone comes from the profile (computed at the JSX edge from the operator's
   QTH state). The builder receives it as a plain number — or `null` when the QTH
   doesn't resolve to a US state — and stays free of DOM/dataset access. On null the
   zone is DROPPED from the exchange rather than defaulted.

   CQ-ZONE ATTRIBUTION — sourced externally, do not "correct" from memory, and do
   NOT re-cite our own bundled dataset: its US_STATE_ZONES table is hand-coded in
   scripts/build-dxcc-dataset.mjs (AD1C cty.csv has no per-state zone table), so
   citing it would be citing the artifact under test. Primary sources, retrieved
   2026-07-21:
     zone by state  — CQ's own WAZ zone list, cqww.com/cq_waz_list.htm
     the exchange   — CQ WW rules §III, www.cqww.com/rules.htm
   Confirmed there: CQ zone 5 is the eastern seaboard (CT MA ME NH RI VT NJ NY DC DE
   MD PA FL GA NC SC VA WV) and Wisconsin is zone 4; the CQ WW exchange is RST plus
   the sender's own CQ zone, zero-padded to two digits, both sides sending their own.
   THE REPORT IS REQUIRED — a zone sent alone is a fill, not a complete exchange,
   which is why dropping the zone still leaves the RST as a real requirement.

   Why dropped rather than defaulted: the old `?? 5` put an operator in Wisconsin
   into Connecticut's zone, and the 5 arrived with the "CT" QTH fallback rather than
   by design. A CQ zone is derived from where you actually are; asserting one we
   can't derive is the same falsehood as asserting the state, so this stays
   consistent with the state fix. The cost is disclosed and real: with no zone the
   CQ-WW-style exchange is incomplete (report only), which is a thinner lesson — but
   an incomplete exchange teaches less, while a defaulted one teaches something false.

   Both myExch and dxExch are computed once so the token in the step text and
   the token in mustContain are guaranteed to be the same string — the text-parity
   trap that has burned this team before. */

export function buildContest({ myCall, cut, myCqZone = null }, role = "run", opts = {}) {
  const dxRow = randDxStation();
  const dxCall = dxRow.call;
  const rpt = cutNum("599", cut);

  // serial(): random 3-digit number formatted with cut numbers.
  // NOT a running count — each contact is independent; incrementing a fake
  // serial would imply log continuity this trainer doesn't provide.
  const serial = () => cutNum(String(1 + Math.floor(Math.random() * 999)).padStart(3, "0"), cut);

  // Exchange token per side — computed ONCE and reused in text + mustContain.
  // Zone path: zoneToken() pads to 2 digits and applies cut numbers consistently.
  // An unknown zone yields "" (see the header note); required() then drops it and
  // the ` ${myExch}` interpolations are guarded so no blank reaches the script.
  const exch = (zone) =>
    opts.contestType === "zone" ? (zone == null ? "" : zoneToken(zone, cut)) : serial();
  const myExch = exch(myCqZone);
  const dxExch = exch(dxRow.cqZone);   // the DX pool always carries a zone
  const myExchTail = myExch ? ` ${myExch}` : "";
  const exchWord = opts.contestType === "zone" ? "zone" : "serial";
  // Prompts and the summary name your exchange only when you have one to send.
  const myExchPrompt = myExch ? `, your ${exchWord}` : "";
  const exchSummary = myExch ? ` Your exchange: ${myExch}.` : "";

  // Running role: you call CQ TEST, a DX station pounces.
  if (role === "run") {
    return {
      dx: dxCall, flavor: "CONTEST",
      summary: `Running — worked ${dxCall}.${exchSummary}`,
      steps: [
        {
          who: "you",
          suggested: `CQ TEST ${myCall} ${myCall}`,
          prompt: "Call CQ TEST — your call twice. Short and fast.",
          // Contest CALL-CQ: "CQ TEST" (TEST = short for CONTEST). In a run "CQ"
          // and "DE" are routinely dropped ("TEST K9MTE" is a valid call), so
          // TEST + call are required and CQ is credited-if-present, never required.
          // CONTEST satisfies TEST via COURTESY_EQUIVALENTS.
          mustContain: required("TEST", myCall),
        },
        {
          who: "dx",
          text: `${dxCall}`,
          copyHint: "A station pounces with their call once. Write it down fast.",
        },
        {
          who: "you",
          suggested: `${dxCall} ${rpt}${myExchTail}`,
          prompt: `Work them — their call, report${myExchPrompt}.`,
          mustContain: required(rpt, myExch),
        },
        {
          who: "dx",
          text: `${rpt} ${dxExch} TU`,
          copyHint: `Their report and ${exchWord} — copy that exchange token.`,
        },
        {
          who: "you",
          suggested: `TU ${myCall} TEST`,
          prompt: "Close with TU, your call, TEST. Back to calling immediately.",
          mustContain: required("TU"),
        },
      ],
    };
  }

  // S&P (search & pounce): DX is running, you find and work them.
  return {
    dx: dxCall, flavor: "CONTEST",
    summary: `S&P — worked ${dxCall} running.${exchSummary}`,
    steps: [
      {
        who: "dx",
        text: `CQ TEST ${dxCall} ${dxCall}`,
        copyHint: "A running station — grab the callsign, then pounce.",
      },
      {
        who: "you",
        suggested: `${myCall}`,
        prompt: "Pounce — your call once. Don't repeat, don't say DE.",
        mustContain: required(myCall),
      },
      {
        who: "dx",
        text: `${myCall} ${rpt} ${dxExch}`,
        copyHint: `Your call confirmed, then their exchange — copy that ${exchWord}.`,
      },
      {
        who: "you",
        suggested: `${rpt}${myExchTail} TU`,
        prompt: `Report${myExch ? ` + your ${exchWord}` : ""} + TU. Fast and clean.`,
        mustContain: required(rpt, myExch),
      },
      {
        who: "dx",
        text: `TU ${dxCall} TEST`,
        copyHint: "TU and back to calling — contest pace, no pleasantries.",
      },
    ],
  };
}

// buildQso is removed — callers now select activity + role explicitly via the
// activity/role dispatcher in QsoSim. The random picker added non-determinism
// that made it impossible to practice a specific role. If a thin shim is ever
// needed for backwards compatibility, add a dispatcher here.


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

/* ================= SPLASH SIGNATURE ================= */
// What the splash sends in Morse when the user skips it: the operator's own
// callsign once they've set one, else "WR" (Wisco Radio) as the default. The
// caller passes the placeholder (DEFAULT_SETTINGS.myCall) so we don't hardcode it
// twice — a myCall still equal to the placeholder means "not set up yet".
export function splashSignature(myCall, placeholder) {
  const call = (myCall || "").trim();
  return call && call !== placeholder ? call : "WR";
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

/* ================= CROSS-SESSION PROGRESS HISTORY (v2.0) ================= */
//
// Design: docs/design-v2-batch.md §1
//
// One versioned key `wrcw:progress` holds all categories in a single object.
// That makes reads/writes atomic and leaves a clean seam for QSO history later.
//
// RETENTION: keep the last 50 records per category (generous, bounded).
// 50 × 3 categories × ~200 bytes ≈ 30 KB — trivial for localStorage (5 MB+).
//
// SCHEMA VERSION: bumped when the shape changes in a breaking way. Current: 3.
// migrateProgress() walks PROGRESS_MIGRATIONS from the stored version up to
// current and carries the data forward; it never wipes on a version mismatch.
//
// QSO SEAM INVARIANT (load-bearing): migrateProgress must preserve unknown
// keys (e.g. `qso`) it finds in a stored blob. A future build may have written
// QSO records; an older build reading back must NOT strip them. Document and test.

export const PROGRESS_RETENTION = 50;
// v1 — original shape.
// v2 — KEY verdict fields: a stored "good" is demoted to null (an unmeasured
//      reading used to be recorded as "good"). From fix/unmeasured-spacing-verdicts.
// v3 — COPY records carry `conditions` ("easy" | "normal" | "real"). Purely
//      additive: records written before v3 have no `conditions` and are grouped
//      and labelled as unknown rather than being assumed to be any one setting.
export const PROGRESS_SCHEMA_VERSION = 3;

// Known categories in this schema version.
const KNOWN_PROGRESS_CATEGORIES = ["learn", "key", "copy", "qso"];

// emptyProgress() — canonical empty progress object for this schema version.
export function emptyProgress() {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    learn: [],
    key:   [],
    copy:  [],
    qso:   [],  // QSO history: records from QsoSim.advance() when a contact completes.
  };
}

// appendProgress(progress, category, record) → new progress object (no mutation).
//
// Pushes record onto the named category array and slices to PROGRESS_RETENTION.
// Returns a new object (not a mutation) so React state updates cleanly.
// Throws on an unknown category so a typo fails loudly rather than silently
// creating an orphan array.
export function appendProgress(progress, category, record) {
  if (!KNOWN_PROGRESS_CATEGORIES.includes(category)) {
    throw new Error(`appendProgress: unknown category "${category}"`);
  }
  const existing = progress[category] || [];
  const next = [...existing.slice(-(PROGRESS_RETENTION - 1)), record];
  // Spread progress first so any future unknown keys (e.g. qso) are preserved
  // exactly — same seam invariant as migrateProgress.
  return { ...progress, [category]: next };
}

// Verdict fields on a KEY record that a v1 build could write as a fabricated
// "good". In v1 analyzeFist's verdict() returned "good" for a null ratio, so a
// stored "good" means EITHER "measured and within tolerance" OR "never measured
// at all" — the two are indistinguishable after the fact.
const V1_AMBIGUOUS_VERDICT_FIELDS = [
  "elementVerdict", "letterVerdict", "wordVerdict", "weightingVerdict",
];

// v1 → v2 per-record transform: drop the ambiguous "good", keep everything else.
// "loose" and "tight" were only ever produced from a real measurement, so they
// carry forward untouched — as do estWpm, wpmVerdict, copyPct and every other
// field. Only the claim we cannot stand behind is dropped.
function dropUnprovenV1Verdicts(rec) {
  if (!rec || typeof rec !== "object") return rec;
  const out = { ...rec };
  for (const field of V1_AMBIGUOUS_VERDICT_FIELDS) {
    if (out[field] === "good") out[field] = null;
  }
  return out;
}

// PROGRESS_MIGRATIONS — ordered map of (fromVersion → transform function).
//
// This is the seam: a schema bump adds ONE entry here instead of touching any
// wipe logic.
//
// Shape: { [fromVersion: number]: (obj: object) => object }
// Each function transforms a blob from `fromVersion` to `fromVersion + 1`.
// Functions must be pure and must not throw (errors are caught by migrateProgress).
// A missing entry means that step needs no transform; the walk just increments.
//
// MERGE HAZARD, READ BEFORE EDITING THIS MAP. Slot 1 and the slot-2 note below
// arrived on two independent branches (fix/unmeasured-spacing-verdicts and
// fix/copy-condition-pooling) that both rewrote this block. Resolving that
// conflict by taking either side WHOLE deletes the other's decision, and the
// suite stays green either way: drop slot 1 and every stored v1 "good" verdict
// is silently promoted back into PROGRESS; drop the slot-2 note and the next
// person adds a backfill this schema deliberately does not have. The round-trip
// test "a v1 blob migrates all the way to v3" in cw-core.test.js is the guard
// that does bite — keep it.
const PROGRESS_MIGRATIONS = {
  // 1 (v1 → v2): spacing/weighting verdicts gained a "null = never measured"
  //     state. A v1 record's "good" cannot be trusted (see
  //     V1_AMBIGUOUS_VERDICT_FIELDS), so it is demoted to null and PROGRESS
  //     simply shows no chip for it. The cost is disclosed and accepted: a
  //     genuinely-measured-good historical verdict is lost. The alternative —
  //     rendering it — would retro-label never-measured sessions as measured,
  //     which is the exact defect this schema change exists to remove.
  1: (obj) => ({
    ...obj,
    key: Array.isArray(obj.key) ? obj.key.map(dropUnprovenV1Verdicts) : obj.key,
  }),

  // 2 (v2 → v3): deliberately absent. Adding COPY `conditions` is additive-only:
  //     there is no honest value to backfill onto a pre-v3 record, because the
  //     app never knew what the operator had the Conditions selector set to.
  //     Leaving the field absent is the migration — copyTrend() reads absent as
  //     "unknown" and groups those records separately (see copyConditionsLabel).
};

// migrateProgress(raw) → a valid progress object.
//
// raw is whatever store.load returned: null, an old shape, or garbage.
//
// CARRY-FORWARD RULE (replaces the old wipe-on-mismatch):
// - null / non-object raw → emptyProgress() (genuinely absent — data loss is
//   correct here; there is nothing to carry forward).
// - otherwise walk PROGRESS_MIGRATIONS from raw.schemaVersion up to current,
//   then merge the result into emptyProgress() so unknown keys (the qso: seam,
//   etc.) pass through untouched. Per-category arrays are kept if they're arrays,
//   defaulted to [] if not — a bad category must NOT wipe the others.
//
// SEAM INVARIANT: unknown keys in raw (e.g. {qso:[...]}) are preserved across
// BOTH same-version and cross-version reads. A future build's data survives an
// older build round-tripping it.
//
// ERROR CONTAINMENT: the migration walk is wrapped in try/catch. Only a genuine
// throw (unprocessable data) falls back to emptyProgress(). That is the sole
// data-loss path.
export function migrateProgress(raw) {
  if (!raw || typeof raw !== "object") return emptyProgress();

  try {
    // Walk the migration ladder from the stored version up to current.
    // Default to 0 if schemaVersion is absent or non-numeric so a very old
    // blob still gets the full ladder treatment.
    let fromVersion = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
    let obj = { ...raw }; // shallow copy — migrations are pure, but we own this object

    while (fromVersion < PROGRESS_SCHEMA_VERSION) {
      if (PROGRESS_MIGRATIONS[fromVersion]) {
        obj = PROGRESS_MIGRATIONS[fromVersion](obj);
      }
      fromVersion++;
    }

    // Merge into emptyProgress() so unknown keys (qso: seam) pass through and
    // missing fields get correct defaults. Stamp schemaVersion last so a migration
    // function can't accidentally leave a stale version number.
    const merged = { ...emptyProgress(), ...obj };
    // Stamp the version the data has actually reached. `fromVersion` is where the
    // ladder walk ended: PROGRESS_SCHEMA_VERSION for anything we migrated, and the
    // blob's own (higher) version for a blob written by a NEWER build. Never write
    // a lower number back than we read — that would tell the newer build its own
    // data still needs its migration, and it would run it a second time.
    merged.schemaVersion = fromVersion;

    // Per-category default: a bad/missing category array must NOT wipe the others.
    for (const cat of KNOWN_PROGRESS_CATEGORIES) {
      if (Array.isArray(merged[cat])) {
        // Slice to the retention cap so an oversized stored array is trimmed.
        merged[cat] = merged[cat].slice(-PROGRESS_RETENTION);
      } else {
        merged[cat] = [];
      }
    }

    return merged;
  } catch {
    // Genuinely unprocessable data (migration threw). Only path to data loss.
    return emptyProgress();
  }
}

// learnTrend(progress) → per-lesson rollup array for the PROGRESS view.
// Returns [{lesson, lastPct, bestPct, sets, recent}] sorted by lesson number.
// `recent` is the last N percentage values for a sparkline.
const TREND_WINDOW = 10;
export function learnTrend(progress) {
  const records = progress.learn || [];
  const byLesson = {};
  for (const r of records) {
    if (!byLesson[r.lesson]) byLesson[r.lesson] = [];
    byLesson[r.lesson].push(r);
  }
  return Object.entries(byLesson)
    .map(([lesson, recs]) => {
      const pcts = recs.map((r) => r.pct);
      return {
        lesson: Number(lesson),
        lastPct: pcts[pcts.length - 1],
        bestPct: Math.max(...pcts),
        sets: recs.length,
        recent: pcts.slice(-TREND_WINDOW),
        // lastT: epoch ms of the most recent set in this lesson; used for date
        // display in ProgressView.  May be undefined for records written before
        // the t field existed — callers must treat it as optional.
        lastT: recs[recs.length - 1].t,
      };
    })
    .sort((a, b) => a.lesson - b.lesson);
}

// keyTrend(progress) → last TREND_WINDOW KeyRecords for the PROGRESS view,
// plus an estWpm series for the sparkline.
export function keyTrend(progress) {
  const records = (progress.key || []).slice(-TREND_WINDOW);
  return {
    records,
    wpmSeries: records.map((r) => r.estWpm),
  };
}

// COPY_CONDITIONS — the conditions a COPY attempt can be made under, mapped to
// the plain English used wherever a score is shown. The keys are the values the
// CopyTrainer's Conditions selector stores on each record; the values are what a
// learner reads. Never render the raw key.
export const COPY_CONDITIONS = {
  easy:   "easy",
  normal: "normal",
  real:   "real life",
};

// Label for a record whose conditions we do not know: written before schema v3,
// or carrying a value this build doesn't recognise. It is NOT "normal" — saying
// so would invent a fact about how the operator was practising.
export const COPY_CONDITIONS_UNKNOWN_LABEL = "conditions not recorded";

// copyConditionsLabel(conditions) → plain-English label, never the raw enum.
export function copyConditionsLabel(conditions) {
  return COPY_CONDITIONS[conditions] || COPY_CONDITIONS_UNKNOWN_LABEL;
}

// copyTrend(progress) → last TREND_WINDOW CopyRecords grouped by rung AND conditions.
//
// WHY BOTH: copying through noise and QSB is a harder task than copying a clean
// signal at the same rung, so the two produce different scores. Pooling them made
// switching to REAL LIFE look like the operator's accuracy falling — the app
// telling them they got worse when they had actually raised the difficulty.
// Each (rung, conditions) pair is its own trend line.
//
// Groups appear in first-seen order and only exist when they have records, so a
// condition never practised on a rung simply isn't shown (rather than a 0% row).
export function copyTrend(progress) {
  const records = (progress.copy || []).slice(-TREND_WINDOW);
  // Keyed by the (rung, conditions) tuple, JSON-encoded so the two parts stay
  // unambiguous whatever a corrupt blob puts in them.
  const groups = new Map(); // key -> { source, conditions, recs }
  for (const r of records) {
    // Records written before the `source` field existed have r.source === undefined.
    // Default to "—" so they group under a named rung rather than an `undefined` key
    // (which would render as a garbled "undefined" rung in ProgressView).
    const source = r.source || "—";
    // Absent or unrecognised conditions → null, its own honestly-labelled group.
    const conditions = Object.hasOwn(COPY_CONDITIONS, r.conditions) ? r.conditions : null;
    const key = JSON.stringify([source, conditions]);
    if (!groups.has(key)) groups.set(key, { source, conditions, recs: [] });
    groups.get(key).recs.push(r);
  }
  return [...groups.values()].map(({ source, conditions, recs }) => ({
    source,
    conditions,
    conditionsLabel: copyConditionsLabel(conditions),
    recent: recs.map((r) => r.pct),
    lastPct: recs[recs.length - 1].pct,
    // lastT: epoch ms of the most recent record for this rung; used for date
    // display in ProgressView.  May be undefined for pre-t records.
    lastT: recs[recs.length - 1].t,
  }));
}

// toneFor(pct) → one of the three semantic tone values used by BarTrend.
//
// Thresholds match the mastery model used everywhere else in the app:
//   ≥90 = green (mastered / on target)
//   70–89 = amber (in progress / caution)
//   <70  = red (needs work)
//
// Returns literal hex strings so BarTrend's inline style can use them directly,
// but they are THE SAME values as S.tone.ok/warn/err — callers MUST NOT use
// magic color strings; import this and let the token stay in one place.
export function toneFor(pct) {
  if (pct >= 90) return "#8FCB9B"; // S.tone.ok
  if (pct >= 70) return "#F2A93B"; // S.tone.warn
  return "#E07A5F";                 // S.tone.err
}

// qsoTrend(progress) → { records, copySeries, sendSeries } for the PROGRESS QSO section.
//
// records: last TREND_WINDOW QSO records, newest-first (chronological reversed).
//   Used for the records list: activity, role, difficulty, per-contact scores, date.
//
// copySeries / sendSeries: chronological (oldest-first) percentage arrays for BarTrend.
//   Each series is computed independently from all qso records (not just the last 10
//   contacts): null values (un-graded side) are filtered OUT first, THEN the last
//   TREND_WINDOW are taken. This means a history with only sending attempts still
//   yields a full sendSeries up to 10 bars, even if copySeries is short or empty.
//
// WHY independent caps: a contact that has no copy grade (pure send role) should
// not burn a slot in the copy sparkline — filtering before capping gives a denser,
// more meaningful chart for single-role operators.
export function qsoTrend(progress) {
  const all = progress.qso || [];

  // records: last 10, newest-first for the UI list
  const records = all.slice(-TREND_WINDOW).reverse();

  // Per-series: filter out nulls across ALL records, then take the last TREND_WINDOW
  const copySeries = all
    .map((r) => r.copyPct)
    .filter((v) => v !== null && v !== undefined)
    .slice(-TREND_WINDOW);

  const sendSeries = all
    .map((r) => r.sendPct)
    .filter((v) => v !== null && v !== undefined)
    .slice(-TREND_WINDOW);

  return { records, copySeries, sendSeries };
}
