import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../config.js';
import type { Rating, StageDecision, StagePolicyOptions, StageStreak } from '../../types.js';
import { createStagePolicy, EMPTY_STREAK } from '../policy.js';

const DAY = 86_400_000;
const T0 = 1_767_225_600_000;
const DECLARATIVE = ['recognise', 'recall', 'produce', 'apply'];
const PROCEDURAL = ['example', 'complete', 'write', 'transfer'];
const DEFAULTS = defaultConfig().stagePolicyOptions as Required<StagePolicyOptions>;
const policy = createStagePolicy(DEFAULTS);

function decide(
  rating: Rating,
  at: number,
  streak: StageStreak = EMPTY_STREAK,
  current = 'recall',
  evidenceStage = current,
  ladder: readonly string[] = DECLARATIVE,
): StageDecision {
  return policy.decide({ ladder, current, evidenceStage, rating, at, streak });
}

describe('createStagePolicy', () => {
  it('names the configuration default reference', () => {
    expect({ id: policy.id, version: policy.version, params: policy.params }).toEqual(
      defaultConfig().stagePolicy,
    );
  });

  it('counts the first success and caps the due time until the next spaced one', () => {
    const first = decide('good', T0);
    expect(first).toEqual({
      effect: 'success',
      move: 'stay',
      streak: { successes: 1, firstSuccessAt: T0, lastSuccessAt: T0, lapses: 0 },
      dueCap: T0 + DAY,
    });
  });

  it('does not count a success inside the gap, and keeps the cap', () => {
    const streak = decide('good', T0).streak;
    const inside = decide('easy', T0 + DAY - 1, streak);
    expect(inside.effect).toBe('success');
    expect(inside.move).toBe('stay');
    expect(inside.streak).toEqual(streak);
    expect(inside.dueCap).toBe(T0 + DAY);
  });

  it('promotes on the second spaced success, with the streak reset', () => {
    const streak = decide('good', T0).streak;
    const second = decide('good', T0 + DAY, streak);
    expect(second).toEqual({
      effect: 'success',
      move: 'promote',
      streak: EMPTY_STREAK,
      dueCap: null,
    });
  });

  it('needs promoteAfter - 1 gaps with K = 3', () => {
    const three = createStagePolicy({ ...DEFAULTS, promoteAfter: 3 });
    const input = {
      ladder: DECLARATIVE,
      current: 'recall',
      evidenceStage: 'recall',
      rating: 'good' as const,
    };
    const a = three.decide({ ...input, at: T0, streak: EMPTY_STREAK });
    const b = three.decide({ ...input, at: T0 + DAY, streak: a.streak });
    expect(b.move).toBe('stay');
    expect(b.streak.successes).toBe(2);
    expect(b.streak.firstSuccessAt).toBe(T0);
    expect(b.dueCap).toBe(T0 + 2 * DAY);
    const c = three.decide({ ...input, at: T0 + 2 * DAY, streak: b.streak });
    expect(c.move).toBe('promote');
  });

  it('never promotes past the top stage, and stops capping there', () => {
    const top = decide('good', T0, EMPTY_STREAK, 'apply');
    const again = decide('good', T0 + DAY, top.streak, 'apply');
    expect(again.move).toBe('stay');
    expect(again.streak.successes).toBe(2);
    expect(again.dueCap).toBeNull();
    const more = decide('good', T0 + 2 * DAY, again.streak, 'apply');
    expect(more.streak.successes).toBe(3);
  });

  it('resets the successes on a lapse and demotes after two', () => {
    const streak = decide('good', T0).streak;
    const lapse = decide('again', T0 + 1, streak);
    expect(lapse).toEqual({
      effect: 'lapse',
      move: 'stay',
      streak: { successes: 0, firstSuccessAt: null, lastSuccessAt: null, lapses: 1 },
      dueCap: null,
    });
    const second = decide('again', T0 + 2, lapse.streak);
    expect(second).toEqual({ effect: 'lapse', move: 'demote', streak: EMPTY_STREAK, dueCap: null });
  });

  it('never demotes below the first stage', () => {
    const one = decide('again', T0, EMPTY_STREAK, 'recognise');
    const two = decide('again', T0 + 1, one.streak, 'recognise');
    expect(two.move).toBe('stay');
    expect(two.streak.lapses).toBe(2);
  });

  it('breaks a run of lapses with any success, counted or not', () => {
    const counted = decide('good', T0, { ...EMPTY_STREAK, lapses: 1 });
    expect(counted.streak.lapses).toBe(0);
    const base = { successes: 1, firstSuccessAt: T0, lastSuccessAt: T0, lapses: 1 };
    const inside = decide('good', T0 + 1, base);
    expect(inside.streak).toEqual({ ...base, lapses: 0 });
    const clean = decide('good', T0 + 1, { ...base, lapses: 0 });
    expect(clean.streak).toEqual({ ...base, lapses: 0 });
  });

  it('reviews a hard retrieval without changing the streak', () => {
    const base = { successes: 1, firstSuccessAt: T0, lastSuccessAt: T0, lapses: 1 };
    const hard = decide('hard', T0 + 2 * DAY, base);
    expect(hard).toEqual({ effect: 'review', move: 'stay', streak: base, dueCap: T0 + DAY });
    expect(decide('hard', T0, base, 'recall', 'produce').effect).toBe('review');
  });

  it('applies the implication rule to evidence at other stages', () => {
    // Above: a success counts at the current stage.
    expect(decide('good', T0, EMPTY_STREAK, 'recall', 'apply').streak.successes).toBe(1);
    // Above, again: neutral, no change.
    const above = decide('again', T0, EMPTY_STREAK, 'recall', 'apply');
    expect(above).toEqual({ effect: 'neutral', move: 'stay', streak: EMPTY_STREAK, dueCap: null });
    // Below, good: neutral; below, again: a lapse.
    expect(decide('good', T0, EMPTY_STREAK, 'produce', 'recall').effect).toBe('neutral');
    expect(decide('again', T0, EMPTY_STREAK, 'produce', 'recall').effect).toBe('lapse');
  });

  it('judges a task from another ladder through its equivalent stage', () => {
    // A `write` task for a declarative skill is judged at its equivalent, `produce`
    // (demand 3), passed by the caller as the evidence stage.
    const cross = decide('good', T0, EMPTY_STREAK, 'recall', 'produce');
    expect(cross.effect).toBe('success');
    const procedural = decide('again', T0, EMPTY_STREAK, 'write', 'complete', PROCEDURAL);
    expect(procedural.effect).toBe('lapse');
  });

  it('keeps a neutral streak and its cap', () => {
    const streak = decide('good', T0).streak;
    const neutral = decide('good', T0 + 3 * DAY, streak, 'recall', 'recognise');
    expect(neutral).toEqual({ effect: 'neutral', move: 'stay', streak, dueCap: T0 + DAY });
  });

  it('rejects stages off the ladder, an unknown rating and a bad time', () => {
    expect(() => decide('good', T0, EMPTY_STREAK, 'use')).toThrow(RangeError);
    expect(() => decide('good', T0, EMPTY_STREAK, 'recall', 'write')).toThrow(RangeError);
    expect(() => decide('fine' as never, T0)).toThrow(RangeError);
    expect(() => decide('good', T0 + 0.5)).toThrow(RangeError);
  });

  it('keeps the streak consistent over any sequence (property)', () => {
    const rating = fc.constantFrom<Rating>('again', 'hard', 'good', 'easy');
    const step = fc.record({ rating, gap: fc.integer({ min: 0, max: 3 * DAY }), stage: fc.nat(3) });
    fc.assert(
      fc.property(fc.array(step, { maxLength: 40 }), (steps) => {
        let current = 1;
        let streak = EMPTY_STREAK;
        let at = T0;
        for (const s of steps) {
          at += s.gap;
          const decision = policy.decide({
            ladder: DECLARATIVE,
            current: DECLARATIVE[current] as string,
            evidenceStage: DECLARATIVE[s.stage] as string,
            rating: s.rating,
            at,
            streak,
          });
          streak = decision.streak;
          if (decision.move === 'promote') current += 1;
          if (decision.move === 'demote') current -= 1;
          expect(current).toBeGreaterThanOrEqual(0);
          expect(current).toBeLessThan(DECLARATIVE.length);
          expect(streak.successes === 0).toBe(streak.lastSuccessAt === null);
          expect(streak.successes > 0 && streak.lapses > 0).toBe(false);
          if (decision.dueCap !== null)
            expect(decision.dueCap).toBe((streak.lastSuccessAt as number) + DAY);
        }
      }),
      { numRuns: 200 },
    );
  });
});
