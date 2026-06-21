# Flathub launch runbook — CW Trainer v1.0.1

Exact, ordered steps to publish CW Trainer to Flathub. **You run every outward
step** (push, repo-public, Release, PR); the team has finalized everything up to
that line. Each outward action is a firm checkpoint — read before you run.

## What the team already did (verified)
- `npm test` → **33/33 green**; `npm run build` → green.
- Rebuilt the v1.0.1 unpacked app and zipped it:
  `release/wr-cw-trainer-linux.zip`
  **sha256 `48cd397b315d9ee42b4ff63e08feb9ac55aafddabcb6568db00b0f5e08195fc1`**
- Finalized `io.github.wiscoradio_k9mte.CWTrainer.yml`:
  - zypak `run.sh` wrapper + `command: run.sh` (the old `command: wr-cw-trainer`
    would not have launched under Flatpak),
  - binary installed to `/app/main`, archive auto-extracted,
  - `StartupWMClass=wr-cw-trainer`,
  - artifact url → v1.0.1, artifact sha256 filled,
  - metainfo sha256 corrected to `2b88b3…` (the draft was stale),
  - icon sha256 verified unchanged.
- `appstreamcli validate` on the metainfo: **clean** now that the repo is public
  (all icon/metainfo/screenshot URLs return HTTP 200; one non-blocking pedantic
  note on the uppercase app-id, which must NOT change — it's the published identity).
- **release-engineer gate: PASS** — manifest matches the canonical Flatpak Electron
  pattern; all three sha256s independently re-verified; runtime/base 25.08 confirmed
  current. One non-blocker: electron-builder bundles `resources/app-update.yml`
  (harmless — electron-updater isn't imported; auto-update never runs), reviewers
  may comment on it.
- **security-engineer posture: READY** — finish-args are least-privilege and
  actually *tighter* than the shipped Snap (no network, no home/host filesystem);
  no secrets in the packaging chain.
- **Not yet done by the team:** the local flatpak-builder smoke build (Step 6) —
  flatpak isn't installed here and installing it needs an interactive sudo terminal,
  which the agents don't have. **You** can run it via `!`. This is the one gate left.

## Prereqs for you
- `gh` is **not installed** on this box. Install + auth once:
  `sudo apt-get install -y gh && gh auth login`
  (Or do the GitHub-side steps in the web UI — fallbacks noted below.)
- Repo: `wiscoradio-k9mte/CW-Trainer` (now **public**).

---

## Step 1 — Commit & push the finalized packaging changes
This commit must land on `main` before the Release/PR, because the manifest fetches
the icon + metainfo from raw `main` and Flathub fetches the screenshots from there.
```
cd ~/WiscoRadio/Workshop/Products/CW-Trainer
git add packaging/flathub/io.github.wiscoradio_k9mte.CWTrainer.yml \
        packaging/flathub/RUNBOOK.md \
        build/icon-512.png \
        build/io.github.wiscoradio_k9mte.CWTrainer.metainfo.xml \
        electron-builder.yml \
        snap/snapcraft.yaml \
        CLAUDE.md
git commit -m "Flathub: finalize v1.0.1 manifest (zypak, 512 icon), sync store copy"
git push origin main
```
Notes:
- `build/icon-512.png` is REQUIRED — the manifest's icon source pins its sha256
  (`629fb247…`); a missing/mismatched file fails the Flathub build.
- Marketing art `build/screenshots/WiscoRadio-Banner.png` and `WiscoRadio-Poster.png`
  are in the repo but intentionally NOT in the metainfo `<screenshots>` (promo art,
  not UI shots — Flathub rejects those). `WiscoRadio-Splash.png` is likewise unused.
  Add them to the commit or not; they don't affect the build either way.

## Step 2 — Make the repo public  ✅ DONE (2026-06-21)
Repo is public; icon/metainfo/screenshot raw URLs all return HTTP 200.

## Step 3 — Confirm the listing assets now resolve (optional sanity)
```
appstreamcli validate build/io.github.wiscoradio_k9mte.CWTrainer.metainfo.xml
```
Expect a clean pass now that the URLs are public.

## Step 4 — Tag and publish the v1.0.1 GitHub Release  ⚠️ firm checkpoint, outward-facing
Attach the exact zip the manifest hash was computed from.
```
gh release create v1.0.1 \
  release/wr-cw-trainer-linux.zip \
  --repo wiscoradio-k9mte/CW-Trainer \
  --title "CW Trainer v1.0.1" \
  --notes "Answer Koch-method lessons with the keyboard, not just tap/click."
```
Web fallback: Releases → Draft new release → tag `v1.0.1` → upload
`release/wr-cw-trainer-linux.zip` → Publish.

## Step 5 — Verify the published artifact matches the manifest
```
curl -sL https://github.com/wiscoradio-k9mte/CW-Trainer/releases/download/v1.0.1/wr-cw-trainer-linux.zip \
  | sha256sum
# MUST print: 48cd397b315d9ee42b4ff63e08feb9ac55aafddabcb6568db00b0f5e08195fc1
```
If it differs, the manifest `sha256:` and the uploaded file are out of sync — fix
before submitting.

## Step 6 — local flatpak smoke test  ✅ DONE (2026-06-21) — PASSED
Built with real `org.flatpak.Builder`: build → AppStream compose → export →
install all green, and the app **launches and runs** (binds a Wayland surface;
verified with `dbus-run-session`). Caught + fixed one bug — the 1254×1254 icon
was installed into the `hicolor/512x512` dir (Flatpak rejects oversized icons),
so `build/icon-512.png` was added and the manifest icon source repointed to it.
No need to re-run unless the manifest changes. Commands kept below for reference:
```
sudo apt-get install -y flatpak flatpak-builder
flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install --user -y flathub org.flatpak.Builder
cd /tmp && cp ~/WiscoRadio/Workshop/Products/CW-Trainer/packaging/flathub/io.github.wiscoradio_k9mte.CWTrainer.yml .
flatpak run org.flatpak.Builder --force-clean --user --install \
  --install-deps-from=flathub build-dir io.github.wiscoradio_k9mte.CWTrainer.yml
flatpak run io.github.wiscoradio_k9mte.CWTrainer   # confirm it launches + audio works
```
Ask the team to drive this if you'd rather not — it needs ~1 GB of runtime/SDK
downloads.

## Step 7 — Open the Flathub PR  ⚠️ firm checkpoint, outward-facing
PR must target the **`new-pr`** branch, never `master`.
```
gh repo fork flathub/flathub --clone=false
git clone --branch=new-pr https://github.com/<your-gh-user>/flathub.git /tmp/flathub-fork
cd /tmp/flathub-fork
git checkout -b cw-trainer-submission new-pr
cp ~/WiscoRadio/Workshop/Products/CW-Trainer/packaging/flathub/io.github.wiscoradio_k9mte.CWTrainer.yml .
git add io.github.wiscoradio_k9mte.CWTrainer.yml
git commit -m "Add io.github.wiscoradio_k9mte.CWTrainer"
git push -u origin cw-trainer-submission
gh pr create --repo flathub/flathub --base new-pr \
  --title "Add io.github.wiscoradio_k9mte.CWTrainer" \
  --body "WISCO RADIO CW Trainer — offline Koch-method Morse trainer. GPL-3.0-or-later. Pre-built Electron archive run via zypak."
```

## Step 8 — Flathub review (iterative)
A bot/maintainer will review and the buildbot will build the manifest. Common
asks: build-from-source instead of a pre-built archive, finish-args tightening,
metainfo nits. Bring any reviewer feedback back to the shop and we'll turn it.

---
### Known review risk to expect
Flathub prefers **building from source** over shipping a pre-built binary for
open-source apps. We submit the pre-built archive first (simpler, matches our
Snap approach); if a reviewer requires from-source, the team will rework the
manifest to vendor npm deps with `flatpak-node-generator` and build in-sandbox.
