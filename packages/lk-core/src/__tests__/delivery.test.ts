import { describe, expect, it } from 'vitest';
import { planAttempt, verifyAttemptPlan } from '../attempt-plan.js';
import {
  combineDeliveryPolicies,
  OPEN_DELIVERY_POLICY,
  resolveDeliveryPolicy,
  validateDeliveryPolicy,
} from '../delivery.js';
import type { MultipleChoiceData } from '../types/activity.js';

/**
 * A delivery policy is a set of restrictions, each defaulting to what the SDK
 * did before policies existed. What is under test: that an absent or unset
 * setting changes nothing, that a value nobody can read restricts rather than
 * allows, and that a plan records the policy without moving the fingerprint of
 * any plan made without one.
 */

const everything = {
  feedback: true,
  solutions: true,
  hints: true,
  ai: { hints: true, explanations: true },
};

describe('resolveDeliveryPolicy', () => {
  it('reads no policy, and an empty one, as the SDK’s behaviour before policies', () => {
    expect(resolveDeliveryPolicy(undefined)).toEqual(everything);
    expect(resolveDeliveryPolicy(null)).toEqual(everything);
    expect(resolveDeliveryPolicy({})).toEqual(everything);
    expect(OPEN_DELIVERY_POLICY).toEqual(everything);
  });

  it('reads a setting left null as unset, the way a database column arrives', () => {
    expect(
      resolveDeliveryPolicy({ feedback: null, hints: null, ai: { explanations: null } }),
    ).toEqual(everything);
    expect(resolveDeliveryPolicy({ ai: null })).toEqual(everything);
  });

  it('switches off exactly what it is told to', () => {
    expect(resolveDeliveryPolicy({ hints: false, ai: { explanations: false } })).toEqual({
      feedback: true,
      solutions: true,
      hints: false,
      ai: { hints: true, explanations: false },
    });
  });

  it('reads a value it cannot read as the restriction, never as permission', () => {
    // A form that posts "false", a column that stores 0: whoever wrote them
    // meant "off", and reading them as "on" would put hints on a paper whose
    // school had switched them off.
    expect(resolveDeliveryPolicy({ hints: 'false' }).hints).toBe(false);
    expect(resolveDeliveryPolicy({ hints: 0 }).hints).toBe(false);
    expect(resolveDeliveryPolicy({ hints: 'true' }).hints).toBe(false);
    expect(resolveDeliveryPolicy({ ai: { hints: 1 } }).ai.hints).toBe(false);
    expect(resolveDeliveryPolicy({ ai: 'off' }).ai).toEqual({ hints: false, explanations: false });
    expect(resolveDeliveryPolicy('exam')).toEqual({
      feedback: false,
      solutions: false,
      hints: false,
      ai: { hints: false, explanations: false },
    });
    expect(resolveDeliveryPolicy([]).feedback).toBe(false);
  });

  it('reads ai: false as both AI settings off, and ai: true as leaving them as they are', () => {
    expect(resolveDeliveryPolicy({ ai: false }).ai).toEqual({ hints: false, explanations: false });
    // `true` asks for nothing an open policy does not already allow, so it is
    // read as meant rather than as an unreadable value — which would have
    // switched off exactly what its writer asked to keep.
    expect(resolveDeliveryPolicy({ ai: true })).toEqual(everything);
    expect(resolveDeliveryPolicy({ hints: false, ai: true })).toEqual({
      ...everything,
      hints: false,
    });
    expect(validateDeliveryPolicy({ ai: false }).success).toBe(true);
    expect(validateDeliveryPolicy({ ai: true }).success).toBe(true);
  });

  it('never throws, where a learner is waiting', () => {
    for (const odd of [0, '', Number.NaN, Symbol('x'), () => {}, new Date(), { ai: [] }]) {
      expect(() => resolveDeliveryPolicy(odd)).not.toThrow();
    }
  });

  it('cannot be changed by whoever holds the open policy', () => {
    expect(Object.isFrozen(OPEN_DELIVERY_POLICY)).toBe(true);
    expect(Object.isFrozen(OPEN_DELIVERY_POLICY.ai)).toBe(true);
  });
});

describe('combineDeliveryPolicies', () => {
  it('keeps a setting on only where every policy leaves it on', () => {
    const course = { hints: false };
    const paper = { ai: { explanations: false } };
    expect(combineDeliveryPolicies(course, paper)).toEqual({
      feedback: true,
      solutions: true,
      hints: false,
      ai: { hints: true, explanations: false },
    });
    // Order does not matter, and a missing policy restricts nothing.
    expect(combineDeliveryPolicies(paper, undefined, course)).toEqual(
      combineDeliveryPolicies(course, paper),
    );
    expect(combineDeliveryPolicies()).toEqual(everything);
  });
});

describe('validateDeliveryPolicy', () => {
  it('passes a policy of booleans and nulls, and no policy at all', () => {
    expect(validateDeliveryPolicy(undefined)).toEqual({ success: true, data: {} });
    expect(validateDeliveryPolicy(null)).toEqual({ success: true, data: {} });
    const policy = { feedback: false, solutions: null, ai: { hints: false } };
    expect(validateDeliveryPolicy(policy)).toEqual({ success: true, data: policy });
  });

  it('refuses a misspelled setting, which would otherwise restrict nothing', () => {
    const checked = validateDeliveryPolicy({ hint: false });
    expect(checked.success).toBe(false);
    if (!checked.success) {
      expect(checked.issues).toEqual([
        {
          path: 'hint',
          message:
            '"hint" is not a delivery setting. The settings are feedback, solutions, hints and ai.',
        },
      ]);
    }
  });

  it('names every setting that is not a boolean, at its own path', () => {
    const checked = validateDeliveryPolicy({
      feedback: 'no',
      ai: { explanations: 0, tutor: false },
    });
    expect(checked.success).toBe(false);
    if (!checked.success) {
      expect(checked.issues.map((issue) => issue.path)).toEqual([
        'feedback',
        'ai.explanations',
        'ai.tutor',
      ]);
    }
  });

  it('refuses a policy, or an ai setting, that is not an object', () => {
    for (const odd of ['exam', 3, [], true]) {
      const checked = validateDeliveryPolicy(odd);
      expect(checked.success).toBe(false);
    }
    const checked = validateDeliveryPolicy({ ai: 'off' });
    expect(checked.success).toBe(false);
    if (!checked.success) {
      expect(checked.issues[0]?.path).toBe('ai');
    }
  });
});

const mc = (id: string): MultipleChoiceData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id,
  title: id,
  question: `${id}?`,
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: 'A', isCorrect: true },
    { id: 'b', text: 'B', isCorrect: false },
  ],
});
const paper = [mc('q1'), mc('q2')];

describe('planAttempt with a delivery policy', () => {
  it('leaves a plan made without one exactly as it was', () => {
    const without = planAttempt(paper);
    // `null` is "no policy", as it arrives from a database, not an empty one.
    const withNull = planAttempt(paper, { delivery: null });
    expect(withNull).toEqual(without);
    expect(Object.hasOwn(without, 'delivery')).toBe(false);
  });

  it('records the policy with every setting spelled out, in the fingerprint', () => {
    const without = planAttempt(paper);
    const sat = planAttempt(paper, { delivery: { hints: false } });
    expect(sat.delivery).toEqual({
      feedback: true,
      solutions: true,
      hints: false,
      ai: { hints: true, explanations: true },
    });
    // The same questions sat with hints and without are two attempts.
    expect(sat.planHash).not.toBe(without.planHash);
    expect(sat.slots).toEqual(without.slots);
    expect(sat.totalPoints).toBe(without.totalPoints);
  });

  it('fingerprints what the policy means, not how it was written', () => {
    const a = planAttempt(paper, { delivery: { hints: false, feedback: null } });
    const b = planAttempt(paper, { delivery: { ai: {}, hints: false } });
    expect(a.planHash).toBe(b.planHash);
    // An empty policy is a recorded decision to restrict nothing — not the
    // same record as no decision at all.
    expect(planAttempt(paper, { delivery: {} }).planHash).not.toBe(planAttempt(paper).planHash);
  });

  it('refuses to record a policy that would not mean what it says', () => {
    expect(() => planAttempt(paper, { delivery: { hint: false } as never })).toThrow(
      /"hint" is not a delivery setting/,
    );
    expect(() => planAttempt(paper, { delivery: { hints: 'false' } as never })).toThrow(
      /must be true, false or null/,
    );
  });
});

describe('verifyAttemptPlan and the delivery policy', () => {
  it('says nothing about a policy where neither plan has one', () => {
    const drift = verifyAttemptPlan(planAttempt(paper), planAttempt(paper));
    expect(drift.matches).toBe(true);
    expect(Object.hasOwn(drift, 'deliveryChanged')).toBe(false);
  });

  it('matches two plans under the same policy', () => {
    const drift = verifyAttemptPlan(
      planAttempt(paper, { delivery: { hints: false } }),
      planAttempt(paper, { delivery: { hints: false, solutions: null } }),
    );
    expect(drift.matches).toBe(true);
    expect(Object.hasOwn(drift, 'deliveryChanged')).toBe(false);
  });

  it('reports a policy that changed, or that one plan has and the other lacks', () => {
    const sat = planAttempt(paper, { delivery: { hints: false } });
    const changed = verifyAttemptPlan(sat, planAttempt(paper, { delivery: { hints: true } }));
    expect(changed.matches).toBe(false);
    expect(changed.deliveryChanged).toBe(true);
    // Every question is the same: the conditions are what moved.
    expect(changed.changedSlotIds).toEqual([]);

    const forgotten = verifyAttemptPlan(sat, planAttempt(paper));
    expect(forgotten.matches).toBe(false);
    expect(forgotten.deliveryChanged).toBe(true);
  });
});
