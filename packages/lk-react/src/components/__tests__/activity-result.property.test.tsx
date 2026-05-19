import type { ActivityResult, FillInTheBlanksData, MultipleChoiceData } from '@intellectif/lk-core';
import { validateXAPIStatement } from '@intellectif/lk-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { FillInTheBlanks } from '../FillInTheBlanks/FillInTheBlanks.js';
import { MultipleChoice } from '../MultipleChoice/MultipleChoice.js';

// Self-contained arbitraries: lk-core's live in its (non-exported) __tests__
// dir, so they cannot be imported across the package boundary. These mirror
// the same refinement-honouring generation (the components dev-validate, so
// invalid data would throw instead of completing).

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const tokenArb = (max = 6): fc.Arbitrary<string> =>
  fc.array(fc.constantFrom(...ALNUM), { minLength: 1, maxLength: max }).map((a) => a.join(''));
const wordArb = tokenArb(10);

/** Valid MultipleChoiceData: ≥1 correct, and single ⇒ exactly one correct. */
function arbitraryMultipleChoiceData(): fc.Arbitrary<MultipleChoiceData> {
  return fc.constantFrom('single' as const, 'multi' as const).chain((mode) =>
    fc.uniqueArray(tokenArb(), { minLength: 2, maxLength: 6 }).chain((ids) => {
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
            shuffle: fc.boolean(),
          })
          .map(
            (base) =>
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
                shuffle: base.shuffle,
              }) as MultipleChoiceData,
          ),
      );
    }),
  );
}

/** Valid FillInTheBlanksData: passage↔blank-id bijection. */
function arbitraryFillInTheBlanksData(): fc.Arbitrary<FillInTheBlanksData> {
  return fc.uniqueArray(tokenArb(), { minLength: 1, maxLength: 4 }).chain((bids) =>
    fc
      .record({
        acceptedPer: fc.array(fc.uniqueArray(wordArb, { minLength: 1, maxLength: 3 }), {
          minLength: bids.length,
          maxLength: bids.length,
        }),
        scoringStrategy: fc.constantFrom('all-or-nothing' as const, 'partial' as const),
        id: tokenArb(),
        title: wordArb,
      })
      .map(
        (base) =>
          ({
            schemaVersion: '1.0',
            type: 'fill-in-the-blanks',
            id: base.id,
            title: base.title,
            passage: `${bids.map((b) => `word {{${b}}}`).join(' ')} end`,
            blanks: bids.map((b, i) => ({
              id: b,
              acceptedAnswers: base.acceptedPer[i] as string[],
            })),
            scoringStrategy: base.scoringStrategy,
          }) as FillInTheBlanksData,
      ),
  );
}

const mcPair = arbitraryMultipleChoiceData().chain((data) =>
  fc
    .subarray(data.options.map((o) => o.id))
    .map((selectedOptionIds) => ({ data, selectedOptionIds }) as const),
);

const fibPair = arbitraryFillInTheBlanksData().chain((data) =>
  fc
    .tuple(
      ...data.blanks.map((b) =>
        fc.oneof(fc.constantFrom(...b.acceptedAnswers), fc.string(), fc.constant('')),
      ),
    )
    .map((values) => ({ data, values }) as const),
);

/** Property 10 acceptance criteria — every field structurally complete. */
function assertStructurallyComplete(r: ActivityResult): void {
  expect(typeof r.score).toBe('number');
  expect(r.score).toBeGreaterThanOrEqual(0);
  expect(r.score).toBeLessThanOrEqual(1);
  expect(r.maxScore).toBeGreaterThan(0);
  expect(typeof r.passed).toBe('boolean');
  expect(Number.isInteger(r.timeSpent)).toBe(true);
  expect(r.timeSpent).toBeGreaterThanOrEqual(0);
  expect(() => validateXAPIStatement(r.xapiStatement)).not.toThrow();
  expect(r.xapiStatement.version).toBe('1.0.3');
}

describe('onComplete payload completeness (Property 10)', () => {
  // Feature: learning-kit-sdk, Property 10: onComplete payload is structurally complete
  it('Property 10: MultipleChoice onComplete payload is structurally complete', () => {
    fc.assert(
      fc.property(mcPair, ({ data, selectedOptionIds }) => {
        const onComplete = vi.fn();
        try {
          const { container } = render(<MultipleChoice data={data} onComplete={onComplete} />);
          for (const id of selectedOptionIds) {
            const input = container.querySelector<HTMLInputElement>(`input[value="${id}"]`);
            if (input) {
              fireEvent.click(input);
            }
          }
          fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
          expect(onComplete).toHaveBeenCalledOnce();
          assertStructurallyComplete(onComplete.mock.calls[0]?.[0] as ActivityResult);
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: learning-kit-sdk, Property 10: onComplete payload is structurally complete
  it('Property 10: FillInTheBlanks onComplete payload is structurally complete', () => {
    fc.assert(
      fc.property(fibPair, ({ data, values }) => {
        const onComplete = vi.fn();
        try {
          render(<FillInTheBlanks data={data} onComplete={onComplete} />);
          const inputs = screen.getAllByRole('textbox');
          inputs.forEach((input, i) => {
            fireEvent.change(input, { target: { value: values[i] ?? '' } });
          });
          fireEvent.click(screen.getByRole('button', { name: 'Check answers' }));
          expect(onComplete).toHaveBeenCalledOnce();
          assertStructurallyComplete(onComplete.mock.calls[0]?.[0] as ActivityResult);
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 },
    );
  });
});
