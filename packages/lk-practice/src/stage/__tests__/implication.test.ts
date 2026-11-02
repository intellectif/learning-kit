import { describe, expect, it } from 'vitest';
import { implication } from '../implication.js';

describe('implication (design 8.2)', () => {
  it('follows every cell of the table', () => {
    const table = [
      // rating, e > c, e = c, e < c
      ['good', 'success', 'success', 'neutral'],
      ['easy', 'success', 'success', 'neutral'],
      ['hard', 'review', 'review', 'neutral'],
      ['again', 'neutral', 'lapse', 'lapse'],
    ] as const;
    for (const [rating, above, equal, below] of table) {
      expect(implication(rating, 1, 2), `${rating} above`).toBe(above);
      expect(implication(rating, 1, 3), `${rating} far above`).toBe(above);
      expect(implication(rating, 1, 1), `${rating} equal`).toBe(equal);
      expect(implication(rating, 1, 0), `${rating} below`).toBe(below);
    }
  });
});
