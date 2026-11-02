import { describe, expect, it } from 'vitest';
import type { MasteryModel, SkillNode, StageId } from '../../types.js';
import { type AbilityContext, abilityAt, priorAbility, updateAbility } from '../ability.js';
import { createEloModel } from '../elo.js';

const LADDER = ['recognise', 'recall', 'produce', 'apply'];
const DEMAND = new Map<StageId, number>([
  ['recognise', 1],
  ['recall', 2],
  ['produce', 3],
  ['apply', 4],
]);
const context: AbilityContext = {
  model: createEloModel({}) as MasteryModel,
  ladder: LADDER,
  demand: DEMAND,
  stageOffset: 1,
};
const SKILL: SkillNode = { id: 's', knowledge: 'declarative', masteryPrior: 0.3 };
const obs = (correct: number, weight = 1) => ({
  correct,
  weight,
  difficulty: 0,
  stage: 'recall',
  context: 'practice' as const,
});

describe('abilityAt', () => {
  it('starts from the prior at the first stage and derives up the ladder', () => {
    expect(abilityAt({}, SKILL, 'recognise', context)).toEqual({ theta: 0.3, n: 0 });
    // shift = 1 * (4 - 1) = 3.
    expect(abilityAt({}, SKILL, 'apply', context)).toEqual({ theta: 0.3 - 3, n: 0 });
  });

  it('returns the stored stage and derives from the nearest one', () => {
    const stored = { recall: { theta: 0.8, n: 3 } };
    expect(abilityAt(stored, SKILL, 'recall', context)).toEqual({ theta: 0.8, n: 3 });
    expect(abilityAt(stored, SKILL, 'produce', context)).toEqual({ theta: 0.8 - 1, n: 0 });
    // Down the ladder the shift is negative: a lower stage starts higher.
    expect(abilityAt(stored, SKILL, 'recognise', context)).toEqual({ theta: 1.8, n: 0 });
    const far = { apply: { theta: 1, n: 1 } };
    expect(abilityAt(far, SKILL, 'recognise', context)).toEqual({ theta: 4, n: 0 });
  });

  it('breaks a tie toward the lower stage and prefers the nearer stage', () => {
    const tie = { recognise: { theta: 1, n: 1 }, produce: { theta: -2, n: 1 } };
    expect(abilityAt(tie, SKILL, 'recall', context)).toEqual({ theta: 0, n: 0 });
    const near = { recognise: { theta: 1, n: 1 }, apply: { theta: 5, n: 1 } };
    expect(abilityAt(near, SKILL, 'produce', context)).toEqual({ theta: 6, n: 0 });
    const nearLow = { recognise: { theta: 1, n: 1 }, apply: { theta: 5, n: 1 } };
    expect(abilityAt(nearLow, SKILL, 'recall', context)).toEqual({ theta: 0, n: 0 });
  });

  it('scales the shift by stageOffset and works across demand values', () => {
    const procedural = {
      ...context,
      ladder: ['example', 'complete', 'write', 'transfer'],
      demand: new Map<StageId, number>([
        ['example', 1],
        ['complete', 2],
        ['write', 3],
        ['transfer', 4.5],
      ]),
      stageOffset: 0.5,
    };
    const stored = { complete: { theta: 1, n: 2 } };
    expect(abilityAt(stored, SKILL, 'transfer', procedural)).toEqual({ theta: 1 - 1.25, n: 0 });
    expect(abilityAt({}, { id: 'p', knowledge: 'procedural' }, 'write', procedural)).toEqual({
      theta: -1,
      n: 0,
    });
  });

  it('rejects a stage off the ladder or without demand', () => {
    expect(() => abilityAt({}, SKILL, 'use', context)).toThrow(RangeError);
    const partial = { ...context, demand: new Map<StageId, number>([['recognise', 1]]) };
    expect(() => abilityAt({}, SKILL, 'recall', partial)).toThrow(RangeError);
  });
});

describe('updateAbility and priorAbility', () => {
  it('stores the updated stage in ladder order and keeps the others', () => {
    const stored = { produce: { theta: 1, n: 1 } };
    const next = updateAbility(stored, SKILL, 'recognise', obs(1), context);
    expect(Object.keys(next)).toEqual(['recognise', 'produce']);
    expect(next.produce).toEqual({ theta: 1, n: 1 });
    // From the nearest stage, produce: 1 + 2 = 3, then 3 + (1 - sigmoid(3)).
    const theta = (next.recognise as { theta: number }).theta;
    expect(Math.abs(theta - (3 + (1 - 1 / (1 + Math.exp(-3)))))).toBeLessThan(1e-12);
    expect(Object.isFrozen(next)).toBe(true);
  });

  it('stores nothing for a weight of 0', () => {
    const stored = { recall: { theta: 1, n: 1 } };
    expect(updateAbility(stored, SKILL, 'apply', obs(1, 0), context)).toBe(stored);
  });

  it('sets a prior at one stage without touching the others', () => {
    const stored = { recall: { theta: 1, n: 1 } };
    const next = priorAbility(stored, SKILL, 'apply', -0.5, 4, context);
    expect(next).toEqual({ recall: { theta: 1, n: 1 }, apply: { theta: -0.5, n: 4 } });
    expect(stored).toEqual({ recall: { theta: 1, n: 1 } });
  });
});
