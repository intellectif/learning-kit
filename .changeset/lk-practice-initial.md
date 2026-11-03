---
'@intellectif/lk-practice': minor
---

**`@intellectif/lk-practice` 0.1.0: practice planning over a skill graph, what to practise next, at what difficulty, and when again**

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
