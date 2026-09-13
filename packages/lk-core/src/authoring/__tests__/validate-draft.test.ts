import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { UnknownActivityTypeError } from '../../errors.js';
import { gradeFromRubric } from '../../grading.js';
import { defineActivityType, registerActivityType } from '../../registry/index.js';
import { validateActivity } from '../../schemas/index.js';
import { evaluate } from '../../scoring/index.js';
import type { ActivityData, ActivityType } from '../../types/activity.js';
import type { DraftValidationResult } from '../../types/authoring.js';
import { validateDraft } from '../index.js';

type Fields = Record<string, unknown>;

const mc = (over: Fields = {}): Fields => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'q1',
  title: 'Capitals',
  question: 'Which city is the capital of Japan?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'tokyo', text: 'Tokyo', isCorrect: true },
    { id: 'seoul', text: 'Seoul', isCorrect: false },
  ],
  ...over,
});

const fib = (over: Fields = {}): Fields => ({
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'f1',
  title: 'Past tense',
  passage: 'Yesterday I {{go}} home.',
  blanks: [{ id: 'go', acceptedAnswers: ['went'] }],
  scoringStrategy: 'partial',
  ...over,
});

const wr = (over: Fields = {}): Fields => ({
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'w1',
  title: 'Holiday',
  prompt: 'Describe your last holiday.',
  minWords: 80,
  maxWords: 120,
  ...over,
});

/** `[code, severity, path]` per issue: the whole contract of a result, in order. */
const summary = (result: DraftValidationResult<unknown>) =>
  result.issues.map((found) => [found.code, found.severity, found.path.join('.')]);

describe('validateDraft: the result', () => {
  it('is complete for a valid activity, with the data validateActivity returns', () => {
    const draft = mc({ questionHtml: '<p>Which city?</p>', 'x-editor-note': 'kept' });
    const result = validateDraft('multiple-choice', draft);
    expect(result.status).toBe('complete');
    expect(result.issues).toEqual([]);
    if (result.status !== 'complete') {
      throw new Error('unreachable');
    }
    const validated = validateActivity('multiple-choice', draft);
    expect(validated.success).toBe(true);
    expect(result.data).toEqual(validated.success ? validated.data : undefined);
    // Loose, like validateActivity: sidecars survive.
    expect(result.data).toMatchObject({
      questionHtml: '<p>Which city?</p>',
      'x-editor-note': 'kept',
    });
  });

  it('has no success boolean to be misread', () => {
    // A `success` field would have to call an incomplete draft one thing or the
    // other; `if (result.success)` must not be expressible at all.
    expect(Object.keys(validateDraft('multiple-choice', mc()))).toEqual([
      'status',
      'data',
      'issues',
    ]);
    expect(Object.keys(validateDraft('multiple-choice', mc({ title: '' })))).toEqual([
      'status',
      'issues',
    ]);
  });

  it('is invalid when any issue is invalid, even beside incomplete ones', () => {
    const result = validateDraft(
      'multiple-choice',
      mc({
        title: '',
        options: [
          { id: 'a', text: 'A', isCorrect: true },
          { id: 'b', text: 'B', isCorrect: true },
        ],
      }),
    );
    expect(result.status).toBe('invalid');
    expect(summary(result)).toEqual([
      ['title_required', 'incomplete', 'title'],
      ['mc_single_mode_one_correct', 'invalid', 'options'],
    ]);
  });

  it('throws for an unregistered type, and for item-group, which is a container', () => {
    expect(() => validateDraft('matching' as ActivityType, {})).toThrow(UnknownActivityTypeError);
    expect(() => validateDraft('item-group' as ActivityType, {})).toThrow(UnknownActivityTypeError);
  });

  it('reports a draft that is not an object as invalid, with the schema’s own issue', () => {
    for (const draft of ['text', null, [], 42]) {
      const result = validateDraft('written-response', draft);
      expect(result.status).toBe('invalid');
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.every((found) => found.severity === 'invalid')).toBe(true);
    }
    // A draft that is itself `null` is not a field, so it keeps the schema's own
    // code rather than `null_not_allowed`.
    expect(summary(validateDraft('written-response', null))).toEqual([
      ['invalid_type', 'invalid', ''],
    ]);
  });

  it('passes the schema’s own diagnostic through for a value of the wrong kind', () => {
    expect(summary(validateDraft('multiple-choice', mc({ mode: 'bogus' })))).toEqual([
      ['invalid_value', 'invalid', 'mode'],
    ]);
    expect(summary(validateDraft('multiple-choice', mc({ shuffle: 'yes' })))).toEqual([
      ['invalid_type', 'invalid', 'shuffle'],
    ]);
  });
});

describe('validateDraft: multiple-choice', () => {
  it('reports a new, unwritten question as incomplete — never as an error', () => {
    const result = validateDraft(
      'multiple-choice',
      mc({
        title: '',
        question: '',
        options: [
          { id: 'a', text: '', isCorrect: false },
          { id: 'b', text: '', isCorrect: false },
        ],
      }),
    );
    expect(result.status).toBe('incomplete');
    expect(summary(result)).toEqual([
      ['title_required', 'incomplete', 'title'],
      ['mc_question_required', 'incomplete', 'question'],
      ['mc_option_text_required', 'incomplete', 'options.0.text'],
      ['mc_option_text_required', 'incomplete', 'options.1.text'],
      ['mc_correct_option_required', 'incomplete', 'options'],
    ]);
    // The schema reports two contradictory refinements for "no option correct";
    // one issue replaces both.
    expect(result.issues.map((found) => found.message)).toContain('Mark the correct option.');
  });

  it('is stricter than validateActivity about text that is only whitespace', () => {
    const draft = mc({
      title: ' ',
      question: '\t',
      options: [
        { id: 'a', text: '  ', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: false },
      ],
    });
    expect(validateActivity('multiple-choice', draft).success).toBe(true);
    expect(summary(validateDraft('multiple-choice', draft))).toEqual([
      ['title_required', 'incomplete', 'title'],
      ['mc_question_required', 'incomplete', 'question'],
      ['mc_option_text_required', 'incomplete', 'options.0.text'],
    ]);
  });

  it('asks a multi-select question for at least one correct option', () => {
    const result = validateDraft(
      'multiple-choice',
      mc({
        mode: 'multi',
        options: [
          { id: 'a', text: 'A', isCorrect: false },
          { id: 'b', text: 'B', isCorrect: false },
        ],
      }),
    );
    expect(result.issues).toEqual([
      {
        code: 'mc_correct_option_required',
        severity: 'incomplete',
        path: ['options'],
        message: 'Mark at least one option as correct.',
      },
    ]);
  });

  it('counts options: too few is unfinished, too many is wrong', () => {
    expect(
      summary(
        validateDraft(
          'multiple-choice',
          mc({ options: [{ id: 'a', text: 'A', isCorrect: true }] }),
        ),
      ),
    ).toEqual([['mc_options_too_few', 'incomplete', 'options']]);
    expect(summary(validateDraft('multiple-choice', mc({ options: undefined })))).toEqual([
      ['mc_options_too_few', 'incomplete', 'options'],
      ['mc_correct_option_required', 'incomplete', 'options'],
    ]);
    const many = Array.from({ length: 27 }, (_, index) => ({
      id: `o${index}`,
      text: `Option ${index}`,
      isCorrect: index === 0,
    }));
    expect(summary(validateDraft('multiple-choice', mc({ options: many })))).toEqual([
      ['mc_options_too_many', 'invalid', 'options'],
    ]);
  });

  it('reports option ids that are missing or shared as invalid', () => {
    expect(
      summary(
        validateDraft(
          'multiple-choice',
          mc({
            options: [
              { id: 'a', text: 'A', isCorrect: true },
              { id: 'a', text: 'B', isCorrect: false },
            ],
          }),
        ),
      ),
    ).toEqual([['mc_option_id_duplicate', 'invalid', 'options']]);
    expect(
      summary(
        validateDraft(
          'multiple-choice',
          mc({
            options: [
              { id: '', text: 'A', isCorrect: true },
              { id: 'b', text: 'B', isCorrect: false },
            ],
          }),
        ),
      ),
    ).toEqual([['mc_option_id_required', 'invalid', 'options.0.id']]);
  });

  it('does not repeat the schema’s option-set failure beside the options that cause it', () => {
    // Two empty ids also break the schema's "ids must be unique" refinement,
    // which it reports at `options`. The issues inside `options` already say
    // what is wrong, so that parent-level failure is not added again.
    const draft = mc({
      options: [
        { id: '', text: 'A', isCorrect: true },
        { id: '', text: 'B', isCorrect: false },
      ],
    });
    const stored = validateActivity('multiple-choice', draft);
    expect(stored.success ? [] : stored.errors.map((error) => error.path.join('.'))).toContain(
      'options',
    );
    expect(summary(validateDraft('multiple-choice', draft))).toEqual([
      ['mc_option_id_required', 'invalid', 'options.0.id'],
      ['mc_option_id_required', 'invalid', 'options.1.id'],
    ]);
  });

  it('treats an unset mode or scoring strategy as not chosen yet', () => {
    const draft = mc();
    delete draft.mode;
    delete draft.scoringStrategy;
    expect(summary(validateDraft('multiple-choice', draft))).toEqual([
      ['mc_mode_required', 'incomplete', 'mode'],
      ['scoring_strategy_required', 'incomplete', 'scoringStrategy'],
    ]);
  });
});

describe('validateDraft: fill-in-the-blanks', () => {
  it('reports a new, unwritten passage as incomplete', () => {
    expect(
      summary(validateDraft('fill-in-the-blanks', fib({ title: '', passage: '', blanks: [] }))),
    ).toEqual([
      ['title_required', 'incomplete', 'title'],
      ['fib_passage_required', 'incomplete', 'passage'],
      ['fib_blanks_required', 'incomplete', 'blanks'],
    ]);
  });

  it('says which way the passage and the blanks fail to pair', () => {
    expect(summary(validateDraft('fill-in-the-blanks', fib({ blanks: [] })))).toEqual([
      ['fib_blanks_required', 'incomplete', 'blanks'],
      ['fib_blank_missing', 'incomplete', 'passage'],
    ]);
    expect(
      summary(validateDraft('fill-in-the-blanks', fib({ passage: 'Yesterday I went home.' }))),
    ).toEqual([['fib_placeholder_missing', 'incomplete', 'passage']]);
    expect(
      summary(validateDraft('fill-in-the-blanks', fib({ passage: 'I {{go}}, you {{go}}.' }))),
    ).toEqual([['fib_placeholder_duplicate', 'invalid', 'passage']]);
    expect(
      summary(
        validateDraft(
          'fill-in-the-blanks',
          fib({
            blanks: [
              { id: 'go', acceptedAnswers: ['went'] },
              { id: 'go', acceptedAnswers: ['gone'] },
            ],
          }),
        ),
      ),
    ).toEqual([['fib_blank_id_duplicate', 'invalid', 'passage']]);
  });

  it('names a pairing failure no specific code describes, instead of leaking the schema’s', () => {
    const result = validateDraft(
      'fill-in-the-blanks',
      fib({
        blanks: [
          { id: '', acceptedAnswers: ['x'] },
          { id: 'go', acceptedAnswers: ['went'] },
        ],
      }),
    );
    expect(summary(result)).toEqual([
      ['fib_blank_id_required', 'invalid', 'blanks.0.id'],
      ['fib_blanks_mismatch', 'invalid', 'passage'],
    ]);
  });

  it('reads placeholders exactly as the schema does, spaces and all', () => {
    expect(
      validateDraft('fill-in-the-blanks', fib({ passage: 'Yesterday I {{ go }} home.' })).status,
    ).toBe('complete');
  });

  it('reports empty accepted answers where they are', () => {
    expect(
      summary(
        validateDraft('fill-in-the-blanks', fib({ blanks: [{ id: 'go', acceptedAnswers: [] }] })),
      ),
    ).toEqual([['fib_accepted_answers_required', 'incomplete', 'blanks.0.acceptedAnswers']]);
    expect(
      summary(
        validateDraft(
          'fill-in-the-blanks',
          fib({ blanks: [{ id: 'go', acceptedAnswers: ['went', '', '  '] }] }),
        ),
      ),
    ).toEqual([
      ['fib_accepted_answer_empty', 'incomplete', 'blanks.0.acceptedAnswers.1'],
      ['fib_accepted_answer_empty', 'incomplete', 'blanks.0.acceptedAnswers.2'],
    ]);
  });

  it('refuses a typo tolerance that is not a whole number of 0 or more', () => {
    for (const levenshtein of [-1, 1.5]) {
      expect(
        summary(
          validateDraft(
            'fill-in-the-blanks',
            fib({ blanks: [{ id: 'go', acceptedAnswers: ['went'], match: { levenshtein } }] }),
          ),
        ),
      ).toEqual([['fib_levenshtein_invalid', 'invalid', 'blanks.0.match.levenshtein']]);
    }
  });
});

describe('validateDraft: written-response', () => {
  it('requires a prompt, which validateActivity does not', () => {
    const draft = wr({ prompt: '' });
    expect(validateActivity('written-response', draft).success).toBe(true);
    expect(validateDraft('written-response', draft).issues).toEqual([
      {
        code: 'wr_prompt_required',
        severity: 'incomplete',
        path: ['prompt'],
        message: 'Write the prompt.',
      },
    ]);
  });

  it('requires the plain prompt even beside promptHtml, and says why', () => {
    const result = validateDraft(
      'written-response',
      wr({ prompt: '', promptHtml: '<p>Describe your holiday.</p>' }),
    );
    expect(summary(result)).toEqual([['wr_prompt_required', 'incomplete', 'prompt']]);
    expect(result.issues[0]?.message).toMatch(/plain text/);
  });

  it('accepts minWords 0, which means no lower limit', () => {
    expect(validateDraft('written-response', wr({ minWords: 0 })).status).toBe('complete');
  });

  it('reads maxWords 0 as not set yet, and a missing bound as unset', () => {
    expect(summary(validateDraft('written-response', wr({ minWords: 0, maxWords: 0 })))).toEqual([
      ['wr_max_words_required', 'incomplete', 'maxWords'],
    ]);
    expect(
      summary(validateDraft('written-response', wr({ minWords: undefined, maxWords: undefined }))),
    ).toEqual([
      ['wr_min_words_required', 'incomplete', 'minWords'],
      ['wr_max_words_required', 'incomplete', 'maxWords'],
    ]);
  });

  it('refuses word counts that are not whole numbers in range', () => {
    for (const minWords of [-1, 1.5, Number.NaN]) {
      expect(summary(validateDraft('written-response', wr({ minWords })))).toEqual([
        ['wr_min_words_invalid', 'invalid', 'minWords'],
      ]);
    }
    for (const maxWords of [-5, 2.5, Number.POSITIVE_INFINITY]) {
      const result = validateDraft('written-response', wr({ minWords: 0, maxWords }));
      expect(summary(result)).toEqual([['wr_max_words_invalid', 'invalid', 'maxWords']]);
      // Infinity is not a whole number, rather than a whole number too large to hold.
      expect(result.issues[0]?.message, String(maxWords)).toBe(
        'The maximum word count must be a whole number, 1 or more.',
      );
    }
    expect(
      summary(validateDraft('written-response', wr({ minWords: 200, maxWords: 100 }))),
    ).toEqual([['wr_word_bounds_order', 'invalid', 'maxWords']]);
  });

  it('holds the word bounds inclusive: a maximum equal to the minimum is fine, one below is not', () => {
    expect(validateDraft('written-response', wr({ minWords: 120, maxWords: 120 })).status).toBe(
      'complete',
    );
    expect(
      summary(validateDraft('written-response', wr({ minWords: 121, maxWords: 120 }))),
    ).toEqual([['wr_word_bounds_order', 'invalid', 'maxWords']]);
  });

  it('checks a rubric criterion by criterion', () => {
    const criteria = (list: unknown[]) => wr({ rubric: { criteria: list } });
    expect(summary(validateDraft('written-response', criteria([])))).toEqual([
      ['wr_rubric_criteria_required', 'incomplete', 'rubric.criteria'],
    ]);
    const blankName = criteria([{ name: '   ', weight: 1 }]);
    expect(validateActivity('written-response', blankName).success).toBe(true);
    expect(summary(validateDraft('written-response', blankName))).toEqual([
      ['wr_criterion_name_required', 'incomplete', 'rubric.criteria.0.name'],
    ]);
    expect(summary(validateDraft('written-response', criteria([{ name: 'Grammar' }])))).toEqual([
      ['wr_criterion_weight_required', 'incomplete', 'rubric.criteria.0.weight'],
    ]);
    expect(
      summary(validateDraft('written-response', criteria([{ name: 'Grammar', weight: -1 }]))),
    ).toEqual([['wr_criterion_weight_invalid', 'invalid', 'rubric.criteria.0.weight']]);
  });

  it('accepts weights above 1, because weights are normalised by their sum', () => {
    const draft = wr({
      rubric: {
        criteria: [
          { name: 'Task achievement', weight: 2 },
          { name: 'Grammar', weight: 1.5 },
        ],
      },
    });
    expect(validateDraft('written-response', draft).status).toBe('complete');
  });

  it('reports a rubric whose weights are all 0, from which no total can be computed', () => {
    const draft = wr({
      rubric: {
        criteria: [
          { name: 'Grammar', weight: 0 },
          { name: 'Vocabulary', weight: 0 },
        ],
      },
    });
    expect(validateActivity('written-response', draft).success).toBe(true);
    expect(summary(validateDraft('written-response', draft))).toEqual([
      ['wr_rubric_weights_zero', 'incomplete', 'rubric.criteria'],
    ]);
    // The reason, from the SDK's own arithmetic.
    expect(
      gradeFromRubric([
        { name: 'Grammar', score: 1, weight: 0 },
        { name: 'Vocabulary', score: 1, weight: 0 },
      ]),
    ).toMatchObject({ unscorable: true });
  });
});

describe('validateDraft: fields every activity shares', () => {
  it('refuses a pass threshold outside 0..1 and a difficulty outside 1..5', () => {
    expect(summary(validateDraft('written-response', wr({ passThreshold: 1.5 })))).toEqual([
      ['pass_threshold_invalid', 'invalid', 'passThreshold'],
    ]);
    expect(summary(validateDraft('written-response', wr({ difficultyLevel: 6 })))).toEqual([
      ['difficulty_level_invalid', 'invalid', 'difficultyLevel'],
    ]);
  });

  it('reports an empty feedback message as something still to write', () => {
    expect(
      summary(
        validateDraft('multiple-choice', mc({ feedback: { correct: '', incorrect: 'No.' } })),
      ),
    ).toEqual([['feedback_empty', 'incomplete', 'feedback.correct']]);
  });

  it('splits media into what is unwritten and what is refused', () => {
    const withMedia = (media: Fields) => summary(validateDraft('multiple-choice', mc({ media })));

    expect(withMedia({ type: 'image', url: '' })).toEqual([
      ['media_url_required', 'incomplete', 'media.url'],
      ['media_alt_required', 'incomplete', 'media.alt'],
    ]);
    // The schema accepts an alt that is only whitespace; a screen reader does not.
    expect(withMedia({ type: 'image', url: '/map.png', alt: '  ' })).toEqual([
      ['media_alt_required', 'incomplete', 'media.alt'],
    ]);
    expect(withMedia({ type: 'audio', url: 'javascript:alert(1)' })).toEqual([
      ['media_url_invalid', 'invalid', 'media.url'],
    ]);
    expect(withMedia({ type: 'embed', url: 'data:text/html,x', alt: 'Lesson' })).toEqual([
      ['media_url_invalid', 'invalid', 'media.url'],
    ]);
    expect(withMedia({ type: 'audio', url: '/a.mp3', captionsUrl: 'captions.vtt' })).toEqual([
      ['media_url_invalid', 'invalid', 'media.captionsUrl'],
    ]);
    expect(withMedia({ type: 'video', url: '/v.mp4', playback: { maxPlays: 2 } })).toEqual([
      ['media_playback_invalid', 'invalid', 'media.playback'],
    ]);
    expect(withMedia({ type: 'audio', url: '/a.mp3', playback: { maxPlay: 2 } })).toEqual([
      ['media_playback_invalid', 'invalid', 'media.playback'],
    ]);
    expect(withMedia({ type: 'gif', url: '/a.gif' })).toEqual([
      ['media_invalid', 'invalid', 'media.type'],
    ]);
  });

  it('explains a refused media address instead of reporting "Invalid input"', () => {
    const result = validateDraft(
      'multiple-choice',
      mc({ media: { type: 'audio', url: 'clip.mp3' } }),
    );
    expect(result.issues[0]?.message).toMatch(/https:, http:, data: or blob:/);
    const embed = validateDraft(
      'multiple-choice',
      mc({ media: { type: 'embed', url: '/player', alt: 'Lesson' } }),
    );
    expect(embed.issues[0]?.message).toMatch(/embed/);
  });
});

describe('validateDraft: registered types', () => {
  interface ProbeData {
    type: string;
    label: string;
    count: number;
    items?: { text: string }[];
  }
  const probeSchema = (type: string) =>
    z.looseObject({
      type: z.literal(type),
      label: z.string().min(1),
      count: z.number().int(),
      items: z
        .array(z.looseObject({ text: z.string().min(1) }))
        .min(2)
        .optional(),
    }) as unknown as z.ZodType<ProbeData>;

  it('reports every schema failure as invalid for a type with no checkDraft', () => {
    registerActivityType(
      defineActivityType<ProbeData, unknown>({
        type: 'draft-probe-plain',
        schema: probeSchema('draft-probe-plain'),
        scoring: { kind: 'deferred', reason: 'requires_async_grading' },
      }),
    );
    const type = 'draft-probe-plain' as ActivityType;
    expect(validateDraft(type, { type: 'draft-probe-plain', label: 'x', count: 1 }).status).toBe(
      'complete',
    );
    const result = validateDraft(type, { type: 'draft-probe-plain', label: '', count: 1 });
    expect(summary(result)).toEqual([['too_small', 'invalid', 'label']]);
    // The one rule validateDraft applies to every type: a refused null is named.
    expect(
      summary(validateDraft(type, { type: 'draft-probe-plain', label: null, count: 1 })),
    ).toEqual([['null_not_allowed', 'invalid', 'label']]);
  });

  it('names a refused null once, even where the schema objects to it twice', () => {
    registerActivityType(
      defineActivityType<ProbeData, unknown>({
        type: 'draft-probe-twice',
        schema: z.looseObject({
          type: z.literal('draft-probe-twice'),
          label: z
            .string()
            .nullable()
            .refine((value) => value !== null, { error: 'Label is required.' })
            .refine((value) => value !== null, { error: 'Label cannot be left empty.' }),
        }) as unknown as z.ZodType<ProbeData>,
        scoring: { kind: 'deferred', reason: 'requires_async_grading' },
      }),
    );
    const type = 'draft-probe-twice' as ActivityType;
    const draft = { type: 'draft-probe-twice', label: null };
    const stored = validateActivity(type, draft);
    expect(stored.success ? [] : stored.errors.map((error) => error.path.join('.'))).toEqual([
      'label',
      'label',
    ]);
    expect(summary(validateDraft(type, draft))).toEqual([['null_not_allowed', 'invalid', 'label']]);
  });

  it('lets checkDraft speak for a path, and keeps the schema failures it did not cover', () => {
    registerActivityType(
      defineActivityType<ProbeData, unknown>({
        type: 'draft-probe-checked',
        schema: probeSchema('draft-probe-checked'),
        scoring: { kind: 'deferred', reason: 'requires_async_grading' },
        authoring: {
          checkDraft: (draft) => {
            const issues = [];
            if (draft.label === '') {
              issues.push({
                code: 'label_required',
                severity: 'incomplete' as const,
                path: ['label'],
                message: 'Add a label.',
              });
            }
            const items = draft.items;
            if (Array.isArray(items) && items.length > 0 && items[0]?.text === '') {
              issues.push({
                code: 'item_text_required',
                severity: 'incomplete' as const,
                path: ['items', '0', 'text'],
                message: 'Write the item.',
              });
            }
            return issues;
          },
        },
      }),
    );
    const type = 'draft-probe-checked' as ActivityType;

    // Covered: the schema's too_small at `label` is not repeated.
    expect(
      summary(validateDraft(type, { type: 'draft-probe-checked', label: '', count: 1 })),
    ).toEqual([['label_required', 'incomplete', 'label']]);

    // Not covered: `count` stays, as invalid, and makes the draft invalid.
    const uncovered = validateDraft(type, { type: 'draft-probe-checked', label: '', count: 1.5 });
    expect(uncovered.status).toBe('invalid');
    expect(summary(uncovered)).toEqual([
      ['label_required', 'incomplete', 'label'],
      ['invalid_type', 'invalid', 'count'],
    ]);

    // An issue inside a path covers a schema failure at that path's parent. The
    // schema fails at `items` (fewer than two) AND at `items.0.text`; the one
    // issue reported inside `items` covers both, so neither is added as invalid.
    const nested = { type: 'draft-probe-checked', label: 'x', count: 1, items: [{ text: '' }] };
    const stored = validateActivity(type, nested);
    expect(stored.success ? [] : stored.errors.map((error) => error.path.join('.'))).toEqual([
      'items.0.text',
      'items',
    ]);
    expect(summary(validateDraft(type, nested))).toEqual([
      ['item_text_required', 'incomplete', 'items.0.text'],
    ]);

    // Inside a path, not merely beside it: an issue at `items.0.text` says
    // nothing about `items.1.text`, which stays, as invalid.
    const siblings = {
      type: 'draft-probe-checked',
      label: 'x',
      count: 1,
      items: [{ text: '' }, { text: '' }],
    };
    expect(summary(validateDraft(type, siblings))).toEqual([
      ['item_text_required', 'incomplete', 'items.0.text'],
      ['too_small', 'invalid', 'items.1.text'],
    ]);
  });

  it('accounts for a failure at the root only with an issue at the root', () => {
    // A refinement given no path is reported at the root, and every path is
    // inside the root — so a prefix rule alone would let any issue hide it.
    registerActivityType(
      defineActivityType<ProbeData, unknown>({
        type: 'draft-probe-root',
        schema: z
          .looseObject({
            type: z.literal('draft-probe-root'),
            label: z.string().min(1),
            count: z.number().int(),
          })
          .refine((data) => data.count < 10, {
            error: 'Count must be under 10.',
          }) as unknown as z.ZodType<ProbeData>,
        scoring: { kind: 'deferred', reason: 'requires_async_grading' },
        authoring: {
          checkDraft: (draft) =>
            draft.label === ''
              ? [
                  {
                    code: 'label_required',
                    severity: 'incomplete' as const,
                    path: ['label'],
                    message: 'Add a label.',
                  },
                ]
              : [],
        },
      }),
    );
    const result = validateDraft('draft-probe-root' as ActivityType, {
      type: 'draft-probe-root',
      label: '',
      count: 12,
    });
    expect(result.status).toBe('invalid');
    expect(summary(result)).toEqual([
      ['label_required', 'incomplete', 'label'],
      ['custom', 'invalid', ''],
    ]);
  });

  it('fails closed on a severity a check misspelled', () => {
    registerActivityType(
      defineActivityType<ProbeData, unknown>({
        type: 'draft-probe-misspelled',
        schema: probeSchema('draft-probe-misspelled'),
        scoring: { kind: 'deferred', reason: 'requires_async_grading' },
        authoring: {
          checkDraft: () => [
            {
              code: 'odd',
              severity: 'incomplet' as unknown as 'incomplete',
              path: ['label'],
              message: 'Typo.',
            },
          ],
        },
      }),
    );
    const result = validateDraft('draft-probe-misspelled' as ActivityType, {
      type: 'draft-probe-misspelled',
      label: 'x',
      count: 1,
    });
    expect(result.status).toBe('invalid');
  });
});

/**
 * Values real editors hand over that the first cut of the checks did not name:
 * each came back as the schema library's own code at `invalid`, so a question an
 * author had simply not finished read as a broken one.
 */
describe('validateDraft: what an editor hands over', () => {
  it('asks whether each option is correct when an option does not say', () => {
    const unset = mc({
      options: [
        { id: 'tokyo', text: 'Tokyo', isCorrect: true },
        { id: 'seoul', text: 'Seoul' },
      ],
    });
    expect(validateActivity('multiple-choice', unset).success).toBe(false);
    expect(summary(validateDraft('multiple-choice', unset))).toEqual([
      ['mc_option_correctness_required', 'incomplete', 'options.1.isCorrect'],
    ]);
    const nulled = mc({
      options: [
        { id: 'tokyo', text: 'Tokyo', isCorrect: null },
        { id: 'seoul', text: 'Seoul', isCorrect: null },
      ],
    });
    expect(summary(validateDraft('multiple-choice', nulled))).toEqual([
      ['mc_option_correctness_required', 'incomplete', 'options.0.isCorrect'],
      ['mc_option_correctness_required', 'incomplete', 'options.1.isCorrect'],
      ['mc_correct_option_required', 'incomplete', 'options'],
    ]);
  });

  it('reads the empty value of an unchosen select as not chosen yet', () => {
    expect(
      summary(validateDraft('multiple-choice', mc({ mode: '', scoringStrategy: '' }))),
    ).toEqual([
      ['mc_mode_required', 'incomplete', 'mode'],
      ['scoring_strategy_required', 'incomplete', 'scoringStrategy'],
    ]);
  });

  it('asks for the kind of a media block when it has none', () => {
    for (const media of [
      { url: '/clip.mp3' },
      { type: null, url: '/clip.mp3' },
      { type: '', url: '/clip.mp3' },
    ]) {
      expect(summary(validateDraft('multiple-choice', mc({ media })))).toEqual([
        ['media_type_required', 'incomplete', 'media.type'],
      ]);
    }
  });

  it('reports a draft whose schemaVersion or type is wrong as invalid', () => {
    const unversioned = mc();
    delete unversioned.schemaVersion;
    expect(summary(validateDraft('multiple-choice', unversioned))).toEqual([
      ['schema_version_invalid', 'invalid', 'schemaVersion'],
    ]);
    expect(summary(validateDraft('multiple-choice', mc({ type: 'written-response' })))).toEqual([
      ['type_mismatch', 'invalid', 'type'],
    ]);
  });

  it('refuses a redact() projection as a draft', () => {
    expect(summary(validateDraft('multiple-choice', mc({ redacted: true })))).toEqual([
      ['redacted_data', 'invalid', 'redacted'],
    ]);
    expect(validateDraft('multiple-choice', mc({ redacted: false })).status).toBe('complete');
  });

  it('names a null the schema refuses, once, at its path', () => {
    const rubric = { criteria: [{ name: 'Grammar', weight: 1 }] };
    const audio = { type: 'audio', url: '/a.mp3' };
    const blank = { id: 'go', acceptedAnswers: ['went'] };
    const cases: [ActivityType, Fields, string][] = [
      ['multiple-choice', mc({ questionHtml: null }), 'questionHtml'],
      ['multiple-choice', mc({ shuffle: null }), 'shuffle'],
      ['multiple-choice', mc({ locale: null }), 'locale'],
      ['multiple-choice', mc({ learningObjectives: null }), 'learningObjectives'],
      ['multiple-choice', mc({ passThreshold: null }), 'passThreshold'],
      ['multiple-choice', mc({ difficultyLevel: null }), 'difficultyLevel'],
      ['multiple-choice', mc({ feedback: null }), 'feedback'],
      ['multiple-choice', mc({ feedback: { correct: null } }), 'feedback.correct'],
      ['multiple-choice', mc({ media: null }), 'media'],
      ['multiple-choice', mc({ media: { ...audio, alt: null } }), 'media.alt'],
      ['multiple-choice', mc({ media: { ...audio, captionsUrl: null } }), 'media.captionsUrl'],
      ['multiple-choice', mc({ media: { ...audio, playback: null } }), 'media.playback'],
      [
        'multiple-choice',
        mc({ media: { ...audio, playback: { maxPlays: null } } }),
        'media.playback.maxPlays',
      ],
      [
        'multiple-choice',
        mc({
          options: [
            { id: 'tokyo', text: 'Tokyo', isCorrect: true, feedback: null },
            { id: 'seoul', text: 'Seoul', isCorrect: false },
          ],
        }),
        'options.0.feedback',
      ],
      ['fill-in-the-blanks', fib({ passageHtml: null }), 'passageHtml'],
      ['fill-in-the-blanks', fib({ blanks: [{ ...blank, hint: null }] }), 'blanks.0.hint'],
      [
        'fill-in-the-blanks',
        fib({ blanks: [{ ...blank, acceptedAnswers: ['went', null] }] }),
        'blanks.0.acceptedAnswers.1',
      ],
      ['fill-in-the-blanks', fib({ blanks: [{ ...blank, match: null }] }), 'blanks.0.match'],
      [
        'fill-in-the-blanks',
        fib({ blanks: [{ ...blank, match: { levenshtein: null } }] }),
        'blanks.0.match.levenshtein',
      ],
      [
        'fill-in-the-blanks',
        fib({ blanks: [{ ...blank, match: { normalize: null } }] }),
        'blanks.0.match.normalize',
      ],
      ['written-response', wr({ promptHtml: null }), 'promptHtml'],
      ['written-response', wr({ languageTarget: null }), 'languageTarget'],
      ['written-response', wr({ rubric: null }), 'rubric'],
      ['written-response', wr({ rubric: { ...rubric, label: null } }), 'rubric.label'],
      [
        'written-response',
        wr({ rubric: { criteria: [{ name: 'Grammar', weight: 1, description: null }] } }),
        'rubric.criteria.0.description',
      ],
    ];
    for (const [type, draft, path] of cases) {
      expect(validateActivity(type, draft).success, path).toBe(false);
      expect(summary(validateDraft(type, draft)), path).toEqual([
        ['null_not_allowed', 'invalid', path],
      ]);
    }
  });

  it('still reads null as not set where the field is required', () => {
    expect(summary(validateDraft('multiple-choice', mc({ title: null })))).toEqual([
      ['title_required', 'incomplete', 'title'],
    ]);
    expect(
      summary(
        validateDraft(
          'multiple-choice',
          mc({ media: { type: 'image', url: '/map.png', alt: null } }),
        ),
      ),
    ).toEqual([['media_alt_required', 'incomplete', 'media.alt']]);
  });

  it('asks for a null entry in a list to be removed', () => {
    const result = validateDraft(
      'written-response',
      wr({ rubric: { criteria: [null, { name: 'Grammar', weight: 1 }] } }),
    );
    expect(result.issues).toEqual([
      {
        code: 'null_not_allowed',
        severity: 'invalid',
        path: ['rubric', 'criteria', '0'],
        message: 'This entry has no value. Remove it, or fill it in.',
      },
    ]);
  });

  it('names a null blank once, not also as a failure to pair with the passage', () => {
    const draft = fib({ blanks: [null, { id: 'go', acceptedAnswers: ['went'] }] });
    expect(summary(validateDraft('fill-in-the-blanks', draft))).toEqual([
      ['null_not_allowed', 'invalid', 'blanks.0'],
    ]);
  });

  it('refuses a match locale the runtime rejects, which would otherwise crash scoring', () => {
    const withLocale = (locale: string) =>
      fib({ blanks: [{ id: 'go', acceptedAnswers: ['went'], match: { locale } }] });
    // Why it matters: the schema accepts the tag, and scoring then throws on it.
    expect(validateActivity('fill-in-the-blanks', withLocale('en_US')).success).toBe(true);
    expect(() =>
      evaluate(withLocale('en_US') as unknown as ActivityData, {
        type: 'fill-in-the-blanks',
        answers: { go: 'went' },
      }),
    ).toThrow(RangeError);
    expect(summary(validateDraft('fill-in-the-blanks', withLocale('en_US')))).toEqual([
      ['fib_match_locale_invalid', 'invalid', 'blanks.0.match.locale'],
    ]);
    // An empty locale is skipped by scoring, so it is not reported either.
    for (const accepted of ['tr', 'en-US', '']) {
      expect(validateDraft('fill-in-the-blanks', withLocale(accepted)).status, accepted).toBe(
        'complete',
      );
    }
  });

  it('names any other match value the schema refuses under one code', () => {
    for (const normalize of ['', 'NFD']) {
      expect(
        summary(
          validateDraft(
            'fill-in-the-blanks',
            fib({ blanks: [{ id: 'go', acceptedAnswers: ['went'], match: { normalize } }] }),
          ),
        ),
      ).toEqual([['fib_match_invalid', 'invalid', 'blanks.0.match.normalize']]);
    }
  });

  it('reads a blank captions address as unfinished, like a blank description', () => {
    for (const captionsUrl of ['', '   ']) {
      const draft = mc({ media: { type: 'audio', url: '/part2.mp3', captionsUrl } });
      expect(validateActivity('multiple-choice', draft).success, captionsUrl).toBe(false);
      expect(summary(validateDraft('multiple-choice', draft)), captionsUrl).toEqual([
        ['media_url_required', 'incomplete', 'media.captionsUrl'],
      ]);
    }
    // A written address the policy refuses is still wrong.
    const refused = mc({ media: { type: 'audio', url: '/part2.mp3', captionsUrl: 'part2.vtt' } });
    expect(summary(validateDraft('multiple-choice', refused))).toEqual([
      ['media_url_invalid', 'invalid', 'media.captionsUrl'],
    ]);
  });

  it('asks for an undefined entry in a list to be removed, as it would once JSON wrote it null', () => {
    const tokyo = { id: 'tokyo', text: 'Tokyo', isCorrect: true };
    const seoul = { id: 'seoul', text: 'Seoul', isCorrect: false };
    // A hole, which is what an editor's `delete options[0]` leaves.
    const holed: unknown[] = new Array(3);
    holed[1] = tokyo;
    holed[2] = seoul;
    const cases: [ActivityType, Fields, string][] = [
      ['multiple-choice', mc({ options: [undefined, tokyo, seoul] }), 'options.0'],
      ['multiple-choice', mc({ options: holed }), 'options.0'],
      [
        'fill-in-the-blanks',
        fib({ blanks: [{ id: 'go', acceptedAnswers: ['went', undefined] }] }),
        'blanks.0.acceptedAnswers.1',
      ],
      ['written-response', wr({ learningObjectives: [undefined] }), 'learningObjectives.0'],
      [
        'written-response',
        wr({ rubric: { criteria: [{ name: 'Grammar', weight: 1 }, undefined] } }),
        'rubric.criteria.1',
      ],
    ];
    for (const [type, draft, path] of cases) {
      const expected = [['null_not_allowed', 'invalid', path]];
      expect(summary(validateDraft(type, draft)), path).toEqual(expected);
      expect(summary(validateDraft(type, JSON.parse(JSON.stringify(draft)))), path).toEqual(
        expected,
      );
    }
    expect(
      validateDraft('multiple-choice', mc({ options: [undefined, tokyo, seoul] })).issues[0]
        ?.message,
    ).toBe('This entry has no value. Remove it, or fill it in.');
  });
});

describe('validateDraft: numbers too large to hold exactly', () => {
  it('names a whole number past Number.MAX_SAFE_INTEGER under the field’s own code', () => {
    // 2 ** 53 is a whole number, and zod's `.int()` refuses it.
    expect(validateActivity('written-response', wr({ maxWords: 2 ** 53 })).success).toBe(false);
    const max = validateDraft('written-response', wr({ maxWords: 2 ** 53 }));
    expect(summary(max)).toEqual([['wr_max_words_invalid', 'invalid', 'maxWords']]);
    expect(max.issues[0]?.message).toBe('The maximum word count is too large.');

    const both = validateDraft('written-response', wr({ minWords: 1e21, maxWords: 1e21 }));
    expect(summary(both)).toEqual([
      ['wr_min_words_invalid', 'invalid', 'minWords'],
      ['wr_max_words_invalid', 'invalid', 'maxWords'],
    ]);
    expect(both.issues[0]?.message).toBe('The minimum word count is too large.');

    const tolerance = validateDraft(
      'fill-in-the-blanks',
      fib({
        blanks: [{ id: 'go', acceptedAnswers: ['went'], match: { levenshtein: Number.MAX_VALUE } }],
      }),
    );
    expect(summary(tolerance)).toEqual([
      ['fib_levenshtein_invalid', 'invalid', 'blanks.0.match.levenshtein'],
    ]);
    expect(tolerance.issues[0]?.message).toBe('Typo tolerance is too large.');

    // The largest whole number held exactly is fine, and a negative one too far
    // the other way keeps the ordinary message.
    expect(
      validateDraft('written-response', wr({ minWords: 0, maxWords: Number.MAX_SAFE_INTEGER }))
        .status,
    ).toBe('complete');
    expect(validateDraft('written-response', wr({ minWords: -(2 ** 53) })).issues[0]?.message).toBe(
      'The minimum word count must be a whole number, 0 or more.',
    );
  });

  it('reports rubric weights that add up to more than a number can hold', () => {
    const criteria = [
      { name: 'Grammar', weight: Number.MAX_VALUE },
      { name: 'Range', weight: Number.MAX_VALUE },
    ];
    const draft = wr({ rubric: { criteria } });
    // The schema accepts each weight, and no grade can be computed from them.
    expect(validateActivity('written-response', draft).success).toBe(true);
    expect(
      gradeFromRubric(
        criteria.map((criterion) => ({ ...criterion, score: 1 })),
        draft as unknown as ActivityData,
      ),
    ).toMatchObject({ unscorable: true });
    expect(summary(validateDraft('written-response', draft))).toEqual([
      ['wr_rubric_weights_too_large', 'invalid', 'rubric.criteria'],
    ]);
    // Overflowed stays overflowed, whatever a weight not set yet turns out to be.
    const unfinished = wr({ rubric: { criteria: [...criteria, { name: 'Task' }] } });
    expect(summary(validateDraft('written-response', unfinished))).toEqual([
      ['wr_criterion_weight_required', 'incomplete', 'rubric.criteria.2.weight'],
      ['wr_rubric_weights_too_large', 'invalid', 'rubric.criteria'],
    ]);
  });
});

describe('validateDraft: registered types, as their schemas report', () => {
  const deferred = { kind: 'deferred', reason: 'requires_async_grading' } as const;

  it('keeps a rule of the type’s own that points at a field holding null', () => {
    interface RangeData {
      type: string;
      min: number;
      max: number | null;
    }
    registerActivityType(
      defineActivityType<RangeData, unknown>({
        type: 'draft-probe-range',
        schema: z
          .looseObject({
            type: z.literal('draft-probe-range'),
            min: z.number(),
            max: z.number().nullable(),
          })
          .refine((data) => data.max !== null || data.min < 100, {
            path: ['max'],
            error: 'With no maximum, the minimum must be under 100.',
          })
          .refine((data) => data.max !== null || data.min % 2 === 0, {
            path: ['max'],
            error: 'With no maximum, the minimum must be even.',
          }) as unknown as z.ZodType<RangeData>,
        scoring: deferred,
      }),
    );
    const type = 'draft-probe-range' as ActivityType;
    // The schema accepts the null itself...
    expect(validateDraft(type, { type: 'draft-probe-range', min: 50, max: null }).status).toBe(
      'complete',
    );
    // ...so a failure pointing at it is the type's own rule, in its own words.
    expect(validateDraft(type, { type: 'draft-probe-range', min: 501, max: null }).issues).toEqual([
      {
        path: ['max'],
        code: 'custom',
        severity: 'invalid',
        message: 'With no maximum, the minimum must be under 100.',
      },
      {
        path: ['max'],
        code: 'custom',
        severity: 'invalid',
        message: 'With no maximum, the minimum must be even.',
      },
    ]);
  });

  it('names a null inside a discriminated union, and leaves a plain union its own code', () => {
    const variants = (type: string) =>
      [
        z.looseObject({
          type: z.literal(type),
          kind: z.literal('a'),
          label: z.string().optional(),
        }),
        z.looseObject({
          type: z.literal(type),
          kind: z.literal('b'),
          count: z.number().optional(),
        }),
      ] as const;
    registerActivityType(
      defineActivityType<{ type: string }, unknown>({
        type: 'draft-probe-discriminated',
        schema: z.discriminatedUnion(
          'kind',
          variants('draft-probe-discriminated'),
        ) as unknown as z.ZodType<{ type: string }>,
        scoring: deferred,
      }),
    );
    registerActivityType(
      defineActivityType<{ type: string }, unknown>({
        type: 'draft-probe-union',
        schema: z.union(variants('draft-probe-union')) as unknown as z.ZodType<{ type: string }>,
        scoring: deferred,
      }),
    );
    const discriminated = 'draft-probe-discriminated' as ActivityType;
    expect(
      summary(validateDraft(discriminated, { type: 'draft-probe-discriminated', kind: null })),
    ).toEqual([['null_not_allowed', 'invalid', 'kind']]);
    expect(
      summary(
        validateDraft(discriminated, {
          type: 'draft-probe-discriminated',
          kind: 'a',
          label: null,
        }),
      ),
    ).toEqual([['null_not_allowed', 'invalid', 'label']]);
    // A plain union reports once, at its own path, without saying which member
    // was meant — so there is no null to point at.
    expect(
      summary(
        validateDraft('draft-probe-union' as ActivityType, {
          type: 'draft-probe-union',
          kind: 'a',
          label: null,
        }),
      ),
    ).toEqual([['invalid_union', 'invalid', '']]);
  });

  it('reports a documented code with its documented severity, whichever check reports it', () => {
    let returned: unknown[] = [];
    registerActivityType(
      defineActivityType<{ type: string; title: string }, unknown>({
        type: 'draft-probe-severity',
        schema: z.looseObject({
          type: z.literal('draft-probe-severity'),
          title: z.string().min(1),
        }) as unknown as z.ZodType<{ type: string; title: string }>,
        scoring: deferred,
        authoring: { checkDraft: () => returned as never },
      }),
    );
    const check = (severity: unknown, code: string) => {
      returned = [{ code, severity, path: ['title'], message: 'Title.' }];
      const result = validateDraft('draft-probe-severity' as ActivityType, {
        type: 'draft-probe-severity',
        title: '',
      });
      return [result.status, ...summary(result)];
    };
    // A documented code carries the table's severity...
    expect(check('incomplete', 'null_not_allowed')).toEqual([
      'invalid',
      ['null_not_allowed', 'invalid', 'title'],
    ]);
    expect(check('invalid', 'title_required')).toEqual([
      'incomplete',
      ['title_required', 'incomplete', 'title'],
    ]);
    // ...a code of the type's own keeps its check's, failing closed on a mistake...
    expect(check('warning', 'title_blank')).toEqual([
      'invalid',
      ['title_blank', 'invalid', 'title'],
    ]);
    expect(check(undefined, 'title_blank')).toEqual([
      'invalid',
      ['title_blank', 'invalid', 'title'],
    ]);
    expect(check('incomplete', 'title_blank')).toEqual([
      'incomplete',
      ['title_blank', 'incomplete', 'title'],
    ]);
    // ...and a code that merely shares a name with an object property is its own.
    expect(check('incomplete', 'constructor')).toEqual([
      'incomplete',
      ['constructor', 'incomplete', 'title'],
    ]);
  });

  it('keeps an issue a type reports past the end of a list in its own words', () => {
    registerActivityType(
      defineActivityType<{ type: string }, unknown>({
        type: 'draft-probe-past-end',
        schema: z.looseObject({
          type: z.literal('draft-probe-past-end'),
          items: z.array(z.string()).check((ctx) => {
            if (ctx.value.length < 3) {
              // Reported where the missing entry would go, with its absent value as input.
              ctx.issues.push({
                code: 'custom',
                message: 'Add a third item.',
                input: ctx.value[2],
                path: [2],
              });
            }
          }),
        }) as unknown as z.ZodType<{ type: string }>,
        scoring: deferred,
      }),
    );
    // Nothing is there to be empty, so this is not `null_not_allowed`.
    expect(
      summary(
        validateDraft('draft-probe-past-end' as ActivityType, {
          type: 'draft-probe-past-end',
          items: ['a', 'b'],
        }),
      ),
    ).toEqual([['custom', 'invalid', 'items.2']]);
  });

  it('lets a list index given as a number cover the schema’s failure there', () => {
    registerActivityType(
      defineActivityType<{ type: string }, unknown>({
        type: 'draft-probe-index',
        schema: z.looseObject({
          type: z.literal('draft-probe-index'),
          items: z.array(z.looseObject({ text: z.string().min(1) })),
        }) as unknown as z.ZodType<{ type: string }>,
        scoring: deferred,
        authoring: {
          checkDraft: () => [
            {
              code: 'item_text_required',
              severity: 'incomplete',
              path: ['items', 1, 'text'] as unknown as string[],
              message: 'Write the item.',
            },
          ],
        },
      }),
    );
    const result = validateDraft('draft-probe-index' as ActivityType, {
      type: 'draft-probe-index',
      items: [{ text: 'a' }, { text: '' }],
    });
    expect(result.status).toBe('incomplete');
    expect(result.issues).toEqual([
      {
        code: 'item_text_required',
        severity: 'incomplete',
        path: ['items', '1', 'text'],
        message: 'Write the item.',
      },
    ]);
  });
});
