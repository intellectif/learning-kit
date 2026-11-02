import { describe, expect, it } from 'vitest';
import { host, masterA } from '../../log/__tests__/fixtures.js';
import type { PlanRequest, PracticeItem, PracticeTarget, SkillGraph } from '../../types.js';
import { OTHER_STAGE_SECONDS, PLANNER_ALGORITHM, planSession, targetId, tieKey } from '../index.js';
import { DAY, fail, GRAPH, item, practice, request, review, run, shape, T0 } from './helpers.js';

const p = practice();

/** `p` must be met before `q` (hard); `q` lapses; `p` has a stricter retention in `R_STRICT`. */
const R: SkillGraph = {
  version: 'r1',
  skills: [
    { id: 'p', knowledge: 'declarative', stages: ['recall'] },
    { id: 'q', knowledge: 'declarative', stages: ['recall'] },
  ],
  edges: [{ kind: 'prerequisite', from: 'p', to: 'q', strength: 'hard' }],
};
const R_STRICT: SkillGraph = {
  ...R,
  skills: R.skills.map((skill) =>
    skill.id === 'p' ? { ...skill, desiredRetention: 0.99 } : skill,
  ),
};

describe('plan: request and state checks', () => {
  const s0 = p.initState('l1', GRAPH);
  const bad: [string, unknown, ErrorConstructor][] = [
    ['request', null, TypeError],
    ['now', { now: 1.5, seed: 's', budget: {} }, RangeError],
    ['dueBy below now', { now: T0, dueBy: T0 - 1, seed: 's', budget: {} }, RangeError],
    ['dueBy', { now: T0, dueBy: 'x', seed: 's', budget: {} }, RangeError],
    ['seed', { now: T0, seed: 1, budget: {} }, TypeError],
    ['budget', { now: T0, seed: 's' }, TypeError],
    ['budget array', { now: T0, seed: 's', budget: [] }, TypeError],
    ['maxTargets', { now: T0, seed: 's', budget: { maxTargets: -1 } }, RangeError],
    ['maxTargets fraction', { now: T0, seed: 's', budget: { maxTargets: 1.5 } }, RangeError],
    ['maxSeconds', { now: T0, seed: 's', budget: { maxSeconds: -1 } }, RangeError],
    ['maxSeconds NaN', { now: T0, seed: 's', budget: { maxSeconds: Number.NaN } }, RangeError],
    ['maxSeconds string', { now: T0, seed: 's', budget: { maxSeconds: '1' } }, RangeError],
    ['limits', { now: T0, seed: 's', budget: {}, limits: 1 }, TypeError],
    ['limits null', { now: T0, seed: 's', budget: {}, limits: null }, TypeError],
    ['maxNewSkills', { now: T0, seed: 's', budget: {}, limits: { maxNewSkills: -1 } }, RangeError],
    [
      'maxSkillsPerTarget',
      { now: T0, seed: 's', budget: {}, limits: { maxSkillsPerTarget: 0 } },
      RangeError,
    ],
    ['focusSkills', { now: T0, seed: 's', budget: {}, focusSkills: 'a' }, TypeError],
    ['excludeSkills', { now: T0, seed: 's', budget: {}, excludeSkills: [1] }, TypeError],
    ['excludeItems', { now: T0, seed: 's', budget: {}, excludeItems: {} }, TypeError],
    ['pool', { now: T0, seed: 's', budget: {}, pool: {} }, TypeError],
  ];
  it.each(bad)('throws on a malformed %s', (_name, req, type) => {
    expect(() => p.plan(s0, GRAPH, req as PlanRequest)).toThrow(type);
  });

  it('accepts zero limits and budgets, and dueBy equal to now', () => {
    const plan = p.plan(
      s0,
      GRAPH,
      request(T0, {
        dueBy: T0,
        budget: { maxTargets: 0, maxSeconds: 0 },
        limits: { maxNewSkills: 0 },
      }),
    );
    expect(plan.targets).toEqual([]);
    expect(plan.deferred).toEqual({ reviewsDue: 0, newReady: 2 });
  });

  it('throws PracticeConfigError for a state of another configuration or graph version', () => {
    expect(() => practice({ leechThreshold: 3 }).plan(s0, GRAPH, request(T0))).toThrow(
      expect.objectContaining({ name: 'PracticeConfigError' }),
    );
    expect(() => p.plan(s0, { ...GRAPH, version: 'g2' }, request(T0))).toThrow(
      expect.objectContaining({ name: 'PracticeConfigError' }),
    );
  });
});

describe('plan: tiers and caps', () => {
  it('an empty state plans the ready skills as new, at the first stage and targetSuccess', () => {
    const s0 = p.initState('l1', GRAPH);
    const plan = p.plan(s0, GRAPH, request(T0));
    expect(shape(plan).sort()).toEqual(['new:a@recall', 'new:c@recognise']);
    for (const target of plan.targets) {
      expect(target.reason).toMatchObject({ code: 'new', focus: false, coalesced: [] });
      expect(target.reason.expectedSuccess).toBeCloseTo(0.85, 12);
      expect(target.constraints).toEqual({
        needsSkillOutcomes: false,
        avoidItemIds: [],
        avoidContentHashes: [],
        context: 'practice',
      });
      expect(target.item).toBeUndefined();
    }
    expect(plan.deferred).toEqual({ reviewsDue: 0, newReady: 0 });
    expect(plan.budgetUsed).toEqual({ targets: 2, seconds: 50 });
    expect(plan.algorithm).toEqual(PLANNER_ALGORITHM);
    expect(Object.isFrozen(plan) && Object.isFrozen(plan.targets[0]?.constraints)).toBe(true);
  });

  it('caps new skills and counts the rest in deferred.newReady', () => {
    const plan = p.plan(
      p.initState('l1', GRAPH),
      GRAPH,
      request(T0, { limits: { maxNewSkills: 1 } }),
    );
    expect(plan.targets).toHaveLength(1);
    expect(plan.deferred.newReady).toBe(1);
  });

  it('orders overdue by retrievability, then due by due, and leaves later reviews out', () => {
    const { state } = run(p, [
      review('e1', 'a', 'recall', T0),
      review('e2', 'c', 'recognise', T0 + DAY / 2),
    ]);
    const due = state.skills.c?.memories.recognise?.due as number;
    const dueA = state.skills.a?.memories.recall?.due as number;
    expect(dueA).toBeLessThan(due);
    const both = p.plan(state, GRAPH, request(due + 10 * DAY));
    expect(both.targets.map((t) => t.reason.code)).toEqual(['overdue', 'overdue']);
    const rs = both.targets.map((t) => (t.reason as { retrievability: number }).retrievability);
    expect(rs[0]).toBeLessThanOrEqual(rs[1] as number);

    const split = p.plan(state, GRAPH, request(dueA, { dueBy: due }));
    expect(shape(split)).toEqual(['review:a@recall', 'review:c@recognise']);
    expect(split.targets.map((t) => t.reason.code)).toEqual(['overdue', 'due']);
    expect(split.targets[1]?.reason).toMatchObject({ code: 'due', due });

    const early = p.plan(state, GRAPH, request(dueA, { dueBy: due - 1 }));
    expect(shape(early)).toEqual(['review:a@recall']);
    const before = p.plan(state, GRAPH, request(dueA - 1));
    expect(before.targets.map((t) => t.kind)).toEqual([]);
    expect(before.deferred).toEqual({ reviewsDue: 0, newReady: 0 });
  });

  it('counts the reviews the budget leaves out in deferred.reviewsDue', () => {
    const { state } = run(p, [review('e1', 'a', 'recall', T0), review('e2', 'c', 'recognise', T0)]);
    const plan = p.plan(state, GRAPH, request(T0 + 30 * DAY, { budget: { maxTargets: 1 } }));
    expect(plan.targets).toHaveLength(1);
    expect(plan.deferred.reviewsDue).toBe(1);
  });

  it('a review backlog above maxReviewBacklog blocks new skills (R6.8)', () => {
    const { state } = run(p, [review('e1', 'c', 'recognise', T0)]);
    const now = T0 + 30 * DAY;
    const open = p.plan(state, GRAPH, request(now));
    expect(shape(open)).toEqual(['review:c@recognise', 'new:a@recall']);
    const blocked = p.plan(state, GRAPH, request(now, { limits: { maxReviewBacklog: 0 } }));
    expect(shape(blocked)).toEqual(['review:c@recognise']);
    expect(blocked.targets[0]?.reason.newSkillsDeferred).toBe(true);
    expect(blocked.deferred.newReady).toBe(1);
    const config = practice({ planner: { limits: { maxReviewBacklog: 0 } } });
    const configured = run(config, [review('e1', 'c', 'recognise', T0)]).state;
    expect(shape(config.plan(configured, GRAPH, request(now)))).toEqual(['review:c@recognise']);
    expect(
      shape(config.plan(configured, GRAPH, request(now, { limits: { maxReviewBacklog: 1 } }))),
    ).toEqual(['review:c@recognise', 'new:a@recall']);
  });

  it('drops excluded, suspended, locked and off-ladder skills', () => {
    const { state } = run(p, [
      review('e1', 'a', 'recall', T0),
      review('e2', 'c', 'recognise', T0),
      { host: host('h1', T0, { kind: 'suspend', skillId: 'c' }) },
    ]);
    const now = T0 + 30 * DAY;
    expect(shape(p.plan(state, GRAPH, request(now)))).toEqual(['review:a@recall']);
    expect(shape(p.plan(state, GRAPH, request(now, { excludeSkills: ['a'] })))).toEqual([]);
    const reladdered: SkillGraph = {
      ...GRAPH,
      skills: GRAPH.skills.map((skill) =>
        skill.id === 'a' ? { ...skill, stages: ['produce'] } : skill,
      ),
    };
    expect(shape(p.plan(state, reladdered, request(now)))).toEqual([]);
  });

  it('skips a skill without a ladder in an unvalidated graph', () => {
    const graph: SkillGraph = {
      version: 'g1',
      skills: [
        { id: 'a', knowledge: 'mixed' },
        { id: 'b', knowledge: 'declarative', stages: [] },
        { id: 'c', knowledge: 'declarative' },
      ],
      edges: [{ kind: 'prerequisite', from: 'ghost', to: 'c', strength: 'soft' }],
    };
    expect(shape(p.plan(p.initState('l1', graph), graph, request(T0)))).toEqual([
      'new:c@recognise',
    ]);
  });

  it('plans a stage-up after a placement and after a promotion, at the new stage ability', () => {
    const placed = run(p, [
      { host: host('h1', T0, { kind: 'place', skillId: 'a', stage: 'produce', credited: false }) },
      {
        host: host('h2', T0, { kind: 'place', skillId: 'c', stage: 'recognise', credited: false }),
      },
    ]).state;
    const plan = p.plan(placed, GRAPH, request(T0));
    expect(plan.targets.map((t) => [t.kind, t.stage, t.reason])).toEqual(
      expect.arrayContaining([
        ['stage-up', 'produce', expect.objectContaining({ code: 'stage-up', fromStage: 'recall' })],
        ['stage-up', 'recognise', expect.objectContaining({ code: 'stage-up', fromStage: null })],
      ]),
    );
    const credited = run(p, [
      { host: host('h1', T0, { kind: 'place', skillId: 'a', stage: 'produce', credited: true }) },
    ]).state;
    expect(shape(p.plan(credited, GRAPH, request(T0))).sort()).toEqual([
      'new:b@recall',
      'new:c@recognise',
    ]);

    // Promote `a` by passing at each due time; the stage-up target then uses the produce ability.
    let steps = [review('m0', 'a', 'recall', T0)];
    let state = run(p, steps).state;
    for (let i = 1; i < 20 && state.skills.a?.stage === 'recall'; i += 1) {
      const at = Math.max(state.skills.a.memories.recall?.due as number, T0 + i * DAY);
      steps = [...steps, review(`m${i}`, 'a', 'recall', at)];
      state = run(p, steps).state;
    }
    expect(state.skills.a?.stage).toBe('produce');
    const now = state.log.lastAt as number;
    const up = p.plan(state, GRAPH, request(now)).targets.find((t) => t.kind === 'stage-up');
    expect(up).toMatchObject({ skillIds: ['a'], stage: 'produce' });
    expect(up?.reason.expectedSuccess).toBeCloseTo(0.85, 12);
    const recall = state.skills.a?.ability.recall as { theta: number };
    const recallTheta = recall.theta;
    expect(up?.targetDifficulty).toBeLessThan(recallTheta - Math.log(0.85 / 0.15));
  });

  it('plans a remediation for a lapsed skill whose hard prerequisite fell below its floor', () => {
    const strict = practice({ mastery: { retentionMargin: 0 } });
    const steps = [
      review('e1', 'p', 'recall', T0),
      { host: host('h1', T0, { kind: 'place', skillId: 'q', stage: 'recall', credited: false }) },
      review('e2', 'q', 'recall', T0),
      review('e3', 'p', 'recall', T0 + DAY),
      review('e4', 'q', 'recall', T0 + 1.2 * DAY, fail),
    ];
    const { state } = run(strict, steps, R);
    const now = T0 + 1.5 * DAY;
    const plan = strict.plan(state, R_STRICT, request(now));
    expect(shape(plan)).toEqual(['review:q@recall', 'remediation:p@recall']);
    expect(plan.targets[1]?.reason).toMatchObject({
      code: 'remediation',
      lapsedSkillId: 'q',
      lapseAt: T0 + 1.2 * DAY,
    });
    expect(strict.plan(state, R, request(now)).targets.map((t) => t.kind)).toEqual(['review']);
    const capped = strict.plan(state, R_STRICT, request(now, { limits: { maxRemediation: 0 } }));
    expect(shape(capped)).toEqual(['review:q@recall']);
    const late = strict.plan(state, R_STRICT, request(T0 + 3 * DAY));
    expect(late.targets.map((t) => t.reason.code)).toEqual(['overdue', 'overdue']);
    const tight = strict.plan(state, R_STRICT, request(now, { budget: { maxSeconds: 30 } }));
    expect(shape(tight)).toEqual(['review:q@recall']);
    expect(
      strict.plan(state, R_STRICT, request(now, { excludeSkills: ['p'] })).targets,
    ).toHaveLength(1);
    const wide = practice({
      mastery: { retentionMargin: 0 },
      planner: { remediationWindowMs: 10 * DAY },
    });
    const wideState = run(wide, steps, R).state;
    const overdueFirst = wide.plan(wideState, R_STRICT, request(T0 + 3 * DAY));
    expect(overdueFirst.targets.map((t) => t.reason.code)).toEqual(['overdue', 'overdue']);
  });

  it('remediation breaks lapse ties by key and ignores lapses without hard prerequisites', () => {
    const graph: SkillGraph = {
      version: 'r3',
      skills: [
        { id: 'p1', knowledge: 'declarative', stages: ['recall'], desiredRetention: 0.99 },
        { id: 'q1', knowledge: 'declarative', stages: ['recall'] },
        { id: 'q2', knowledge: 'declarative', stages: ['recall'] },
        { id: 'solo', knowledge: 'declarative', stages: ['recall'] },
        { id: 'fresh', knowledge: 'declarative', stages: ['recall', 'produce'] },
      ],
      edges: [
        { kind: 'prerequisite', from: 'p1', to: 'q1', strength: 'hard' },
        { kind: 'prerequisite', from: 'p1', to: 'q2', strength: 'hard' },
        { kind: 'prerequisite', from: 'fresh', to: 'q1', strength: 'hard' },
      ],
    };
    const strict = practice({ mastery: { retentionMargin: 0 } });
    const place = (id: string, skillId: string, stage = 'recall') => ({
      host: host(id, T0, { kind: 'place', skillId, stage, credited: false }),
    });
    const steps = [
      review('e1', 'p1', 'recall', T0),
      place('h1', 'q1'),
      place('h2', 'q2'),
      place('h3', 'fresh', 'produce'),
      review('e3', 'q1', 'recall', T0),
      review('e4', 'q2', 'recall', T0),
      review('e5', 'solo', 'recall', T0),
      review('e6', 'p1', 'recall', T0 + DAY),
      review('e8', 'q1', 'recall', T0 + 1.2 * DAY, fail),
      review('e9', 'q2', 'recall', T0 + 1.2 * DAY, fail),
      review('e10', 'solo', 'recall', T0 + 1.2 * DAY, fail),
    ];
    const { state } = run(strict, steps, graph);
    const plan = strict.plan(state, graph, request(T0 + 1.5 * DAY));
    const remediation = plan.targets.filter((t) => t.kind === 'remediation');
    expect(remediation).toHaveLength(1);
    const first = tieKey('s', 'q1') < tieKey('s', 'q2') ? 'q1' : 'q2';
    expect(remediation[0]).toMatchObject({ skillIds: ['p1'], reason: { lapsedSkillId: first } });
  });

  it('remediation takes the most recent lapse and skips prerequisites without a memory', () => {
    const graph: SkillGraph = {
      version: 'r2',
      skills: [
        { id: 'p', knowledge: 'declarative', stages: ['recall'], desiredRetention: 0.99 },
        { id: 'q', knowledge: 'declarative', stages: ['recall'] },
        { id: 'r', knowledge: 'declarative', stages: ['recall'] },
        { id: 'z', knowledge: 'declarative', stages: ['recall'] },
      ],
      edges: [
        { kind: 'prerequisite', from: 'p', to: 'q', strength: 'hard' },
        { kind: 'prerequisite', from: 'p', to: 'r', strength: 'hard' },
        { kind: 'prerequisite', from: 'z', to: 'r', strength: 'hard' },
      ],
    };
    const strict = practice({ mastery: { retentionMargin: 0 } });
    const place = (id: string, skillId: string) => ({
      host: host(id, T0, { kind: 'place', skillId, stage: 'recall', credited: false }),
    });
    const steps = [
      review('e1', 'p', 'recall', T0),
      place('h1', 'q'),
      place('h2', 'r'),
      review('e2', 'q', 'recall', T0),
      review('e3', 'r', 'recall', T0),
      review('e4', 'p', 'recall', T0 + 8 * DAY),
      review('e5', 'q', 'recall', T0 + 8.1 * DAY, fail),
      review('e6', 'r', 'recall', T0 + 8.2 * DAY, fail),
    ];
    const { state } = run(strict, steps, graph);
    const plan = strict.plan(state, graph, request(T0 + 8.4 * DAY));
    const remediation = plan.targets.filter((t) => t.kind === 'remediation');
    expect(remediation).toHaveLength(1);
    expect(remediation[0]?.reason).toMatchObject({ lapsedSkillId: 'r', lapseAt: T0 + 8.2 * DAY });
  });
});

describe('plan: focus and new-skill order', () => {
  const graph: SkillGraph = {
    version: 'f1',
    skills: [
      { id: 'a', knowledge: 'procedural', stages: ['example'] },
      { id: 'b', knowledge: 'procedural', stages: ['example'] },
      { id: 'c', knowledge: 'procedural', stages: ['example'] },
      { id: 'd', knowledge: 'procedural', stages: ['example'] },
      { id: 'e', knowledge: 'procedural', stages: ['example'] },
      { id: 'f', knowledge: 'procedural', stages: ['example'] },
    ],
    edges: [
      { kind: 'prerequisite', from: 'a', to: 'c', strength: 'hard' },
      { kind: 'prerequisite', from: 'b', to: 'c', strength: 'hard' },
      { kind: 'prerequisite', from: 'a', to: 'b', strength: 'hard' },
      { kind: 'prerequisite', from: 'd', to: 'e', strength: 'soft' },
      { kind: 'prerequisite', from: 'f', to: 'e', strength: 'soft' },
      { kind: 'prerequisite', from: 'd', to: 'f', strength: 'soft' },
    ],
  };

  it('puts the ready part of the focus closure first, then soft-ready skills, then the rest', () => {
    const s0 = p.initState('l1', graph);
    const plan = p.plan(
      s0,
      graph,
      request(T0, { focusSkills: ['c', 'zz'], limits: { maxNewSkills: 9 } }),
    );
    expect(plan.targets.map((t) => t.reason)).toEqual([
      expect.objectContaining({ code: 'new', focus: true, softPrerequisitesMastered: true }),
      expect.objectContaining({ focus: false, softPrerequisitesMastered: true }),
      expect.objectContaining({ focus: false, softPrerequisitesMastered: false }),
      expect.objectContaining({ focus: false, softPrerequisitesMastered: false }),
    ]);
    expect(plan.targets[0]?.skillIds).toEqual(['a']);
    expect(plan.targets[1]?.skillIds).toEqual(['d']);
  });

  it('counts a credited or mastered soft prerequisite as met', () => {
    const credited = run(
      p,
      [{ host: host('h1', T0, { kind: 'place', skillId: 'd', stage: 'example', credited: true }) }],
      graph,
    ).state;
    const plan = p.plan(credited, graph, request(T0, { excludeSkills: ['a'] }));
    expect(plan.targets.map((t) => [t.skillIds[0], t.reason])).toEqual([
      ['f', expect.objectContaining({ softPrerequisitesMastered: true })],
      ['e', expect.objectContaining({ softPrerequisitesMastered: false })],
    ]);
  });

  it('counts a soft prerequisite mastered at its top stage as met, and a started one as not', () => {
    const soft: SkillGraph = {
      ...GRAPH,
      skills: [...GRAPH.skills, { id: 'x', knowledge: 'procedural', stages: ['example'] }],
      edges: [...GRAPH.edges, { kind: 'prerequisite', from: 'a', to: 'x', strength: 'soft' }],
    };
    const started = run(p, [review('e1', 'a', 'recall', T0)]).state;
    const reason = (state: typeof started, now: number) =>
      p
        .plan(state, soft, request(now, { limits: { maxNewSkills: 9 } }))
        .targets.find((t) => t.skillIds[0] === 'x')?.reason;
    expect(reason(started, T0)).toMatchObject({ softPrerequisitesMastered: false });
    const mastered = masterA(p).state;
    expect(mastered.skills.a?.mastered).toBe(true);
    expect(reason(mastered, mastered.log.lastAt as number)).toMatchObject({
      softPrerequisitesMastered: true,
    });
  });

  it('a focus closure ignores dependents outside it', () => {
    const plan = p.plan(p.initState('l1', graph), graph, request(T0, { focusSkills: ['b'] }));
    expect(plan.targets[0]).toMatchObject({ skillIds: ['a'], reason: { focus: true } });
  });

  it('orders focus skills topologically', () => {
    const credited = run(
      p,
      [{ host: host('h1', T0, { kind: 'place', skillId: 'a', stage: 'example', credited: true }) }],
      graph,
    ).state;
    const plan = p.plan(credited, graph, request(T0, { focusSkills: ['c', 'b'] }));
    expect(plan.targets[0]).toMatchObject({ skillIds: ['b'], reason: { focus: true } });
  });

  it('adds a pretest before a new target when enabled (R6.5)', () => {
    const pre = practice({ planner: { pretestNewSkills: true } });
    const s0 = pre.initState('l1', GRAPH);
    const plan = pre.plan(s0, GRAPH, request(T0));
    expect(shape(plan)).toEqual([
      'pretest:c@produce',
      'new:c@recognise',
      'pretest:a@produce',
      'new:a@recall',
    ]);
    expect(plan.targets[0]?.constraints.context).toBe('pretest');
    expect(plan.targets[0]?.reason).toMatchObject({ code: 'pretest', forSkillId: 'c' });
    expect(plan.budgetUsed.targets).toBe(4);
    const clipped = practice({ planner: { pretestNewSkills: true, pretestStageIndex: 9 } });
    expect(shape(clipped.plan(clipped.initState('l1', GRAPH), GRAPH, request(T0)))).toContain(
      'pretest:c@apply',
    );
    const first = practice({ planner: { pretestNewSkills: true, pretestStageIndex: 0 } });
    expect(shape(first.plan(first.initState('l1', GRAPH), GRAPH, request(T0))).length).toBe(2);
    const tight = pre.plan(s0, GRAPH, request(T0, { budget: { maxTargets: 1 } }));
    expect(tight.targets.map((t) => t.kind)).toEqual(['new']);
  });
});

describe('plan: coalescing', () => {
  const graph: SkillGraph = {
    version: 'k1',
    skills: [
      { id: 'k', knowledge: 'procedural', stages: ['complete', 'write'] },
      { id: 'w', knowledge: 'declarative', stages: ['recall', 'produce'] },
      { id: 'x', knowledge: 'declarative', stages: ['recall', 'produce'] },
      { id: 'v', knowledge: 'declarative', stages: ['recall', 'produce'] },
    ],
    edges: [
      { kind: 'encompasses', from: 'k', to: 'w', weight: 0.5 },
      { kind: 'encompasses', from: 'k', to: 'x', weight: 0.5 },
      { kind: 'encompasses', from: 'w', to: 'v', weight: 1 },
      { kind: 'encompasses', from: 'x', to: 'v', weight: 1 },
    ],
  };
  // `k` is overdue at `now`; its components are due before `dueBy`.
  const steps = [
    review('e1', 'k', 'complete', T0),
    review('e2', 'w', 'recall', T0 + 3 * DAY),
    review('e3', 'x', 'recall', T0 + 3 * DAY),
    review('e4', 'v', 'recall', T0 + 3 * DAY),
  ];
  const now = T0 + 3.5 * DAY;
  const dueBy = T0 + 60 * DAY;

  it('an overdue component joined by an earlier target is not planned again', () => {
    const allOverdue = [
      review('e1', 'k', 'complete', T0),
      review('e2', 'w', 'recall', T0),
      review('e3', 'x', 'recall', T0),
      review('e4', 'v', 'recall', T0),
    ];
    const { state } = run(p, allOverdue, graph);
    const plan = p.plan(state, graph, request(now, { limits: { maxSkillsPerTarget: 4 } }));
    expect(plan.targets.every((t) => t.reason.code === 'overdue')).toBe(true);
    const ids = plan.targets.flatMap((t) => t.skillIds);
    expect([...ids].sort()).toEqual(['k', 'v', 'w', 'x']);
    expect(plan.targets).toHaveLength(2);
  });

  it('joins due components at the equivalent stage, transitively, up to the cap', () => {
    const { state } = run(p, steps, graph);
    const plan = p.plan(state, graph, request(now, { dueBy, limits: { maxSkillsPerTarget: 4 } }));
    const composite = plan.targets.find((t) => t.skillIds[0] === 'k');
    expect([...(composite?.skillIds ?? [])].sort()).toEqual(['k', 'v', 'w', 'x']);
    expect(composite?.constraints.needsSkillOutcomes).toBe(true);
    expect(composite?.reason.coalesced).toEqual(composite?.skillIds.slice(1));
    const two = p.plan(state, graph, request(now, { dueBy, limits: { maxSkillsPerTarget: 2 } }));
    expect(two.targets.map((t) => t.skillIds.length).sort()).toEqual([1, 1, 2]);
    const one = p.plan(state, graph, request(now, { dueBy, limits: { maxSkillsPerTarget: 1 } }));
    expect(one.targets).toHaveLength(4);
    const composite2 = two.targets.find((t) => t.skillIds.length === 2) as PracticeTarget;
    const kItem = (id: string, criteria?: PracticeItem['criteria']) =>
      item(id, 'k', 'complete', {
        skills: composite2.skillIds.map((skillId) => ({
          skillId,
          weight: 1 / composite2.skillIds.length,
        })),
        difficulty: composite2.targetDifficulty,
        ...(criteria === undefined ? {} : { criteria }),
      });
    const withPool = (pool: PracticeItem[]) =>
      p
        .plan(state, graph, request(now, { dueBy, pool, limits: { maxSkillsPerTarget: 2 } }))
        .targets.find((t) => t.skillIds.length === 2)?.item?.itemId;
    expect(withPool([kItem('bare')])).toBeUndefined();
    expect(withPool([kItem('half', [{ name: 'c1', skillId: 'k' }])])).toBeUndefined();
    expect(
      withPool([
        kItem(
          'bound',
          composite2.skillIds.map((skillId, i) => ({ name: `c${i}`, skillId })),
        ),
      ]),
    ).toBe('bound');
    const off = practice({ planner: { coalesce: false } });
    const offState = run(off, steps, graph).state;
    expect(off.plan(offState, graph, request(now, { dueBy })).targets).toHaveLength(4);
  });

  it('does not join a component at another stage', () => {
    const place = {
      host: host('h1', T0, { kind: 'place', skillId: 'w', stage: 'produce', credited: false }),
    };
    const { state } = run(
      p,
      [...steps.slice(0, 1), place, review('e5', 'w', 'produce', T0)],
      graph,
    );
    const plan = p.plan(state, graph, request(now));
    expect(plan.targets.every((t) => t.skillIds.length === 1)).toBe(true);
  });
});

describe('plan: pool matching (R6.7)', () => {
  const cooldown = 7 * DAY;
  const base = run(p, [review('e1', 'a', 'recall', T0)]).state;
  const now = T0 + 30 * DAY;
  // The target difficulty of the overdue `a` review.
  const target = p.plan(base, GRAPH, request(now)).targets.find((t) => t.skillIds[0] === 'a');
  const d = target?.targetDifficulty as number;
  const near = (id: string, extra: Partial<PracticeItem> = {}) =>
    item(id, 'a', 'recall', { difficulty: d, ...extra });
  const matched = (pool: readonly unknown[], extra: Partial<PlanRequest> = {}, state = base) =>
    p
      .plan(state, GRAPH, request(now, { pool: pool as PracticeItem[], ...extra }))
      .targets.find((t) => t.skillIds[0] === 'a')?.item?.itemId;

  it('matches a proven item within tolerance and reports its expected success', () => {
    const plan = p.plan(base, GRAPH, request(now, { pool: [near('i1', { expectedSeconds: 7 })] }));
    const got = plan.targets.find((t) => t.skillIds[0] === 'a');
    expect(got?.item).toEqual({
      itemId: 'i1',
      difficulty: d,
      expectedSuccess: expect.any(Number),
    });
    expect(got?.item?.expectedSuccess).toBeCloseTo(0.85, 9);
    expect(got?.expectedSeconds).toBe(7);
  });

  it('rejects unfit items and keeps planning', () => {
    const cases: unknown[] = [
      null,
      near('wrong-stage', { stage: 'produce' }),
      near('unproven', { status: 'unproven' }),
      near('proof', { proof: { kind: 'model-checked', at: T0, model: 'm', agreed: true } }),
      near('other-skill', { skills: [{ skillId: 'c', weight: 1 }], stage: 'recall' }),
      near('unknown-skill', { skills: [{ skillId: 'zz', weight: 1 }] }),
      near('far', { difficulty: d + 0.51 }),
      near('excluded'),
    ];
    expect(matched(cases, { excludeItems: ['excluded'] })).toBeUndefined();
    expect(matched([near('ok', { difficulty: d - 0.5 })])).toBe('ok');
    expect(matched([item('zero', 'a', 'recall')])).toBe(Math.abs(d) <= 0.5 ? 'zero' : undefined);
  });

  it('accepts a proof kind the configuration accepts', () => {
    const accepting = practice({ acceptProofs: ['model-checked'] });
    const s = run(accepting, [review('e1', 'a', 'recall', T0)]).state;
    const plan = accepting.plan(
      s,
      GRAPH,
      request(now, {
        pool: [
          near('proof', { proof: { kind: 'model-checked', at: T0, model: 'm', agreed: true } }),
        ],
      }),
    );
    expect(plan.targets.find((t) => t.skillIds[0] === 'a')?.item?.itemId).toBe('proof');
  });

  it('skips items used within the cooldown and lists them in the avoid lists', () => {
    const used = run(p, [
      review('e1', 'a', 'recall', T0),
      {
        evidence: {
          id: 'u1',
          itemId: 'used',
          at: now - cooldown + 1,
          source: { kind: 'exposure' },
        },
        item: near('used'),
      },
      {
        evidence: { id: 'u2', itemId: 'old', at: now - cooldown, source: { kind: 'exposure' } },
        item: near('old'),
      },
    ]).state;
    const pool = [near('used', { contentHash: 'h-used' }), near('old', { contentHash: 'h-old' })];
    const plan = p.plan(used, GRAPH, request(now, { pool }));
    const got = plan.targets.find((t) => t.skillIds[0] === 'a');
    expect(got?.item?.itemId).toBe('old');
    expect(got?.constraints.avoidItemIds).toEqual(['used']);
    expect(got?.constraints.avoidContentHashes).toEqual(['h-used']);
  });

  it('prefers the smallest gap, then the fewest uses, the oldest use, then the seeded key', () => {
    expect(
      matched([near('far', { difficulty: d + 0.3 }), near('close', { difficulty: d + 0.1 })]),
    ).toBe('close');
    const used = run(p, [
      review('e1', 'a', 'recall', T0),
      {
        evidence: { id: 'u1', itemId: 'once', at: T0 + DAY, source: { kind: 'exposure' } },
        item: near('once'),
      },
      {
        evidence: { id: 'u2', itemId: 'twice', at: T0 + DAY, source: { kind: 'exposure' } },
        item: near('twice'),
      },
      {
        evidence: { id: 'u3', itemId: 'twice', at: T0 + 2 * DAY, source: { kind: 'exposure' } },
        item: near('twice'),
      },
      {
        evidence: { id: 'u4', itemId: 'later', at: T0 + 3 * DAY, source: { kind: 'exposure' } },
        item: near('later'),
      },
    ]).state;
    expect(matched([near('twice'), near('once')], {}, used)).toBe('once');
    expect(matched([near('later'), near('once')], {}, used)).toBe('once');
    expect(matched([near('once'), near('later')], {}, used)).toBe('once');
    expect(matched([near('once'), near('fresh')], {}, used)).toBe('fresh');
    const keyed = ['m1', 'm2', 'm3'].sort((x, y) => (tieKey('s', x) < tieKey('s', y) ? -1 : 1))[0];
    expect(matched([near('m3'), near('m1'), near('m2')])).toBe(keyed);
    expect(matched([near('m1'), near('m1')])).toBe('m1');
  });

  it('attaches an item to one target only', () => {
    const both = run(p, [
      review('e1', 'a', 'recall', T0),
      { host: host('h1', T0, { kind: 'place', skillId: 'c', stage: 'recall', credited: false }) },
      review('e2', 'c', 'recall', T0),
    ]).state;
    const shared = item('shared', 'a', 'recall', {
      skills: [
        { skillId: 'a', weight: 0.5 },
        { skillId: 'c', weight: 0.5 },
      ],
      difficulty: d,
    });
    const far = near('far', { difficulty: d + 5 });
    const plan = p.plan(both, GRAPH, request(now, { pool: [far, shared] }));
    expect(plan.targets.map((t) => t.stage)).toEqual(['recall', 'recall']);
    expect(plan.targets.filter((t) => t.item !== undefined)).toHaveLength(1);
  });
});

describe('plan: order (R6.4)', () => {
  it('separates new targets of one group and keeps the declarative block whole', () => {
    const graph: SkillGraph = {
      version: 'o1',
      skills: [
        { id: 'g1', knowledge: 'procedural', stages: ['example'], interleaveGroup: 'g' },
        { id: 'g2', knowledge: 'procedural', stages: ['example'], interleaveGroup: 'g' },
        { id: 'g3', knowledge: 'procedural', stages: ['example'], interleaveGroup: 'g' },
        { id: 'o', knowledge: 'procedural', stages: ['example'] },
        { id: 'd1', knowledge: 'declarative', stages: ['recall'], interleaveGroup: 'h' },
        { id: 'd2', knowledge: 'declarative', stages: ['recall'], interleaveGroup: 'h' },
        { id: 'd3', knowledge: 'declarative', stages: ['recall'] },
      ],
      edges: [],
    };
    const plan = p.plan(
      p.initState('l1', graph),
      graph,
      request(T0, { limits: { maxNewSkills: 9 } }),
    );
    const ids = plan.targets.map((t) => t.skillIds[0] as string);
    const group = (id: string) => graph.skills.find((s) => s.id === id)?.interleaveGroup;
    const declarative = ids.map((id) => id.startsWith('d'));
    const start = declarative.indexOf(true);
    expect(declarative.slice(start, start + 3)).toEqual([true, true, true]);
    for (let i = 1; i < ids.length; i += 1) {
      const a = group(ids[i - 1] as string);
      if (a !== undefined && a === group(ids[i] as string)) {
        // Only when nothing unrelated is left to place between them.
        const rest = ids
          .slice(i + 1)
          .filter(
            (id) => group(id) !== a && id.startsWith('d') === (ids[i] as string).startsWith('d'),
          );
        expect(rest).toEqual([]);
      }
    }
    expect(new Set(ids).size).toBe(7);
  });

  it('places reviews of one group past their first stage next to each other', () => {
    const graph: SkillGraph = {
      version: 'o2',
      skills: [
        { id: 'u', knowledge: 'declarative', stages: ['recall', 'produce'], interleaveGroup: 'g' },
        { id: 'm', knowledge: 'declarative', stages: ['recall', 'produce'] },
        { id: 'w', knowledge: 'declarative', stages: ['recall', 'produce'], interleaveGroup: 'g' },
      ],
      edges: [],
    };
    const place = (id: string, skillId: string) => ({
      host: host(id, T0, { kind: 'place', skillId, stage: 'produce', credited: false }),
    });
    const { state } = run(
      p,
      [
        place('h1', 'u'),
        place('h2', 'm'),
        place('h3', 'w'),
        review('e1', 'u', 'produce', T0),
        review('e2', 'm', 'produce', T0 + DAY / 4),
        review('e3', 'w', 'produce', T0 + DAY / 2),
      ],
      graph,
    );
    const ids = p.plan(state, graph, request(T0 + 40 * DAY)).targets.map((t) => t.skillIds[0]);
    const u = ids.indexOf('u');
    const w = ids.indexOf('w');
    expect(Math.abs(u - w)).toBe(1);
  });
});

describe('plan: budget, time and ids', () => {
  it('reports difficulty 0 for a matched item without one', () => {
    const theta = Math.log(0.85 / 0.15);
    const { state } = run(p, [
      { host: host('h1', T0, { kind: 'prior', skillId: 'a', theta, pseudoCount: 5 }) },
    ]);
    const plan = p.plan(state, GRAPH, request(T0, { pool: [item('i0', 'a', 'recall')] }));
    const got = plan.targets.find((t) => t.skillIds[0] === 'a');
    expect(Math.abs(got?.targetDifficulty as number)).toBeLessThanOrEqual(0.5);
    expect(got?.item).toMatchObject({ itemId: 'i0', difficulty: 0 });
  });

  it('fills the budget in seconds and keeps scanning for a smaller target', () => {
    const graph: SkillGraph = {
      version: 'b1',
      skills: [
        { id: 'big', knowledge: 'procedural', stages: ['write'] },
        { id: 'odd', knowledge: 'procedural', stages: ['drill'] },
        {
          id: 'small',
          knowledge: 'declarative',
          stages: ['recognise'],
          forms: { recognise: ['mcq'] },
        },
      ],
      edges: [],
    };
    const s0 = p.initState('l1', graph);
    const plan = p.plan(s0, graph, request(T0, { budget: { maxSeconds: 150 } }));
    expect(plan.targets.map((t) => [t.skillIds[0], t.expectedSeconds])).toEqual(
      expect.arrayContaining([
        ['odd', OTHER_STAGE_SECONDS],
        ['small', 20],
      ]),
    );
    expect(plan.budgetUsed).toEqual({ targets: 2, seconds: 140 });
    expect(plan.targets.find((t) => t.skillIds[0] === 'small')?.constraints.forms).toEqual(['mcq']);
    expect(plan.deferred.newReady).toBe(1);
  });

  it('is deterministic, gives ids from the log, and changes ids after a record', () => {
    const s0 = p.initState('l1', GRAPH);
    const one = p.plan(s0, GRAPH, request(T0));
    expect(p.plan(s0, GRAPH, request(T0))).toEqual(one);
    const target = one.targets[0];
    expect(target?.id).toBe(
      targetId('l1', s0.log.hash, 'new', target?.skillIds ?? [], target?.stage ?? ''),
    );
    const after = run(p, [review('e1', 'a', 'recall', T0)]).state;
    const ids = new Set(one.targets.map((t) => t.id));
    for (const t of p.plan(after, GRAPH, request(T0)).targets) expect(ids.has(t.id)).toBe(false);
  });

  it('is a plain function of the engine', () => {
    const s0 = p.initState('l1', GRAPH);
    expect(typeof planSession).toBe('function');
    expect(p.plan(s0, GRAPH, request(T0, { seed: 'other' })).targets).toHaveLength(2);
  });
});
