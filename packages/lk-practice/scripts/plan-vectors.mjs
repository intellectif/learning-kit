// Writes vectors/plan.json (criteria 6 to 9, design 8.6; revised in M6). The
// cases are chosen by hand: the tiers and their order, the caps, the backlog
// rule, a stage-up after a promotion, remediation, the focus closure, pretests,
// coalescing, pool matching (proof, cooldown, exclusion, preference), the
// seconds budget, difficulty targeting from a prior, mastery checks (revised
// in M9), and the request and state checks; then the boundaries and orders that tell close rules apart:
// interleave groups, soft prerequisites, the backlog, due and lapse-window
// edges, tier keys, the remediation floor, empty and one-stage ladders, and
// the tolerance, cooldown and tie rules of matching. Each vector builds a learner from `steps` as the log vectors
// do, then plans each request. The expected values are recorded from src/
// through vectors/replay.mjs, so the file pins the current behaviour; the unit
// tests check the same rules by hand. Run with `pnpm vectors:plan`, then
// review the diff: a changed plan is a behaviour change and needs a version
// (D26).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORPUS_VERSION, record } from '../vectors/replay.mjs';
import { loadSrc, PACKAGE } from './load-src.mjs';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);

const impl = await loadSrc('plan-vectors');

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

/** Single-stage `a` to `f`: `c` needs `a` and `b` (hard), `b` needs `a`; `e` softly needs `d` and `f`. */
const FAN = {
  version: 'f1',
  skills: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({
    id,
    knowledge: 'declarative',
    stages: ['recall', 'produce'],
  })),
  edges: [
    { kind: 'prerequisite', from: 'a', to: 'c', strength: 'hard' },
    { kind: 'prerequisite', from: 'b', to: 'c', strength: 'hard' },
    { kind: 'prerequisite', from: 'a', to: 'b', strength: 'hard' },
    { kind: 'prerequisite', from: 'd', to: 'e', strength: 'soft' },
    { kind: 'prerequisite', from: 'f', to: 'e', strength: 'soft' },
    { kind: 'prerequisite', from: 'd', to: 'f', strength: 'soft' },
  ],
};

/** `k` encompasses `w` and `x`; both encompass `v`. */
const KIT = {
  version: 'k1',
  skills: [
    { id: 'k', knowledge: 'procedural', stages: ['complete', 'write'] },
    { id: 'w', knowledge: 'declarative', stages: ['recall', 'produce'] },
    { id: 'x', knowledge: 'declarative', stages: ['recall', 'produce'] },
    { id: 'v', knowledge: 'declarative', stages: ['recall', 'produce'] },
  ],
  edges: [
    { kind: 'prerequisite', from: 'w', to: 'k', strength: 'hard' },
    { kind: 'prerequisite', from: 'x', to: 'k', strength: 'hard' },
    { kind: 'prerequisite', from: 'v', to: 'w', strength: 'hard' },
    { kind: 'prerequisite', from: 'v', to: 'x', strength: 'hard' },
    { kind: 'encompasses', from: 'k', to: 'w', weight: 0.5 },
    { kind: 'encompasses', from: 'k', to: 'x', weight: 0.5 },
    { kind: 'encompasses', from: 'w', to: 'v', weight: 1 },
    { kind: 'encompasses', from: 'x', to: 'v', weight: 1 },
  ],
};

/** `p` (kept at 0.99) is a hard prerequisite of `q`. */
const REMEDY = {
  version: 'r1',
  skills: [
    { id: 'p', knowledge: 'declarative', stages: ['recall'], desiredRetention: 0.99 },
    { id: 'q', knowledge: 'declarative', stages: ['recall'] },
  ],
  edges: [{ kind: 'prerequisite', from: 'p', to: 'q', strength: 'hard' }],
};

/** `a` with forms at recall; `b` free. */
const FORMS = {
  version: 's1',
  skills: [
    {
      id: 'a',
      knowledge: 'declarative',
      stages: ['recall', 'drill'],
      forms: { recall: ['cloze', 'short'] },
    },
    { id: 'b', knowledge: 'declarative', stages: ['recall'] },
  ],
  edges: [],
};

/** Two interleave groups: declarative `g1` to `g3` and procedural `p1` and `p2`; `h1` and `p3` have none. */
const ORDER = {
  version: 'o1',
  skills: [
    ...['g1', 'g2', 'g3'].map((id) => ({
      id,
      knowledge: 'declarative',
      stages: ['recall', 'produce'],
      interleaveGroup: 'gA',
    })),
    { id: 'h1', knowledge: 'declarative', stages: ['recall', 'produce'] },
    ...['p1', 'p2'].map((id) => ({
      id,
      knowledge: 'procedural',
      stages: ['complete', 'write'],
      interleaveGroup: 'gB',
    })),
    { id: 'p3', knowledge: 'procedural', stages: ['complete', 'write'] },
  ],
  edges: [],
};

/** `p`, `r` and `s` (kept at 0.99) are hard prerequisites: `p` and `s` of `q1`, `p` and `r` of `q2`. */
const LAPSES = {
  version: 'r2',
  skills: [
    ...['p', 'r', 's'].map((id) => ({
      id,
      knowledge: 'declarative',
      stages: ['recall'],
      desiredRetention: 0.99,
    })),
    { id: 'q1', knowledge: 'declarative', stages: ['recall'] },
    { id: 'q2', knowledge: 'declarative', stages: ['recall'] },
  ],
  edges: [
    { kind: 'prerequisite', from: 'p', to: 'q1', strength: 'hard' },
    { kind: 'prerequisite', from: 's', to: 'q1', strength: 'hard' },
    { kind: 'prerequisite', from: 'p', to: 'q2', strength: 'hard' },
    { kind: 'prerequisite', from: 'r', to: 'q2', strength: 'hard' },
  ],
};

/** One-stage `x` and `y`, so reviews never promote. */
const ONE = {
  version: 'n1',
  skills: [
    { id: 'x', knowledge: 'declarative', stages: ['recall'] },
    { id: 'y', knowledge: 'declarative', stages: ['recall'] },
  ],
  edges: [],
};

/** MAIN with `z`, whose ladder is empty (an unvalidated graph). */
const EMPTY = {
  ...MAIN,
  version: 'z1',
  skills: [...MAIN.skills, { id: 'z', knowledge: 'declarative', stages: [] }],
};

const pass = { kind: 'auto', score: 1, maxScore: 1, passed: true };
const fail = { kind: 'auto', score: 0, maxScore: 1, passed: false };

const item = (id, skillId = 'a', stage = 'recall', extra = {}) => ({
  id,
  skills: [{ skillId, weight: 1 }],
  stage,
  origin: 'generated',
  status: 'proven',
  ...extra,
});
/** A step recording `source` on `skillId` at `stage`, through an item named after the step. */
const ev = (id, skillId, stage, at, source = pass) => ({
  evidence: { id, itemId: `${id}-item`, at, source },
  item: item(`${id}-item`, skillId, stage),
});
const act = (id, at, action) => ({ act: { id, at, action } });
const place = (id, skillId, stage, at = T0, credited = false) =>
  act(id, at, { kind: 'place', skillId, stage, credited });
const ask = (now, extra = {}) => ({ request: { now, seed: 's', budget: {}, ...extra } });

/** The state after `steps`, as a plan vector builds it. */
function stateOf(graph, steps, config = {}) {
  const practice = impl.createPractice(config);
  let state = practice.initState('l1', graph);
  for (const step of steps) {
    const result =
      step.act !== undefined
        ? practice.act(state, graph, step.act)
        : practice.record(state, { graph, evidence: step.evidence, item: step.item });
    if (result.kind !== 'applied') throw new Error(`stateOf: ${result.kind}`);
    state = result.state;
  }
  return { practice, state };
}

/**
 * The targetDifficulty of the first target for `skillId` in the plan of
 * `request` after `steps`, so pool items can sit at or near it.
 */
function difficultyOf(graph, steps, request, skillId, config = {}) {
  const { practice, state } = stateOf(graph, steps, config);
  const target = practice
    .plan(state, graph, request.request)
    .targets.find((entry) => entry.skillIds[0] === skillId);
  if (target === undefined) throw new Error(`difficultyOf: no target for ${skillId}`);
  return target.targetDifficulty;
}

/** The due time of `skillId` at `stage` after `steps`. */
const dueOf = (graph, steps, skillId, stage) =>
  stateOf(graph, steps).state.skills[skillId].memories[stage].due;

const plan = (name, graph, steps, requests, fields = {}) => ({
  kind: 'plan',
  name,
  learnerId: 'l1',
  graphs: { main: graph, ...(fields.graphs ?? {}) },
  steps,
  requests,
  ...(fields.config === undefined ? {} : { config: fields.config }),
});

/** `a` reviewed early, `b` and `c` later, so `a` is overdue first and the others due by a later dueBy. */
const reviewed = [
  ev('e1', 'a', 'recall', T0),
  ev('e2', 'c', 'recognise', T0 + 2 * DAY),
  ev('e3', 'b', 'recall', T0 + 2 * DAY),
];
/** `a` promoted to produce by passes at each due time. */
const promoted = [
  ev('e1', 'a', 'recall', T0),
  ev('e2', 'a', 'recall', T0 + DAY),
  ev('e3', 'a', 'recall', T0 + 4 * DAY),
  ev('e4', 'a', 'recall', T0 + 12 * DAY),
];
const used = [
  {
    evidence: { id: 'e1', itemId: 'used', at: T0, source: pass },
    item: item('used', 'c', 'recognise'),
  },
];
const cAt = difficultyOf(MAIN, used, ask(T0 + 2 * DAY), 'c');
const near = (id, extra = {}) => item(id, 'c', 'recognise', { difficulty: cAt, ...extra });
const kitSteps = [
  ev('e1', 'k', 'complete', T0),
  ev('e2', 'w', 'recall', T0 + 3 * DAY),
  ev('e3', 'x', 'recall', T0 + 3 * DAY),
  ev('e4', 'v', 'recall', T0 + 3 * DAY),
];
const kNow = T0 + 3.5 * DAY;
const kDue = T0 + 60 * DAY;
const kAt = difficultyOf(KIT, kitSteps, ask(kNow, { dueBy: kDue }), 'k');
const kItem = (id, skillIds, criteria) =>
  item(id, 'k', 'complete', {
    difficulty: kAt,
    skills: skillIds.map((skillId) => ({ skillId, weight: 1 / skillIds.length })),
    ...(criteria ? { criteria: skillIds.map((skillId, i) => ({ name: `c${i}`, skillId })) } : {}),
  });

/** `q1` lapses at L1 and `q2` at L1 + 0.1 day, after their prerequisites' reviews. */
const L1 = T0 + 1.1 * DAY;
const WINDOW = 0.2 * DAY;
const lapses = [
  ev('e1', 'p', 'recall', T0),
  ev('e2', 'r', 'recall', T0),
  ev('e3', 's', 'recall', T0),
  place('h1', 'q1', 'recall'),
  place('h2', 'q2', 'recall'),
  ev('e4', 'q1', 'recall', T0),
  ev('e5', 'q2', 'recall', T0),
  ev('e6', 'p', 'recall', T0 + DAY),
  ev('e7', 'r', 'recall', T0 + DAY),
  ev('e8', 's', 'recall', T0 + DAY),
  ev('e9', 'q1', 'recall', L1, fail),
  ev('e10', 'q2', 'recall', L1 + 0.1 * DAY, fail),
];
const lapseRequests = [
  ask(T0 + 1.25 * DAY),
  ask(T0 + 1.25 * DAY, { limits: { maxRemediation: 1 } }),
  ask(L1 + WINDOW),
  ask(L1 + WINDOW + 1),
];
/** `a` and `b` due times after `reviewed`, for the boundary requests. */
const dueA = dueOf(MAIN, reviewed, 'a', 'recall');
const dueB = dueOf(MAIN, reviewed, 'b', 'recall');
/** `x` (due at T0 + 3 days) and `y`, which lapses at `yAt`: `x` is due first, `y` is nearer full retrievability. */
const xSteps = [ev('e1', 'x', 'recall', T0), ev('e2', 'x', 'recall', T0 + DAY)];
const orderSteps = (yAt) => [...xSteps, ev('e3', 'y', 'recall', yAt, fail)];
/** Matching at the cooldown and tolerance boundaries: `used` was used at T0. */
const COOL = 3 * DAY;
const c3 = difficultyOf(MAIN, used, ask(T0 + COOL), 'c', { itemCooldownMs: COOL });
const boundary = { itemCooldownMs: COOL, planner: { difficultyTolerance: Math.abs(c3) } };
/** Items used at different times and counts (lapses, so `c` stays at recognise); no cooldown. */
const usedSteps = [
  {
    evidence: { id: 'e1', itemId: 'u3', at: T0, source: pass },
    item: item('u3', 'c', 'recognise'),
  },
  {
    evidence: { id: 'e2', itemId: 'u2', at: T0 + 0.5 * DAY, source: fail },
    item: item('u2', 'c', 'recognise'),
  },
  {
    evidence: { id: 'e3', itemId: 'u2', at: T0 + DAY, source: fail },
    item: item('u2', 'c', 'recognise'),
  },
  {
    evidence: { id: 'e4', itemId: 'u1', at: T0 + 2 * DAY, source: fail },
    item: item('u1', 'c', 'recognise'),
  },
];
const uNow = T0 + 5 * DAY;
const uAt = difficultyOf(MAIN, usedSteps, ask(uNow), 'c', { itemCooldownMs: 0 });
const at = (id, extra = {}) => item(id, 'c', 'recognise', { difficulty: uAt, ...extra });
/** One item for both `a` and `b` at recall, at `a`'s difficulty. */
const aAt = difficultyOf(MAIN, reviewed, ask(T0 + 2.5 * DAY, { dueBy: T0 + 30 * DAY }), 'a');
const shared = item('shared', 'a', 'recall', {
  difficulty: aAt,
  skills: [
    { skillId: 'a', weight: 0.5 },
    { skillId: 'b', weight: 0.5 },
  ],
});
/** Mastery from one top-stage success, for the soft-prerequisite vectors. */
const quick = { mastery: { topSuccesses: 1, topGapMs: 0, minExpectedSuccess: 0 } };
const softAsk = [ask(T0 + DAY, { limits: { maxNewSkills: 9 } })];

const vectors = [
  plan(
    'an empty state plans the ready skills as new, capped, with the rest deferred',
    MAIN,
    [],
    [ask(T0), ask(T0, { limits: { maxNewSkills: 0 } }), ask(T0, { limits: { maxNewSkills: 5 } })],
  ),
  plan('overdue, then due by dueBy; the budget defers reviews', MAIN, reviewed, [
    ask(T0 + 2.5 * DAY),
    ask(T0 + 2.5 * DAY, { dueBy: T0 + 30 * DAY }),
    ask(T0 + 2.5 * DAY, { dueBy: T0 + 30 * DAY, budget: { maxTargets: 1 } }),
    ask(T0 + 2.5 * DAY, { dueBy: T0 + 30 * DAY, budget: { maxTargets: 0, maxSeconds: 0 } }),
  ]),
  plan('a review backlog above maxReviewBacklog blocks new skills', MAIN, reviewed.slice(0, 1), [
    ask(T0 + 3 * DAY),
    ask(T0 + 3 * DAY, { limits: { maxReviewBacklog: 0 } }),
  ]),
  plan(
    'a stage-up after a promotion targets the new stage from the earlier ability',
    MAIN,
    promoted,
    [ask(T0 + 12 * DAY), ask(T0 + 12 * DAY, { excludeSkills: ['c'] })],
  ),
  plan(
    'a placement and a credited placement',
    MAIN,
    [place('h1', 'a', 'produce'), place('h2', 'c', 'apply', T0, true)],
    [ask(T0)],
  ),
  plan(
    'excluded, suspended and locked skills are not planned',
    MAIN,
    [ev('e1', 'a', 'recall', T0), act('h1', T0, { kind: 'suspend', skillId: 'c' })],
    [ask(T0 + 5 * DAY), ask(T0 + 5 * DAY, { excludeSkills: ['a'] })],
  ),
  plan(
    'remediation plans a hard prerequisite that fell below its floor after a failed mastery check',
    REMEDY,
    [
      ev('e1', 'p', 'recall', T0),
      place('h1', 'q', 'recall'),
      ev('e2', 'q', 'recall', T0),
      ev('e3', 'p', 'recall', T0 + DAY),
      ev('e4', 'q', 'recall', T0 + 1.2 * DAY, fail),
    ],
    [
      ask(T0 + 1.5 * DAY),
      ask(T0 + 1.5 * DAY, { limits: { maxRemediation: 0 } }),
      ask(T0 + 1.5 * DAY, { excludeSkills: ['p'] }),
    ],
    { config: { mastery: { retentionMargin: 0 } } },
  ),
  plan(
    'remediation plans a hard prerequisite that fell below its floor after a lapse',
    REMEDY,
    [
      ev('e1', 'p', 'recall', T0),
      place('h1', 'q', 'recall'),
      ev('e2', 'q', 'recall', T0),
      ev('e3', 'p', 'recall', T0 + DAY),
      {
        evidence: { id: 'e4', itemId: 'e4-item', at: T0 + 1.2 * DAY, source: fail },
        item: item('e4-item', 'q', 'recall', { difficulty: -5 }),
      },
    ],
    [ask(T0 + 1.5 * DAY)],
    { config: { mastery: { retentionMargin: 0 } } },
  ),
  plan(
    'focus plans the hard-prerequisite closure in topological order, then the rest',
    FAN,
    [],
    [
      ask(T0, { limits: { maxNewSkills: 9 } }),
      ask(T0, { focusSkills: ['c'], limits: { maxNewSkills: 9 } }),
      ask(T0, { focusSkills: ['b'], limits: { maxNewSkills: 2 } }),
    ],
  ),
  plan(
    'pretests pair with new skills at the configured stage and fit the budget together',
    MAIN,
    [],
    [ask(T0), ask(T0, { budget: { maxTargets: 1 } }), ask(T0, { budget: { maxTargets: 3 } })],
    { config: { planner: { pretestNewSkills: true } } },
  ),
  plan('coalescing joins due components at the equivalent stage up to the cap', KIT, kitSteps, [
    ask(kNow, { dueBy: kDue, limits: { maxSkillsPerTarget: 4 } }),
    ask(kNow, { dueBy: kDue, limits: { maxSkillsPerTarget: 2 } }),
    ask(kNow, { dueBy: kDue }),
    ask(kNow, {
      dueBy: kDue,
      limits: { maxSkillsPerTarget: 2 },
      pool: [
        kItem('bare', ['k', 'x']),
        kItem('bound-w', ['k', 'w'], true),
        kItem('bound-x', ['k', 'x'], true),
      ],
    }),
    ask(kNow, {
      dueBy: kDue,
      limits: { maxSkillsPerTarget: 2 },
      pool: [kItem('bare', ['k', 'x']), kItem('bound-w', ['k', 'w'], true)],
    }),
    ask(kNow, {
      dueBy: kDue,
      limits: { maxSkillsPerTarget: 2 },
      pool: [{ ...kItem('wrong-proof', ['k', 'x']), criteria: [{ name: 'c0', skillId: 'w' }] }],
    }),
  ]),
  plan(
    'coalescing off plans every component on its own',
    KIT,
    kitSteps,
    [ask(kNow, { dueBy: kDue, limits: { maxSkillsPerTarget: 4 } })],
    { config: { planner: { coalesce: false } } },
  ),
  plan(
    'pool matching: proof, status, stage, tolerance, exclusion, cooldown and preference',
    MAIN,
    used,
    [
      ask(T0 + 2 * DAY, {
        pool: [
          near('unproven', { status: 'unproven' }),
          near('checked', { proof: { kind: 'model-checked', at: T0, model: 'm', agreed: true } }),
          near('far', { difficulty: cAt + 5 }),
          near('wrong-stage', { stage: 'recall' }),
          near('used'),
        ],
      }),
      ask(T0 + 2 * DAY, {
        excludeItems: ['best'],
        pool: [near('best'), near('next', { difficulty: cAt + 0.1 })],
      }),
      ask(T0 + 2 * DAY, { pool: [near('next', { difficulty: cAt + 0.1 }), near('best')] }),
      ask(T0 + 9 * DAY, { pool: [near('used')] }),
    ],
  ),
  plan(
    'the seconds budget uses stageSeconds, item seconds and the other-stage default',
    FORMS,
    [place('h1', 'a', 'drill')],
    [
      ask(T0),
      ask(T0, { budget: { maxSeconds: 120 } }),
      ask(T0, {
        pool: [
          item('timed', 'b', 'recall', {
            difficulty: difficultyOf(FORMS, [place('h1', 'a', 'drill')], ask(T0), 'b', {
              planner: { stageSeconds: { recall: 45 } },
            }),
            expectedSeconds: 30,
          }),
        ],
      }),
    ],
    { config: { planner: { stageSeconds: { recall: 45 } } } },
  ),
  plan(
    'difficulty targets targetSuccess from a prior, and the seed only moves ties',
    MAIN,
    [act('h1', T0, { kind: 'prior', skillId: 'a', theta: 1.5, pseudoCount: 4 })],
    [ask(T0), { request: { now: T0, seed: 'other', budget: {} } }],
    { config: { planner: { targetSuccess: 0.7 } } },
  ),
  plan(
    'interleave groups and new declarative blocks shape the order of new targets',
    ORDER,
    [],
    [
      ask(T0, { limits: { maxNewSkills: 9 } }),
      { request: { now: T0, seed: 't', budget: {}, limits: { maxNewSkills: 9 } } },
      { request: { now: T0, seed: 'u', budget: {}, limits: { maxNewSkills: 9 } } },
      ask(T0, { excludeSkills: ['g1', 'g2', 'g3', 'h1'], limits: { maxNewSkills: 9 } }),
      {
        request: {
          now: T0,
          seed: 't',
          budget: {},
          excludeSkills: ['g1', 'g2', 'g3', 'h1'],
          limits: { maxNewSkills: 9 },
        },
      },
      ask(T0, { excludeSkills: ['p1', 'p2', 'p3'], limits: { maxNewSkills: 9 } }),
    ],
  ),
  plan(
    'targets of one interleave group past their first stage go next to each other',
    ORDER,
    [
      ev('e1', 'g3', 'recall', T0),
      place('h1', 'g1', 'produce'),
      place('h2', 'g2', 'produce'),
      place('h3', 'h1', 'produce'),
      place('h4', 'p1', 'write'),
      place('h5', 'p2', 'write'),
      place('h6', 'p3', 'complete'),
    ],
    ['s', 't', 'u', 'v'].map((seed) => ({
      request: { now: T0 + 5 * DAY, seed, budget: {}, limits: { maxNewSkills: 0 } },
    })),
  ),
  plan(
    'a soft prerequisite mastered at the top of its ladder counts as met',
    FAN,
    [place('h1', 'd', 'produce'), ev('e1', 'd', 'produce', T0)],
    softAsk,
    { config: quick },
  ),
  plan(
    'a credited soft prerequisite counts as met',
    FAN,
    [place('h1', 'd', 'produce', T0, true)],
    softAsk,
    { config: quick },
  ),
  plan(
    'a soft prerequisite at the top of its ladder but not mastered is not met',
    FAN,
    [place('h1', 'd', 'produce')],
    softAsk,
    { config: quick },
  ),
  plan(
    'an unlocked skill stays ready after its hard prerequisite is reset',
    MAIN,
    [place('h1', 'a', 'produce', T0, true), act('h2', T0, { kind: 'reset-skill', skillId: 'a' })],
    [
      ask(T0, { limits: { maxNewSkills: 9 } }),
      ask(T0, { focusSkills: ['b'], limits: { maxNewSkills: 9 } }),
    ],
  ),
  plan(
    'a prior on a locked skill does not make it ready',
    MAIN,
    [act('h1', T0, { kind: 'prior', skillId: 'b', theta: 0, pseudoCount: 1 })],
    [ask(T0, { limits: { maxNewSkills: 9 } })],
  ),
  plan(
    'the review backlog blocks new skills only above maxReviewBacklog',
    FAN,
    [ev('e1', 'a', 'recall', T0), ev('e2', 'd', 'recall', T0 + 2 * DAY)],
    [
      ask(T0 + 2.5 * DAY, { dueBy: T0 + 30 * DAY, limits: { maxReviewBacklog: 1 } }),
      ask(T0 + 2.5 * DAY, { dueBy: T0 + 30 * DAY, limits: { maxReviewBacklog: 2 } }),
    ],
  ),
  plan('a memory due at now is overdue and one due at dueBy is due', MAIN, reviewed, [
    ask(dueA),
    ask(dueA - 1),
    ask(T0 + 2.5 * DAY, { dueBy: dueB }),
    ask(T0 + 2.5 * DAY, { dueBy: dueB - 1 }),
  ]),
  plan('overdue reviews go by retrievability', ONE, orderSteps(T0 + 3.5 * DAY), [
    ask(T0 + 5 * DAY),
  ]),
  plan('due reviews go by due time', ONE, orderSteps(T0 + 2.5 * DAY), [
    ask(T0 + 2.5 * DAY, { dueBy: T0 + 30 * DAY }),
  ]),
  plan(
    'remediation follows the most recent lapse, up to maxRemediation, within the window',
    LAPSES,
    lapses,
    lapseRequests,
    { config: { mastery: { retentionMargin: 0 }, planner: { remediationWindowMs: WINDOW } } },
  ),
  plan('the retention margin lowers the remediation floor', LAPSES, lapses, lapseRequests, {
    config: { planner: { remediationWindowMs: WINDOW } },
  }),
  plan('a one-stage ladder takes no pretest', FORMS, [], [ask(T0)], {
    config: { planner: { pretestNewSkills: true } },
  }),
  plan(
    'a skill with an empty ladder is never planned',
    EMPTY,
    [],
    [ask(T0, { limits: { maxNewSkills: 9 } })],
  ),
  plan(
    'matching at the cooldown and tolerance boundaries, with avoided content hashes',
    MAIN,
    used,
    [
      ask(T0 + COOL, { pool: [null, item('zero', 'c', 'recognise', { contentHash: 'h0' })] }),
      ask(T0 + COOL, { pool: [near('used', { difficulty: c3, contentHash: 'h-used' }), null] }),
      ask(T0 + COOL - 1, {
        pool: [
          'junk',
          near('used', { difficulty: c3, contentHash: 'h-used' }),
          near('other', { difficulty: c3, contentHash: 'h-other' }),
        ],
      }),
    ],
    { config: boundary },
  ),
  plan(
    'among matches: the smallest gap, the fewest uses, the oldest use, then the seed',
    MAIN,
    usedSteps,
    [
      ask(uNow, { pool: [at('u2'), at('u1')] }),
      ask(uNow, { pool: [at('u1'), at('u3')] }),
      ask(uNow, { pool: [at('u3'), at('u1')] }),
      { request: { now: uNow, seed: 'other', budget: {}, pool: [at('u3'), at('u1')] } },
      ask(uNow, { pool: [at('u1'), at('u2')] }),
      ask(uNow, { pool: [at('u2'), at('far', { difficulty: uAt + 0.1 })] }),
      ask(uNow, { pool: [at('far', { difficulty: uAt + 0.1 }), at('u2')] }),
      ask(uNow, { pool: [at('u1'), at('z1')] }),
      ask(uNow, { pool: [at('z1'), at('z2')] }),
      ask(uNow, { pool: [at('z2'), at('z1')] }),
      { request: { now: uNow, seed: 'other', budget: {}, pool: [at('z1'), at('z2')] } },
      ask(uNow, { pool: [at('best'), at('next', { difficulty: uAt + 0.1 })] }),
      ask(uNow, {
        pool: [at('dup', { expectedSeconds: 10 }), at('dup', { expectedSeconds: 20 })],
      }),
    ],
    { config: { itemCooldownMs: 0 } },
  ),
  plan('an item attaches to one target only', MAIN, reviewed, [
    ask(T0 + 2.5 * DAY, { dueBy: T0 + 30 * DAY, pool: [shared] }),
  ]),
  plan(
    'request and state checks throw',
    MAIN,
    [],
    [
      ask(T0, { budget: { maxTargets: -1 } }),
      ask(T0, { dueBy: T0 - 1 }),
      { request: { now: T0, budget: {} } },
      ask(T0, { limits: { maxSkillsPerTarget: 0 } }),
      ask(T0, { pool: 'none' }),
      { graph: 'next', ...ask(T0) },
      ask(T0, { dueBy: T0 }),
      ask(T0, { budget: [] }),
      ask(T0, { focusSkills: [1] }),
      ask(T0, { budget: { maxSeconds: 'x' } }),
      ask(T0, { budget: { maxSeconds: -1 } }),
    ],
    { graphs: { next: { ...MAIN, version: 'g2' } } },
  ),
];

const body = {
  $comment:
    'Plan vectors for @intellectif/lk-practice (criteria 6 to 9), generated by scripts/plan-vectors.mjs and run by vectors/replay.mjs. `plan` runs `steps` through createPractice(config) as the log vectors do, records each outcome, then records plan(state, graph, request) for each request, against `graphs.main` or the graph the request names. A call that throws is recorded as its error name. Floats compare at a relative 1e-9; integers, strings, null and every time exactly.',
  version: CORPUS_VERSION,
  vectors: record(impl, vectors),
};
writeFileSync(join(PACKAGE, 'vectors', 'plan.json'), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
console.log(`plan vectors: ${vectors.length} plan`);
