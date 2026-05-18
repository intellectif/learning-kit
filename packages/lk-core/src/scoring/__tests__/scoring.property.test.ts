import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ActivityData, FillInTheBlanksData } from '../../types/activity.js';
import { computePassThreshold, score } from '../index.js';
import {
  arbitraryFillInTheBlanksData,
  arbitraryFillInTheBlanksLearnerResponse,
  arbitraryMultipleChoiceData,
  arbitraryMultipleChoiceLearnerResponse,
} from './arbitraries.js';

const mcPair = arbitraryMultipleChoiceData().chain((data) =>
  arbitraryMultipleChoiceLearnerResponse(data).map((response) => ({ data, response }) as const),
);
const fibPair = arbitraryFillInTheBlanksData().chain((data) =>
  arbitraryFillInTheBlanksLearnerResponse(data).map((response) => ({ data, response }) as const),
);

/** Independent oracle for fill-in-the-blanks per-blank correctness (spec rules). */
function fibCorrectCount(data: FillInTheBlanksData, answers: Record<string, string>): number {
  const norm = (s: string, caseSensitive?: boolean, trimWhitespace?: boolean): string => {
    let r = s;
    if (trimWhitespace !== false) r = r.trim();
    if (caseSensitive !== true) r = r.toLowerCase();
    return r;
  };
  let correct = 0;
  for (const b of data.blanks) {
    const input = typeof answers[b.id] === 'string' ? answers[b.id] : '';
    const ni = norm(input as string, b.caseSensitive, b.trimWhitespace);
    if (b.acceptedAnswers.some((a) => norm(a, b.caseSensitive, b.trimWhitespace) === ni)) {
      correct += 1;
    }
  }
  return correct;
}

describe('Scoring engine properties', () => {
  // Feature: learning-kit-sdk, Property 1: Score is always in [0, 1]
  it('Property 1: score is always within [0, 1]', () => {
    fc.assert(
      fc.property(fc.oneof(mcPair, fibPair), ({ data, response }) => {
        const s = score(data.type, data, response).score;
        return s >= 0 && s <= 1;
      }),
      { numRuns: 100 },
    );
  });

  // Feature: learning-kit-sdk, Property 2: Scoring Engine is deterministic
  it('Property 2: scoring is deterministic', () => {
    fc.assert(
      fc.property(fc.oneof(mcPair, fibPair), ({ data, response }) => {
        const a = score(data.type, data, response);
        const b = score(data.type, data, response);
        expect(a).toEqual(b);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: learning-kit-sdk, Property 3: Partial scoring formula holds for both activity types
  it('Property 3: partial-strategy score matches the balanced formula', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          mcPair.map(({ data, response }) => ({
            data: { ...data, scoringStrategy: 'partial' as const },
            response,
          })),
          fibPair.map(({ data, response }) => ({
            data: { ...data, scoringStrategy: 'partial' as const },
            response,
          })),
        ),
        ({ data, response }) => {
          const actual = score(data.type, data, response).score;
          let expected: number;
          if (data.type === 'multiple-choice') {
            const correctIds = new Set(data.options.filter((o) => o.isCorrect).map((o) => o.id));
            const totalCorrect = correctIds.size;
            const totalIncorrect = data.options.length - totalCorrect;
            const selected = new Set(
              (response as { selectedOptionIds: string[] }).selectedOptionIds,
            );
            let cs = 0;
            let is = 0;
            for (const id of selected) {
              if (correctIds.has(id)) cs += 1;
              else is += 1;
            }
            expected = Math.max(
              0,
              cs / totalCorrect - (totalIncorrect === 0 ? 0 : is / totalIncorrect),
            );
          } else {
            const ans = (response as { answers: Record<string, string> }).answers;
            expected = fibCorrectCount(data, ans) / data.blanks.length;
          }
          return Math.abs(actual - expected) < 1e-9;
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: learning-kit-sdk, Property 4: Pass threshold is consistent
  it('Property 4: computePassThreshold is consistent (default 0.7)', () => {
    fc.assert(
      fc.property(
        arbitraryMultipleChoiceData(),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (data, s, p) => {
          const withP = { ...data, passThreshold: p } as ActivityData;
          const { passThreshold: _omit, ...withoutP } = data;
          return (
            computePassThreshold(withP, s) === s >= p &&
            computePassThreshold(withoutP as ActivityData, s) === s >= 0.7
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: learning-kit-sdk, Property 8: Blank matching is order-independent
  it('Property 8: blank correctness is independent of acceptedAnswers order', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc
            .array(fc.constantFrom(...'abcdefghij'.split('')), { minLength: 1, maxLength: 6 })
            .map((a) => a.join('')),
          { minLength: 2, maxLength: 5 },
        ),
        fc.nat(),
        (accepted, pick) => {
          const base: FillInTheBlanksData = {
            schemaVersion: '1.0',
            type: 'fill-in-the-blanks',
            id: 'a',
            title: 't',
            passage: 'q {{b}}',
            blanks: [{ id: 'b', acceptedAnswers: accepted }],
            scoringStrategy: 'partial',
          };
          const input = accepted[pick % accepted.length] as string;
          const resp = {
            type: 'fill-in-the-blanks' as const,
            answers: { b: input },
          };
          const original = score('fill-in-the-blanks', base, resp).details[0]?.correct;
          const shuffled: FillInTheBlanksData = {
            ...base,
            blanks: [{ id: 'b', acceptedAnswers: [...accepted].reverse() }],
          };
          const reversed = score('fill-in-the-blanks', shuffled, resp).details[0]?.correct;
          return original === true && reversed === true && original === reversed;
        },
      ),
      { numRuns: 100 },
    );
  });
});
