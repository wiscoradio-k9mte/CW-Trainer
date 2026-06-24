// Setup for the jsdom UI test harness (the *.dom.test.jsx files).
//
// This file is listed in vite.config.mjs `test.setupFiles`, which means vitest
// runs it before EVERY test file — including the node-env cw-core suite. The
// node suite has no `window`, so everything here is guarded behind a window
// check and becomes a no-op there. That keeps the 151 node tests pure and
// untouched while giving the jsdom tests the browser shims they need.

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount React trees between tests so one test's DOM (and its always-mounted
// live regions) can't leak into the next and produce false positives/negatives.
afterEach(() => {
  cleanup();
});

// Only install browser shims when a DOM exists (jsdom). In node env `window` is
// undefined and we skip all of this — the cw-core suite never sees these mocks.
if (typeof window !== "undefined") {
  installWebAudioMock();
  installMatchMediaMock();
}

/* ------------------------------------------------------------------ */
/* Web Audio mock                                                      */
/*                                                                     */
/* useMorsePlayer() instantiates a real AudioContext on mount and the  */
/* app unlocks/plays audio on first interaction. jsdom has NO Web Audio*/
/* API, so without this the components throw on render. We provide a   */
/* faithful-enough fake: every node method the app actually calls      */
/* (connect / disconnect / start / stop / the AudioParam ramps) is a   */
/* no-op, and the context exposes a `currentTime` and the factory      */
/* methods the engine uses (createOscillator/Gain/BiquadFilter/        */
/* BufferSource/Buffer). The mock makes NO sound and asserts nothing — */
/* it exists purely so the audio engine can be constructed and driven  */
/* in a headless DOM. The node surface mirrors the real usage in       */
/* wr-cw-trainer.jsx (verified by grepping the component's audio calls).*/
/* ------------------------------------------------------------------ */
function installWebAudioMock() {
  // A fake AudioParam: carries a `.value` and accepts every scheduling call the
  // engine makes (osc.frequency / gain.gain / bp.Q etc.) as no-ops.
  const makeParam = (initial = 0) => ({
    value: initial,
    setValueAtTime() {},
    setTargetAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  });

  const makeNode = (extra = {}) => ({
    connect() {},
    disconnect() {},
    start() {},
    stop() {},
    onended: null,
    ...extra,
  });

  class FakeAudioContext {
    constructor() {
      // The engine reads ctx.state (resumes when "suspended"/!"running") and
      // ctx.currentTime (schedules tones relative to it). sampleRate is read
      // when building the band-noise buffer.
      this.state = "running";
      this.sampleRate = 44100;
      this.destination = makeNode();
    }
    // Time advances trivially; the engine only needs a monotonic-ish number to
    // schedule against. A getter keeps it cheap and avoids a timer.
    get currentTime() {
      return 0;
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    suspend() {
      this.state = "suspended";
      return Promise.resolve();
    }
    close() {
      this.state = "closed";
      return Promise.resolve();
    }
    createOscillator() {
      return makeNode({ type: "sine", frequency: makeParam(440), detune: makeParam(0) });
    }
    createGain() {
      return makeNode({ gain: makeParam(1) });
    }
    createBiquadFilter() {
      return makeNode({ type: "lowpass", frequency: makeParam(350), Q: makeParam(1) });
    }
    createBufferSource() {
      return makeNode({ buffer: null, loop: false });
    }
    createBuffer(channels, length, sampleRate) {
      // The engine fills channel 0 with white noise via getChannelData(0), so
      // we hand back a real Float32Array of the requested length to write into.
      const data = new Float32Array(length);
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData() {
          return data;
        },
      };
    }
  }

  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;
}

/* ------------------------------------------------------------------ */
/* matchMedia mock                                                     */
/*                                                                     */
/* jsdom does not implement window.matchMedia. The app does not use it */
/* today, but the upcoming responsive-layout work adds a useIsWide()   */
/* hook that subscribes to matchMedia("(min-width: 900px)"). Providing */
/* the mock now means the baseline harness keeps working unchanged     */
/* once that hook lands. We default `matches: true` (a wide/desktop    */
/* viewport) because the product is desktop-first today — so the       */
/* baseline tests describe the desktop arrangement, the one the        */
/* refactor must not regress. The addEventListener/removeEventListener */
/* are real no-op stubs so the hook's listener cleanup won't throw.    */
/* ------------------------------------------------------------------ */
function installMatchMediaMock() {
  window.matchMedia = (query) => ({
    matches: true, // desktop-first default; see note above
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    // Legacy API some libraries still call:
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  });
}
