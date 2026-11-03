# @intellectif/lk-practice

Plans a learner's practice. Over a graph of skills, it answers one question for a learning product:
**which skills should this learner retrieve next, in what form, at what difficulty, and when again?**

**Pure functions over a replayable log.** No clock, no randomness, no network, no storage and no
model calls: you pass the time, you store the log and the state, and your own AI writes and grades
the tasks. The same log always gives the same state and the same plan. Requires **Node.js 24 or
later**.

```bash
pnpm add @intellectif/lk-practice
```

It does not depend on `@intellectif/lk-core`, and works without it.

## What it keeps, per skill

- **A memory**, scheduled by [FSRS-7](https://github.com/open-spaced-repetition/ts-fsrs) at the
  skill's current stage: when it is due again, and how likely the learner is to recall it now.
- **An ability** per stage: an Elo estimate on a logit scale, so a task can be pitched where the
  learner should succeed about 85% of the time.
- **A stage** on a ladder, from recognising to applying, or from a worked example to transfer.
  Spaced successes promote it; lapses demote it.
- **Readiness**, from your prerequisite graph: a skill unlocks once its hard prerequisites are
  mastered, or credited by a placement. At the top stage, reviews become mastery checks at the
  skill's reference difficulty until the learner meets the standard.

## Use

```ts
import { createPractice, validateGraph } from '@intellectif/lk-practice';

const graph = {
  version: 'spanish-a1@3',
  skills: [
    { id: 'greetings', knowledge: 'declarative' },
    { id: 'ser-present', knowledge: 'declarative' },
    { id: 'introduce-yourself', knowledge: 'procedural' },
  ],
  edges: [
    { kind: 'prerequisite', from: 'greetings', to: 'introduce-yourself', strength: 'hard' },
    { kind: 'prerequisite', from: 'ser-present', to: 'introduce-yourself', strength: 'hard' },
  ],
} as const;
if (!validateGraph(graph).ok) throw new Error('fix the graph first');

const practice = createPractice(); // the defaults; the configuration is hashed into the state
let state = practice.initState('learner-42', graph);

// What to practise now: targets, each a skill (or a skill and its components) at a stage
// and a difficulty, with an item from your pool when one fits.
const plan = practice.plan(state, graph, {
  now: Date.now(),
  seed: 'session-1',
  budget: { maxTargets: 10 },
  pool: items, // your proven items
});

// The learner answered: record it, then store the new state and the appended log entries
// together, in one transaction.
const result = practice.record(state, {
  graph,
  item,
  evidence: {
    id: 'ev-1',
    itemId: item.id,
    at: Date.now(),
    targetId: plan.targets[0].id,
    source: { kind: 'auto', score: 1, maxScore: 1, passed: true },
  },
});
if (result.kind === 'applied') {
  state = result.state;
  await save(result.state, result.appended, result.events);
} else if (result.kind === 'replay-required') {
  // Evidence that arrived late: append it, then replay the log.
  await append(result.appended);
  const replayed = practice.replay(await loadLog(), graph, 'learner-42');
  if (replayed.ok) state = replayed.state;
}
```

## The log is the truth

`record` is "append, then replay incrementally": the state is a cache of the log. `replay` and
`replayFrom` rebuild it, so a new configuration, a changed graph or evidence that arrives out of
order is a replay, never a migration. A state built under another configuration or graph version is
refused (`STATE_CONFIG_MISMATCH`, `GRAPH_VERSION_MISMATCH`) until you replay.

- **Held evidence:** an answer waiting for a person's grade is recorded as `pending`, and the grade
  confirms it later at its original time.
- **Host actions** (`act`): placement, a prior from a placement test, suspend, unsuspend, reset.
- **`status`** gives every skill's status, stage, due time, recall and ability, for a progress page.
- **`exportReviewHistory`** gives the reviews per skill and stage, to fit FSRS weights yourself.

## Generated tasks and goals

The package never calls a model. It defines what your model receives and checks what it returns:

- **Tasks:** `generationRequest` hands your generator the facts of a target: each skill's stage,
  forms, expected success and reference difficulty, and what to avoid. `checkCandidates` checks what
  came back. Nothing is recorded until `admitCandidate` sees a proof you supply:
  - for code, the reference solution passes and a wrong one fails;
  - or a person's review;
  - or, if your configuration accepts it, a second model.
- **Grades:** `checkGradeResult` checks your grader's output, and `evidenceFromGrade` turns it into
  evidence, per skill where criteria bind skills.
- **Goals:** `decompositionRequest` and `checkDecomposition` let a model propose new skills for a
  learner's goal, and `admitExtension` admits them once you or the learner approve.

The JSON Schemas (`gradeResultJsonSchema`, `candidatesJsonSchema`, `decompositionJsonSchema`) are
for structured model output. The Standard Schema validators (`gradeResultSchema` and the others)
work with any library that reads the spec.

## Testing

`@intellectif/lk-practice/testing` exports `simulateLearner`: a deterministic simulated learner
(a true ability and a forgetting rate per skill, seeded noise) that drives `plan` and `record` over
simulated weeks, for comparing settings and for your own tests. It is a test tool, not a claim
about real learners.

## Stability

`0.x`: a minor may change behaviour, and its changeset says how. Each model and policy has an id
and a version, hashed into the state's configuration hash, so a state always names the rules it was
built under. The log, plan and contract vectors in the repository pin today's behaviour. The guide
and the stability policy:

- [Practice planning guide](https://github.com/intellectif/learning-kit/blob/main/docs/practice.md)
- [Stability](https://github.com/intellectif/learning-kit/blob/main/docs/stability.md#practice-planning)
