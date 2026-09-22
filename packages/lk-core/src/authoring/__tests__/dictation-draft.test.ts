import { describe, expect, it } from 'vitest';
import { validateActivity } from '../../schemas/index.js';
import type { DraftValidationResult } from '../../types/authoring.js';
import { validateDraft } from '../index.js';

type Fields = Record<string, unknown>;

const dc = (over: Fields = {}): Fields => ({
  schemaVersion: '1.0',
  type: 'dictation',
  id: 'dc1',
  title: 'Listen and type the sentence',
  transcript: "It isn't raining in Lisbon today.",
  media: { type: 'audio', url: 'https://cdn.example/lisbon.mp3', alt: 'Recording' },
  ...over,
});

const slow = { type: 'audio', url: 'https://cdn.example/lisbon-slow.mp3', alt: 'Recording, slow' };

/** `[code, severity, path]` per issue: the whole contract of a result, in order. */
const summary = (result: DraftValidationResult<unknown>) =>
  result.issues.map((found) => [found.code, found.severity, found.path.join('.')]);

describe('validateDraft: dictation', () => {
  it('is complete for a finished item, recordings, hints, rules and alternatives included', () => {
    const full = dc({
      acceptedTranscripts: ["It isn't raining in Lisboa today."],
      slowMedia: slow,
      hints: { mode: 'progressive-words' },
      tolerance: { equivalences: [{ from: "isn't", to: 'is not' }] },
      feedback: { correct: 'Well heard.', incorrect: 'Once more.' },
    });
    expect(validateDraft('dictation', full).status).toBe('complete');
    expect(validateDraft('dictation', dc({ media: undefined })).status).toBe('complete');
  });

  it('reports a transcript not written yet as incomplete, and one nothing survives of as invalid', () => {
    for (const transcript of [undefined, null, '', '   ']) {
      expect(summary(validateDraft('dictation', dc({ transcript })))).toEqual([
        ['dc_transcript_required', 'incomplete', 'transcript'],
      ]);
    }
    expect(summary(validateDraft('dictation', dc({ transcript: '... ¿?' })))).toEqual([
      ['dc_transcript_unscorable', 'invalid', 'transcript'],
    ]);
    expect(summary(validateDraft('dictation', dc({ transcript: 'a'.repeat(2001) })))).toEqual([
      ['dc_transcript_too_long', 'invalid', 'transcript'],
    ]);
    // Over the cap only once its rules are applied.
    expect(
      summary(
        validateDraft(
          'dictation',
          dc({
            transcript: '& '.repeat(1000),
            tolerance: { equivalences: [{ from: '&', to: 'and' }] },
          }),
        ),
      ),
    ).toEqual([['dc_transcript_too_long', 'invalid', 'transcript']]);
    // A value of another type is the schema's to refuse.
    expect(summary(validateDraft('dictation', dc({ transcript: 42 })))).toEqual([
      ['invalid_type', 'invalid', 'transcript'],
    ]);
  });

  it('checks every accepted transcript, and the set of them', () => {
    expect(
      summary(validateDraft('dictation', dc({ acceptedTranscripts: ['', '  ', 'A sentence.'] }))),
    ).toEqual([
      ['dc_accepted_transcript_empty', 'incomplete', 'acceptedTranscripts.0'],
      ['dc_accepted_transcript_empty', 'incomplete', 'acceptedTranscripts.1'],
    ]);
    expect(
      summary(validateDraft('dictation', dc({ acceptedTranscripts: ['b'.repeat(2001)] }))),
    ).toEqual([['dc_accepted_transcript_too_long', 'invalid', 'acceptedTranscripts.0']]);
    expect(
      summary(
        validateDraft(
          'dictation',
          dc({ acceptedTranscripts: ["it isn't raining in lisbon today", 'Two.', 'two'] }),
        ),
      ),
    ).toEqual([['dc_accepted_transcript_duplicate', 'invalid', 'acceptedTranscripts']]);
    expect(
      summary(
        validateDraft(
          'dictation',
          dc({ acceptedTranscripts: Array.from({ length: 11 }, (_, i) => `Sentence ${i}`) }),
        ),
      ),
    ).toEqual([['dc_accepted_transcripts_too_many', 'invalid', 'acceptedTranscripts']]);
    // A null entry is the null rule's; a non-string entry is the schema's.
    expect(summary(validateDraft('dictation', dc({ acceptedTranscripts: ['ok', null] })))).toEqual([
      ['null_not_allowed', 'invalid', 'acceptedTranscripts.1'],
    ]);
    expect(validateDraft('dictation', dc({ acceptedTranscripts: 'not a list' })).status).toBe(
      'invalid',
    );
  });

  it('refuses a recording that is not audio, and captions on either recording', () => {
    expect(
      summary(validateDraft('dictation', dc({ media: { type: 'video', url: '/a.mp4' } }))),
    ).toEqual([['dc_media_kind', 'invalid', 'media.type']]);
    expect(
      summary(
        validateDraft(
          'dictation',
          dc({ media: { type: 'audio', url: '/a.mp3', captionsUrl: '/a.vtt' } }),
        ),
      ),
    ).toEqual([['dc_captions_not_allowed', 'invalid', 'media.captionsUrl']]);
    expect(
      summary(validateDraft('dictation', dc({ slowMedia: { ...slow, captionsUrl: '/a.vtt' } }))),
    ).toEqual([['dc_captions_not_allowed', 'invalid', 'slowMedia.captionsUrl']]);
    // A track counts as soon as it has an entry, whatever its kind or language.
    const track = { kind: 'subtitles', src: '/a.es.vtt', srclang: 'es', label: 'Español' };
    expect(
      summary(
        validateDraft(
          'dictation',
          dc({ media: { type: 'audio', url: '/a.mp3', tracks: [track] } }),
        ),
      ),
    ).toEqual([['dc_captions_not_allowed', 'invalid', 'media.tracks']]);
    expect(
      summary(validateDraft('dictation', dc({ slowMedia: { ...slow, tracks: [track] } }))),
    ).toEqual([['dc_captions_not_allowed', 'invalid', 'slowMedia.tracks']]);
    // An unwritten kind is media_type_required, as for any recording.
    expect(summary(validateDraft('dictation', dc({ media: { type: '', url: '/a.mp3' } })))).toEqual(
      [['media_type_required', 'incomplete', 'media.type']],
    );
  });

  it('checks the slow recording under the media codes, plus what it may not have', () => {
    expect(
      summary(validateDraft('dictation', dc({ slowMedia: { type: 'image', url: '/a.png' } }))),
    ).toEqual([['dc_slow_media_kind', 'invalid', 'slowMedia.type']]);
    // The wrong kind AND no address: both, each under its own code, once.
    expect(summary(validateDraft('dictation', dc({ slowMedia: { type: 'image' } })))).toEqual([
      ['dc_slow_media_kind', 'invalid', 'slowMedia.type'],
      ['media_url_required', 'incomplete', 'slowMedia.url'],
    ]);
    expect(summary(validateDraft('dictation', dc({ slowMedia: { type: 'audio' } })))).toEqual([
      ['media_url_required', 'incomplete', 'slowMedia.url'],
    ]);
    expect(
      summary(validateDraft('dictation', dc({ slowMedia: { type: 'audio', url: 'slow.mp3' } }))),
    ).toEqual([['media_url_invalid', 'invalid', 'slowMedia.url']]);
    expect(
      summary(
        validateDraft('dictation', dc({ slowMedia: { ...slow, playback: { rate: 'fixed' } } })),
      ),
    ).toEqual([['dc_slow_media_playback', 'invalid', 'slowMedia.playback']]);
    expect(
      summary(
        validateDraft(
          'dictation',
          dc({
            media: { type: 'audio', url: '/a.mp3', playback: { maxPlays: 2 } },
            slowMedia: slow,
          }),
        ),
      ),
    ).toEqual([['dc_slow_media_unbudgeted', 'invalid', 'slowMedia']]);
    expect(
      summary(
        validateDraft(
          'dictation',
          dc({ slowMedia: { ...slow, url: 'https://cdn.example/lisbon.mp3' } }),
        ),
      ),
    ).toEqual([['dc_slow_media_same_url', 'invalid', 'slowMedia.url']]);
    for (const media of [undefined, null]) {
      expect(summary(validateDraft('dictation', dc({ media, slowMedia: slow })))).toEqual([
        ['dc_slow_media_without_media', 'incomplete', 'media'],
      ]);
    }
    // A recording of another shape entirely is the schema's to refuse; the slow
    // recording is not blamed for it.
    expect(summary(validateDraft('dictation', dc({ media: 'nope', slowMedia: slow })))).toEqual([
      ['invalid_type', 'invalid', 'media'],
    ]);
  });

  it('refuses a title or a recording description that gives the transcript away', () => {
    expect(
      summary(validateDraft('dictation', dc({ title: "Type: it isn't raining in Lisbon today" }))),
    ).toEqual([['dc_transcript_revealed', 'invalid', 'title']]);
    expect(
      summary(
        validateDraft(
          'dictation',
          dc({
            acceptedTranscripts: ['A cat sat.'],
            media: { type: 'audio', url: '/a.mp3', alt: 'a cat sat' },
          }),
        ),
      ),
    ).toEqual([['dc_transcript_revealed', 'invalid', 'media.alt']]);
    expect(
      summary(
        validateDraft(
          'dictation',
          dc({ slowMedia: { ...slow, alt: "Slowly: it isn't raining in Lisbon today" } }),
        ),
      ),
    ).toEqual([['dc_transcript_revealed', 'invalid', 'slowMedia.alt']]);
    // Sharing a word is not revealing the sentence.
    expect(validateDraft('dictation', dc({ title: 'Raining in Lisbon' })).status).toBe('complete');
  });

  it('checks the hint mode', () => {
    for (const mode of [undefined, null, '']) {
      expect(summary(validateDraft('dictation', dc({ hints: { mode } })))).toEqual([
        ['dc_hints_mode_required', 'incomplete', 'hints.mode'],
      ]);
    }
    expect(summary(validateDraft('dictation', dc({ hints: { mode: 'all-at-once' } })))).toEqual([
      ['dc_hints_mode_invalid', 'invalid', 'hints.mode'],
    ]);
    expect(summary(validateDraft('dictation', dc({ hints: null })))).toEqual([
      ['null_not_allowed', 'invalid', 'hints'],
    ]);
  });

  it('checks each rule, and leaves what else the schema refuses to one code', () => {
    const rules = (equivalences: unknown) => dc({ tolerance: { equivalences } });
    expect(summary(validateDraft('dictation', rules([{ from: '', to: 'x' }])))).toEqual([
      ['dc_equivalence_from_required', 'incomplete', 'tolerance.equivalences.0.from'],
    ]);
    for (const from of [undefined, null, '   ']) {
      expect(summary(validateDraft('dictation', rules([{ from, to: 'x' }])))).toEqual([
        ['dc_equivalence_from_required', 'incomplete', 'tolerance.equivalences.0.from'],
      ]);
    }
    for (const to of [undefined, null, '', '...']) {
      expect(summary(validateDraft('dictation', rules([{ from: 'x', to }])))).toEqual([
        ['dc_equivalence_to_required', 'incomplete', 'tolerance.equivalences.0.to'],
      ]);
    }
    // A symbol is a legitimate `from`: punctuation is only removed after the rules run.
    expect(validateDraft('dictation', rules([{ from: '&', to: 'and' }])).status).toBe('complete');
    expect(
      summary(validateDraft('dictation', rules([{ from: 'x', to: 'y'.repeat(201) }]))),
    ).toEqual([['dc_tolerance_invalid', 'invalid', 'tolerance.equivalences.0.to']]);
    expect(summary(validateDraft('dictation', rules('not a list')))).toEqual([
      ['dc_tolerance_invalid', 'invalid', 'tolerance.equivalences'],
    ]);
    expect(summary(validateDraft('dictation', rules([null])))).toEqual([
      ['null_not_allowed', 'invalid', 'tolerance.equivalences.0'],
    ]);
    expect(summary(validateDraft('dictation', dc({ tolerance: null })))).toEqual([
      ['null_not_allowed', 'invalid', 'tolerance'],
    ]);
    expect(validateDraft('dictation', dc({ tolerance: {} })).status).toBe('complete');
  });

  it('agrees with validateActivity on everything it calls invalid', () => {
    const invalid = [
      dc({ transcript: '...' }),
      dc({ media: { type: 'video', url: '/a.mp4' } }),
      dc({ slowMedia: { ...slow, playback: {} } }),
      dc({ title: "it isn't raining in lisbon today" }),
    ];
    for (const draft of invalid) {
      expect(validateDraft('dictation', draft).status).toBe('invalid');
      expect(validateActivity('dictation', draft).success).toBe(false);
    }
  });
});
