import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { planAttempt, verifyAttemptPlan } from '../attempt-plan.js';
import {
  defineActivityType,
  getActivityTypeDescriptor,
  registerActivityType,
} from '../registry/index.js';
import { evaluate, evaluateTries } from '../scoring/index.js';
import {
  DEFAULT_ITEM_SCORING_POLICY,
  ITEM_SCORING_MAX_RETRIES,
  resolveItemScoringPolicy,
  scoreTries,
  validateItemScoringPolicy,
} from '../scoring/item-scoring.js';
import type {
  DictationData,
  FillInTheBlanksData,
  LearnerResponse,
  MultipleChoiceData,
} from '../types/activity.js';

/**
 * A scoring policy moves grades, so what is under test is mostly what it does
 * NOT do: with no policy, or an empty one, every number is the number there was
 * before policies existed. Then the arithmetic — what a hint and a try cost,
 * which try counts — and the refusals, because a setting that cannot be read
 * has no safe reading.
 */

const mc = (over: Partial<MultipleChoiceData> = {}): MultipleChoiceData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'mc-1',
  title: 'Capitals',
  question: 'Which is the capital of Portugal?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: 'Lisbon', isCorrect: true },
    { id: 'b', text: 'Porto', isCorrect: false },
  ],
  ...over,
});

const fib = (): FillInTheBlanksData => ({
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'fib-1',
  title: 'Past tense',
  passage: 'She {{b1}} home and {{b2}} dinner.',
  blanks: [
    { id: 'b1', acceptedAnswers: ['went'], hint: 'go' },
    { id: 'b2', acceptedAnswers: ['ate'], hint: 'eat' },
  ],
  scoringStrategy: 'partial',
});

const pick = (id: string, hintsRevealed?: number): LearnerResponse => ({
  type: 'multiple-choice',
  selectedOptionIds: [id],
  ...(hintsRevealed !== undefined ? { hintsRevealed } : {}),
});

describe('validateItemScoringPolicy', () => {
  it('accepts no policy, an empty one, and settings left null', () => {
    expect(validateItemScoringPolicy(undefined)).toEqual({ success: true, data: {} });
    expect(validateItemScoringPolicy(null)).toEqual({ success: true, data: {} });
    expect(validateItemScoringPolicy({})).toEqual({ success: true, data: {} });
    expect(
      validateItemScoringPolicy({
        hintPenalty: null,
        retries: null,
        retryPenalty: null,
        counts: null,
      }).success,
    ).toBe(true);
  });

  it('accepts every value a setting can take, at both ends', () => {
    for (const policy of [
      { hintPenalty: 0 },
      { hintPenalty: 1 },
      { hintPenalty: 0.1 },
      { retries: 0 },
      { retries: ITEM_SCORING_MAX_RETRIES },
      { counts: 'first' },
      { counts: 'best', retries: 2, retryPenalty: 0.25 },
      { counts: 'last', retries: 1, retryPenalty: 1 },
    ]) {
      expect(validateItemScoringPolicy(policy), JSON.stringify(policy)).toEqual({
        success: true,
        data: policy,
      });
    }
  });

  it('refuses what is not a policy', () => {
    for (const policy of [[], 'retries: 2', 3, true]) {
      expect(validateItemScoringPolicy(policy)).toEqual({
        success: false,
        issues: [{ path: '', message: 'An item scoring policy is an object of settings.' }],
      });
    }
  });

  it('refuses a misspelled setting, which would otherwise cost nothing', () => {
    const checked = validateItemScoringPolicy({ hintPenalties: 0.1 });
    expect(checked.success).toBe(false);
    expect(!checked.success && checked.issues.map((issue) => issue.path)).toEqual([
      'hintPenalties',
    ]);
  });

  it('refuses a cost outside 0 to 1, or not a number', () => {
    for (const value of [-0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '0.1', true]) {
      const checked = validateItemScoringPolicy({ hintPenalty: value });
      expect(!checked.success && checked.issues[0]?.path, String(value)).toBe('hintPenalty');
    }
  });

  it('refuses retries that are not a whole number from 0 to the limit', () => {
    for (const value of [-1, 1.5, ITEM_SCORING_MAX_RETRIES + 1, '2', Number.NaN]) {
      const checked = validateItemScoringPolicy({ retries: value });
      expect(!checked.success && checked.issues[0]?.path, String(value)).toBe('retries');
    }
  });

  it('refuses a try that counts in a way it does not know', () => {
    const checked = validateItemScoringPolicy({ counts: 'average' });
    expect(!checked.success && checked.issues[0]?.path).toBe('counts');
  });

  it('refuses a retry cost that the first try counting would never charge', () => {
    for (const policy of [
      { retries: 2, retryPenalty: 0.25 },
      { retries: 2, retryPenalty: 0.25, counts: 'first' },
      { retries: 2, retryPenalty: 0.25, counts: null },
    ]) {
      const checked = validateItemScoringPolicy(policy);
      expect(!checked.success && checked.issues.map((issue) => issue.path)).toEqual([
        'retryPenalty',
      ]);
    }
    // A retry cost of 0 charges nothing, which is what the first try counting does.
    expect(validateItemScoringPolicy({ retries: 2, retryPenalty: 0 }).success).toBe(true);
  });
});

describe('resolveItemScoringPolicy', () => {
  it('reads no policy, and an empty one, as scoring before policies existed', () => {
    const before = { hintPenalty: 0, retries: 0, retryPenalty: 0, counts: 'first' };
    expect(resolveItemScoringPolicy(undefined)).toEqual(before);
    expect(resolveItemScoringPolicy(null)).toEqual(before);
    expect(resolveItemScoringPolicy({})).toEqual(before);
    expect(DEFAULT_ITEM_SCORING_POLICY).toEqual(before);
    expect(Object.isFrozen(DEFAULT_ITEM_SCORING_POLICY)).toBe(true);
  });

  it('spells every setting out', () => {
    expect(resolveItemScoringPolicy({ hintPenalty: 0.1, retries: null })).toEqual({
      hintPenalty: 0.1,
      retries: 0,
      retryPenalty: 0,
      counts: 'first',
    });
  });

  it('throws rather than guess at a setting it cannot read', () => {
    expect(() => resolveItemScoringPolicy({ hintPenalty: '0.1' })).toThrow(RangeError);
    expect(() => resolveItemScoringPolicy({ hintPenalty: '0.1' })).toThrow(/hintPenalty/);
    expect(() => resolveItemScoringPolicy('strict')).toThrow(RangeError);
  });
});

describe('scoreTries', () => {
  it('with no policy, scores the first try exactly as its answer scored', () => {
    const result = scoreTries([
      { score: 0.5, maxScore: 1, hintsRevealed: 3 },
      { score: 1, maxScore: 1 },
    ]);
    expect(result).toEqual({
      score: 0.5,
      maxScore: 1,
      counted: 0,
      tries: [{ score: 0.5, scored: 0.5, maxScore: 1, hintsRevealed: 3, penalty: 0 }],
    });
  });

  it('charges each hint a fraction of the marks, never below zero', () => {
    const policy = { hintPenalty: 0.25 };
    expect(scoreTries([{ score: 1, maxScore: 1, hintsRevealed: 1 }], policy).score).toBe(0.75);
    expect(scoreTries([{ score: 0.5, maxScore: 1, hintsRevealed: 1 }], policy).score).toBe(0.25);
    expect(scoreTries([{ score: 0.5, maxScore: 1, hintsRevealed: 3 }], policy).score).toBe(0);
    expect(scoreTries([{ score: 0, maxScore: 1, hintsRevealed: 3 }], policy).score).toBe(0);
  });

  it('leaves no floating-point residue under a pass line the learner met', () => {
    // 0.7 - 0.2 is 0.49999999999999994 in floating point: a 0.5 pass line failed.
    expect(0.7 - 0.2).toBeLessThan(0.5);
    expect(0.85 - 0.05).toBeLessThan(0.8);
    expect(
      scoreTries([{ score: 0.7, maxScore: 1, hintsRevealed: 2 }], { hintPenalty: 0.1 }).score,
    ).toBe(0.5);
    expect(
      scoreTries([{ score: 0.85, maxScore: 1, hintsRevealed: 1 }], { hintPenalty: 0.05 }).score,
    ).toBe(0.8);
  });

  it('passes a costed score that lands on the pass line exactly', () => {
    // Through evaluate: one hint at 0.2 on a right answer is 0.8, on a 0.8 line.
    const passLine = mc({ passThreshold: 0.8 });
    expect(evaluate(passLine, pick('a', 1), { scoring: { hintPenalty: 0.2 } })).toMatchObject({
      score: 0.8,
      passed: true,
    });
    const onTheLine = mc({ passThreshold: 0.5 });
    expect(evaluate(onTheLine, pick('a', 2), { scoring: { hintPenalty: 0.25 } })).toMatchObject({
      score: 0.5,
      passed: true,
    });
  });

  it('reads a hint count it cannot read as none, as the components do', () => {
    for (const hintsRevealed of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
      expect(
        scoreTries([{ score: 1, maxScore: 1, hintsRevealed }], { hintPenalty: 0.5 }).score,
      ).toBe(1);
    }
  });

  it('counts the first try by default, whatever the later ones scored', () => {
    const tries = [
      { score: 0.5, maxScore: 1 },
      { score: 1, maxScore: 1 },
    ];
    expect(scoreTries(tries, { retries: 1 })).toMatchObject({ score: 0.5, counted: 0 });
  });

  it('counts the best try after its costs, and the earliest of two equal ones', () => {
    const policy = { retries: 3, retryPenalty: 0.25, counts: 'best' as const };
    const result = scoreTries(
      [
        { score: 0.5, maxScore: 1 }, // 0.5
        { score: 0.5, maxScore: 1 }, // 0.25
        { score: 1, maxScore: 1 }, // 0.5 — equal to the first, not better
        { score: 1, maxScore: 1, hintsRevealed: 1 }, // 0.25
      ],
      policy,
    );
    expect(result.counted).toBe(0);
    expect(result.tries.map((one) => one.scored)).toEqual([0.5, 0.25, 0.5, 0.25]);
    expect(
      scoreTries(
        [
          { score: 0, maxScore: 1 },
          { score: 1, maxScore: 1 },
        ],
        policy,
      ),
    ).toMatchObject({ score: 0.75, counted: 1 });
  });

  it('counts the last try the policy allows, even when it scored less', () => {
    const result = scoreTries(
      [
        { score: 1, maxScore: 1 },
        { score: 0, maxScore: 1 },
      ],
      { retries: 1, counts: 'last' },
    );
    expect(result).toMatchObject({ score: 0, counted: 1 });
  });

  it('believes no try past the ones the policy allows', () => {
    const tries = [
      { score: 0, maxScore: 1 },
      { score: 0.5, maxScore: 1 },
      { score: 1, maxScore: 1 },
    ];
    expect(scoreTries(tries, { retries: 1, counts: 'last' })).toMatchObject({
      score: 0.5,
      counted: 1,
    });
    expect(scoreTries(tries, { retries: 1, counts: 'last' }).tries).toHaveLength(2);
    expect(scoreTries(tries, { counts: 'best' })).toMatchObject({ score: 0, counted: 0 });
  });

  it('charges a hint on a later try from its own count, which includes the earlier ones', () => {
    const result = scoreTries(
      [
        { score: 0, maxScore: 1, hintsRevealed: 1 },
        { score: 1, maxScore: 1, hintsRevealed: 2 },
      ],
      { hintPenalty: 0.1, retries: 1, retryPenalty: 0.2, counts: 'last' },
    );
    expect(result.tries[1]).toEqual({
      score: 1,
      scored: 0.6,
      maxScore: 1,
      hintsRevealed: 2,
      penalty: 0.4,
    });
  });

  it('costs a try out of any maximum as a fraction of it', () => {
    expect(
      scoreTries([{ score: 8, maxScore: 10, hintsRevealed: 1 }], { hintPenalty: 0.1 }).score,
    ).toBe(7);
  });

  it('refuses no tries, and a try that is not a score', () => {
    expect(() => scoreTries([])).toThrow(RangeError);
    for (const bad of [
      { score: Number.NaN, maxScore: 1 },
      { score: 2, maxScore: 1 },
      { score: -0.1, maxScore: 1 },
      { score: 0, maxScore: 0 },
      { score: '1', maxScore: 1 },
    ]) {
      expect(() => scoreTries([bad as never]), JSON.stringify(bad)).toThrow(RangeError);
    }
    // The float noise a weighted grader leaves above its maximum is still a grade.
    expect(scoreTries([{ score: 1.0000000000000002, maxScore: 1 }]).score).toBe(1.0000000000000002);
  });

  it('refuses a policy it cannot read', () => {
    expect(() => scoreTries([{ score: 1, maxScore: 1 }], { retries: -1 })).toThrow(RangeError);
  });
});

describe('evaluate with a scoring policy', () => {
  it('without one, or with an empty one, is exactly evaluate as it was', () => {
    const response = pick('a', 2);
    const before = evaluate(mc(), response);
    expect(evaluate(mc(), response, {})).toEqual(before);
    expect(evaluate(mc(), response, { scoring: null })).toEqual(before);
    expect(evaluate(mc(), response, { scoring: {} })).toEqual(before);
    expect(before).toMatchObject({ status: 'scored', score: 1, passed: true });
  });

  it('charges the hints the response says were shown, and reads the pass line after it', () => {
    const outcome = evaluate(mc(), pick('a', 2), { scoring: { hintPenalty: 0.2 } });
    expect(outcome).toMatchObject({ status: 'scored', score: 0.6, passed: false });
    // The feedback and details describe the answer, which was right.
    const answer = evaluate(mc({ feedback: { correct: 'Yes', incorrect: 'No' } }), pick('a', 2), {
      scoring: { hintPenalty: 0.2 },
    });
    expect(answer).toMatchObject({ feedback: 'Yes', passed: false });
    expect(answer.status === 'scored' && answer.details.map((d) => d.outcome)).toEqual([
      'correct',
      'correct-omission',
    ]);
  });

  it('reads the pass line with the rounding it was given', () => {
    // A right answer less one hint at 0.305 is 0.695: a fail against 0.7 raw, a
    // pass once both sides are rounded half-up to two places.
    const line = mc({ passThreshold: 0.7 });
    const scoring = { hintPenalty: 0.305 };
    expect(evaluate(line, pick('a', 1), { scoring })).toMatchObject({
      score: 0.695,
      passed: false,
    });
    expect(
      evaluate(line, pick('a', 1), { scoring, rounding: { mode: 'half-up', dp: 2 } }),
    ).toMatchObject({ score: 0.695, passed: true });
    expect(
      evaluateTries(line, [pick('b'), pick('a', 1)], {
        scoring: { ...scoring, retries: 1, counts: 'last' },
        rounding: { mode: 'half-up', dp: 2 },
      }).outcome,
    ).toMatchObject({ score: 0.695, passed: true });
  });

  it('charges nothing to an answer that cost nothing', () => {
    const outcome = evaluate(mc(), pick('a'), { scoring: { hintPenalty: 0.5 } });
    expect(outcome).toEqual(evaluate(mc(), pick('a')));
  });

  it('leaves an outcome that is not a score as it is', () => {
    const written = {
      schemaVersion: '1.0',
      type: 'written-response',
      id: 'wr',
      title: 'Essay',
      prompt: 'Write.',
    } as never;
    const response = { type: 'written-response', text: 'Hi', wordCount: 1 } as LearnerResponse;
    expect(evaluate(written, response, { scoring: { hintPenalty: 0.5 } })).toEqual(
      evaluate(written, response),
    );
  });

  it('refuses a policy it cannot read, before reading the item', () => {
    expect(() => evaluate(mc(), pick('a'), { scoring: { hintPenalty: 2 } })).toThrow(RangeError);
  });
});

/** A registered scorer out of contract: 85 "out of 1" for an answer of "x". Registered once. */
function outOfContract() {
  if (getActivityTypeDescriptor('test-tries-out-of-range') === undefined) {
    registerActivityType(
      defineActivityType<{ type: string; id: string }, undefined>({
        type: 'test-tries-out-of-range',
        schema: z.looseObject({ type: z.literal('test-tries-out-of-range') }) as never,
        scoring: {
          kind: 'sync',
          score: (_data, response) => ({
            score: (response as unknown as { text: string }).text === 'x' ? 85 : 0,
            maxScore: 1,
            feedback: null,
            details: [],
          }),
        },
      }),
    );
  }
  return {
    item: { type: 'test-tries-out-of-range', id: 'odd' } as never,
    answer: (text: string) => ({ type: 'test-tries-out-of-range', text }) as never,
  };
}

describe('evaluateTries', () => {
  const policy = { retries: 2, retryPenalty: 0.25, counts: 'best' as const, hintPenalty: 0.1 };

  it('with no policy, is evaluate of the first try', () => {
    const tries = [pick('b'), pick('a')];
    expect(evaluateTries(mc(), tries)).toEqual({
      outcome: evaluate(mc(), pick('b')),
      counted: 0,
      tries: [{ score: 0, scored: 0, maxScore: 1, hintsRevealed: 0, penalty: 0 }],
    });
  });

  it('with no try at all, the question was never answered', () => {
    expect(evaluateTries(mc(), [], { scoring: policy })).toEqual({
      outcome: { status: 'deferred', reason: 'no_response_recorded', maxScore: 1 },
      counted: null,
      tries: [],
    });
  });

  it('scores the counted try: its marks, its score after its costs', () => {
    const result = evaluateTries(mc(), [pick('b'), pick('a', 1)], { scoring: policy });
    expect(result.counted).toBe(1);
    expect(result.outcome).toMatchObject({ status: 'scored', score: 0.65, passed: false });
    expect(result.outcome.status === 'scored' && result.outcome.details[0]?.outcome).toBe(
      'correct',
    );
    expect(result.tries.map((one) => one.scored)).toEqual([0, 0.65]);
  });

  it('scores a fill-in-the-blanks answer part by part, then charges its hints', () => {
    const answers = (b1: string, b2: string, hintsRevealed = 0): LearnerResponse => ({
      type: 'fill-in-the-blanks',
      answers: { b1, b2 },
      ...(hintsRevealed > 0 ? { hintsRevealed } : {}),
    });
    const result = evaluateTries(fib(), [answers('goed', 'ate'), answers('went', 'ate', 1)], {
      scoring: { retries: 1, counts: 'last', hintPenalty: 0.1 },
    });
    expect(result.tries.map((one) => [one.score, one.scored])).toEqual([
      [0.5, 0.5],
      [1, 0.9],
    ]);
    expect(result.outcome).toMatchObject({ score: 0.9, passed: true });
  });

  it('charges a dictation the word hints it already reports', () => {
    const dictation: DictationData = {
      schemaVersion: '1.0',
      type: 'dictation',
      id: 'dc-1',
      title: 'Listen',
      media: { type: 'audio', url: 'https://example.test/a.mp3' },
      transcript: 'The cat sat',
    } as DictationData;
    const outcome = evaluate(
      dictation,
      { type: 'dictation', text: 'the cat sat', hintsRevealed: 2 },
      { scoring: { hintPenalty: 0.05 } },
    );
    expect(outcome).toMatchObject({ status: 'scored', score: 0.9 });
  });

  it('believes no try past the ones the policy allows', () => {
    const result = evaluateTries(mc(), [pick('b'), pick('a')], {
      scoring: { counts: 'best' },
    });
    expect(result).toMatchObject({ counted: 0, outcome: { score: 0 } });
    expect(result.tries).toHaveLength(1);
  });

  it('does not even read a try past the allowance: one that is not a grade leaves the rest scored', () => {
    const { item, answer } = outOfContract();
    const result = evaluateTries(item, [answer('y'), answer('z'), answer('x')], {
      scoring: { retries: 1, counts: 'last' },
    });
    expect(result).toMatchObject({ counted: 1, outcome: { status: 'scored', score: 0 } });
  });

  it('gives no score where a try has none to charge', () => {
    const { item, answer } = outOfContract();
    const result = evaluateTries(item, [answer('y'), answer('x')], { scoring: policy });
    expect(result).toEqual({
      outcome: {
        status: 'unscorable',
        reason: expect.stringMatching(/^Try 2 has no grade/),
        maxScore: 1,
      },
      counted: null,
      tries: [],
    });
    expect(evaluate(item, answer('x'), { scoring: { hintPenalty: 0.1 } })).toMatchObject({
      status: 'unscorable',
    });
    // Without a policy there is nothing to charge, and evaluate is left as it was.
    expect(evaluateTries(item, [answer('x')])).toEqual({
      outcome: evaluate(item, answer('x')),
      counted: 0,
      tries: [],
    });
    expect(evaluate(item, answer('x'))).toMatchObject({ status: 'scored', score: 85 });
  });

  it('leaves an item it cannot score here as evaluate leaves it', () => {
    const redacted = { ...mc(), redacted: true } as never;
    expect(evaluateTries(redacted, [pick('a')], { scoring: policy })).toEqual({
      outcome: evaluate(redacted, pick('a')),
      counted: null,
      tries: [],
    });
  });
});

describe('planAttempt with a scoring policy', () => {
  const entries = [mc(), { ...mc(), id: 'mc-2' }];

  it('keeps the plan of a paper without one exactly as it was, planHash included', () => {
    const plain = planAttempt(entries);
    expect(planAttempt(entries, { scoring: null })).toEqual(plain);
    expect(plain).not.toHaveProperty('scoring');
    const delivered = planAttempt(entries, { delivery: { hints: false } });
    expect(planAttempt(entries, { delivery: { hints: false }, scoring: null })).toEqual(delivered);
  });

  it('records it spelled out, and in planHash', () => {
    const plan = planAttempt(entries, { scoring: { hintPenalty: 0.1 } });
    expect(plan.scoring).toEqual({
      hintPenalty: 0.1,
      retries: 0,
      retryPenalty: 0,
      counts: 'first',
    });
    expect(plan.planHash).not.toBe(planAttempt(entries).planHash);
    // Two policies, two fingerprints: the policy itself is hashed, not only its presence.
    expect(plan.planHash).not.toBe(
      planAttempt(entries, { scoring: { hintPenalty: 0.2 } }).planHash,
    );
    const delivered = { delivery: { hints: false } };
    expect(planAttempt(entries, { ...delivered, scoring: { retries: 1 } }).planHash).not.toBe(
      planAttempt(entries, { ...delivered, scoring: { retries: 2 } }).planHash,
    );
    // An empty policy is recorded too: the conditions were stated, and were the defaults.
    expect(planAttempt(entries, { scoring: {} }).scoring).toEqual(DEFAULT_ITEM_SCORING_POLICY);
  });

  it('refuses a policy it could not apply', () => {
    expect(() => planAttempt(entries, { scoring: { retries: 2, retryPenalty: 0.5 } })).toThrow(
      /scoring policy is not one to record/,
    );
  });

  it('reports a changed policy, and only when it changed', () => {
    const one = planAttempt(entries, { scoring: { hintPenalty: 0.1 } });
    const same = planAttempt(entries, { scoring: { hintPenalty: 0.1, counts: 'first' } });
    const other = planAttempt(entries, { scoring: { hintPenalty: 0.2 } });
    expect(verifyAttemptPlan(one, same)).not.toHaveProperty('scoringChanged');
    expect(verifyAttemptPlan(one, same).matches).toBe(true);
    expect(verifyAttemptPlan(one, other)).toMatchObject({ matches: false, scoringChanged: true });
    expect(verifyAttemptPlan(planAttempt(entries), one)).toMatchObject({ scoringChanged: true });
    expect(verifyAttemptPlan(planAttempt(entries), planAttempt(entries))).not.toHaveProperty(
      'scoringChanged',
    );
  });
});
