# Releasing & publishing to npm

The packages published from this monorepo are `@intellectif/lk-core` and `@intellectif/lk-react` (the `lk-server` / `lk-ai` stubs and the apps/docs/example are private and never published).

Versioning is driven by [Changesets](https://github.com/changesets/changesets). `.changeset/config.json` sets `access: public` (required for scoped `@intellectif/*` packages) and base branch `main`.

## Prerequisites (one-time)

1. **An npm account** that can publish under the `@intellectif` scope:
   - Create/own the npm **org or scope** named `intellectif` (npmjs.com → *Add Organization*, free for public packages), or publish from a user account that owns the `@intellectif` scope.
2. **An npm access token** (see below).

### Creating the npm token (`NPM_TOKEN`)

1. Log in at <https://www.npmjs.com> → avatar → **Access Tokens** → **Generate New Token**.
2. Choose **Granular Access Token** (recommended):
   - **Expiration:** your policy (e.g. 90 days).
   - **Packages and scopes:** Read and write → scope `@intellectif`.
   - **Permissions:** *Read and write* (publish).
3. Generate and **copy the token** (`npm_…`) — it is shown only once.

> Classic "Automation" tokens also work and don't expire, but granular tokens are preferred.

## Option A — Publish via GitHub Actions (recommended)

`.github/workflows/release.yml` already runs `changesets/action@v1` on every push to `main`. It:
- opens/updates a **"chore: version packages"** PR that applies pending changesets and bumps versions; and
- when that PR is merged, runs `pnpm release` (`turbo run build && changeset publish`) to publish to npm.

Set it up:

1. **Add the npm token as a repo secret.** GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `NPM_TOKEN` (exactly — `.npmrc` and `release.yml` reference `${NPM_TOKEN}` / `secrets.NPM_TOKEN`).
   - Value: the `npm_…` token.
2. **Allow Actions to open PRs.** Settings → **Actions → General → Workflow permissions** → select **Read and write permissions** and check **Allow GitHub Actions to create and approve pull requests** (Changesets opens the version PR via the built-in `GITHUB_TOKEN`).
3. **Release flow:**
   ```bash
   # for every change, on your feature branch:
   pnpm changeset            # pick packages + bump type, write a summary
   git add .changeset && git commit -m "chore: changeset" && git push
   ```
   Merge the feature PR to `main` → the workflow opens a **"chore: version packages"** PR → review & merge it → packages publish automatically.

No local npm login is needed; the token lives only in the GitHub secret.

## Option B — Manual publish from your machine (gitbash)

Use this for the very first release or if you are not using CI.

```bash
# 1. Make sure main is clean, installed, and green
pnpm install
pnpm turbo run build lint test coverage e2e

# 2. Apply pending changesets → bumps versions + writes CHANGELOG.md
pnpm version-packages
git add -A && git commit -m "chore: version packages"

# 3. Authenticate npm for this shell (token from the step above).
#    The repo .npmrc already contains:
#      //registry.npmjs.org/:_authToken=${NPM_TOKEN}
#    so just export the token (gitbash):
export NPM_TOKEN=npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

#    (Alternative instead of the export: `npm login` once, then
#     publish with `pnpm -r publish --access public` instead of step 4.)

# 4. Build and publish (changeset publish respects access:public)
pnpm release

# 5. Push the version commit and the tags changeset created
git push --follow-tags
```

Verify on npm:

```bash
npm view @intellectif/lk-core version
npm view @intellectif/lk-react version
```

### First-publish notes

- The first publish of a scoped package must be public: this is handled by `.changeset/config.json` `access: public` (equivalently `npm publish --access public`). If npm rejects with *"402 Payment Required"* or *"private"*, confirm the `@intellectif` scope/org exists and the token has write access to it.
- `@intellectif/lk-react` declares `@intellectif/lk-core` as a `workspace:^` peer; on publish pnpm/Changesets rewrites it to the real `^<version>`. Publish order is handled by `changeset publish` (core before react).
- Ensure `main` builds: `pnpm release` runs `turbo run build` first and will abort the publish if the build fails.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ENEEDAUTH` / 401 on publish | `NPM_TOKEN` not exported (local) or secret missing/typo (CI). The name must be exactly `NPM_TOKEN`. |
| `403 Forbidden` on `@intellectif/...` | Token lacks write access to the `@intellectif` scope, or the scope/org doesn't exist yet. |
| Changesets PR not created in CI | Enable *Read and write permissions* + *Allow Actions to create PRs* (see Option A step 2). |
| Nothing publishes after merging the version PR | There were no pending changesets, or versions were already published. Run `pnpm changeset` and repeat. |
| `git push --follow-tags` rejected | Pull/rebase `main` first; never force-push `main`. |
