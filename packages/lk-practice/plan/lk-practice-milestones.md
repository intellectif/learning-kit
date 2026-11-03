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
- **As built (revised in M6):** `src/planner/` (`keys`, `request`, `tiers`, `match`, `order`, `plan`), `vectors/plan.json` from `scripts/plan-vectors.mjs` (`vectors:plan`), and the `plan` kind in `vectors/replay.mjs`. `planner/` is in the 100% coverage gate and runs with `pnpm mutate --package lk-practice --modules planner`. The choices the design left open are listed under "As built in M6" in design 8.6.
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
- **As built (revised in M7):** `src/contracts/` (`grade`, `generate`, `decompose`), the schema objects in `src/schema/` (`standard`, `schemas`, `json`, `copy`; the JSON Schemas are generated from the shapes the checks run), `vectors/contracts.json` from `scripts/contracts-vectors.mjs` (`vectors:contracts`), and the `contracts` kind in `vectors/replay.mjs`. `contracts/` is in the 100% coverage gate and runs with `pnpm mutate --package lk-practice --modules contracts`. The choices the design left open are listed under "As built in M7" in design 8.8, and the new issue codes in 8.10.
- **Changeset:** none.

## M8 - Testing subpath and vectors runner

- **Branch:** `feat/lk-practice-testing`. **Title:** `feat: lk-practice testing subpath, vectors runner and benchmark`.
- **Scope:** `./testing` export (simulated learner), `vectors/replay.mjs`, the runtime purity trap over all vectors, `bench/plan.bench.mjs`, `exportReviewHistory` (R4.8; revised in M6).
- **Files:** `src/testing/*`, `package.json` (exports), `vectors/replay.mjs`, `scripts/verify-dist.mjs`, `bench/`, `api/surface.md`.
- **Tasks:**
  - [ ] Seeded simulator over 90 simulated days; report policy comparisons, including `stageOffset` 0, 0.5 and 1.
  - [ ] `replay.mjs` runs every vector file against `dist/`. (revised in M5) It already replays `log.json` against src/; its `ENTRY` also names internal functions (`abilityAt`, `updateAbility`, `createStagePolicy` and others) that `dist/` does not export, so this task decides whether `./testing` exposes them or the `dist/` run covers the public functions only.
  - [ ] (revised in M6) `exportReviewHistory(entries, graph, learnerId)` (R4.8, design 5.9): replay the log and return, per skill and stage, the ordered reviews with rating and timestamp; vectors in `vectors/log.json`. Assigned here because the simulator produces the long histories it is meant to export.
  - [ ] Benchmark against R12.4 (including `plan` at 2,000 skills and 10,000 items); record numbers in the pull request and in R12.4; if `plan` misses, apply the design 8.6 fallback.
- **Gates:** all vectors pass with the purity trap installed.
- **Acceptance:** criterion 14.
- **As built (revised in M8):** `src/testing/` (`simulateLearner`, the `./testing` entry), `src/log/history.ts` (`exportReviewHistory`, returning the history or the replay's issues), `bench/plan.bench.mjs` (`pnpm bench`) and `bench/simulate.mjs` (`pnpm simulate`). The `replay.mjs` question is decided for the public functions only: `verify-dist` replays over both builds the 148 vectors whose functions the root entry exports, and all 185 replay on `src/` under the trap (design 5.10). The benchmark found `plan` at 1.6 s and `record` and `replay` growing with the state; the fixes are in design 8.6 and the numbers in R12.4, where `replay` still misses its target (design 13).
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
- **As built (revised in M9):** the package is public, with `README.md` and `docs/practice.md`.
  - Repository wiring: the README row, `CONTRIBUTING.md`, `docs/releasing.md` §3a,
    `docs/stability.md` ("Practice planning"), `docs/roadmap.md` §4 and §5 (D3), and
    `scripts/check-doc-imports.mjs`.
  - Size budgets: the root at 43 kB, `createPractice` at 39 kB and `./testing` at 2 kB, brotli
    (R12.5).
  - `.changeset/lk-practice-initial.md`.
  - These three documents moved to `packages/lk-practice/plan/` (D11).
  - The feature PR merges after the previous version PR's Release run; the first publish is by hand,
    from the version PR (`docs/releasing.md` §3a).
  - The pre-release audit found mastery unreachable with the defaults, so no hard dependent
    unlocked: mastery checks fix it (R3.5, design 8.1 and 8.6), with `reason.masteryCheck`, unit
    tests, log and plan vectors, and `src/testing/__tests__/outcomes.test.ts` for the whole loop.
    The guide's `duplicate` row now says `record` sees only the last `recentIdWindow` ids.
- **Changeset:** minor, `0.0.0` to `0.1.0`.

## M10 - `./lk-core` adapter

- **Branch:** `feat/lk-practice-lk-core-adapter`. **Title:** `feat: lk-practice lk-core adapter`.
- **Scope:** `./lk-core` subpath (design 5.10): `evidenceFromOutcome`, `skillOutcomesFromCriteria`; the contract test with `@intellectif/lk-core` as a devDependency.
- **Files:** `src/adapters/lk-core/*`, `package.json` (exports), `.size-limit.json`, `api/surface.md`, `scripts/verify-dist.mjs` (new export), `.changeset/lk-practice-lk-core-adapter.md`, docs.
- **Tasks:**
  - [x] Map every `ItemOutcome` status and `CriterionScore` case (R7.7); routed-to-person and deferred to `pending`.
  - [x] Type test: structural types accept the real `lk-core` types; runtime test over real `evaluate` outputs.
  - [x] Appendix B example type-checks against the built package.
- **Gates:** `verify-dist`: still no `@intellectif/lk-core` import in `dist/`; not added to `check-release-plan.mjs`.
- **Acceptance:** criteria 16, 17, 18.
- **As built (revised in M10):** `src/adapters/lk-core/` (the `./lk-core` entry), the contract test against the real lk-core, the `outcome` vectors in `contracts.json` (made by lk-core in `scripts/contracts-vectors.mjs`), the Appendix B placement flow in `log.json` (criterion 17), and `examples/appendix-b.ts`, type-checked against `dist/` (criterion 18). Two choices R7.7 left open are recorded there (revised in M10): a never-answered slot records nothing, and a person's own grade is never held. `adapters/` joins the 100% coverage gate; every adapter rule was mutated by hand and each mutant fails a test.
- **Changeset:** minor, `0.1.0` to `0.2.0`.

## After M10: from built to proven

M1 to M10 build the engine and connect it to lk-core. Nothing yet shows that a learner using it
learns more than with card-level spaced repetition (FSRS on flashcards, as Anki schedules them).
The milestones below make that claim measurable, then test it. Each has an exit that is a number,
not a feature. **(revised in M12)** M12, prerequisite discovery, was inserted before the first host
because that host's first learner will meet a prerequisite the hand-made map lacks; the later
milestones moved up one (M13 to M17).

**What "better" means here.** For the same practice time:

1. **It predicts better:** before each attempt, its predicted chance of success is closer to
   what happens (log loss, calibration) than card-level FSRS on the same log.
2. **Learners remember more:** a delayed test, 30 days on, scores higher.
3. **Learners can do more:** tasks never seen before, on the same skills, score higher. Cards
   train recall of the card; skills should transfer.
4. **Learners get further:** they reach the skills a course targets sooner, with fewer reviews
   of what they already know and no tasks they are not ready for.

On flashcards, FSRS has an open benchmark for (1), and spaced repetition has decades of studies
for (2). Points (3) and (4) are what a skill layer adds, and the reason to have built one; all four
need data from real learners before this package can claim them.

### M11 - Engine debts the simulator can show

- **Branch:** `feat/lk-practice-engine-debts`. No real data needed.
- **Tasks:**
  - [x] A simulated learner whose memory consolidates with spaced practice (an FSRS-like true
    memory), so the simulator can show what spacing is worth. Today recall depends only on time
    since the last attempt.
  - [x] Count one memory review per skill per day; today twenty answers in one sitting are
    twenty reviews.
  - [x] Flag a leech again every half threshold after it is unsuspended, as card schedulers do.
  - [x] Mastery needs a settled ability (an uncertainty bound), to cut the 7-in-20 false
    masteries at an expected success of 0.73 (design 13).
  - [x] Shorten the wait after one failed mastery check by a learner otherwise passing them.
  - [x] Explain why observed success does not follow `targetSuccess` (design 13), and fix it.
- **Exit:** on the new simulator, spaced practice beats massed practice for the same number of
  attempts; false masteries below 1 in 20 at an expected success of 0.73; a learner at 0.95
  mastered by day 45 in 19 of 20 seeds.
- **As built (revised in M11):**
  - The configuration hash now carries `RULES_VERSION` (`rules@2`): until 0.2.0 a change to the
    rules that apply entries would have left stored states stale (design 13). 0.3.0 asks hosts to
    replay.
  - One sitting, one review: `reviewGapMs` (1 hour). Per sitting rather than per day: the package
    knows no time zones, and a relearning step that comes due within the day still counts.
  - Leeches: on a lapse only (which also fixes a success re-suspending an unsuspended leech), every
    half threshold, and only at twice the planned failure rate; without the rate, healthy learners'
    skills were suspended (R4.7).
  - Mastery: `mastery.uncertaintyMargin` (0.5); checks alternate with reviews at the learner's
    level; failed checks back off by doubling (`top.failedChecks`, an optional state field, read as
    0 in older states). The first "quick re-check after a failure" looped learners below the
    standard and was replaced by the back-off (design 13).
  - `targetSuccess`: explained by target kind (design 13). Checks had become two thirds of the
    practice of learners below the standard; alternation keeps them under half.
  - `SimulatedSkill.consolidation`; `bench/simulate.mjs` adds a spacing comparison.
  - Tests: `sitting-and-leech.test.ts`, the back-off and old-state cases in
    `mastery-check.test.ts`, margin cases in the predicate tests, consolidation in the simulator
    tests, workload and speed bounds in `outcomes.test.ts`; new log, plan and stage vectors. All 22
    hand mutants of the new rules fail a test.
- **Exit, measured:**
  - Spaced beats massed: recall at day 60 of 0.26 against 0 for the same 17 attempts.
  - A learner at 0.95: 20 of 20 mastered, median day 45, 90th percentile day 62: 11 of 20 by day
    45, not 19. The margin costs strong learners about 10 days; margin 0 meets it (19 of 20 by day
    45) at more false masteries (2 of 20 at 0.62, 9 at 0.73). Which to default to is a product
    choice, recorded in design 13.
  - False masteries at 0.73: 7 of 20, not below 1 in 20. The target was wrong: a year of checks
    cannot tell 0.73 from 0.80 (design 13). The achievable goal is met instead: 0 of 20 at 0.50 and
    1 of 20 at 0.62, while 17 of 20 learners at 0.82 are mastered (11 before).

### M12 - Prerequisite discovery (revised in M12)

- **Branch:** `feat/lk-practice-prerequisite-discovery`. **Title:** `feat: lk-practice prerequisite discovery`.
- **Why:** the first host is a new course platform whose first learner (the course's author) will
  fail skills for reasons the hand-made map does not contain: a forgotten Python prerequisite
  (reading values from a dict or a list) behind a LangChain skill. Today the engine can only say
  the skill is weak: remediation follows mapped prerequisites only, per-skill grades cover mapped
  skills only, and the M7 decomposition contract refuses an edge into a base skill
  (`EXTENSION_EDGE_INTO_BASE`).
- **Scope (R14, D29):** discovery as a tested hypothesis, never an AI verdict: a failure suggests a
  diagnosis; an AI names candidate prerequisites (`prerequisiteRequest`,
  `checkPrerequisiteHypothesis`); the host opens one (`open-hypothesis`); the planner plans short
  diagnostic probes on the candidate alone; the probes decide (`prerequisiteVerdict`); a confirmed
  one becomes a soft prerequisite edge (`discoveryExtension`, composed with `composeGraph`), planned
  before the blocked skill; later evidence advises hardening it or revoking it
  (`prerequisiteReport`). The package never calls a model.
- **Files:** `src/contracts/diagnose.ts`, `src/graph/extension.ts` (the new extension kind),
  `src/log/*` (the host action, probe evidence, the trigger), `src/planner/*` (probe and discovered
  targets), `src/testing/simulate.ts` (hidden prerequisites), `bench/discovery.mjs`, schemas,
  vectors, `api/surface.md`, docs, `.changeset/lk-practice-prerequisite-discovery.md`.
- **Tasks:**
  - [x] The diagnosis request (facts only) and its trigger in configuration.
  - [x] The hypothesis check (total), with JSON Schema and Standard Schema for the model's output.
  - [x] The `prerequisite-discovery` extension kind: soft prerequisite edges into the one blocked
    base skill (R2.6 revised).
  - [x] Hypotheses in the log: `open-hypothesis` and `close-hypothesis` host actions, probe
    evidence that changes no skill's memory or ability.
  - [x] Probe targets (a new target kind) and discovered-prerequisite targets in the planner.
  - [x] The verdict and the report (harden or revoke), thresholds in configuration.
  - [x] Hidden prerequisites in the simulated learner, and `bench/discovery.mjs`.
- **Gates:** 100% coverage on `src/contracts`, `src/log` and `src/planner`; a mutation sweep with
  every survivor triaged; vectors for every new kind in `vectors/replay.mjs` `NEEDS`; verify-dist.
- **Exit:** the LangChain scenario runs end to end as a vector (skill 2 fails on dict access;
  hypothesis `py.dict-access`; probe planned; probe fails; soft edge admitted; `py.dict-access`
  planned before skill 2; skill 2 later passes; the report advises hardening); the refuted path is
  a vector too; the simulator report shows discovery shortening time to mastery when a prerequisite
  is hidden, and adding few false prerequisites when none is.
- **Changeset:** minor.
- **As built (revised in M12):** `src/contracts/diagnose.ts`, `src/log/discovery.ts`,
  `src/graph/hypothesis.ts` (content ids and the probe graph), the second extension kind in
  `src/graph/extension.ts`, probe and discovered tiers in `src/planner/`, the `diagnose` vector kind
  in `vectors/replay.mjs` (ten vectors in `contracts.json`, among them the exit scenario as
  `llm.chat.params` and `py.dict-access`, and the refuted path), probe and hypothesis vectors in
  `log.json` and `plan.json`, and `bench/discovery.mjs` (`pnpm discovery`). The simulator changed
  four rules from the first design, each recorded in R14 and D29: doubt at `maxProbes` confirms;
  readiness is `readyAfter` passed re-probes in a row, not one practice pass; the blocked skill
  waits until then; and readiness gives it a fresh start. The numbers are in design 13; the
  rules are in design 8.11.

### M13 - First host, real logs

- **Where:** the first host (revised in M12: a new course platform, with its author as the first
  learner), not this repository. This repository ships what the host needs: a
  storage and integration guide (log table, unique ids, state cache, replay on a graph change).
- **Tasks:**
  - [ ] One course's lk-core activities tagged with skills; every attempt recorded through
    `evidenceFromOutcome`; plans used for at least one practice surface.
  - [ ] A consented, anonymised export of logs (`exportReviewHistory`) for analysis.
- **Exit:** at least 50 learners with 4 weeks of logs each.

### M14 - Prediction benchmark

- **Branch:** `feat/lk-practice-benchmark`.
- **Tasks:**
  - [ ] `bench/evaluate.mjs`: replay a log; before each evidence entry, record the predicted
    chance of success (retrievability times the ability's expected success); after the log, log
    loss, calibration by bin and AUC.
  - [ ] Baselines on the same log: card-level FSRS (each item its own card), skill memory without
    ability, ability without memory, and a constant.
  - [ ] Run it on the M13 logs and on the simulator.
- **Exit:** a report in `docs/` with the numbers. Lower log loss than card-level FSRS on items that
  repeat is claim (1); on generated items, seen once, card-level FSRS cannot predict at all.

### M15 - Parameters fitted from data

- **Tasks:**
  - [ ] Fit FSRS weights per course, and later per learner, from exported reviews, as Anki's
    optimiser does, and pass them to `fsrsMemoryModel({ weights })`.
  - [ ] Fit the Elo step, `stageOffset`, `stageSeconds` and the mastery thresholds on the M13
    logs; they are placeholders today (design 13).
- **Exit:** fitted parameters lower held-out log loss in the M14 benchmark; the new defaults ship
  in a minor with **Action required** (a configuration change is a replay).

### M16 - Generated practice that hits its target

- **Tasks:**
  - [ ] A reference generator flow: plan targets, lk-core activity generation, the proof gate,
    `admitCandidate`.
  - [ ] Measure each generated task's observed success against its target's expected success.
- **Exit:** observed success on generated tasks within 0.1 of the target on average, so a
  learner practises at the intended difficulty without anyone writing cards.

### M17 - A learning-gain experiment

- **Where:** the first host, with a pre-registered analysis.
- **Tasks:**
  - [ ] Randomise learners between this planner and a baseline (card-level FSRS on the same
    items, or the course's fixed order).
  - [ ] Measure claims (2), (3) and (4): a delayed test at 30 days on seen and unseen tasks, and
    time to the course's target skills.
- **Exit:** a significant gain on at least one claim with no loss on the others. That result,
  not a feature list, is what "better than Anki" means, and it is what `1.0.0` waits for.

## Later

| Item | Trigger |
|---|---|
| Graph credit (Phase 3, D6) | Simulation shows a benefit; opt-in, capped. |
| `costAdr` option | Measured task times from real hosts. |
| Hierarchical ability (D25) | Enough learners with placement data to fit it. |
| `fsrs-6` model id | A host needs it. |
| `1.0.0` | Criteria 19 and 20: frozen API, stability section, migrations, 60 and 30 days of dogfooding. |
