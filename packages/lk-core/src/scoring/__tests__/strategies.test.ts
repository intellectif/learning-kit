import { describe, expect, it } from 'vitest';
import { allOrNothingStrategy } from '../strategies/all-or-nothing.js';
import { partialBlankStrategy, partialStrategy } from '../strategies/partial.js';

describe('partialStrategy', () => {
  it('defines penalty as 0 when there are no distractors (totalIncorrect === 0)', () => {
    expect(partialStrategy(2, 0, 2, 0)).toBe(1);
  });

  it('applies the distractor penalty when totalIncorrect > 0', () => {
    expect(partialStrategy(1, 0, 2, 2)).toBe(0.5);
  });

  it('floors a penalty-dominant result at 0', () => {
    expect(partialStrategy(0, 2, 2, 2)).toBe(0);
  });
});

describe('partialBlankStrategy', () => {
  it('returns the correct fraction of blanks', () => {
    expect(partialBlankStrategy(1, 4)).toBe(0.25);
    expect(partialBlankStrategy(0, 3)).toBe(0);
  });
});

describe('allOrNothingStrategy', () => {
  it('is 1 only when every item is correct (empty ⇒ 1)', () => {
    expect(allOrNothingStrategy([true, true])).toBe(1);
    expect(allOrNothingStrategy([])).toBe(1);
  });

  it('is 0 when any item is incorrect', () => {
    expect(allOrNothingStrategy([true, false])).toBe(0);
  });
});
