import type { ItemOutcome } from '@intellectif/lk-core';
import { describe, expect, it } from 'vitest';
import { feedbackAnnouncement } from '../delivery.js';

/**
 * The feedback region's rule, every case: the four activities that score on
 * submit say what this returns, so its table is theirs.
 */

const scored: ItemOutcome = {
  status: 'scored',
  score: 1,
  maxScore: 1,
  passed: true,
  feedback: null,
  details: [],
};
const deferred: ItemOutcome = { status: 'deferred', reason: 'requires_async_grading', maxScore: 1 };

const say = (over: Partial<Parameters<typeof feedbackAnnouncement<string>>[0]>) =>
  feedbackAnnouncement<string>({
    review: false,
    feedback: true,
    outcome: undefined,
    readBack: 'read back',
    submitted: false,
    result: null,
    received: 'received',
    ...over,
  });

describe('feedbackAnnouncement', () => {
  it('says nothing before a submit, with feedback or without', () => {
    expect(say({ feedback: true })).toBeNull();
    expect(say({ feedback: false })).toBeNull();
  });

  it('after a submit, says the result — or, without feedback, only that it was received', () => {
    expect(say({ submitted: true, result: 'result' })).toBe('result');
    expect(say({ submitted: true, result: 'result', feedback: false })).toBe('received');
  });

  it('in review, reads a grade back only with feedback, and "not graded yet" always', () => {
    expect(say({ review: true, outcome: scored })).toBe('read back');
    expect(say({ review: true, outcome: scored, feedback: false })).toBeNull();
    expect(say({ review: true, outcome: deferred, feedback: false })).toBe('read back');
    expect(say({ review: true, outcome: undefined, feedback: false })).toBe('read back');
  });

  it('in review, ignores what a live submit would say', () => {
    expect(say({ review: true, submitted: true, result: 'result', outcome: scored })).toBe(
      'read back',
    );
  });
});
