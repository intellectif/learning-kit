import { describe, expect, it } from 'vitest';
import { ActivitySchemaError } from '../../errors.js';
import { assertRedacted, redact } from '../../redact.js';
import { jsonSchemaFor, readAloudJsonSchema, validateActivity } from '../index.js';

type Fields = Record<string, unknown>;

const base: Fields = {
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'ra-1',
  title: 'Read the weather report aloud',
  referenceText: 'It is not raining in Lisbon today.',
  locale: 'en-US',
  recording: { maxSeconds: 45 },
  scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
};

const ra = (over: Fields = {}): Fields & { type: string } => ({
  ...base,
  ...over,
  type: 'read-aloud',
});

const model: Fields = {
  type: 'audio',
  url: 'https://cdn.example/lisbon-model.mp3',
  alt: 'Model recording, normal speed',
};
const slow: Fields = {
  type: 'audio',
  url: 'https://cdn.example/lisbon-model-slow.mp3',
  alt: 'Model recording, slow',
};

/** `[path, code]` per error: where a rule fired and under which code. */
const problems = (data: unknown): [string, string][] => {
  const result = validateActivity('read-aloud', data);
  return result.success ? [] : result.errors.map((error) => [error.path.join('.'), error.code]);
};

/** Characters are built from their numbers so this file stays ASCII in a diff. */
const cp = (...points: number[]): string => String.fromCodePoint(...points);

describe('ReadAloudDataSchema: the shape', () => {
  it('accepts the smallest item an author can write', () => {
    expect(validateActivity('read-aloud', ra()).success).toBe(true);
  });

  it('accepts a written-out item: instructions, both recordings, bounds, weights, feedback', () => {
    const full = ra({
      instructions: 'Read it at your natural pace.',
      media: { ...model, captionsUrl: '/lisbon.vtt', playback: { seek: 'none', rate: 'fixed' } },
      slowMedia: slow,
      recording: { maxSeconds: 45, minSeconds: 2, maxTakes: 2 },
      scoring: {
        dimensions: [
          { name: 'accuracy', weight: 2 },
          { name: 'fluency', weight: 1 },
          { name: 'completeness', weight: 0 },
          { name: 'prosody', weight: 0 },
        ],
      },
      passThreshold: 0.6,
      feedback: { correct: 'Clearly read.', incorrect: 'Read it once more.' },
      learningObjectives: ['Pronunciation'],
      difficultyLevel: 2,
    });
    expect(problems(full)).toEqual([]);
    // Captions on the model recording are allowed, unlike a dictation's: the
    // text being read is public, so a caption track of it withholds nothing.
  });

  it('is loose, so a consumer sidecar survives validation verbatim', () => {
    const result = validateActivity('read-aloud', ra({ internalNote: 'from the CMS' }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as unknown as Fields).internalNote).toBe('from the CMS');
    }
  });

  it('requires the envelope, the text, the locale, the bounds and the dimensions', () => {
    expect(
      problems({ type: 'read-aloud' })
        .map(([path]) => path)
        .sort(),
    ).toEqual(['id', 'locale', 'recording', 'referenceText', 'schemaVersion', 'scoring', 'title']);
  });
});

describe('ReadAloudDataSchema: the ten guards', () => {
  it('1. bounds the text, before and after normalisation', () => {
    expect(problems(ra({ referenceText: 'a'.repeat(2000) }))).toEqual([]);
    expect(problems(ra({ referenceText: 'a'.repeat(2001) }))).toEqual([
      ['referenceText', 'custom'],
    ]);
  });

  it('2. refuses a script that puts no spaces between its words', () => {
    expect(problems(ra({ referenceText: `Read ${cp(0x4e2d)} aloud` }))).toEqual([
      ['referenceText', 'custom'],
    ]);
    expect(problems(ra({ referenceText: cp(0x3053, 0x3093, 0x306b, 0x3061, 0x306f) }))).toEqual([
      ['referenceText', 'custom'],
    ]);
    // A script that does separate them is fine, digits and punctuation included.
    expect(problems(ra({ referenceText: 'Son las 3, y no llueve.' }))).toEqual([]);
  });

  it('3. refuses a model recording that is not audio', () => {
    expect(problems(ra({ media: { type: 'video', url: '/model.mp4' } }))).toEqual([
      ['media.type', 'custom'],
    ]);
  });

  it('4. refuses a slow recording with no recording to accompany, at `media`', () => {
    expect(problems(ra({ slowMedia: slow }))).toEqual([['media', 'custom']]);
  });

  it('5. refuses a slow recording that is the same file', () => {
    expect(problems(ra({ media: model, slowMedia: { ...slow, url: model.url } }))).toEqual([
      ['slowMedia.url', 'custom'],
    ]);
  });

  it('6. refuses a slow recording beside a play budget', () => {
    expect(
      problems(ra({ media: { ...model, playback: { maxPlays: 2 } }, slowMedia: slow })),
    ).toEqual([['slowMedia', 'custom']]);
  });

  it('7. refuses a dimension weighed twice, at the second one', () => {
    expect(
      problems(
        ra({
          scoring: {
            dimensions: [
              { name: 'accuracy', weight: 1 },
              { name: 'fluency', weight: 1 },
              { name: 'accuracy', weight: 2 },
            ],
          },
        }),
      ),
    ).toEqual([['scoring.dimensions.2.name', 'custom']]);
  });

  it('8. refuses a rubric whose every weight is 0', () => {
    expect(
      problems(
        ra({
          scoring: {
            dimensions: [
              { name: 'accuracy', weight: 0 },
              { name: 'fluency', weight: 0 },
            ],
          },
        }),
      ),
    ).toEqual([['scoring.dimensions', 'custom']]);
  });

  it('9. refuses a shortest take that is not shorter than the longest', () => {
    expect(problems(ra({ recording: { maxSeconds: 45, minSeconds: 45 } }))).toEqual([
      ['recording.minSeconds', 'custom'],
    ]);
    expect(problems(ra({ recording: { maxSeconds: 45, minSeconds: 60 } }))).toEqual([
      ['recording.minSeconds', 'custom'],
    ]);
    expect(problems(ra({ recording: { maxSeconds: 45, minSeconds: 0 } }))).toEqual([]);
  });

  it('10. refuses a text nothing survives of once it is normalised', () => {
    // Full stops, em dashes, an inverted question mark, a zero-width space:
    // written, within the cap, and tokenised into no word at all. The last is
    // not whitespace, so the field rule above accepts it and this guard is what
    // refuses it.
    for (const referenceText of [
      '...',
      `${cp(0x2014)} ${cp(0x2014)}`,
      cp(0xbf, 0x3f),
      cp(0x200b),
    ]) {
      expect(problems(ra({ referenceText }))).toEqual([['referenceText', 'custom']]);
    }
    // A digit is a word: it is read aloud and marked like any other.
    expect(problems(ra({ referenceText: '2001' }))).toEqual([]);
    // A text too long to normalise has no normalised form to be empty, so the
    // two rules report once between them rather than twice.
    expect(problems(ra({ referenceText: '.'.repeat(2001) }))).toEqual([
      ['referenceText', 'custom'],
    ]);
  });

  it('runs its guards even when another field was refused', () => {
    // An ordinary zod check is skipped once any issue exists, which would tell
    // an author about the slow recording only after they had fixed the title.
    expect(problems(ra({ title: '', slowMedia: slow })).sort()).toEqual([
      ['media', 'custom'],
      ['title', 'too_small'],
    ]);
  });

  it('waits for the field a guard reads to parse', () => {
    // `media` is refused outright, so nothing is left for guards 3 to 6 to read:
    // they must not report a missing recording that is merely malformed.
    expect(problems(ra({ media: 'https://cdn.example/model.mp3', slowMedia: slow }))).toEqual([
      ['media', 'invalid_type'],
    ]);
  });
});

describe('ReadAloudDataSchema: the field rules', () => {
  it.each(['en-US', 'es-419', 'zh-Hant-TW', 'fil-PH'])('accepts the canonical tag %s', (locale) => {
    expect(problems(ra({ locale }))).toEqual([]);
  });

  it.each([
    '',
    'en',
    'EN-US',
    'en_US',
    'en-us',
    'en-US-u-ca-gregory',
    'not a locale',
  ])('refuses the tag %s', (locale) => {
    expect(problems(ra({ locale }))).toEqual([['locale', 'invalid_format']]);
  });

  it('refuses a text of nothing but whitespace', () => {
    expect(problems(ra({ referenceText: '   ' }))).toEqual([['referenceText', 'custom']]);
    expect(problems(ra({ referenceText: '' })).map(([path]) => path)).toEqual([
      'referenceText',
      'referenceText',
    ]);
  });

  it('bounds a take: above 0, at most 300 seconds, at most 20 takes', () => {
    expect(problems(ra({ recording: { maxSeconds: 0 } }))).toEqual([
      ['recording.maxSeconds', 'too_small'],
    ]);
    expect(problems(ra({ recording: { maxSeconds: 301 } }))).toEqual([
      ['recording.maxSeconds', 'too_big'],
    ]);
    expect(problems(ra({ recording: { maxSeconds: 45, minSeconds: -1 } }))).toEqual([
      ['recording.minSeconds', 'too_small'],
    ]);
    expect(problems(ra({ recording: { maxSeconds: 45, maxTakes: 21 } }))).toEqual([
      ['recording.maxTakes', 'too_big'],
    ]);
    expect(problems(ra({ recording: { maxSeconds: 45, maxTakes: 1.5 } }))).toEqual([
      ['recording.maxTakes', 'invalid_type'],
    ]);
    expect(problems(ra({ recording: { maxSeconds: 300, minSeconds: 0, maxTakes: 20 } }))).toEqual(
      [],
    );
  });

  it('bounds the dimensions: one to four, known names, weights 0 to 1000', () => {
    expect(problems(ra({ scoring: { dimensions: [] } }))).toEqual([
      ['scoring.dimensions', 'too_small'],
    ]);
    expect(
      problems(
        ra({
          scoring: {
            dimensions: [
              { name: 'accuracy', weight: 1 },
              { name: 'fluency', weight: 1 },
              { name: 'completeness', weight: 1 },
              { name: 'prosody', weight: 1 },
              { name: 'accuracy', weight: 1 },
            ],
          },
        }),
      ).map(([path]) => path),
    ).toContain('scoring.dimensions');
    expect(problems(ra({ scoring: { dimensions: [{ name: 'diction', weight: 1 }] } }))).toEqual([
      ['scoring.dimensions.0.name', 'invalid_value'],
    ]);
    expect(problems(ra({ scoring: { dimensions: [{ name: 'accuracy', weight: 1001 }] } }))).toEqual(
      [['scoring.dimensions.0.weight', 'too_big']],
    );
    expect(problems(ra({ scoring: { dimensions: [{ name: 'accuracy', weight: -1 }] } }))).toEqual([
      ['scoring.dimensions.0.weight', 'too_small'],
    ]);
  });

  it('fixes the slow recording at three fields, so a policy or captions is refused', () => {
    for (const extra of [
      { playback: { rate: 'fixed' } },
      { captionsUrl: '/slow.vtt' },
      { maxPlays: 2 },
    ]) {
      expect(problems(ra({ media: model, slowMedia: { ...slow, ...extra } }))).toEqual([
        ['slowMedia', 'unrecognized_keys'],
      ]);
    }
  });
});

describe('read-aloud redaction', () => {
  const full = ra({
    instructions: 'Read it at your natural pace.',
    media: { ...model, playback: { seek: 'none', rate: 'fixed' } },
    slowMedia: slow,
    recording: { maxSeconds: 45, minSeconds: 2, maxTakes: 2 },
    feedback: { correct: 'Clearly read.', incorrect: 'Read it once more.' },
  });

  it('keeps everything a learner needs and proves it learner-safe', () => {
    const projection = redact(full);
    expect(() => assertRedacted(projection)).not.toThrow();
    expect(projection.referenceText).toBe(base.referenceText);
    expect(projection.locale).toBe('en-US');
    expect(projection.instructions).toBe('Read it at your natural pace.');
    expect(projection.recording).toEqual({ maxSeconds: 45, minSeconds: 2, maxTakes: 2 });
    expect(projection.scoring).toEqual({ dimensions: [{ name: 'accuracy', weight: 1 }] });
    expect(projection.slowMedia).toEqual(slow);
    // Authored feedback is written about a grade that does not exist yet.
    expect(projection).not.toHaveProperty('feedback');
  });

  it('is fail-closed: a key no policy classifies never reaches the learner', () => {
    const projection = redact(
      ra({
        recording: { maxSeconds: 45, graderNote: 'accept regional vowels' },
        scoring: { dimensions: [{ name: 'accuracy', weight: 1, rationale: 'internal' }] },
        internalOnly: 'from the CMS',
      }),
    );
    expect(projection.recording).toEqual({ maxSeconds: 45 });
    expect(projection.scoring).toEqual({ dimensions: [{ name: 'accuracy', weight: 1 }] });
    expect(projection).not.toHaveProperty('internalOnly');
    // And the projection is not an alias of the author's objects.
    expect(projection.recording).not.toBe(full.recording);
  });

  it('cannot have its weights tightened per call: the redacted shape requires them', () => {
    // A written-response rubric can be hidden this way, because its redacted
    // schema leaves it optional. Read-aloud's does not: the learner needs the
    // item to render, so a tightened `scoring` is a projection the schema
    // refuses rather than a projection with one field fewer.
    expect(() => redact(full as never, { policy: { scoring: 'author-only' } })).toThrow(
      ActivitySchemaError,
    );
  });
});

describe('readAloudJsonSchema', () => {
  it('states the structural contract, with the caps zod counts in code points', () => {
    const properties = (
      readAloudJsonSchema as {
        properties?: Record<string, { maxLength?: number; pattern?: string }>;
      }
    ).properties;
    expect(properties?.referenceText?.maxLength).toBe(2000);
    expect(properties?.locale?.pattern).toContain('a-z');
  });

  it('is what jsonSchemaFor returns for the registered type', () => {
    expect(jsonSchemaFor('read-aloud')).toEqual(readAloudJsonSchema);
  });
});
