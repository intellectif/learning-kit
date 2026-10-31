import { describe, expect, it } from 'vitest';
import {
  type AiVariants,
  aiVariantsRepairRequest,
  aiVariantsRequest,
  checkAiVariants,
} from '../index.js';
import {
  inPassageOrder,
  keyOf,
  lengthBand,
  structureMisses,
  textSimilarity,
  textsOf,
} from '../variant-rules.js';
import {
  counter,
  dictation,
  fillIn,
  gapSelect,
  listening,
  readAloud,
  writing,
} from './variants-fixtures.js';

type Fields = Record<string, unknown>;

const messages = (exemplar: Fields, candidate: Fields) =>
  structureMisses(exemplar, candidate).map((one) => `${one.path.join('.')}: ${one.message}`);

describe('structureMisses', () => {
  it('finds a parallel item parallel', () => {
    for (const make of [listening, dictation, gapSelect, fillIn, writing, readAloud]) {
      expect(structureMisses(make(), make())).toEqual([]);
    }
    expect(structureMisses(null, writing())).toEqual([]);
  });

  it.each([
    [
      'a multiple choice of another mode',
      () => {
        const a = (listening().items as Fields[])[0] as Fields;
        return [a, { ...a, mode: 'multi', scoringStrategy: 'partial', shuffle: true }];
      },
      [
        "mode: The mode differs from the exemplar's.",
        "scoringStrategy: The scoring strategy differs from the exemplar's.",
        'shuffle: Shuffling differs from the exemplar.',
      ],
    ],
    [
      'options with other media',
      () => {
        const a = (listening().items as Fields[])[0] as Fields;
        const b = structuredClone(a);
        ((b.options as Fields[])[0] as Fields).media = { type: 'image', url: 'x', alt: 'y' };
        return [a, b];
      },
      ["options: The options with media differ from the exemplar's."],
    ],
    [
      'a one-word blank given two words, and too many answers',
      () => {
        const b = fillIn();
        (b.blanks as Fields[])[0] = {
          id: 'a',
          acceptedAnswers: ['had been', 'was', 'were', 'is', 'are', 'be'],
          caseSensitive: false,
        };
        return [fillIn(), b];
      },
      [
        'blanks.0.acceptedAnswers: Blank 1 takes one word in the exemplar; every answer here must be one word.',
        'blanks.0.acceptedAnswers: Blank 1 accepts 6 answers; the exemplar accepts 2, and two more or fewer is the most.',
      ],
    ],
    [
      'a blank fewer',
      () => {
        const b = fillIn();
        b.passage = 'If I {{a}} rich, I would travel around the world.';
        (b.blanks as Fields[]).pop();
        return [fillIn(), b];
      },
      ['blanks: 1 blank; the exemplar has 2.'],
    ],
    [
      'gaps drawn otherwise, a bank more, shuffled choices',
      () => {
        const b = gapSelect();
        (b.gaps as Fields[])[2] = {
          id: 'g3',
          choices: [
            { id: 'z1', text: 'a' },
            { id: 'z2', text: 'b' },
          ],
          correctChoiceId: 'z1',
        };
        (b.banks as Fields[]).push({ id: 'bank-2', choices: [{ id: 'q', text: 'q' }] });
        b.shuffleChoices = true;
        return [gapSelect(), b];
      },
      [
        'banks: 2 banks; the exemplar has 1.',
        "gaps.2: Gap 3 draws on its choices differently from the exemplar's.",
        'shuffleChoices: Shuffling the choices differs from the exemplar.',
      ],
    ],
    [
      'a gap of its own with another number of choices, and a gap fewer',
      () => {
        const own = (n: number): Fields => ({
          ...gapSelect(),
          banks: undefined,
          passage: n === 2 ? 'One {{g1}} two {{g2}}.' : 'One {{g1}}.',
          gaps: [
            {
              id: 'g1',
              choices: [
                { id: 'a', text: 'a' },
                { id: 'b', text: 'b' },
                ...(n === 2 ? [{ id: 'c', text: 'c' }] : []),
              ],
              correctChoiceId: 'a',
            },
            ...(n === 2
              ? [
                  {
                    id: 'g2',
                    choices: [
                      { id: 'd', text: 'd' },
                      { id: 'e', text: 'e' },
                    ],
                    correctChoiceId: 'd',
                  },
                ]
              : []),
          ],
        });
        return [own(2), own(1)];
      },
      [
        'gaps: 1 gap; the exemplar has 2.',
        "gaps.0.choices: Gap 1 offers 2 choices; the exemplar's offers 3.",
      ],
    ],
    [
      'a dictation with no slow recording, and other tolerance',
      () => {
        const b = dictation();
        delete b.slowMedia;
        b.tolerance = {};
        return [dictation(), b];
      },
      [
        "tolerance: The tolerance differs from the exemplar's.",
        'slowMedia: The exemplar has a slow recording; this has none.',
      ],
    ],
    [
      'a read-aloud with a slow recording and other bounds',
      () => {
        const b = {
          ...readAloud(),
          slowMedia: { type: 'audio', url: 'x' },
          recording: { maxSeconds: 30 },
        };
        return [readAloud(), b];
      },
      [
        "recording: The recording bounds differ from the exemplar's.",
        'slowMedia: This has a slow recording; the exemplar has none.',
      ],
    ],
    [
      'a written response with another rubric and media',
      () => {
        const b = {
          ...writing(),
          rubric: { criteria: [{ name: 'All', weight: 1 }] },
          maxWords: 120,
          media: { type: 'image', url: 'x', alt: 'y' },
        };
        return [writing(), b];
      },
      [
        "rubric: The rubric differs from the exemplar's.",
        "maxWords: The maximum word count differs from the exemplar's.",
        'media: The exemplar has no media; this has image.',
      ],
    ],
    [
      'a part with other material, no script, shuffled items',
      () => {
        const b = listening();
        b.stimulus = { id: 's', kind: 'text', body: 'A passage.' };
        b.shuffle = 'within-group';
        return [listening(), b];
      },
      [
        "stimulus.kind: The material is text; the exemplar's is audio.",
        "stimulus.script: The exemplar's recording has a script; this has none.",
        'shuffle: Shuffling differs from the exemplar.',
      ],
    ],
    [
      'another type',
      () => [writing(), dictation()],
      ['type: This is dictation; the exemplar is written-response.'],
    ],
  ])('reports %s', (_, make, expected) => {
    const [exemplar, candidate] = make() as [Fields, Fields];
    expect(messages(exemplar, candidate)).toEqual(expected);
  });

  it('reads a script kept on the stimulus media', () => {
    const onMedia = (speakers: string[]): Fields => {
      const group = listening();
      const stimulus = group.stimulus as Fields;
      const script = stimulus.script as Fields[];
      delete stimulus.script;
      stimulus.media = {
        ...(stimulus.media as Fields),
        script: script.map((turn, n) => ({ ...turn, speaker: speakers[n % speakers.length] })),
      };
      return group;
    };
    expect(messages(onMedia(['A', 'B']), onMedia(['A']))).toEqual([
      'stimulus.script: 1 speaker; the exemplar has 2.',
    ]);
  });
});

describe('the comparisons underneath', () => {
  it('compares short texts whole, and an empty one with nothing', () => {
    expect(textSimilarity('Where is the cat?', 'where is the CAT')).toBe(1);
    expect(textSimilarity('Where is the cat?', 'Where is the dog?')).toBe(0);
    expect(textSimilarity('', 'anything at all here today')).toBe(0);
  });

  it('keeps case in a key only for a blank that matches case', () => {
    expect(keyOf('Were!')).toBe('were');
    expect(keyOf('Were!', true)).toBe('Were');
  });

  it('falls back to the default band for a ratio that is not one', () => {
    expect(lengthBand(100, 'material', { material: -1 })).toEqual([90, 110]);
    expect(lengthBand(100, 'item', { item: 0 })).toEqual([98, 102]);
    expect(lengthBand(2, 'material')).toEqual([0, 7]);
  });

  it('reads blanks in passage order, or in list order when the passage does not name each once', () => {
    const named = { passage: 'B {{b}} then A {{a}}.', blanks: [{ id: 'a' }, { id: 'b' }] };
    expect(inPassageOrder(named, 'blanks').map((one) => one.at)).toEqual([1, 0]);
    const unnamed = { passage: 'Only {{a}}.', blanks: [{ id: 'a' }, { id: 'b' }] };
    expect(inPassageOrder(unnamed, 'blanks').map((one) => one.at)).toEqual([0, 1]);
  });

  it('reads what a recording says from its transcript when it has no script', () => {
    const item = {
      ...writing(),
      media: { type: 'audio', url: 'x', transcript: 'What the speaker says.' },
    };
    expect(textsOf(item).map((one) => [one.path.join('.'), one.kind])).toEqual([
      ['prompt', 'stem'],
      ['media.transcript', 'material'],
    ]);
  });
});

describe('a reading part with everything an exemplar can carry', () => {
  const part = (): Fields => ({
    schemaVersion: '1.0',
    type: 'item-group',
    id: 'reading',
    title: 'A trip to the mountains',
    stimulus: {
      id: 's',
      kind: 'text',
      title: 'Our trip',
      body: 'Last summer we drove to the mountains with our two dogs. We stayed in a small wooden cabin near a lake, and every morning we walked up the hill to watch the sun rise over the valley.',
      attribution: 'A magazine',
      locale: 'en-US',
    },
    items: [
      {
        schemaVersion: '1.0',
        type: 'multiple-choice',
        id: 'r1',
        title: 'Question 1',
        instructions: 'Choose one answer.',
        question: 'Where did the family stay during their summer holiday?',
        mode: 'single',
        options: [
          { id: 'a', text: 'In a wooden cabin.', isCorrect: true, feedback: 'Yes: near a lake.' },
          {
            id: 'b',
            text: 'In a big hotel.',
            isCorrect: false,
            feedback: 'No hotel is mentioned.',
          },
          { id: 'c', text: 'In a tent.', isCorrect: false },
        ],
        scoringStrategy: 'all-or-nothing',
        feedback: { correct: 'Well read.', incorrect: 'Read the second sentence again.' },
        difficultyLevel: 1,
      },
      {
        schemaVersion: '1.0',
        type: 'gap-select',
        id: 'r2',
        title: 'Question 2',
        passage: 'Every morning they {{x}} up the hill.',
        gaps: [
          {
            id: 'x',
            choices: [
              { id: 'p', text: 'walked' },
              { id: 'q', text: 'swam' },
            ],
            correctChoiceId: 'p',
            feedback: 'The text says they walked.',
          },
        ],
        scoringStrategy: 'all-or-nothing',
      },
      {
        schemaVersion: '1.0',
        type: 'fill-in-the-blanks',
        id: 'r3',
        title: 'Question 3',
        passage: 'They watched the sun {{y}} over the valley.',
        blanks: [
          { id: 'y', acceptedAnswers: ['rise'], hint: 'Starts with r.', feedback: 'It rose.' },
        ],
        scoringStrategy: 'all-or-nothing',
      },
    ],
  });
  const reply = (): Fields => ({
    exemplar: 0,
    type: 'item-group',
    title: 'A weekend by the sea',
    stimulus: {
      title: 'Our weekend',
      body: 'Last spring we took the train to the coast with our grandmother. We rented a little white house by the harbour, and each evening we sat on the beach to watch the fishing boats come back home.',
    },
    items: [
      {
        type: 'multiple-choice',
        title: 'Question 1',
        question: 'Where did the family sleep during their spring weekend?',
        options: [
          { text: 'In a white house.', isCorrect: true, feedback: 'Yes: by the harbour.' },
          { text: 'On a boat.', isCorrect: false, feedback: 'They only watched boats.' },
          { text: 'At a campsite.', isCorrect: false, feedback: 'Not mentioned.' },
        ],
        feedback: { correct: 'Good reading.', incorrect: 'Look at the second sentence.' },
      },
      {
        type: 'gap-select',
        title: 'Question 2',
        passage: 'Each evening they {{1}} on the beach.',
        gaps: [
          {
            choices: [
              { text: 'sat', isCorrect: true },
              { text: 'flew', isCorrect: false },
            ],
            feedback: 'They sat.',
          },
        ],
      },
      {
        type: 'fill-in-the-blanks',
        title: 'Question 3',
        passage: 'They watched the boats {{1}} back home.',
        blanks: [{ acceptedAnswers: ['come'], hint: 'Starts with c.', feedback: 'They came.' }],
      },
      { type: 'nonsense', title: 'An extra item' },
    ],
  });

  function checked(input: Partial<Parameters<typeof aiVariantsRequest>[0]> = {}): AiVariants {
    const result = checkAiVariants(
      { variants: [reply()] },
      aiVariantsRequest({ exemplars: [part()], level: 'B1', ...input }),
      {
        newId: counter(),
      },
    );
    if (!result.ok) {
      throw new Error(result.refusal);
    }
    return result.variants;
  }

  it('shows the model its material, feedback, hints and own choices', () => {
    const request = aiVariantsRequest({ exemplars: [part()], level: 'B1' });
    const content = request.facts.exemplars[0]?.content as Fields;
    expect(content.stimulus).toEqual({
      kind: 'text',
      title: 'Our trip',
      body: (part().stimulus as Fields).body,
    });
    expect((content.items as Fields[])[1]).toMatchObject({
      gaps: [
        {
          choices: [
            { text: 'walked', isCorrect: true },
            { text: 'swam', isCorrect: false },
          ],
          feedback: 'The text says they walked.',
        },
      ],
    });
    expect((content.items as Fields[])[2]).toMatchObject({
      blanks: [{ acceptedAnswers: ['rise'], hint: 'Starts with r.', feedback: 'It rose.' }],
    });
    expect(request.facts.exemplars[0]?.targets.levers).toBeUndefined();
  });

  it('writes feedback, hints and a stimulus title where the exemplar has them, and drops the attribution', () => {
    const variant = checked().variants[0];
    const entry = variant?.entry as Fields;
    expect(entry.title).toBe('A trip to the mountains'.length > 0 ? 'A weekend by the sea' : '');
    expect(entry.stimulus).toEqual({
      id: expect.any(String),
      kind: 'text',
      title: 'Our weekend',
      body: (reply().stimulus as Fields).body,
      locale: 'en-US',
    });
    const [choice, gaps, blanks] = entry.items as Fields[];
    expect(choice?.instructions).toBe('Choose one answer.');
    expect(choice?.feedback).toEqual({
      correct: 'Good reading.',
      incorrect: 'Look at the second sentence.',
    });
    expect(((choice?.options ?? []) as Fields[]).map((one) => one.feedback)).toEqual([
      'Yes: by the harbour.',
      'They only watched boats.',
      'Not mentioned.',
    ]);
    expect((((gaps?.gaps ?? []) as Fields[])[0] as Fields).feedback).toBe('They sat.');
    expect(((blanks?.blanks ?? []) as Fields[])[0]).toMatchObject({
      hint: 'Starts with c.',
      feedback: 'They came.',
    });
    // The extra item is reported, not dropped.
    expect(variant?.mismatches.map((one) => one.message)).toContain('4 items; the exemplar has 3.');
  });

  it("moves the author's difficulty one step with the variant, inside 1 to 5", () => {
    const easier = checked({ difficulty: 'easier' }).variants[0]?.entry as Fields;
    expect(((easier.items as Fields[])[0] as Fields).difficultyLevel).toBe(1);
    const harder = checked({ difficulty: 'harder' }).variants[0]?.entry as Fields;
    expect(((harder.items as Fields[])[0] as Fields).difficultyLevel).toBe(2);
  });

  it('sends a repair the problems of an item inside the part, at its own paths', () => {
    const result = checkAiVariants(
      {
        variants: [
          {
            ...reply(),
            items: [
              (reply().items as Fields[])[0],
              {
                type: 'gap-select',
                title: 'Question 2',
                passage: 'Each evening they {{1}} on the beach.',
                gaps: [
                  {
                    choices: [
                      { text: 'sat', isCorrect: false },
                      { text: 'flew', isCorrect: false },
                    ],
                  },
                ],
              },
              (reply().items as Fields[])[2],
            ],
          },
        ],
      },
      aiVariantsRequest({ exemplars: [part()], level: 'B1' }),
      { newId: counter() },
    );
    if (!result.ok) {
      throw new Error(result.refusal);
    }
    const repair = aiVariantsRepairRequest(
      aiVariantsRequest({ exemplars: [part()], level: 'B1' }),
      result.variants,
    );
    expect(repair?.repair?.[0]?.problems.map((one) => one.path.join('.'))).toContain(
      'items.1.gaps.0.choices',
    );
  });
});
