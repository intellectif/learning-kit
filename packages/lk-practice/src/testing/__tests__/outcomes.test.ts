import { describe, expect, it } from 'vitest';
import { createPractice } from '../../practice.js';
import type { SkillGraph } from '../../types.js';
import { simulateLearner } from '../index.js';

// The whole loop with the default configuration (revised in M9): plan, attempt,
// record, every day. The audit before 0.1.0 found that no learner, however
// able, was ever mastered, so no hard dependent ever unlocked; each piece had
// full unit coverage. These outcomes are the check on the pieces together.

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 5);
const SEEDS = 10;

/** `c` needs `a` (hard). */
const GRAPH: SkillGraph = {
  version: 'outcomes',
  skills: [
    { id: 'a', knowledge: 'declarative' },
    { id: 'c', knowledge: 'declarative' },
  ],
  edges: [{ kind: 'prerequisite', from: 'a', to: 'c', strength: 'hard' }],
};

interface Outcome {
  readonly masteredOn: number | null;
  readonly unlockedOn: number | null;
  readonly suspended: boolean;
  /** Attempts on `a`, its practice load. */
  readonly attempts: number;
}

/** A learner of `trueAbility` (forgetting slowly) practising up to 8 targets a day. */
function simulate(seed: string, trueAbility: number, days: number): Outcome {
  const practice = createPractice();
  const skill = { trueAbility, forgettingDays: 365 };
  const learner = simulateLearner({ seed, skills: { a: skill, c: skill } });
  let state = practice.initState('l1', GRAPH);
  let masteredOn: number | null = null;
  let unlockedOn: number | null = null;
  let attempts = 0;
  for (let day = 0; day < days; day += 1) {
    const now = T0 + day * DAY;
    const plan = practice.plan(state, GRAPH, { now, seed: `d${day}`, budget: { maxTargets: 8 } });
    for (const [i, target] of plan.targets.entries()) {
      const result = practice.record(state, {
        graph: GRAPH,
        ...learner.attempt(target, now + i * 60_000),
      });
      if (result.kind !== 'applied') throw new Error(result.kind);
      state = result.state;
      if (target.skillIds[0] === 'a') attempts += 1;
      for (const event of result.events) {
        if (event.type === 'skill.mastered' && event.skillId === 'a') masteredOn ??= day;
        if (event.type === 'skill.unlocked' && event.skillId === 'c') unlockedOn ??= day;
      }
    }
  }
  return { masteredOn, unlockedOn, suspended: state.skills.a?.suspended != null, attempts };
}

const seeds = Array.from({ length: SEEDS }, (_, i) => `learner${i}`);

describe('outcomes of the default configuration', () => {
  it('a learner well above the standard masters a skill and unlocks its dependent: most within 45 days, all within 90', () => {
    const days = seeds.map((seed) => {
      const outcome = simulate(seed, 3, 90);
      expect(outcome.unlockedOn).toBe(outcome.masteredOn);
      expect(outcome.suspended).toBe(false);
      expect(outcome.masteredOn).not.toBeNull();
      return outcome.masteredOn as number;
    });
    // The standard holds with a margin on little evidence, and one failed
    // check costs days, not the model's interval (revised in M11).
    expect(days.filter((day) => day <= 45).length).toBeGreaterThanOrEqual(8);
  });

  it('a learner well below the standard is never mastered in a year, never suspended as a leech, and practises it at most 60 times', () => {
    for (const seed of seeds) {
      const outcome = simulate(seed, 0, 365);
      expect(outcome).toMatchObject({ masteredOn: null, unlockedOn: null, suspended: false });
      // Failed checks back off, so a standard out of reach does not take
      // over the practice (revised in M11).
      expect(outcome.attempts).toBeLessThanOrEqual(60);
    }
  });
});
