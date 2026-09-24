import { describe, expect, it, vi } from 'vitest';
import type {
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
      new Set(list.map((one) => one.request.facts.activityType));

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

    const report = await runAiCheck({ explain, hint, writingFeedback });

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
