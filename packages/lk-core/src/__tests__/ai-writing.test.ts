import { describe, expect, it } from 'vitest';
import {
  AI_WRITING_MAX_CORRECTIONS,
  aiWritingFeedbackRequest,
  checkAiWritingFeedback,
} from '../ai-writing.js';
import type { LearnerResponse, WrittenResponseData } from '../types/activity.js';
import type { AiWritingFeedbackRequest } from '../types/ai.js';

/**
 * Feedback on writing: what a model is told about a draft, and what the SDK
 * refuses to show. The check that matters is the one no other library can
 * run — every correction must quote words the learner actually wrote.
 */

const essay = (over: Partial<WrittenResponseData> = {}): WrittenResponseData => ({
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'wr-weekend',
  title: 'Your weekend',
  prompt: 'Describe what you did last weekend.',
  minWords: 5,
  maxWords: 120,
  rubric: {
    criteria: [
      { name: 'Grammar', description: 'Past tense, articles', weight: 2 },
      { name: 'Vocabulary', weight: 1 },
    ],
  },
  languageTarget: 'en-A2',
  locale: 'en',
  ...over,
});

const DRAFT = 'Last weekend I go to the market and buyed a apple. Then I go home.';
const wrote = (text: string): LearnerResponse => ({
  type: 'written-response',
  text,
  wordCount: 0,
});

const request = (
  text = DRAFT,
  over: Partial<WrittenResponseData> = {},
): AiWritingFeedbackRequest => {
  const built = aiWritingFeedbackRequest({ data: essay(over), response: wrote(text) });
  if (built === null) {
    throw new Error('no request');
  }
  return built;
};

describe('aiWritingFeedbackRequest', () => {
  it('tells a model the task, the draft verbatim, and the rubric', () => {
    const built = aiWritingFeedbackRequest({
      data: essay(),
      response: wrote(DRAFT),
      previousFeedback: ['Check your verbs.'],
      learnerLocale: 'es',
    });
    expect(built).toEqual({
      feature: 'writing-feedback',
      facts: {
        activityType: 'written-response',
        activityId: 'wr-weekend',
        title: 'Your weekend',
        locale: 'en',
        prompt: 'Describe what you did last weekend.',
        text: DRAFT,
        wordCount: 15,
        minWords: 5,
        maxWords: 120,
        withinWordBounds: true,
        rubric: [
          { name: 'Grammar', description: 'Past tense, articles', weight: 2 },
          { name: 'Vocabulary', weight: 1 },
        ],
        languageTarget: 'en-A2',
      },
      draftNumber: 2,
      previousFeedback: ['Check your verbs.'],
      learnerLocale: 'es',
    });
  });

  it('counts words as the grader will, whatever the response claimed', () => {
    const built = aiWritingFeedbackRequest({
      data: essay({ minWords: 20 }),
      response: { type: 'written-response', text: '  Too   short\nhere.  ', wordCount: 999 },
    });
    expect(built?.facts).toMatchObject({ wordCount: 3, withinWordBounds: false });
    const over = aiWritingFeedbackRequest({
      data: essay({ minWords: 1, maxWords: 10 }),
      response: wrote(DRAFT),
    });
    expect(over?.facts).toMatchObject({ wordCount: 15, withinWordBounds: false });
  });

  it('keeps what was said before as it was when asked', () => {
    const before = ['Check your verbs.'];
    const built = aiWritingFeedbackRequest({
      data: essay(),
      response: wrote(DRAFT),
      previousFeedback: before,
    });
    before.push('Later feedback.');
    expect(built?.previousFeedback).toEqual(['Check your verbs.']);
    expect(built?.draftNumber).toBe(2);
  });

  it('gives a rubric-less item no rubric', () => {
    const { rubric: _rubric, ...bare } = essay();
    const built = aiWritingFeedbackRequest({ data: bare, response: wrote(DRAFT) });
    expect(built?.facts.rubric).toBeNull();
  });

  it('builds nothing for another type, an author who switched it off, a redacted item or an empty draft', () => {
    const mc = { type: 'multiple-choice', id: 'mc', title: 'Q' };
    expect(aiWritingFeedbackRequest({ data: mc, response: wrote(DRAFT) })).toBeNull();
    expect(
      aiWritingFeedbackRequest({
        data: essay({ ai: { explanations: false } }),
        response: wrote(DRAFT),
      }),
    ).toBeNull();
    // Hints off leaves feedback on: it reads explanations.
    expect(
      aiWritingFeedbackRequest({ data: essay({ ai: { hints: false } }), response: wrote(DRAFT) }),
    ).not.toBeNull();
    expect(
      aiWritingFeedbackRequest({
        data: { ...essay(), redacted: true } as never,
        response: wrote(DRAFT),
      }),
    ).toBeNull();
    expect(aiWritingFeedbackRequest({ data: essay(), response: wrote('   ') })).toBeNull();
    expect(aiWritingFeedbackRequest({ data: essay(), response: null })).toBeNull();
  });
});

describe('checkAiWritingFeedback: the text', () => {
  it('reads the text as every AI text is read', () => {
    expect(checkAiWritingFeedback({ text: '  Good start.\u0007 ' }, request())).toEqual({
      ok: true,
      feedback: { text: 'Good start.', corrections: [], criteria: [], indicativeScore: null },
    });
    expect(checkAiWritingFeedback('Good start.', request())).toEqual({
      ok: false,
      refusal: 'malformed',
    });
    expect(checkAiWritingFeedback({ text: '   ' }, request())).toEqual({
      ok: false,
      refusal: 'empty',
    });
    expect(checkAiWritingFeedback({ text: 'x'.repeat(2001) }, request())).toEqual({
      ok: false,
      refusal: 'too-long',
    });
  });

  it('carries the provenance and the cost', () => {
    const checked = checkAiWritingFeedback(
      {
        text: 'Good start.',
        provenance: { model: 'm-1', promptHash: 'p' },
        usage: { promptTokens: 10, completionTokens: -1 },
      },
      request(),
    );
    expect(checked.ok && checked.feedback).toMatchObject({
      provenance: { model: 'm-1', promptHash: 'p' },
      usage: { promptTokens: 10 },
    });
  });
});

describe('checkAiWritingFeedback: every correction quotes the draft', () => {
  const correct = (corrections: unknown) =>
    checkAiWritingFeedback({ text: 'Mind your verbs.', corrections }, request());

  it('anchors each correction where the learner wrote it', () => {
    const checked = correct([
      { original: 'buyed', corrected: 'bought', explanation: 'Irregular past.', category: 'tense' },
      { original: 'a apple', corrected: 'an apple' },
    ]);
    expect(checked).toEqual({
      ok: true,
      feedback: {
        text: 'Mind your verbs.',
        corrections: [
          {
            original: 'buyed',
            corrected: 'bought',
            explanation: 'Irregular past.',
            category: 'tense',
            range: { start: 36, end: 41 },
          },
          { original: 'a apple', corrected: 'an apple', range: { start: 42, end: 49 } },
        ],
        criteria: [],
        indicativeScore: null,
      },
    });
    expect(DRAFT.slice(36, 41)).toBe('buyed');
  });

  it('anchors a mistake made twice twice, in order', () => {
    const checked = correct([
      { original: 'I go', corrected: 'I went' },
      { original: 'I go', corrected: 'I went' },
    ]);
    expect(checked.ok && checked.feedback.corrections.map((one) => one.range)).toEqual([
      { start: 13, end: 17 },
      { start: 56, end: 60 },
    ]);
  });

  it('finds a quote a model retyped with typographic quotes or other spacing, and shows the learner’s own', () => {
    const text = "I don't  like\nMondays.";
    const checked = checkAiWritingFeedback(
      {
        text: 'Nearly.',
        corrections: [{ original: 'don’t like Mondays', corrected: 'do not like Mondays' }],
      },
      request(text),
    );
    expect(checked.ok && checked.feedback.corrections[0]).toEqual({
      original: "don't  like\nMondays",
      corrected: 'do not like Mondays',
      range: { start: 2, end: 21 },
    });
  });

  it('shows a correction as it shows any text a model wrote: cleaned', () => {
    const bell = String.fromCharCode(7);
    const checked = correct([
      { original: 'buyed', corrected: `  bought${bell} `, explanation: '   ', category: '' },
    ]);
    // An explanation or a tag with nothing in it is no explanation or tag.
    expect(checked.ok && checked.feedback.corrections[0]).toEqual({
      original: 'buyed',
      corrected: 'bought',
      range: { start: 36, end: 41 },
    });
  });

  it('keeps case: a correction about case is still found', () => {
    const checked = checkAiWritingFeedback(
      { text: 'Capitals.', corrections: [{ original: 'i', corrected: 'I' }] },
      request('Yesterday i went out with my friends.'),
    );
    expect(checked.ok && checked.feedback.corrections[0]?.range).toEqual({ start: 10, end: 11 });
    const wrongCase = checkAiWritingFeedback(
      { text: 'Capitals.', corrections: [{ original: 'YESTERDAY', corrected: 'Yesterday' }] },
      request('Yesterday i went out with my friends.'),
    );
    expect(wrongCase).toEqual({ ok: false, refusal: 'misquotes-answer' });
  });

  it('refuses the whole reply when a correction quotes words the learner did not write', () => {
    expect(
      correct([
        { original: 'buyed', corrected: 'bought' },
        { original: 'goed', corrected: 'went' },
      ]),
    ).toEqual({ ok: false, refusal: 'misquotes-answer' });
    expect(correct([{ original: '   ', corrected: 'x' }])).toEqual({
      ok: false,
      refusal: 'misquotes-answer',
    });
  });

  it('takes a claimed range that holds the quote, trimmed, and refuses one that does not', () => {
    const held = correct([
      { original: 'buyed', corrected: 'bought', range: { start: 35, end: 42 } },
    ]);
    expect(held.ok && held.feedback.corrections[0]?.range).toEqual({ start: 36, end: 41 });
    for (const range of [
      { start: 0, end: 5 },
      { start: 37, end: 99 },
      { start: -1, end: 4 },
      { start: 42, end: 37 },
      { start: 37.5, end: 42 },
      { start: '37', end: 42 },
    ]) {
      expect(
        correct([{ original: 'buyed', corrected: 'bought', range }]),
        JSON.stringify(range),
      ).toEqual({ ok: false, refusal: 'misquotes-answer' });
    }
    expect(correct([{ original: 'buyed', corrected: 'bought', range: 'here' }])).toEqual({
      ok: false,
      refusal: 'malformed',
    });
    // A range outside the draft is refused even where `slice` would forgive it
    // and find the quote: -1 reads as the last character, and an end past the
    // text as its end.
    const end = DRAFT.length;
    for (const range of [
      { start: -1, end },
      { start: end - 5, end: end + 1 },
    ]) {
      const quote = DRAFT.slice(range.start, range.end);
      expect(correct([{ original: quote, corrected: 'x', range }]), JSON.stringify(range)).toEqual({
        ok: false,
        refusal: 'misquotes-answer',
      });
    }
  });

  it('anchors a quote corrected more often than it occurs where it first occurs', () => {
    const twice = correct([
      { original: 'buyed', corrected: 'bought' },
      { original: 'buyed', corrected: 'purchased' },
    ]);
    expect(twice.ok && twice.feedback.corrections.map((one) => one.range)).toEqual([
      { start: 36, end: 41 },
      { start: 36, end: 41 },
    ]);
  });

  it('refuses corrections that are not corrections', () => {
    expect(correct('buyed → bought')).toEqual({ ok: false, refusal: 'malformed' });
    expect(correct({ original: 'buyed', corrected: 'bought' })).toEqual({
      ok: false,
      refusal: 'malformed',
    });
    expect(correct([null])).toEqual({ ok: false, refusal: 'malformed' });
    expect(correct([{ original: 5, corrected: 'bought' }])).toEqual({
      ok: false,
      refusal: 'malformed',
    });
    expect(correct([{ original: 'buyed' }])).toEqual({ ok: false, refusal: 'malformed' });
    expect(correct([{ original: 'buyed', corrected: ' buyed ' }])).toEqual({
      ok: false,
      refusal: 'malformed',
    });
    expect(correct([{ original: 'buyed', corrected: 'bought', explanation: 3 }])).toEqual({
      ok: false,
      refusal: 'malformed',
    });
    // A deletion is a correction: the word goes.
    const deletion = checkAiWritingFeedback(
      { text: 'Once is enough.', corrections: [{ original: 'the the', corrected: 'the' }] },
      request('I saw the the cat.'),
    );
    expect(deletion.ok).toBe(true);
  });

  it('refuses more corrections, or longer ones, than a learner can read', () => {
    const many = Array.from({ length: AI_WRITING_MAX_CORRECTIONS + 1 }, () => ({
      original: 'go',
      corrected: 'went',
    }));
    expect(correct(many)).toEqual({ ok: false, refusal: 'too-long' });
    // As many as the limit, each on its own word, are shown.
    const words = Array.from({ length: AI_WRITING_MAX_CORRECTIONS }, (_, at) => `w${at}x`);
    const atLimit = checkAiWritingFeedback(
      {
        text: 'Overall.',
        corrections: words.map((word) => ({ original: word, corrected: word.toUpperCase() })),
      },
      request(words.join(' ')),
    );
    expect(atLimit.ok && atLimit.feedback.corrections).toHaveLength(AI_WRITING_MAX_CORRECTIONS);
    // A quote over the limit is refused as too long, though the draft holds it.
    const long = 'a'.repeat(501);
    expect(
      checkAiWritingFeedback(
        { text: 'Overall.', corrections: [{ original: long, corrected: 'b' }] },
        request(`${long} end`),
      ),
    ).toEqual({ ok: false, refusal: 'too-long' });
    expect(correct([{ original: 'buyed', corrected: 'b'.repeat(501) }])).toEqual({
      ok: false,
      refusal: 'too-long',
    });
    expect(
      correct([{ original: 'buyed', corrected: 'bought', explanation: 'e'.repeat(501) }]),
    ).toEqual({ ok: false, refusal: 'too-long' });
    expect(correct([{ original: 'buyed', corrected: 'bought', category: 'c'.repeat(41) }])).toEqual(
      { ok: false, refusal: 'too-long' },
    );
  });
});

describe('checkAiWritingFeedback: criteria are judgements, the arithmetic is the SDK’s', () => {
  const judge = (criteria: unknown, text = DRAFT, over: Partial<WrittenResponseData> = {}) =>
    checkAiWritingFeedback({ text: 'Overall.', criteria }, request(text, over));

  it('weights each judgement as the author did, and totals them as a grade is totalled', () => {
    const checked = judge([
      { name: 'Grammar', score: 1, maxScore: 4, comment: 'Past tense.', weight: 100 },
      { name: 'Vocabulary', score: 1 },
    ]);
    expect(checked).toEqual({
      ok: true,
      feedback: {
        text: 'Overall.',
        corrections: [],
        criteria: [
          { name: 'Grammar', score: 1, maxScore: 4, comment: 'Past tense.', weight: 2 },
          { name: 'Vocabulary', score: 1, weight: 1 },
        ],
        // (0.25 × 2 + 1 × 1) / 3
        indicativeScore: 0.5,
      },
    });
  });

  it('gives no indicative score unless every criterion was judged with a number', () => {
    const one = judge([{ name: 'Grammar', score: 1 }]);
    expect(one.ok && one.feedback.indicativeScore).toBeNull();
    const banded = judge([
      { name: 'Grammar', band: 'A2' },
      { name: 'Vocabulary', band: 'A2' },
    ]);
    expect(banded.ok && banded.feedback.indicativeScore).toBeNull();
    const partly = judge([
      { name: 'Grammar', score: 0.5 },
      { name: 'Vocabulary', notApplicable: true },
    ]);
    expect(partly.ok && partly.feedback.indicativeScore).toBe(0.5);
    // Shown as not applicable, not as a criterion left unjudged.
    expect(partly.ok && partly.feedback.criteria[1]).toEqual({
      name: 'Vocabulary',
      notApplicable: true,
      weight: 1,
    });
  });

  it('refuses a criterion the author did not write, twice, or on an item with no rubric', () => {
    expect(judge([{ name: 'Style', score: 1 }])).toEqual({ ok: false, refusal: 'malformed' });
    expect(
      judge([
        { name: 'Grammar', score: 1 },
        { name: 'Grammar', score: 0 },
      ]),
    ).toEqual({ ok: false, refusal: 'malformed' });
    const { rubric: _rubric, ...bare } = essay();
    const noRubric = aiWritingFeedbackRequest({ data: bare, response: wrote(DRAFT) });
    expect(
      checkAiWritingFeedback(
        { text: 'Overall.', criteria: [{ name: 'Grammar', score: 1 }] },
        noRubric as AiWritingFeedbackRequest,
      ),
    ).toEqual({ ok: false, refusal: 'malformed' });
    // An empty list says nothing, on any item.
    expect(
      checkAiWritingFeedback(
        { text: 'Overall.', criteria: [] },
        noRubric as AiWritingFeedbackRequest,
      ).ok,
    ).toBe(true);
  });

  it('refuses numbers that cannot be a score', () => {
    for (const bad of [
      { name: 'Grammar', score: 85 },
      { name: 'Grammar', score: -1 },
      { name: 'Grammar', score: Number.NaN },
      { name: 'Grammar', score: 1, maxScore: 0 },
      { name: 'Grammar', score: '1' },
      { name: 'Grammar', maxScore: -2 },
      { name: 'Grammar', notApplicable: 'yes' },
      { name: 'Grammar', comment: 7 },
      { name: 'Grammar', score: 1.5 },
      { name: 'Grammar', score: 0, maxScore: 0 },
      { name: 'Grammar', score: 1, maxScore: Number.POSITIVE_INFINITY },
    ]) {
      expect(judge([bad]), JSON.stringify(bad)).toEqual({ ok: false, refusal: 'malformed' });
    }
    expect(judge('Grammar: 1')).toEqual({ ok: false, refusal: 'malformed' });
    expect(judge({ name: 'Grammar', score: 1 })).toEqual({ ok: false, refusal: 'malformed' });
    expect(judge([null])).toEqual({ ok: false, refusal: 'malformed' });
    expect(judge([{ name: 'Grammar', comment: 'c'.repeat(501) }])).toEqual({
      ok: false,
      refusal: 'too-long',
    });
    expect(judge([{ name: 'Grammar', band: 'b'.repeat(41) }])).toEqual({
      ok: false,
      refusal: 'too-long',
    });
    expect(judge([{ name: 'Grammar', band: 2 }])).toEqual({ ok: false, refusal: 'malformed' });
  });
});
