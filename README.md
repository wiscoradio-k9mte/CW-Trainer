# WISCO RADIO — CW Trainer

A detailed amateur-radio Morse code (CW) trainer for the Linux desktop: Koch-method
lessons, copy and sending practice, and a full QSO simulator — from your first two
characters all the way to a complete on-air contact. Built with
[Electron](https://www.electronjs.org/) and packaged for the **Snap Store** and **Flathub**.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
![Platform: Linux](https://img.shields.io/badge/platform-Linux-333)
![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848F?logo=electron&logoColor=white)

- **App ID:** `io.github.wiscoradio_k9mte.CWTrainer`
- **License:** GPL-3.0-or-later
- **Author:** Travis Engh (K9MTE) — Wisco Radio

The trainer itself is a single React component (`wr-cw-trainer.jsx`); this repo wraps
it with a build system (Vite) and packaging (electron-builder) so it can ship to the
Linux app stores.

---

## Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Install](#install)
- [Develop & run](#develop--run)
- [Project layout](#project-layout)
- [Package for the stores](#package-for-the-stores)
- [Submitting to Flathub](#submitting-to-flathub)
- [Notes & troubleshooting](#notes--troubleshooting)
- [License](#license)

---

## Features

- **Koch-method character lessons** — every character at full speed from lesson one,
  with Farnsworth spacing and one new character added at 90% accuracy.
- **A six-rung copy ladder** — single characters, pairs, random groups, ham words,
  callsigns, and full QSO phrases.
- **Sending practice** with a built-in iambic paddle and straight-key decoder that shows
  exactly what your fist sends — including the HH "start over" error prosign.
- **A QSO simulator** with POTA, SOTA, IOTA, and ragchew contacts, on-air break-in fills
  (`?`, `AGN`, `QRS`, partial-call fills), and honest signal reports.
- **Realistic band conditions** — selectable receiver filtering (wide / CW 500 Hz / APF),
  QSB signal fading, and AGC.
- **Reference guides** on CW lingo, on-air procedure, and the history of the code.
- **Fully offline** — no network access is requested or used.

---

## Screenshots

_Screenshots ship with the first release, captured from the running app._

<!-- Uncomment once the images are committed under build/screenshots/ (these are the
     same files the store listing in metainfo.xml expects):
![The Koch-method learning screen](build/screenshots/learn.png)
![The QSO simulator working a POTA contact](build/screenshots/qso.png)
-->

---

## Install

### From a store

Once published, install with a single command:

```bash
# Snap (planned)
sudo snap install wr-cw-trainer

# Flathub (planned)
flatpak install flathub io.github.wiscoradio_k9mte.CWTrainer
```

> Not on the stores yet — until then, build it from source.

### Build & run from source

Requires **Node.js 18+** and npm.

```bash
git clone https://github.com/wiscoradio-k9mte/CW-Trainer.git
cd CW-Trainer
npm install
npm start        # builds the app and runs it in Electron
```

The icon (`build/icon.png`) and the GPL-3.0 `LICENSE` are already in the repo, so
`npm install` is the only setup step.

---

## Develop & run

```bash
npm run dev      # Vite dev server + Electron, with hot reload
```

This launches the Vite dev server on `http://localhost:5173` and opens Electron pointed
at it. Edit `wr-cw-trainer.jsx` and the window reloads.

```bash
npm start        # build for production, then run it in Electron (no dev server)
```

Use `npm start` to confirm the **packaged-style** load works (assets served from `dist/`
over `file://`) — this is what catches base-path problems before you package.

---

## Project layout

```
.
├── wr-cw-trainer.jsx        # the app — the whole trainer, in one React component
├── src/main.jsx             # React entry: mounts the trainer into the page
├── index.html               # Vite HTML entry
├── vite.config.mjs          # bundler config (base: "./" for Electron)
├── electron/main.cjs        # Electron main process (creates the window)
├── electron-builder.yml     # packaging config: Snap + Flatpak targets
├── build/
│   ├── icon.png             # app icon (1024²; rasterized from icon.svg)
│   ├── icon.svg             # icon source
│   └── io.github.wiscoradio_k9mte.CWTrainer.metainfo.xml  # store metadata
├── LICENSE                  # GPL-3.0 full text
├── package.json
└── release/                 # build output (created by electron-builder)
```

> **Replacing the icon:** drop a square PNG (512×512 or larger; 1024² is ideal so every
> generated size stays crisp) at `build/icon.png`. electron-builder picks it up
> automatically — `build/` is its `buildResources` directory.

---

## Package for the stores

Install the packaging tools first:

- **snapcraft** — `sudo snap install snapcraft --classic`
- **flatpak** + **flatpak-builder** — `sudo apt install flatpak flatpak-builder`

### Snap

```bash
npm run dist:snap         # → release/wr-cw-trainer_1.0.0_amd64.snap
```

Test it locally before publishing:

```bash
sudo snap install --dangerous release/wr-cw-trainer_*.snap
wr-cw-trainer             # launch it
sudo snap remove wr-cw-trainer
```

Publish to the **Snap Store**:

```bash
snapcraft login
snapcraft register wr-cw-trainer     # one-time; the name must be globally unique
snapcraft upload --release=stable release/wr-cw-trainer_*.snap
```

> The snap **name** (`wr-cw-trainer` in `package.json`) must be available and registered
> to your account. If it's taken, pick a variant (e.g. `wiscoradio-cw-trainer`) and
> update the `name` field in `package.json`.

### Flatpak (local bundle)

```bash
# Install the runtimes the build needs (versions must match electron-builder.yml).
# 25.08 is current as of June 2026; the freedesktop SDK rolls a new version each
# August, so confirm it's still current at https://docs.flathub.org before submitting
# and bump both files together if not — Flathub rejects end-of-life runtimes.
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install flathub org.freedesktop.Platform//25.08 org.freedesktop.Sdk//25.08 \
  org.electronjs.Electron2.BaseApp//25.08

npm run dist:flatpak      # → release/Wisco Radio CW Trainer-1.0.0.flatpak
```

Test it locally:

```bash
flatpak install --user release/"Wisco Radio CW Trainer-1.0.0.flatpak"
flatpak run io.github.wiscoradio_k9mte.CWTrainer
```

This `.flatpak` bundle is perfect for **self-distribution** (put it on your GitHub
Releases page). Getting onto **Flathub** itself is a separate submission process — see below.

---

## Submitting to Flathub

Flathub doesn't accept uploaded bundles; you submit a **build manifest** to their GitHub
org and their infrastructure builds it. The high-level steps:

1. Push this repo to **GitHub** at `wiscoradio-k9mte/CW-Trainer` (the URLs in
   `metainfo.xml` and `package.json` already point there).
2. Add real **screenshots** under `build/screenshots/` and confirm the URLs in
   `build/io.github.wiscoradio_k9mte.CWTrainer.metainfo.xml` resolve.
3. Fork [`flathub/flathub`](https://github.com/flathub/flathub) and open a PR on the
   `new-pr` branch adding a manifest named
   `io.github.wiscoradio_k9mte.CWTrainer.yml`. Because your App ID is
   `io.github.<user>.*`, Flathub verifies ownership via your GitHub account — no domain
   needed.
4. Follow the [Flathub submission docs](https://docs.flathub.org/docs/for-app-authors/submission)
   and their [requirements](https://docs.flathub.org/docs/for-app-authors/requirements).

The `metainfo.xml` and the App ID in this repo are already Flathub-shaped, so the
manifest is the main remaining piece.

---

## Notes & troubleshooting

- **Blank white window when packaged?** That's almost always the asset base path.
  `vite.config.mjs` sets `base: "./"` precisely to avoid it — keep it.
- **No audio in the sandbox?** Snap needs the `audio-playback` plug (already in
  `electron-builder.yml`); Flatpak needs `--socket=pulseaudio` (already set). On Snap,
  connect it if it didn't auto-connect: `sudo snap connect wr-cw-trainer:audio-playback`.
- **No network access** is requested by either package — the trainer is fully offline.
  Don't add it unless you introduce a feature that needs it.
- **Bumping the Flatpak runtime:** update `runtimeVersion`/`baseVersion` in
  `electron-builder.yml` together, and `flatpak install` the matching `Platform`, `Sdk`,
  and `Electron2.BaseApp` versions.
- **Desktop file name:** electron-builder generates the `.desktop` file during packaging.
  For Flathub, confirm it is named `io.github.wiscoradio_k9mte.CWTrainer.desktop`
  (matching the App ID and the `launchable` in `metainfo.xml`); rename in the manifest's
  `finish` step if needed.
- **Generic taskbar icon after install?** That's a `StartupWMClass` mismatch — cosmetic,
  and the one thing only a real build can confirm. After installing, run the app and check
  its window class with `xprop WM_CLASS` (X11) or note the Wayland app-id, then add a
  matching `StartupWMClass: <value>` under `linux.desktop.entry` in `electron-builder.yml`
  and rebuild. Left unset for now because the correct value depends on the build and can't
  be guessed reliably.

---

## License

GPL-3.0-or-later © 2026 Travis Engh (K9MTE). See [LICENSE](LICENSE) for the full text.
