---
'@intellectif/lk-core': minor
'@intellectif/lk-react': minor
---

The return trip for deferred grading: a grade that arrives later is now a first-class SDK value.

`evaluate()` could already say a submission was `deferred` — graded later by an AI or a human — but there was no type for the grade that comes **back**, so every consumer invented one and mirrored it by hand into their frontend. That gap is closed.

**New in `lk-core`:**

- **`GradeRecord`** — a scaled score, pass state and narrative feedback, plus the parts a rubric grader actually produces: `criteria` (per-criterion score or ordinal `band`, with comments and the weight applied), `corrections` (anchored in the learner's own text, with optional character offsets), `evidence`, `rationale`, `confidence`, `requiresHumanReview`, `grader` provenance (`kind`, `model`, `promptHash`) and token/cost `usage`. The shapes are the intersection of two independent production graders that converged on the same envelope.
- **`ItemOutcome` gains a `graded` arm** carrying the record, with `score` / `maxScore` / `passed` / `feedback` mirrored onto the outcome for uniform reads. `scored` continues to mean "the SDK computed this deterministically"; `graded` means "a grader returned it".
- **`gradeFromRubric(criteria, activity?, options?)`** — the weighted total as a **pure function of the grader's judgements**. A grader is asked for judgement, not mental arithmetic: if the model also returns the total, the grade becomes unverifiable and irreproducible, since two runs can disagree for identical criterion scores. Weights are normalised by their sum, so they need not add to 1. Criteria marked `notApplicable`, and band-only criteria with no numeric score, are excluded from **both** numerator and denominator. When nothing scoreable remains it returns `{ unscorable: true, reason }` — never a zero.

  It also refuses out-of-contract input rather than turning it into a grade: a criterion whose score is `NaN` or infinite is **rejected, not silently dropped** (dropping it would regrade the learner on fewer criteria, with different effective weights, and nobody would know), and a score outside the scaled `[0,1]` range — a grader reporting raw points such as 4-out-of-5 — is rejected by name instead of being clamped, because silently rescaling someone's grader is worse than telling them it is out of contract. Float noise a hair outside the range is clamped.
- **`outcomeFromGrade(grade)`** and **`hasGrade(outcome)`**. Use `hasGrade` instead of testing `status === 'scored'`, which silently misses asynchronously graded work.
- **`XAPIVerb.SCORED`** for "a grade now exists", distinct from `answered` (which asserts the grade existed at submission time — here the learner acted earlier and the grade arrived later, often from a different actor).

**New in `lk-react`:** `<WrittenResponse renderMode="review" outcome={…} />` renders a returned grade — the percentage and pass state, narrative feedback, every criterion with its score or band and comment, inline corrections shown as `<del>`/`<ins>` pairs with explanations, and an awaiting-review affordance when `requiresHumanReview` is set. `notApplicable` criteria render as such rather than as zeros, and a `deferred` outcome still renders "not graded yet" rather than 0%.

Additive: `ItemOutcome` gained a union member, so an exhaustive `switch` over outcome statuses will need the new `graded` case.
