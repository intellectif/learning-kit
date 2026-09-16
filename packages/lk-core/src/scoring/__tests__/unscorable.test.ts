import { describe, expect, it } from 'vitest';
import { hasGrade } from '../../grading.js';
import type { ActivityData, LearnerResponse } from '../../types/activity.js';
import { evaluate, outcomeFromUnscorable } from '../index.js';

describe('outcomeFromUnscorable()', () => {
  it('produces the unscorable arm of ItemOutcome, keeping the code', () => {
    const outcome = outcomeFromUnscorable({
      code: 'no_speech',
      reason: 'The assessor heard no speech in this recording.',
    });

    expect(outcome).toEqual({
      status: 'unscorable',
      reason: 'The assessor heard no speech in this recording.',
      maxScore: 1,
      code: 'no_speech',
    });
  });

  it('writes exactly four keys, in a stable order', () => {
    expect(Object.keys(outcomeFromUnscorable({ code: 'task_mismatch', reason: 'r' }))).toEqual([
      'status',
      'reason',
      'maxScore',
      'code',
    ]);
  });

  it('takes a gradeReadAloud result whole, and carries nothing else from it', () => {
    const result = {
      unscorable: true as const,
      code: 'locale_mismatch',
      reason: 'The assessment was made for another locale.',
    };
    const outcome = outcomeFromUnscorable(result);

    if (outcome.status !== 'unscorable') {
      throw new Error('expected an unscorable outcome');
    }
    expect('unscorable' in outcome).toBe(false);
    expect(outcome.reason).toBe(result.reason);
    expect(outcome.code).toBe('locale_mismatch');
  });

  it('copies the code and the reason verbatim, and invents neither', () => {
    const outcome = outcomeFromUnscorable({ code: '', reason: '' });

    if (outcome.status !== 'unscorable') {
      throw new Error('expected an unscorable outcome');
    }
    expect(outcome.code).toBe('');
    expect(outcome.reason).toBe('');
    expect(outcome.maxScore).toBe(1);
  });

  it('is not a grade, and carries no score to be read as a zero', () => {
    const outcome = outcomeFromUnscorable({ code: 'invalid_assessment', reason: 'r' });

    expect(hasGrade(outcome)).toBe(false);
    expect('score' in outcome).toBe(false);
    expect('passed' in outcome).toBe(false);
  });

  it('is the only writer of `code`: evaluate leaves its own unscorable outcomes without one', () => {
    const outcome = evaluate(
      { type: 'mystery' } as unknown as ActivityData,
      {
        type: 'mystery',
      } as unknown as LearnerResponse,
    );

    expect(outcome.status).toBe('unscorable');
    expect('code' in outcome).toBe(false);
  });
});
