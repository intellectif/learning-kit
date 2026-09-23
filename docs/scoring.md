# Scoring policies: tries and hint costs

Practice works better when a learner can try again, and a hint is worth more when it is not free. A
**scoring policy** says how a paper's questions are scored when learners do either: how many tries a
question gives, which one counts, and what tries and hints cost. Like a
[delivery policy](./delivery.md), it belongs to the paper rather than the item, so one question can
give three tries in a lesson and one in a quiz. It describes `@intellectif/lk-core` 0.21.0 and
`@intellectif/lk-react` 21.0.0.

- [Nothing moves without one](#nothing-moves-without-one)
- [The settings](#the-settings)
- [The arithmetic](#the-arithmetic)
- [Using one](#using-one)
- [What the learner sees](#what-the-learner-sees)
- [In a question set or a video](#in-a-question-set-or-a-video)
- [Recording it with the attempt](#recording-it-with-the-attempt)
- [Scoring on your server](#scoring-on-your-server)
- [Reading a policy from storage](#reading-a-policy-from-storage)
- [What is not here](#what-is-not-here)

## Nothing moves without one

Every setting is optional, and the defaults are how questions were scored before policies existed:
one try, nothing costs anything, the first try counts. An absent or empty policy changes no score
and no pass, and every test the SDK had before still passes with none.

The one thing new without a policy is a count: a `practice` answer on which a learner was shown a
hint now says how many, as `hintsRevealed`, as a dictation's always has — and `onChange` reports it
when a hint is shown, not only at the next change to the answer. A response that saw no hint is
exactly what it was.

The SDK's components apply a policy in `practice`, where they grade. **In `exam` an author's hint
stays free and uncounted**, as it has always been: the one production exam runner this SDK has
evidence from offers blank hints in its final tests on purpose, and an exam response's hint count
could not be restored exactly after a reload.

## The settings

| Setting | Default | Meaning |
|---|---|---|
| `hintPenalty` | `0` | What each hint costs, as a fraction of the question's marks: `0.1` is a tenth per hint. A hint is any a learner is shown before answering — an author's hint on a blank, a dictation's word, an AI hint |
| `retries` | `0` | How many more tries a learner gets after an answer short of full marks. A whole number from 0 to 10 |
| `retryPenalty` | `0` | What each try after the first costs, as a fraction of the question's marks |
| `counts` | `'first'` | Which try's score is the question's: `'first'`, `'best'` (after what each try cost) or `'last'` |

**`counts` defaults to `'first'` so that switching tries on moves no grade.** Tries after the first
are then for learning: the learner can get it right, and the grade stays what their first answer
earned. A school that wants mastery to count chooses `'best'` or `'last'` — usually with a
`retryPenalty`, or every practice question ends at 100%.

A `retryPenalty` while the first try counts can never be charged, so it is refused (see
[Reading a policy from storage](#reading-a-policy-from-storage)): a school that set one believes
retries cost something.

## The arithmetic

A try's cost is subtracted from what its answer scored, as a fraction of the marks, and a try never
scores below zero:

```
scored = max(0, answer − (hintPenalty × hints + retryPenalty × (try − 1)) × maxScore)
```

- **Hints count from the start of the question.** The second try is charged for every hint shown
  before it, including those before the first.
- **Subtracted, not multiplied.** Half marks less a quarter is a quarter, not three eighths — so a
  hint costs the same whatever the answer earned.
- **Floating-point residue is removed.** `0.7 − 0.2` is `0.49999999999999994` in floating point,
  which would fail a 0.5 pass line the learner met; a costed score is taken to twelve decimal places.
  A score that cost nothing is left exactly as the answer scored.
- **`passed` is read from the costed score.** The authored overall feedback and the per-part marks
  stay the answer's: they describe what was answered, not what it cost. A right answer whose hints
  cost it more than its pass line allows shows "Well done." and does not pass.
- **Only the tries a policy allows are read** — the first `1 + retries`. A record with more cannot
  have come from a learner under that policy.

With `{ retries: 2, retryPenalty: 0.25, counts: 'best', hintPenalty: 0.1 }`: a wrong first try scores
0; a right second try after one hint scores `1 − (0.1 + 0.25)` = 0.65; the question scores 0.65.

## Using one

```tsx
const lesson: ItemScoringPolicy = { retries: 2, retryPenalty: 0.25, counts: 'best', hintPenalty: 0.1 };

<ActivitySequence activities={paper} scoring={lesson} onFinished={save} />;
```

Every activity takes `scoring`, and so do `<ActivitySequence>` and `<InteractiveVideo>`. On a pager
**the paper's policy wins** over any a question was handed — a cost and a count of tries have no
"stricter" to combine, so the paper decides, as it decides the mode. A `renderers` override is
handed the policy as `scoring`; a video's `renderQuestion` is handed it spelled out as
`question.scoring`, and lk-core's `scoreTries` does the arithmetic for a question you draw yourself.

## What the learner sees

Tries and costs apply to multiple choice, fill in the blanks, gap select and dictation — the types
the SDK grades in `practice`. A read-aloud takes `scoring` and ignores it: its tries are its own
`recording.maxTakes`, and its grade comes from your assessor. A written response is graded later, by
your grader.

- **What a hint costs is said before one is asked for**: "Each hint costs 10% of this question's
  marks." Under a cost, a dictation's word hints cannot be hidden again, and hiding an author's hint
  does not refund it — a hint seen is seen.
- **"Try again" appears after a graded answer short of full marks**, while the policy has tries left
  and the learner can see the marks (`feedback` on). It keeps the answer to change, and clears the
  marks. Beside it, **"Show answer"** ends the question's tries — or **"Keep this answer"**, where the
  paper shows no right answer to close on.
- **While another try is on offer, the right answer does not show.** What the learner chose is still
  marked right or wrong, with the author's feedback, but not the option they missed, not the answers
  `showCorrectAnswers` writes in, not a dictation's missing words or corrections, and not "Explain my
  answer", which all but always names the answer. All of it shows once the tries end.
- **The score is the question's, under the policy**, and what it is made of is said beside it:
  "Your first try counts. This one scored 100%.", "Before hints and tries, this answer scored 100%.",
  "1 try left. Each costs 25% of the marks." Every sentence is in the
  [strings surface](./i18n.md#tries-and-what-they-cost).

**`onComplete` fires after every graded try**, with `score` and `passed` for the question so far
under the policy. Its `xapiStatement` records the try just made, at what it cost. Keep the last one.

**The response says how many hints were shown**: `hintsRevealed` on multiple choice, fill in the
blanks and gap select, as dictation already did — counted from the start of the question, in
`practice` only. A restored answer's count stands, and hints shown after it add to it.

## In a question set or a video

- **A later try replaces the question's grade**, so `onActivityComplete` can fire more than once for a
  slot. Keep the last.
- **The set waits for a question the learner is trying again**, wherever they are — pressing "Try
  again" makes a question unanswered again, and a set waits for every answer. **And it waits for the
  question on screen while it offers a try**: leaving that question is declining the try.
- **Once the set reports, every question's tries close.** The grades in `onFinished` are the ones that
  stand; no "Try again" can change them afterwards.
- **In `<InteractiveVideo>`**, a later try replaces the grade as any answer given again does, and
  **Finish closes every question's tries.**
- A consumer's own renderer that reports a grade twice keeps its first, as before: only the SDK's
  own questions mark a grade as one try of several.

## Recording it with the attempt

```ts
const plan = planAttempt(entries, { seed: attemptId, delivery, scoring: lesson });
// plan.scoring → { hintPenalty: 0.1, retries: 2, retryPenalty: 0.25, counts: 'best' }
```

- **Every setting is spelled out**, so the record never depends on a default a later release might
  change.
- **It is part of `planHash`.** The same answers are worth something else under another policy.
- **A plan made without one is exactly what it was**, `planHash` included — a delivery policy alone
  keeps the hash it had.
- **`planAttempt` refuses a policy `validateItemScoringPolicy` would refuse.**
- **`verifyAttemptPlan` reports `scoringChanged: true`** when two plans were made under different
  policies; the field is absent when they agree.

## Scoring on your server

A server that scores practice itself reaches the SDK's numbers from the responses it stored:

```ts
import { evaluate, evaluateTries } from '@intellectif/lk-core/scoring';

// One answer: its hints charged, `passed` read after.
const outcome = evaluate(item, response, { scoring: plan.scoring });

// Every try, in order: the one that counts, and what each cost.
const { outcome: graded, counted, tries } = evaluateTries(item, triesInOrder, {
  scoring: plan.scoring,
});
```

- `evaluate` and `evaluateTries` read hints from each response's `hintsRevealed`. **The count is the
  browser's.** Where your server knows better — it served the AI hints, and counted them — write its
  own count there before you evaluate.
- With no policy, `evaluate` is exactly what it was, and `evaluateTries` is `evaluate` of the first
  response. With no response at all, the question was never answered:
  `{ status: 'deferred', reason: 'no_response_recorded' }`.
- `scoreTries(tries, policy)` is the arithmetic alone, over `{ score, maxScore, hintsRevealed }` per
  try, for scores you already hold.

All three are pinned by the [grade-stability vectors](../packages/lk-core/vectors/README.md).

## Reading a policy from storage

**A scoring policy is refused, not read charitably.** A delivery policy reads a setting it cannot
read as a restriction, because that is the safe way round; every setting here moves a grade, and
there is no safe way round — a cost misread as 0 raises grades, misread as 1 lowers them. So:

- `validateItemScoringPolicy(policy)` returns the issues: a misspelled setting, a cost outside 0 to 1
  or not a number, `retries` that is not a whole number from 0 to 10, an unknown `counts`, and a
  `retryPenalty` the first try counting would never charge. `null` is unset.
- `resolveItemScoringPolicy(policy)` spells a valid policy out, and **throws a `RangeError`** on one
  it cannot apply — as `evaluate`, `evaluateTries` and `scoreTries` do. `planAttempt` refuses it too,
  with an `Error` naming the first issue.
- **A component given one fails at render**, into its error boundary, rather than grade by a guess.
  A pager fails before drawing any question.

```ts
const checked = validateItemScoringPolicy(fromTheForm);
if (!checked.success) {
  return badRequest(checked.issues); // [{ path: 'retryPenalty', message: '"retryPenalty" is never charged…' }]
}
```

## What is not here

- **Negative marking below zero.** A cost floors at zero per question: the one integrating
  application stores item scores in [0, 1], and marking below that is a separate, explicit decision.
- **Partial credit set per paper.** An item's `scoringStrategy` is still the author's; nothing has
  asked for a paper to override it.
- **Hint costs in `exam`.** Authored hints there stay free, for the reasons at the top.

See the [roadmap](./roadmap.md#next--the-delivery-policy-then-ai).
