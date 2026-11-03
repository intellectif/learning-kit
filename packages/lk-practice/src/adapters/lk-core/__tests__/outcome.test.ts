import { describe, expect, it } from 'vitest';
import type { EvidenceMeta, PracticeItem } from '../../../types.js';
import {
  type CriterionScoreLike,
  evidenceFromOutcome,
  type GradeRecordLike,
  type ItemOutcomeLike,
  skillOutcomesFromCriteria,
} from '../index.js';

// R7.7 case by case, on hand-made outcomes; contract.test.ts runs real lk-core ones.

const TASK: PracticeItem = {
  id: 'essay-1',
  skills: [
    { skillId: 'grammar', weight: 0.5 },
    { skillId: 'task', weight: 0.5 },
  ],
  stage: 'produce',
  criteria: [
    { name: 'Task', skillId: 'task' },
    { name: 'Grammar', skillId: 'grammar' },
    { name: 'Spelling', skillId: 'grammar' },
  ],
  origin: 'authored',
  status: 'proven',
};

const META: EvidenceMeta = { id: 'ev-1', itemId: 'essay-1', at: 1_000 };

const graded = (grade: Partial<GradeRecordLike> = {}): ItemOutcomeLike => ({
  status: 'graded',
  score: 0.75,
  maxScore: 1,
  passed: true,
  grade: { score: 0.75, maxScore: 1, passed: true, ...grade },
});

describe('evidenceFromOutcome', () => {
  it('maps scored to an auto source with the outcome numbers and the meta fields', () => {
    const evidence = evidenceFromOutcome(
      { status: 'scored', score: 0.5, maxScore: 1, passed: false },
      TASK,
      { ...META, attempts: 1, hintsUsed: 2, durationMs: 9_000, context: 'exam', targetId: 't-1' },
    );
    expect(evidence).toEqual({
      id: 'ev-1',
      itemId: 'essay-1',
      at: 1_000,
      source: { kind: 'auto', score: 0.5, maxScore: 1, passed: false },
      attempts: 1,
      hintsUsed: 2,
      durationMs: 9_000,
      context: 'exam',
      targetId: 't-1',
    });
    expect(Object.isFrozen(evidence)).toBe(true);
  });

  it('maps graded by the grader kind, auto when absent, with confidence, review and id', () => {
    const source = (grade: Partial<GradeRecordLike>) =>
      evidenceFromOutcome(graded(grade), TASK, META)?.source;
    expect(source({})).toEqual({ kind: 'auto', score: 0.75, maxScore: 1, passed: true });
    expect(source({ grader: { kind: 'ai', id: 'judge' } })).toEqual({
      kind: 'ai',
      score: 0.75,
      maxScore: 1,
      passed: true,
      confidence: 'medium',
      graderId: 'judge',
    });
    expect(
      source({ grader: { kind: 'ai' }, confidence: 'low', requiresHumanReview: true }),
    ).toEqual({
      kind: 'ai',
      score: 0.75,
      maxScore: 1,
      passed: true,
      confidence: 'low',
      requiresHumanReview: true,
    });
    expect(source({ grader: { kind: 'human', id: 'marker-1' } })).toEqual({
      kind: 'human',
      score: 0.75,
      maxScore: 1,
      passed: true,
      graderId: 'marker-1',
    });
  });

  it('reads the outcome numbers, not the grade numbers', () => {
    const outcome: ItemOutcomeLike = {
      status: 'graded',
      score: 2,
      maxScore: 4,
      passed: false,
      grade: { score: 0.9, maxScore: 1, passed: true },
    };
    expect(evidenceFromOutcome(outcome, TASK, META)?.source).toEqual({
      kind: 'auto',
      score: 2,
      maxScore: 4,
      passed: false,
    });
  });

  it('holds a model grade routed to a person, and never a person’s own grade', () => {
    const routed = { routing: { to: 'person' as const } };
    expect(
      evidenceFromOutcome(graded({ ...routed, grader: { kind: 'ai' } }), TASK, META)?.source,
    ).toEqual({ kind: 'pending', reason: 'routed-to-person' });
    expect(evidenceFromOutcome(graded(routed), TASK, META)?.source).toEqual({
      kind: 'pending',
      reason: 'routed-to-person',
    });
    expect(
      evidenceFromOutcome(graded({ ...routed, grader: { kind: 'human' } }), TASK, META)?.source
        .kind,
    ).toBe('human');
    expect(
      evidenceFromOutcome(graded({ routing: { to: 'model' }, grader: { kind: 'ai' } }), TASK, META)
        ?.source.kind,
    ).toBe('ai');
  });

  it('holds deferred outcomes by reason, and records nothing for a slot never answered', () => {
    const deferred = (reason: string, pendingGrade?: GradeRecordLike) =>
      evidenceFromOutcome(
        { status: 'deferred', maxScore: 1, reason, ...(pendingGrade ? { pendingGrade } : {}) },
        TASK,
        { ...META, context: 'practice' },
      );
    expect(deferred('awaiting_human_review')).toEqual({
      id: 'ev-1',
      itemId: 'essay-1',
      at: 1_000,
      source: { kind: 'pending', reason: 'routed-to-person' },
      context: 'practice',
    });
    const routedGrade = { score: 1, maxScore: 1, passed: true, routing: { to: 'person' as const } };
    expect(deferred('requires_async_grading', routedGrade)?.source).toEqual({
      kind: 'pending',
      reason: 'routed-to-person',
    });
    for (const reason of ['requires_async_grading', 'grade_rejected']) {
      expect(deferred(reason)?.source).toEqual({ kind: 'pending', reason: 'deferred' });
    }
    expect(deferred('no_response_recorded')).toBeNull();
  });

  it('records nothing for an unscorable outcome', () => {
    expect(
      evidenceFromOutcome(
        { status: 'unscorable', maxScore: 1, reason: 'unknown type' },
        TASK,
        META,
      ),
    ).toBeNull();
  });

  it('maps a grade’s criteria to skill outcomes', () => {
    const evidence = evidenceFromOutcome(
      graded({
        grader: { kind: 'ai' },
        confidence: 'high',
        criteria: [
          { name: 'Grammar', score: 1, maxScore: 2 },
          { name: 'Task', score: 3, maxScore: 4 },
          { name: 'Spelling', score: 2, maxScore: 2 },
          { name: 'Style', notApplicable: true },
        ],
      }),
      TASK,
      META,
    );
    expect(evidence?.skillOutcomes).toEqual([
      { skillId: 'task', score: 3, maxScore: 4 },
      { skillId: 'grammar', score: 3, maxScore: 4 },
    ]);
  });

  it('throws for an unknown status, a grade out of range, or a meta for another item', () => {
    expect(() =>
      evidenceFromOutcome({ status: 'other' } as unknown as ItemOutcomeLike, TASK, META),
    ).toThrow(TypeError);
    expect(() => evidenceFromOutcome(null as unknown as ItemOutcomeLike, TASK, META)).toThrow(
      TypeError,
    );
    expect(() =>
      evidenceFromOutcome({ status: 'scored', score: 2, maxScore: 1, passed: true }, TASK, META),
    ).toThrow(TypeError);
    expect(() =>
      evidenceFromOutcome({ status: 'unscorable', maxScore: 1, reason: 'x' }, TASK, {
        ...META,
        itemId: 'other',
      }),
    ).toThrow(TypeError);
  });
});

describe('skillOutcomesFromCriteria', () => {
  const outcomes = (criteria: readonly CriterionScoreLike[]) =>
    skillOutcomesFromCriteria(criteria, TASK);

  it('skips entries not applicable or without numbers, and ignores names the task does not bind', () => {
    expect(
      outcomes([
        { name: 'Grammar', notApplicable: true, score: 1, maxScore: 1 },
        { name: 'Task', score: 1 },
        { name: 'Spelling', maxScore: 1 },
        { name: 'Unbound', score: 1, maxScore: 1 },
      ]),
    ).toEqual([]);
  });

  it('sums a repeated name, then the names bound to one skill, in the task’s order', () => {
    const result = outcomes([
      { name: 'Spelling', score: 1, maxScore: 2 },
      { name: 'Grammar', score: 0, maxScore: 1 },
      { name: 'Spelling', score: 1, maxScore: 1 },
      { name: 'Task', score: 2, maxScore: 2 },
    ]);
    expect(result).toEqual([
      { skillId: 'task', score: 2, maxScore: 2 },
      { skillId: 'grammar', score: 2, maxScore: 4 },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('gives no outcomes for a task without criteria', () => {
    const { criteria: _omit, ...bare } = TASK;
    expect(skillOutcomesFromCriteria([{ name: 'Task', score: 1, maxScore: 1 }], bare)).toEqual([]);
  });
});
