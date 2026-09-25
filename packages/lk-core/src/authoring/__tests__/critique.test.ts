import { describe, expect, it } from 'vitest';
import { UnknownActivityTypeError } from '../../errors.js';
import { registerActivityType } from '../../registry/index.js';
import type { ItemFinding } from '../../types/authoring.js';
import { ITEM_FINDING_SEVERITY } from '../findings.js';
import { critiqueDraft, critiqueDrafts, critiqueItemGroupDraft, validateDraft } from '../index.js';

/**
 * The item critic: what it points out on a valid item, what it leaves alone,
 * and that it never changes what `validateDraft` says. Each rule is shown
 * firing on one flaw of an otherwise clean item, and staying quiet just short
 * of its line.
 */

type Fields = Record<string, unknown>;

const mc = (over: Fields = {}): Fields => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'mc1',
  title: 'Capital cities',
  question: 'Which city is the capital of Japan?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'o1', text: 'Kyoto', isCorrect: false },
    { id: 'o2', text: 'Tokyo', isCorrect: true },
    { id: 'o3', text: 'Osaka', isCorrect: false },
  ],
  ...over,
});

const fib = (over: Fields = {}): Fields => ({
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'fib1',
  title: 'Past tense',
  passage: 'Yesterday I {{1}} to the market and {{2}} some bread.',
  blanks: [
    { id: '1', acceptedAnswers: ['went'], hint: 'The past of "go" is irregular.' },
    { id: '2', acceptedAnswers: ['bought'] },
  ],
  scoringStrategy: 'partial',
  ...over,
});

const gs = (over: Fields = {}): Fields => ({
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'gs1',
  title: 'Prepositions',
  passage: 'The keys are {{1}} the table, {{2}} the lamp.',
  scoringStrategy: 'partial',
  banks: [
    {
      id: 'b1',
      choices: [
        { id: 'c1', text: 'on' },
        { id: 'c2', text: 'beside' },
        { id: 'c3', text: 'under' },
      ],
    },
  ],
  gaps: [
    { id: '1', bankId: 'b1', correctChoiceId: 'c1' },
    { id: '2', bankId: 'b1', correctChoiceId: 'c2' },
  ],
  ...over,
});

const wr = (over: Fields = {}): Fields => ({
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'wr1',
  title: 'Your weekend',
  prompt: 'Describe your weekend.',
  minWords: 20,
  maxWords: 120,
  rubric: {
    criteria: [
      { name: 'Grammar', weight: 1 },
      { name: 'Task', weight: 1 },
    ],
  },
  ...over,
});

const ra = (over: Fields = {}): Fields => ({
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'ra1',
  title: 'Read the sentence',
  referenceText: 'The weather is lovely today, so we will walk to the park.',
  locale: 'en-US',
  recording: { maxSeconds: 20 },
  scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
  ...over,
});

const codes = (found: ItemFinding[]): string[] => found.map((one) => one.code);
const at = (found: ItemFinding[], code: string) => found.find((one) => one.code === code);

describe('critiqueDraft', () => {
  it('finds nothing in a clean item of every type, each of which is complete', () => {
    for (const item of [mc(), fib(), gs(), wr(), ra()]) {
      const type = item.type as 'multiple-choice';
      expect(validateDraft(type, item).status, String(item.type)).toBe('complete');
      expect(critiqueDraft(type, item), String(item.type)).toEqual([]);
    }
  });

  it('never changes what validateDraft says: a flawed item stays complete', () => {
    const flawed = mc({ title: 'Tokyo, the capital' });
    expect(codes(critiqueDraft('multiple-choice', flawed))).toEqual(['mc_title_reveals_answer']);
    expect(validateDraft('multiple-choice', flawed).status).toBe('complete');
  });

  it('reads a draft of any shape without throwing, and a type with no critic finds nothing', () => {
    for (const draft of [null, 'text', 5, [], {}, { options: 'x' }, { options: [null, 4] }]) {
      for (const type of ['multiple-choice', 'fill-in-the-blanks', 'gap-select'] as const) {
        expect(() => critiqueDraft(type, draft)).not.toThrow();
      }
    }
    expect(
      critiqueDraft('written-response', { rubric: { criteria: [null, { name: 3 }] } }),
    ).toEqual([]);
    expect(
      critiqueDraft('read-aloud', { recording: { maxSeconds: 0 }, referenceText: 'a b c' }),
    ).toEqual([]);
    // Dictation has no rules of its own yet: its reveal check is validateDraft's.
    expect(critiqueDraft('dictation', { transcript: 'x' })).toEqual([]);
    expect(() => critiqueDraft('item-group' as 'dictation', {})).toThrow(UnknownActivityTypeError);
  });
});

describe('multiple choice', () => {
  it('a title that names the right option', () => {
    expect(
      at(
        critiqueDraft('multiple-choice', mc({ title: 'Is it Tokyo?' })),
        'mc_title_reveals_answer',
      ),
    ).toEqual({
      path: ['title'],
      code: 'mc_title_reveals_answer',
      severity: 'warning',
      message: expect.stringContaining('Tokyo'),
    });
    // A distractor in the title gives nothing away.
    expect(critiqueDraft('multiple-choice', mc({ title: 'Not Kyoto' }))).toEqual([]);
  });

  it('two options that read the same, however they are cased, accented or punctuated', () => {
    const found = critiqueDraft(
      'multiple-choice',
      mc({
        options: [
          { id: 'o1', text: 'Café', isCorrect: false },
          { id: 'o2', text: 'Tokyo', isCorrect: true },
          { id: 'o3', text: 'cafe!', isCorrect: false },
        ],
      }),
    );
    expect(at(found, 'mc_options_duplicate')).toMatchObject({ path: ['options', '2', 'text'] });
    // Picture options may share a neutral label: the pictures tell them apart.
    const pictures = critiqueDraft(
      'multiple-choice',
      mc({
        options: [
          {
            id: 'o1',
            text: 'Picture',
            isCorrect: false,
            media: { type: 'image', url: 'https://x.test/a.png', alt: 'A' },
          },
          {
            id: 'o2',
            text: 'Picture',
            isCorrect: true,
            media: { type: 'image', url: 'https://x.test/b.png', alt: 'B' },
          },
        ],
      }),
    );
    expect(codes(pictures)).not.toContain('mc_options_duplicate');
  });

  it('the right option much longer than the rest — by half again and ten characters, not less', () => {
    const withKey = (key: string) =>
      mc({
        options: [
          { id: 'o1', text: 'At home', isCorrect: false },
          { id: 'o2', text: key, isCorrect: true },
          { id: 'o3', text: 'At work', isCorrect: false },
        ],
      });
    // 7 characters beside 27: flagged.
    expect(
      at(
        critiqueDraft('multiple-choice', withKey('At the station, before noon')),
        'mc_key_longest',
      ),
    ).toMatchObject({ path: ['options', '1', 'text'], severity: 'warning' });
    // 16 characters is 9 more: short of the margin.
    expect(codes(critiqueDraft('multiple-choice', withKey('At the old place')))).toEqual([]);
    // 17 is 10 more but not half again of a 12-character distractor.
    const close = mc({
      options: [
        { id: 'o1', text: 'At the office', isCorrect: false },
        { id: 'o2', text: 'At the station today', isCorrect: true },
        { id: 'o3', text: 'At home', isCorrect: false },
      ],
    });
    expect(codes(critiqueDraft('multiple-choice', close))).toEqual([]);
    // Two options, or two right ones, or a multi question: not this rule's.
    expect(
      codes(
        critiqueDraft(
          'multiple-choice',
          mc({
            options: [
              { id: 'o1', text: 'No', isCorrect: false },
              { id: 'o2', text: 'Yes, at the station before noon', isCorrect: true },
            ],
          }),
        ),
      ),
    ).toEqual([]);
  });

  it('every option correct on a multi question', () => {
    const all = mc({
      mode: 'multi',
      options: [
        { id: 'o1', text: 'Kyoto', isCorrect: true },
        { id: 'o2', text: 'Tokyo', isCorrect: true },
      ],
    });
    expect(at(critiqueDraft('multiple-choice', all), 'mc_every_option_correct')).toMatchObject({
      path: ['options'],
    });
    const some = mc({
      mode: 'multi',
      options: [
        { id: 'o1', text: 'Kyoto', isCorrect: true },
        { id: 'o2', text: 'Tokyo', isCorrect: false },
      ],
    });
    expect(critiqueDraft('multiple-choice', some)).toEqual([]);
  });

  it('"all of the above" and letter pairs: a warning under shuffle, advice without', () => {
    const withOption = (text: string, shuffle?: boolean) =>
      mc({
        ...(shuffle !== undefined ? { shuffle } : {}),
        options: [
          { id: 'o1', text: 'Kyoto', isCorrect: false },
          { id: 'o2', text: 'Tokyo', isCorrect: true },
          { id: 'o3', text, isCorrect: false },
        ],
      });
    for (const text of [
      'All of the above',
      'None of the above.',
      'Ninguna de las anteriores',
      'Todas as anteriores',
    ]) {
      expect(codes(critiqueDraft('multiple-choice', withOption(text))), text).toEqual([
        'mc_above_option',
      ]);
      expect(codes(critiqueDraft('multiple-choice', withOption(text, true))), text).toEqual([
        'mc_above_option_shuffled',
      ]);
    }
    // A pair of letters means nothing out of order, and only shuffling makes it so.
    expect(codes(critiqueDraft('multiple-choice', withOption('Both A and B', true)))).toEqual([
      'mc_above_option_shuffled',
    ]);
    expect(critiqueDraft('multiple-choice', withOption('Both A and B'))).toEqual([]);
    // "Above" as a word is not a pointer.
    expect(critiqueDraft('multiple-choice', withOption('Above the clouds', true))).toEqual([]);
  });
});

describe('multiple choice, at the edges of its rules', () => {
  const options = (texts: string[], key = 0, over: Fields = {}) =>
    mc({
      options: texts.map((text, index) => ({ id: `o${index}`, text, isCorrect: index === key })),
      ...over,
    });

  it('the length rule at its lines: exactly half again and ten characters is flagged, a hair less is not', () => {
    const twenty = 'a'.repeat(20);
    // 30 beside 20: half again, and ten more — both lines met exactly.
    expect(
      codes(critiqueDraft('multiple-choice', options(['k'.repeat(30), twenty, 'b'.repeat(20)]))),
    ).toEqual(['mc_key_longest']);
    // 36 beside 25: eleven more, but under half again.
    expect(
      critiqueDraft('multiple-choice', options(['k'.repeat(36), 'b'.repeat(25), 'c'.repeat(9)])),
    ).toEqual([]);
  });

  it('the length rule only on a finished single-answer question without pictures', () => {
    const long = 'At the station, before noon';
    expect(critiqueDraft('multiple-choice', options([long, '   ', 'At work']))).toEqual([]);
    expect(
      critiqueDraft('multiple-choice', options([long, 'At home', 'At work'], 0, { mode: 'multi' })),
    ).toEqual([]);
    const twoKeys = mc({
      options: [
        { id: 'o1', text: long, isCorrect: true },
        { id: 'o2', text: 'At home', isCorrect: true },
        { id: 'o3', text: 'At work', isCorrect: false },
      ],
    });
    expect(codes(critiqueDraft('multiple-choice', twoKeys))).not.toContain('mc_key_longest');
    const pictures = mc({
      options: [
        {
          id: 'o1',
          text: long,
          isCorrect: true,
          media: { type: 'image', url: 'https://x.test/a.png', alt: 'A' },
        },
        { id: 'o2', text: 'At home', isCorrect: false },
        { id: 'o3', text: 'At work', isCorrect: false },
      ],
    });
    expect(critiqueDraft('multiple-choice', pictures)).toEqual([]);
  });

  it('every option correct only on a multi question of two or more', () => {
    const all = (mode: string, count: number) =>
      mc({
        mode,
        options: Array.from({ length: count }, (_, index) => ({
          id: `o${index}`,
          text: `Option ${index}`,
          isCorrect: true,
        })),
      });
    expect(codes(critiqueDraft('multiple-choice', all('single', 2)))).not.toContain(
      'mc_every_option_correct',
    );
    expect(codes(critiqueDraft('multiple-choice', all('multi', 1)))).not.toContain(
      'mc_every_option_correct',
    );
  });

  it('options that are only punctuation are not the same option', () => {
    expect(critiqueDraft('multiple-choice', options(['Tokyo', '?', '...']))).toEqual([]);
  });

  it('every pair of letters a to h, joined by and or or in English, Spanish and Portuguese', () => {
    for (const text of ['Both B and D', 'A or H', 'b y e', 'c o f', 'a e g', 'd ou h']) {
      expect(
        codes(
          critiqueDraft('multiple-choice', options(['Tokyo', 'Kyoto', text], 0, { shuffle: true })),
        ),
        text,
      ).toEqual(['mc_above_option_shuffled']);
    }
    // Past h is not an option letter.
    expect(
      critiqueDraft(
        'multiple-choice',
        options(['Tokyo', 'Kyoto', 'i and j'], 0, { shuffle: true }),
      ),
    ).toEqual([]);
  });
});

describe('fill in the blanks', () => {
  it('a hint that gives its answer away — and a short answer only beside its neighbour', () => {
    const leaky = fib({
      blanks: [
        { id: '1', acceptedAnswers: ['went'], hint: 'Write "went".' },
        { id: '2', acceptedAnswers: ['bought'] },
      ],
    });
    expect(at(critiqueDraft('fill-in-the-blanks', leaky), 'fib_hint_reveals_answer')).toMatchObject(
      {
        path: ['blanks', '0', 'hint'],
      },
    );
    const short = (hint: string) =>
      fib({
        passage: 'My name {{1}} Rossi.',
        blanks: [{ id: '1', acceptedAnswers: ['is'], hint }],
      });
    expect(codes(critiqueDraft('fill-in-the-blanks', short('It is a verb.')))).toEqual([]);
    expect(codes(critiqueDraft('fill-in-the-blanks', short('Try "name is".')))).toEqual([
      'fib_hint_reveals_answer',
    ]);
  });

  it('an answer the passage prints elsewhere, but not a short one', () => {
    const printed = fib({
      passage: 'I {{1}} home. Yesterday I went out.',
      blanks: [{ id: '1', acceptedAnswers: ['walked', 'went'] }],
    });
    expect(at(critiqueDraft('fill-in-the-blanks', printed), 'fib_answer_in_passage')).toMatchObject(
      {
        path: ['blanks', '0', 'acceptedAnswers', '1'],
        message: expect.stringContaining('went'),
      },
    );
    const common = fib({
      passage: 'She {{1}} tired and he is too.',
      blanks: [{ id: '1', acceptedAnswers: ['is'] }],
    });
    expect(critiqueDraft('fill-in-the-blanks', common)).toEqual([]);
  });

  it('a title that contains an answer', () => {
    expect(codes(critiqueDraft('fill-in-the-blanks', fib({ title: 'Went and bought' })))).toEqual([
      'fib_title_reveals_answer',
    ]);
  });

  it('an accepted answer the blank already accepts — under its own matching, typos aside', () => {
    const blank = (over: Fields) =>
      fib({
        passage: 'I {{1}} there.',
        blanks: [{ id: '1', acceptedAnswers: ['went', 'Went ', 'goed'], ...over }],
      });
    // Case and spacing are folded by default: "Went " is "went".
    expect(
      at(critiqueDraft('fill-in-the-blanks', blank({})), 'fib_accepted_answer_redundant'),
    ).toMatchObject({
      path: ['blanks', '0', 'acceptedAnswers', '1'],
      severity: 'advice',
    });
    // Case-sensitive, it is a different answer.
    expect(
      critiqueDraft('fill-in-the-blanks', blank({ caseSensitive: true, trimWhitespace: false })),
    ).toEqual([]);
    // A typo apart still accepts different inputs: not redundant.
    expect(
      codes(
        critiqueDraft(
          'fill-in-the-blanks',
          fib({
            passage: 'I {{1}} there.',
            blanks: [{ id: '1', acceptedAnswers: ['went', 'wemt'], match: { levenshtein: 1 } }],
          }),
        ),
      ),
    ).toEqual([]);
    // A policy the matcher cannot read is left to validateDraft.
    expect(() =>
      critiqueDraft(
        'fill-in-the-blanks',
        fib({
          blanks: [{ id: '1', acceptedAnswers: ['a', 'b'], match: { locale: 'not a locale!' } }],
        }),
      ),
    ).not.toThrow();
  });
});

describe('fill in the blanks, at the edges of its rules', () => {
  it('a blank named after its answer is not the answer printed', () => {
    const named = fib({
      passage: 'I {{went}} home.',
      blanks: [{ id: 'went', acceptedAnswers: ['went'] }],
    });
    expect(critiqueDraft('fill-in-the-blanks', named)).toEqual([]);
  });
});

describe('gap select', () => {
  it('a bank with no distractor, however many gaps draw on it', () => {
    const tight = gs({
      banks: [
        {
          id: 'b1',
          choices: [
            { id: 'c1', text: 'on' },
            { id: 'c2', text: 'beside' },
          ],
        },
      ],
    });
    expect(at(critiqueDraft('gap-select', tight), 'gs_bank_no_distractor')).toMatchObject({
      path: ['banks', '0', 'choices'],
    });
  });

  it('two choices that read the same, in a bank or a gap’s own list', () => {
    const own = gs({
      banks: undefined,
      gaps: [
        {
          id: '1',
          correctChoiceId: 'c1',
          choices: [
            { id: 'c1', text: 'on' },
            { id: 'c2', text: 'On' },
          ],
        },
        {
          id: '2',
          correctChoiceId: 'c3',
          choices: [
            { id: 'c3', text: 'beside' },
            { id: 'c4', text: 'under' },
          ],
        },
      ],
    });
    expect(at(critiqueDraft('gap-select', own), 'gs_choices_duplicate')).toMatchObject({
      path: ['gaps', '0', 'choices', '1', 'text'],
    });
  });

  it('an answer the passage prints, and a title that contains one', () => {
    const printed = gs({ passage: 'The keys are {{1}} the table, {{2}} the lamp beside it.' });
    expect(at(critiqueDraft('gap-select', printed), 'gs_answer_in_passage')).toMatchObject({
      path: ['gaps', '1', 'correctChoiceId'],
    });
    expect(codes(critiqueDraft('gap-select', gs({ title: 'Beside or under' })))).toEqual([
      'gs_title_reveals_answer',
    ]);
  });
});

describe('gap select, at the edges of its rules', () => {
  it('a gap with its own choices: the answer printed, a title with it, and a bank beside it counted apart', () => {
    const own = gs({
      title: 'Beside the lamp',
      passage: 'The keys are {{1}} the table, {{2}} the lamp. Under it is dust. Beside it too.',
      banks: [
        {
          id: 'b1',
          choices: [
            { id: 'c1', text: 'on' },
            { id: 'c2', text: 'beside' },
            { id: 'c3', text: 'under' },
          ],
        },
      ],
      gaps: [
        { id: '1', bankId: 'b1', correctChoiceId: 'c1' },
        {
          id: '2',
          correctChoiceId: 'x2',
          choices: [
            { id: 'x1', text: 'near' },
            { id: 'x2', text: 'beside' },
          ],
        },
      ],
    });
    expect(critiqueDraft('gap-select', own).map((one) => [one.code, one.path.join('.')])).toEqual([
      ['gs_title_reveals_answer', 'title'],
      ['gs_answer_in_passage', 'gaps.1.correctChoiceId'],
    ]);
  });

  it('passes over gaps and banks that are not objects', () => {
    expect(critiqueDraft('gap-select', gs({ gaps: [null, 3], banks: [null] }))).toEqual([]);
  });

  it('a bank counts only the gaps that draw on it, and two alike in a bank are named', () => {
    const shared = gs({
      passage: 'The keys are {{1}} the table, {{2}} the lamp, {{3}} a book.',
      gaps: [
        { id: '1', bankId: 'b1', correctChoiceId: 'c1' },
        { id: '2', bankId: 'b1', correctChoiceId: 'c2' },
        {
          id: '3',
          correctChoiceId: 'x1',
          choices: [
            { id: 'x1', text: 'near' },
            { id: 'x2', text: 'far' },
          ],
        },
      ],
    });
    expect(critiqueDraft('gap-select', shared)).toEqual([]);
    const twice = gs({
      banks: [
        {
          id: 'b1',
          choices: [
            { id: 'c1', text: 'on' },
            { id: 'c2', text: 'beside' },
            { id: 'c3', text: 'under' },
            { id: 'c4', text: 'Under' },
          ],
        },
      ],
    });
    expect(critiqueDraft('gap-select', twice).map((one) => one.path.join('.'))).toEqual([
      'banks.0.choices.3.text',
    ]);
    // One gap on a bank of one choice is too few choices, which validateDraft says — not this rule.
    const lonely = gs({
      passage: 'The keys are {{1}} the table.',
      banks: [{ id: 'b1', choices: [{ id: 'c1', text: 'on' }] }],
      gaps: [{ id: '1', bankId: 'b1', correctChoiceId: 'c1' }],
    });
    expect(codes(critiqueDraft('gap-select', lonely))).not.toContain('gs_bank_no_distractor');
  });
});

describe('written response and read aloud', () => {
  it('two rubric criteria named alike', () => {
    const twice = wr({
      rubric: {
        criteria: [
          { name: 'Grammar', weight: 1 },
          { name: 'grammar ', weight: 2 },
        ],
      },
    });
    expect(critiqueDraft('written-response', twice)).toEqual([
      expect.objectContaining({
        code: 'wr_criterion_name_duplicate',
        path: ['rubric', 'criteria', '1', 'name'],
      }),
    ]);
  });

  it('a text too long for its recording time — above 2.5 words a second, not at it', () => {
    // 12 words: 4.8 seconds at 2.5 words a second.
    expect(critiqueDraft('read-aloud', ra({ recording: { maxSeconds: 5 } }))).toEqual([]);
    expect(
      at(
        critiqueDraft('read-aloud', ra({ recording: { maxSeconds: 4 } })),
        'ra_text_long_for_time',
      ),
    ).toMatchObject({
      path: ['recording', 'maxSeconds'],
      message: expect.stringContaining('at least 5 seconds'),
    });
  });
});

describe('read aloud at its line', () => {
  it('exactly 2.5 words a second is not flagged', () => {
    expect(
      critiqueDraft(
        'read-aloud',
        ra({
          referenceText: 'one two three four five six seven eight nine ten',
          recording: { maxSeconds: 4 },
        }),
      ),
    ).toEqual([]);
  });
});

describe('a set of items', () => {
  const keyAt = (position: number, over: Fields = {}) =>
    mc({
      options: [0, 1, 2].map((index) => ({
        id: `o${index}`,
        text: ['Kyoto', 'Tokyo', 'Osaka'][index],
        isCorrect: index === position,
      })),
      ...over,
    });

  it('every key in one place across four or more single-answer questions', () => {
    expect(critiqueDrafts([keyAt(0), keyAt(0), keyAt(0), keyAt(0)])).toEqual([
      expect.objectContaining({
        code: 'set_key_position_same',
        path: [],
        message: expect.stringContaining('option 1'),
      }),
    ]);
    // Three is not yet a habit; one elsewhere breaks it; a shuffled one does not count.
    expect(critiqueDrafts([keyAt(0), keyAt(0), keyAt(0)])).toEqual([]);
    expect(critiqueDrafts([keyAt(0), keyAt(0), keyAt(0), keyAt(1)])).toEqual([]);
    expect(critiqueDrafts([keyAt(0), keyAt(0), keyAt(0), keyAt(0, { shuffle: true })])).toEqual([]);
  });

  it('each entry’s findings under its index, a group’s under its items, unknown types skipped', () => {
    const group = {
      type: 'item-group',
      id: 'g1',
      stimulus: { id: 's1', kind: 'text', body: 'Tokyo is the capital of Japan.' },
      items: [
        keyAt(2, { title: 'Osaka?' }),
        { type: 'my-type', id: 'x' },
        keyAt(2),
        keyAt(2),
        keyAt(2),
        keyAt(2),
      ],
    };
    const found = critiqueDrafts([fib({ title: 'Went' }), group, 'junk']);
    expect(found.map((one) => [one.code, one.path.join('.')])).toEqual([
      ['fib_title_reveals_answer', '0.title'],
      ['mc_title_reveals_answer', '1.items.0.title'],
      ['set_key_position_same', '1.items'],
    ]);
    expect(critiqueItemGroupDraft(group).map((one) => one.path.join('.'))).toEqual([
      'items.0.title',
      'items',
    ]);
    expect(critiqueItemGroupDraft(null)).toEqual([]);
  });
});

describe('a set of items, at the edges of its rule', () => {
  const four = (item: Fields) => [item, item, item, item];
  const shaped = (over: Fields) =>
    mc({
      options: [
        { id: 'o1', text: 'Tokyo', isCorrect: true },
        { id: 'o2', text: 'Kyoto', isCorrect: over.twoKeys === true },
        { id: 'o3', text: 'Osaka', isCorrect: false },
      ],
      ...over,
      twoKeys: undefined,
    });

  it('counts only single-answer multiple choice with one key', () => {
    expect(critiqueDrafts(four(shaped({ mode: 'multi' })))).toEqual([]);
    expect(critiqueDrafts(four(shaped({ twoKeys: true })))).toEqual([]);
    expect(critiqueDrafts(four(shaped({ type: 'my-choice' })))).toEqual([]);
  });
});

describe('a registered type’s own critic', () => {
  it('is reported with documented severities, its own codes as warnings unless they say advice', () => {
    registerActivityType({
      type: 'critic-probe',
      schema: {
        '~standard': { version: 1, vendor: 'probe', validate: (value: unknown) => ({ value }) },
      },
      scoring: { kind: 'sync', score: () => ({ score: 1, maxScore: 1, details: [] }) },
      authoring: {
        critique: () => [
          { path: ['a'], code: 'probe_advice', message: 'A', severity: 'advice' },
          { path: [1], code: 'probe_other', message: 'B', severity: 'nonsense' as 'advice' },
          { path: [], code: 'mc_above_option', message: 'C', severity: 'warning' },
        ],
      },
    } as never);
    expect(critiqueDraft('critic-probe' as 'dictation', {})).toEqual([
      { path: ['a'], code: 'probe_advice', message: 'A', severity: 'advice' },
      { path: ['1'], code: 'probe_other', message: 'B', severity: 'warning' },
      { path: [], code: 'mc_above_option', message: 'C', severity: 'advice' },
    ]);
  });
});

describe('the finding table', () => {
  it('holds only the two severities', () => {
    expect(new Set(Object.values(ITEM_FINDING_SEVERITY))).toEqual(new Set(['warning', 'advice']));
  });
});
