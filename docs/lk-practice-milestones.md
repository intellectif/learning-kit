# `@intellectif/lk-practice` - milestones

**Status:** plan, 2026-11-01. Each milestone is one branch and one pull request that leaves `main` releasable.
**Inputs:** [the requirements](lk-sdk-practice-requirements.md) (what and why) and [the design](lk-practice-design.md) (how). File-level wiring is in [the design, "Repository wiring"](lk-practice-design.md#11-repository-wiring).

---

## How every milestone runs

1. Branch from an up-to-date local `main`, one branch per milestone, with the branch name given below.
2. Do the checklist; keep the requirements and design in step if a decision changes (mark it revised).
3. Run the gates locally on Node 24: `pnpm install`, `pnpm verify-release` (build, test, lint, typecheck, publint, attw, verify-dist, `lint:repo`, `api-check`, `docs-check`, `size`).
4. Commit, push, open the pull request with `gh`, wait for CI (Node 24 and Node 22 legs), merge, and pull `main`.

Commands, with `<branch>` and `<title>` from the milestone:

| Command | What and why |
|---|---|
| `git switch main && git pull` | Start from the merged remote state. |
| `git switch -c <branch>` | One branch per milestone. |
| `git add <files>` | Stage only the milestone's files (never unrelated untracked docs). |
| `git commit -m "<title>"` | Conventional-commit title, as the repository's history uses. |
| `git push -u origin <branch>` | Publish the branch. |
| `gh pr create --base main --title "<title>" --body "<summary, gates run, Node 22 note>"` | Open the pull request. |
| `gh pr checks --watch` | Wait for CI. |
| `gh pr merge --merge --delete-branch` | Merge with a merge commit, as the history shows, and delete the branch. |
| `git switch main && git pull` | Bring the merge back to local `main`. |

**Changesets.** While the package is `"private": true` (M1-M8), `scripts/check-changesets.mjs` skips it and no changeset is needed for its files. Changes to repository tooling (`ci.yml`, `scripts/*.mjs`) need none either, as before. M9 and M10 add one each.

---

## Summary

| Milestone | Branch | Scope | Changeset |
|---|---|---|---|
| M0 | `docs/lk-practice-design` | Requirements revision, design, milestones | none (docs only) |
| M1 | `feat/lk-practice-scaffold` | Private package skeleton and CI wiring | none (private) |
| M2 | `feat/lk-practice-domain` | Domain types, canonical JSON, FNV-1a, graph and item validation, extensions, `composeGraph` | none (private) |
| M3 | `feat/lk-practice-fsrs` | FSRS-7 memory adapter on `ts-fsrs` `6.0.0` | none (private) |
| M4 | `feat/lk-practice-evidence` | Elo, evidence mapping, stage policy, implication rule, mastery predicate; `mutate.mjs` generalised | none (private) |
| M5 | `feat/lk-practice-log` | Log entries, `record`, `act`, `replay`, `replayFrom`, held and out-of-order evidence, events, status, `migrateState` | none (private) |
| M6 | `feat/lk-practice-planner` | `plan` | none (private) |
| M7 | `feat/lk-practice-contracts` | Grader, generator with proof gate, decomposition contracts | none (private) |
| M8 | `feat/lk-practice-testing` | `./testing` simulator, `vectors/replay.mjs`, purity over all vectors, benchmark | none (private) |
| M9 | `feat/lk-practice-release` | Public `0.1.0`: docs, README rows, size limits, first publish | minor (`0.0.0` to `0.1.0`) |
| M10 | `feat/lk-practice-lk-core-adapter` | `./lk-core` structural adapter and contract test | minor |
| Later | - | Graph credit, `costAdr`, hierarchical ability, `fsrs-6` option, `1.0.0` | per item |

---

## M0 - Requirements, design and milestones

- **Branch:** `docs/lk-practice-design`. **Title:** `docs: lk-practice requirements, design and milestones`.
- **Scope:** the three documents. No package code.
- **Files:** `docs/lk-sdk-practice-requirements.md` (new in git; revised in place), `docs/lk-practice-design.md`, `docs/lk-practice-milestones.md`.
- **Tasks:**
  - [x] Revise the requirements for the generative flow (new D14-D28; revised D1, D2, D4, D7, D9, D11, D13; Appendices A and B rewritten as generic host scenarios).
  - [x] Write the design and this plan.
  - [x] Apply the design review: plain-data configuration and hash (D26), ability per skill and stage (D27), spaced promotion and mastery successes (D4), `slowSeconds` (D7), stage demand and equivalent stages (R3.8, D28), per-skill generation facts (R9.1), the `mastered` flag (R3.5) and the `plan` cost note (R12.4).
  - [ ] Review and merge.
- **Gates:** `pnpm docs-check`; `pnpm lint:repo`.
- **Acceptance:** the three documents merged; links and anchors resolve.
- **Changeset:** none.

## M1 - Scaffold and wiring

- **Branch:** `feat/lk-practice-scaffold`. **Title:** `chore: scaffold the private lk-practice package`.
- **Scope:** an empty, private, buildable package that passes every gate, and the Node 22 CI filter.
- **Files:** `packages/lk-practice/{package.json, tsdown.config.ts, tsconfig.json, tsconfig.typecheck.json, vitest.config.ts, LICENSE, scripts/verify-dist.mjs, src/index.ts, src/__tests__/purity.test.ts, api/surface.md}`; `scripts/api-report.mjs` (`PACKAGES`); `.github/workflows/ci.yml` (Node 22 leg); `pnpm-lock.yaml`.
- **Tasks:**
  - [ ] Copy the `lk-azure` package files and adapt them (name, `private: true`, `engines >=24`, exports `.` only for now; `./testing` and `./lk-core` arrive with their milestones).
  - [ ] `verify-dist.mjs`: required exports, ESM and CJS equality, the static purity scan, no `@intellectif/lk-core` in `dist/`.
  - [ ] Add the package to `api-report.mjs` `PACKAGES`; run `pnpm api-report`.
  - [ ] Add `--filter=!@intellectif/lk-practice` to the Node 22 turbo command.
  - [ ] Check on Node 22 whether `pnpm install` warns about the engine; note the result in the pull request (R13.5).
  - [ ] Confirm `turbo.json` and `biome.json` need no change.
- **Gates:** `pnpm verify-release` on Node 24; the CI Node 22 leg green with the filter.
- **Acceptance:** the package builds to an empty, pure `dist/`; nothing is publishable (`private`).
- **Changeset:** none.

## M2 - Domain types, determinism, graph

- **Branch:** `feat/lk-practice-domain`. **Title:** `feat: lk-practice domain types, canonical hashing and graph validation`.
- **Scope:** design 5.1, 5.5 (types only), 5.6-5.8 types; `determinism/`; `graph/`; `config.ts` (`resolveConfig`, `configHash`).
- **Files:** `src/types.ts`, `src/config.ts`, `src/determinism/*`, `src/graph/*`, tests, `vectors/graph.json`, `api/surface.md`.
- **Tasks:**
  - [ ] `canonicalJson` and `fnv1a64` with published FNV-1a 64 test values.
  - [ ] `validateGraph`, `validateItems` with every issue code of 8.10 that applies, including `STAGE_NO_EQUIVALENT`, `STAGE_DEMAND_*` and `ITEM_TIMING_ORDER`.
  - [ ] Stage demand resolution and equivalent stages (`graph/stages.ts`, R3.8).
  - [ ] `resolveConfig` produces plain data with `PolicyRef`s; `CONFIG_CONFLICT`, `CONFIG_INVALID`; `configHash` vectors for default and custom configurations, and a test that no function reaches canonical JSON (D26).
  - [ ] Extension rules (R2.6) and `composeGraph` with version derivation (8.9).
  - [ ] Type tests with `exactOptionalPropertyTypes`.
- **Gates:** coverage 80%; `api-check`.
- **Acceptance:** criterion 1.
- **Changeset:** none.

## M3 - FSRS-7 adapter

- **Branch:** `feat/lk-practice-fsrs`. **Title:** `feat: lk-practice FSRS-7 memory model on ts-fsrs 6`.
- **Scope:** `memory/port.ts`, `memory/fsrs.ts` (8.4); `"ts-fsrs": "6.0.0"` (or the newest 6.x patch at build time, pinned exactly).
- **Files:** `packages/lk-practice/package.json`, `pnpm-lock.yaml`, `src/memory/*`, `vectors/memory.json`, tests.
- **Tasks:**
  - [ ] Pin the short-term configuration (learning steps `1m`, `10m`; relearning `10m`; maximum interval 36,500 days; fuzz off) as package defaults.
  - [ ] Fix the serialized memory field list from the library's types (plain numbers); document it in the design.
  - [ ] `retrievability` through `curve` from `ts-fsrs/models/fsrs-7`, weights checked once with `checkFSRS7Parameters` (R4.9a); vectors against the scheduler's own retrievability.
  - [ ] Decide per-stage retention handling (one scheduler per retention value if needed).
  - [ ] Generate `memory.json` from the pinned library, including the spike's intervals.
  - [ ] `verify-dist`: no exported type names `ts-fsrs`.
- **Gates:** `size` measured (not yet in `.size-limit.json`); vectors exact on Node 24.
- **Acceptance:** criterion 3.
- **Changeset:** none.

## M4 - Ability, evidence, stages, mastery

- **Branch:** `feat/lk-practice-evidence`. **Title:** `feat: lk-practice Elo ability, evidence mapping, stage policy and mastery`.
- **Scope:** `mastery/*`, `evidence/*`, `stage/*` (8.2, 8.3, 8.5); generalise `scripts/mutate.mjs`.
- **Files:** those modules and tests, `vectors/evidence.json`, `vectors/stage.json`, `scripts/mutate.mjs`, `vitest.config.ts` (100% thresholds).
- **Tasks:**
  - [ ] Elo against hand-computed values; ability per stage and `derive` with `stageOffset` (8.5, D27).
  - [ ] Every R7.2 row (including `slowSeconds`) and R7.4 branch, the weight floor, `pending`, `SKILL_NOT_IN_TASK`.
  - [ ] Implication rule table (8.2) on equivalent stages, including a cross-ladder task; spaced (counted) successes, the due cap, promotion and demotion.
  - [ ] Mastery predicate conditions (a)-(d) with spaced top-stage successes and the failing condition reported.
  - [ ] `mutate.mjs` takes the package and module list; `lk-core`'s run unchanged.
- **Gates:** 100% coverage on the gated modules; `pnpm mutate` on them.
- **Acceptance:** criterion 4.
- **Changeset:** none.

## M5 - Log, record, replay

- **Branch:** `feat/lk-practice-log`. **Title:** `feat: lk-practice log, record, replay and host actions`.
- **Scope:** `log/*`, `practice.ts` (`createPractice`, `record`, `act`, `replay`, `replayFrom`, `status`, `reconcile`), `status/*`, `schema/*` (state v1, `migrateState`), events (8.1, 8.7, 7).
- **Files:** those modules and tests, `vectors/log.json` (revised in M5: not `replay.json`, beside the `replay.mjs` runner), `scripts/log-vectors.mjs`.
- **Tasks:**
  - [ ] `applyEntry` as the single transition; rolling log hash.
  - [ ] Duplicate, out-of-order and confirmation `replay-required` paths; look-ahead confirmation in replay.
  - [ ] Host actions `prior` (at a stage), `place`, `suspend`, `unsuspend`, `discard-held`, `reset-skill`; host entries evaluate mastery and unlocks.
  - [ ] The `mastered` flag: `skill.mastery-lost` after decay at the next entry, `masteryLapsed` in `status` (R3.5).
  - [ ] `STATE_CONFIG_MISMATCH`, `GRAPH_VERSION_MISMATCH`, `REPLAY_CHECKPOINT_TOO_NEW`.
  - [ ] Property tests: replay equals record, any checkpoint, any arrival order; deep-frozen inputs; random JSON into `migrateState`.
- **Gates:** property runs at least 100; coverage.
- **Acceptance:** criteria 2, 5, 10, 13.
- **Changeset:** none.

## M6 - Planner

- **Branch:** `feat/lk-practice-planner`. **Title:** `feat: lk-practice planner`.
- **Scope:** `planner/*` (8.6).
- **Files:** those modules and tests, `vectors/plan.json`.
- **Tasks:**
  - [ ] Tiers, caps, backlog rule, focus set.
  - [ ] Difficulty targeting from the target stage's ability (including after a promotion), item matching with cooldown and proof, coalescing on equivalent stages.
  - [ ] Retrievability computed only where a tier needs it (8.6).
  - [ ] Budget fill, interleaving, target ids and tie keys.
- **Gates:** 100% on planner selection; mutation; property tests.
- **Acceptance:** criteria 6, 7, 8, 9.
- **Changeset:** none.

## M7 - Contracts

- **Branch:** `feat/lk-practice-contracts`. **Title:** `feat: lk-practice grader, generator and decomposition contracts`.
- **Scope:** `contracts/*` (8.8); JSON Schemas for host model output.
- **Files:** those modules and tests, `vectors/contracts.json`, `src/schema/json.ts`.
- **Tasks:**
  - [ ] `checkGradeResult`, `evidenceFromGrade`.
  - [ ] `generationRequest` with per-skill facts (stage, forms, expected success, reference difficulty, criteria hint), `checkCandidates` (including `CANDIDATE_CRITERIA_MISSING`), `admitCandidate` (proof gate).
  - [ ] `decompositionRequest`, `checkDecomposition`, `admitExtension`.
  - [ ] Appendix A decomposition and a starter-fails, solution-passes proof as vectors.
- **Gates:** property test: an `unproven` item is never planned or recorded.
- **Acceptance:** criteria 11, 12.
- **Changeset:** none.

## M8 - Testing subpath and vectors runner

- **Branch:** `feat/lk-practice-testing`. **Title:** `feat: lk-practice testing subpath, vectors runner and benchmark`.
- **Scope:** `./testing` export (simulated learner), `vectors/replay.mjs`, the runtime purity trap over all vectors, `bench/plan.bench.mjs`.
- **Files:** `src/testing/*`, `package.json` (exports), `vectors/replay.mjs`, `scripts/verify-dist.mjs`, `bench/`, `api/surface.md`.
- **Tasks:**
  - [ ] Seeded simulator over 90 simulated days; report policy comparisons, including `stageOffset` 0, 0.5 and 1.
  - [ ] `replay.mjs` runs every vector file against `dist/`. (revised in M5) It already replays `log.json` against src/; its `ENTRY` also names internal functions (`abilityAt`, `updateAbility`, `createStagePolicy` and others) that `dist/` does not export, so this task decides whether `./testing` exposes them or the `dist/` run covers the public functions only.
  - [ ] Benchmark against R12.4 (including `plan` at 2,000 skills and 10,000 items); record numbers in the pull request and in R12.4; if `plan` misses, apply the design 8.6 fallback.
- **Gates:** all vectors pass with the purity trap installed.
- **Acceptance:** criterion 14.
- **Changeset:** none.

## M9 - Release `0.1.0`

- **Branch:** `feat/lk-practice-release`. **Title:** `feat: release lk-practice 0.1.0`.
- **Scope:** make the package public and document it.
- **Files:** `packages/lk-practice/package.json` (remove `private`), `packages/lk-practice/README.md`, `docs/practice.md`, `README.md` (Packages table), `CONTRIBUTING.md`, `docs/releasing.md` (§3a), `docs/stability.md`, `docs/roadmap.md` (§4, §5), `scripts/check-doc-imports.mjs` (`PACKAGES`), `.size-limit.json`, `.changeset/lk-practice-initial.md`.
- **Tasks:**
  - [ ] Write the README and guide with real imports (now checked by `docs-check`).
  - [ ] Size limits from the build with headroom (root budget around 25 kB gzip).
  - [ ] Changeset: `'@intellectif/lk-practice': minor` with the release-note template.
  - [ ] After the version PR, publish `0.1.0` by hand from the version-PR branch as `docs/releasing.md` §3a describes (first publish cannot use trusted publishing); then configure trusted publishing.
- **Gates:** `pnpm verify-release`; `check-readme-packages` and `check-changesets` now apply.
- **Acceptance:** criterion 15; the package installs from npm on Node 24.
- **Changeset:** minor, `0.0.0` to `0.1.0`.

## M10 - `./lk-core` adapter

- **Branch:** `feat/lk-practice-lk-core-adapter`. **Title:** `feat: lk-practice lk-core adapter`.
- **Scope:** `./lk-core` subpath (design 5.10): `evidenceFromOutcome`, `skillOutcomesFromCriteria`; the contract test with `@intellectif/lk-core` as a devDependency.
- **Files:** `src/adapters/lk-core/*`, `package.json` (exports), `.size-limit.json`, `api/surface.md`, `scripts/verify-dist.mjs` (new export), `.changeset/lk-practice-lk-core-adapter.md`, docs.
- **Tasks:**
  - [ ] Map every `ItemOutcome` status and `CriterionScore` case (R7.7); routed-to-person and deferred to `pending`.
  - [ ] Type test: structural types accept the real `lk-core` types; runtime test over real `evaluate` outputs.
  - [ ] Appendix B example type-checks against the built package.
- **Gates:** `verify-dist`: still no `@intellectif/lk-core` import in `dist/`; not added to `check-release-plan.mjs`.
- **Acceptance:** criteria 16, 17, 18.
- **Changeset:** minor.

## Later

| Item | Trigger |
|---|---|
| Graph credit (Phase 3, D6) | Simulation shows a benefit; opt-in, capped. |
| `costAdr` option | Measured task times from real hosts. |
| Hierarchical ability (D25) | Enough learners with placement data to fit it. |
| `fsrs-6` model id | A host needs it. |
| `1.0.0` | Criteria 19 and 20: frozen API, stability section, migrations, 60 and 30 days of dogfooding. |
