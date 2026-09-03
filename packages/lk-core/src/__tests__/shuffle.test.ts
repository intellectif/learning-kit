import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hashSeed, seededShuffle } from '../shuffle.js';

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

describe('seededShuffle', () => {
  // These permutations ARE the wire contract. A stored attempt may hold
  // nothing but a seed and rely on this algorithm to rebuild the order it
  // presented. If this test fails, the change re-orders every recorded
  // attempt: it is a package major, not a refactor.
  it('reproduces the pinned permutation for a known seed (drift guard)', () => {
    expect(hashSeed('seed-1:mc-1')).toBe(44713514);
    expect(seededShuffle(LETTERS, 'seed-1:mc-1')).toEqual(['a', 'c', 'f', 'e', 'h', 'd', 'g', 'b']);
    expect(seededShuffle(LETTERS, 'attempt-42:group-1')).toEqual([
      'a',
      'e',
      'b',
      'd',
      'c',
      'g',
      'f',
      'h',
    ]);
  });

  it('returns a permutation and never mutates its input', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), fc.string(), (items, seed) => {
        const before = [...items];
        const out = seededShuffle(items, seed);
        expect(items).toEqual(before);
        expect(out).toHaveLength(items.length);
        expect([...out].sort((a, b) => a - b)).toEqual([...items].sort((a, b) => a - b));
      }),
    );
  });

  it('is deterministic: same seed, same order', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { minLength: 2 }), fc.string(), (items, seed) => {
        expect(seededShuffle(items, seed)).toEqual(seededShuffle(items, seed));
      }),
    );
  });

  it('handles empty and single-element inputs', () => {
    expect(seededShuffle([], 'x')).toEqual([]);
    expect(seededShuffle(['only'], 'x')).toEqual(['only']);
  });

  it('different seeds produce different orders', () => {
    expect(seededShuffle(LETTERS, 'seed-1:mc-1')).not.toEqual(
      seededShuffle(LETTERS, 'attempt-42:group-1'),
    );
  });

  it('defaults to version 1, so recorded attempts keep replaying', () => {
    expect(seededShuffle(LETTERS, 'seed-1:mc-1')).toEqual(
      seededShuffle(LETTERS, 'seed-1:mc-1', { version: 1 }),
    );
  });
});

/**
 * The LCG's low bits have very short periods, and `% (i+1)` reads exactly
 * those bits. Version 1 therefore cannot produce most permutations FOR ANY
 * SEED — which on a four-option exam item means a measurably better position
 * for some options than others. Version 2 takes the index from the high bits.
 */
describe('seededShuffle permutation coverage', () => {
  /** Every permutation the algorithm can reach, sampled densely over the seed space. */
  function reachable(n: number, version: 1 | 2): number {
    const items = Array.from({ length: n }, (_, i) => i);
    const seen = new Set<string>();
    for (let k = 0; k < 60_000; k += 1) {
      seen.add(seededShuffle(items, `s${k}`, { version }).join(''));
    }
    return seen.size;
  }

  it.each([
    [4, 24, 12],
    [5, 120, 60],
  ])('with %i items: v2 reaches all %i orders, v1 only %i', (n, total, v1Reach) => {
    expect(reachable(n, 1)).toBe(v1Reach);
    expect(reachable(n, 2)).toBe(total);
  });

  it('v1 biases where an option lands; v2 does not', () => {
    const positionCounts = (version: 1 | 2): number[] => {
      const counts = [0, 0, 0, 0];
      const runs = 24_000;
      for (let k = 0; k < runs; k += 1) {
        // Where does the LAST authored option end up?
        counts[seededShuffle([0, 1, 2, 3], `s${k}`, { version }).indexOf(3)] += 1;
      }
      return counts.map((c) => c / runs);
    };

    const v1 = positionCounts(1);
    // Ideal is 0.25 everywhere. v1 puts the last option first only ~8% of the
    // time and second ~42% — a five-fold spread a test-wise learner can use.
    expect(v1[0]).toBeLessThan(0.15);
    expect(v1[1]).toBeGreaterThan(0.35);

    for (const share of positionCounts(2)) {
      expect(share).toBeGreaterThan(0.22);
      expect(share).toBeLessThan(0.28);
    }
  });
});
