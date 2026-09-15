import type { DictationData } from '../../types/activity.js';
import { similarity } from './edit-distance.js';
import {
  DICTATION_MAX_ACCEPTED_TRANSCRIPTS,
  DICTATION_MAX_TEXT_LENGTH,
  DICTATION_MAX_TRANSCRIPT_LENGTH,
  normalizeDictationText,
  normalizeDictationTextBounded,
  truncateCodePoints,
} from './normalize.js';

/** One transcript word, or one extra word the learner typed, after alignment. */
export interface DictationWordAlignment {
  /** `w<n>`, the 1-based position of a transcript word; absent for an extra word. */
  itemId?: string;
  /** The transcript word, normalised; `''` for an extra word. */
  reference: string;
  /** The word the learner typed for it, normalised; `''` for a missing word. */
  attempt: string;
  /** How alike the two words are, in [0, 1]; `0` for a missing or an extra word. */
  similarity: number;
  status: 'correct' | 'incorrect' | 'missing' | 'extra';
}

/**
 * The comparison a dictation grade is made of: the normalised strings, which
 * candidate transcript the attempt was scored against, and the word pairings.
 * The same data the scorer reads, so a marked display and the grade cannot
 * disagree.
 */
export interface DictationAlignment {
  /**
   * Which candidate the attempt was scored against, by ORIGINAL position:
   * `0` is `transcript`, `n` is `acceptedTranscripts[n − 1]`; `-1` when no
   * candidate survives normalisation (stale or transcript-less data).
   */
  candidateIndex: number;
  /** The chosen candidate, normalised; `''` when `candidateIndex` is `-1`. */
  reference: string;
  /** The attempt, normalised and possibly truncated. */
  attempt: string;
  /**
   * Whether the learner's text was cut: at `DICTATION_MAX_TEXT_LENGTH` before or
   * after normalisation, or while equivalence rules were growing it.
   */
  truncated: boolean;
  /** The similarity of `attempt` to `reference` — the score. */
  similarity: number;
  /** Transcript words and extra words, in the order they align. */
  words: DictationWordAlignment[];
}

/**
 * What `alignDictation` reads. Every field optional, and read defensively: full
 * data, a practice payload, a `redact(data, { reveal: 'after-submit' })`
 * projection, or a plain redacted projection with no transcript at all — which
 * yields `candidateIndex: -1`, never a throw.
 */
export type DictationReference = Partial<
  Pick<DictationData, 'transcript' | 'acceptedTranscripts' | 'tolerance'>
>;

/**
 * The words the scorer can emit a detail for, one list per candidate — index 0
 * is the transcript, index n is `acceptedTranscripts[n − 1]` — each word in the
 * normalised form `correctResponse` carries. A candidate that normalises to
 * nothing gives an empty list. Derivable from the activity alone, which is what
 * a validator of stored details joins against: by id AND by word, because
 * positional ids alone cannot tell an edited transcript of the same length.
 */
export function dictationReferenceWords(
  data: DictationReference,
): readonly (readonly { itemId: string; word: string }[])[] {
  return rawCandidates(data).map((candidate) =>
    tokensOf(normalizeCandidate(candidate, data)).map((word, index) => ({
      itemId: `w${index + 1}`,
      word,
    })),
  );
}

/**
 * Compares a learner's text with a dictation's transcript(s). Pure and
 * deterministic: no locale, no `Intl`, integer alignment costs, one pinned
 * tie order.
 *
 * The attempt is cut at `DICTATION_MAX_TEXT_LENGTH` code points before and
 * after normalisation — a cut that ends on a space leaves no empty word after
 * it — and `truncated` is also set when the rules grew its
 * working text past the normaliser's bound (see `normalizeDictationText`).
 * Every candidate — the transcript and at most
 * `DICTATION_MAX_ACCEPTED_TRANSCRIPTS` accepted transcripts — is normalised
 * with the same tolerance and cut at `DICTATION_MAX_TRANSCRIPT_LENGTH`; the
 * attempt is scored against each surviving candidate and the first best wins.
 * Words are then paired by a word-level edit distance with exact-equality
 * costs, backtracked from the end preferring a pairing, then a missing
 * transcript word, then an extra typed word; a paired word's similarity is its
 * own character similarity.
 */
export function alignDictation(data: DictationReference, text: string): DictationAlignment {
  const raw = typeof text === 'string' ? text : '';
  const capped = truncateCodePoints(raw, DICTATION_MAX_TEXT_LENGTH);
  const { text: normalized, cut } = normalizeDictationTextBounded(capped, data.tolerance);
  const attempt = cutAt(normalized, DICTATION_MAX_TEXT_LENGTH);
  const truncated = cut || capped.length < raw.length || attempt.length < normalized.length;

  const candidates: { index: number; text: string }[] = [];
  rawCandidates(data).forEach((candidate, index) => {
    const candidateText = normalizeCandidate(candidate, data);
    if (candidateText !== '') {
      candidates.push({ index, text: candidateText });
    }
  });
  if (candidates.length === 0) {
    return { candidateIndex: -1, reference: '', attempt, truncated, similarity: 0, words: [] };
  }

  let chosen = candidates[0] as { index: number; text: string };
  let best = similarity(chosen.text, attempt);
  for (const candidate of candidates.slice(1)) {
    const candidateSimilarity = similarity(candidate.text, attempt);
    if (candidateSimilarity > best) {
      best = candidateSimilarity;
      chosen = candidate;
    }
  }

  return {
    candidateIndex: chosen.index,
    reference: chosen.text,
    attempt,
    truncated,
    similarity: best,
    words: alignWords(tokensOf(chosen.text), tokensOf(attempt)),
  };
}

/**
 * `transcript` first, then each accepted transcript, whatever type stale data
 * holds them as — at most `DICTATION_MAX_ACCEPTED_TRANSCRIPTS` of them, the
 * schema's own limit, so stale data with more cannot slow a grading run.
 */
function rawCandidates(data: DictationReference): unknown[] {
  return [
    data.transcript,
    ...(Array.isArray(data.acceptedTranscripts)
      ? data.acceptedTranscripts.slice(0, DICTATION_MAX_ACCEPTED_TRANSCRIPTS)
      : []),
  ];
}

/**
 * A candidate normalised with the item's tolerance, cut at the transcript cap
 * before and after. The cut before normalising reaches only stale data — the
 * schema refuses a longer transcript — and keeps its cost bounded.
 */
function normalizeCandidate(candidate: unknown, data: DictationReference): string {
  return typeof candidate === 'string'
    ? cutAt(
        normalizeDictationText(
          truncateCodePoints(candidate, DICTATION_MAX_TRANSCRIPT_LENGTH),
          data.tolerance,
        ),
        DICTATION_MAX_TRANSCRIPT_LENGTH,
      )
    : '';
}

/**
 * Normalised text cut at `max` code points, without the space the cut may end
 * on: normalised text is single-spaced, so that space is the only one that
 * could be left at an edge, and it would read as an empty word.
 */
function cutAt(normalized: string, max: number): string {
  const cut = truncateCodePoints(normalized, max);
  return cut.endsWith(' ') ? cut.slice(0, -1) : cut;
}

/** The words of a normalised string: already single-spaced, so a plain split. */
function tokensOf(normalized: string): string[] {
  return normalized === '' ? [] : normalized.split(' ');
}

/** The edit that produced a cell of the alignment matrix. */
export const STEP = {
  /** A reference element paired with an attempt element — equal or substituted. */
  pair: 0,
  /** A reference element the attempt lacks. */
  missing: 1,
  /** An attempt element the reference lacks. */
  extra: 2,
} as const;
export type Step = (typeof STEP)[keyof typeof STEP];

/**
 * Edit operations turning `reference` into `attempt`, as one step per cell of
 * a Wagner–Fischer matrix: pair (equal or substituted), missing (a reference
 * element the attempt lacks) or extra (an attempt element the reference
 * lacks). Ties are broken at fill time in that order, which is exactly the
 * order a backtrace from the end would test them in, so the result is the
 * pairing the reference implementation's backtrace produces. The matrix holds
 * one byte per cell; the distances need only two rows.
 */
export function alignSequences(
  reference: readonly string[],
  attempt: readonly string[],
): { step: Step; referenceIndex: number; attemptIndex: number }[] {
  const rows = reference.length;
  const columns = attempt.length;
  const width = columns + 1;
  const steps = new Uint8Array((rows + 1) * width);
  let previous = new Uint32Array(width);
  let current = new Uint32Array(width);
  for (let j = 0; j <= columns; j += 1) {
    previous[j] = j;
    steps[j] = STEP.extra;
  }
  for (let i = 1; i <= rows; i += 1) {
    current[0] = i;
    steps[i * width] = STEP.missing;
    const referenceItem = reference[i - 1];
    for (let j = 1; j <= columns; j += 1) {
      const paired = (previous[j - 1] as number) + (referenceItem === attempt[j - 1] ? 0 : 1);
      const missing = (previous[j] as number) + 1;
      const extra = (current[j - 1] as number) + 1;
      const cost = Math.min(paired, missing, extra);
      current[j] = cost;
      steps[i * width + j] =
        paired === cost ? STEP.pair : missing === cost ? STEP.missing : STEP.extra;
    }
    [previous, current] = [current, previous];
  }

  const path: { step: Step; referenceIndex: number; attemptIndex: number }[] = [];
  let i = rows;
  let j = columns;
  while (i > 0 || j > 0) {
    const step = steps[i * width + j] as Step;
    if (step === STEP.pair) {
      i -= 1;
      j -= 1;
    } else if (step === STEP.missing) {
      i -= 1;
    } else {
      j -= 1;
    }
    path.push({ step, referenceIndex: i, attemptIndex: j });
  }
  return path.reverse();
}

function alignWords(
  reference: readonly string[],
  attempt: readonly string[],
): DictationWordAlignment[] {
  const words: DictationWordAlignment[] = [];
  let ordinal = 0;
  for (const { step, referenceIndex, attemptIndex } of alignSequences(reference, attempt)) {
    if (step === STEP.extra) {
      words.push({
        reference: '',
        attempt: attempt[attemptIndex] as string,
        similarity: 0,
        status: 'extra',
      });
      continue;
    }
    ordinal += 1;
    const referenceWord = reference[referenceIndex] as string;
    if (step === STEP.missing) {
      words.push({
        itemId: `w${ordinal}`,
        reference: referenceWord,
        attempt: '',
        similarity: 0,
        status: 'missing',
      });
      continue;
    }
    const attemptWord = attempt[attemptIndex] as string;
    words.push({
      itemId: `w${ordinal}`,
      reference: referenceWord,
      attempt: attemptWord,
      similarity: similarity(referenceWord, attemptWord),
      status: referenceWord === attemptWord ? 'correct' : 'incorrect',
    });
  }
  return words;
}
