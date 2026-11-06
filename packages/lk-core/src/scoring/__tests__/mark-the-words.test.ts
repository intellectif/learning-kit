import { describe, expect, it } from 'vitest';
import {
  MARK_THE_WORDS_TOKENIZER,
  markableWords,
  markTargetIndices,
  markTheWordsFromMarkup,
  resolveMarkTarget,
} from '../../mark-the-words.js';
import { assertRedacted, redact } from '../../redact.js';
import { getActivityTypeDescriptor } from '../../registry/index.js';
import { validateActivity } from '../../schemas/index.js';
import type { MarkTheWordsData, MarkTheWordsLearnerResponse } from '../../types/activity.js';
import { xapiDefinitionFor } from '../../xapi/index.js';
import { evaluate, score } from '../index.js';

// Words: 0 Yesterday 1 she 2 went 3 to 4 the 5 market 6 and 7 bought 8 bread
// 9 She 10 had 11 never 12 gone 13 there 14 before 15 but 16 she 17 went 18 again
const data: MarkTheWordsData = {
  schemaVersion: '1.0',
  type: 'mark-the-words',
  id: 'mw1',
  title: 'The past',
  instructions: 'Mark every verb in the past.',
  text: 'Yesterday she went to the market and bought bread. She had never gone there before, but she went again.',
  targets: [
    { text: 'went', occurrence: 1 },
    { text: 'bought', feedback: 'Past of buy.' },
    { text: 'had never gone' },
    { text: 'went', occurrence: 2 },
  ],
  scoringStrategy: 'partial',
};

const mark = (marked: number[]): MarkTheWordsLearnerResponse => ({
  type: 'mark-the-words',
  marked,
});

const errorsOf = (item: unknown): [string, string][] => {
  const result = validateActivity('mark-the-words', item);
  return result.success ? [] : result.errors.map((error) => [error.path.join('.'), error.message]);
};

describe('the word cut', () => {
  it('is named, and cuts words around punctuation, keeping inner apostrophes and hyphens', () => {
    expect(MARK_THE_WORDS_TOKENIZER).toBe('lk-words@1');
    expect(
      markableWords("“Don't,” said the well-known café owner — in the 1960s… £145!").map(
        (word) => word.text,
      ),
    ).toEqual(["Don't", 'said', 'the', 'well-known', 'café', 'owner', 'in', 'the', '1960s', '145']);
    const [first] = markableWords('  Hi there');
    expect(first).toEqual({ index: 0, text: 'Hi', start: 2, end: 4 });
    expect(markableWords('... — !')).toEqual([]);
  });

  it('finds a target as whole words, the apostrophe aside, and names the appearance', () => {
    const words = markableWords("I don't know. I don’t care. I know.");
    expect(resolveMarkTarget(words, { text: 'know', occurrence: 2 })).toEqual({
      ok: true,
      indices: [7],
    });
    expect(resolveMarkTarget(words, { text: 'don’t care', occurrence: 2 })).toEqual({
      ok: false,
      problem: 'no-such-occurrence',
      found: 1,
    });
    expect(resolveMarkTarget(words, { text: 'don’t care' })).toEqual({ ok: true, indices: [4, 5] });
    expect(resolveMarkTarget(words, { text: "don't" })).toEqual({
      ok: false,
      problem: 'ambiguous',
      found: 2,
    });
    expect(resolveMarkTarget(words, { text: 'kno' })).toMatchObject({ problem: 'not-found' });
    expect(resolveMarkTarget(words, { text: 'Know' })).toMatchObject({ problem: 'not-found' });
    expect(resolveMarkTarget(words, { text: '!!' })).toMatchObject({ problem: 'no-words' });
    expect(resolveMarkTarget(words, { text: 7 })).toMatchObject({ problem: 'no-words' });
    expect(resolveMarkTarget(words, { text: 'know', occurrence: 3 })).toEqual({
      ok: false,
      problem: 'no-such-occurrence',
      found: 2,
    });
    expect(resolveMarkTarget(words, { text: 'know', occurrence: 1.5 })).toMatchObject({
      problem: 'no-such-occurrence',
    });
  });

  it('reads an item defensively', () => {
    expect(markTargetIndices(data)).toEqual([[2], [7], [10, 11, 12], [17]]);
    expect(markTargetIndices({ text: 3, targets: [null, { text: 'x' }] })).toEqual([[], []]);
    expect(markTargetIndices({})).toEqual([]);
  });

  it('reads starred markup, naming the appearance only where it is needed', () => {
    expect(
      markTheWordsFromMarkup('I *went* home, *had gone* out and *went* back. A \\*star\\*.'),
    ).toEqual({
      text: 'I went home, had gone out and went back. A *star*.',
      targets: [
        { text: 'went', occurrence: 1 },
        { text: 'had gone' },
        { text: 'went', occurrence: 2 },
      ],
    });
    expect(markTheWordsFromMarkup('*,* and *"quoted words"*')).toEqual({
      text: ', and "quoted words"',
      targets: [{ text: 'quoted words' }],
    });
    expect(() => markTheWordsFromMarkup('An *open star')).toThrow(/never closed/);
  });
});

describe('mark-the-words — schema guards', () => {
  it('accepts a well-formed activity', () => {
    expect(errorsOf(data)).toEqual([]);
  });

  it('refuses a text with no word, or too many', () => {
    expect(errorsOf({ ...data, text: '...' })).toEqual([['text', 'The text has no word to mark.']]);
    expect(errorsOf({ ...data, text: 'went '.repeat(1501) })[0]?.[0]).toBe('text');
  });

  it('refuses a target that falls nowhere, at the field it is about', () => {
    const targets = [
      { text: 'flew' },
      { text: '?!' },
      { text: 'went' },
      { text: 'bought', occurrence: 2 },
    ];
    expect(errorsOf({ ...data, targets }).map(([path]) => path)).toEqual([
      'targets.0.text',
      'targets.1.text',
      'targets.2.text',
      'targets.3.occurrence',
    ]);
  });

  it('refuses two targets that share a word', () => {
    const targets = [{ text: 'had never' }, { text: 'never gone' }];
    expect(errorsOf({ ...data, targets })).toEqual([
      ['targets.1', 'Two targets share a word: each word belongs to one target at most.'],
    ]);
  });

  it('refuses no targets and a fractional appearance', () => {
    expect(errorsOf({ ...data, targets: [] })).not.toEqual([]);
    expect(errorsOf({ ...data, targets: [{ text: 'went', occurrence: 1.5 }] })).not.toEqual([]);
  });
});

describe('mark-the-words — scoring', () => {
  it('finds a target only when all its words are marked, and reports each', () => {
    const result = score('mark-the-words', data, mark([2, 7, 10, 12]));
    expect(result.score).toBe(0.5);
    expect(result.details).toEqual([
      {
        itemId: 't1',
        outcome: 'correct',
        learnerResponse: ['2'],
        correctResponse: ['2'],
        weight: 1,
      },
      {
        itemId: 't2',
        outcome: 'correct',
        learnerResponse: ['7'],
        correctResponse: ['7'],
        weight: 1,
      },
      {
        itemId: 't3',
        outcome: 'incorrect',
        learnerResponse: ['10', '12'],
        correctResponse: ['10', '11', '12'],
        weight: 1,
      },
      {
        itemId: 't4',
        outcome: 'incorrect-omission',
        learnerResponse: [],
        correctResponse: ['17'],
        weight: 1,
      },
    ]);
  });

  it('charges each wrong mark a target, never below zero', () => {
    const one = score('mark-the-words', data, mark([2, 7, 10, 11, 12, 17, 0]));
    expect(one.score).toBe(0.75);
    expect(one.details.at(-1)).toEqual({
      itemId: 'w0',
      outcome: 'incorrect',
      learnerResponse: ['0'],
      correctResponse: [],
      weight: 1,
    });
    const all = Array.from({ length: 19 }, (_, word) => word);
    expect(score('mark-the-words', data, mark(all)).score).toBe(0);
  });

  it('ignores a position that names no word', () => {
    const tampered = mark([2, 2, -1, 1.5, 99, '7' as unknown as number]);
    expect(score('mark-the-words', data, tampered).score).toBe(0.25);
    expect(
      score('mark-the-words', data, { type: 'mark-the-words' } as MarkTheWordsLearnerResponse)
        .score,
    ).toBe(0);
  });

  it('gives all-or-nothing full marks only for every target and no wrong mark', () => {
    const strict = { ...data, scoringStrategy: 'all-or-nothing' as const };
    expect(score('mark-the-words', strict, mark([2, 7, 10, 11, 12, 17])).score).toBe(1);
    expect(score('mark-the-words', strict, mark([2, 7, 10, 11, 12, 17, 8])).score).toBe(0);
  });

  it('scores zero for content with no target it can find', () => {
    const broken = { ...data, targets: [] } as MarkTheWordsData;
    expect(score('mark-the-words', broken, mark([2])).score).toBe(0);
  });

  it('evaluates to a scored outcome', () => {
    expect(evaluate(data, mark([2, 7, 10, 11, 12, 17]))).toMatchObject({
      status: 'scored',
      score: 1,
      passed: true,
    });
  });

  it('counts a response as answered once a word is marked', () => {
    const descriptor = getActivityTypeDescriptor('mark-the-words');
    expect(descriptor?.isAnswered?.(mark([]) as never)).toBe(false);
    expect(descriptor?.isAnswered?.(mark([3]) as never)).toBe(true);
    expect(descriptor?.isAnswered?.(undefined as never)).toBe(false);
  });
});

describe('mark-the-words — redaction and interop', () => {
  it('keeps the text and removes every target', () => {
    const projected = redact(data, { reveal: 'none' });
    expect(() => assertRedacted(projected)).not.toThrow();
    expect(projected).toEqual({
      redacted: true,
      schemaVersion: '1.0',
      type: 'mark-the-words',
      id: 'mw1',
      title: 'The past',
      instructions: 'Mark every verb in the past.',
      text: data.text,
    });
    expect(() => assertRedacted({ ...projected, targets: data.targets })).toThrow();
  });

  it('publishes the xAPI choice pattern of every target word', () => {
    expect(xapiDefinitionFor(data)).toMatchObject({
      interactionType: 'choice',
      correctResponsesPattern: ['2[,]7[,]10[,]11[,]12[,]17'],
    });
  });
});
