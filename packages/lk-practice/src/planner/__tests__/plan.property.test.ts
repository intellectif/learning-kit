import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateGraph } from '../../graph/index.js';
import { evidence, host, type Step } from '../../log/__tests__/fixtures.js';
import type {
  CandidateProof,
  HostAction,
  PlanRequest,
  Practice,
  PracticeItem,
  PracticeState,
  PracticeTarget,
  SessionPlan,
  SkillEdge,
  SkillGraph,
} from '../../types.js';
import { DAY, fail, item, pass, practice, run, T0 } from './helpers.js';

const RUNS = { numRuns: 150 };
const STAGES = ['recognise', 'recall', 'produce', 'apply'] as const;
const ENGINES: readonly Practice[] = [
  practice(),
  practice({ mastery: { retentionMargin: 0 }, planner: { pretestNewSkills: true } }),
];

/** A random valid DAG of 2 to 6 declarative skills; edges run from lower to higher index. */
const graphs: fc.Arbitrary<SkillGraph> = fc
  .integer({ min: 2, max: 6 })
  .chain((n) =>
    fc.record({
      masks: fc.array(fc.integer({ min: 1, max: 15 }), { minLength: n, maxLength: n }),
      strict: fc.array(fc.boolean(), { minLength: n, maxLength: n }),
      links: fc.array(
        fc.record({
          prerequisite: fc.constantFrom<'none' | 'hard' | 'soft'>('none', 'none', 'hard', 'soft'),
          encompasses: fc.boolean(),
        }),
        { minLength: (n * (n - 1)) / 2, maxLength: (n * (n - 1)) / 2 },
      ),
    }),
  )
  .map(({ masks, strict, links }) => {
    const skills = masks.map((mask, i) => ({
      id: `k${i}`,
      knowledge: 'declarative' as const,
      stages: STAGES.filter((_, bit) => (mask >> bit) & 1),
      ...(strict[i] ? { desiredRetention: 0.97 } : {}),
    }));
    const edges: SkillEdge[] = [];
    let at = 0;
    for (let i = 0; i < skills.length; i += 1) {
      for (let j = i + 1; j < skills.length; j += 1) {
        const link = links[at] as (typeof links)[number];
        at += 1;
        if (link.prerequisite === 'none') continue;
        edges.push({
          kind: 'prerequisite',
          from: `k${i}`,
          to: `k${j}`,
          strength: link.prerequisite,
        });
        if (link.encompasses) {
          edges.push({ kind: 'encompasses', from: `k${j}`, to: `k${i}`, weight: 0.5 });
        }
      }
    }
    return { version: 'p1', skills, edges };
  })
  .filter((graph) => validateGraph(graph).ok);

const ladderOf = (graph: SkillGraph, skill: number): readonly string[] =>
  graph.skills[skill % graph.skills.length]?.stages ?? [];

type Draft =
  | { kind: 'evidence'; skill: number; stage: number; passed: boolean; item: number; gap: number }
  | {
      kind: 'host';
      action: 'suspend' | 'unsuspend' | 'reset-skill' | 'place' | 'prior';
      skill: number;
      stage: number;
      credited: boolean;
      theta: number;
      gap: number;
    };

const gaps = fc.integer({ min: 0, max: 3 * DAY });
const drafts: fc.Arbitrary<Draft> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({
      kind: fc.constant<'evidence'>('evidence'),
      skill: fc.nat(),
      stage: fc.nat(),
      passed: fc.boolean(),
      item: fc.integer({ min: 0, max: 3 }),
      gap: gaps,
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant<'host'>('host'),
      action: fc.constantFrom('suspend', 'unsuspend', 'reset-skill', 'place', 'prior'),
      skill: fc.nat(),
      stage: fc.nat(),
      credited: fc.boolean(),
      theta: fc.double({ min: -2, max: 2, noNaN: true, noDefaultInfinity: true }),
      gap: gaps,
    }),
  },
);

/** The item id that evidence step `n` on `skillId` at `stage` uses; pools reuse these ids. */
const itemIdOf = (n: number, skillId: string, stage: string) => `i${n}-${skillId}-${stage}`;

function stepsOf(graph: SkillGraph, list: readonly Draft[]): { steps: Step[]; lastAt: number } {
  let at = T0;
  const steps = list.map((draft, i): Step => {
    at += draft.gap;
    const skillId = `k${draft.skill % graph.skills.length}`;
    const ladder = ladderOf(graph, draft.skill);
    const stage = ladder[draft.stage % ladder.length] as string;
    if (draft.kind === 'evidence') {
      const itemId = itemIdOf(draft.item, skillId, stage);
      return {
        evidence: evidence(`s${i}`, itemId, at, draft.passed ? pass : fail),
        item: item(itemId, skillId, stage),
      };
    }
    const action: HostAction =
      draft.action === 'place'
        ? { kind: 'place', skillId, stage, credited: draft.credited }
        : draft.action === 'prior'
          ? { kind: 'prior', skillId, theta: draft.theta, pseudoCount: 2 }
          : { kind: draft.action, skillId };
    return { host: host(`s${i}`, at, action) };
  });
  return { steps, lastAt: at };
}

const proofs = fc.constantFrom<CandidateProof | 'none'>(
  'none',
  { kind: 'executable', at: T0, referencePassed: true, wrongSolutionsFailed: 1 },
  { kind: 'reviewed', at: T0, reviewerId: 'r' },
  { kind: 'model-checked', at: T0, model: 'm', agreed: true },
);

const poolDrafts = fc.array(
  fc.record({
    skill: fc.nat(),
    stage: fc.nat(),
    n: fc.integer({ min: 0, max: 5 }),
    difficulty: fc.double({ min: -3, max: 3, noNaN: true, noDefaultInfinity: true }),
    proven: fc.boolean(),
    proof: proofs,
  }),
  { maxLength: 10 },
);

function poolOf(
  graph: SkillGraph,
  list: readonly {
    skill: number;
    stage: number;
    n: number;
    difficulty: number;
    proven: boolean;
    proof: CandidateProof | 'none';
  }[],
): PracticeItem[] {
  const seen = new Set<string>();
  return list.flatMap((draft) => {
    const skillId = `k${draft.skill % graph.skills.length}`;
    const ladder = ladderOf(graph, draft.skill);
    const stage = ladder[draft.stage % ladder.length] as string;
    const id = itemIdOf(draft.n, skillId, stage);
    if (seen.has(id)) return [];
    seen.add(id);
    return [
      item(id, skillId, stage, {
        difficulty: draft.difficulty,
        status: draft.proven ? 'proven' : 'unproven',
        ...(draft.proof === 'none' ? {} : { proof: draft.proof }),
      }),
    ];
  });
}

/** Items built around a target of the plan without a pool, so some of them fit. */
const fittedDrafts = fc.array(
  fc.record({
    target: fc.nat(),
    n: fc.integer({ min: 0, max: 5 }),
    delta: fc.double({ min: -0.6, max: 0.6, noNaN: true }),
    proven: fc.boolean(),
    proof: proofs,
    criteria: fc.boolean(),
  }),
  { maxLength: 6 },
);

function fittedOf(
  base: SessionPlan,
  list: readonly {
    target: number;
    n: number;
    delta: number;
    proven: boolean;
    proof: CandidateProof | 'none';
    criteria: boolean;
  }[],
): PracticeItem[] {
  if (base.targets.length === 0) return [];
  return list.map((draft, i) => {
    const target = base.targets[draft.target % base.targets.length] as PracticeTarget;
    const [primary] = target.skillIds as [string];
    const id = itemIdOf(draft.n, primary, target.stage);
    return item(draft.n < 3 ? id : `${id}-f${i}`, primary, target.stage, {
      skills: target.skillIds.map((skillId) => ({ skillId, weight: 1 / target.skillIds.length })),
      difficulty: target.targetDifficulty + draft.delta,
      status: draft.proven ? 'proven' : 'unproven',
      ...(draft.proof === 'none' ? {} : { proof: draft.proof }),
      ...(draft.criteria
        ? { criteria: target.skillIds.map((skillId, c) => ({ name: `c${c}`, skillId })) }
        : {}),
    });
  });
}

const subset = (ids: readonly string[]) =>
  fc.subarray([...ids], { maxLength: Math.max(1, Math.ceil(ids.length / 3)) });
const limit = fc.option(fc.integer({ min: 0, max: 4 }), { nil: undefined });

interface Case {
  readonly p: Practice;
  readonly graph: SkillGraph;
  readonly state: PracticeState;
  readonly request: PlanRequest;
}

const cases: fc.Arbitrary<Case> = graphs.chain((graph) =>
  fc
    .record({
      engine: fc.nat({ max: ENGINES.length - 1 }),
      list: fc.array(drafts, { maxLength: 20 }),
      later: fc.integer({ min: 0, max: 10 * DAY }),
      ahead: fc.option(fc.integer({ min: 0, max: 30 * DAY }), { nil: undefined }),
      seed: fc.string({ maxLength: 4 }),
      maxTargets: fc.option(fc.integer({ min: 0, max: 8 }), { nil: undefined }),
      maxSeconds: fc.option(fc.integer({ min: 0, max: 900 }), { nil: undefined }),
      maxNewSkills: limit,
      maxReviewBacklog: limit,
      maxRemediation: limit,
      maxSkillsPerTarget: fc.option(fc.integer({ min: 1, max: 4 }), { nil: undefined }),
      focus: subset(graph.skills.map((s) => s.id)),
      exclude: subset(graph.skills.map((s) => s.id)),
      pool: poolDrafts,
      fitted: fittedDrafts,
      excludeItem: fc.nat(),
    })
    .map((d): Case => {
      const p = ENGINES[d.engine] as Practice;
      const { steps, lastAt } = stepsOf(graph, d.list);
      const { state } = run(p, steps, graph);
      const now = lastAt + d.later;
      const base = p.plan(state, graph, { now, seed: d.seed, budget: {} });
      const limits = Object.fromEntries(
        (
          [
            ['maxNewSkills', d.maxNewSkills],
            ['maxReviewBacklog', d.maxReviewBacklog],
            ['maxRemediation', d.maxRemediation],
            ['maxSkillsPerTarget', d.maxSkillsPerTarget],
          ] as const
        ).filter(([, value]) => value !== undefined),
      );
      const pool = [...fittedOf(base, d.fitted), ...poolOf(graph, d.pool)].filter(
        (entry, i, all) => all.findIndex((other) => other.id === entry.id) === i,
      );
      const excludeItems =
        pool.length === 0 ? [] : [(pool[d.excludeItem % pool.length] as PracticeItem).id];
      const request: PlanRequest = {
        now,
        ...(d.ahead === undefined ? {} : { dueBy: now + d.ahead }),
        seed: d.seed,
        budget: {
          ...(d.maxTargets === undefined ? {} : { maxTargets: d.maxTargets }),
          ...(d.maxSeconds === undefined ? {} : { maxSeconds: d.maxSeconds }),
        },
        limits,
        focusSkills: d.focus,
        excludeSkills: d.exclude,
        excludeItems,
        pool,
      };
      return { p, graph, state, request };
    }),
);

const plan = ({ p, graph, state, request }: Case): SessionPlan => p.plan(state, graph, request);
const limitOf = (c: Case, name: keyof NonNullable<PlanRequest['limits']>): number =>
  c.request.limits?.[name] ?? c.p.config.planner.limits[name];
const count = (result: SessionPlan, kind: string) =>
  result.targets.filter((target) => target.kind === kind).length;

describe('plan properties', () => {
  it('property: within budget and caps (targets, seconds, new skills, remediation, skills per target)', () => {
    fc.assert(
      fc.property(cases, (c) => {
        const result = plan(c);
        const seconds = result.targets.reduce((sum, target) => sum + target.expectedSeconds, 0);
        expect(result.budgetUsed).toEqual({ targets: result.targets.length, seconds });
        expect(result.targets.length).toBeLessThanOrEqual(c.request.budget.maxTargets ?? Infinity);
        expect(seconds).toBeLessThanOrEqual(c.request.budget.maxSeconds ?? Infinity);
        expect(count(result, 'new')).toBeLessThanOrEqual(limitOf(c, 'maxNewSkills'));
        expect(count(result, 'remediation')).toBeLessThanOrEqual(limitOf(c, 'maxRemediation'));
        for (const target of result.targets) {
          expect(target.skillIds.length).toBeLessThanOrEqual(limitOf(c, 'maxSkillsPerTarget'));
        }
        expect(result.deferred.reviewsDue).toBeGreaterThanOrEqual(0);
        expect(result.deferred.newReady).toBeGreaterThanOrEqual(0);
      }),
      RUNS,
    );
  });

  it('property: never locked, suspended or excluded (no target names such a skill)', () => {
    fc.assert(
      fc.property(cases, (c) => {
        const result = plan(c);
        const status = new Map(
          c.p.status(c.state, c.graph, c.request.now).skills.map((s) => [s.skillId, s.status]),
        );
        const excluded = new Set(c.request.excludeSkills);
        for (const target of result.targets) {
          for (const id of target.skillIds) {
            expect(excluded.has(id)).toBe(false);
            expect(['locked', 'suspended']).not.toContain(status.get(id));
          }
        }
      }),
      RUNS,
    );
  });

  it('property: matched items are proven, accepted, fitting and off cooldown (each at most once)', () => {
    fc.assert(
      fc.property(cases, (c) => {
        const result = plan(c);
        const { config } = c.p;
        const pool = new Map((c.request.pool ?? []).map((entry) => [entry.id, entry]));
        const attached = result.targets.flatMap((target) =>
          target.item === undefined ? [] : [target.item.itemId],
        );
        expect(new Set(attached).size).toBe(attached.length);
        for (const target of result.targets) {
          if (target.item === undefined) continue;
          const matched = pool.get(target.item.itemId) as PracticeItem;
          expect(matched.status).toBe('proven');
          if (matched.proof !== undefined)
            expect(config.acceptProofs).toContain(matched.proof.kind);
          expect(c.request.excludeItems).not.toContain(matched.id);
          expect(matched.stage).toBe(target.stage);
          for (const id of target.skillIds) {
            expect(matched.skills.map((s) => s.skillId)).toContain(id);
          }
          expect(Math.abs((matched.difficulty ?? 0) - target.targetDifficulty)).toBeLessThanOrEqual(
            config.planner.difficultyTolerance,
          );
          const usage = c.state.items[matched.id];
          if (usage !== undefined) {
            expect(usage.lastUsedAt).toBeLessThanOrEqual(c.request.now - config.itemCooldownMs);
          }
          expect(target.constraints.avoidItemIds).not.toContain(matched.id);
        }
      }),
      RUNS,
    );
  });

  it('property: a skill at most once (except the pretest of a new skill, right before it)', () => {
    fc.assert(
      fc.property(cases, (c) => {
        const result = plan(c);
        const ids = result.targets
          .filter((target) => target.kind !== 'pretest')
          .flatMap((target) => target.skillIds);
        expect(new Set(ids).size).toBe(ids.length);
        result.targets.forEach((target, i) => {
          if (target.kind !== 'pretest') return;
          const next = result.targets[i + 1];
          expect(next?.kind).toBe('new');
          expect(next?.skillIds).toEqual(target.skillIds);
        });
      }),
      RUNS,
    );
  });

  it('property: expectedSuccess equals targetSuccess (relative 1e-9) at every targetDifficulty', () => {
    fc.assert(
      fc.property(cases, (c) => {
        const goal = c.p.config.planner.targetSuccess;
        for (const target of plan(c).targets) {
          expect(Math.abs(target.reason.expectedSuccess - goal)).toBeLessThanOrEqual(1e-9 * goal);
        }
      }),
      RUNS,
    );
  });

  it('property: deterministic and pure (equal plans, equal ids, inputs unchanged, output frozen)', () => {
    fc.assert(
      fc.property(cases, (c) => {
        const before = structuredClone({ state: c.state, graph: c.graph, request: c.request });
        const first = plan(c);
        const again = c.p.plan(
          structuredClone(c.state),
          structuredClone(c.graph),
          structuredClone(c.request),
        );
        expect(again).toEqual(first);
        expect({ state: c.state, graph: c.graph, request: c.request }).toEqual(before);
        expect(Object.isFrozen(first)).toBe(true);
        expect(Object.isFrozen(first.targets)).toBe(true);
        const targetIds = first.targets.map((target) => target.id);
        expect(new Set(targetIds).size).toBe(targetIds.length);
      }),
      RUNS,
    );
  });
});
