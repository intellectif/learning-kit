import { describe, expect, it } from 'vitest';
import type { LearnerResponse } from '../../types/activity.js';
import type { RouteEvent, RouteSummary, RouteTrace } from '../../types/reading-route.js';
import {
  markedSentences,
  marksFindEvidence,
  nextRouteLearnerState,
  readRouteLearnerState,
  readRouteTrace,
  routeAnswers,
  routeLevels,
  routePassageFingerprint,
  summarizeRoute,
} from '../progress.js';
import { PASSAGE, tramGroup } from './fixture.js';

const trace = (...events: RouteEvent[]): RouteTrace => ({
  traceVersion: '1',
  passage: routePassageFingerprint(PASSAGE),
  events,
});

const ALL_RIGHT: Record<string, LearnerResponse> = {
  tf1: { type: 'multiple-choice', selectedOptionIds: ['t'] },
  tf2: { type: 'multiple-choice', selectedOptionIds: ['ng'] },
  tf3: { type: 'multiple-choice', selectedOptionIds: ['f'] },
  mc1: { type: 'multiple-choice', selectedOptionIds: ['b'] },
  fib1: { type: 'fill-in-the-blanks', answers: { b1: 'old railway lines', b2: '14 million' } },
  gs1: { type: 'gap-select', selections: { g1: 'h1', g2: 'h2' } },
};

describe('routeAnswers', () => {
  it('grades each question the way its item grades, part by part', () => {
    const answers = routeAnswers(tramGroup(), {
      ...ALL_RIGHT,
      tf2: { type: 'multiple-choice', selectedOptionIds: ['t'] },
      fib1: { type: 'fill-in-the-blanks', answers: { b1: 'the old railway lines', b2: '' } },
      gs1: { type: 'gap-select', selections: { g1: 'h1', g2: 'h4' } },
    });
    expect(answers).toEqual({
      tf1: { correct: true, chosen: 't' },
      tf2: { correct: false, chosen: 't' },
      tf3: { correct: true, chosen: 'f' },
      mc1: { correct: true, chosen: 'b' },
      'fib1#b1': { correct: false, written: 'the old railway lines' },
      'fib1#b2': { correct: null },
      'gs1#g1': { correct: true, chosen: 'h1' },
      'gs1#g2': { correct: false, chosen: 'h4' },
    });
  });

  it('takes a given outcome over grading, and reads an ungradable question as unanswered', () => {
    const answers = routeAnswers(
      tramGroup(),
      {
        tf1: { type: 'multiple-choice', selectedOptionIds: ['f'] },
        tf2: { type: 'multiple-choice', selectedOptionIds: [] },
      },
      {
        tf1: {
          status: 'scored',
          score: 1,
          maxScore: 1,
          passed: true,
          feedback: null,
          details: [
            { itemId: 't', outcome: 'correct', learnerResponse: 'f', correctResponse: 'f' },
          ],
        },
      },
    );
    expect(answers.tf1).toEqual({ correct: true, chosen: 'f' });
    expect(answers.tf2).toEqual({ correct: null });
    expect(answers.tf3).toEqual({ correct: null });
    // A learner copy cannot be graded here.
    const group = tramGroup();
    (group.items[0] as { options: unknown }).options = 'broken';
    expect(
      routeAnswers(group, { tf1: { type: 'multiple-choice', selectedOptionIds: ['t'] } }).tf1,
    ).toEqual({
      correct: null,
      chosen: 't',
    });
  });
});

describe('summarizeRoute', () => {
  const started: RouteEvent = {
    at: 0,
    type: 'started',
    levels: { tfng: 'coached', completion: 'solo' },
  };

  it('names the cause of every wrong answer', () => {
    const group = tramGroup();
    const answers = routeAnswers(group, {
      tf1: { type: 'multiple-choice', selectedOptionIds: ['f'] },
      tf2: { type: 'multiple-choice', selectedOptionIds: ['t'] },
      tf3: { type: 'multiple-choice', selectedOptionIds: ['t'] },
      mc1: { type: 'multiple-choice', selectedOptionIds: ['d'] },
      fib1: { type: 'fill-in-the-blanks', answers: { b1: 'the old railway lines', b2: 'many' } },
      gs1: { type: 'gap-select', selections: { g1: 'h3' } },
    });
    const summary = summarizeRoute(
      group,
      trace(
        started,
        { at: 1000, type: 'step', step: 'tf1/keywords', question: 'tf1' },
        { at: 5000, type: 'located', question: 'tf1', sentence: 2, hit: true },
        { at: 9000, type: 'answered', question: 'tf1' },
        { at: 10_000, type: 'located', question: 'tf3', sentence: 0, hit: false },
        { at: 11_000, type: 'located', question: 'tf3', sentence: 8, hit: true },
        { at: 12_000, type: 'marked', question: 'fib1#b2', sentence: 0, on: true },
        { at: 20_000, type: 'answered', question: 'fib1#b1' },
        { at: 26_000, type: 'answered', question: 'fib1#b2' },
        { at: 30_000, type: 'finished' },
      ),
      answers,
    );
    const byKey = Object.fromEntries(summary.questions.map((question) => [question.key, question]));
    expect(byKey.tf1).toMatchObject({
      located: true,
      tries: 1,
      correct: false,
      cause: 'meaning',
      seconds: 8,
    });
    expect(byKey.tf2).toMatchObject({
      located: null,
      correct: false,
      cause: 'trap',
      chosen: 't',
      trap: 'outside-knowledge',
    });
    // The first locate is the evidence; finding it on the second try is still having missed it.
    expect(byKey.tf3).toMatchObject({ located: false, tries: 2, cause: 'trap', trap: 'opposite' });
    expect(byKey.mc1).toMatchObject({ level: 'walkthrough', cause: 'trap', trap: 'word-match' });
    expect(byKey['fib1#b1']).toMatchObject({ level: 'solo', cause: 'limit', seconds: 11 });
    expect(byKey['fib1#b2']).toMatchObject({ located: false, cause: 'search', seconds: 6 });
    expect(byKey['gs1#g1']).toMatchObject({ cause: 'unknown' });
    expect(byKey['gs1#g2']).toMatchObject({ correct: null, cause: 'unanswered', seconds: null });
    expect(summary).toMatchObject({ groupId: 'trams', correct: 0, total: 8, seconds: 30 });
    expect(summary.strategies.find((entry) => entry.strategy === 'tfng')).toEqual({
      strategy: 'tfng',
      level: 'coached',
      questions: 3,
      correct: 0,
      located: 1,
      locatable: 2,
    });
  });

  it('reads asking to be shown as not finding it, and right answers as having no cause', () => {
    const group = tramGroup();
    const summary = summarizeRoute(
      group,
      trace(started, { at: 1, type: 'shown', question: 'tf1' }),
      routeAnswers(group, ALL_RIGHT),
    );
    expect(summary.questions[0]).toMatchObject({
      located: false,
      shown: true,
      correct: true,
      cause: null,
    });
    expect(summary.correct).toBe(8);
    expect(summary.seconds).toBeNull();
  });

  it('ignores the order in which the learner looked', () => {
    const group = tramGroup();
    const answers = routeAnswers(group, ALL_RIGHT);
    const one = summarizeRoute(
      group,
      trace(
        started,
        { at: 1, type: 'located', question: 'tf1', sentence: 2, hit: true },
        { at: 2, type: 'located', question: 'tf3', sentence: 8, hit: true },
      ),
      answers,
    );
    const other = summarizeRoute(
      group,
      trace(
        started,
        { at: 1, type: 'located', question: 'tf3', sentence: 8, hit: true },
        { at: 2, type: 'located', question: 'tf1', sentence: 2, hit: true },
      ),
      answers,
    );
    expect(one.questions.map((question) => question.located)).toEqual(
      other.questions.map((question) => question.located),
    );
  });
});

describe('marking evidence', () => {
  it('keeps the last state of each sentence', () => {
    const marks = trace(
      { at: 0, type: 'marked', question: 'q', sentence: 3, on: true },
      { at: 0, type: 'marked', question: 'q', sentence: 1, on: true },
      { at: 0, type: 'marked', question: 'q', sentence: 3, on: false },
      { at: 0, type: 'marked', question: 'other', sentence: 9, on: true },
    );
    expect(markedSentences(marks, 'q')).toEqual([1]);
  });

  it('counts marking the right sentence, and not marking everything', () => {
    expect(marksFindEvidence([4], [4])).toBe(true);
    expect(marksFindEvidence([3, 4], [4])).toBe(true);
    expect(marksFindEvidence([2, 3, 4], [4])).toBe(false);
    expect(marksFindEvidence([2, 3, 4], [3, 4])).toBe(true);
    expect(marksFindEvidence([1], [4])).toBe(false);
  });
});

describe('reading stored state back', () => {
  it('reads a trace, leaving out what it cannot read', () => {
    expect(readRouteTrace(null)).toBeNull();
    expect(readRouteTrace({ traceVersion: '2', passage: 'x', events: [] })).toBeNull();
    expect(readRouteTrace({ traceVersion: '1', passage: 'x' })).toEqual({
      traceVersion: '1',
      passage: 'x',
      events: [],
    });
    const read = readRouteTrace({
      traceVersion: '1',
      passage: 'x',
      events: [
        { at: 1, type: 'started', levels: { tfng: 'solo', nope: 'solo', ynng: 'fast' } },
        { at: 2, type: 'step', step: 's', question: 'q' },
        { at: 2, type: 'step' },
        { at: 3, type: 'located', question: 'q', sentence: 1, hit: true },
        { at: 3, type: 'located', question: 'q', sentence: -1, hit: true },
        { at: 4, type: 'shown', question: 'q' },
        { at: 5, type: 'marked', question: 'q', sentence: 2, on: false },
        { at: 5, type: 'marked', question: 'q', sentence: 2 },
        { at: 6, type: 'answered', question: 'q' },
        { at: 6, type: 'answered' },
        { at: Number.NaN, type: 'finished' },
        { at: 7, type: 'finished' },
        { at: 8, type: 'teleported' },
        'nope',
      ],
    });
    expect(read?.events).toEqual([
      { at: 1, type: 'started', levels: { tfng: 'solo' } },
      { at: 2, type: 'step', step: 's', question: 'q' },
      { at: 3, type: 'located', question: 'q', sentence: 1, hit: true },
      { at: 4, type: 'shown', question: 'q' },
      { at: 5, type: 'marked', question: 'q', sentence: 2, on: false },
      { at: 6, type: 'answered', question: 'q' },
      { at: 7, type: 'finished' },
    ]);
  });

  it('reads a learner state, starting fresh from anything else', () => {
    expect(readRouteLearnerState(undefined)).toEqual({
      stateVersion: '1',
      strategies: {},
      seen: [],
    });
    expect(
      readRouteLearnerState({
        stateVersion: '1',
        strategies: {
          tfng: { level: 'coached', streak: 1 },
          ynng: { level: 'fast' },
          nope: { level: 'solo' },
          mcq: 3,
          completion: { level: 'solo', streak: 0.5 },
        },
        seen: ['a', 4],
      }),
    ).toEqual({
      stateVersion: '1',
      strategies: {
        tfng: { level: 'coached', streak: 1 },
        completion: { level: 'solo', streak: 0 },
      },
      seen: ['a'],
    });
  });

  it("gives each strategy the learner's level, an entry level, or a pinned one", () => {
    const state = readRouteLearnerState({
      stateVersion: '1',
      strategies: { tfng: { level: 'solo', streak: 0 } },
      seen: [],
    });
    expect(routeLevels(tramGroup(), state)).toEqual({
      tfng: 'solo',
      'multiple-choice': 'walkthrough',
      completion: 'walkthrough',
      'matching-headings': 'walkthrough',
    });
    expect(routeLevels(tramGroup(), null, { entry: 'coached' }).completion).toBe('coached');
    expect(routeLevels(tramGroup(), state, { level: 'walkthrough' }).tfng).toBe('walkthrough');
  });
});

describe('nextRouteLearnerState', () => {
  const summary = (
    results: { correct: boolean | null; located?: boolean | null; shown?: boolean }[],
    level: 'walkthrough' | 'coached' | 'solo' = 'walkthrough',
    groupId = 'g1',
  ): RouteSummary => ({
    groupId,
    correct: 0,
    total: results.length,
    seconds: null,
    strategies: [
      { strategy: 'tfng', level, questions: results.length, correct: 0, located: 0, locatable: 0 },
    ],
    questions: results.map((result, index) => ({
      key: `q${index}`,
      itemId: `q${index}`,
      number: index + 1,
      strategy: 'tfng',
      level,
      located: result.located ?? true,
      tries: 1,
      shown: result.shown ?? false,
      correct: result.correct,
      cause: null,
      seconds: null,
    })),
  });

  it('takes help away after two successes in a row, one level per passage', () => {
    const next = nextRouteLearnerState(
      null,
      summary([{ correct: true }, { correct: true }, { correct: true }, { correct: true }]),
    );
    expect(next).toEqual({
      stateVersion: '1',
      strategies: { tfng: { level: 'coached', streak: 0 } },
      seen: ['g1'],
    });
  });

  it('counts a missed locate or a reveal as a failure, even when the answer is right', () => {
    const next = nextRouteLearnerState(
      { stateVersion: '1', strategies: { tfng: { level: 'coached', streak: 0 } }, seen: [] },
      summary(
        [
          { correct: true, located: false },
          { correct: true, shown: true },
        ],
        'coached',
      ),
    );
    expect(next.strategies.tfng).toEqual({ level: 'walkthrough', streak: 0 });
  });

  it('keeps a streak across passages at the same level, and never goes past either end', () => {
    const first = nextRouteLearnerState(null, summary([{ correct: true }], 'solo', 'a'));
    expect(first.strategies.tfng).toEqual({ level: 'solo', streak: 1 });
    const second = nextRouteLearnerState(
      first,
      summary([{ correct: true }, { correct: true }, { correct: true }], 'solo', 'b'),
    );
    expect(second.strategies.tfng).toEqual({ level: 'solo', streak: 2 });
    const failing = nextRouteLearnerState(
      null,
      summary([{ correct: false }, { correct: null }, { correct: false }]),
    );
    expect(failing.strategies.tfng).toEqual({ level: 'walkthrough', streak: -2 });
  });

  it('changes nothing for a passage the learner has done before, and remembers a bounded number', () => {
    const state = { stateVersion: '1' as const, strategies: {}, seen: ['g1'] };
    expect(nextRouteLearnerState(state, summary([{ correct: true }, { correct: true }]))).toEqual(
      state,
    );
    const bounded = nextRouteLearnerState(
      { stateVersion: '1', strategies: {}, seen: ['a', 'b'] },
      summary([{ correct: true }]),
      { remember: 2 },
    );
    expect(bounded.seen).toEqual(['b', 'g1']);
  });

  it('takes its thresholds from the options', () => {
    const next = nextRouteLearnerState(null, summary([{ correct: true }]), { promoteAfter: 1 });
    expect(next.strategies.tfng?.level).toBe('coached');
    const back = nextRouteLearnerState(
      { stateVersion: '1', strategies: { tfng: { level: 'solo', streak: 0 } }, seen: [] },
      summary([{ correct: false }], 'solo'),
      { demoteAfter: 1 },
    );
    expect(back.strategies.tfng?.level).toBe('coached');
  });
});
