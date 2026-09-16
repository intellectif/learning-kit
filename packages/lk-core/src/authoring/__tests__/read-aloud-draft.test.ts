import { describe, expect, it } from 'vitest';
import { validateActivity } from '../../schemas/index.js';
import type { DraftValidationResult } from '../../types/authoring.js';
import { validateDraft } from '../index.js';

type Fields = Record<string, unknown>;

const ra = (over: Fields = {}): Fields => ({
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'ra1',
  title: 'Read the weather report aloud',
  referenceText: 'It is not raining in Lisbon today.',
  locale: 'en-US',
  recording: { maxSeconds: 45 },
  scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
  ...over,
});

const model = {
  type: 'audio',
  url: 'https://cdn.example/lisbon-model.mp3',
  alt: 'Model recording, normal speed',
};
const slow = {
  type: 'audio',
  url: 'https://cdn.example/lisbon-model-slow.mp3',
  alt: 'Model recording, slow',
};

/** Characters are built from their numbers so this file stays ASCII in a diff. */
const cp = (...points: number[]): string => String.fromCodePoint(...points);

/** `[code, severity, path]` per issue: the whole contract of a result, in order. */
const summary = (result: DraftValidationResult<unknown>) =>
  result.issues.map((found) => [found.code, found.severity, found.path.join('.')]);

const check = (over: Fields = {}) => summary(validateDraft('read-aloud', ra(over)));

describe('validateDraft: read-aloud', () => {
  it('is complete for a finished item, both recordings and every bound included', () => {
    const full = ra({
      instructions: 'Read it at your natural pace.',
      media: { ...model, playback: { seek: 'none', rate: 'fixed' } },
      slowMedia: slow,
      recording: { maxSeconds: 45, minSeconds: 2, maxTakes: 2 },
      scoring: {
        dimensions: [
          { name: 'accuracy', weight: 2 },
          { name: 'fluency', weight: 1 },
        ],
      },
      passThreshold: 0.6,
      feedback: { correct: 'Clearly read.', incorrect: 'Read it once more.' },
      difficultyLevel: 2,
    });
    expect(validateDraft('read-aloud', full).status).toBe('complete');
    // A model recording is not required: the learner reads the text.
    expect(validateDraft('read-aloud', ra()).status).toBe('complete');
  });

  it('reports a text not written yet as incomplete, and one that cannot be marked as invalid', () => {
    for (const referenceText of [undefined, null, '', '   ']) {
      expect(check({ referenceText })).toEqual([
        ['ra_reference_text_required', 'incomplete', 'referenceText'],
      ]);
    }
    expect(check({ referenceText: 'a'.repeat(2001) })).toEqual([
      ['ra_reference_text_too_long', 'invalid', 'referenceText'],
    ]);
    // Written, and nothing survives normalisation: full stops, em dashes, an
    // inverted question mark, a zero-width space. Nobody can fix any of them by
    // writing more of the same, and only whitespace reads as not written yet.
    for (const referenceText of [
      '...',
      `${cp(0x2014)} ${cp(0x2014)}`,
      cp(0xbf, 0x3f),
      cp(0x200b),
    ]) {
      expect(check({ referenceText })).toEqual([
        ['ra_reference_text_unreadable', 'invalid', 'referenceText'],
      ]);
    }
    // A text too long to normalise is reported as too long, and once.
    expect(check({ referenceText: '.'.repeat(2001) })).toEqual([
      ['ra_reference_text_too_long', 'invalid', 'referenceText'],
    ]);
    expect(check({ referenceText: `Read ${cp(0x4e2d)} aloud` })).toEqual([
      ['ra_reference_text_unspaced_script', 'invalid', 'referenceText'],
    ]);
    // A value of another type is the schema's to refuse.
    expect(check({ referenceText: 42 })).toEqual([['invalid_type', 'invalid', 'referenceText']]);
  });

  it('reports a locale not chosen yet as incomplete, and one that is not canonical as invalid', () => {
    for (const locale of [undefined, null, '', '  ']) {
      expect(check({ locale })).toEqual([['ra_locale_required', 'incomplete', 'locale']]);
    }
    for (const locale of ['en', 'EN-US', 'en_US', 'en-us', 'not a locale']) {
      expect(check({ locale })).toEqual([['ra_locale_invalid', 'invalid', 'locale']]);
    }
    expect(check({ locale: 'es-419' })).toEqual([]);
  });

  it('reports the take bounds: the longest is required, the rest have ranges', () => {
    for (const recording of [undefined, null, {}, { maxSeconds: 0 }, { maxSeconds: null }]) {
      expect(check({ recording })).toEqual([
        ['ra_max_seconds_required', 'incomplete', 'recording.maxSeconds'],
      ]);
    }
    for (const maxSeconds of [-1, 301, Number.NaN]) {
      expect(check({ recording: { maxSeconds } })).toEqual([
        ['ra_max_seconds_out_of_range', 'invalid', 'recording.maxSeconds'],
      ]);
    }
    for (const minSeconds of [-1, 45, 60, Number.NaN]) {
      expect(check({ recording: { maxSeconds: 45, minSeconds } })).toEqual([
        ['ra_min_seconds_out_of_range', 'invalid', 'recording.minSeconds'],
      ]);
    }
    for (const maxTakes of [0, 21, 1.5, 2 ** 53]) {
      expect(check({ recording: { maxSeconds: 45, maxTakes } })).toEqual([
        ['ra_max_takes_out_of_range', 'invalid', 'recording.maxTakes'],
      ]);
    }
    // A `null` the schema refuses in an optional field is `validateDraft`'s.
    expect(check({ recording: { maxSeconds: 45, maxTakes: null } })).toEqual([
      ['null_not_allowed', 'invalid', 'recording.maxTakes'],
    ]);
  });

  it('reports the dimensions: none chosen is incomplete, the rest are invalid', () => {
    for (const scoring of [undefined, null, {}, { dimensions: null }, { dimensions: [] }]) {
      expect(check({ scoring })).toEqual([
        ['ra_dimensions_required', 'incomplete', 'scoring.dimensions'],
      ]);
    }
    for (const name of [undefined, null, '', 'diction']) {
      expect(check({ scoring: { dimensions: [{ name, weight: 1 }] } })).toEqual([
        ['ra_dimension_name_invalid', 'invalid', 'scoring.dimensions.0.name'],
      ]);
    }
    expect(
      check({
        scoring: {
          dimensions: [
            { name: 'accuracy', weight: 1 },
            { name: 'accuracy', weight: 2 },
          ],
        },
      }),
    ).toEqual([['ra_dimension_duplicate', 'invalid', 'scoring.dimensions.1.name']]);
    for (const weight of [undefined, null, -1, 1001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(check({ scoring: { dimensions: [{ name: 'accuracy', weight }] } })).toEqual([
        ['ra_dimension_weight_invalid', 'invalid', 'scoring.dimensions.0.weight'],
      ]);
    }
    expect(
      check({
        scoring: {
          dimensions: [
            { name: 'accuracy', weight: 0 },
            { name: 'fluency', weight: 0 },
          ],
        },
      }),
    ).toEqual([['ra_dimension_weights_zero', 'invalid', 'scoring.dimensions']]);
    // A weight nobody has given leaves the total undecided, so the zero rule waits.
    expect(check({ scoring: { dimensions: [{ name: 'accuracy' }] } })).toEqual([
      ['ra_dimension_weight_invalid', 'invalid', 'scoring.dimensions.0.weight'],
    ]);
    expect(check({ scoring: { dimensions: [null] } })).toEqual([
      ['null_not_allowed', 'invalid', 'scoring.dimensions.0'],
    ]);
  });

  it('refuses a model recording that is not audio', () => {
    expect(check({ media: { type: 'video', url: '/model.mp4' } })).toEqual([
      ['ra_media_kind', 'invalid', 'media.type'],
    ]);
    // An unwritten kind is media_type_required, as for any recording.
    expect(check({ media: { type: '', url: '/model.mp3' } })).toEqual([
      ['media_type_required', 'incomplete', 'media.type'],
    ]);
  });

  it('checks the slow recording under the media codes, plus what it may not accompany', () => {
    for (const media of [undefined, null]) {
      expect(check({ media, slowMedia: slow })).toEqual([
        ['ra_slow_media_without_media', 'incomplete', 'media'],
      ]);
    }
    expect(check({ media: model, slowMedia: { ...slow, url: model.url } })).toEqual([
      ['ra_slow_media_same_recording', 'invalid', 'slowMedia.url'],
    ]);
    expect(check({ media: { ...model, playback: { maxPlays: 2 } }, slowMedia: slow })).toEqual([
      ['ra_slow_media_beside_play_limit', 'invalid', 'slowMedia'],
    ]);
    expect(check({ media: model, slowMedia: { type: 'audio' } })).toEqual([
      ['media_url_required', 'incomplete', 'slowMedia.url'],
    ]);
    expect(check({ media: model, slowMedia: { ...slow, url: 'slow.mp3' } })).toEqual([
      ['media_url_invalid', 'invalid', 'slowMedia.url'],
    ]);
    // Its shape is fixed at type, url and alt: anything else is media_invalid.
    for (const extra of [{ playback: { rate: 'fixed' } }, { captionsUrl: '/slow.vtt' }]) {
      expect(check({ media: model, slowMedia: { ...slow, ...extra } })).toEqual([
        ['media_invalid', 'invalid', 'slowMedia'],
      ]);
    }
    expect(
      check({ media: model, slowMedia: { type: 'image', url: '/slow.png', alt: 'a picture' } }),
    ).toEqual([['media_invalid', 'invalid', 'slowMedia.type']]);
    // And the kind alone: a field that can only ever hold a recording is never
    // asked for the description a picture needs.
    expect(check({ media: model, slowMedia: { type: 'image', url: '/slow.png' } })).toEqual([
      ['media_invalid', 'invalid', 'slowMedia.type'],
    ]);
  });

  it('agrees with validateActivity on everything it calls invalid', () => {
    const invalid = [
      ra({ referenceText: 'a'.repeat(2001) }),
      ra({ referenceText: '...' }),
      ra({ locale: 'en' }),
      ra({ recording: { maxSeconds: 301 } }),
      ra({ scoring: { dimensions: [{ name: 'accuracy', weight: 0 }] } }),
      ra({ media: { type: 'video', url: '/model.mp4' } }),
      ra({ media: model, slowMedia: { ...slow, url: model.url } }),
    ];
    for (const draft of invalid) {
      expect(validateDraft('read-aloud', draft).status).toBe('invalid');
      expect(validateActivity('read-aloud', draft).success).toBe(false);
    }
  });
});
