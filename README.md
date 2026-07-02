<p align="center">
  <img src="build/screenshots/WiscoRadioLabs-Banner.png" alt="CW Trainer by Wisco Radio Labs" width="100%">
</p>

<h1 align="center">CW Trainer</h1>

<p align="center">
  <em>by Wisco Radio Labs</em><br><br>
  Learn Morse code the way hams actually use it — from your first two characters to a full on-air contact.<br>
  Koch-method lessons · copy &amp; sending practice · a POTA / SOTA / IOTA / ragchew QSO simulator. <b>Fully offline.</b>
</p>

<p align="center">
  <a href="https://www.gnu.org/licenses/gpl-3.0"><img alt="License: GPL v3" src="https://img.shields.io/badge/License-GPLv3-blue.svg"></a>
  <img alt="Platform: Linux" src="https://img.shields.io/badge/platform-Linux-333">
  <img alt="Built with Electron" src="https://img.shields.io/badge/built%20with-Electron-47848F?logo=electron&logoColor=white">
</p>

---

## What it is

A free, fully-offline Morse code (CW) trainer for the Linux desktop, built by a ham for hams.
Whether you've never sent a dit or you're knocking the rust off, four practice modes take you
all the way from recognizing your first two characters to running a complete on-air contact —
**no account, no network, no ads.**

- 🎧 **Audio-first**, the way CW is really learned — full-speed characters with Farnsworth spacing.
- 🛠️ **Bring your own key** — practice on screen, on the keyboard, or with your real straight key or
  paddle through a VBand-style USB adapter.
- 📻 **Real operating, simulated** — work POTA, SOTA, IOTA, and ragchew contacts as either side of the QSO.
- 📈 **See your progress** — lessons, sending, and copy tracked across sessions, with simple trends and dates.
- 🔌 **Offline forever** — it never asks for the network.

---

## Screenshots

|  |  |
|:--:|:--:|
| <img src="build/screenshots/WiscoRadioLabs-Learn.png" width="100%"><br>**Learn** — Koch-method character lessons | <img src="build/screenshots/WiscoRadioLabs-Copy.png" width="100%"><br>**Copy** — the six-rung copy ladder |
| <img src="build/screenshots/WiscoRadioLabs-Key.png" width="100%"><br>**Key** — sending practice with a live decoder | <img src="build/screenshots/WiscoRadioLabs-QSO.png" width="100%"><br>**QSO** — work a simulated contact |
| <img src="build/screenshots/WiscoRadioLabs-Progress-Settings.png" width="100%"><br>**Progress &amp; Settings** — track your sessions; tune speed, Farnsworth, sidetone, band conditions | |

---

## Using the trainer

The app opens with five tabs across the top — four practice modes plus a progress view:

### 📚 Learn
Koch-method character lessons. Every character is sent at full speed from the very first lesson,
with extra space between characters (Farnsworth) so your ear has time. A new character is added
once you're copying the current set at 90%. Answer by tapping the on-screen letter or just typing it.

### 📥 Copy
Copy practice up a six-rung ladder — single characters, pairs, random groups, real ham words,
callsigns, and finally full QSO phrases. Pick **Easy** (see the text as you hear it), **Normal**
(copy by ear, then check yourself), or **Real life** (band noise and QSB fading — the way it
really sounds on the air).

### 📤 Key (sending)
Sending practice with a built-in iambic-paddle and straight-key decoder that shows *exactly* what
your fist sends — not what you meant. Choose a **drill category** (callsigns, calling CQ, signal
reports, numbers, prosigns, Q-codes, common words, or full QSO lines) and climb the ladder as you
improve. Key it **on screen**, with the **keyboard** (Space = straight key; Z / X or the arrows =
paddle — with selectable iambic **Mode A or B**), or with **your own key or paddle** through a USB adapter (the `[` / `]` brackets a
VBand-style adapter sends; flip the dit/dah swap if your levers come out reversed). Afterward you
get **fist feedback** — your estimated speed and how tight your letter/word spacing reads. Finish
the word and it grades **automatically** — no button to press.

### 📻 QSO
A simulated contact, set up the way you'd actually operate: pick the **activity** (Ragchew, POTA,
SOTA, or IOTA), your **role** (Activator or Hunter/Chaser; or, for a ragchew, Call CQ or Answer a
CQ), and the **difficulty**. Then work the whole exchange — call, signal report, the back-and-forth,
and the sign-off — copying by ear and sending with your key. Real-life difficulty adds QSB fading,
band noise, and on-air break-in fills (`?`, `AGN`, `QRS`). Both **how you copy and how you send**
are scored each contact — the type box auto-focuses when it's your turn, your over grades when you
pause, and it all feeds the Progress view.

### 📈 Progress
A running history of how you're doing — your Koch-lesson accuracy, your sending (speed and fist),
your copy, and your **QSO** contacts (both how you copy and how you send) — shown as **color-coded
bar charts with a 90% mastery line** and dates, so you can see whether today beat last week. Saved
locally; it never leaves your machine.

**Plus:** built-in reference guides (CW lingo, on-air procedure, and the history of the code), and a
Settings panel for speed, Farnsworth timing, sidetone pitch, and band conditions (receiver
filtering, QSB, AGC).

---

## Install

**From the Snap Store:**

```bash
sudo snap install wr-cw-trainer
```

**Testing the next version (edge channel):** International/DX and word-list
enhancements are currently in testing on the edge channel — install with
`sudo snap install wr-cw-trainer --edge` (or `snap refresh --edge`) if you'd
like to try them early and report issues.

**From source** — requires **Node.js 18+** and npm:

```bash
git clone https://github.com/wiscoradio-k9mte/CW-Trainer.git
cd CW-Trainer
npm install
npm start        # builds the app and opens it in Electron
```

---

## Contributing

This is a community project for hams learning CW, and real-world feedback from people who actually
operate is what makes it better. Bug reports with steps to reproduce, and feature ideas grounded in
how you operate, are genuinely valued — open an
[issue](https://github.com/wiscoradio-k9mte/CW-Trainer/issues). Be kind in issues and reviews;
we're all here to help more people learn the code. Build/development details are below.

---

<details>
<summary><b>For developers &amp; maintainers</b> (build, test, project layout, packaging)</summary>

### Architecture

The trainer's UI lives in one file, `wr-cw-trainer.jsx`, organized into clearly named hooks and
components (the audio engine `useMorsePlayer`, the keyer/decoder `useKeyer`, the copy/sending/QSO
trainers, settings, and the reference guides). The **pure logic** — Morse tables, Farnsworth timing,
copy grading, the QSO/drill generators, and the Koch gate — is factored into `src/cw-core.js` and
covered by a unit-test suite. Vite bundles it; Electron wraps it; snapcraft packages it.

- **App ID:** `io.github.wiscoradio_k9mte.CWTrainer` · **License:** GPL-3.0-or-later · **Author:** Wisco Radio Labs (K9MTE)

### Develop & run

```bash
npm run dev      # Vite dev server + Electron, hot reload
npm start        # production build, then run in Electron (mirrors the packaged load)
```

### Test

```bash
npm test            # run the vitest suite once
npm run test:watch  # re-run on change
```

New logic belongs in `src/cw-core.js` so it's unit-testable; keep the suite green and add tests for
any new core behavior. UI behavior in `wr-cw-trainer.jsx` is checked by hand (`npm run dev`).

### Project layout

```
.
├── wr-cw-trainer.jsx        # the UI — the whole trainer (components + hooks), one file
├── src/
│   ├── cw-core.js           # pure logic: Morse tables, timing, grading, drill + QSO builders
│   ├── cw-core.test.js      # unit tests for cw-core.js (vitest)
│   └── main.jsx             # React entry: mounts the trainer
├── electron/main.cjs        # Electron main process (window + security)
├── electron-builder.yml     # produces the unpacked Electron tree snapcraft packages
├── snap/snapcraft.yaml      # Snap package definition (core22 + gnome extension)
├── build/                   # icon, screenshots, AppStream metainfo
├── index.html · vite.config.mjs · package.json
└── release/                 # build output (generated)
```

### Package for the Snap Store

```bash
sudo snap install snapcraft --classic
npm run dist:snap                                  # → release/wr-cw-trainer_*.snap
sudo snap install --dangerous release/wr-cw-trainer_*.snap   # test locally
snapcraft login && snapcraft upload --release=stable release/wr-cw-trainer_*.snap
```

### Notes & troubleshooting

- **Blank white window when packaged?** Asset base path — `vite.config.mjs` sets `base: "./"` to avoid it; keep it.
- **No audio in the sandbox?** `sudo snap connect wr-cw-trainer:audio-playback` (usually auto-connects).
- **Fully offline** — no network is requested; don't add it without a feature that needs it.

</details>

---

## License

GPL-3.0-or-later © 2026 Wisco Radio Labs (K9MTE). See [LICENSE](LICENSE) for the full text.
