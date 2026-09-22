import type { MediaTrack } from '@intellectif/lk-core';
import type { VideoPreferences } from './prefs.js';
import type { Cue } from './vtt.js';

/** The two lines a learner can have: which track each shows, if any. */
export interface CaptionTracks {
  primary?: MediaTrack;
  secondary?: MediaTrack;
}

const primarySubtag = (tag: string): string => (tag.split('-')[0] ?? tag).toLowerCase();

/** Two tracks in one language: the `captions` one, which transcribes rather than translates. */
function preferCaptions(tracks: readonly MediaTrack[]): MediaTrack | undefined {
  return tracks.find((track) => track.kind === 'captions') ?? tracks[0];
}

/** The track for `language`: an exact match, else one of the same primary language (`pt` ↔ `pt-BR`). */
function matchLanguage(tracks: readonly MediaTrack[], language: string): MediaTrack | undefined {
  const wanted = language.toLowerCase();
  const exact = tracks.filter((track) => track.srclang.toLowerCase() === wanted);
  if (exact.length > 0) {
    return preferCaptions(exact);
  }
  const family = primarySubtag(wanted);
  return preferCaptions(tracks.filter((track) => primarySubtag(track.srclang) === family));
}

/** Tracks a player draws: the caption and subtitle kinds. */
function drawable(tracks: readonly MediaTrack[]): MediaTrack[] {
  return tracks.filter((track) => track.kind === 'captions' || track.kind === 'subtitles');
}

/**
 * The tracks that can be a second line beside `primary`: every drawable track
 * in a different language from it. A second track in the primary's own
 * language — the `subtitles` beside its `captions` — would only print the same
 * words twice, so it is never offered and never chosen.
 */
export function secondaryCandidates(
  tracks: readonly MediaTrack[],
  primary: MediaTrack | undefined,
): MediaTrack[] {
  const taken = primary?.srclang.toLowerCase();
  return drawable(tracks).filter((track) => track.srclang.toLowerCase() !== taken);
}

/**
 * Which track each caption line shows, from the learner's two choices.
 *
 * The primary line always shows something while there are tracks:
 * 1. the track in `captionLanguage` (case-insensitive);
 * 2. else one of the same primary language — `pt` finds `pt-BR`, `es` finds
 *    `es-419`;
 * 3. else the `default` track;
 * 4. else the first.
 *
 * Where two tracks share a language, the `captions` one wins.
 *
 * The secondary line is stricter: it appears only when `secondaryCaptionLanguage`
 * is set and matches a track in another language, by steps 1 and 2 alone —
 * never the default, never the first. A second line the learner did not choose
 * must never appear.
 */
export function resolveCaptionTracks(
  tracks: readonly MediaTrack[],
  preferences: Pick<VideoPreferences, 'captionLanguage' | 'secondaryCaptionLanguage'>,
): CaptionTracks {
  const usable = drawable(tracks);
  if (usable.length === 0) {
    return {};
  }
  const primary =
    (preferences.captionLanguage === null
      ? undefined
      : matchLanguage(usable, preferences.captionLanguage)) ??
    usable.find((track) => track.default === true) ??
    usable[0];
  const second = preferences.secondaryCaptionLanguage;
  const secondary =
    second === null ? undefined : matchLanguage(secondaryCandidates(usable, primary), second);
  return secondary === undefined ? { primary } : { primary, secondary };
}

/** How long two cues share, in seconds; zero or less when they do not meet. */
const overlap = (a: Cue, b: Cue): number => Math.min(a.end, b.end) - Math.max(a.start, b.start);

/**
 * How far back past the last cue that starts before a second-language cue to
 * look for one still running. Captions overlap rarely and briefly; this is the
 * bound `cueIndexAt` uses for the same reason.
 */
const LOOKBACK = 8;

/**
 * The second-language cues that belong under each first-language line of the
 * transcript, by index of the first-language cue.
 *
 * A second-language cue belongs to the line it overlaps MOST — the two tracks
 * need not share timings, and a translation segmented differently still pairs
 * sensibly — and to the earlier line on a tie. A cue that overlaps no line is
 * left out: it is still drawn over the video at its own time, but a transcript
 * row is a first-language line, and there is none for it to sit under.
 *
 * Both lists are sorted by start, as `parseWebVtt` returns them.
 */
export function pairSecondaryCues(primary: readonly Cue[], secondary: readonly Cue[]): Cue[][] {
  const rows: Cue[][] = primary.map(() => []);
  for (const cue of secondary) {
    // The first primary cue that starts at or after this cue ends: every
    // candidate lies before it.
    let low = 0;
    let high = primary.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((primary[middle] as Cue).start < cue.end) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    let best = -1;
    let bestShare = 0;
    let misses = 0;
    for (let index = low - 1; index >= 0 && misses <= LOOKBACK; index -= 1) {
      const share = overlap(primary[index] as Cue, cue);
      if (share > 0) {
        misses = 0;
        // Walking backwards, so an equal share moves the cue to the earlier line.
        if (share >= bestShare) {
          best = index;
          bestShare = share;
        }
      } else {
        misses += 1;
      }
    }
    if (best !== -1) {
      (rows[best] as Cue[]).push(cue);
    }
  }
  return rows;
}
