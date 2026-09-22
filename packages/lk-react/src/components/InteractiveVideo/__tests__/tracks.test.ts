import type { MediaTrack } from '@intellectif/lk-core';
import { describe, expect, it } from 'vitest';
import { repeatedly, slowdown } from '../../../test-support/timing.js';
import { pairSecondaryCues, resolveCaptionTracks, secondaryCandidates } from '../tracks.js';
import type { Cue } from '../vtt.js';

/**
 * Which track each caption line shows. The first line always shows something
 * while there are tracks; the second only what the learner asked for — a second
 * line nobody chose must never appear.
 */

const track = (srclang: string, over: Partial<MediaTrack> = {}): MediaTrack => ({
  kind: 'subtitles',
  src: `/${srclang}.vtt`,
  srclang,
  label: srclang,
  ...over,
});

const en = track('en', { kind: 'captions', default: true, label: 'English' });
const es = track('es', { label: 'Español' });
const ptBR = track('pt-BR', { label: 'Português' });
const ar = track('ar', { label: 'العربية' });
const tracks = [en, es, ptBR, ar];

const choose = (captionLanguage: string | null, secondaryCaptionLanguage: string | null = null) =>
  resolveCaptionTracks(tracks, { captionLanguage, secondaryCaptionLanguage });

describe('resolveCaptionTracks: the first line', () => {
  it('shows the language chosen, whatever its case', () => {
    expect(choose('es').primary).toBe(es);
    expect(choose('ES').primary).toBe(es);
  });

  it('finds a regional track from its language, and a language from a regional tag', () => {
    expect(choose('pt').primary).toBe(ptBR);
    expect(
      resolveCaptionTracks([en, track('es-419')], {
        captionLanguage: 'es',
        secondaryCaptionLanguage: null,
      }).primary?.srclang,
    ).toBe('es-419');
    expect(
      resolveCaptionTracks([en, es], { captionLanguage: 'es-MX', secondaryCaptionLanguage: null })
        .primary,
    ).toBe(es);
  });

  it('falls back to the default track, then the first', () => {
    expect(choose(null).primary).toBe(en);
    expect(choose('ja').primary).toBe(en);
    expect(
      resolveCaptionTracks([es, ar], { captionLanguage: 'ja', secondaryCaptionLanguage: null })
        .primary,
    ).toBe(es);
  });

  it('prefers captions to subtitles in one language', () => {
    const subtitles = track('en');
    const captions = track('en', { kind: 'captions', src: '/en-cc.vtt' });
    expect(
      resolveCaptionTracks([subtitles, captions], {
        captionLanguage: 'en',
        secondaryCaptionLanguage: null,
      }).primary,
    ).toBe(captions);
  });

  it('ignores kinds a player does not draw, and answers nothing without tracks', () => {
    const chapters = { ...es, kind: 'chapters' } as unknown as MediaTrack;
    expect(
      resolveCaptionTracks([chapters], { captionLanguage: 'es', secondaryCaptionLanguage: null }),
    ).toEqual({});
    expect(
      resolveCaptionTracks([], { captionLanguage: null, secondaryCaptionLanguage: 'es' }),
    ).toEqual({});
  });
});

describe('resolveCaptionTracks: the second line', () => {
  it('shows the second language chosen, under the first', () => {
    expect(choose('en', 'es')).toEqual({ primary: en, secondary: es });
    expect(choose('es', 'en')).toEqual({ primary: es, secondary: en });
    expect(choose('en', 'pt')).toEqual({ primary: en, secondary: ptBR });
  });

  it('never falls back: a language the video lacks is no second line at all', () => {
    expect(choose('en', 'ja').secondary).toBeUndefined();
    expect(choose('en', null).secondary).toBeUndefined();
  });

  it('needs two tracks', () => {
    expect(
      resolveCaptionTracks([en], { captionLanguage: 'en', secondaryCaptionLanguage: 'es' })
        .secondary,
    ).toBeUndefined();
  });

  it('never prints the first line’s language twice, from another track of it', () => {
    const subtitles = track('en', { src: '/en-sub.vtt' });
    expect(
      resolveCaptionTracks([en, subtitles], {
        captionLanguage: null,
        secondaryCaptionLanguage: 'en',
      }).secondary,
    ).toBeUndefined();
  });
});

describe('secondaryCandidates', () => {
  it('offers every other language, never the first line’s own', () => {
    expect(secondaryCandidates(tracks, en)).toEqual([es, ptBR, ar]);
    expect(secondaryCandidates([en, track('en', { src: '/x.vtt' })], en)).toEqual([]);
    expect(secondaryCandidates(tracks, undefined)).toEqual(tracks);
  });
});

describe('pairSecondaryCues', () => {
  const cue = (start: number, end: number, text: string): Cue => ({ start, end, text });

  it('puts each second-language cue under the line it overlaps most', () => {
    const primary = [cue(0, 4, 'one'), cue(4, 8, 'two'), cue(8, 12, 'three')];
    const secondary = [
      cue(0, 3, 'uno'),
      // 3 → 7 overlaps "one" for 1 s and "two" for 3 s: it goes under "two".
      cue(3, 7, 'dos'),
      cue(7.5, 12, 'tres'),
    ];
    expect(pairSecondaryCues(primary, secondary).map((row) => row.map((c) => c.text))).toEqual([
      ['uno'],
      ['dos'],
      ['tres'],
    ]);
  });

  it('keeps a row’s second-language cues in order, and splits a tie to the earlier line', () => {
    const primary = [cue(0, 4, 'one'), cue(4, 8, 'two')];
    const secondary = [cue(0, 1, 'a'), cue(1, 2, 'b'), cue(2, 6, 'tie')];
    expect(pairSecondaryCues(primary, secondary).map((row) => row.map((c) => c.text))).toEqual([
      ['a', 'b', 'tie'],
      [],
    ]);
  });

  it('leaves out a cue that overlaps no line, and survives either list being empty', () => {
    const primary = [cue(0, 2, 'one'), cue(10, 12, 'two')];
    expect(pairSecondaryCues(primary, [cue(4, 6, 'gap')])).toEqual([[], []]);
    expect(pairSecondaryCues([], [cue(0, 1, 'x')])).toEqual([]);
    expect(pairSecondaryCues(primary, [])).toEqual([[], []]);
  });

  it('pairs a whole film of cues in near-linear time', () => {
    const film = (length: number) => ({
      primary: Array.from({ length }, (_, i) => cue(i * 3, i * 3 + 3, `p${i}`)),
      secondary: Array.from({ length }, (_, i) => cue(i * 3 + 1, i * 3 + 4, `s${i}`)),
    });
    const whole = film(10_000);
    const tenth = film(1_000);
    const rows = pairSecondaryCues(whole.primary, whole.secondary);
    expect(rows[0]?.map((c) => c.text)).toEqual(['s0']);
    expect(rows.flat()).toHaveLength(10_000);
    // The same ten thousand cues as one film and as ten: pairing every cue
    // against every line would make the one film about ten times slower.
    expect(
      slowdown(
        () => pairSecondaryCues(whole.primary, whole.secondary),
        repeatedly(10, () => pairSecondaryCues(tenth.primary, tenth.secondary)),
      ),
    ).toBeLessThan(3);
  });
});
