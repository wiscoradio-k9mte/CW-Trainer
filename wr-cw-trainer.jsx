import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  MORSE, REV, COMMON_WORDS, QSO_PHRASES, stateOf, subTokens,
  DX_PREFIXES, IOTA_DX_PREFIXES, NAMES, QTHS, RSTS, KOCH, glyphs,
  SUMMITS, IOTA_REFS, randPark, cutNum, rand, randCall, timing, similarity,
  buildRagchew, buildPota, buildSota, buildIota, isReadyToAdvance,
  DRILL_CATEGORIES, ROLE_TERMS, analyzeFist, averageScore,
  toCodes,
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
const store = {
  load(key, fallback) {
    try {
      const v = window.localStorage.getItem("wrcw:" + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return key in memStore ? memStore[key] : fallback;
    }
  },
  save(key, value) {
    try {
      window.localStorage.setItem("wrcw:" + key, JSON.stringify(value));
    } catch {
      memStore[key] = value;
    }
  },
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
    blurb: "Procedure signals that steer the contact. On the air the two letters run together as one sound.",
    items: [
      ["=", "BT — pause / new thought. Hear it between RST, name, and QTH in an exchange"],
      ["+", "AR — end of message, used when first answering a station"],
      ["SK", "End of contact — the QSO is over, usually followed by dit dit"],
      ["BK", "Break — quick turnover without callsigns, like 'over' on voice"],
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
  { who: "ACTIVATOR", text: "CQ POTA CQ POTA DE W9ABC W9ABC US-4361 K", why: "An op in a park, calling for hunters. The US- number is the park reference." },
  { who: "YOU", text: "{ME}", why: "Your call. Once. No DE, no K. You're one voice in a pileup — brevity is the courtesy." },
  { who: "ACTIVATOR", text: "{ME} GM UR 559 559 BK", why: "Your report, twice. BK hands it straight back — no callsign ceremony." },
  { who: "YOU", text: "BK GM UR 599 599 {ST} {ST} BK", why: "BK to accept, greeting, their report, your state twice. That's your whole half." },
  { who: "ACTIVATOR", text: "BK TU {ST} 73 DE W9ABC EE", why: "TU, your state as your handle, 73, dit-dit — and they're listening for the next hunter. Thirty seconds, start to finish." },
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
        strPos++; // advance past the space character in the original string
        return;
      }
      const code = tok.code;
      // Advance strPos: find how many display characters this token consumed.
      // Prosigns are two letters in the display; ordinary tokens are one.
      // We advance to the end of the token in the original string.
      const consumed = Object.keys({ AR: 1, BT: 1, SK: 1, KN: 1 }).some(
        (ps) => upperText.slice(strPos, strPos + 2) === ps
      ) ? 2 : 1;
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

/* ================= KEY DECODER ================= */
function useKeyer({ keyWpm, freq, player, enabled, mode, swap, onError }) {
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

  /* --- straight key: you time the elements --- */
  const downAt = useRef(null);
  const straightDown = useCallback(() => {
    if (!enabledRef.current || downAt.current !== null) return;
    clearGapTimers();
    downAt.current = performance.now();
    player.keyDownTone(freqRef.current);
  }, [player]);
  const straightUp = useCallback(() => {
    if (downAt.current === null) return;
    const now = performance.now();
    const durMs = now - downAt.current;
    downAt.current = null;
    player.keyUpTone();
    const el = durMs < unitRef.current * 2 ? "." : "-";
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
  const memory = useRef(null); // opposite-paddle tap latched mid-element
  const loopTimer = useRef(null);

  const sendNext = useCallback(() => {
    let el = null;
    if (ditHeld.current && dahHeld.current) el = lastEl.current === "." ? "-" : ".";
    else if (memory.current) { el = memory.current; memory.current = null; }
    else if (ditHeld.current) el = ".";
    else if (dahHeld.current) el = "-";
    if (!el) {
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

  const clear = useCallback(() => {
    bufRef.current = "";
    setBuffer("");
    setDecoded("");
    eventsRef.current = [];  // wipe timing record on explicit clear
    lastUpAtRef.current = null;
    paddleLastUpAtRef.current = null;
    clearGapTimers();
    clearTimeout(loopTimer.current);
    sending.current = false;
    memory.current = null;
    ditHeld.current = false;
    dahHeld.current = false;
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
    const dn = (e) => {
      if (e.repeat || inField(e)) return;
      if (modeRef.current === "straight") {
        if (e.code === "Space") { e.preventDefault(); straightDown(); }
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
      // Switching away mid-key must not leave a sidetone ringing or a paddle looping
      clearTimeout(loopTimer.current);
      downAt.current = null;
      sending.current = false;
      player.keyUpTone();
    };
  }, [enabled, straightDown, straightUp, paddleDown, paddleUp, player]);

  // events is the ref array — consumers read eventsRef.current directly.
  // We expose it as a stable object ref so KeyTrainer can pass it to analyzeFist
  // without triggering re-renders.
  return { decoded, buffer, eventsRef, straightDown, straightUp, paddleDown, paddleUp, clear };
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

  useEffect(() => () => clearInterval(intervalRef.current), []);

  return { countdown, start };
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
  display: { background: "#080A0D", border: "1px solid #3A434E", borderRadius: 8, padding: "14px 16px", fontFamily: "ui-monospace, monospace", color: "#FFD89B", fontSize: "1.25rem", letterSpacing: 3, minHeight: 56, wordBreak: "break-all", boxShadow: "inset 0 2px 12px rgba(0,0,0,0.6)" },
  input: { background: "#080A0D", border: "1px solid #3A434E", borderRadius: 8, padding: "12px 14px", fontFamily: "ui-monospace, monospace", color: "#FFD89B", fontSize: "1.125rem", letterSpacing: 2, width: "100%", boxSizing: "border-box", textTransform: "uppercase" },
  // sr-only: visually hidden but reachable by screen readers (clip technique, NOT
  // display:none or aria-hidden — those remove the node from the accessibility tree).
  // Used for always-mounted live regions: the region exists empty when idle and its
  // text is set on the event, so AT sees a *change* and announces it.
  srOnly: { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" },
};

function Display({ children, cursor }) {
  return (
    <div style={S.display}>
      {children}
      {cursor && <span style={{ animation: "blink 1s steps(1) infinite", color: "#F2A93B" }}>▮</span>}
    </div>
  );
}

function TouchKey({ keyDown, keyUp }) {
  // role="button" + tabIndex makes this focusable and announced by AT.
  // Keying is owned by the window keydown handler — do not add a competing
  // handler here (double-fire). The window handler's preventDefault on Space
  // suppresses page scroll even when this div is focused.
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Straight key — press and hold Space, or hold this control, to send"
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); keyDown(); }}
      onPointerUp={(e) => { e.preventDefault(); keyUp(); }}
      onPointerCancel={keyUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        userSelect: "none", touchAction: "none", WebkitUserSelect: "none",
        background: "radial-gradient(ellipse at 50% 30%, #3A3128, #241F18)",
        border: "2px solid #6B5837", borderRadius: 16, padding: "34px 0",
        textAlign: "center", color: "#F2A93B", fontFamily: "ui-monospace, monospace",
        fontSize: 16, letterSpacing: 3, cursor: "pointer", marginTop: 12,
        boxShadow: "0 4px 0 #15110C, inset 0 1px 0 rgba(255,200,120,0.15)",
      }}
    >
      ● KEY ●
      {/* D3: first-timer dit/dah cue — one line, lightweight, gray, ≥12px */}
      <div style={{ fontSize: 12, color: "#8A6A33", marginTop: 6, letterSpacing: 1 }}>short tap = dit · long hold = dah</div>
      <div style={{ fontSize: 11, color: "#5A626C", marginTop: 3, letterSpacing: 1 }}>or use SPACEBAR</div>
    </div>
  );
}

function PaddleKey({ paddleDown, paddleUp, swap }) {
  // role="button" + tabIndex + aria-label make each zone focusable and announced by AT.
  // Keying is owned by the window keydown handler — do not add a competing
  // handler here (double-fire). The aria-label names the keyboard shortcut so a
  // screen-reader user knows how to key from the keyboard, which already works.
  const zone = (el, label, glyph, ariaLabel) => (
    <div
      key={el}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); paddleDown(el); }}
      onPointerUp={(e) => { e.preventDefault(); paddleUp(el); }}
      onPointerCancel={() => paddleUp(el)}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        flex: 1, userSelect: "none", touchAction: "none", WebkitUserSelect: "none",
        background: "radial-gradient(ellipse at 50% 30%, #3A3128, #241F18)",
        border: "2px solid #6B5837", borderRadius: 16, padding: "34px 0",
        textAlign: "center", color: "#F2A93B", fontFamily: "ui-monospace, monospace",
        cursor: "pointer",
        boxShadow: "0 4px 0 #15110C, inset 0 1px 0 rgba(255,200,120,0.15)",
      }}
    >
      <div style={{ fontSize: 26, lineHeight: 1 }}>{glyph}</div>
      <div style={{ fontSize: 14, letterSpacing: 3, marginTop: 6 }}>{label}</div>
      <div style={{ fontSize: 12, color: "#8A6A33", marginTop: 4, letterSpacing: 1 }}>hold to repeat</div>
    </div>
  );
  const dit = zone(".", "DIT", "·", "Dit paddle — press and hold Z or left arrow");
  const dah = zone("-", "DAH", "—", "Dah paddle — press and hold X or right arrow");
  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        {swap ? <>{dah}{dit}</> : <>{dit}{dah}</>}
      </div>
      <div style={{ fontSize: 12, color: "#8A929C", fontFamily: "system-ui, sans-serif", textAlign: "center", marginTop: 8 }}>
        Keyboard: Z / ← is the left zone, X / → the right · squeeze both to alternate
      </div>
    </div>
  );
}

function KeyInput({ keyer, keyType, onKeyType, swap, onSwap }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        {[["paddle", "PADDLE"], ["straight", "STRAIGHT KEY"]].map(([v, l]) => (
          <button key={v} aria-pressed={keyType === v} onClick={() => onKeyType(v)}
            style={{ ...S.btn, flex: 1, padding: "7px 10px", fontSize: 11, ...(keyType === v ? { borderColor: "#F2A93B", color: "#F2A93B" } : { color: "#8A929C" }) }}>
            {l}
          </button>
        ))}
        {keyType === "paddle" && (
          // aria-label is the accessible name; title is visible on hover for sighted users.
          // Screen readers ignore title when aria-label is present, so both serve their audience.
          <button
            onClick={() => onSwap(!swap)}
            title="Swap dit/dah for left-handed keying"
            aria-label={`Swap dit and dah paddles — currently ${swap ? "left-handed" : "right-handed"}`}
            style={{ ...S.btn, padding: "7px 12px", fontSize: 12, color: swap ? "#F2A93B" : "#8A929C", ...(swap ? { borderColor: "#F2A93B" } : {}) }}>
            ⇄ {swap ? "L" : "R"}
          </button>
        )}
      </div>
      {keyType === "paddle"
        ? <PaddleKey paddleDown={keyer.paddleDown} paddleUp={keyer.paddleUp} swap={swap} />
        : <TouchKey keyDown={keyer.straightDown} keyUp={keyer.straightUp} />}
      {keyType === "paddle" && (
        <div style={{ fontSize: 12, color: "#8A929C", fontFamily: "system-ui, sans-serif", textAlign: "center", marginTop: 6 }}>
          ⇄ button swaps which paddle sends dit vs dah — set it to <span style={{ color: "#8A929C" }}>{swap ? "L for left-handed" : "R for right-handed"}</span>
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
        <span style={{ fontFamily: "ui-monospace, monospace", color: "#F2A93B", fontSize: 14 }}>{value}{suffix}</span>
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

/* ================= COPY TRAINER ================= */
// Graduated copy ladder — each rung is a real step up in difficulty, simplest first.
const COPY_LEVELS = [
  ["single", "1 character", "One character at a time. The first rung — just match the sound to the letter."],
  ["pairs", "2-char groups", "Two characters together. Start hearing letters in sequence, not isolation."],
  ["groups", "Letter groups", "Short random groups of 3-4. No meaning to lean on — pure character recognition."],
  ["words", "Ham words", "Real on-air vocabulary — TNX, FER, RST. Words start to arrive as whole sounds."],
  ["calls", "Callsigns", "The hardest everyday copy: random letters and numbers, no rhythm to predict."],
  ["phrases", "QSO phrases", "Full exchange fragments, the way they come over the air."],
];

function CopyTrainer({ player, settings }) {
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
    const pct = Math.round(similarity(target, attempt) * 100);
    const msg = pct >= 90 ? "SOLID COPY" : pct >= 70 ? "GOOD — AGN FOR PRACTICE" : "PSE AGN";
    setResult(pct);
    setRevealed(true);
    setSession((s) => [...s, pct]);
    // Update the always-mounted sr-only region. Because the region is already in the
    // DOM (empty), the AT sees a text change and announces it — the fix for the
    // mount-with-content bug described in design §0.
    setScoreLive(`${pct}% — ${msg}`);
  };

  const avg = session.length ? Math.round(session.reduce((a, b) => a + b, 0) / session.length) : null;

  return (
    <div>
      {/* Always-mounted sr-only live region for score announcements (design §0 / C1).
          Empty when idle; text set by check(). Being pre-mounted means the AT sees
          the text change and speaks it — the mount-with-content pattern never fires. */}
      <div role="status" aria-live="polite" aria-atomic="true" style={S.srOnly}>{scoreLive}</div>

      {!target && (
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 10 }}>Copy practice</div>
          <p style={{ color: "#C9CDD3", fontSize: 14, lineHeight: 1.6, fontFamily: "system-ui, sans-serif", margin: 0 }}>
            This is where the receiving ear gets built. Start at the top of the ladder — a single character — and climb as each rung gets comfortable: pairs, short groups, real words, callsigns, full phrases. Characters always play at full speed; the Farnsworth spacing gives you thinking room between them. Most ops can send faster than they can copy. This tab closes that gap.
          </p>
          <div style={{ background: "#131619", border: "1px solid #2E343C", borderRadius: 8, padding: "10px 12px", marginTop: 12 }}>
            <div style={{ ...S.label, color: "#F2A93B", marginBottom: 4 }}>How to practice</div>
            <p style={{ color: "#C9CDD3", fontSize: 13, lineHeight: 1.6, fontFamily: "system-ui, sans-serif", margin: 0 }}>
              The goal is instant character recognition — hearing each letter as a single sound and knowing it on the spot, without counting dits and dahs or pausing to decode. To build that reflex, keep a pencil and paper handy: listen to the full transmission, write each character by hand the instant you recognize it, then type your answer once playback ends. Writing as you hear trains the immediate sound-to-letter response that fluent copy depends on, and it keeps you from splitting your focus between listening and typing. It's also how copy is done on the air.
            </p>
          </div>
        </div>
      )}

      <div style={S.panel}>
        <div style={{ ...S.label, marginBottom: 8 }}>What to copy — climb as you improve</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {COPY_LEVELS.map(([v, l, desc], i) => (
            <button key={v} aria-pressed={source === v} onClick={() => setSource(v)}
              style={{ ...S.btn, textAlign: "left", padding: "9px 12px", ...(source === v ? { borderColor: "#F2A93B" } : {}) }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#8A929C" }}>{i + 1}</span>
                <span style={{ color: source === v ? "#F2A93B" : "#E8E2D6", fontWeight: 700, fontSize: 13 }}>{l}</span>
              </div>
              {source === v && (
                <div style={{ fontSize: 11.5, color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 4, letterSpacing: 0, lineHeight: 1.5 }}>{desc}</div>
              )}
            </button>
          ))}
        </div>
        <div style={{ ...S.label, marginBottom: 8 }}>Conditions</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[["easy", "EASY"], ["normal", "NORMAL"], ["real", "REAL LIFE"]].map(([v, l]) => (
            <button key={v} aria-pressed={difficulty === v} onClick={() => setDifficulty(v)}
              style={{ ...S.btn, flex: 1, padding: "8px 4px", fontSize: 11, ...(difficulty === v ? { borderColor: "#F2A93B", color: "#F2A93B", fontWeight: 700 } : {}) }}>
              {l}
            </button>
          ))}
        </div>
        {difficulty === "easy" && (
          <div style={{ fontSize: 12, color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 8 }}>
            Text appears letter by letter as it plays — hear it and see it together.
          </div>
        )}
        {difficulty === "real" && (
          <div style={{ marginTop: 12 }}>
            <Slider label="Band noise" value={noise} min={0} max={100} step={1} suffix="%"
              onChange={(v) => { setNoise(v); player.setNoiseLevel(noiseGain(v)); }} />
            <div style={{ fontSize: 12, color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: -6 }}>
              Noise plus QSB fading on every playback — copy through real band conditions.
            </div>
          </div>
        )}
      </div>

      <div style={S.panel}>
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
            <span style={{ ...S.label, fontSize: 10 }}>
              session: <span style={{ color: avg >= 90 ? "#8FCB9B" : "#F2A93B", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{avg}%</span> over {session.length}
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
      </div>
    </div>
  );
}

/* ================= KEY TRAINER ================= */
function KeyTrainer({ player, settings, setSettings }) {
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
  });

  const newTarget = () => {
    const cat = DRILL_CATEGORIES[catIdx];
    const t = cat.gen(settings);
    setTarget(t);
    setResult(null);
    setAnalysis(null);
    keyer.clear();
  };

  const check = () => {
    const pct = Math.round(similarity(target, keyer.decoded) * 100);
    setResult(pct);
    // Analyze fist timing from the events accumulated since the last clear.
    // Read from the ref directly — no re-render needed to compute this.
    const fist = analyzeFist(keyer.eventsRef.current, settings.keyWpm, settings.keyType);
    setAnalysis(fist);

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
  const verdictColor = (v) => v === "good" ? "#8FCB9B" : v === "loose" ? "#F2A93B" : "#E07A5F";
  const verdictLabel = (v) => v === "good" ? "GOOD" : v === "loose" ? "LOOSE" : "TIGHT";

  return (
    <div>
      {/* Always-mounted sr-only live regions (design §0 / C1 + C2).
          Two regions, two purposes:
          - scoreLive: score + fist summary after CHECK (polite, not time-critical)
          - catLive:   category position when the stepper or direct-pick changes (polite)
          Both start empty. Their text is set on the event so the AT sees a change. */}
      <div role="status" aria-live="polite" aria-atomic="true" style={S.srOnly}>{scoreLive}</div>
      <div role="status" aria-live="polite" aria-atomic="true" style={S.srOnly}>{catLive}</div>

      {/* E5: collapsible intro panel. The toggle is always visible when !target so the
          user can re-expand it. Collapsed state persists via the store facade (a UI
          preference, not progress history — within the allowed persistence boundary). */}
      {!target && (
        <div style={S.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: introCollapsed ? 0 : 10 }}>
            <div style={S.label}>Sending practice</div>
            <button
              aria-label={introCollapsed ? "Show intro" : "Hide intro"}
              style={{ ...S.btn, fontSize: 11, padding: "4px 10px", color: "#8A929C" }}
              onClick={() => {
                const next = !introCollapsed;
                setIntroCollapsed(next);
                store.save("introKeyCollapsed", next);
              }}
            >{introCollapsed ? "▸ show intro" : "▾ hide intro"}</button>
          </div>
          {!introCollapsed && (
            <>
              <p style={{ color: "#C9CDD3", fontSize: 14, lineHeight: 1.6, fontFamily: "system-ui, sans-serif", margin: 0 }}>
                Now the other half: the fist. The trainer shows you text, you send it with the paddle or straight key, and the decoder shows exactly what your keying actually says — not what you meant. Watch your spacing especially: clean gaps between letters and words are what make a fist readable on the air.
              </p>
              <div style={{ background: "#131619", border: "1px solid #2E343C", borderRadius: 8, padding: "10px 12px", marginTop: 12 }}>
                <div style={{ ...S.label, color: "#F2A93B", marginBottom: 4 }}>Use the screen, a keyboard, or your own key</div>
                <p style={{ color: "#C9CDD3", fontSize: 13, lineHeight: 1.6, fontFamily: "system-ui, sans-serif", margin: 0 }}>
                  Tap the on-screen key, or use the keyboard: <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>SPACE</span> for a straight key, <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>Z</span> and <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>X</span> (or the arrow keys, or the <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>[</span> / <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>]</span> brackets) for paddle dit and dah. A real key or paddle works too through a USB or Bluetooth adapter that emulates those keystrokes — straight keys on Space, paddles on Z / X, the arrow keys, or the <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>[</span> / <span style={{ color: "#FFD89B", fontFamily: "ui-monospace, monospace" }}>]</span> brackets that VBand-style USB paddle adapters send — on a computer or Android device. Use the dit/dah swap toggle if your levers come out reversed. Made a mistake? Send eight dits in a row — the HH error signal — to wipe it and start over, just like on the air.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- Category selector: stepper + direct-pick row ---- */}
      {/* Ladder order is the DRILL_CATEGORIES array order. No gating — free
          navigation as confirmed: stepper steps and direct-pick both allowed. */}
      <div style={S.panel}>
        <div style={{ ...S.label, marginBottom: 8 }}>Drill category — climb as you improve</div>

        {/* Compact stepper: left arrow / current position label / right arrow.
            pickCat() centralises the "change category" side-effects so the two
            callers (stepper arrows + direct-pick) stay in sync. */}
        {(() => {
          const pickCat = (newIdx) => {
            setCatIdx(newIdx);
            setTarget(""); setResult(null); setAnalysis(null); keyer.clear();
            // Announce to screen readers (C2). The catLive region is always
            // mounted — setting its text here is a change the AT will speak.
            setCatLive(`Category ${newIdx + 1} of ${DRILL_CATEGORIES.length} — ${DRILL_CATEGORIES[newIdx].label}`);
          };
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <button
                  aria-label="Previous category"
                  style={{ ...S.btn, padding: "10px 14px" }}
                  disabled={catIdx === 0}
                  onClick={() => pickCat(Math.max(0, catIdx - 1))}
                >◀</button>
                <span style={{ flex: 1, textAlign: "center", fontFamily: "ui-monospace, monospace", color: "#F2A93B", fontSize: 13, letterSpacing: 1 }}>
                  {catIdx + 1} / {DRILL_CATEGORIES.length} — {DRILL_CATEGORIES[catIdx].label}
                </span>
                <button
                  aria-label="Next category"
                  style={{ ...S.btn, padding: "10px 14px" }}
                  disabled={catIdx === DRILL_CATEGORIES.length - 1}
                  onClick={() => pickCat(Math.min(DRILL_CATEGORIES.length - 1, catIdx + 1))}
                >▶</button>
              </div>

              {/* Direct-pick row: toggle buttons, one per category, amber border on active */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {DRILL_CATEGORIES.map((cat, i) => (
                  <button
                    key={cat.id}
                    aria-pressed={catIdx === i}
                    onClick={() => pickCat(i)}
                    style={{
                      // E1: pad to ≥40px effective touch target (was 6px 10px — too small on mobile)
                      ...S.btn, padding: "10px 12px", fontSize: 11,
                      ...(catIdx === i ? { borderColor: "#F2A93B", color: "#F2A93B", fontWeight: 700 } : { color: "#8A929C" }),
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </>
          );
        })()}
      </div>

      {/* ---- Target text panel ---- */}
      <div style={S.panel}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button style={S.btnAmber} onClick={newTarget}>▶ NEW TEXT</button>
          <button style={S.btn} onClick={() => target && player.play(target, { charWpm: settings.charWpm, effWpm: settings.effWpm, freq: settings.freq })}>
            🔊 HEAR IT
          </button>
          <button style={S.btn} onClick={() => { keyer.clear(); setResult(null); setAnalysis(null); }}>✕ CLEAR</button>
        </div>
        <div style={{ ...S.label, marginBottom: 6 }}>Send this</div>
        <Display>{target || "press NEW TEXT"}</Display>
      </div>

      {/* ---- Keying panel: decoded output + key input + CHECK ---- */}
      <div style={S.panel}>
        <div style={{ ...S.label, marginBottom: 6 }}>
          Decoded from your key <span style={{ color: "#F2A93B" }}>{keyer.buffer}</span>
        </div>
        <Display cursor>{keyer.decoded}</Display>
        {errFlash && (
          <div style={{ fontFamily: "ui-monospace, monospace", color: "#F2A93B", fontSize: 13, letterSpacing: 1, marginTop: 8 }}>
            ◉ HH — ERROR SIGNAL, CLEARED
          </div>
        )}
        <KeyInput keyer={keyer} keyType={settings.keyType} onKeyType={(v) => setSettings((s) => ({ ...s, keyType: v }))} swap={settings.paddleSwap} onSwap={(v) => setSettings((s) => ({ ...s, paddleSwap: v }))} />
        <div style={{ marginTop: 12 }}>
          <button style={S.btnAmber} onClick={check} disabled={!target}>CHECK</button>
        </div>

        {/* ---- Results: CharDiff + Score + Fist panel ---- */}
        {result !== null && (
          <div style={{ marginTop: 12 }}>
            <CharDiff target={target} attempt={keyer.decoded} />
            <Score pct={result} />

            {/* Fist feedback panel — only shown when there is meaningful data.
                Verdicts are estimates; "straight" mode only gets element spacing
                since the paddle machine-times those gaps. */}
            {analysis && analysis.elements > 0 && (
              <div
                aria-hidden="true"
                style={{ marginTop: 14, background: "#131619", border: "1px solid #2E343C", borderRadius: 8, padding: "12px 14px" }}
              >
                {/* aria-hidden: announcement comes from the always-mounted scoreLive region
                    above. The scoreLive text includes the fist summary in plain English so
                    the screen-reader user gets the full verdict without reading visual ratios. */}
                {/* D2: gloss "fist" and explain the timing unit "u" at point of use */}
                <div style={{ ...S.label, color: "#8A929C", marginBottom: 2 }}>
                  Fist feedback
                </div>
                <div style={{ fontSize: 12, color: "#5A626C", fontFamily: "system-ui, sans-serif", marginBottom: 8, lineHeight: 1.5 }}>
                  Your <em>fist</em> — how your timing reads to another operator.
                  Spacing ratios are in units of <strong style={{ color: "#8A929C" }}>u</strong> (u = one dit length).
                </div>

                {/* Estimated WPM vs target (B2) */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span style={{ fontFamily: "system-ui, sans-serif", color: "#C9CDD3", fontSize: 13 }}>
                    Estimated speed
                  </span>
                  <span style={{ fontFamily: "ui-monospace, monospace", color: "#F2A93B", fontSize: 16, letterSpacing: 1 }}>
                    ~{analysis.estWpm} wpm
                  </span>
                </div>
                {/* B2: WPM delta vs configured key speed — only shown when sample is large enough */}
                {analysis.lowSample ? (
                  <div style={{ fontSize: 12, color: "#5A626C", fontFamily: "system-ui, sans-serif", marginBottom: 8 }}>
                    Send a full line for a reliable estimate.
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <span style={{ fontFamily: "system-ui, sans-serif", color: "#8A929C", fontSize: 12 }}>
                      vs target ({settings.keyWpm} wpm)
                    </span>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 700,
                      color: analysis.wpmVerdict === "on target" ? "#8FCB9B" : "#F2A93B", letterSpacing: 1 }}>
                      {analysis.wpmVerdict === "on target"
                        ? "on target"
                        : `${analysis.wpmDelta > 0 ? "+" : ""}${analysis.wpmDelta} (${analysis.wpmVerdict})`}
                    </span>
                  </div>
                )}

                {/* Spacing verdicts — three rows */}
                {[
                  // Element spacing only meaningful for straight key
                  ...(settings.keyType === "straight"
                    ? [["Element gaps", "between elements (ideal 1u)", analysis.spacing.element]]
                    : []),
                  ["Letter gaps", "between letters (ideal 3u)", analysis.spacing.character],
                  ["Word gaps", "between words (ideal 7u)", analysis.spacing.word],
                ].map(([label, sub, sp]) => (
                  sp.ratio !== null && (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontFamily: "system-ui, sans-serif", color: "#8A929C", fontSize: 12 }}>
                        {label}
                        <span style={{ fontSize: 12, display: "block" }}>{sub}</span>
                      </span>
                      <span style={{
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 13,
                        fontWeight: 700,
                        color: verdictColor(sp.verdict),
                        letterSpacing: 1,
                      }}>
                        {verdictLabel(sp.verdict)}
                        {sp.ratio !== null && (
                          <span style={{ fontWeight: 400, fontSize: 12, color: "#8A929C", marginLeft: 6 }}>
                            {sp.ratio.toFixed(1)}u
                          </span>
                        )}
                      </span>
                    </div>
                  )
                ))}

                {/* B3: dah weighting — straight key only; suppressed for paddle */}
                {settings.keyType === "straight" && analysis.weighting.ratio !== null && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontFamily: "system-ui, sans-serif", color: "#8A929C", fontSize: 12 }}>
                      Dah length
                      <span style={{ fontSize: 12, display: "block" }}>dahs vs 3× dit (ideal 3u)</span>
                    </span>
                    <span style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 13,
                      fontWeight: 700,
                      color: verdictColor(analysis.weighting.verdict),
                      letterSpacing: 1,
                    }}>
                      {verdictLabel(analysis.weighting.verdict)}
                      <span style={{ fontWeight: 400, fontSize: 12, color: "#8A929C", marginLeft: 6 }}>
                        {analysis.weighting.ratio.toFixed(1)}u
                      </span>
                    </span>
                  </div>
                )}

                {/* Notes from the analyzer — plain-English feedback strings */}
                {analysis.notes.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#8A929C", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
                    {analysis.notes.map((n, i) => <div key={i}>· {n}</div>)}
                  </div>
                )}

                {settings.keyType === "paddle" && (
                  <div style={{ fontSize: 12, color: "#5A626C", fontFamily: "system-ui, sans-serif", marginTop: 8 }}>
                    Element spacing is machine-timed in paddle mode — spacing feedback covers letter and word gaps only.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
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
};

// Display labels for activities shown in the setup panel.
const ACTIVITY_LABELS = {
  ragchew: "Ragchew",
  pota:    "POTA",
  sota:    "SOTA",
  iota:    "IOTA",
};

// D1: one-liner description for each activity, shown as a sub-line under the label.
// Mirrors the pattern already used by the Conditions buttons (label + gray desc).
const ACTIVITY_DESCS = {
  ragchew: "casual back-and-forth — names, QTH, rig",
  pota:    "Parks on the Air",
  sota:    "Summits on the Air",
  iota:    "Islands on the Air",
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
    hunter:    "you call the activator and give a report",
  },
  sota: {
    activator: "you're on the summit — you call CQ and run the pile",
    chaser:    "you call the activator and give a report",
  },
  iota: {
    activator: "you're on the island — you call CQ and run the pile",
    chaser:    "you call the activator and give a report",
  },
};

function QsoSim({ player, settings, setSettings }) {
  // Activity and role menus (Phase 2/3).
  // Defaults: ragchew + answering role so the first-run experience is the
  // same as the old random behavior (which also skewed toward answering).
  const [activity, setActivity] = useState("ragchew");
  const [role, setRole] = useState("answer");

  const [qso, setQso] = useState(null);
  const [step, setStep] = useState(0);
  const [copyAttempt, setCopyAttempt] = useState("");
  const [copyResult, setCopyResult] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [log, setLog] = useState([]);
  const [fillMsg, setFillMsg] = useState(null);
  const fillTimer = useRef(null);
  const { countdown, start: startCountdown } = useCountdown();

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

  // Phase 4 (B4) — per-conversation score accumulation for averageScore().
  // We accumulate copy % and send % across every graded step in a contact so
  // the done panel can show an aggregate. Arrays reset on start() / new contact.
  // Never persisted across sessions — deliberate: persistent history is a
  // separate open product decision (see brief).
  const [copyScores, setCopyScores] = useState([]);
  const [sendScores, setSendScores] = useState([]);

  const showFill = (msg) => {
    setFillMsg(msg);
    clearTimeout(fillTimer.current);
    fillTimer.current = setTimeout(() => setFillMsg(null), 4000);
  };

  const keyer = useKeyer({
    keyWpm: settings.keyWpm,
    freq: settings.freq,
    player,
    enabled: !!qso && step < qso.steps.length,
    mode: settings.keyType,
    swap: settings.paddleSwap,
    onError: () => { setSendResult(null); showFill("HH — error signal, cleared"); },
  });

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

  const start = () => {
    const builder = ACTIVITY_BUILDERS[activity];
    const profile = {
      myCall: settings.myCall,
      myName: settings.myName,
      myQth:  settings.myQth,
      cut:    settings.cutNumbers,
    };
    const q = builder(profile, role);

    setQso(q); setStep(0); setLog([]);
    setCopyAttempt(""); setCopyResult(null); setRevealed(false); setSendResult(null);
    setLiveText("");
    setFillMsg(null);
    keyer.clear();
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

  const cur = qso?.steps[step];

  const advance = (entry) => {
    setLog((l) => [...l, entry]);
    const next = step + 1;
    setCopyAttempt(""); setCopyResult(null); setRevealed(false); setSendResult(null);
    setLiveText("");
    setFillMsg(null);
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
    }
  };

  // Don't leave the fill-message timer running after unmount
  useEffect(() => () => clearTimeout(fillTimer.current), []);

  const checkCopy = () => {
    const pct = Math.round(similarity(cur.text, copyAttempt) * 100);
    const verdict = pct >= 90 ? "SOLID COPY" : pct >= 70 ? "GOOD — AGN FOR PRACTICE" : "PSE AGN";
    setCopyResult(pct);
    setRevealed(true);
    // Accumulate for per-conversation aggregate (B4)
    setCopyScores((prev) => [...prev, pct]);
    // Announce to AT via the always-mounted resultLive region (design §0).
    // Score is aria-hidden; this is the only AT path for the copy result.
    setResultLive(`Copy: ${pct}% — ${verdict}`);
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
    const sent = keyer.decoded.toUpperCase();
    const sim = Math.round(similarity(cur.suggested, sent) * 100);
    const flat = sent.replace(/\s+/g, "");
    // Report tokens count in either form: 599 ↔ 5NN, 0 ↔ T
    const forms = (m) =>
      /^[0-9NT]+$/.test(m)
        ? [m, m.replace(/9/g, "N").replace(/0/g, "T"), m.replace(/N/g, "9").replace(/T/g, "0")]
        : [m];
    const hits = cur.mustContain.filter((m) =>
      forms(m).some((v) => flat.includes(v.replace(/\s+/g, "")))
    );
    setSendResult({ sim, hits, need: cur.mustContain });
    // Accumulate for per-conversation aggregate (B4)
    setSendScores((prev) => [...prev, sim]);
    // Announce to AT via the always-mounted resultLive region (design §0).
    // Score is aria-hidden and the mustContain checklist is color + glyph only —
    // this is the only AT path for both the send score and the hit/missing tokens.
    const verdict = sim >= 90 ? "SOLID COPY" : sim >= 70 ? "GOOD — AGN FOR PRACTICE" : "PSE AGN";
    const missing = cur.mustContain.filter((m) => !hits.includes(m));
    let liveMsg = `Send: ${sim}% — ${verdict}. Sent: ${hits.length > 0 ? hits.join(", ") : "none"}`;
    if (missing.length > 0) liveMsg += `; missing: ${missing.join(", ")}`;
    liveMsg += ".";
    setResultLive(liveMsg);
  };

  const done = qso && step >= qso.steps.length;

  return (
    <div>
      {/* Always-mounted sr-only live regions (design §0 / C1).
          These must NOT be inside conditional blocks — they need to be in the DOM
          continuously so that text changes (set on events) are announced by AT.
          - stepLive:   step transitions in the normal QSO loop (polite)
          - resultLive: copy/send score + verdict after CHECK COPY / CHECK TRANSMISSION (polite) */}
      <div role="status" aria-live="polite"   aria-atomic="true" style={S.srOnly}>{stepLive}</div>
      <div role="status" aria-live="polite"   aria-atomic="true" style={S.srOnly}>{resultLive}</div>

      {!qso && (
        <div style={S.panel}>
          {/* E5: collapsible intro — same pattern as KeyTrainer. Toggle persists via store. */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: introQsoCollapsed ? 10 : 0 }}>
            <div style={S.label}>Simulated contact</div>
            <button
              aria-label={introQsoCollapsed ? "Show intro" : "Hide intro"}
              style={{ ...S.btn, fontSize: 11, padding: "4px 10px", color: "#8A929C" }}
              onClick={() => {
                const next = !introQsoCollapsed;
                setIntroQsoCollapsed(next);
                store.save("introQsoCollapsed", next);
              }}
            >{introQsoCollapsed ? "▸ show intro" : "▾ hide intro"}</button>
          </div>
          {!introQsoCollapsed && (
            <p style={{ color: "#C9CDD3", fontSize: 14, lineHeight: 1.6, fontFamily: "system-ui, sans-serif", marginTop: 8, marginBottom: 0 }}>
              Pick your activity and role, then work the full exchange — CQ, RST, name, QTH — through to the sign-off. On each over you can check your copy before continuing, or just answer the way you would on the air.
            </p>
          )}

          {/* Activity selector — D1: each button shows a description sub-line matching
              the Conditions-button pattern ([value, label, desc] rendered left-aligned) */}
          <div style={{ ...S.label, marginBottom: 8 }}>Activity</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {Object.entries(ACTIVITY_LABELS).map(([v, l]) => (
              <button
                key={v}
                aria-pressed={activity === v}
                onClick={() => {
                  setActivity(v);
                  // Reset role to the default answering role for this activity
                  setRole(ROLE_TERMS[v][1][0]);
                }}
                style={{
                  ...S.btn, textAlign: "left", padding: "10px 14px",
                  ...(activity === v ? { borderColor: "#F2A93B" } : {}),
                }}
              >
                <span style={{ color: activity === v ? "#F2A93B" : "#E8E2D6", fontWeight: 700, fontSize: 12 }}>{l}</span>
                <div style={{ fontSize: 12, color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 3, letterSpacing: 0 }}>{ACTIVITY_DESCS[v]}</div>
              </button>
            ))}
          </div>

          {/* Role selector — D1: same description pattern; labels are program-correct per activity */}
          <div style={{ ...S.label, marginBottom: 8 }}>Role</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {ROLE_TERMS[activity].map(([v, l]) => (
              <button
                key={v}
                aria-pressed={role === v}
                onClick={() => setRole(v)}
                style={{
                  ...S.btn, textAlign: "left", padding: "10px 14px",
                  ...(role === v ? { borderColor: "#F2A93B" } : {}),
                }}
              >
                <span style={{ color: role === v ? "#F2A93B" : "#E8E2D6", fontWeight: 700, fontSize: 12 }}>{l}</span>
                <div style={{ fontSize: 12, color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 3, letterSpacing: 0 }}>{ROLE_DESCS[activity][v]}</div>
              </button>
            ))}
          </div>

          {/* Difficulty selector.
              Internal values ("easy", "normal", "real") are unchanged — the QSB/noise
              conditionals throughout this component test `difficulty === "real"`.
              Only the display label for "real" is changed to "Real life". */}
          <div style={{ ...S.label, marginBottom: 8 }}>Conditions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {[
              ["easy",   "EASY",      "Text appears letter by letter as it's sent — hear it and see it together."],
              ["normal", "NORMAL",    "Clean signal, no help. Copy by ear, check yourself, then continue."],
              ["real",   "REAL LIFE", "Band noise at your comfort level, and the signal fades up and down like real HF. QSB is the teacher here."],
            ].map(([v, l, desc]) => (
              <button key={v} aria-pressed={difficulty === v} onClick={() => setDifficulty(v)}
                style={{ ...S.btn, textAlign: "left", padding: "10px 14px", ...(difficulty === v ? { borderColor: "#F2A93B" } : {}) }}>
                <span style={{ color: difficulty === v ? "#F2A93B" : "#E8E2D6", fontWeight: 700 }}>{l}</span>
                <div style={{ fontSize: 12, color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 3, letterSpacing: 0 }}>{desc}</div>
              </button>
            ))}
          </div>
          {difficulty === "real" && (
            <div style={{ marginBottom: 6 }}>
              <Slider label="Band noise" value={noise} min={0} max={100} step={1} suffix="%"
                onChange={(v) => { setNoise(v); player.setNoiseLevel(noiseGain(v)); }} />
              <div style={{ fontSize: 12, color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: -6, marginBottom: 12 }}>
                Adjustable any time during the contact — find the edge of your comfort and sit just past it.
              </div>
            </div>
          )}

          {/* Start button — label adapts: activator starts by calling CQ */}
          <button style={S.btnAmber} onClick={start}>
            {role === "activator" || role === "call" ? "📻 CALL CQ" : "📻 LISTEN FOR CQ"}
          </button>
        </div>
      )}

      {qso && !done && cur && cur.who === "dx" && (
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 8 }}>
            {difficulty === "easy"
              ? <>◉ {qso.dx} is sending — <span style={{ color: "#F2A93B" }}>{qso.flavor}</span> — step {step + 1} of {qso.steps.length}</>
              : <>◉ Receiving — step {step + 1} of {qso.steps.length}</>}
            {difficulty === "real" && <span style={{ color: "#E07A5F", marginLeft: 8 }}>QSB</span>}
          </div>
          {difficulty !== "real" && (
            <p style={{ color: "#8A929C", fontSize: 13, fontFamily: "system-ui, sans-serif", marginTop: 0 }}>{cur.copyHint}</p>
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

          <div style={{ background: "#131619", border: "1px solid #2E343C", borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ ...S.label, marginBottom: 6 }}>
              Break in with your key <span style={{ color: "#F2A93B" }}>{keyer.buffer}</span>
            </div>
            <Display>{keyer.decoded}</Display>
            {fillMsg && (
              <div style={{ fontFamily: "ui-monospace, monospace", color: "#8FCB9B", fontSize: 13, letterSpacing: 1, marginTop: 8 }}>
                ◉ {fillMsg}
              </div>
            )}
            <KeyInput keyer={keyer} keyType={settings.keyType} onKeyType={(v) => setSettings((s) => ({ ...s, keyType: v }))} swap={settings.paddleSwap} onSwap={(v) => setSettings((s) => ({ ...s, paddleSwap: v }))} />
            <div style={{ fontSize: 12, color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 8, lineHeight: 1.6 }}>
              <span style={{ color: "#8A929C" }}>?</span> or <span style={{ color: "#8A929C" }}>AGN</span> — repeat the whole transmission · partial call + <span style={{ color: "#8A929C" }}>?</span> (NM0?) — they confirm their full call · <span style={{ color: "#8A929C" }}>QRS</span> — slower please
            </div>
          </div>

          {difficulty === "easy" ? (
            <button style={S.btnAmber} onClick={() => advance({ who: qso.dx, text: cur.text })}>CONTINUE →</button>
          ) : (
            <>
              <div style={{ ...S.label, marginBottom: 6 }}>Your copy (optional — check it or just answer)</div>
              <input style={S.input} value={copyAttempt} onChange={(e) => setCopyAttempt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") checkCopy(); }}
                placeholder="type what you hear..." autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button style={S.btn} onClick={checkCopy} disabled={!copyAttempt.trim()}>CHECK COPY</button>
                <button style={S.btn} onClick={() => setRevealed(true)}>👁 REVEAL</button>
                <button style={S.btnAmber} onClick={() => advance({ who: qso.dx, text: cur.text })}>CONTINUE →</button>
              </div>
              {revealed && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ ...S.label, marginBottom: 6 }}>Sent</div>
                  {copyResult !== null ? <CharDiff target={cur.text} attempt={copyAttempt} /> : <Display>{cur.text}</Display>}
                  {copyResult !== null && <Score pct={copyResult} />}
                </div>
              )}
            </>
          )}
          {/* E4: abandon mid-contact — returns to setup without finishing the exchange */}
          <div style={{ marginTop: 12, borderTop: "1px solid #2E343C", paddingTop: 10 }}>
            <button
              aria-label="Abandon this contact and return to setup"
              style={{ ...S.btn, color: "#5A626C", fontSize: 11 }}
              onClick={() => { player.stop(); setQso(null); keyer.clear(); }}
            >✕ ABANDON CONTACT / back to setup</button>
          </div>
        </div>
      )}

      {qso && !done && cur && cur.who === "you" && (
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 8 }}>
            ◉ Your turn — step {step + 1} of {qso.steps.length}
          </div>
          <p style={{ color: "#8A929C", fontSize: 13, fontFamily: "system-ui, sans-serif", marginTop: 0 }}>{cur.prompt}</p>
          {revealed ? (
            <Display>{cur.suggested}</Display>
          ) : (
            <button style={S.btn} onClick={() => setRevealed(true)}>👁 SHOW SUGGESTED SCRIPT</button>
          )}
          <div style={{ ...S.label, margin: "12px 0 6px" }}>
            Decoded from your key <span style={{ color: "#F2A93B" }}>{keyer.buffer}</span>
          </div>
          <Display cursor>{keyer.decoded}</Display>
          <KeyInput keyer={keyer} keyType={settings.keyType} onKeyType={(v) => setSettings((s) => ({ ...s, keyType: v }))} swap={settings.paddleSwap} onSwap={(v) => setSettings((s) => ({ ...s, paddleSwap: v }))} />
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button style={S.btnAmber} onClick={checkSend}>CHECK TRANSMISSION</button>
            <button style={S.btn} onClick={() => keyer.clear()}>✕ CLEAR</button>
          </div>
          {sendResult && (
            <div style={{ marginTop: 12 }}>
              <Score pct={sendResult.sim} />
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, marginTop: 6 }}>
                {sendResult.need.map((m) => (
                  <span key={m} style={{ marginRight: 12, color: sendResult.hits.includes(m) ? "#8FCB9B" : "#E07A5F" }}>
                    {sendResult.hits.includes(m) ? "✓" : "✗"} {m}
                  </span>
                ))}
              </div>
              {sendResult.hits.length < sendResult.need.length && (
                <p style={{ color: "#8A929C", fontSize: 12, fontFamily: "system-ui, sans-serif", margin: "8px 0 0", lineHeight: 1.55 }}>
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
              style={{ ...S.btn, color: "#5A626C", fontSize: 11 }}
              onClick={() => { player.stop(); setQso(null); keyer.clear(); }}
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
          <p style={{ color: "#8A929C", fontSize: 12, fontFamily: "system-ui, sans-serif", margin: "6px 0 0" }}>
            {avgCopy !== null && <span>Avg copy: <span style={{ color: "#F2A93B" }}>{avgCopy}%</span></span>}
            {avgCopy !== null && avgSend !== null && <span style={{ margin: "0 6px" }}>·</span>}
            {avgSend !== null && <span>Avg send: <span style={{ color: "#F2A93B" }}>{avgSend}%</span></span>}
          </p>
        );

        return (
          <div style={S.panel}>
            <div style={{ fontFamily: "ui-monospace, monospace", color: "#F2A93B", fontSize: 22, letterSpacing: 3 }}>QSO COMPLETE — 73</div>
            <p style={{ color: "#8A929C", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>{qso.summary}</p>
            {scoreSummary}
            <button style={{ ...S.btnAmber, marginTop: 10 }} onClick={start}>📻 NEXT CONTACT</button>
          </div>
        );
      })()}

      {log.length > 0 && (
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 8 }}>Contact log</div>
          {log.map((e, i) => (
            <div key={i} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: e.who === settings.myCall ? "#FFD89B" : "#8FCB9B", marginBottom: 6, wordBreak: "break-all" }}>
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
        <p style={{ color: "#C9CDD3", fontSize: 14, lineHeight: 1.6, fontFamily: "system-ui, sans-serif", margin: 0 }}>
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
              <p style={{ color: "#8A929C", fontSize: 12, fontFamily: "system-ui, sans-serif", marginTop: 0 }}>{group.blurb}</p>
              {group.items.map(([term, meaning]) => (
                <button key={term} onClick={() => say(term)}
                  style={{ display: "flex", gap: 12, width: "100%", background: "transparent", border: "none", borderBottom: "1px solid #23272D", padding: "9px 0", cursor: "pointer", textAlign: "left", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "ui-monospace, monospace", color: "#FFD89B", fontSize: 16, minWidth: 64, letterSpacing: 1 }}>{term} <span style={{ color: "#8A929C", fontSize: 11 }}>🔊</span></span>
                  <span style={{ color: "#C9CDD3", fontSize: 13, fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>{meaning}</span>
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
        <button style={{ ...S.btn, padding: "3px 10px", fontSize: 11 }} onClick={() => onHear(text)}>🔊 HEAR</button>
      </div>
      <div style={{ ...S.display, fontSize: 15, letterSpacing: 2, minHeight: 0, padding: "10px 12px" }}>{text}</div>
      <p style={{ color: "#8A929C", fontSize: 12.5, fontFamily: "system-ui, sans-serif", margin: "6px 0 0", lineHeight: 1.55 }}>{why}</p>
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
        {[["cq", "THE CQ"], ["rst", "RST"], ["qso", "FULL QSO"], ["pota", "POTA"]].map(([v, l]) => (
          <button key={v} onClick={() => { player.stop(); setGuide(v); }}
            style={{ ...S.btn, flex: 1, padding: "8px 4px", fontSize: 11, ...(guide === v ? { borderColor: "#F2A93B", color: "#F2A93B", fontWeight: 700 } : {}) }}>
            {l}
          </button>
        ))}
      </div>

      {guide === "cq" && (
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 8 }}>Anatomy of a CQ</div>
          <div style={{ ...S.display, fontSize: 16, letterSpacing: 2, marginBottom: 6 }}>{myCq}</div>
          <button style={{ ...S.btn, marginBottom: 14, fontSize: 12 }} onClick={() => say(myCq)}>🔊 HEAR THE WHOLE CALL</button>
          {CQ_ANATOMY.map(([seg, why]) => (
            <div key={seg} style={{ display: "flex", gap: 12, borderBottom: "1px solid #23272D", padding: "10px 0", alignItems: "baseline" }}>
              <button onClick={() => say(sub(seg))} style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "ui-monospace, monospace", color: "#FFD89B", fontSize: 15, minWidth: 110, textAlign: "left", padding: 0, letterSpacing: 1 }}>
                {sub(seg)} <span style={{ color: "#8A929C", fontSize: 10 }}>🔊</span>
              </button>
              <span style={{ color: "#C9CDD3", fontSize: 13, fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>{why}</span>
            </div>
          ))}
          <p style={{ color: "#8A929C", fontSize: 12, fontFamily: "system-ui, sans-serif", marginBottom: 0, marginTop: 12, lineHeight: 1.6 }}>
            Etiquette: before any CQ, send QRL? and listen. An empty-sounding frequency may be mid-QSO with a station you can't hear.
          </p>
        </div>
      )}

      {guide === "rst" && (
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 8 }}>The RST signal report</div>
          <p style={{ color: "#C9CDD3", fontSize: 13.5, fontFamily: "system-ui, sans-serif", marginTop: 0, lineHeight: 1.6 }}>
            Three digits, one judgment each. <span style={{ color: "#FFD89B" }}>R</span>eadability 1–5: can you make out the words? <span style={{ color: "#FFD89B" }}>S</span>trength 1–9: how loud? <span style={{ color: "#FFD89B" }}>T</span>one 1–9: how clean is the note? (Tone only exists on CW — voice modes use just RS.)
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[["599", "Perfect copy, loud, clean"], ["579", "Solid copy, good signal"], ["559", "Workable but weak"]].map(([r, d]) => (
              <button key={r} onClick={() => say(r)} style={{ ...S.btn, flex: 1, padding: "10px 4px", textAlign: "center" }}>
                <div style={{ fontFamily: "ui-monospace, monospace", color: "#FFD89B", fontSize: 18 }}>{r} <span style={{ fontSize: 10, color: "#8A929C" }}>🔊</span></div>
                <div style={{ fontSize: 10, color: "#8A929C", marginTop: 4, fontFamily: "system-ui, sans-serif" }}>{d}</div>
              </button>
            ))}
          </div>
          <p style={{ color: "#8A929C", fontSize: 12.5, fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.6 }}>
            In contests and pileups everyone sends 599 regardless — it's a formality there, and often compressed to cut numbers: <button onClick={() => say("5NN")} style={{ background: "transparent", border: "none", color: "#FFD89B", fontFamily: "ui-monospace, monospace", cursor: "pointer", padding: 0, fontSize: 13 }}>5NN 🔊</button> where 9 becomes N and 0 becomes T. In a ragchew, send the honest number — a true 559 tells the other op something useful about propagation.
          </p>
        </div>
      )}

      {guide === "qso" && (
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 10 }}>A complete QSO, line by line</div>
          {QSO_WALKTHROUGH.map((l) => <WalkLine key={l.text} who={l.who} text={sub(l.text)} why={l.why} onHear={say} />)}
          <p style={{ color: "#8A929C", fontSize: 12, fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.6 }}>
            This exact pattern is what the QSO tab simulates — when you're ready, go work one.
          </p>
        </div>
      )}

      {guide === "pota" && (
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 10 }}>A POTA hunt, line by line</div>
          {POTA_WALKTHROUGH.map((l) => <WalkLine key={l.text} who={l.who} text={sub(l.text)} why={l.why} onHear={say} />)}
          <p style={{ color: "#8A929C", fontSize: 12, fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.6 }}>
            Most new CW ops make their first real contact exactly this way — the exchange is short, the script is fixed, and activators are patient. Send ? whenever you need a repeat. Nobody minds.
          </p>
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
    body: "Samuel Morse and Alfred Vail opened America's first telegraph line between Washington and Baltimore with those four words, and distance stopped meaning what it had meant for all of human history. (Tap 🔊 to hear the message in today's International code — the original went out in Morse's own American code, a different dialect.) The operators who worked the wires that followed invented almost everything you'll do on the air: the abbreviations, the rhythm, the etiquette, the fraternity. Radio didn't create CW culture — it inherited it from the landline, fully formed.",
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
        <p style={{ color: "#C9CDD3", fontSize: 14, lineHeight: 1.6, fontFamily: "system-ui, sans-serif", margin: 0 }}>
          Every term in this app has a birthday. The shorthand you're learning is a living artifact — phrases coined by wire operators before the Civil War, carried to sea by Marconi's men, standardized after the Titanic, and still doing their job tonight on 20 meters. Tap 🔊 to hear each era's signature in the code itself.
        </p>
      </div>
      {HISTORY.map((h) => (
        <div key={h.era} style={S.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ ...S.label, color: "#F2A93B" }}>{h.era}</span>
            <button style={{ ...S.btn, padding: "3px 10px", fontSize: 11 }} onClick={() => say(h.hear)}>🔊</button>
          </div>
          <div style={{ fontFamily: "ui-monospace, monospace", color: "#FFD89B", fontSize: 16, letterSpacing: 1, marginBottom: 8 }}>{h.title}</div>
          <p style={{ color: "#C9CDD3", fontSize: 13.5, fontFamily: "system-ui, sans-serif", lineHeight: 1.65, margin: 0 }}>{h.body}</p>
        </div>
      ))}
    </div>
  );
}

/* ================= LEARN (KOCH METHOD) ================= */
function LearnTab({ player, settings }) {
  const [section, setSection] = useState("chars");
  const [lesson, setLesson] = useState(() => store.load("kochLesson", 1)); // lesson n = first n+1 Koch chars
  const [drilling, setDrilling] = useState(false);
  const [history, setHistory] = useState([]); // last 25 results
  const [flash, setFlash] = useState(null); // { ok, char }
  const [showRef, setShowRef] = useState(false);
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

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["chars", "CHARS"], ["lingo", "LINGO"], ["onair", "ON AIR"], ["history", "HISTORY"]].map(([v, l]) => (
          <button key={v} aria-pressed={section === v} onClick={() => { player.stop(); setSection(v); }}
            style={{ ...S.btn, flex: 1, padding: "8px 2px", fontSize: 11, ...(section === v ? { borderColor: "#F2A93B", color: "#F2A93B", fontWeight: 700 } : {}) }}>
            {l}
          </button>
        ))}
      </div>

      {section === "lingo" && <LingoGuide player={player} settings={settings} />}
      {section === "onair" && <OnAirGuide player={player} settings={settings} />}
      {section === "history" && <HistoryGuide player={player} settings={settings} />}

      {section === "chars" && (<>
      {!drilling && (
        <div style={S.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <span style={S.label}>Lesson {lesson} of {maxLesson}</span>
            <span style={{ display: "flex", gap: 6 }}>
              <button aria-label="Previous lesson" style={{ ...S.btn, padding: "5px 12px", fontSize: 13 }} disabled={lesson <= 1}
                onClick={() => { setLesson((l) => Math.max(1, l - 1)); setHistory([]); }}>←</button>
              <button aria-label="Next lesson" style={{ ...S.btn, padding: "5px 12px", fontSize: 13 }} disabled={lesson >= maxLesson}
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
            <span style={{ color: "#8A929C", fontSize: 12, fontFamily: "system-ui, sans-serif", flex: 1 }}>
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
              style={{ ...S.input, width: 62, padding: "6px 10px", fontSize: 14, textTransform: "none", letterSpacing: 0 }}
            />
          </div>
          <p style={{ color: "#8A929C", fontSize: 11, fontFamily: "system-ui, sans-serif", margin: "0 0 10px", lineHeight: 1.5 }}>
            The Koch method assumes you've mastered earlier characters — each lesson builds on the ones before it.
          </p>

          <div style={{ ...S.label, marginBottom: 6 }}>{lesson === 1 ? "Meet your first two characters" : "New character"}</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            {newChars.map((ch) => (
              <button key={ch} onClick={() => playChar(ch)}
                style={{
                  flex: 1, background: "#080A0D", border: "1px solid #F2A93B", borderRadius: 10,
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

          <button style={{ ...S.btnAmber, width: "100%", padding: "14px 0" }} onClick={startDrill}>▶ START DRILL</button>

          <p style={{ color: "#8A929C", fontSize: 12, fontFamily: "system-ui, sans-serif", marginBottom: 0, marginTop: 12, lineHeight: 1.6 }}>
            This is the Koch method: every character plays at full speed ({settings.charWpm} wpm — words per minute, the standard measure of how fast code is sent) from the very first lesson, so your ear learns the rhythm of each letter as a single sound — never as counted dits and dahs. Hit 90% over 20 answers and the next character unlocks.
            {settings.effWpm < settings.charWpm && (
              <> The gaps between characters are stretched (Farnsworth spacing — characters stay fast, pauses give you time to think). Raise effective speed in Settings to close the gap as you improve.</>
            )}
          </p>
        </div>
      )}

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
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 15, color: ready ? "#8FCB9B" : accuracy >= 90 ? "#F2A93B" : "#8A929C" }}
            >
              {accuracy}% · {attempts}/20
            </span>
          </div>

          {/* aria-live="polite" + aria-atomic: screen reader announces each drill result
              as it flips (correct/incorrect/waiting). "polite" queues behind the user's
              own input rather than interrupting. aria-atomic reads the whole region, not
              just the changed node, so the full result string is announced. */}
          <div
            aria-live="polite"
            aria-atomic="true"
            style={{ ...S.display, textAlign: "center", fontSize: "2.125rem", minHeight: 70, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {flash ? (
              <span style={{ color: flash.ok ? "#8FCB9B" : "#E07A5F" }}>
                {flash.ok ? "✓" : `✗  ${flash.char}  ${glyphs(MORSE[flash.char])}`}
              </span>
            ) : (
              <span style={{ color: "#8A929C", fontSize: "1rem", letterSpacing: 3 }}>LISTEN...</span>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
            <button style={S.btn} onClick={() => currentRef.current && playChar(currentRef.current)}>↻ REPLAY</button>
            <button style={S.btn} onClick={() => { setDrilling(false); player.stop(); clearTimeout(timerRef.current); }}>← BACK</button>
          </div>

          <div style={{ fontSize: 14, color: "#C9CDD3", fontFamily: "system-ui, sans-serif", marginBottom: 8 }}>Tap or type the letter you heard</div>
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
              <p style={{ color: "#C9CDD3", fontSize: 13, fontFamily: "system-ui, sans-serif", margin: "0 0 8px", lineHeight: 1.6 }}>
                Good effort — you're building the pattern. Keep drilling and your rolling accuracy will climb.
              </p>
              <p style={{ color: "#8A929C", fontSize: 12, fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.6 }}>
                {accuracy}% over your last set — reach 90% to unlock the next character. Each correct answer shifts the window forward, so a good run now counts right away.
              </p>
            </div>
          )}
        </div>
      )}

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
                <div style={{ fontSize: 11, color: "#F2A93B", marginTop: 3, letterSpacing: 1 }}>{glyphs(MORSE[ch])}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}

/* ================= SETTINGS ================= */
function Settings({ settings, setSettings }) {
  const set = (k) => (v) => setSettings((s) => ({ ...s, [k]: v, ...(k === "charWpm" && s.effWpm > v ? { effWpm: v } : {}) }));
  return (
    <div style={S.panel}>
      <Slider label="Character speed" value={settings.charWpm} min={10} max={35} step={1} suffix=" wpm" onChange={set("charWpm")} />
      <Slider label="Effective speed (Farnsworth)" value={settings.effWpm} min={4} max={settings.charWpm} step={1} suffix=" wpm" onChange={set("effWpm")} />
      {/* C3: Farnsworth gloss at point of use — the deeper paragraph below covers
          the full story; this one-liner is for first-glance context at the slider. */}
      <p style={{ color: "#8A929C", fontSize: 11, fontFamily: "system-ui, sans-serif", margin: "-8px 0 10px", lineHeight: 1.5 }}>
        Farnsworth: characters stay at full speed; the pauses between them stretch so you have time to think. Close the gap by raising this toward character speed as you improve.
      </p>
      <Slider label="Your keying speed" value={settings.keyWpm} min={8} max={35} step={1} suffix=" wpm" onChange={set("keyWpm")} />
      <Slider label="Sidetone" value={settings.freq} min={400} max={900} step={10} suffix=" Hz" onChange={set("freq")} />
      <div style={{ marginBottom: 14 }}>
        <div style={{ ...S.label, marginBottom: 6 }}>RX filter (band noise voicing)</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["wide", "WIDE"], ["cw", "CW 500"], ["apf", "APF"]].map(([v, l]) => (
            <button key={v} aria-pressed={settings.rxFilter === v} onClick={() => setSettings((s) => ({ ...s, rxFilter: v }))}
              style={{ ...S.btn, flex: 1, padding: "7px 4px", fontSize: 11, ...(settings.rxFilter === v ? { borderColor: "#F2A93B", color: "#F2A93B", fontWeight: 700 } : { color: "#8A929C" }) }}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 6, lineHeight: 1.5 }}>
          How real-life band noise sounds. WIDE is open SSB-width hiss (2.4 kHz). CW 500 is a 500 Hz passband centered on your sidetone — the standard CW filter on most rigs. APF is a narrow ~60 Hz audio peak, the razor-filter sound dedicated CW ops run when digging signals out of the noise. AGC is always on — noise ducks under signals and swells back in the gaps.
        </div>
      </div>
      <div style={{ ...S.label, color: "#F2A93B", marginTop: 4, marginBottom: 8 }}>Your station</div>
      <div style={{ fontSize: 11, color: "#8A929C", fontFamily: "system-ui, sans-serif", marginBottom: 10, lineHeight: 1.5 }}>
        These start as an example (W1AW, the ARRL's station). Set them to your own call, name, and location — they personalize your practice contacts and are saved automatically.
      </div>
      <div>
        <div style={{ ...S.label, marginBottom: 4 }}>Your callsign</div>
        <input style={{ ...S.input, fontSize: 15, padding: "8px 12px" }} value={settings.myCall}
          onChange={(e) => setSettings((s) => ({ ...s, myCall: e.target.value.toUpperCase() }))} />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...S.label, marginBottom: 4 }}>Your name</div>
          <input style={{ ...S.input, fontSize: 15, padding: "8px 12px" }} value={settings.myName}
            onChange={(e) => setSettings((s) => ({ ...s, myName: e.target.value.toUpperCase() }))} />
        </div>
        <div style={{ flex: 1.4 }}>
          <div style={{ ...S.label, marginBottom: 4 }}>Your QTH</div>
          <input style={{ ...S.input, fontSize: 15, padding: "8px 12px" }} value={settings.myQth}
            onChange={(e) => setSettings((s) => ({ ...s, myQth: e.target.value.toUpperCase() }))} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 4 }}>
        End your QTH with your two-letter state — POTA exchanges send it as your handle.
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <div>
          <div style={S.label}>Cut numbers (contest style)</div>
          <div style={{ fontSize: 12, color: "#8A929C", fontFamily: "system-ui, sans-serif", marginTop: 2 }}>
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
      <p style={{ color: "#8A929C", fontSize: 12, fontFamily: "system-ui, sans-serif", marginBottom: 0 }}>
        Farnsworth keeps each character at full speed but stretches the gaps — train your ear at the character speed you'll actually hear on the air, with thinking room between letters. Close the gap by raising effective speed, not lowering character speed.
      </p>
      <p style={{ color: "#8A929C", fontSize: 12, fontFamily: "system-ui, sans-serif", marginBottom: 0, marginTop: 10 }}>
        🔇 No sound? On iPhone, flip the ring/silent switch off silent — silent mode mutes web audio entirely. Then check media volume and tap any play button.
      </p>
    </div>
  );
}

/* ================= SPLASH ================= */
function Splash({ onSkip }) {
  return (
    <div
      onClick={onSkip}
      style={{
        position: "fixed", inset: 0, zIndex: 50, cursor: "pointer",
        background: "radial-gradient(ellipse at 50% 40%, #14171C, #080A0D)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}
    >
      <style>{`@keyframes splashIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }`}</style>
      <div style={{ textAlign: "center", animation: "splashIn 1.1s ease both" }}>
        <div style={{ fontFamily: "ui-monospace, monospace", color: "#8A6A33", fontSize: 16, letterSpacing: 6 }}>
          ·−− ·−·
        </div>
        <div style={{ fontFamily: "ui-monospace, monospace", color: "#F2A93B", fontSize: 32, letterSpacing: 9, fontWeight: 700, marginTop: 12, textShadow: "0 0 24px rgba(242,169,59,0.35)" }}>
          WISCO RADIO LABS
        </div>
        <div style={{ fontFamily: "ui-monospace, monospace", color: "#C9CDD3", fontSize: 13, letterSpacing: 8, marginTop: 10 }}>
          CW TRAINER
        </div>
        <div style={{ width: 120, height: 1, background: "#3A434E", margin: "20px auto 0" }} />
        <div style={{ fontFamily: "system-ui, sans-serif", color: "#5A626C", fontSize: 11, letterSpacing: 2, marginTop: 12 }}>
          MADE IN THE DRIFTLESS
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 28, fontFamily: "system-ui, sans-serif", color: "#8A929C", fontSize: 11, letterSpacing: 1, animation: "splashIn 1.1s 1.5s ease both" }}>
        tap to skip
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
};

export default function CWTrainer() {
  const isWide = useIsWide();
  const [tab, setTab] = useState("learn");
  const [showSettings, setShowSettings] = useState(false);
  const [splash, setSplash] = useState(true);
  // Generic placeholder identity — the user sets their own in Settings, and it
  // persists from there. W1AW (the ARRL's station, in Newington CT) is the
  // universally recognized example callsign, so it reads as "change me."
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...store.load("settings", {}) }));
  // C4: nudge is visible while the call is still the default W1AW AND the user
  // hasn't dismissed it. Dismissal persists so it shows at most once. Changing
  // the call also satisfies it — we derive visibility rather than storing it.
  const [nudgeDismissed, setNudgeDismissed] = useState(() => store.load("seenCallNudge", false));
  const player = useMorsePlayer();

  // Persist settings whenever they change
  useEffect(() => { store.save("settings", settings); }, [settings]);

  // C4: persist nudge dismissal
  const dismissCallNudge = () => {
    store.save("seenCallNudge", true);
    setNudgeDismissed(true);
  };

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 5000);
    // Unlock audio on the very first touch/click anywhere — capture phase so it
    // runs before any component handler tries to make sound.
    const wake = () => player.unlock();
    window.addEventListener("pointerdown", wake, { capture: true, once: true });
    window.addEventListener("touchend", wake, { capture: true, once: true });
    return () => {
      clearTimeout(t);
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
  ];

  // Render the splash alone and on top — returned before the app mounts, so no
  // app UI can flash underneath it on launch. Tapping unlocks audio and sends
  // the "WR" (Wisco Radio) signature in Morse; the tap is the gesture that
  // lets the tone play (audio can't autoplay before a user interaction).
  if (splash) {
    return (
      <Splash
        onSkip={() => {
          player.unlock();
          player.play("WR", { charWpm: 22, effWpm: 22, freq: settings.freq });
          setSplash(false);
        }}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0D0F13", padding: "16px 12px 60px", color: "#E8E2D6" }}>
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
        * { -webkit-tap-highlight-color: transparent; }
        button { outline: none; }
        button:focus { outline: none; }
        button:focus-visible { outline: 2px solid #F2A93B; outline-offset: 2px; }
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
        /* Narrow (<900px): collapse to today's single column */
        @media (max-width: 899px) {
          .wr-shell {
            grid-template-columns: 1fr;
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
            <div style={{ ...S.label, color: "#8A6A33", letterSpacing: 3 }}>WISCO RADIO LABS</div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 22, letterSpacing: 4, color: "#F2A93B", fontWeight: 700 }}>
              CW TRAINER
            </div>
            <div style={{ ...S.label, marginTop: 2 }}>
              {settings.charWpm} wpm chars · {settings.effWpm} wpm effective · {settings.myCall}
            </div>
          </div>
          <button
            aria-label="Settings"
            aria-expanded={showSettings}
            style={{ ...S.btn, padding: "8px 12px" }}
            onClick={() => { setShowSettings((v) => !v); dismissCallNudge(); }}
          >⚙</button>
        </header>

        {/* Settings panel: spans full width in both modes (unchanged behavior).
            Later phases (Phase 4) move this into the rail on wide. */}
        {showSettings && (
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
        {settings.myCall === "W1AW" && !nudgeDismissed && (
          <div className="wr-full" role="note" style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#191C21", border: "1px solid #3A434E", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
            <span style={{ color: "#8A929C", fontSize: 12, fontFamily: "system-ui, sans-serif", lineHeight: 1.6, flex: 1 }}>
              <strong style={{ color: "#C9CDD3" }}>W1AW is an example callsign</strong> (the ARRL's station in Newington, CT). Tap ⚙ Settings to set your own call, name, and QTH — they'll personalize your practice contacts.
            </span>
            <button
              aria-label="Dismiss callsign notice"
              onClick={dismissCallNudge}
              style={{ ...S.btn, padding: "2px 8px", fontSize: 13, lineHeight: 1, flexShrink: 0, color: "#8A929C" }}>
              ✕
            </button>
          </div>
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
        <nav aria-label="Sections" className="wr-nav-rail">
          {tabs.map(([v, l]) => (
            <button key={v} aria-pressed={tab === v} onClick={() => { player.stop(); setTab(v); }}
              style={{
                ...S.btn,
                // Wide: no flex:1 — the buttons are stacked vertically and each
                // takes its natural width (full nav-rail width via align-items:stretch).
                // Narrow: flex:1 so each button fills its share of the row (today's behavior).
                ...(isWide ? {} : { flex: 1 }),
                // Active tab styling — same amber highlight in both orientations.
                ...(tab === v ? { background: "#3A2E18", borderColor: "#F2A93B", color: "#F2A93B", fontWeight: 700 } : {}),
              }}>
              {l}
            </button>
          ))}
        </nav>

        {/*
          Main practice area — middle grid column on wide, full width on narrow.
          DOM order: main comes before the rail so screen readers reach the
          practice surface before the options, matching the visual hierarchy.
          All tab components render here in full for all phases until their
          individual rail splits are done (Phases 2–5).
        */}
        <main className="wr-main">
          {tab === "learn" && <LearnTab player={player} settings={settings} />}
          {tab === "copy" && <CopyTrainer player={player} settings={settings} />}
          {tab === "key" && <KeyTrainer player={player} settings={settings} setSettings={setSettings} />}
          {tab === "qso" && <QsoSim player={player} settings={settings} setSettings={setSettings} />}
        </main>

        {/*
          Right options rail — right grid column on wide, hidden on narrow.
          Empty shell for Phase 1. Later phases (Phases 2–5) move each tab's
          setup controls here. Not rendered at all on narrow (CSS display:none)
          so it contributes no DOM noise on mobile.
        */}
        {isWide && <aside className="wr-rail" aria-label="Options" />}

        {/* Footer spans all three columns on wide; naturally full-width on narrow */}
        <footer className="wr-full" style={{ textAlign: "center", marginTop: 24 }}>
          <div style={{ fontFamily: "ui-monospace, monospace", color: "#5A626C", fontSize: 11, letterSpacing: 3 }}>
            ·−− ·−·&nbsp;&nbsp;WISCO RADIO LABS
          </div>
          <div style={{ fontFamily: "system-ui, sans-serif", color: "#3A434E", fontSize: 10, letterSpacing: 1, marginTop: 4 }}>
            made in the Driftless
          </div>
        </footer>

      </div>
    </div>
  );
}
