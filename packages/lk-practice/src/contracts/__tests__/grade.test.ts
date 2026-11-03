import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../../determinism/freeze.js';
import type { EvidenceMeta, GradeResult, PracticeItem } from '../../types.js';
import { checkGradeResult, evidenceFromGrade } from '../index.js';

const task: PracticeItem = deepFreeze({
  id: 't1',
  skills: [
    { skillId: 'a', weight: 0.5 },
    { skillId: 'b', weight: 0.5 },
  ],
  stage: 'recall',
  origin: 'generated',
  status: 'proven',
  criteria: [
    { name: 'b1', skillId: 'b' },
    { name: 'a1', skillId: 'a' },
    { name: 'a2', skillId: 'a' },
    { name: 'unreported', skillId: 'a' },
  ],
});

const auto: GradeResult = deepFreeze({
  score: 2,
  maxScore: 3,
  passed: false,
  checks: { passed: 2, total: 3 },
  criteria: [
    { name: 'a1', score: 1, maxScore: 1 },
    { name: 'a2', score: 0, maxScore: 1 },
    { name: 'b1', score: 1, maxScore: 1 },
    { name: 'extra', score: 1, maxScore: 1 },
  ],
  grader: { kind: 'auto', id: 'pytest' },
});

const meta: EvidenceMeta = deepFreeze({ id: 'e1', itemId: 't1', at: 1000 });

const codes = (value: unknown) => {
  const result = checkGradeResult(value);
  return result.ok ? [] : result.issues.map((issue) => `${issue.code}@${issue.path.join('.')}`);
};

describe('checkGradeResult', () => {
  it('accepts a valid result and returns a frozen copy', () => {
    const result = checkGradeResult(auto);
    expect(result).toEqual({ ok: true, value: auto });
    if (!result.ok) return;
    expect(result.value).not.toBe(auto);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.criteria?.[0])).toBe(true);
  });

  it('accepts a score at either end of [0, maxScore]', () => {
    expect(codes({ ...auto, score: 0, criteria: [] })).toEqual([]);
    expect(codes({ ...auto, score: 3, criteria: [{ name: 'a', score: 0, maxScore: 0 }] })).toEqual(
      [],
    );
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['no grader', { score: 1, maxScore: 1, passed: true }],
    ['an unknown grader kind', { ...auto, grader: { kind: 'robot' } }],
    ['an unknown key', { ...auto, extra: 1 }],
    ['a NaN score', { ...auto, score: Number.NaN }],
    ['a negative maxScore', { ...auto, maxScore: -1 }],
    ['checks above total', { ...auto, checks: { passed: 4, total: 3 } }],
    ['an unknown confidence', { ...auto, confidence: 'sure' }],
  ])('rejects %s as SHAPE_INVALID', (_name, value) => {
    expect(codes(value).every((code) => code.startsWith('SHAPE_INVALID'))).toBe(true);
    expect(codes(value).length).toBeGreaterThan(0);
  });

  it('rejects scores outside [0, maxScore], for the result and each criterion', () => {
    expect(codes({ ...auto, score: 4 })).toEqual(['GRADE_SCORE_OUT_OF_RANGE@score']);
    expect(codes({ ...auto, score: -0.5 })).toEqual(['GRADE_SCORE_OUT_OF_RANGE@score']);
    expect(
      codes({
        ...auto,
        criteria: [
          { name: 'x', score: 2, maxScore: 1 },
          { name: 'y', score: -1, maxScore: 1 },
        ],
      }),
    ).toEqual([
      'GRADE_SCORE_OUT_OF_RANGE@criteria.0.score',
      'GRADE_SCORE_OUT_OF_RANGE@criteria.1.score',
    ]);
  });

  it('rejects a criterion reported twice, at the second', () => {
    expect(
      codes({
        ...auto,
        criteria: [
          { name: 'x', score: 1, maxScore: 1 },
          { name: 'y', score: 1, maxScore: 1 },
          { name: 'x', score: 0, maxScore: 1 },
        ],
      }),
    ).toEqual(['GRADE_CRITERION_DUPLICATE@criteria.2.name']);
  });

  it('rejects a value that is not JSON', () => {
    expect(codes({ ...auto, grader: { kind: 'auto', id: 'x' }, feedback: 1n })).toEqual([
      'SHAPE_INVALID@feedback',
    ]);
  });
});

describe('evidenceFromGrade', () => {
  it('maps an auto grade with checks and per-skill outcomes in the task order', () => {
    const evidence = evidenceFromGrade(auto, task, {
      ...meta,
      attempts: 0,
      hintsUsed: 1,
      durationMs: 5000,
      targetId: 'tg',
      context: 'practice',
      learnerConfidence: 'unsure',
    } as EvidenceMeta);
    expect(evidence).toEqual({
      id: 'e1',
      itemId: 't1',
      at: 1000,
      source: {
        kind: 'auto',
        score: 2,
        maxScore: 3,
        passed: false,
        checks: { passed: 2, total: 3 },
      },
      attempts: 0,
      hintsUsed: 1,
      durationMs: 5000,
      targetId: 'tg',
      context: 'practice',
      learnerConfidence: 'unsure',
      skillOutcomes: [
        { skillId: 'b', score: 1, maxScore: 1 },
        { skillId: 'a', score: 1, maxScore: 2 },
      ],
    });
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.source)).toBe(true);
    expect(Object.isFrozen(evidence.skillOutcomes)).toBe(true);
    expect(Object.isFrozen(evidence.skillOutcomes?.[0])).toBe(true);
  });

  it('copies confirms and supplements', () => {
    const evidence = evidenceFromGrade(auto, task, { ...meta, confirms: 'e0', supplements: 'e9' });
    expect(evidence).toMatchObject({ confirms: 'e0', supplements: 'e9' });
  });

  it('maps an auto grade without checks or criteria to a bare source', () => {
    const bare = { score: 1, maxScore: 1, passed: true, grader: { kind: 'auto' } } as const;
    expect(evidenceFromGrade(bare, task, meta)).toEqual({
      id: 'e1',
      itemId: 't1',
      at: 1000,
      source: { kind: 'auto', score: 1, maxScore: 1, passed: true },
    });
  });

  it('gives no outcomes when the task binds no reported criterion', () => {
    const { criteria: _criteria, ...unbound } = task;
    expect(evidenceFromGrade(auto, unbound, meta).skillOutcomes).toBeUndefined();
  });

  it('maps an ai grade, medium confidence when none is given', () => {
    const ai = { score: 1, maxScore: 1, passed: true, grader: { kind: 'ai' } } as const;
    expect(evidenceFromGrade(ai, task, meta).source).toEqual({
      kind: 'ai',
      score: 1,
      maxScore: 1,
      passed: true,
      confidence: 'medium',
    });
    expect(
      evidenceFromGrade(
        {
          ...ai,
          confidence: 'high',
          requiresHumanReview: true,
          grader: { kind: 'ai', id: 'm1', model: 'x', promptHash: 'p' },
        },
        task,
        meta,
      ).source,
    ).toEqual({
      kind: 'ai',
      score: 1,
      maxScore: 1,
      passed: true,
      confidence: 'high',
      requiresHumanReview: true,
      graderId: 'm1',
    });
  });

  it('maps a human grade, with its id when given', () => {
    const human = { score: 0, maxScore: 1, passed: false, grader: { kind: 'human' } } as const;
    expect(evidenceFromGrade(human, task, meta).source).toEqual({
      kind: 'human',
      score: 0,
      maxScore: 1,
      passed: false,
    });
    expect(
      evidenceFromGrade({ ...human, grader: { kind: 'human', id: 'r1' } }, task, meta).source,
    ).toMatchObject({ graderId: 'r1' });
  });

  it('throws a TypeError for an invalid grade or another item', () => {
    expect(() => evidenceFromGrade({ ...auto, score: 9 }, task, meta)).toThrow(
      /GRADE_SCORE_OUT_OF_RANGE/,
    );
    expect(() => evidenceFromGrade(null as never, task, meta)).toThrow(TypeError);
    expect(() => evidenceFromGrade(auto, task, { ...meta, itemId: 't2' })).toThrow(TypeError);
    expect(() => evidenceFromGrade(auto, null as never, null as never)).toThrow(TypeError);
  });
});
