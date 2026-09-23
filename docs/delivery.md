# Delivery policies

The same question can be a practice exercise with every hint and a final exam with none. What
changes between them is not the content but how it is delivered — and that is the school's decision,
per course, per paper, per class, not the author's.

A **delivery policy** is that decision, as data. It describes `@intellectif/lk-core` 0.20.0 and
`@intellectif/lk-react` 20.0.0.

- [The one rule: a policy only takes away](#the-one-rule-a-policy-only-takes-away)
- [The settings](#the-settings)
- [Using one](#using-one)
- [Recording it with the attempt](#recording-it-with-the-attempt)
- [A question you draw yourself](#a-question-you-draw-yourself)
- [Reading a policy from storage](#reading-a-policy-from-storage)
- [What each activity does with it](#what-each-activity-does-with-it)
- [What is not here yet](#what-is-not-here-yet)

## The one rule: a policy only takes away

`renderMode` still decides the three things that make a mode what it is: in `practice` the component
grades, in `exam` it never does, in `review` nothing can be submitted. A policy sits inside that and
switches off what a mode would otherwise show:

```tsx
<ActivitySequence activities={paper} renderMode="practice" delivery={{ solutions: false }} />
```

- **Every setting defaults to `true`, and an empty policy is exactly the behaviour there was before
  policies existed.** Every test the SDK had before them still passes, unchanged, with none.
- **Nothing can be switched on.** No policy makes an `exam` reveal a grade — the client in an exam has
  no answer key to grade with — and none puts AI help in an `exam`.

## The settings

| Setting | `false` means | Typical use |
|---|---|---|
| `feedback` | No right and wrong marks, no score, no authored feedback. The learner sees "Answer submitted." The grade still reaches `onComplete` | Homework marked on the client and shown at the end; a review that shows what was answered and not how it was marked |
| `solutions` | The right answer is never shown beside a wrong one: not the correct option of a multiple-choice question, not the answers `showCorrectAnswers` writes into blanks, not a dictation's transcript. What the learner answered is still marked right or wrong | A paper that will be sat again; practice before a retry |
| `hints` | No hints of any kind: the author's hints on a blank, a dictation's word hints, and AI hints | **An exam whose hints are not part of the test** — see below |
| `ai.hints` | No AI hints | A course that allows the author's hints and not a model's |
| `ai.explanations` | No "Explain my answer" | A course that has not approved AI explanations |
| `ai` | Both of the above. `ai: true` is the same as leaving `ai` out | A course with no AI help at all |

**The author's fill-in-the-blanks hints stay on in `exam` unless a policy says otherwise, on
purpose.** A hint an author wrote is part of the item: the same words for every learner, in the item's
public content, so offering it on a paper of record is fair in a way AI help is not — which is why a
policy can leave authored hints on in an exam and can never put AI help there. It is also what exam
delivery already does in practice: the one production exam runner this SDK has evidence from offers
blank hints in its final tests, deliberately. Where a hint is help rather than part of the question —
a paper built from practice items, say — set `hints: false` on it.

**An explanation needs feedback and solutions as well as `ai.explanations`.** It explains a grade, so
it cannot appear where the grade is hidden, and it all but always says what the right answer was, so
it cannot appear where the answer is hidden either.

## Using one

Every activity takes `delivery`, and so do `<ActivitySequence>` and `<InteractiveVideo>`. On a pager
it applies to every question in it:

```tsx
const homework: DeliveryPolicy = { feedback: false, ai: { explanations: false } };

<ActivitySequence
  activities={paper}
  delivery={homework}
  onFinished={(items) => showResultsPage(items)} // the grades arrive; the learner sees them here
/>;
```

Two policies — a course's and a paper's, say — combine with `combineDeliveryPolicies`, which keeps a
setting on only where every one of them leaves it on:

```ts
import { combineDeliveryPolicies } from '@intellectif/lk-core';

const policy = combineDeliveryPolicies(course.delivery, assessment.delivery);
```

## Recording it with the attempt

The policy a learner sat a paper under is a fact about the attempt: whether they had hints, whether a
model explained their answers. Record it with the rest of the plan:

```ts
const plan = planAttempt(entries, { seed: attemptId, delivery: policy });
// plan.delivery → { feedback: true, solutions: false, hints: false, ai: { hints: false, explanations: false } }
```

- **Every setting is spelled out** in `plan.delivery`, so the record never depends on a default that a
  later release might change.
- **It is part of `planHash`.** The same questions sat with hints and without are two different
  attempts, and a snapshot saved against one does not restore onto the other.
- **A plan made without a policy is exactly what it was before**, `planHash` included — nothing you
  have stored moves.
- **`planAttempt` refuses a policy `validateDeliveryPolicy` would refuse**, such as a misspelled
  `hint: false`. A misspelled restriction is no restriction, and a plan is what an appeal reads.
- **`verifyAttemptPlan` reports `deliveryChanged: true`** when two plans were made under different
  policies, and `matches` is then `false`. The field is absent when they agree, so a report between
  two plans without a policy has exactly the shape it had before.

Deliver the attempt under the policy the plan recorded, not under whatever the course says today: a
school that switches hints off mid-week has not switched them off for a paper already under way.

**That is the policy for sitting the paper, not for reviewing it.** A review is a delivery of its own,
usually one that releases results: pass the policy for that — often none — rather than
`plan.delivery`. Passed on unchanged, a homework sat with `feedback: false` would be reviewed without
its grades too.

## A question you draw yourself

A `renderers` override in `<ActivitySequence>` is handed the policy as `delivery`, and a question
drawn by the video's `renderQuestion` as `question.delivery`, with every setting spelled out. The SDK
cannot keep a policy in pixels it does not draw: where `feedback` or `solutions` is `false`, show no
mark and no answer.

**The paper still decides what it can.** A pager publishes its policy to every question in it, so a
host's question that ignores what it was handed still gets no AI help the paper forbids — `useAiHints`
and `useAiExplanation` read the paper's policy themselves, as they read its mode.

## Reading a policy from storage

A policy usually comes from a database, and two rules decide how an unreadable one is read:

- **`null` is unset**, and unset is `true`. JSON has no `undefined`, so a setting nobody chose arrives
  as `null`.
- **Any other value that is not exactly `true` is read as `false`.** Every setting is a restriction, so
  a value that cannot be read restricts: a form that posts `"false"`, a column that stores `0`. Reading
  either as `true` would put hints on a paper whose school had switched them off. A development build
  warns when a policy is not valid.

Check a policy before you store it:

```ts
const checked = validateDeliveryPolicy(fromTheForm);
if (!checked.success) {
  return badRequest(checked.issues); // [{ path: 'hint', message: '"hint" is not a delivery setting…' }]
}
```

## What each activity does with it

| Activity | `feedback` | `solutions` | `hints` | AI |
|---|---|---|---|---|
| Multiple choice | Marks, option feedback, score | Marks only the options chosen; hides feedback written on the ones not chosen | — | Hints, explanations |
| Fill in the blanks | Marks, blank feedback, score | `showCorrectAnswers` writes nothing in | The author's hint on each blank | Hints, explanations |
| Gap select | Marks, gap feedback, score | Nothing to hide: it never shows the right choice | — | Hints, explanations |
| Dictation | Word marks, score | "Show solution" | Word hints | Explanations |
| Read-aloud | The grade, its marks and the grader's words | — | — | — |
| Written response | A returned grade read back in `review` | — | — | — |
| Interactive video | The score on the end card, which then counts answers | Its questions follow the video's policy | | |

"Not graded yet" and "No grade available" still show without `feedback`: they say nothing about the
answer.

## What is not here yet

These change grades, so they come next, on their own, with grade vectors:

- **What hints cost.** A penalty per hint, computed by the SDK and never by a host.
- **`ItemScoringPolicy`:** partial credit and negative marking, configured per paper.
- **Retries** in practice, and which attempt's score counts.

See the [roadmap](./roadmap.md#next--the-delivery-policy-then-ai).
