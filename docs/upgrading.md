# Upgrading

## 0.3 → 0.5 (`lk-core`) / 2.x → 4.x (`lk-react`)

If you are on `lk-core@^0.3.0`, read the first section before anything else. Two
of the changes are not features — they close paths that put a **wrong number in
front of a learner**, and both are things an integrating application has to
opt into by calling something.

Nothing here changes a grade on its own. Every behavioural change is opt-in, per
the [grade-stability rule](./roadmap.md#5-standing-decisions): if you upgrade and
change no code, the numbers you record stay exactly what they were.

---

### 1. Stop letting a model do the arithmetic

**The problem.** A rubric-based AI grader is usually asked for a total as well
as per-criterion judgements — the prompt says *"score_0_100 is the weighted
total across the rubric criteria"* — and the returned total is stored. That
total is unverifiable and unreproducible: the same criterion scores can yield a
different total on a second run, and nobody can recompute the grade during an
appeal two years later.

**The fix.** Ask the model only for judgement. Do the arithmetic here:

```ts
import { gradeFromRubric, outcomeFromGrade } from '@intellectif/lk-core';

// Your grader returns per-criterion scores. It no longer returns a total.
const result = gradeFromRubric(
  [
    { name: 'Task achievement', score: 82, maxScore: 100, weight: 2 },
    { name: 'Grammar',          score: 71, maxScore: 100, weight: 1.5 },
    { name: 'Vocabulary',       score: 64, maxScore: 100, weight: 1.5 },
  ],
  activityData,               // optional: supplies passThreshold
);

if ('unscorable' in result) {
  // A broken grader is reported, never rounded down to a plausible zero.
  return markForHumanReview(result.reason);
}
recordGrade(outcomeFromGrade(result));
```

`maxScore` per criterion is **new in 0.5** and exists for exactly this
migration. Before it, `gradeFromRubric` required scores already scaled to
`[0,1]` and *rejected* a 0–100 grader outright, which is why teams kept the
model's own total. Declare what each score is out of — `100`, `9` for a CEFR
band, anything positive and finite — and the SDK normalises before weighting.
Omit it and the previous `[0,1]` behaviour is byte-identical.

The returned `GradeRecord.score` is always scaled `[0,1]`. Multiply by 100 at
your storage boundary if your columns are `0..100`.

### 2. Stop recording an ungraded essay as a zero

**The problem.** When an async grade has not landed at submit time — the grader
failed, the network dropped, a cron will retry — the natural thing is to record
`0` and flag the attempt. But that zero flows into the section percentage and
into `passed`, so a learner is shown a fail for work nobody has marked yet.

**The fix.** `composeAssessmentScore` models this directly. An item whose
outcome is `deferred` is excluded from the denominator rather than counted as
zero, and the whole result reports as **provisional**:

```ts
import { composeAssessmentScore } from '@intellectif/lk-core';

const result = composeAssessmentScore(sections, {
  passThreshold: 0.6,
  sectionThreshold: 0.5,
  rounding: { mode: 'half-up', dp: 2 },   // required — the SDK picks neither for you
});

result.status;   // 'provisional' while anything is still awaiting a grade
result.passed;   // boolean — or null while provisional
result.pendingSlotIds;
```

**Do not record a `provisional` score as final.**

Two things to plan for when you adopt it:

- **`passed` is `boolean | null`.** It is `null` while the attempt is
  provisional, because an attempt with unmarked work has neither passed nor
  failed. If your `passed` column is `NOT NULL`, either make it nullable or keep
  the attempt in a pending state and write the column only once
  `status === 'final'`.
- **It consumes a list, not a count.** Every slot needs a `ScoredItem`,
  including unanswered ones — give those an `unscorable` or `deferred` outcome
  rather than leaving them out, or the denominator will silently shrink.

### 3. Stop re-implementing rounding

`roundGrade`, `gte` and `classifyBand` are exported. If you maintain your own,
compare them before switching — and note one deliberate difference: the SDK
**refuses** a non-finite input rather than turning it into `0`. A `NaN` grade is
a broken calculation, and rounding it to a plausible zero hides the bug in a
learner's record.

Grade rounding and band classification are **two different operations**:
rounding is half-up (or whatever you configure) at a required `dp`; band
classification floors, because over-placement is the more harmful error. The SDK
ships no default for either.

---

## What else changed

### Types you no longer have to hand-write

`redact()` returns `RedactedActivityData`, which proves a payload is learner-safe
but says nothing about its shape. **New in 0.5:** per-type redacted types,
derived from the strict schemas with `z.infer`, so they cannot drift:

```ts
import type {
  RedactedActivity,               // discriminated union of all three
  RedactedMultipleChoiceData,
  RedactedFillInTheBlanksData,
  RedactedWrittenResponseData,
  RedactedStimulus,
} from '@intellectif/lk-core';
```

Use them for the payload your server sends an exam client, and for the props of
a renderer that must never see an answer key.

> **Known gap.** These are not yet assignable to the React components' `data`
> prop: `Renderable<T>` widens `scoringStrategy` but leaves nested answer-key
> fields (`options[].isCorrect`, `blanks[].acceptedAnswers`) required, so a real
> redacted payload still needs `asRenderable` / `asRenderableSequence`. Closing
> that is tracked as the next milestone.

### `lk-react` 4.x

- `ActivitySequence` gained **`onSubmit(response, { slotId, index, activityId })`** —
  in `exam` mode this is the *only* callback that fires, because the components
  never grade there. If you render an exam through the pager, you need it.
- `onActivityComplete` gained a third argument, `slotId`. Persist against that,
  not the presented index. Existing two-parameter handlers keep compiling.
- `SequenceItemOutcome` gained a `responded` arm — an exhaustive `switch` over it
  needs a new case.
- `activities` accepts item groups (`SequenceEntry[]`), and shuffling in
  `exam`/`review` mode now **requires** `shuffleSeed`.

### `@intellectif/lk-server` was deleted

It was an empty placeholder for its whole life. If you depended on it, you
didn't — nothing was ever published from it.

### `seededShuffle` gained a `version`

Version 1 (still the default) draws its Fisher–Yates index from an LCG's low
bits, which are correlated: on a four-option item only 12 of the 24 possible
orders are reachable, and the last authored option lands first 8% of the time
against 42% second. Version 2 draws from the high bits and reaches every order
uniformly.

The default does not change, because these permutations are a wire contract — a
stored attempt may hold only its seed, and a review render has to reproduce what
the learner actually saw. Pass `{ version: 2 }` for new content where no attempt
has been recorded yet.
