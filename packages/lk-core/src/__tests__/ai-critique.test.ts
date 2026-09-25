import { describe, expect, it } from 'vitest';
import {
  AI_CRITIQUE_MAX_FIELD_LENGTH,
  AI_CRITIQUE_MAX_FINDINGS,
  aiCritiqueRequest,
  checkAiCritique,
} from '../ai-critique.js';
import { UnknownActivityTypeError } from '../errors.js';
import type { AiCritiqueRequest } from '../types/ai.js';

/**
 * A model's review of an item, for its author: what the model is given, and
 * what the SDK refuses to list. The check that matters is the one the SDK can
 * run — a finding points at a field the item has, and quotes words it holds.
 */

const item = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'mc1',
  title: 'Capital cities',
  question: 'Which city is the capital of Japan?',
  questionHtml: '<p>Which city is the capital of Japan?</p>',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  shuffle: true,
  options: [
    {
      id: 'o1',
      text: 'Kyoto',
      isCorrect: false,
      feedback: "Kyoto was Japan's capital until 1868.",
    },
    { id: 'o2', text: 'Tokyo', isCorrect: true },
    {
      id: 'o3',
      text: 'All of the above',
      isCorrect: false,
      media: { type: 'image', url: 'https://x.test/a.png', alt: 'A map of Japan' },
    },
  ],
};

const request = (): AiCritiqueRequest => {
  const built = aiCritiqueRequest({
    type: 'multiple-choice',
    draft: item,
    level: 'A2',
    authorLocale: 'es',
  });
  if (built === null) {
    throw new Error('no request');
  }
  return built;
};

describe('aiCritiqueRequest', () => {
  it('gives the model the item with its key, every field of words it may point at, and what the SDK already found', () => {
    const built = request();
    expect(built.feature).toBe('item-critique');
    expect(built.facts.item).toBe(item);
    expect(built.facts.level).toBe('A2');
    expect(built.authorLocale).toBe('es');
    // Words only: no ids, settings, addresses or HTML sidecar — but a picture's alt is words.
    expect(built.facts.fields.map((field) => field.path.join('.'))).toEqual([
      'title',
      'question',
      'options.0.text',
      'options.0.feedback',
      'options.1.text',
      'options.2.text',
      'options.2.media.alt',
    ]);
    expect(built.facts.findings).toEqual([
      {
        path: ['options', '2', 'text'],
        code: 'mc_above_option_shuffled',
        message: expect.any(String),
      },
    ]);
  });

  it('builds nothing for a draft with no words, and refuses an unknown type', () => {
    expect(
      aiCritiqueRequest({ type: 'multiple-choice', draft: { title: '  ', options: [] } }),
    ).toBeNull();
    expect(aiCritiqueRequest({ type: 'multiple-choice', draft: 'text' })).toBeNull();
    expect(() => aiCritiqueRequest({ type: 'nope' as 'dictation', draft: item })).toThrow(
      UnknownActivityTypeError,
    );
  });
});

describe('aiCritiqueRequest on a type nobody registered', () => {
  it('refuses the type before it looks at the draft', () => {
    expect(() => aiCritiqueRequest({ type: 'nope' as 'dictation', draft: 'text' })).toThrow(
      UnknownActivityTypeError,
    );
  });
});

describe('checkAiCritique: a finding points at the item as it is', () => {
  const check = (findings: unknown, extra: Record<string, unknown> = {}) =>
    checkAiCritique({ findings, ...extra }, request());

  it('lists each finding as advice, coded by its kind, at the field it names', () => {
    expect(
      check(
        [
          {
            path: ['options', 0, 'text'],
            kind: 'second-answer',
            message: 'Kyoto was a capital too: say "today".',
          },
          {
            path: ['question'],
            kind: 'ambiguous',
            message: 'Add "today".',
            // Typographic quotes and extra spacing, as a model copies words.
            quote: 'capital   of Japan',
          },
        ],
        { provenance: { model: 'm-1' }, usage: { promptTokens: 12 }, score: 3 },
      ),
    ).toEqual({
      ok: true,
      critique: {
        findings: [
          {
            path: ['options', '0', 'text'],
            code: 'ai_second_answer',
            message: 'Kyoto was a capital too: say "today".',
            severity: 'advice',
          },
          {
            path: ['question'],
            code: 'ai_ambiguous',
            message: 'Add "today".',
            severity: 'advice',
            quote: 'capital   of Japan',
          },
        ],
        provenance: { model: 'm-1' },
        usage: { promptTokens: 12 },
      },
    });
    expect(check([])).toEqual({ ok: true, critique: { findings: [] } });
  });

  it('refuses the whole reply when a finding points at a field the item does not have, or not at words', () => {
    for (const path of [
      ['options', 3, 'text'],
      ['explanation'],
      ['options', 1, 'id'],
      ['questionHtml'],
      ['options'],
    ]) {
      expect(
        check([
          { path: ['question'], kind: 'cue', message: 'Fine.' },
          { path, kind: 'other', message: 'Look here.' },
        ]),
        JSON.stringify(path),
      ).toEqual({ ok: false, refusal: 'contradicts-item' });
    }
  });

  it('refuses a quote the field does not hold, case kept', () => {
    for (const quote of ['capital of France', 'CAPITAL of Japan']) {
      expect(
        check([{ path: ['question'], kind: 'ambiguous', message: 'x', quote }]),
        quote,
      ).toEqual({
        ok: false,
        refusal: 'contradicts-item',
      });
    }
    // Curly quotes read as straight ones.
    const quoted = checkAiCritique(
      {
        findings: [
          {
            path: ['options', '0', 'feedback'],
            kind: 'language',
            message: 'x',
            quote: 'Japan’s capital',
          },
        ],
      },
      request(),
    );
    expect(quoted.ok).toBe(true);
  });

  it('refuses what is not a critique, and more than an author can read', () => {
    for (const bad of [
      'findings',
      { findings: 'x' },
      { findings: [null] },
      { findings: [{ path: 'question', kind: 'cue', message: 'x' }] },
      { findings: [{ path: [{}], kind: 'cue', message: 'x' }] },
      { findings: [{ path: ['question'], kind: 'typo', message: 'x' }] },
      { findings: [{ path: ['question'], kind: 'cue', message: 5 }] },
      { findings: [{ path: ['question'], kind: 'cue', message: '   ' }] },
      { findings: [{ path: ['question'], kind: 'cue', message: 'x', quote: 7 }] },
      { findings: [{ path: ['question'], kind: 'cue', message: 'x', quote: ' ' }] },
    ]) {
      expect(checkAiCritique(bad, request()), JSON.stringify(bad)).toEqual({
        ok: false,
        refusal: 'malformed',
      });
    }
    const one = { path: ['question'], kind: 'cue', message: 'x' };
    expect(check(Array.from({ length: AI_CRITIQUE_MAX_FINDINGS }, () => one)).ok).toBe(true);
    expect(check(Array.from({ length: AI_CRITIQUE_MAX_FINDINGS + 1 }, () => one))).toEqual({
      ok: false,
      refusal: 'too-long',
    });
    const long = '🙂'.repeat(AI_CRITIQUE_MAX_FIELD_LENGTH);
    expect(check([{ ...one, message: long }]).ok).toBe(true);
    expect(check([{ ...one, message: `${long}!` }])).toEqual({ ok: false, refusal: 'too-long' });
    expect(check([{ ...one, quote: `${long}!` }])).toEqual({ ok: false, refusal: 'too-long' });
  });
});
