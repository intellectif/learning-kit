// Writes vectors/log.json (criterion 4, design 6, 8.1, 8.7; revised in M5).
// The cases are chosen by hand: reviews to mastery and an unlock, the decay
// that loses mastery, held evidence confirmed, discarded and confirmed by
// look-ahead, late evidence and replay, checkpoints, duplicates, every record
// and act rejection, each host action, a leech, the evidence contexts, a
// recompute under another configuration, and stored states into
// migrateState. The expected values are recorded from src/ through
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
  ...fields,
});

const logVectors = [
  log('reviews to mastery: promotion, the mastered flag, the unlock of b, and a lapse in status', {
    steps: mastered.steps,
    checkpoints: [1, Math.floor(mastered.steps.length / 2), mastered.steps.length],
    now: [mastered.at, mastered.at + 10_000 * DAY],
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
];

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
      null,
      [],
      'state',
    ],
  },
];

const vectors = [...logVectors, ...migrateVectors];
const body = {
  $comment:
    'Log vectors for @intellectif/lk-practice (criterion 4), generated by scripts/log-vectors.mjs and run by vectors/replay.mjs. `log` runs `steps` through createPractice(config), records each outcome (issues as code and path), replays the whole log after a replay-required step as a host does, and records the log, the final state, its replay, replayFrom at each checkpoint cut, the replay under `recompute`, status at each `now`, and reconcile against each named graph; `migrate` reads each row with migrateState. Floats compare at a relative 1e-9; integers, strings, null and every time and due exactly.',
  version: CORPUS_VERSION,
  vectors: record(impl, vectors),
};
writeFileSync(join(PACKAGE, 'vectors', 'log.json'), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
console.log(`log vectors: ${logVectors.length} log, ${migrateVectors.length} migrate`);
