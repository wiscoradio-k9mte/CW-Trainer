# CW Trainer — Security Automation

What the security-engineer set up in `.github/`, and the **manual repo settings
Travis must toggle** that no committed file can set for you. Defensive only;
nothing here auto-publishes.

CW Trainer is a fully offline Electron app. Per the shop security-automation
baseline, the real attack surface is the **supply chain and the build/publish
path**, not a running network service — so this invests in dependency hygiene,
Actions hardening, and SAST, and deliberately skips DAST / container / network
controls as theater for this product.

---

## What's automated (committed workflows)

| File | What it does | Trigger |
|------|--------------|---------|
| `workflows/codeql.yml` | CodeQL SAST for JavaScript/TypeScript | PR, push to main, weekly (Mon 07:17 UTC) |
| `dependabot.yml` | Version + security update PRs for `npm` and `github-actions` | weekly + on-disclosure for security |
| `workflows/dependency-review.yml` | Blocks a PR that introduces a high+ vuln or denied license | pull_request |
| `workflows/security-audit.yml` | `npm audit` sweep; emails Travis on high/critical via the escalation workflow | weekly (Mon 08:30 UTC) + manual |

These complement the release-engineer's `ci.yml` (test + build, the required
status check), `release.yml`, and `notify-escalation.yml` (the reusable email
workflow the security-audit calls).

**Action pinning:** every third-party action is pinned to a full commit SHA, not
a tag. Dependabot's `github-actions` ecosystem keeps those pins current (and
updates the version comment). Do not "upgrade" a pin to a floating tag.

---

## Manual repo settings Travis must set — these are NOT in any file

GitHub does not let a committed file enable org/repo security controls. Set these
in the repo's web UI (Settings →). They are the other half of the baseline.

### 1. Secret scanning + push protection — DO THIS FIRST

**Settings → Code security and analysis** (a.k.a. "Advanced Security"):

- [ ] **Secret scanning** → Enable. Scans the repo (and history) for committed
      credentials and alerts on them.
- [ ] **Push protection** → Enable. *Blocks* a push that contains a detected
      secret before it ever lands — the highest-value control here, because a
      leaked Snap macaroon or Gmail App Password is the worst case for this repo.

Free on public repos. CW Trainer is public, so this costs nothing.

> Note: the workflows reference five secrets (`SNAPCRAFT_STORE_CREDENTIALS`,
> `MAIL_SERVER/PORT/USERNAME/PASSWORD`). Those live in **Actions secrets**, never
> in the repo — push protection is the backstop that keeps them that way.

### 2. Branch protection on `main`

**Settings → Branches → Add branch protection rule** → pattern `main`:

- [x] **Require status checks to pass before merging**
      → add **`Test & Build`** (the job name from `ci.yml`). This is the gate.
      The check name only appears in the list after `ci.yml` has run at least
      once, so push the workflows, let CI run on a PR, then add it.
- [x] **Require branches to be up to date before merging**
- [x] **Do not allow bypassing the above settings** (applies the rule to admins
      too — no silent force-merge around the gate).
- [x] **Require linear history** (matches the squash/rebase flow; keeps history
      auditable).

**Solo-maintainer note:** do NOT require a second reviewer. Requiring an approval
you can't supply is self-defeating for a one-person shop. Require the *status
check*; set "Required approvals" to **0** (or leave PR-required off entirely and
rely on the status check). This matches the shop baseline.

### 3. Least-privilege default `GITHUB_TOKEN`

**Settings → Actions → General → Workflow permissions:**

- [x] Set the default to **"Read repository contents and packages permissions"**
      (read-only), NOT "Read and write."

Every workflow already declares its own least-privilege `permissions:` block and
elevates only the one job that needs it (e.g. `release.yml` grants
`contents: write` only to the release job; `codeql.yml` grants
`security-events: write` only to analyze). So the read-only default is safe — the
per-workflow grants cover what each job actually needs. A read-only default means
a compromised or misconfigured action cannot write to the repo by inheriting a
broad token.

- [ ] Leave **"Allow GitHub Actions to create and approve pull requests"**
      **unchecked** unless Dependabot auto-merge is later configured — not needed
      for the current setup.

### 4. Actions allow-list (optional hardening)

**Settings → Actions → General → Actions permissions:** the strictest posture is
"Allow <owner>, and select non-<owner>, actions and reusable workflows" with the
SHA-pinned third-party actions explicitly allowed. The simpler "Allow all
actions" is acceptable given every third-party action is already SHA-pinned (a
SHA pin is itself the strong control). Travis's call — note it, don't block on it.

---

## Snyk — DROPPED (2026-06-29)

Travis linked the repo to Snyk on 2026-06-22 and then **decided not to use it
(2026-06-29).** The GitHub-native automation already covers the same ground:
**Dependabot** (alerts + update PRs), **CodeQL** (`codeql.yml`), **dependency-review**
(`dependency-review.yml`), and the weekly **`npm audit`** sweep in `security-audit.yml`
with email escalation. Layering Snyk on top was redundant scanning (and Snyk-code
per-PR was already on the shop's "skip / theater" list for an offline app).

- **No repo change is needed** — nothing in CI ever called Snyk; there is no
  `SNYK_TOKEN` and none is wanted.
- The Snyk app **may still be linked** to the repo until Travis unlinks it in the
  Snyk dashboard (https://app.snyk.io → the project → remove/deactivate). Optional
  tidy-up; nothing depends on it.
- **Do NOT** make any `security/snyk` status check a *required* check on `main` — an
  abandoned third-party check would block merges. (See the branch-protection note
  below.) Don't reintroduce Snyk without a deliberate decision to.

---

## Complete list of secrets + settings Travis must provide

**Actions secrets** (Settings → Secrets and variables → Actions) — five, all already
documented in `RELEASING.md`:

| Secret | For | Status |
|--------|-----|--------|
| `SNAPCRAFT_STORE_CREDENTIALS` | release.yml — snap upload | required (see RELEASING.md) |
| `MAIL_SERVER` | escalation email | required |
| `MAIL_PORT` | escalation email | required |
| `MAIL_USERNAME` | escalation email | required |
| `MAIL_PASSWORD` | escalation email (Gmail App Password) | required |

**Repo settings** (web UI, this document, section by section):
1. Secret scanning + push protection — ON
2. Branch protection on `main` — required `Test & Build` check, no bypass, linear
   history, 0 required reviewers (solo)
3. Default `GITHUB_TOKEN` — read-only
4. (Optional) Actions allow-list — strict or all-actions-with-SHA-pins

**Snyk:** dropped (2026-06-29) — no action required. Optionally unlink the app in
the Snyk dashboard, and make sure no `security/snyk` check is a *required* status
check on `main`.
