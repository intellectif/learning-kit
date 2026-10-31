/**
 * `vectors/variants.json`: a request, a canned model reply and what lk-core
 * made of it, for each case a host asked to see covered — and two papers for
 * the paper codes. Built here from the fixtures; the committed file must equal
 * what lk-core makes of them today. Rewrite it with
 * `WRITE_VARIANT_VECTORS=1 pnpm vitest run variant-vectors`, then
 * `pnpm biome format --write vectors/variants.json`, and review the diff.
 *
 * Plain ESM, like `scoring-vectors.test.mjs`, because it reads and writes a
 * file on disk.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { outcomeOf, replayVariants } from '../../vectors/variants.mjs';
import * as core from '../index.ts';
import {
  fillIn,
  gapSelect,
  goodVariants,
  listening,
  section,
  writing,
} from './variants-fixtures.ts';

const FILE = new URL('../../vectors/variants.json', import.meta.url);

function replyWith(exemplar, change) {
  return {
    variants: goodVariants().map((variant) => {
      if (variant.exemplar !== exemplar) {
        return variant;
      }
      const copy = structuredClone(variant);
      change(copy);
      return copy;
    }),
  };
}

const chooseTwo = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'two-of-five',
  title: 'Choose TWO',
  question: 'Which two things does Tom promise to bring to the picnic on Saturday?',
  mode: 'multi',
  options: [
    { id: 'a', text: 'Sandwiches', isCorrect: true },
    { id: 'b', text: 'A ball', isCorrect: false },
    { id: 'c', text: 'Drinks', isCorrect: true },
    { id: 'd', text: 'A blanket', isCorrect: false },
    { id: 'e', text: 'Some music', isCorrect: false },
  ],
  scoringStrategy: 'all-or-nothing',
};

const unheard = listening();
delete unheard.stimulus.script;

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
  'What time does the museum open on public holidays?',
  'Where does the class eat lunch on the school trip?',
];
const question = (n, key, options) => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: `q${n}`,
  title: `Question ${n + 1}`,
  question: STEMS[n],
  mode: 'single',
  options:
    options ??
    [0, 1, 2, 3].map((at) => ({
      id: `q${n}-${at}`,
      text: `Choice ${'abcd'[at]}${n}`,
      isCorrect: at === key,
    })),
  scoringStrategy: 'all-or-nothing',
});
const lighthouse = Array.from({ length: 12 }, (_, n) => ({ ...question(n, n % 4), shuffle: true }));
lighthouse[3] = {
  ...question(3, 0, [
    { id: 'k', text: 'lighthouse', isCorrect: true },
    { id: 'l', text: 'bridge', isCorrect: false },
    { id: 'm', text: 'castle', isCorrect: false },
  ]),
  shuffle: true,
};
lighthouse[11] = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'fib-12',
  title: 'Complete the text',
  passage: 'From the beach we could see the old lighthouse, and {{1}} boats sailed past it.',
  blanks: [{ id: '1', acceptedAnswers: ['many'] }],
  scoringStrategy: 'all-or-nothing',
};

const five = Array.from({ length: 5 }, (_, n) => question(n, 1));
const fiveReply = {
  variants: Array.from({ length: 5 }, (_, n) => ({
    exemplar: n,
    type: 'multiple-choice',
    title: `Item ${n + 1}`,
    question: STEMS[n + 5],
    options: [
      { text: `One ${n}`, isCorrect: false },
      { text: `Two ${n}`, isCorrect: true },
      { text: `Three ${n}`, isCorrect: false },
      { text: `Four ${n}`, isCorrect: false },
    ],
  })),
};

const picture = {
  ...writing(),
  prompt:
    'Look at the picture. Write about where the cat is sleeping and what the room looks like.',
  media: {
    type: 'image',
    url: 'https://cdn.example.com/cat.png',
    alt: 'A cat asleep on a red sofa.',
  },
};

const level = 'CEFR A2';
const CASES = [
  {
    name: '01 a correct reply',
    call: 'variants',
    input: { exemplars: section(), level },
    reply: { variants: goodVariants() },
  },
  {
    name: '02 four options for an exemplar of three',
    call: 'variants',
    input: { exemplars: section(), level },
    reply: replyWith(0, (v) =>
      v.items[0].options.push({ text: 'He forgot the date.', isCorrect: false }),
    ),
  },
  {
    name: '03 one right option for a choose-two',
    call: 'variants',
    input: { exemplars: [chooseTwo], level },
    reply: {
      variants: [
        {
          exemplar: 0,
          type: 'multiple-choice',
          title: 'Choose TWO',
          question: 'Which two things will Maria take with her to the beach on Sunday?',
          options: ['Towels', 'A kite', 'Fruit', 'A tent', 'A radio'].map((text, at) => ({
            text,
            isCorrect: at === 0,
          })),
        },
      ],
    },
  },
  {
    name: '04 a script with one speaker for an exemplar with two',
    call: 'variants',
    input: { exemplars: section(), level },
    reply: replyWith(0, (v) => {
      for (const turn of v.stimulus.script) {
        turn.speaker = 'Maria';
      }
    }),
  },
  {
    name: '05 a bank with one choice fewer',
    call: 'variants',
    input: { exemplars: section(), level },
    reply: replyWith(2, (v) => v.banks[0].choices.pop()),
  },
  {
    name: "06 a rubric written by the model: the exemplar's is put back",
    call: 'variants',
    input: { exemplars: section(), level },
    reply: replyWith(4, (v) => {
      v.rubric = { criteria: [{ name: 'Anything', weight: 9 }] };
    }),
  },
  {
    name: '07 a passage at 60 % of its words',
    call: 'variants',
    input: { exemplars: section(), level },
    reply: replyWith(3, (v) => {
      v.passage = 'If he {{1}} time, he would play. They worked {{2}} May.';
    }),
  },
  {
    name: "08 a stem that is the exemplar's with two words changed",
    call: 'variants',
    input: { exemplars: section(), level },
    reply: replyWith(0, (v) => {
      v.items[1].question = 'Where will Anna and Tom meet on Sunday morning?';
    }),
  },
  {
    name: "09 a key that is the exemplar's",
    call: 'variants',
    input: { exemplars: section(), level },
    reply: replyWith(0, (v) => {
      v.items[1].options[1].text = 'Outside the station.';
    }),
  },
  {
    name: '10 a near copy of another form rather than the exemplar',
    call: 'variants',
    input: {
      exemplars: [writing()],
      level,
      avoid: [
        {
          ...writing(),
          prompt:
            'Write a message to your cousin Alex about a weekend trip you took. Say where you stayed and what you saw.',
        },
      ],
    },
    reply: { variants: [{ ...goodVariants()[4], exemplar: 0 }] },
  },
  {
    name: '11 a reply with one variant missing',
    call: 'variants',
    input: { exemplars: section(), level },
    reply: { variants: goodVariants().filter((v) => v.exemplar !== 2) },
  },
  {
    name: '12 an exemplar recording with no transcript or script',
    call: 'variants',
    input: { exemplars: [unheard, writing()], level },
    reply: { variants: [{ ...goodVariants()[4], exemplar: 1 }] },
  },
  {
    name: '13 a picture to describe',
    call: 'variants',
    input: { exemplars: [picture], level: 'CEFR A1' },
    reply: {
      variants: [
        {
          exemplar: 0,
          type: 'written-response',
          title: 'A dog in the garden',
          prompt:
            'Look at the picture. Write about where the dog is playing and what the garden looks like.',
          media: { alt: 'A brown dog running across a green garden with a ball.' },
        },
      ],
    },
  },
  {
    name: '14 keys spread from a fixed seed',
    call: 'variants',
    input: { exemplars: five, level, balanceKeyPositions: { seed: 'exam-7:v2' } },
    reply: fiveReply,
  },
  {
    name: '15a seven of ten keys in B',
    call: 'critiqueDrafts',
    entries: [1, 1, 0, 1, 1, 2, 1, 3, 1, 1].map((key, n) => question(n, key)),
  },
  {
    name: "15b question 4's key in question 12's passage",
    call: 'critiqueDrafts',
    entries: lighthouse,
  },
  {
    name: '16 a grammar item whose natural variant repeats the key',
    call: 'variants',
    input: { exemplars: [fillIn(), gapSelect()], level },
    reply: {
      variants: [
        { ...goodVariants()[3], exemplar: 0 },
        { ...goodVariants()[2], exemplar: 1 },
      ],
    },
  },
];

describe('vectors/variants.json', () => {
  const built = {
    corpusVersion: '1.8.0',
    cases: JSON.parse(JSON.stringify(CASES)).map((one) => ({
      ...one,
      expected: outcomeOf(core, one),
    })),
  };

  it('holds what lk-core makes of every case', () => {
    if (process.env.WRITE_VARIANT_VECTORS === '1') {
      writeFileSync(FILE, `${JSON.stringify(built, null, 2)}\n`);
    }
    expect(JSON.parse(readFileSync(FILE, 'utf8'))).toEqual(built);
  });

  it('replays against the source', () => {
    const corpus = JSON.parse(readFileSync(FILE, 'utf8'));
    expect(corpus.cases).toHaveLength(CASES.length);
    expect(replayVariants(core, corpus).filter((result) => !result.ok)).toEqual([]);
  });
});
