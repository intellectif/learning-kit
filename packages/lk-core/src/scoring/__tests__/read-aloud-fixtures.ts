/**
 * Fixtures shared by the read-aloud grading tests: a valid item, a valid
 * assessment of it, and a writer for WAV bytes.
 *
 * The example limits here are deliberately round, ordinary numbers. They are
 * not a recommendation: every application sets its own, and copying a fixture's
 * silence floor or words-per-second into production would be copying a guess.
 */
import type { ReadAloudData, ReadAloudLearnerResponse } from '../../types/activity.js';
import type {
  GradeReadAloudOptions,
  SpeechAssessment,
  SpeechWord,
  WavInspectionPolicy,
} from '../../types/speech.js';

/** The text every fixture item asks the learner to read. Six words, all distinct but for `the`. */
export const SENTENCE = 'the cat sat on the mat';

/** The storage key of the recording the fixtures submit. */
export const TAKE_KEY = 'take-1';

/** Valid read-aloud data: two weighted dimensions, no media, no feedback. */
export function readAloudItem(over: Partial<ReadAloudData> = {}): ReadAloudData {
  return {
    schemaVersion: '1.0',
    type: 'read-aloud',
    id: 'ra-1',
    title: 'Read the sentence aloud',
    referenceText: SENTENCE,
    locale: 'en-US',
    recording: { maxSeconds: 30 },
    scoring: {
      dimensions: [
        { name: 'accuracy', weight: 2 },
        { name: 'fluency', weight: 1 },
      ],
    },
    ...over,
  };
}

/** One assessor word, `error: 'none'` and no accuracy unless asked for. */
export function spoken(text: string, over: Partial<SpeechWord> = {}): SpeechWord {
  return { text, error: 'none', ...over };
}

/** The words of `SENTENCE`, each read as written. */
export function sentenceWords(): SpeechWord[] {
  return SENTENCE.split(' ').map((text) => spoken(text, { accuracy: 90 }));
}

/** A scripted assessment of `SENTENCE`, made for `TAKE_KEY` by a measurement engine. */
export function speechAssessment(over: Partial<SpeechAssessment> = {}): SpeechAssessment {
  return {
    assessmentVersion: '1.0',
    status: 'assessed',
    task: 'scripted',
    locale: 'en-US',
    referenceText: SENTENCE,
    recordingKey: TAKE_KEY,
    assessor: { kind: 'auto', id: 'pronunciation-engine' },
    scale: 100,
    scores: { accuracy: 80, fluency: 70 },
    recognizedText: SENTENCE,
    miscue: 'assessor',
    words: sentenceWords(),
    ...over,
  };
}

/** A response carrying a stored recording. */
export function recordedResponse(key: string = TAKE_KEY): ReadAloudLearnerResponse {
  return { type: 'read-aloud', recording: { key, mimeType: 'audio/wav' } };
}

/** A response the learner submitted without recording. */
export const BLANK_RESPONSE: ReadAloudLearnerResponse = { type: 'read-aloud', recording: null };

/** Grading options with a measurement and a plausibility policy that accept the fixtures. */
export function gradingOptions(over: Partial<GradeReadAloudOptions> = {}): GradeReadAloudOptions {
  return {
    measured: { durationMs: 4000, voicedMs: 2500 },
    plausibility: { maxWordsPerSecond: 6, minVoicedMs: 500 },
    ...over,
  };
}

/** An inspection policy: a low silence floor and a 20 ms window. */
export const INSPECTION_POLICY: WavInspectionPolicy = { silenceDbfs: -50, frameMs: 20 };

/** The bytes of an ASCII string, which every WAV tag is. */
export function ascii(text: string): number[] {
  return [...text].map((character) => character.charCodeAt(0));
}

/** A little-endian unsigned 16-bit value. */
export function u16(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

/** A little-endian unsigned 32-bit value. */
export function u32(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

/** A little-endian signed 16-bit sample. */
export function i16(value: number): number[] {
  return u16(value < 0 ? value + 0x10000 : value);
}

/**
 * A chunk: its id, the size of its body, the body, and the pad byte an odd
 * size is followed by. `declared` overrides the size written, which is how a
 * truncated file is built.
 */
export function chunk(id: string, body: number[], declared = body.length): number[] {
  return [...ascii(id), ...u32(declared), ...body, ...(body.length % 2 === 1 ? [0] : [])];
}

/** The `RIFF`/`WAVE` wrapper around already-built chunks. */
export function riff(chunks: number[]): Uint8Array {
  return new Uint8Array([...ascii('RIFF'), ...u32(chunks.length + 4), ...ascii('WAVE'), ...chunks]);
}

/** Options for a `fmt ` body. */
export interface FmtOptions {
  audioFormat?: number;
  channels?: number;
  sampleRate?: number;
  bitsPerSample?: number;
  blockAlign?: number;
  /** The first two bytes of the `SubFormat` GUID, for WAVE_FORMAT_EXTENSIBLE. */
  subFormat?: number;
  /** Write the extensible tail (cbSize, valid bits, channel mask, SubFormat). */
  extensible?: boolean;
}

/** A `fmt ` chunk body. */
export function fmtBody(options: FmtOptions = {}): number[] {
  const {
    audioFormat = 1,
    channels = 1,
    sampleRate = 16000,
    bitsPerSample = 16,
    blockAlign = (channels * bitsPerSample) / 8,
    subFormat = 1,
    extensible = false,
  } = options;
  const body = [
    ...u16(audioFormat),
    ...u16(channels),
    ...u32(sampleRate),
    ...u32(sampleRate * blockAlign),
    ...u16(blockAlign),
    ...u16(bitsPerSample),
  ];
  if (!extensible) {
    return body;
  }
  return [
    ...body,
    ...u16(22),
    ...u16(bitsPerSample),
    ...u32(channels === 1 ? 0x4 : 0x3),
    ...u16(subFormat),
    // The rest of the SubFormat GUID: the fixed KSDATAFORMAT_SUBTYPE tail.
    ...u16(0),
    ...u32(0x00100000),
    ...u32(0xaa000080),
    ...u32(0x719b3800),
  ];
}

/** A whole 16-bit PCM WAV: a `fmt ` chunk and a `data` chunk of `samples`. */
export function pcmWav(samples: number[], options: FmtOptions = {}): Uint8Array {
  return riff([...chunk('fmt ', fmtBody(options)), ...chunk('data', samples.flatMap(i16))]);
}

/** `count` interleaved samples of digital silence. */
export function silence(count: number): number[] {
  return Array.from({ length: count }, () => 0);
}

/** A sine wave: `frames` frames at `frequency` Hz, one channel, peaking at `amplitude`. */
export function tone(
  frames: number,
  sampleRate = 16000,
  amplitude = 8000,
  frequency = 440,
): number[] {
  return Array.from({ length: frames }, (_, frame) =>
    Math.round(amplitude * Math.sin((2 * Math.PI * frequency * frame) / sampleRate)),
  );
}
