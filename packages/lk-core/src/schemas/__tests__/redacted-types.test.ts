import { describe, expect, it } from 'vitest';
import { redact } from '../../redact.js';
import type {
  FillInTheBlanksData,
  MultipleChoiceData,
  WrittenResponseData,
} from '../../types/activity.js';
import type {
  RedactedActivity,
  RedactedFillInTheBlanksData,
  RedactedMultipleChoiceData,
  RedactedWrittenResponseData,
} from '../index.js';
import {
  RedactedFillInTheBlanksDataSchema,
  RedactedMultipleChoiceDataSchema,
  RedactedWrittenResponseDataSchema,
} from '../index.js';

const mc: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'q1',
  title: 'Capitals',
  question: 'Capital of France?',
  mode: 'single',
  scoringStrategy: 'partial',
  feedback: { correct: 'Yes', incorrect: 'No' },
  options: [
    { id: 'a', text: 'Paris', isCorrect: true, feedback: 'Right' },
    { id: 'b', text: 'Lyon', isCorrect: false },
  ],
};

const fib: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'q2',
  title: 'Sky',
  passage: 'The sky is {{c}}.',
  blanks: [{ id: 'c', acceptedAnswers: ['blue'], hint: 'a colour' }],
  scoringStrategy: 'all-or-nothing',
};

const wr: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'q3',
  title: 'Essay',
  prompt: 'Describe your holiday.',
  minWords: 10,
  maxWords: 50,
  rubric: { criteria: [{ name: 'Task', weight: 1 }] },
};

/**
 * The point of deriving these types with `z.infer` is that they cannot drift
 * from the validator. These tests pin the other half: that what `redact()`
 * actually PRODUCES satisfies the derived type. A type alone proves nothing at
 * runtime, and a hand-written interface beside a schema is exactly what went
 * stale in every consumer that wrote one.
 */
describe('derived redacted types match redact() output', () => {
  it('types a redacted multiple-choice item, with no answer key to read', () => {
    const parsed = RedactedMultipleChoiceDataSchema.parse(redact(mc));
    const typed: RedactedMultipleChoiceData = parsed;

    expect(typed.type).toBe('multiple-choice');
    expect(typed.question).toBe('Capital of France?');
    expect(typed.options.map((option) => option.text)).toEqual(['Paris', 'Lyon']);
    // The compiler has no `isCorrect` to offer here; assert it is gone at runtime too.
    expect(typed.options.every((option) => !('isCorrect' in option))).toBe(true);
    expect(typed).not.toHaveProperty('scoringStrategy');
    expect(typed).not.toHaveProperty('feedback');
  });

  it('types a redacted fill-in-the-blanks item, keeping only the hint', () => {
    const typed: RedactedFillInTheBlanksData = RedactedFillInTheBlanksDataSchema.parse(redact(fib));
    expect(typed.blanks).toEqual([{ id: 'c', hint: 'a colour' }]);
  });

  it('types a redacted written response, keeping the rubric', () => {
    const typed: RedactedWrittenResponseData = RedactedWrittenResponseDataSchema.parse(redact(wr));
    expect(typed.minWords).toBe(10);
    expect(typed.rubric?.criteria[0]?.name).toBe('Task');
  });

  it('narrows the RedactedActivity union on `type`, like ActivityData does', () => {
    const items: RedactedActivity[] = [
      RedactedMultipleChoiceDataSchema.parse(redact(mc)),
      RedactedFillInTheBlanksDataSchema.parse(redact(fib)),
      RedactedWrittenResponseDataSchema.parse(redact(wr)),
    ];

    const described = items.map((item) => {
      if (item.type === 'multiple-choice') {
        return `${item.options.length} options`;
      }
      if (item.type === 'fill-in-the-blanks') {
        return `${item.blanks.length} blanks`;
      }
      // Narrowed to the written response by elimination — no cast needed.
      return `${item.minWords}-${item.maxWords} words`;
    });

    expect(described).toEqual(['2 options', '1 blanks', '10-50 words']);
  });
});
