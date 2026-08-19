import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { ActivitySchemaError, RedactedScoringError, UnknownActivityTypeError } from '../errors.js';
import { assertRedacted, redact } from '../redact.js';
import { defineActivityType, registerActivityType } from '../registry/index.js';
import { evaluate, score } from '../scoring/index.js';
import type { MultipleChoiceData, WrittenResponseData } from '../types/activity.js';

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

  it('keeps the written-response rubric, prompt and word bounds', () => {
    const result = redact(wrData);

    expect(result.redacted).toBe(true);
    expect(result.prompt).toBe('Describe your weekend.');
    expect(result.minWords).toBe(10);
    expect(result.maxWords).toBe(100);
    expect(result).toHaveProperty('rubric');
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

  it('keeps the learner-visible rubric at reveal: after-submit too', () => {
    const result = redact(wrData, { reveal: 'after-submit' });

    expect(result).toHaveProperty('rubric');
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

describe('redact() accepts exported SDK interfaces, not just literals (pre-merge review fix)', () => {
  it('compiles and runs when passed a TYPED MultipleChoiceData, not just an object literal', () => {
    // Regression guard: redact()'s parameter used to require an index
    // signature, so every call with a declared SDK interface failed to
    // compile (TS2345). Object literals hid it — they get an implicit index
    // signature — which is why the whole suite passed while the feature was
    // uncallable from typed consumer code.
    const typed: MultipleChoiceData = {
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'typed-mc',
      title: 'Typed',
      question: 'Q?',
      mode: 'single',
      scoringStrategy: 'all-or-nothing',
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: false },
      ],
    };
    const out = redact(typed);
    expect(out.redacted).toBe(true);
    expect(JSON.stringify(out)).not.toContain('isCorrect');
  });

  it('accepts typed WrittenResponseData and keeps its rubric', () => {
    const typed: WrittenResponseData = {
      schemaVersion: '1.0',
      type: 'written-response',
      id: 'typed-wr',
      title: 'Essay',
      prompt: 'Write.',
      minWords: 10,
      maxWords: 100,
      rubric: { criteria: [{ name: 'Grammar', weight: 1 }] },
    };
    const out = redact(typed);
    expect(out.rubric).toBeDefined();
    expect(out.prompt).toBe('Write.');
  });
});

describe('scoring refuses redacted data instead of inventing a grade (pre-merge review fix)', () => {
  const full: MultipleChoiceData = {
    schemaVersion: '1.0',
    type: 'multiple-choice',
    id: 'guard-mc',
    title: 'Guard',
    question: 'Q?',
    mode: 'single',
    scoringStrategy: 'all-or-nothing',
    options: [
      { id: 'a', text: 'A', isCorrect: true },
      { id: 'b', text: 'B', isCorrect: false },
    ],
  };
  const response = { type: 'multiple-choice', selectedOptionIds: ['a'] } as const;

  it('evaluate() returns unscorable — never a NaN score', () => {
    const out = evaluate(redact(full) as never, response);
    expect(out.status).toBe('unscorable');
    // The bug this pins: it used to return { status: 'scored', score: NaN },
    // and NaN serializes to null straight into a grade column.
    expect(JSON.stringify(out)).not.toContain('NaN');
    expect(JSON.stringify(out)).not.toContain('null');
  });

  it('score() throws RedactedScoringError rather than returning a number', () => {
    expect(() => score('multiple-choice', redact(full) as never, response)).toThrow(
      RedactedScoringError,
    );
  });

  it('still scores full (un-redacted) data normally', () => {
    const out = evaluate(full, response);
    expect(out.status).toBe('scored');
    expect(out.status === 'scored' && out.score).toBe(1);
  });
});

describe('redaction serves real exam delivery (consumer-verified fixes)', () => {
  it('keeps rich-text sidecars: a redacted item must still render formatted content', () => {
    // An exam renderer reads questionHtml/passageHtml. Redaction used to drop
    // them (unclassified => removed), silently degrading every rich-formatted
    // exam question to plain text.
    const mc = redact({
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'rich-mc',
      title: 'Rich',
      question: 'Plain?',
      questionHtml: '<p>Rich <b>question</b></p>',
      mode: 'single',
      scoringStrategy: 'partial',
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: false },
      ],
    } as never);
    expect(mc.questionHtml).toBe('<p>Rich <b>question</b></p>');
    expect(() => assertRedacted(mc)).not.toThrow();

    const fib = redact({
      schemaVersion: '1.0',
      type: 'fill-in-the-blanks',
      id: 'rich-fib',
      title: 'Rich',
      passage: 'The {{b1}} sat.',
      passageHtml: '<p>The {{b1}} <i>sat</i>.</p>',
      blanks: [{ id: 'b1', acceptedAnswers: ['cat'] }],
      scoringStrategy: 'partial',
    } as never);
    expect(fib.passageHtml).toBe('<p>The {{b1}} <i>sat</i>.</p>');
    expect(JSON.stringify(fib)).not.toContain('cat');
  });

  it('ships the rubric to the learner — it says what they are graded on', () => {
    const out = redact({
      schemaVersion: '1.0',
      type: 'written-response',
      id: 'wr-rubric',
      title: 'Essay',
      prompt: 'Write.',
      minWords: 80,
      maxWords: 120,
      rubric: { label: 'CEFR B1', criteria: [{ name: 'Grammar', weight: 1.5 }] },
      feedback: { correct: 'Nice', incorrect: 'Revise' },
    } as never);
    expect(out.rubric).toEqual({ label: 'CEFR B1', criteria: [{ name: 'Grammar', weight: 1.5 }] });
    // Pass/fail feedback still must not leak before a grade exists.
    expect(out.feedback).toBeUndefined();
    expect(() => assertRedacted(out)).not.toThrow();
  });

  it('lets a deployment tighten a field the SDK ships as public', () => {
    const data = {
      schemaVersion: '1.0',
      type: 'written-response',
      id: 'wr-tight',
      title: 'Essay',
      prompt: 'Write.',
      minWords: 1,
      maxWords: 10,
      rubric: { criteria: [{ name: 'Grammar', weight: 1 }] },
    };
    const tightened = redact(data as never, { policy: { rubric: 'author-only' } });
    expect(tightened.rubric).toBeUndefined();
    expect(() => assertRedacted(tightened)).not.toThrow();
    // Default still reveals it.
    expect(redact(data as never).rubric).toBeDefined();
  });
});
