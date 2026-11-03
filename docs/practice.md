# Practice planning

`@intellectif/lk-practice` plans a learner's practice over a graph of skills: which skills to
retrieve next, in what form, at what difficulty, and when again. It is a separate, opt-in package:
`lk-core` and `lk-react` know nothing of it, and it does not depend on them.

Everything is a pure function over a replayable log. The package has no clock, randomness,
network, storage or model calls. You pass the time and store the log and the state. Your own AI writes
and grades the tasks, and the package checks what it returns. The same log always gives the same
state and the same plan. It needs **Node.js 24 or later**.

- [What you supply, what it keeps](#what-you-supply-what-it-keeps)
- [The skill graph](#the-skill-graph)
- [Items and evidence](#items-and-evidence)
- [Recording, storing and replaying](#recording-storing-and-replaying)
- [Held answers and host actions](#held-answers-and-host-actions)
- [Planning a session](#planning-a-session)
- [Generated tasks and the proof gate](#generated-tasks-and-the-proof-gate)
- [Grades from your grader](#grades-from-your-grader)
- [New skills for a learner's goal](#new-skills-for-a-learners-goal)
- [Configuration](#configuration)
- [Fitting FSRS weights yourself](#fitting-fsrs-weights-yourself)
- [Simulated learners](#simulated-learners)
- [Performance](#performance)

## What you supply, what it keeps

| You | The package |
|---|---|
| The skill graph, versioned | Validates it, and composes admitted extensions into it |
| Items: authored, or generated and proven | Validates them, and picks one for a target from your pool |
| The time, on every call | Never reads a clock |
| Storage for the log and the state | Returns the entries to append, and the new state |
| Prompts, model calls, sandboxes, people | Defines what each receives, and checks what each returns |
| The interface, timers and delivery | Plans, records and reports status |

Per skill it keeps four things:

- **A memory**, scheduled by FSRS-7 (through `ts-fsrs` 6), at the skill's current stage.
- **An ability per stage**: an Elo estimate on a logit scale. A task's difficulty is on the same
  scale, relative to its stage.
- **A stage** on its ladder: two spaced successes, at least a day apart, promote it, and two lapses
  demote it.
- **Readiness**: a skill is locked until its hard prerequisites are mastered, or credited by a
  placement.

A skill is **mastered** at the top stage of its ladder after two successes at least 72 hours apart,
while the latest retrieval is no lapse, its expected success at the skill's reference difficulty is
at least 0.80, and its recall stays within 0.10 of the desired retention. Mastery can be lost to
forgetting; the state reports it.

While a skill at its top stage is short of that 0.80, its reviews are **mastery checks**: they aim at
the skill's reference difficulty rather than at the target success, because passing tasks pitched
for 85% success says little about the standard. A passed check brings the next one within 72 hours.
A failed check counts as a `hard` review, not a lapse, so it neither demotes the skill nor counts
toward a leech. A failure is still a lapse when the task was at the learner's level, when recall had
fallen below the mastery floor, or when the last retrieval at that stage was a lapse too.

## The skill graph

```ts
import { validateGraph } from '@intellectif/lk-practice';

const graph = {
  version: 'python-basics@7', // change it whenever the graph changes
  skills: [
    { id: 'py.imports', knowledge: 'procedural', label: 'Imports' },
    { id: 'py.kwargs', knowledge: 'procedural', label: 'Keyword arguments' },
    { id: 'llm.call', knowledge: 'procedural', label: 'An LLM chat call' },
    { id: 'llm.vocab', knowledge: 'declarative', forms: { recall: ['cloze', 'short'] } },
  ],
  edges: [
    { kind: 'prerequisite', from: 'py.imports', to: 'llm.call', strength: 'hard' },
    { kind: 'prerequisite', from: 'py.kwargs', to: 'llm.call', strength: 'soft' },
    { kind: 'encompasses', from: 'llm.call', to: 'py.kwargs', weight: 0.5 },
  ],
};

const checked = validateGraph(graph); // { ok: true, graph, warnings } or { ok: false, issues }
```

- **`knowledge`** picks the default ladder. `mixed` needs its own `stages`.

  | Ladder | Stages, by demand 1 to 4 |
  |---|---|
  | `declarative` | `recognise`, `recall`, `produce`, `apply` |
  | `procedural` | `example`, `complete`, `write`, `transfer` |

  A skill's own `stages` replace its ladder. A task at one stage counts for a skill on another
  ladder at the stage of the same demand.
- **Prerequisites:**
  - `hard` locks the skill until the prerequisite is mastered or credited;
  - `soft` only orders new skills: those whose soft prerequisites are mastered come first.
- **`encompasses`** makes a composite: when its components are due at the matching stage, they join
  the composite's target, and one task practises them all (`needsSkillOutcomes`).
- **What the generator reads:** `label`, `description`, `criteriaHint`, `forms` and `tags` are passed
  to your generator as they are. `referenceDifficulty`, `masteryPrior` and `desiredRetention` tune one
  skill.
- **Issues:** the graph is refused for a cycle, an unknown skill, a duplicate id or a bad ladder,
  each with a `code` and a `path`.

## Items and evidence

An **item** is a task the learner can be shown. The package never sees its content, only this:

```ts
const item = {
  id: 'greet-formal-3',
  skills: [{ skillId: 'greetings', weight: 1 }], // weights sum to 1; the largest is the primary
  stage: 'recall',
  difficulty: 0.4, // logits, relative to the stage; 0 when absent
  fluentSeconds: 8, // at or under: easy
  slowSeconds: 30, // above: hard
  origin: 'authored',
  status: 'proven', // `record` refuses an unproven item
};
```

`validateItems(items, graph)` checks a batch against the graph.

**Evidence** is one answer to one item, with a unique `id` and its time `at`:

| `source.kind` | Means |
|---|---|
| `auto` | A check you ran: `score`, `maxScore`, `passed`, and optional `checks` |
| `ai` | A model's grade, with its `confidence`. `medium` counts at half weight, never `easy`; `low`, or `requiresHumanReview`, is held for a person |
| `human` | A person's grade |
| `self` | The learner's own rating, at reduced weight |
| `exposure` | Seen, not answered: no review |
| `pending` | Graded later; held until a grade confirms it |

The rating is:

- `again` when the answer did not pass;
- `hard` when it passed after a hint, a failed attempt or more than `slowSeconds`;
- `good` when it passed at the first try;
- `easy` when it also came within `fluentSeconds`.

`context` weighs the evidence:
- `practice` and `exam` count fully, but an exam moves no schedule unless you configure it to;
- `diagnostic` counts at its weight;
- `pretest` counts for nothing.

For a task over several skills, `skillOutcomes` gives each skill its own score.

## Recording, storing and replaying

```ts
import { createPractice } from '@intellectif/lk-practice';

const practice = createPractice(); // or createPractice(config)
let state = practice.initState('learner-42', graph);

const result = practice.record(state, { graph, item, evidence });
```

| `result.kind` | What to do |
|---|---|
| `applied` | Store `state` and append `appended` in one transaction. `events` (a review recorded, a skill promoted, mastered, unlocked) are for your interface |
| `replay-required` | The evidence is older than the newest entry. Append `appended`, then `replay` the whole log, or `replayFrom` your latest snapshot older than `replayFrom` |
| `duplicate` | This id is among the last 256 the state has seen (`recentIdWindow`). Nothing to store. An older repeat is your unique constraint's to refuse |
| `rejected` | `issues`, each with a `code` and a `path`. Nothing to append |

The log is the source of truth; the state is a cache of it. Store the entries with a unique
constraint on their id (an evidence entry's `evidence.id`, a host entry's `id`), and the state as
JSON. `migrateState(raw)` reads a stored state back,
checked.

- **A new configuration** changes `practice.configHash`. A state built under another is refused
  with `STATE_CONFIG_MISMATCH`: replay the log under the new configuration.
- **A new graph version** is refused with `GRAPH_VERSION_MISMATCH`. `reconcile(state, graph)` reports
  what changed: skills orphaned, skills new, stages a ladder lost. Then replay against the new
  graph.
- **`replay(entries, graph, learnerId)`** sorts the entries by time and sequence, checks every one,
  and rebuilds the state exactly. `replayFrom(checkpoint, entries, graph)` continues from a stored
  state.

`practice.status(state, graph, now)` gives every skill's status, along with its stage, due time,
current recall, ability and lapses, for a progress page. Statuses are `locked`, `ready`, `learning`,
`reviewing`, `mastered`, `credited` and `suspended`.

## Held answers and host actions

An answer whose grade is not final yet is **held**: a `pending` source, an AI grade flagged for
review, or an AI grade at low confidence. It changes nothing until a later evidence with
`confirms: '<held id>'` carries the final grade, and that grade then applies at the held answer's
time. A host action `{ kind: 'discard-held' }` drops it.

`practice.act(state, graph, { id, at, action })` records what the host decides, in the same log:

| `action.kind` | Does |
|---|---|
| `place` | Puts a skill at a stage, from a placement test. With `credited: true` it also counts as a prerequisite at once, and stays out of planning until evidence for it arrives |
| `prior` | Sets a starting ability from a placement test: `theta` and how many answers it is worth |
| `suspend`, `unsuspend` | Takes a skill out of planning, and puts it back. A leech (8 lapses by default) suspends itself |
| `reset-skill` | Starts a skill over |
| `discard-held` | Drops a held answer |

## Planning a session

```ts
const plan = practice.plan(state, graph, {
  now, // your clock
  dueBy: endOfToday, // plan reviews due before then too; `now` by default
  seed: sessionId, // ties break by it, so a plan is reproducible
  budget: { maxTargets: 10, maxSeconds: 900 },
  focusSkills: ['llm.call'], // a lesson's objectives, and their prerequisites
  pool: items, // proven items the planner may attach
});
```

Each **target** names one skill, or a composite and its due components. It also gives:

- the stage;
- a `targetDifficulty` at which the learner's expected success is the target success (0.85 by
  default), or the skill's reference difficulty for a mastery check (`reason.masteryCheck`);
- a tolerance;
- the expected seconds;
- `constraints`: the skill's forms, whether each skill needs its own outcome, and the item ids and
  content hashes to avoid;
- an `item` from your pool when one fits;
- a `reason` you can show.

Targets come in this order:

1. Overdue reviews, least recalled first.
2. Remediation: hard prerequisites of a skill that just lapsed, now below their mastery floor.
3. Reviews due by `dueBy`.
4. Stage-ups: skills just promoted.
5. New skills: the focus set first, in prerequisite order.

A large review backlog (100 by default) holds back new skills. `plan.deferred` counts what did not
fit the budget.

A pool item fits a target when all of these hold:

- it is proven;
- it is at the target's stage;
- it covers every target skill;
- it lies within the tolerance of `targetDifficulty` (0.5);
- it was not used in the last 7 days.

The closest in difficulty wins. A target with no `item` is one to generate.

## Generated tasks and the proof gate

```ts
import { admitCandidate, candidatesJsonSchema, checkCandidates, generationRequest } from '@intellectif/lk-practice';

// 1. The facts of the target: each skill's stage, forms, expected success, reference
//    difficulty, criteria hint, the learner's recent lapses and weakest skills, what to avoid.
const request = generationRequest(target, { graph, state, now }, { count: 3, seed: target.id });

// 2. Your model writes candidates, in your prompt, against `candidatesJsonSchema`.
const output = await myModel.generate(request, candidatesJsonSchema);

// 3. The package checks them against the request.
const { accepted, rejected } = checkCandidates(request, output);

// 4. You prove each one, then admit it with the proof.
const admitted = admitCandidate(accepted[0], {
  kind: 'executable', // the reference solution passed your tests, and a wrong one failed
  at: now,
  referencePassed: true,
  wrongSolutionsFailed: 1,
});
if (admitted.ok) await storeItem(admitted.item, accepted[0].content); // now `proven`
```

`checkCandidates` refuses a candidate whose stage, skills, weights, difficulty, form, criteria or
timing do not match the request, and one that repeats an id or content the learner should not see
again. Each refusal has a code and a path to send back to the model.

`admitCandidate` checks the proof against `acceptProofs`:

- `executable`: the starter fails, the solution passes;
- `reviewed`: a person approved it;
- `model-checked`: a second model agreed. It is off by default; add it to `acceptProofs` to allow it.

Only a proven item is ever planned or recorded.

## Grades from your grader

```ts
import { checkGradeResult, evidenceFromGrade, gradeResultJsonSchema } from '@intellectif/lk-practice';

const checked = checkGradeResult(await myGrader.grade(task, answer, gradeResultJsonSchema));
if (checked.ok) {
  const evidence = evidenceFromGrade(checked.value, task, { id, itemId: task.id, at, targetId });
  practice.record(state, { graph, item: task, evidence });
}
```

A criterion the item binds to a skill (`criteria: [{ name, skillId }]`) becomes that skill's outcome.
An `ai` grade without a confidence counts as `medium`.

## Outcomes from lk-core

If your activities are `@intellectif/lk-core` activities, `@intellectif/lk-practice/lk-core` turns
the outcome `evaluate` returns into evidence. It reads lk-core's shapes without importing lk-core, so
either package can move without the other.

```ts
import { evaluate } from '@intellectif/lk-core';
import { evidenceFromOutcome } from '@intellectif/lk-practice/lk-core';

const outcome = evaluate(activity, response);
const evidence = evidenceFromOutcome(outcome, item, { id: attemptId, itemId: item.id, at, attempts, hintsUsed });
if (evidence !== null) practice.record(state, { graph, item, evidence });
```

| lk-core outcome | Evidence |
|---|---|
| `scored` | an `auto` grade with the outcome's score |
| `graded` | the grade's grader (`auto` when it names none), confidence and review flag; its rubric criteria become skill outcomes through the item's `criteria` |
| `graded`, a model's grade routed to a person | held, `routed-to-person` |
| `deferred`, awaiting human review | held, `routed-to-person` |
| `deferred`, awaiting async grading, or a rejected grade | held, `deferred` |
| `deferred`, never answered (`no_response_recorded`) | `null`: nothing to record |
| `unscorable` | `null` |

When the grade arrives, record it with `confirms` set to the held evidence's id. A person's own grade
is never held, even when the model's grade it replaces was routed. A criterion that is
`notApplicable` or has no score is skipped; `skillOutcomesFromCriteria` gives the per-skill outcomes
alone.

## New skills for a learner's goal

When a learner sets a goal the graph does not cover, a model may propose the skills:

1. **Ask:** `decompositionRequest(goal, graph, { idPrefix, seed })` names the goal's anchor skills,
   their neighbours and the ladders.
2. **Check:** `checkDecomposition(request, graph, output)` checks the proposal. Its ids must sit
   under the prefix, its edges may only point into new skills, the composed graph must be valid, and
   every new skill must connect to an anchor. It returns an extension with a content id.
3. **Admit:** `admitExtension(extension, { by: 'author' | 'human' | 'learner', at })` admits it.
   Pass `{ allowLearner: false }` to require a person.
4. **Compose:** `composeGraph(base, extensions)` builds the new graph, with a new version. Replay the
   learner's log against it.

## Configuration

`createPractice(config)` resolves every default and hashes the result. `practice.config` holds the
resolved configuration, and `practice.configHash` its hash:

| Option | Default | Changes |
|---|---|---|
| `desiredRetention`, `stageRetention` | 0.9; none per stage | The recall a review aims for, overall or per stage |
| `planner.targetSuccess` | 0.85 | The expected success a target's difficulty aims for |
| `planner.difficultyTolerance` | 0.5 | How far an item may sit from it |
| `planner.limits` | 2 new skills, 3 remediations, 4 skills a target, a backlog of 100 | What one plan holds |
| `planner.coalesce` | `true` | Whether due components join a composite's target |
| `planner.pretestNewSkills` | `false` | A pretest before a new skill's first target |
| `ability.stageOffset` | 1 | How much lower a new stage's ability starts, per step of demand |
| `mastery` | 2 successes, 72 h apart, 0.80, a margin of 0.10 | The mastery rule above |
| `stagePolicyOptions` | promote after 2, a day apart; demote after 2 | The stage policy |
| `contexts` | exams move no schedule; diagnostic 1; pretest 0 | How each context counts |
| `ladders`, `stageDemand` | as above | Your own stage names |
| `itemCooldownMs`, `itemUsageRetentionMs` | 7 days, 30 days | Item reuse |
| `leechThreshold`, `recentIdWindow` | 8 lapses, 256 ids | When a skill suspends itself; how far back `record` reports a duplicate |
| `acceptProofs` | `executable`, `reviewed` | Which proofs admit an item |

`memoryModel`, `masteryModel`, `stagePolicy` and `evidenceMapper` take your own implementations of
each port. Each has an id and a version that enter the configuration hash.

## Fitting FSRS weights yourself

The package does not fit FSRS weights. `practice.exportReviewHistory(entries, graph, learnerId)`
replays the log and returns each skill's reviews per stage: rating, time and evidence id, with the
configuration hash that rated them. Fit with an FSRS optimiser once there is enough history, and
pass the weights back as `createPractice({ memoryModel: fsrsMemoryModel({ weights }) })`; the new
configuration hash means a replay.

## Simulated learners

```ts
import { simulateLearner } from '@intellectif/lk-practice/testing';

const learner = simulateLearner({
  seed: 'learner-1',
  skills: { greetings: { trueAbility: 1, forgettingDays: 20 } },
});
const { evidence, item } = learner.attempt(plan.targets[0], now);
const next = practice.record(state, { graph, evidence, item });
```

The simulated learner succeeds with a logistic chance of its true ability against the task's
difficulty, times its recall since its last attempt at the skill. Every draw comes from the seed, the
time and the skill. Two settings compared on the same learner therefore meet the same chances. Use it
to compare settings and in your own tests. It is a test tool, not a claim about real learners: its
recall does not grow with practice, so it cannot show what spacing is worth.

## Performance

Measured on Node 24.22.1 with the repository's benchmark (`pnpm --filter @intellectif/lk-practice bench`):
a 2,000-skill graph and a learner doing 50 tasks a day, each a new item.

| Call | Time |
|---|---|
| `record` on a state with 2,000 skills | about 1.3 ms |
| `plan` for 20 targets from a pool of 10,000 items | about 12 ms |
| `replay` of 100,000 entries | 5.2 to 5.7 s |

`record` and `replay` grow with the item usage a state keeps (30 days of tasks). Replay is a
recovery path: store snapshots and `replayFrom` the latest one.

See [Stability](./stability.md#practice-planning) for what `0.x` promises.
