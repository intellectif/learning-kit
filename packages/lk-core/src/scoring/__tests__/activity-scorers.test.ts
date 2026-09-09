import { describe, expect, it } from 'vitest';
import type {
  FillInTheBlanksData,
  FillInTheBlanksLearnerResponse,
  MultipleChoiceData,
  MultipleChoiceLearnerResponse,
} from '../../types/activity.js';
import { scoreFillInTheBlanks } from '../activity-scorers/fill-in-the-blanks.js';
import { scoreMultipleChoice } from '../activity-scorers/multiple-choice.js';

const mc = (over: Partial<MultipleChoiceData>): MultipleChoiceData => ({
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

describe('scoreMultipleChoice — all branches', () => {
  it('all-or-nothing single: correct / wrong / not-exactly-one / unknown id', () => {
    expect(scoreMultipleChoice(mc({}), mcr(['a'])).score).toBe(1);
    expect(scoreMultipleChoice(mc({}), mcr(['b'])).score).toBe(0);
    expect(scoreMultipleChoice(mc({}), mcr(['a', 'b'])).score).toBe(0);
    expect(scoreMultipleChoice(mc({}), mcr(['zzz'])).score).toBe(0);
  });

  it('all-or-nothing multi: exact / missing / extra', () => {
    const data = mc({
      mode: 'multi',
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: true },
        { id: 'c', text: 'C', isCorrect: false },
      ],
    });
    expect(scoreMultipleChoice(data, mcr(['a', 'b'])).score).toBe(1);
    expect(scoreMultipleChoice(data, mcr(['a'])).score).toBe(0);
    expect(scoreMultipleChoice(data, mcr(['a', 'b', 'c'])).score).toBe(0);
  });

  it('partial: correct + incorrect + unknown id, and the no-distractor case', () => {
    const data = mc({
      mode: 'multi',
      scoringStrategy: 'partial',
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: true },
        { id: 'c', text: 'C', isCorrect: false },
      ],
    });
    // Exact values, not a [0,1] range. A range assertion holds under every
    // plausible mis-handling of an id that is not on the paper — ignoring it,
    // or crediting it as correct — and crediting it lets a learner who selects
    // five options score above the maximum on a two-mark item.
    expect(scoreMultipleChoice(data, mcr(['a', 'c', 'zzz'])).score).toBe(0);
    // 1 of 2 correct, minus one wrong selection: max(0, 1/2 - 1/1) = 0.
    // Treating 'zzz' as correct would give 1; ignoring it, 0.5.
    expect(scoreMultipleChoice(data, mcr(['a', 'zzz'])).score).toBe(0);
    // An unknown id must never inflate the total past the maximum.
    expect(scoreMultipleChoice(data, mcr(['a', 'b', 'z1', 'z2', 'z3'])).score).toBeLessThanOrEqual(
      1,
    );

    const allCorrect = mc({
      mode: 'multi',
      scoringStrategy: 'partial',
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: true },
      ],
    });
    expect(scoreMultipleChoice(allCorrect, mcr(['a', 'b'])).score).toBe(1);
  });
});

const fib = (over: Partial<FillInTheBlanksData>): FillInTheBlanksData => ({
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

describe('scoreFillInTheBlanks — all branches', () => {
  it('default normalize (trim + case-insensitive) matches', () => {
    expect(scoreFillInTheBlanks(fib({}), fr({ a: '  paris ' })).score).toBe(1);
  });

  it('caseSensitive: true does not lowercase', () => {
    const data = fib({ blanks: [{ id: 'a', acceptedAnswers: ['Paris'], caseSensitive: true }] });
    expect(scoreFillInTheBlanks(data, fr({ a: 'paris' })).score).toBe(0);
    expect(scoreFillInTheBlanks(data, fr({ a: 'Paris' })).score).toBe(1);
  });

  it('trimWhitespace: false keeps surrounding spaces', () => {
    const data = fib({ blanks: [{ id: 'a', acceptedAnswers: ['x'], trimWhitespace: false }] });
    expect(scoreFillInTheBlanks(data, fr({ a: ' x' })).score).toBe(0);
    expect(scoreFillInTheBlanks(data, fr({ a: 'x' })).score).toBe(1);
  });

  it('missing answer key is treated as empty/incorrect', () => {
    expect(scoreFillInTheBlanks(fib({}), fr({})).score).toBe(0);
  });

  it('all-or-nothing strategy: all correct vs one wrong', () => {
    const data = fib({
      passage: 'x {{a}} {{b}} y',
      blanks: [
        { id: 'a', acceptedAnswers: ['p'] },
        { id: 'b', acceptedAnswers: ['q'] },
      ],
      scoringStrategy: 'all-or-nothing',
    });
    expect(scoreFillInTheBlanks(data, fr({ a: 'p', b: 'q' })).score).toBe(1);
    expect(scoreFillInTheBlanks(data, fr({ a: 'p', b: 'WRONG' })).score).toBe(0);
  });
});
