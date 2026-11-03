---
'@intellectif/lk-core': patch
---

**A rounding policy is checked wherever it is passed: `roundGrade`, `gte`, `computePassThreshold`, `composeAssessmentScore` and `composeTimelineScore` refuse one they cannot apply**

**Action required:** only if a policy can reach these functions from untyped configuration. One with an unknown `mode`, or a `dp` that is not a whole number from 0 to 15, now throws a `RangeError` instead of rounding silently. Check stored policies before you upgrade, or catch the error where you compose.

- **What changed.** These functions take a `RoundingPolicy` directly and did not check it, unlike every `rounding` option (`score()`, `evaluate()`, `evaluateTries()`, `gradeFromRubric`, `gradeReadAloud`, `gradeSpeakingResponse`). `{ mode: 'half-up' }` with no `dp` computed `10 ** undefined`: `roundGrade` returned `NaN`, `gte` and `computePassThreshold` failed even a perfect score, and `composeAssessmentScore` recorded a `NaN` total, all with no error. They now share the options' check, so the same policy is refused everywhere with the same message, which names each field without serialising it.
- **A missing policy where one is required** (`roundGrade`, `gte`, a `CompositionPolicy` without `rounding`) throws that `RangeError` rather than a `TypeError`. `computePassThreshold(data, score, null)` compares raw, as with no policy.
- **Read once per call.** Each function reads the policy once and rounds every side from that copy, so a getter cannot round a score under one `dp` and its threshold under another.
- **Unchanged:** every well-formed policy returns exactly what it returned. All 819 grade vectors replay unchanged, and the types are the same.
- **Why a patch:** a fix with no API change. It changes the result only for policies outside `RoundingPolicy`'s documented contract, and those results were wrong.

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/upgrading.md#1100--1101-lk-core
