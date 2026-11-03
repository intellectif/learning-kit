# @intellectif/lk-practice

## 0.4.0

### Minor Changes

- [#161](https://github.com/intellectif/learning-kit/pull/161) [`a17eae4`](https://github.com/intellectif/learning-kit/commit/a17eae4936cb34c1af1d4cf5167213dec5fb7478) Thanks [@diego28e](https://github.com/diego28e)! - **`@intellectif/lk-practice`: missing prerequisites, found by a model's hypothesis and confirmed by probes, never by the model alone**

  **Action required:** rebuild stored states with `replay`, give the new target kind, events and host actions a default branch in your code, and replay a learner's log after you admit a hypothesis.

  - **Rebuild stored states.** The rules version and the new `discovery` options are in the configuration hash, so a state saved by 0.3 is refused with `STATE_CONFIG_MISMATCH`. `replay` the learner's log and store the new state. Logs are unchanged and stay valid.
  - **Give the new values a default branch.** A plan may now hold a `probe` target, in context `diagnostic`, with the reason `probe`, and a `remediation` target with the reason `discovered`; a generation request for a probe has `target.context: 'diagnostic'`. `record` and `act` may emit `skill.diagnosis-suggested`, `hypothesis.opened`, `hypothesis.probed`, `hypothesis.decided`, `hypothesis.ready`, `hypothesis.closed` and `skill.unsuspended`. Two host actions are new: `open-hypothesis` and `close-hypothesis`. `composeGraph` takes a second extension kind, `prerequisite-discovery`.
  - **Admitting a hypothesis changes the graph version,** as any extension does: compose the new graph and `replay` the learner's log against it before the next `record`.

  What it does:

  - **A diagnosis is suggested:** `record` emits `skill.diagnosis-suggested` when a skill fails twice in a row at its stage (`discovery.diagnoseAfter`) and no diagnosis of it is under way.
  - **A model proposes, the package checks:** `prerequisiteRequest` gives your model the facts (the blocked skill, the failure, its prerequisites, the skills near it, hypotheses already open or refuted); `checkPrerequisiteHypothesis` checks its `{ hypotheses: [...] }` output (`hypothesesJsonSchema`, `hypothesesSchema`). Each hypothesis names an existing skill, or a new one under your prefix, and one soft prerequisite edge into the blocked skill. The package never calls a model.
  - **Probes decide:** after `open-hypothesis`, plans start with a probe of the candidate alone, at its top stage and reference difficulty. A probe answer (`evidence.probe`) changes no skill. Two failed probes confirm, a pass share of 0.75 or more refutes (two of two, three of four), and at four probes doubt confirms; `prerequisiteVerdict` reads the result. A refuted hypothesis is remembered for the learner.
  - **A confirmed one is a soft edge:** `discoveryExtension` returns a `prerequisite-discovery` extension, the one kind allowed an edge into a base skill: one soft prerequisite into the blocked skill, plus the candidate if it is new. Two such extensions that add the same new skill share it.
  - **Practice first:** the planner plans the confirmed prerequisite, then re-probes it, while the blocked skill waits. Two passed re-probes in a row (`discovery.readyAfter`) make it ready, and the blocked skill gets a fresh start: an ability pulled below its starting point by the explained failures starts again there, its lapse counts and streaks restart, and a leech suspension is lifted. Nothing is ever lowered.
  - **You decide:** `prerequisiteReport` advises `admit`, `practise`, `harden`, `revoke` or `keep` for each confirmed hypothesis. Nothing hardens or revokes itself.
  - **`./testing`:** `requires` gives a simulated skill hidden prerequisites, and `learning` lets its true ability grow with practice (never with a probe). `bench/discovery.mjs` reports the effect.

  On 400 simulated learners whose blocked skill needed a prerequisite missing from the map, none mastered it in 180 days without discovery; with it, the true prerequisite was admitted for 358, and 164 mastered the skill (median day 77). With nothing missing, mastery was unchanged (354, median day 64) and 5 needless prerequisites were admitted. `harden` cannot tell a needed prerequisite from one that was merely missing (76 of 434 such advices named a decoy), so judge the content before you harden.

  Guide: https://github.com/intellectif/learning-kit/blob/main/docs/practice.md#missing-prerequisites

## 0.3.0

### Minor Changes

- [#153](https://github.com/intellectif/learning-kit/pull/153) [`5d6f68c`](https://github.com/intellectif/learning-kit/commit/5d6f68cb61083641126aec26ddd46930ce05350d) Thanks [@diego28e](https://github.com/diego28e)! - **`@intellectif/lk-practice`: one review per sitting, steadier mastery, mastery checks that back off, and leeches that only flag real trouble**

  **Action required:** rebuild stored states. The configuration hash now includes the version of the rules that apply an entry to the state, so a state saved by 0.2 is refused with `STATE_CONFIG_MISMATCH`; `replay` the learner's log (or `replayFrom` an older checkpoint) and store the new state. Logs are unchanged and stay valid.

  - **One sitting is one review:** a success within `reviewGapMs` (1 hour) of a skill stage's last review, before it is due, moves the ability but not the memory or the stage. A failure always counts. `reviewGapMs: 0` reviews every success.
  - **Mastery holds with a margin:** the expected success of 0.80 must hold against the reference difficulty raised by `mastery.uncertaintyMargin` (0.5) times the ability's uncertainty, which shrinks as evidence grows. `uncertaintyMargin: 0` drops it.
  - **Mastery checks alternate and back off:** after a failed check or a lapse, the next review is at the learner's level; each failed check in a row doubles the wait for the next (72 hours, then 6 days, then 12). The state records the count as `top.failedChecks` (read as 0 in older states).
  - **Leeches:**
    - flagged on a lapse only, so a success right after unsuspending no longer suspends the skill again;
    - flagged again every half threshold;
    - flagged only while the skill fails at least twice as often as the planner aims for, since practice at the target fails 15% of the time by design.
  - **`./testing`:** `consolidation` gives the simulated learner a memory that grows with spaced successes; the default 0 keeps the forgetting time fixed, as before.

  On a simulated learner, the share mastered within a year at an expected success of 0.82 rose from 11 of 20 to 17 of 20. Learners at 0.62 and below stayed almost never mastered, and none was suspended.

  Guide: https://github.com/intellectif/learning-kit/blob/main/docs/practice.md

## 0.2.0

### Minor Changes

- [#151](https://github.com/intellectif/learning-kit/pull/151) [`fa19256`](https://github.com/intellectif/learning-kit/commit/fa19256944d693e9e104f810665c37cee103e880) Thanks [@diego28e](https://github.com/diego28e)! - **`@intellectif/lk-practice/lk-core`: lk-core outcomes become practice evidence, with rubric criteria as per-skill outcomes**

  **Action required:** none. A new entry point; nothing else changes, and lk-core stays optional: the entry imports nothing from it.

  - `evidenceFromOutcome(outcome, item, meta)` turns the outcome lk-core's `evaluate` returns into evidence:
    - `scored` as an `auto` grade;
    - `graded` by its grader, with its confidence and review flag, and its rubric criteria as per-skill outcomes through the item's `criteria`;
    - a grade still owed (awaiting a person, async grading, or a re-grade) is held until the grade arrives with `confirms`; a person's own grade is never held;
    - `null` for an unscorable or never-answered item, since nothing was attempted.
  - `skillOutcomesFromCriteria(criteria, item)` gives the per-skill outcomes alone: criteria not applicable or without a score are skipped, and those bound to one skill are summed.
  - Its types copy the lk-core shapes it reads; a test against the real lk-core keeps them in step.

  Guide: https://github.com/intellectif/learning-kit/blob/main/docs/practice.md#outcomes-from-lk-core

## 0.1.0

### Minor Changes

- [#149](https://github.com/intellectif/learning-kit/pull/149) [`b760232`](https://github.com/intellectif/learning-kit/commit/b7602323a882ba073b75cd504018e61ea9166d9d) Thanks [@diego28e](https://github.com/diego28e)! - **`@intellectif/lk-practice` 0.1.0: practice planning over a skill graph, what to practise next, at what difficulty, and when again**

  **Action required:** none. A new, opt-in package; it needs Node.js 24 or later and does not depend on `@intellectif/lk-core`.

  - **Per skill:** an FSRS-7 memory at its current stage, through `ts-fsrs` 6.0.0; an Elo ability per stage; a stage on a ladder that spaced successes promote and lapses demote; and readiness from your prerequisite graph.
  - **A replayable log:** `createPractice(config)` gives `record`, `act`, `plan`, `status`, `replay`, `replayFrom`, `reconcile` and `exportReviewHistory`. Each is a pure function of the log, the graph and the time you pass. A new configuration or graph version is a replay.
  - **Planning:** `plan` returns targets in this order: overdue reviews, remediation, reviews due, stage-ups and new skills. Each aims at 85% expected success, and carries an item from your pool when one fits.
  - **Mastery checks:** while a skill at its top stage is short of the mastery standard, its reviews aim at the skill's reference difficulty instead (`reason.masteryCheck`). A passed check brings the next within 72 hours; a failed one is a `hard` review, not a lapse.
  - **Contracts for your AI:**
    - `generationRequest`, `checkCandidates` and `admitCandidate`: nothing unproven is ever planned or recorded;
    - `checkGradeResult` and `evidenceFromGrade`;
    - `decompositionRequest`, `checkDecomposition` and `admitExtension`, for new skills toward a learner's goal;
    - JSON Schemas and Standard Schema validators for model output and stored data.
  - **`@intellectif/lk-practice/testing`:** `simulateLearner`, a deterministic simulated learner for comparing settings and for tests.
  - **Why a minor:** the first public version. Until 1.0, a minor may change behaviour, and its changeset says how.

  Guide: https://github.com/intellectif/learning-kit/blob/main/docs/practice.md
