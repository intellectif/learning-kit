import type { GradeRecord } from '@intellectif/lk-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  fractionOfGrade,
  percentOfGrade,
  readAssessResult,
  readDimensions,
  readEvidence,
  readGrade,
  readOutcome,
} from '../read-grade.js';

const grade: GradeRecord = {
  score: 0.82,
  maxScore: 1,
  passed: true,
  feedback: 'Clear and steady.',
  criteria: [
    { name: 'accuracy', score: 88, maxScore: 100, weight: 3 },
    { name: 'fluency', score: 72, maxScore: 100, weight: 1 },
  ],
  details: [
    {
      itemId: 'w1',
      correct: true,
      outcome: 'correct',
      learnerResponse: 'the',
      correctResponse: 'the',
      weight: 1,
      score: 0.95,
    },
  ],
};

const with_ = (over: Record<string, unknown>): unknown => ({ ...grade, ...over });

describe('readGrade', () => {
  it('copies a well-formed grade, keeping only what is read', () => {
    const read = readGrade({ ...grade, rationale: 'kept by nobody', criteria: grade.criteria });
    expect(read).toEqual({
      score: 0.82,
      maxScore: 1,
      passed: true,
      feedback: 'Clear and steady.',
      // `weight` is not read by anything that shows a criterion.
      criteria: [
        { name: 'accuracy', score: 88, maxScore: 100 },
        { name: 'fluency', score: 72, maxScore: 100 },
      ],
      details: grade.details,
    });
    expect(read).not.toBe(grade);
  });

  it.each([
    ['a numeric string for the score', { score: '82', maxScore: 100 }],
    ['a numeric string for the maximum', { score: 82, maxScore: '100' }],
    ['no maximum', { maxScore: null }],
    ['a maximum of 0', { maxScore: 0 }],
    ['a negative maximum', { maxScore: -1 }],
    ['a score of NaN', { score: Number.NaN }],
    ['an infinite score', { score: Number.POSITIVE_INFINITY }],
    ['an infinite maximum', { maxScore: Number.POSITIVE_INFINITY }],
    ['a negative score', { score: -0.1 }],
    ['a score above its maximum', { score: 82, maxScore: 1 }],
    ['no score', { score: null }],
    ['a pass verdict of null', { passed: null }],
    ['a pass verdict of "true"', { passed: 'true' }],
    ['no pass verdict', { passed: undefined }],
  ])('refuses a grade with %s', (_shape, over) => {
    expect(readGrade(with_(over))).toBeNull();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'graded'],
    ['an array', [grade]],
  ])('refuses %s in place of a grade', (_shape, value) => {
    expect(readGrade(value)).toBeNull();
  });

  it('reads a perfect score a summing grader overshot by a hair as its maximum', () => {
    const read = readGrade(with_({ score: 1.0000000000000002, maxScore: 1 }));
    expect(read?.score).toBe(1);
    expect(readGrade(with_({ score: 1.001, maxScore: 1 }))).toBeNull();
  });

  it.each([
    ['an object', { en: 'Good' }],
    ['an empty object', {}],
    ['an array', ['Good']],
    ['a number', 42],
  ])('reads feedback that is %s as no feedback, and keeps the grade', (_shape, feedback) => {
    expect(readGrade(with_({ feedback }))).toMatchObject({ score: 0.82, feedback: null });
  });

  it.each([
    ['null', null],
    ['a string', 'broken'],
    ['an object', { accuracy: 88 }],
  ])('reads criteria that are %s as no criteria', (_shape, criteria) => {
    const read = readGrade(with_({ criteria }));
    expect(read).not.toBeNull();
    expect(read).not.toHaveProperty('criteria');
  });

  it('keeps each well-formed criterion and drops each one it cannot read', () => {
    const read = readGrade(
      with_({
        criteria: [
          null,
          { name: 'accuracy', score: 88, maxScore: 100 },
          { name: 'fluency', score: Number.NaN, maxScore: 100 },
          { name: 'completeness', score: '90', maxScore: 100 },
          { name: 'prosody', score: 70, maxScore: '100' },
          // `maxScore` defaults to 1, so 88 of it is not a score.
          { name: 'overall', score: 88, maxScore: null },
          { score: 1 },
          { name: 'fluency', notApplicable: 'yes' },
          { name: 'fluency', notApplicable: true, score: null },
        ],
      }),
    );
    expect(read?.criteria).toEqual([
      { name: 'accuracy', score: 88, maxScore: 100 },
      { name: 'fluency', notApplicable: true },
    ]);
  });

  it('reads the word marks whole or not at all', () => {
    const [mark] = grade.details ?? [];
    const second = { ...mark, itemId: 'w2' };
    expect(readGrade(with_({ details: [mark, second] }))?.details).toHaveLength(2);
    // An absent optional written as null is absent, not malformed.
    expect(
      readGrade(with_({ details: [{ ...mark, outcome: null, weight: null, score: null }] }))
        ?.details,
    ).toEqual([
      {
        itemId: 'w1',
        correct: true,
        learnerResponse: 'the',
        correctResponse: 'the',
      },
    ]);
    for (const broken of [
      null,
      { ...mark, correctResponse: {} },
      { ...mark, learnerResponse: null },
      { ...mark, learnerResponse: ['the', 3] },
      { ...mark, correct: 'yes' },
      { ...mark, outcome: 'nearly' },
      { ...mark, score: '0.9' },
      { ...mark, score: Number.NaN },
      { ...mark, score: 95 },
      { ...mark, weight: Number.POSITIVE_INFINITY },
    ]) {
      const read = readGrade(with_({ details: [mark, broken, second] }));
      expect(read).not.toBeNull();
      expect(read).not.toHaveProperty('details');
    }
  });

  it('refuses a grade whose getter throws, rather than throwing', () => {
    const hostile = new Proxy(
      { ...grade },
      {
        get(target, key) {
          if (key === 'passed') {
            throw new Error('the getter threw');
          }
          return Reflect.get(target, key);
        },
      },
    );
    expect(readGrade(hostile)).toBeNull();
  });

  it('gives a fraction in 0..1 and a whole percentage in 0..100', () => {
    const points = readGrade(with_({ score: 82, maxScore: 100 }));
    expect(points).not.toBeNull();
    if (points !== null) {
      expect(fractionOfGrade(points)).toBeCloseTo(0.82, 10);
      expect(percentOfGrade(points)).toBe(82);
    }
  });

  it('holds its own contract for any value at all, and reads its own output back unchanged', () => {
    const json = fc.letrec<{ value: unknown }>((tie) => ({
      value: fc.oneof(
        { depthSize: 'small' },
        fc.constant(null),
        fc.boolean(),
        fc.double(),
        fc.integer({ min: -200, max: 200 }),
        fc.constantFrom('100', '0.5', 'NaN', ''),
        fc.array(tie('value'), { maxLength: 3 }),
        fc.dictionary(fc.string({ maxLength: 4 }), tie('value'), { maxKeys: 3 }),
      ),
    })).value;
    const field = <T>(valid: fc.Arbitrary<T>) =>
      fc.oneof({ weight: 3, arbitrary: valid }, { weight: 1, arbitrary: json });
    const candidate = fc.oneof(
      json,
      fc.record(
        {
          score: field(
            fc.oneof(fc.double({ min: 0, max: 100 }), fc.integer({ min: -5, max: 105 })),
          ),
          maxScore: field(fc.constantFrom(1, 100, 0, -1)),
          passed: field(fc.boolean()),
          feedback: field(fc.string({ maxLength: 5 })),
          criteria: field(
            fc.array(
              fc.record(
                {
                  name: field(fc.constantFrom('accuracy', 'fluency')),
                  score: field(fc.double({ min: -1, max: 101 })),
                  maxScore: field(fc.constantFrom(1, 100)),
                  notApplicable: field(fc.boolean()),
                },
                { requiredKeys: [] },
              ),
              { maxLength: 3 },
            ),
          ),
          details: field(fc.array(json, { maxLength: 2 })),
        },
        { requiredKeys: [] },
      ),
    );
    fc.assert(
      fc.property(candidate, (value) => {
        const read = readGrade(value);
        if (read === null) {
          return;
        }
        expect(Number.isFinite(read.score) && Number.isFinite(read.maxScore)).toBe(true);
        expect(read.maxScore).toBeGreaterThan(0);
        expect(read.score).toBeGreaterThanOrEqual(0);
        expect(read.score).toBeLessThanOrEqual(read.maxScore);
        expect(typeof read.passed).toBe('boolean');
        expect(read.feedback === null || typeof read.feedback === 'string').toBe(true);
        const percent = percentOfGrade(read);
        expect(Number.isInteger(percent) && percent >= 0 && percent <= 100).toBe(true);
        for (const row of readDimensions(null, read)) {
          if (row.percent !== undefined) {
            expect(Number.isInteger(row.percent) && row.percent >= 0 && row.percent <= 100).toBe(
              true,
            );
          }
        }
        expect(readGrade(read)).toEqual(read);
      }),
      { numRuns: 2000 },
    );
  });
});

describe('readOutcome', () => {
  const graded = {
    status: 'graded',
    grade,
    score: grade.score,
    maxScore: grade.maxScore,
    passed: grade.passed,
    feedback: grade.feedback,
  };

  it('reads nothing sent, null included, as no outcome', () => {
    expect(readOutcome(undefined)).toBeUndefined();
    expect(readOutcome(null)).toBeUndefined();
  });

  it('reads a graded outcome through its grade', () => {
    expect(readOutcome(graded)).toMatchObject({
      kind: 'graded',
      status: 'graded',
      grade: { score: 0.82, feedback: 'Clear and steady.' },
    });
  });

  it('refuses a graded outcome whose own copy of the numbers is corrupt, or whose grade is', () => {
    expect(readOutcome({ ...graded, score: 'eighty-two', passed: 'yes' })).toEqual({
      kind: 'unreadable',
      status: 'graded',
    });
    expect(readOutcome({ ...graded, grade: { ...grade, score: null } })).toEqual({
      kind: 'unreadable',
      status: 'graded',
    });
    expect(readOutcome({ ...graded, grade: null })).toEqual({
      kind: 'unreadable',
      status: 'graded',
    });
  });

  it('reads a scored outcome as its own grade', () => {
    const scored = { status: 'scored', score: 1, maxScore: 2, passed: false, feedback: null };
    expect(readOutcome(scored)).toMatchObject({
      kind: 'graded',
      status: 'scored',
      grade: { score: 1, maxScore: 2, passed: false },
    });
    expect(readOutcome({ ...scored, score: 3 })).toEqual({ kind: 'unreadable', status: 'scored' });
  });

  it('reads the deferred and unscorable states, and a code only when it is a string', () => {
    expect(readOutcome({ status: 'deferred', maxScore: 1, reason: 'x' })).toEqual({
      kind: 'deferred',
    });
    expect(readOutcome({ status: 'unscorable', code: 'no_speech' })).toEqual({
      kind: 'unscorable',
      code: 'no_speech',
    });
    expect(readOutcome({ status: 'unscorable', code: 12 })).toEqual({
      kind: 'unscorable',
      code: undefined,
    });
  });

  it.each([
    ['a status nobody named', { status: 'pending' }],
    ['no status', { score: 1 }],
    ['a number', 42],
    ['an array', [graded]],
  ])('refuses %s', (_shape, value) => {
    expect(readOutcome(value)).toEqual({ kind: 'unreadable', status: undefined });
  });
});

describe('readAssessResult', () => {
  const evidence = { status: 'assessed', recognizedText: 'the weather' };

  it('reads a graded result: its grade, its evidence and its recognised text', () => {
    expect(readAssessResult({ status: 'graded', grade, assessment: evidence })).toMatchObject({
      status: 'graded',
      grade: { score: 0.82 },
      assessment: evidence,
      recognizedText: 'the weather',
    });
  });

  it('reads each half of a graded result on its own', () => {
    const ungraded = readAssessResult({ status: 'graded', grade: null, assessment: evidence });
    expect(ungraded).toMatchObject({ grade: null, assessment: evidence });
    expect(readAssessResult({ status: 'graded', grade, assessment: null })).toMatchObject({
      grade: { score: 0.82 },
      assessment: null,
      recognizedText: undefined,
    });
    expect(
      readAssessResult({ status: 'graded', grade, assessment: { recognizedText: 42 } }),
    ).toMatchObject({ recognizedText: undefined });
  });

  it('offers a retry only for a retryable that is true', () => {
    expect(readAssessResult({ status: 'failed', retryable: true })).toEqual({
      status: 'failed',
      retryable: true,
    });
    for (const retryable of ['true', 1, null, undefined]) {
      expect(readAssessResult({ status: 'failed', retryable })).toEqual({
        status: 'failed',
        retryable: false,
      });
    }
  });

  it('reads an unscorable code only when it is a string', () => {
    expect(readAssessResult({ status: 'unscorable', code: 'no_speech' })).toEqual({
      status: 'unscorable',
      code: 'no_speech',
    });
    expect(readAssessResult({ status: 'unscorable', code: {} })).toEqual({
      status: 'unscorable',
      code: undefined,
    });
  });

  it.each([
    ['null', null],
    ['a number', 42],
    ['a status nobody named', { status: 'done', grade }],
    ['an empty object', {}],
  ])('reads %s as a judgement with nothing in it', (_shape, value) => {
    expect(readAssessResult(value)).toEqual({
      status: 'graded',
      grade: null,
      assessment: null,
      recognizedText: undefined,
    });
  });

  it('keeps the grade when the evidence throws on being read', () => {
    const hostile = new Proxy(
      { ...evidence },
      {
        get(target, key) {
          if (key === 'recognizedText') {
            throw new Error('the getter threw');
          }
          return Reflect.get(target, key);
        },
      },
    );
    expect(readAssessResult({ status: 'graded', grade, assessment: hostile })).toMatchObject({
      grade: { score: 0.82 },
      recognizedText: undefined,
    });
  });
});

describe('readEvidence', () => {
  it('passes an object on and nothing else', () => {
    expect(readEvidence({ status: 'assessed' })).not.toBeNull();
    for (const value of [null, undefined, 42, 'x', []]) {
      expect(readEvidence(value)).toBeNull();
    }
  });
});

describe('readDimensions', () => {
  const read = readGrade(grade);

  it('reads the grade’s criteria when it has any, and never mixes in the evidence', () => {
    expect(readDimensions({ scores: { completeness: 100 } }, read)).toEqual([
      { dimension: 'accuracy', percent: 88 },
      { dimension: 'fluency', percent: 72 },
      { dimension: 'completeness', percent: undefined },
      { dimension: 'prosody', percent: undefined },
    ]);
  });

  it('falls back to the evidence’s own scores, and only to ones on its 0..100 scale', () => {
    expect(
      readDimensions(
        { scores: { accuracy: 87.6, fluency: 150, completeness: -3, prosody: '70' } },
        null,
      ),
    ).toEqual([
      { dimension: 'accuracy', percent: 88 },
      { dimension: 'fluency', percent: undefined },
      { dimension: 'completeness', percent: undefined },
      { dimension: 'prosody', percent: undefined },
    ]);
    for (const evidence of [null, 42, { scores: null }, { scores: [88] }]) {
      expect(readDimensions(evidence, undefined).every((row) => row.percent === undefined)).toBe(
        true,
      );
    }
  });
});
