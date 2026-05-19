import fc from 'fast-check';
import type { FillInTheBlanksData, MultipleChoiceData } from '../../types/activity.js';

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');

/** Non-empty alnum token (safe as ids — no braces/whitespace for FIB passages). */
const tokenArb = (max = 6): fc.Arbitrary<string> =>
  fc.array(fc.constantFrom(...ALNUM), { minLength: 1, maxLength: max }).map((a) => a.join(''));

const wordArb = tokenArb(10);

/**
 * Valid `MultipleChoiceData` honouring BOTH refinements:
 * ≥1 correct option, and `mode:'single'` ⇒ exactly one correct.
 */
export function arbitraryMultipleChoiceData(): fc.Arbitrary<MultipleChoiceData> {
  return fc.constantFrom('single' as const, 'multi' as const).chain((mode) =>
    fc.uniqueArray(tokenArb(), { minLength: 2, maxLength: 10 }).chain((ids) => {
      const correctFlags =
        mode === 'single'
          ? fc.integer({ min: 0, max: ids.length - 1 }).map((ci) => ids.map((_, i) => i === ci))
          : fc
              .array(fc.boolean(), { minLength: ids.length, maxLength: ids.length })
              .map((bs) => (bs.some(Boolean) ? bs : bs.map((_, i) => i === 0)));
      return correctFlags.chain((flags) =>
        fc
          .record({
            texts: fc.array(wordArb, { minLength: ids.length, maxLength: ids.length }),
            scoringStrategy: fc.constantFrom('all-or-nothing' as const, 'partial' as const),
            id: tokenArb(),
            title: wordArb,
            question: wordArb,
          })
          .chain((base) =>
            fc
              .record(
                {
                  passThreshold: fc.double({ min: 0, max: 1, noNaN: true }),
                  shuffle: fc.boolean(),
                  locale: wordArb,
                  learningObjectives: fc.array(wordArb, { maxLength: 3 }),
                  difficultyLevel: fc.constantFrom(1, 2, 3, 4, 5),
                },
                { requiredKeys: [] },
              )
              .map(
                (opt) =>
                  ({
                    schemaVersion: '1.0',
                    type: 'multiple-choice',
                    id: base.id,
                    title: base.title,
                    question: base.question,
                    mode,
                    options: ids.map((id, i) => ({
                      id,
                      text: base.texts[i] as string,
                      isCorrect: flags[i] as boolean,
                    })),
                    scoringStrategy: base.scoringStrategy,
                    ...opt,
                  }) as MultipleChoiceData,
              ),
          ),
      );
    }),
  );
}

/**
 * Valid `FillInTheBlanksData` honouring the passage↔blank-id bijection
 * (each blank id appears exactly once as `{{id}}`, no stray placeholders).
 */
export function arbitraryFillInTheBlanksData(): fc.Arbitrary<FillInTheBlanksData> {
  return fc.uniqueArray(tokenArb(), { minLength: 1, maxLength: 5 }).chain((bids) =>
    fc
      .record({
        acceptedPer: fc.array(fc.uniqueArray(wordArb, { minLength: 1, maxLength: 3 }), {
          minLength: bids.length,
          maxLength: bids.length,
        }),
        casePer: fc.array(fc.option(fc.boolean(), { nil: undefined }), {
          minLength: bids.length,
          maxLength: bids.length,
        }),
        trimPer: fc.array(fc.option(fc.boolean(), { nil: undefined }), {
          minLength: bids.length,
          maxLength: bids.length,
        }),
        scoringStrategy: fc.constantFrom('all-or-nothing' as const, 'partial' as const),
        id: tokenArb(),
        title: wordArb,
      })
      .chain((base) =>
        fc
          .record(
            {
              passThreshold: fc.double({ min: 0, max: 1, noNaN: true }),
              locale: wordArb,
              learningObjectives: fc.array(wordArb, { maxLength: 3 }),
              difficultyLevel: fc.constantFrom(1, 2, 3, 4, 5),
            },
            { requiredKeys: [] },
          )
          .map(
            (opt) =>
              ({
                schemaVersion: '1.0',
                type: 'fill-in-the-blanks',
                id: base.id,
                title: base.title,
                passage: `${bids.map((b) => `word {{${b}}}`).join(' ')} end`,
                blanks: bids.map((b, i) => ({
                  id: b,
                  acceptedAnswers: base.acceptedPer[i] as string[],
                  ...(base.casePer[i] !== undefined
                    ? { caseSensitive: base.casePer[i] as boolean }
                    : {}),
                  ...(base.trimPer[i] !== undefined
                    ? { trimWhitespace: base.trimPer[i] as boolean }
                    : {}),
                })),
                scoringStrategy: base.scoringStrategy,
                ...opt,
              }) as FillInTheBlanksData,
          ),
      ),
  );
}
