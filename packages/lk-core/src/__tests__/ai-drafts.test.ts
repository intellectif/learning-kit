import { describe, expect, it, vi } from 'vitest';
import {
  AI_DRAFTS_MAX_COUNT,
  aiDraftsRepairRequest,
  aiDraftsRequest,
  checkAiDrafts,
  generateDrafts,
  interactiveVideoFromDrafts,
} from '../ai-drafts.js';
import type { AiDraftsRequest, AiDraftType } from '../types/ai.js';

/**
 * Drafts from a source: what a model is asked for, how its reply becomes drafts
 * an author approves, the repair loop, and an interactive video made of them.
 * What is under test is that a model writes only content — never an id, a
 * setting or HTML — that the author's choice and order of types hold, that
 * every draft is checked and critiqued, that the loop is bounded and never
 * throws for a model's failure, and that a video places each question where
 * its caption ends, or at the end.
 */

const PASSAGE =
  'Maria lives in Seville. Every morning she walks to the market and buys fresh bread.';

const CAPTIONS = [
  { start: 0, end: 3, text: 'Maria lives in Seville.' },
  { start: 3, end: 6.5, text: 'Every morning she walks to the market.' },
  { start: 6.5, end: 9, text: 'She buys fresh bread.' },
];

const READ_ALOUD = {
  locale: 'en-US',
  recording: { maxSeconds: 20 },
  scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
};

const counter = () => {
  let next = 0;
  return () => {
    next += 1;
    return `id-${next}`;
  };
};

type Input = Parameters<typeof aiDraftsRequest>[0];

/** A request on the passage, asking for three unless `count` says otherwise — `undefined` for none. */
const ask = (
  types: AiDraftType[],
  over: Omit<Partial<Input>, 'count'> & { count?: number | undefined } = {},
): AiDraftsRequest => {
  const { count, ...rest } = over;
  const asked = 'count' in over ? count : 3;
  const built = aiDraftsRequest({
    types,
    source: { kind: 'passage', text: PASSAGE },
    ...(asked !== undefined ? { count: asked } : {}),
    ...rest,
  });
  if (built === null) {
    throw new Error('no request');
  }
  return built;
};

const onCaptions = (types: AiDraftType[], over: Partial<Input> = {}) => {
  const built = aiDraftsRequest({ types, source: { kind: 'captions', cues: CAPTIONS }, ...over });
  if (built === null) {
    throw new Error('no request');
  }
  return built;
};

const question = (over: Record<string, unknown> = {}) => ({
  type: 'multiple-choice',
  title: 'Maria’s town',
  question: 'Where does Maria live?',
  mode: 'single',
  options: [
    { text: 'Seville', isCorrect: true },
    { text: 'Madrid', isCorrect: false },
    { text: 'Lisbon', isCorrect: false },
  ],
  ...over,
});

const dictation = (over: Record<string, unknown> = {}) => ({
  type: 'dictation',
  title: 'Listen and write',
  transcript: 'she walks to the market',
  ...over,
});

const reading = (over: Record<string, unknown> = {}) => ({
  type: 'read-aloud',
  title: 'Read it aloud',
  referenceText: 'She buys fresh bread.',
  ...over,
});

const read = (checked: ReturnType<typeof checkAiDrafts>) => {
  if (!checked.ok) {
    throw new Error(checked.refusal);
  }
  return checked.drafts;
};

describe('aiDraftsRequest', () => {
  it('gives the model the source, the types in the author’s order, the count, and keeps the author’s settings', () => {
    const built = ask(['multiple-choice', 'dictation'], {
      locale: 'en',
      level: 'A2',
      instructions: 'Simple words.',
      settings: { 'read-aloud': READ_ALOUD },
    });
    expect(built.feature).toBe('draft-generation');
    expect(built.facts).toEqual({
      activityTypes: ['multiple-choice', 'dictation'],
      source: { kind: 'passage', text: PASSAGE },
      count: 3,
      locale: 'en',
      level: 'A2',
      instructions: 'Simple words.',
    });
    // Settings are the host's: on the request for checkAiDrafts, not among the facts.
    expect(built.settings).toEqual({ 'read-aloud': READ_ALOUD });
  });

  it('asks for one kind of draft that names its type and fills the fields of the types chosen, and no others', () => {
    const built = ask(['dictation', 'multiple-choice']);
    const drafts = (built.shape.properties as Record<string, Record<string, unknown>>)
      .drafts as Record<string, unknown>;
    expect(drafts.maxItems).toBe(3);
    const item = drafts.items as {
      required: string[];
      properties: Record<string, Record<string, unknown>>;
    };
    expect(item.required).toEqual(['type', 'title']);
    expect(item.properties.type?.enum).toEqual(['dictation', 'multiple-choice']);
    expect(item.properties.type?.description).toContain('dictation: transcript, feedback');
    expect(Object.keys(item.properties).sort()).toEqual(
      ['type', 'title', 'transcript', 'feedback', 'question', 'mode', 'options'].sort(),
    );
    for (const key of [
      'id',
      'questionHtml',
      'media',
      'shuffle',
      'ai',
      'scoringStrategy',
      'recording',
      'caption',
    ]) {
      expect(Object.keys(item.properties), key).not.toContain(key);
    }
    expect(JSON.stringify(built.shape)).not.toMatch(
      /"(pattern|format|additionalProperties|\$ref|anyOf|oneOf)"/,
    );
  });

  it('leaves the count to the model when the author gives none, up to the most a reply may hold', () => {
    const open = ask(['multiple-choice'], { count: undefined });
    expect(open.facts).not.toHaveProperty('count');
    const drafts = (open.shape.properties as Record<string, Record<string, unknown>>).drafts;
    expect(drafts?.maxItems).toBe(AI_DRAFTS_MAX_COUNT);
  });

  it('numbers captions, keeps their times, drops empty ones, and asks for the caption each draft is about', () => {
    const built = aiDraftsRequest({
      types: ['fill-in-the-blanks'],
      source: {
        kind: 'captions',
        cues: [
          { start: 0, end: 2.5, text: 'Hello.' },
          { start: 2.5, end: 4, text: '   ' },
          { start: 4, end: 7.25, text: 'I live in Seville.' },
        ],
      },
    });
    expect(built?.facts.source).toEqual({
      kind: 'captions',
      captions: [
        { index: 0, start: 0, end: 2.5, text: 'Hello.' },
        { index: 2, start: 4, end: 7.25, text: 'I live in Seville.' },
      ],
    });
    const itemOf = (request: AiDraftsRequest | null) =>
      ((request?.shape.properties as Record<string, Record<string, unknown>>).drafts?.items ??
        {}) as { required: string[]; properties: Record<string, unknown> };
    const item = itemOf(built);
    expect(item.required).toContain('caption');
    expect(item.properties.caption).toMatchObject({ type: 'integer', minimum: 0 });
    // A script has no captions to name.
    const script = itemOf(ask(['fill-in-the-blanks']));
    expect(script.required).not.toContain('caption');
    expect(script.properties).not.toHaveProperty('caption');
  });

  it('builds nothing from an empty source, and refuses types or a count it cannot ask for', () => {
    expect(
      aiDraftsRequest({ types: ['gap-select'], source: { kind: 'transcript', text: '  ' } }),
    ).toBeNull();
    expect(
      aiDraftsRequest({ types: ['gap-select'], source: { kind: 'captions', cues: [] } }),
    ).toBeNull();
    for (const types of [[], ['multiple-choice', 'multiple-choice'], ['matching']]) {
      expect(() => ask(types as AiDraftType[]), JSON.stringify(types)).toThrow(RangeError);
    }
    for (const count of [0, 1.5, AI_DRAFTS_MAX_COUNT + 1, Number.NaN]) {
      expect(() => ask(['multiple-choice'], { count }), String(count)).toThrow(RangeError);
    }
  });
});

describe('checkAiDrafts', () => {
  it('makes a draft of what the model wrote: the host’s ids, the item’s language, all-or-nothing, checked and critiqued', () => {
    const drafts = read(
      checkAiDrafts(
        {
          drafts: [
            question({
              // None of these is the model's to set, and none is read.
              id: 'model-id',
              questionHtml: '<b>x</b>',
              media: { type: 'image', url: 'javascript:alert(1)' },
              shuffle: true,
              ai: { hints: false },
              scoringStrategy: 'partial',
            }),
          ],
          provenance: { model: 'm-1' },
          usage: { completionTokens: 90 },
        },
        ask(['multiple-choice'], { locale: 'en' }),
        { newId: counter() },
      ),
    );
    const [draft] = drafts.drafts;
    expect(draft?.type).toBe('multiple-choice');
    expect(draft?.draft).toEqual({
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'id-1',
      title: 'Maria’s town',
      locale: 'en',
      question: 'Where does Maria live?',
      mode: 'single',
      scoringStrategy: 'all-or-nothing',
      options: [
        { id: 'id-2', text: 'Seville', isCorrect: true },
        { id: 'id-3', text: 'Madrid', isCorrect: false },
        { id: 'id-4', text: 'Lisbon', isCorrect: false },
      ],
    });
    expect(draft?.validation.status).toBe('complete');
    expect(draft?.findings).toEqual([]);
    expect(drafts.provenance).toEqual({ model: 'm-1' });
    expect(drafts.usage).toEqual({ completionTokens: 90 });
  });

  it('puts the drafts in the author’s order of types, keeping where each was in the reply', () => {
    const drafts = read(
      checkAiDrafts(
        { drafts: [dictation(), question(), reading(), question({ title: 'Second' })] },
        ask(['multiple-choice', 'dictation', 'read-aloud'], { count: 4 }),
        { newId: counter() },
      ),
    );
    expect(drafts.drafts.map((one) => [one.type, one.index])).toEqual([
      ['multiple-choice', 1],
      ['multiple-choice', 3],
      ['dictation', 0],
      ['read-aloud', 2],
    ]);
  });

  it('refuses a draft of a type the author did not choose, or one that names none', () => {
    for (const drafts of [[question(), dictation()], [{ ...question(), type: undefined }]]) {
      expect(checkAiDrafts({ drafts }, ask(['multiple-choice']), { newId: counter() })).toEqual({
        ok: false,
        refusal: 'malformed',
      });
    }
  });

  it('puts the host’s settings on every draft of a type, under the content and never over what the draft is', () => {
    const drafts = read(
      checkAiDrafts(
        { drafts: [reading({ instructions: 'Slowly, as if to a friend.' }), question()] },
        ask(['read-aloud', 'multiple-choice'], {
          locale: 'en',
          settings: {
            'read-aloud': {
              ...READ_ALOUD,
              title: 'Not the model’s title',
              id: 'x',
              type: 'dictation',
            },
            'multiple-choice': {
              shuffle: true,
              scoringStrategy: 'partial',
              question: 'Not it either',
            },
          },
        }),
        { newId: counter() },
      ),
    );
    const [ra, mc] = drafts.drafts;
    expect(ra?.draft).toMatchObject({
      ...READ_ALOUD,
      title: 'Read it aloud',
      instructions: 'Slowly, as if to a friend.',
      id: 'id-1',
      type: 'read-aloud',
    });
    expect(ra?.validation.status).toBe('complete');
    expect(mc?.draft).toMatchObject({
      shuffle: true,
      scoringStrategy: 'partial',
      question: 'Where does Maria live?',
    });
  });

  it('leaves a read-aloud without settings unset, as a new draft is, and a dictation without a recording', () => {
    const drafts = read(
      checkAiDrafts(
        { drafts: [reading(), dictation()] },
        ask(['read-aloud', 'dictation'], { locale: 'en-US' }),
        { newId: counter() },
      ),
    );
    const [ra, dc] = drafts.drafts;
    expect(ra?.draft).toMatchObject({
      recording: { maxSeconds: 0 },
      scoring: { dimensions: [] },
      locale: 'en-US',
    });
    expect(ra?.validation).toMatchObject({ status: 'incomplete' });
    expect(dc?.draft).toEqual({
      schemaVersion: '1.0',
      type: 'dictation',
      id: 'id-2',
      title: 'Listen and write',
      locale: 'en-US',
      transcript: 'she walks to the market',
    });
  });

  it('numbers blanks and gaps by their placeholders, and takes a gap’s key only when exactly one choice is marked', () => {
    const cloze = read(
      checkAiDrafts(
        {
          drafts: [
            {
              type: 'fill-in-the-blanks',
              title: 'Maria',
              passage: 'She {{1}} to the market and {{2}} bread.',
              blanks: [
                { acceptedAnswers: ['walks'], hint: 'A verb of moving.' },
                { acceptedAnswers: ['buys', 7] },
              ],
            },
            {
              type: 'fill-in-the-blanks',
              title: 'Maria',
              passage: 'She {{a}} to the market.',
              blanks: [{ acceptedAnswers: ['walks'] }],
            },
          ],
        },
        ask(['fill-in-the-blanks']),
        { newId: counter() },
      ),
    );
    expect(cloze.drafts[0]?.draft.blanks).toEqual([
      { id: '1', acceptedAnswers: ['walks'], hint: 'A verb of moving.' },
      { id: '2', acceptedAnswers: ['buys'] },
    ]);
    expect(cloze.drafts[0]?.validation.status).toBe('complete');
    // A placeholder the model named its own way pairs with no blank: for a repair to fix.
    expect(cloze.drafts[1]?.validation).toMatchObject({
      status: 'incomplete',
      issues: [
        expect.objectContaining({ code: 'fib_blank_missing' }),
        expect.objectContaining({ code: 'fib_placeholder_missing' }),
      ],
    });

    const gap = (choices: unknown[]) => ({
      type: 'gap-select',
      title: 'Maria',
      passage: 'She walks {{1}} the market.',
      gaps: [{ choices }],
    });
    const gaps = read(
      checkAiDrafts(
        {
          drafts: [
            gap([
              { text: 'to', isCorrect: true },
              { text: 'at', isCorrect: false },
            ]),
            gap([
              { text: 'to', isCorrect: true },
              { text: 'at', isCorrect: true },
            ]),
          ],
        },
        ask(['gap-select']),
        { newId: counter() },
      ),
    );
    expect(gaps.drafts[0]?.draft.gaps).toEqual([
      {
        id: '1',
        choices: [
          { id: 'id-2', text: 'to' },
          { id: 'id-3', text: 'at' },
        ],
        correctChoiceId: 'id-2',
      },
    ]);
    expect(gaps.drafts[0]?.validation.status).toBe('complete');
    expect(gaps.drafts[1]?.validation).toMatchObject({
      status: 'incomplete',
      issues: [expect.objectContaining({ code: 'gs_correct_choice_required' })],
    });
  });

  it('weighs a writing task’s criteria equally, adds no empty rubric, and leaves its word limits to validateDraft', () => {
    const writing = (over: Record<string, unknown>) => ({
      type: 'written-response',
      title: 'Your town',
      prompt: 'Describe your town.',
      minWords: 40,
      maxWords: 80,
      ...over,
    });
    const drafts = read(
      checkAiDrafts(
        {
          drafts: [
            writing({
              minWords: 60,
              maxWords: 40,
              rubric: {
                criteria: [
                  { name: 'Grammar' },
                  { name: 'Task', description: 'Answers the question.' },
                ],
              },
            }),
            writing({ rubric: { criteria: [] } }),
          ],
        },
        ask(['written-response']),
        { newId: counter() },
      ),
    );
    expect(drafts.drafts[0]?.draft.rubric).toEqual({
      criteria: [
        { name: 'Grammar', weight: 1 },
        { name: 'Task', description: 'Answers the question.', weight: 1 },
      ],
    });
    expect(drafts.drafts[0]?.validation).toMatchObject({
      status: 'invalid',
      issues: [expect.objectContaining({ code: 'wr_word_bounds_order' })],
    });
    expect(drafts.drafts[1]?.draft).not.toHaveProperty('rubric');
    expect(drafts.drafts[1]?.validation.status).toBe('complete');
  });

  it('reads only true as right, and leaves a mode it was not given to validateDraft', () => {
    const [one] = read(
      checkAiDrafts(
        {
          drafts: [
            question({
              mode: undefined,
              options: [
                { text: 'Seville', isCorrect: 'yes' },
                { text: 'Madrid', isCorrect: 1 },
              ],
            }),
          ],
        },
        ask(['multiple-choice']),
        { newId: counter() },
      ),
    ).drafts;
    expect(one?.draft).not.toHaveProperty('mode');
    expect(
      (one?.draft.options as { isCorrect: boolean }[]).map((option) => option.isCorrect),
    ).toEqual([false, false]);
    expect(one?.validation.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['mc_mode_required', 'mc_correct_option_required']),
    );
  });

  it('carries the overall feedback a model wrote, and none that is blank', () => {
    const drafts = read(
      checkAiDrafts(
        {
          drafts: [
            question({ feedback: { correct: 'Well read.', incorrect: '  ' } }),
            question({ feedback: { correct: ' ', incorrect: '' } }),
            question({ feedback: 'Well done.' }),
          ],
        },
        ask(['multiple-choice']),
        { newId: counter() },
      ),
    ).drafts;
    expect(drafts[0]?.draft.feedback).toEqual({ correct: 'Well read.' });
    expect(drafts[1]?.draft).not.toHaveProperty('feedback');
    expect(drafts[2]?.draft).not.toHaveProperty('feedback');
  });

  it('places a draft from captions at the end of its caption, and leaves one that names none unplaced', () => {
    const drafts = read(
      checkAiDrafts(
        {
          drafts: [question({ caption: 1 }), question({ caption: 7 }), question({ caption: '1' })],
        },
        onCaptions(['multiple-choice']),
        { newId: counter() },
      ),
    ).drafts;
    expect(drafts.map((one) => one.at)).toEqual([6.5, undefined, undefined]);
    expect(drafts[1]).not.toHaveProperty('at');
  });

  it('gives a dictation from captions the stretch of video that says its words, and none otherwise', () => {
    const drafts = read(
      checkAiDrafts(
        {
          drafts: [
            // Case and punctuation aside, words of caption 1.
            dictation({ caption: 1, transcript: 'She walks to the market!' }),
            // Words the caption it names does not say.
            dictation({ caption: 2, transcript: 'she walks to the market' }),
            dictation({ caption: 1, transcript: '  ' }),
            // Only a dictation is said: a question with a transcript has no clip.
            question({ caption: 1, transcript: 'she walks to the market' }),
          ],
        },
        onCaptions(['dictation', 'multiple-choice']),
        { newId: counter() },
      ),
    ).drafts;
    expect(drafts.map((one) => [one.type, one.clip])).toEqual([
      ['dictation', { start: 3, end: 6.5 }],
      ['dictation', undefined],
      ['dictation', undefined],
      ['multiple-choice', undefined],
    ]);
    const untimed = read(
      checkAiDrafts({ drafts: [dictation()] }, ask(['dictation']), { newId: counter() }),
    ).drafts;
    expect(untimed[0]).not.toHaveProperty('clip');
  });

  it('names a set whose every right option sits in one place', () => {
    const drafts = read(
      checkAiDrafts(
        { drafts: [question(), question(), question(), question()] },
        ask(['multiple-choice'], { count: 4 }),
        { newId: counter() },
      ),
    );
    expect(drafts.findings.map((one) => one.code)).toEqual(['set_key_position_same']);
  });

  it('refuses a reply that is not drafts, or more drafts than asked for — or, with no count, than a reply may hold', () => {
    for (const bad of [
      'drafts',
      { drafts: 'x' },
      { drafts: [null] },
      { drafts: [question(), 3] },
    ]) {
      expect(
        checkAiDrafts(bad, ask(['multiple-choice']), { newId: counter() }),
        JSON.stringify(bad),
      ).toEqual({ ok: false, refusal: 'malformed' });
    }
    expect(
      checkAiDrafts(
        { drafts: [question(), question(), question(), question()] },
        ask(['multiple-choice']),
        { newId: counter() },
      ),
    ).toEqual({ ok: false, refusal: 'too-long' });
    const open = ask(['multiple-choice'], { count: undefined });
    const many = (count: number) =>
      Array.from({ length: count }, (_, at) => question({ title: `Q${at}` }));
    expect(
      checkAiDrafts({ drafts: many(AI_DRAFTS_MAX_COUNT) }, open, { newId: counter() }).ok,
    ).toBe(true);
    expect(
      checkAiDrafts({ drafts: many(AI_DRAFTS_MAX_COUNT + 1) }, open, { newId: counter() }),
    ).toEqual({ ok: false, refusal: 'too-long' });
    expect(checkAiDrafts({ drafts: [] }, ask(['multiple-choice']), { newId: counter() })).toEqual({
      ok: true,
      drafts: { drafts: [], findings: [] },
    });
  });

  it('refuses ids that are empty or repeated, as createDraft does', () => {
    expect(() =>
      checkAiDrafts({ drafts: [question()] }, ask(['multiple-choice']), { newId: () => '' }),
    ).toThrow(/checkAiDrafts: newId\(\) must return a non-empty/);
    expect(() =>
      checkAiDrafts({ drafts: [question()] }, ask(['multiple-choice']), { newId: () => 'same' }),
    ).toThrow(/twice/);
  });
});

describe('aiDraftsRepairRequest', () => {
  const firstPass = (request: AiDraftsRequest) =>
    read(
      checkAiDrafts(
        {
          drafts: [
            question(),
            question({ options: [{ text: 'Seville', isCorrect: true }] }),
            {
              type: 'gap-select',
              title: 'Maria',
              passage: 'She walks {{1}} the market.',
              gaps: [{ choices: [{ text: 'to' }, { text: 'at' }] }],
            },
          ],
        },
        request,
        { newId: counter() },
      ),
    );

  it('sends back only the drafts with something the model can fix, as it wrote them, at the paths it wrote', () => {
    const request = ask(['multiple-choice', 'gap-select']);
    const repair = aiDraftsRepairRequest(request, firstPass(request));
    expect(repair?.repair?.map((one) => one.index)).toEqual([1, 2]);
    expect(repair?.repair?.[0]?.draft).toEqual(
      question({ options: [{ text: 'Seville', isCorrect: true }] }),
    );
    expect(repair?.repair?.[0]?.problems).toEqual([
      expect.objectContaining({
        code: 'mc_options_too_few',
        path: ['options'],
        severity: 'incomplete',
      }),
    ]);
    // A gap's missing key is at its choices, where the model marks it.
    expect(repair?.repair?.[1]?.problems).toEqual([
      expect.objectContaining({
        code: 'gs_correct_choice_required',
        path: ['gaps', '0', 'choices'],
      }),
    ]);
    const drafts = (repair?.shape.properties as Record<string, Record<string, unknown>>).drafts;
    expect([drafts?.minItems, drafts?.maxItems]).toEqual([2, 2]);
    expect(request).not.toHaveProperty('repair');
    expect(aiDraftsRepairRequest(request, [])).toBeNull();
  });

  it('asks again about a complete draft with a warning, not about advice', () => {
    const request = ask(['multiple-choice']);
    const warned = read(
      checkAiDrafts(
        {
          drafts: [
            question({
              options: [
                { text: 'In a small town in the south of Spain', isCorrect: true },
                { text: 'Madrid', isCorrect: false },
                { text: 'Lisbon', isCorrect: false },
              ],
            }),
            question({
              options: [
                { text: 'Seville', isCorrect: true },
                { text: 'Madrid', isCorrect: false },
                { text: 'None of the above', isCorrect: false },
              ],
            }),
          ],
        },
        request,
        { newId: counter() },
      ),
    );
    expect(warned.drafts[1]?.findings.map((one) => one.severity)).toEqual(['advice']);
    expect(aiDraftsRepairRequest(request, warned)?.repair).toEqual([
      expect.objectContaining({
        index: 0,
        problems: [
          expect.objectContaining({
            code: 'mc_key_longest',
            severity: 'warning',
            path: ['options', '0', 'text'],
          }),
        ],
      }),
    ]);
  });

  it('never sends back what only the host can finish: a read-aloud’s recording and scoring', () => {
    const request = ask(['read-aloud'], { locale: 'en-US' });
    const unset = read(checkAiDrafts({ drafts: [reading()] }, request, { newId: counter() }));
    expect(unset.drafts[0]?.validation.status).toBe('incomplete');
    expect(aiDraftsRepairRequest(request, unset)).toBeNull();
    // What the model wrote, it is asked to fix.
    const blank = read(
      checkAiDrafts({ drafts: [reading({ referenceText: '' })] }, request, { newId: counter() }),
    );
    expect(
      aiDraftsRepairRequest(request, blank)?.repair?.[0]?.problems.map((one) => one.code),
    ).toEqual(['ra_reference_text_required']);
    // A text too long for the host's recording time is the model's to shorten.
    const timed = ask(['read-aloud'], { settings: { 'read-aloud': READ_ALOUD } });
    const long = read(
      checkAiDrafts({ drafts: [reading({ referenceText: PASSAGE.repeat(4) })] }, timed, {
        newId: counter(),
      }),
    );
    expect(long.drafts[0]?.findings.map((one) => one.path)).toEqual([['recording', 'maxSeconds']]);
    expect(aiDraftsRepairRequest(timed, long)?.repair?.[0]?.problems).toEqual([
      expect.objectContaining({
        code: 'ra_text_long_for_time',
        path: ['referenceText'],
        severity: 'warning',
      }),
    ]);
  });

  it('reads the repair reply one draft for each, giving each the position it replaces', () => {
    const request = ask(['multiple-choice', 'gap-select']);
    const repair = aiDraftsRepairRequest(request, firstPass(request)) as AiDraftsRequest;
    const checked = read(
      checkAiDrafts({ drafts: [question(), question()] }, repair, { newId: counter() }),
    );
    expect(checked.drafts.map((one) => one.index)).toEqual([1, 2]);
    expect(checkAiDrafts({ drafts: [question()] }, repair, { newId: counter() })).toEqual({
      ok: false,
      refusal: 'malformed',
    });
  });
});

describe('generateDrafts', () => {
  it('repairs what came back unfinished, keeps a repaired draft’s id, and records every call', async () => {
    const port = vi
      .fn()
      .mockResolvedValueOnce({
        drafts: [question(), question({ options: [{ text: 'Seville', isCorrect: true }] })],
        provenance: { model: 'm-1' },
      })
      .mockResolvedValueOnce({
        drafts: [question({ title: 'Fixed' })],
        usage: { completionTokens: 40 },
      });
    const run = await generateDrafts({ request: ask(['multiple-choice']), port, newId: counter() });
    expect(port).toHaveBeenCalledTimes(2);
    expect((port.mock.calls[1]?.[0] as AiDraftsRequest).repair?.map((one) => one.index)).toEqual([
      1,
    ]);
    expect(run.drafts.map((one) => [one.index, one.validation.status, one.draft.title])).toEqual([
      [0, 'complete', 'Maria’s town'],
      [1, 'complete', 'Fixed'],
    ]);
    // The first pass named draft 1 "id-5"; its repair keeps that id and mints only option ids.
    expect(run.drafts[1]?.draft.id).toBe('id-5');
    expect(run.calls).toEqual([
      { ok: true, provenance: { model: 'm-1' } },
      { ok: true, usage: { completionTokens: 40 } },
    ]);
  });

  it('between two drafts of one status, keeps the one with fewer warnings, and the repair when they tie', async () => {
    const longKey = question({
      options: [
        { text: 'In a small town in the south of Spain', isCorrect: true },
        { text: 'Madrid', isCorrect: false },
        { text: 'Lisbon', isCorrect: false },
      ],
    });
    const worse = await generateDrafts({
      request: ask(['multiple-choice']),
      port: vi
        .fn()
        .mockResolvedValueOnce({ drafts: [longKey] })
        .mockResolvedValueOnce({
          drafts: [{ ...longKey, title: 'In a small town in the south of Spain' }],
        }),
      newId: counter(),
    });
    expect(worse.drafts[0]?.draft.title).toBe('Maria’s town');
    const better = await generateDrafts({
      request: ask(['multiple-choice']),
      port: vi
        .fn()
        .mockResolvedValueOnce({ drafts: [longKey] })
        .mockResolvedValueOnce({ drafts: [question({ title: 'Fixed' })] }),
      newId: counter(),
    });
    expect(better.drafts[0]?.draft.title).toBe('Fixed');
    // No worse is enough: the model was asked again, and answered.
    const tied = await generateDrafts({
      request: ask(['multiple-choice']),
      port: vi
        .fn()
        .mockResolvedValueOnce({ drafts: [longKey] })
        .mockResolvedValueOnce({ drafts: [{ ...longKey, title: 'Still long' }] }),
      newId: counter(),
    });
    expect(tied.drafts[0]?.draft.title).toBe('Still long');
    expect(tied.drafts[0]?.findings.map((one) => one.code)).toEqual(['mc_key_longest']);
  });

  it('keeps a draft its repair made worse, and stops when a repair is refused or the port fails', async () => {
    const worse = await generateDrafts({
      request: ask(['multiple-choice']),
      port: vi
        .fn()
        .mockResolvedValueOnce({
          drafts: [question({ options: [{ text: 'Seville', isCorrect: true }] })],
        })
        .mockResolvedValueOnce({
          drafts: [
            question({
              options: [
                { text: 'A', isCorrect: true },
                { text: 'B', isCorrect: true },
              ],
            }),
          ],
        }),
      newId: counter(),
      repairs: 2,
    });
    // Two right options on a single-answer question is invalid: worse than incomplete.
    expect(worse.drafts[0]?.validation.status).toBe('incomplete');
    expect(worse.calls).toHaveLength(3);

    const refused = await generateDrafts({
      request: ask(['multiple-choice']),
      port: vi
        .fn()
        .mockResolvedValueOnce({ drafts: [question({ options: [] })] })
        .mockResolvedValueOnce({ drafts: 'x' }),
      newId: counter(),
      repairs: 3,
    });
    expect(refused.calls).toEqual([{ ok: true }, { ok: false, refusal: 'malformed' }]);

    const failed = await generateDrafts({
      request: ask(['multiple-choice']),
      port: () => {
        throw new Error('503');
      },
      newId: counter(),
    });
    expect(failed).toEqual({ drafts: [], findings: [], calls: [{ ok: false, error: '503' }] });
  });

  it('makes no repair when told not to, or when nothing needs one, and refuses a repair budget out of range', async () => {
    const port = vi.fn(async () => ({ drafts: [question({ options: [] })] }));
    await generateDrafts({ request: ask(['multiple-choice']), port, newId: counter(), repairs: 0 });
    expect(port).toHaveBeenCalledTimes(1);
    const clean = vi.fn(async () => ({ drafts: [question()] }));
    await generateDrafts({
      request: ask(['multiple-choice']),
      port: clean,
      newId: counter(),
      repairs: 3,
    });
    expect(clean).toHaveBeenCalledTimes(1);
    for (const repairs of [-1, 4, 1.5]) {
      await expect(
        generateDrafts({ request: ask(['multiple-choice']), port, newId: counter(), repairs }),
        String(repairs),
      ).rejects.toThrow(RangeError);
    }
  });
});

describe('interactiveVideoFromDrafts', () => {
  const VIDEO = { type: 'video' as const, url: 'https://x.test/market.mp4' };
  const settings = { 'read-aloud': READ_ALOUD };
  type Group = {
    items: { id: string; type: string; title: string }[];
    timeline: { cues: { at?: number; itemIds: string[] }[] };
    stimulus: Record<string, unknown>;
    title?: string;
  };

  it('opens a quiz where each caption ends, those at one moment in the author’s order, and the rest at the end', () => {
    const request = onCaptions(['multiple-choice', 'read-aloud'], { settings });
    const drafts = read(
      checkAiDrafts(
        {
          drafts: [
            reading({ caption: 2 }),
            question({ caption: 2, title: 'At the bread' }),
            question({ caption: 0 }),
            question({ caption: 99, title: 'Nowhere' }),
          ],
        },
        request,
        { newId: counter() },
      ),
    );
    let next = 0;
    const video = interactiveVideoFromDrafts({
      request,
      drafts,
      video: VIDEO,
      durationSeconds: 12,
      title: 'At the market',
      newId: () => {
        next += 1;
        return `v-${next}`;
      },
    });
    const group = video.group as Group;
    const titleOf = (id: string) => group.items.find((item) => item.id === id)?.title;
    expect(group.timeline.cues.map((cue) => [cue.at, cue.itemIds.map(titleOf)])).toEqual([
      [3, ['Maria’s town']],
      [9, ['At the bread', 'Read it aloud']],
      [12, ['Nowhere']],
    ]);
    expect(group.items.map((item) => item.title)).toEqual([
      'Maria’s town',
      'At the bread',
      'Read it aloud',
      'Nowhere',
    ]);
    expect(group.title).toBe('At the market');
    expect(group.stimulus).toMatchObject({
      kind: 'video',
      media: VIDEO,
      transcript: CAPTIONS.map((one) => one.text).join('\n'),
    });
    expect(video.validation.status).toBe('complete');
    expect(video.findings).toEqual([]);
  });

  it('from a script with no times, puts every question in one quiz at the end, in the author’s order', () => {
    const request = ask(['multiple-choice', 'dictation', 'read-aloud'], {
      count: undefined,
      settings,
    });
    const drafts = read(
      checkAiDrafts(
        { drafts: [reading(), dictation(), question(), dictation({ title: 'Again' })] },
        request,
        { newId: counter() },
      ),
    );
    const video = interactiveVideoFromDrafts({
      request,
      drafts,
      video: VIDEO,
      durationSeconds: 95.5,
      newId: counter(),
    });
    const group = video.group as Group;
    expect(group).not.toHaveProperty('title');
    expect(group.timeline.cues).toHaveLength(1);
    expect(group.timeline.cues[0]?.at).toBe(95.5);
    expect(
      group.timeline.cues[0]?.itemIds.map((id) => group.items.find((item) => item.id === id)?.type),
    ).toEqual(['multiple-choice', 'dictation', 'dictation', 'read-aloud']);
    expect(group.stimulus.transcript).toBe(PASSAGE);
    // A dictation in a video needs its own recording: the host's to attach.
    expect(video.validation.issues.map((issue) => issue.code)).toEqual([
      'ig_timeline_dictation_media',
      'ig_timeline_dictation_media',
    ]);
  });

  it('leaves the last quiz without a time when it does not know where the video ends', () => {
    const request = onCaptions(['multiple-choice']);
    const drafts = read(
      checkAiDrafts(
        { drafts: [question({ caption: 99, title: 'Nowhere' }), question({ caption: 0 })] },
        request,
        { newId: counter() },
      ),
    );
    for (const durationSeconds of [undefined, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const video = interactiveVideoFromDrafts({
        request,
        drafts: drafts.drafts,
        video: VIDEO,
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
        newId: counter(),
      });
      const group = video.group as Group;
      const titleOf = (id: string) => group.items.find((item) => item.id === id)?.title;
      // Still last: a quiz with no time is the one at the end.
      expect(
        group.timeline.cues.map((cue) => [cue.at, cue.itemIds.map(titleOf)]),
        String(durationSeconds),
      ).toEqual([
        [3, ['Maria’s town']],
        [undefined, ['Nowhere']],
      ]);
      expect(group.timeline.cues[1]).not.toHaveProperty('at');
      expect(video.validation.issues.map((issue) => issue.code)).toEqual([
        'ig_timeline_quiz_time_required',
      ]);
    }
  });

  it('reports a type a video does not take, and what only the set shows, from a run as well', async () => {
    const request = ask(['written-response', 'multiple-choice'], { count: 5 });
    const run = await generateDrafts({
      request,
      port: async () => ({
        drafts: [
          {
            type: 'written-response',
            title: 'Your town',
            prompt: 'Describe it.',
            minWords: 20,
            maxWords: 60,
          },
          question(),
          question({ title: 'Two' }),
          question({ title: 'Three' }),
          question({ title: 'Four' }),
        ],
      }),
      newId: counter(),
    });
    const video = interactiveVideoFromDrafts({
      request,
      drafts: run,
      video: VIDEO,
      durationSeconds: 60,
      newId: counter(),
    });
    expect(video.validation.issues.map((issue) => issue.code)).toContain('ig_timeline_item_type');
    expect(video.findings.map((one) => one.code)).toEqual(['set_key_position_same']);
  });

  it('refuses ids that are empty or repeated', () => {
    const request = ask(['multiple-choice']);
    const drafts = read(checkAiDrafts({ drafts: [question()] }, request, { newId: counter() }));
    expect(() =>
      interactiveVideoFromDrafts({ request, drafts, video: VIDEO, newId: () => 'same' }),
    ).toThrow(/interactiveVideoFromDrafts: newId\(\) returned "same" twice/);
  });
});
