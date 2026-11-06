import { describe, expect, it } from 'vitest';
import { createDraft, critiqueDraft, validateDraft } from '../index.js';

const complete = {
  schemaVersion: '1.0',
  type: 'matching',
  id: 'mt1',
  title: 'Who said it?',
  options: [
    { id: 'a', label: 'A', text: 'Anna Lee' },
    { id: 'b', label: 'B', text: 'Ben Ortiz' },
    { id: 'c', label: 'C', text: 'Carla Diaz' },
  ],
  prompts: [
    { id: 'q1', text: 'prefers the tram to the bus', correctOptionId: 'a' },
    { id: 'q2', text: 'thinks the new line was too expensive', correctOptionId: 'b' },
  ],
  scoringStrategy: 'partial',
};

const codesOf = (draft: unknown): [string, string, string][] =>
  validateDraft('matching', draft).issues.map((found) => [
    found.code,
    found.severity,
    found.path.join('.'),
  ]);

const findingsOf = (draft: unknown): [string, string][] =>
  critiqueDraft('matching', draft).map((found) => [found.code, found.path.join('.')]);

describe('matching drafts', () => {
  it('starts incomplete, with no prompt answered and all-or-nothing scoring', () => {
    const ids = ['id-1'];
    const draft = createDraft('matching', { newId: () => ids.shift() ?? 'spare' });
    expect(draft).toEqual({
      schemaVersion: '1.0',
      type: 'matching',
      id: 'id-1',
      title: '',
      prompts: [],
      options: [],
      scoringStrategy: 'all-or-nothing',
    });
    expect(codesOf(draft)).toEqual([
      ['title_required', 'incomplete', 'title'],
      ['mt_options_too_few', 'incomplete', 'options'],
      ['mt_prompts_required', 'incomplete', 'prompts'],
    ]);
  });

  it('is complete once every prompt is answered', () => {
    const result = validateDraft('matching', complete);
    expect(result.status).toBe('complete');
  });

  it('reports what an option is missing, at the option', () => {
    expect(
      codesOf({
        ...complete,
        options: [{ id: '', text: ' ' }, { id: 'b', label: '  ', text: 'Ben' }, 'not an option'],
      }),
    ).toEqual([
      ['mt_option_id_required', 'invalid', 'options.0.id'],
      ['mt_option_text_required', 'incomplete', 'options.0.text'],
      ['mt_option_label_required', 'incomplete', 'options.1.label'],
      ['mt_correct_option_unknown', 'invalid', 'prompts'],
      ['invalid_type', 'invalid', 'options.2'],
    ]);
  });

  it('reports a repeated option id and label at the list', () => {
    expect(
      codesOf({
        ...complete,
        options: [...complete.options, { id: 'a', label: 'c ', text: 'Again' }],
      }),
    ).toEqual([
      ['mt_option_id_duplicate', 'invalid', 'options'],
      ['mt_option_label_duplicate', 'invalid', 'options'],
    ]);
  });

  it('reports what a prompt is missing, at the prompt', () => {
    expect(
      codesOf({
        ...complete,
        prompts: [{ text: '' }, { id: 'q2', text: 'x', correctOptionId: '  ' }, null],
      }),
    ).toEqual([
      ['mt_prompt_id_required', 'invalid', 'prompts.0.id'],
      ['mt_prompt_text_required', 'incomplete', 'prompts.0.text'],
      ['mt_correct_option_required', 'incomplete', 'prompts.0.correctOptionId'],
      ['mt_correct_option_required', 'incomplete', 'prompts.1.correctOptionId'],
      ['null_not_allowed', 'invalid', 'prompts.2'],
    ]);
  });

  it('reports a repeated prompt id and an unknown answer at the prompts', () => {
    expect(
      codesOf({
        ...complete,
        prompts: [
          { id: 'q1', text: 'x', correctOptionId: 'a' },
          { id: 'q1', text: 'y', correctOptionId: 'ghost' },
        ],
      }),
    ).toEqual([
      ['mt_correct_option_unknown', 'invalid', 'prompts'],
      ['mt_prompt_id_duplicate', 'invalid', 'prompts'],
    ]);
  });

  it('refuses an option used twice when each is used once, naming both prompts', () => {
    const reused = {
      ...complete,
      optionUse: 'once',
      prompts: complete.prompts.map((prompt) => ({ ...prompt, correctOptionId: 'a' })),
    };
    const result = validateDraft('matching', reused);
    expect(result.issues.map((found) => found.code)).toEqual(['mt_option_reused']);
    expect(result.issues[0]?.message).toContain('"q1" and "q2"');
    expect(validateDraft('matching', { ...reused, optionUse: 'many' }).status).toBe('complete');
  });

  it('refuses an optionUse that is neither once nor many', () => {
    expect(codesOf({ ...complete, optionUse: 'twice' })).toEqual([
      ['mt_option_use_invalid', 'invalid', 'optionUse'],
    ]);
  });

  it('leaves lists that are not lists to the schema', () => {
    expect(codesOf({ ...complete, options: 'A, B', prompts: 3 }).map(([code]) => code)).toEqual([
      'invalid_type',
      'invalid_type',
    ]);
  });
});

describe('matching critic', () => {
  it('finds nothing to say about a good item', () => {
    expect(findingsOf(complete)).toEqual([]);
  });

  it('points out a title that names an answer', () => {
    expect(findingsOf({ ...complete, title: 'What Anna Lee thinks' })).toEqual([
      ['mt_title_reveals_answer', 'title'],
    ]);
  });

  it('points out two options that read the same', () => {
    expect(
      findingsOf({
        ...complete,
        options: [...complete.options, { id: 'd', label: 'D', text: 'anna lee!' }],
      }),
    ).toEqual([['mt_options_duplicate', 'options.3.text']]);
  });

  it('points out a prompt that contains its own answer, but not a short one', () => {
    const named = {
      ...complete,
      prompts: [{ id: 'q1', text: 'Anna Lee prefers the tram', correctOptionId: 'a' }],
    };
    expect(findingsOf(named)).toEqual([['mt_answer_in_prompt', 'prompts.0.text']]);
    const letters = {
      ...complete,
      options: [
        { id: 'A', label: 'A', text: 'A' },
        { id: 'B', label: 'B', text: 'B' },
      ],
      prompts: [{ id: 'q1', text: 'a plan that failed', correctOptionId: 'A' }],
    };
    expect(findingsOf(letters)).toEqual([]);
  });

  it('points out a list used once with no option to spare', () => {
    const tight = {
      ...complete,
      optionUse: 'once',
      options: complete.options.slice(0, 2),
    };
    expect(findingsOf(tight)).toEqual([['mt_no_distractor', 'options']]);
    expect(findingsOf({ ...tight, optionUse: 'many' })).toEqual([]);
    expect(findingsOf({ ...tight, options: complete.options })).toEqual([]);
  });

  it('reads an unfinished draft without throwing', () => {
    expect(findingsOf({ type: 'matching', title: 42, prompts: [null, 'x'], options: 'A' })).toEqual(
      [],
    );
    expect(
      findingsOf({
        type: 'matching',
        title: 'x',
        options: [null, { id: 'a', text: 7 }],
        prompts: [
          { text: 5, correctOptionId: 'a' },
          { text: 'y', correctOptionId: 'a' },
        ],
      }),
    ).toEqual([]);
  });
});
