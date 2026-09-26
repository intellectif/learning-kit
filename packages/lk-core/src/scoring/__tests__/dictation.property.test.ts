import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { DictationData } from '../../types/activity.js';
import { editDistance } from '../dictation/edit-distance.js';
import { normalizeDictationText, preStripNormalize } from '../dictation/normalize.js';
import { alignDictation, diffDictationChars, levenshteinDistance, score } from '../index.js';
import { arbitraryDictationData } from './dictation-arbitraries.js';

const RUNS = { numRuns: 200 };

/** Plain full-matrix Wagner–Fischer over code points: the textbook definition, as the oracle. */
function naiveDistance(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  const table = Array.from({ length: left.length + 1 }, (_, i) =>
    Array.from({ length: right.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const row = table[i] as number[];
      const above = table[i - 1] as number[];
      row[j] = Math.min(
        (above[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (above[j - 1] as number) + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
  }
  return (table[left.length] as number[])[right.length] as number;
}

/**
 * Any code point, surrogate pairs included and lone surrogates not: fast-check
 * 3's `fullUnicodeString`, as its migration guide writes it for 4.
 */
const fullUnicodeString = (constraints: { maxLength: number }) =>
  fc.string({ ...constraints, unit: 'binary' });

/** Code points of the Basic Multilingual Plane, no surrogate: fast-check 3's `unicodeString`. */
const SURROGATES = 0xdfff + 1 - 0xd800;
const bmpCharacter = fc
  .integer({ min: 0, max: 0xffff - SURROGATES })
  .map((v) => String.fromCodePoint(v < 0xd800 ? v : v + SURROGATES));
const unicodeString = (constraints: { maxLength: number }) =>
  fc.string({ ...constraints, unit: bmpCharacter });

const attemptArb = fc.oneof(
  fullUnicodeString({ maxLength: 60 }),
  fc.string({ maxLength: 60 }),
  arbitraryDictationData().map((data) => data.transcript),
);

const pair = arbitraryDictationData().chain((data) =>
  attemptArb.map((text) => ({ data, response: { type: 'dictation' as const, text } })),
);

describe('Dictation scoring properties', () => {
  it('score is within [0, 1] and never NaN, and every detail score is too', () => {
    fc.assert(
      fc.property(pair, ({ data, response }) => {
        const result = score('dictation', data, response);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
        expect(Number.isNaN(result.score)).toBe(false);
        for (const detail of result.details) {
          expect(detail.score).toBeGreaterThanOrEqual(0);
          expect(detail.score).toBeLessThanOrEqual(1);
          expect(detail.itemId).toMatch(/^w\d+$/);
        }
      }),
      RUNS,
    );
  });

  it('the same data and text give byte-identical results', () => {
    fc.assert(
      fc.property(pair, ({ data, response }) => {
        const first = JSON.stringify(score('dictation', data, response));
        const second = JSON.stringify(score('dictation', data, response));
        expect(second).toBe(first);
        expect(JSON.stringify(alignDictation(data, response.text))).toBe(
          JSON.stringify(alignDictation(data, response.text)),
        );
      }),
      RUNS,
    );
  });

  it('the word pairings rebuild both normalised strings; non-equal char ops equal the edit distance', () => {
    fc.assert(
      fc.property(pair, ({ data, response }) => {
        const alignment = alignDictation(data, response.text);
        const referenceWords = alignment.words
          .filter((word) => word.status !== 'extra')
          .map((word) => word.reference);
        const attemptWords = alignment.words
          .filter((word) => word.status !== 'missing')
          .map((word) => word.attempt);
        expect(referenceWords.join(' ')).toBe(alignment.reference);
        expect(attemptWords.join(' ')).toBe(alignment.attempt);
        const ids = alignment.words
          .filter((word) => word.itemId !== undefined)
          .map((word) => word.itemId);
        expect(ids).toEqual(referenceWords.map((_, index) => `w${index + 1}`));
        const ops = diffDictationChars(alignment.reference, alignment.attempt);
        expect(ops.filter((op) => op.op !== 'equal')).toHaveLength(
          editDistance(alignment.reference, alignment.attempt),
        );
        expect(ops.map((op) => op.reference).join('')).toBe(alignment.reference);
        expect(ops.map((op) => op.attempt).join('')).toBe(alignment.attempt);
      }),
      RUNS,
    );
  });

  it('editDistance is a metric, equals a naive DP, and equals levenshteinDistance on BMP strings', () => {
    const anyString = fullUnicodeString({ maxLength: 40 });
    fc.assert(
      fc.property(anyString, anyString, anyString, (a, b, c) => {
        expect(editDistance(a, a)).toBe(0);
        expect(editDistance(a, b)).toBe(editDistance(b, a));
        expect(editDistance(a, b)).toBe(naiveDistance(a, b));
        expect(editDistance(a, c)).toBeLessThanOrEqual(editDistance(a, b) + editDistance(b, c));
        expect(editDistance(a, b) === 0).toBe(a === b);
      }),
      RUNS,
    );
    // No surrogate pair, so a code point and a code unit are the same thing —
    // and the two implementations must count alike.
    const bmp = unicodeString({ maxLength: 40 });
    fc.assert(
      fc.property(bmp, bmp, (a, b) => {
        expect(editDistance(a, b)).toBe(levenshteinDistance(a, b, Number.POSITIVE_INFINITY));
      }),
      RUNS,
    );
  });

  it('normalizeDictationText is idempotent and NFC without a tolerance; every rule target is a pre-strip fixpoint', () => {
    fc.assert(
      fc.property(fullUnicodeString({ maxLength: 80 }), (text) => {
        const once = normalizeDictationText(text);
        expect(normalizeDictationText(once)).toBe(once);
        expect(once.normalize('NFC')).toBe(once);
        expect(once).toBe(once.trim());
        expect(once).not.toMatch(/\s\s/u);
      }),
      RUNS,
    );
    // Exhaustively, over every assigned-or-not code point of the first three planes.
    for (let point = 0; point <= 0x2ffff; point += 1) {
      if (point >= 0xd800 && point <= 0xdfff) {
        continue;
      }
      const single = String.fromCodePoint(point);
      const once = normalizeDictationText(single);
      if (normalizeDictationText(once) !== once || once.normalize('NFC') !== once) {
        throw new Error(`normalisation is not stable on U+${point.toString(16)}`);
      }
    }
    fc.assert(
      fc.property(arbitraryDictationData(), (data: DictationData) => {
        for (const rule of data.tolerance?.equivalences ?? []) {
          const to = preStripNormalize(rule.to);
          expect(preStripNormalize(to)).toBe(to);
        }
      }),
      RUNS,
    );
  });
});
