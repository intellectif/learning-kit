import { describe, expect, it } from 'vitest';
import {
  AI_GRADING_PROBABILITY_TOLERANCE,
  aiGradingRequest,
  checkAiGrading,
} from '../ai-grading.js';
import type {
  LearnerResponse,
  MultipleChoiceData,
  WrittenResponseData,
} from '../types/activity.js';
import type { AiGradingRequest } from '../types/ai.js';

/**
 * A model's grade of a written response: the request the SDK builds on the
 * server, and the check that holds the reply to the rubric — every criterion,
 * once, on its own scale — whole or nothing.
 */

const TEXT = 'Last weekend I go to the market and buyed bread. Then I went home.';

const essay = (over: Partial<WrittenResponseData> = {}): WrittenResponseData => ({
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'wr-weekend',
  title: 'Your weekend',
  prompt: 'Write about your weekend.',
  minWords: 5,
  maxWords: 80,
  languageTarget: 'en-A2',
  rubric: {
    criteria: [
      {
        name: 'Task',
        weight: 2,
        description: 'Says what the learner did.',
        levels: [
          { label: 'Not met' },
          { label: 'Partly met' },
          { label: 'Met', description: 'Every part of the task.' },
        ],
      },
      { name: 'Grammar', weight: 1 },
    ],
  },
  ...over,
});

const wrote = (text: string): LearnerResponse => ({
  type: 'written-response',
  text,
  wordCount: 0,
});

function requestFor(data: WrittenResponseData = essay(), text = TEXT): AiGradingRequest {
  const built = aiGradingRequest({ data, response: wrote(text) });
  if (!built.ok) {
    throw new Error(`no request: ${built.problem}`);
  }
  return built.request;
}

/** A reply that judges both criteria, which each test bends. */
const reply = (over: Record<string, unknown> = {}) => ({
  criteria: [
    {
      name: 'Task',
      level: 'Met',
      probabilities: [0.05, 0.15, 0.8],
      comment: 'Covers the weekend.',
    },
    { name: 'Grammar', score: 60, maxScore: 100, comment: 'Two past-tense mistakes.' },
  ],
  feedback: 'Watch your past tenses.',
  corrections: [{ original: 'buyed', corrected: 'bought' }],
  rationale: 'Task complete; two errors.',
  requiresHumanReview: false,
  provenance: { model: 'grader-1', promptHash: 'p1' },
  usage: { promptTokens: 900, completionTokens: 120 },
  ...over,
});

const refusal = (raw: unknown, request = requestFor()) => {
  const checked = checkAiGrading(raw, request);
  return checked.ok ? 'accepted' : checked.refusal;
};

describe('aiGradingRequest', () => {
  it('gives the model the task, the response verbatim, and the rubric with its levels', () => {
    const request = requestFor();
    expect(request.feature).toBe('grading');
    expect(request.facts).toEqual({
      activityType: 'written-response',
      activityId: 'wr-weekend',
      title: 'Your weekend',
      prompt: 'Write about your weekend.',
      text: TEXT,
      wordCount: 14,
      minWords: 5,
      maxWords: 80,
      withinWordBounds: true,
      rubric: [
        {
          name: 'Task',
          description: 'Says what the learner did.',
          weight: 2,
          levels: [
            { label: 'Not met' },
            { label: 'Partly met' },
            { label: 'Met', description: 'Every part of the task.' },
          ],
        },
        { name: 'Grammar', weight: 1, levels: null },
      ],
      languageTarget: 'en-A2',
    });
    expect(request).not.toHaveProperty('material');
  });

  it("carries the item's language and target when the author gave them, and nothing in their place when not", () => {
    expect(requestFor(essay({ locale: 'en-GB' })).facts.locale).toBe('en-GB');
    const bare = requestFor(essay({ languageTarget: undefined, prompt: undefined } as never)).facts;
    expect(bare).not.toHaveProperty('languageTarget');
    expect(bare).not.toHaveProperty('locale');
    expect(bare.prompt).toBe('');
  });

  it("carries the group's material and the learner's language when given", () => {
    const built = aiGradingRequest({
      data: essay(),
      response: wrote(TEXT),
      group: { stimulus: { kind: 'text', body: 'A passage.' } },
      learnerLocale: 'es',
    });
    expect(built.ok && built.request.material).toEqual({ kind: 'text', text: 'A passage.' });
    expect(built.ok && built.request.learnerLocale).toBe('es');
  });

  it('builds a request whatever the author switched off for AI help: grading is not help', () => {
    expect(
      aiGradingRequest({ data: essay({ ai: { explanations: false } }), response: wrote(TEXT) }).ok,
    ).toBe(true);
  });

  it('says why there is no request', () => {
    const problem = (data: unknown, response: LearnerResponse | null = wrote(TEXT)) => {
      const built = aiGradingRequest({ data: data as WrittenResponseData, response });
      return built.ok ? 'built' : { problem: built.problem, path: built.path };
    };
    const mc = {
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'mc',
      title: 'MC',
    } as unknown as MultipleChoiceData;
    expect(problem(mc)).toEqual({ problem: 'not-written-response', path: undefined });
    expect(problem({ ...essay(), redacted: true })).toMatchObject({ problem: 'redacted' });
    expect(problem(essay({ rubric: undefined } as never))).toMatchObject({ problem: 'no-rubric' });
    expect(problem(essay({ rubric: { criteria: [] } }))).toMatchObject({ problem: 'no-rubric' });
    expect(
      problem(essay({ rubric: { criteria: [{ name: 'Task', weight: 1 }, 'Grammar'] } } as never)),
    ).toEqual({ problem: 'no-rubric', path: ['rubric', 'criteria', 1] });
    expect(problem(essay({ rubric: { criteria: [{ name: ' ', weight: 1 }] } }))).toEqual({
      problem: 'no-rubric',
      path: ['rubric', 'criteria', 0],
    });
    expect(
      problem(essay({ rubric: { criteria: [{ name: 'Task', weight: '1' }] } } as never)),
    ).toMatchObject({ problem: 'no-rubric' });
    expect(
      problem(
        essay({
          rubric: {
            criteria: [
              { name: 'Grammar', weight: 1 },
              { name: ' grammar ', weight: 1 },
            ],
          },
        }),
      ),
    ).toEqual({ problem: 'duplicate-criteria', path: ['rubric', 'criteria', 1, 'name'] });
    expect(
      problem(
        essay({ rubric: { criteria: [{ name: 'Task', weight: 1, levels: [{ label: 'Only' }] }] } }),
      ),
    ).toEqual({ problem: 'unreadable-levels', path: ['rubric', 'criteria', 0, 'levels'] });
    expect(problem(essay(), wrote('   '))).toMatchObject({ problem: 'empty-response' });
    expect(problem(essay(), null)).toMatchObject({ problem: 'empty-response' });
    expect(problem(essay(), { type: 'multiple-choice', selectedOptionIds: [] })).toMatchObject({
      problem: 'empty-response',
    });
    expect(problem(essay(), { type: 'dictation', text: TEXT })).toMatchObject({
      problem: 'empty-response',
    });
  });

  it('counts words as the grader counts them, and says when the response is out of bounds', () => {
    const short = requestFor(essay({ minWords: 20 }));
    expect(short.facts.withinWordBounds).toBe(false);
    expect(requestFor(essay({ maxWords: 13 })).facts.withinWordBounds).toBe(false);
    // Both bounds are the response's own length: within them, at each end.
    expect(requestFor(essay({ minWords: 14, maxWords: 14 })).facts.withinWordBounds).toBe(true);
    const rubricOnly = essay({ minWords: undefined as never, maxWords: undefined as never });
    expect(requestFor(rubricOnly).facts).toMatchObject({
      minWords: 0,
      maxWords: Number.POSITIVE_INFINITY,
    });
  });
});

describe('checkAiGrading: what it accepts', () => {
  it('reads each criterion on its scale, in the rubric order, with the corrections anchored', () => {
    const checked = checkAiGrading(
      reply({
        criteria: [
          { name: 'grammar', score: 0.6 },
          { name: ' TASK ', level: 'partly MET' },
        ],
      }),
      requestFor(),
    );
    expect(checked).toEqual({
      ok: true,
      judgement: {
        criteria: [
          { name: 'Task', level: 'Partly met', score: 0.5 },
          { name: 'Grammar', score: 0.6 },
        ],
        feedback: 'Watch your past tenses.',
        corrections: [
          {
            original: 'buyed',
            corrected: 'bought',
            range: { start: TEXT.indexOf('buyed'), end: TEXT.indexOf('buyed') + 5 },
          },
        ],
        rationale: 'Task complete; two errors.',
        requiresHumanReview: false,
        provenance: { model: 'grader-1', promptHash: 'p1' },
        usage: { promptTokens: 900, completionTokens: 120 },
      },
    });
  });

  it('keeps level probabilities that are a distribution whose likeliest level was chosen', () => {
    const checked = checkAiGrading(reply(), requestFor());
    expect(checked.ok && checked.judgement.criteria[0]).toEqual({
      name: 'Task',
      level: 'Met',
      score: 1,
      probabilities: [0.05, 0.15, 0.8],
      comment: 'Covers the weekend.',
    });
    expect(checked.ok && checked.judgement.criteria[1]).toEqual({
      name: 'Grammar',
      score: 0.6,
      comment: 'Two past-tense mistakes.',
    });
  });

  it('takes a tie for the likeliest level, and a sum within rounding of 1', () => {
    const tie = reply({
      criteria: [
        { name: 'Task', level: 'Partly met', probabilities: [0, 0.5, 0.5] },
        { name: 'Grammar', score: 1 },
      ],
    });
    expect(refusal(tie)).toBe('accepted');
    const rounded = reply({
      criteria: [
        {
          name: 'Task',
          level: 'Met',
          probabilities: [0.1, 0.2, 0.7 + AI_GRADING_PROBABILITY_TOLERANCE / 2],
        },
        { name: 'Grammar', score: 1 },
      ],
    });
    expect(refusal(rounded)).toBe('accepted');
  });

  it('reads an absent feedback as none, and requiresHumanReview as false by default', () => {
    const checked = checkAiGrading({ criteria: reply().criteria }, requestFor());
    expect(checked.ok && checked.judgement).toMatchObject({
      feedback: null,
      corrections: [],
      requiresHumanReview: false,
    });
    expect(checked.ok && checked.judgement).not.toHaveProperty('rationale');
    expect(checkAiGrading(reply({ requiresHumanReview: true }), requestFor())).toMatchObject({
      judgement: { requiresHumanReview: true },
    });
  });

  it('reads a score within float noise of its maximum as the maximum', () => {
    const checked = checkAiGrading(
      reply({
        criteria: [
          { name: 'Task', level: 'Met' },
          { name: 'Grammar', score: 100 + 1e-8, maxScore: 100 },
        ],
      }),
      requestFor(),
    );
    expect(checked.ok && checked.judgement.criteria[1]?.score).toBe(1);
  });

  it('takes notApplicable: false, which leaves nothing out', () => {
    const criteria = [
      { name: 'Task', level: 'Met', notApplicable: false },
      { name: 'Grammar', score: 1 },
    ];
    expect(refusal(reply({ criteria }))).toBe('accepted');
  });

  it('reads each field of a criterion once', () => {
    const reads: string[] = [];
    const counted = Object.defineProperties(
      {},
      Object.fromEntries(
        Object.entries({ name: 'Task', level: 'Met', comment: 'Good.' }).map(([key, value]) => [
          key,
          {
            enumerable: true,
            get: () => {
              reads.push(key);
              return value;
            },
          },
        ]),
      ),
    );
    const checked = checkAiGrading(
      reply({ criteria: [counted, { name: 'Grammar', score: 1 }] }),
      requestFor(),
    );
    expect(checked.ok).toBe(true);
    expect(reads.sort()).toEqual(['comment', 'level', 'name']);
  });
});

describe('checkAiGrading: what it refuses', () => {
  it.each([
    ['no criteria at all', reply({ criteria: undefined })],
    ['a criterion left out', reply({ criteria: [reply().criteria[0]] })],
    [
      'a criterion the rubric does not have',
      reply({ criteria: [...reply().criteria, { name: 'Style', score: 1 }] }),
    ],
    [
      'a criterion renamed',
      reply({ criteria: [reply().criteria[0], { name: 'Accuracy', score: 1 }] }),
    ],
    [
      'a criterion judged twice',
      reply({ criteria: [...reply().criteria, { name: 'Task', level: 'Met' }] }),
    ],
    [
      'a criterion called not applicable, even with a score',
      reply({
        criteria: [reply().criteria[0], { name: 'Grammar', score: 1, notApplicable: true }],
      }),
    ],
    [
      'a level criterion with no level',
      reply({ criteria: [{ name: 'Task' }, reply().criteria[1]] }),
    ],
    [
      'a score criterion with no score',
      reply({ criteria: [reply().criteria[0], { name: 'Grammar' }] }),
    ],
  ])('misses-criteria: %s', (_label, raw) => {
    expect(refusal(raw)).toBe('misses-criteria');
  });

  const task = (judged: Record<string, unknown>) =>
    reply({
      criteria: [
        { name: 'Task', ...judged },
        { name: 'Grammar', score: 1 },
      ],
    });
  const grammar = (judged: Record<string, unknown>) =>
    reply({
      criteria: [
        { name: 'Task', level: 'Met' },
        { name: 'Grammar', ...judged },
      ],
    });

  it.each([
    ['a level the criterion does not have', task({ level: 'Excellent' })],
    ['a score on a criterion with levels', task({ level: 'Met', score: 1 })],
    ['a maxScore on a criterion with levels', task({ level: 'Met', maxScore: 3 })],
    ['a level on a criterion without levels', grammar({ level: 'Met', score: 1 })],
    ['probabilities on a criterion without levels', grammar({ score: 1, probabilities: [1] })],
    ['probabilities for fewer levels', task({ level: 'Met', probabilities: [0.2, 0.8] })],
    ['probabilities that do not sum to 1', task({ level: 'Met', probabilities: [0.1, 0.1, 0.7] })],
    ['a negative probability', task({ level: 'Met', probabilities: [-0.1, 0.1, 1] })],
    ['a probability above 1', task({ level: 'Met', probabilities: [0, 0, 1.0000005] })],
    ['a probability that is NaN', task({ level: 'Met', probabilities: [0.2, Number.NaN, 0.8] })],
    [
      'a hole in the probabilities',
      task({ level: 'Met', probabilities: Object.assign(new Array(3), { 0: 0.2, 2: 0.8 }) }),
    ],
    ['a probability that is not a number', task({ level: 'Met', probabilities: [0, '0.2', 0.8] })],
    [
      'a chosen level less likely than another',
      task({ level: 'Partly met', probabilities: [0.1, 0.3, 0.6] }),
    ],
    ['a score above its maximum', grammar({ score: 101, maxScore: 100 })],
    ['a score above 1 with no maximum', grammar({ score: 1.5 })],
    ['a score a millionth above its maximum', grammar({ score: 1 + 1e-6 })],
    [
      'probabilities a ten-thousandth from summing to 1',
      task({ level: 'Met', probabilities: [0.1, 0.1, 0.8001] }),
    ],
    ['a negative score', grammar({ score: -0.1 })],
    ['a maximum of 0', grammar({ score: 0, maxScore: 0 })],
  ])('out-of-scale: %s', (_label, raw) => {
    expect(refusal(raw)).toBe('out-of-scale');
  });

  it.each([
    ['a reply that is not an object', 'Grade: B1'],
    ['a reply that is an array', [reply()]],
    ['criteria that are not a list', reply({ criteria: { Task: 'Met' } })],
    ['a criterion that is not an object', reply({ criteria: ['Task', reply().criteria[1]] })],
    ['a criterion with no name', reply({ criteria: [{ level: 'Met' }, reply().criteria[1]] })],
    ['a level that is not text', task({ level: 2 })],
    ['a score that is text', grammar({ score: '80' })],
    ['a score that is NaN', grammar({ score: Number.NaN })],
    ['a maximum that is infinite', grammar({ score: 1, maxScore: Number.POSITIVE_INFINITY })],
    ['a maxScore that is text', grammar({ score: 80, maxScore: '100' })],
    ['probabilities that are not a list', task({ level: 'Met', probabilities: '0.8' })],
    [
      'notApplicable that is not a boolean',
      reply({
        criteria: [reply().criteria[0], { name: 'Grammar', score: 1, notApplicable: 'no' }],
      }),
    ],
    ['requiresHumanReview that is not a boolean', reply({ requiresHumanReview: 'yes' })],
    ['feedback that is not text', reply({ feedback: { text: 'Hi' } })],
    ['a comment that is not text', grammar({ score: 1, comment: 5 })],
  ])('malformed: %s', (_label, raw) => {
    expect(refusal(raw)).toBe('malformed');
  });

  it('misquotes-answer: a correction of words the response does not hold', () => {
    expect(refusal(reply({ corrections: [{ original: 'goed', corrected: 'went' }] }))).toBe(
      'misquotes-answer',
    );
  });

  it('too-long: a comment, the feedback or the rationale past its limit, and not at it', () => {
    expect(refusal(grammar({ score: 1, comment: 'x'.repeat(501) }))).toBe('too-long');
    expect(refusal(reply({ feedback: 'x'.repeat(2001) }))).toBe('too-long');
    expect(refusal(reply({ rationale: 'x'.repeat(2001) }))).toBe('too-long');
    expect(refusal(grammar({ score: 1, comment: 'x'.repeat(500) }))).toBe('accepted');
    expect(refusal(reply({ feedback: 'x'.repeat(2000) }))).toBe('accepted');
    expect(refusal(reply({ rationale: 'x'.repeat(2000) }))).toBe('accepted');
  });
});
