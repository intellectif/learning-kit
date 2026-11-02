import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../config.js';
import type { MasteryObservation, SkillNode } from '../../types.js';
import { createEloModel, ELO_DEFAULT_PARAMS, eloMasteryModel, sigmoid } from '../elo.js';

/** Relative 1e-9 (R12.2): `Math.exp` may differ in the last bits between platforms. */
function expectClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    1e-9 * Math.max(Math.abs(actual), Math.abs(expected)),
  );
}

const SKILL: SkillNode = { id: 's', knowledge: 'declarative' };

function obs(correct: number, weight = 1, difficulty = 0): MasteryObservation {
  return { correct, weight, difficulty, stage: 'recall', context: 'practice' };
}

describe('eloMasteryModel', () => {
  const elo = createEloModel({});

  it('names the configuration default reference', () => {
    const model = eloMasteryModel();
    expect({ id: model.id, version: model.version, params: model.params }).toEqual(
      defaultConfig().masteryModel,
    );
    expect(ELO_DEFAULT_PARAMS).toEqual({ alpha: 1, beta: 0.05 });
    expect(Object.isFrozen(model)).toBe(true);
  });

  it('starts at the skill prior with no evidence', () => {
    expect(elo.init(SKILL)).toEqual({ theta: 0, n: 0 });
    expect(elo.init({ ...SKILL, masteryPrior: -1.5 })).toEqual({ theta: -1.5, n: 0 });
  });

  it('matches hand-computed updates with the decaying step', () => {
    // p = 0.5, K(0) = 1: theta = 0 + 1 * (1 - 0.5).
    const first = elo.update(elo.init(SKILL), obs(1));
    expect(first).toEqual({ theta: 0.5, n: 1 });
    // p = sigmoid(0.5) = 0.6224593312018546, K(1) = 1 / 1.05.
    const second = elo.update(first, obs(0));
    expectClose(second.theta, -0.09281841066843288);
    expect(second.n).toBe(2);
    // Weight scales the step: 0.5 * (1 - sigmoid(-1)).
    expectClose(elo.update(elo.init(SKILL), obs(1, 0.5, 1)).theta, 0.36552928931500245);
  });

  it('uses alpha, beta and the prior pseudo-count in the step', () => {
    const model = createEloModel({ alpha: 2, beta: 0.5 });
    const prior = model.prior(model.init(SKILL), 0.2, 2);
    expect(prior).toEqual({ theta: 0.2, n: 2 });
    // K(2) = 2 / (1 + 0.5 * 2) = 1; 0.2 + 1 * 0.8 * (0.6 - sigmoid(0.5)).
    const next = model.update(prior, obs(0.6, 0.8, -0.3));
    expectClose(next.theta, 0.18203253503851632);
    expect(next.n).toBe(3);
    expect(model.estimate(prior)).toEqual({
      model: 'elo@1',
      value: 0.2,
      uncertainty: 1,
      evidenceCount: 2,
    });
  });

  it('treats a weight of 0 as a no-op', () => {
    const state = elo.update(elo.init(SKILL), obs(1));
    expect(elo.update(state, obs(0, 0))).toBe(state);
  });

  it('derives a stage ability with a shift and no evidence', () => {
    expect(elo.derive({ theta: 0.5, n: 4 }, 1)).toEqual({ theta: -0.5, n: 0 });
    expect(elo.derive({ theta: 0.5, n: 4 }, -2)).toEqual({ theta: 2.5, n: 0 });
  });

  it('gives the logistic expected success and an estimate', () => {
    expectClose(elo.expectedSuccess({ theta: 2, n: 0 }, 0), 0.8807970779778823);
    expect(elo.expectedSuccess({ theta: 1, n: 0 }, 1)).toBe(0.5);
    expectClose(sigmoid(Math.log(4)), 0.8);
    const estimate = elo.estimate({ theta: 0.5, n: 1 });
    expect(estimate.model).toBe('elo@1');
    expect(estimate.value).toBe(0.5);
    expectClose(estimate.uncertainty as number, 0.9523809523809523);
    expect(estimate.evidenceCount).toBe(1);
  });

  it('round-trips through JSON and rejects malformed abilities', () => {
    const state = elo.update(elo.init(SKILL), obs(1));
    const raw = JSON.parse(JSON.stringify(elo.serialize(state)));
    const back = elo.deserialize(raw);
    expect(back).toEqual(state);
    expect(Object.isFrozen(back)).toBe(true);
    for (const bad of [
      null,
      [],
      'x',
      {},
      { theta: 0 },
      { theta: 0, n: 0, extra: 1 },
      { theta: 0, count: 0 },
      { theta: '0', n: 0 },
      { theta: Number.NaN, n: 0 },
      { theta: 0, n: '1' },
      { theta: 0, n: Number.POSITIVE_INFINITY },
      { theta: 0, n: -1 },
    ]) {
      expect(() => elo.deserialize(bad), JSON.stringify(bad)).toThrow(TypeError);
    }
  });

  it('rejects malformed options', () => {
    expect(() => eloMasteryModel(null as never)).toThrow(TypeError);
    expect(() => eloMasteryModel([] as never)).toThrow(TypeError);
    expect(() => eloMasteryModel('x' as never)).toThrow(TypeError);
    expect(() => eloMasteryModel({ gamma: 1 } as never)).toThrow(TypeError);
    expect(() => eloMasteryModel({ alpha: '1' } as never)).toThrow(TypeError);
    expect(() => eloMasteryModel({ beta: '1' } as never)).toThrow(TypeError);
    for (const alpha of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => eloMasteryModel({ alpha })).toThrow(RangeError);
    }
    for (const beta of [-0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => eloMasteryModel({ beta })).toThrow(RangeError);
    }
    expect(eloMasteryModel({ alpha: 0.5, beta: 0 }).params).toEqual({ alpha: 0.5, beta: 0 });
  });

  it('rejects out-of-range arguments', () => {
    const state = elo.init(SKILL);
    for (const correct of [-0.1, 1.1, Number.NaN, '1']) {
      expect(() => elo.update(state, obs(correct as number))).toThrow(RangeError);
    }
    for (const weight of [-0.1, 1.1, Number.NaN]) {
      expect(() => elo.update(state, obs(1, weight))).toThrow(RangeError);
    }
    expect(() => elo.update(state, obs(1, 1, Number.NaN))).toThrow(RangeError);
    expect(() => elo.update(state, obs(1, 1, Number.POSITIVE_INFINITY))).toThrow(RangeError);
    expect(() => elo.prior(state, Number.NaN, 1)).toThrow(RangeError);
    expect(() => elo.prior(state, 0, -1)).toThrow(RangeError);
    expect(() => elo.prior(state, 0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(elo.prior(state, 0, 0)).toEqual({ theta: 0, n: 0 });
    expect(() => elo.derive(state, Number.NaN)).toThrow(RangeError);
    expect(() => elo.expectedSuccess(state, Number.NaN)).toThrow(RangeError);
  });

  it('moves theta toward the observation and never past a bounded step (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -6, max: 6, noNaN: true }),
        fc.double({ min: 0, max: 50, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: -6, max: 6, noNaN: true }),
        (theta, n, correct, weight, difficulty) => {
          const before = { theta, n };
          const after = elo.update(before, obs(correct, weight, difficulty));
          const p = sigmoid(theta - difficulty);
          const delta = after.theta - theta;
          expect(Number.isFinite(after.theta)).toBe(true);
          expect(Math.abs(delta)).toBeLessThanOrEqual(1 / (1 + 0.05 * n) + 1e-12);
          if (weight > 0)
            expect(Math.sign(delta) * Math.sign(correct - p)).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});
