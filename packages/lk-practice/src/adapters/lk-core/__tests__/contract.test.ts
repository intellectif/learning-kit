import {
  type ActivityData,
  type CriterionScore,
  evaluate,
  evaluateTries,
  type GradeRecord,
  type ItemOutcome,
  outcomeFromGrade,
  outcomeFromRoutedGrade,
  outcomeFromUnscorable,
  routeGrade,
} from '@intellectif/lk-core';
import { describe, expect, it } from 'vitest';
import { createPractice } from '../../../practice.js';
import type { Evidence, PracticeItem, SkillGraph } from '../../../types.js';
import {
  type CriterionScoreLike,
  evidenceFromOutcome,
  type GradeRecordLike,
  type ItemOutcomeLike,
} from '../index.js';

// The contract (D2, design 5.10): the structural types accept the real lk-core
// types, and real lk-core outcomes become evidence `record` accepts. lk-core is
// a devDependency, read only here; `verify-dist` fails a build that names it.

// Type-level: each assignment fails `typecheck` if lk-core's shapes drift.
const asOutcome = (outcome: ItemOutcome): ItemOutcomeLike => outcome;
const asGrade = (grade: GradeRecord): GradeRecordLike => grade;
const asCriterion = (criterion: CriterionScore): CriterionScoreLike => criterion;

const MC: ActivityData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'mc1',
  title: 'Past tense',
  question: 'Which is the past tense of "go"?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'o1', text: 'goed', isCorrect: false },
    { id: 'o2', text: 'went', isCorrect: true },
  ],
};

const ESSAY: ActivityData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'wr1',
  title: 'Your weekend',
  prompt: 'Describe your weekend.',
  minWords: 3,
  maxWords: 120,
  rubric: {
    criteria: [
      { name: 'Grammar', weight: 1 },
      { name: 'Task', weight: 1 },
    ],
  },
};

const GRAPH: SkillGraph = {
  version: 'contract@1',
  skills: [
    { id: 'past-tense', knowledge: 'declarative' },
    { id: 'grammar', knowledge: 'declarative' },
    { id: 'task', knowledge: 'declarative' },
  ],
  edges: [],
};

const MC_ITEM: PracticeItem = {
  id: 'mc1',
  skills: [{ skillId: 'past-tense', weight: 1 }],
  stage: 'recognise',
  origin: 'authored',
  status: 'proven',
};

const ESSAY_ITEM: PracticeItem = {
  id: 'wr1',
  skills: [
    { skillId: 'grammar', weight: 0.5 },
    { skillId: 'task', weight: 0.5 },
  ],
  stage: 'produce',
  criteria: [
    { name: 'Grammar', skillId: 'grammar' },
    { name: 'Task', skillId: 'task' },
  ],
  origin: 'authored',
  status: 'proven',
};

const AI_GRADE: GradeRecord = {
  score: 0.75,
  maxScore: 1,
  passed: true,
  feedback: null,
  criteria: [
    { name: 'Grammar', score: 1, maxScore: 2 },
    { name: 'Task', score: 2, maxScore: 2 },
  ],
  confidence: 'high',
  grader: { kind: 'ai', id: 'judge', model: 'model-x', promptHash: 'p1' },
};

const T0 = Date.UTC(2026, 10, 3, 9);

describe('the ./lk-core contract with the real lk-core', () => {
  it('assigns the real types to the structural ones', () => {
    const criterion: CriterionScore = { name: 'Grammar', score: 1, maxScore: 2, comment: 'ok' };
    expect(asCriterion(criterion).name).toBe('Grammar');
    expect(asGrade(AI_GRADE).criteria).toHaveLength(2);
    expect(asOutcome(outcomeFromGrade(AI_GRADE)).status).toBe('graded');
  });

  it('maps every status evaluate and the grade functions return', () => {
    const meta = (id: string, itemId: string) => ({ id, itemId, at: T0 });
    const right = evaluate(MC, { type: 'multiple-choice', selectedOptionIds: ['o2'] });
    const wrong = evaluate(MC, { type: 'multiple-choice', selectedOptionIds: ['o1'] });
    expect([right.status, wrong.status]).toEqual(['scored', 'scored']);
    expect(evidenceFromOutcome(right, MC_ITEM, meta('a', 'mc1'))?.source).toMatchObject({
      kind: 'auto',
      passed: true,
    });
    expect(evidenceFromOutcome(wrong, MC_ITEM, meta('b', 'mc1'))?.source).toMatchObject({
      kind: 'auto',
      passed: false,
    });

    const essay = evaluate(ESSAY, {
      type: 'written-response',
      text: 'I went to the park.',
      wordCount: 5,
    });
    expect(essay).toMatchObject({ status: 'deferred', reason: 'requires_async_grading' });
    expect(evidenceFromOutcome(essay, ESSAY_ITEM, meta('c', 'wr1'))?.source).toEqual({
      kind: 'pending',
      reason: 'deferred',
    });

    const gradedEssay = evidenceFromOutcome(
      outcomeFromGrade(AI_GRADE),
      ESSAY_ITEM,
      meta('d', 'wr1'),
    );
    expect(gradedEssay?.source).toEqual({
      kind: 'ai',
      score: 0.75,
      maxScore: 1,
      passed: true,
      confidence: 'high',
      graderId: 'judge',
    });
    expect(gradedEssay?.skillOutcomes).toEqual([
      { skillId: 'grammar', score: 1, maxScore: 2 },
      { skillId: 'task', score: 2, maxScore: 2 },
    ]);

    const rejected = outcomeFromGrade({ ...AI_GRADE, score: 5 });
    expect(rejected).toMatchObject({ status: 'deferred', reason: 'grade_rejected' });
    expect(evidenceFromOutcome(rejected, ESSAY_ITEM, meta('e', 'wr1'))?.source).toEqual({
      kind: 'pending',
      reason: 'deferred',
    });

    const toPerson = outcomeFromRoutedGrade(AI_GRADE, { to: 'person', reasons: ['unsure'] });
    expect(toPerson).toMatchObject({ status: 'deferred', reason: 'awaiting_human_review' });
    expect(evidenceFromOutcome(toPerson, ESSAY_ITEM, meta('f', 'wr1'))?.source).toEqual({
      kind: 'pending',
      reason: 'routed-to-person',
    });
    const toModel = outcomeFromRoutedGrade(AI_GRADE, { to: 'model', reasons: [] });
    expect(evidenceFromOutcome(toModel, ESSAY_ITEM, meta('g', 'wr1'))?.source.kind).toBe('ai');

    const routing = routeGrade(
      { ...AI_GRADE, confidence: 'low' },
      { mode: 'practice', item: { rubric: { criteria: [{ name: 'Grammar', weight: 1 }] } } },
    );
    const routed = outcomeFromRoutedGrade({ ...AI_GRADE, confidence: 'low' }, routing);
    expect(evidenceFromOutcome(routed, ESSAY_ITEM, meta('h', 'wr1'))?.source.kind).toBe(
      routing.to === 'person' ? 'pending' : 'ai',
    );

    const unanswered = evaluateTries(MC, []).outcome;
    expect(unanswered).toMatchObject({ status: 'deferred', reason: 'no_response_recorded' });
    expect(evidenceFromOutcome(unanswered, MC_ITEM, meta('i', 'mc1'))).toBeNull();

    const unscorable = outcomeFromUnscorable({ code: 'UNKNOWN_TYPE', reason: 'not registered' });
    expect(unscorable.status).toBe('unscorable');
    expect(evidenceFromOutcome(unscorable, MC_ITEM, meta('j', 'mc1'))).toBeNull();
  });

  it('records real outcomes: a model grade held for a person, then the person’s grade confirms it', () => {
    const practice = createPractice();
    let state = practice.initState('learner-1', GRAPH);
    const record = (evidence: Evidence | null, item?: PracticeItem) => {
      if (evidence === null) throw new Error('no evidence');
      const result = practice.record(state, {
        graph: GRAPH,
        evidence,
        ...(item === undefined ? {} : { item }),
      });
      if (result.kind !== 'applied') throw new Error(JSON.stringify(result));
      state = result.state;
      return result;
    };

    record(
      evidenceFromOutcome(
        evaluate(MC, { type: 'multiple-choice', selectedOptionIds: ['o2'] }),
        MC_ITEM,
        { id: 'mc-attempt', itemId: 'mc1', at: T0 },
      ),
      MC_ITEM,
    );
    expect(state.skills['past-tense']?.memories.recognise?.reviews).toBe(1);

    const held = record(
      evidenceFromOutcome(
        outcomeFromRoutedGrade(AI_GRADE, { to: 'person', reasons: ['unsure'] }),
        ESSAY_ITEM,
        { id: 'essay-attempt', itemId: 'wr1', at: T0 + 60_000 },
      ),
      ESSAY_ITEM,
    );
    expect(held.events.map((event) => event.type)).toEqual(['evidence.held']);
    expect(state.held).toHaveLength(1);

    const marked: GradeRecord = {
      ...AI_GRADE,
      criteria: [
        { name: 'Grammar', score: 2, maxScore: 2 },
        { name: 'Task', score: 1, maxScore: 2 },
      ],
      grader: { kind: 'human', id: 'teacher-7' },
      routing: { to: 'person', reasons: ['unsure'] },
    };
    const confirmed = record(
      evidenceFromOutcome(outcomeFromGrade(marked), ESSAY_ITEM, {
        id: 'essay-marked',
        itemId: 'wr1',
        at: T0 + 120_000,
        confirms: 'essay-attempt',
      }),
    );
    expect(confirmed.events.map((event) => event.type)).toContain('evidence.confirmed');
    expect(state.held).toHaveLength(0);
    expect(state.skills.grammar?.evidenceCount).toBe(1);
    expect(state.skills.task?.evidenceCount).toBe(1);
  });
});
