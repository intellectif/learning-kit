# Releasing & publishing to npm

Published packages: `@intellectif/lk-core` and `@intellectif/lk-react` (everything else is `private` and never published). Versioning is driven by [Changesets](https://github.com/changesets/changesets); `.changeset/config.json` sets `access: public` (required for scoped packages) and base branch `main`.

## Security model (read this first)

This project deliberately uses **no long-lived npm token**:

- **CI publishes via npm Trusted Publishing (OIDC).** GitHub Actions proves its identity to npm per-run; npm issues a short-lived credential and attaches build **provenance**. There is no `NPM_TOKEN` secret to store, leak, rotate, or expire, and **no 2FA bypass**. (npm's own UI warns against 2FA-bypass automation tokens for exactly this reason — Trusted Publishing is the recommended replacement.)
- **The first publish of each package is done manually and interactively** by a maintainer using `npm login` with 2FA enabled. Nothing is stored.
- A static automation token is intentionally **not** documented as a routine path. If OIDC is ever unavailable, prefer a short-lived, scope-limited token created at publish time and discarded — never one that bypasses 2FA, never committed, never long-lived.

Because there is no secret in this flow, this document is safe to keep public; it describes process only.

## One-time setup

### 1. npm account & scope

You need an npm account that owns the `@intellectif` scope (npmjs.com → *Add Organization* — free for public packages), with 2FA enabled.

### 2. First publish (manual, interactive) — creates the packages

Trusted Publishing attaches to a package; the initial publish establishes each package and the scope. Run locally on a clean, green `main`:

```bash
pnpm install
pnpm turbo run build lint test coverage e2e   # must be 14/14 green
pnpm version-packages                          # applies changesets → versions + CHANGELOGs
git add -A && git commit -m "chore: version packages"

npm login                                      # interactive; complete the 2FA prompt
pnpm release                                   # turbo build + changeset publish (access: public)
npm logout                                     # don't leave a session lying around

git push --follow-tags
```

Verify:

```bash
npm view @intellectif/lk-core version
npm view @intellectif/lk-react version
```

### 3. Configure Trusted Publishing for CI (after the packages exist)

On npmjs.com, for **each** package (`@intellectif/lk-core`, then `@intellectif/lk-react`):

- Package page → **Settings** → **Publishing access** → **Trusted Publisher** → **GitHub Actions**.
- Set: organization/user `intellectif`, repository `learning-kit`, workflow filename `release.yml` (environment left blank unless you add one).
- Keep "Require two-factor authentication or automation tokens" as npm's default; Trusted Publishing satisfies it without a token.

The workflow (`.github/workflows/release.yml`) is already OIDC-ready: it declares `permissions: id-token: write`, upgrades to an OIDC-capable npm, and carries **no** `NPM_TOKEN`.

### 4. GitHub repo settings

- **Settings → Actions → General → Workflow permissions:** *Read and write* + *Allow GitHub Actions to create and approve pull requests* (so Changesets can open the version PR via the built-in `GITHUB_TOKEN`).
- **Settings → Code security:** enable **Secret scanning** and **Push protection** (blocks accidental secret pushes).
- **Settings → Branches:** protect `main` (see git flow below).

## Routine release flow (after setup)

```bash
# on a feature branch, for every change:
pnpm changeset            # choose packages + bump type + summary
git add .changeset && git commit -m "chore: changeset"
```

Open a PR → CI gate runs → review → merge to `main`. Changesets then opens a **"chore: version packages"** PR; merging *that* triggers the Release workflow, which publishes via OIDC. No human handles any credential.

## Recommended git flow & pre-push security

Do **not** `git push origin main` directly. Use:

1. **Integration branch + PRs.** Work on feature branches; optionally keep a long-lived `dev` integration branch and PR `dev → main` for releases. The non-negotiable control is: `main` is **protected** and only changes via reviewed PRs with the CI gate required.
2. **Branch protection on `main`** (Settings → Branches → add rule): require a PR, require the CI status checks to pass, disallow force-push and deletion, include administrators.
3. **Enable Secret scanning + Push protection** (above) *before* the first push.
4. **Local pre-push audit** (gitbash):
   ```bash
   git status
   git diff --staged
   git log --oneline -20
   # secret sweep of tracked files. EXPECTED: exactly one self-match —
   # this very command's regex text on its own line in this file. Any
   # OTHER hit is a real finding to investigate.
   git grep -nE "npm_[A-Za-z0-9]{20,}|-----BEGIN|AKIA[0-9A-Z]{16}|_authToken=[^$]" -- . ':(exclude)pnpm-lock.yaml'
   # optional, thorough history + entropy scan (authoritative):
   pnpm dlx gitleaks detect --no-banner
   ```
   `.npmrc` carries **no** auth line; `.gitignore` covers `.env*`, `dist/`, the generated MSW worker, `storybook-static/`, Playwright artifacts.
5. **First push:**
   ```bash
   git checkout -b release-prep
   git push -u origin release-prep
   # open a PR on GitHub → let CI run → review → merge to main
   ```
   Configure branch protection and secret-scanning on the new repo *before* merging anything to `main`.

## Notes & troubleshooting

- `@intellectif/lk-react` declares `@intellectif/lk-core` as a `workspace:^` peer; pnpm/Changesets rewrites it to `^<version>` on publish, and `changeset publish` orders core before react.
- Provenance: Trusted Publishing emits a signed provenance attestation automatically (visible on the npm package page) — extra supply-chain assurance for consumers, free.
- `403`/scope errors on first publish → the `@intellectif` scope/org doesn't exist or your account lacks write access to it.
- OIDC publish fails in CI → confirm the Trusted Publisher is configured for that exact package + repo + `release.yml`, the job has `id-token: write`, and npm is ≥ 11.5 (the workflow's "Use OIDC-capable npm" step handles the last one).
- Token expiry / rotation: **not applicable** — there is no stored token by design.
- Never commit a real token; never use a 2FA-bypass token for routine automation; if you must use a token as a last resort, scope it to `@intellectif`, keep it short-lived, and remove it after.
