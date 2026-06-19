/* ================= CW CORE ================
   Pure, browser-free functions extracted from wr-cw-trainer.jsx so they can be
   unit-tested in a Node environment without dragging in React or the Web Audio API.

   Dependency order is intentional: each symbol is defined before anything
   that uses it. Do not reorder without re-checking the transitive deps. */

/* ================= MORSE DATA ================= */
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

/* ================= QSO SIMULATOR ================= */
/* Contact scripts follow current on-air practice:
   - Ragchew: 3x2 CQ, BT (=) separators, KN to hold the frequency, SK + dit-dit to close.
   - POTA: hunters send their call ONCE — no DE, no K. Short exchange with BK turnovers,
     state as QTH, activator closes "TU <state> 73 EE". Park refs use the US- prefix.
   - SOTA: activator signs /P, summit ref (assoc/region-number) in the CQ, chaser-style exchange.
   - IOTA: DX island station, contest-style — report + island ref, quick TU. */

export function buildRagchew({ myCall, myName, myQth, cut }) {
  const dx = randCall();
  const name = rand(NAMES);
  const qth = rand(QTHS);
  const rst = cutNum(rand(RSTS), cut);
  const myRst = cutNum("599", cut);
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

export function buildPota({ myCall, myQth, cut }) {
  const myState = stateOf(myQth);
  const dx = randCall();
  const rst = cutNum(rand(RSTS), cut);
  const myRst = cutNum("599", cut);
  const park = randPark();
  return {
    dx, flavor: "POTA",
    summary: `Hunted ${dx} at ${park} — ${rst} from the park. In the log.`,
    steps: [
      {
        who: "dx",
        text: `CQ POTA CQ POTA DE ${dx} ${dx} ${park} K`,
        copyHint: "A park activator. Grab the callsign — the US- number is the park reference.",
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

export function buildSota({ myCall, cut }) {
  const dx = randCall();
  const rst = cutNum(rand(RSTS), cut);
  const myRst = cutNum("599", cut);
  const summit = rand(SUMMITS);
  return {
    dx, flavor: "SOTA",
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

export function buildIota({ myCall, cut }) {
  const dx = randCall(IOTA_DX_PREFIXES);
  const ref = rand(IOTA_REFS);
  const rpt = cutNum("599", cut);
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

export function buildQso(profile) {
  const roll = Math.random();
  if (roll < 0.35) return buildPota(profile);
  if (roll < 0.55) return buildSota(profile);
  if (roll < 0.7) return buildIota(profile);
  return buildRagchew(profile);
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
