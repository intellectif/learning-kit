---
'@intellectif/lk-core': minor
---

**Assisted grading**: a model grades a written response for the record, and in an exam no model's grade counts until it has been measured against your teachers.

**Action required:** none. Nothing grades until you call it. Four union members are new: `DeferredReason` gains `awaiting_human_review`, `AiRefusal` gains `misses-criteria` and `out-of-scale`, and `AiCheckCase['feature']` gains `grading`. A `switch` over one of them without a `default` branch needs them.

- **Levels on a rubric:** a criterion can carry `levels`, lowest first, from 2 to 10, each a `label` and an optional `description`. A level scores `index / (levels − 1)`.
  - `validateActivity` does not check them in 1.x, so a field of that name you already use stays valid.
  - The critic warns `wr_levels_unreadable` when it cannot read them.
  - `redact()` passes readable levels to the learner, `label` and `description` only.
- **The request and its check:**
  - `aiGradingRequest` builds what a model is told: the response verbatim, the rubric with its levels, and a group's material.
  - `checkAiGrading` accepts a grade whole or not at all. It needs every criterion once (`misses-criteria`), each on its own scale (`out-of-scale`), with corrections that quote the response (`misquotes-answer`).
- **The grade:** `gradeFromJudgement` computes the total as `gradeFromRubric` does, with the item's weights and pass line. It records the model and the prompt revision on `grader`.
- **Calibration:** `calibrationReport` measures one grader configuration (a model, a prompt revision, a rubric and a target) against people's grades of the same responses. It reports:
  - exact and adjacent agreement, quadratic kappa and a confusion matrix, on levels;
  - Pearson's r, mean absolute error and the standardised mean difference, everywhere;
  - calibration error and the Brier score, where grades carry level probabilities;
  - the degradation from two people's agreement.

  It ships no thresholds.
- **Routing:** `routeGrade` decides whether a grade counts or goes to a person, and gives every reason, in a fixed order:
  - no matching calibration, in an exam;
  - a report below your thresholds;
  - a model unsure of a level, or one that asked for review;
  - low confidence;
  - the audit sample, chosen by `inAuditSample`.

  `outcomeFromRoutedGrade` holds a grade for a person as `deferred` / `awaiting_human_review`, with the grade kept on `pendingGrade`, so `composeAssessmentScore` keeps the attempt provisional.
- **New optional fields:**
  - `levels` on a rubric criterion, its redacted form included;
  - `levelProbabilities` on `CriterionScore`;
  - `routing` on `GradeRecord`;
  - `pendingGrade` on a deferred `ItemOutcome`.
- **`@intellectif/lk-core/ai-check`** has five grading cases, for a `grading` port.
- **The grade-stability corpus** gains 123 vectors for the new functions. The 635 before them are unchanged.

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/grading.md
