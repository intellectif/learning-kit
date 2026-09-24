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
                                               # (needs GITHUB_TOKEN set: entries link their PRs)
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

## "I just merged something — what do I do now?"

Answer the one question below and do only that line.

**Which PR did you just merge?**

| You merged… | Published to npm? | Do this next |
| --- | --- | --- |
| **Your own feature PR** (any branch you named) | ❌ No | **Nothing yet.** Wait ~1 min: a bot opens/updates a PR titled **“chore: version packages”**. Approve its checks if asked, then **merge that PR**. |
| **The bot's “chore: version packages” PR** | ✅ Yes | Nothing. Wait ~1 min, then verify with `npm view @intellectif/lk-core version`. |

**Still not sure whether anything is pending?** Run this — it is the whole diagnosis:

```bash
git fetch origin
git ls-tree --name-only origin/main:.changeset/
```

- Output is **only `config.json`** → everything is released. Nothing to do.
- Output lists **any `.md` files** → a release is waiting. Go merge the open
  **“chore: version packages”** PR (Pull requests tab). That is the only step left.

> Approving a PR's workflow checks does **not** merge it, and merging a feature PR does
> **not** publish. The publish happens on the merge of the bot's version PR — always.

## Routine release flow (after setup)

> **The one thing to remember: it takes TWO merges to publish.**
> Merging your feature PR does **not** publish. It only makes a bot open a second
> PR called **“chore: version packages”**. **Merging that second PR is what publishes to npm.**

### Why two merges?

The Release workflow runs on every push to `main` and looks at whether any
`.changeset/*.md` files are present:

| State of `main` | What Release does | Published? |
| --- | --- | --- |
| Changeset files present | Opens/updates the **“chore: version packages”** PR (bumps versions, writes CHANGELOGs, deletes the changeset files) | ❌ No |
| No changeset files | Runs `pnpm release` → `changeset publish` | ✅ Yes |

So the version PR is the thing that *consumes* the changesets. Until you merge it,
`main` still has them, and every push just regenerates that PR. A green Release run
that finishes in ~30s did **not** publish — it opened/updated the version PR.

### Step by step

**1. On your feature branch — describe the change.**

```bash
pnpm changeset
```

Pick the packages and bump type, write the summary. This creates `.changeset/<name>.md`, with the
summary exactly as typed — then open it and shape it to the template below, since the prompt takes one
line and the template needs a second paragraph. `pnpm docs-check` says whether it passes.
Remember it becomes the **public release note** — in the CHANGELOG on npm, in the GitHub Release,
and in the upgrade PR a consumer's Renovate or Dependabot opens. Write it for strangers, never name a
private consumer or its internal files, and follow [the template](#writing-the-release-note):
`pnpm docs-check` fails a note that does not.

**2. Commit, push, open a PR, merge it to `main`.** CI + E2E must be green.

**3. A bot opens (or updates) a PR titled “chore: version packages”** from branch
`changeset-release/main`. Its checks may show **“Action required”** — GitHub gates
workflow runs on bot-authored PRs. Click **Approve and run**.

**4. Review that PR — this is your last chance to check the version numbers.**
Open its diff and confirm the bumps in `packages/*/package.json` are what you intend.

> ⚠️ **How a release of `lk-core` moves `lk-react`.** lk-react declares
> `"@intellectif/lk-core": "workspace:^"` in `peerDependencies`, published as `^<version>`.
> `.changeset/config.json` sets `onlyUpdatePeerDependentsWhenOutOfRange`, so lk-react is
> released as a **major** exactly when lk-core leaves that range. On `0.x` every lk-core minor
> does (`^0.22.0` does not match 0.23.0); from 1.0 only a major does, and a 1.x minor or patch
> releases no lk-react at all. Without the option, Changesets majors lk-react on every lk-core
> minor, in range or not. `pnpm docs-check` runs `scripts/check-release-plan.mjs`, which proves
> the rule with the real CLI and fails if a Changesets upgrade changes it — the option sits
> under Changesets' "experimental, will change in patch" key, which is why `@changesets/cli` is
> pinned exactly. Decide *before* merging — npm versions are immutable.

**5. Merge the “chore: version packages” PR.** Release runs again, finds no changesets,
and publishes both packages to npm with provenance.

**6. Verify it actually landed:**

```bash
npm view @intellectif/lk-core version && npm view @intellectif/lk-react version
```

### Writing the release note

A changeset is read by someone deciding whether to upgrade, usually from a list. Lead with what they
need to decide, in this order:

```md
---
'@intellectif/lk-react': major
---

**Delivery policies**: decide per paper whether learners see feedback, solutions, hints and AI help.

**Action required:** none. No policy, no change — major only because the peer range moves to
`@intellectif/lk-core@^0.20.0`.

- `feedback: false` — no marks, no score, no authored feedback; `onComplete` still gets the grade.
- …the detail, as long as it needs to be.

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/delivery.md
```

`pnpm docs-check` (and CI) holds every pending changeset to it:

| Rule | Why |
|---|---|
| **The first paragraph is one line, starting with a bold headline** — at most 200 characters | It is the entry's headline in the CHANGELOG, the GitHub Release and a bot's PR. |
| **The second paragraph starts `**Action required:**`** — `none`, or what to do | The question every reader has, answered before the detail rather than in its last sentence. |
| **A major that requires nothing says why it is a major** | In this repository a `lk-react` major is usually just the `lk-core` peer bump, and reads as an alarm unless it says so. |
| **Links are full URLs** — no `docs/…md` paths, no relative links | The note is read on npm and in GitHub Releases, where a repository path links nowhere. |
| **It names only packages this repository publishes, with `major`, `minor` or `patch`** | A typo there would release the wrong thing, or nothing. |

What the check cannot see, the reviewer must: no private consumer named, nothing a stranger could not
act on, and the detail proportionate — a changeset is the record of one change, not its design
document. The design belongs in the guide it links to.

**Each entry links its pull request and commit.** `.changeset/config.json` uses
`@changesets/changelog-github`, which looks both up through the GitHub API when the version PR is
built. The Release job has the token it needs; running `pnpm version-packages` on your own machine
needs a `GITHUB_TOKEN` in the environment, for the same reason.

**Private workspace packages are never versioned** (`privatePackages` in the same file), so the demo
app and the Storybook do not appear in the version PR or the release notes.

### Checklist

- [ ] `pnpm changeset` written to [the template](#writing-the-release-note), and safe to publish publicly
- [ ] Feature PR green and merged to `main`
- [ ] “chore: version packages” PR checks approved (**Approve and run**) and green
- [ ] Version numbers in that PR reviewed — especially the `lk-react` major
- [ ] **That PR merged** ← this is the step that publishes
- [ ] `npm view …` shows the new versions

### If npm still shows the old version

Work through these in order:

1. **Is the “chore: version packages” PR still open?** If yes, that is the answer — merge it.
2. **Are changeset files still on `main`?** `git ls-tree --name-only origin/main:.changeset/` —
   anything besides `config.json` means the version PR has not been merged yet.
3. **Did the Release run on the merge of the version PR succeed?** Actions → Release. A ~30s
   green run that opened a PR is *not* a publish; look for the run that executed `pnpm release`.
4. **Trusted Publishing configured for the package?** A brand-new package name must be published
   manually once first (see One-time setup above).

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

## Known limitation: Release is not gated on CI

`ci.yml` and `release.yml` both trigger independently on `push: main`, and the release job has no
dependency on the CI job. GitHub's `needs:` only orders jobs **within one workflow**, so gating across
workflows requires restructuring Release to trigger on `workflow_run` (completed + conclusion == success)
instead of `push`. Until that is done:

- A red CI run does **not** block a publish.
  - Release runs its own `verify-release`, so a failure there stops the publish.
  - A check only CI runs does not: coverage, and E2E.
  - The safety net is the required status check on the PR. Keep `main` protected and never push to it directly.
- Practically this is low risk, because the two merges that matter (feature PR and the version PR) both
  run the full CI + E2E gate before you can merge them. Do not skip approving those checks on the bot PR.

## Grade-stability vectors

`packages/lk-core/vectors/scoring.json` freezes what lk-core's scoring functions return for a fixed set of
calls. It is replayed in three places:

- `src/__tests__/scoring-vectors.test.mjs`, against **source**, in `pnpm test`;
- `scripts/verify-dist.mjs`, against the **built** package — CJS and ESM — in `pnpm check-packaging`;
- CI, which runs both on Node 22 and on Node 24, the Node the Release job builds with, for every pull request
  including the bot's version PR.

**If a vector fails, do not regenerate the corpus to make it pass.** A failing vector means a grade someone
already stored would come out differently. Either the change is a bug, and the code is what needs fixing, or it
is intended, and then it is a **package major**: regenerate with
`node scripts/generate-vectors.mjs --accept-grade-change`, and say in the changeset what the change does to
grades already recorded and whether they should be recomputed.

To add a vector, add a case to `packages/lk-core/scripts/vector-cases.mjs`, build lk-core, and run
`node scripts/generate-vectors.mjs`. New vectors need no flag; an existing expectation cannot change or
disappear without it. Rewording a vector's `note` needs no flag either.

`pnpm test` also fails when the corpus and `vector-cases.mjs` disagree: a case that was never generated, a
vector deleted from `scoring.json` by hand, or a frozen call whose arguments no longer match its case. What it
cannot stop is removing a case and its vector together on purpose; that shows up as a deleted vector in review,
which is where a decision to stop pinning a grade belongs.

`vectors/replay.mjs` declares the **encoding** the corpus is written in, as `CORPUS_VERSION`, and `replay()`
throws rather than comparing a corpus written in another one. It is **2**: version 2 added the `{ "$bytes":
"<base64>" }` tag, so a vector can carry the bytes of a recording — `inspectWav` reads a WAV — and any other
view of an `ArrayBuffer` is refused at encode time instead of being frozen as an object of indices. Bumping it
is not a grade change and needs no `--accept-grade-change`: the version and `frozenFrom` are excluded from the
comparison, and no expectation moved with it. It does couple four files that must change together —
`replay.mjs`, the `CORPUS_VERSION` literal in `replay.d.mts`, a regenerated `scoring.json`, and this section —
and it means a consumer replaying the corpus must load the `replay.mjs` shipped beside it, which
`vectors/README.md` tells them to do. Say so in the changeset, because a consumer who pinned an older copy of
`replay.mjs` sees the throw on upgrade.

This does not change the limitation above: Release is not gated on CI. It does verify before it publishes.
`pnpm release` runs `verify-release` first, on Node 24:

- build, test, lint, typecheck, publint, attw and verify-dist, in one turbo run;
- then `api-check`, `docs-check` (the README's package table, the release-note template and every
  link between the docs) and `size`.

A moved grade therefore fails the Release job before `changeset publish`. That run is not the one a pull request
passes, though. CI splits those tasks into steps and runs `api-check` and `size` on Node 22 only. So the required
status checks on the feature PR and the version PR are still where a problem should first show, and a task that
reads another task's output without declaring it in `turbo.json` can pass them and fail only in Release.

## The validation corpus, and updating zod

`packages/lk-core/vectors/validation.json` freezes what every validator accepts and refuses, and the
`path` and `code` of each error, for over three thousand inputs built from its seeds by
`vectors/validation.mjs`. `src/__tests__/validation-vectors.test.mjs` replays it against source in
`pnpm test`, and `scripts/verify-dist.mjs` against the built package, CJS and ESM.

lk-core depends on **one exact version of zod**, deliberately. zod has changed what lk-core accepts
without a line of lk-core changing — the zod 4 preview in zod 3.25 counted string lengths in UTF-16
units and dropped a refused field from what later checks see, and zod 4.6 does neither — and a caret
range would hand a consumer such a change with no lk-core release at all. To update it:

1. Change the pin in `packages/lk-core/package.json`, `pnpm install`, `pnpm build`.
2. `pnpm test` in lk-core: the validation corpus and the grade corpus must both replay unchanged. Build a
   differential too, the published lk-core against the new build on inputs the corpus does not hold;
   the corpus is a floor, not a proof.
3. A difference is either a behaviour to restore in lk-core — as `maxUnits` and `parsedFields` restore
   the two above — or, if it is wanted, `node scripts/generate-validation-vectors.mjs
   --accept-validation-change` and a **major**, with the change named in the changeset.

To add cases, add seeds or rules in `vectors/validation.mjs`; new ids need no flag.

## Notes & troubleshooting

- `@intellectif/lk-react` declares `@intellectif/lk-core` as a `workspace:^` peer, which pnpm/Changesets rewrites to `^<version>` on publish.
  - `changeset publish` publishes every unpublished package at once, not core first, so lk-react's new version can reach npm moments before the lk-core version its peer range asks for.
  - If one of them fails to publish, re-run the Release job: `changeset publish` skips a version already on npm and publishes only the rest.
- Provenance: Trusted Publishing emits a signed provenance attestation automatically (visible on the npm package page) — extra supply-chain assurance for consumers, free.
- `403`/scope errors on first publish → the `@intellectif` scope/org doesn't exist or your account lacks write access to it.
- OIDC publish fails in CI → confirm the Trusted Publisher is configured for that exact package + repo + `release.yml`, the job has `id-token: write`, and npm is ≥ 11.5 (the Node 24 the workflow sets up ships with it; the workflow deliberately has no npm self-upgrade step).
- Token expiry / rotation: **not applicable** — there is no stored token by design.
- Never commit a real token; never use a 2FA-bypass token for routine automation; if you must use a token as a last resort, scope it to `@intellectif`, keep it short-lived, and remove it after.
