# Grading open responses with a model

A model can grade a written response for the record: on your server, against the item's rubric. The
SDK builds what the model is told and checks what it says. It also does the arithmetic, and decides,
by rules you set, whether the grade counts or goes to a person first. It measures how a model's grades
agree with your teachers' on your own responses, and in an exam it lets no model's grade count until
you have measured it. As with [AI help](./ai.md), the model is yours: the SDK never calls one.

It describes `@intellectif/lk-core` 1.5.0.

- [The flow](#the-flow)
- [Levels on a rubric](#levels-on-a-rubric)
- [What your model is given](#what-your-model-is-given)
- [What it returns](#what-it-returns)
- [From a judgement to a grade](#from-a-judgement-to-a-grade)
- [Measuring a grader against people](#measuring-a-grader-against-people)
- [Where a grade goes](#where-a-grade-goes)
- [The audit sample](#the-audit-sample)
- [Choosing thresholds](#choosing-thresholds)
- [Testing your grading prompt](#testing-your-grading-prompt)
- [What is not here](#what-is-not-here)

## The flow

```ts
import {
  aiGradingRequest,
  checkAiGrading,
  contentHash,
  gradeFromJudgement,
  outcomeFromRoutedGrade,
  routeGrade,
} from '@intellectif/lk-core';

const PROMPT_HASH = contentHash(GRADING_PROMPT);

const built = aiGradingRequest({ data: item, response, group, learnerLocale });
if (!built.ok) {
  // built.problem: 'no-rubric', 'unreadable-levels', 'empty-response', …
  return queueForATeacher(slot);
}
const checked = checkAiGrading(await model.json(GRADING_PROMPT, built.request), built.request);
if (!checked.ok) {
  // checked.refusal: 'misses-criteria', 'out-of-scale', 'misquotes-answer', …
  return askAgainOrQueue(slot, checked.refusal); // never a 0
}
const grade = gradeFromJudgement(
  { ...checked.judgement, provenance: { model: MODEL_ID, promptHash: PROMPT_HASH } },
  item,
);
if ('unscorable' in grade) {
  return queueForATeacher(slot);
}
const routing = routeGrade(grade, {
  mode: 'exam',
  item,
  calibration: await reports.latest(MODEL_ID, PROMPT_HASH, item.id), // or undefined
  policy,
  sampleKey: `${attempt.id}:${slot.id}`,
});
const outcome = outcomeFromRoutedGrade(grade, routing);
// 'graded' when the model's grade counts; otherwise 'deferred' with reason
// 'awaiting_human_review', and the model's grade kept on outcome.pendingGrade.
```

Each step can say no, and none of them turns a no into a 0. A response with no grade is still owed one.

**Name the model and the prompt revision on every grade.** `gradeFromJudgement` copies them from the
judgement's `provenance` onto `grade.grader`, and a calibration is matched on them. A grade that does
not name them is never matched to a report, so in an exam it always goes to a person.

## Levels on a rubric

A criterion can be judged on levels the author writes, rather than on a number the model makes up:

```jsonc
"rubric": {
  "criteria": [
    {
      "name": "Task",
      "description": "Says what the learner did last weekend, in order",
      "weight": 1,
      "levels": [
        { "label": "Not met", "description": "Not about last weekend" },
        { "label": "Partly met", "description": "About the weekend, but thin or out of order" },
        { "label": "Met", "description": "Says what they did, in order" }
      ]
    },
    { "name": "Vocabulary", "description": "Everyday words, used correctly", "weight": 1 }
  ]
}
```

- **Lowest first, from 2 to 10 levels.** Each has a `label` that is not blank, and an optional
  `description`. Labels are compared the way names are, ignoring case and extra spacing, so two
  labels must still differ once those are ignored.
- **A level's score is its place on the scale**: `index / (levels − 1)`. Three levels score 0, 0.5
  and 1. The criterion's `weight` applies as it does without levels.
- **A criterion without levels** is judged on a score from 0 to 1, or out of a `maxScore`. One rubric
  can mix the two.
- **`validateActivity` does not check `levels` in 1.x**, so a field of that name you already use
  keeps your items valid, as the [stability promise](./stability.md#content) requires. What reads
  levels is strict instead:
  - [the critic](./authoring.md#reviewing-an-item-the-critic-12) reports `wr_levels_unreadable`;
  - `aiGradingRequest` builds no request (`unreadable-levels`);
  - `calibrationReport` refuses the rubric.
- **Learners see them.** The rubric is public in `redact()`, and each level's `label` and
  `description` go with it. Levels that cannot be read are left out of the projection, not refused.

## What your model is given

`aiGradingRequest({ data, response, group?, learnerLocale? })` works from the whole item. It builds
no request:
- for another type of item (`not-written-response`), or a `redact()` projection (`redacted`);
- for an item with no rubric (`no-rubric`);
- for two criteria with one name (`duplicate-criteria`);
- for levels it cannot read (`unreadable-levels`);
- for an empty response (`empty-response`).

The author's AI switch is not read: grading is the deployment's decision, not help a learner asks for.

`request.facts` carries:

- the `prompt` and `title`, and the item's `locale` and `languageTarget` (`en-A2`) when the author
  gave them;
- `text`, the response exactly as submitted, and `wordCount`, counted with `countWords`, with
  `minWords`, `maxWords` and `withinWordBounds`;
- `rubric`: every criterion in the author's order, each with its `name`, `description`, `weight` and
  `levels`. `levels` is `null` on a criterion judged on a score.

A task inside an item group also carries the group's `material`, the passage a summary is of. See
[A question in an item group](./ai.md#a-question-in-an-item-group-140). Write `comment` and
`feedback` in `learnerLocale` when it is set.

## What it returns

```ts
{
  criteria: [
    { name: 'Task', level: 'Met', probabilities: [0.05, 0.15, 0.8], comment: 'All three, in order.' },
    { name: 'Vocabulary', score: 0.8 },
  ],
  feedback: 'A clear account of your weekend. Watch your past tenses.',
  corrections: [{ original: 'buyed', corrected: 'bought', category: 'tense' }],
  rationale: 'Covers the task; two tense errors; everyday words used correctly.',
  requiresHumanReview: false,
}
```

`checkAiGrading(raw, request)` accepts it whole or not at all. A refused reply is no grade: ask the
model again or send the response to a person.

- **Every criterion of the rubric, once** (`misses-criteria`). A grade that leaves a criterion out
  is refused, and so is one that invents or renames a criterion, judges one twice, or calls one not
  applicable. Weights renormalised over fewer criteria grade a different task.
- **Each criterion on its own scale** (`out-of-scale`):
  - **With levels:** a `level` the criterion has, written as the author labelled it, case and
    spacing aside. `probabilities` are optional. When sent, they are one per level, lowest first:
    a distribution summing to 1 within `AI_GRADING_PROBABILITY_TOLERANCE`, whose likeliest is the
    level chosen.
  - **Without levels:** a `score` from 0 to its `maxScore`, 1 when left out.
  - Sending a score on levels, or a level on a score, is refused.
- **Every correction quotes the response** (`misquotes-answer`), anchored as
  [feedback on writing](./ai.md#feedback-on-writing) anchors it.
- **Limits:**
  - 20 corrections;
  - 500 characters for a comment, a quote, a correction or an explanation, and 40 for a `category`;
  - 2,000 characters for `feedback` and for `rationale`;
  - over any of them is `too-long`.

  `requiresHumanReview` is a boolean, `false` when left out. Anything else that is not what it should
  be is `malformed`.

The total is not in the reply. A model is asked for judgement, not arithmetic.

## From a judgement to a grade

`gradeFromJudgement(judgement, item, options?)` gives the `GradeRecord` you store. The total is
computed as [`gradeFromRubric`](./authoring.md#getting-a-deferred-grade-back-v04) computes every
grade, with the item's own weights and pass line. `options` takes a `passThreshold` and a `rounding`
policy, as `gradeFromRubric` does.

The record keeps what a routing rule and a calibration read later:
- each criterion's level as `band` and its probabilities as `levelProbabilities`;
- the corrections, the `rationale` and `requiresHumanReview`;
- `grader: { kind: 'ai', model, promptHash }`, and `usage`;
- `gradedAt`, taken from the provenance's `generatedAt`.

The judgement must be of this item: one whose criteria are not this rubric's is `unscorable`, never a
grade on another rubric.

## Measuring a grader against people

A model earns a place on a paper of record with evidence: how its grades agree with your teachers'
on responses your learners wrote. Have people mark a set of responses the model graded, then
measure:

```ts
import { calibrationReport } from '@intellectif/lk-core';

const built = calibrationReport(
  marked.map((one) => ({
    model: one.modelGrade,
    person: one.teacherGrade,
    secondPerson: one.secondTeacherGrade, // optional
  })),
  item,
);
if (built.ok) {
  await reports.save(built.report); // built.reason says why there is no report
}
```

- **A pair is one response, marked twice**: the model's grade, and a person's grade of the same
  response, criterion by criterion, on the same scales. On a criterion with levels, the person's
  `band` is the level's label.
- **A second person is optional.** Their grade gives the agreement between two people that a model
  is compared with.
- **One report measures one configuration**: a model, a prompt revision, a rubric and a target
  language. The rubric is identified by its `contentHash`, levels and descriptions included. Change
  any of the four and it is a different grader, measured afresh. Pairs from two configurations are
  refused, and so is a "person's" grade that a model gave.
- **Each criterion is measured over the pairs where both judged it on its scale.** A metric that is
  undefined is `null`, never a number made up: a kappa with no variance, a correlation over one pair,
  a degradation without a second person.
- **The degradation is how far the model falls short of two people.** On levels it is the human kappa
  minus the model's. On a score, and on the total, it is the human r minus the model's.
- **The report is pure**: the same pairs give the same report and the same `reportHash`. A routed
  grade records that hash, so an appeal can find what the decision relied on.

| Metric | Criterion on levels | Criterion on a score | Total |
|---|---|---|---|
| `pairs` | yes | yes | yes |
| `exactAgreement`, `adjacentAgreement` (same level, at most one apart) | yes | | |
| `quadraticKappa`: agreement beyond chance, quadratic weights | yes | | |
| `confusion[personLevel][modelLevel]` | yes | | |
| `pearson` | yes | yes | yes |
| `meanAbsoluteError`, on scores from 0 to 1 | yes | yes | yes |
| `standardizedMeanDifference`: the model's mean minus the person's, over their pooled SD; positive is more lenient | yes | yes | yes |
| `calibrationError` (ten bins) and `brierScore`, over grades that carried probabilities | yes | | |
| `humanPearson` and `degradation`, with a second person; `humanQuadraticKappa` too on levels | yes | yes | yes |
| `passAgreement`: the same pass or fail | | | yes |

## Where a grade goes

`routeGrade(grade, context)` decides, deterministically, whether a model's grade counts. If it does
not, the grade goes to a person, and the decision says every reason, in this order:

| Reason | When |
|---|---|
| `no-calibration` | In `exam`, no report of this grade's exact configuration was supplied. Fail closed: until you have measured this model, this prompt, this rubric and this target, every grade goes to a person |
| `calibration-below-policy` | The report misses one of your thresholds, on a criterion or on the total. A metric the report cannot give fails the threshold that needs it |
| `unsure` | Under `minLevelProbability`, a criterion on levels whose chosen level the model gave a lower probability, or no probabilities at all |
| `model-asked` | The model set `requiresHumanReview` |
| `low-confidence` | Under `routeLowConfidence`, a grade whose `confidence` is `low` |
| `audit-sample` | The response is in [the audit sample](#the-audit-sample) |

```ts
import type { GradeRoutingPolicy } from '@intellectif/lk-core';

const policy: GradeRoutingPolicy = {
  calibration: {
    minPairs: board.minPairs,
    minQuadraticKappa: board.minKappa,
    maxAbsStandardizedMeanDifference: board.maxMeanDifference,
    maxDegradation: board.maxDegradation,
  },
  minLevelProbability: board.minLevelProbability,
  audit: { rate: board.auditRate, seed: board.term },
};
```

- **Every part of the policy is optional, and has no default.** A threshold you leave out is not
  checked. See [Choosing thresholds](#choosing-thresholds).
- **The calibration thresholds:**
  - `minPairs`, `maxMeanAbsoluteError`, `maxAbsStandardizedMeanDifference` and `maxDegradation`
    apply to every criterion and to the total;
  - `minQuadraticKappa` and `minExactAgreement` apply to criteria on levels;
  - `minPearson` applies to criteria on a score, and to the total;
  - `maxCalibrationError` applies to criteria on levels whose grades carried probabilities.
- **In `practice`, no report is needed.** A grade counts unless another reason sends it to a person.
- **A policy that cannot be applied throws a `RangeError`**, before the grade is read. That covers:
  - a mode other than `exam` or `practice`;
  - a threshold that is not a finite number, or a rate outside 0 to 1;
  - an audit without a `sampleKey`.

  It is your configuration that is wrong, and a typo must not quietly turn an exam into a practice.

`outcomeFromRoutedGrade(grade, routing)` gives the slot its outcome:
- **To the model:** `graded`, with the decision kept on `grade.routing`. A record whose numbers cannot
  be a grade is refused, as `outcomeFromGrade` refuses one (`grade_rejected`).
- **To a person:** `{ status: 'deferred', reason: 'awaiting_human_review', maxScore: 1, pendingGrade }`.

A held grade is not a verdict. `composeAssessmentScore` holds the attempt `provisional`, with
`passed: null`, until a person's grade replaces it. lk-react shows the slot as it shows any deferred
one: "Not graded yet.", with none of the model's numbers. When the teacher marks it, lift their grade
with `outcomeFromGrade`. Their grade and the `pendingGrade` beside it then make a calibration pair.

## The audit sample

A model's agreement does not stay put. A new kind of response, or a model updated behind the same
name, moves it, and only fresh pairs show that. `audit: { rate, seed }` sends a share of the grades
that would have counted to a person too:

- **`inAuditSample(sampleKey, rate, seed)` chooses them.** The same response is always in or always
  out, so a re-run routes it the same way. A new seed draws a new sample, say each term. Two
  responses of one attempt are drawn independently.
- **Have them marked without the model's grade.** A teacher who sees the model's grade before
  marking is measuring something else. Keep `pendingGrade` out of the marking screen.
- **Those pairs are the next report's.** They come from the responses your learners write now.

## Choosing thresholds

The SDK ships no thresholds, just as it ships no rounding default. What agreement admits a model to a
paper of record is your programme's decision, and an appeal will ask who made it.

Published practice is where to start. Williamson, Xi and Breyer, "A Framework for Evaluation and Use
of Automated Scoring" (*Educational Measurement: Issues and Practice* 31(1), 2012, pp. 2–13), sets out
the evidence large-scale programmes look for:
- the fit between what the scoring can do and what the test is for;
- agreement with people;
- association with other measures;
- generalisation across tasks and forms;
- the effect on subgroups.

Programmes publish reference values for the agreement statistics. Take them from those sources, not
from here.

No single number is enough:
- A correlation can be high while the model is consistently a level more lenient. The standardised
  mean difference shows that.
- Exact agreement can look high on a rubric where most responses sit on one level. Kappa corrects
  for chance.
- A model that agrees with people about as well as two people agree with each other is as good as
  people can check. That is what the degradation measures.

A report is only as good as its pairs: enough of them, from the responses your learners write,
marked by people who did not see the model's grade.

## Testing your grading prompt

The [AI check kit](./ai.md#testing-your-prompt) calls a `grading` port on essays whose rubric has
three criteria, two on levels and one on a score:
- an essay that does the task;
- one with mistakes to quote exactly as written;
- one about something else;
- a summary graded against its group's passage;
- one with comments asked for in Spanish.

`misses-criteria` there means the prompt names only the criteria it expects. `out-of-scale` means it
grades on a scale the author did not write. A case the SDK accepts is a reply of the right shape,
not a right grade. Whether a model grades as your teachers do is what a calibration measures.

## What is not here

- **Calling a model, storing reports and setting thresholds.** These stay yours.
- **A marking queue for teachers.** `pendingGrade` and `routing` are the data one needs.
- **Subgroup analysis.** Run `calibrationReport` on each group's pairs, and compare the reports.
- **Grading a spoken response.** It comes next, on this contract: see the
  [roadmap](./roadmap.md).
