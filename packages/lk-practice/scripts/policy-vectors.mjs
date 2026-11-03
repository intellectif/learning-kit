// Writes vectors/evidence.json and vectors/stage.json (criterion 4, design
// 8.2, 8.3, 8.5). The cases are chosen by hand: every R7.2 row and R7.4
// branch, the weight floor, held and exposure evidence, `SKILL_NOT_IN_TASK`,
// Elo and derived ability, the implication table, spaced successes, the due
// cap, promotion, demotion and the mastery conditions. The expected values are
// recorded from src/ through vectors/replay.mjs, so the files pin the current
// behaviour; the unit tests check the same rules against hand-computed values.
// Run with `pnpm vectors:policy`, then review the diff: a changed output is a
// behaviour change and needs a version (D26).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORPUS_VERSION, record } from '../vectors/replay.mjs';
import { loadSrc, PACKAGE } from './load-src.mjs';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);

const impl = await loadSrc('policy-vectors');

// ── Evidence (R7.2, R7.4, R7.8, D27) ─────────────────────────────────────────

const TASK = {
  itemId: 'i',
  skills: [{ skillId: 'a', weight: 1 }],
  stage: 'recall',
  difficulty: 0,
  origin: 'authored',
  fluentSeconds: 10,
  slowSeconds: 60,
};
const SPLIT = {
  ...TASK,
  skills: [
    { skillId: 'a', weight: 0.7 },
    { skillId: 'b', weight: 0.2 },
    { skillId: 'c', weight: 0.1 },
  ],
  criteria: [{ name: 'style', skillId: 'c' }],
};
const evidence = (source, extra = {}) => ({ id: 'e', itemId: 'i', at: T0, source, ...extra });
const auto = (score, maxScore, passed, extra = {}) => ({
  kind: 'auto',
  score,
  maxScore,
  passed,
  ...extra,
});
const ai = (confidence, extra = {}) => ({
  kind: 'ai',
  score: 4,
  maxScore: 4,
  passed: true,
  confidence,
  ...extra,
});
const map = (name, e, task = TASK, config = undefined) => ({
  kind: 'map',
  name,
  evidence: e,
  task,
  ...(config === undefined ? {} : { config }),
});

const GRAPH = {
  version: '1',
  skills: ['a', 'b', 'c', 'd', 'x'].map((id) => ({ id, knowledge: 'declarative' })),
  edges: [
    { kind: 'encompasses', from: 'a', to: 'd', weight: 1 },
    { kind: 'prerequisite', from: 'x', to: 'a', strength: 'hard' },
  ],
};

const SKILL = { id: 'a', knowledge: 'declarative' };
const LADDER = ['recognise', 'recall', 'produce', 'apply'];
const DEMAND = { recognise: -1, recall: 0, produce: 1, apply: 2 };
const observation = (correct, weight = 1, difficulty = 0) => ({
  correct,
  weight,
  difficulty,
  stage: 'recall',
  context: 'practice',
});

const evidenceVectors = [
  map('auto pass, first try, fluent: easy', evidence(auto(4, 4, true), { durationMs: 8000 })),
  map('auto pass at the fluent bound: easy', evidence(auto(4, 4, true), { durationMs: 10_000 })),
  map(
    'auto pass, between fluent and slow: good',
    evidence(auto(4, 4, true), { durationMs: 30_000 }),
  ),
  map('auto pass at the slow bound: good', evidence(auto(4, 4, true), { durationMs: 60_000 })),
  map(
    'auto pass, slower than slowSeconds: hard',
    evidence(auto(4, 4, true), { durationMs: 60_001 }),
  ),
  map('auto pass, no duration: good', evidence(auto(4, 4, true))),
  map('auto pass after a hint: hard, partial score', evidence(auto(3, 4, true), { hintsUsed: 1 })),
  map('auto pass after a failed try: hard', evidence(auto(4, 4, true), { attempts: 1 })),
  map('auto fail: again, correct is the score ratio', evidence(auto(1, 4, false))),
  map(
    'checks 3 of 4 under fraction 1: again, 0.75',
    evidence(auto(3, 4, true, { checks: { passed: 3, total: 4 } })),
  ),
  map(
    'checks 3 of 4 under fraction 0.75: pass',
    evidence(auto(0, 4, false, { checks: { passed: 3, total: 4 } })),
    TASK,
    { evidenceOptions: { checksPassFraction: 0.75 } },
  ),
  map(
    'checks with no total: again, 0',
    evidence(auto(4, 4, true, { checks: { passed: 0, total: 0 } })),
  ),
  map('checks 1 of 1: pass, 1', evidence(auto(0, 4, false, { checks: { passed: 1, total: 1 } }))),
  map('max score 0, passed: correct 1', evidence(auto(0, 0, true))),
  map(
    'max score 0, passed after a hint: hard, correct 1',
    evidence(auto(0, 0, true), { hintsUsed: 1 }),
  ),
  map('max score 0, failed: again, correct 0', evidence(auto(0, 0, false))),
  map(
    'max score 1 after a hint: correct is the ratio',
    evidence(auto(0.5, 1, true), { hintsUsed: 1 }),
  ),
  map(
    'a skill weight exactly at the floor still feeds memory',
    evidence(auto(4, 4, true), { durationMs: 30_000 }),
    {
      ...TASK,
      skills: [
        { skillId: 'a', weight: 0.7 },
        { skillId: 'b', weight: 0.3 },
      ],
    },
  ),
  map('human pass: good', evidence({ kind: 'human', score: 5, maxScore: 5, passed: true })),
  map('ai high, fluent: easy at full weight', evidence(ai('high'), { durationMs: 5000 })),
  map('ai medium, fluent: good at aiMediumWeight', evidence(ai('medium'), { durationMs: 5000 })),
  map('ai low: held', evidence(ai('low'))),
  map('ai flagged for review: held', evidence(ai('high', { requiresHumanReview: true }))),
  map('pending: held', evidence({ kind: 'pending', reason: 'deferred' })),
  map('exposure: no retrieval', evidence({ kind: 'exposure' })),
  map('self hard: selfCorrect at selfWeight', evidence({ kind: 'self', rating: 'hard' })),
  map(
    'split item: outcomes, criteria not assessed, weight floor',
    evidence(auto(3, 4, true), {
      durationMs: 30_000,
      skillOutcomes: [
        { skillId: 'b', score: 1, maxScore: 2 },
        { skillId: 'd', score: 2, maxScore: 2 },
      ],
    }),
    SPLIT,
  ),
  map(
    'split item without outcomes: overall per skill',
    evidence(auto(4, 4, true), { durationMs: 30_000 }),
    SPLIT,
  ),
  map('exam pass does not move the schedule', evidence(auto(4, 4, true), { context: 'exam' })),
  map('exam fail is reviewed', evidence(auto(0, 4, false), { context: 'exam' })),
  map('diagnostic: ability only', evidence(auto(4, 4, true), { context: 'diagnostic' })),
  map('supplement: ability only', evidence(auto(4, 4, true), { supplements: 'e0' })),
  {
    ...map('custom mapper configured: PracticeConfigError', evidence(auto(4, 4, true))),
    customMapper: true,
  },
  {
    kind: 'context-weight',
    name: 'context weights: diagnostic, pretest, the rest at 1',
    config: { contexts: { diagnosticWeight: 0.25, pretestWeight: 0.5 } },
    rows: ['diagnostic', 'pretest', 'practice', 'exam', null],
  },
  {
    kind: 'outcome-issues',
    name: 'SKILL_NOT_IN_TASK for an outcome outside the task',
    evidence: evidence(auto(1, 1, true), {
      skillOutcomes: [
        { skillId: 'a', score: 1, maxScore: 1 },
        { skillId: 'd', score: 1, maxScore: 1 },
        { skillId: 'x', score: 1, maxScore: 1 },
      ],
    }),
    task: TASK,
    graph: GRAPH,
  },
  {
    kind: 'elo',
    name: 'Elo defaults: correct, wrong, a harder item, half weight, weight 0',
    skill: SKILL,
    steps: [
      observation(1),
      observation(0),
      observation(1, 1, 1.5),
      observation(0.6, 0.5),
      observation(1, 0),
    ],
  },
  {
    kind: 'elo',
    name: 'Elo alpha 2, beta 0.5 from a prior',
    options: { alpha: 2, beta: 0.5 },
    prior: [0.2, 2],
    skill: SKILL,
    steps: [observation(1), observation(0, 1, -1)],
  },
  {
    kind: 'elo',
    name: 'Elo rejects correct above 1',
    skill: SKILL,
    steps: [observation(1.5)],
  },
  {
    kind: 'elo',
    name: 'Elo with no options: the defaults and the model reference',
    skill: SKILL,
    steps: [observation(1)],
  },
  {
    kind: 'elo',
    name: 'Elo prior with pseudo-count 0',
    prior: [0.5, 0],
    skill: SKILL,
    steps: [observation(1)],
  },
  {
    kind: 'elo',
    name: 'Elo prior with a fractional pseudo-count',
    prior: [0.5, 0.5],
    skill: SKILL,
    steps: [observation(1)],
  },
  {
    kind: 'elo',
    name: 'Elo prior with a negative pseudo-count: RangeError',
    prior: [0.5, -1],
    skill: SKILL,
    steps: [],
  },
  {
    kind: 'elo-options',
    name: 'Elo options: accepted values and each rejection',
    rows: [
      {},
      { alpha: 0.5 },
      { beta: 0 },
      { alpha: 1e-6, beta: 2 },
      null,
      [],
      'alpha',
      { gamma: 1 },
      { alpha: '1' },
      { beta: '1' },
      { alpha: 0 },
      { alpha: -1 },
      { beta: -1 },
    ],
  },
  {
    kind: 'elo-read',
    name: 'Elo abilities read back, and each rejected shape',
    rows: [
      { theta: 1, n: 0 },
      { theta: -0.5, n: 0.5 },
      { theta: 1, n: 3 },
      null,
      [],
      'theta',
      { theta: 1 },
      { theta: 1, x: 0 },
      { theta: 1, n: 0, x: 0 },
      { theta: '1', n: 0 },
      { theta: 1, n: '0' },
      { theta: 1, n: -1 },
    ],
  },
  ...[
    ['nothing stored, read at the first stage: init', {}, 'recognise'],
    ['nothing stored, read at recall: derived from init', {}, 'recall'],
    ['stored at the first stage, read there', { recognise: { theta: 0.3, n: 2 } }, 'recognise'],
    ['stored at the first stage only, read at apply', { recognise: { theta: 0.3, n: 2 } }, 'apply'],
    [
      'the first stage is nearer than a later one',
      { recognise: { theta: 0.3, n: 2 }, apply: { theta: 2, n: 4 } },
      'recall',
    ],
    [
      'a tie between two stages takes the lower',
      { recognise: { theta: 0.3, n: 2 }, produce: { theta: 2, n: 4 } },
      'recall',
    ],
    [
      'a tie away from the first stage takes the lower',
      { recall: { theta: 0.3, n: 2 }, apply: { theta: 2, n: 4 } },
      'produce',
    ],
    ['stored above only, read below', { apply: { theta: 2, n: 4 } }, 'recall'],
    ['stored above only, read at the first stage', { apply: { theta: 2, n: 4 } }, 'recognise'],
  ].map(([name, stored, stage]) => ({
    kind: 'ability',
    name,
    ladder: LADDER,
    demand: DEMAND,
    stageOffset: 0.5,
    skill: { ...SKILL, masteryPrior: 0.4 },
    stored,
    stage,
  })),
  {
    kind: 'ability',
    name: 'nothing stored: init at the first stage, derived to apply',
    ladder: LADDER,
    demand: DEMAND,
    stageOffset: 1,
    skill: { ...SKILL, masteryPrior: 0.4 },
    stored: {},
    stage: 'apply',
  },
  {
    kind: 'ability',
    name: 'derived from the nearest stored stage, then updated there',
    ladder: LADDER,
    demand: DEMAND,
    stageOffset: 0.5,
    skill: SKILL,
    stored: { recognise: { theta: 1, n: 3 }, apply: { theta: 0.2, n: 1 } },
    stage: 'produce',
    observation: observation(1, 1, 0.5),
  },
  {
    kind: 'ability',
    name: 'a stage off the ladder: RangeError',
    ladder: LADDER,
    demand: DEMAND,
    stageOffset: 1,
    skill: SKILL,
    stored: {},
    stage: 'write',
  },
];

// ── Stage policy and mastery (D15, R3.2, R3.5, R3.8) ─────────────────────────

const RATINGS = ['again', 'hard', 'good', 'easy'];
const rows = [];
for (const rating of RATINGS) {
  for (const [current, ev] of [
    [1, 0],
    [1, 1],
    [1, 2],
  ]) {
    rows.push([rating, current, ev]);
  }
}
const OPTIONS = { promoteAfter: 2, promoteGapMs: DAY, demoteAfter: 2 };
const step = (rating, at, evidenceStage) => ({
  rating,
  at,
  ...(evidenceStage ? { evidenceStage } : {}),
});

const DEFAULT_MEMORY = impl.createFsrsModel({});
const reviewed = DEFAULT_MEMORY.review(DEFAULT_MEMORY.init(), 'good', T0, {
  desiredRetention: 0.9,
  maximumIntervalDays: 36_500,
  learningSteps: ['1m', '10m'],
  relearningSteps: ['10m'],
});
const topMemory = {
  model: 'fsrs-7@1',
  memory: DEFAULT_MEMORY.serialize(reviewed.memory),
  due: reviewed.due,
  modelDue: reviewed.due,
  lastReviewAt: T0,
  reviews: 1,
  lapses: 0,
  streak: { successes: 1, firstSuccessAt: T0, lastSuccessAt: T0, lapses: 0 },
  superseded: false,
};
const STATE = {
  stage: 'apply',
  startedAt: T0 - 30 * DAY,
  unlockedAt: T0 - 30 * DAY,
  credited: false,
  suspended: null,
  memories: { apply: topMemory },
  ability: { apply: { theta: 3, n: 20 } },
  mastered: false,
  evidenceCount: 20,
  lastLapseAt: null,
  top: { successes: 2, firstSuccessAt: T0 - 2 * DAY, lastSuccessAt: T0, lastWasLapse: false },
};
const mastery = (name, state, t) => ({
  kind: 'mastery',
  name,
  ladder: LADDER,
  demand: DEMAND,
  stageOffset: 1,
  skill: SKILL,
  state,
  t,
});

const stageVectors = [
  { kind: 'implication', name: 'implication table, equivalent stages 0, 1, 2 against 1', rows },
  {
    kind: 'decide',
    name: 'spaced successes promote; an unspaced one does not count',
    options: OPTIONS,
    ladder: LADDER,
    start: 'recognise',
    steps: [
      step('good', T0),
      step('easy', T0 + 3_600_000),
      step('good', T0 + DAY),
      step('good', T0 + 2 * DAY),
    ],
  },
  {
    kind: 'decide',
    name: 'hard reviews, lapses demote, the first stage is a floor',
    options: OPTIONS,
    ladder: LADDER,
    start: 'recall',
    steps: [
      step('good', T0),
      step('hard', T0 + DAY),
      step('again', T0 + 2 * DAY),
      step('again', T0 + 3 * DAY),
      step('again', T0 + 4 * DAY),
      step('again', T0 + 5 * DAY),
    ],
  },
  {
    kind: 'decide',
    name: 'cross-ladder evidence on the equivalent stage; above and below are neutral',
    options: OPTIONS,
    ladder: ['example', 'complete', 'write', 'transfer'],
    start: 'complete',
    steps: [
      step('good', T0, 'complete'),
      step('again', T0 + DAY, 'write'),
      step('good', T0 + DAY, 'example'),
      step('again', T0 + 2 * DAY, 'example'),
    ],
  },
  {
    kind: 'decide',
    name: 'the top stage keeps counting and never promotes',
    options: { promoteAfter: 3, promoteGapMs: DAY, demoteAfter: 2 },
    ladder: LADDER,
    start: 'apply',
    steps: [
      step('good', T0),
      step('good', T0 + DAY),
      step('good', T0 + 2 * DAY),
      step('good', T0 + 3 * DAY),
    ],
  },
  {
    kind: 'decide',
    name: 'an unspaced success clears lapses carried in the streak',
    options: OPTIONS,
    ladder: LADDER,
    start: 'recall',
    streak: { successes: 1, firstSuccessAt: T0, lastSuccessAt: T0, lapses: 1 },
    steps: [step('good', T0 + 3_600_000), step('good', T0 + DAY)],
  },
  {
    kind: 'decide',
    name: 'a stage off the ladder: RangeError',
    options: OPTIONS,
    ladder: LADDER,
    start: 'recall',
    steps: [step('good', T0, 'write')],
  },
  mastery('mastered at the due time', STATE, reviewed.due),
  mastery('retrievability below the margin a year later', STATE, T0 + 365 * DAY),
  mastery(
    'every condition fails',
    {
      ...STATE,
      stage: 'produce',
      memories: {},
      ability: { apply: { theta: -1, n: 2 } },
      top: { successes: 1, firstSuccessAt: T0, lastSuccessAt: T0, lastWasLapse: true },
    },
    T0,
  ),
  mastery(
    'the last top-stage retrieval was a lapse',
    { ...STATE, top: { ...STATE.top, lastWasLapse: true } },
    T0,
  ),
  {
    ...mastery(
      'expected success exactly at the minimum passes',
      {
        ...STATE,
        ability: { apply: { theta: 0, n: 20 } },
      },
      reviewed.due,
    ),
    config: { mastery: { minExpectedSuccess: 0.5, uncertaintyMargin: 0 } },
  },
  {
    ...mastery(
      'the same ability fails once the reference is raised by the uncertainty margin (revised in M11)',
      {
        ...STATE,
        ability: { apply: { theta: 0, n: 20 } },
      },
      reviewed.due,
    ),
    config: { mastery: { minExpectedSuccess: 0.5 } },
  },
  {
    ...mastery('retrievability exactly at the floor passes', STATE, T0 + 30 * DAY),
    skill: {
      ...SKILL,
      desiredRetention: DEFAULT_MEMORY.retrievability(reviewed.memory, T0 + 30 * DAY),
    },
    config: { mastery: { retentionMargin: 0 } },
  },
  {
    kind: 'retention',
    name: 'retention precedence: skill, then stage, then config',
    config: { desiredRetention: 0.85, stageRetention: { recall: 0.8 } },
    rows: [
      [{ ...SKILL, desiredRetention: 0.95 }, 'recall'],
      [SKILL, 'recall'],
      [SKILL, 'apply'],
    ],
  },
  {
    kind: 'status',
    name: 'credited and never started',
    state: { ...STATE, credited: true, startedAt: null },
    input: { mastered: false, top: 'apply', hasHardPrerequisites: true },
  },
  {
    kind: 'status',
    name: 'credited, then started: learning below the top',
    state: { ...STATE, credited: true, stage: 'recall' },
    input: { mastered: false, top: 'apply', hasHardPrerequisites: true },
  },
  {
    kind: 'status',
    name: 'unlocked, not started: ready despite hard prerequisites',
    state: { ...STATE, stage: 'recognise', startedAt: null },
    input: { mastered: false, top: 'apply', hasHardPrerequisites: true },
  },
  {
    kind: 'status',
    name: 'state neither started nor unlocked, no hard prerequisites: ready',
    state: { ...STATE, stage: 'recognise', startedAt: null, unlockedAt: null },
    input: { mastered: false, top: 'apply', hasHardPrerequisites: false },
  },
  {
    kind: 'status',
    name: 'state neither started nor unlocked, hard prerequisites: locked',
    state: { ...STATE, stage: 'recognise', startedAt: null, unlockedAt: null },
    input: { mastered: false, top: 'apply', hasHardPrerequisites: true },
  },
  {
    kind: 'status',
    name: 'no state, hard prerequisites: locked',
    state: null,
    input: { mastered: false, top: 'apply', hasHardPrerequisites: true },
  },
  {
    kind: 'status',
    name: 'suspended wins',
    state: { ...STATE, suspended: 'leech' },
    input: { mastered: true, top: 'apply', hasHardPrerequisites: false },
  },
  {
    kind: 'status',
    name: 'at the top, not mastered: reviewing',
    state: STATE,
    input: { mastered: false, top: 'apply', hasHardPrerequisites: false },
  },
  {
    kind: 'status',
    name: 'mastered',
    state: STATE,
    input: { mastered: true, top: 'apply', hasHardPrerequisites: false },
  },
];

function write(file, comment, vectors) {
  const body = { $comment: comment, version: CORPUS_VERSION, vectors: record(impl, vectors) };
  writeFileSync(join(PACKAGE, 'vectors', file), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

write(
  'evidence.json',
  'Evidence mapping and ability vectors for @intellectif/lk-practice (criterion 4), generated by scripts/policy-vectors.mjs and run by vectors/replay.mjs. `map` calls mapEvidence with the configuration resolved from `config`; `outcome-issues` calls skillOutcomeIssues; `context-weight` is the weight of each context; `elo` applies each observation in turn; `elo-options` and `elo-read` resolve options and read abilities back; `ability` reads (and updates) a stored ability per stage. Floats compare at a relative 1e-9; integers, strings and null exactly.',
  evidenceVectors,
);
write(
  'stage.json',
  'Stage policy and mastery vectors for @intellectif/lk-practice (criterion 4), generated by scripts/policy-vectors.mjs and run by vectors/replay.mjs. `implication` rows are [rating, current index, evidence index]; `decide` threads the streak and the stage through each step from `streak` (empty when absent) at `start`; `retention` is the desired retention per skill and stage; `mastery` lists the failing conditions of R3.5 with the default FSRS-7 model, and whether the skill is mastered; `status` is the skill status. Times and due values compare exactly.',
  stageVectors,
);
console.log(`policy vectors: ${evidenceVectors.length} evidence, ${stageVectors.length} stage`);
