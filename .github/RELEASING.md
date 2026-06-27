# CW Trainer — CI/CD Pipeline & Release Runbook

## Pipeline overview

```
PR / push to main
    └── ci.yml
            ├── npm ci
            ├── npm test        (vitest, 310 pass / 27 skipped)
            └── npm run build   (Vite renderer)

push tag v*.*.*
    └── release.yml
            ├── Job 1: build-and-package
            │       ├── npm ci
            │       ├── npm test
            │       ├── npm run build          (Vite)
            │       ├── npm run pack           (electron-builder --dir → release/linux-unpacked/)
            │       ├── snapcore/action-build  (real snapcraft / LXD → wr-cw-trainer_*.snap)
            │       └── upload-artifact        (stash snap between jobs)
            │
            ├── Job 2: release-and-upload
            │       ├── Download snap artifact
            │       ├── Extract release notes from metainfo.xml
            │       ├── Create GitHub Release  (with .snap attached)
            │       ├── snapcraft upload         (to store — NO channel, NOT live)
            │       └── snapcraft upload-metadata (summary + description + icon from snap)
            │
            └── Job 3: notify-on-failure  (only if Job 1 or 2 failed)
                    └── notify-escalation.yml → email to wiscoradio@gmail.com

Security / maintenance workflows (owned by security-engineer)
    └── notify-escalation.yml  (reusable workflow_call target)
            └── dawidd6/action-send-mail → wiscoradio@gmail.com
```

## Publish gate — auto-publish on tag (model changed 2026-06-26)

**The deliberate version tag IS the publish authorization.** When you push a
`vX.Y.Z` tag, Job 1 runs the full test suite + build; only if they pass does Job 2
`snapcraft upload ... --release=stable`, which releases the revision to the public
`stable` channel automatically (it goes live once the store's automated review
passes). You do not need to be present for a promotion step.

Why this model: the human checkpoint is the tag (a one-line act you can do from
anywhere, even GitHub's web UI), not a second manual promote. The test gate is the
safety — **a broken build can never reach `stable`.** This replaced the earlier
"upload-without-channel, human promotes manually" flow.

To launch a release:
```bash
git tag vX.Y.Z && git push origin vX.Y.Z   # the deliberate "go" — auto-publishes
```

If you ever want a manual gate back (e.g. release to `candidate` and promote later),
change the upload step to `snapcraft upload "${SNAP_FILE}"` (no `--release`) and
promote with:
```bash
snapcraft release wr-cw-trainer <REVISION_NUMBER> stable
```

To find the revision number: the `snapcraft upload` output in the workflow log
prints it, or check the Snap Store dashboard → Releases.

---

## Required secrets

Add these in GitHub → Settings → Secrets and variables → Actions → New repository
secret. Use the exact names below — the workflows reference them by name.

### SNAPCRAFT_STORE_CREDENTIALS

**What it is:** A base64-encoded macaroon that lets snapcraft authenticate to the
Snap Store without an interactive login.

**How to obtain:**

```bash
# On your local machine, with snapcraft installed and logged in:
snapcraft export-login \
  --snaps wr-cw-trainer \
  --channels stable,candidate \
  - | base64 -w 0
```

Copy the entire base64 output — it is the secret value.

**Set it:**

```bash
gh secret set SNAPCRAFT_STORE_CREDENTIALS \
  --repo wiscoradio-k9mte/CW-Trainer \
  --body "$(snapcraft export-login --snaps wr-cw-trainer --channels stable,candidate - | base64 -w 0)"
```

**Expiry:** Snap Store credentials expire (typically 1 year). Re-export and update
the secret before the old one expires or when you see a 401 in the upload step.

---

### MAIL_SERVER

**What it is:** SMTP hostname for the escalation email sender.

**For Gmail:** `smtp.gmail.com`

```bash
gh secret set MAIL_SERVER --repo wiscoradio-k9mte/CW-Trainer --body "smtp.gmail.com"
```

---

### MAIL_PORT

**What it is:** SMTP port. Use 465 for implicit TLS (Gmail App Passwords).

```bash
gh secret set MAIL_PORT --repo wiscoradio-k9mte/CW-Trainer --body "465"
```

---

### MAIL_USERNAME

**What it is:** The sender's email address / SMTP login.

```bash
gh secret set MAIL_USERNAME --repo wiscoradio-k9mte/CW-Trainer --body "wiscoradio@gmail.com"
```

---

### MAIL_PASSWORD

**What it is:** A Gmail App Password (NOT your Gmail account password). App
Passwords work even when 2FA is enabled and give exactly SMTP-send access — they
cannot log into the account or read mail.

**How to obtain:**
1. Go to https://myaccount.google.com/apppasswords
2. Select app: Mail; device: a name you'll recognize (e.g. "CW Trainer CI")
3. Click Generate — copy the 16-character password (no spaces)

```bash
gh secret set MAIL_PASSWORD --repo wiscoradio-k9mte/CW-Trainer --body "YOUR_APP_PASSWORD_HERE"
```

**Security note:** App Passwords can be revoked individually. Revoke and regenerate
if the secret is ever exposed.

---

## Required repository settings

### 1. GitHub Actions enabled

Settings → Actions → General → Allow all actions (or allow actions and reusable
workflows from trusted publishers + specific actions matching the SHA-pinned ones
in the workflows).

### 2. Branch protection on `main`

Settings → Branches → Add branch protection rule → Branch name pattern: `main`

Required settings:
- [x] Require status checks to pass before merging
  - Add required checks: `Test & Build` (the job name from ci.yml)
- [x] Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings

Optional but recommended:
- [x] Require a pull request before merging (1 approval; self-review acceptable
  for a solo maintainer — set "Required approvals" to 0 if you work solo)
- [x] Require linear history

### 3. Workflow write permissions (for release.yml)

The release workflow needs `contents: write` to create the GitHub Release. This
is set in the workflow's `permissions:` block, so no global setting is needed —
but confirm:

Settings → Actions → General → Workflow permissions → "Read and write permissions"
OR leave it at "Read repository contents and packages permissions" (the per-workflow
`permissions: contents: write` override covers it either way).

### 4. No Snap Store environment gate (by design)

The publish gate is the **deliberate version tag** plus the **automated test gate**:
the tag is the human authorization, and Job 2 only releases to `stable` if the tests
pass. A GitHub Environment with a required reviewer was considered but rejected — it
holds a live runner while Travis is away (runs time out at 6 hours) and requires the
human to be present at publish time, the exact thing this model avoids.

---

## Release runbook — shipping v2.0.0

1. **Confirm readiness.** Tests pass (`npm test`), build is clean (`npm run build`),
   security-engineer has cleared the current posture. Travis has done the live
   desktop click-through.

2. **Confirm version numbers match.** `package.json` version is `2.0.0` AND
   `snap/snapcraft.yaml` version is `"2.0.0"` (it is — as of the V2.0 batch commit).

3. **Confirm secrets are set.** All five secrets above must exist in the repo
   before you push the tag.

4. **Push all local commits to main.**

   ```bash
   git push origin main
   ```

5. **Cut the release tag.**

   ```bash
   git tag -a v2.0.0 -m "CW Trainer v2.0.0"
   git push origin v2.0.0
   ```

   This triggers `release.yml`.

6. **Watch the run.** GitHub → Actions → Release → the v2.0.0 run. Both jobs
   should complete in under 30 minutes (snap build is the slow step, typically
   10-20 min in LXD).

7. **Verify the GitHub Release.** A release named "CW Trainer v2.0.0" should
   appear with the `.snap` file attached and the release notes from metainfo.xml.

8. **Promote the snap to stable.** The snap revision is held in the store. Find
   the revision number in the workflow log or the Snap Store dashboard, then:

   ```bash
   # From your local machine:
   snapcraft release wr-cw-trainer <REVISION_NUMBER> stable
   ```

   Or use the Snap Store dashboard (https://snapcraft.io/wr-cw-trainer/releases).

9. **Verify the store listing.** `snap refresh wr-cw-trainer` on a test machine.
   Confirm the version, description, and "What's new" section.

---

## Snap build in CI — approach and assumptions

**Toolchain:** `snapcore/action-build` (v1.3.0, SHA-pinned). It provisions LXD on
the ubuntu-latest GitHub-hosted runner and runs a real `snapcraft` build inside
an LXD container. This is the same toolchain that produced the live v1.0.x snaps.

**Why not electron-builder's snap target:** electron-builder's snap template
hard-locks gnome-3-28-1804 (2018 libraries), against which Electron 42 segfaults
at launch (MESA-LOADER swrast failure). The core22 + gnome extension in
`snap/snapcraft.yaml` is the proven, supported path. See CLAUDE.md.

**Build order dependency:** `snapcraft.yaml` uses the `dump` plugin pointing at
`release/linux-unpacked/`. That directory is produced by `npm run pack`
(electron-builder --dir). So `npm run pack` MUST run before `snapcore/action-build`.
The workflow enforces this: pack runs as a step before the action-build step, in
the same job.

**LXD on ubuntu-latest:** GitHub-hosted ubuntu-latest runners support LXD as of
early 2024. `snapcore/action-build` handles the setup. If a runner type change
ever breaks LXD support, the fallback is a self-hosted runner with LXD pre-installed,
or using `snapcraft` in `--destructive-mode` (builds directly on the host, not in
a container — fast but less hermetic; works if the runner OS matches core22).

**snapcraft.yaml version:** `snapcraft.yaml` hardcodes `version: "2.0.0"`. The
release workflow validates that `package.json` matches the tag; `snapcraft.yaml`
must also match. Keep all three in sync when bumping versions.

---

## Email escalation — when it fires

The `notify-escalation.yml` reusable workflow sends email to `wiscoradio@gmail.com`
when called by another workflow. It fires when:

- The release workflow fails (Job 3 in `release.yml`)
- A security/maintenance workflow (owned by security-engineer) calls it because it
  found a high/critical vulnerability it cannot safely auto-patch, a failing gate,
  or a breaking-change dependency bump

It does NOT fire on successful runs or routine events. The subject line is prefixed
with `[CW Trainer / <severity>]` so it can be filtered in Gmail.

---

## Adding future platforms

When the roadmap reaches Windows (Microsoft Store) or macOS (App Store):

- Add a new release job in `release.yml` for each platform.
- Each platform needs its own signing secret (Windows Authenticode certificate,
  Apple Developer credentials + notarization) — add as secrets following the same
  pattern as `SNAPCRAFT_STORE_CREDENTIALS`.
- The human-confirmed publish gate applies to every store, not just Snap.
- macOS notarization adds a `xcrun notarytool` step after signing; both macOS
  and Windows builds need code-signing before upload.

## Manual steps the human does (the automation can't)

The pipeline builds, tests, packages, releases to stable, pushes the listing
text + icon, and emails on failure. A short list stays human-only — do these after
each launch or enhancement:

**Every release:**
1. **Test the running app** *(before you tag)* — the team can't launch Electron
   headless, so you're the one who runs it and confirms the UI + features look and
   work right. This is the gate before the deliberate tag.
2. **Tag the version** — `git tag vX.Y.Z && git push origin vX.Y.Z`. The tag is your
   "go"; it triggers build → test → auto-publish to stable. (Bump `package.json` +
   `snapcraft.yaml` to the version first.)
3. **Upload/refresh the Snap Store screenshots** — the pipeline pushes the description
   and icon but **cannot** push screenshots (they're dashboard-managed). After any UI
   change, re-capture and upload them: snapcraft.io → wr-cw-trainer → Listing →
   Screenshots. (The description/icon you can also refresh without a release via the
   **Refresh Store Metadata** workflow.)
4. **Eyeball the live listing** — confirm the description, screenshots, and icon look
   right on the public store page.
5. **Announce it, when you're ready** — community post / kick off the marketing team
   (human-approved publishing; marketing stays dark until you say go).

**Occasional (watch for these):**
- **Snapcraft store credentials expire (~1 year).** When they do, the release will
  fail at the upload step — regenerate with `snapcraft export-login` and update the
  `SNAPCRAFT_STORE_CREDENTIALS` Actions secret.
- **Mail app password** — if the Gmail app password is revoked/changed, re-set
  `MAIL_PASSWORD` (the escalation email will start failing if it lapses).
