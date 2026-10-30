/**
 * One Azure recognition result, read into the pieces a `SpeechAssessment` is
 * made of.
 *
 * Every rule here comes from a real response: 59 cases captured in October
 * 2026 on the Speech SDK for JavaScript 1.51.0 and the REST short-audio API,
 * kept under `src/__tests__/fixtures`. The SDK's JSON nests each score under
 * `PronunciationAssessment`; REST puts it directly on the result, the word,
 * the syllable and the phoneme. Both are read.
 */
import type {
  SpeechPhoneme,
  SpeechPhonemeCandidate,
  SpeechSyllable,
  SpeechWord,
} from '@intellectif/lk-core/scoring';
import type { AzureRefusalCode, AzureResult } from './types.js';

/** Azure reports times in 100-nanosecond ticks. */
const TICKS_PER_MS = 10_000;

/** A result that was read, as far as the assessment is concerned. */
export interface Utterance {
  /** The utterance's own scores, only those Azure gave. */
  scores: {
    accuracy?: number;
    fluency?: number;
    completeness?: number;
    prosody?: number;
    overall?: number;
  };
  words: SpeechWord[];
  /** `NBest[0].Lexical`, or `DisplayText`; absent when nothing was recognised. */
  text?: string;
  /** The first monotone confidence on any word, when it is one (0..1). */
  monotone?: number;
  snrDb?: number;
}

/** What one raw result reads as. */
export type ReadResult =
  | { kind: 'utterance'; utterance: Utterance }
  /** A status in which no word was recognised: no words to add. */
  | { kind: 'no_words' }
  | { kind: 'refused'; code: AzureRefusalCode; message: string };

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const rows = (value: unknown): Fields[] => (Array.isArray(value) ? value.filter(isFields) : []);

/** A finite number, or nothing. A number out of range is kept, for lk-core to refuse. */
function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A non-empty string, or nothing: outside en-US, Azure names syllables and phonemes `""`. */
function nameOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** The scores of a node: under `PronunciationAssessment` in SDK JSON, on the node itself in REST. */
function scoresOf(node: Fields): Fields {
  return isFields(node.PronunciationAssessment) ? node.PronunciationAssessment : node;
}

/** A span in ticks, when the node has a start. */
interface Span {
  start: number;
  end: number;
}

function spanOf(node: Fields): Span | undefined {
  const start = numberOf(node.Offset);
  if (start === undefined) {
    return undefined;
  }
  return { start, end: start + (numberOf(node.Duration) ?? 0) };
}

/**
 * The time of a syllable or a phoneme, only when it lies inside its word.
 *
 * Within one recognition turn every offset counts from the start of the
 * audio. The SDK adds a new turn's base offset to the words and not to their
 * sounds, so after a reconnection a sound would sit seconds before its own
 * word. No grade reads these times; a time that cannot be right is left out
 * rather than drawn in the wrong place.
 */
function timeWithin(
  node: Fields,
  word: Span | undefined,
): { startMs?: number; durationMs?: number } {
  const span = spanOf(node);
  if (word === undefined || span === undefined || span.start < word.start || span.end > word.end) {
    return {};
  }
  return { startMs: span.start / TICKS_PER_MS, durationMs: (span.end - span.start) / TICKS_PER_MS };
}

function syllablesOf(word: Fields, span: Span | undefined): SpeechSyllable[] {
  const syllables: SpeechSyllable[] = [];
  for (const syllable of rows(word.Syllables)) {
    const text = nameOf(syllable.Syllable);
    if (text === undefined) {
      continue;
    }
    const grapheme = nameOf(syllable.Grapheme);
    const accuracy = numberOf(scoresOf(syllable).AccuracyScore);
    syllables.push({
      text,
      ...(grapheme !== undefined ? { grapheme } : {}),
      ...(accuracy !== undefined ? { accuracy } : {}),
      ...timeWithin(syllable, span),
    });
  }
  return syllables;
}

function phonemesOf(word: Fields, span: Span | undefined): SpeechPhoneme[] {
  return rows(word.Phonemes).map((phoneme) => {
    const scores = scoresOf(phoneme);
    const symbol = nameOf(phoneme.Phoneme);
    const accuracy = numberOf(scores.AccuracyScore);
    const heardAs: SpeechPhonemeCandidate[] = [];
    for (const candidate of rows(scores.NBestPhonemes)) {
      const name = nameOf(candidate.Phoneme);
      const score = numberOf(candidate.Score);
      if (name !== undefined && score !== undefined) {
        heardAs.push({ symbol: name, score });
      }
    }
    return {
      ...(symbol !== undefined ? { symbol } : {}),
      ...(accuracy !== undefined ? { accuracy } : {}),
      ...timeWithin(phoneme, span),
      ...(heardAs.length > 0 ? { heardAs } : {}),
    };
  });
}

const ERRORS: Readonly<Record<string, SpeechWord['error']>> = {
  None: 'none',
  Mispronunciation: 'mispronunciation',
  Omission: 'omission',
  Insertion: 'insertion',
};

/**
 * One word. An omitted word was never spoken: SDK JSON gives it no score and
 * `Offset: null`, and REST gives it 0, 0 and 0, none of which is a score or a
 * time. `UnexpectedBreak`, `MissingBreak` and `Monotone` are prosody, not a
 * wrong word, so they are kept as `vendorError` on a word marked `none`.
 *
 * Break confidences are never carried: they are not probabilities
 * (`UnexpectedBreak.Confidence` grows with the pause and passes 1, which lk-core
 * refuses, and `MissingBreak.Confidence` is 1 on every word without a pause).
 */
function wordOf(raw: Fields): SpeechWord {
  const scores = scoresOf(raw);
  const vendorError = typeof scores.ErrorType === 'string' ? scores.ErrorType : undefined;
  const error = (vendorError !== undefined ? ERRORS[vendorError] : undefined) ?? 'none';
  const spoken = error !== 'omission';
  const span = spoken ? spanOf(raw) : undefined;
  const accuracy = spoken ? numberOf(scores.AccuracyScore) : undefined;
  const syllables = syllablesOf(raw, span);
  const phonemes = phonemesOf(raw, span);
  return {
    // Not a string is left as it came, for lk-core to refuse: a word with no
    // text cannot be aligned, and dropping it would mark it unread.
    text: raw.Word as string,
    error,
    ...(vendorError !== undefined ? { vendorError } : {}),
    ...(accuracy !== undefined ? { accuracy } : {}),
    ...(span !== undefined
      ? { startMs: span.start / TICKS_PER_MS, durationMs: (span.end - span.start) / TICKS_PER_MS }
      : {}),
    ...(syllables.length > 0 ? { syllables } : {}),
    ...(phonemes.length > 0 ? { phonemes } : {}),
  };
}

/**
 * The monotone confidence stamped on a word, when it is a confidence. SDK JSON
 * carries only `SyllablePitchDeltaConfidence`; REST carries two more, which
 * were always 0. It is the same on every word of an utterance.
 */
function monotoneOf(raw: Fields): number | undefined {
  const feedback = scoresOf(raw).Feedback ?? raw.Feedback;
  const prosody = isFields(feedback) ? feedback.Prosody : undefined;
  const intonation = isFields(prosody) ? prosody.Intonation : undefined;
  const monotone = isFields(intonation) ? intonation.Monotone : undefined;
  const value = isFields(monotone) ? numberOf(monotone.SyllablePitchDeltaConfidence) : undefined;
  return value !== undefined && value >= 0 && value <= 1 ? value : undefined;
}

/** `"."` is what Azure recognises in silence and in noise. */
function textOf(result: Fields, best: Fields): string | undefined {
  for (const candidate of [best.Lexical, result.DisplayText]) {
    if (typeof candidate === 'string' && candidate.trim() !== '' && candidate.trim() !== '.') {
      return candidate.trim();
    }
  }
  return undefined;
}

/**
 * Statuses in which Azure recognised no word: silence, noise, and speech that
 * matched no word (`NoMatch`). None appeared in the captures. They add no
 * words, so a take of them is `no_speech`, as a take of silence or noise is
 * when Azure answers it with every word omitted.
 */
const NO_WORDS = new Set(['InitialSilenceTimeout', 'BabbleTimeout', 'NoMatch']);

/** Reads one result: a string as the SDK's `SpeechServiceResponse_JsonResult` gives it, or a parsed body. */
export function readResult(raw: AzureResult): ReadResult {
  let result: unknown = raw;
  if (typeof raw === 'string') {
    try {
      result = JSON.parse(raw);
    } catch {
      return { kind: 'refused', code: 'not_a_result', message: 'it is not JSON.' };
    }
  }
  if (!isFields(result)) {
    return { kind: 'refused', code: 'not_a_result', message: 'it is not a JSON object.' };
  }
  const status = result.RecognitionStatus;
  if (typeof status === 'string' && NO_WORDS.has(status)) {
    return { kind: 'no_words' };
  }
  // The SDK's JSON writes the status as a name; Microsoft's examples show 0.
  if (status !== 'Success' && status !== 0) {
    return {
      kind: 'refused',
      code: 'recognition_failed',
      message: `its RecognitionStatus is ${JSON.stringify(status) ?? 'missing'}.`,
    };
  }
  const best = rows(result.NBest)[0];
  const scores = best !== undefined ? scoresOf(best) : undefined;
  if (best === undefined || scores === undefined || numberOf(scores.AccuracyScore) === undefined) {
    return {
      kind: 'refused',
      code: 'not_a_result',
      message:
        'it carries no pronunciation assessment. Send the request with the Detailed output ' +
        'format and the pronunciation assessment settings applied.',
    };
  }
  const rawWords = rows(best.Words);
  const utteranceScores: Utterance['scores'] = {};
  for (const [dimension, field] of [
    ['accuracy', 'AccuracyScore'],
    ['fluency', 'FluencyScore'],
    ['completeness', 'CompletenessScore'],
    ['prosody', 'ProsodyScore'],
    ['overall', 'PronScore'],
  ] as const) {
    const value = numberOf(scores[field]);
    if (value !== undefined) {
      utteranceScores[dimension] = value;
    }
  }
  const text = textOf(result, best);
  const monotone = rawWords.map(monotoneOf).find((value) => value !== undefined);
  const snrDb = numberOf(result.SNR);
  return {
    kind: 'utterance',
    utterance: {
      scores: utteranceScores,
      words: rawWords.map(wordOf),
      ...(text !== undefined ? { text } : {}),
      ...(monotone !== undefined ? { monotone } : {}),
      ...(snrDb !== undefined ? { snrDb } : {}),
    },
  };
}
