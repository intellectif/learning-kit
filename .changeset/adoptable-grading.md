---
'@intellectif/lk-core': minor
'@intellectif/lk-react': patch
---

Make the grading surface reachable, and correct what the docs promise.

An evidence sweep of a production integration found it pinned to `lk-core@^0.3.0` — so none of the v0.4 grading work was callable there — while two of the exact defects that work exists to prevent were live in its gradebook: a language model computing the weighted total of record for every essay, and an ungraded essay recorded as a hard zero that flowed into the learner's pass/fail. The features were shipped and correct. The obstacles were on this side.

**`CriterionScore.maxScore` (new).** `gradeFromRubric` required every criterion score to be pre-scaled to `[0,1]` and *rejected* anything else. Real graders work out of 100, or out of 9 for a CEFR band, or out of a per-criterion points total — so the rejection sent integrators back to letting the model produce the weighted total itself, which is precisely the arithmetic this function exists to take away from it. Declare what each score is out of and the SDK normalises before weighting; a rubric may mix scales. Omitted, it defaults to `1` and the previous arithmetic is byte-identical. A `maxScore` that is zero, negative or non-finite is reported `unscorable` rather than divided by, and the out-of-range message now names `maxScore` as the remedy instead of telling the caller to normalise by hand.

**Per-type redacted types (new).** `redact()` returns `RedactedActivityData`, which proves a payload is learner-safe but is index-signature typed and says nothing about its shape — right for the assertion, useless for anything that has to render or transport the result. Every integrator re-declared those interfaces by hand and they drifted. `RedactedMultipleChoiceData`, `RedactedFillInTheBlanksData`, `RedactedWrittenResponseData`, the `RedactedActivity` union, `RedactedStimulus` and the option/blank shapes are now derived from the strict schemas with `z.infer`, so the type and the validator cannot disagree, with tests pinning them to what `redact()` actually produces.

**`<WrittenResponse>` normalises each criterion it displays.** `gradeFromRubric` stores the grader's judgements verbatim, in the units the grader used, so a grade stays auditable years later — which means anything *displaying* a criterion has to normalise it, exactly as the overall score is already normalised against its own `maxScore`. The review renderer printed `score * 100`, so the moment a criterion could legitimately be `82 / 100` it would have read "8200%". Caught before release; the same review path is now tested end to end through `gradeFromRubric` with mixed native scales rather than pre-scaled `[0,1]` fixtures.

**`docs/upgrading.md` (new)**, leading with the two grade defects and what to call instead, and covering the `passed: boolean | null` and list-vs-count adjustments that adopting `composeAssessmentScore` requires.

**A documentation-truth pass**, treated as a correctness deliverable:

- The root README stated `redact()` strips **rubrics**. It does not, deliberately — a rubric tells the learner what they are assessed on — so an integrator trusting the README would ship rubrics to an exam client believing they were stripped. An in-source docblock contradicted the policy three lines below it.
- Both READMEs denied any resume capability ("no `initialResponse` prop → cannot re-hydrate a prior attempt") months after `value`/`defaultValue`/`onChange` shipped in lk-react 2.1.0.
- The published `.d.ts` told every IDE that `questionHtml` and `promptHtml` are "not rendered by the SDK yet". Both render, through a caller-supplied sanitiser. (`passageHtml` genuinely is not rendered; that JSDoc was correct and stands.)
- The authoring guide said the scoring engine never returns feedback and capped multiple choice at 10 options; `score()` has selected feedback on `passed` since 0.3.0 and the schema allows 26.
- `lk-react`'s README omitted `<WrittenResponse>` entirely, and `lk-core`'s advertised roughly its 0.2.x surface on a package published at 0.4.0 — no `evaluate`, registry, `redact`, `GradeRecord` or composition.

**`@intellectif/lk-server` is deleted.** It was a private, empty placeholder for its whole life, with no thesis anyone could state. An empty package with no purpose is a liability, not an option held open.
