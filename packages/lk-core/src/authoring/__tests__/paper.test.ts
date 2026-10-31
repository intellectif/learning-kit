import { describe, expect, it } from 'vitest';
import { critiqueDraft, critiqueDrafts } from '../index.js';

type Fields = Record<string, unknown>;

const STEMS = [
  'Which animal does the writer see first on the morning walk?',
  'Why does the family leave the campsite earlier than they planned?',
  'What does the guide tell everyone to bring on the boat trip?',
  'Where do the children find the lost map at the end?',
  'How does the grandmother feel about moving to the new house?',
  'What does the girl buy for her brother at the market?',
  'When does the last bus leave the village on Sundays?',
  'Who helps the old man carry his shopping up the hill?',
  'Why is the swimming pool closed for the whole of August?',
  'Which present does the boy like most at his party?',
];

/** A single-answer question with its key at `key` of four options, and option texts of the given lengths. */
function question(n: number, key: number, extra: Fields = {}): Fields {
  return {
    schemaVersion: '1.0',
    type: 'multiple-choice',
    id: `q${n}`,
    title: `Question ${n + 1}`,
    question: STEMS[n % STEMS.length],
    mode: 'single',
    options: [0, 1, 2, 3].map((at) => ({
      id: `q${n}-${at}`,
      text: `Choice ${String.fromCharCode(97 + at)}${n}`,
      isCorrect: at === key,
    })),
    scoringStrategy: 'all-or-nothing',
    ...extra,
  };
}

const codesOf = (entries: readonly unknown[]) => critiqueDrafts(entries).map((one) => one.code);

describe('set_key_position_bias', () => {
  it('reports more than half the keys in one place, with the questions involved (case 15)', () => {
    const keys = [1, 1, 0, 1, 1, 2, 1, 3, 1, 1];
    const entries = keys.map((key, n) => question(n, key));
    const found = critiqueDrafts(entries).filter((one) => one.code === 'set_key_position_bias');
    expect(found).toEqual([
      {
        path: [],
        code: 'set_key_position_bias',
        severity: 'warning',
        message:
          '7 of 10 single-answer questions put the right option at B. Spread the keys across positions, or shuffle the options.',
        related: [['0'], ['1'], ['3'], ['4'], ['6'], ['8'], ['9']],
      },
    ]);
  });

  it('reports a position every question has and no key uses, from eight keys', () => {
    const keys = [0, 1, 2, 0, 1, 2, 0, 1];
    const found = critiqueDrafts(keys.map((key, n) => question(n, key))).filter(
      (one) => one.code === 'set_key_position_bias',
    );
    expect(found[0]?.message).toBe(
      'None of 8 single-answer questions puts the right option at D, which every one of them has. A learner can rule it out.',
    );
    expect(found[0]?.related).toHaveLength(8);
  });

  it('counts the items of groups, and leaves out shuffled questions, small sets and every key in one place', () => {
    const group = {
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'g',
      stimulus: { id: 's', kind: 'text', body: 'A passage about a trip.' },
      items: [question(6, 1), question(7, 1)],
    };
    expect(
      codesOf([
        question(0, 1),
        question(1, 1),
        question(2, 0),
        question(3, 1),
        question(4, 2),
        group,
      ]),
    ).toContain('set_key_position_bias');
    expect(codesOf([1, 1, 0, 1, 1].map((key, n) => question(n, key)))).not.toContain(
      'set_key_position_bias',
    );
    expect(
      codesOf([1, 1, 0, 1, 1, 1].map((key, n) => question(n, key, { shuffle: n !== 2 }))),
    ).not.toContain('set_key_position_bias');
    expect(codesOf([1, 1, 1, 1, 1, 1].map((key, n) => question(n, key)))).toEqual([
      'set_key_position_same',
    ]);
    expect(codesOf([0, 1, 2, 3, 0, 1, 2].map((key, n) => question(n, key)))).toEqual([]);
  });
});

describe('set_key_longest_bias', () => {
  const long = (n: number, longest: boolean): Fields => {
    const item = question(n, 0, { shuffle: true });
    (item.options as Fields[])[0] = {
      id: `q${n}-0`,
      text: longest ? 'A much longer right option' : 'Short',
      isCorrect: true,
    };
    return item;
  };

  it('reports the key as the longest option in most of five or more questions', () => {
    const entries = [long(0, true), long(1, true), long(2, true), long(3, false), long(4, false)];
    const found = critiqueDrafts(entries).filter((one) => one.code === 'set_key_longest_bias');
    expect(found).toEqual([
      expect.objectContaining({
        message:
          'In 3 of 5 single-answer questions the right option is the longest. A learner who picks the longest option scores well without knowing the answers.',
        related: [['0'], ['1'], ['2']],
      }),
    ]);
    expect(codesOf(entries.slice(0, 4))).not.toContain('set_key_longest_bias');
    expect(
      codesOf([long(0, true), long(1, true), long(2, false), long(3, false), long(4, false)]),
    ).not.toContain('set_key_longest_bias');
  });
});

describe('set_stem_duplicate', () => {
  it('reports a stem the set already has, or nearly has, at the later one', () => {
    const entries = [
      question(0, 0, { shuffle: true }),
      question(1, 1, { shuffle: true }),
      {
        ...question(2, 2, { shuffle: true }),
        question: 'Which animal does the writer see first on the evening walk?',
      },
    ];
    const found = critiqueDrafts(entries).filter((one) => one.code === 'set_stem_duplicate');
    expect(found).toEqual([
      {
        path: ['2', 'question'],
        code: 'set_stem_duplicate',
        severity: 'warning',
        message:
          'This reads like another item of the set (similarity 0.64). One piece of knowledge may answer both.',
        related: [['0', 'question']],
      },
    ]);
    const same = [
      question(0, 0, { shuffle: true }),
      { ...question(1, 1, { shuffle: true }), question: STEMS[0] },
    ];
    expect(critiqueDrafts(same).find((one) => one.code === 'set_stem_duplicate')?.message).toBe(
      'This reads the same as another item of the set. One piece of knowledge answers both.',
    );
  });

  it('leaves short stems alone: "Choose the correct answer." repeats by design', () => {
    const entries = [0, 1, 2].map((n) => ({
      ...question(n, n, { shuffle: true }),
      question: 'Choose the correct answer.',
    }));
    expect(codesOf(entries)).not.toContain('set_stem_duplicate');
  });
});

describe('set_item_answers_item', () => {
  it("reports question 4's answer printed in question 12's passage (case 15)", () => {
    const entries = Array.from({ length: 12 }, (_, n) => question(n, n % 4, { shuffle: true }));
    entries[3] = {
      ...question(3, 0, { shuffle: true }),
      options: [
        { id: 'k', text: 'lighthouse', isCorrect: true },
        { id: 'l', text: 'bridge', isCorrect: false },
        { id: 'm', text: 'castle', isCorrect: false },
      ],
    };
    entries[11] = {
      schemaVersion: '1.0',
      type: 'fill-in-the-blanks',
      id: 'fib-12',
      title: 'Complete the text',
      passage: 'From the beach we could see the old lighthouse, and {{1}} boats sailed past it.',
      blanks: [{ id: '1', acceptedAnswers: ['many'] }],
      scoringStrategy: 'all-or-nothing',
    };
    const found = critiqueDrafts(entries).filter((one) => one.code === 'set_item_answers_item');
    expect(found).toEqual([
      {
        path: ['3', 'options', '0', 'text'],
        code: 'set_item_answers_item',
        severity: 'warning',
        message:
          'The answer "lighthouse" is printed elsewhere in the set: a learner can find it there.',
        related: [['11']],
      },
    ]);
  });

  it("skips short and common answers, an answer its own stem prints, and its own group's material", () => {
    const common = {
      ...question(0, 0, { shuffle: true }),
      options: [
        { id: 'a', text: 'were', isCorrect: true },
        { id: 'b', text: 'is', isCorrect: false },
      ],
    };
    const short = {
      ...question(1, 0, { shuffle: true }),
      options: [
        { id: 'a', text: 'ox', isCorrect: true },
        { id: 'b', text: 'ax', isCorrect: false },
      ],
    };
    const printedHere = {
      ...question(2, 0, { shuffle: true }),
      question: 'Which building near the lighthouse is the oldest one in the town?',
      options: [
        { id: 'a', text: 'lighthouse', isCorrect: true },
        { id: 'b', text: 'church', isCorrect: false },
      ],
    };
    const elsewhere = {
      ...question(3, 1, { shuffle: true }),
      question: 'Were there any ox carts on the road to the lighthouse that day?',
    };
    expect(codesOf([common, short, printedHere, elsewhere])).not.toContain('set_item_answers_item');
    const group = {
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'reading',
      stimulus: {
        id: 's',
        kind: 'text',
        body: 'They climbed the lighthouse at dawn and watched the boats.',
      },
      items: [
        {
          ...question(4, 0, { shuffle: true }),
          options: [
            { id: 'a', text: 'lighthouse', isCorrect: true },
            { id: 'b', text: 'tower', isCorrect: false },
          ],
        },
      ],
    };
    expect(codesOf([group])).not.toContain('set_item_answers_item');
    // The group's answer is among this question's options; this question's answer is in the group's passage.
    const other = {
      ...question(5, 0, { shuffle: true }),
      options: [
        { id: 'a', text: 'boats', isCorrect: true },
        { id: 'b', text: 'lighthouse', isCorrect: false },
      ],
    };
    expect(
      critiqueDrafts([group, other])
        .filter((one) => one.code === 'set_item_answers_item')
        .map((one) => one.related),
    ).toEqual([[['1']], [['0', 'stimulus']]]);
  });
});

describe('set_key_repeated', () => {
  it('advises when one answer answers three items or more', () => {
    const blank = (n: number, answer: string): Fields => ({
      schemaVersion: '1.0',
      type: 'fill-in-the-blanks',
      id: `f${n}`,
      title: `Gap ${n}`,
      passage: `Sentence number ${n} of the grammar section has a gap: {{1}}.`,
      blanks: [{ id: '1', acceptedAnswers: [answer] }],
      scoringStrategy: 'all-or-nothing',
    });
    const found = critiqueDrafts([
      blank(1, 'were'),
      blank(2, 'Were'),
      blank(3, 'had'),
      blank(4, 'were'),
    ]).filter((one) => one.code === 'set_key_repeated');
    expect(found).toEqual([
      {
        path: ['0', 'blanks', '0', 'acceptedAnswers'],
        code: 'set_key_repeated',
        severity: 'advice',
        message: '"were" is the answer to 3 items. The set tests less than its length suggests.',
        related: [
          ['1', 'blanks', '0', 'acceptedAnswers'],
          ['3', 'blanks', '0', 'acceptedAnswers'],
        ],
      },
    ]);
  });
});

describe('fib_tolerance_spans_words', () => {
  const blankWith = (answers: string[], match: Fields | undefined) => ({
    schemaVersion: '1.0',
    type: 'fill-in-the-blanks',
    id: 'fib',
    title: 'Tenses',
    passage: 'She {{1}} me the truth before I asked.',
    blanks: [{ id: '1', acceptedAnswers: answers, ...(match !== undefined ? { match } : {}) }],
    scoringStrategy: 'all-or-nothing',
  });

  it('advises when a forgiven edit runs over an answer of several words', () => {
    expect(
      critiqueDraft('fill-in-the-blanks', blankWith(['had told'], { levenshtein: 1 })),
    ).toEqual([
      {
        path: ['blanks', '0', 'acceptedAnswers', '0'],
        code: 'fib_tolerance_spans_words',
        severity: 'advice',
        message:
          'Blank 1 forgives one edit over an answer of several words, so "had told" with one word in another form is marked right. Make it a one-word blank, or take the tolerance off.',
      },
    ]);
    expect(
      critiqueDraft('fill-in-the-blanks', blankWith(['told', 'had told'], { levenshtein: 2 }))[0]
        ?.message,
    ).toMatch(/forgives 2 edits/);
  });

  it('says nothing of one-word answers, or of a blank that forgives nothing', () => {
    expect(critiqueDraft('fill-in-the-blanks', blankWith(['told'], { levenshtein: 1 }))).toEqual(
      [],
    );
    expect(critiqueDraft('fill-in-the-blanks', blankWith(['had told'], undefined))).toEqual([]);
    expect(
      critiqueDraft('fill-in-the-blanks', blankWith(['had told'], { levenshtein: 0 })),
    ).toEqual([]);
  });
});
