# Contributing to Learning Kit

Thanks for contributing! This guide covers local setup, the test suite, how to add a new activity type, and the PR process.

## Prerequisites

- **Node.js 22 or 24** (the versions CI runs)
- **pnpm 11+** (`npm install -g pnpm`)
- React 19 is used throughout.

## Local setup

```bash
git clone https://github.com/intellectif/learning-kit.git
cd learning-kit
pnpm install
pnpm build      # builds lk-core then lk-react (Turborepo respects ^build)
```

This is a pnpm + Turborepo monorepo:

```
packages/lk-core    Zod schemas, scoring engine, xAPI builder (framework-free)
packages/lk-react   React 19 components, hooks, ThemeProvider, optional skin
apps/lk-example-vite Vite + React demo (MSW mock LRS) — also the e2e target
docs/lk-storybook   Storybook 10
```

`@intellectif/lk-core` has no runtime dependency other than Zod; `@intellectif/lk-react` keeps `react`, `react-dom`, and `@intellectif/lk-core` as peers. Keep it that way.

## Running tests & checks

```bash
pnpm test       # Vitest unit + fast-check property tests (all packages)
pnpm coverage   # coverage; 80% gate globally, 100% for packages/lk-core/src/scoring
pnpm lint       # Biome (lint + format check)
pnpm build      # tsup build (ESM + CJS + d.ts)

# End-to-end (Playwright, Chromium) against the built Vite example:
pnpm turbo run build
pnpm exec playwright install chromium   # first time only
pnpm turbo run e2e
```

The gates CI enforces on a pull request (`.github/workflows/ci.yml` and `e2e.yml`):

```bash
pnpm turbo run build test lint   # Node 22 and 24
pnpm turbo run typecheck         # Node 22 and 24, tests included
pnpm check-packaging             # publint, are-the-types-wrong, verify-dist; Node 22 and 24
pnpm turbo run coverage          # Node 22
pnpm size                        # Node 22: bundle budgets
pnpm api-check                   # Node 22: the public API surface matches the committed report
pnpm turbo run e2e               # Node 22
```

`pnpm verify-release` is what `pnpm release` runs before publishing: build,
test, lint, typecheck, publint, attw and verify-dist in one turbo run, then
`api-check` and `size`, on Node 24 in the Release job. It is not the run a pull
request passes. CI splits those tasks into steps and runs `api-check` and `size`
on Node 22 only, so a task that reads another task's output without declaring it
in `turbo.json` can pass CI and still fail the release, as one did. Before
merging a change to the task graph, run `pnpm verify-release` in a clean
checkout, where no `dist` is left over to hide a missing dependency.

### The public API surface

`packages/*/api/surface.md` is the public type surface of each package, frozen
from the BUILT `.d.ts`. `pnpm api-check` fails when a build and the committed
report disagree.

**A diff is not an error** — it is the semver question asked while someone can
still answer it. A parameter becoming required, a return type narrowing, a field
leaving an exported interface: each passed every other check until a consumer's
build broke. When the report changes, run `pnpm api-report`, read the diff, and
commit it with the changeset that says whether it is a patch, a minor or a
major. Doc comments are stripped, so rewording JSDoc never fails the gate.

### Mutation testing the scoring engine

```bash
pnpm mutate                      # the whole scoring engine (~700 mutants)
pnpm mutate --filter text-match  # one file
pnpm mutate --limit 25           # a quick sample
```

100% coverage on `src/scoring/**` means every line RAN, not that anything would
notice if the line were wrong. `scripts/mutate.mjs` changes one operator or
literal at a time — placed with the TypeScript AST, so a `+` inside a string is
never touched — rebuilds lk-core through esbuild, and replays the
grade-stability corpus as the oracle. A mutant the corpus still accepts is a
**survivor**: a change to grading every test here would wave through.

Run it when you touch scoring, and triage every survivor. The honest answers
are: it does not reach a grade (feedback prose, an xAPI pattern), it is
equivalent, it is type-only, or **the corpus needs a vector** — add the case to
`packages/lk-core/scripts/vector-cases.mjs`, regenerate, and check the run
reports `0 changed`. Anything else means a stored grade just moved.

Conventions:

- **Biome** is the single linter/formatter (single quotes, 2-space, width 100, trailing commas). Run `pnpm exec biome check --write .` before committing. Suppressions must carry a justification comment.
- **Property tests** use `fast-check` (`numRuns: 100` min) and are tagged `Feature: learning-kit-sdk, Property N: …`.
- **Accessibility** is enforced: component tests include `vitest-axe`; e2e covers keyboard-only flows. No axe violations.
- TypeScript is strict (`exactOptionalPropertyTypes`, `isolatedModules`); imports use the `.js` extension (bundler resolution).

## Adding a new activity type

The architecture is contract-first; adding a type touches `lk-core` then `lk-react`:

1. **Types** — add the data/response interfaces to `packages/lk-core/src/types/activity.ts` and export them from `types/index.ts`. Extend `ActivityType` / `ActivityDataMap`.
2. **Schema** — add `packages/lk-core/src/schemas/<type>.ts` (Zod, importing `zod/v4`). Reuse `MediaSchema` / `FeedbackSchema` for the optional shared `media` / `feedback` fields. Export it from `schemas/index.ts` and add a JSON Schema export in `schemas/json-schema.ts`. Semantic rules that JSON Schema can't express go in `.refine()` (documented).
3. **Scoring** — add `packages/lk-core/src/scoring/activity-scorers/<type>.ts` and give it to the type's descriptor in `registry/builtins.ts`, which is how `score` and `evaluate` reach it. The scorer must be **pure and deterministic**, return `{ score∈[0,1], maxScore: 1, feedback: null, details }`, and reach **100% coverage**.
4. **Authoring** — add `packages/lk-core/src/authoring/<type>.ts` and put it on the descriptor as `authoring`: a `createDraft` that `validateDraft` reports as `incomplete` (never `invalid`), and a `checkDraft` that reports each problem at the path the schema reports it. Add every new code to `DRAFT_ISSUE_SEVERITY` in `authoring/issues.ts` and to the tables in `docs/authoring.md` — a test holds the two together — and extend the editor-shaped arbitraries in `authoring/__tests__/draft.property.test.ts`, which fail on any schema failure the checks do not name.
5. **Property tests** — add fast-check arbitraries and properties (score ∈ [0,1], determinism, classification round-trip).
6. **Vectors** — add the type's cases to `scripts/vector-cases.mjs` (every scoring path, every default a later release could "improve", every tie order the scorer pins), build, `node scripts/generate-vectors.mjs`, then `pnpm mutate --filter <type>` and triage every survivor in the PR. A type that ships without vectors has a grade nobody froze.
7. **Component** — add `packages/lk-react/src/components/<Type>/<Type>.tsx` implementing `ActivityProps<…>`: `'use client'`, dev-only `validateActivity` at the boundary, reset-on-`data`-change (Req 3.7), `onInteraction`/`onComplete`, anonymous actor + `urn:` object id, render optional `media` (`ActivityMedia`) and overall `feedback`. Wrap it in `ActivityErrorBoundary` in `index.tsx`. A component that renders a revealed projection (`redact(data, { reveal: 'after-submit' })`, which carries `redacted: true` AND the answer key) gates its boundary check on the key, not on the marker — `assertRedacted` refuses such a projection by design.
8. **Wire it up** — add a tsup entry, a package `exports` subpath, the barrel re-export, and a `data.type` branch in both `ActivitySequence` and `ActivityPreview`.
9. **Tests & stories** — RTL + axe unit tests, Storybook stories, and (ideally) a Playwright flow. Keep coverage ≥ 80%.
10. **Join every per-type enumeration** — the lists a new type must appear in, none of which fails on its own when one is missed: `types/index.ts` exports, `registry/index.ts` exports, `schemas/index.ts` (schema, JSON Schema, redacted schema and type, the `RedactedActivity` union), `scripts/verify-dist.mjs` in both packages, `create-draft.test.ts` `BUILT_IN`, `draft.property.test.ts` `BUILT_IN` / `EDITOR_DRAFTS` / `RESPONSES`, `redacted-types.test.ts`, `registry.test.ts`, the example app's sample data, `.size-limit.json`, `public-surface.test.ts`, the i18n coverage sweep and `docs/i18n.md`, `docs/styling.md`, `docs/upgrading.md`'s table, both READMEs, and the "New drafts" table in `docs/authoring.md`.
11. **Specs** — update `requirements.md` / `design.md` / `tasks.md` and add a changeset.

A type that lives outside this repository needs none of the above: `defineActivityType` and `registerActivityType` register it at runtime, a module augmentation of `ActivityDataMap` and `LearnerResponseMap` lets TypeScript accept its type name, and a `renderers` entry puts it on screen — see [Custom activity types](./docs/authoring.md#custom-activity-types-end-to-end).

## Pull request process

1. Branch from `main`.
2. Make focused changes; keep `lk-core` framework-free and the peer-dependency surface minimal.
3. Run the full gate locally: `pnpm turbo run build lint test coverage e2e` — it must be green.
4. Add a changeset describing the change and the semver impact:
   ```bash
   pnpm changeset
   ```
   It asks for the packages and the bumps, and writes `.changeset/<name>.md` with whatever summary you
   typed. That file is the public release note, so edit it to
   [the template](./docs/releasing.md#writing-the-release-note) — a bold one-line headline, then
   `**Action required:**` (`none`, or what to do), then the detail with full links — and run
   `pnpm docs-check`, which CI runs too and which fails a note that does not follow it.
5. Open the PR. CI runs the build/test/lint matrix (Node 22 & 24), coverage, bundle-size limits, packaging checks including lk-core's grade-stability corpus, and Playwright e2e. The PR must pass all checks and keep coverage thresholds.
6. On merge to `main`, the Changesets release workflow versions and publishes affected packages.

## Reporting issues

Open a GitHub issue with a minimal reproduction (ideally a failing test or a snippet of `ActivityData`). For accessibility issues, include the axe rule id or the assistive-tech behavior observed.
