import { describe, expect, it } from 'vitest';
import {
  AI_TEXT_MAX_LENGTH,
  aiAllowedByContent,
  aiExplanationRequest,
  aiGradeOf,
  aiHintRequest,
  aiSupports,
  buildAiFacts,
  checkAiExplanation,
  checkAiHint,
  hintRevealsAnswer,
  readAiTextResult,
} from '../ai.js';
import { assertRedacted, redact } from '../redact.js';
import { validateActivity } from '../schemas/index.js';
import { jsonSchemaFor } from '../schemas/json-schema.js';
import { alignDictation } from '../scoring/index.js';
import type {
  DictationData,
  FillInTheBlanksData,
  GapSelectData,
  ItemOutcome,
  MultipleChoiceData,
  ScoringDetail,
  WrittenResponseData,
} from '../types/activity.js';
import type { AiItemFacts } from '../types/ai.js';

/**
 * The learner-facing AI contract: the facts a model is given, the requests
 * built from them, and the checks on what comes back. Nothing here calls a
 * model — the SDK never does — so every case is a pure function of data.
 */

const mc: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'mc-1',
  title: 'Estar',
  question: '¿Cuál es correcta?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  locale: 'es',
  options: [
    { id: 'a', text: 'Ella está cansada', isCorrect: true, feedback: 'Un estado.' },
    { id: 'b', text: 'Ella es cansada', isCorrect: false },
    { id: 'c', text: 'Ella están cansada', isCorrect: false },
  ],
};

const vowels: MultipleChoiceData = {
  ...mc,
  id: 'mc-vowels',
  question: 'Which are vowels?',
  mode: 'multi',
  scoringStrategy: 'partial',
  options: [
    { id: 'a', text: 'A', isCorrect: true },
    { id: 'k', text: 'K', isCorrect: false },
    { id: 'e', text: 'E', isCorrect: true },
  ],
};

// Blanks listed in the OPPOSITE order to the passage: facts follow the passage.
const fib: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'fib-1',
  title: 'Spelling',
  passage: 'My last name {{b}} Rossi and I live in {{a}}.',
  blanks: [
    { id: 'a', acceptedAnswers: ['Tokyo', 'Tōkyō'], feedback: 'The capital.' },
    { id: 'b', acceptedAnswers: ['is'], hint: 'A verb.' },
  ],
  scoringStrategy: 'partial',
};

const gaps: GapSelectData = {
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'gs-1',
  title: 'At the hotel',
  passage: 'What is your last {{x}}? My last name {{y}} Rossi.',
  banks: [
    {
      id: 'words',
      choices: [
        { id: 'name', text: 'name' },
        { id: 'is', text: 'is' },
        { id: 'are', text: 'are' },
      ],
    },
  ],
  gaps: [
    { id: 'x', bankId: 'words', correctChoiceId: 'name' },
    { id: 'y', bankId: 'words', correctChoiceId: 'is', feedback: 'Third person.' },
  ],
  scoringStrategy: 'partial',
};

const dictation: DictationData = {
  schemaVersion: '1.0',
  type: 'dictation',
  id: 'dc-1',
  title: 'Dictation one',
  transcript: 'The cat sat',
};

const written: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'wr-1',
  title: 'Essay',
  prompt: 'Describe your town.',
} as WrittenResponseData;

describe('what AI may do, and where', () => {
  it('supports explanations for four types and hints for three', () => {
    for (const type of ['multiple-choice', 'fill-in-the-blanks', 'gap-select', 'dictation']) {
      expect(aiSupports(type, 'explanation'), type).toBe(true);
    }
    for (const type of ['multiple-choice', 'fill-in-the-blanks', 'gap-select']) {
      expect(aiSupports(type, 'hint'), type).toBe(true);
    }
    expect(aiSupports('dictation', 'hint')).toBe(false);
    expect(aiSupports('written-response', 'explanation')).toBe(false);
    expect(aiSupports('read-aloud', 'hint')).toBe(false);
  });

  it('lets an author switch a feature off, never on', () => {
    expect(aiAllowedByContent(mc, 'hint')).toBe(true);
    expect(aiAllowedByContent({ ...mc, ai: { hints: false } }, 'hint')).toBe(false);
    expect(aiAllowedByContent({ ...mc, ai: { hints: false } }, 'explanation')).toBe(true);
    expect(aiAllowedByContent({ ...mc, ai: { explanations: false } }, 'explanation')).toBe(false);
    expect(aiAllowedByContent({ ...mc, ai: { hints: true } }, 'hint')).toBe(true);
    // A malformed value is no switch at all.
    expect(aiAllowedByContent({ ...mc, ai: 'off' } as never, 'hint')).toBe(true);
    expect(aiAllowedByContent({ ...mc, ai: null } as never, 'hint')).toBe(true);
  });

  it('reads a grade as all marks, some, or none', () => {
    expect(aiGradeOf({ score: 1, maxScore: 1, passed: true }).category).toBe('correct');
    expect(aiGradeOf({ score: 0, maxScore: 1, passed: false }).category).toBe('incorrect');
    expect(aiGradeOf({ score: 0.5, maxScore: 1, passed: false }).category).toBe('partly-correct');
    expect(aiGradeOf({ score: 0.7, maxScore: 1, passed: true }).category).toBe('partly-correct');
    // A float a hair either side of full marks is full marks.
    expect(aiGradeOf({ score: 0.1 + 0.2, maxScore: 0.3, passed: true }).category).toBe('correct');
    expect(aiGradeOf({ score: 0.3, maxScore: 0.1 + 0.2, passed: true }).category).toBe('correct');
    expect(aiGradeOf({ score: 0, maxScore: 0, passed: false }).category).toBe('incorrect');
  });
});

describe('buildAiFacts: what a model is told', () => {
  it('describes each multiple-choice option: its text, whether chosen, whether right', () => {
    const facts = buildAiFacts(mc, { type: 'multiple-choice', selectedOptionIds: ['b'] }, null);
    expect(facts).toEqual({
      activityId: 'mc-1',
      title: 'Estar',
      locale: 'es',
      activityType: 'multiple-choice',
      question: '¿Cuál es correcta?',
      mode: 'single',
      options: [
        {
          id: 'a',
          text: 'Ella está cansada',
          chosen: false,
          correct: true,
          feedback: 'Un estado.',
        },
        { id: 'b', text: 'Ella es cansada', chosen: true, correct: false },
        { id: 'c', text: 'Ella están cansada', chosen: false, correct: false },
      ],
    });
  });

  it('reads a redacted option’s correctness from the server’s details, and none without them', () => {
    const projection = redact(mc);
    const details: ScoringDetail[] = [
      {
        itemId: 'a',
        outcome: 'incorrect-omission',
        learnerResponse: [],
        correctResponse: [],
      },
      {
        itemId: 'b',
        outcome: 'incorrect',
        learnerResponse: [],
        correctResponse: [],
      },
      // Stored before 0.3: `correct` and no `outcome`. On an option it meant
      // "acted rightly on it", so an unchosen option that reads true is not
      // part of the answer.
      {
        itemId: 'c',
        correct: true,
        learnerResponse: [],
        correctResponse: [],
      } as unknown as ScoringDetail,
    ];
    const response = { type: 'multiple-choice' as const, selectedOptionIds: ['b'] };
    const facts = buildAiFacts(projection, response, details);
    expect(
      facts?.activityType === 'multiple-choice' && facts.options.map((o) => o.correct),
    ).toEqual([true, false, false]);
    // Stored before 0.3 throughout: the flag is read with the selection, so an
    // unchosen option the learner was wrong to leave is part of the answer.
    const stored = [
      { itemId: 'a', correct: false, learnerResponse: [], correctResponse: [] },
      { itemId: 'b', correct: false, learnerResponse: [], correctResponse: [] },
      { itemId: 'c', correct: true, learnerResponse: [], correctResponse: [] },
    ] as unknown as ScoringDetail[];
    const read = buildAiFacts(projection, response, stored);
    expect(read?.activityType === 'multiple-choice' && read.options.map((o) => o.correct)).toEqual([
      true,
      false,
      false,
    ]);
    const bare = buildAiFacts(projection, response, null);
    expect(bare?.activityType === 'multiple-choice' && bare.options.map((o) => o.correct)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('numbers blanks in passage order, whatever order the author listed them in', () => {
    const response = { type: 'fill-in-the-blanks' as const, answers: { a: 'tokio', b: 'is' } };
    const details: ScoringDetail[] = [
      { itemId: 'a', outcome: 'incorrect', learnerResponse: ['tokio'], correctResponse: ['Tokyo'] },
      { itemId: 'b', outcome: 'correct', learnerResponse: ['is'], correctResponse: ['is'] },
    ];
    expect(buildAiFacts(fib, response, details)).toEqual({
      activityId: 'fib-1',
      title: 'Spelling',
      activityType: 'fill-in-the-blanks',
      passage: 'My last name [1] Rossi and I live in [2].',
      blanks: [
        { id: 'b', position: 1, typed: 'is', accepted: ['is'], correct: true, hint: 'A verb.' },
        {
          id: 'a',
          position: 2,
          typed: 'tokio',
          accepted: ['Tokyo', 'Tōkyō'],
          correct: false,
          feedback: 'The capital.',
        },
      ],
    });
  });

  it('takes a redacted blank’s answers from the server’s details, and gives none without them', () => {
    const projection = redact(fib);
    const response = { type: 'fill-in-the-blanks' as const, answers: {} };
    const details: ScoringDetail[] = [
      { itemId: 'b', outcome: 'incorrect', learnerResponse: [''], correctResponse: ['is'] },
    ];
    const facts = buildAiFacts(projection, response, details);
    expect(
      facts?.activityType === 'fill-in-the-blanks' &&
        facts.blanks.map((b) => [b.id, b.accepted, b.correct, b.typed]),
    ).toEqual([
      ['b', ['is'], false, ''],
      ['a', null, null, ''],
    ]);
  });

  it('names each gap’s words, the one chosen and the right one, from a shared bank', () => {
    const response = { type: 'gap-select' as const, selections: { y: 'are' } };
    const facts = buildAiFacts(gaps, response, null);
    expect(facts).toEqual({
      activityId: 'gs-1',
      title: 'At the hotel',
      activityType: 'gap-select',
      passage: 'What is your last [1]? My last name [2] Rossi.',
      gaps: [
        {
          id: 'x',
          position: 1,
          choices: ['name', 'is', 'are'],
          chosen: null,
          answer: 'name',
          correct: null,
        },
        {
          id: 'y',
          position: 2,
          choices: ['name', 'is', 'are'],
          chosen: 'are',
          answer: 'is',
          correct: null,
          feedback: 'Third person.',
        },
      ],
    });
  });

  it('names a gap’s words, never its choice ids', () => {
    const coded: GapSelectData = {
      ...gaps,
      passage: 'She {{g}} tired.',
      banks: [],
      gaps: [
        {
          id: 'g',
          choices: [
            { id: 'c1', text: 'is' },
            { id: 'c2', text: 'are' },
          ],
          correctChoiceId: 'c1',
        },
      ],
    };
    const facts = buildAiFacts(coded, { type: 'gap-select', selections: { g: 'c2' } }, null);
    expect(facts?.activityType === 'gap-select' && facts.gaps[0]).toMatchObject({
      choices: ['is', 'are'],
      chosen: 'are',
      answer: 'is',
    });
  });

  it('turns a redacted gap’s answer id from the server into its word', () => {
    const projection = redact(gaps);
    const details: ScoringDetail[] = [
      { itemId: 'y', outcome: 'incorrect', learnerResponse: ['are'], correctResponse: ['is'] },
    ];
    const facts = buildAiFacts(
      projection,
      { type: 'gap-select', selections: { y: 'are' } },
      details,
    );
    expect(facts?.activityType === 'gap-select' && facts.gaps.map((g) => g.answer)).toEqual([
      null,
      'is',
    ]);
  });

  it('aligns a dictation word by word with the SDK’s own alignment', () => {
    const facts = buildAiFacts(dictation, { type: 'dictation', text: 'the bat' }, null);
    expect(facts).toMatchObject({
      activityType: 'dictation',
      transcript: 'The cat sat',
      typed: 'the bat',
    });
    const words = facts?.activityType === 'dictation' ? facts.words : null;
    // The scorer's own pairing, word for word — not a second opinion on it.
    expect(words).toEqual(
      alignDictation(dictation, 'the bat').words.map((word) => ({
        expected: word.reference,
        typed: word.attempt,
        status: word.status,
      })),
    );
    expect(words?.some((word) => word.status !== 'correct')).toBe(true);
  });

  it('keeps a redacted dictation’s transcript out, and words only from the server’s details', () => {
    const projection = redact(dictation);
    const details: ScoringDetail[] = [
      // Stored before 0.3: `correct` and no `outcome`, read as it was meant.
      {
        itemId: 'w1',
        correct: true,
        learnerResponse: 'the',
        correctResponse: 'the',
      } as unknown as ScoringDetail,
      { itemId: 'w2', outcome: 'incorrect-omission', learnerResponse: '', correctResponse: 'cat' },
      { itemId: 'w3', outcome: 'incorrect', learnerResponse: 'dog', correctResponse: '' },
      { itemId: 'w4', outcome: 'incorrect', learnerResponse: 'mat', correctResponse: 'sat' },
    ];
    const facts = buildAiFacts(projection, { type: 'dictation', text: 'the dog mat' }, details);
    expect(facts).toMatchObject({ transcript: null, typed: 'the dog mat' });
    expect(facts?.activityType === 'dictation' && facts.words?.map((w) => w.status)).toEqual([
      'correct',
      'missing',
      'extra',
      'incorrect',
    ]);
    const bare = buildAiFacts(projection, { type: 'dictation', text: 'x' }, null);
    expect(bare?.activityType === 'dictation' && bare.words).toBeNull();
  });

  it('builds nothing for a type it has no facts for', () => {
    expect(buildAiFacts(written, null, null)).toBeNull();
  });
});

describe('aiExplanationRequest', () => {
  it('asks about the answer as the SDK graded it', () => {
    const request = aiExplanationRequest({
      data: mc,
      response: { type: 'multiple-choice', selectedOptionIds: ['b'] },
      learnerLocale: 'pt-BR',
    });
    expect(request).toMatchObject({
      feature: 'explanation',
      grade: { score: 0, maxScore: 1, passed: false, category: 'incorrect' },
      learnerLocale: 'pt-BR',
      facts: { activityType: 'multiple-choice' },
    });
  });

  it('speaks to the grade of record: a scored outcome wins over grading locally', () => {
    const outcome: ItemOutcome = {
      status: 'scored',
      score: 1,
      maxScore: 1,
      passed: true,
      feedback: null,
      details: [],
    };
    const request = aiExplanationRequest({
      data: mc,
      response: { type: 'multiple-choice', selectedOptionIds: ['b'] },
      outcome,
    });
    expect(request?.grade.category).toBe('correct');
  });

  it('asks nothing when the grade of record cannot be a grade, rather than explain it', () => {
    // A wrong answer (b) whose stored outcome claims 85 "out of 1" used to go
    // to the model as `correct` and passed; NaN went as a null score. Grading
    // locally instead would speak to a grade the screen does not show.
    const response = { type: 'multiple-choice' as const, selectedOptionIds: ['b'] };
    for (const [score, maxScore] of [
      [85, 1],
      [Number.NaN, 1],
      [Number.POSITIVE_INFINITY, 1],
      [-0.5, 1],
      [1 + 2e-9, 1],
      [0.5, 0],
      [0.5, -1],
      ['0.85' as unknown as number, 1],
    ] as const) {
      const outcome: ItemOutcome = {
        status: 'scored',
        score,
        maxScore,
        passed: true,
        feedback: null,
        details: [],
      };
      expect(aiExplanationRequest({ data: mc, response, outcome })).toBeNull();
      expect(aiExplanationRequest({ data: redact(mc), response, outcome })).toBeNull();
    }
  });

  it('reads the grade of record once, so a getter cannot pass the check and hand on another score', () => {
    let reads = 0;
    const outcome = {
      status: 'scored',
      maxScore: 1,
      passed: false,
      feedback: null,
      details: [],
      get score() {
        reads += 1;
        return reads === 1 ? 0 : 85;
      },
    } as ItemOutcome;
    const request = aiExplanationRequest({
      data: mc,
      response: { type: 'multiple-choice', selectedOptionIds: ['b'] },
      outcome,
    });
    expect(reads).toBe(1);
    expect(request?.grade).toMatchObject({ score: 0, category: 'incorrect' });
  });

  it('still explains a grade of record a hair over its maximum, unchanged', () => {
    const outcome: ItemOutcome = {
      status: 'scored',
      score: 1 + 1e-10,
      maxScore: 1,
      passed: true,
      feedback: null,
      details: [],
    };
    const request = aiExplanationRequest({
      data: mc,
      response: { type: 'multiple-choice', selectedOptionIds: ['a'] },
      outcome,
    });
    expect(request?.grade).toEqual({
      score: 1 + 1e-10,
      maxScore: 1,
      passed: true,
      category: 'correct',
    });
  });

  it('explains a redacted item only from a scored outcome', () => {
    const projection = redact(mc);
    const response = { type: 'multiple-choice' as const, selectedOptionIds: ['a'] };
    expect(aiExplanationRequest({ data: projection, response })).toBeNull();
    const deferred: ItemOutcome = {
      status: 'deferred',
      reason: 'requires_async_grading',
      maxScore: 1,
    };
    expect(aiExplanationRequest({ data: projection, response, outcome: deferred })).toBeNull();
    const scored: ItemOutcome = {
      status: 'scored',
      score: 1,
      maxScore: 1,
      passed: true,
      feedback: null,
      details: [
        {
          itemId: 'a',
          outcome: 'correct',
          learnerResponse: [],
          correctResponse: [],
        },
      ],
    };
    const request = aiExplanationRequest({ data: projection, response, outcome: scored });
    expect(
      request?.facts.activityType === 'multiple-choice' && request.facts.options[0]?.correct,
    ).toBe(true);
  });

  it('asks nothing when the author switched explanations off, the type is unsupported, or nothing was answered', () => {
    const response = { type: 'multiple-choice' as const, selectedOptionIds: ['a'] };
    expect(
      aiExplanationRequest({ data: { ...mc, ai: { explanations: false } }, response }),
    ).toBeNull();
    expect(aiExplanationRequest({ data: written, response: null })).toBeNull();
    expect(aiExplanationRequest({ data: mc, response: null })).toBeNull();
  });

  it('asks nothing when the scorer cannot grade the item', () => {
    const broken = { ...fib, blanks: undefined } as unknown as FillInTheBlanksData;
    expect(
      aiExplanationRequest({ data: broken, response: { type: 'fill-in-the-blanks', answers: {} } }),
    ).toBeNull();
  });
});

describe('aiHintRequest', () => {
  it('numbers the hint, copies the ones before it, and tells the model what is right so far', () => {
    const previous = ['Think about states.'];
    const request = aiHintRequest({
      data: fib,
      response: { type: 'fill-in-the-blanks', answers: { b: 'is' } },
      previousHints: previous,
    });
    expect(request?.hintNumber).toBe(2);
    expect(request?.previousHints).toEqual(previous);
    expect(request?.previousHints).not.toBe(previous);
    expect(
      request?.facts.activityType === 'fill-in-the-blanks' &&
        request.facts.blanks.map((b) => [b.id, b.correct]),
    ).toEqual([
      ['b', true],
      ['a', false],
    ]);
  });

  it('starts from an empty answer when the learner has touched nothing', () => {
    const request = aiHintRequest({ data: mc, response: null, previousHints: [] });
    expect(request?.hintNumber).toBe(1);
    expect(
      request?.facts.activityType === 'multiple-choice' &&
        request.facts.options.every((o) => !o.chosen),
    ).toBe(true);
  });

  it('asks nothing for a switched-off item, a dictation, or a redacted item', () => {
    expect(
      aiHintRequest({ data: { ...mc, ai: { hints: false } }, response: null, previousHints: [] }),
    ).toBeNull();
    expect(aiHintRequest({ data: dictation, response: null, previousHints: [] })).toBeNull();
    expect(aiHintRequest({ data: redact(mc), response: null, previousHints: [] })).toBeNull();
  });
});

describe('reading what a port returned', () => {
  it('refuses anything but an object with a string text, and a verdict it does not know', () => {
    for (const raw of [null, undefined, 'text', 42, ['a'], {}, { text: 3 }]) {
      expect(readAiTextResult(raw), JSON.stringify(raw)).toEqual({
        ok: false,
        refusal: 'malformed',
      });
    }
    expect(readAiTextResult({ text: 'Fine.', verdict: 'maybe' })).toEqual({
      ok: false,
      refusal: 'malformed',
    });
  });

  it('cleans the text a learner will read, and refuses one with nothing left', () => {
    expect(readAiTextResult({ text: '  \u0007One\r\nTwo\r\r\n\n\n\nThree\u2028 ' })).toEqual({
      ok: true,
      result: { text: 'One\nTwo\n\nThree' },
    });
    expect(readAiTextResult({ text: ' \n\t ' })).toEqual({ ok: false, refusal: 'empty' });
    expect(readAiTextResult({ text: '\u0000\u0001' })).toEqual({ ok: false, refusal: 'empty' });
  });

  it('refuses a text longer than the limit rather than cutting it, counting code points', () => {
    const atLimit = '😀'.repeat(AI_TEXT_MAX_LENGTH);
    expect(readAiTextResult({ text: atLimit }).ok).toBe(true);
    expect(readAiTextResult({ text: `${atLimit}x` })).toEqual({ ok: false, refusal: 'too-long' });
  });

  it('keeps only short string provenance fields', () => {
    const read = readAiTextResult({
      text: 'Hi',
      provenance: { model: 'm-1', promptHash: 7, generatedAt: 'x'.repeat(201), extra: 'y' },
    });
    expect(read).toEqual({ ok: true, result: { text: 'Hi', provenance: { model: 'm-1' } } });
    expect(readAiTextResult({ text: 'Hi', provenance: { model: '' } })).toEqual({
      ok: true,
      result: { text: 'Hi' },
    });
  });

  it('keeps what the call cost, and only numbers that can be a cost', () => {
    expect(
      readAiTextResult({
        text: 'Hi',
        usage: { promptTokens: 1200, completionTokens: 0, costUsd: 0.0021 },
      }),
    ).toEqual({
      ok: true,
      result: { text: 'Hi', usage: { promptTokens: 1200, completionTokens: 0, costUsd: 0.0021 } },
    });
    // A negative count, a count that is not a number, and a cost of NaN say
    // nothing about what was spent — and would poison a host's totals.
    expect(
      readAiTextResult({
        text: 'Hi',
        usage: { promptTokens: -1, completionTokens: '40', costUsd: Number.NaN, extra: 3 },
      }),
    ).toEqual({ ok: true, result: { text: 'Hi' } });
    expect(readAiTextResult({ text: 'Hi', usage: { costUsd: Number.POSITIVE_INFINITY } })).toEqual({
      ok: true,
      result: { text: 'Hi' },
    });
    expect(readAiTextResult({ text: 'Hi', usage: 'lots' })).toEqual({
      ok: true,
      result: { text: 'Hi' },
    });
  });

  it('refuses an explanation of a verdict other than the SDK’s', () => {
    const request = aiExplanationRequest({
      data: mc,
      response: { type: 'multiple-choice', selectedOptionIds: ['b'] },
    });
    if (request === null) {
      throw new Error('expected a request');
    }
    expect(checkAiExplanation({ text: 'Well done!', verdict: 'correct' }, request)).toEqual({
      ok: false,
      refusal: 'contradicts-grade',
    });
    expect(checkAiExplanation({ text: 'Not quite.', verdict: 'incorrect' }, request).ok).toBe(true);
    expect(checkAiExplanation({ text: 'No verdict stated.' }, request).ok).toBe(true);
    expect(checkAiExplanation({ text: '' }, request)).toEqual({ ok: false, refusal: 'empty' });
  });

  it('refuses a hint that gives the answer away', () => {
    const request = aiHintRequest({ data: fib, response: null, previousHints: [] });
    if (request === null) {
      throw new Error('expected a request');
    }
    expect(checkAiHint({ text: 'The city is Tokyo.' }, request)).toEqual({
      ok: false,
      refusal: 'reveals-answer',
    });
    expect(checkAiHint({ text: 'Think of the capital of Japan.' }, request).ok).toBe(true);
    expect(checkAiHint({ text: 42 }, request)).toEqual({ ok: false, refusal: 'malformed' });
  });
});

describe('hintRevealsAnswer: the floor under every hint', () => {
  const factsOf = (
    data: MultipleChoiceData | FillInTheBlanksData | GapSelectData | DictationData,
  ): AiItemFacts => {
    const facts = buildAiFacts(data, null, null);
    if (facts === null) {
      throw new Error('expected facts');
    }
    return facts;
  };

  it('finds a correct option written out, ignoring case, accents and punctuation', () => {
    const facts = factsOf(mc);
    expect(hintRevealsAnswer(facts, 'Try: "ELLA ESTA CANSADA!"')).toBe(true);
    expect(hintRevealsAnswer(facts, 'Ella   está, cansada')).toBe(true);
    // A wrong option is no leak, and neither is the right one's first words alone.
    expect(hintRevealsAnswer(facts, 'It is not "ella es cansada".')).toBe(false);
    expect(hintRevealsAnswer(facts, 'Think about how ella feels.')).toBe(false);
  });

  it('matches whole words only', () => {
    const facts = factsOf({
      ...mc,
      options: [
        { id: 'a', text: 'cat', isCorrect: true },
        { id: 'b', text: 'dog', isCorrect: false },
      ],
    });
    expect(hintRevealsAnswer(facts, 'Which category fits?')).toBe(false);
    expect(hintRevealsAnswer(facts, 'It is a cat.')).toBe(true);
  });

  it('refuses a hint that lists the vowels a multi-select item asks for', () => {
    expect(hintRevealsAnswer(factsOf(vowels), 'The letters A and E are vowels.')).toBe(true);
  });

  it('withholds a hint on facts it cannot read, rather than show it unchecked', () => {
    const unknown = { activityType: 'matching', pairs: [] } as unknown as AiItemFacts;
    expect(hintRevealsAnswer(unknown, 'Anything at all.')).toBe(true);
  });

  it('removes accents rather than splitting a word at them', () => {
    const facts = factsOf({
      ...mc,
      options: [
        { id: 'a', text: 'cañón', isCorrect: true },
        { id: 'b', text: 'río', isCorrect: false },
      ],
    });
    // Split at its marks, "cañón" would read as "can on".
    expect(hintRevealsAnswer(facts, 'A can on the shelf.')).toBe(false);
    expect(hintRevealsAnswer(facts, 'Think: CANON.')).toBe(true);
  });

  it('reads compatibility forms as the letters they stand for', () => {
    const facts = factsOf({
      ...mc,
      options: [
        { id: 'a', text: 'Tokyo', isCorrect: true },
        { id: 'b', text: 'Kyoto', isCorrect: false },
      ],
    });
    expect(hintRevealsAnswer(facts, 'Ｔｏｋｙｏ')).toBe(true);
  });

  it('lets a hint use a short answer word freely, and refuses it only where the answer goes', () => {
    const facts = factsOf(fib);
    expect(hintRevealsAnswer(facts, 'The verb is in the present tense.')).toBe(false);
    expect(hintRevealsAnswer(facts, 'My last name is Rossi.')).toBe(true);
    expect(hintRevealsAnswer(facts, 'It goes: name is …')).toBe(true);
    expect(hintRevealsAnswer(facts, 'Say “is Rossi”.')).toBe(true);
    // A longer answer counts anywhere, and so does any accepted form of it.
    expect(hintRevealsAnswer(facts, 'Think of Tōkyō.')).toBe(true);
    expect(hintRevealsAnswer(facts, 'A big city in Japan.')).toBe(false);
  });

  it('searches for a short answer on its own when its gap has no neighbours', () => {
    const facts = factsOf({
      ...fib,
      passage: '{{b}}',
      blanks: [{ id: 'b', acceptedAnswers: ['is'] }],
    });
    expect(hintRevealsAnswer(facts, 'It is a verb.')).toBe(true);
  });

  it('checks gap-select answers the same way', () => {
    const facts = factsOf(gaps);
    expect(hintRevealsAnswer(facts, 'The word is a noun you give at a hotel.')).toBe(false);
    expect(hintRevealsAnswer(facts, 'Your last name please.')).toBe(true);
    expect(hintRevealsAnswer(facts, 'Say: my last name is Rossi.')).toBe(true);
    expect(hintRevealsAnswer(facts, 'The verb agrees with "name".')).toBe(true);
  });

  it('never refuses a dictation hint, since none is ever asked for', () => {
    expect(hintRevealsAnswer(factsOf(dictation), 'The cat sat')).toBe(false);
  });

  it('never matches an empty answer', () => {
    const facts = factsOf({
      ...fib,
      passage: 'A {{a}}',
      blanks: [{ id: 'a', acceptedAnswers: ['...'] }],
    });
    expect(hintRevealsAnswer(facts, 'Anything at all ...')).toBe(false);
  });
});

describe('the author’s switch in content', () => {
  it('validates as two optional flags, keeps keys a later release adds, and refuses a non-boolean', () => {
    expect(validateActivity('multiple-choice', { ...mc, ai: { hints: false } }).success).toBe(true);
    const later = validateActivity('multiple-choice', {
      ...mc,
      ai: { hints: false, moreLikeThis: true },
    });
    expect(later.success && (later.data as { ai?: unknown }).ai).toEqual({
      hints: false,
      moreLikeThis: true,
    });
    expect(validateActivity('multiple-choice', { ...mc, ai: { hints: 'no' } }).success).toBe(false);
    for (const [type, data] of [
      ['fill-in-the-blanks', fib],
      ['gap-select', gaps],
      ['dictation', dictation],
    ] as const) {
      expect(validateActivity(type, { ...data, ai: { explanations: 'no' } }).success, type).toBe(
        false,
      );
    }
  });

  it('survives redaction flag by flag, and drops what the policy does not name', () => {
    const projection = redact({
      ...mc,
      ai: { explanations: false, hints: true, grader: 'secret' },
    } as MultipleChoiceData);
    expect((projection as { ai?: unknown }).ai).toEqual({ explanations: false, hints: true });
    expect(() => assertRedacted(projection)).not.toThrow();
  });

  it('appears in the exported JSON Schema', () => {
    const schema = jsonSchemaFor('gap-select') as { properties?: Record<string, unknown> };
    expect(schema.properties?.ai).toBeDefined();
  });
});
