import { describe, expect, it } from 'vitest';
import { validateDraft } from '../authoring/index.js';
import { BUILT_IN_ACTIVITY_TYPES } from '../built-in-types.js';
import { canonicalJson } from '../content-hash.js';
import { listMediaRefs, type MediaRef, mapMediaRefs, transcriptOf } from '../media-refs.js';
import { defineActivityType, registerActivityType } from '../registry/index.js';
import { jsonSchemaFor, validateActivity, validateItemGroup } from '../schemas/index.js';
import { stimulusJsonSchema } from '../schemas/json-schema.js';

const CDN = 'https://cdn.example';

/** One valid item of each built-in type, with every media field its type allows filled. */
const ITEMS = {
  'multiple-choice': {
    schemaVersion: '1.0',
    type: 'multiple-choice',
    id: 'mc-1',
    title: 'Which picture?',
    question: 'Which one is a lighthouse?',
    mode: 'single',
    scoringStrategy: 'all-or-nothing',
    media: {
      type: 'video',
      url: `${CDN}/coast.mp4`,
      captionsUrl: `${CDN}/coast.vtt`,
      tracks: [
        { kind: 'captions', src: `${CDN}/coast.en.vtt`, srclang: 'en', label: 'English' },
        { kind: 'subtitles', src: `${CDN}/coast.es.vtt`, srclang: 'es', label: 'Español' },
      ],
      poster: `${CDN}/coast.jpg`,
    },
    options: [
      {
        id: 'a',
        text: 'Picture 1',
        isCorrect: true,
        media: { type: 'image', url: `${CDN}/a.png`, alt: 'Picture 1' },
      },
      {
        id: 'b',
        text: 'Recording 2',
        isCorrect: false,
        media: { type: 'audio', url: `${CDN}/b.mp3`, captionsUrl: `${CDN}/b.vtt` },
      },
      { id: 'c', text: 'Neither', isCorrect: false },
    ],
  },
  'fill-in-the-blanks': {
    schemaVersion: '1.0',
    type: 'fill-in-the-blanks',
    id: 'fib-1',
    title: 'Articles',
    passage: 'We bought {{b1}} lamp.',
    scoringStrategy: 'partial',
    blanks: [{ id: 'b1', acceptedAnswers: ['a'] }],
    media: {
      type: 'audio',
      url: `${CDN}/lamp.mp3`,
      tracks: [{ kind: 'captions', src: `${CDN}/lamp.vtt`, srclang: 'en', label: 'English' }],
    },
  },
  'gap-select': {
    schemaVersion: '1.0',
    type: 'gap-select',
    id: 'gs-1',
    title: 'Prepositions',
    passage: "I'm {{a}} Spain.",
    scoringStrategy: 'partial',
    banks: [
      {
        id: 'p',
        choices: [
          { id: 'from', text: 'from' },
          { id: 'to', text: 'to' },
        ],
      },
    ],
    gaps: [{ id: 'a', bankId: 'p', correctChoiceId: 'from' }],
    media: { type: 'image', url: `${CDN}/map.png`, alt: 'A map of Spain' },
  },
  'written-response': {
    schemaVersion: '1.0',
    type: 'written-response',
    id: 'wr-1',
    title: 'Your weekend',
    prompt: 'Describe the video.',
    minWords: 5,
    maxWords: 60,
    rubric: { criteria: [{ name: 'Task', weight: 1 }] },
    media: { type: 'embed', url: 'https://www.youtube.com/embed/abc', alt: 'A short film' },
  },
  dictation: {
    schemaVersion: '1.0',
    type: 'dictation',
    id: 'dc-1',
    title: 'Listen and type',
    transcript: 'It is raining in Lisbon.',
    media: { type: 'audio', url: `${CDN}/lisbon.mp3` },
    slowMedia: { type: 'audio', url: `${CDN}/lisbon-slow.mp3` },
  },
  'read-aloud': {
    schemaVersion: '1.0',
    type: 'read-aloud',
    id: 'ra-1',
    title: 'Read aloud',
    referenceText: 'the cat sat on the mat',
    locale: 'en-US',
    recording: { maxSeconds: 30 },
    scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
    media: { type: 'audio', url: `${CDN}/cat.mp3` },
    slowMedia: { type: 'audio', url: `${CDN}/cat-slow.mp3` },
  },
} as const;

const GROUP = {
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'part-1',
  title: 'Listening, part 1',
  stimulus: {
    id: 'st-1',
    kind: 'video',
    media: {
      type: 'video',
      url: `${CDN}/interview.mp4`,
      tracks: [{ kind: 'captions', src: `${CDN}/interview.vtt`, srclang: 'en', label: 'English' }],
      poster: `${CDN}/interview.jpg`,
    },
    transcript: 'Anna: Hello. Ben: Hi.',
  },
  items: [ITEMS['multiple-choice'], ITEMS['fill-in-the-blanks']],
} as const;

/** A path with its indexes replaced by `[]`: the field, wherever the list put it. */
const pattern = (path: readonly (string | number)[]) =>
  path.map((key) => (typeof key === 'number' ? '[]' : key)).join('.');

const MEDIA_URL_PATTERN = '^\\/(?!\\/)\\S*$';

/** Every field a JSON Schema checks with the media URL rule, as a pattern. */
function urlFieldsOf(schema: unknown, at: string[] = []): string[] {
  if (typeof schema !== 'object' || schema === null) {
    return [];
  }
  const node = schema as Record<string, unknown>;
  const branches = Array.isArray(node.anyOf) ? node.anyOf : [];
  if (branches.some((branch) => (branch as { pattern?: string }).pattern === MEDIA_URL_PATTERN)) {
    return [at.join('.')];
  }
  const found: string[] = [];
  for (const [key, child] of Object.entries((node.properties ?? {}) as Record<string, unknown>)) {
    found.push(...urlFieldsOf(child, [...at, key]));
  }
  if (node.items !== undefined) {
    found.push(...urlFieldsOf(node.items, [...at, '[]']));
  }
  for (const branch of [
    ...branches,
    ...((node.allOf as unknown[]) ?? []),
    ...((node.oneOf as unknown[]) ?? []),
  ]) {
    found.push(...urlFieldsOf(branch, at));
  }
  return found;
}

describe('listMediaRefs', () => {
  it('reads every media field each built-in schema checks, and no other', () => {
    // Complete by construction: the fields come from the published JSON Schema,
    // so a media field added to a schema fails here until the walker reads it.
    // Each is probed alone, set on an item of its type, since no one valid item
    // can hold them all (a poster is for video, a dictation has no captions).
    const probe = (base: unknown, field: string) => {
      const item = structuredClone(base) as Record<string, unknown>;
      const keys = field.split('.');
      let at: Record<string, unknown> | unknown[] = item;
      keys.forEach((key, index) => {
        const last = index === keys.length - 1;
        const slot = key === '[]' ? 0 : key;
        const container = at as Record<string | number, unknown>;
        if (last) {
          container[slot] = `/probe/${field}`;
          return;
        }
        if (typeof container[slot] !== 'object' || container[slot] === null) {
          container[slot] = keys[index + 1] === '[]' ? [] : { type: 'audio' };
        }
        at = container[slot] as Record<string, unknown>;
      });
      return item;
    };
    const check = (base: unknown, fields: string[], prefix: string) => {
      expect(fields.length, prefix).toBeGreaterThan(0);
      for (const field of fields) {
        const found = listMediaRefs(probe(base, `${prefix}${field}`)).some(
          (ref) =>
            pattern(ref.path) === `${prefix}${field}` && ref.url === `/probe/${prefix}${field}`,
        );
        expect(found, `${prefix}${field}`).toBe(true);
      }
    };
    for (const type of BUILT_IN_ACTIVITY_TYPES) {
      const fromSchema = urlFieldsOf(jsonSchemaFor(type));
      check(ITEMS[type], fromSchema, '');
      // And nothing the schema does not have: every walked field is one of its own.
      const walked = listMediaRefs(ITEMS[type]).map((ref) => pattern(ref.path));
      expect(
        walked.filter((field) => !fromSchema.includes(field)),
        type,
      ).toEqual([]);
    }
    check(GROUP, urlFieldsOf(stimulusJsonSchema), 'stimulus.');
  });

  it('names each file, its kind, its owner and its language', () => {
    const refs = listMediaRefs(ITEMS['multiple-choice']);
    expect(refs.map((ref) => [pattern(ref.path), ref.kind, ref.url])).toEqual([
      ['media.url', 'video', `${CDN}/coast.mp4`],
      ['media.captionsUrl', 'captions', `${CDN}/coast.vtt`],
      ['media.tracks.[].src', 'track', `${CDN}/coast.en.vtt`],
      ['media.tracks.[].src', 'track', `${CDN}/coast.es.vtt`],
      ['media.poster', 'poster', `${CDN}/coast.jpg`],
      ['options.[].media.url', 'image', `${CDN}/a.png`],
      ['options.[].media.url', 'audio', `${CDN}/b.mp3`],
      ['options.[].media.captionsUrl', 'captions', `${CDN}/b.vtt`],
    ]);
    expect(refs.every((ref) => ref.activityId === 'mc-1')).toBe(true);
    expect(refs.filter((ref) => ref.kind === 'track').map((ref) => ref.srclang)).toEqual([
      'en',
      'es',
    ]);
    expect(refs[5]?.path).toEqual(['options', 0, 'media', 'url']);
    expect(refs[6]?.holder).toBe(ITEMS['multiple-choice'].options[1].media);
  });

  it('reads a group: its stimulus first, then each item under its index', () => {
    const refs = listMediaRefs(GROUP);
    expect(refs[0]).toMatchObject({
      path: ['stimulus', 'media', 'url'],
      kind: 'video',
      stimulusId: 'st-1',
    });
    expect(refs[0]).not.toHaveProperty('activityId');
    const firstItem = refs.find((ref) => ref.path[0] === 'items');
    expect(firstItem).toMatchObject({ path: ['items', 0, 'media', 'url'], activityId: 'mc-1' });
    expect(refs.at(-1)).toMatchObject({
      path: ['items', 1, 'media', 'tracks', 0, 'src'],
      activityId: 'fib-1',
    });
  });

  it('lists a recording with no file yet as an empty slot, and leaves out what names no kind', () => {
    const draft = {
      type: 'multiple-choice',
      id: 'v2-1',
      media: { type: 'audio', transcript: 'The 9:15 leaves from platform four.' },
      options: [{ id: 'a', media: { url: `${CDN}/x.png` } }, 'not an option'],
    };
    expect(listMediaRefs(draft)).toEqual([
      { path: ['media', 'url'], kind: 'audio', url: null, holder: draft.media, activityId: 'v2-1' },
    ]);
  });

  it('reads nothing from what is not content', () => {
    expect(listMediaRefs(null)).toEqual([]);
    expect(listMediaRefs('a string')).toEqual([]);
    expect(listMediaRefs([ITEMS.dictation])).toEqual([]);
    expect(listMediaRefs({ type: 'item-group', stimulus: 'x', items: 'y' })).toEqual([]);
  });

  it('reads an unregistered type’s media, and a registered type’s declared slots', () => {
    expect(
      listMediaRefs({ type: 'not-registered', media: { type: 'image', url: '/x.png' } }),
    ).toHaveLength(1);
    registerActivityType(
      defineActivityType<{ type: 'media-slots-probe'; clips: { file: string }[] }, unknown>({
        type: 'media-slots-probe',
        schema: {
          '~standard': {
            version: 1,
            vendor: 'test',
            validate: (value) => ({
              value: value as { type: 'media-slots-probe'; clips: { file: string }[] },
            }),
          },
        },
        scoring: {
          kind: 'sync',
          score: () => ({ score: 0, maxScore: 1, correct: false }) as never,
        },
        mediaSlots: (data) =>
          (Array.isArray(data.clips) ? data.clips : []).map((_, index) => ({
            path: ['clips', index],
            kind: 'audio',
          })),
      }),
    );
    const probe = {
      type: 'media-slots-probe',
      id: 'p',
      clips: [{ url: '/one.mp3' }, { url: '/two.mp3' }],
    };
    expect(listMediaRefs(probe).map((ref) => [ref.path, ref.kind, ref.url])).toEqual([
      [['clips', 0, 'url'], 'audio', '/one.mp3'],
      [['clips', 1, 'url'], 'audio', '/two.mp3'],
    ]);
  });
});

describe('mapMediaRefs', () => {
  const everything = [...Object.values(ITEMS), GROUP];

  it('with the identity, returns a deep-equal copy and never the input', () => {
    for (const entry of everything) {
      const copy = mapMediaRefs(entry, (ref) => ref.url);
      expect(copy).toEqual(entry);
      expect(copy).not.toBe(entry);
      expect(canonicalJson(copy)).toBe(canonicalJson(entry));
    }
  });

  it('re-points every address, changes nothing else, and leaves the input alone', () => {
    for (const entry of everything) {
      const before = canonicalJson(entry);
      const moved = mapMediaRefs(entry, (ref) => (ref.url ?? '').replace(CDN, '/exam/v2'));
      expect(canonicalJson(entry)).toBe(before);
      expect(
        listMediaRefs(moved).every(
          (ref) => ref.url?.startsWith('/exam/v2') || ref.url?.startsWith('https://www.youtube'),
        ),
      ).toBe(true);
      // Put back, the copy is the original: only addresses moved.
      expect(mapMediaRefs(moved, (ref) => (ref.url ?? '').replace('/exam/v2', CDN))).toEqual(entry);
    }
  });

  it('keeps every item valid when the new addresses follow the media rule', () => {
    for (const item of Object.values(ITEMS)) {
      expect(validateActivity(item.type, item).success, item.type).toBe(true);
      const moved = mapMediaRefs(item, (ref) => (ref.url ?? '').replace(CDN, '/exam/v2'));
      expect(validateActivity(item.type, moved).success, item.type).toBe(true);
      expect(validateDraft(item.type, moved).status, item.type).toBe('complete');
    }
    expect(validateItemGroup(GROUP).success).toBe(true);
    expect(
      validateItemGroup(mapMediaRefs(GROUP, (ref) => (ref.url ?? '').replace(CDN, '/exam/v2')))
        .success,
    ).toBe(true);
  });

  it('fills an empty recording slot, and leaves one empty on null', () => {
    const draft = { type: 'dictation', id: 'd', transcript: 'Hi.', media: { type: 'audio' } };
    expect(mapMediaRefs(draft, () => null)).toEqual(draft);
    const filled = mapMediaRefs(draft, (ref: MediaRef) =>
      ref.url === null ? '/voice/d.mp3' : ref.url,
    );
    expect(filled.media).toEqual({ type: 'audio', url: '/voice/d.mp3' });
    expect(draft.media).toEqual({ type: 'audio' });
  });

  it('refuses to remove a file, or an answer that is not an address', () => {
    expect(() => mapMediaRefs(ITEMS.dictation, () => null)).toThrow(TypeError);
    expect(() => mapMediaRefs(ITEMS.dictation, () => 42 as never)).toThrow(TypeError);
    const circular: Record<string, unknown> = {
      type: 'dictation',
      media: { type: 'audio', url: '/a.mp3' },
    };
    circular.self = circular;
    expect(() => mapMediaRefs(circular, (ref) => ref.url)).toThrow(TypeError);
  });
});

describe('transcriptOf', () => {
  it('reads a transcript, else a script as speaker lines, else nothing', () => {
    expect(transcriptOf({ type: 'audio', url: '/a.mp3', transcript: 'Hello there.' })).toBe(
      'Hello there.',
    );
    expect(
      transcriptOf({
        type: 'audio',
        url: '/a.mp3',
        script: [
          { speaker: ' Anna ', text: 'Hello. ' },
          { speaker: 'Ben', text: '   ' },
          { speaker: 'Ben', text: 'Hi, Anna.' },
        ],
      }),
    ).toBe('Anna: Hello.\nBen: Hi, Anna.');
    expect(transcriptOf({ type: 'audio', url: '/a.mp3', transcript: '  ' })).toBeNull();
    expect(transcriptOf({ type: 'audio', url: '/a.mp3' })).toBeNull();
    expect(transcriptOf(null)).toBeNull();
  });

  it('reads a stimulus or an activity first, then its media', () => {
    expect(transcriptOf(GROUP.stimulus)).toBe('Anna: Hello. Ben: Hi.');
    expect(
      transcriptOf({
        id: 's',
        kind: 'audio',
        media: { type: 'audio', url: '/a.mp3', transcript: 'From the media.' },
      }),
    ).toBe('From the media.');
    expect(
      transcriptOf({
        ...ITEMS['multiple-choice'],
        media: { type: 'audio', url: '/a.mp3', transcript: 'Q audio.' },
      }),
    ).toBe('Q audio.');
    // A dictation's own transcript is what its recording says.
    expect(transcriptOf(ITEMS.dictation)).toBe('It is raining in Lisbon.');
  });
});
