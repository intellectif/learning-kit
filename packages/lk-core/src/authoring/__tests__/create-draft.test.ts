import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { UnknownActivityTypeError } from '../../errors.js';
import { defineActivityType, registerActivityType } from '../../registry/index.js';
import { validateActivity } from '../../schemas/index.js';
import type { ActivityType } from '../../types/activity.js';
import { createDraft, validateDraft } from '../index.js';

/** A generator like the one a caller supplies: a fresh id per call. */
const counter = () => {
  let next = 0;
  return () => {
    next += 1;
    return `id-${next}`;
  };
};

const BUILT_IN: ActivityType[] = ['multiple-choice', 'fill-in-the-blanks', 'written-response'];

describe('createDraft', () => {
  it.each(BUILT_IN)('gives %s a draft that is incomplete — not invalid, not storable', (type) => {
    const draft = createDraft(type, { newId: counter() });
    const result = validateDraft(type, draft);
    // The failure this exists to prevent: a freshly added question reported as
    // an error, which disables a whole form and blanks its preview.
    expect(result.status).toBe('incomplete');
    expect(result.issues.every((found) => found.severity === 'incomplete')).toBe(true);
    // And the other direction: nothing unwritten passes the write boundary.
    expect(validateActivity(type, draft).success).toBe(false);
  });

  it('takes every id from newId, in order, and invents none', () => {
    const draft = createDraft('multiple-choice', { newId: counter() });
    expect(draft.id).toBe('id-1');
    expect(draft.options.map((option) => option.id)).toEqual(['id-2', 'id-3']);
  });

  it('marks no option correct, so the answer key is always an author’s decision', () => {
    const draft = createDraft('multiple-choice', { newId: counter() });
    expect(draft.options.some((option) => option.isCorrect)).toBe(false);
    expect(draft.scoringStrategy).toBe('all-or-nothing');
    expect(draft).not.toHaveProperty('shuffle');
    expect(draft).not.toHaveProperty('passThreshold');
  });

  it('picks no word limits and no rubric for a written response', () => {
    const draft = createDraft('written-response', { newId: counter() });
    expect(draft).toEqual({
      schemaVersion: '1.0',
      type: 'written-response',
      id: 'id-1',
      title: '',
      prompt: '',
      minWords: 0,
      maxWords: 0,
    });
    expect(validateDraft('written-response', draft).issues.map((found) => found.code)).toEqual([
      'title_required',
      'wr_prompt_required',
      'wr_max_words_required',
    ]);
  });

  it('becomes complete once an author writes it', () => {
    const draft = createDraft('multiple-choice', { newId: counter() });
    const [first, second] = draft.options;
    if (first === undefined || second === undefined) {
      throw new Error('unreachable');
    }
    const written = {
      ...draft,
      title: 'Capitals',
      question: 'Which city is the capital of Japan?',
      options: [
        { ...first, text: 'Tokyo', isCorrect: true },
        { ...second, text: 'Seoul' },
      ],
    };
    expect(validateDraft('multiple-choice', written).status).toBe('complete');
  });

  it('returns a new object every time', () => {
    const newId = counter();
    const one = createDraft('multiple-choice', { newId });
    const two = createDraft('multiple-choice', { newId });
    expect(one.options).not.toBe(two.options);
  });

  it('refuses an id generator that repeats itself or returns nothing', () => {
    expect(() => createDraft('multiple-choice', { newId: () => 'same' })).toThrow(/twice/);
    expect(() => createDraft('written-response', { newId: () => '' })).toThrow(/non-empty/);
    expect(() => createDraft('written-response', { newId: () => 7 as unknown as string })).toThrow(
      /non-empty string/,
    );
  });

  it('throws for an unregistered type, and for a type with no createDraft', () => {
    expect(() => createDraft('matching' as ActivityType, { newId: counter() })).toThrow(
      UnknownActivityTypeError,
    );
    registerActivityType(
      defineActivityType<{ type: string }, unknown>({
        type: 'draft-probe-no-authoring',
        schema: z.looseObject({
          type: z.literal('draft-probe-no-authoring'),
        }) as unknown as z.ZodType<{
          type: string;
        }>,
        scoring: { kind: 'deferred', reason: 'requires_async_grading' },
      }),
    );
    expect(() =>
      createDraft('draft-probe-no-authoring' as ActivityType, { newId: counter() }),
    ).toThrow(/declares no authoring\.createDraft/);
  });
});
