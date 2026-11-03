// Writes vectors/log.json (criterion 4, design 6, 8.1, 8.7; revised in M5).
// The cases are chosen by hand: reviews to mastery and an unlock, the decay
// that loses mastery, held evidence confirmed, discarded and confirmed by
// look-ahead, late evidence and replay, checkpoints, duplicates, every record
// and act rejection, each host action, a leech, the evidence contexts, a
// recompute under another configuration, stored states into migrateState,
// each log's review history (revised in M8), mastery checks (revised in M9),
// the Appendix B placement flow (criterion 17; revised in M10), and
// hypotheses in the log: every open, probe and close rule, and probe answers
// that change only their hypothesis (revised in M12). The expected values are recorded from src/ through
// vectors/replay.mjs, so the file pins the current behaviour; the unit tests
// check the same rules by hand. Run with `pnpm vectors:log`, then review the
// diff: a changed output is a behaviour change and needs a version (D26).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORPUS_VERSION, record } from '../vectors/replay.mjs';
import { loadSrc, PACKAGE } from './load-src.mjs';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);

const impl = await loadSrc('log-vectors');

/** `a` and `b` climb recall then produce; `b` needs `a` (hard); `c` takes the declarative ladder. */
const MAIN = {
  version: 'g1',
  skills: [
    { id: 'a', knowledge: 'declarative', stages: ['recall', 'produce'] },
    { id: 'b', knowledge: 'declarative', stages: ['recall', 'produce'] },
    { id: 'c', knowledge: 'declarative' },
  ],
  edges: [{ kind: 'prerequisite', from: 'a', to: 'b', strength: 'hard' }],
};
const GRAPHS = {
  main: MAIN,
  next: { ...MAIN, version: 'g2' },
  grown: {
    version: 'g3',
    skills: [...MAIN.skills.slice(0, 2), { id: 'd', knowledge: 'procedural' }],
    edges: MAIN.edges,
  },
};

/** Single-stage skills: `p` credited unlocks `r` and `t` (edges out of graph order); `s` needs `p` and `q`. */
const FAN = {
  version: 'f1',
  skills: ['p', 'q', 'r', 's', 't', 'u'].map((id) => ({
    id,
    knowledge: 'declarative',
    stages: ['recall'],
  })),
  edges: [
    { kind: 'prerequisite', from: 'p', to: 't', strength: 'hard' },
    { kind: 'prerequisite', from: 'p', to: 's', strength: 'hard' },
    { kind: 'prerequisite', from: 'q', to: 's', strength: 'hard' },
    { kind: 'prerequisite', from: 'p', to: 'r', strength: 'hard' },
    { kind: 'prerequisite', from: 'r', to: 'q', strength: 'soft' },
    { kind: 'encompasses', from: 't', to: 'p', weight: 0.5 },
  ],
};
/** `a` keeps recall and replaces produce with apply; the version stays. */
const RELADDER = {
  ...MAIN,
  skills: [
    { id: 'a', knowledge: 'declarative', stages: ['recall', 'apply'] },
    ...MAIN.skills.slice(1),
  ],
};
const OTHER = {
  version: 'g4',
  skills: [{ id: 'z', knowledge: 'procedural' }],
  edges: [],
};

const pass = { kind: 'auto', score: 1, maxScore: 1, passed: true };
const fail = { kind: 'auto', score: 0, maxScore: 1, passed: false };
const lowAi = { kind: 'ai', score: 1, maxScore: 1, passed: true, confidence: 'low' };
const human = (passed) => ({ kind: 'human', score: passed ? 1 : 0, maxScore: 1, passed });

const item = (id, skillId = 'a', stage = 'recall', extra = {}) => ({
  id,
  skills: [{ skillId, weight: 1 }],
  stage,
  origin: 'generated',
  status: 'proven',
  ...extra,
});
/** A step recording `source` for item `itemId` on `skillId` at `stage`. */
const ev = (
  id,
  at,
  source = pass,
  { skill = 'a', stage = 'recall', itemId, extra, ...step } = {},
) => {
  const target = itemId ?? `i-${skill}-${stage}`;
  return {
    evidence: { id, itemId: target, at, source, ...extra },
    item: item(target, skill, stage),
    ...step,
  };
};
const confirm = (id, at, heldId, itemId, passed = true) => ({
  evidence: { id, itemId, at, source: human(passed), confirms: heldId },
});
const act = (id, at, action, step = {}) => ({ act: { id, at, action }, ...step });
/** Evidence on one item for `r` and `q`, listed against graph order. */
const pair = (id, at, source) => ({
  evidence: { id, itemId: 'i-qr', at, source },
  item: {
    id: 'i-qr',
    skills: [
      { skillId: 'r', weight: 0.5 },
      { skillId: 'q', weight: 0.5 },
    ],
    stage: 'recall',
    origin: 'generated',
    status: 'proven',
  },
});

/** Passes on `a` at each due time until it is mastered, from `start` (bounded). */
function untilMastered(start = T0) {
  const practice = impl.createPractice({});
  let state = practice.initState('l1', MAIN);
  const steps = [];
  let at = start;
  for (let i = 0; i < 40 && !state.skills.a?.mastered; i += 1) {
    const stage = state.skills.a?.stage ?? 'recall';
    const step = ev(`m${i}`, at, pass, { stage, itemId: `m${i}` });
    const result = practice.record(state, { graph: MAIN, ...step });
    if (result.kind !== 'applied') throw new Error(`untilMastered: ${result.kind}`);
    state = result.state;
    steps.push(step);
    const memory = state.skills.a.memories[state.skills.a.stage];
    at = Math.max(memory?.due ?? at + DAY, at + DAY);
  }
  if (!state.skills.a?.mastered) throw new Error('untilMastered: not mastered');
  return { steps, at };
}

const mastered = untilMastered();
const log = (name, fields) => ({
  kind: 'log',
  name,
  learnerId: 'l1',
  graphs: GRAPHS,
  history: ['l1'],
  ...fields,
});

const logVectors = [
  log('reviews to mastery: promotion, the mastered flag, the unlock of b, and a lapse in status', {
    steps: mastered.steps,
    checkpoints: [1, Math.floor(mastered.steps.length / 2), mastered.steps.length],
    now: [mastered.at, mastered.at + 10_000 * DAY],
    history: ['l1', ''],
  }),
  log('mastery lost to decay at the next entry on the skill, not on another', {
    steps: [
      ...mastered.steps,
      ev('late-c', mastered.at + 10_000 * DAY, pass, { skill: 'c' }),
      ev('late-a', mastered.at + 10_000 * DAY, { kind: 'exposure' }, { stage: 'produce' }),
    ],
    now: [mastered.at, mastered.at + 10_000 * DAY],
  }),
  log('held evidence: confirmed, discarded, left held; failures and a lapse', {
    steps: [
      ev('e1', T0),
      ev('h1', T0 + DAY, lowAi),
      confirm('c1', T0 + 2 * DAY, 'h1', 'i-a-recall'),
      ev('h2', T0 + 3 * DAY, lowAi),
      act('x2', T0 + 4 * DAY, { kind: 'discard-held', evidenceId: 'h2' }),
      ev('h3', T0 + 5 * DAY, { kind: 'pending', reason: 'routed-to-person' }),
      ev('f1', T0 + 6 * DAY, fail),
      ev('f2', T0 + 7 * DAY, fail, { extra: { learnerConfidence: 'sure' } }),
    ],
    now: [T0 + 8 * DAY],
  }),
  log('late evidence asks for a replay, which confirms by look-ahead', {
    steps: [
      ev('h1', T0, lowAi),
      ev('e2', T0 + 2 * DAY),
      confirm('c1', T0 + 3 * DAY, 'h1', 'i-a-recall', false),
      ev('e1', T0 + DAY, pass, { skill: 'c' }),
      ev('e0', T0 + 4 * DAY),
    ],
    checkpoints: [0, 1, 2, 3, 4],
    now: [T0 + 5 * DAY],
  }),
  log('duplicates, rejections and mismatches', {
    alternate: { desiredRetention: 0.85 },
    steps: [
      ev('e1', T0),
      ev('e1', T0),
      { evidence: { id: 'e2', itemId: 'nowhere', at: T0 + DAY, source: pass } },
      ev('e3', T0 + DAY, pass, { skill: 'z' }),
      ev('h4', T0 + DAY, lowAi),
      {
        evidence: {
          id: 'c4',
          itemId: 'i-a-recall',
          at: T0 + DAY,
          source: { kind: 'exposure' },
          confirms: 'h4',
        },
      },
      { ...ev('e5', T0 + DAY), item: item('i-a-recall', 'a', 'recall', { status: 'unproven' }) },
      ev('e6', T0 + DAY, pass, { graph: 'next' }),
      ev('e7', T0 + DAY, pass, { with: 'alternate' }),
      { evidence: { id: '', itemId: 'i', at: T0 + DAY, source: pass }, item: item('i') },
      confirm('c1', T0 + DAY, 'missing', 'i-a-recall'),
      act('x1', T0 + DAY, { kind: 'suspend', skillId: 'z' }),
      act('x2', T0 + DAY, { kind: 'place', skillId: 'a', stage: 'apply', credited: false }),
      act('x3', T0 + DAY, { kind: 'discard-held', evidenceId: 'e1' }),
      act('x4', T0 + DAY, { kind: 'suspend', skillId: 'a' }, { graph: 'next' }),
      act('x5', T0 + DAY, { kind: 'suspend', skillId: 'a' }),
      act('x5', T0 + DAY, { kind: 'suspend', skillId: 'a' }),
    ],
  }),
  log('host actions: prior, place, suspend, unsuspend, reset-skill', {
    steps: [
      act('p1', T0, { kind: 'prior', skillId: 'c', theta: 0.5, pseudoCount: 2 }),
      act('p2', T0, { kind: 'prior', skillId: 'c', theta: -0.5, pseudoCount: 1, stage: 'apply' }),
      act('p3', T0, { kind: 'place', skillId: 'a', stage: 'produce', credited: true }),
      ev('e1', T0 + DAY, pass, { skill: 'b' }),
      act('s1', T0 + 2 * DAY, { kind: 'suspend', skillId: 'b' }),
      ev('e2', T0 + 3 * DAY, pass, { skill: 'b' }),
      act('s2', T0 + 4 * DAY, { kind: 'unsuspend', skillId: 'b' }),
      act('s3', T0 + 4 * DAY, { kind: 'unsuspend', skillId: 'c' }),
      act('r1', T0 + 5 * DAY, { kind: 'reset-skill', skillId: 'b' }),
      act('r2', T0 + 5 * DAY, { kind: 'reset-skill', skillId: 'a' }),
    ],
    now: [T0 + 6 * DAY],
    reconcile: ['main', 'grown'],
  }),
  log(
    'the Appendix B placement flow: a prior per objective at its placed stage, credit where policy grants it, then practice',
    {
      steps: [
        act('prior:pl1:a', T0, {
          kind: 'prior',
          skillId: 'a',
          stage: 'produce',
          theta: 1.2,
          pseudoCount: 10,
        }),
        act('place:pl1:a', T0, { kind: 'place', skillId: 'a', stage: 'produce', credited: false }),
        act('prior:pl1:c', T0, { kind: 'prior', skillId: 'c', theta: -0.4, pseudoCount: 10 }),
        act('place:pl1:b', T0, { kind: 'place', skillId: 'b', stage: 'produce', credited: true }),
        ev('e1', T0 + DAY, pass, { stage: 'produce' }),
        ev('e2', T0 + DAY + 60_000, pass, { skill: 'c', stage: 'recognise' }),
      ],
      now: [T0 + 2 * DAY],
    },
  ),
  log('a leech suspends the skill at the threshold', {
    config: { leechThreshold: 2 },
    steps: [
      ev('e1', T0),
      ev('e2', T0 + DAY),
      ev('f1', T0 + 3 * DAY, fail),
      ev('e3', T0 + 4 * DAY),
      ev('f2', T0 + 8 * DAY, fail),
      ev('e4', T0 + 9 * DAY),
    ],
    now: [T0 + 10 * DAY],
  }),
  log(
    "mastery checks: a pass short of the standard, a failed check, then lapses at the learner's level",
    {
      steps: [
        ev('k1', T0),
        ev('k2', T0 + DAY),
        ev('k3', T0 + 2 * DAY, pass, { stage: 'produce' }),
        ev('k4', T0 + 5 * DAY, pass, { stage: 'produce' }),
        ev('k5', T0 + 6 * DAY, fail, { stage: 'produce' }),
        {
          evidence: { id: 'k6', itemId: 'i-easy', at: T0 + 6 * DAY + 60_000, source: fail },
          item: item('i-easy', 'a', 'produce', { difficulty: -5 }),
        },
        ev('k7', T0 + 6 * DAY + 120_000, fail, { stage: 'produce' }),
      ],
      now: [T0 + 7 * DAY],
    },
  ),
  log(
    'one sitting is one review: a success before due within the gap leaves the memory, a failure always reviews, a due memory reviews (M11)',
    {
      steps: [
        ev('w1', T0),
        ev('w2', T0 + 10 * 60_000),
        ev('w3', T0 + 20 * 60_000, fail),
        ev('w4', T0 + 25 * 60_000),
        ev('w5', T0 + 31 * 60_000),
        ev('w6', T0 + 3 * 3_600_000),
      ],
      now: [T0 + DAY],
    },
  ),
  log(
    'a leech on a lapse only, again every half threshold, and only at twice the planned failure rate (M11)',
    {
      config: { leechThreshold: 2, stagePolicyOptions: { promoteAfter: 99 } },
      steps: [
        ev('a1', T0),
        ev('a2', T0 + DAY, fail),
        ev('a3', T0 + 2 * DAY, fail),
        act('a4', T0 + 3 * DAY, { kind: 'unsuspend', skillId: 'a' }),
        ev('a5', T0 + 4 * DAY),
        ev('a6', T0 + 5 * DAY, fail),
        ...[0, 1, 2, 3, 4, 5].map((n) =>
          ev(`c${n}`, T0 + (n + 6) * DAY, pass, { skill: 'c', stage: 'recognise' }),
        ),
        ev('c6', T0 + 12 * DAY, fail, { skill: 'c', stage: 'recognise' }),
        ev('c7', T0 + 13 * DAY, fail, { skill: 'c', stage: 'recognise' }),
      ],
      now: [T0 + 14 * DAY],
    },
  ),
  log('evidence contexts, exposure and self ratings', {
    config: { contexts: { pretestWeight: 0, diagnosticWeight: 0.5, examsMoveSchedule: true } },
    steps: [
      ev('x1', T0, { kind: 'exposure' }, { skill: 'c', stage: 'recognise' }),
      ev('t1', T0 + DAY, pass, { skill: 'c', stage: 'recognise', extra: { context: 'pretest' } }),
      ev('d1', T0 + DAY, fail, {
        skill: 'c',
        stage: 'recognise',
        extra: { context: 'diagnostic' },
      }),
      ev('s1', T0 + 2 * DAY, { kind: 'self', rating: 'easy' }, { skill: 'c', stage: 'recognise' }),
      ev('q1', T0 + 3 * DAY, pass, { skill: 'c', stage: 'recognise', extra: { context: 'exam' } }),
      ev('q2', T0 + 4 * DAY, fail, { skill: 'c', stage: 'recall', extra: { context: 'exam' } }),
    ],
    now: [T0 + 5 * DAY],
  }),
  log('the same log recomputed under another configuration', {
    steps: mastered.steps.slice(0, 6),
    recompute: { desiredRetention: 0.8, stagePolicyOptions: { promoteAfter: 3 } },
  }),
  log('an invalid configuration throws', { config: { leechThreshold: -1 }, steps: [] }),
  log('graph order of mastery and unlock events; soft and encompasses edges lock nothing', {
    graphs: { main: FAN },
    config: {
      mastery: { topSuccesses: 1, minExpectedSuccess: 0.5, topGapMs: 0, uncertaintyMargin: 0 },
    },
    steps: [
      act('p1', T0, { kind: 'place', skillId: 'p', stage: 'recall', credited: true }),
      pair('e1', T0 + DAY, pass),
      pair('e2', T0 + 4 * DAY, pass),
      act('u1', T0 + 5 * DAY, { kind: 'unsuspend', skillId: 'u' }),
      act('u2', T0 + 5 * DAY, { kind: 'unsuspend', skillId: 'q' }),
      act('v1', T0 + 5 * DAY, { kind: 'suspend', skillId: 's' }),
      act('v2', T0 + 5 * DAY, { kind: 'unsuspend', skillId: 's' }),
      act('u3', T0 + 5 * DAY, { kind: 'place', skillId: 't', stage: 'recall', credited: false }),
      act('u4', T0 + 5 * DAY, { kind: 'place', skillId: 'q', stage: 'recall', credited: false }),
      act('u5', T0 + 5 * DAY, { kind: 'place', skillId: 'u', stage: 'recall', credited: true }),
      pair('h1', T0 + 6 * DAY, lowAi),
      {
        evidence: {
          id: 'c1',
          itemId: 'i-qr',
          at: T0 + 7 * DAY,
          source: human(true),
          confirms: 'h1',
          skillOutcomes: [
            { skillId: 'r', score: 1, maxScore: 1 },
            { skillId: 'q', score: 0, maxScore: 1 },
          ],
        },
      },
    ],
    now: [T0 + 7 * DAY, T0 + 8 * DAY],
  }),
  log(
    'the review history lists skills in graph order and stages in ladder order, whatever order they were first reviewed in',
    {
      steps: [
        ev('h1', T0, pass, { skill: 'c', stage: 'recognise' }),
        // `a` meets `produce` before `recall`; its stages still come in ladder order.
        act('p1', T0 + DAY, { kind: 'place', skillId: 'a', stage: 'produce', credited: false }),
        ev('h2', T0 + 2 * DAY, pass, { stage: 'produce' }),
        act('p2', T0 + 3 * DAY, { kind: 'place', skillId: 'a', stage: 'recall', credited: false }),
        ev('h3', T0 + 4 * DAY, pass),
        ev('h4', T0 + 5 * DAY, pass, { skill: 'b' }),
        ev('h5', T0 + 6 * DAY, fail, { skill: 'c', stage: 'recognise' }),
      ],
    },
  ),
  log('item usage is pruned at the retention and recent ids keep the window', {
    config: { itemUsageRetentionMs: 2 * DAY, recentIdWindow: 2 },
    checkpoints: [1],
    steps: [
      ev('e1', T0, pass, { itemId: 'i1' }),
      ev('e2', T0 + DAY, pass, { itemId: 'i2' }),
      ev('e3', T0 + 2 * DAY, pass, { itemId: 'i3' }),
      ev('e4', T0 + 3 * DAY, pass, { itemId: 'i2' }),
      ev('e5', T0 + 3 * DAY, pass, { itemId: 'i4' }),
      ev('e6', T0 + 3 * DAY, pass, { itemId: 'i4' }),
    ],
    now: [T0 + 3 * DAY],
  }),
  log('item usage after a long gap keeps the items used within the retention, inclusive', {
    config: { itemUsageRetentionMs: 2 * DAY },
    checkpoints: [1],
    steps: [
      ev('e1', T0, pass, { itemId: 'i1' }),
      ev('e2', T0 + DAY, pass, { itemId: 'i2' }),
      ev('e5', T0 + 4 * DAY, pass, { itemId: 'i3' }),
      ev('e3', T0 + 6 * DAY, pass, { itemId: 'i4' }),
      ev('e4', T0 + 6 * DAY, pass, { itemId: 'i5' }),
    ],
    now: [T0 + 6 * DAY],
  }),
  log('rejections of record and act, and late entries that ask for a replay', {
    steps: [
      ev('h1', T0, lowAi),
      ev('e1', T0, pass, { skill: 'c' }),
      confirm('c1', T0 + DAY, 'h1', 'i-a-recall'),
      ev('e2', T0 + 2 * DAY),
      { ...ev('e3', T0 + 2 * DAY), item: item('other') },
      ev('e4', T0 + 2 * DAY, pass, {
        extra: { skillOutcomes: [{ skillId: 'b', score: 1, maxScore: 1 }] },
      }),
      ev('h2', T0 + 2 * DAY, lowAi),
      {
        evidence: {
          id: 'c2',
          itemId: 'i-a-recall',
          at: T0 + 2 * DAY,
          source: { kind: 'pending', reason: 'routed-to-person' },
          confirms: 'h2',
        },
      },
      act('x1', T0 + 2 * DAY, {
        kind: 'prior',
        skillId: 'a',
        theta: 1,
        pseudoCount: 1,
        stage: 'write',
      }),
      act('', T0 + 2 * DAY, { kind: 'suspend', skillId: 'a' }),
      act('x3', T0 + DAY, { kind: 'suspend', skillId: 'c' }),
    ],
    now: [T0 + DAY],
  }),
  log('status on a ladder that lost the stored stage, and on another graph version', {
    steps: [
      act('p1', T0, { kind: 'place', skillId: 'a', stage: 'produce', credited: false }),
      ev('e1', T0 + DAY, pass, { stage: 'produce' }),
      ev('h1', T0 + DAY, lowAi, { skill: 'c' }),
    ],
    now: [T0 + DAY],
    statusOn: [
      { graph: 'reladder', now: T0 + DAY },
      { graph: 'next', now: T0 + DAY },
    ],
    graphs: { ...GRAPHS, reladder: RELADDER, other: OTHER },
    reconcile: ['reladder', 'other'],
  }),
];

/** A hypothesis for `forSkillId` with its content id (R14.4; revised in M12). */
const hypothesis = (forSkillId, skillId, skill) => ({
  id: impl.hypothesisId({ forSkillId, skillId, skill }),
  forSkillId,
  skillId,
  ...(skill === undefined ? {} : { skill }),
});
const NEW = hypothesis('c', 'n', {
  id: 'n',
  knowledge: 'declarative',
  stages: ['recall', 'produce'],
});
const open = (id, at, opened) => act(id, at, { kind: 'open-hypothesis', hypothesis: opened });
/** A probe answer on `skills` (the candidate alone when valid) at its top stage. */
const probe = (id, at, source, probeId = NEW.id, { skills = ['n'], extra = {} } = {}) => ({
  evidence: {
    id,
    itemId: `${id}-item`,
    at,
    source,
    context: 'diagnostic',
    probe: probeId,
    ...extra,
  },
  item: {
    id: `${id}-item`,
    skills: skills.map((skillId) => ({ skillId, weight: 1 / skills.length })),
    stage: 'produce',
    origin: 'generated',
    status: 'proven',
  },
});

logVectors.push(
  log('hypotheses: every open, probe and close rule; probe answers change only their hypothesis', {
    steps: [
      ev('c1', T0, fail, { skill: 'c', stage: 'recognise' }),
      ev('c2', T0 + DAY, fail, { skill: 'c', stage: 'recognise' }),
      open('o1', T0 + DAY + 1, NEW),
      open('o2', T0 + DAY + 2, NEW),
      open('o3', T0 + DAY + 2, { ...NEW, id: 'not-its-content-id' }),
      open('o4', T0 + DAY + 2, hypothesis('c', 'c')),
      open('o5', T0 + DAY + 2, hypothesis('zz', 'a')),
      open('o6', T0 + DAY + 2, hypothesis('c', 'zz')),
      open('o7', T0 + DAY + 2, hypothesis('c', 'a', { id: 'a', knowledge: 'declarative' })),
      open('o8', T0 + DAY + 2, hypothesis('c', 'n2', { id: 'n3', knowledge: 'declarative' })),
      open('o9', T0 + DAY + 2, hypothesis('a', 'b')),
      open('o10', T0 + DAY + 2, hypothesis('b', 'a')),
      probe('q1', T0 + 2 * DAY, pass),
      probe('q2', T0 + 2 * DAY + 1, pass, NEW.id, { skills: ['n', 'c'] }),
      probe('q3', T0 + 2 * DAY + 2, pass, 'no-such-hypothesis'),
      probe('q4', T0 + 2 * DAY + 3, pass, NEW.id, {
        extra: { skillOutcomes: [{ skillId: 'n', score: 1, maxScore: 1 }] },
      }),
      probe('q5', T0 + 2 * DAY + 4, { kind: 'exposure' }),
      probe('q6', T0 + 3 * DAY, fail),
      probe('q7', T0 + 4 * DAY, fail),
      probe('q8', T0 + 5 * DAY, pass),
      act('x1', T0 + 6 * DAY, { kind: 'close-hypothesis', hypothesisId: NEW.id }),
      probe('q9', T0 + 6 * DAY + 1, pass),
      act('x2', T0 + 6 * DAY + 2, { kind: 'close-hypothesis', hypothesisId: NEW.id }),
      act('x3', T0 + 6 * DAY + 3, { kind: 'close-hypothesis', hypothesisId: 'no-such-hypothesis' }),
    ],
    checkpoints: [3, 6],
    now: [T0 + 7 * DAY],
  }),
);

const stored = (steps) => {
  const practice = impl.createPractice({});
  let state = practice.initState('l1', MAIN);
  for (const step of steps) {
    const result = practice.record(state, { graph: MAIN, ...step });
    if (result.kind !== 'applied') throw new Error(`stored: ${result.kind}`);
    state = result.state;
  }
  return JSON.parse(JSON.stringify(state));
};
const sample = stored([ev('e1', T0), ev('h1', T0 + DAY, lowAi)]);
/** One invalid field per row, at the boundaries the shape checks draw. */
function shapeRows(state) {
  const held = state.held[0];
  const withHeld = (change) => ({ ...state, held: [{ ...held, ...change }] });
  const withEvidence = (change) => withHeld({ evidence: { ...held.evidence, ...change } });
  const withTask = (change) => withHeld({ task: { ...held.task, ...change } });
  const withSkill = (change) => ({ ...state, skills: { a: { ...state.skills.a, ...change } } });
  const graded = held.evidence.source;
  return [
    withEvidence({ id: 'other' }),
    withEvidence({ itemId: 'other' }),
    withEvidence({ at: held.at + 1 }),
    withTask({ itemId: 'other' }),
    withTask({ skills: [] }),
    withTask({ skills: 'a' }),
    withTask({ fluentSeconds: 0 }),
    withTask({ fluentSeconds: 1 }),
    withEvidence({ durationMs: -1 }),
    withEvidence({ durationMs: 0 }),
    withEvidence({ source: { ...graded, kind: 7 } }),
    withEvidence({
      source: {
        kind: 'auto',
        score: 1,
        maxScore: 1,
        passed: true,
        checks: { passed: 2, total: 1 },
      },
    }),
    withEvidence({
      source: {
        kind: 'auto',
        score: 1,
        maxScore: 1,
        passed: true,
        checks: { passed: 1, total: 1 },
      },
    }),
    withSkill({ suspended: 'leech' }),
    withSkill({ suspended: 'host' }),
    withSkill({ suspended: 'other' }),
  ];
}

const migrateVectors = [
  {
    kind: 'migrate',
    name: 'stored states read back, and each rejected input',
    rows: [
      sample,
      stored([]),
      { ...sample, schemaVersion: 2 },
      { ...sample, log: { ...sample.log, lastAt: null } },
      { ...sample, extra: 1 },
      { ...sample, held: [{ ...sample.held[0], seq: -1 }] },
      ...shapeRows(sample),
      null,
      [],
      'state',
    ],
  },
];

/** The entries a run of `steps` appends (replaying after a late one, as a host does), and the state at each cut, as stored JSON. */
function recorded(steps) {
  const practice = impl.createPractice({});
  let state = practice.initState('l1', MAIN);
  const entries = [];
  for (const step of steps) {
    const result =
      step.act !== undefined
        ? practice.act(state, MAIN, step.act)
        : practice.record(state, { graph: MAIN, ...step });
    if (result.kind !== 'applied' && result.kind !== 'replay-required') {
      throw new Error(`recorded: ${result.kind}`);
    }
    entries.push(...result.appended);
    const replayed = result.kind === 'applied' ? result : practice.replay(entries, MAIN, 'l1');
    state = replayed.state;
  }
  const json = JSON.parse(JSON.stringify(entries));
  const at = (cut) => {
    const result = practice.replay(json.slice(0, cut), MAIN, 'l1');
    if (!result.ok) throw new Error('recorded: replay failed');
    return JSON.parse(JSON.stringify(result.state));
  };
  return { entries: json, at };
}
const edit = (entries, index, change) =>
  entries.map((entry, i) => (i === index ? change(structuredClone(entry)) : entry));

const base = recorded([
  ev('e1', T0),
  ev('h1', T0 + DAY, lowAi),
  ev('e2', T0 + DAY, pass, { skill: 'c' }),
  confirm('c1', T0 + 2 * DAY, 'h1', 'i-a-recall'),
  act('x1', T0 + 3 * DAY, { kind: 'place', skillId: 'a', stage: 'produce', credited: false }),
  ev('e3', T0 + 4 * DAY, pass, { stage: 'produce' }),
]);
const discarded = recorded([
  ev('h1', T0, lowAi),
  ev('h2', T0 + DAY, lowAi),
  act('x1', T0 + 2 * DAY, { kind: 'discard-held', evidenceId: 'h2' }),
  act('x2', T0 + 2 * DAY, { kind: 'suspend', skillId: 'c' }),
  confirm('c1', T0 + 3 * DAY, 'h1', 'i-a-recall'),
]);
const unordered = recorded([
  ev('e1', T0 + 2 * DAY),
  ev('h1', T0 + DAY, lowAi),
  confirm('c1', T0 + 3 * DAY, 'h1', 'i-a-recall'),
]);
const moved = (entry, at) => ({ ...entry, at, evidence: { ...entry.evidence, at } });
const replayCase = (name, fields) => ({
  kind: 'replay',
  name,
  learnerId: 'l1',
  graph: MAIN,
  ...fields,
});
/** `c` fails twice and a hypothesis for it is opened (revised in M12). */
const diagnosed = [
  ev('c1', T0, fail, { skill: 'c', stage: 'recognise' }),
  ev('c2', T0 + DAY, fail, { skill: 'c', stage: 'recognise' }),
];
const closeNew = (id, at) => act(id, at, { kind: 'close-hypothesis', hypothesisId: NEW.id });
/** A probe and a close appended after the open but timed before it: replay applies them first. */
const lateToOpen = recorded([
  ...diagnosed,
  open('o1', T0 + DAY + 10, NEW),
  probe('q1', T0 + DAY + 5, fail),
  closeNew('x1', T0 + DAY + 6),
]);
/** A hypothesis probed once and closed; a second close and a probe are appended by hand. */
const closedLog = recorded([
  ...diagnosed,
  open('o1', T0 + DAY + 1, NEW),
  probe('q1', T0 + 2 * DAY, fail),
  closeNew('x1', T0 + 3 * DAY),
]);
const afterClose = (() => {
  const { entries } = closedLog;
  const close = entries.at(-1);
  const answer = entries.at(-2);
  return [
    ...entries,
    { ...structuredClone(close), seq: entries.length, at: T0 + 4 * DAY, id: 'x2' },
    {
      ...moved(structuredClone(answer), T0 + 5 * DAY),
      seq: entries.length + 1,
      evidence: { ...answer.evidence, id: 'q2', at: T0 + 5 * DAY },
    },
  ];
})();

const replayVectors = [
  replayCase('a probe and a close timed before their hypothesis was opened change nothing', {
    entries: lateToOpen.entries,
  }),
  replayCase('a second close and a probe after the close change nothing (revised in M12)', {
    entries: afterClose,
  }),
  replayCase('a stored log replays to the recorded state', { entries: base.entries }),
  replayCase('entries stored out of seq order replay in seq and time order', {
    entries: [...base.entries].reverse(),
  }),
  replayCase('entries that are not an array', { entries: 'entries' }),
  replayCase('an entry with an invalid shape', {
    entries: edit(base.entries, 0, (entry) => ({ ...entry, seq: -1 })),
  }),
  replayCase('two entries with one id, evidence and host', {
    entries: edit(
      edit(base.entries, 2, (entry) => ({ ...entry, evidence: { ...entry.evidence, id: 'e1' } })),
      4,
      (entry) => ({ ...entry, id: 'h1' }),
    ),
  }),
  replayCase('a gap in seq', { entries: base.entries.filter((_, i) => i !== 1) }),
  replayCase('an invalid graph', {
    entries: base.entries,
    graph: {
      ...MAIN,
      edges: [...MAIN.edges, { kind: 'prerequisite', from: 'b', to: 'a', strength: 'hard' }],
    },
  }),
  replayCase('task snapshots and host actions the graph no longer allows', {
    entries: base.entries,
    graph: RELADDER,
  }),
  replayCase('skill outcomes outside the task', {
    entries: edit(base.entries, 0, (entry) => ({
      ...entry,
      evidence: { ...entry.evidence, skillOutcomes: [{ skillId: 'b', score: 1, maxScore: 1 }] },
    })),
  }),
  replayCase('a confirmation of evidence that is not in the log', {
    entries: edit(
      edit(base.entries, 3, (entry) => ({
        ...entry,
        evidence: { ...entry.evidence, confirms: 'nowhere' },
      })),
      1,
      (entry) => ({ ...entry, evidence: { ...entry.evidence, id: 'h0' } }),
    ),
  }),
  replayCase('a confirmation graded by exposure', {
    entries: edit(base.entries, 3, (entry) => ({
      ...entry,
      evidence: { ...entry.evidence, source: { kind: 'exposure' } },
    })),
  }),
  replayCase('a discard between held evidence and its confirmation', {
    entries: edit(discarded.entries, 4, (entry) => ({
      ...entry,
      evidence: { ...entry.evidence, confirms: 'h2' },
    })),
  }),
  replayCase('entries in seq order but not in time order', { entries: unordered.entries }),
  replayCase('from a checkpoint whose last entry is the held evidence', {
    checkpoint: base.at(2),
    entries: base.entries.slice(2),
  }),
  replayCase('from a checkpoint that applied entries after the held evidence', {
    checkpoint: base.at(3),
    entries: base.entries.slice(3),
  }),
  replayCase('from a checkpoint whose held evidence is last in seq but not in time', {
    checkpoint: unordered.at(2),
    entries: unordered.entries.slice(2),
  }),
  replayCase('from a checkpoint, an entry at its last instant', {
    checkpoint: base.at(4),
    entries: edit(base.entries.slice(4), 1, (entry) => moved(entry, T0 + 2 * DAY)),
  }),
  replayCase('from a checkpoint, an entry earlier than its last instant', {
    checkpoint: base.at(4),
    entries: edit(base.entries.slice(4), 1, (entry) => moved(entry, T0 + DAY)),
  }),
  replayCase('from a checkpoint of another configuration', {
    config: { desiredRetention: 0.85 },
    checkpoint: base.at(4),
    entries: base.entries.slice(4),
  }),
];

const vectors = [...logVectors, ...replayVectors, ...migrateVectors];
const body = {
  $comment:
    'Log vectors for @intellectif/lk-practice (criterion 4), generated by scripts/log-vectors.mjs and run by vectors/replay.mjs. `log` runs `steps` through createPractice(config), records each outcome (issues as code and path), replays the whole log after a replay-required step as a host does, and records the log, the final state, its replay, replayFrom at each checkpoint cut, the replay under `recompute`, status at each `now`, and reconcile against each named graph; `migrate` reads each row with migrateState. Floats compare at a relative 1e-9; integers, strings, null and every time and due exactly.',
  version: CORPUS_VERSION,
  vectors: record(impl, vectors),
};
writeFileSync(join(PACKAGE, 'vectors', 'log.json'), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
console.log(
  `log vectors: ${logVectors.length} log, ${replayVectors.length} replay, ${migrateVectors.length} migrate`,
);
