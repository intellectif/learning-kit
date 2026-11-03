# @intellectif/lk-practice

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
