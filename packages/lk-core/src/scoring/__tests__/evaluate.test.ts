import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import {
  DeferredScoringError,
  RedactedScoringError,
  UnknownActivityTypeError,
} from '../../errors.js';
import { defineActivityType, registerActivityType } from '../../registry/index.js';
import type {
  ActivityData,
  ActivityFeedback,
  ActivityType,
  FillInTheBlanksData,
  FillInTheBlanksLearnerResponse,
  ItemOutcome,
  LearnerResponse,
  MultipleChoiceData,
  MultipleChoiceLearnerResponse,
  WrittenResponseData,
  WrittenResponseLearnerResponse,
} from '../../types/activity.js';
import { computePassThreshold, DEFAULT_PASS_THRESHOLD, evaluate, score } from '../index.js';

const mc = (over: Partial<MultipleChoiceData> = {}): MultipleChoiceData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'm',
  title: 'T',
  question: 'Q?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: 'A', isCorrect: true },
    { id: 'b', text: 'B', isCorrect: false },
  ],
  ...over,
});
const mcr = (ids: string[]): MultipleChoiceLearnerResponse => ({
  type: 'multiple-choice',
  selectedOptionIds: ids,
});

const fib = (over: Partial<FillInTheBlanksData> = {}): FillInTheBlanksData => ({
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'f',
  title: 'T',
  passage: 'x {{a}} y',
  blanks: [{ id: 'a', acceptedAnswers: ['Paris'] }],
  scoringStrategy: 'partial',
  ...over,
});
const fr = (answers: Record<string, string>): FillInTheBlanksLearnerResponse => ({
  type: 'fill-in-the-blanks',
  answers,
});

const wr = (over: Partial<WrittenResponseData> = {}): WrittenResponseData => ({
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'w',
  title: 'W',
  prompt: 'Write something.',
  minWords: 3,
  maxWords: 5,
  ...over,
});
const wrr = (text: string, wordCount: number): WrittenResponseLearnerResponse => ({
  type: 'written-response',
  text,
  wordCount,
});

function asScored(outcome: ItemOutcome): Extract<ItemOutcome, { status: 'scored' }> {
  if (outcome.status !== 'scored') {
    throw new Error(`expected a scored outcome, got "${outcome.status}"`);
  }
  return outcome;
}

function asDeferred(outcome: ItemOutcome): Extract<ItemOutcome, { status: 'deferred' }> {
  if (outcome.status !== 'deferred') {
    throw new Error(`expected a deferred outcome, got "${outcome.status}"`);
  }
  return outcome;
}

function asUnscorable(outcome: ItemOutcome): Extract<ItemOutcome, { status: 'unscorable' }> {
  if (outcome.status !== 'unscorable') {
    throw new Error(`expected an unscorable outcome, got "${outcome.status}"`);
  }
  return outcome;
}

describe('DEFAULT_PASS_THRESHOLD', () => {
  it('is exported and equals 0.7', () => {
    expect(DEFAULT_PASS_THRESHOLD).toBe(0.7);
  });
});

describe('computePassThreshold()', () => {
  it('defaults to 0.7 when passThreshold is absent (boundary inclusive)', () => {
    expect(computePassThreshold(mc(), 0.7)).toBe(true);
    expect(computePassThreshold(mc(), 0.69)).toBe(false);
    expect(computePassThreshold(mc(), 1)).toBe(true);
  });

  it('honours an explicit passThreshold (boundary inclusive)', () => {
    expect(computePassThreshold(mc({ passThreshold: 0.5 }), 0.5)).toBe(true);
    expect(computePassThreshold(mc({ passThreshold: 0.5 }), 0.49)).toBe(false);
    expect(computePassThreshold(mc({ passThreshold: 1 }), 0.99)).toBe(false);
  });
});

describe('score() — authored overall feedback selection', () => {
  const feedback: ActivityFeedback = { correct: 'Well done', incorrect: 'Try again' };

  it('selects feedback.correct when passed', () => {
    const result = score('multiple-choice', mc({ feedback }), mcr(['a']));
    expect(result.passed).toBe(true);
    expect(result.feedback).toBe('Well done');
  });

  it('selects feedback.incorrect when failed', () => {
    const result = score('multiple-choice', mc({ feedback }), mcr(['b']));
    expect(result.passed).toBe(false);
    expect(result.feedback).toBe('Try again');
  });

  it('returns null when no feedback is authored', () => {
    expect(score('multiple-choice', mc(), mcr(['a'])).feedback).toBeNull();
    expect(score('multiple-choice', mc(), mcr(['b'])).feedback).toBeNull();
  });

  it('returns null when the feedback object lacks the relevant field', () => {
    const passedResult = score(
      'multiple-choice',
      mc({ feedback: { incorrect: 'Try again' } }),
      mcr(['a']),
    );
    expect(passedResult.passed).toBe(true);
    expect(passedResult.feedback).toBeNull();

    const failedResult = score(
      'multiple-choice',
      mc({ feedback: { correct: 'Well done' } }),
      mcr(['b']),
    );
    expect(failedResult.passed).toBe(false);
    expect(failedResult.feedback).toBeNull();
  });
});

describe('score() — dispatch errors', () => {
  it('throws UnknownActivityTypeError for an unregistered type', () => {
    const call = () =>
      score(
        'totally-fake' as ActivityType,
        { type: 'totally-fake' } as unknown as ActivityData,
        { type: 'totally-fake' } as unknown as LearnerResponse,
      );
    expect(call).toThrow(UnknownActivityTypeError);
    expect(call).toThrow('Activity type "totally-fake" is not registered');
  });

  it('throws DeferredScoringError for written-response', () => {
    const call = () => score('written-response', wr(), wrr('one two three', 3));
    expect(call).toThrow(DeferredScoringError);
    expect(call).toThrow('graded asynchronously');
  });
});

describe('score() — multiple-choice ScoringDetail fields', () => {
  it('writes all four outcomes, weight 1, and the deprecated correct field in one scenario', () => {
    const data = mc({
      mode: 'multi',
      scoringStrategy: 'partial',
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: false },
        { id: 'c', text: 'C', isCorrect: true },
        { id: 'd', text: 'D', isCorrect: false },
      ],
    });
    // Selected: a (correct) and b (incorrect). Unselected: c (correct), d (incorrect).
    const result = score('multiple-choice', data, mcr(['a', 'b']));

    // partial strategy: reward 1/2, penalty 1/2 => 0.
    expect(result.score).toBe(0);
    expect(result.maxScore).toBe(1);
    expect(result.passed).toBe(false);
    expect(result.details).toEqual([
      {
        itemId: 'a',
        correct: true,
        outcome: 'correct',
        learnerResponse: ['selected'],
        correctResponse: ['selected'],
        weight: 1,
      },
      {
        itemId: 'b',
        correct: false,
        outcome: 'incorrect',
        learnerResponse: ['selected'],
        correctResponse: ['not-selected'],
        weight: 1,
      },
      {
        itemId: 'c',
        correct: false,
        outcome: 'incorrect-omission',
        learnerResponse: ['not-selected'],
        correctResponse: ['selected'],
        weight: 1,
      },
      {
        itemId: 'd',
        correct: true,
        outcome: 'correct-omission',
        learnerResponse: ['not-selected'],
        correctResponse: ['not-selected'],
        weight: 1,
      },
    ]);
  });
});

describe('score() — fill-in-the-blanks ScoringDetail fields', () => {
  it('writes outcome correct/incorrect with weight 1 and copies the answer key', () => {
    const data = fib({
      passage: 'x {{a}} {{b}} y',
      blanks: [
        { id: 'a', acceptedAnswers: ['p', 'P.'] },
        { id: 'b', acceptedAnswers: ['q'] },
      ],
    });
    const result = score('fill-in-the-blanks', data, fr({ a: 'p', b: 'WRONG' }));

    expect(result.score).toBe(0.5);
    expect(result.maxScore).toBe(1);
    expect(result.passed).toBe(false);
    expect(result.details).toEqual([
      {
        itemId: 'a',
        correct: true,
        outcome: 'correct',
        learnerResponse: ['p'],
        correctResponse: ['p', 'P.'],
        weight: 1,
      },
      {
        itemId: 'b',
        correct: false,
        outcome: 'incorrect',
        learnerResponse: ['WRONG'],
        correctResponse: ['q'],
        weight: 1,
      },
    ]);
  });
});

describe('score() — fill-in-the-blanks match policy', () => {
  it('match.foldDiacritics makes "esta" match accepted "está"', () => {
    const folding = fib({
      blanks: [{ id: 'a', acceptedAnswers: ['está'], match: { foldDiacritics: true } }],
    });
    expect(score('fill-in-the-blanks', folding, fr({ a: 'esta' })).score).toBe(1);

    const strict = fib({ blanks: [{ id: 'a', acceptedAnswers: ['está'] }] });
    expect(score('fill-in-the-blanks', strict, fr({ a: 'esta' })).score).toBe(0);
  });

  it('legacy caseSensitive / trimWhitespace flags still work', () => {
    const caseSensitive = fib({
      blanks: [{ id: 'a', acceptedAnswers: ['Paris'], caseSensitive: true }],
    });
    expect(score('fill-in-the-blanks', caseSensitive, fr({ a: 'paris' })).score).toBe(0);
    expect(score('fill-in-the-blanks', caseSensitive, fr({ a: 'Paris' })).score).toBe(1);

    const noTrim = fib({
      blanks: [{ id: 'a', acceptedAnswers: ['x'], trimWhitespace: false }],
    });
    expect(score('fill-in-the-blanks', noTrim, fr({ a: ' x' })).score).toBe(0);
    expect(score('fill-in-the-blanks', noTrim, fr({ a: 'x' })).score).toBe(1);
  });

  it('match fields take precedence over the legacy flags', () => {
    const caseOverridden = fib({
      blanks: [
        {
          id: 'a',
          acceptedAnswers: ['Paris'],
          caseSensitive: true,
          match: { caseSensitive: false },
        },
      ],
    });
    expect(score('fill-in-the-blanks', caseOverridden, fr({ a: 'paris' })).score).toBe(1);

    const trimOverridden = fib({
      blanks: [{ id: 'a', acceptedAnswers: ['x'], trimWhitespace: false, match: { trim: true } }],
    });
    expect(score('fill-in-the-blanks', trimOverridden, fr({ a: '  x ' })).score).toBe(1);
  });
});

describe('evaluate() — scored path', () => {
  it('multiple-choice: status scored with the same numbers as score() and selected feedback', () => {
    const data = mc({ feedback: { correct: 'Well done', incorrect: 'Try again' } });
    const response = mcr(['a']);
    const viaScore = score('multiple-choice', data, response);
    const outcome = asScored(evaluate(data, response));

    expect(outcome.score).toBe(viaScore.score);
    expect(outcome.maxScore).toBe(viaScore.maxScore);
    expect(outcome.passed).toBe(viaScore.passed);
    expect(outcome.feedback).toBe('Well done');
    expect(outcome.feedback).toBe(viaScore.feedback);
    expect(outcome.details).toEqual(viaScore.details);
  });

  it('fill-in-the-blanks: status scored with the same numbers as score() and selected feedback', () => {
    const data = fib({ feedback: { correct: 'Well done', incorrect: 'Try again' } });
    const response = fr({ a: 'WRONG' });
    const viaScore = score('fill-in-the-blanks', data, response);
    const outcome = asScored(evaluate(data, response));

    expect(outcome.score).toBe(0);
    expect(outcome.score).toBe(viaScore.score);
    expect(outcome.maxScore).toBe(viaScore.maxScore);
    expect(outcome.passed).toBe(false);
    expect(outcome.passed).toBe(viaScore.passed);
    expect(outcome.feedback).toBe('Try again');
    expect(outcome.feedback).toBe(viaScore.feedback);
    expect(outcome.details).toEqual(viaScore.details);
  });
});

describe('evaluate() — deferred path (written-response)', () => {
  it('returns status deferred with reason and maxScore 1, and withinWordBounds true in bounds', () => {
    // 4 words, within [3, 5]; the client-supplied wordCount (999) must be ignored.
    const outcome = asDeferred(evaluate(wr(), wrr('one two three four', 999)));
    expect(outcome.reason).toBe('requires_async_grading');
    expect(outcome.maxScore).toBe(1);
    expect(outcome.partial).toEqual({ withinWordBounds: true, wordCount: 4 });
  });

  it('reports withinWordBounds false below minWords, recomputing the word count', () => {
    // 2 words < minWords 3; the flattering client count (4) must be ignored.
    const outcome = asDeferred(evaluate(wr(), wrr('one two', 4)));
    expect(outcome.partial).toEqual({ withinWordBounds: false, wordCount: 2 });
  });

  it('reports withinWordBounds false above maxWords, recomputing the word count', () => {
    // 6 words > maxWords 5; the flattering client count (5) must be ignored.
    const outcome = asDeferred(evaluate(wr(), wrr('one two three four five six', 5)));
    expect(outcome.partial).toEqual({ withinWordBounds: false, wordCount: 6 });
  });
});

describe('evaluate() — unscorable path', () => {
  it('returns status unscorable (not a throw) for an unregistered type string', () => {
    const data = { ...mc(), type: 'not-a-type' } as unknown as ActivityData;
    const outcome = asUnscorable(evaluate(data, mcr(['a'])));
    expect(outcome.reason).toBe('Activity type "not-a-type" is not registered');
    expect(outcome.maxScore).toBe(1);
  });

  it('returns status unscorable for a data object with a non-string type', () => {
    const data = { type: 42 } as unknown as ActivityData;
    const outcome = asUnscorable(evaluate(data, mcr([])));
    expect(outcome.reason).toBe('Activity type "42" is not registered');
    expect(outcome.maxScore).toBe(1);
  });
});

describe('consumer-registered types', () => {
  interface CustomSyncData {
    type: 'custom-sync';
    feedback?: ActivityFeedback;
  }
  interface CustomSyncResponse {
    type: 'custom-sync';
  }
  interface CustomDeferredData {
    type: 'custom-deferred';
  }
  interface CustomDeferredResponse {
    type: 'custom-deferred';
  }

  registerActivityType(
    defineActivityType<CustomSyncData, CustomSyncResponse>({
      type: 'custom-sync',
      schema: z.object({ type: z.literal('custom-sync') }) as unknown as z.ZodType<CustomSyncData>,
      scoring: {
        kind: 'sync',
        score: () => ({ score: 1, maxScore: 1, feedback: 'scorer feedback', details: [] }),
      },
    }),
  );
  registerActivityType(
    defineActivityType<CustomDeferredData, CustomDeferredResponse>({
      type: 'custom-deferred',
      schema: z.object({
        type: z.literal('custom-deferred'),
      }) as unknown as z.ZodType<CustomDeferredData>,
      scoring: { kind: 'deferred', reason: 'requires_async_grading' },
    }),
  );

  const customData: CustomSyncData = {
    type: 'custom-sync',
    feedback: { correct: 'authored correct', incorrect: 'authored incorrect' },
  };
  const customResponse: CustomSyncResponse = { type: 'custom-sync' };

  it('score(): a scorer-provided feedback string wins over authored overall feedback', () => {
    const result = score(
      'custom-sync' as ActivityType,
      customData as unknown as ActivityData,
      customResponse as unknown as LearnerResponse,
    );
    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.feedback).toBe('scorer feedback');
  });

  it('evaluate(): a scorer-provided feedback string wins over authored overall feedback', () => {
    const outcome = asScored(
      evaluate(customData as unknown as ActivityData, customResponse as unknown as LearnerResponse),
    );
    expect(outcome.feedback).toBe('scorer feedback');
  });

  it('evaluate(): a deferred type without a partial function omits the partial field', () => {
    const outcome = asDeferred(
      evaluate(
        { type: 'custom-deferred' } as unknown as ActivityData,
        { type: 'custom-deferred' } as unknown as LearnerResponse,
      ),
    );
    expect(outcome.reason).toBe('requires_async_grading');
    expect(outcome.maxScore).toBe(1);
    expect('partial' in outcome).toBe(false);
  });
});

describe('non-finite score guard (pre-merge review fix)', () => {
  // A scorer CAN return a non-finite score from structurally incomplete data
  // (division by zero when there are no correct options). That used to escape
  // as a real grade of NaN. These register a type whose scorer returns NaN
  // directly, to pin the guard independently of the redaction check.
  const NAN_TYPE = 'test-nan-scorer';
  registerActivityType(
    defineActivityType<{ type: string; id: string }, { type: string }>({
      type: NAN_TYPE,
      schema: z.looseObject({ type: z.literal(NAN_TYPE), id: z.string() }) as never,
      scoring: {
        kind: 'sync',
        score: () => ({ score: Number.NaN, maxScore: 1, feedback: null, details: [] }),
      },
    }),
  );

  const data = { type: NAN_TYPE, id: 'x' } as unknown as ActivityData;
  const response = { type: NAN_TYPE } as unknown as LearnerResponse;

  it('evaluate() reports unscorable instead of a NaN score', () => {
    const out = evaluate(data, response);
    expect(out.status).toBe('unscorable');
    expect(out.status === 'unscorable' && out.reason).toContain('non-finite');
  });

  it('score() throws rather than returning NaN', () => {
    expect(() => score(NAN_TYPE as ActivityType, data, response)).toThrow(RedactedScoringError);
  });
});
