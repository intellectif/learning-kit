import { describe, expect, it } from 'vitest';
import { DAY, evidence, fail, host, item, pass, practice, run, type Step, T0 } from './fixtures.js';

// One review per sitting, and when a skill is a leech (revised in M11).

const HOUR = 3_600_000;

function review(id: string, at: number, source = pass): Step {
  return { evidence: evidence(id, id, at, source), item: item(id) };
}

function reviewsOf(steps: readonly Step[], config = {}): number {
  return run(practice(config), steps).state.skills.a?.memories.recall?.reviews ?? 0;
}

describe('one sitting is one review', () => {
  it('a success before due counts from reviewGapMs after the last review, not before', () => {
    expect(reviewsOf([review('r1', T0), review('r2', T0 + HOUR - 1)])).toBe(1);
    expect(reviewsOf([review('r1', T0), review('r2', T0 + HOUR)])).toBe(2);
  });

  it('a gap of 0 reviews every success', () => {
    expect(reviewsOf([review('r1', T0), review('r2', T0 + 1)], { reviewGapMs: 0 })).toBe(2);
  });
});

describe('a leech', () => {
  const config = { leechThreshold: 4, stagePolicyOptions: { promoteAfter: 99 } };

  it('is flagged at the threshold and again every half threshold, not between', () => {
    const steps: Step[] = [
      ...[1, 2, 3, 4].map((n) => review(`f${n}`, T0 + n * DAY, fail)),
      { host: host('u1', T0 + 5 * DAY, { kind: 'unsuspend', skillId: 'a' }) },
      review('f5', T0 + 6 * DAY, fail),
    ];
    const fifth = run(practice(config), steps);
    expect(fifth.state.skills.a?.memories.recall?.lapses).toBe(5);
    expect(fifth.state.skills.a?.suspended).toBeNull();
    const sixth = run(practice(config), [...steps, review('f6', T0 + 7 * DAY, fail)]);
    expect(sixth.state.skills.a?.suspended).toBe('leech');
  });
});
