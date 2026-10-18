import { describe, expect, it } from 'vitest';
import { AI_MATERIAL_MAX_LENGTH, aiExplanationRequest, aiHintRequest, checkAiHint } from '../ai.js';
import { aiWritingFeedbackRequest } from '../ai-writing.js';
import { redactItemGroup } from '../redact.js';
import type {
  FillInTheBlanksData,
  MultipleChoiceData,
  WrittenResponseData,
} from '../types/activity.js';
import type { AiGroupInput, AiHintRequest } from '../types/ai.js';
import type { ItemGroup } from '../types/item-group.js';

/**
 * The material of the group a question sits in, as a model is given it: the
 * passage a reading question is about, or the instructions a run of questions
 * shares. Only what the learner sees reaches a model.
 */

const PASSAGE =
  'Along most coasts the tide comes in twice a day. It is pulled by the moon: as the Earth ' +
  'turns, the ocean nearest the moon bulges towards it.';

const reading: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'tides-1',
  title: 'How often',
  question: 'How often does the tide come in on most coasts?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: 'Twice a day', isCorrect: true },
    { id: 'b', text: 'Once a month', isCorrect: false },
  ],
};

const formation: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'form-1',
  title: 'Word formation 1',
  passage: 'She smiled {{a}} at the news. (HAPPY)',
  blanks: [{ id: 'a', acceptedAnswers: ['happily'] }],
  scoringStrategy: 'all-or-nothing',
};

const summary: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'tides-summary',
  title: 'Summary',
  prompt: 'Summarise the text in two sentences.',
  minWords: 5,
  maxWords: 60,
};

const tides: ItemGroup = {
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'tides',
  title: 'Part 2',
  stimulus: {
    id: 'tides-text',
    kind: 'text',
    title: 'Tides',
    body: PASSAGE,
    locale: 'en-GB',
    attribution: 'Adapted from a public-domain primer',
  },
  items: [reading, summary],
};

const READING_MATERIAL = {
  kind: 'text',
  title: 'Tides',
  text: PASSAGE,
  attribution: 'Adapted from a public-domain primer',
  locale: 'en-GB',
};

const choose = (ids: string[]) => ({ type: 'multiple-choice' as const, selectedOptionIds: ids });

const hintFor = (group: AiGroupInput | undefined): AiHintRequest | null =>
  aiHintRequest({
    data: reading,
    response: choose([]),
    previousHints: [],
    ...(group !== undefined ? { group } : {}),
  });

describe('the material of a grouped question reaches the model', () => {
  it('goes with a hint, an explanation and writing feedback, as the learner sees it', () => {
    expect(hintFor(tides)?.material).toEqual(READING_MATERIAL);
    expect(
      aiExplanationRequest({ data: reading, response: choose(['b']), group: tides })?.material,
    ).toEqual(READING_MATERIAL);
    expect(
      aiWritingFeedbackRequest({
        data: summary,
        response: {
          type: 'written-response',
          text: 'The moon pulls the sea twice a day.',
          wordCount: 8,
        },
        group: tides,
      })?.material,
    ).toEqual(READING_MATERIAL);
  });

  it('sits beside the facts, and changes nothing else in the request', () => {
    const alone = hintFor(undefined);
    const grouped = hintFor(tides);
    expect(alone).not.toBeNull();
    expect(alone).not.toHaveProperty('material');
    const { material, ...rest } = grouped as AiHintRequest;
    expect(material).toBeDefined();
    expect(rest).toEqual(alone);
  });

  it('carries the instructions a run of questions shares', () => {
    const part: AiGroupInput = {
      title: 'Part 1 — Word formation',
      stimulus: {
        id: 'part-1',
        kind: 'text',
        body: 'Use the word in capitals to form a word that fits the gap.',
      },
    };
    const request = aiHintRequest({
      data: formation,
      response: { type: 'fill-in-the-blanks', answers: {} },
      previousHints: [],
      group: part,
    });
    expect(request?.material).toEqual({
      kind: 'text',
      title: 'Part 1 — Word formation',
      text: 'Use the word in capitals to form a word that fits the gap.',
    });
  });

  it("takes the group's title when the material has none, and keeps the material's own when it has one", () => {
    const untitled = { ...tides, stimulus: { ...tides.stimulus, title: '  ' } };
    expect(hintFor(untitled)?.material?.title).toBe('Part 2');
    expect(hintFor(tides)?.material?.title).toBe('Tides');
    const { title: _dropped, ...noTitles } = { ...untitled, stimulus: { ...untitled.stimulus } };
    expect(hintFor(noTitles)?.material).not.toHaveProperty('title');
  });

  it('leaves out empty text, attribution and language', () => {
    const bare: AiGroupInput = {
      stimulus: { id: 's', kind: 'audio', body: ' ', attribution: '', locale: '\n', media: {} },
    };
    expect(hintFor(bare)?.material).toEqual({ kind: 'audio' });
  });
});

describe('what never reaches the model', () => {
  const recording: ItemGroup = {
    schemaVersion: '1.0',
    type: 'item-group',
    id: 'station',
    stimulus: {
      id: 'station-audio',
      kind: 'mixed',
      body: 'Listen to the announcement, then answer.',
      transcript: 'The train to Leeds leaves from platform four.',
      media: {
        type: 'audio',
        url: 'https://media.example.test/announcement.mp3?signature=secret',
        alt: 'A station announcement',
      },
    },
    items: [reading],
  };

  it('never the author-only transcript, and never a media address', () => {
    const material = hintFor(recording)?.material;
    expect(material).toEqual({
      kind: 'mixed',
      text: 'Listen to the announcement, then answer.',
      media: { type: 'audio', alt: 'A station announcement' },
    });
    const sent = JSON.stringify(material);
    expect(sent).not.toContain('Leeds');
    expect(sent).not.toContain('https');
  });

  it('the same material from a whole group and from its redacted projection', () => {
    const redacted = redactItemGroup(recording);
    expect(hintFor(redacted)?.material).toEqual(hintFor(recording)?.material);
    expect(hintFor(redactItemGroup(tides))?.material).toEqual(READING_MATERIAL);
  });

  it('names a recording without alt text by its type alone', () => {
    const plain: AiGroupInput = {
      stimulus: {
        id: 'r',
        kind: 'audio',
        media: { type: 'audio', url: 'https://example.test/a.mp3' },
      },
    };
    const media = hintFor(plain)?.material?.media;
    expect(media).toStrictEqual({ type: 'audio' });
    expect(media).not.toHaveProperty('alt');
  });

  it('an image is described by its alt text, not its address', () => {
    const chart: AiGroupInput = {
      stimulus: {
        id: 'chart',
        kind: 'image',
        media: { type: 'image', url: 'https://example.test/chart.png', alt: 'Rainfall by month' },
      },
    };
    expect(hintFor(chart)?.material).toEqual({
      kind: 'image',
      media: { type: 'image', alt: 'Rainfall by month' },
    });
  });
});

describe('a group it cannot read gives no material, and the request goes as before', () => {
  const alone = hintFor(undefined);
  it.each([
    ['null', null],
    ['a string', 'Part 1'],
    ['an array', [tides.stimulus]],
    ['no stimulus', { title: 'Part 1' }],
    ['a stimulus that is not an object', { stimulus: 'Read the text.' }],
    ['a stimulus that is an array', { stimulus: [] }],
    ['an unknown kind', { stimulus: { kind: 'passage', body: 'Text.' } }],
    ['a kind no stimulus has, found on every object', { stimulus: { kind: 'toString' } }],
    ['no kind', { stimulus: { body: 'Text.' } }],
  ])('%s', (_label, group) => {
    const request = hintFor(group as AiGroupInput);
    expect(request).toEqual(alone);
    expect(request).not.toHaveProperty('material');
  });

  it('media of a type the SDK does not know is left out, and the rest kept', () => {
    const odd: AiGroupInput = {
      stimulus: { kind: 'text', body: 'Read.', media: { type: 'hologram', alt: 'A thing' } },
    };
    expect(hintFor(odd)?.material).toEqual({ kind: 'text', text: 'Read.' });
  });

  it('reads each field once, so a getter cannot hand the check one value and the model another', () => {
    const reads: Record<string, number> = {};
    const counted = (values: Record<string, unknown>) =>
      Object.defineProperties(
        {},
        Object.fromEntries(
          Object.entries(values).map(([key, value]) => [
            key,
            {
              enumerable: true,
              get: () => {
                reads[key] = (reads[key] ?? 0) + 1;
                return value;
              },
            },
          ]),
        ),
      );
    const group = counted({
      title: 'Part 3',
      stimulus: counted({
        kind: 'mixed',
        title: 'Notes',
        body: 'Read the notes.',
        media: counted({ type: 'image', alt: 'Notes on a board' }),
        attribution: 'Staff',
        locale: 'en',
      }),
    });
    expect(hintFor(group as AiGroupInput)?.material).toEqual({
      kind: 'mixed',
      title: 'Notes',
      text: 'Read the notes.',
      media: { type: 'image', alt: 'Notes on a board' },
      attribution: 'Staff',
      locale: 'en',
    });
    expect(Object.values(reads).every((count) => count === 1)).toBe(true);
  });
});

describe('a long text is cut, and says so', () => {
  const withBody = (body: string): AiGroupInput => ({ stimulus: { kind: 'text', body } });
  const materialOf = (body: string) => hintFor(withBody(body))?.material;
  const word = 'tide ';

  it('keeps a text of exactly the limit whole', () => {
    const body = 'a'.repeat(AI_MATERIAL_MAX_LENGTH);
    expect(materialOf(body)).toEqual({ kind: 'text', text: body });
  });

  it('cuts at the limit when the next code point is a space, so the last word stays whole', () => {
    const head = 'b'.repeat(AI_MATERIAL_MAX_LENGTH);
    expect(materialOf(`${head} more`)).toEqual({ kind: 'text', text: head, truncated: true });
  });

  it('keeps a last word that ends exactly at the limit, though an earlier space would do', () => {
    const head = `${'j'.repeat(AI_MATERIAL_MAX_LENGTH - 10)} ${'k'.repeat(9)}`;
    expect([...head].length).toBe(AI_MATERIAL_MAX_LENGTH);
    expect(materialOf(`${head} more`)?.text).toBe(head);
  });

  it('cuts back to the last space rather than break a word', () => {
    const body = word.repeat(AI_MATERIAL_MAX_LENGTH / word.length + 10);
    const material = materialOf(body);
    expect(material?.truncated).toBe(true);
    const text = material?.text as string;
    expect([...text].length).toBeLessThanOrEqual(AI_MATERIAL_MAX_LENGTH);
    expect(text.endsWith('tide')).toBe(true);
    expect(body.startsWith(text)).toBe(true);
    // Only the trailing space of the cut is gone: nothing kept was dropped.
    expect([...text].length).toBe(AI_MATERIAL_MAX_LENGTH - 1);
  });

  it('cuts at a line break as at a space', () => {
    const head = 'f'.repeat(AI_MATERIAL_MAX_LENGTH - 10);
    const body = `${head}\n${'g'.repeat(40)}`;
    expect(materialOf(body)?.text).toBe(head);
  });

  it('drops the run of spaces the cut ends on', () => {
    const head = 'h'.repeat(AI_MATERIAL_MAX_LENGTH - 10);
    const body = `${head}   ${'i'.repeat(40)}`;
    expect(materialOf(body)?.text).toBe(head);
  });

  it('cuts at the limit itself in a text written without spaces', () => {
    const body = '潮'.repeat(AI_MATERIAL_MAX_LENGTH + 50);
    expect(materialOf(body)).toEqual({
      kind: 'text',
      text: '潮'.repeat(AI_MATERIAL_MAX_LENGTH),
      truncated: true,
    });
  });

  it('cuts at the limit when the only space is in the first half, rather than drop most of the text', () => {
    const body = `ab ${'c'.repeat(AI_MATERIAL_MAX_LENGTH)}`;
    const text = materialOf(body)?.text as string;
    expect([...text].length).toBe(AI_MATERIAL_MAX_LENGTH);
  });

  it('uses a space exactly at the halfway point', () => {
    const half = AI_MATERIAL_MAX_LENGTH / 2;
    const body = `${'d'.repeat(half)} ${'e'.repeat(AI_MATERIAL_MAX_LENGTH)}`;
    expect(materialOf(body)?.text).toBe('d'.repeat(half));
  });

  it('counts code points, not UTF-16 units, and never splits a pair', () => {
    const body = '𝔸'.repeat(AI_MATERIAL_MAX_LENGTH);
    expect(body.length).toBe(AI_MATERIAL_MAX_LENGTH * 2);
    expect(materialOf(body)).toEqual({ kind: 'text', text: body });
    const longer = materialOf(`${body}𝔹`)?.text as string;
    expect(longer).toBe(body);
  });
});

describe('the checks still hold with the material in the request', () => {
  it('refuses a hint that quotes the passage where it prints the answer', () => {
    const request = hintFor(tides) as AiHintRequest;
    expect(checkAiHint({ text: 'The text says the tide comes in twice a day.' }, request)).toEqual({
      ok: false,
      refusal: 'reveals-answer',
    });
    expect(checkAiHint({ text: 'Look at the first sentence of the text.' }, request).ok).toBe(true);
  });
});
