# WISCO RADIO — CW Trainer

A detailed amateur-radio Morse code (CW) trainer, packaged as a Linux desktop
app with [Electron](https://www.electronjs.org/). The trainer itself is a single
React component (`wr-cw-trainer.jsx`); this repo wraps it with a build system
(Vite) and packaging (electron-builder) so it can ship to the **Snap Store** and
**Flathub**.

- **App ID:** `io.github.wiscoradio_k9mte.CWTrainer`
- **License:** GPL-3.0-or-later

---

## Project layout

```
.
├── wr-cw-trainer.jsx        # the app (unchanged) — the whole trainer
├── src/main.jsx             # React entry: mounts the trainer into the page
├── index.html               # Vite HTML entry
├── vite.config.mjs          # bundler config (base: "./" for Electron)
├── electron/main.cjs        # Electron main process (creates the window)
├── electron-builder.yml     # packaging config: Snap + Flatpak targets
├── build/
│   ├── icon.svg             # icon source — rasterize to icon.png (see below)
│   └── io.github.wiscoradio_k9mte.CWTrainer.metainfo.xml  # store metadata
├── package.json
└── release/                 # build output (created by electron-builder)
```

---

## Prerequisites

- **Node.js 18+** and npm — for the app build (`node --version`).
- **snapcraft** — to build/publish the Snap: `sudo snap install snapcraft --classic`
- **flatpak** + **flatpak-builder** — to build the Flatpak:
  `sudo apt install flatpak flatpak-builder`

> This project was scaffolded on a machine without Node, snapcraft, or flatpak
> installed. Install them before running the commands below.

---

## First-time setup

```bash
# 1. Install dependencies
npm install

# 2. Add the full GPL-3.0 license text (kept out of the repo scaffold so the
#    canonical text is never transcribed by hand):
curl -L https://www.gnu.org/licenses/gpl-3.0.txt -o LICENSE

# 3a. Use your own logo — just save it as build/icon.png (square, 512×512+).
#     This is the recommended path; build/icon.svg is only a placeholder.
#
# 3b. ...or rasterize the placeholder SVG (pick one tool you have):
rsvg-convert -w 512 -h 512 build/icon.svg -o build/icon.png
#   or:  inkscape build/icon.svg -w 512 -h 512 -o build/icon.png
#   or:  convert -background none -resize 512x512 build/icon.svg build/icon.png
```

electron-builder automatically picks up `build/icon.png` (its `buildResources`
directory is `build/`). A **square PNG, 512×512 or larger** is required for the
stores; 1024×1024 is ideal so every generated size stays crisp.

---

## Develop & run

```bash
npm run dev      # Vite dev server + Electron, with hot reload
```

This launches the Vite dev server on `http://localhost:5173` and opens Electron
pointed at it. Edit `wr-cw-trainer.jsx` and the window reloads.

```bash
npm start        # build for production, then run it in Electron (no dev server)
```

Use `npm start` to confirm the **packaged-style** load works (assets served from
`dist/` over `file://`) — this is what catches base-path problems before you
package.

---

## Package for the stores

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

> The snap **name** (`wr-cw-trainer` in `package.json`) must be available and
> registered to your account. If it's taken, pick a variant (e.g.
> `wiscoradio-cw-trainer`) and update the `name` field in `package.json`.

### Flatpak (local bundle)

```bash
# Install the runtimes the build needs (versions must match electron-builder.yml).
# NOTE: Flathub rejects end-of-life runtimes — confirm 24.08 is still current at
# https://docs.flathub.org before submitting, and bump both files together if not.
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08 \
  org.electronjs.Electron2.BaseApp//24.08

npm run dist:flatpak      # → release/Wisco Radio CW Trainer-1.0.0.flatpak
```

Test it locally:

```bash
flatpak install --user release/"Wisco Radio CW Trainer-1.0.0.flatpak"
flatpak run io.github.wiscoradio_k9mte.CWTrainer
```

This `.flatpak` bundle is perfect for **self-distribution** (put it on your
GitHub Releases page). Getting onto **Flathub** itself is a separate submission
process — see below.

---

## Submitting to Flathub

Flathub doesn't accept uploaded bundles; you submit a **build manifest** to their
GitHub org and their infrastructure builds it. The high-level steps:

1. Push this repo to **GitHub** at `wiscoradio-k9mte/CW-Trainer` (the URLs in
   `metainfo.xml` and `package.json` already point there).
2. Add real **screenshots** under `build/screenshots/` and confirm the URLs in
   `build/io.github.wiscoradio_k9mte.CWTrainer.metainfo.xml` resolve.
3. Fork [`flathub/flathub`](https://github.com/flathub/flathub) and open a PR on
   the `new-pr` branch adding a manifest named
   `io.github.wiscoradio_k9mte.CWTrainer.yml`. Because your App ID is
   `io.github.<user>.*`, Flathub verifies ownership via your GitHub account — no
   domain needed.
4. Follow the [Flathub submission docs](https://docs.flathub.org/docs/for-app-authors/submission)
   and their [Electron guidance](https://docs.flathub.org/docs/for-app-authors/requirements).

The `metainfo.xml` and the App ID in this repo are already Flathub-shaped, so the
manifest is the main remaining piece.

---

## Notes & troubleshooting

- **Blank white window when packaged?** That's almost always the asset base
  path. `vite.config.mjs` sets `base: "./"` precisely to avoid it — keep it.
- **No audio in the sandbox?** Snap needs the `audio-playback` plug (already in
  `electron-builder.yml`); Flatpak needs `--socket=pulseaudio` (already set). On
  Snap, connect it if it didn't auto-connect:
  `sudo snap connect wr-cw-trainer:audio-playback`.
- **No network access** is requested by either package — the trainer is fully
  offline. Don't add it unless you introduce a feature that needs it.
- **Bumping the Flatpak runtime:** update `runtimeVersion`/`baseVersion` in
  `electron-builder.yml` together, and `flatpak install` the matching
  `Platform`, `Sdk`, and `Electron2.BaseApp` versions.
- **Desktop file name:** electron-builder generates the `.desktop` file during
  packaging. For Flathub, confirm it is named
  `io.github.wiscoradio_k9mte.CWTrainer.desktop` (matching the App ID and the
  `launchable` in `metainfo.xml`); rename in the manifest's `finish` step if
  needed.
- **Generic taskbar icon after install?** That's a `StartupWMClass` mismatch —
  cosmetic, and the one thing only a real build can confirm. After installing,
  run the app and check its window class with `xprop WM_CLASS` (X11) or note the
  Wayland app-id, then add a matching `StartupWMClass: <value>` under
  `linux.desktop.entry` in `electron-builder.yml` and rebuild. Left unset for now
  because the correct value depends on the build and can't be guessed reliably.
