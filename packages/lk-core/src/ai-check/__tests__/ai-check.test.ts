import { describe, expect, it, vi } from 'vitest';
import type {
  AiCoachingRequest,
  AiCritiqueRequest,
  AiDraftsRequest,
  AiExplanationRequest,
  AiHintRequest,
  AiTextResult,
  AiWritingFeedbackRequest,
} from '../../types/ai.js';
import { type AiCheckCase, aiCheckCases, formatAiCheckReport, runAiCheck } from '../index.js';

/**
 * The kit a host runs against its own prompt. What is under test here is the
 * kit itself: that its cases are real calls with the answers the SDK knows,
 * that a refusal is reported rather than thrown, and that a port that fails
 * cannot hide the cases after it.
 */

const cases = aiCheckCases();
const find = (id: string): AiCheckCase => {
  const one = cases.find((c) => c.id === id);
  if (one === undefined) {
    throw new Error(`no case "${id}"`);
  }
  return one;
};

/** A port that answers every call with the same text. */
const says = (text: string, over: Partial<AiTextResult> = {}) =>
  vi.fn(async (): Promise<AiTextResult> => ({ text, ...over }));

describe('aiCheckCases', () => {
  it('covers every type the SDK explains, and every type it hints for', () => {
    const explaining = cases.filter((one) => one.feature === 'explanation');
    const hinting = cases.filter((one) => one.feature === 'hint');
    const typesOf = (list: AiCheckCase[]) =>
      new Set(list.map((one) => (one.request.facts as { activityType: string }).activityType));

    expect(typesOf(explaining)).toEqual(
      new Set(['multiple-choice', 'fill-in-the-blanks', 'gap-select', 'dictation']),
    );
    // Dictation has word hints of its own, so the SDK gives it none.
    expect(typesOf(hinting)).toEqual(
      new Set(['multiple-choice', 'fill-in-the-blanks', 'gap-select']),
    );
    expect(new Set(cases.map((one) => one.id)).size).toBe(cases.length);
  });

  it('carries the SDK’s own grade, so a model is checked against a verdict it did not reach', () => {
    const grade = (id: string) => (find(id).request as AiExplanationRequest).grade;

    expect(grade('mc-correct').category).toBe('correct');
    expect(grade('mc-wrong').category).toBe('incorrect');
    expect(grade('fib-partly').category).toBe('partly-correct');
    expect(grade('fib-partly').score).toBeGreaterThan(0);
    expect(grade('fib-partly').score).toBeLessThan(grade('fib-partly').maxScore);
  });

  it('numbers a hint by the hints before it', () => {
    expect((find('mc-hint-1').request as AiHintRequest).hintNumber).toBe(1);
    expect((find('mc-hint-2').request as AiHintRequest).hintNumber).toBe(2);
    expect((find('mc-hint-2').request as AiHintRequest).previousHints).toHaveLength(1);
  });

  it('drafts an essay with mistakes, without, revised, and with feedback asked for in another language', () => {
    const writing = cases.filter((one) => one.feature === 'writing-feedback');
    expect(writing.map((one) => one.id)).toEqual([
      'writing-mistakes',
      'writing-clean',
      'writing-revised',
      'writing-feedback-in-spanish',
    ]);
    const revised = find('writing-revised').request as AiWritingFeedbackRequest;
    expect(revised.draftNumber).toBe(2);
    expect(revised.facts.rubric?.map((criterion) => criterion.name)).toEqual([
      'Grammar',
      'Vocabulary',
      'Task',
    ]);
    expect(
      (find('writing-feedback-in-spanish').request as AiWritingFeedbackRequest).learnerLocale,
    ).toBe('es');
  });

  it('drafts from a reading each type alone, and a video quiz of several types from timed captions and from a script', () => {
    const drafting = cases.filter((one) => one.feature === 'draft-generation');
    expect(
      drafting.map((one) => [
        one.id,
        (one.request as AiDraftsRequest).facts.activityTypes.join(' > '),
      ]),
    ).toEqual([
      ['drafts-questions', 'multiple-choice'],
      ['drafts-cloze', 'fill-in-the-blanks'],
      ['drafts-gaps', 'gap-select'],
      ['drafts-writing', 'written-response'],
      ['drafts-video', 'multiple-choice > dictation > read-aloud'],
      ['drafts-script', 'multiple-choice > dictation > read-aloud'],
    ]);
    const video = find('drafts-video').request as AiDraftsRequest;
    expect(
      video.facts.source.kind === 'captions' && video.facts.source.captions.map((one) => one.end),
    ).toEqual([4.2, 8.9, 12.6, 18.1]);
    // As many as the video is worth: no count, from either source.
    expect(video.facts).not.toHaveProperty('count');
    expect((find('drafts-script').request as AiDraftsRequest).facts.source.kind).toBe('transcript');
    expect(video.settings?.['read-aloud']).toMatchObject({ locale: 'en-US' });
  });

  it('reviews for an author a question with a second answer, a task above its level, a clean cloze, and in Spanish', () => {
    const critiques = cases.filter((one) => one.feature === 'item-critique');
    expect(critiques.map((one) => one.id)).toEqual([
      'critique-second-answer',
      'critique-level',
      'critique-clean',
      'critique-in-spanish',
    ]);
    const fruit = find('critique-second-answer').request as AiCritiqueRequest;
    expect(fruit.facts.level).toBe('A1');
    expect(fruit.facts.fields.map((field) => field.path.join('.'))).toContain('options.2.text');
    // Each is valid, and the SDK's own critic finds nothing: what is wrong is for a model to see.
    for (const one of critiques) {
      expect((one.request as AiCritiqueRequest).facts.findings, one.id).toEqual([]);
    }
    expect((find('critique-in-spanish').request as AiCritiqueRequest).authorLocale).toBe('es');
  });

  it('reads aloud with slips, cleanly, from a stored grade, and with coaching asked for in another language', () => {
    const coaching = cases.filter((one) => one.feature === 'pronunciation-coaching');
    expect(coaching.map((one) => one.id)).toEqual([
      'coaching-slips',
      'coaching-clean',
      'coaching-from-grade',
      'coaching-in-spanish',
    ]);
    const slips = find('coaching-slips').request as AiCoachingRequest;
    expect(
      slips.facts.words
        .filter((word) => word.state !== 'correct')
        .map((word) => [word.itemId, word.word, word.state]),
    ).toEqual([
      ['w2', 'weather', 'mispronounced'],
      ['w7', 'north', 'omitted'],
    ]);
    expect(slips.facts.words[1]?.sounds?.map((sound) => sound.symbol)).toEqual([
      'w',
      'ɛ',
      'ð',
      'ɚ',
    ]);
    const stored = find('coaching-from-grade').request as AiCoachingRequest;
    expect(stored.facts.words.some((word) => word.sounds !== undefined)).toBe(false);
    expect((find('coaching-in-spanish').request as AiCoachingRequest).learnerLocale).toBe('es');
  });

  it('hands out a fresh list, so one caller cannot change another’s', () => {
    const mine = aiCheckCases();
    mine.length = 0;
    expect(aiCheckCases().length).toBeGreaterThan(0);
  });
});

describe('runAiCheck', () => {
  it('reports a prompt that answers well as shown, with nothing refused', async () => {
    // Answers an explanation with the verdict it was given, as a host's server
    // does when it asks the model for structured output.
    const explain = vi.fn(async (request: AiExplanationRequest) => ({
      verdict: request.grade.category,
      text: 'Here is why, in a sentence that names no answer.',
      usage: { promptTokens: 300, completionTokens: 40, costUsd: 0.0004 },
    }));
    const hint = vi.fn(async (request: AiHintRequest) => ({
      text: `Think about it again (${request.hintNumber}).`,
    }));
    // Quotes the draft's own first word, as a prompt that quotes carefully does.
    const writingFeedback = vi.fn(async (request: AiWritingFeedbackRequest) => {
      const first = request.facts.text.split(' ')[0] as string;
      return {
        text: 'A clear start.',
        corrections: [{ original: first, corrected: first.toUpperCase() }],
        criteria: [
          { name: 'Grammar', score: 3, maxScore: 4 },
          { name: 'Vocabulary', score: 1 },
          { name: 'Task', score: 1 },
        ],
      };
    });

    // Coaches every word the engine marked, and names a sound only where the
    // engine reported one — its weakest, and what it was heard as.
    const pronunciationCoaching = vi.fn(async (request: AiCoachingRequest) => ({
      text: 'A steady reading.',
      words: request.facts.words
        .filter((word) => word.state === 'mispronounced' || word.state === 'omitted')
        .map((word) => {
          const weakest = [...(word.sounds ?? [])].sort(
            (a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100),
          )[0];
          return {
            itemId: word.itemId as string,
            tip: `Practise "${word.word}" slowly.`,
            ...(weakest !== undefined
              ? { sound: { expected: weakest.symbol, heard: weakest.heardAs?.[0]?.symbol } }
              : {}),
          };
        }),
    }));

    // Points at the first field it was given, quoting its first word.
    const critique = vi.fn(async (request: AiCritiqueRequest) => {
      const field = request.facts.fields[0] as { path: string[]; text: string };
      return {
        findings: [
          {
            path: field.path,
            kind: 'ambiguous',
            message: 'Could be read two ways.',
            quote: field.text.split(' ')[0],
          },
        ],
      };
    });

    // One valid draft of each type asked for, on the caption it is about when there are captions.
    const draftOf = (
      type: string,
      caption: { caption?: number },
    ): { drafts: Record<string, unknown>[] } => {
      switch (type) {
        case 'multiple-choice':
          return {
            drafts: [
              {
                type,
                title: 'Where Maria lives',
                question: 'Where does Maria live?',
                mode: 'single',
                options: [
                  { text: 'Seville', isCorrect: true },
                  { text: 'Madrid', isCorrect: false },
                  { text: 'Lisbon', isCorrect: false },
                ],
                ...caption,
              },
            ],
          };
        case 'fill-in-the-blanks':
          return {
            drafts: [
              {
                type,
                title: 'Saturday',
                passage: 'Every Saturday she {{1}} to the market.',
                blanks: [{ acceptedAnswers: ['walks'] }],
              },
            ],
          };
        case 'gap-select':
          return {
            drafts: [
              {
                type,
                title: 'Saturday',
                passage: 'She walks {{1}} the market.',
                gaps: [
                  {
                    choices: [
                      { text: 'to', isCorrect: true },
                      { text: 'at', isCorrect: false },
                    ],
                  },
                ],
              },
            ],
          };
        case 'dictation':
          return {
            drafts: [{ type, title: 'Listen', transcript: 'She walks to the market', ...caption }],
          };
        case 'read-aloud':
          return {
            drafts: [
              { type, title: 'Read it', referenceText: 'Maria lives in Seville.', ...caption },
            ],
          };
        default:
          return {
            drafts: [
              {
                type,
                title: 'Your Saturday',
                prompt: 'Describe your Saturday.',
                minWords: 40,
                maxWords: 80,
              },
            ],
          };
      }
    };
    const drafts = vi.fn(async (request: AiDraftsRequest) => {
      const caption = request.facts.source.kind === 'captions' ? { caption: 1 } : {};
      return {
        drafts: request.facts.activityTypes.flatMap((type) => draftOf(type, caption).drafts),
      };
    });

    const report = await runAiCheck({
      explain,
      hint,
      writingFeedback,
      pronunciationCoaching,
      critique,
      drafts,
    });

    expect(report.total).toBe(cases.length);
    expect(report.shown).toBe(cases.length);
    expect(report.refused).toBe(0);
    expect(report.errors).toBe(0);
    expect(report.skipped).toBe(0);
    expect(explain).toHaveBeenCalledTimes(cases.filter((c) => c.feature === 'explanation').length);
    expect(hint).toHaveBeenCalledTimes(cases.filter((c) => c.feature === 'hint').length);
    const written = report.results.find((one) => one.case.id === 'writing-mistakes');
    expect(written?.feedback?.corrections[0]?.range).toEqual({ start: 0, end: 4 });
    // (0.75 × 2 + 1 + 1) / 4
    expect(written?.feedback?.indicativeScore).toBe(0.875);
    const coached = report.results.find((one) => one.case.id === 'coaching-slips');
    expect(coached?.coaching?.words).toEqual([
      {
        itemId: 'w2',
        word: 'weather',
        tip: 'Practise "weather" slowly.',
        sound: { expected: 'ð', heard: 'd' },
      },
      { itemId: 'w7', word: 'north', tip: 'Practise "north" slowly.' },
    ]);
    // What the call cost rides back on the result, so a run can be priced.
    const explained = report.results.find((one) => one.case.feature === 'explanation');
    expect(explained?.result?.usage).toEqual({
      promptTokens: 300,
      completionTokens: 40,
      costUsd: 0.0004,
    });
    expect(formatAiCheckReport(report)).toContain(`${cases.length}/${cases.length} shown`);
  });

  it('names the prompt that gives answers away, case by case', async () => {
    const report = await runAiCheck({
      hint: says('The answer is Madrid — and the blank is "is", as in "My name is".'),
    });

    const hints = cases.filter((one) => one.feature === 'hint');
    expect(report.total).toBe(hints.length);
    expect(report.skipped).toBe(cases.length - hints.length);
    expect(report.byRefusal['reveals-answer']).toBeGreaterThan(0);
    expect(report.refused).toBeGreaterThan(0);

    const printed = formatAiCheckReport(report);
    expect(printed).toContain('reveals-answer');
    // The refused text is printed: this is a test run, not a learner's screen.
    expect(printed).toContain('The answer is Madrid');
  });

  it('names the prompt that corrects words the learner never wrote', async () => {
    const report = await runAiCheck({
      writingFeedback: async () => ({
        text: 'Mind your verbs.',
        corrections: [{ original: 'I goed', corrected: 'I went' }],
      }),
    });
    const writing = cases.filter((one) => one.feature === 'writing-feedback');
    expect(report.total).toBe(writing.length);
    expect(report.byRefusal['misquotes-answer']).toBe(writing.length);
    expect(formatAiCheckReport(report)).toContain('misquotes-answer');
  });

  it('reports what a drafts prompt wrote: each draft checked, and where a caption placed it', async () => {
    const report = await runAiCheck(
      {
        drafts: async () => ({
          drafts: [
            {
              type: 'multiple-choice',
              title: 'Where Maria lives',
              question: 'Where does Maria live?',
              mode: 'single',
              options: [{ text: 'Seville', isCorrect: true }],
              caption: 0,
            },
          ],
        }),
      },
      { cases: [find('drafts-video')] },
    );
    const [only] = report.results;
    expect(only?.ok).toBe(true);
    expect(only?.drafts?.drafts[0]).toMatchObject({
      at: 4.2,
      validation: { status: 'incomplete' },
    });
    expect(only?.drafts?.drafts[0]?.draft.id).toBe('ai-check-1');
  });

  it('names the prompt that points an author at fields the item does not have', async () => {
    const report = await runAiCheck({
      critique: async () => ({
        findings: [{ path: ['explanation'], kind: 'other', message: 'Add an explanation.' }],
      }),
    });
    const critiques = cases.filter((one) => one.feature === 'item-critique');
    expect(report.total).toBe(critiques.length);
    expect(report.byRefusal['contradicts-item']).toBe(critiques.length);
    expect(formatAiCheckReport(report)).toContain('contradicts-item');
  });

  it('names the prompt that coaches words the engine did not mark', async () => {
    const report = await runAiCheck({
      pronunciationCoaching: async () => ({
        text: 'Work on the first word.',
        words: [{ itemId: 'w1', tip: 'Say "the" more clearly.' }],
      }),
    });
    const coaching = cases.filter((one) => one.feature === 'pronunciation-coaching');
    expect(report.total).toBe(coaching.length);
    expect(report.byRefusal['contradicts-marks']).toBe(coaching.length);
    expect(formatAiCheckReport(report)).toContain('contradicts-marks');
  });

  it('counts each refusal by its own reason', async () => {
    const explainWrongVerdict = await runAiCheck(
      { explain: says('You got it!', { verdict: 'correct' }) },
      { cases: [find('mc-wrong')] },
    );
    expect(explainWrongVerdict.byRefusal['contradicts-grade']).toBe(1);

    const tooLong = await runAiCheck(
      { explain: says('x'.repeat(2001)) },
      { cases: [find('mc-correct')] },
    );
    expect(tooLong.byRefusal['too-long']).toBe(1);

    const empty = await runAiCheck({ explain: says('   ') }, { cases: [find('mc-correct')] });
    expect(empty.byRefusal.empty).toBe(1);

    const malformed = await runAiCheck(
      { explain: vi.fn(async () => 'just a string' as unknown) },
      { cases: [find('mc-correct')] },
    );
    expect(malformed.byRefusal.malformed).toBe(1);
  });

  it('reports a port that fails, and runs the cases after it anyway', async () => {
    let call = 0;
    const explain = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        throw new Error('429 rate limited');
      }
      return { text: 'A sentence about the answer, naming none of it.' };
    });

    const report = await runAiCheck({ explain });

    expect(report.errors).toBe(1);
    expect(report.shown).toBe(report.total - 1);
    expect(report.results[0]?.error).toContain('429');
    expect(formatAiCheckReport(report)).toContain('port failed');
  });

  it('runs several at once when asked, and every case exactly once', async () => {
    const seen: string[] = [];
    const explain = vi.fn(async (request: AiExplanationRequest) => {
      seen.push(request.facts.activityId);
      await new Promise((resolve) => setTimeout(resolve, 1));
      return { verdict: request.grade.category, text: 'Steady.' };
    });

    const report = await runAiCheck({ explain }, { concurrency: 4 });

    const explaining = cases.filter((one) => one.feature === 'explanation');
    expect(report.total).toBe(explaining.length);
    expect(seen).toHaveLength(explaining.length);
    expect(report.results.every((one) => one.ok)).toBe(true);
    expect(report.results.map((one) => one.case.id)).toEqual(explaining.map((one) => one.id));
  });

  it('takes cases of your own, built on your own items', async () => {
    const mine = [find('fib-hint-1')];
    const hint = says('Look at the verb.');
    const report = await runAiCheck({ hint }, { cases: mine });

    expect(report.total).toBe(1);
    expect(report.shown).toBe(1);
    expect(hint).toHaveBeenCalledTimes(1);
  });
});
