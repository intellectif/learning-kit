import { describe, expect, it } from 'vitest';
import {
  AI_VARIANTS_MAX_EXEMPLARS,
  AI_VARIANTS_MAX_MATERIAL_LENGTH,
  AI_VARIANTS_MAX_REPAIRS,
  type AiGeneratedVariant,
  type AiVariants,
  type AiVariantsRequest,
  aiVariantsRepairRequest,
  aiVariantsRequest,
  checkAiVariants,
  generateVariants,
  listMediaRefs,
} from '../index.js';
import { registerActivityType } from '../registry/index.js';
import {
  counter,
  dictation,
  fillIn,
  gapSelect,
  goodVariants,
  listening,
  readAloud,
  section,
  writing,
} from './variants-fixtures.js';

type Fields = Record<string, unknown>;

const ask = (input: Partial<Parameters<typeof aiVariantsRequest>[0]> = {}): AiVariantsRequest =>
  aiVariantsRequest({ exemplars: section(), level: 'CEFR A2', ...input });

function check(
  variants: readonly unknown[],
  request: AiVariantsRequest = ask(),
  newId: () => string = counter(),
): AiVariants {
  const checked = checkAiVariants({ variants }, request, { newId });
  if (!checked.ok) {
    throw new Error(`refused: ${checked.refusal}`);
  }
  return checked.variants;
}

/** The good reply, with one variant changed. */
function replyWith(exemplar: number, change: (variant: Fields) => void): Fields[] {
  return goodVariants().map((variant) => {
    if (variant.exemplar !== exemplar) {
      return variant;
    }
    const copy = structuredClone(variant);
    change(copy);
    return copy;
  });
}

const variantOf = (result: AiVariants, exemplar: number): AiGeneratedVariant => {
  const found = result.variants.find((one) => one.exemplarIndex === exemplar);
  if (found === undefined) {
    throw new Error(`no variant of ${exemplar}`);
  }
  return found;
};
const codes = (variant: AiGeneratedVariant) => [
  ...variant.mismatches.map((one) => one.code),
  ...variant.findings.map((one) => one.code),
];
const at = (value: unknown, ...path: (string | number)[]): unknown =>
  path.reduce<unknown>((holder, key) => (holder as Record<string | number, unknown>)?.[key], value);

describe('aiVariantsRequest', () => {
  it('gives one exemplar per entry, in paper order, with its content and targets', () => {
    const request = ask();
    expect(request.feature).toBe('variant-generation');
    expect(request.skipped).toEqual([]);
    expect(request.facts.exemplars.map((one) => [one.exemplar, one.type])).toEqual([
      [0, 'item-group'],
      [1, 'dictation'],
      [2, 'gap-select'],
      [3, 'fill-in-the-blanks'],
      [4, 'written-response'],
      [5, 'read-aloud'],
    ]);
    const [part, dictated, gaps, blanks, writtenTask] = request.facts.exemplars;
    expect(part?.targets.structure).toEqual({
      stimulus: 'audio',
      items: [
        { type: 'multiple-choice', mode: 'single', options: 3, correct: 1 },
        { type: 'multiple-choice', mode: 'single', options: 3, correct: 1 },
      ],
      speakers: 2,
      turns: [5, 7],
    });
    expect(Object.keys(part?.targets.lengths ?? {})).toEqual([
      'stimulus.script',
      'items.0.question',
      'items.1.question',
    ]);
    expect(at(part?.content, 'stimulus', 'script', 0)).toEqual({
      speaker: 'Anna',
      text: 'Hi Tom, are you coming to the cinema on Friday evening?',
    });
    expect(dictated?.content).toEqual({
      type: 'dictation',
      title: 'Listen and write',
      transcript: 'My brother usually walks to school with his two best friends.',
    });
    expect(gaps?.content).toMatchObject({
      passage:
        'Last weekend I {{1}} to the beach with my cousins. We {{2}} a big picnic and {{3}} in the sea.',
      gaps: [{ answer: 'went' }, { answer: 'had' }, { answer: 'swam' }],
      banks: [{ choices: ['went', 'had', 'swam', 'go', 'have'] }],
    });
    expect(gaps?.targets.structure).toEqual({
      gaps: [{ bank: 0 }, { bank: 0 }, { bank: 0 }],
      banks: [{ choices: 5 }],
    });
    expect(blanks?.content).toMatchObject({
      passage: 'If I {{1}} rich, I would travel around the world. She has lived here {{2}} 2010.',
      blanks: [{ acceptedAnswers: ['were', 'was'] }, { acceptedAnswers: ['since'] }],
    });
    expect(blanks?.targets.structure).toEqual({
      blanks: [
        { oneWord: true, acceptedAnswers: [1, 4] },
        { oneWord: true, acceptedAnswers: [1, 3] },
      ],
    });
    expect(writtenTask?.targets.structure).toEqual({
      minWords: 60,
      maxWords: 90,
      criteria: ['Content', 'Organisation', 'Language'],
    });
    expect(part?.targets.difficulty).toBe('same');
    expect(part?.targets.levers).toBeUndefined();
  });

  it('puts no recording address, setting or id in the facts', () => {
    const facts = JSON.stringify(ask().facts);
    expect(facts).not.toContain('cdn.example.com');
    expect(facts).not.toContain('v1-');
    expect(facts).not.toContain('voiceId');
    expect(facts).not.toContain('scoringStrategy');
  });

  it('bands lengths: material within a tenth, item text within a quarter', () => {
    const lengths = ask().facts.exemplars[0]?.targets.lengths ?? {};
    // The script holds 73 words: 73 ± 7.3.
    expect(lengths['stimulus.script']).toEqual([66, 80]);
    // A 10-word question: 10 ± 2.5.
    expect(lengths['items.0.question']).toEqual([8, 12]);
    const wider = ask({ lengthTolerance: { material: 0.5 } }).facts.exemplars[0]?.targets.lengths;
    expect(wider?.['stimulus.script']).toEqual([37, 109]);
  });

  it('asks for exactly one variant per exemplar in its reply shape', () => {
    const shape = ask().shape as Fields;
    expect(at(shape, 'properties', 'variants', 'minItems')).toBe(6);
    expect(at(shape, 'properties', 'variants', 'maxItems')).toBe(6);
    expect(at(shape, 'properties', 'variants', 'items', 'required')).toEqual(['exemplar', 'type']);
  });

  it('carries the other forms as texts and keys', () => {
    const request = ask({ avoid: [gapSelect()] });
    expect(request.facts.avoid).toEqual([
      {
        texts: [
          'Last weekend I {{g1}} to the beach with my cousins. We {{g2}} a big picnic and {{g3}} in the sea.',
        ],
        keys: ['went', 'had', 'swam'],
      },
    ]);
  });

  it('moves the items difficultyFor names, one step, with the levers and the reason', () => {
    const request = ask({
      difficultyFor: {
        'v1-q2': { difficulty: 'harder', reason: 'p-value 0.96 on 31 attempts' },
        'v1-fib': { difficulty: 'easier' },
      },
    });
    const part = request.facts.exemplars[0]?.targets;
    expect(part?.difficulty).toBe('same');
    expect(part?.itemDifficulty?.map((one) => [one.item, one.difficulty])).toEqual([
      [0, 'same'],
      [1, 'harder'],
    ]);
    expect(part?.itemDifficulty?.[1]?.difficultyReason).toBe('p-value 0.96 on 31 attempts');
    expect(part?.itemDifficulty?.[1]?.levers?.[0]).toMatch(/wrong options closer/);
    const blanks = request.facts.exemplars[3]?.targets;
    expect(blanks?.difficulty).toBe('easier');
    expect(blanks?.levers).toEqual([
      'Give more context around each blank that points to the answer.',
    ]);
    expect(request.facts.rules.some((rule) => rule.includes('targets.levers'))).toBe(true);
  });

  it('gives a whole request one difficulty, and listening and reading parts their own levers', () => {
    const request = ask({ difficulty: 'harder' });
    expect(request.facts.exemplars.every((one) => one.targets.difficulty === 'harder')).toBe(true);
    expect(request.facts.exemplars[0]?.targets.levers?.[0]).toMatch(/natural pace/);
    const reading = aiVariantsRequest({
      exemplars: [
        {
          ...listening(),
          stimulus: {
            id: 's',
            kind: 'text',
            body: 'A short passage about a trip to the coast with friends.',
          },
        },
      ],
      level: 'B1',
      difficulty: 'easier',
    });
    expect(reading.facts.exemplars[0]?.targets.levers?.[0]).toMatch(/directly/);
  });

  it('says the level facts and the picture rule only when they apply', () => {
    expect(ask().facts.rules.some((rule) => rule.includes('levelFacts'))).toBe(false);
    const request = ask({ levelFacts: { grammar: ['past simple'], avoidTopics: ['politics'] } });
    expect(request.facts.levelFacts).toEqual({
      grammar: ['past simple'],
      avoidTopics: ['politics'],
    });
    expect(request.facts.rules.some((rule) => rule.includes('levelFacts'))).toBe(true);
    expect(request.facts.rules.some((rule) => rule.includes('picture'))).toBe(false);
  });

  it('takes the locale from the request, else from the first exemplar', () => {
    expect(ask().facts.locale).toBeUndefined();
    expect(ask({ locale: 'en-US' }).facts.locale).toBe('en-US');
    expect(aiVariantsRequest({ exemplars: [dictation()], level: 'A2' }).facts.locale).toBe('en-US');
  });

  it('refuses what cannot be a request', () => {
    expect(() => aiVariantsRequest({ exemplars: [], level: 'A2' })).toThrow(RangeError);
    expect(() =>
      aiVariantsRequest({
        exemplars: Array.from({ length: AI_VARIANTS_MAX_EXEMPLARS + 1 }, () => writing()),
        level: 'A2',
      }),
    ).toThrow(RangeError);
    expect(() => aiVariantsRequest({ exemplars: [{ type: 'nonsense' }], level: 'A2' })).toThrow(
      RangeError,
    );
    expect(() => aiVariantsRequest({ exemplars: [null], level: 'A2' })).toThrow(RangeError);
    expect(() => aiVariantsRequest({ exemplars: [writing()], level: ' ' })).toThrow(RangeError);
    expect(() =>
      aiVariantsRequest({ exemplars: [writing()], level: 'A2', difficulty: 'much' as 'same' }),
    ).toThrow(RangeError);
    expect(() =>
      aiVariantsRequest({ exemplars: [writing()], level: 'A2', images: 'draw' as 'reuse' }),
    ).toThrow(RangeError);
    expect(() =>
      aiVariantsRequest({
        exemplars: [writing()],
        level: 'A2',
        difficultyFor: { nobody: { difficulty: 'same' } },
      }),
    ).toThrow(/nobody/);
    expect(() =>
      aiVariantsRequest({
        exemplars: [writing()],
        level: 'A2',
        difficultyFor: { 'v1-wr': { difficulty: 'tough' as 'same' } },
      }),
    ).toThrow(RangeError);
  });

  it('leaves out an exemplar that cannot be varied, and says why', () => {
    const unheard = listening();
    const stimulus = unheard.stimulus as Fields;
    delete stimulus.script;
    const unheardItem = {
      ...writing(),
      id: 'listen-wr',
      media: { type: 'audio', url: 'https://cdn.example.com/a.mp3' },
    };
    const unheardOption = {
      ...listening(),
      items: [
        {
          ...((listening().items as Fields[])[0] as Fields),
          options: [
            {
              id: 'x',
              text: 'A',
              isCorrect: true,
              media: { type: 'audio', url: 'https://cdn.example.com/x.mp3' },
            },
            { id: 'y', text: 'B', isCorrect: false },
          ],
        },
      ],
    };
    const timed = { ...listening(), timeline: { cues: [] } };
    const unfinished = { ...writing(), prompt: '' };
    const long = {
      ...listening(),
      stimulus: {
        id: 's',
        kind: 'text',
        body: 'word '.repeat(AI_VARIANTS_MAX_MATERIAL_LENGTH / 4),
      },
    };
    const request = aiVariantsRequest({
      exemplars: [unheard, timed, unfinished, long, unheardItem, unheardOption, writing()],
      level: 'A2',
    });
    expect(request.skipped.map((one) => [one.exemplarIndex, one.code])).toEqual([
      [0, 'variant_exemplar_unheard'],
      [1, 'variant_exemplar_timeline'],
      [2, 'variant_exemplar_incomplete'],
      [3, 'variant_exemplar_too_long'],
      [4, 'variant_exemplar_unheard'],
      [5, 'variant_exemplar_unheard'],
    ]);
    expect(request.skipped[2]?.message).toMatch(/wr_prompt_required|prompt/);
    expect(request.facts.exemplars.map((one) => one.exemplar)).toEqual([6]);
  });

  it('leaves out a registered type it does not know the fields of', () => {
    registerActivityType({
      type: 'variant-probe',
      schema: {
        '~standard': { version: 1, vendor: 'probe', validate: (value: unknown) => ({ value }) },
      },
      scoring: { kind: 'sync', score: () => ({ score: 1, maxScore: 1, details: [] }) },
    } as never);
    const request = aiVariantsRequest({
      exemplars: [{ type: 'variant-probe', id: 'p' }],
      level: 'A2',
    });
    expect(request.skipped[0]?.code).toBe('variant_exemplar_unsupported');
  });

  it('with images reused, leaves out a picture with no description', () => {
    const picture = {
      ...writing(),
      media: { type: 'image', url: 'https://cdn.example.com/cat.png' },
    };
    const request = aiVariantsRequest({ exemplars: [picture], level: 'A1', images: 'reuse' });
    expect(request.skipped[0]?.code).toBe('variant_exemplar_unseen');
  });

  it('with every exemplar left out, holds none and makes no call', async () => {
    const request = aiVariantsRequest({ exemplars: [{ ...writing(), prompt: '' }], level: 'A2' });
    expect(request.facts.exemplars).toEqual([]);
    let called = false;
    const run = await generateVariants({
      request,
      port: () => {
        called = true;
        return { variants: [] };
      },
      newId: counter(),
    });
    expect(called).toBe(false);
    expect(run).toEqual({
      variants: [],
      missing: [],
      findings: [],
      skipped: request.skipped,
      calls: [],
    });
  });
});

describe('checkAiVariants', () => {
  it('reads a good reply: every variant whole, but for the recordings to make', () => {
    const result = check(goodVariants());
    expect(result.missing).toEqual([]);
    expect(result.variants.map((one) => [one.exemplarIndex, one.status])).toEqual([
      [0, 'incomplete'],
      [1, 'incomplete'],
      [2, 'complete'],
      [3, 'complete'],
      [4, 'complete'],
      [5, 'complete'],
    ]);
    for (const variant of result.variants) {
      expect(variant.mismatches).toEqual([]);
      expect(variant.validation.issues.every((one) => one.code === 'media_url_required')).toBe(
        true,
      );
    }
    // "since" is the natural answer of a parallel grammar item: a warning, the host's call.
    expect(result.variants.flatMap(codes)).toEqual(['variant_same_key']);
    expect(result.findings).toEqual([]);
  });

  it('copies what scores and what tests from the exemplar, and nothing that belongs to the old content', () => {
    const result = check(goodVariants());
    const part = variantOf(result, 0).entry;
    expect(part.slotKey).toBe('listening-1');
    expect(part.title).toBe('Part 1');
    expect(at(part, 'stimulus', 'media')).toEqual({
      type: 'audio',
      url: null,
      playback: { maxPlays: 2, seek: 'none' },
    });
    expect(at(part, 'stimulus', 'script', 0)).toEqual({
      speaker: 'Maria',
      text: 'Hello Ben, would you like to play tennis with me on Sunday morning?',
    });
    expect(at(part, 'items', 0, 'learningObjectives')).toEqual([
      'https://example.com/cefr/a2/listening/specific-information',
    ]);
    expect(at(part, 'items', 0, 'scoringStrategy')).toBe('all-or-nothing');
    expect(at(part, 'items', 0, 'mode')).toBe('single');
    const dictated = variantOf(result, 1).entry;
    expect(dictated.media).toEqual({ type: 'audio', url: null, playback: { seek: 'none' } });
    expect(dictated.slowMedia).toEqual({ type: 'audio', url: null });
    expect(dictated.tolerance).toEqual(dictation().tolerance);
    expect(dictated.locale).toBe('en-US');
    const gaps = variantOf(result, 2).entry;
    expect(gaps.scoringStrategy).toBe('partial');
    expect(at(gaps, 'banks', 0, 'choices')).toHaveLength(5);
    const writtenTask = variantOf(result, 4).entry;
    expect(writtenTask.rubric).toEqual(writing().rubric);
    expect([writtenTask.minWords, writtenTask.maxWords]).toEqual([60, 90]);
    expect(writtenTask.difficultyLevel).toBe(3);
    const read = variantOf(result, 5).entry;
    expect([read.recording, read.scoring, read.locale]).toEqual([
      readAloud().recording,
      readAloud().scoring,
      'en-US',
    ]);
    const blanks = variantOf(result, 3).entry;
    expect(at(blanks, 'blanks', 1, 'match')).toEqual({ levenshtein: 1 });
    expect(at(blanks, 'blanks', 0, 'caseSensitive')).toBe(false);
  });

  it('mints every id anew, once, and leaves no address of a recording and no HTML', () => {
    const result = check(goodVariants());
    const text = JSON.stringify(result.variants.map((one) => one.entry));
    expect(text).not.toContain('cdn.example.com');
    expect(text).not.toMatch(/Html"/);
    expect(text).not.toContain('voiceId');
    const ids = [...text.matchAll(/"(?:id|bankId|correctChoiceId)":"(id-\d+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(20);
    const own = [...text.matchAll(/"id":"(id-\d+)"/g)].map((m) => m[1]);
    expect(new Set(own).size).toBe(own.length);
    expect(text).not.toContain('"v1-');
  });

  it('pairs every exemplar item with the variant item in its place', () => {
    const result = check(goodVariants());
    expect(variantOf(result, 0).pairs).toEqual([
      { exemplarPath: [], variantPath: [], exemplarId: 'v1-part1', variantId: expect.any(String) },
      {
        exemplarPath: ['items', '0'],
        variantPath: ['items', '0'],
        exemplarId: 'v1-q1',
        variantId: expect.any(String),
      },
      {
        exemplarPath: ['items', '1'],
        variantPath: ['items', '1'],
        exemplarId: 'v1-q2',
        variantId: expect.any(String),
      },
    ]);
    const part = variantOf(result, 0);
    expect(part.pairs.map((one) => one.variantId)).toEqual([
      part.entry.id,
      at(part.entry, 'items', 0, 'id'),
      at(part.entry, 'items', 1, 'id'),
    ]);
    expect(variantOf(result, 3).pairs).toEqual([
      {
        exemplarPath: [],
        variantPath: [],
        exemplarId: 'v1-fib',
        variantId: variantOf(result, 3).entry.id,
      },
    ]);
  });

  it('reports a multiple choice with another number of options (case 2)', () => {
    const result = check(
      replyWith(0, (variant) => {
        const options = at(variant, 'items', 0, 'options') as Fields[];
        options.push({ text: 'He forgot the date.', isCorrect: false });
      }),
    );
    const part = variantOf(result, 0);
    expect(part.status).toBe('invalid');
    expect(part.mismatches).toEqual([
      {
        path: ['items', '0', 'options'],
        message: '4 options; the exemplar has 3.',
        code: 'variant_structure',
        severity: 'invalid',
      },
    ]);
  });

  it('reports a choose-two answered with one right option (case 3)', () => {
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
    const request = aiVariantsRequest({ exemplars: [chooseTwo], level: 'A2' });
    expect(request.facts.exemplars[0]?.targets.structure).toEqual({
      mode: 'multi',
      options: 5,
      correct: 2,
    });
    const result = check(
      [
        {
          exemplar: 0,
          type: 'multiple-choice',
          title: 'Choose TWO',
          question: 'Which two things will Maria take with her to the beach on Sunday?',
          options: [
            { text: 'Towels', isCorrect: true },
            { text: 'A kite', isCorrect: false },
            { text: 'Fruit', isCorrect: false },
            { text: 'A tent', isCorrect: false },
            { text: 'A radio', isCorrect: false },
          ],
        },
      ],
      request,
    );
    expect(variantOf(result, 0).mismatches.map((one) => one.message)).toEqual([
      '1 correct option; the exemplar has 2.',
    ]);
    expect(variantOf(result, 0).entry.mode).toBe('multi');
  });

  it('reports a script with one speaker for an exemplar with two (case 4)', () => {
    const result = check(
      replyWith(0, (variant) => {
        for (const turn of at(variant, 'stimulus', 'script') as Fields[]) {
          turn.speaker = 'Maria';
        }
      }),
    );
    expect(variantOf(result, 0).mismatches.map((one) => [one.path.join('.'), one.message])).toEqual(
      [['stimulus.script', '1 speaker; the exemplar has 2.']],
    );
  });

  it('reports a script with far fewer turns, and a part with an item missing', () => {
    const result = check(
      replyWith(0, (variant) => {
        (at(variant, 'stimulus', 'script') as Fields[]).splice(2);
        (variant.items as Fields[]).pop();
      }),
    );
    expect(variantOf(result, 0).mismatches.map((one) => one.message)).toEqual([
      '2 turns; the exemplar has 6, so 5 to 7.',
      '1 item; the exemplar has 2.',
    ]);
  });

  it('reports a bank with one choice fewer (case 5)', () => {
    const result = check(
      replyWith(2, (variant) => {
        (at(variant, 'banks', 0, 'choices') as string[]).pop();
      }),
    );
    expect(variantOf(result, 2).mismatches.map((one) => [one.path.join('.'), one.message])).toEqual(
      [['banks.0.choices', "Bank 1 offers 4 choices; the exemplar's offers 5."]],
    );
  });

  it('keys a banked gap by the text of its answer, and asks again for an answer the bank does not offer', () => {
    const result = check(
      replyWith(2, (variant) => {
        at(variant, 'gaps', 1, 'answer');
        (variant.gaps as Fields[])[1] = { answer: 'drank' };
      }),
    );
    const gaps = variantOf(result, 2);
    expect(at(gaps.entry, 'gaps', 1, 'correctChoiceId')).toBe('');
    expect(gaps.status).not.toBe('complete');
    const repair = aiVariantsRepairRequest(ask(), result);
    expect(repair?.repair?.[0]?.problems.map((one) => one.path.join('.'))).toContain(
      'gaps.1.answer',
    );
  });

  it('puts the copied rubric back, whatever the reply wrote (case 6)', () => {
    const result = check(
      replyWith(4, (variant) => {
        variant.rubric = { criteria: [{ name: 'Anything', weight: 9 }] };
        variant.minWords = 1;
        variant.scoringStrategy = 'partial';
        variant.id = 'model-id';
      }),
    );
    const writtenTask = variantOf(result, 4);
    expect(writtenTask.entry.rubric).toEqual(writing().rubric);
    expect(writtenTask.entry.minWords).toBe(60);
    expect(writtenTask.entry).not.toHaveProperty('scoringStrategy');
    expect(writtenTask.entry.id).not.toBe('model-id');
    expect(writtenTask.mismatches).toEqual([]);
  });

  it('reports a passage outside its length band (case 7)', () => {
    const result = check(
      replyWith(3, (variant) => {
        variant.passage = 'If he {{1}} time, he would play. They worked {{2}} May.';
      }),
    );
    expect(variantOf(result, 3).findings).toContainEqual({
      path: ['passage'],
      code: 'variant_length',
      severity: 'warning',
      // "If I {{a}} rich, I would travel around the world. She has lived here
      // {{b}} 2010." is 14 words once its gaps are out: 14 ± 3.5.
      message: "9 words; the exemplar's has 14, so 11 to 17.",
    });
  });

  it("reports a stem that is the exemplar's with two words changed, with the score (case 8)", () => {
    const result = check(
      replyWith(0, (variant) => {
        (at(variant, 'items', 1) as Fields).question =
          'Where will Anna and Tom meet on Sunday morning?';
      }),
    );
    const found = variantOf(result, 0).findings.find((one) => one.code === 'variant_near_copy');
    expect(found).toEqual({
      path: ['items', '1', 'question'],
      code: 'variant_near_copy',
      severity: 'warning',
      // 5 word triples shared of 9 in all.
      message:
        "This reads like the exemplar's items.1.question (similarity 0.56). Write it in new words.",
    });
  });

  it("reports the exemplar's options in another order as a near copy", () => {
    const result = check(
      replyWith(0, (variant) => {
        (at(variant, 'items', 0) as Fields).options = [
          { text: 'He is visiting his family.', isCorrect: false },
          { text: 'He has to work late.', isCorrect: true },
          { text: 'He does not like films.', isCorrect: false },
        ];
      }),
    );
    const found = variantOf(result, 0).findings.filter((one) => one.code === 'variant_near_copy');
    expect(found.map((one) => one.path.join('.'))).toContain('items.0.options');
  });

  it("reports a key that is the exemplar's (case 9)", () => {
    const result = check(
      replyWith(0, (variant) => {
        (at(variant, 'items', 1, 'options', 1) as Fields).text = 'Outside the station.';
      }),
    );
    expect(variantOf(result, 0).findings).toContainEqual({
      path: ['items', '1', 'options', '1', 'text'],
      code: 'variant_same_key',
      severity: 'warning',
      message:
        'The right answer "outside the station" is the exemplar\'s too: a learner who sat that form scores again by memory.',
    });
  });

  it('compares with every other form: a near copy and a key of an avoid entry (case 10)', () => {
    const otherForm = writing();
    otherForm.prompt =
      'Write a message to your cousin Alex about a weekend trip you took. Say where you stayed and what you saw.';
    const formTwo = fillIn();
    const request = aiVariantsRequest({
      exemplars: [writing(), fillIn()],
      level: 'A2',
      avoid: [
        otherForm,
        {
          ...formTwo,
          passage: 'If he {{a}} more money, he would buy a car. They met {{b}} June.',
          blanks: [
            { id: 'a', acceptedAnswers: ['had'] },
            { id: 'b', acceptedAnswers: ['in'] },
          ],
        },
      ],
    });
    const reply = goodVariants()
      .filter((one) => one.exemplar === 4 || one.exemplar === 3)
      .map((one) => ({ ...one, exemplar: one.exemplar === 4 ? 0 : 1 }));
    const result = check(reply, request);
    expect(variantOf(result, 0).findings.map((one) => one.message)).toEqual([
      'This reads like avoid[0] prompt (similarity 0.71). Write it in new words.',
    ]);
    expect(variantOf(result, 1).findings.map((one) => [one.code, one.message])).toContainEqual([
      'variant_same_key',
      'The right answer "had" is avoid[1]\'s too: a learner who sat that form scores again by memory.',
    ]);
  });

  it('pairs avoid entries by slotKey before position', () => {
    const request = aiVariantsRequest({
      exemplars: [{ ...fillIn(), slotKey: 'grammar-1' }],
      level: 'A2',
      avoid: [
        {
          ...fillIn(),
          slotKey: 'grammar-2',
          blanks: [
            { id: 'a', acceptedAnswers: ['had'] },
            { id: 'b', acceptedAnswers: ['for'] },
          ],
        },
        {
          ...fillIn(),
          slotKey: 'grammar-1',
          blanks: [
            { id: 'a', acceptedAnswers: ['were'] },
            { id: 'b', acceptedAnswers: ['since'] },
          ],
        },
      ],
    });
    const reply = [{ ...goodVariants()[3], exemplar: 0 }];
    const keys = variantOf(check(reply, request), 0)
      .findings.filter((one) => one.code === 'variant_same_key')
      .map((one) => one.message);
    expect(keys).toEqual([
      'The right answer "since" is the exemplar\'s too: a learner who sat that form scores again by memory.',
    ]);
  });

  it('keeps the variants a reply wrote and lists the ones it did not (case 11)', () => {
    const request = ask();
    const result = check(
      goodVariants().filter((one) => one.exemplar !== 2),
      request,
    );
    expect(result.variants.map((one) => one.exemplarIndex)).toEqual([0, 1, 3, 4, 5]);
    expect(result.missing).toEqual([
      {
        exemplarIndex: 2,
        code: 'variant_missing',
        message: 'The reply has no variant of exemplar 2.',
        severity: 'invalid',
      },
    ]);
    const repair = aiVariantsRepairRequest(request, result);
    expect(repair?.repair?.map((one) => [one.exemplar, one.variant === undefined])).toEqual([
      [2, true],
      [3, false],
    ]);
    expect(at(repair?.shape, 'properties', 'variants', 'minItems')).toBe(2);
  });

  it('describes a new picture: no file, a written alt, and a file to supply (case 13)', () => {
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
    const request = aiVariantsRequest({ exemplars: [picture], level: 'A1' });
    expect(request.facts.images).toEqual([
      {
        ref: 'img-1',
        exemplarIndex: 0,
        path: ['media'],
        alt: 'A cat asleep on a red sofa.',
        url: 'https://cdn.example.com/cat.png',
      },
    ]);
    expect(at(request.facts.exemplars[0]?.content, 'media')).toEqual({
      alt: 'A cat asleep on a red sofa.',
      ref: 'img-1',
    });
    expect(request.facts.rules.some((rule) => rule.includes('describe a new picture'))).toBe(true);
    const result = check(
      [
        {
          exemplar: 0,
          type: 'written-response',
          title: 'A dog in the garden',
          prompt:
            'Look at the picture. Write about where the dog is playing and what the garden looks like.',
          media: { alt: 'A brown dog running across a green garden with a ball.' },
        },
      ],
      request,
    );
    const variant = variantOf(result, 0);
    expect(variant.entry.media).toEqual({
      type: 'image',
      url: null,
      alt: 'A brown dog running across a green garden with a ball.',
    });
    expect(variant.validation.issues.map((one) => one.code)).toEqual(['media_url_required']);
    expect(listMediaRefs(variant.entry)).toEqual([
      expect.objectContaining({ kind: 'image', url: null, path: ['media', 'url'] }),
    ]);
  });

  it('keeps a reused picture with its address, and asks new questions about it', () => {
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
    const request = aiVariantsRequest({ exemplars: [picture], level: 'A1', images: 'reuse' });
    expect(request.facts.rules.some((rule) => rule.includes('keep it'))).toBe(true);
    const result = check(
      [
        {
          exemplar: 0,
          type: 'written-response',
          title: 'The room',
          prompt:
            'Look at the picture. Describe the colours in the room and say what you would change.',
        },
      ],
      request,
    );
    expect(variantOf(result, 0).entry.media).toEqual(picture.media);
    expect(variantOf(result, 0).status).toBe('complete');
  });

  it('gives an option recording no file, and the words the model wrote for it', () => {
    const exemplar = {
      ...((listening().items as Fields[])[0] as Fields),
      options: [
        {
          id: 'x',
          text: 'A',
          isCorrect: true,
          media: { type: 'audio', url: 'https://cdn.example.com/x.mp3', transcript: 'Number one.' },
        },
        {
          id: 'y',
          text: 'B',
          isCorrect: false,
          media: { type: 'audio', url: 'https://cdn.example.com/y.mp3', transcript: 'Number two.' },
        },
      ],
    };
    const request = aiVariantsRequest({ exemplars: [exemplar], level: 'A1' });
    const result = check(
      [
        {
          exemplar: 0,
          type: 'multiple-choice',
          title: 'Question 1',
          question: 'Which recording says the time the film starts?',
          options: [
            { text: 'A', isCorrect: true, media: { transcript: 'It starts at seven.' } },
            { text: 'B', isCorrect: false, media: { transcript: 'It ends at nine.' } },
          ],
        },
      ],
      request,
    );
    expect(at(variantOf(result, 0).entry, 'options', 0, 'media')).toEqual({
      type: 'audio',
      url: null,
      transcript: 'It starts at seven.',
    });
  });

  it('reports a recording that came back with nothing to record', () => {
    const result = check(
      replyWith(0, (variant) => {
        delete (variant.stimulus as Fields).script;
      }),
    );
    expect(
      variantOf(result, 0).mismatches.map((one) => [one.path.join('.'), one.message]),
    ).toContainEqual([
      'stimulus.script',
      'The recording has no words to record: write what it says.',
    ]);
  });

  it('reports a variant written as another type, and keeps the rest of the reply', () => {
    const result = check(
      replyWith(5, (variant) => {
        variant.type = 'dictation';
      }),
    );
    expect(variantOf(result, 5).mismatches).toEqual([
      {
        path: ['type'],
        message: 'This was written as dictation; the exemplar is read-aloud.',
        code: 'variant_type',
        severity: 'invalid',
      },
    ]);
    expect(variantOf(result, 4).status).toBe('complete');
  });

  it('refuses a reply that is not one variant per exemplar of the facts', () => {
    const request = ask();
    const refused = (raw: unknown) => checkAiVariants(raw, request, { newId: counter() });
    expect(refused(null)).toEqual({ ok: false, refusal: 'malformed' });
    expect(refused({ variants: 'none' })).toEqual({ ok: false, refusal: 'malformed' });
    expect(refused({ variants: [1] })).toEqual({ ok: false, refusal: 'malformed' });
    expect(refused({ variants: [{ exemplar: 9, type: 'dictation' }] })).toEqual({
      ok: false,
      refusal: 'malformed',
    });
    expect(refused({ variants: [{ exemplar: '1', type: 'dictation' }] })).toEqual({
      ok: false,
      refusal: 'malformed',
    });
    const twice = goodVariants().slice(0, 2);
    twice[1] = { ...twice[1], exemplar: 0 };
    expect(refused({ variants: twice })).toEqual({ ok: false, refusal: 'malformed' });
    expect(refused({ variants: [...goodVariants(), goodVariants()[0]] })).toEqual({
      ok: false,
      refusal: 'too-long',
    });
  });

  it('carries the provenance and usage a port reported', () => {
    const checked = checkAiVariants(
      {
        variants: goodVariants(),
        provenance: { model: 'm-1' },
        usage: { promptTokens: 10, completionTokens: 5 },
      },
      ask(),
      { newId: counter() },
    );
    expect(checked.ok && checked.variants.provenance).toEqual({ model: 'm-1' });
    expect(checked.ok && checked.variants.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
  });

  it('throws when newId returns an empty or repeated id', () => {
    expect(() => checkAiVariants({ variants: goodVariants() }, ask(), { newId: () => '' })).toThrow(
      /non-empty/,
    );
    expect(() =>
      checkAiVariants({ variants: goodVariants() }, ask(), { newId: () => 'same' }),
    ).toThrow(/twice/);
  });

  it('changes nothing it was given', () => {
    const exemplars = section();
    const avoid = [writing()];
    const request = aiVariantsRequest({
      exemplars,
      level: 'A2',
      avoid,
      balanceKeyPositions: { seed: 'exam-7:v2' },
    });
    const before = JSON.stringify({ exemplars, avoid, request });
    check(goodVariants(), request);
    expect(JSON.stringify({ exemplars, avoid, request })).toBe(before);
    expect(exemplars).toEqual(section());
  });
});

describe('balanceKeyPositions (case 14)', () => {
  const STEMS = [
    'Which animal does the writer see first on the morning walk?',
    'Why does the family leave the campsite earlier than they planned?',
    'What does the guide tell everyone to bring on the boat trip?',
    'Where do the children find the lost map at the end?',
    'How does the grandmother feel about moving to the new house?',
  ];
  const NEW_STEMS = [
    'What does the girl buy for her brother at the market?',
    'When does the last bus leave the village on Sundays?',
    'Who helps the old man carry his shopping up the hill?',
    'Why is the swimming pool closed for the whole of August?',
    'Which present does the boy like most at his party?',
  ];
  const five = () =>
    Array.from({ length: 5 }, (_, n) => ({
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: `q${n}`,
      title: `Question ${n + 1}`,
      question: STEMS[n] as string,
      mode: 'single',
      options: [
        { id: `q${n}a`, text: `Alpha ${n}`, isCorrect: false },
        { id: `q${n}b`, text: `Beta ${n}`, isCorrect: true },
        { id: `q${n}c`, text: `Gamma ${n}`, isCorrect: false },
        { id: `q${n}d`, text: `Delta ${n}`, isCorrect: false },
      ],
      scoringStrategy: 'all-or-nothing',
    }));
  // A model's habit: every key in B.
  const reply = () =>
    Array.from({ length: 5 }, (_, n) => ({
      exemplar: n,
      type: 'multiple-choice',
      title: `Item ${n + 1}`,
      question: NEW_STEMS[n] as string,
      options: [
        { text: `One ${n}`, isCorrect: false },
        { text: `Two ${n}`, isCorrect: true },
        { text: `Three ${n}`, isCorrect: false },
        { text: `Four ${n}`, isCorrect: false },
      ],
    }));
  const keyPositions = (result: AiVariants) =>
    result.variants.map((one) =>
      (one.entry.options as Fields[]).findIndex((option) => option.isCorrect === true),
    );

  it('spreads the keys as evenly as the counts allow, the same way every time', () => {
    const request = aiVariantsRequest({
      exemplars: five(),
      level: 'A2',
      balanceKeyPositions: { seed: 'exam-7:v2' },
    });
    const first = check(reply(), request);
    const positions = keyPositions(first);
    // Five keys over four positions: one position twice, every other once.
    expect(positions).toEqual([1, 2, 0, 3, 3]);
    expect(keyPositions(check(reply(), request))).toEqual(positions);
    // Options move whole: the key keeps its text and the others their order.
    expect(((first.variants[1]?.entry.options ?? []) as Fields[]).map((one) => one.text)).toEqual([
      'One 1',
      'Three 1',
      'Two 1',
      'Four 1',
    ]);
    expect(
      keyPositions(
        check(
          reply(),
          aiVariantsRequest({
            exemplars: five(),
            level: 'A2',
            balanceKeyPositions: { seed: 'exam-7:v3' },
          }),
        ),
      ),
    ).not.toEqual(positions);
    expect(first.findings.map((one) => one.code)).toEqual([]);
  });

  it("leaves the model's order without a seed, and the set critic says so", () => {
    const result = check(reply(), aiVariantsRequest({ exemplars: five(), level: 'A2' }));
    expect(keyPositions(result)).toEqual([1, 1, 1, 1, 1]);
    expect(result.findings.map((one) => one.code)).toEqual(['set_key_position_same']);
  });

  it('leaves shuffled questions, and multi-answer ones, alone', () => {
    const shuffled = five().map((one) => ({ ...one, shuffle: true }));
    const result = check(
      reply(),
      aiVariantsRequest({ exemplars: shuffled, level: 'A2', balanceKeyPositions: { seed: 's' } }),
    );
    expect(keyPositions(result)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe('aiVariantsRepairRequest', () => {
  it("is null when nothing is to repair: a missing file is the host's", () => {
    const result = check(goodVariants().filter((one) => one.exemplar !== 3));
    const repair = aiVariantsRepairRequest(ask(), result.variants);
    expect(repair).toBeNull();
  });

  it("sends back what the model can fix, at the paths it wrote, and not what is the host's", () => {
    const request = ask();
    const result = check(
      replyWith(0, (variant) => {
        (at(variant, 'items', 0, 'options') as Fields[]).push({ text: 'Extra.', isCorrect: false });
        (variant.stimulus as Fields).script = [{ speaker: 'Maria', text: 'Hello.' }];
      }),
      request,
    );
    const repair = aiVariantsRepairRequest(request, result);
    const part = repair?.repair?.find((one) => one.exemplar === 0);
    expect(part?.variant).toEqual(variantOf(result, 0).generated);
    expect(part?.problems.map((one) => [one.code, one.path.join('.')])).toEqual([
      ['variant_structure', 'stimulus.script'],
      ['variant_structure', 'stimulus.script'],
      ['variant_structure', 'items.0.options'],
      ['variant_length', 'stimulus.script'],
    ]);
    expect(part?.problems.some((one) => one.code === 'media_url_required')).toBe(false);
  });

  it('sends a read-aloud too long for its time back at its text', () => {
    const request = aiVariantsRequest({ exemplars: [readAloud()], level: 'A2' });
    const result = check(
      [
        {
          exemplar: 0,
          type: 'read-aloud',
          title: 'Read aloud',
          referenceText: 'word '.repeat(60).trim(),
        },
      ],
      request,
    );
    const problems = aiVariantsRepairRequest(request, result)?.repair?.[0]?.problems ?? [];
    expect(problems.find((one) => one.code === 'ra_text_long_for_time')?.path).toEqual([
      'referenceText',
    ]);
  });
});

describe('generateVariants', () => {
  it('repairs what came back wrong, keeps the better pass and its id, and fills what was missing', async () => {
    const requests: AiVariantsRequest[] = [];
    const first = goodVariants()
      .filter((one) => one.exemplar !== 1)
      .map((one) =>
        one.exemplar === 4
          ? { ...one, prompt: 'Write about your last holiday to your friend Sam: where you went.' }
          : one,
      );
    const run = await generateVariants({
      request: ask(),
      port: (request) => {
        requests.push(request);
        if (requests.length === 1) {
          return { variants: first, provenance: { model: 'first' } };
        }
        return {
          variants: (request.repair ?? []).map(
            (one) => goodVariants().find((variant) => variant.exemplar === one.exemplar) as Fields,
          ),
        };
      },
      newId: counter(),
    });
    expect(requests[1]?.repair?.map((one) => one.exemplar)).toEqual([1, 3, 4]);
    expect(run.missing).toEqual([]);
    expect(run.variants.map((one) => [one.exemplarIndex, one.status])).toEqual([
      [0, 'incomplete'],
      [1, 'incomplete'],
      [2, 'complete'],
      [3, 'complete'],
      [4, 'complete'],
      [5, 'complete'],
    ]);
    expect(run.calls).toEqual([{ ok: true, provenance: { model: 'first' } }, { ok: true }]);
    expect(run.skipped).toEqual([]);
  });

  it('keeps a variant when its repair came back no better', async () => {
    let calls = 0;
    const run = await generateVariants({
      request: aiVariantsRequest({ exemplars: [writing()], level: 'A2' }),
      port: () => {
        calls += 1;
        // First a near copy (complete, with a warning); then a repair of the wrong type (invalid).
        return calls === 1
          ? {
              variants: [
                {
                  exemplar: 0,
                  type: 'written-response',
                  title: 'An email',
                  prompt: writing().prompt,
                },
              ],
            }
          : {
              variants: [
                { exemplar: 0, type: 'dictation', title: 'An email', transcript: 'Words.' },
              ],
            };
      },
      newId: counter(),
      repairs: 2,
    });
    expect(calls).toBe(3);
    expect(run.variants[0]?.status).toBe('complete');
    expect(run.variants[0]?.findings.map((one) => one.code)).toEqual(['variant_near_copy']);
  });

  it('keeps the id of a variant it replaces', async () => {
    let calls = 0;
    let firstId: unknown;
    const run = await generateVariants({
      request: aiVariantsRequest({ exemplars: [writing()], level: 'A2' }),
      port: (request) => {
        calls += 1;
        return calls === 1
          ? {
              variants: [
                {
                  exemplar: 0,
                  type: 'written-response',
                  title: 'An email',
                  prompt: writing().prompt,
                },
              ],
            }
          : { variants: [{ ...goodVariants()[4], exemplar: (request.repair ?? [])[0]?.exemplar }] };
      },
      newId: (() => {
        const next = counter();
        return () => {
          const id = next();
          firstId ??= id;
          return id;
        };
      })(),
    });
    expect(run.variants[0]?.entry.id).toBe(firstId);
    expect(run.variants[0]?.findings).toEqual([]);
  });

  it('never throws for a model: a port that throws, or a refused reply, ends the run', async () => {
    const thrown = await generateVariants({
      request: ask(),
      port: () => {
        throw new Error('timeout');
      },
      newId: counter(),
    });
    expect(thrown).toEqual({
      variants: [],
      missing: [],
      findings: [],
      skipped: [],
      calls: [{ ok: false, error: 'timeout' }],
    });
    let calls = 0;
    const refused = await generateVariants({
      request: ask(),
      port: () => {
        calls += 1;
        return calls === 1 ? { variants: goodVariants().slice(0, 5) } : 'nonsense';
      },
      newId: counter(),
    });
    expect(refused.calls).toEqual([{ ok: true }, { ok: false, refusal: 'malformed' }]);
    expect(refused.missing.map((one) => one.exemplarIndex)).toEqual([5]);
    expect(refused.variants).toHaveLength(5);
  });

  it('makes no repair with repairs 0, and refuses a count it does not allow', async () => {
    let calls = 0;
    const run = await generateVariants({
      request: ask(),
      port: () => {
        calls += 1;
        return { variants: goodVariants().slice(1) };
      },
      newId: counter(),
      repairs: 0,
    });
    expect(calls).toBe(1);
    expect(run.missing.map((one) => one.exemplarIndex)).toEqual([0]);
    await expect(
      generateVariants({
        request: ask(),
        port: () => ({}),
        newId: counter(),
        repairs: AI_VARIANTS_MAX_REPAIRS + 1,
      }),
    ).rejects.toThrow(RangeError);
    await expect(
      generateVariants({ request: ask(), port: () => ({}), newId: counter(), repairs: 1.5 }),
    ).rejects.toThrow(RangeError);
  });

  it('spreads the keys once, over the variants as they end', async () => {
    const exemplars = Array.from({ length: 4 }, (_, n) => ({
      ...((listening().items as Fields[])[0] as Fields),
      id: `q${n}`,
      question: `Question number ${n + 1} asks which reason the speaker gives for the change.`,
    }));
    const write = (n: number) => ({
      exemplar: n,
      type: 'multiple-choice',
      title: `Question ${n + 1}`,
      question: `Item number ${n + 1} asks what the second speaker decides to do next.`,
      options: [
        { text: `Right ${n}`, isCorrect: true },
        { text: `Wrong ${n}`, isCorrect: false },
        { text: `Other ${n}`, isCorrect: false },
      ],
    });
    const run = await generateVariants({
      request: aiVariantsRequest({
        exemplars,
        level: 'A2',
        balanceKeyPositions: { seed: 'form-2' },
      }),
      port: () => ({ variants: [0, 1, 2, 3].map(write) }),
      newId: counter(),
    });
    const positions = run.variants.map((one) =>
      (one.entry.options as Fields[]).findIndex((option) => option.isCorrect === true),
    );
    // Four keys over three positions: each position once or twice.
    const counts = [0, 1, 2].map((position) => positions.filter((one) => one === position).length);
    expect(Math.min(...counts)).toBe(1);
    expect(Math.max(...counts)).toBe(2);
    expect(run.variants.every((one) => one.status === 'complete')).toBe(true);
  });
});
