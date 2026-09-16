/**
 * Speech assessment: the neutral shape a pronunciation assessor's result is
 * mapped into, and the types a read-aloud grade reads and writes.
 *
 * The SDK calls no assessor and holds no key. The application maps its
 * provider's response into a {@link SpeechAssessment}; the SDK validates that
 * evidence, checks that it belongs to the item and to the learner's recording,
 * and does the arithmetic.
 */
import type { RoundingPolicy } from '../scoring/rounding.js';
import type { Grader } from './grading.js';

/**
 * How the assessor classified a word against the reference text: `none`, read
 * as written; `mispronunciation`, read but not well enough; `omission`, in the
 * reference but not heard; `insertion`, heard but not in the reference.
 */
export type SpeechWordError = 'none' | 'mispronunciation' | 'omission' | 'insertion';

/** A phoneme the assessor heard instead of the expected one, and its score. */
export interface SpeechPhonemeCandidate {
  /** The phoneme, in the assessment's `phonemeAlphabet`. */
  symbol: string;
  /** 0..100. */
  score: number;
}

/** One phoneme of a word, as the assessor measured it. Assessors report different subsets. */
export interface SpeechPhoneme {
  /** The phoneme, in the assessment's `phonemeAlphabet`. Absent when the assessor does not name it. */
  symbol?: string;
  /** 0..100. Absent means not assessed, never 0. */
  accuracy?: number;
  /** Milliseconds from the start of the recording. */
  startMs?: number;
  /** Milliseconds. */
  durationMs?: number;
  /** The phonemes the assessor heard instead, in the order it reported them. */
  heardAs?: SpeechPhonemeCandidate[];
}

/** One syllable of a word, as the assessor measured it. */
export interface SpeechSyllable {
  /** The syllable as the assessor reports it. */
  text: string;
  /** The letters of the word the syllable is written with, when the assessor reports them. */
  grapheme?: string;
  /** 0..100. Absent means not assessed, never 0. */
  accuracy?: number;
  /** Milliseconds from the start of the recording. */
  startMs?: number;
  /** Milliseconds. */
  durationMs?: number;
}

/** One word of a {@link SpeechAssessment}. */
export interface SpeechWord {
  /** The word as the assessor reports it. */
  text: string;
  /** 0..100. Absent means not assessed — never read as 0. */
  accuracy?: number;
  /** The assessor's classification of the word. */
  error: SpeechWordError;
  /** The provider's own error label, verbatim, for audit. No grade reads it. */
  vendorError?: string;
  /** Milliseconds from the start of the recording. */
  startMs?: number;
  /** Milliseconds. */
  durationMs?: number;
  syllables?: SpeechSyllable[];
  phonemes?: SpeechPhoneme[];
  /**
   * Confidences (0..1) that an unexpected pause came before the word, or that
   * an expected one is missing. Display only: no grade reads them.
   */
  breaks?: { unexpected?: number; missing?: number };
}

/**
 * A pronunciation assessor's result, in the SDK's neutral shape. Every score in
 * it is on a 0..100 scale. Check one with `validateSpeechAssessment`.
 */
export interface SpeechAssessment {
  assessmentVersion: '1.0';
  /** `no_speech`: the assessor heard nothing to assess — which is never a score of 0. */
  status: 'assessed' | 'no_speech';
  /** `scripted`: measured against a known text. Only a scripted assessment grades a read-aloud item. */
  task: 'scripted' | 'unscripted';
  /** The locale the assessment was made for: canonical, with a region — the rule `ReadAloudData.locale` follows. */
  locale: string;
  /**
   * The text the assessment was made against: the authored reference text,
   * verbatim. Required when scripted, so a grade can refuse evidence made
   * against another text.
   */
  referenceText?: string;
  /**
   * The `RecordingRef.key` of the recording that was assessed. Required when
   * scripted, so a grade can refuse evidence made for another recording.
   */
  recordingKey?: string;
  /** Who measured. Evidence from `'ai'` grades only when the caller opts in. */
  assessor: Grader;
  /** What every score is out of. Stated, so an adapter never leaves it to be assumed. */
  scale: 100;
  /** Utterance-level scores, 0..100. An absent score was not assessed; it is never read as 0. */
  scores: {
    accuracy?: number;
    fluency?: number;
    completeness?: number;
    prosody?: number;
    overall?: number;
  };
  /** What the assessor recognised, as text. */
  recognizedText?: string;
  /**
   * Who judged omissions, insertions and mispronunciations. `assessor`: the
   * assessor did, and its word `error` labels are trusted. `none`: it did not,
   * so a heard word that differs from its reference word is marked
   * mispronounced.
   */
  miscue: 'assessor' | 'none';
  /** The alphabet phoneme symbols are written in. Required whenever a phoneme names a `symbol` or `heardAs`. */
  phonemeAlphabet?: 'ipa' | 'sapi';
  /** The words, in the order the assessor reported them. */
  words: SpeechWord[];
  /** Utterance-level prosody: `monotoneConfidence` is 0..1, display only. */
  prosody?: { monotoneConfidence?: number };
  /** Recording quality. Informational only: no grade reads it. */
  signal?: { snrDb?: number };
}

/**
 * The server's own measurement of a recording, from `inspectWav`. It is what
 * decides whether a take is plausible speech; a duration the client reported
 * never is.
 */
export interface SpeechMeasurement {
  /** Length of the recording, in milliseconds. */
  durationMs: number;
  /** Milliseconds of the recording at or above the silence floor. At most `durationMs`. */
  voicedMs: number;
}

/**
 * When a take is too little speech to grade. Both fields are required: the SDK
 * holds no default for either, because each is a decision about an
 * application's learners and its assessor.
 */
export interface SpeechPlausibilityPolicy {
  /** The most words per second of voiced time a genuine reading can reach. Finite and above 0. */
  maxWordsPerSecond: number;
  /** The least voiced time, in milliseconds, a gradable take contains. Finite and at least 0. */
  minVoicedMs: number;
}

/**
 * Why a read-aloud take cannot be graded:
 * - `invalid_assessment` — the assessment fails `validateSpeechAssessment`;
 * - `task_mismatch` — it is not a scripted assessment;
 * - `locale_mismatch` — it was made for another locale than the item's;
 * - `reference_mismatch` — it was made against another text than the item's;
 * - `recording_mismatch` — it was made for another recording than the response's;
 * - `assessor_not_accepted` — its assessor is `'ai'`, and the caller did not opt in;
 * - `no_speech` — the assessor heard no speech;
 * - `insufficient_voiced_time` — the recording holds less voiced time than the policy requires;
 * - `implausible_speech_rate` — more words were recognised than the voiced time can hold;
 * - `missing_dimension` — a weighted dimension has no score in the assessment.
 */
export type SpeechUnscorableCode =
  | 'invalid_assessment'
  | 'task_mismatch'
  | 'locale_mismatch'
  | 'reference_mismatch'
  | 'recording_mismatch'
  | 'assessor_not_accepted'
  | 'no_speech'
  | 'insufficient_voiced_time'
  | 'implausible_speech_rate'
  | 'missing_dimension';

/** A read-aloud take that cannot be graded. Never a zero: see `outcomeFromUnscorable`. */
export interface SpeechUnscorable {
  unscorable: true;
  /** Machine-readable. See {@link SpeechUnscorableCode}. */
  code: SpeechUnscorableCode;
  /** A developer-facing English sentence. */
  reason: string;
}

/**
 * Options for `gradeReadAloud`. The plausibility policy is required: the SDK
 * holds no default for a threshold that decides whether a take is graded.
 */
export interface GradeReadAloudOptions {
  /** The server's measurement of the recording (inspectWav). `null` only for a blank response. */
  measured: SpeechMeasurement | null;
  /** When a take is too little speech to grade. */
  plausibility: SpeechPlausibilityPolicy;
  /** Accept `assessor.kind: 'ai'` evidence. Off unless set. */
  allowAiAssessor?: boolean;
  /** Compare the pass line with both sides rounded, as `gradeFromRubric` does. The score stays unrounded. */
  rounding?: RoundingPolicy;
}

/** How a word of a read-aloud attempt is marked. */
export type ReadAloudWordState = 'correct' | 'mispronounced' | 'omitted' | 'inserted';

/**
 * One entry of `alignReadAloud`: a reference word and what was heard for it,
 * or a heard word that is not in the reference.
 */
export interface ReadAloudWordAlignment {
  /** `w<n>` for a reference word, as `dictationReferenceWords` numbers them; absent for an `inserted` word. */
  itemId?: string;
  /** The normalised reference word; `''` for an `inserted` word. */
  reference: string;
  /**
   * The normalised heard word: `''` for an `omitted` word, and also for an
   * `inserted` word whose text normalises to nothing — an assessor can tag a
   * dash as an insertion, and every insertion gets an entry. Branch on `state`,
   * never on the empty string.
   */
  heard: string;
  state: ReadAloudWordState;
  /** The assessor word's accuracy (0..100), when it has one. */
  accuracy?: number;
  /** Index into `assessment.words` of the word this entry came from. */
  wordIndex?: number;
}

/**
 * What `inspectWav` found in a recording's bytes: the duration, format, peak
 * level and voiced time of a 16-bit PCM WAV, or why it could not read one.
 */
export type WavInspection =
  | {
      valid: true;
      /** Length of the audio, in milliseconds. */
      durationMs: number;
      sampleRate: number;
      channels: number;
      bitsPerSample: 16;
      /** The loudest sample across every channel, in dBFS; `-Infinity` for digital silence or no samples. */
      peakDbfs: number;
      /** Milliseconds of the windows at or above the policy's silence floor. */
      voicedMs: number;
    }
  | { valid: false; reason: 'not_wav' | 'unsupported_encoding' | 'truncated' };

/** How `inspectWav` decides which parts of a recording are voiced. Both fields are required. */
export interface WavInspectionPolicy {
  /** A window whose RMS level is at or above this many dBFS is voiced. Finite, and at most 0. */
  silenceDbfs: number;
  /** The window length, in milliseconds. Finite, and above 0. */
  frameMs: number;
}
