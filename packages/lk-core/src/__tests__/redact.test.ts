import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { ActivitySchemaError, UnknownActivityTypeError } from '../errors.js';
import { assertRedacted, redact } from '../redact.js';
import { defineActivityType, registerActivityType } from '../registry/index.js';

const mcData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'mc-1',
  title: 'Capitals',
  question: 'What is the capital of France?',
  mode: 'single',
  scoringStrategy: 'partial',
  feedback: { correct: 'Well done', incorrect: 'Try again' },
  vendorField: 'consumer sidecar payload',
  options: [
    { id: 'a', text: 'Paris', isCorrect: true, feedback: 'Correct!' },
    { id: 'b', text: 'Lyon', isCorrect: false, feedback: 'Not the capital.' },
  ],
};

const fibData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'fib-1',
  title: 'Sky colour',
  passage: 'The sky is {{c}}.',
  scoringStrategy: 'all-or-nothing',
  blanks: [
    {
      id: 'c',
      hint: 'a colour',
      acceptedAnswers: ['blue'],
      caseSensitive: false,
      trimWhitespace: true,
      match: { levenshtein: 1 },
      feedback: 'Nice one.',
    },
  ],
};

const wrData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'wr-1',
  title: 'Essay',
  prompt: 'Describe your weekend.',
  minWords: 10,
  maxWords: 100,
  rubric: { label: 'Writing rubric', criteria: [{ name: 'Grammar', weight: 1 }] },
  feedback: { correct: 'Good work' },
};

describe('redact() with default reveal', () => {
  it('projects multiple-choice to public fields only', () => {
    const result = redact(mcData);

    expect(result.redacted).toBe(true);
    expect(result.type).toBe('multiple-choice');
    expect(result.question).toBe('What is the capital of France?');
    expect(result.mode).toBe('single');
    // Exact option shape: id + text only — no isCorrect, no per-option feedback.
    expect(result.options).toEqual([
      { id: 'a', text: 'Paris' },
      { id: 'b', text: 'Lyon' },
    ]);
    expect(result).not.toHaveProperty('scoringStrategy');
    expect(result).not.toHaveProperty('feedback');
  });

  it('drops unknown passthrough keys (fail-closed)', () => {
    const result = redact(mcData);
    expect(result).not.toHaveProperty('vendorField');
  });

  it('produces output that satisfies assertRedacted', () => {
    expect(() => assertRedacted(redact(mcData))).not.toThrow();
    expect(() => assertRedacted(redact(fibData))).not.toThrow();
    expect(() => assertRedacted(redact(wrData))).not.toThrow();
  });

  it('projects fill-in-the-blanks blanks to id + hint and keeps the passage', () => {
    const result = redact(fibData);

    expect(result.redacted).toBe(true);
    expect(result.passage).toBe('The sky is {{c}}.');
    expect(result.blanks).toEqual([{ id: 'c', hint: 'a colour' }]);
    expect(result).not.toHaveProperty('scoringStrategy');
    expect(result).not.toHaveProperty('feedback');
  });

  it('drops the written-response rubric and keeps prompt and word bounds', () => {
    const result = redact(wrData);

    expect(result.redacted).toBe(true);
    expect(result.prompt).toBe('Describe your weekend.');
    expect(result.minWords).toBe(10);
    expect(result.maxWords).toBe(100);
    expect(result).not.toHaveProperty('rubric');
    expect(result).not.toHaveProperty('feedback');
  });
});

describe("redact() with reveal: 'after-submit'", () => {
  it('keeps answer-key fields for multiple-choice but still drops unclassified keys', () => {
    const result = redact(mcData, { reveal: 'after-submit' });

    expect(result.options).toEqual([
      { id: 'a', text: 'Paris', isCorrect: true, feedback: 'Correct!' },
      { id: 'b', text: 'Lyon', isCorrect: false, feedback: 'Not the capital.' },
    ]);
    expect(result.scoringStrategy).toBe('partial');
    expect(result.feedback).toEqual({ correct: 'Well done', incorrect: 'Try again' });
    expect(result).not.toHaveProperty('vendorField');
  });

  it('keeps acceptedAnswers for fill-in-the-blanks', () => {
    const result = redact(fibData, { reveal: 'after-submit' });

    expect(result.blanks).toEqual([
      {
        id: 'c',
        hint: 'a colour',
        acceptedAnswers: ['blue'],
        caseSensitive: false,
        trimWhitespace: true,
        match: { levenshtein: 1 },
        feedback: 'Nice one.',
      },
    ]);
  });

  it('STILL drops the author-only written-response rubric', () => {
    const result = redact(wrData, { reveal: 'after-submit' });

    expect(result).not.toHaveProperty('rubric');
    expect(result.feedback).toEqual({ correct: 'Good work' });
  });

  it('does NOT pass assertRedacted — answer-key fields violate the strict schema', () => {
    const result = redact(mcData, { reveal: 'after-submit' });
    expect(() => assertRedacted(result)).toThrow(ActivitySchemaError);
  });
});

describe('redact() error handling', () => {
  it('throws UnknownActivityTypeError for an unregistered type', () => {
    expect(() => redact({ type: 'test-unregistered-redact-x' })).toThrow(UnknownActivityTypeError);
  });

  it('throws when a registered type declares no fieldPolicy', () => {
    const noPolicyType = defineActivityType<{ type: 'test-no-policy-x' }, undefined>({
      type: 'test-no-policy-x',
      schema: z.object({ type: z.literal('test-no-policy-x') }) as unknown as z.ZodType<{
        type: 'test-no-policy-x';
      }>,
      scoring: {
        kind: 'sync',
        score: () => ({ score: 0, maxScore: 1, feedback: null, details: [] }),
      },
    });
    registerActivityType(noPolicyType);

    expect(() => redact({ type: 'test-no-policy-x' })).toThrow(
      'Activity type "test-no-policy-x" has no fieldPolicy; redact() cannot run fail-closed redaction without one.',
    );
  });
});

describe('assertRedacted', () => {
  it('throws ActivitySchemaError for non-object input', () => {
    expect(() => assertRedacted('not an object')).toThrow(ActivitySchemaError);
    expect(() => assertRedacted(null)).toThrow(ActivitySchemaError);
  });

  it('throws ActivitySchemaError when the redacted marker is missing', () => {
    expect(() => assertRedacted({ type: 'multiple-choice' })).toThrow(ActivitySchemaError);
  });

  it('throws UnknownActivityTypeError for an unregistered type', () => {
    expect(() => assertRedacted({ redacted: true, type: 'test-unregistered-redact-x' })).toThrow(
      UnknownActivityTypeError,
    );
  });

  it('accepts a valid redact() output', () => {
    const result = redact(mcData);
    expect(() => assertRedacted(result)).not.toThrow();
  });
});

describe('assertRedacted fail-closed without a redactedSchema (release-review fix)', () => {
  it('rejects a marker-bearing payload whose type registers no redactedSchema', () => {
    registerActivityType(
      defineActivityType<{ type: string; id: string }, { type: string }>({
        type: 'test-no-redacted-schema-x',
        schema: z.looseObject({
          type: z.literal('test-no-redacted-schema-x'),
          id: z.string(),
        }) as never,
        scoring: {
          kind: 'sync',
          score: () => ({ score: 1, maxScore: 1, feedback: null, details: [] }),
        },
      }),
    );
    expect(() =>
      assertRedacted({ redacted: true, type: 'test-no-redacted-schema-x', id: 'x' }),
    ).toThrow(ActivitySchemaError);
  });
});
