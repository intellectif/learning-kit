# Contributing to Learning Kit

Thanks for contributing! This guide covers local setup, the test suite, how to add a new activity type, and the PR process.

## Prerequisites

- **Node.js 20 or 22** (the CI matrix; Vite 8 requires `^20.19 || >=22.12`)
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

The full gate that CI enforces:

```bash
pnpm turbo run build lint test coverage e2e
```

Conventions:

- **Biome** is the single linter/formatter (single quotes, 2-space, width 100, trailing commas). Run `pnpm exec biome check --write .` before committing. Suppressions must carry a justification comment.
- **Property tests** use `fast-check` (`numRuns: 100` min) and are tagged `Feature: learning-kit-sdk, Property N: …`.
- **Accessibility** is enforced: component tests include `vitest-axe`; e2e covers keyboard-only flows. No axe violations.
- TypeScript is strict (`exactOptionalPropertyTypes`, `isolatedModules`); imports use the `.js` extension (bundler resolution).

## Adding a new activity type

The architecture is contract-first; adding a type touches `lk-core` then `lk-react`:

1. **Types** — add the data/response interfaces to `packages/lk-core/src/types/activity.ts` and export them from `types/index.ts`. Extend `ActivityType` / `ActivityDataMap`.
2. **Schema** — add `packages/lk-core/src/schemas/<type>.ts` (Zod, importing `zod/v4`). Reuse `MediaSchema` / `FeedbackSchema` for the optional shared `media` / `feedback` fields. Register it in `schemas/index.ts` (`schemaMap`) and add a JSON Schema export in `schemas/json-schema.ts`. Semantic rules that JSON Schema can't express go in `.refine()` (documented).
3. **Scoring** — add `packages/lk-core/src/scoring/activity-scorers/<type>.ts`, dispatch it from `scoring/index.ts`. The scorer must be **pure and deterministic**, return `{ score∈[0,1], maxScore: 1, feedback: null, details }`, and reach **100% coverage**.
4. **Property tests** — add fast-check arbitraries and properties (score ∈ [0,1], determinism, classification round-trip).
5. **Component** — add `packages/lk-react/src/components/<Type>/<Type>.tsx` implementing `ActivityProps<…>`: `'use client'`, dev-only `validateActivity` at the boundary, reset-on-`data`-change (Req 3.7), `onInteraction`/`onComplete`, anonymous actor + `urn:` object id, render optional `media` (`ActivityMedia`) and overall `feedback`. Wrap it in `ActivityErrorBoundary` in `index.tsx`.
6. **Wire it up** — add a tsup entry, a package `exports` subpath, the barrel re-export, and a `data.type` branch in `ActivitySequence`.
7. **Tests & stories** — RTL + axe unit tests, Storybook stories, and (ideally) a Playwright flow. Keep coverage ≥ 80%.
8. **Specs** — update `requirements.md` / `design.md` / `tasks.md` and add a changeset.

The full plugin/registry architecture (`registerActivity`) is Phase 3 — for now new types are added in-tree as above.

## Pull request process

1. Branch from `main`.
2. Make focused changes; keep `lk-core` framework-free and the peer-dependency surface minimal.
3. Run the full gate locally: `pnpm turbo run build lint test coverage e2e` — it must be green.
4. Add a changeset describing the change and the semver impact:
   ```bash
   pnpm changeset
   ```
5. Open the PR. CI runs the build/test/lint matrix (Node 20 & 22), coverage, bundle-size limits, and Playwright e2e. The PR must pass all checks and keep coverage thresholds.
6. On merge to `main`, the Changesets release workflow versions and publishes affected packages.

## Reporting issues

Open a GitHub issue with a minimal reproduction (ideally a failing test or a snippet of `ActivityData`). For accessibility issues, include the axe rule id or the assistive-tech behavior observed.
