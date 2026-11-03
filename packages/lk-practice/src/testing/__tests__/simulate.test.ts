import { describe, expect, it } from 'vitest';
import { createPractice } from '../../practice.js';
import type {
  PracticeConfig,
  PracticeState,
  PracticeTarget,
  ReviewLogEntry,
  SkillGraph,
} from '../../types.js';
import { type SimulatedAttempt, simulateLearner } from '../index.js';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 5);

/** The simulator grades with an `auto` source. */
const passed = ({ evidence }: SimulatedAttempt): boolean =>
  evidence.source.kind === 'auto' && evidence.source.passed;

/** A target as the planner makes one; only the fields the learner reads matter. */
function target(id: string, skillIds: string[], difficulty = 0): PracticeTarget {
  return {
    id,
    kind: 'review',
    skillIds,
    stage: 'recall',
    targetDifficulty: difficulty,
    difficultyTolerance: 0.5,
    expectedSeconds: 60,
    constraints: {
      needsSkillOutcomes: skillIds.length > 1,
      avoidItemIds: [],
      avoidContentHashes: [],
      context: 'practice',
    },
    reason: {
      code: 'due',
      due: 0,
      retrievability: 0.9,
      masteryCheck: false,
      expectedSuccess: 0.85,
      coalesced: [],
      newSkillsDeferred: false,
    },
  };
}

/** The share of `count` first attempts at a new skill each that succeed. */
function successRate(trueAbility: number, difficulty: number, count = 4000): number {
  const skills = Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`s${i}`, { trueAbility, forgettingDays: 10 }]),
  );
  const learner = simulateLearner({ seed: 'rate', skills, noise: 0 });
  let wins = 0;
  for (let i = 0; i < count; i += 1) {
    wins += passed(learner.attempt(target(`t${i}`, [`s${i}`], difficulty), T0)) ? 1 : 0;
  }
  return wins / count;
}

describe('simulateLearner', () => {
  it('gives the same attempts for the same seed and calls, and others for another seed', () => {
    const skills = {
      a: { trueAbility: 0, forgettingDays: 5 },
      b: { trueAbility: 1, forgettingDays: 9 },
    };
    const run = (seed: string) => {
      const learner = simulateLearner({ seed, skills });
      return Array.from({ length: 200 }, (_, i) =>
        learner.attempt(target(`t${i}`, i % 2 === 0 ? ['a'] : ['a', 'b']), T0 + i * DAY),
      );
    };
    expect(run('s1')).toEqual(run('s1'));
    const passes = (seed: string) => run(seed).map(passed);
    expect(passes('s1')).not.toEqual(passes('s2'));
  });

  it('succeeds at the logistic rate of ability against difficulty before forgetting', () => {
    expect(successRate(0, 0)).toBeCloseTo(0.5, 1);
    expect(successRate(2, 0)).toBeCloseTo(1 / (1 + Math.exp(-2)), 1);
    expect(successRate(0, 1.5)).toBeCloseTo(1 / (1 + Math.exp(1.5)), 1);
  });

  it('forgets: recall falls as exp(-days / forgettingDays) after the last attempt', () => {
    const count = 3000;
    const skills = Object.fromEntries(
      Array.from({ length: count }, (_, i) => [`s${i}`, { trueAbility: 50, forgettingDays: 10 }]),
    );
    const learner = simulateLearner({ seed: 'forget', skills, noise: 0 });
    let later = 0;
    for (let i = 0; i < count; i += 1) {
      learner.attempt(target(`first${i}`, [`s${i}`]), T0);
      const second = learner.attempt(target(`second${i}`, [`s${i}`]), T0 + 10 * DAY);
      later += passed(second) ? 1 : 0;
    }
    expect(later / count).toBeCloseTo(Math.exp(-1), 1);
  });

  it('reports each skill of a composite target, and the item weighs them equally', () => {
    const learner = simulateLearner({
      seed: 's',
      skills: {
        a: { trueAbility: 0, forgettingDays: 5 },
        b: { trueAbility: 0, forgettingDays: 5 },
      },
    });
    const { evidence, item } = learner.attempt(target('t', ['a', 'b'], 0.25), T0);
    expect(item).toMatchObject({
      skills: [
        { skillId: 'a', weight: 0.5 },
        { skillId: 'b', weight: 0.5 },
      ],
      stage: 'recall',
      difficulty: 0.25,
      origin: 'generated',
      status: 'proven',
    });
    expect(evidence).toMatchObject({ itemId: item.id, at: T0, context: 'practice', targetId: 't' });
    expect(evidence.skillOutcomes?.map((outcome) => outcome.skillId)).toEqual(['a', 'b']);
    expect(evidence.source).toMatchObject({ kind: 'auto', maxScore: 2 });
    expect(Object.isFrozen(evidence) && Object.isFrozen(item)).toBe(true);
    const single = learner.attempt(target('u', ['a']), T0 + DAY);
    expect(single.evidence.skillOutcomes).toBeUndefined();
  });

  it("reads an attached item's difficulty over the target's", () => {
    const learner = simulateLearner({
      seed: 's',
      skills: { a: { trueAbility: 0, forgettingDays: 5 } },
    });
    const planned = {
      ...target('t', ['a']),
      item: { itemId: 'i', difficulty: 3, expectedSuccess: 0.05 },
    };
    expect(learner.attempt(planned, T0).item.difficulty).toBe(3);
  });

  it.each([
    ['a seed that is not a string', { seed: 1, skills: {} }, TypeError],
    ['a negative noise', { seed: 's', skills: {}, noise: -1 }, RangeError],
    ['an infinite noise', { seed: 's', skills: {}, noise: Number.POSITIVE_INFINITY }, RangeError],
    [
      'an ability that is not finite',
      { seed: 's', skills: { a: { trueAbility: Number.NaN, forgettingDays: 1 } } },
      RangeError,
    ],
    [
      'forgettingDays 0',
      { seed: 's', skills: { a: { trueAbility: 0, forgettingDays: 0 } } },
      RangeError,
    ],
    ['no skill entry', { seed: 's', skills: { a: null } }, RangeError],
  ])('throws for %s', (_name, options, error) => {
    expect(() => simulateLearner(options as never)).toThrow(error);
  });

  it('throws on an attempt at a skill it does not have, or at a time that is not a safe integer', () => {
    const learner = simulateLearner({
      seed: 's',
      skills: { a: { trueAbility: 0, forgettingDays: 5 } },
    });
    expect(() => learner.attempt(target('t', ['b']), T0)).toThrow(TypeError);
    expect(() => learner.attempt(target('t', ['a']), T0 + 0.5)).toThrow(RangeError);
    expect(simulateLearner({ seed: 's', skills: undefined as never })).toBeDefined();
  });
});

/** A ladder of skills: `p` before `q` and `r` (hard), `q` and `r` inside `s`. */
const GRAPH: SkillGraph = {
  version: 'sim1',
  skills: [
    { id: 'p', knowledge: 'declarative' },
    { id: 'q', knowledge: 'declarative' },
    { id: 'r', knowledge: 'procedural' },
    { id: 's', knowledge: 'procedural' },
  ],
  edges: [
    { kind: 'prerequisite', from: 'p', to: 'q', strength: 'hard' },
    { kind: 'prerequisite', from: 'p', to: 'r', strength: 'hard' },
    { kind: 'prerequisite', from: 'q', to: 's', strength: 'soft' },
    { kind: 'prerequisite', from: 'r', to: 's', strength: 'soft' },
    { kind: 'encompasses', from: 's', to: 'q', weight: 0.5 },
    { kind: 'encompasses', from: 's', to: 'r', weight: 0.5 },
  ],
};

/** 90 simulated days: one session a day, every target attempted and recorded. */
function simulate(config: PracticeConfig, seed: string) {
  const practice = createPractice(config);
  const learner = simulateLearner({
    seed,
    skills: {
      p: { trueAbility: 1, forgettingDays: 30 },
      q: { trueAbility: 0.5, forgettingDays: 20 },
      r: { trueAbility: 0, forgettingDays: 15 },
      s: { trueAbility: -0.5, forgettingDays: 10 },
    },
  });
  let state: PracticeState = practice.initState('l1', GRAPH);
  const entries: ReviewLogEntry[] = [];
  const kinds = new Set<string>();
  let attempts = 0;
  for (let day = 0; day < 90; day += 1) {
    const now = T0 + day * DAY;
    const plan = practice.plan(state, GRAPH, { now, seed: `day${day}`, budget: { maxTargets: 4 } });
    for (const [i, planned] of plan.targets.entries()) {
      const { evidence, item } = learner.attempt(planned, now + i * 60_000);
      const result = practice.record(state, { graph: GRAPH, evidence, item });
      expect(result.kind).toBe('applied');
      if (result.kind !== 'applied') throw new Error(JSON.stringify(result));
      state = result.state;
      entries.push(...result.appended);
      kinds.add(planned.kind);
      attempts += 1;
    }
  }
  return { practice, state, entries, kinds, attempts };
}

describe('a simulated 90 days', () => {
  it('records every attempt, replays to the same state and repeats for the same seed', () => {
    const first = simulate({}, 'run');
    expect(first.attempts).toBeGreaterThan(20);
    expect([...first.kinds].sort()).toEqual(expect.arrayContaining(['new', 'review', 'stage-up']));
    const replayed = first.practice.replay(first.entries, GRAPH, 'l1');
    expect(replayed.ok && replayed.state).toEqual(first.state);
    expect(simulate({}, 'run').state.log.hash).toBe(first.state.log.hash);
    expect(simulate({}, 'other').state.log.hash).not.toBe(first.state.log.hash);
    const history = first.practice.exportReviewHistory(first.entries, GRAPH, 'l1');
    expect(history.ok && history.history.skills.length).toBeGreaterThan(0);
  });
});
