import React, { useState, useRef, useEffect, useCallback, useMemo, useId } from "react";
import { createPortal } from "react-dom";
import {
  MORSE, REV, COMMON_WORDS, QSO_PHRASES, stateOf, subTokens,
  drillCommonWords, drillWiderWords,
  US_PREFIXES, IOTA_DX_PREFIXES, NAMES, QTHS, RSTS, KOCH, glyphs,
  SUMMITS, IOTA_REFS, randPark, cutNum, rand, randCall, timing,
  gradeSend, similarityCw,
  INTL_SUMMITS, POTA_COUNTRY_PREFIXES,
  randDxStation, zoneToken, reciprocalCall, resolveUSState,
  buildRagchew, buildPota, buildSota, buildIota, buildDx, buildContest,
  isReadyToAdvance,
  DRILL_CATEGORIES, ROLE_TERMS, analyzeFist, averageScore,
  toCodes,
  emptyProgress, appendProgress, migrateProgress,
  learnTrend, keyTrend, copyTrend, toneFor, qsoTrend,
  splashSignature,
} from "./src/cw-core.js";

/* ================= PERSISTENCE =================
   One small save/load layer for the whole app. Backed by localStorage, which
   works in every real target — Electron, Capacitor, and desktop/mobile browsers.
   If storage is ever unavailable (a locked-down preview sandbox, private mode),
   it falls back to an in-memory object so the app still runs — it just won't
   remember across launches in that one case. To move to another backend later
   (e.g. Capacitor Preferences), swap the two function bodies; nothing else in
   the app has to change. Keys are namespaced so the app never collides with
   anything else sharing the same origin. */
const memStore = {};
// storePersistent: tracks whether localStorage is actually working.
// Starts true; set to false on the first failed write. Callers that wrote
// before the failure are unaffected — they already returned. The important
// thing is that we detect the failure before the user generates data they
// expect to survive a reload.
let storePersistent = true;
const store = {
  load(key, fallback) {
    try {
      const v = window.localStorage.getItem("wrcw:" + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      storePersistent = false;
      return key in memStore ? memStore[key] : fallback;
    }
  },
  save(key, value) {
    try {
      window.localStorage.setItem("wrcw:" + key, JSON.stringify(value));
    } catch {
      storePersistent = false;
      memStore[key] = value;
    }
  },
  // isPersistent() — true when all writes have reached real localStorage;
  // false when any write fell back to the in-memory store.
  // Callers use this to show a one-time warning; they do NOT alter behavior
  // based on it — the memStore fallback keeps the app working either way.
  isPersistent() { return storePersistent; },
};

/* MORSE DATA, QSO builders, timing, similarity, and Koch gate are in src/cw-core.js */

/* ============ CW LANGUAGE GUIDE DATA ============ */
const LINGO = [
  {
    cat: "The essentials",
    blurb: "The handful of terms in nearly every contact. Learn these first.",
    items: [
      ["CQ", "Calling any station — an open invitation. CQ CQ CQ means 'anyone out there?'"],
      ["DE", "'From' / 'this is' — separates the call you're answering from your own"],
      ["K", "Go ahead — end of transmission, anyone may answer"],
      ["KN", "Go ahead, ONLY the station I called — keeps others from breaking in"],
      ["R", "Roger — received and understood (not 'yes', just 'I copied it')"],
      ["TU", "Thank you"],
      ["73", "Best wishes — the universal ham farewell"],
      ["EE", "Dit dit — the final handshake after SK. Closes almost every QSO"],
      ["?", "Say again / please repeat — never rude, used constantly"],
      ["AGN", "Again — repeat your last transmission"],
    ],
  },
  {
    cat: "Prosigns",
    // BT, AR, SK, KN are fused prosigns — their two letters key run-together as
    // one continuous sound, no inter-character gap.  BK is NOT one of these:
    // on the air BK is sent as two separate letters (B then K) with a normal
    // inter-character gap.  The items below mark that distinction explicitly.
    blurb: "Procedure signals that steer the contact. BT, AR, SK, and KN are sent as a single run-together sound (no gap between the letters). BK is two normal letters with a standard gap.",
    items: [
      ["=", "BT — pause / new thought. Sent as one run-together sound. Hear it between RST, name, and QTH in an exchange"],
      ["+", "AR — end of message, used when first answering a station. Sent run-together."],
      ["SK", "End of contact — the QSO is over, usually followed by dit dit. Sent run-together."],
      ["BK", "Break — quick turnover without callsigns, like 'over' on voice. Two separate letters (B then K), standard spacing — NOT a fused prosign."],
      ["AS", "Wait / stand by"],
      ["HH", "Error / start over — a string of eight dits. Erases the botched word; the corrected version follows. Send eight dits here and the key screen clears."],
    ],
  },
  {
    cat: "Q-signals",
    blurb: "Three-letter codes starting with Q. With a ? they ask; without, they state.",
    items: [
      ["QTH", "My location is... (QTH? = where are you?)"],
      ["QRZ?", "Who is calling me?"],
      ["QRS", "Send slower please"],
      ["QRQ", "Send faster"],
      ["QRM", "Interference from other stations"],
      ["QRN", "Static / atmospheric noise"],
      ["QSB", "Your signal is fading — the real-life mode in this app"],
      ["QRP", "Low power operation — 5 watts or less by convention on CW"],
      ["QSL", "I confirm / do you confirm?"],
      ["QSY", "Change frequency"],
      ["QRL?", "Is this frequency in use? Always ask before calling CQ"],
    ],
  },
  {
    cat: "Shorthand",
    blurb: "CW ops compress everything. These show up in every ragchew.",
    items: [
      ["ES", "And"],
      ["FER", "For"],
      ["TNX", "Thanks"],
      ["UR", "Your / you're"],
      ["HW?", "How copy? — how did you receive me?"],
      ["CPY", "Copy"],
      ["RST", "Signal report: Readability, Strength, Tone (see ON AIR)"],
      ["5NN", "599 in cut numbers — contest shorthand where 9 becomes N, 0 becomes T"],
      ["WX", "Weather"],
      ["RIG", "Radio equipment"],
      ["ANT", "Antenna"],
      ["PWR", "Power"],
      ["OM", "Old man — any male ham, regardless of age"],
      ["YL", "Young lady — female operator"],
      ["GM", "Good morning (GA afternoon, GE evening)"],
      ["FB", "Fine business — excellent, great"],
      ["PSE", "Please"],
      ["HPE", "Hope"],
      ["CUL", "See you later"],
      ["CUAGN", "See you again"],
      ["BCNU", "Be seeing you"],
      ["SRI", "Sorry"],
      ["HR", "Here"],
      ["NW", "Now"],
      ["B4", "Before"],
      ["VY", "Very"],
      ["GD", "Good"],
      ["DX", "Distant station / foreign country"],
      ["POTA", "Parks on the Air — portable ops from parks"],
      ["SOTA", "Summits on the Air — portable ops from mountaintops"],
      ["IOTA", "Islands on the Air"],
      ["P2P", "Park to park — two POTA activators working each other"],
      ["S2S", "Summit to summit"],
    ],
  },
  // ---- DX vocabulary (added Phase 1, intl-dx-p1) ----
  {
    cat: "DX essentials",
    blurb: "The terms you meet the moment you tune across a DX or DXpedition station. Every one of these shows up in the ON AIR DX guide.",
    items: [
      ["DXpedition", "Operators who travel to a rare DXCC entity specifically to put it on the air for others to contact. Common on islands, remote territories, and other hard-to-reach entities"],
      ["DXCC entity", "A geographic entry on the ARRL DXCC list — may differ from national borders. Alaska (KL7), Hawaii (KH6), and Guantánamo Bay (KG4) are separate DXCC entities from the lower-48 US, even though all are US territory"],
      ["Pileup", "Many stations calling a rare or DXpedition station at once. Send only your callsign — once. A too-long call gets you ignored. Honor directional calls ('NA only')"],
      ["Split", "DX transmits on one frequency, listens on a range above it (e.g. 'UP 5 TO 10'). Your transmitter moves into that range; the DX stays put. You can't hear yourself being worked — that's normal"],
      ["UP", "The DX instruction to call above their transmit frequency. 'UP 5' = at least 5 kHz up; 'UP 5 TO 10' = spread across a 5-kHz range, not a single parking spot"],
      ["QSX", "'Listening on [frequency or range]' — the formal Q-code for split operation. Rarely heard spelled out on modern CW; the UP-style range call dominates. Defined here for reference; not a drill"],
      ["UTC / Zulu", "Coordinated Universal Time — the standard for all DX operating, logging, and band-opening spots. 'Zulu' is the NATO phonetic for Z (zero UTC offset). 0000 UTC = midnight in London; 1200 UTC = noon"],
    ],
  },
  {
    cat: "Contest & zones",
    blurb: "Contest CW has its own vocabulary and a zone geography that trips everyone up at first. These three zone systems are named alike and confused often — they are separate things.",
    items: [
      ["CQ TEST", "The contest CQ. Distinct from 'CQ CQ DE' — you hear this on busy contest weekends. Answered with just your callsign, then the exchange follows fast"],
      ["NR", "Number — a running serial in a WPX or other serial-exchange contest (e.g. '5NN 001'). The answering station sends their own serial back"],
      // ZONE-SYSTEM ATTRIBUTION — sourced, do not "correct" from memory:
      //   WAZ (Worked All Zones) is a CQ Magazine award based on the 40 CQ ZONES,
      //   NOT the ITU zones. Sources: CQ's own award rules
      //   (cq-amateur-radio.com/cq_awards/cq_waz_awards/), the CQ zone list
      //   (cqww.com/cq_waz_list.htm), and ARRL's LoTW WAZ support announcement.
      //   The 90 ITU ZONES are used by the IARU HF World Championship exchange and
      //   its per-ITU-zone certificates (contests.arrl.org/ContestRules/IARU-HF-Rules.pdf).
      // Pinned by src/test/zone-systems.test.jsx so this can't silently regress.
      ["CQ zone", "One of 40 geographic zones worldwide, used in the CQ World Wide contest and the WAZ (Worked All Zones) award (e.g. '5NN 14'). The contiguous US spans zones 3–5. NOT the same as ITU zones or ITU regions"],
      ["ITU region", "One of 3 world regions that set band allocations (Region 1 = Europe/Africa/Middle East; Region 2 = the Americas; Region 3 = Asia-Pacific). 40 m CW is allocated in all three. NOT the same as CQ zones"],
      ["ITU zone", "One of 90 zones used in the IARU HF World Championship exchange — a different numbering from the 40 CQ zones. The three systems (3 regions / 40 CQ zones / 90 ITU zones) are easy to confuse; name the system when you say 'zone'"],
    ],
  },
  {
    cat: "Operating abroad",
    blurb: "Working DX from your US station needs no permit. Operating a transmitter from outside the US does. Three frameworks cover most of the world — CEPT is the easiest.",
    items: [
      ["CEPT", "European Conference of Postal & Telecommunications Administrations. A framework that lets US amateurs operate in participating countries by carrying documents — no advance application. US Extra (and grandfathered Advanced) get full privileges; US General gets limited 'CEPT Novice' privileges; Technicians and non-US-citizens get none. Not all of Europe is on the list (Turkey is a notable gap). NEEDS-SOURCING: verify current country list on the ARRL CEPT page before any trip"],
      ["CEPT Novice", "The limited operating privileges available to US General licensees in CEPT countries that have adopted ECC Recommendation (05)06. Typically restricted bands/segments and/or lower power, varying by country — a General must not assume Extra-level access abroad. NEEDS-SOURCING: confirm ECC Rec (05)06 adoption and the specific General/Novice band/power limits per host country before teaching them as fact"],
      ["DA 16-1048", "FCC Public Notice (a free PDF from fcc.gov) that lists the CEPT countries accepting US amateurs under T/R 61-01. Carry it printed. Required document alongside your FCC license printout and US passport (citizenship required). NEEDS-SOURCING: verify the current FCC Public Notice number and its carry requirements on the FCC/ARRL CEPT page"],
      ["IARP", "Inter-American Amateur Radio Permit. Required before operating in most Americas signatory countries. Obtain through the ARRL — budget weeks, not days, before a trip. Class 1 covers HF/telegraphy (General, grandfathered Advanced/Extra); Class 2 covers above-30 MHz (today's Technician). NEEDS-SOURCING: verify current fee, turnaround, and country list on the ARRL IARP page"],
      ["Reciprocal call", "When operating abroad, the host country's prefix goes FIRST, then your US callsign: DL/N1KB (Germany), I0/W1AW (Italy — I0 is the Rome/Lazio district). This is the reverse of domestic portable notation (W1AW/P). Activity suffix appends last: DL/N1KB/P (portable). Tech Plus (legacy since 2000) and Advanced (grandfathered) appear in older treaty text — the current exam path to full CEPT privileges is Extra"],
    ],
  },
];

const CQ_ANATOMY = [
  ["CQ CQ CQ", "The invitation — 'calling any station.' Three times gives listeners a chance to tune you in."],
  ["DE", "'From.' Everything before DE is who you're calling; everything after is who you are."],
  ["{ME} {ME}", "Your callsign, twice, so a listener who missed it the first time catches it."],
  ["K", "Go ahead — transmission over, anyone may answer."],
];

const QSO_WALKTHROUGH = [
  {
    who: "W9ABC", text: "CQ CQ CQ DE W9ABC W9ABC K",
    why: "The open invitation. Before sending this, a good op sends QRL? first — 'is this frequency in use?'",
  },
  {
    who: "YOU", text: "W9ABC DE {ME} {ME} K",
    why: "Their call once — so they know it's for them. Yours twice — so they can copy it. You're now in a QSO.",
  },
  {
    who: "W9ABC", text: "{ME} DE W9ABC = GM TNX FER CALL = UR RST 599 599 = NAME BOB BOB = QTH TOLEDO OH = HW? {ME} DE W9ABC KN",
    why: "The exchange. Each = (BT) is a breath between thoughts: greeting, your signal report, his name, his location. HW? asks how you copied. KN means only you should answer.",
  },
  {
    who: "YOU", text: "R R W9ABC DE {ME} = GM BOB TNX FER RPT = UR RST 579 579 = NAME {NAME} {NAME} = QTH {QTH} = HW? W9ABC DE {ME} KN",
    why: "R R — 'received.' Then your half, mirroring his: report, name, QTH. Honest reports matter — 579 means his signal was real-world good, not perfect.",
  },
  {
    who: "W9ABC", text: "R FB {NAME} = TNX FER FB QSO = 73 ES HPE CUAGN {ME} DE W9ABC SK EE",
    why: "FB — 'fine business.' 73 — best wishes. SK formally ends the contact, and the dit-dit (EE) is the handshake. You just worked a complete QSO.",
  },
];

const POTA_WALKTHROUGH = [
  { who: "ACTIVATOR", text: "CQ POTA CQ POTA DE W9ABC W9ABC K-4361 K", why: "An op in a park, calling for hunters. K-4361 is a US POTA reference (US parks use the K- prefix, matching the US callsign block)." },
  { who: "YOU", text: "{ME}", why: "Your call. Once. No DE, no K. You're one voice in a pileup — brevity is the courtesy." },
  { who: "ACTIVATOR", text: "{ME} GM UR 559 559 BK", why: "Your report, twice. BK hands it straight back — no callsign ceremony." },
  { who: "YOU", text: "BK GM UR 599 599 {ST} {ST} BK", why: "BK to accept, greeting, their report, your state twice. That's your whole half." },
  { who: "ACTIVATOR", text: "BK TU {ST} 73 DE W9ABC EE", why: "TU, your state as your handle, 73, dit-dit — and they're listening for the next hunter. Thirty seconds, start to finish." },
];

// ON AIR DX guide — the complete worked-example DX QSO, line by line.
// Uses VK2XX (Australia, zone 30) as the DX station — a real on-air prefix,
// a real CQ zone, chosen to make the DXCC / zone concepts concrete.
// VK2 = New South Wales = CQ zone 30.  Zone 29 is Western Australia (VK6/VK8).
// The user's call ({ME}) is substituted at render time via sub().
// Source: research-international-dx-operating.md §2 worked example.
const DX_WALKTHROUGH = [
  {
    who: "VK2XX",
    text: "CQ DX CQ DX DE VK2XX VK2XX K",
    why: "A DX CQ — 'CQ DX' means this station is calling only distant/foreign contacts. The prefix VK identifies Australia. Grab the callsign: VK2XX. That's the whole job of this step.",
  },
  {
    who: "YOU",
    text: "{ME}",
    why: "Your callsign. Once. No 'DE', no 'K' — in a pileup, brevity is the courtesy. The DX station is listening for a clean call in the noise, and extra words make it harder.",
  },
  {
    who: "VK2XX",
    text: "{ME} 5NN",
    why: "5NN is 599 in cut numbers (9→N). In DX, 5NN is a near-universal convention — it means the contact is complete, not that your signal is actually perfect. Sending an honest '579' marks you as new to DX.",
  },
  {
    who: "YOU",
    text: "5NN TU",
    why: "Confirm their report with 5NN and thank you. The whole DX exchange — two overs each — may take fifteen seconds. That's by design: the DX station has a pileup waiting.",
  },
  {
    who: "VK2XX",
    text: "QRZ?",
    why: "QRZ? = 'who's next?' The DX is done with you and calling the next station in the pileup. It's not asking you to repeat anything. The contact is complete.",
  },
];

/* ================= AUDIO ENGINE ================= */
function useMorsePlayer() {
  const ctxRef = useRef(null);
  const nodesRef = useRef(null);
  const timersRef = useRef([]);
  const [playing, setPlaying] = useState(false);

  const getCtx = () => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  };

  // iOS/webview audio unlock: resume the context and push one silent sample
  // through it inside a user gesture. Without this, some mobile webviews keep
  // the context suspended forever and everything schedules into silence.
  const unlock = useCallback(() => {
    try {
      const ctx = getCtx();
      if (ctx.state !== "running") ctx.resume();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch (e) {}
  }, []);

  const stop = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (nodesRef.current) {
      const { gain, osc } = nodesRef.current;
      try {
        const now = ctxRef.current.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.01);
        osc.stop(now + 0.05);
      } catch (e) {}
      nodesRef.current = null;
    }
    // Release the AGC if a transmission was interrupted mid-duck
    if (noiseRef.current && ctxRef.current) {
      try {
        const dg = noiseRef.current.duck.gain;
        dg.cancelScheduledValues(ctxRef.current.currentTime);
        dg.setTargetAtTime(1, ctxRef.current.currentTime, 0.15);
      } catch (e) {}
    }
    setPlaying(false);
  }, []);

  const play = useCallback((text, { charWpm, effWpm, freq, onDone, onChar, qsb }) => {
    stop();
    const ctx = getCtx();
    const schedule = () => {
    const { u, charSp, wordSp } = timing(charWpm, effWpm);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const fade = ctx.createGain(); // QSB: slow signal-strength variation
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0;
    fade.gain.value = 1;
    osc.connect(gain);
    gain.connect(fade);
    fade.connect(ctx.destination);
    osc.start();
    nodesRef.current = { osc, gain };

    let t = ctx.currentTime + 0.15;
    const t0 = t;
    const ramp = 0.004;
    // A1 (v1.1): tokenize via toCodes so prosign tokens (AR, BT, SK, KN) key as
    // single run-together codes rather than separate letters with a 3u gap between
    // them.  toCodes returns [{code}, {wordGap:true}] entries; unknown chars are
    // already dropped in the tokenizer.
    const tokens = toCodes(text);

    // AGC: if band noise is running, duck it under the signal. Fast attack at
    // each character; slow recovery only in word gaps and at the end — the
    // hang of a slow CW AGC, noise breathing back between words.
    const duck = noiseRef.current ? noiseRef.current.duck.gain : null;
    const DUCK = 0.3;

    // strPos tracks the position in the original display string for onChar
    // (used by easy-mode live reveal: text.slice(0, strPos)).
    let strPos = 0;
    const upperText = text.toUpperCase();

    tokens.forEach((tok) => {
      if (tok.wordGap) {
        // Recovery in the word gap — offset scales with the gap so this event
        // always precedes the next character's duck at any speed setting
        if (duck) {
          const gapLen = wordSp - charSp;
          duck.setTargetAtTime(1, t + Math.min(0.15, gapLen * 0.35), 0.3);
        }
        t += wordSp - charSp; // word gap replaces the trailing char gap
        // tok.displayLen is 1 (the space in the original string); advance past it.
        strPos += tok.displayLen;
        return;
      }
      const code = tok.code;
      // tok.displayLen is the single source of truth for how many characters this
      // token occupies in the original display string: 1 for a plain character,
      // 2 for a fused prosign (AR/BT/SK/KN).  Using this eliminates the old
      // parallel scan that matched prosign letter-pairs at any position in the
      // string and desync'd easy-mode reveal on "ARE YOU", "W9KN", "CEDAR", etc.
      const consumed = tok.displayLen;
      if (duck) duck.setTargetAtTime(DUCK, t, 0.015); // gain drops as the signal appears
      if (onChar) {
        const capturedPos = strPos + consumed - 1;
        const delay = (t - ctx.currentTime) * 1000;
        timersRef.current.push(setTimeout(() => onChar(capturedPos, upperText[strPos]), Math.max(0, delay)));
      }
      strPos += consumed;
      code.split("").forEach((el, i) => {
        const dur = el === "." ? u : 3 * u;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.35, t + ramp);
        gain.gain.setValueAtTime(0.35, t + dur - ramp);
        gain.gain.linearRampToValueAtTime(0, t + dur);
        t += dur;
        if (i < code.length - 1) t += u; // intra-character gap
      });
      t += charSp; // gap after character
    });

    if (duck) duck.setTargetAtTime(1, t + 0.1, 0.35); // AGC releases after the over

    // QSB: pick this transmission's character — sometimes armchair copy, sometimes
    // down in the noise, sometimes swinging — then random-walk the strength.
    if (qsb) {
      let lvl = 0.15 + Math.random() * 0.85;
      const drift = 0.3 + Math.random() * 0.6; // how restless the band is tonight
      fade.gain.setValueAtTime(lvl, t0);
      let ft = t0;
      while (ft < t) {
        ft += 0.7 + Math.random() * 2.3;
        lvl = Math.min(1, Math.max(0.06, lvl + (Math.random() - 0.5) * drift));
        fade.gain.linearRampToValueAtTime(lvl, ft);
      }
    }

    const total = (t - t0 + 0.2) * 1000;
    setPlaying(true);
    timersRef.current.push(
      setTimeout(() => {
        setPlaying(false);
        try { osc.stop(); } catch (e) {}
        nodesRef.current = null;
        if (onDone) onDone();
      }, total + 150)
    );
    }; // end schedule

    if (ctx.state === "running") {
      schedule();
    } else {
      // Resume first, then schedule — otherwise the whole message lands on a
      // frozen clock and the wall-clock cleanup timer kills it mid-flight.
      ctx.resume().then(schedule).catch(schedule);
    }
  }, [stop]);

  // One-shot element beep (paddle keyer) — scheduled on the audio clock for clean edges
  const beep = useCallback((freq, durSec) => {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.004);
    gain.gain.setValueAtTime(0.35, now + Math.max(0.01, durSec - 0.004));
    gain.gain.linearRampToValueAtTime(0, now + durSec);
    osc.start(now);
    osc.stop(now + durSec + 0.03);
  }, []);

  // Sidetone for the user's key
  const sideRef = useRef(null);
  const keyDownTone = useCallback((freq) => {
    const ctx = getCtx();
    if (sideRef.current) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    const now = ctx.currentTime;
    gain.gain.linearRampToValueAtTime(0.35, now + 0.004);
    sideRef.current = { osc, gain };
  }, []);
  const keyUpTone = useCallback(() => {
    if (!sideRef.current) return;
    const ctx = ctxRef.current;
    const { osc, gain } = sideRef.current;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.004);
    try { osc.stop(now + 0.05); } catch (e) {}
    sideRef.current = null;
  }, []);

  // Band noise — looped white noise voiced through the receiver's CW filtering:
  // "wide"  = SSB-width lowpass hiss (2.4 kHz)
  // "cw"    = 500 Hz bandpass centered on the sidetone (standard CW filter width)
  // "apf"   = ~60 Hz high-Q peak — the audio-peak-filter sound, noise nearly becomes a pitch
  // The duck stage is AGC: signal presence pulls the noise down; it swells back in gaps.
  const noiseRef = useRef(null);
  const setNoiseLevel = useCallback((level) => {
    if (noiseRef.current && ctxRef.current) {
      noiseRef.current.g.gain.setTargetAtTime(level, ctxRef.current.currentTime, 0.05);
    }
  }, []);
  const stopNoise = useCallback(() => {
    if (noiseRef.current) {
      try { noiseRef.current.src.stop(); } catch (e) {}
      noiseRef.current = null;
    }
  }, []);
  const startNoise = useCallback((level, freq = 600, mode = "cw") => {
    const ctx = getCtx();
    if (noiseRef.current) {
      if (noiseRef.current.mode === mode) {
        setNoiseLevel(level);
        if (noiseRef.current.bp) {
          // Retune center AND Q together so the passband width stays fixed in Hz
          noiseRef.current.bp.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
          noiseRef.current.bp.Q.setTargetAtTime(freq / noiseRef.current.bw, ctx.currentTime, 0.05);
        }
        return;
      }
      stopNoise(); // filter mode changed — rebuild the chain
    }
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const duck = ctx.createGain(); // AGC stage
    duck.gain.value = 1;
    const g = ctx.createGain(); // user level
    g.gain.value = level;
    let bp = null;
    // Fixed passband widths in Hz, independent of sidetone pitch:
    // CW filter = 500 Hz, APF peak = 60 Hz. Q = center / bandwidth.
    const bw = mode === "apf" ? 60 : 500;
    if (mode === "wide") {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2400;
      src.connect(lp);
      lp.connect(duck);
    } else {
      bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = freq;
      bp.Q.value = freq / bw;
      const peak = ctx.createGain();
      peak.gain.value = mode === "apf" ? 2.6 : 1.6; // make up for bandpass energy loss
      src.connect(bp);
      bp.connect(peak);
      peak.connect(duck);
      // a whisper of broadband floor so it isn't a pure tone-noise
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1500;
      const floor = ctx.createGain();
      floor.gain.value = mode === "apf" ? 0.05 : 0.12;
      src.connect(lp);
      lp.connect(floor);
      floor.connect(duck);
    }
    duck.connect(g);
    g.connect(ctx.destination);
    src.start();
    noiseRef.current = { src, g, duck, bp, mode, bw };
  }, [setNoiseLevel, stopNoise]);

  useEffect(() => () => { stop(); stopNoise(); }, [stop, stopNoise]);
  return { play, stop, playing, keyDownTone, keyUpTone, beep, startNoise, setNoiseLevel, stopNoise, unlock };
}

// BUG key hidden 2026-06-25 pending research (machine-gun ]->hold conversion); see docs/design-bug-key.md + brief.
const BUG_KEY_ENABLED = false;

// Bug dit keep-alive duration (ms).
// Must be longer than both the VBand inter-keydown gap (~30–60ms) and one dit
// period at the slowest supported WPM, but short enough that lever release feels
// immediate. We use max(160, 2u) computed at render time (see bugDitDown).
// This constant is the hardware-tunable floor — adjust if your VBand adapter's
// machine-gun rate or a very low WPM causes stutter or premature stop.
const BUG_DIT_KEEPALIVE_MS = 160;

// QSO send auto-grade idle-pause threshold (ms).
// After the operator stops keying, the auto-grade fires if this much time passes
// with no new decoded characters. Armed as max(QSO_SEND_PAUSE_MS, 8*unit) so:
//   • the floor (1500ms) governs at normal/fast WPM (≥~7 wpm)
//   • 8u raises the threshold at slow WPM so a mid-over word-gap (7u) can't
//     accidentally trigger a grade — same max(floor, k·u) idiom as BUG_DIT_KEEPALIVE_MS.
// Travis: dial this on your real key if the grade fires too early or too late.
const QSO_SEND_PAUSE_MS = 1500;

// QSO auto-advance review window (ms): how long after a 100% grade the step
// advances automatically when qsoAutoAdvance is ON. Long enough to read the
// green 100% verdict; short enough not to feel stuck.
// Travis: dial on the real key if it feels rushed or sticky.
const QSO_AUTO_ADVANCE_MS = 4000;

/* ================= KEY DECODER ================= */
function useKeyer({ keyWpm, freq, player, enabled, mode, swap, onError, modeB = false }) {
  const [decoded, setDecoded] = useState("");
  const [buffer, setBuffer] = useState("");
  const bufRef = useRef("");
  const charTimer = useRef(null);
  const wordTimer = useRef(null);

  // Live refs so timers and handlers never see stale settings
  const unitRef = useRef(1200 / keyWpm);
  unitRef.current = 1200 / keyWpm;
  const freqRef = useRef(freq);
  freqRef.current = freq;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const swapRef = useRef(swap);
  swapRef.current = swap;

  const clearGapTimers = () => {
    clearTimeout(charTimer.current);
    clearTimeout(wordTimer.current);
  };

  // HH error prosign tracking (declared before finalizeChar uses it)
  const ditRun = useRef(0);
  const onErrorRef = useRef(null);
  onErrorRef.current = onError;

  // Per-element timing for fist feedback (Phase 1).
  // Plain ref array — no setState per element. Appending to a ref cannot cause
  // a re-render or change timing, so this is safe inside the hot pushEl path.
  // Reset on clear() and on HH wipe (resetErrorSignal) so the event list stays
  // aligned with what the user last sent.
  const eventsRef = useRef([]);
  // Track when the key was last released so we can compute gapBeforeMs.
  // Used by the straight-key path (straightUp records the real key-up time).
  const lastUpAtRef = useRef(null);
  // Paddle equivalent: records the wall-clock time at which the last paddle
  // element ended (approximated as performance.now() + durMs at scheduling time).
  // This lets sendNext measure the real gap the operator took between characters
  // or words — the part of paddle timing the operator actually controls.
  const paddleLastUpAtRef = useRef(null);

  const finalizeChar = useCallback(() => {
    if (bufRef.current) {
      const ch = REV[bufRef.current] || "■";
      setDecoded((d) => d + ch);
      bufRef.current = "";
      setBuffer("");
    }
    ditRun.current = 0; // a completed character ends any dit run
  }, []);

  const startGapTimers = useCallback(() => {
    clearGapTimers();
    const u = unitRef.current;
    charTimer.current = setTimeout(finalizeChar, u * 2.5);
    wordTimer.current = setTimeout(() => {
      setDecoded((d) => (d && !d.endsWith(" ") ? d + " " : d));
    }, u * 6.5);
  }, [finalizeChar]);

  // HH error prosign — 8 consecutive dits (ITU standard "start over"). A dah
  // breaks the run. When 8 land in a row, wipe what's been keyed, same as a
  // manual clear, and let the UI flash a notice.
  const resetErrorSignal = () => {
    ditRun.current = 0;
    bufRef.current = "";
    setBuffer("");
    setDecoded("");
    eventsRef.current = []; // HH clears the timing record too
    lastUpAtRef.current = null;
    paddleLastUpAtRef.current = null;
    clearGapTimers();
    if (onErrorRef.current) onErrorRef.current();
  };

  // pushEl handles the decode buffer and HH detection only.
  // Timing events are recorded by the two callers (straightUp and sendNext)
  // before pushEl is called, so there is no double-write.
  const pushEl = (el) => {
    if (el === ".") {
      ditRun.current += 1;
      if (ditRun.current >= 8) { resetErrorSignal(); return; }
    } else {
      ditRun.current = 0; // a dah breaks the run
    }
    bufRef.current += el;
    setBuffer(bufRef.current);
  };

  /* --- bug dit keep-alive refs --- */
  // bugDitAliveTimer: the debounced-release timer that owns when the dit stream stops.
  // Rearmed on every incoming keydown so a VBand machine-gun stream keeps it alive.
  const bugDitAliveTimer = useRef(null);
  // bugDitTouchHeld: true while a touch/pointer is down on the on-screen DIT zone.
  // Touch gives clean down/up (no machine-gun), so it bypasses the keep-alive entirely.
  const bugDitTouchHeld = useRef(false);

  /* --- straight key: you time the elements --- */
  const downAt = useRef(null);
  const straightDown = useCallback(() => {
    if (!enabledRef.current || downAt.current !== null) return;
    clearGapTimers();
    downAt.current = performance.now();
    player.keyDownTone(freqRef.current);
  }, [player]);
  // straightUp: end a manually-timed key press.
  // forceEl: if provided ("." or "-"), overrides the duration-based dit/dah
  // classification. Bug dahs use forceEl:"-" so a short Space tap is still
  // recorded as a dah (the only element the Space bar ever produces on a bug).
  // The measured durMs is preserved — classification forced, timing authentic.
  // FRAGILITY NOTE: any refactor of the classify step must preserve this override;
  // a short bug-dah silently becoming a dit breaks the dah-weighting feature.
  const straightUp = useCallback(({ forceEl } = {}) => {
    if (downAt.current === null) return;
    const now = performance.now();
    const durMs = now - downAt.current;
    downAt.current = null;
    player.keyUpTone();
    const el = forceEl ?? (durMs < unitRef.current * 2 ? "." : "-");
    // Record timing event: gapBeforeMs is time from last key-up to this key-down.
    // We approximate: key-down was at (now - durMs), last key-up was lastUpAtRef.
    const gapBeforeMs = lastUpAtRef.current !== null
      ? Math.max(0, (now - durMs) - lastUpAtRef.current)
      : 0;
    eventsRef.current.push({ type: el === "." ? "dit" : "dah", durMs, gapBeforeMs });
    lastUpAtRef.current = now;
    pushEl(el);
    startGapTimers();
  }, [player, startGapTimers]);

  /* --- paddle: the keyer times the elements --- */
  const ditHeld = useRef(false);
  const dahHeld = useRef(false);
  const sending = useRef(false);
  const lastEl = useRef(null);
  const memory = useRef(null); // opposite-paddle tap latched mid-element (Curtis)
  const loopTimer = useRef(null);

  // Mode B refs. modeBRef mirrors the prop so the timer closure always reads
  // the live value without recreating sendNext (same pattern as modeRef/swapRef).
  // squeezed tracks whether both paddles were held simultaneously during the
  // current send run — Mode B emits one extra element when a squeeze is detected
  // and both paddles release. Cleared on clear() and after the Mode B element.
  const modeBRef = useRef(modeB);
  modeBRef.current = modeB;
  const squeezed = useRef(false);

  const sendNext = useCallback(() => {
    let el = null;
    if (ditHeld.current && dahHeld.current) {
      el = lastEl.current === "." ? "-" : ".";
      // Mark that a squeeze (both paddles held) occurred during this run.
      squeezed.current = true;
    } else if (memory.current) { el = memory.current; memory.current = null; }
    else if (ditHeld.current) el = ".";
    else if (dahHeld.current) el = "-";
    if (!el) {
      // No paddle held. Check Mode B: if both were squeezed at some point,
      // emit exactly ONE extra element of the alternate type, then stop.
      // This emits through the same eventsRef.push + pushEl path as a normal
      // element so fist analysis and decode see it identically.
      if (modeBRef.current && squeezed.current) {
        squeezed.current = false; // consumed; clear before the element to avoid re-entry
        const extraEl = lastEl.current === "." ? "-" : ".";
        lastEl.current = extraEl;
        const u = unitRef.current;
        const durMs = extraEl === "." ? u : 3 * u;
        const now = performance.now();
        player.beep(freqRef.current, durMs / 1000);
        const gapBeforeMs = paddleLastUpAtRef.current !== null
          ? Math.max(0, now - paddleLastUpAtRef.current)
          : 0;
        eventsRef.current.push({ type: extraEl === "." ? "dit" : "dah", durMs, gapBeforeMs });
        paddleLastUpAtRef.current = now + durMs;
        pushEl(extraEl);
        // Mode B adds exactly ONE element then stops — do not schedule sendNext.
      }
      // Always stop the loop regardless of Mode B path taken.
      sending.current = false;
      startGapTimers();
      return;
    }
    clearGapTimers();
    sending.current = true;
    lastEl.current = el;
    const u = unitRef.current;
    const durMs = el === "." ? u : 3 * u;
    const now = performance.now();
    player.beep(freqRef.current, durMs / 1000);
    // Record the real gap the operator left before this element.
    // For the first element (paddleLastUpAtRef is null) the gap is 0.
    // For machine-timed intra-character elements (immediately following in the
    // iambic loop) paddleLastUpAtRef is very recent so gapBeforeMs ≈ u — the
    // intra-element gap analyzeFist already suppresses for paddle mode.
    // For inter-character or inter-word pauses (operator releases the paddle,
    // waits, then presses again) gapBeforeMs captures the real user-controlled
    // gap, which is exactly what the character/word spacing verdicts need.
    const gapBeforeMs = paddleLastUpAtRef.current !== null
      ? Math.max(0, now - paddleLastUpAtRef.current)
      : 0;
    eventsRef.current.push({ type: el === "." ? "dit" : "dah", durMs, gapBeforeMs });
    // Record when this element ends so the next call can measure the gap.
    // We use now+durMs as an approximation of the element's end wall-clock time.
    // The iambic loop fires sendNext again at durMs+u ms from now; that next call
    // will read paddleLastUpAtRef and compute gapBeforeMs ≈ u (machine gap).
    paddleLastUpAtRef.current = now + durMs;
    pushEl(el);
    loopTimer.current = setTimeout(sendNext, durMs + u);
  }, [player, startGapTimers]);

  const paddleDown = useCallback((el) => {
    if (!enabledRef.current) return;
    if (el === ".") ditHeld.current = true;
    else dahHeld.current = true;
    if (sending.current) {
      if (el !== lastEl.current) memory.current = el;
    } else {
      sendNext();
    }
  }, [sendNext]);

  const paddleUp = useCallback((el) => {
    if (el === ".") ditHeld.current = false;
    else dahHeld.current = false;
  }, []);

  // bugDitDown: called on each keyboard dit keydown (VBand machine-gun stream) or
  // on pointer-down on the on-screen DIT zone.
  //
  // Keyboard path: each arriving keydown re-arms a keep-alive timer (BUG_DIT_KEEPALIVE_MS,
  // at least 2u). The timer owns release — a stray keyup mid-stream is ignored.
  // This keeps the dit stream flowing through a VBand machine-gun input without stutter.
  //
  // Pointer path (fromTouch=true): pointer gives clean down/up events so we skip the
  // keep-alive entirely; bugDitTouchHeld is the release authority instead.
  const bugDitDown = useCallback((fromTouch = false) => {
    if (!enabledRef.current) return;
    if (fromTouch) {
      bugDitTouchHeld.current = true;
    } else {
      // Keyboard: re-arm the keep-alive. Effective timeout = max(floor, 2 dit units).
      const keepAliveMs = Math.max(BUG_DIT_KEEPALIVE_MS, 2 * unitRef.current);
      clearTimeout(bugDitAliveTimer.current);
      bugDitAliveTimer.current = setTimeout(() => {
        ditHeld.current = false;
        bugDitTouchHeld.current = false;
      }, keepAliveMs);
    }
    // Start the paddle dit engine if it's not already running.
    if (!ditHeld.current) {
      ditHeld.current = true;
      if (!sending.current) sendNext();
    }
  }, [sendNext]);

  // bugDitUp: called on pointer-up on the DIT zone (touch path only).
  // Keyboard keyups are ignored — the keep-alive timer is the authority there.
  const bugDitUp = useCallback(() => {
    bugDitTouchHeld.current = false;
    ditHeld.current = false;
    // Clear the timer so a fresh keyboard dit can arm it cleanly later.
    clearTimeout(bugDitAliveTimer.current);
  }, []);

  const clear = useCallback(() => {
    bufRef.current = "";
    setBuffer("");
    setDecoded("");
    eventsRef.current = [];  // wipe timing record on explicit clear
    lastUpAtRef.current = null;
    paddleLastUpAtRef.current = null;
    clearGapTimers();
    clearTimeout(loopTimer.current);
    clearTimeout(bugDitAliveTimer.current); // also stop any pending bug keep-alive
    sending.current = false;
    memory.current = null;
    squeezed.current = false; // Mode B: clear squeeze state on explicit clear
    ditHeld.current = false;
    dahHeld.current = false;
    bugDitTouchHeld.current = false;
    downAt.current = null;
    ditRun.current = 0;
    player.keyUpTone(); // release a held sidetone — no-op if none is sounding
  }, [player]);

  useEffect(() => {
    if (!enabled) return;
    const inField = (e) => {
      const t = e.target;
      return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
    };
    // Resolve which key code is the bug/paddle dit lever given current swap state.
    // Swap flips the lever side only; on a bug the dah is always Space.
    const bugDitCode = () => swapRef.current ? "BracketRight" : "BracketLeft";
    // Secondary VBand bracket codes also trigger the dit (mirrors paddle handling).
    const bugDitCodes = () => swapRef.current
      ? ["BracketRight", "KeyX", "ArrowRight"]
      : ["BracketLeft",  "KeyZ", "ArrowLeft"];

    const dn = (e) => {
      if (e.repeat || inField(e)) return;
      if (modeRef.current === "straight") {
        if (e.code === "Space") { e.preventDefault(); straightDown(); }
      } else if (modeRef.current === "bug") {
        // Bug dit lever: bracket keys (+ Z/X/arrows for VBand compatibility) → auto dits.
        // Bug dah: Space bar → manual element, always forced to "-".
        // e.repeat is already false here (top guard). VBand sends distinct keydowns.
        if (bugDitCodes().includes(e.code)) { e.preventDefault(); bugDitDown(false); }
        else if (e.code === "Space") { e.preventDefault(); straightDown(); }
      } else {
        const left = swapRef.current ? "-" : ".";
        const right = swapRef.current ? "." : "-";
        if (e.code === "KeyZ" || e.code === "ArrowLeft" || e.code === "BracketLeft") { e.preventDefault(); paddleDown(left); }
        if (e.code === "KeyX" || e.code === "ArrowRight" || e.code === "BracketRight") { e.preventDefault(); paddleDown(right); }
      }
    };
    const up = (e) => {
      if (inField(e)) return;
      if (modeRef.current === "straight") {
        if (e.code === "Space") { e.preventDefault(); straightUp(); }
      } else if (modeRef.current === "bug") {
        // Bug dit keyup: ignored — the keep-alive timer owns release for keyboard input.
        // Bug dah keyup: end the manual element (forced classification to "-").
        if (e.code === "Space") { e.preventDefault(); straightUp({ forceEl: "-" }); }
        // Dit keyup intentionally a no-op for keyboard path (timer-driven release).
      } else {
        const left = swapRef.current ? "-" : ".";
        const right = swapRef.current ? "." : "-";
        if (e.code === "KeyZ" || e.code === "ArrowLeft" || e.code === "BracketLeft") paddleUp(left);
        if (e.code === "KeyX" || e.code === "ArrowRight" || e.code === "BracketRight") paddleUp(right);
      }
    };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
      // Switching away mid-key must not leave a sidetone ringing or a paddle/bug looping
      clearTimeout(loopTimer.current);
      clearTimeout(bugDitAliveTimer.current);
      ditHeld.current = false;
      downAt.current = null;
      sending.current = false;
      player.keyUpTone();
    };
  }, [enabled, straightDown, straightUp, paddleDown, paddleUp, bugDitDown, player]);

  // events is the ref array — consumers read eventsRef.current directly.
  // We expose it as a stable object ref so KeyTrainer can pass it to analyzeFist
  // without triggering re-renders.
  return { decoded, buffer, eventsRef, straightDown, straightUp, paddleDown, paddleUp, bugDitDown, bugDitUp, clear };
}

/* similarity() is in src/cw-core.js */

function CharDiff({ target, attempt }) {
  const t = target.toUpperCase();
  const a = attempt.trim().toUpperCase().replace(/\s+/g, " ");
  const correctCount = t.split("").filter((ch, i) => a[i] === ch).length;
  return (
    <div>
      {/* sr-only summary: gives screen-reader users a count instead of 40 color-coded
          spans they can't distinguish by color alone. "N of M correct" pairs with the
          Score announcement so the accessible view is complete without the visual diff. */}
      <span style={S.srOnly}>{correctCount} of {t.length} characters correct</span>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 18, letterSpacing: 2, lineHeight: 1.8, wordBreak: "break-all" }} aria-hidden="true">
        {t.split("").map((ch, i) => {
          const ok = a[i] === ch;
          return (
            <span key={i} style={{ color: ok ? "#8FCB9B" : "#E07A5F", borderBottom: ok ? "none" : "2px solid #E07A5F" }}>
              {ch}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ================= COUNTDOWN HOOK =================
   Shared by CopyTrainer and QsoSim. Counts 5 → 1, then fires a callback.
   Re-triggering (e.g. clicking NEW again mid-count) cancels the prior count
   so the stale callback never fires. Cleanup on unmount does the same.
   Only NEW-listen actions use this; REPLAY always plays immediately. */
function useCountdown() {
  const [countdown, setCountdown] = useState(null);
  const intervalRef = useRef(null);
  // remainRef lets the interval read the current value without stale closure
  const remainRef = useRef(null);

  const start = useCallback((fn) => {
    clearInterval(intervalRef.current);
    remainRef.current = 5;
    setCountdown(5);
    intervalRef.current = setInterval(() => {
      remainRef.current -= 1;
      if (remainRef.current <= 0) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setCountdown(null);
        fn();
      } else {
        setCountdown(remainRef.current);
      }
    }, 1000);
  }, []);

  // cancel() stops a running countdown without firing its callback.
  // Called on QSO advance() and ABANDON so a DX countdown started mid-step
  // doesn't fire playDx() into a later step after the user moves on.
  const cancel = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setCountdown(null);
  }, []);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  return { countdown, start, cancel };
}

/* ================= SHARED UI ================= */
// Font sizes use rem so the user's browser font preference scales the text.
// 16px base reference: label 11px→0.6875rem, btn/btnAmber 14px→0.875rem,
// display 20px→1.25rem, input 18px→1.125rem.
// Structural values (padding, gap, radius, maxWidth) stay in px — they are
// layout boundaries, not text, and must not grow with font scaling.
const S = {
  panel: { background: "#191C21", border: "1px solid #2E343C", borderRadius: 10, padding: 16, marginBottom: 14 },
  label: { fontSize: "0.6875rem", letterSpacing: 1.5, color: "#8A929C", textTransform: "uppercase", fontFamily: "system-ui, sans-serif" },
  btn: { background: "#2A313A", border: "1px solid #3A434E", color: "#E8E2D6", padding: "10px 16px", borderRadius: 8, fontSize: "0.875rem", cursor: "pointer", fontFamily: "ui-monospace, monospace", letterSpacing: 1 },
  btnAmber: { background: "#3A2E18", border: "1px solid #F2A93B", color: "#F2A93B", padding: "10px 16px", borderRadius: 8, fontSize: "0.875rem", cursor: "pointer", fontFamily: "ui-monospace, monospace", letterSpacing: 1, fontWeight: 600 },
  // M1: "1.25rem" = type.readout; literal kept because S.type is defined later in the same object
  display: { background: "#080A0D", border: "1px solid #3A434E", borderRadius: 8, padding: "14px 16px", fontFamily: "ui-monospace, monospace", color: "#FFD89B", fontSize: "1.25rem", letterSpacing: 3, minHeight: 56, wordBreak: "break-all", boxShadow: "inset 0 2px 12px rgba(0,0,0,0.6)" },
  // M1: "1.125rem" = type.title; literal kept because S.type is defined later in the same object
  input: { background: "#080A0D", border: "1px solid #3A434E", borderRadius: 8, padding: "12px 14px", fontFamily: "ui-monospace, monospace", color: "#FFD89B", fontSize: "1.125rem", letterSpacing: 2, width: "100%", boxSizing: "border-box", textTransform: "uppercase" },
  // sr-only: visually hidden but reachable by screen readers (clip technique, NOT
  // display:none or aria-hidden — those remove the node from the accessibility tree).
  // Used for always-mounted live regions: the region exists empty when idle and its
  // text is set on the event, so AT sees a *change* and announces it.
  srOnly: { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" },

  // ---- Token layer (H1) ----
  // Grounds: three deliberate elevation levels. Every near-black in the app maps to one.
  ground: {
    app:   "#0D0F13",  // page background (deepest visible chrome)
    panel: "#191C21",  // raised card / panel surface
    well:  "#080A0D",  // inset readout/input "well" (recessed below panel)
  },
  // Spacing scale (px — structural, must NOT scale with font preference).
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  // Corner radii (px).
  radius: { sm: 8, md: 10, lg: 16 },
  // Semantic tones (status / verdict).
  tone: {
    ok:   "#8FCB9B",  // good / on-target / solid
    warn: "#F2A93B",  // caution / loose — same hue as the amber accent, intentionally
    err:  "#E07A5F",  // tight / error / poor
  },
  // Text colors (see H2 for the contrast-driven values).
  text: {
    body:        "#E8E2D6",  // primary body text on dark grounds
    bright:      "#C9CDD3",  // emphasized inline text
    dim:         "#8A929C",  // informational / instructional gray (AA floor — see H2)
    faint:       "#5A626C",  // DECORATIVE ONLY — oversized/brand, never small reading text (H2)
    hairline:    "#3A434E",  // DECORATIVE ONLY — footer fine print, dividers (H2)
    amber:       "#F2A93B",  // accent / dial-glow
    code:        "#FFD89B",  // monospace readout (callsigns, Morse, code)
    eyebrowDim:  "#8A6A33",  // dim-amber wordmark eyebrow — DECORATIVE wordmark only (H2)
    eyebrowText: "#A8823F",  // dim-amber when it carries readable WORDS (H2)
  },
  // Standard borders.
  border: {
    panel:   "1px solid #2E343C",
    control: "1px solid #3A434E",
    amber:   "1px solid #F2A93B",
  },
  // keySurface: the shared "physical key" recipe for TouchKey / PaddleKey / BugKey.
  // Defined once here; all three spread it so the gradient/border/shadow are a
  // single source of truth.
  keySurface: {
    background:   "radial-gradient(ellipse at 50% 30%, #3A3128, #241F18)",
    border:       "2px solid #6B5837",
    borderRadius: 16,
    boxShadow:    "0 4px 0 #15110C, inset 0 1px 0 rgba(255,200,120,0.15)",
    color:        "#F2A93B",
    fontFamily:   "ui-monospace, monospace",
  },
  // Chart tokens — used by BarTrend only; not for ad-hoc inline use.
  // chart: the flex bar-chart container (fixed height, relative for the mastery line).
  // chartLine: the absolutely-positioned 90% mastery line overlay.
  chart: { position: "relative", display: "flex", alignItems: "flex-end", gap: 2, height: 72, overflow: "hidden" },
  chartLine: {
    position: "absolute",
    // bottom = 90% of 72px = 64.8px — the top of a 90% bar meets this line exactly.
    bottom: Math.round((90 / 100) * 72),
    left: 0, right: 0,
    borderTop: "1px dashed #8FCB9B",  // S.tone.ok — the mastery color
    pointerEvents: "none",
  },
  // selected: consistent toggle/active state — amber border + text + weight 700.
  // The fontWeight shift is the non-color cue (L2). Inactive half: color: S.text.dim.
  // Uses `border` (not `borderColor`) to avoid the React shorthand-vs-longhand style warning
  // when spread alongside S.btn which already sets `border`.
  selected: { background: "#3A2E18", border: "1px solid #F2A93B", color: "#F2A93B", fontWeight: 700 },
  // Type scale (rem — scales with OS font preference; structural px values stay px).
  type: {
    display: "2rem",      // 32px — splash/brand hero
    readout: "1.25rem",   // 20px — primary code readout (Display)
    title:   "1.125rem",  // 18px — input echo, section heroes
    body:    "0.875rem",  // 14px — buttons, standard UI text
    label:   "0.6875rem", // 11px — tracked uppercase labels, help text (the workhorse)
    micro:   "0.625rem",  // 10px — finest print (footer tagline, dense meta)
  },
};

// Display — the recessed code readout. `compact` (narrow KEY only) shrinks the
// type and, crucially, CAPS the height with an internal scroll so a long target
// scrolls INSIDE the readout instead of pushing the key surface down the page —
// the key's vertical position becomes independent of target length. Default
// (compact=false) is byte-identical to the shipped readout.
function Display({ children, cursor, compact }) {
  const style = compact
    ? { ...S.display, minHeight: 40, padding: "8px 14px", fontSize: "1.05rem", letterSpacing: 2, maxHeight: 76, overflowY: "auto" }
    : S.display;
  return (
    <div style={style}>
      {children}
      {cursor && <span className="wr-cursor" style={{ color: "#F2A93B" }}>▮</span>}
    </div>
  );
}

function TouchKey({ keyDown, keyUp, surfaceRef }) {
  // role="button" + tabIndex makes this focusable and announced by AT.
  // Keying is owned by the window keydown handler — do not add a competing
  // handler here (double-fire). The window handler's preventDefault on Space
  // suppresses page scroll even when this div is focused.
  // surfaceRef (optional): lets a parent move focus HERE — QSO break-in needs
  // focus off the copy <input>, or the keyer's inField guard eats every keystroke.
  return (
    <div
      ref={surfaceRef}
      role="button"
      tabIndex={0}
      aria-label="Straight key — press and hold Space, or hold this control, to send"
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); keyDown(); }}
      onPointerUp={(e) => { e.preventDefault(); keyUp(); }}
      onPointerCancel={keyUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        // H1: shared key-surface recipe; per-component deltas below
        ...S.keySurface,
        userSelect: "none", touchAction: "none", WebkitUserSelect: "none",
        padding: "34px 0", textAlign: "center",
        fontSize: 16, letterSpacing: 3, cursor: "pointer", marginTop: 12,
      }}
    >
      ● KEY ●
      {/* D3: first-timer dit/dah cue — one line, lightweight, gray, ≥12px */}
      {/* H2: bump dim-amber instruction text to eyebrowText (#A8823F) for AA contrast */}
      <div style={{ fontSize: S.type.label, color: S.text.eyebrowText, marginTop: 6, letterSpacing: 1 }}>short tap = dit · long hold = dah</div>
      {/* H2: floor "or use SPACEBAR" to S.text.dim (#8A929C) — carries readable words */}
      <div style={{ fontSize: S.type.label, color: S.text.dim, marginTop: 3, letterSpacing: 1 }}>or use SPACEBAR</div>
    </div>
  );
}

function PaddleKey({ paddleDown, paddleUp, swap, surfaceRef }) {
  // role="button" + tabIndex + aria-label make each zone focusable and announced by AT.
  // Keying is owned by the window keydown handler — do not add a competing
  // handler here (double-fire). The aria-label names the keyboard shortcut so a
  // screen-reader user knows how to key from the keyboard, which already works.
  // surfaceRef (optional) lands on the DIT zone — see TouchKey for why.
  const zone = (el, label, glyph, ariaLabel, ref) => (
    <div
      key={el}
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); paddleDown(el); }}
      onPointerUp={(e) => { e.preventDefault(); paddleUp(el); }}
      onPointerCancel={() => paddleUp(el)}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        // H1: shared key-surface recipe; per-component deltas below
        ...S.keySurface,
        flex: 1, userSelect: "none", touchAction: "none", WebkitUserSelect: "none",
        padding: "34px 0", textAlign: "center", cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 26, lineHeight: 1 }}>{glyph}</div>
      <div style={{ fontSize: S.type.body, letterSpacing: 3, marginTop: 6 }}>{label}</div>
      {/* H2: bump dim-amber instruction text to eyebrowText (#A8823F) for AA contrast */}
      <div style={{ fontSize: S.type.label, color: S.text.eyebrowText, marginTop: 4, letterSpacing: 1 }}>hold to repeat</div>
    </div>
  );
  const dit = zone(".", "DIT", "·", "Dit paddle — press and hold Z or left arrow", surfaceRef);
  const dah = zone("-", "DAH", "—", "Dah paddle — press and hold X or right arrow");
  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        {swap ? <>{dah}{dit}</> : <>{dit}{dah}</>}
      </div>
      <div style={{ fontSize: "0.75rem", color: "#8A929C", fontFamily: "system-ui, sans-serif", textAlign: "center", marginTop: 8 }}>
        Keyboard: Z / ← is the left zone, X / → the right · squeeze both to alternate
      </div>
    </div>
  );
}

// BugKey — on-screen key surface for bug (semiautomatic) mode.
// Two zones: DIT (pointer-down = auto dits via keep-alive-free touch path)
// and DAH (pointer-down = manual element, forced to "-" by straightUp).
// Styled identically to PaddleKey using the same zone helper.
function BugKey({ bugDitDown, bugDitUp, dahDown, dahUp, swap, surfaceRef }) {
  // surfaceRef (optional) lands on the DIT zone — see TouchKey for why.
  const zone = (label, glyph, sub, ariaLabel, onDown, onUp, ref) => (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); onDown(); }}
      onPointerUp={(e) => { e.preventDefault(); onUp(); }}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        // H1: shared key-surface recipe; per-component deltas below
        ...S.keySurface,
        flex: 1, userSelect: "none", touchAction: "none", WebkitUserSelect: "none",
        padding: "34px 0", textAlign: "center", cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 26, lineHeight: 1 }}>{glyph}</div>
      <div style={{ fontSize: S.type.body, letterSpacing: 3, marginTop: 6 }}>{label}</div>
      {/* H2: bump dim-amber instruction text to eyebrowText (#A8823F) for AA contrast */}
      <div style={{ fontSize: S.type.label, color: S.text.eyebrowText, marginTop: 4, letterSpacing: 1 }}>{sub}</div>
    </div>
  );

  const ditZone = zone(
    "DIT", "·", "hold = auto dits",
    "Bug dit lever — press and hold for automatic dits (bracket key or this control)",
    () => bugDitDown(true),  // fromTouch=true: pointer gives clean up/down, skip keep-alive
    bugDitUp,
    surfaceRef,
  );
  const dahZone = zone(
    "DAH", "—", "hold = one dah, you time it",
    "Bug dah — press and hold to send a hand-timed dah (Space or this control)",
    dahDown,
    dahUp,
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        {/* Swap flips the dit lever side; Space (dah) is always on the right of the on-screen layout */}
        {swap ? <>{dahZone}{ditZone}</> : <>{ditZone}{dahZone}</>}
      </div>
      <div style={{ fontSize: "0.75rem", color: "#8A929C", fontFamily: "system-ui, sans-serif", textAlign: "center", marginTop: 8 }}>
        {swap
          ? "Keyboard: ] / X / → is dit lever · Space is dah — you time the dahs"
          : "Keyboard: [ / Z / ← is dit lever · Space is dah — you time the dahs"}
      </div>
    </div>
  );
}

// SwapToggle — standalone swap button rendered alongside KeyModeControls.
// Visible for paddle and bug; hidden for straight key (no levers to swap).
// KeyTrainer wide + QsoSim render the default (full) variant next to the type
// selector; KeyTrainer narrow renders the `compact` variant on the one-row
// instrument strip beside the key (see narrowInstrumentStrip).
function SwapToggle({ swap, onSwap, keyType, compact }) {
  if (keyType !== "paddle" && keyType !== "bug") return null;
  // Narrow instrument-strip variant: just the ⇄ button on a ≥40px touch target,
  // sized to sit on one row beside the key-type toggle. The verbose help sentence
  // is dropped on narrow — the button's aria-label already carries the meaning, so
  // no information is lost to AT (design §1.3-B). Uses `border` (not `borderColor`)
  // to override S.btn's border shorthand cleanly when active.
  if (compact) {
    return (
      <button
        onClick={() => onSwap(!swap)}
        title="Swap dit/dah for left-handed keying"
        aria-label={`Swap dit and dah paddles — currently ${swap ? "left-handed" : "right-handed"}`}
        style={{ ...S.btn, minHeight: 40, padding: "0 12px", fontSize: "0.75rem",
          ...(swap ? { border: "1px solid #F2A93B", color: "#F2A93B", fontWeight: 700 } : { color: S.text.dim }) }}>
        ⇄ {swap ? "L" : "R"}
      </button>
    );
  }
  const helpText = keyType === "bug"
    ? `swaps which bracket is the dit lever — Space is always the dah`
    : `swaps which paddle sends dit vs dah — set it to ${swap ? "L for left-handed" : "R for right-handed"}`;
  return (
    <div style={{ textAlign: "center", marginTop: 10 }}>
      <button
        onClick={() => onSwap(!swap)}
        title="Swap dit/dah for left-handed keying"
        aria-label={`Swap dit and dah paddles — currently ${swap ? "left-handed" : "right-handed"}`}
        style={{ ...S.btn, padding: "7px 12px", fontSize: "0.75rem", ...(swap ? { color: "#F2A93B", borderColor: "#F2A93B", fontWeight: 700 } : { color: S.text.dim }) }}>
        ⇄ {swap ? "L" : "R"}
      </button>
      <div style={{ fontSize: "0.75rem", color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 6 }}>
        ⇄ {helpText}
      </div>
    </div>
  );
}

// KeyModeControls — the key-type toggle (PADDLE / STRAIGHT KEY / BUG).
// Extracted from KeyInput so the rail-split can place these controls
// in the options rail (wide) while the key surface itself stays in main. Both
// pieces still drive the same keyer instance held by KeyTrainer — no state moves.
// QsoSim keeps using the combined KeyInput below and is unaffected by this split.
// The swap button is NOT inside this component — it lives in SwapToggle, rendered
// by the caller immediately after this component so they travel as a cluster.
// modeB / onModeB: optional — only passed when the parent is KeyTrainer (not QsoSim,
// which shows the full KeyInput). The Mode B toggle is only visible for keyType==="paddle".
// IambicToggle — the Mode A/B segmented pair (paddle only). Extracted so both the
// wide KeyModeControls (its default position, below the type row) and the narrow
// KEY layout (below the key surface, keeping the instrument strip to one row) render
// the SAME control with no duplication. `compact` bumps the touch target to ≥40px.
// compact=false is byte-identical to the shipped wide control.
function IambicToggle({ modeB, onModeB, compact }) {
  return (
    <div style={{ marginTop: compact ? 12 : 8 }}>
      <div style={{ ...S.label, marginBottom: 4 }}>Iambic mode</div>
      <div style={{ display: "flex", gap: 6 }}>
        {[["a", "MODE A", false], ["b", "MODE B", true]].map(([id, label, val]) => (
          <button key={id}
            aria-pressed={modeB === val}
            onClick={() => onModeB(val)}
            style={{ ...S.btn, flex: 1, ...(compact ? { minHeight: 40, padding: "0 8px" } : { padding: "6px 8px" }), fontSize: "0.6875rem",
              ...(modeB === val ? S.selected : { color: S.text.dim }) }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// KeyModeControls — the key-type toggle row (+ Iambic sub-toggle when this is the
// KEY tab's full control). `compact` (narrow instrument strip) bumps the type
// buttons to a ≥40px touch target and drops the top margin so the buttons sit flush
// on the strip row. compact=false is byte-identical to the shipped wide control.
// When compact, Iambic is NOT rendered here — the narrow layout renders IambicToggle
// below the key so the strip stays one row (pass no onModeB in that case).
function KeyModeControls({ keyType, onKeyType, modeB, onModeB, compact }) {
  return (
    <div style={{ marginTop: compact ? 0 : 12 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {/* BUG is only offered when BUG_KEY_ENABLED is true (shelved pending research). */}
        {/* L2: S.selected spreads fontWeight:700 as the non-color selected cue */}
        {[["paddle", "PADDLE"], ["straight", "STRAIGHT KEY"], ...(BUG_KEY_ENABLED ? [["bug", "BUG"]] : [])].map(([v, l]) => (
          <button key={v} aria-pressed={keyType === v} onClick={() => onKeyType(v)}
            style={{ ...S.btn, flex: 1, ...(compact ? { minHeight: 40, padding: "0 10px" } : { padding: "7px 10px" }), fontSize: "0.6875rem", ...(keyType === v ? S.selected : { color: S.text.dim }) }}>
            {l}
          </button>
        ))}
      </div>
      {/* Mode A/B toggle — only shown for paddle, only when callbacks provided */}
      {keyType === "paddle" && onModeB !== undefined && (
        <IambicToggle modeB={modeB} onModeB={onModeB} />
      )}
    </div>
  );
}

// KeyInput — combined toggle + swap + key surface. Used by QsoSim, which has not
// been split (the key is part of the exchange flow there, not a separate pane).
// KeyTrainer uses KeyModeControls + inlined key surface instead (see Phase 3 split).
// SwapToggle is now rendered inline here so it appears above the surface in QsoSim too.
// surfaceRef (optional): forwarded to whichever key surface is currently rendered,
// so a parent can move keyboard focus onto it. Undefined for every existing caller.
function KeyInput({ keyer, keyType, onKeyType, swap, onSwap, surfaceRef }) {
  return (
    <div>
      <KeyModeControls keyType={keyType} onKeyType={onKeyType} />
      <SwapToggle swap={swap} onSwap={onSwap} keyType={keyType} />
      {keyType === "paddle"
        ? <PaddleKey paddleDown={keyer.paddleDown} paddleUp={keyer.paddleUp} swap={swap} surfaceRef={surfaceRef} />
        : keyType === "bug"
        ? <BugKey bugDitDown={keyer.bugDitDown} bugDitUp={keyer.bugDitUp}
            dahDown={keyer.straightDown} dahUp={() => keyer.straightUp({ forceEl: "-" })}
            swap={swap} surfaceRef={surfaceRef} />
        : <TouchKey keyDown={keyer.straightDown} keyUp={keyer.straightUp} surfaceRef={surfaceRef} />}
    </div>
  );
}

/* ================= BREAK-IN PANEL (QSO DX step) ================= */
//
// A DX step has exactly ONE required action: copy what you heard, then continue.
// The key is a REPAIR tool here (? / AGN / QRS / partial-call fill), not the way
// you answer — you answer on the NEXT step. Before 2.4.1 the key pad was always
// expanded at step 1, which read as "key your reply here" and was the single most
// misleading thing on the screen. Worse, it could not work: the copy <input> is
// auto-focused on every DX step and the keyer's window listener drops any event
// whose target is an INPUT, so SPACEBAR typed a space instead of keying.
//
// So this panel does two jobs at once:
//   1. Presentation — collapse the whole key block behind one 44px disclosure, so
//      at rest the copy field is the only prominent input.
//   2. Behaviour — arming it BLURS the copy field and moves focus onto the key
//      surface. That is what makes `e.target` a div instead of an INPUT, which is
//      what makes the keyer hear the keyboard at all. The two are not separable:
//      the disclosure IS the mode switch.
//
// The trigger borrows CompactSelect's chrome (S.btn ground, control border, 44px,
// caret) without its mechanism, per design-compact-selectors.md §4.6.
//
// Armed state is carried by THREE non-colour signals (the standing L2 rule):
// the words change, the caret flips and the body appears, and aria-expanded is
// exposed. Amber + weight 700 are additional, never the only cue.
function BreakInPanel({ keyer, armed, onArmedChange, keyType, onKeyType, swap, onSwap, fillMsg, compact }) {
  const surfaceRef = useRef(null);

  // Arming must land focus on the key surface, or the keyer stays deaf. The panel
  // owns this rather than the parent because the surface only exists once armed —
  // this effect runs on the commit that mounts it.
  useEffect(() => {
    if (armed) surfaceRef.current?.focus();
  }, [armed]);

  return (
    <div
      style={{ marginBottom: 12 }}
      // Esc is the symmetric escape hatch: it arms from the copy field and
      // disarms from anywhere inside the panel, so no mode can trap you.
      onKeyDown={(e) => {
        if (e.key === "Escape" && armed) { e.stopPropagation(); onArmedChange(false); }
      }}
    >
      <button
        type="button"
        aria-expanded={armed}
        aria-controls="qso-breakin-body"
        onClick={() => onArmedChange(!armed)}
        style={{
          ...S.btn,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          width: "100%", minWidth: 0, minHeight: 44, padding: "10px 14px",
          textAlign: "left", boxSizing: "border-box",
          color: armed ? S.text.amber : S.text.body,
          fontWeight: armed ? 700 : 400,
        }}
      >
        {/* Wraps rather than ellipsizes: measured at 390px the label truncated to
            "BREAK IN — ASK FOR A REPE…", which cuts off exactly the half that
            disambiguates this control from "send your answer". A second line
            costs a few px; losing the meaning costs the whole point of the row. */}
        <span style={{ minWidth: 0, flexShrink: 1, textAlign: "left" }}>
          <span aria-hidden="true">⚡ </span>
          {armed ? "BREAK-IN ARMED — KEYING" : "BREAK IN — ASK FOR A REPEAT"}
        </span>
        <span aria-hidden="true" style={{ color: S.text.dim, flexShrink: 0 }}>{armed ? "▴" : "▾"}</span>
      </button>

      {armed && (
        <div id="qso-breakin-body" style={{
          background: S.ground.panel, border: S.border.panel, borderRadius: S.radius.sm,
          padding: 12, marginTop: 8,
        }}>
          <p style={{
            color: S.text.dim, fontSize: S.type.label, fontFamily: "system-ui, sans-serif",
            margin: "0 0 10px", lineHeight: 1.6,
          }}>
            This interrupts them for a repeat. It is not your answer — you answer on the next step.
          </p>
          <div style={{ ...S.label, marginBottom: 6 }}>
            Decoded from your key <span style={{ color: S.text.amber }}>{keyer.buffer}</span>
          </div>
          {/* data-testid: a layout-neutral hook so the keyboard-reachability tests
              can read the decode OUTPUT directly instead of walking siblings. */}
          <div data-testid="breakin-decode">
            <Display compact={compact}>{keyer.decoded}</Display>
          </div>
          {/* Always-mounted status container: a live region only announces when the
              text of an ALREADY-MOUNTED node changes. Mounting the node together
              with its text is an addition, not a change, and AT stays silent —
              the exact bug design-keying-qso §0 fixed everywhere else. */}
          <div role="status" aria-live="polite" aria-atomic="true" style={{
            fontFamily: "ui-monospace, monospace", color: S.tone.ok,
            fontSize: "0.8125rem", letterSpacing: 1, marginTop: 8, minHeight: "1.2em",
          }}>
            {fillMsg && <><span aria-hidden="true">◉ </span>{fillMsg}</>}
          </div>
          <KeyInput keyer={keyer} keyType={keyType} onKeyType={onKeyType}
            swap={swap} onSwap={onSwap} surfaceRef={surfaceRef} />
          <div style={{ fontSize: "0.75rem", color: S.text.dim, fontFamily: "system-ui, sans-serif", marginTop: 8, lineHeight: 1.6 }}>
            <span>?</span> or <span>AGN</span> — repeat the whole transmission · partial call + <span>?</span> (NM0?) — they confirm their full call · <span>QRS</span> — slower please
          </div>
        </div>
      )}
    </div>
  );
}

function Slider({ label, value, min, max, step, suffix, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={S.label}>{label}</span>
        <span style={{ fontFamily: "ui-monospace, monospace", color: "#F2A93B", fontSize: "0.875rem" }}>{value}{suffix}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#F2A93B", touchAction: "none", height: 28 }}
      />
    </div>
  );
}

function Score({ pct }) {
  const color = pct >= 90 ? "#8FCB9B" : pct >= 70 ? "#F2A93B" : "#E07A5F";
  const msg = pct >= 90 ? "SOLID COPY" : pct >= 70 ? "GOOD — AGN FOR PRACTICE" : "PSE AGN";
  // aria-hidden: announcement comes from the caller's always-mounted sr-only live region
  // (set in check()). Keeping aria-live here would double-announce: the region fires
  // because it's already in the DOM when Score mounts together with its text, which is
  // exactly the bug the live-region pattern (design §0) fixes.
  return (
    <div aria-hidden="true" style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 10 }}>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 30, color, fontWeight: 700 }}>{pct}%</span>
      <span style={{ ...S.label, color }}>{msg}</span>
    </div>
  );
}

/* ================= BANNER (M4) ================= */
// Replaces the bespoke W1AW nudge and no-persist warning rows.
// variant="note"    → neutral ground, control border, role="note"
// variant="warning" → neutral ground, amber border, role="status"
// onDismiss is optional — omit for a persistent banner (no ✕ button).
function Banner({ variant, onDismiss, dismissLabel, children }) {
  const borderStyle = variant === "warning" ? S.border.amber : S.border.control;
  const textColor = variant === "warning" ? S.text.bright : S.text.dim;
  const role = variant === "warning" ? "status" : "note";
  return (
    <div
      className="wr-full"
      role={role}
      style={{
        display: "flex", alignItems: "flex-start", gap: S.space.md,
        background: S.ground.panel, border: borderStyle,
        borderRadius: S.radius.sm, padding: "10px 14px", marginBottom: S.space.lg,
      }}
    >
      <span style={{
        flex: 1, fontSize: S.type.label, fontFamily: "system-ui, sans-serif",
        lineHeight: 1.6, color: textColor,
      }}>
        {children}
      </span>
      {onDismiss && (
        <button
          aria-label={dismissLabel}
          onClick={onDismiss}
          style={{ ...S.btn, padding: "2px 8px", fontSize: S.type.label, lineHeight: 1, flexShrink: 0, color: S.text.dim }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

/* ================= TAG (M4) ================= */
// Verdict chip — color + text word so there's always a non-color cue (L2 rule).
// A Tag MUST always render its verdict word — never a color-only dot.
// verdict ∈ "good" | "loose" | "tight" | undefined
const VERDICT_COLOR = {
  good:  S.tone.ok,    // #8FCB9B
  loose: S.tone.warn,  // #F2A93B
  tight: S.tone.err,   // #E07A5F
};
function Tag({ verdict, children }) {
  const color = VERDICT_COLOR[verdict] ?? S.text.dim;
  return (
    <span style={{
      fontSize: S.type.label, fontFamily: "system-ui, sans-serif",
      letterSpacing: 1, color,
    }}>
      {children}
    </span>
  );
}

/* ================= COMPACT SELECT (the standard compact-selector) ================= */
//
// One reusable single-select disclosure used by every content/setup menu in the
// app (KEY drill category, QSO Activity/Role/Conditions, COPY Conditions). It is
// the WAI-ARIA "select-only combobox" pattern: a <button role="combobox"> trigger
// opens a <div role="listbox"> of <div role="option"> rows; focus never leaves the
// trigger and the keyboard-active row is tracked with aria-activedescendant.
//
// Behavior is driven ENTIRELY by the shape of `options[]` — an option may carry a
// `description` (renders a gray sub-line in the panel) and/or a `ladderIndex` (a
// leading rung numeral). There are NO per-section variant flags; one data shape,
// one component, one role structure across all five uses.
//
// LOAD-BEARING RULE: onChange fires ONLY on commit (Enter / Space / click / Tab) —
// never on arrow/Home/End/typeahead navigation, which move the highlight only.
// Callers hang real side effects on onChange (pickCat runs keyer.clear() + a live
// announcement; QSO's Activity change resets Role); firing those on every arrow
// keypress would be destructive. Navigation must stay side-effect-free.
//
// The open panel is an absolutely-positioned OVERLAY: it never reflows the
// controls beneath it, so opening a menu can't push the key surface or START out
// of view (the whole point of the compaction).
//
// Exported (named) so it can be unit-tested in isolation with a controlled
// harness; the app's default export (CWTrainer) is unaffected.
// pulseKey (optional): a counter the parent bumps to flash a brief amber glow on
// the trigger — used by the QSO Role menu when an Activity change resets the Role
// (so the silent trigger-text update is perceptible). Undefined/0 = never pulses,
// so every other use of CompactSelect is unaffected.
export function CompactSelect({ label, options, value, onChange, disabled = false, pulseKey }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [flipUp, setFlipUp] = useState(false);
  const triggerRef = useRef(null);
  const listboxRef = useRef(null);
  // Typeahead accumulator: buffer of typed chars + the idle-reset timer id.
  const typeahead = useRef({ buffer: "", timer: null });

  const baseId = useId();
  const labelId = `${baseId}-label`;
  const listboxId = `${baseId}-listbox`;
  const optionId = (i) => `${baseId}-opt-${i}`;

  // The index of the currently-committed value (what the trigger reflects and
  // where the highlight starts when the menu opens). -1 → clamp to 0.
  const currentIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[currentIndex];
  // Trigger text: the selected label, prefixed with its rung numeral when present.
  // Defensive fallback: if `value` matches no option, show the raw value.
  const valueText = current
    ? (current.ladderIndex != null ? `${current.ladderIndex} — ${current.label}` : current.label)
    : String(value);

  // A printable character opens/typeaheads. Space is excluded — it is the
  // commit/open key, not a typeahead char.
  const isPrintable = (e) =>
    e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey;

  const openMenu = (toIndex = currentIndex) => {
    if (disabled) return;
    // Decide open direction from the live viewport: below by default, above if the
    // trigger is near the bottom and there is more room overhead. Guarded for jsdom
    // (getBoundingClientRect returns zeros → stays "below", the safe default).
    const rect = triggerRef.current?.getBoundingClientRect?.();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      setFlipUp(below < 240 && above > below);
    }
    setActiveIndex(toIndex);
    setOpen(true);
  };

  const closeMenu = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Commit the option at `index`: fire onChange with its value, close, and (unless
  // committing via Tab, which must let focus advance) return focus to the trigger.
  const commit = (index, { keepFocus = false } = {}) => {
    const opt = options[index];
    if (opt) onChange(opt.value);
    setOpen(false);
    if (!keepFocus) triggerRef.current?.focus();
  };

  // Typeahead: accumulate the typed buffer, move the highlight to the next option
  // whose label starts with it (search wraps from the active row), reset after
  // 500ms idle. Moves the highlight ONLY — never commits.
  const runTypeahead = (char) => {
    const t = typeahead.current;
    if (t.timer) clearTimeout(t.timer);
    t.buffer += char.toLowerCase();
    t.timer = setTimeout(() => { t.buffer = ""; }, 500);
    const buf = t.buffer;
    const n = options.length;
    for (let k = 1; k <= n; k++) {
      const idx = (activeIndex + k) % n;
      if (options[idx].label.toLowerCase().startsWith(buf)) {
        setActiveIndex(idx);
        return;
      }
    }
    // No forward match — try from the very start (covers matching the active row itself).
    const idx = options.findIndex((o) => o.label.toLowerCase().startsWith(buf));
    if (idx >= 0) setActiveIndex(idx);
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) || isPrintable(e)) {
        e.preventDefault();
        openMenu();
        if (isPrintable(e)) runTypeahead(e.key);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setActiveIndex((i) => Math.min(options.length - 1, i + 1)); break;
      case "ArrowUp":   e.preventDefault(); setActiveIndex((i) => Math.max(0, i - 1)); break;
      case "Home":      e.preventDefault(); setActiveIndex(0); break;
      case "End":       e.preventDefault(); setActiveIndex(options.length - 1); break;
      case "PageDown":  e.preventDefault(); setActiveIndex((i) => Math.min(options.length - 1, i + 5)); break;
      case "PageUp":    e.preventDefault(); setActiveIndex((i) => Math.max(0, i - 5)); break;
      case "Enter":
      case " ":         e.preventDefault(); commit(activeIndex); break;
      // Tab commits but must NOT preventDefault or re-focus the trigger — let the
      // browser move focus to the next control after the commit.
      case "Tab":       commit(activeIndex, { keepFocus: true }); break;
      case "Escape":    e.preventDefault(); closeMenu(); break;
      default:
        if (isPrintable(e)) { e.preventDefault(); runTypeahead(e.key); }
    }
  };

  // Close on a click outside the component (no commit — value unchanged). Focus
  // then follows normal document behavior (spec §2.4), so no forced refocus here.
  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e) => {
      const root = triggerRef.current?.parentElement;
      if (root && !root.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [open]);

  // Keep the keyboard-active option scrolled into view. Guarded — jsdom does not
  // implement scrollIntoView; the app relies on it only for the 14-item KEY list.
  useEffect(() => {
    if (!open) return;
    const el = listboxRef.current?.querySelector(`#${CSS.escape(optionId(activeIndex))}`);
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  // Attention pulse: when pulseKey changes (and is truthy — 0/undefined never
  // pulses), replay the amber-glow keyframe on the trigger. The remove → force-
  // reflow → add sequence is the standard way to restart a CSS animation so a
  // repeat (e.g. two Activity changes in a row) glows each time. Reduced motion is
  // honored in the stylesheet (.wr-select-pulse animation: none), so this stays a
  // no-op highlight for users who opt out of motion.
  useEffect(() => {
    if (!pulseKey) return;
    const el = triggerRef.current;
    if (!el) return;
    el.classList.remove("wr-select-pulse");
    void el.offsetWidth; // force reflow so the animation can replay from the start
    el.classList.add("wr-select-pulse");
    const t = setTimeout(() => el.classList.remove("wr-select-pulse"), 1000);
    return () => clearTimeout(t);
  }, [pulseKey]);

  return (
    <div style={{ position: "relative", marginBottom: 14 }}>
      <div id={labelId} style={{ ...S.label, marginBottom: 8 }}>{label}</div>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className="wr-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={labelId}
        aria-activedescendant={open && options[activeIndex] ? optionId(activeIndex) : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        style={{
          ...S.btn,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          // minWidth:0 so this button can shrink as a flex item and let its value
          // span ellipsize (rather than setting a width floor that overflows a
          // narrow row); pairs with the value span's own minWidth:0 below.
          width: "100%", minWidth: 0, minHeight: 44, padding: "10px 14px", textAlign: "left", boxSizing: "border-box",
        }}
      >
        <span style={{
          color: S.text.amber, fontWeight: 600, fontSize: "0.8125rem",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          // minWidth:0 lets this flex child shrink below its content's intrinsic
          // width so a long category label (e.g. "14 — Numbers (incl. cut)")
          // ellipsizes instead of setting a width floor that overflows the row
          // at 360px. flexShrink:1 is the flex default, stated for clarity.
          minWidth: 0, flexShrink: 1,
        }}>{valueText}</span>
        <span aria-hidden="true" style={{ color: S.text.dim, flexShrink: 0 }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div
          ref={listboxRef}
          role="listbox"
          id={listboxId}
          aria-labelledby={labelId}
          tabIndex={-1}
          className="wr-select-panel"
          style={{
            position: "absolute", left: 0, right: 0,
            ...(flipUp ? { bottom: "100%", marginBottom: 4 } : { top: "100%", marginTop: 4 }),
            zIndex: 30,
            background: S.ground.panel, border: S.border.control, borderRadius: S.radius.sm,
            boxShadow: "0 10px 30px rgba(0,0,0,0.55)",
            maxHeight: "min(60vh, 360px)", overflowY: "auto",
          }}
        >
          {options.length === 0 && (
            <div role="option" aria-disabled="true" style={S.srOnly}>No options</div>
          )}
          {options.map((opt, i) => {
            const selected = opt.value === value;
            const active = i === activeIndex;
            return (
              <div
                key={opt.value}
                id={optionId(i)}
                role="option"
                aria-selected={selected}
                className="wr-select-option"
                onClick={() => commit(i)}
                onMouseEnter={() => setActiveIndex(i)}
                style={{
                  display: "flex",
                  alignItems: opt.description ? "flex-start" : "center",
                  gap: 8, minHeight: 40, padding: "10px 12px", cursor: "pointer",
                  // Keyboard-active cue: gray wash + a 3px amber left-bar (a lightness
                  // + shape signal that survives grayscale). Inactive rows keep a
                  // transparent bar so the pointer :hover CSS can still tint them.
                  borderLeft: active ? "3px solid #F2A93B" : "3px solid transparent",
                  ...(active ? { background: "#2A313A" } : {}),
                }}
              >
                {opt.ladderIndex != null && (
                  <span aria-hidden="true" style={{
                    fontFamily: "ui-monospace, monospace", fontSize: S.type.micro,
                    color: S.text.dim, minWidth: 16, flexShrink: 0, lineHeight: 1.4,
                  }}>{opt.ladderIndex}</span>
                )}
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                  <span style={{
                    fontFamily: "ui-monospace, monospace", fontSize: "0.8125rem",
                    // Selected cue: amber + weight 700 (a color + WEIGHT signal, paired
                    // with the ✓ below — both non-color-only, per the standing L2 rule).
                    color: selected ? S.text.amber : S.text.body, fontWeight: selected ? 700 : 400,
                  }}>{opt.label}</span>
                  {opt.description && (
                    <div style={{
                      fontSize: "0.75rem", color: S.text.dim, fontFamily: "system-ui, sans-serif",
                      marginTop: 3, letterSpacing: 0, lineHeight: 1.4,
                    }}>{opt.description}</div>
                  )}
                </div>
                {selected && (
                  <span aria-hidden="true" style={{ color: S.text.amber, flexShrink: 0, fontWeight: 700 }}>✓</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================= COPY TRAINER ================= */
// Graduated copy ladder — each rung is a real step up in difficulty, simplest first.
const COPY_LEVELS = [
  ["single",    "1 character",      "One character at a time. The first rung — just match the sound to the letter."],
  ["pairs",     "2-char groups",    "Two characters together. Start hearing letters in sequence, not isolation."],
  ["groups",    "Letter groups",    "Short random groups of 3-4. No meaning to lean on — pure character recognition."],
  ["words",     "Common words",     "The 500 most common English words — familiar words that arrive as whole sounds."],
  ["wordswide", "Wider vocabulary", "Less common English words (ranks 1001–5000) — a harder vocabulary rung."],
  ["hamwords",  "Ham words",        "Real on-air vocabulary — TNX, FER, RST, QTH. Words start to arrive as whole sounds."],
  ["calls",     "Callsigns",        "The hardest everyday copy: random letters and numbers, no rhythm to predict."],
  ["phrases",   "QSO phrases",      "Full exchange fragments, the way they come over the air."],
];

// CopyTrainer — Phase 2 of the responsive-layout refactor.
//   isWide  — from the shell's useIsWide(); determines which layout to use.
//   railEl  — the DOM element of the <aside class="wr-rail">; null until the
//             callback ref fires (one frame after first wide render), then a
//             real DOM node. The portal is skipped when railEl is null.
//   record  — from useProgress(); called after each CHECK to persist the score.
function CopyTrainer({ player, settings, isWide, railEl, suppressRail, record }) {
  const [source, setSource] = useState("single");
  const [target, setTarget] = useState("");
  const [attempt, setAttempt] = useState("");
  const [result, setResult] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [difficulty, setDifficulty] = useState("normal");
  const [liveText, setLiveText] = useState("");
  const [noise, setNoise] = useState(18);
  const [session, setSession] = useState([]); // scores this sitting
  // scoreLive: text for the always-mounted sr-only live region. Starts empty;
  // set in check() so the screen reader sees a *change* and announces it.
  // (The live region is already in the DOM before check() fires — that's the fix.)
  const [scoreLive, setScoreLive] = useState("");
  const noiseGain = (v) => (v / 100) * 0.5;
  const { countdown, start: startCountdown } = useCountdown();
  // Auto-focus the copy input when a new target arrives so the user can type
  // immediately without clicking. Guard against null (input not yet in the DOM
  // on the first render before the target exists).
  const copyInputRef = useRef(null);
  useEffect(() => {
    if (target && copyInputRef.current) {
      copyInputRef.current.focus();
    }
  }, [target]);

  // Band noise runs while real-life conditions are selected on this tab
  useEffect(() => {
    if (difficulty === "real") player.startNoise(noiseGain(noise), settings.freq, settings.rxFilter);
    else player.stopNoise();
    return () => player.stopNoise();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, settings.freq, settings.rxFilter]);

  const newTarget = () => {
    // Early rungs draw from the most common letters first (Koch-ordered) so a
    // learner fresh out of the LEARN tab meets familiar characters, not Q's and Z's.
    const easyPool = KOCH.slice(0, 14).filter((c) => /[A-Z0-9]/.test(c));
    const alnum = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    let t = "";
    if (source === "single") {
      t = pick(easyPool);
    } else if (source === "pairs") {
      t = pick(easyPool) + pick(easyPool);
    } else if (source === "groups") {
      t = Array.from({ length: 3 }, () =>
        Array.from({ length: 3 + Math.floor(Math.random() * 2) }, () => pick(alnum)).join("")
      ).join(" ");
    } else if (source === "words") {
      // Route through the tested generator (same pool as KEY; count=4 for COPY).
      t = drillCommonWords(4);
    } else if (source === "wordswide") {
      t = drillWiderWords(4);
    } else if (source === "hamwords") {
      // COMMON_WORDS is already uppercase; no .toUpperCase() needed.
      t = Array.from({ length: 4 }, () => rand(COMMON_WORDS)).join(" ");
    } else if (source === "calls") {
      t = Array.from({ length: 3 }, () => randCall()).join(" ");
    } else {
      t = subTokens(rand(QSO_PHRASES), settings);
    }
    setTarget(t);
    setAttempt("");
    setResult(null);
    setRevealed(false);
    setLiveText("");
    return t;
  };

  const playTarget = (t, { eff } = {}) => {
    const text = t || target;
    setLiveText("");
    player.play(text, {
      charWpm: settings.charWpm,
      effWpm: eff ?? settings.effWpm,
      freq: settings.freq,
      qsb: difficulty === "real",
      onChar: difficulty === "easy" ? (idx) => setLiveText(text.slice(0, idx + 1)) : undefined,
    });
  };

  const check = () => {
    // Fidelity grade with cut-number tolerance (§7): copying 5NN for 599 (or T
    // for 0) is not penalised; NAME/TU/TNX letters are left intact.
    const pct = Math.round(similarityCw(target, attempt) * 100);
    const msg = pct >= 90 ? "SOLID COPY" : pct >= 70 ? "GOOD — AGN FOR PRACTICE" : "PSE AGN";
    setResult(pct);
    setRevealed(true);
    setSession((s) => [...s, pct]);
    // Persist to cross-session progress history (v2.0 §1).
    // record() is a no-op when undefined (narrow/no-prop caller).
    // Guard: an empty answer box yields a meaningless 0% — skip it so junk
    // records don't pollute the trend.  Mirrors the QSO copy-input guard
    // (disabled={!copyAttempt.trim()}) and the KEY fist.elements > 0 guard.
    if (record && attempt.trim()) {
      record("copy", { t: Date.now(), source, pct });
    }
    // Update the always-mounted sr-only region. Because the region is already in the
    // DOM (empty), the AT sees a text change and announces it — the fix for the
    // mount-with-content bug described in design §0.
    setScoreLive(`${pct}% — ${msg}`);
  };

  const avg = session.length ? Math.round(session.reduce((a, b) => a + b, 0) / session.length) : null;

  // introJSX — orientation paragraph shown before the first target is set.
  // Goes in main in both modes (per design §5: the intro wants the wide column,
  // and it's transient — once a target is set it disappears).
  const introJSX = !target && (
    <>
      <div style={{ ...S.label, marginBottom: 10 }}>Copy practice</div>
      <p style={{ color: "#C9CDD3", fontSize: "0.875rem", lineHeight: 1.6, fontFamily: "system-ui, sans-serif", margin: 0 }}>
        This is where the receiving ear gets built. Start at the top of the ladder — a single character — and climb as each rung gets comfortable: pairs, short groups, real words, callsigns, full phrases. Characters always play at full speed; the Farnsworth spacing gives you thinking room between them. Most ops can send faster than they can copy. This tab closes that gap.
      </p>
      <div style={{ background: S.ground.panel, border: "1px solid #2E343C", borderRadius: 8, padding: "10px 12px", marginTop: 12 }}>
        <div style={{ ...S.label, color: "#F2A93B", marginBottom: 4 }}>How to practice</div>
        <p style={{ color: "#C9CDD3", fontSize: "0.8125rem", lineHeight: 1.6, fontFamily: "system-ui, sans-serif", margin: 0 }}>
          The goal is instant character recognition — hearing each letter as a single sound and knowing it on the spot, without counting dits and dahs or pausing to decode. To build that reflex, keep a pencil and paper handy: listen to the full transmission, write each character by hand the instant you recognize it, then type your answer once playback ends. Writing as you hear trains the immediate sound-to-letter response that fluent copy depends on, and it keeps you from splitting your focus between listening and typing. It's also how copy is done on the air.
        </p>
      </div>
    </>
  );

  // optionsJSX — level ladder + Conditions selector + noise slider.
  // On wide these portal into the shell's <aside class="wr-rail">.
  // On narrow they render inline in the single column (today's layout).
  // All handlers close over local state — no prop threading needed.
  const optionsJSX = (
    <>
      <div style={{ ...S.label, marginBottom: 8 }}>What to copy — climb as you improve</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {COPY_LEVELS.map(([v, l, desc], i) => (
          <button key={v} aria-pressed={source === v} onClick={() => setSource(v)}
            style={{ ...S.btn, textAlign: "left", padding: "9px 12px", ...(source === v ? { borderColor: "#F2A93B" } : {}) }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.625rem", color: "#8A929C" }}>{i + 1}</span>
              <span style={{ color: source === v ? "#F2A93B" : "#E8E2D6", fontWeight: 700, fontSize: "0.8125rem" }}>{l}</span>
            </div>
            {source === v && (
              <div style={{ fontSize: "0.71875rem", color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 4, letterSpacing: 0, lineHeight: 1.5 }}>{desc}</div>
            )}
          </button>
        ))}
      </div>
      {/* Conditions selector — label-only (COPY has no per-option descriptions, per
          DoR T2). This is a CONSISTENCY change, not a compaction one: a closed
          trigger is about the same height as (or a hair taller than) the old
          3-button row, but it renders as the identical standard component as QSO
          Conditions and buys a compliant ≥44px touch target the old row missed.
          The existing conditional helpers below the trigger are unchanged (T4):
          the EASY helper line iff easy; the noise slider + note iff real. */}
      <CompactSelect
        label="Conditions"
        options={[
          { value: "easy",   label: "EASY" },
          { value: "normal", label: "NORMAL" },
          { value: "real",   label: "REAL LIFE" },
        ]}
        value={difficulty}
        onChange={setDifficulty}
      />
      {difficulty === "easy" && (
        <div style={{ fontSize: "0.75rem", color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 8 }}>
          Text appears letter by letter as it plays — hear it and see it together.
        </div>
      )}
      {difficulty === "real" && (
        <div style={{ marginTop: 12 }}>
          <Slider label="Band noise" value={noise} min={0} max={100} step={1} suffix="%"
            onChange={(v) => { setNoise(v); player.setNoiseLevel(noiseGain(v)); }} />
          <div style={{ fontSize: "0.75rem", color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: -6 }}>
            Noise plus QSB fading on every playback — copy through real band conditions.
          </div>
        </div>
      )}
    </>
  );

  // practiceJSX — the copy surface: playback controls, answer input, CHECK,
  // CharDiff result, session average. Always in main in both modes.
  const practiceJSX = (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button style={S.btnAmber} onClick={() => startCountdown(() => { const t = newTarget(); playTarget(t); })}>▶ NEW</button>
        <button style={S.btn} onClick={() => playTarget()} disabled={!target}>↻ REPLAY</button>
        <button style={S.btn} onClick={() => playTarget(null, { eff: Math.max(4, settings.effWpm - 3) })} disabled={!target}>🐢 SLOWER</button>
        <button style={S.btn} onClick={() => player.stop()}>■ STOP</button>
        <button style={S.btn} onClick={() => setRevealed(true)} disabled={!target}>👁 REVEAL</button>
      </div>

      {/* Countdown: shown in the Display area (same spot as live text) while
          the 5-second pre-play beat runs. Suppresses the live-text display so
          the number always occupies the same visual space. */}
      {countdown !== null && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ ...S.label, marginBottom: 6 }}>Get ready</div>
          <Display>
            <span style={{ fontSize: "2.5rem", fontWeight: 700 }}>{countdown}</span>
          </Display>
        </div>
      )}

      {difficulty === "easy" && target && countdown === null && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ ...S.label, marginBottom: 6 }}>Sending</div>
          <Display cursor={player.playing}>{liveText}</Display>
        </div>
      )}

      <div style={{ ...S.label, marginBottom: 6 }}>Your copy — type what you hear</div>
      <input
        ref={copyInputRef}
        aria-label="Your copy"
        style={S.input}
        value={attempt}
        onChange={(e) => setAttempt(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") check(); }}
        placeholder="..."
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
      />
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 10 }}>
        <button style={S.btnAmber} onClick={check} disabled={!target}>CHECK</button>
        {avg !== null && (
          <span style={{ ...S.label, fontSize: "0.625rem" }}>
            session: <span style={{ color: avg >= 90 ? "#8FCB9B" : "#F2A93B", fontFamily: "ui-monospace, monospace", fontSize: "0.8125rem" }}>{avg}%</span> over {session.length}
          </span>
        )}
      </div>

      {revealed && target && (
        <div style={{ marginTop: 16 }}>
          <div style={{ ...S.label, marginBottom: 6 }}>Sent</div>
          {result !== null ? <CharDiff target={target} attempt={attempt} /> : <Display>{target}</Display>}
          {result !== null && <Score pct={result} />}
        </div>
      )}
    </>
  );

  // ---- layout rendering ----
  //
  // Wide: intro (if before first target) in its own main-column panel; optionsJSX
  //   portals into the shell's <aside class="wr-rail">; practiceJSX stays in main.
  //   railEl may be null on the very first paint (before the callback ref fires) —
  //   in that case the portal is skipped for one imperceptible frame (same behavior
  //   as the QSO Phase 1 reference implementation).
  //
  // Narrow: all three sections render inline in a single column — exactly today's
  //   appearance (intro panel if !target, setup panel, practice panel).
  //
  // The always-mounted scoreLive region is in the component root (never gated by
  // isWide) so AT can see text changes regardless of layout width.
  return (
    <div>
      {/* Always-mounted sr-only live region for score announcements (design §0 / C1).
          Empty when idle; text set by check(). Being pre-mounted means the AT sees
          the text change and speaks it — the mount-with-content pattern never fires.
          Not gated by isWide — render in both layouts. */}
      <div role="status" aria-live="polite" aria-atomic="true" style={S.srOnly}>{scoreLive}</div>

      {/* Wide layout: intro in its own main-column panel; options portaled to rail. */}
      {isWide && !target && <div style={S.panel}>{introJSX}</div>}
      {isWide && railEl && !suppressRail && createPortal(<div style={S.panel}>{optionsJSX}</div>, railEl)}
      {isWide && <div style={S.panel}>{practiceJSX}</div>}

      {/* Narrow layout: three inline panels — today's single-column appearance. */}
      {!isWide && !target && <div style={S.panel}>{introJSX}</div>}
      {!isWide && <div style={S.panel}>{optionsJSX}</div>}
      {!isWide && <div style={S.panel}>{practiceJSX}</div>}
    </div>
  );
}

/* ================= KEY TRAINER ================= */
// Phase 3 of the responsive-layout refactor.
//   isWide  — from the shell's useIsWide(); determines which layout to use.
//   railEl  — the DOM element of the <aside class="wr-rail">; null until the
//             callback ref fires (one frame after first wide render), then a
//             real DOM node. The portal is skipped when railEl is null.
//
// KeyInput split: KeyModeControls (toggle + swap) goes to the rail on wide;
// the key surface (PaddleKey / TouchKey) stays inline in the keying panel in main.
// Both still drive the same keyer instance — no state moves. The toggle in the
// rail changes settings.keyType, which this component re-renders from, so the
// key surface in main always reflects the current type.
// record — from useProgress(); called after each CHECK to persist fist data.
function KeyTrainer({ player, settings, setSettings, isWide, railEl, suppressRail, record }) {
  // category: which drill generator is active (index into DRILL_CATEGORIES)
  const [catIdx, setCatIdx] = useState(0);
  const [target, setTarget] = useState("");
  const [result, setResult] = useState(null);
  // analysis: the fist-timing result from analyzeFist, shown after CHECK
  const [analysis, setAnalysis] = useState(null);
  const [errFlash, setErrFlash] = useState(false);
  // E5: intro panel collapsed state — persisted via store so returning users skip it.
  // Default: expanded (false) on first run; once dismissed, stays collapsed.
  const [introCollapsed, setIntroCollapsed] = useState(
    () => store.load("introKeyCollapsed", false)
  );
  // Live-region text for score + fist summary (C1, design §0). Empty when idle;
  // set in check() so the AT sees a change and speaks it.
  const [scoreLive, setScoreLive] = useState("");
  // Live-region text for the category stepper position (C2). Set whenever catIdx
  // changes so the screen-reader user knows where they are in the ladder.
  const [catLive, setCatLive] = useState("");
  const errTimer = useRef(null);
  // Two refs govern the auto-grade / record-write flow for this attempt:
  //
  //   autoGradeFired: true = the auto-grade effect has already called check() once.
  //     Disarmed (→false) when decoded < target, which covers the HH path (HH wipes
  //     decoded to "", effect sees length 0 < target, clears the flag so the clean
  //     re-send can grade). Also reset in newTarget/pickCat/CLEAR.
  //
  //   recordWritten: true = check() has already written a progress record for this
  //     attempt. Prevents a re-CHECK from adding a second record. Reset ONLY in
  //     newTarget/pickCat/CLEAR — never disarmed by the decoded-length comparison
  //     (disarming on short-decoded would let re-CHECKs write again after a partial
  //     send that already recorded).
  const autoGradeFired = useRef(false);
  const recordWritten = useRef(false);

  const flashErr = () => {
    setResult(null);
    setAnalysis(null);
    setErrFlash(true);
    clearTimeout(errTimer.current);
    errTimer.current = setTimeout(() => setErrFlash(false), 1800);
  };
  useEffect(() => () => clearTimeout(errTimer.current), []);
  const keyer = useKeyer({
    keyWpm: settings.keyWpm,
    freq: settings.freq,
    player,
    enabled: true,
    mode: settings.keyType,
    swap: settings.paddleSwap,
    onError: flashErr,
    // Mode B: gate on keyType==="paddle" here so straight/bug never see it
    // even if the flag is somehow set — defense in depth.
    modeB: settings.keyType === "paddle" && settings.iambicModeB,
  });

  // Clear any in-flight keyer loop / held-lever state when the operator switches
  // key type (paddle ↔ straight ↔ bug).  Without this, a paddle or bug loop
  // started on one type continues running after the switch — ditHeld/dahHeld stay
  // true, loopTimer keeps firing, and the sidetone can ring indefinitely.  The
  // window-listener effect's cleanup already does this on a full re-mount, but
  // settings.keyType changes do NOT re-mount the component — they only update
  // modeRef.current — so the cleanup never fires.  This effect closes the gap.
  useEffect(() => {
    keyer.clear();
  }, [settings.keyType]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: keyer.clear is stable (useCallback with [player] dep) but we only want
  // to fire on keyType changes, not on every render — listing only keyType here
  // is intentional and correct.

  // normLen: normalise then measure — matches similarity()'s own normalisation so
  // a trailing decoder space doesn't falsely overshoot the length comparison.
  const normLen = (s) => s.trim().toUpperCase().replace(/\s+/g, " ").length;

  // Auto-grade effect: fires check() the first time decoded reaches the target's
  // normalised length. Uses >= so an overshoot still grades at the first crossing.
  //
  // Uses autoGradeFired ref (not recordWritten) so the HH disarm works correctly:
  //   decoded < target → autoGradeFired = false (disarm — HH wipes decoded to "",
  //                      so the clean re-send can trigger auto-grade again)
  //   decoded >= target AND !autoGradeFired AND target non-empty → call check()
  //
  // recordWritten (gated in check()) is NOT disarmed here — only by explicit user
  // actions — so a re-CHECK after a short send that already recorded cannot write
  // a second record even when decoded remains below target length.
  useEffect(() => {
    if (!target) return;
    if (normLen(keyer.decoded) < normLen(target)) {
      autoGradeFired.current = false;
      return;
    }
    if (!autoGradeFired.current) {
      autoGradeFired.current = true;
      check();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyer.decoded]);
  // Deps: keyer.decoded is the only trigger. `target` and `check` are read inside
  // the callback through closure; listing them would re-run on target change before
  // the guard reset in newTarget() fires, risking a false grade on stale data.

  const newTarget = () => {
    const cat = DRILL_CATEGORIES[catIdx];
    const t = cat.gen(settings);
    autoGradeFired.current = false; // new target = new attempt; reset both guards
    recordWritten.current = false;
    setTarget(t);
    setResult(null);
    setAnalysis(null);
    keyer.clear();
  };

  const check = () => {
    // Fidelity grade with cut-number tolerance (§7): keying 5NN for 599 counts;
    // letters in a drill target (NAME/TU/TNX) are not cut-mangled.
    const pct = Math.round(similarityCw(target, keyer.decoded) * 100);
    setResult(pct);
    // Analyze fist timing from the events accumulated since the last clear.
    // Read from the ref directly — no re-render needed to compute this.
    const fist = analyzeFist(keyer.eventsRef.current, settings.keyWpm, settings.keyType);
    setAnalysis(fist);

    // Persist to cross-session progress history (v2.0 §1).
    // §6 guard: recordWritten ensures record() fires at most once per attempt.
    // The guard is set here after the write and reset only by newTarget/pickCat/CLEAR,
    // never by the auto-grade effect's decoded-length check (which would let a
    // re-CHECK write again after a short send that already recorded).
    // Also requires fist.elements > 0 to skip empty CHECKs (no elements keyed).
    if (record && fist.elements > 0 && !recordWritten.current) {
      const cat = DRILL_CATEGORIES[catIdx];
      record("key", {
        t:               Date.now(),
        category:        cat.id,
        keyType:         settings.keyType,
        copyPct:         pct,
        estWpm:          fist.estWpm,
        wpmVerdict:      fist.wpmVerdict,
        elementVerdict:  fist.spacing.element.verdict,
        letterVerdict:   fist.spacing.character.verdict,
        wordVerdict:     fist.spacing.word.verdict,
        weightingVerdict: fist.weighting.verdict,
        weightingRatio:   fist.weighting.ratio,
      });
      recordWritten.current = true; // mark: record written for this attempt
    }

    // Build the sr-only announcement: score + fist summary in plain English.
    // The always-mounted region is already in the DOM (empty), so setting its text
    // here is a change the AT will announce (design §0 / C1 fix).
    const scoreMsg = pct >= 90 ? "SOLID COPY" : pct >= 70 ? "GOOD — AGN FOR PRACTICE" : "PSE AGN";
    let liveMsg = `${pct}% — ${scoreMsg}.`;
    if (fist && fist.elements > 0) {
      liveMsg += ` Estimated ${fist.estWpm} wpm`;
      if (!fist.lowSample) {
        liveMsg += `, ${fist.wpmVerdict}`;
      }
      // Add any plain-English notes the analyzer produced
      if (fist.notes.length > 0) {
        liveMsg += ". " + fist.notes.join(". ");
      }
      liveMsg += ".";
    }
    setScoreLive(liveMsg);
  };

  // Verdict color: good=green, loose=caution-amber, tight=red
  // verdictLabel: human-readable uppercase chip text for the KEY fist panel
  const verdictLabel = (v) => v === "good" ? "GOOD" : v === "loose" ? "LOOSE" : "TIGHT";

  // pickCat: centralises the "change category" side-effects so the stepper and
  // direct-pick buttons stay in sync. Shared by both optionsJSX and the inline
  // narrow panel — extracted here (not inside the JSX) to avoid recreating it.
  const pickCat = (newIdx) => {
    setCatIdx(newIdx);
    autoGradeFired.current = false; // new category = new attempt; reset both guards
    recordWritten.current = false;
    setTarget(""); setResult(null); setAnalysis(null); keyer.clear();
    // Announce to screen readers (C2). The catLive region is always
    // mounted — setting its text here is a change the AT will speak.
    setCatLive(`Category ${newIdx + 1} of ${DRILL_CATEGORIES.length} — ${DRILL_CATEGORIES[newIdx].label}`);
  };

  // categoryRow — the fused stepper + dropdown: [◀] [ CompactSelect ▾ ] [▶].
  // Extracted from optionsJSX so the narrow KEY layout can render it as its own
  // compact block (the key-type/mode controls relocate to an instrument strip with
  // the key on narrow). The arrows are the kept one-tap prev/next (F2); the centre
  // trigger is the direct-pick dropdown (F1) that replaced the old 14-button wrap.
  // All three drive the same pickCat, so keyer.clear() + catLive fire once per
  // change regardless of which control fired it. alignItems flex-end bottom-aligns
  // the arrows with the trigger (CompactSelect renders its own label above it).
  const categoryRow = (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
      <button
        aria-label="Previous category"
        style={{ ...S.btn, padding: "10px 14px", minHeight: 44, marginBottom: 14 }}
        disabled={catIdx === 0}
        onClick={() => pickCat(Math.max(0, catIdx - 1))}
      >◀</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <CompactSelect
          label="Drill category — climb as you improve"
          options={DRILL_CATEGORIES.map((cat, i) => ({ value: cat.id, label: cat.label, ladderIndex: i + 1 }))}
          value={DRILL_CATEGORIES[catIdx].id}
          onChange={(id) => pickCat(DRILL_CATEGORIES.findIndex((c) => c.id === id))}
        />
      </div>
      <button
        aria-label="Next category"
        style={{ ...S.btn, padding: "10px 14px", minHeight: 44, marginBottom: 14 }}
        disabled={catIdx === DRILL_CATEGORIES.length - 1}
        onClick={() => pickCat(Math.min(DRILL_CATEGORIES.length - 1, catIdx + 1))}
      >▶</button>
    </div>
  );

  // optionsJSX — WIDE ONLY now: category row + key-type controls + SwapToggle,
  // clustered together and portaled into the rail. Output is byte-identical to
  // before the categoryRow extraction. (On narrow, categoryRow + the controls are
  // recomposed by narrowKeyLayout below — see the return block.)
  const optionsJSX = (
    <>
      {categoryRow}
      {/* Key-type toggle (PADDLE / STRAIGHT KEY / BUG) + swap toggle clustered together.
          SwapToggle follows immediately below so it travels with the type selector.
          Mode B toggle appears below the type row when paddle is active. */}
      <KeyModeControls
        keyType={settings.keyType}
        onKeyType={(v) => setSettings((s) => ({ ...s, keyType: v }))}
        modeB={settings.iambicModeB}
        onModeB={(v) => setSettings((s) => ({ ...s, iambicModeB: v }))}
      />
      <SwapToggle
        swap={settings.paddleSwap}
        onSwap={(v) => setSettings((s) => ({ ...s, paddleSwap: v }))}
        keyType={settings.keyType}
      />
    </>
  );

  // introJSX — sending-practice orientation, shown before the first target.
  // Always goes in main (wants the wider column; teaching content). Same in both modes.
  const introJSX = !target && (
    <div style={S.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: introCollapsed ? 0 : 10 }}>
        <div style={S.label}>Sending practice</div>
        <button
          aria-label={introCollapsed ? "Show intro" : "Hide intro"}
          style={{ ...S.btn, fontSize: "0.6875rem", padding: "4px 10px", color: "#8A929C" }}
          onClick={() => {
            const next = !introCollapsed;
            setIntroCollapsed(next);
            store.save("introKeyCollapsed", next);
          }}
        >{introCollapsed ? "▸ show intro" : "▾ hide intro"}</button>
      </div>
      {!introCollapsed && (
        <>
          <p style={{ color: "#C9CDD3", fontSize: "0.875rem", lineHeight: 1.6, fontFamily: "system-ui, sans-serif", margin: 0 }}>
            Now the other half: the fist. The trainer shows you text, you send it with the paddle or straight key, and the decoder shows exactly what your keying actually says — not what you meant. Watch your spacing especially: clean gaps between letters and words are what make a fist readable on the air.
          </p>
          <div style={{ background: S.ground.panel, border: "1px solid #2E343C", borderRadius: 8, padding: "10px 12px", marginTop: 12 }}>
            <div style={{ ...S.label, color: "#F2A93B", marginBottom: 4 }}>Use the screen, a keyboard, or your own key</div>
            <p style={{ color: "#C9CDD3", fontSize: "0.8125rem", lineHeight: 1.6, fontFamily: "system-ui, sans-serif", margin: 0 }}>
              Tap the on-screen key, or use the keyboard: <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>SPACE</span> for a straight key, <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>Z</span> and <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>X</span> (or the arrow keys, or the <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>[</span> / <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>]</span> brackets) for paddle dit and dah. <strong style={{ color: "#E8E2D6" }}>BUG mode</strong> simulates a semiautomatic key — the <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>[</span> bracket (or Z / ←) holds the dit lever for a stream of automatic dits; <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>SPACE</span> sends a hand-timed dah you control. A real key or paddle works too through a USB or Bluetooth adapter that emulates those keystrokes — straight keys on Space, paddles on Z / X, the arrow keys, or the <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>[</span> / <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>]</span> brackets that VBand-style USB paddle adapters send — on a computer or Android device. Use the ⇄ swap toggle (near the key-type selector) if your lever comes out on the wrong side. Made a mistake? Send eight dits in a row — the HH error signal — to wipe it and start over, just like on the air.
            </p>
          </div>
        </>
      )}
    </div>
  );

  // ---- Shared practice pieces (identical in the wide + narrow layouts) ----
  // Extracted so the wide two-panel layout and the narrow single merged card
  // render the SAME leaf controls with no duplication. Only the surrounding panel
  // structure and the Display compactness differ between the two layouts. All are
  // defined before practicePanels/narrowKeyLayout so those can reference them.

  // Action row — NEW TEXT / HEAR IT / CLEAR. One descriptor list drives both
  // layouts so the (identical) handlers live once. Wide wraps in the roomy main
  // column; narrow packs the three onto ONE ≥40px row (flex:1) so they don't wrap
  // to a second row and push the key down (they wrapped at 390px otherwise).
  const actionBtns = [
    { key: "new", style: S.btnAmber, onClick: newTarget, label: "▶ NEW TEXT" },
    { key: "hear", style: S.btn, label: "♪ HEAR IT",
      onClick: () => target && player.play(target, { charWpm: settings.charWpm, effWpm: settings.effWpm, freq: settings.freq }) },
    { key: "clear", style: S.btn, label: "✕ CLEAR",
      onClick: () => { autoGradeFired.current = false; recordWritten.current = false; keyer.clear(); setResult(null); setAnalysis(null); } },
  ];
  const actionButtons = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      {actionBtns.map((b) => <button key={b.key} style={b.style} onClick={b.onClick}>{b.label}</button>)}
    </div>
  );
  const narrowActionButtons = (
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      {actionBtns.map((b) => (
        <button key={b.key} onClick={b.onClick}
          style={{ ...b.style, flex: 1, minHeight: 40, padding: "0 6px", fontSize: "0.8125rem" }}>
          {b.label}
        </button>
      ))}
    </div>
  );

  // HH error-signal notice (visual-only) — sits directly above the key surface.
  const errFlashEl = errFlash && (
    <div style={{ fontFamily: "ui-monospace, monospace", color: "#F2A93B", fontSize: "0.8125rem", letterSpacing: 1, marginTop: 8 }}>
      ◉ HH — ERROR SIGNAL, CLEARED
    </div>
  );

  // Key surface for the active key type. data-testid is a stable, refactor-proof
  // hook for the headed geometry re-gate (design §2.3); it is a layout-neutral
  // attribute, so the wide DOM is unaffected. The key-type toggle lives elsewhere
  // (rail on wide, instrument strip on narrow) and writes settings.keyType — the
  // same value read here. One keyer, one state; only the render position moves.
  const keySurfaceEl = (
    <div style={{ marginTop: 4 }} data-testid="key-surface">
      {settings.keyType === "paddle"
        ? <PaddleKey paddleDown={keyer.paddleDown} paddleUp={keyer.paddleUp} swap={settings.paddleSwap} />
        : settings.keyType === "bug"
        ? <BugKey bugDitDown={keyer.bugDitDown} bugDitUp={keyer.bugDitUp}
            dahDown={keyer.straightDown} dahUp={() => keyer.straightUp({ forceEl: "-" })}
            swap={settings.paddleSwap} />
        : <TouchKey keyDown={keyer.straightDown} keyUp={keyer.straightUp} />}
    </div>
  );

  const checkEl = (
    <div style={{ marginTop: 12 }}>
      <button style={S.btnAmber} onClick={check} disabled={!target}>CHECK</button>
    </div>
  );

  // resultsEl — CharDiff + Score + Fist-feedback panel, shown after the first
  // CHECK. Shared by both layouts so the fist-feedback rendering lives in ONE
  // place. Body unchanged from the shipped inline block.
  const resultsEl = result !== null && (
    <div style={{ marginTop: 12 }}>
            <CharDiff target={target} attempt={keyer.decoded} />
            <Score pct={result} />

            {/* Fist feedback panel — only shown when there is meaningful data.
                Verdicts are estimates; "straight" mode only gets element spacing
                since the paddle machine-times those gaps. */}
            {analysis && analysis.elements > 0 && (
              <div
                aria-hidden="true"
                style={{ marginTop: 14, background: S.ground.panel, border: "1px solid #2E343C", borderRadius: 8, padding: "12px 14px" }}
              >
                {/* aria-hidden: announcement comes from the always-mounted scoreLive region
                    above. The scoreLive text includes the fist summary in plain English so
                    the screen-reader user gets the full verdict without reading visual ratios. */}
                {/* D2: gloss "fist" and explain the timing unit "u" at point of use */}
                <div style={{ ...S.label, color: "#8A929C", marginBottom: 2 }}>
                  Fist feedback
                </div>
                {/* H2: instructional text — floor to S.text.dim for AA contrast */}
                <div style={{ fontSize: "0.75rem", color: S.text.dim, fontFamily: "system-ui, sans-serif", marginBottom: 8, lineHeight: 1.5 }}>
                  Your <em>fist</em> — how your timing reads to another operator.
                  Spacing ratios are in units of <strong style={{ color: "#8A929C" }}>u</strong> (u = one dit length).
                </div>

                {/* Estimated WPM vs target (B2) */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span style={{ fontFamily: "system-ui, sans-serif", color: "#C9CDD3", fontSize: "0.8125rem" }}>
                    Estimated speed
                  </span>
                  <span style={{ fontFamily: "ui-monospace, monospace", color: "#F2A93B", fontSize: 16, letterSpacing: 1 }}>
                    ~{analysis.estWpm} wpm
                  </span>
                </div>
                {/* B2: WPM delta vs configured key speed — only shown when sample is large enough */}
                {analysis.lowSample ? (
                  <div style={{ fontSize: "0.75rem", color: S.text.dim, fontFamily: "system-ui, sans-serif", marginBottom: 8 }}>
                    Send a full line for a reliable estimate.
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <span style={{ fontFamily: "system-ui, sans-serif", color: "#8A929C", fontSize: "0.75rem" }}>
                      vs target ({settings.keyWpm} wpm)
                    </span>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.8125rem", fontWeight: 700,
                      color: analysis.wpmVerdict === "on target" ? S.tone.ok : S.tone.warn, letterSpacing: 1 }}>
                      {analysis.wpmVerdict === "on target"
                        ? "on target"
                        : `${analysis.wpmDelta > 0 ? "+" : ""}${analysis.wpmDelta} (${analysis.wpmVerdict})`}
                    </span>
                  </div>
                )}

                {/* Spacing verdicts — three rows.
                    Element spacing: straight key only (paddle and bug machine-time dits).
                    Letter/word gaps: all modes (operator controls inter-character timing). */}
                {[
                  // Element spacing: meaningful for straight key only; suppressed for paddle + bug
                  ...(settings.keyType === "straight"
                    ? [["Element gaps", "between elements (ideal 1u)", analysis.spacing.element]]
                    : []),
                  ["Letter gaps", "between letters (ideal 3u)", analysis.spacing.character],
                  ["Word gaps", "between words (ideal 7u)", analysis.spacing.word],
                ].map(([label, sub, sp]) => (
                  sp.ratio !== null && (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontFamily: "system-ui, sans-serif", color: "#8A929C", fontSize: "0.75rem" }}>
                        {label}
                        <span style={{ fontSize: "0.75rem", display: "block" }}>{sub}</span>
                      </span>
                      {/* M4: Tag carries the verdict word; ratio suffix keeps the numeric value alongside */}
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.8125rem", fontWeight: 700, letterSpacing: 1 }}>
                        <Tag verdict={sp.verdict}>{verdictLabel(sp.verdict)}</Tag>
                        {sp.ratio !== null && (
                          <span style={{ fontWeight: 400, fontSize: "0.75rem", color: "#8A929C", marginLeft: 6 }}>
                            {sp.ratio.toFixed(1)}u
                          </span>
                        )}
                      </span>
                    </div>
                  )
                ))}

                {/* B3: dah weighting — straight key and bug; suppressed for paddle.
                    Bug dahs are hand-timed (the point of bug practice), so weighting
                    feedback is shown. The header text adapts for bug mode. */}
                {(settings.keyType === "straight" || settings.keyType === "bug") && analysis.weighting.ratio !== null && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontFamily: "system-ui, sans-serif", color: "#8A929C", fontSize: "0.75rem" }}>
                      Dah length
                      <span style={{ fontSize: "0.75rem", display: "block" }}>dahs vs 3× dit (ideal 3u)</span>
                    </span>
                    {/* M4: Tag carries the verdict word; ratio suffix keeps the numeric value alongside */}
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.8125rem", fontWeight: 700, letterSpacing: 1 }}>
                      <Tag verdict={analysis.weighting.verdict}>{verdictLabel(analysis.weighting.verdict)}</Tag>
                      <span style={{ fontWeight: 400, fontSize: "0.75rem", color: "#8A929C", marginLeft: 6 }}>
                        {analysis.weighting.ratio.toFixed(1)}u
                      </span>
                    </span>
                  </div>
                )}

                {/* Notes from the analyzer — plain-English feedback strings */}
                {analysis.notes.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#8A929C", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
                    {analysis.notes.map((n, i) => <div key={i}>· {n}</div>)}
                  </div>
                )}

                {/* Footnote: machine-timed dit spacing. H2: instructional — floor to S.text.dim */}
                {(settings.keyType === "paddle" || settings.keyType === "bug") && (
                  <div style={{ fontSize: "0.75rem", color: S.text.dim, fontFamily: "system-ui, sans-serif", marginTop: 8 }}>
                    {settings.keyType === "bug"
                      ? "Dit spacing is machine-timed — spacing feedback covers letter and word gaps only. Your dah length is graded above."
                      : "Element spacing is machine-timed in paddle mode — spacing feedback covers letter and word gaps only."}
                  </div>
                )}
              </div>
            )}
          </div>
  );

  // practicePanels — WIDE two-panel layout (target panel + keying panel). Byte-
  // identical rendered output to the shipped version; only the leaf pieces are now
  // shared consts.
  const practicePanels = (
    <>
      {/* ---- Target text panel ---- */}
      <div style={S.panel}>
        {actionButtons}
        <div style={{ ...S.label, marginBottom: 6 }}>Send this</div>
        <Display>{target || "press NEW TEXT"}</Display>
      </div>

      {/* ---- Keying panel: decoded output + key surface + CHECK + results ---- */}
      <div style={S.panel}>
        <div style={{ ...S.label, marginBottom: 6 }}>
          Decoded from your key <span style={{ color: "#F2A93B" }}>{keyer.buffer}</span>
        </div>
        <Display cursor>{keyer.decoded}</Display>
        {errFlashEl}
        {keySurfaceEl}
        {checkEl}
        {resultsEl}
      </div>
    </>
  );

  // ---- Narrow (phone) KEY layout ----
  // narrowInstrumentStrip — key-type toggle + swap on ONE ≥40px row, relocated from
  // the options block to sit WITH the key (the ratified "instrument/mode toggles sit
  // with the key" rule, and the v1.2 open item). The verbose swap help sentence is
  // dropped on narrow (its meaning is carried by the button's aria-label). Iambic
  // Mode A/B renders below the key (narrowIambic) so this strip stays one row.
  const narrowInstrumentStrip = (
    <div style={{ display: "flex", gap: 6, alignItems: "stretch", marginTop: 12 }}>
      <div style={{ flex: 1 }}>
        <KeyModeControls compact keyType={settings.keyType} onKeyType={(v) => setSettings((s) => ({ ...s, keyType: v }))} />
      </div>
      <SwapToggle compact swap={settings.paddleSwap} onSwap={(v) => setSettings((s) => ({ ...s, paddleSwap: v }))} keyType={settings.keyType} />
    </div>
  );
  const narrowIambic = settings.keyType === "paddle" && (
    <IambicToggle compact modeB={settings.iambicModeB} onModeB={(v) => setSettings((s) => ({ ...s, iambicModeB: v }))} />
  );

  // narrowKeyLayout — the compact single practice card that clears the 390×844 fold
  // without scrolling (measured, headed — see the re-gate numbers). Order: category
  // (its own compact block) → [card] actions → instrument strip → compact target
  // readout → compact decoded readout → KEY → Iambic (set-once, paddle) → CHECK →
  // results. The decoded readout stays ABOVE the key (no pedagogical reorder — the
  // measured budget clears the fold without it). The compact Displays cap + scroll
  // internally, so a long target never pushes the key down.
  const narrowKeyLayout = (
    <>
      <div style={{ marginBottom: 14 }}>{categoryRow}</div>
      <div style={S.panel}>
        {narrowActionButtons}
        {narrowInstrumentStrip}
        <div style={{ ...S.label, marginTop: 12, marginBottom: 6 }}>Send this</div>
        <Display compact>{target || "press NEW TEXT"}</Display>
        <div style={{ ...S.label, marginTop: 12, marginBottom: 6 }}>
          Decoded from your key <span style={{ color: "#F2A93B" }}>{keyer.buffer}</span>
        </div>
        <Display compact cursor>{keyer.decoded}</Display>
        {errFlashEl}
        {keySurfaceEl}
        {narrowIambic}
        {checkEl}
        {resultsEl}
      </div>
    </>
  );

  // ---- layout rendering ----
  //
  // Wide: intro (if before first target) in main; optionsJSX portals into the
  //   shell's <aside class="wr-rail">; practicePanels stays in main.
  //   railEl may be null on the very first paint (before the callback ref fires) —
  //   the portal is skipped for that one imperceptible frame.
  //
  // Narrow: intro (if !target) + narrowKeyLayout — the category block plus one
  //   compact practice card (controls relocated to an instrument strip with the
  //   key, compact+capped Displays) so the key surface clears the 390×844 fold.
  //
  // The always-mounted scoreLive + catLive regions are in the component root,
  // never gated by isWide, so AT sees changes in both layouts.
  return (
    <div>
      {/* Always-mounted sr-only live regions (design §0 / C1 + C2).
          Two regions, two purposes:
          - scoreLive: score + fist summary after CHECK (polite, not time-critical)
          - catLive:   category position when the stepper or direct-pick changes (polite)
          Both start empty. Their text is set on the event so the AT sees a change.
          Not gated by isWide — render in both layouts. */}
      <div role="status" aria-live="polite" aria-atomic="true" style={S.srOnly}>{scoreLive}</div>
      <div role="status" aria-live="polite" aria-atomic="true" style={S.srOnly}>{catLive}</div>

      {/* Wide layout: intro in its own main-column panel; options portaled to rail. */}
      {isWide && introJSX}
      {isWide && railEl && !suppressRail && createPortal(<div style={S.panel}>{optionsJSX}</div>, railEl)}
      {isWide && practicePanels}

      {/* Narrow layout: intro (if before first target) + the compact single-card
          KEY layout — category as its own block, then one practice card with the
          key-type/mode controls relocated to an instrument strip WITH the key, so
          the key surface clears the 390×844 fold without scrolling. */}
      {!isWide && introJSX}
      {!isWide && narrowKeyLayout}
    </div>
  );
}

/* ================= QSO SIMULATOR ================= */
/* buildRagchew, buildPota, buildSota, buildIota are in src/cw-core.js.
   buildQso (the old random picker) has been removed — activity + role are now
   selected explicitly so the user can practice the contact they want. */

// Maps activity value to its builder function.
const ACTIVITY_BUILDERS = {
  ragchew: buildRagchew,
  pota:    buildPota,
  sota:    buildSota,
  iota:    buildIota,
  dx:      buildDx,
  contest: buildContest,
};

// Display labels for activities shown in the setup panel.
const ACTIVITY_LABELS = {
  ragchew: "Ragchew",
  pota:    "POTA",
  sota:    "SOTA",
  iota:    "IOTA",
  dx:      "Work DX",
  contest: "Contest",
};

// D1: one-liner description for each activity, shown as a sub-line under the label.
// Mirrors the pattern already used by the Conditions buttons (label + gray desc).
// Plain-anchored: each description leads with a clause a brand-new ham understands,
// with any shorthand spelled out or moved after the plain meaning (UAT — Dale).
const ACTIVITY_DESCS = {
  ragchew: "casual back-and-forth — names, location, and rig",
  pota:    "Parks on the Air",
  sota:    "Summits on the Air",
  iota:    "Islands on the Air",
  dx:      "work a far-off or rare station — a quick exchange, signal report only",
  contest: "contest contact — trade a quick serial number or zone",
};

// D1: role descriptions, keyed by activity + role value.
// Role terms vary by activity (Activator vs Hunter/Chaser) so descriptions do too.
const ROLE_DESCS = {
  ragchew: {
    call:   "you call CQ and run the exchange",
    answer: "you answer a station already calling CQ",
  },
  pota: {
    activator: "you're in the park — you call CQ and run the pile",
    hunter:    "you call the activator and give a signal report",
  },
  sota: {
    activator: "you're on the summit — you call CQ and run the pile",
    chaser:    "you call the activator and give a signal report",
  },
  iota: {
    activator: "you're on the island — you call CQ and run the pile",
    chaser:    "you call the activator and give a signal report",
  },
  dx: {
    callcq: "you call CQ DX and work the station that answers",
    hunt:   "you answer a distant station calling CQ — a quick signal report",
  },
  contest: {
    run: "you call CQ TEST and work the stations that answer",
    sp:  "find a station calling CQ and answer it — 'search and pounce'",
  },
};

// QsoSim — QSO simulator tab.
//
// Phase 1 rail split: on wide screens the setup controls (Activity / Role /
// Conditions / noise / start button) render in the shell's options rail via a
// React portal; the exchange flow + live regions render in the main column.
// On narrow screens everything renders inline in the original order (no change
// to the mobile experience).
//
// Props added for the split:
//   isWide  — from the shell's useIsWide(); determines which layout to use
//   railEl  — the DOM element of the <aside class="wr-rail">; null until the
//             rail mounts. QsoSim portals the setup controls into it when wide.
//             The portal is skipped when railEl is null (first paint or narrow).
function QsoSim({ player, settings, setSettings, isWide, railEl, suppressRail, record }) {
  // Activity and role menus (Phase 2/3).
  // Defaults: ragchew + answering role so the first-run experience is the
  // same as the old random behavior (which also skewed toward answering).
  const [activity, setActivity] = useState("ragchew");
  const [role, setRole] = useState("answer");

  // Per-activity variant state — one lightweight control each.
  // Split: presentational UP directive (hunt only); Serial/Zone toggle;
  // Contact type: domestic / dx / p2p (pota + sota only).
  const [dxSplit, setDxSplit] = useState(false);
  const [contestType, setContestType] = useState("wpx");
  const [contactType, setContactType] = useState("domestic");

  const [qso, setQso] = useState(null);
  const [step, setStep] = useState(0);
  const [copyAttempt, setCopyAttempt] = useState("");
  const [copyResult, setCopyResult] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [log, setLog] = useState([]);
  const [fillMsg, setFillMsg] = useState(null);
  const fillTimer = useRef(null);
  const { countdown, start: startCountdown, cancel: cancelCountdown } = useCountdown();

  // E5: intro paragraph collapsed state — persisted via store so returning users skip it.
  // Default: expanded (false) on first run; once dismissed, stays collapsed.
  const [introQsoCollapsed, setIntroQsoCollapsed] = useState(
    () => store.load("introQsoCollapsed", false)
  );

  // stepLive: text for the always-mounted step-transition live region (polite).
  // Set in advance() when a new DX or "your turn" step begins.
  const [stepLive, setStepLive] = useState("");
  // resultLive: text for the always-mounted copy/send result live region (polite).
  // Set in checkCopy() and checkSend() so AT announces the score + verdict without
  // relying on Score (which is aria-hidden). The region must be pre-mounted —
  // a text *change* is what triggers announcement (design §0).
  const [resultLive, setResultLive] = useState("");
  // roleLive: announces the Role when it auto-resets because the Activity changed
  // (not when the user picks a Role directly). The compacted Role trigger otherwise
  // updates its text silently — a user could start a contact in the wrong role
  // without noticing. Polite, always-mounted; set only in the Activity onChange.
  const [roleLive, setRoleLive] = useState("");
  // roleAutoPulse: a counter bumped on the same Activity-driven Role reset. Passed
  // to the Role CompactSelect as pulseKey — each bump replays a brief amber glow on
  // its trigger (the sighted-user counterpart to roleLive, reduced-motion-gated).
  const [roleAutoPulse, setRoleAutoPulse] = useState(0);
  // modeLive: announces the COPY ⇄ BREAK-IN mode switch on a DX step. The switch
  // also MOVES FOCUS, which is the worst case to do silently for a screen-reader
  // user. Polite, always-mounted (see the region block in the return).
  const [modeLive, setModeLive] = useState("");

  // armed: true = BREAK-IN mode on the current DX step (key pad revealed, copy
  // field parked). Component state only, never persisted, and force-reset on every
  // step advance / start / abandon — a mode that survived a step transition would
  // open step 2 in a stale state.
  const [armed, setArmed] = useState(false);

  // Phase 4 (B4) — per-conversation score accumulation for averageScore().
  // We accumulate copy % and send % across every graded step in a contact so
  // the done panel can show an aggregate. Arrays reset on start() / new contact.
  // Never persisted across sessions — deliberate: persistent history is a
  // separate open product decision (see brief).
  const [copyScores, setCopyScores] = useState([]);
  const [sendScores, setSendScores] = useState([]);

  // Auto-focus: copy input gets focus when a DX step becomes active so the user
  // can type their copy immediately. Ref is attached to the <input> in the DX panel.
  const qsoCopyInputRef = useRef(null);

  // Auto-grade guard and pause timer for QSO send steps.
  // qsoAutoGradeFired: true = checkSend() has already been called this step.
  //   Disarmed (→false) in the empty-decoded branch so HH wipe → clean re-send grades.
  //   Reset in advance(), CLEAR, both ABANDON buttons, and on unmount.
  // qsoPauseTimer: the pending setTimeout that fires checkSend() after the idle pause.
  //   Cleared on EVERY teardown path (advance, CLEAR, ABANDON, unmount, empty-decoded
  //   branch) so no stray grade can fire into a later step.
  // qsoAdvanceTimer: the pending setTimeout for auto-advance after a 100% grade.
  //   Two timers now coexist; both must be cancelled at every teardown point.
  //   Arm discipline: armAutoAdvance() is the ONLY place that sets this ref.
  //   Cancel discipline: folded into every qsoPauseTimer teardown block so they
  //   can't drift apart. Never armed when pct < 100 or when qsoAutoAdvance is OFF.
  const qsoAutoGradeFired = useRef(false);
  const qsoPauseTimer = useRef(null);
  const qsoAdvanceTimer = useRef(null);

  const showFill = (msg) => {
    setFillMsg(msg);
    clearTimeout(fillTimer.current);
    fillTimer.current = setTimeout(() => setFillMsg(null), 4000);
  };

  const keyer = useKeyer({
    keyWpm: settings.keyWpm,
    freq: settings.freq,
    player,
    // On a DX (copy) step the keyer is live ONLY while break-in is armed, so the
    // two input modes are genuinely mutually exclusive rather than incidentally
    // so. Without this gate a stray SPACEBAR — after clicking ↻ REPLAY, say, when
    // focus is on a button rather than the copy field — would decode invisibly and
    // could fire a break-in repeat the user never asked for. On "you" (send) steps
    // the keyer is always live, exactly as before.
    enabled: !!qso && step < qso.steps.length && (qso.steps[step]?.who !== "dx" || armed),
    mode: settings.keyType,
    swap: settings.paddleSwap,
    onError: () => { setSendResult(null); showFill("HH — error signal, cleared"); },
    // Mode B: gate on keyType==="paddle" — straight/bug unaffected.
    modeB: settings.keyType === "paddle" && settings.iambicModeB,
  });

  // Clear keyer state when operator switches key type mid-contact (see KeyTrainer
  // for the full rationale — same gap applies here).
  useEffect(() => {
    keyer.clear();
  }, [settings.keyType]); // eslint-disable-line react-hooks/exhaustive-deps

  const [difficulty, setDifficulty] = useState("normal");
  const [liveText, setLiveText] = useState("");
  const [noise, setNoise] = useState(18); // 0–100 comfort slider
  const noiseGain = (v) => (v / 100) * 0.5;

  const playDx = (text, { eff } = {}) => {
    setLiveText("");
    player.play(text, {
      charWpm: settings.charWpm,
      effWpm: eff ?? settings.effWpm,
      freq: settings.freq,
      qsb: difficulty === "real",
      onChar: difficulty === "easy" ? (idx) => setLiveText(text.slice(0, idx + 1)) : undefined,
    });
  };

  // Band noise lives with real-life mode while a contact is underway
  useEffect(() => {
    if (qso && step < qso.steps.length && difficulty === "real") {
      player.startNoise(noiseGain(noise), settings.freq, settings.rxFilter);
    } else {
      player.stopNoise();
    }
    return () => player.stopNoise();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qso, step, difficulty, settings.freq, settings.rxFilter]);

  // Auto-focus copy input when a dx step is active (normal/real mode shows the
  // copy input; easy mode shows CONTINUE instead). Guard: qsoCopyInputRef.current
  // is null when the input isn't rendered (easy mode, you-step, or before start).
  //
  // `armed` in the DEP LIST is load-bearing: DISarming must re-fire this so focus
  // returns to the copy field. Removing the dep leaves focus stranded on the
  // trigger button and typing silently does nothing (mutation-verified, KB-3/KB-5).
  //
  // `!armed` in the CONDITION is defence-in-depth, and the comment says so on
  // purpose. What actually keeps focus out of the <input> while armed is that the
  // copy block UNMOUNTS (the swap layout below) — so `qsoCopyInputRef.current` is
  // already null and the third clause blocks first. Removing `!armed` alone was
  // mutation-tested and did NOT change behaviour. It is kept because it is the
  // guard that would still hold if this panel ever stacked instead of swapping,
  // which is precisely how the original deaf-keyer bug happened.
  const cur = qso?.steps[step];
  useEffect(() => {
    if (cur && cur.who === "dx" && !armed && qsoCopyInputRef.current) {
      qsoCopyInputRef.current.focus();
    }
  }, [cur, armed]);

  // The one place the DX-step input mode changes. Blurs the copy field on the way
  // in (BreakInPanel then focuses the key surface); the effect above restores
  // focus to the field on the way out.
  const setBreakIn = (next) => {
    setArmed(next);
    if (next) {
      qsoCopyInputRef.current?.blur();
      setModeLive("Break-in armed. Key question mark, or A G N, to ask for a repeat.");
    } else {
      setModeLive("Copy field. Type what you heard.");
    }
  };

  const start = () => {
    const builder = ACTIVITY_BUILDERS[activity];
    // myCqZone: contest exchange needs the operator's CQ zone, computed from
    // their configured QTH state.  Defaults to 5 (W1/W2 eastern US) when the
    // QTH state isn't resolved — an honest fallback that won't crash the builder.
    const myCqZone = resolveUSState(stateOf(settings.myQth))?.cq ?? 5;
    const profile = {
      myCall:   settings.myCall,
      myName:   settings.myName,
      myQth:    settings.myQth,
      cut:      settings.cutNumbers,
      myCqZone,
    };
    // Build per-activity opts (defaults to {} for builders that don't use it).
    let opts = {};
    if (activity === "dx") {
      opts = { split: dxSplit };
    } else if (activity === "contest") {
      opts = { contestType };
    } else if (activity === "pota" || activity === "sota") {
      if (contactType === "p2p") opts = { p2p: true };
      else if (contactType === "dx") opts = { dx: true };
    }
    const q = builder(profile, role, opts);

    setQso(q); setStep(0); setLog([]);
    setCopyAttempt(""); setCopyResult(null); setRevealed(false); setSendResult(null);
    setLiveText("");
    setFillMsg(null);
    setArmed(false); // a new contact always opens in COPY mode
    keyer.clear();
    // Cancel any pending auto-advance from the previous contact before starting fresh.
    clearTimeout(qsoAdvanceTimer.current);
    qsoAdvanceTimer.current = null;
    // Reset per-conversation score arrays (B4)
    setCopyScores([]); setSendScores([]);
    if (difficulty === "real") player.startNoise(noiseGain(noise), settings.freq, settings.rxFilter);

    // First step: if it's a dx step, count down then play.
    // If it's a "you" step (activator role), go straight to the sending panel.
    if (q.steps[0].who === "dx") {
      startCountdown(() => playDx(q.steps[0].text));
    }
    // Activator role starts with who:"you" — no countdown needed, the sending
    // panel shows immediately and the user calls CQ.
  };

  const advance = (entry) => {
    setLog((l) => [...l, entry]);
    const next = step + 1;
    // Cancel any pending timers and countdown before stepping forward.
    // Without this, a pending setTimeout could fire checkSend() or an auto-advance
    // into the next step, and an orphaned countdown interval could fire playDx() ~5s later.
    clearTimeout(qsoPauseTimer.current);
    qsoPauseTimer.current = null;
    clearTimeout(qsoAdvanceTimer.current);
    qsoAdvanceTimer.current = null;
    cancelCountdown();
    qsoAutoGradeFired.current = false; // new step = new send attempt; reset guard
    setCopyAttempt(""); setCopyResult(null); setRevealed(false); setSendResult(null);
    setLiveText("");
    setFillMsg(null);
    setArmed(false); // every step opens in COPY mode — break-in never carries over
    keyer.clear();

    setStep(next);
    if (next < qso.steps.length) {
      const nextStep = qso.steps[next];
      // Announce the step transition to screen readers via the always-mounted
      // stepLive region (design §0 / C1). "Receiving" for DX steps, "Your turn"
      // for you-steps. The region is always in the DOM so this is a text change
      // the AT will speak, not a mount-with-content that would be ignored.
      setStepLive(
        nextStep.who === "dx"
          ? `Receiving from ${qso.dx}, step ${next + 1} of ${qso.steps.length}`
          : `Your turn, step ${next + 1} of ${qso.steps.length}`
      );
      if (nextStep.who === "dx") {
        // Countdown before each fresh DX transmission so the user has a beat to
        // reset their ear and pick up their pencil between exchanges.
        startCountdown(() => playDx(nextStep.text));
      }
    } else {
      // Contact complete — next === qso.steps.length means every step was advanced.
      // Record exactly once here; the `next === length` guard prevents double-fire.
      // averageScore([]) → null so an un-graded side is recorded as null, not 0.
      // Closure-freshness: copyScores/sendScores are stable at this point because
      // score accumulation (checkCopy/checkSend) always happens in a prior user event
      // before the final CONTINUE/TRANSMIT → advance() click.
      record?.("qso", {
        t: Date.now(),
        activity,
        role,
        difficulty,
        copyPct: averageScore(copyScores),
        sendPct: averageScore(sendScores),
      });
    }
  };

  // Don't leave any timers running after unmount (fill, auto-grade pause, auto-advance).
  // The countdown interval is already cleaned up by useCountdown's own unmount effect.
  useEffect(() => () => {
    clearTimeout(fillTimer.current);
    clearTimeout(qsoPauseTimer.current);
    clearTimeout(qsoAdvanceTimer.current);
  }, []);

  // Arm the auto-advance timer after a perfect grade.
  //
  // Called at the end of checkCopy() and checkSend() with the just-computed pct/sim
  // and a closure over the advance() call the CONTINUE/TRANSMIT button would make.
  // Using the same advance() path means the timer does exactly what the button does —
  // no divergence between manual and auto flows.
  //
  // Guard discipline (double-fire prevention):
  //   • The unconditional clearTimeout at the top ensures re-grading the same step
  //     (manual CHECK after pause-auto-grade, or vice versa) can't stack two timers.
  //   • advance() also clears this ref, so a CONTINUE/TRANSMIT during the window kills
  //     the pending timer before it fires.
  //
  // Toggle-off-mid-window: if qsoAutoAdvance is turned OFF after this timer is already
  // armed, the pending timer runs to completion (recommendation A from the design).
  // The toggle only governs future grades — keep it simple.
  const armAutoAdvance = (pct, advanceFn) => {
    clearTimeout(qsoAdvanceTimer.current);   // cancel any prior pending advance (double-fire guard)
    qsoAdvanceTimer.current = null;
    if (!settings.qsoAutoAdvance) return;     // toggle OFF → never arm
    if (pct !== 100) return;                  // HARD 100%-ONLY GATE — <100% never arms
    qsoAdvanceTimer.current = setTimeout(() => {
      qsoAdvanceTimer.current = null;
      advanceFn();                            // fires the exact same advance the button calls
    }, QSO_AUTO_ADVANCE_MS);
  };

  const checkCopy = () => {
    // Fidelity grade with cut-number tolerance (§7): copying 5NN for 599 counts.
    const pct = Math.round(similarityCw(cur.text, copyAttempt) * 100);
    const verdict = pct >= 90 ? "SOLID COPY" : pct >= 70 ? "GOOD — AGN FOR PRACTICE" : "PSE AGN";
    setCopyResult(pct);
    setRevealed(true);
    // Accumulate for per-conversation aggregate (B4)
    setCopyScores((prev) => [...prev, pct]);
    // Announce to AT via the always-mounted resultLive region (design §0).
    // Score is aria-hidden; this is the only AT path for the copy result.
    // Append the auto-advance notice ONLY when actually armed so AT isn't surprised.
    const copyLiveMsg = `Copy: ${pct}% — ${verdict}`;
    setResultLive(
      settings.qsoAutoAdvance && pct === 100
        ? `${copyLiveMsg} Advancing automatically.`
        : copyLiveMsg
    );
    armAutoAdvance(pct, () => advance({ who: qso.dx, text: cur.text }));
  };

  // Break-in: interpret what the user keys during a DX transmission as
  // on-air fill requests — ? / AGN = repeat, QRS = slower, partial call + ? = call fill.
  useEffect(() => {
    if (!qso || !cur || cur.who !== "dx") return;
    const raw = keyer.decoded;
    // Act when a thought is complete: a ? lands, or the word gap finalizes it
    if (!raw || !(raw.endsWith("?") || raw.endsWith(" "))) return;
    const sent = raw.replace(/\s+/g, "").toUpperCase();
    if (!sent) return;
    // dxSigned: how the other station identifies on the air.
    // Builders set qso.dxSigned when it differs from qso.dx (e.g. SOTA activator signs /P).
    const dxSigned = qso.dxSigned ?? qso.dx;

    const respond = (text, msg, eff) => {
      keyer.clear();
      showFill(msg);
      playDx(text, eff !== undefined ? { eff } : {});
    };

    if (sent === "?" || sent === "AGN" || sent === "AGN?") {
      respond(cur.text, "? — REPEATING");
    } else if (sent === "QRS" || sent === "QRS?") {
      respond(cur.text, "QRS — SLOWING DOWN", Math.max(4, settings.effWpm - 4));
    } else if (sent.endsWith("?")) {
      const part = sent.slice(0, -1);
      const flatCall = dxSigned.replace("/", "");
      const callFill =
        part === "CALL" || part === "URCALL" ||
        (part.length >= 1 && (flatCall.startsWith(part) || flatCall.includes(part)));
      if (callFill && part !== "") {
        respond(`${dxSigned} ${dxSigned}`, `${part}? — CALL FILL`);
      } else {
        respond(cur.text, "? — REPEATING");
      }
    }
    // anything else keyed mid-copy is left alone
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyer.decoded]);

  const checkSend = () => {
    // Cancel the pending pause-timer and arm the guard BEFORE computing results.
    // This ensures: (a) a manual CHECK cancels any pending auto-fire so the user
    // can't get a double-grade by pressing CHECK then waiting out the pause; and
    // (b) if the auto-fire calls us, the guard is set before we return so a
    // concurrent re-render can't sneak in another call.
    clearTimeout(qsoPauseTimer.current);
    qsoPauseTimer.current = null;
    qsoAutoGradeFired.current = true;
    const sent = keyer.decoded.toUpperCase();
    // Element-based grade (ratified model): score whether the REQUIRED elements
    // (cur.mustContain) were conveyed in any valid on-air form — NOT fidelity to
    // the verbose `suggested` example. The score IS the ✓ checklist (one
    // computation via gradeSend), so the old 23%-with-✓-K9MTE contradiction is
    // now structurally impossible. `cur.suggested` is reveal-only (the
    // SHOW-SUGGESTED reference), never the grading target.
    const { score, hits, missing } = gradeSend(cur.mustContain, sent);
    setSendResult({ score, hits, need: cur.mustContain });
    // Accumulate for per-conversation aggregate (B4). Same 0–100 range as before,
    // no schema change — the send-trend now measures required-elements accuracy
    // instead of script fidelity (a semantics improvement, not a format change).
    setSendScores((prev) => [...prev, score]);
    // Announce to AT via the always-mounted resultLive region (design §0).
    // Score is aria-hidden and the mustContain checklist is color + glyph only —
    // this is the only AT path for both the send score and the hit/missing tokens.
    const verdict = score >= 90 ? "SOLID COPY" : score >= 70 ? "GOOD — AGN FOR PRACTICE" : "PSE AGN";
    let liveMsg = `Send: ${score}% — ${verdict}. Sent: ${hits.length > 0 ? hits.join(", ") : "none"}`;
    if (missing.length > 0) liveMsg += `; missing: ${missing.join(", ")}`;
    liveMsg += ".";
    // Append the auto-advance notice ONLY when actually armed so AT isn't surprised.
    setResultLive(
      settings.qsoAutoAdvance && score === 100
        ? `${liveMsg} Advancing automatically.`
        : liveMsg
    );
    armAutoAdvance(score, () => advance({ who: settings.myCall, text: keyer.decoded || "(sent)" }));
  };

  // Auto-grade send step (PAUSE-BASED): replaces the old length-based trigger.
  //
  // WHY not length-based: cur.suggested is a 60–90 char verbose exchange script;
  // a real over never reaches that length, so the old trigger never fired.
  //
  // HOW it works: on each keyer.decoded change, gated to you-send steps only:
  //   • empty decoded (HH wipe or never-keyed) → cancel pending timer + disarm
  //     guard (so a clean re-send after HH grades the clean attempt).
  //   • non-empty decoded → (re)arm a fresh pause timer; on elapse, call checkSend()
  //     exactly once (guard re-checked inside the callback in case a manual CHECK
  //     fired between the arm and the elapse).
  //
  // Threshold = max(QSO_SEND_PAUSE_MS, 8*unit): the 8u arm exceeds the CW 7u
  // inter-word gap at slow WPM so a natural word pause can't trigger a premature
  // grade; the 1500ms floor keeps it responsive at fast WPM.
  //
  // Deps: [keyer.decoded] only. cur/checkSend read via closure; listing cur would
  // re-run after advance() before the guard resets (false-fire risk).
  useEffect(() => {
    // Gate: only you-send steps with a suggested script.
    if (!cur || cur.who === "dx" || !cur.suggested) {
      // Not a you-send step — cancel any pending timer from a previous step.
      clearTimeout(qsoPauseTimer.current);
      qsoPauseTimer.current = null;
      return;
    }

    if (!keyer.decoded || keyer.decoded.trim() === "") {
      // Empty decoded: HH wipe or never-keyed.
      // Cancel any pending grade and disarm the guard so the next real send grades.
      clearTimeout(qsoPauseTimer.current);
      qsoPauseTimer.current = null;
      qsoAutoGradeFired.current = false;
      return;
    }

    // Non-empty: operator is sending. (Re)arm the idle-pause timer.
    clearTimeout(qsoPauseTimer.current);
    const unit = 1200 / settings.keyWpm;
    const delay = Math.max(QSO_SEND_PAUSE_MS, 8 * unit);
    qsoPauseTimer.current = setTimeout(() => {
      qsoPauseTimer.current = null;
      // Guard re-check: manual CHECK may have fired between arm and elapse.
      if (!qsoAutoGradeFired.current) {
        checkSend();
      }
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyer.decoded]);

  const done = qso && step >= qso.steps.length;

  // ---- JSX fragments for the two layout regions ----
  // Keeping them as variables (not components) so they close over local state
  // without any prop threading. Both branches share all the same callbacks.

  // introJSX — collapsible orientation paragraph. Goes in main in both modes.
  // On wide it gets its own panel; on narrow it's folded into the setup panel
  // below (matching today's single-box appearance on mobile).
  const introJSX = !qso && (
    <>
      {/* E5: collapsible intro — same pattern as KeyTrainer. Toggle persists via store. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: introQsoCollapsed ? 10 : 0 }}>
        <div style={S.label}>Simulated contact</div>
        <button
          aria-label={introQsoCollapsed ? "Show intro" : "Hide intro"}
          style={{ ...S.btn, fontSize: "0.6875rem", padding: "4px 10px", color: "#8A929C" }}
          onClick={() => {
            const next = !introQsoCollapsed;
            setIntroQsoCollapsed(next);
            store.save("introQsoCollapsed", next);
          }}
        >{introQsoCollapsed ? "▸ show intro" : "▾ hide intro"}</button>
      </div>
      {!introQsoCollapsed && (
        <p style={{ color: "#C9CDD3", fontSize: "0.875rem", lineHeight: 1.6, fontFamily: "system-ui, sans-serif", marginTop: 8, marginBottom: 0 }}>
          Pick your activity and role, then work the full exchange — CQ, RST, name, QTH — through to the sign-off. On each over you can check your copy before continuing, or just answer the way you would on the air.
        </p>
      )}
    </>
  );

  // optionsJSX — Activity / Role / Conditions selectors + noise slider + start
  // button. On wide these go to the rail; on narrow they stay inline below the
  // intro in a single combined panel (today's layout, no mobile regression).
  const optionsJSX = !qso && (
    <>
      {/* Activity selector — CompactSelect; the D1 description sub-lines move into
          the open panel's option rows. onChange keeps the existing side effect:
          default Role → the last (answering/responder) role for the new activity. */}
      <CompactSelect
        label="Activity"
        options={Object.entries(ACTIVITY_LABELS).map(([v, l]) => ({ value: v, label: l, description: ACTIVITY_DESCS[v] }))}
        value={activity}
        onChange={(v) => {
          setActivity(v);
          // Default to the last role in the list: for every existing and new
          // activity this is the "listener / responder" role (answer, hunter,
          // chaser, hunt, sp) — the more natural starting point for a learner.
          const terms = ROLE_TERMS[v];
          const [nextRole, nextRoleLabel] = terms[terms.length - 1];
          setRole(nextRole);
          // Make the auto-reset perceptible (UAT: the compacted trigger changes
          // silently). Announce it politely for AT and bump the pulse counter so
          // the Role trigger glows amber for sighted users. This fires ONLY here,
          // on an Activity-driven reset — never on a direct Role pick below.
          setRoleLive(`Role set to ${nextRoleLabel}`);
          setRoleAutoPulse((n) => n + 1);
        }}
      />

      {/* Role selector — activity-dependent options (re-renders when Activity changes).
          pulseKey drives the amber attention-glow when the Activity reset the Role. */}
      <CompactSelect
        label="Role"
        options={ROLE_TERMS[activity].map(([v, l]) => ({ value: v, label: l, description: ROLE_DESCS[activity][v] }))}
        value={role}
        onChange={setRole}
        pulseKey={roleAutoPulse}
      />

      {/* Conditions selector — internal values ("easy"/"normal"/"real") unchanged;
          the QSB/noise conditionals throughout this component still test
          `difficulty === "real"`. Descriptions move into the open panel. */}
      <CompactSelect
        label="Conditions"
        options={[
          { value: "easy",   label: "EASY",      description: "Text appears letter by letter as it's sent — hear it and see it together." },
          { value: "normal", label: "NORMAL",    description: "Clean signal, no help. Copy by ear, check yourself, then continue." },
          { value: "real",   label: "REAL LIFE", description: "Band noise at your comfort level, and the signal fades up and down like real HF. QSB is the teacher here." },
        ]}
        value={difficulty}
        onChange={setDifficulty}
      />
      {difficulty === "real" && (
        <div style={{ marginBottom: 6 }}>
          <Slider label="Band noise" value={noise} min={0} max={100} step={1} suffix="%"
            onChange={(v) => { setNoise(v); player.setNoiseLevel(noiseGain(v)); }} />
          <div style={{ fontSize: "0.75rem", color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: -6, marginBottom: 12 }}>
            Adjustable any time during the contact — find the edge of your comfort and sit just past it.
          </div>
        </div>
      )}

      {/* Auto-advance toggle — opt-in, default OFF (see qsoAutoAdvance in DEFAULT_SETTINGS).
          When ON: a 100% grade starts a QSO_AUTO_ADVANCE_MS countdown, then fires the
          exact same advance() the CONTINUE/TRANSMIT button calls. <100% never arms.
          WCAG 2.2.1 "Timing Adjustable" satisfied by design: toggle is OFF by default
          and the manual CONTINUE/TRANSMIT is always present during the window. */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div>
            <div style={S.label}>Auto-advance on a perfect over</div>
            <div style={{ fontSize: "0.75rem", color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 2 }}>
              When you score 100% on an over, automatically continue after a few seconds — no click needed.
            </div>
          </div>
          <button
            aria-pressed={settings.qsoAutoAdvance}
            onClick={() => setSettings((s) => ({ ...s, qsoAutoAdvance: !s.qsoAutoAdvance }))}
            style={{ ...S.btn, padding: "8px 14px", flexShrink: 0, ...(settings.qsoAutoAdvance ? { borderColor: "#F2A93B", color: "#F2A93B", fontWeight: 700 } : { color: "#8A929C" }) }}>
            {settings.qsoAutoAdvance ? "AUTO ON" : "AUTO OFF"}
          </button>
        </div>
      </div>

      {/* Variant controls — one lightweight control per activity that has options.
          Shown only when the relevant activity is selected. */}
      {activity === "dx" && role === "hunt" && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={S.label}>Split (UP)</div>
              <div style={{ fontSize: "0.75rem", color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 2 }}>
                DX CQ includes a QSX directive — practice copying "UP 5 TO 10".
              </div>
            </div>
            <button
              aria-pressed={dxSplit}
              onClick={() => setDxSplit((v) => !v)}
              style={{ ...S.btn, padding: "8px 14px", flexShrink: 0, ...(dxSplit ? { borderColor: "#F2A93B", color: "#F2A93B", fontWeight: 700 } : { color: "#8A929C" }) }}>
              {dxSplit ? "SPLIT ON" : "SPLIT OFF"}
            </button>
          </div>
        </div>
      )}
      {activity === "contest" && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...S.label, marginBottom: 8 }}>Exchange type</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[["wpx", "Serial (WPX)"], ["zone", "Zone (CQ WW)"]].map(([v, l]) => (
              <button key={v} aria-pressed={contestType === v} onClick={() => setContestType(v)}
                style={{ ...S.btn, flex: 1, padding: "8px 10px", ...(contestType === v ? { borderColor: "#F2A93B" } : {}) }}>
                <span style={{ color: contestType === v ? "#F2A93B" : "#E8E2D6", fontWeight: 700, fontSize: "0.75rem" }}>{l}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {(activity === "pota" || activity === "sota") && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...S.label, marginBottom: 8 }}>Contact type</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              ["domestic", "Domestic", "work a US activator"],
              ["dx",       "DX",       "work an international activator"],
              ["p2p",      activity === "sota" ? "S2S" : "P2P", "both stations activating — exchange refs"],
            ].map(([v, l, desc]) => (
              <button key={v} aria-pressed={contactType === v} onClick={() => setContactType(v)}
                style={{ ...S.btn, textAlign: "left", padding: "8px 14px", ...(contactType === v ? { borderColor: "#F2A93B" } : {}) }}>
                <span style={{ color: contactType === v ? "#F2A93B" : "#E8E2D6", fontWeight: 700, fontSize: "0.75rem" }}>{l}</span>
                <div style={{ fontSize: "0.75rem", color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 2 }}>{desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Start button — label adapts: certain roles start by calling CQ themselves */}
      <button style={S.btnAmber} onClick={start}>
        {["activator", "call", "callcq", "run"].includes(role) ? "📻 CALL CQ" : "📻 LISTEN FOR CQ"}
      </button>
    </>
  );

  // contextJSX — running context shown in the rail during an active contact (wide only).
  //
  // Replaces optionsJSX in the rail while qso is set and the contact is underway.
  // Content: activity/role/difficulty label, worked station, step progress, and
  // live per-step scores. All data comes from existing component state — no new
  // scoring logic. Read-only status; the ABANDON button stays in main.
  //
  // When done, the rail reverts to optionsJSX (ready-for-NEXT-CONTACT state).
  const avgCopyLive = averageScore(copyScores);
  const avgSendLive = averageScore(sendScores);
  const contextJSX = qso && !done && (
    <div>
      <div style={{ ...S.label, marginBottom: 10 }}>In contact</div>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.875rem", color: "#F2A93B", letterSpacing: 1, marginBottom: 6 }}>
        {qso.flavor} · {ROLE_TERMS[activity]?.find(([v]) => v === role)?.[1] ?? role}
      </div>
      <div style={{ ...S.label, color: "#8A929C", marginBottom: 4 }}>DX</div>
      <div style={{ fontFamily: "ui-monospace, monospace", color: "#FFD89B", marginBottom: 10 }}>{qso.dx}</div>
      <div style={{ ...S.label, color: "#8A929C", marginBottom: 4 }}>Difficulty</div>
      <div style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.8125rem", color: "#C9CDD3", marginBottom: 10 }}>
        {difficulty === "real" ? "Real life" : difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
      </div>
      <div style={{ ...S.label, color: "#8A929C", marginBottom: 4 }}>Step</div>
      <div style={{ fontFamily: "ui-monospace, monospace", color: "#FFD89B", marginBottom: 10 }}>
        {step + 1} / {qso.steps.length}
      </div>
      {/* Live per-step scores — suppressed when no steps have been graded yet */}
      {(avgCopyLive !== null || avgSendLive !== null) && (
        <div style={{ borderTop: "1px solid #2E343C", paddingTop: 10, marginTop: 4 }}>
          <div style={{ ...S.label, color: "#8A929C", marginBottom: 6 }}>Running avg</div>
          {avgCopyLive !== null && (
            <div style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.8125rem", color: "#C9CDD3" }}>
              Copy: <span style={{ fontFamily: "ui-monospace, monospace", color: "#F2A93B" }}>{avgCopyLive}%</span>
            </div>
          )}
          {avgSendLive !== null && (
            <div style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.8125rem", color: "#C9CDD3", marginTop: 4 }}>
              Send: <span style={{ fontFamily: "ui-monospace, monospace", color: "#F2A93B" }}>{avgSendLive}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ---- layout rendering ----
  //
  // Wide: optionsJSX portals into the shell's <aside class="wr-rail"> when
  //   no contact is underway (!qso or done). During a contact, contextJSX
  //   takes over the rail with running context + live scores.
  //   railEl may be null on the very first paint — portal is skipped, no flash.
  //   The intro gets its own panel in main (per design §5).
  //
  // Narrow: the original combined panel (intro + options in one box) renders
  //   inline above the exchange flow — no change to the mobile appearance.
  //   contextJSX never renders on narrow (the exchange panels carry that info).
  //
  // The always-mounted live regions render unconditionally in both layouts
  // (never gated by isWide) so AT can see text changes regardless of width.
  return (
    <div>
      {/* Always-mounted sr-only live regions (design §0 / C1).
          These must NOT be inside conditional blocks — they need to be in the DOM
          continuously so that text changes (set on events) are announced by AT.
          - stepLive:   step transitions in the normal QSO loop (polite)
          - resultLive: copy/send score + verdict after CHECK COPY / CHECK TRANSMISSION (polite)
          - roleLive:   the Role when an Activity change auto-resets it (polite)
          - modeLive:   the DX-step COPY ⇄ BREAK-IN switch, which also moves focus (polite)
          Not gated by isWide — render in both layouts. */}
      <div role="status" aria-live="polite" aria-atomic="true" style={S.srOnly}>{stepLive}</div>
      <div role="status" aria-live="polite" aria-atomic="true" style={S.srOnly}>{resultLive}</div>
      <div role="status" aria-live="polite" aria-atomic="true" style={S.srOnly}>{roleLive}</div>
      <div role="status" aria-live="polite" aria-atomic="true" style={S.srOnly}>{modeLive}</div>

      {/* Wide layout: intro in its own main-column panel; options OR context portaled to rail. */}
      {isWide && !qso && <div style={S.panel}>{introJSX}</div>}
      {isWide && railEl && !suppressRail && createPortal(
        <div style={S.panel}>
          {/* Mid-contact: show context; pre-contact or done: show setup options */}
          {qso && !done ? contextJSX : optionsJSX}
        </div>,
        railEl
      )}

      {/* Narrow layout: intro + options combined in a single panel (today's appearance). */}
      {!isWide && !qso && <div style={S.panel}>{introJSX}{optionsJSX}</div>}

      {qso && !done && cur && cur.who === "dx" && (
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 8 }}>
            {difficulty === "easy"
              ? <>◉ {qso.dx} is sending — <span style={{ color: "#F2A93B" }}>{qso.flavor}</span> — step {step + 1} of {qso.steps.length}</>
              : <>◉ Receiving — step {step + 1} of {qso.steps.length}</>}
            {difficulty === "real" && <span style={{ color: "#E07A5F", marginLeft: 8 }}>QSB</span>}
          </div>
          {/* copyHint is a FOCUS AID, not an instruction — it names where to put your
              attention ("the callsign is what matters"), while copy is graded on
              fidelity to the WHOLE transmission. Unlabelled prose directly under the
              heading read as "do this", so a user who copied only the callsign got a
              20% score they could not explain. The label gives the sentence its role.
              The hint wording itself is deliberately untouched: directing attention to
              the one element that matters is real operating practice and good teaching.
              Rendered as a div rather than a <p> so its bottom margin is explicit —
              that reclaimed margin pays for most of the label line. */}
          {difficulty !== "real" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...S.label, marginBottom: 2 }}>Listen for</div>
              <div style={{ color: S.text.dim, fontSize: "0.8125rem", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
                {cur.copyHint}
              </div>
            </div>
          )}

          {/* Countdown: shown in the Display area (same spot as easy-mode live text)
              while the pre-play beat runs. Suppressed once playback begins. */}
          {countdown !== null && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...S.label, marginBottom: 6 }}>Get ready</div>
              <Display>
                <span style={{ fontSize: "2.5rem", fontWeight: 700 }}>{countdown}</span>
              </Display>
            </div>
          )}

          {difficulty === "easy" && countdown === null && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...S.label, marginBottom: 6 }}>Sending</div>
              <Display cursor={player.playing}>{liveText}</Display>
            </div>
          )}

          {difficulty === "real" && (
            <div style={{ marginBottom: 6 }}>
              <Slider label="Band noise" value={noise} min={0} max={100} step={1} suffix="%"
                onChange={(v) => { setNoise(v); player.setNoiseLevel(noiseGain(v)); }} />
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button style={S.btn} onClick={() => playDx(cur.text)}>↻ REPLAY</button>
            <button style={S.btn} onClick={() => playDx(cur.text, { eff: Math.max(5, settings.effWpm - 3) })}>🐢 SLOWER</button>
            <button style={S.btn} onClick={() => player.stop()}>■ STOP</button>
          </div>

          {/* Required path FIRST, repair tool second — the reading order now matches
              the doing order: hear it → type it → check it → continue. In BREAK-IN
              mode the copy block collapses to a one-line summary so the panel swaps
              rather than stacks and the key surface stays inside the fold. */}
          {difficulty === "easy" ? (
            <button style={S.btnAmber} onClick={() => advance({ who: qso.dx, text: cur.text })}>CONTINUE → YOUR TURN</button>
          ) : armed ? (
            <button
              onClick={() => setBreakIn(false)}
              style={{
                ...S.btn, display: "flex", alignItems: "center", justifyContent: "space-between",
                // flexWrap: measured at 390px the two halves did not fit on one
                // line and the summary ellipsized to "no…" — worse than useless.
                // Wrapping to two lines costs ~20px and keeps both halves readable.
                gap: 8, flexWrap: "wrap", width: "100%", minHeight: 44, padding: "10px 14px",
                textAlign: "left", boxSizing: "border-box", marginBottom: 12,
              }}
            >
              <span style={{ minWidth: 0, flexShrink: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: S.text.dim }}>
                YOUR COPY · {copyAttempt.trim() ? copyAttempt.trim().slice(0, 24) : "not started"}
              </span>
              <span style={{ flexShrink: 0 }}><span aria-hidden="true">✎ </span>BACK TO COPY</span>
            </button>
          ) : (
            <>
              {/* C1: was "(optional — check it or just answer)". "Or just answer" told
                  the user to do something this step does not support — it is the
                  sentence that authored the reported error. The optionality is still
                  visible in the affordance: CONTINUE sits right there, enabled. */}
              <div style={{ ...S.label, marginBottom: 2 }}>Your copy — what did you hear?</div>
              {/* States the scoring rule up front so nobody has to infer it from a bad
                  score. Copy is graded on fidelity to the whole transmission, while
                  "Listen for" above names only the element that matters most — without
                  this line the two read as contradicting each other. Deliberately
                  self-contained (no "not just the part above"): `real` difficulty hides
                  the hint entirely, so a back-reference would dangle there. */}
              <div style={{ color: S.text.dim, fontSize: "0.75rem", fontFamily: "system-ui, sans-serif", lineHeight: 1.5, marginBottom: 6 }}>
                Type everything you heard — the whole transmission is graded.
              </div>
              <input ref={qsoCopyInputRef} style={S.input} value={copyAttempt} onChange={(e) => setCopyAttempt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") checkCopy();
                  // Esc from the copy field is the reflex reach for the key.
                  else if (e.key === "Escape") setBreakIn(true);
                }}
                aria-label="Your copy of what you heard"
                placeholder="type what you hear..." autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <button style={S.btn} onClick={checkCopy} disabled={!copyAttempt.trim()}>CHECK COPY</button>
                <button style={S.btn} onClick={() => setRevealed(true)}>👁 REVEAL</button>
                {/* C2: naming the destination is the whole fix for the mistake —
                    at the moment of decision the screen states that answering
                    happens AFTER this button, in the app's own vocabulary
                    ("Your turn — step N of M" is the next screen's heading). */}
                <button style={S.btnAmber} onClick={() => advance({ who: qso.dx, text: cur.text })}>CONTINUE → YOUR TURN</button>
              </div>
              {revealed && (
                <div style={{ marginTop: 14, marginBottom: 12 }}>
                  <div style={{ ...S.label, marginBottom: 6 }}>Sent</div>
                  {copyResult !== null ? <CharDiff target={cur.text} attempt={copyAttempt} /> : <Display>{cur.text}</Display>}
                  {copyResult !== null && <Score pct={copyResult} />}
                </div>
              )}
            </>
          )}

          <BreakInPanel
            keyer={keyer}
            armed={armed}
            onArmedChange={setBreakIn}
            keyType={settings.keyType}
            onKeyType={(v) => setSettings((s) => ({ ...s, keyType: v }))}
            swap={settings.paddleSwap}
            onSwap={(v) => setSettings((s) => ({ ...s, paddleSwap: v }))}
            fillMsg={fillMsg}
            compact={!isWide}
          />

          {/* E4: abandon mid-contact — returns to setup without finishing the exchange */}
          <div style={{ marginTop: 12, borderTop: "1px solid #2E343C", paddingTop: 10 }}>
            <button
              aria-label="Abandon this contact and return to setup"
              style={{ ...S.btn, color: S.text.dim, fontSize: "0.6875rem" }}
              onClick={() => {
                player.stop();
                cancelCountdown();
                clearTimeout(qsoPauseTimer.current); qsoPauseTimer.current = null;
                clearTimeout(qsoAdvanceTimer.current); qsoAdvanceTimer.current = null;
                qsoAutoGradeFired.current = false;
                setArmed(false);
                setQso(null); keyer.clear();
              }}
            >✕ ABANDON CONTACT / back to setup</button>
          </div>
        </div>
      )}

      {qso && !done && cur && cur.who === "you" && (
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 8 }}>
            ◉ Your turn — step {step + 1} of {qso.steps.length}
          </div>
          <p style={{ color: "#8A929C", fontSize: "0.8125rem", fontFamily: "system-ui, sans-serif", marginTop: 0 }}>{cur.prompt}</p>
          {revealed ? (
            // compact on narrow: caps the (up to ~115-char) suggested script at
            // maxHeight+scroll so a long "Full QSO line" reveal cannot push the key
            // surface below the phone fold — the key position stays independent of
            // script length (the same content-independence the KEY tab relies on).
            <Display compact={!isWide}>{cur.suggested}</Display>
          ) : (
            <button style={S.btn} onClick={() => setRevealed(true)}>👁 SHOW SUGGESTED SCRIPT</button>
          )}
          <div style={{ ...S.label, margin: "12px 0 6px" }}>
            Decoded from your key <span style={{ color: "#F2A93B" }}>{keyer.buffer}</span>
          </div>
          {/* compact on narrow: the shorter readout banks vertical room above the key. */}
          <Display cursor compact={!isWide}>{keyer.decoded}</Display>
          <KeyInput keyer={keyer} keyType={settings.keyType} onKeyType={(v) => setSettings((s) => ({ ...s, keyType: v }))} swap={settings.paddleSwap} onSwap={(v) => setSettings((s) => ({ ...s, paddleSwap: v }))} />
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button style={S.btnAmber} onClick={checkSend}>CHECK TRANSMISSION</button>
            <button style={S.btn} onClick={() => {
              clearTimeout(qsoPauseTimer.current); qsoPauseTimer.current = null;
              clearTimeout(qsoAdvanceTimer.current); qsoAdvanceTimer.current = null;
              qsoAutoGradeFired.current = false; keyer.clear();
            }}>✕ CLEAR</button>
          </div>
          {sendResult && (
            <div style={{ marginTop: 12 }}>
              <Score pct={sendResult.score} />
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.8125rem", marginTop: 6 }}>
                {sendResult.need.map((m) => (
                  <span key={m} style={{ marginRight: 12, color: sendResult.hits.includes(m) ? "#8FCB9B" : "#E07A5F" }}>
                    {sendResult.hits.includes(m) ? "✓" : "✗"} {m}
                  </span>
                ))}
              </div>
              {sendResult.hits.length < sendResult.need.length && (
                <p style={{ color: "#8A929C", fontSize: "0.75rem", fontFamily: "system-ui, sans-serif", margin: "8px 0 0", lineHeight: 1.55 }}>
                  On the air, the other station wouldn't have everything it needed here — it would come back with a fill, like <span style={{ fontFamily: "ui-monospace, monospace", color: "#FFD89B" }}>AGN?</span> or <span style={{ fontFamily: "ui-monospace, monospace", color: "#FFD89B" }}>UR RST?</span>, and wait for you to resend the missing piece.
                </p>
              )}
              <div style={{ marginTop: 12 }}>
                <button style={S.btnAmber} onClick={() => advance({ who: settings.myCall, text: keyer.decoded || "(sent)" })}>
                  TRANSMIT →
                </button>
              </div>
            </div>
          )}
          {/* E4: abandon mid-contact — returns to setup without finishing the exchange */}
          <div style={{ marginTop: 12, borderTop: "1px solid #2E343C", paddingTop: 10 }}>
            <button
              aria-label="Abandon this contact and return to setup"
              style={{ ...S.btn, color: S.text.dim, fontSize: "0.6875rem" }}
              onClick={() => {
                player.stop();
                cancelCountdown();
                clearTimeout(qsoPauseTimer.current); qsoPauseTimer.current = null;
                clearTimeout(qsoAdvanceTimer.current); qsoAdvanceTimer.current = null;
                qsoAutoGradeFired.current = false;
                setArmed(false);
                setQso(null); keyer.clear();
              }}
            >✕ ABANDON CONTACT / back to setup</button>
          </div>
        </div>
      )}

      {done && (() => {
        // Per-conversation aggregate scores (B4). averageScore returns null for
        // empty arrays so we suppress the line when no graded steps occurred.
        const avgCopy = averageScore(copyScores);
        const avgSend = averageScore(sendScores);

        const scoreSummary = (avgCopy !== null || avgSend !== null) && (
          <p style={{ color: "#8A929C", fontSize: "0.75rem", fontFamily: "system-ui, sans-serif", margin: "6px 0 0" }}>
            {avgCopy !== null && <span>Avg copy: <span style={{ color: "#F2A93B" }}>{avgCopy}%</span></span>}
            {avgCopy !== null && avgSend !== null && <span style={{ margin: "0 6px" }}>·</span>}
            {avgSend !== null && <span>Avg send: <span style={{ color: "#F2A93B" }}>{avgSend}%</span></span>}
          </p>
        );

        return (
          <div style={S.panel}>
            <div style={{ fontFamily: "ui-monospace, monospace", color: "#F2A93B", fontSize: 22, letterSpacing: 3 }}>QSO COMPLETE — 73</div>
            <p style={{ color: "#8A929C", fontSize: "0.8125rem", fontFamily: "system-ui, sans-serif" }}>{qso.summary}</p>
            {scoreSummary}
            {/* Simulation reminder — shown on every completed contact as a calm footer note.
                Muted color (#8A929C on #191C21 = AA for this size) with a faint top border
                to read as a footer, not an alarm. No dismiss state — it cannot be "dismissed
                forever" — which is fine for one calm sentence. */}
            <p style={{ color: "#8A929C", fontSize: "0.8125rem", fontFamily: "system-ui, sans-serif", lineHeight: 1.6, marginTop: 14, marginBottom: 0, paddingTop: 12, borderTop: "1px solid #2E343C" }}>
              {/* Exact approved text — mind the straight quotes around "right" */}
              Remember: this is just a simulation. Every real QSO is a little different — there&apos;s no single &quot;right&quot; way to run a contact. The goal here is simple: enough practice that you&apos;ll have the confidence to get on the air for real. 73!
            </p>
            <button style={{ ...S.btnAmber, marginTop: 10 }} onClick={start}>▶ NEXT CONTACT</button>
          </div>
        );
      })()}

      {log.length > 0 && (
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 8 }}>Contact log</div>
          {log.map((e, i) => (
            <div key={i} style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: e.who === settings.myCall ? "#FFD89B" : "#8FCB9B", marginBottom: 6, wordBreak: "break-all" }}>
              <span style={{ color: "#8A929C" }}>{e.who}:</span> {e.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= LINGO GUIDE ================= */
function LingoGuide({ player, settings }) {
  const [openCat, setOpenCat] = useState("The essentials");
  const say = (t) => player.play(t, { charWpm: settings.charWpm, effWpm: settings.effWpm, freq: settings.freq });
  return (
    <div>
      <div style={S.panel}>
        <p style={{ color: "#C9CDD3", fontSize: "0.875rem", lineHeight: 1.6, fontFamily: "system-ui, sans-serif", margin: 0 }}>
          Morse is more than an alphabet — it's a language with its own grammar, built over a century to say the most with the fewest characters. Tap any term to hear how it sounds on the air.
        </p>
      </div>
      {LINGO.map((group) => (
        <div key={group.cat} style={{ ...S.panel, padding: 0, overflow: "hidden" }}>
          <button
            onClick={() => setOpenCat(openCat === group.cat ? null : group.cat)}
            style={{ ...S.btn, width: "100%", border: "none", borderRadius: 0, textAlign: "left", padding: "14px 16px", display: "flex", justifyContent: "space-between", background: "transparent" }}>
            <span style={{ color: openCat === group.cat ? "#F2A93B" : "#E8E2D6", fontWeight: 700, letterSpacing: 2 }}>{group.cat.toUpperCase()}</span>
            <span style={{ color: "#8A929C" }}>{openCat === group.cat ? "▲" : "▼"} {group.items.length}</span>
          </button>
          {openCat === group.cat && (
            <div style={{ padding: "0 16px 14px" }}>
              <p style={{ color: "#8A929C", fontSize: "0.75rem", fontFamily: "system-ui, sans-serif", marginTop: 0 }}>{group.blurb}</p>
              {group.items.map(([term, meaning]) => (
                <button key={term} onClick={() => say(term)}
                  aria-label={`Hear ${term} in Morse`}
                  style={{ display: "flex", gap: 12, width: "100%", background: "transparent", border: "none", borderBottom: "1px solid #23272D", padding: "9px 0", cursor: "pointer", textAlign: "left", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "ui-monospace, monospace", color: "#FFD89B", fontSize: "1rem", minWidth: 64, letterSpacing: 1 }}>{term} <span style={{ color: "#8A929C", fontSize: "0.6875rem" }}>♪</span></span>
                  <span style={{ color: "#C9CDD3", fontSize: "0.8125rem", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>{meaning}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ================= ON AIR GUIDE ================= */
function WalkLine({ who, text, why, onHear }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ ...S.label, color: who === "YOU" ? "#F2A93B" : "#8FCB9B" }}>{who}</span>
        <button style={{ ...S.btn, padding: "3px 10px", fontSize: "0.6875rem" }}
          aria-label={`Hear this in Morse`} onClick={() => onHear(text)}>♪ HEAR</button>
      </div>
      <div style={{ ...S.display, fontSize: "0.9375rem", letterSpacing: 2, minHeight: 0, padding: "10px 12px" }}>{text}</div>
      <p style={{ color: "#8A929C", fontSize: "0.78125rem", fontFamily: "system-ui, sans-serif", margin: "6px 0 0", lineHeight: 1.55 }}>{why}</p>
    </div>
  );
}

function OnAirGuide({ player, settings }) {
  const [guide, setGuide] = useState("cq");
  const say = (t) => player.play(t, { charWpm: settings.charWpm, effWpm: settings.effWpm, freq: settings.freq });
  // Personalize the teaching scripts to the configured operator
  const sub = (s) => subTokens(s, settings);
  const myCq = sub("CQ CQ CQ DE {ME} {ME} K");

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["cq", "THE CQ"], ["rst", "RST"], ["qso", "FULL QSO"], ["pota", "POTA"], ["dx", "WORK DX"]].map(([v, l]) => (
          <button key={v} onClick={() => { player.stop(); setGuide(v); }}
            style={{ ...S.btn, flex: 1, padding: "8px 4px", fontSize: "0.6875rem", ...(guide === v ? { borderColor: "#F2A93B", color: "#F2A93B", fontWeight: 700 } : {}) }}>
            {l}
          </button>
        ))}
      </div>

      {guide === "cq" && (
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 8 }}>Anatomy of a CQ</div>
          <div style={{ ...S.display, fontSize: 16, letterSpacing: 2, marginBottom: 6 }}>{myCq}</div>
          <button style={{ ...S.btn, marginBottom: 14, fontSize: "0.75rem" }}
            aria-label="Hear the whole CQ call in Morse" onClick={() => say(myCq)}>♪ HEAR THE WHOLE CALL</button>
          {CQ_ANATOMY.map(([seg, why]) => (
            <div key={seg} style={{ display: "flex", gap: 12, borderBottom: "1px solid #23272D", padding: "10px 0", alignItems: "baseline" }}>
              <button onClick={() => say(sub(seg))}
                aria-label={`Hear ${sub(seg)} in Morse`}
                style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "ui-monospace, monospace", color: "#FFD89B", fontSize: "0.9375rem", minWidth: 110, textAlign: "left", padding: 0, letterSpacing: 1 }}>
                {sub(seg)} <span style={{ color: "#8A929C", fontSize: "0.625rem" }}>♪</span>
              </button>
              <span style={{ color: "#C9CDD3", fontSize: "0.8125rem", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>{why}</span>
            </div>
          ))}
          <p style={{ color: "#8A929C", fontSize: "0.75rem", fontFamily: "system-ui, sans-serif", marginBottom: 0, marginTop: 12, lineHeight: 1.6 }}>
            Etiquette: before any CQ, send QRL? and listen. An empty-sounding frequency may be mid-QSO with a station you can't hear.
          </p>
        </div>
      )}

      {guide === "rst" && (
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 8 }}>The RST signal report</div>
          <p style={{ color: "#C9CDD3", fontSize: "0.84375rem", fontFamily: "system-ui, sans-serif", marginTop: 0, lineHeight: 1.6 }}>
            Three digits, one judgment each. <span style={{ color: "#FFD89B" }}>R</span>eadability 1–5: can you make out the words? <span style={{ color: "#FFD89B" }}>S</span>trength 1–9: how loud? <span style={{ color: "#FFD89B" }}>T</span>one 1–9: how clean is the note? (Tone only exists on CW — voice modes use just RS.)
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[["599", "Perfect copy, loud, clean"], ["579", "Solid copy, good signal"], ["559", "Workable but weak"]].map(([r, d]) => (
              <button key={r} onClick={() => say(r)} aria-label={`Hear ${r} in Morse`}
                style={{ ...S.btn, flex: 1, padding: "10px 4px", textAlign: "center" }}>
                <div style={{ fontFamily: "ui-monospace, monospace", color: "#FFD89B", fontSize: "1.125rem" }}>{r} <span style={{ fontSize: "0.625rem", color: "#8A929C" }}>♪</span></div>
                <div style={{ fontSize: "0.625rem", color: "#8A929C", marginTop: 4, fontFamily: "system-ui, sans-serif" }}>{d}</div>
              </button>
            ))}
          </div>
          <p style={{ color: "#8A929C", fontSize: "0.78125rem", fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.6 }}>
            In contests and pileups everyone sends 599 regardless — it's a formality there, and often compressed to cut numbers: <button onClick={() => say("5NN")} aria-label="Hear 5NN in Morse" style={{ background: "transparent", border: "none", color: "#FFD89B", fontFamily: "ui-monospace, monospace", cursor: "pointer", padding: 0, fontSize: "0.8125rem" }}>5NN ♪</button> where 9 becomes N and 0 becomes T. In a ragchew, send the honest number — a true 559 tells the other op something useful about propagation.
          </p>
        </div>
      )}

      {guide === "qso" && (
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 10 }}>A complete QSO, line by line</div>
          {QSO_WALKTHROUGH.map((l) => <WalkLine key={l.text} who={l.who} text={sub(l.text)} why={l.why} onHear={say} />)}
          <p style={{ color: "#8A929C", fontSize: "0.75rem", fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.6 }}>
            This exact pattern is what the QSO tab simulates — when you're ready, go work one.
          </p>
        </div>
      )}

      {guide === "pota" && (
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 10 }}>A POTA hunt, line by line</div>
          {POTA_WALKTHROUGH.map((l) => <WalkLine key={l.text} who={l.who} text={sub(l.text)} why={l.why} onHear={say} />)}
          <p style={{ color: "#8A929C", fontSize: "0.75rem", fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.6 }}>
            Most new CW ops make their first real contact exactly this way — the exchange is short, the script is fixed, and activators are patient. Send ? whenever you need a repeat. Nobody minds.
          </p>
        </div>
      )}

      {guide === "dx" && (
        <div>
          {/* Concept cards — define jargon before the walkthrough uses it */}
          <div style={S.panel}>
            <div style={{ ...S.label, marginBottom: 8 }}>Why CW is the DX mode</div>
            <p style={{ color: "#C9CDD3", fontSize: "0.84375rem", fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.6 }}>
              A CW exchange — callsigns and <button onClick={() => say("5NN")} aria-label="Hear 5NN in Morse" style={{ background: "transparent", border: "none", color: "#FFD89B", fontFamily: "ui-monospace, monospace", cursor: "pointer", padding: 0, fontSize: "0.8125rem" }}>5NN ♪</button> — completes a real contact between two operators who share no spoken language. Morse abbreviations are a shared protocol worldwide. That's why DX and CW belong together, and why this app's skill unlocks the whole world, not just the US.
            </p>
          </div>

          <div style={S.panel}>
            <div style={{ ...S.label, marginBottom: 8 }}>DXCC entities & prefixes</div>
            <p style={{ color: "#C9CDD3", fontSize: "0.84375rem", fontFamily: "system-ui, sans-serif", marginTop: 0, lineHeight: 1.6 }}>
              The ITU allocates a prefix block to each country — that prefix tells you where a station is. <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>VK</span> = Australia, <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>DL</span> = Germany, <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>JA</span> = Japan. The ARRL DXCC list is the DXer's "countries" list — a <em>DXCC entity</em> is a geographic entry that may differ from national borders. Alaska (<span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>KL7</span>), Hawaii (<span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>KH6</span>), and Guantánamo Bay (<span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>KG4</span>) are separate DXCC entities from the lower-48 US.
            </p>
            <p style={{ color: "#8A929C", fontSize: "0.78125rem", fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.6 }}>
              Working DX from your US station needs no special authorization — your existing license covers it. A <em>DXpedition</em> (traveling abroad to transmit) is a different matter — see the LINGO "Operating abroad" category.
            </p>
          </div>

          <div style={S.panel}>
            <div style={{ ...S.label, marginBottom: 8 }}>Zone systems, disambiguated</div>
            <p style={{ color: "#C9CDD3", fontSize: "0.84375rem", fontFamily: "system-ui, sans-serif", marginTop: 0, lineHeight: 1.6 }}>
              Three different zone systems are named alike and confused constantly:
            </p>
            <ul style={{ color: "#C9CDD3", fontSize: "0.84375rem", fontFamily: "system-ui, sans-serif", paddingLeft: 20, lineHeight: 1.8, margin: "0 0 8px" }}>
              <li><span style={{ color: "#FFD89B" }}>3 ITU regions</span> — set band allocations worldwide (the US is Region 2). 40 m CW is allocated in all three.</li>
              {/* Attribution sourced — see the ZONE-SYSTEM ATTRIBUTION comment on LINGO's
                  "CQ zone"/"ITU zone" entries: WAZ is a CQ Magazine award on the 40 CQ zones
                  (cq-amateur-radio.com, cqww.com/cq_waz_list.htm, ARRL LoTW-WAZ); the 90 ITU
                  zones are the IARU HF World Championship exchange (ARRL IARU-HF-Rules.pdf).
                  Pinned by src/test/zone-systems.test.jsx. */}
              <li><span style={{ color: "#FFD89B" }}>40 CQ zones</span> — used in the CQ World Wide contest and the WAZ (Worked All Zones) award. The contiguous US spans zones 3–5.</li>
              <li><span style={{ color: "#FFD89B" }}>90 ITU zones</span> — used in the IARU HF World Championship exchange. Different numbering from the 40 CQ zones.</li>
            </ul>
            <p style={{ color: "#8A929C", fontSize: "0.78125rem", fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.6 }}>
              The DX exchange in the walkthrough below sends the CQ zone — the most common contest zone exchange. "Zone 05" is a common CQ zone for US stations.
            </p>
          </div>

          {/* Worked-example QSO — the complete exchange, line by line */}
          <div style={S.panel}>
            <div style={{ ...S.label, marginBottom: 10 }}>A complete DX contact, line by line</div>
            <p style={{ color: "#8A929C", fontSize: "0.75rem", fontFamily: "system-ui, sans-serif", marginTop: 0, marginBottom: 14, lineHeight: 1.6 }}>
              VK2XX is a real Australian prefix (CQ zone 30 — New South Wales). The whole exchange may take fifteen seconds. That's the DX way.
            </p>
            {DX_WALKTHROUGH.map((l) => <WalkLine key={l.text} who={l.who} text={sub(l.text)} why={l.why} onHear={say} />)}
            <p style={{ color: "#8A929C", fontSize: "0.75rem", fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.6 }}>
              <strong style={{ color: "#C9CDD3" }}>Worked vs confirmed:</strong> you've <em>worked</em> VK2XX — but you haven't <em>confirmed</em> it until you exchange a QSL (LoTW is the modern electronic standard). For DXCC credit, a confirmed QSL is required. This simulator does not log contacts — that would mean recording fake QSOs.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= HISTORY GUIDE ================= */
const HISTORY = [
  {
    era: "1844 — THE WIRE",
    title: "What hath God wrought",
    hear: "WHAT HATH GOD WROUGHT",
    body: "Samuel Morse and Alfred Vail opened America's first telegraph line between Washington and Baltimore with those four words, and distance stopped meaning what it had meant for all of human history. (Tap ♪ to hear the message in today's International code — the original went out in Morse's own American code, a different dialect.) The operators who worked the wires that followed invented almost everything you'll do on the air: the abbreviations, the rhythm, the etiquette, the fraternity. Radio didn't create CW culture — it inherited it from the landline, fully formed.",
  },
  {
    era: "1865 — TWO MORSES",
    title: "The code you're learning isn't Morse's",
    hear: "ES",
    body: "American wire telegraphy used Morse's original code; Europe refined it into the cleaner 'Continental' code, standardized in 1865 — and that International Morse is what radio adopted and what you're learning now. But the old American code left fingerprints: ES, our word for 'and,' is the American Morse ampersand (&) carried straight into radio. And SK, the sign that a contact is over, is the landline numeral 30 — 'the end, no more' — run together until it became its own sound. Newspapers ended wire stories with -30- for the same reason, into living memory.",
  },
  {
    era: "1857 — THE NUMBERS",
    title: "Why 73 means what it means",
    hear: "73",
    body: "Wire operators were paid by speed, so they compressed entire sentences into numbers. The 1857 National Telegraphic Review listed 73 as — no kidding — 'my love to you.' Western Union's standard 92 Code of 1859 cooled it to 'accept my compliments,' and over decades it settled into the 'best regards' we send today. Its sibling 88, 'love and kisses,' survives too. When you send 73 at the end of a QSO, you're using a piece of 1850s operator slang, unbroken, older than the lightbulb.",
  },
  {
    era: "1904 — TO SEA",
    title: "CQ, CQD, and the night everything changed",
    hear: "CQD CQD SOS SOS DE MGY",
    body: "CQ began on the landline as 'all stations' — an address, not a question (the 'seek you' story is folklore; the likelier root is the French sécurité, 'attention'). Marconi carried it to sea in 1904 and bolted a D onto it for distress: CQD, 'all stations — distress.' Germany's cleaner three-dots-three-dashes-three-dots became the international standard in 1906. When Titanic went down in April 1912, her operator Jack Phillips sent both — CQD and SOS, DE MGY — and the world learned in one night that radio operators hold lives in their fists.",
  },
  {
    era: "1912 — A COMMON TONGUE",
    title: "The Q-codes: grammar for strangers",
    hear: "QTH QSB QRZ?",
    body: "Months after Titanic, the nations met in London and built the machinery of modern radio: licensing, SOS made universal, and a list of about forty-five Q-codes so a Japanese ship and a Brazilian shore station could hold a precise conversation with no shared language. QRM, QRN, QSB, QTH, QSL — the codes you learned in THE LINGO are over a century old and still mean exactly what the 1912 delegates wrote down. Every Q-code is both question and answer: QRS? asks 'shall I send slower?' and QRS replies 'send slower.'",
  },
  {
    era: "NOW — WHY IT ENDURES",
    title: "The mode that refused to die",
    hear: "CQ POTA DE {ME}",
    body: "CW should be dead. The U.S. dropped the code requirement for all license classes in 2007, and every prediction said the bands would go quiet. Instead: POTA pileups, SOTA chasers, CW Academy waitlists. The reason is physics plus poetry. A CW signal concentrates all its power into a sliver of bandwidth, so five watts and a wire can cross an ocean that defeats a kilowatt of voice — and the decoder is the human ear, the finest weak-signal processor ever built, which is exactly what you're training in this app. Nobody needs CW anymore. That's precisely why the people who use it love it.",
  },
];

function HistoryGuide({ player, settings }) {
  const say = (t) =>
    player.play(subTokens(t, settings), {
      charWpm: settings.charWpm, effWpm: settings.effWpm, freq: settings.freq,
    });
  return (
    <div>
      <div style={S.panel}>
        <p style={{ color: "#C9CDD3", fontSize: "0.875rem", lineHeight: 1.6, fontFamily: "system-ui, sans-serif", margin: 0 }}>
          Every term in this app has a birthday. The shorthand you're learning is a living artifact — phrases coined by wire operators before the Civil War, carried to sea by Marconi's men, standardized after the Titanic, and still doing their job tonight on 20 meters. Tap ♪ to hear each era's signature in the code itself.
        </p>
      </div>
      {HISTORY.map((h) => (
        <div key={h.era} style={S.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ ...S.label, color: "#F2A93B" }}>{h.era}</span>
            <button style={{ ...S.btn, padding: "3px 10px", fontSize: "0.6875rem" }}
              aria-label={`Hear ${h.hear} in Morse`} onClick={() => say(h.hear)}>♪</button>
          </div>
          <div style={{ fontFamily: "ui-monospace, monospace", color: "#FFD89B", fontSize: "1rem", letterSpacing: 1, marginBottom: 8 }}>{h.title}</div>
          <p style={{ color: "#C9CDD3", fontSize: "0.84375rem", fontFamily: "system-ui, sans-serif", lineHeight: 1.65, margin: 0 }}>{h.body}</p>
        </div>
      ))}
    </div>
  );
}

/* ================= LEARN (KOCH METHOD) ================= */
// LearnTab — Phase 4 rail split.
//
//   isWide  — from the shell's useIsWide(); determines which layout to use.
//   railEl  — the DOM element of the <aside class="wr-rail">; null until the
//             callback ref fires (first paint) or on narrow (aside not mounted).
//             The portal is skipped when railEl is null (first paint or narrow).
//   record  — from useProgress(); called when a drill set ends (BACK or nextLesson).
function LearnTab({ player, settings, isWide, railEl, suppressRail, record }) {
  const [section, setSection] = useState("chars");
  const [lesson, setLesson] = useState(() => store.load("kochLesson", 1)); // lesson n = first n+1 Koch chars
  const [drilling, setDrilling] = useState(false);
  const [history, setHistory] = useState([]); // last 25 results
  const [flash, setFlash] = useState(null); // { ok, char }
  // sessionSummary: ephemeral one-liner shown when the user backs out of a drill.
  // Set on BACK; cleared when a new drill starts.  Never persisted — intentionally
  // ephemeral (see brief: persistent cross-session history is a deferred product decision).
  const [sessionSummary, setSessionSummary] = useState(null);
  // On wide the chart lives in the rail as a reference panel — default it expanded
  // there. On narrow it remains a collapsible panel in main — default collapsed.
  const [showRef, setShowRef] = useState(() => isWide);
  const timerRef = useRef(null);
  const currentRef = useRef(null);
  const lockRef = useRef(false);

  // Persist Koch progress (also restores it after a tab switch, not just a relaunch)
  useEffect(() => { store.save("kochLesson", lesson); }, [lesson]);

  const maxLesson = KOCH.length - 1;
  const pool = KOCH.slice(0, lesson + 1);
  const newChars = lesson === 1 ? [KOCH[0], KOCH[1]] : [KOCH[lesson]];
  const attempts = history.length;
  const accuracy = attempts ? Math.round((history.filter(Boolean).length / attempts) * 100) : 0;
  const ready = isReadyToAdvance(history);

  // Live refs so the keydown handler always sees the current pool and answer
  // function without stale closure. Same pattern as useKeyer's modeRef/swapRef.
  const poolRef = useRef(pool);
  poolRef.current = pool;
  // answerRef.current is assigned below, AFTER `answer` is declared — `answer` is a
  // const, so referencing it up here throws a temporal-dead-zone error that crashes
  // the LearnTab render (blank screen after the splash).
  const answerRef = useRef(null);

  const playChar = (ch) =>
    player.play(ch, { charWpm: settings.charWpm, effWpm: settings.charWpm, freq: settings.freq });

  const nextDrill = () => {
    // Koch weighting: the newest character shows up more often
    const ch = Math.random() < 0.25 ? newChars[newChars.length - 1] : rand(pool);
    currentRef.current = ch;
    timerRef.current = setTimeout(() => playChar(ch), 350);
  };

  const startDrill = () => {
    setHistory([]);
    setFlash(null);
    setSessionSummary(null); // clear any previous session summary
    lockRef.current = false;
    setDrilling(true);
    nextDrill();
  };

  const answer = (ch) => {
    if (!currentRef.current || lockRef.current) return;
    lockRef.current = true;
    const target = currentRef.current;
    const ok = ch === target;
    setFlash({ ok, char: target });
    setHistory((h) => [...h.slice(-24), ok]);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setFlash(null);
      lockRef.current = false;
      if (ok) {
        nextDrill();
      } else {
        // wrong: hear the same character again before moving on
        playChar(target);
      }
    }, ok ? 600 : 1200);
  };
  answerRef.current = answer; // keep the keydown handler's ref pointing at the live answer()

  const nextLesson = () => {
    clearTimeout(timerRef.current);
    lockRef.current = false;
    // Record the completed set before advancing (history is non-empty here
    // because the NEXT LESSON button only appears after ≥20 attempts at 90%).
    if (record && history.length > 0) {
      const correct = history.filter(Boolean).length;
      const pct = Math.round((correct / history.length) * 100);
      record("learn", { t: Date.now(), lesson, attempts: history.length, correct, pct });
    }
    setLesson((l) => Math.min(maxLesson, l + 1));
    setDrilling(false);
    setHistory([]);
    setFlash(null);
    player.stop();
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Keyboard answer handler — active only while drilling.
  // Mirrors clicking an answer-grid button: same guard (lockRef), same call (answer).
  // Uses poolRef/answerRef so the handler never captures stale pool or answer.
  // The inField guard matches the keyer so a lesson-jump input doesn't fire here.
  useEffect(() => {
    if (!drilling) return;
    const inField = (e) => {
      const t = e.target;
      return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
    };
    const onKey = (e) => {
      if (e.repeat || inField(e)) return;
      const ch = e.key.length === 1 ? e.key.toUpperCase() : null;
      if (ch !== null && poolRef.current.includes(ch)) {
        e.preventDefault();
        answerRef.current(ch);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drilling]);

  // optionsJSX — the lesson-setup controls.
  //
  // These always render inline in mainJSX (both wide and narrow). On wide the
  // *chart* moves to the rail (see chartJSX below), while the setup stays in
  // main alongside the drill — that's the arrangement the user found natural:
  // "active learning content in the middle, reference in the rail."
  //
  // IMPORTANT: the drilling flag hides the setup panel while a drill is active.
  // The drill flow (accuracy display, answer grid) stays in mainJSX always.
  const optionsJSX = !drilling && section === "chars" ? (
    <>
      {/* Session summary — shown once after the user backs out of an active drill.
          Ephemeral: stored in component state only, never written to localStorage.
          Cleared when the next drill starts so it never shows a stale result. */}
      {sessionSummary && (
        <div role="status" style={{ background: S.ground.panel, border: "1px solid #2E343C", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontFamily: "system-ui, sans-serif", fontSize: "0.8125rem", color: "#C9CDD3", lineHeight: 1.5 }}>
          {sessionSummary}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span style={S.label}>Lesson {lesson} of {maxLesson}</span>
        <span style={{ display: "flex", gap: 6 }}>
          <button aria-label="Previous lesson" style={{ ...S.btn, padding: "5px 12px", fontSize: "0.8125rem" }} disabled={lesson <= 1}
            onClick={() => { setLesson((l) => Math.max(1, l - 1)); setHistory([]); }}>←</button>
          <button aria-label="Next lesson" style={{ ...S.btn, padding: "5px 12px", fontSize: "0.8125rem" }} disabled={lesson >= maxLesson}
            onClick={() => { setLesson((l) => Math.min(maxLesson, l + 1)); setHistory([]); }}>→</button>
        </span>
      </div>

      {/* C2: jump-to-lesson input + skip-ahead affordance.
          Clearing history on jump mirrors what the arrows do — no special case.
          Clamped to [1, maxLesson] so an out-of-range value is silently
          corrected rather than blowing up downstream. The gentle note about
          Koch method is shown on any jump > 1 step to set honest expectations
          without blocking the user (product decision: note, not confirm). */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ color: "#8A929C", fontSize: "0.75rem", fontFamily: "system-ui, sans-serif", flex: 1 }}>
          Already know some? Skip ahead:
        </span>
        <input
          type="number"
          aria-label="Jump to lesson"
          min={1}
          max={maxLesson}
          value={lesson}
          onChange={(e) => {
            const v = Math.max(1, Math.min(maxLesson, Number(e.target.value) || 1));
            setLesson(v);
            setHistory([]);
          }}
          style={{ ...S.input, width: 62, padding: "6px 10px", fontSize: "0.875rem", textTransform: "none", letterSpacing: 0 }}
        />
      </div>
      <p style={{ color: "#8A929C", fontSize: "0.6875rem", fontFamily: "system-ui, sans-serif", margin: "0 0 10px", lineHeight: 1.5 }}>
        The Koch method assumes you've mastered earlier characters — each lesson builds on the ones before it.
      </p>

      <div style={{ ...S.label, marginBottom: 6 }}>{lesson === 1 ? "Meet your first two characters" : "New character"}</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        {newChars.map((ch) => (
          <button key={ch} onClick={() => playChar(ch)}
            style={{
              flex: 1, background: S.ground.well, border: S.border.amber, borderRadius: S.radius.md,
              padding: "18px 0", cursor: "pointer", textAlign: "center",
            }}>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 40, color: "#FFD89B", lineHeight: 1 }}>{ch}</div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 18, color: "#F2A93B", marginTop: 8, letterSpacing: 2 }}>{glyphs(MORSE[ch])}</div>
            <div style={{ ...S.label, fontSize: 9, marginTop: 8 }}>tap to hear</div>
          </button>
        ))}
      </div>

      <div style={{ ...S.label, marginBottom: 4 }}>Characters in play</div>
      <div style={{ fontFamily: "ui-monospace, monospace", color: "#8A929C", fontSize: 16, letterSpacing: 4, marginBottom: 14, wordBreak: "break-all" }}>
        {pool.join(" ")}
      </div>

      {/* Onboarding nudge: prompt first-timers to tap each character card above
          before starting the drill so they hear the sound before they're tested
          on it.  Short, gray, below the pool list, above the button. */}
      <p style={{ color: "#8A929C", fontSize: "0.75rem", fontFamily: "system-ui, sans-serif", margin: "0 0 10px", lineHeight: 1.5 }}>
        New here? Tap each character card above to hear it before you start the drill.
      </p>

      <button style={{ ...S.btnAmber, width: "100%", padding: "14px 0" }} onClick={startDrill}>▶ START DRILL</button>

      <p style={{ color: "#8A929C", fontSize: "0.75rem", fontFamily: "system-ui, sans-serif", marginBottom: 0, marginTop: 12, lineHeight: 1.6 }}>
        This app uses the Koch method — a training approach where every character plays at full speed ({settings.charWpm} wpm — words per minute, the standard measure of how fast code is sent) from the very first lesson, so your ear learns the rhythm of each letter as a single sound — never as counted dits and dahs. Hit 90% over 20 answers and the next character unlocks.
        {/* M3: canonical one-liner; full Farnsworth explanation lives at the Settings slider */}
        {settings.effWpm < settings.charWpm && (
          <> Farnsworth keeps characters at full speed and stretches the gaps between them — raise effective speed in Settings as you improve.</>
        )}
      </p>
    </>
  ) : null;

  // chartJSX — the full character reference chart.
  //
  // On wide this portals into the rail so it sits alongside the practice area as
  // a persistent reference (expanded by default). On narrow it stays inline in
  // main as a collapsible panel, exactly as before.
  //
  // The chart is always shown during a drill on wide (useful reference), and is
  // only suppressed when Settings takes over the rail (suppressRail).
  const chartJSX = (
    <div style={S.panel}>
      <button style={{ ...S.btn, width: "100%" }} onClick={() => setShowRef((v) => !v)}>
        {showRef ? "▲ HIDE" : "▼ FULL CHARACTER CHART"}
      </button>
      {showRef && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 8, marginTop: 12 }}>
          {Object.keys(MORSE).map((ch) => (
            <button key={ch} onClick={() => playChar(ch)}
              style={{ ...S.btn, padding: "10px 0", textAlign: "center" }}>
              <div style={{ fontSize: 18, color: "#FFD89B" }}>{ch}</div>
              <div style={{ fontSize: "0.6875rem", color: "#F2A93B", marginTop: 3, letterSpacing: 1 }}>{glyphs(MORSE[ch])}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // mainJSX — the sub-nav, the drill flow, and the reference guides.
  //
  // Everything here stays in the main column in both wide and narrow layouts.
  // The sub-nav is content navigation within LEARN, not setup — it belongs in
  // main because LINGO/ON AIR/HISTORY are reading views that want the main column
  // width (design §5). The drill panel stays in main so the keyboard answer handler
  // and the answer grid remain together (no logic change needed).
  //
  // The aria-live regions (accuracy span + drill display) are always in mainJSX —
  // never gated by isWide — so AT sees text changes in both layouts.
  const mainJSX = (
    <>
      {/* Sub-navigation: CHARS / LINGO / ON AIR / HISTORY — always in main */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["chars", "CHARS"], ["lingo", "LINGO"], ["onair", "ON AIR"], ["history", "HISTORY"]].map(([v, l]) => (
          <button key={v} aria-pressed={section === v} onClick={() => { player.stop(); setSection(v); }}
            style={{ ...S.btn, flex: 1, padding: "8px 2px", fontSize: "0.6875rem", ...(section === v ? { borderColor: "#F2A93B", color: "#F2A93B", fontWeight: 700 } : {}) }}>
            {l}
          </button>
        ))}
      </div>

      {section === "lingo" && <LingoGuide player={player} settings={settings} />}
      {section === "onair" && <OnAirGuide player={player} settings={settings} />}
      {section === "history" && <HistoryGuide player={player} settings={settings} />}

      {section === "chars" && (<>
        {/* Setup panel — inline in main on both wide and narrow (chart is in the rail on wide) */}
        {!drilling && <div style={S.panel}>{optionsJSX}</div>}

        {drilling && (
          <div style={S.panel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <span style={S.label}>Lesson {lesson} · {pool.length} chars</span>
              {/* aria-live so the accuracy updates are announced as they change.
                  aria-label gives a natural reading ("90 percent, 18 of 20")
                  instead of the terse "90% · 18/20" the visual text shows. */}
              <span
                aria-live="polite"
                aria-label={`${accuracy} percent, ${attempts} of 20`}
                style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.9375rem", color: ready ? "#8FCB9B" : accuracy >= 90 ? "#F2A93B" : "#8A929C" }}
              >
                {accuracy}% · {attempts}/20
              </span>
            </div>

            {/* aria-live="polite" + aria-atomic: screen reader announces each drill
                result as it flips (correct/incorrect/waiting). "polite" queues
                behind the user's own input rather than interrupting. aria-atomic
                reads the whole region so the full result string is announced. */}
            <div
              aria-live="polite"
              aria-atomic="true"
              style={{ ...S.display, textAlign: "center", fontSize: S.type.display, minHeight: 70, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {flash ? (
                <span style={{ color: flash.ok ? "#8FCB9B" : "#E07A5F" }}>
                  {/* Item 4 (v2.0): correct and wrong both show char + pattern.
                      Previously correct showed only "✓" — that gave no learning
                      reinforcement and depended on color alone for feedback.
                      Now both branches show <mark> <char> <pattern>; only the
                      mark and color differ. Same data already in scope. */}
                  {flash.ok ? `✓  ${flash.char}  ${glyphs(MORSE[flash.char])}` : `✗  ${flash.char}  ${glyphs(MORSE[flash.char])}`}
                </span>
              ) : (
                <span style={{ color: "#8A929C", fontSize: "1rem", letterSpacing: 3 }}>LISTEN...</span>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
              <button style={S.btn} onClick={() => currentRef.current && playChar(currentRef.current)}>↻ REPLAY</button>
              <button style={S.btn} onClick={() => {
                // Capture the session result before clearing state so the summary
                // can be shown on the setup screen.  Only set it when there were
                // attempts — no-op BACK with zero answers produces no summary.
                if (history.length > 0) {
                  const correct = history.filter(Boolean).length;
                  const pct = Math.round((correct / history.length) * 100);
                  setSessionSummary(`You answered ${correct} of ${history.length} correctly — ${pct}% this set.`);
                  // Persist to cross-session progress history (v2.0 §1).
                  // Zero-attempt BACK writes no record — guard matches above.
                  if (record) {
                    record("learn", { t: Date.now(), lesson, attempts: history.length, correct, pct });
                  }
                }
                setDrilling(false);
                player.stop();
                clearTimeout(timerRef.current);
              }}>← BACK</button>
            </div>

            <div style={{ fontSize: "0.875rem", color: "#C9CDD3", fontFamily: "system-ui, sans-serif", marginBottom: 8 }}>Tap or type the letter you heard</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))", gap: 8 }}>
              {pool.map((ch) => (
                <button key={ch} onClick={() => answer(ch)}
                  style={{ ...S.btn, padding: "14px 0", fontSize: 20, textAlign: "center" }}>
                  {ch}
                </button>
              ))}
            </div>

            {ready && (
              <button style={{ ...S.btnAmber, width: "100%", padding: "14px 0", marginTop: 14 }} onClick={nextLesson}>
                ★ 90% SOLID — NEXT LESSON
              </button>
            )}

            {/* C1: cliff panel — shown when the learner has done ≥20 reps but is
                still below 90%. The drill already loops silently; this makes the
                situation legible and names the path forward without adding a
                "drop back" shortcut (product decision: keep drilling). Threshold
                is delegated to isReadyToAdvance so it stays single-sourced. */}
            {attempts >= 20 && !ready && (
              <div style={{ marginTop: 14, padding: "14px 16px", background: "#1A2118", border: "1px solid #3A4A3A", borderRadius: 8 }}>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 22, color: "#F2A93B", marginBottom: 6 }}>
                  {accuracy}%
                </div>
                <p style={{ color: "#C9CDD3", fontSize: "0.8125rem", fontFamily: "system-ui, sans-serif", margin: "0 0 8px", lineHeight: 1.6 }}>
                  Good effort — you're building the pattern. Keep drilling and your rolling accuracy will climb.
                </p>
                <p style={{ color: "#8A929C", fontSize: "0.75rem", fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.6 }}>
                  {accuracy}% over your last set — reach 90% to unlock the next character. Each correct answer shifts the window forward, so a good run now counts right away.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Narrow only: chart stays inline in main as a collapsible panel.
            On wide it portals into the rail (see chartJSX portal below). */}
        {!isWide && chartJSX}
      </>)}
    </>
  );

  return (
    <div>
      {mainJSX}
      {/* Wide: portal the full character chart into the rail. It stays there
          during the drill too (useful reference). Yields to Settings when
          suppressRail is set (Settings takes over the rail exclusively). */}
      {isWide && railEl && !suppressRail && createPortal(chartJSX, railEl)}
    </div>
  );
}

/* ================= PROGRESS VIEW (v2.0 §1) ================= */

// CHART_HEIGHT: pixel height of the bar-chart plot area.
// The 90% mastery line sits at (90/100)*CHART_HEIGHT from the bottom,
// computed once and stored in S.chartLine.bottom.
const CHART_HEIGHT = 72;

// BarTrend — pure CSS flex-of-divs bar chart. No external charting library.
//
// variant="accuracy": bars colored per-bar by value via toneFor(); a dashed
//   green mastery line is overlaid at 90% height.
// variant="speed": single amber bars, no mastery line. maxVal caps the scale.
//
// values: number[] — the series to chart (chronological, oldest-first).
// maxVal: number — the scale maximum for the speed variant (default 40 wpm).
// ariaLabel: string — describes the chart for screen readers (role="img").
//   Should summarize the values and trend direction.
//
// WHY pure CSS: the brief prohibits charting libraries; flex + alignItems:flex-end
// gives bars that grow upward with zero JS layout math. Each bar is flex:1 1 0 so
// it fills the container evenly, capped at 18px so charts don't go wall-to-wall
// on very wide screens.
function BarTrend({ values, variant = "accuracy", maxVal = 40, ariaLabel }) {
  if (!values || values.length === 0) return null;

  const isAccuracy = variant === "accuracy";

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      style={{ ...S.chart, height: CHART_HEIGHT }}
    >
      {values.map((v, i) => {
        const pct = isAccuracy
          ? Math.min(100, Math.max(0, v))
          : Math.min(100, Math.max(0, (v / maxVal) * 100));
        const color = isAccuracy ? toneFor(v) : "#F2A93B"; // accuracy: per-bar tone; speed: always amber
        return (
          <div
            key={i}
            style={{
              flex: "1 1 0",
              maxWidth: 18,
              height: `${pct}%`,
              background: color,
              borderRadius: "2px 2px 0 0",
            }}
          />
        );
      })}
      {/* Mastery line: only for the accuracy variant.
          Absolutely positioned at 90% height so the top of a 90% bar
          meets the line — the visual "you made it" moment. */}
      {isAccuracy && <div style={S.chartLine} aria-hidden="true" />}
    </div>
  );
}

// fmtDate: compact locale-friendly date from epoch ms (e.g. "Jun 24").
// Returns an empty string for a missing or invalid t so callers can skip it
// without crashing on records written before the t field existed.
function fmtDate(t) {
  if (!t) return "";
  try {
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// trendArrow(values) — describes trend direction from the last few values in a series.
// Returns "up", "down", or "flat". Used only for aria-label generation.
function trendArrow(values) {
  if (!values || values.length < 2) return "flat";
  // Compare average of the most-recent half to the earlier half
  const half = Math.ceil(values.length / 2);
  const older = values.slice(0, half);
  const newer = values.slice(half);
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const diff = avg(newer) - avg(older);
  if (diff > 2) return "up";
  if (diff < -2) return "down";
  return "flat";
}

// accuracyAriaLabel(label, values) — generates a readable aria-label for BarTrend.
// Format: "{label} over last {N} sessions: {v1}, {v2}, … percent — trending {dir}"
function accuracyAriaLabel(label, values) {
  if (!values || values.length === 0) return label;
  const dir = trendArrow(values);
  return `${label} over last ${values.length} session${values.length !== 1 ? "s" : ""}: ${values.join(", ")} percent — trending ${dir}`;
}

function ProgressView({ progress }) {
  const learn = learnTrend(progress);
  const { records: keyRecords, wpmSeries } = keyTrend(progress);
  const copyGroups = copyTrend(progress);
  const { records: qsoRecords, copySeries: qsoCopy, sendSeries: qsoSend } = qsoTrend(progress);

  // M4: verdict coloring is now handled by the shared Tag component + VERDICT_COLOR map.

  return (
    <div>
      {/* ---- LEARN section ---- */}
      <div style={S.panel}>
        <div style={{ ...S.label, marginBottom: 10 }}>LEARN — Lesson accuracy</div>
        {learn.length === 0 ? (
          <p style={{ color: "#8A929C", fontSize: "0.8125rem", fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.6 }}>
            No LEARN sessions yet — start a drill and tap BACK to start tracking your accuracy.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {learn.map((row) => (
              <div key={row.lesson} style={{ borderBottom: "1px solid #2E343C", paddingBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <span style={{ fontFamily: "ui-monospace, monospace", color: "#F2A93B", fontSize: "0.875rem" }}>
                    Lesson {row.lesson}
                  </span>
                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "#8A929C" }}>
                    {row.sets} set{row.sets !== 1 ? "s" : ""} · best {row.bestPct}% · last {row.lastPct}%
                    {fmtDate(row.lastT) && <span style={{ marginLeft: 6, color: S.text.dim }}>{fmtDate(row.lastT)}</span>}
                  </span>
                </div>
                <BarTrend
                  variant="accuracy"
                  values={row.recent}
                  ariaLabel={accuracyAriaLabel(`Lesson ${row.lesson} accuracy`, row.recent)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- KEY section ---- */}
      <div style={S.panel}>
        <div style={{ ...S.label, marginBottom: 10 }}>KEY — Fist sessions</div>
        {keyRecords.length === 0 ? (
          <p style={{ color: "#8A929C", fontSize: "0.8125rem", fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.6 }}>
            No KEY sessions yet — send a line and CHECK it to start tracking your fist.
          </p>
        ) : (
          <>
            <div style={{ ...S.label, color: "#8A929C", marginBottom: 4 }}>Est WPM trend</div>
            <BarTrend
              variant="speed"
              values={wpmSeries}
              maxVal={40}
              ariaLabel={`Keying speed over last ${wpmSeries.length} session${wpmSeries.length !== 1 ? "s" : ""}: ${wpmSeries.join(", ")} wpm`}
            />
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "#8A929C", marginBottom: 12, marginTop: 4 }}>
              last: {wpmSeries[wpmSeries.length - 1]} wpm
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {keyRecords.slice().reverse().map((r, i) => (
                <div key={i} style={{ borderBottom: "1px solid #2E343C", paddingBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontFamily: "ui-monospace, monospace", color: "#FFD89B", fontSize: "0.875rem" }}>
                      {r.category} · {r.keyType}
                    </span>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "#8A929C" }}>
                      {r.estWpm} wpm · copy {r.copyPct}%
                      {fmtDate(r.t) && <span style={{ marginLeft: 6, color: S.text.dim }}>{fmtDate(r.t)}</span>}
                    </span>
                  </div>
                  {/* M4: Tag chips — color + text word = non-color cue always present */}
                  <div style={{ display: "flex", gap: 12, marginTop: 3, flexWrap: "wrap" }}>
                    <Tag verdict={r.letterVerdict}>letters: {r.letterVerdict}</Tag>
                    <Tag verdict={r.wordVerdict}>words: {r.wordVerdict}</Tag>
                    {r.weightingVerdict && r.weightingVerdict !== "good" && (
                      <Tag verdict={r.weightingVerdict}>weighting: {r.weightingVerdict}</Tag>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ---- COPY section ---- */}
      <div style={S.panel}>
        <div style={{ ...S.label, marginBottom: 10 }}>COPY — Accuracy by rung</div>
        {copyGroups.length === 0 ? (
          <p style={{ color: "#8A929C", fontSize: "0.8125rem", fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.6 }}>
            No COPY sessions yet — pick a level and CHECK a target to start tracking your accuracy.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {copyGroups.map((g) => (
              <div key={g.source} style={{ borderBottom: "1px solid #2E343C", paddingBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <span style={{ fontFamily: "ui-monospace, monospace", color: "#F2A93B", fontSize: "0.875rem" }}>{g.source}</span>
                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "#8A929C" }}>
                    last {g.lastPct}%
                    {fmtDate(g.lastT) && <span style={{ marginLeft: 6, color: S.text.dim }}>{fmtDate(g.lastT)}</span>}
                  </span>
                </div>
                <BarTrend
                  variant="accuracy"
                  values={g.recent}
                  ariaLabel={accuracyAriaLabel(`${g.source} copy accuracy`, g.recent)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- QSO section ---- */}
      <div style={S.panel}>
        <div style={{ ...S.label, marginBottom: 10 }}>QSO — Contact accuracy</div>
        {qsoRecords.length === 0 ? (
          <p style={{ color: "#8A929C", fontSize: "0.8125rem", fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.6 }}>
            No QSO sessions yet — complete a full contact in the QSO tab to start tracking your accuracy.
          </p>
        ) : (
          <>
            {/* Copy % chart — only when there is copy data */}
            {qsoCopy.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ ...S.label, color: "#8A929C", marginBottom: 4 }}>Copy %</div>
                <BarTrend
                  variant="accuracy"
                  values={qsoCopy}
                  ariaLabel={accuracyAriaLabel("QSO copy accuracy", qsoCopy)}
                />
              </div>
            )}
            {/* Send % chart — only when there is send data */}
            {qsoSend.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ ...S.label, color: "#8A929C", marginBottom: 4 }}>Send %</div>
                <BarTrend
                  variant="accuracy"
                  values={qsoSend}
                  ariaLabel={accuracyAriaLabel("QSO send accuracy", qsoSend)}
                />
              </div>
            )}
            {/* Records list — newest-first */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {qsoRecords.map((r, i) => (
                <div key={i} style={{ borderBottom: "1px solid #2E343C", paddingBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontFamily: "ui-monospace, monospace", color: "#FFD89B", fontSize: "0.875rem" }}>
                      {r.activity} · {r.role} · {r.difficulty}
                    </span>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "#8A929C" }}>
                      {fmtDate(r.t) && <span style={{ color: S.text.dim }}>{fmtDate(r.t)}</span>}
                    </span>
                  </div>
                  <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "#8A929C", marginTop: 3 }}>
                    {r.copyPct !== null && r.copyPct !== undefined
                      ? <span>copy <span style={{ color: toneFor(r.copyPct) }}>{r.copyPct}%</span></span>
                      : <span>copy <span style={{ color: "#5A626C" }}>—</span></span>
                    }
                    <span style={{ margin: "0 8px" }}>·</span>
                    {r.sendPct !== null && r.sendPct !== undefined
                      ? <span>send <span style={{ color: toneFor(r.sendPct) }}>{r.sendPct}%</span></span>
                      : <span>send <span style={{ color: "#5A626C" }}>—</span></span>
                    }
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ================= SETTINGS ================= */
// onClose: optional callback — when provided, a "Done" button is shown that
// invokes it.  Passed on wide layout (where Settings lives in the rail and
// there's no obvious way to close it); omitted on narrow (inline panel, just
// tap the gear again — that's still discoverable because the gear is right there).
function Settings({ settings, setSettings, onClose }) {
  const set = (k) => (v) => setSettings((s) => ({ ...s, [k]: v, ...(k === "charWpm" && s.effWpm > v ? { effWpm: v } : {}) }));
  return (
    <div style={S.panel}>
      {/* Close control — only shown on wide where Settings is in the right rail.
          On narrow the gear button above the settings panel is the toggle. */}
      {onClose && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button
            aria-label="Close settings"
            onClick={onClose}
            style={{ ...S.btn, padding: "5px 14px", fontSize: "0.75rem", color: "#F2A93B", borderColor: "#F2A93B" }}>
            ✕ Done
          </button>
        </div>
      )}

      {/* Speed sliders are divided into two groups:
          LISTENING speeds affect how the app plays Morse for you to copy.
          SENDING speed is your target when keying — only relevant in the KEY tab. */}
      {/* M3: normalize to plain S.label — consistency over 1px size drift */}
      <div style={{ ...S.label, marginBottom: 6 }}>LISTENING SPEED</div>
      <Slider label="Character speed" value={settings.charWpm} min={10} max={40} step={1} suffix=" wpm" onChange={set("charWpm")} />
      <Slider label="Effective speed (Farnsworth)" value={settings.effWpm} min={4} max={settings.charWpm} step={1} suffix=" wpm" onChange={set("effWpm")} />
      {/* C3: Farnsworth gloss at point of use — the deeper paragraph below covers
          the full story; this one-liner is for first-glance context at the slider. */}
      <p style={{ color: "#8A929C", fontSize: "0.6875rem", fontFamily: "system-ui, sans-serif", margin: "-8px 0 16px", lineHeight: 1.5 }}>
        Farnsworth: characters stay at full speed; the pauses between them stretch so you have time to think. Close the gap by raising this toward character speed as you improve.
      </p>

      {/* M3: normalize to plain S.label */}
      <div style={{ ...S.label, marginBottom: 6 }}>SENDING SPEED</div>
      <Slider label="Your keying speed" value={settings.keyWpm} min={8} max={40} step={1} suffix=" wpm" onChange={set("keyWpm")} />
      <Slider label="Sidetone" value={settings.freq} min={400} max={900} step={10} suffix=" Hz" onChange={set("freq")} />
      <div style={{ marginBottom: 14 }}>
        <div style={{ ...S.label, marginBottom: 6 }}>RX filter (band noise voicing)</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["wide", "WIDE"], ["cw", "CW 500"], ["apf", "APF"]].map(([v, l]) => (
            <button key={v} aria-pressed={settings.rxFilter === v} onClick={() => setSettings((s) => ({ ...s, rxFilter: v }))}
              style={{ ...S.btn, flex: 1, padding: "7px 4px", fontSize: "0.6875rem", ...(settings.rxFilter === v ? { borderColor: "#F2A93B", color: "#F2A93B", fontWeight: 700 } : { color: "#8A929C" }) }}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ fontSize: "0.6875rem", color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 6, lineHeight: 1.5 }}>
          How real-life band noise sounds. WIDE is open SSB-width hiss (2.4 kHz). CW 500 is a 500 Hz passband centered on your sidetone — the standard CW filter on most rigs. APF is a narrow ~60 Hz audio peak, the razor-filter sound dedicated CW ops run when digging signals out of the noise. AGC is always on — noise ducks under signals and swells back in the gaps.
        </div>
      </div>
      <div style={{ ...S.label, color: "#F2A93B", marginTop: 4, marginBottom: 8 }}>Your station</div>
      <div style={{ fontSize: "0.6875rem", color: "#8A929C", fontFamily: "system-ui, sans-serif", marginBottom: 10, lineHeight: 1.5 }}>
        These start as an example (W1AW is a well-known example callsign). Set them to your own call, name, and location — they personalize your practice contacts and are saved automatically.
      </div>
      <div>
        <div style={{ ...S.label, marginBottom: 4 }}>Your callsign</div>
        {/* autoCapitalize="characters": on mobile soft keyboards, capitalise every letter.
            Harmless on desktop. Callsign always uppercases via textTransform anyway,
            but autoCapitalize keeps the mobile keyboard in CAPS mode — one fewer tap. */}
        {/* M1: 0.9375rem → S.type.body (0.875rem) — Settings inputs match other buttons */}
        <input style={{ ...S.input, fontSize: S.type.body, padding: "8px 12px" }} value={settings.myCall}
          autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          onChange={(e) => setSettings((s) => ({ ...s, myCall: e.target.value.toUpperCase() }))} />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...S.label, marginBottom: 4 }}>Your name</div>
          <input style={{ ...S.input, fontSize: S.type.body, padding: "8px 12px" }} value={settings.myName}
            autoCapitalize="words" autoCorrect="off" spellCheck={false}
            onChange={(e) => setSettings((s) => ({ ...s, myName: e.target.value.toUpperCase() }))} />
        </div>
        <div style={{ flex: 1.4 }}>
          <div style={{ ...S.label, marginBottom: 4 }}>Your QTH</div>
          <input style={{ ...S.input, fontSize: S.type.body, padding: "8px 12px" }} value={settings.myQth}
            autoCapitalize="words" autoCorrect="off" spellCheck={false}
            onChange={(e) => setSettings((s) => ({ ...s, myQth: e.target.value.toUpperCase() }))} />
        </div>
      </div>
      <div style={{ fontSize: "0.6875rem", color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 4 }}>
        End your QTH with your two-letter state — POTA exchanges send it as your handle.
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <div>
          <div style={S.label}>Cut numbers (contest style)</div>
          <div style={{ fontSize: "0.75rem", color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 2 }}>
            599 → 5NN, 0 → T in QSO exchanges
          </div>
        </div>
        <button
          aria-pressed={settings.cutNumbers}
          onClick={() => setSettings((s) => ({ ...s, cutNumbers: !s.cutNumbers }))}
          style={{ ...S.btn, padding: "8px 14px", ...(settings.cutNumbers ? { borderColor: "#F2A93B", color: "#F2A93B", fontWeight: 700 } : { color: "#8A929C" }) }}>
          {settings.cutNumbers ? "5NN ON" : "599 OFF"}
        </button>
      </div>
      {/* M3: duplicate Farnsworth paragraph removed — the full gloss lives at the slider
          (Farnsworth line above); the in-tab mentions (LEARN/COPY) use the canonical one-liner.
          The no-sound hint keeps its own paragraph. */}
      <p style={{ color: "#8A929C", fontSize: "0.75rem", fontFamily: "system-ui, sans-serif", marginBottom: 0, marginTop: 10 }}>
        No sound? On iPhone, flip the ring/silent switch off silent — silent mode mutes web audio entirely. Then check media volume and tap any play button.
      </p>
      {/* Version display — sourced from package.json at build time via Vite define.
          Low-key, footer of the panel. Falls back to "dev" if the define is absent
          (e.g. a test runner that skips the Vite define step). */}
      {/* H2: version number is minor metadata — bump one step to S.text.faint (3:1, acceptable) */}
      <div style={{ color: S.text.faint, fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace", letterSpacing: 1, marginTop: 14, textAlign: "right" }}>
        v{typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"}
      </div>
    </div>
  );
}

/* ================= SPLASH ================= */
// L3: auto-dismisses after 2800ms so the app never waits indefinitely.
// When auto-fired the onSkip(true) flag tells the parent to skip the WR tone —
// audio autoplay requires a user gesture, so the tone is a bonus when the user
// taps, not a requirement for advancing into the app.
function Splash({ onSkip }) {
  useEffect(() => {
    const t = setTimeout(() => onSkip(true), 2800);
    return () => clearTimeout(t);
    // onSkip is stable (defined once in CWTrainer) — exhaustive-deps lint
    // would include it, but it never changes so the effect fires once only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Enter CW Trainer"
      onClick={() => onSkip(false)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSkip(false); } }}
      style={{
        position: "fixed", inset: 0, zIndex: 50, cursor: "pointer",
        // #14171C is a Splash-local brand gradient stop (between app #0D0F13 and well
        // #080A0D) — deliberately left inline rather than forced into a ground token.
        background: "radial-gradient(ellipse at 50% 40%, #14171C, #080A0D)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}
    >
      {/* H3: splashIn keyframe is defined in the shared <style> block; .wr-splash-in
          applies it here so the @media reduced-motion rule can target the class. */}
      <div className="wr-splash-in" style={{ textAlign: "center" }}>
        {/* H2: ·−− ·−· Morse mark is decorative — keep eyebrowDim (#8A6A33) */}
        <div style={{ fontFamily: "ui-monospace, monospace", color: S.text.eyebrowDim, fontSize: 16, letterSpacing: 6 }}>
          ·−− ·−·
        </div>
        <div style={{ fontFamily: "ui-monospace, monospace", color: "#F2A93B", fontSize: 32, letterSpacing: 9, fontWeight: 700, marginTop: 12, textShadow: "0 0 24px rgba(242,169,59,0.35)" }}>
          WISCO RADIO LABS
        </div>
        <div style={{ fontFamily: "ui-monospace, monospace", color: "#C9CDD3", fontSize: "0.8125rem", letterSpacing: 8, marginTop: 10 }}>
          CW TRAINER
        </div>
        <div style={{ width: 120, height: 1, background: S.text.hairline, margin: "20px auto 0" }} />
        {/* H2: "MADE IN THE DRIFTLESS" carries readable words — bump to S.text.dim */}
        <div style={{ fontFamily: "system-ui, sans-serif", color: S.text.dim, fontSize: S.type.label, letterSpacing: 2, marginTop: 12 }}>
          MADE IN THE DRIFTLESS
        </div>
      </div>
      {/* audio-gesture caveat: tap/Enter/Space skips with tone; auto-dismiss skips silently.
          Text is split into two lines so tests can still find "tap to skip" by exact text. */}
      <div className="wr-splash-in" style={{ position: "absolute", bottom: 28, textAlign: "center", fontFamily: "system-ui, sans-serif", color: "#8A929C", fontSize: S.type.label, letterSpacing: 1, animationDelay: "1.5s" }}>
        <div>tap to skip</div>
        <div style={{ fontSize: S.type.micro, marginTop: 4, opacity: 0.8 }}>tap anywhere to unlock audio</div>
      </div>
    </div>
  );
}

/* ================= RESPONSIVE LAYOUT ================= */

// useIsWide — returns true when the viewport is at least 900px wide.
//
// Why 900px: at that width, the two-pane grid (110px nav + fluid main + 340px
// rail + 24px gap + ~30px side padding) still gives the main column breathing
// room. Below it the single-column layout is the better experience.
//
// Implementation notes:
//   - Initialises from matchMedia().matches so the very first render is correct
//     (no layout flash on load).
//   - One hook instance at the root (CWTrainer); do not call it in each tab —
//     that multiplies listeners and re-renders for no benefit.
//   - Cleans up the listener on unmount (important in tests where many
//     CWTrainer instances are mounted and unmounted).
function useIsWide() {
  // Create the MediaQueryList once (useMemo with empty deps). matchMedia returns
  // the same object for the same query string in real browsers, but being
  // explicit avoids recreating it on every render and keeps the subscription
  // cleanup unambiguous.
  const mq = useMemo(() => window.matchMedia("(min-width: 900px)"), []);
  const [wide, setWide] = useState(mq.matches);
  useEffect(() => {
    const handler = (e) => setWide(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mq]);
  return wide;
}

/* ================= PROGRESS HOOK (v2.0) ================= */
// useProgress — owns the cross-session progress object.
//
// Initialises from store ("progress" key) via migrateProgress, which handles
// null / corrupt / wrong-schema blobs. Persists on every change (same pattern
// as `settings`). Exposes a `record(category, rec)` callback used by LEARN,
// KEY, and COPY to append records without touching the state directly.
//
// Lifted to CWTrainer (the root) so the PROGRESS view can read all three
// categories, and LEARN/KEY/COPY each get only the `record` callback they need.
function useProgress() {
  const [progress, setProgress] = useState(
    () => migrateProgress(store.load("progress", null))
  );

  // Persist whenever progress changes — same effect pattern as `settings`.
  useEffect(() => {
    store.save("progress", progress);
  }, [progress]);

  // record: the single write path. Components call record("key", {...}) and
  // the hook appends via appendProgress (pure, non-mutating).
  const record = useCallback((category, rec) => {
    setProgress((p) => appendProgress(p, category, rec));
  }, []);

  return { progress, record };
}

/* ================= APP ================= */
const DEFAULT_SETTINGS = {
  charWpm: 20,
  effWpm: 8,
  keyWpm: 20,
  freq: 600,
  myCall: "W1AW",
  myName: "PAT",
  myQth: "NEWINGTON CT",
  keyType: "paddle",
  paddleSwap: false,
  cutNumbers: false,
  rxFilter: "cw",
  // Iambic Mode B: false = Mode A (existing behaviour); true = one extra
  // alternating element after both paddles release following a squeeze.
  // Mode B is the default on most modern hardware keyers, but we keep Mode A
  // as the shipped default so existing users' muscle memory is unchanged.
  // Only applies when keyType === "paddle".
  iambicModeB: false,
  // QSO auto-advance: when ON, a 100% grade automatically advances to the next
  // step after QSO_AUTO_ADVANCE_MS — so the operator never has to leave the
  // paddle to click CONTINUE/TRANSMIT on a perfect over. Default OFF so the
  // manual flow is unchanged for users who haven't opted in.
  qsoAutoAdvance: false,
};

export default function CWTrainer() {
  const isWide = useIsWide();
  const [tab, setTab] = useState("learn");
  // railEl tracks the DOM node of the options <aside> so QsoSim can portal its
  // setup controls into it. A callback ref (not useRef) is used here because we
  // need a state update (re-render) when the node first appears — a plain useRef
  // would give the node to QsoSim but not trigger the portal to attach. null on
  // first paint (before the aside mounts); set on the commit that adds the aside.
  const [railEl, setRailEl] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  // When Settings is open on wide it takes over the right rail entirely, so the
  // active tab's options are NOT simultaneously in the rail (only one thing at a
  // time). On narrow there is no rail — Settings renders inline as always.
  const railShowsSettings = isWide && showSettings;
  const [splash, setSplash] = useState(true);
  // Generic placeholder identity — the user sets their own in Settings, and it
  // persists from there. W1AW (the ARRL's station, in Newington CT) is the
  // universally recognized example callsign, so it reads as "change me."
  const [settings, setSettings] = useState(() => {
    const loaded = { ...DEFAULT_SETTINGS, ...store.load("settings", {}) };
    // If BUG is hidden and a prior session persisted keyType:"bug", fall back to
    // "paddle" so the user lands on a working key type. Note: the settings persist
    // effect writes this coerced value back, so the stored "bug" IS overwritten on
    // first load — re-enabling the flag lands on paddle (the user re-selects BUG).
    // Acceptable because BUG never shipped: only local test builds can hold "bug".
    if (!BUG_KEY_ENABLED && loaded.keyType === "bug") loaded.keyType = "paddle";
    // charWpm is authoritative. Re-clamp effWpm to [4, charWpm] at load so a
    // stored blob where effWpm > charWpm (possible if charWpm was lowered via a
    // future path after effWpm was set) doesn't leave the app in an inconsistent
    // state. The Farnsworth slider's max={charWpm} is UI-only; it cannot fix
    // already-stored data. The useEffect below persists the corrected value.
    loaded.effWpm = Math.min(loaded.effWpm, loaded.charWpm);
    loaded.effWpm = Math.max(4, loaded.effWpm);
    return loaded;
  });
  // C4: nudge is visible while the call is still the default W1AW AND the user
  // hasn't dismissed it. Dismissal persists so it shows at most once. Changing
  // the call also satisfies it — we derive visibility rather than storing it.
  const [nudgeDismissed, setNudgeDismissed] = useState(() => store.load("seenCallNudge", false));
  const player = useMorsePlayer();

  // Cross-session progress history (v2.0 §1). Lifted to the root so ProgressView
  // can read all three categories, and LEARN/KEY/COPY each get the record callback.
  const { progress, record } = useProgress();

  // No-persist warning (v2.0 §1.6): shown once per session when localStorage is
  // unavailable. The flag lives only in memory (can't persist when storage is down)
  // so the warning shows at most once per launch — correct, honest behavior.
  const [noPersistDismissed, setNoPersistDismissed] = useState(false);

  // Persist settings whenever they change
  useEffect(() => { store.save("settings", settings); }, [settings]);

  // C4: persist nudge dismissal
  const dismissCallNudge = () => {
    store.save("seenCallNudge", true);
    setNudgeDismissed(true);
  };

  useEffect(() => {
    // Unlock audio on the very first touch/click anywhere — capture phase so it
    // runs before any component handler tries to make sound.
    // L3: the splash auto-dismisses after 2800ms via its own useEffect; the
    // old 5s top-level timeout is removed — the Splash component owns its timer.
    const wake = () => player.unlock();
    window.addEventListener("pointerdown", wake, { capture: true, once: true });
    window.addEventListener("touchend", wake, { capture: true, once: true });
    return () => {
      window.removeEventListener("pointerdown", wake, { capture: true });
      window.removeEventListener("touchend", wake, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs = [
    ["learn", "LEARN"],
    ["key", "KEY"],
    ["copy", "COPY"],
    ["qso", "QSO"],
    // PROGRESS is a review surface (not a practice surface) — last in the list.
    // On narrow this becomes the 5th tab button; noted as acceptable for v2.0
    // desktop target (mobile menu density optimisation is deferred to Capacitor phase).
    ["progress", "PROGRESS"],
  ];

  // Render the splash alone and on top — returned before the app mounts, so no
  // app UI can flash underneath it on launch. Tapping unlocks audio and sends
  // the "WR" (Wisco Radio) signature in Morse; the tap is the gesture that
  // lets the tone play (audio can't autoplay before a user interaction).
  if (splash) {
    return (
      <Splash
        onSkip={(auto) => {
          // When user taps/keys: unlock audio and send the splash signature in Morse —
          // the operator's own callsign once they've set one, else "WR" (Wisco Radio).
          // Sent at the user's saved character speed, tight (effWpm = charWpm: a
          // callsign signature shouldn't have Farnsworth gaps).
          // When auto-dismissed: just advance — the browser blocks audio autoplay
          // without a user gesture, so skip the tone rather than throw an error.
          if (!auto) {
            player.unlock();
            const sig = splashSignature(settings.myCall, DEFAULT_SETTINGS.myCall);
            player.play(sig, { charWpm: settings.charWpm, effWpm: settings.charWpm, freq: settings.freq });
          }
          setSplash(false);
        }}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: S.ground.app, padding: "16px 12px 60px", color: S.text.body }}>
      {/*
        The <style> block is the only injected CSS in the app — established
        precedent for keyframes and focus rings. We extend it with two layout
        rules for the responsive shell:
          .wr-shell   — wide default: three-column grid (nav | main | rail)
          @media      — narrow override: collapses to today's single 560px column
        One class, one media query, no CSS framework.
      */}
      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes splashIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

        /* H3: named classes so the reduced-motion query targets them cleanly */
        /* Cursor blinks by default; steady under reduced motion */
        .wr-cursor { animation: blink 1s steps(1) infinite; }
        /* Splash content fades/slides in by default; appears instantly under reduced motion */
        .wr-splash-in { animation: splashIn 1.1s ease both; }

        /* H3: honor the OS "reduce motion" preference */
        @media (prefers-reduced-motion: reduce) {
          .wr-splash-in { animation: none !important; }
          /* Cursor stays visible and steady — still marks the insertion point */
          .wr-cursor { animation: none !important; opacity: 1 !important; }
        }

        * { -webkit-tap-highlight-color: transparent; }
        button { outline: none; }
        button:focus, [role="button"]:focus { outline: none; }
        /* [role="button"] is included deliberately: the key surfaces (TouchKey /
           PaddleKey / BugKey zones) are focusable role="button" DIVS, so a
           button-only selector left them with NO visible focus ring. That matters
           now that arming break-in MOVES focus onto one of them — a keyboard user
           would otherwise be sent somewhere invisible. */
        button:focus-visible, [role="button"]:focus-visible { outline: 2px solid #F2A93B; outline-offset: 2px; }
        input[type="text"]:focus, input:not([type]):focus { outline: 1px solid #F2A93B; }
        input[type="range"]:focus { outline: none; }
        button:active { transform: translateY(1px); }
        button:disabled { opacity: 0.4; cursor: default; }

        /* Responsive shell — wide (≥900px): three-column grid [nav | main | rail] */
        .wr-shell {
          display: grid;
          grid-template-columns: 110px minmax(0, 1fr) 340px;
          grid-template-rows: auto;
          gap: 0 24px;
          max-width: 1180px;
          margin: 0 auto;
        }
        /* Narrow (<900px): collapse to today's single column.
           minmax(0, 1fr) (not bare 1fr) so the column can shrink below its
           content's min-content — otherwise a long CompactSelect value (e.g.
           "5 — Numbers (incl. cut)") forces the whole grid wider than the phone
           viewport (horizontal scroll). This matches the wide layout, which
           already uses minmax(0, 1fr) for its middle column. */
        @media (max-width: 899px) {
          .wr-shell {
            grid-template-columns: minmax(0, 1fr);
            max-width: 560px;
            gap: 0;
          }
        }

        /* Full-width elements span all three grid columns on wide */
        .wr-full { grid-column: 1 / -1; }

        /*
          Nav rail — wide: left column, stacks buttons vertically.
          Narrow: taken out of grid flow (grid-column:1) and displayed as a
          horizontal flex row, matching today's top tab bar.
        */
        .wr-nav-rail {
          grid-column: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-top: 4px;
          align-items: stretch;
        }
        @media (max-width: 899px) {
          .wr-nav-rail {
            grid-column: 1;
            flex-direction: row;
            padding-top: 0;
            margin-bottom: 14px;
          }
        }

        /* Main content area — wide: middle column; narrow: single column */
        .wr-main { grid-column: 2; }
        @media (max-width: 899px) {
          .wr-main { grid-column: 1; }
        }

        /* Options rail — wide: right column; narrow: not rendered (see JSX) */
        .wr-rail {
          grid-column: 3;
          min-width: 0;
        }
        @media (max-width: 899px) {
          .wr-rail { display: none; }
        }

        /*
          Coffee/support button hover + focus ring.
          Inline styles can't do :hover or :focus-visible, so this class
          carries the stateful rules; everything else is set inline via S tokens.

          Hover: fill with the same #3A2E18 wash S.btnAmber / S.selected use —
          no new color invented, exact reuse.
          Transition: 120ms ease on background-color only; gated by reduced-motion
          so users who prefer no motion get an instant color switch.

          Focus-visible: brighter ring (#FFD89B, the code/readout amber) rather
          than the standard button ring (#F2A93B border color), so the keyboard
          focus ring reads as distinct from the button's own border color.

          Active: deepen the fill slightly; global button:active adds translateY(1px)
          which we must cancel here — a pill-shaped label button should not physically
          "press down" the way a key-surface does.
        */
        .wr-coffee:hover { background-color: #3A2E18; transition: background-color 120ms ease; }
        .wr-coffee:focus-visible { outline: 2px solid #FFD89B; outline-offset: 2px; }
        .wr-coffee:active { background-color: #2A2212; transform: none; }
        @media (prefers-reduced-motion: reduce) {
          .wr-coffee:hover { transition: none; }
        }

        /*
          CompactSelect stateful styles. Inline styles can't do :hover, so the
          pointer-hover tints live here; keyboard state (active/selected) is set
          inline in the component. The trigger's :active press-down is cancelled
          — a menu trigger is not a physical key.
          #303842 is the ONE new literal: a neutral hover tint one step above
          S.btn's #2A313A. Reusing the amber #3A2E18 wash here would read faintly
          "selected", so a neutral gray is the correct tint (flagged to Travis).
        */
        .wr-select-trigger:hover:not(:disabled) { background-color: #303842; }
        .wr-select-trigger:active { transform: none; }
        .wr-select-option:hover { background-color: #2A313A; }
        /* Panel open fade — reduced-motion-gated (matches the .wr-coffee/.wr-splash precedent) */
        @keyframes wrSelectIn { from { opacity: 0 } to { opacity: 1 } }
        .wr-select-panel { animation: wrSelectIn 110ms ease both; }
        @media (prefers-reduced-motion: reduce) { .wr-select-panel { animation: none !important; } }
        /* Attention pulse — a brief amber glow when a control's value changed for an
           external reason (QSO Role auto-reset by an Activity change). Non-color-safe
           is not required here: it augments the polite roleLive announcement, which
           carries the change for AT. Reduced-motion suppresses the animation entirely. */
        @keyframes wrSelectPulse {
          0%   { box-shadow: 0 0 0 0 rgba(242,169,59,0.0); }
          25%  { box-shadow: 0 0 0 3px rgba(242,169,59,0.55); border-color: #F2A93B; }
          100% { box-shadow: 0 0 0 0 rgba(242,169,59,0.0); }
        }
        .wr-select-pulse { animation: wrSelectPulse 900ms ease-out; }
        @media (prefers-reduced-motion: reduce) { .wr-select-pulse { animation: none !important; } }
      `}</style>

      {/*
        .wr-shell is the CSS grid container. On wide it is a three-column grid;
        on narrow it is a single column capped at 560px (today's layout).
        DOM order: header → nav → main → rail → footer. Screen readers reach the
        practice surface (main) before the options rail — matching visual emphasis.
        On wide, CSS grid places the nav visually left regardless of DOM position.
      */}
      <div className="wr-shell">

        {/* Header spans all three columns on wide; naturally full-width on narrow */}
        <header className="wr-full" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            {/* H2: small eyebrow carries readable brand words — bump to eyebrowText (#A8823F) for AA */}
            <div style={{ ...S.label, color: S.text.eyebrowText, letterSpacing: 3 }}>WISCO RADIO LABS</div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 22, letterSpacing: 4, color: "#F2A93B", fontWeight: 700 }}>
              CW TRAINER
            </div>
            <div style={{ ...S.label, marginTop: 2 }}>
              {settings.charWpm} wpm chars · {settings.effWpm} wpm effective · {settings.myCall}
            </div>
          </div>
          {/* Right-side header controls: coffee support link + settings gear.
              Grouped so they share a flex row with consistent vertical alignment.
              Coffee is first (left of gear) so it stays visually distinct from
              the gear's toggle affordance. */}
          <div style={{ display: "flex", alignItems: "center", gap: S.space.sm }}>
            {/*
              Opens the developer's Buy Me a Coffee page in the user's real browser.
              (2.4.0: moved from Venmo to Buy Me a Coffee — a support platform built
              for this, rather than a peer-to-peer payment app.)
              Must be window.open(..., "_blank") — NOT a same-window href — because
              an href would navigate the Electron SPA away from the app.
              The setWindowOpenHandler in electron/main.cjs intercepts _blank opens,
              checks that the scheme is https (allowlisted), and routes to
              shell.openExternal so it lands in the OS default browser, not a new
              Electron window. Works offline: the OS opens the URL independently.
            */}
            <button
              type="button"
              className="wr-coffee"
              aria-label="Support the developer on Buy Me a Coffee — opens in your web browser"
              style={{
                background: "transparent",
                border: S.border.amber,
                color: S.text.amber,
                borderRadius: S.radius.md,
                padding: "8px 12px",
                fontFamily: "ui-monospace, monospace",
                letterSpacing: 1,
                fontSize: S.type.body,
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={() => window.open("https://buymeacoffee.com/wiscoradiolabs", "_blank", "noopener,noreferrer")}
            >
              <span aria-hidden="true" style={{ marginRight: S.space.xs }}>☕</span>Coffee?
            </button>
            <button
              aria-label="Settings"
              aria-expanded={showSettings}
              style={{ ...S.btn, padding: "8px 12px" }}
              onClick={() => { setShowSettings((v) => !v); dismissCallNudge(); }}
            >⚙</button>
          </div>
        </header>

        {/* Settings panel.
            Narrow: inline full-width panel below the header, as before.
            Wide:   portaled into the right rail (see the aside block below).
                    The active tab's options are suppressed from the rail while
                    Settings is open (railShowsSettings → suppressRail on tabs),
                    so only one thing occupies the rail at a time. */}
        {showSettings && !isWide && (
          <div className="wr-full">
            <Settings settings={settings} setSettings={setSettings} />
          </div>
        )}

        {/* C4: one-time W1AW nudge. Shown while the call is still the default
            AND the user hasn't dismissed it (or tapped the gear, which also
            satisfies it). Dismissal persists via store so it shows at most once
            across launches. Changing the call in Settings collapses it via the
            derived condition without requiring explicit dismissal.
            Spans full width in both modes — it's transient and shouldn't be
            trapped in a column. */}
        {/* M4: W1AW nudge routed through Banner — same grounds/borders/padding, no visual change */}
        {settings.myCall === "W1AW" && !nudgeDismissed && (
          <Banner variant="note" onDismiss={dismissCallNudge} dismissLabel="Dismiss callsign notice">
            <strong style={{ color: S.text.bright }}>W1AW is an example callsign</strong> (a well-known example used by default). Tap ⚙ Settings to set your own call, name, and QTH — they'll personalize your practice contacts.
          </Banner>
        )}

        {/*
          Tab navigation.
          Wide (≥900px): .wr-nav-rail places this in the left grid column as a
            vertical stack of buttons — the left nav rail. The aria-pressed
            pattern and the player.stop() on switch are unchanged.
          Narrow (<900px): the CSS collapses .wr-nav-rail to a horizontal row,
            restoring today's top tab bar exactly.
          No role=tablist conversion — that requires roving tabindex + arrow-key
          nav and is explicitly out of scope for this phase (see design §3).
        */}
        {/*
          M2: Practice tabs [LEARN/KEY/COPY/QSO] and the PROGRESS review tab are
          kept in the same nav. On wide, a thin divider + dim resting color tier
          PROGRESS visually as "review, not practice." On narrow, PROGRESS label
          abbreviates to "STATS" so five buttons fit in one scannable row.
          Active state (amber + bold) is unchanged for all tabs.
        */}
        <nav aria-label="Sections" className="wr-nav-rail">
          {tabs.map(([v, l], i) => {
            const isProgress = v === "progress";
            const isActive = tab === v;
            // Narrow label: shorten PROGRESS to STATS so 5 buttons fit at 360px
            const label = isProgress && !isWide ? "STATS" : l;
            return (
              <React.Fragment key={v}>
                {/* M2: thin divider above PROGRESS on wide rail — quiet seam */}
                {isProgress && isWide && (
                  <div style={{ height: 1, background: S.text.hairline, margin: "6px 0" }} />
                )}
                <button
                  aria-pressed={isActive}
                  onClick={() => { player.stop(); setTab(v); }}
                  style={{
                    ...S.btn,
                    // Wide: no flex:1 — stacked vertically, full rail width.
                    // Narrow: flex:1 + reduced padding so five labels don't truncate.
                    ...(isWide ? {} : { flex: 1, padding: "10px 8px", letterSpacing: 0.5 }),
                    // PROGRESS resting state is dim (secondary) — active state is unchanged.
                    ...(isActive ? { ...S.selected } : { color: isProgress ? S.text.dim : undefined }),
                  }}
                >
                  {label}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/*
          Main practice area — middle grid column on wide, full width on narrow.
          DOM order: main comes before the rail so screen readers reach the
          practice surface before the options, matching the visual hierarchy.
          All tab components render here in full for all phases until their
          individual rail splits are done (Phases 2–5).
        */}
        {/* No-persist warning (v2.0 §1.6) — shown once per session when
            localStorage is blocked (private mode / locked sandbox). The banner
            is non-blocking and dismissible. It cannot persist "don't warn again"
            (storage is down), so it shows once per launch — correct and honest. */}
        {/* M4: no-persist warning routed through Banner — same grounds/borders/padding, no visual change */}
        {!store.isPersistent() && !noPersistDismissed && (
          <Banner variant="warning" onDismiss={() => setNoPersistDismissed(true)} dismissLabel="Dismiss storage warning">
            <strong style={{ color: S.text.amber }}>Heads up</strong> — your browser is blocking local storage, so your progress and settings won't be saved between sessions.
          </Banner>
        )}

        <main className="wr-main">
          {tab === "learn" && <LearnTab player={player} settings={settings} isWide={isWide} railEl={railEl} suppressRail={railShowsSettings} record={record} />}
          {tab === "copy" && <CopyTrainer player={player} settings={settings} isWide={isWide} railEl={railEl} suppressRail={railShowsSettings} record={record} />}
          {tab === "key" && <KeyTrainer player={player} settings={settings} setSettings={setSettings} isWide={isWide} railEl={railEl} suppressRail={railShowsSettings} record={record} />}
          {tab === "qso" && <QsoSim player={player} settings={settings} setSettings={setSettings} isWide={isWide} railEl={railEl} suppressRail={railShowsSettings} record={record} />}
          {/* PROGRESS: reading view, full main column. No rail (by design). */}
          {tab === "progress" && <ProgressView progress={progress} />}
        </main>

        {/* Options rail — right grid column on wide, not rendered on narrow.
            The isWide guard keeps it out of the DOM entirely on mobile (CSS
            display:none would still mount it and add DOM noise).
            ref={setRailEl}: a callback ref, not useRef, because we need a state
            update (re-render) when the node first appears — that's what lets
            each tab portal its setup controls into it.
            When Settings is open on wide (railShowsSettings), the Settings
            component is portaled into this same aside, and each tab's options
            are suppressed (suppressRail=true) so only one thing occupies
            the rail at a time. */}
        {isWide && <aside className="wr-rail" aria-label="Options" ref={setRailEl} />}
        {railShowsSettings && railEl && createPortal(
          <Settings settings={settings} setSettings={setSettings} onClose={() => setShowSettings(false)} />,
          railEl
        )}

        {/* Footer spans all three columns on wide; naturally full-width on narrow */}
        <footer className="wr-full" style={{ textAlign: "center", marginTop: 24 }}>
          {/* H2: footer brand text carries words — floor to S.text.dim; tagline → S.text.faint (3:1, understated) */}
          <div style={{ fontFamily: "ui-monospace, monospace", color: S.text.dim, fontSize: "0.6875rem", letterSpacing: 3 }}>
            ·−− ·−·&nbsp;&nbsp;WISCO RADIO LABS
          </div>
          {/* Version rides the EXISTING tagline line — no new row, wordmark untouched.
              It sits at S.text.dim rather than the tagline's faint: H2's rule makes
              faint decorative-only, and a version string someone is meant to read and
              transcribe into a bug report is not decorative. The visible token is
              aria-hidden with an sr-only twin so AT says "Version 2.4.0" instead of
              spelling out "vee two point four point zero". */}
          <div style={{ fontFamily: "system-ui, sans-serif", color: S.text.faint, fontSize: S.type.micro, letterSpacing: 1, marginTop: 4 }}>
            made in the Driftless
            <span aria-hidden="true"> · </span>
            <span aria-hidden="true" style={{ color: S.text.dim }}>
              v{typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"}
            </span>
            <span style={S.srOnly}>
              Version {typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"}
            </span>
          </div>
        </footer>

      </div>
    </div>
  );
}
