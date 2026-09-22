---
'@intellectif/lk-core': minor
---

The grade return trip now checks its numbers. A returned grade that cannot be a grade — `NaN`, `Infinity`, a negative, 85 "out of 1", any score out of 0 — no longer composes to a final result. **This can change a recorded grade**, for exactly that population, and for nothing else.

**What was wrong.** `evaluate` refuses a non-finite score and `gradeFromRubric` refuses one outside `[0,1]`, but the path a deferred grade comes back on took any number on trust. `outcomeFromGrade` mirrored whatever `GradeRecord` it was handed, and `composeAssessmentScore` divided by it, reading a `maxScore` of 0 or less as 1. Composed beside one full-marks item:

- a grader that returned raw points (`score: 85, maxScore: 1`) gave a **final** result, score 43, passed;
- `score: NaN` gave a final `NaN` score — `null` once stored as JSON — beside a section marked passed;
- `score: Infinity` gave a final pass;
- `score: 0.5, maxScore: 0` was counted as 0.5 out of 1.

**What changes.**

- **`outcomeFromGrade`** lifts a record only when `maxScore` is a positive, finite number and `score` a finite number from 0 to it. A score up to one part in a billion above `maxScore` is float noise (`1.0000000000000002` from summing weighted parts) and passes as it is, unclamped. The tolerance is relative, and it is the bound lk-react's grade reader already applies before it shows a grade, so the two packages agree on what a grade is. There is no tolerance below 0: nothing the SDK produces is negative. A record that fails comes back as `{ status: 'deferred', reason: 'grade_rejected', maxScore: 1, rejectedGrade }`. The record is kept verbatim for audit, and nothing on it is mirrored, so its `passed` is never read as a verdict. `hasGrade` is `false` for it. A valid record lifts exactly as before.
- **`composeAssessmentScore`** applies the same check to every `scored` and `graded` outcome, including ones an earlier release stored. It treats a failing outcome, and a `grade_rejected` one, as still owed a grade: out of the denominator, listed in `pendingSlotIds`, and also in a new **`rejectedSlotIds`** on the result and on its section. The result stays `provisional` with `passed: null`.
- **`aiExplanationRequest`** returns `null` for a `scored` grade of record that fails the same check. In 0.17.0 it handed the numbers to the model as they were: 85 "out of 1" on a wrong multiple-choice answer went as `category: 'correct'`, passed; `NaN` went as a `null` score. Grading locally instead would speak to a grade the screen does not show, so there is no explanation at all, and lk-react's "Explain my answer" reads "No explanation is available right now." without calling the port.
- **`gradeFromRubric`** refuses a criterion weight below 0 as `unscorable`, and likewise a weight sum that overflows to Infinity. It checked only that the weights summed to a positive number, so `[0 ×2, 1 ×−1]` came back as a real 0 and `[1 ×2, 0 ×−1]` as a perfect 1, the clamp meant for float noise hiding both. Only criteria that enter the arithmetic are read, as for `score` and `maxScore`. A rubric already refused for its weight sum keeps the reason it always had. `[1 ×1e308, 0 ×1e308]` used to grade 0: its sum is Infinity, and every criterion divided into it.

**Why deferred, and not unscorable.** `unscorable` means a grade is never coming. `composeAssessmentScore` leaves such a slot out of the denominator and still lets the attempt go `final` with a verdict. A failing grade on the wrong scale would vanish, and the rest of the paper would be recorded as a pass. `deferred` is what the slot is: a real grade is still owed. Every reader that already treats `deferred` as not yet, lk-react's components included, stays safe without knowing the new reason. `rejectedSlotIds` tells a host to re-grade rather than wait. A rejected slot is also listed in `pendingSlotIds`, so `status` is `provisional` exactly when `pendingSlotIds` is non-empty, the rule it has always followed.

**One deliberate reversal.** A `maxScore` of 0 or less used to be read as 1 rather than divided by. A unit test and one grade-stability vector pinned that on purpose, to stop a division by zero. Dividing is not the only alternative: nothing is out of 0, so reading 0.5 against a denominator nobody declared invents a grade. Such an outcome is now rejected like any other score that cannot be a grade. The test is rewritten to say so, and the vector `composeAssessmentScore/item-max-score-zero` is re-frozen.

**What stays the same.** Of the 564 vectors in the grade-stability corpus, 563 replay byte for byte against this build, both ESM and CJS, and the one that moves is the reversal above. Every input that was a grade composes exactly as before. `rejectedSlotIds` is present only when something was rejected, so a result without one is identical to what earlier releases returned. 28 new vectors cover each refused kind of number, the accepted float noise up to its exact edge, and the new rubric refusals.

**Before you upgrade.** Search stored outcomes for a `score` or `maxScore` that is not a finite number (in JSON, `null`), a `maxScore` of 0 or less, or a `score` below 0 or above its `maxScore`. Re-composing an attempt that holds one now returns `provisional` rather than the final result you recorded. Re-grade those slots. `DeferredReason` gains `'grade_rejected'`, so an exhaustive `switch` over it needs a case. The new fields are optional.

lk-react needs no code change. A record `outcomeFromGrade` now refuses renders as "Not graded yet.", like any deferred outcome. With lk-react 17, `<WrittenResponse>` showed such a record's numbers ("Score 8500%. Passed." for 85 out of 1). A `graded` outcome stored by an earlier release is not re-read, and still renders as before.
