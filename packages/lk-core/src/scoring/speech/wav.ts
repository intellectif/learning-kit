/**
 * Measuring a recording from its bytes: how long it is, how loud it gets, and
 * how much of it is voiced.
 *
 * This is the server's own evidence about a take. A duration a browser reported
 * is a claim, and a claim decides nothing: whether a recording holds enough
 * speech to grade is answered from the samples. Only 16-bit PCM WAV is read —
 * the one encoding an application can produce without a decoder — and anything
 * else is reported as unread rather than guessed at.
 *
 * Isomorphic: a `DataView` over the caller's bytes, no `Buffer`, no `node:`
 * imports, and no allocation proportional to the audio.
 */
import type { WavInspection, WavInspectionPolicy } from '../../types/speech.js';

/** `RIFF` + the file size + `WAVE`, before the first chunk. */
const HEADER_BYTES = 12;
/** A chunk's four-character id and its little-endian size. */
const CHUNK_HEADER_BYTES = 8;
/** `audioFormat`, `channels`, `sampleRate`, `byteRate`, `blockAlign`, `bitsPerSample`. */
const FMT_MIN_BYTES = 16;
/** WAVE_FORMAT_EXTENSIBLE carries a `SubFormat` GUID; the chunk is this long with it. */
const EXTENSIBLE_BYTES = 40;
/** Where the `SubFormat` GUID starts inside the `fmt ` body. Its first two bytes are the real format. */
const SUBFORMAT_OFFSET = 24;
/** Uncompressed PCM, as `audioFormat` and as the first two bytes of a `SubFormat`. */
const FORMAT_PCM = 1;
/** WAVE_FORMAT_EXTENSIBLE: the real format is in the `SubFormat` GUID. */
const FORMAT_EXTENSIBLE = 0xfffe;
/** The only sample width read. */
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = 2;
/** Full scale for a 16-bit sample: `-32768` is the loudest a sample can be. */
const FULL_SCALE = 32768;

/** The part of a `fmt ` chunk the measurement needs. */
interface WavFormat {
  channels: number;
  sampleRate: number;
  blockAlign: number;
}

/** A value named in an error message, without serialising the object it came from. */
function describeValue(value: unknown): string {
  return typeof value === 'number' ? String(value) : `of type ${typeof value}`;
}

/** The four-character chunk id at `offset`. */
function tagAt(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * The `fmt ` chunk when it describes 16-bit PCM this reader can measure, and
 * `undefined` for anything else — a compressed stream, 8- or 24-bit samples, a
 * channel count or sample rate of 0, a `blockAlign` that disagrees with them,
 * or a chunk too short to say.
 */
function formatAt(view: DataView, body: number, size: number): WavFormat | undefined {
  if (size < FMT_MIN_BYTES || body + FMT_MIN_BYTES > view.byteLength) {
    return undefined;
  }
  const audioFormat = view.getUint16(body, true);
  const channels = view.getUint16(body + 2, true);
  const sampleRate = view.getUint32(body + 4, true);
  const blockAlign = view.getUint16(body + 12, true);
  const bitsPerSample = view.getUint16(body + 14, true);
  const pcm =
    audioFormat === FORMAT_PCM ||
    (audioFormat === FORMAT_EXTENSIBLE &&
      size >= EXTENSIBLE_BYTES &&
      body + EXTENSIBLE_BYTES <= view.byteLength &&
      view.getUint16(body + SUBFORMAT_OFFSET, true) === FORMAT_PCM);
  if (
    !pcm ||
    bitsPerSample !== BITS_PER_SAMPLE ||
    channels < 1 ||
    sampleRate < 1 ||
    blockAlign !== channels * BYTES_PER_SAMPLE
  ) {
    return undefined;
  }
  return { channels, sampleRate, blockAlign };
}

/**
 * Reads a 16-bit PCM WAV and measures it: `durationMs`, `sampleRate`,
 * `channels`, the loudest sample as `peakDbfs`, and `voicedMs`, the time in
 * windows whose RMS level reaches the policy's silence floor.
 *
 * Anything it cannot measure comes back as `{ valid: false, reason }` rather
 * than a guess: `not_wav` for bytes that are not a RIFF/WAVE file, or whose
 * chunks do not describe the audio before the audio arrives;
 * `unsupported_encoding` for a WAV this reader does not read (compressed, or
 * samples that are not 16-bit); `truncated` when the data chunk is missing or
 * shorter than it declares.
 *
 * Both policy fields are required, because neither has an answer that is right
 * for every microphone: `silenceDbfs` is where an application draws the line
 * between silence and speech, and `frameMs` is how finely it looks.
 *
 * Pure and deterministic. It never throws on the bytes themselves — only on
 * arguments it cannot use.
 *
 * @throws TypeError when `bytes` is not a `Uint8Array`.
 * @throws RangeError when `silenceDbfs` is not a finite number at or below 0,
 * or `frameMs` is not a finite number above 0.
 */
export function inspectWav(bytes: Uint8Array, policy: WavInspectionPolicy): WavInspection {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("inspectWav reads a recording's bytes: pass a Uint8Array of the WAV file.");
  }
  const silenceDbfs = policy?.silenceDbfs;
  if (typeof silenceDbfs !== 'number' || !Number.isFinite(silenceDbfs) || silenceDbfs > 0) {
    throw new RangeError(
      `Invalid inspection policy (silenceDbfs ${describeValue(silenceDbfs)}): expected a finite number of dBFS at or below 0, full scale being 0.`,
    );
  }
  const frameMs = policy?.frameMs;
  if (typeof frameMs !== 'number' || !Number.isFinite(frameMs) || frameMs <= 0) {
    throw new RangeError(
      `Invalid inspection policy (frameMs ${describeValue(frameMs)}): expected a finite window length in milliseconds, above 0.`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < HEADER_BYTES || tagAt(view, 0) !== 'RIFF' || tagAt(view, 8) !== 'WAVE') {
    return { valid: false, reason: 'not_wav' };
  }

  let format: WavFormat | undefined;
  let data: { offset: number; declared: number } | undefined;
  let offset = HEADER_BYTES;
  // A chunk's body is followed by a pad byte when its size is odd, so a walk
  // that ignored the pad would read the next id one byte late.
  while (offset + CHUNK_HEADER_BYTES <= view.byteLength) {
    const id = tagAt(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + CHUNK_HEADER_BYTES;
    if (id === 'fmt ') {
      format = formatAt(view, body, size);
      if (format === undefined) {
        return { valid: false, reason: 'unsupported_encoding' };
      }
    } else if (id === 'data') {
      // Samples before the format that describes them: the file cannot be read
      // in one pass, and a reader that seeks back is reading a broken file.
      if (format === undefined) {
        return { valid: false, reason: 'not_wav' };
      }
      data = { offset: body, declared: size };
      break;
    }
    offset = body + size + (size % 2);
  }
  if (format === undefined) {
    return { valid: false, reason: 'not_wav' };
  }
  if (data === undefined || data.declared > view.byteLength - data.offset) {
    return { valid: false, reason: 'truncated' };
  }

  const { channels, sampleRate, blockAlign } = format;
  // Whole frames only: a trailing half-frame is not a sample of every channel.
  const frames = Math.floor(data.declared / blockAlign);
  const samples = frames * channels;

  let peak = 0;
  for (let index = 0; index < samples; index += 1) {
    const magnitude = Math.abs(view.getInt16(data.offset + index * BYTES_PER_SAMPLE, true));
    if (magnitude > peak) {
      peak = magnitude;
    }
  }

  const windowFrames = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  let voicedMs = 0;
  for (let start = 0; start < frames; start += windowFrames) {
    // The last window is as long as what is left of the recording.
    const windowLength = Math.min(windowFrames, frames - start);
    const windowSamples = windowLength * channels;
    let sum = 0;
    for (let index = 0; index < windowSamples; index += 1) {
      const sample =
        view.getInt16(data.offset + (start * channels + index) * BYTES_PER_SAMPLE, true) /
        FULL_SCALE;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / windowSamples);
    const db = rms > 0 ? 20 * Math.log10(rms) : Number.NEGATIVE_INFINITY;
    if (db >= silenceDbfs) {
      voicedMs += (windowLength * 1000) / sampleRate;
    }
  }

  const durationMs = (frames * 1000) / sampleRate;
  return {
    valid: true,
    durationMs,
    sampleRate,
    channels,
    bitsPerSample: BITS_PER_SAMPLE,
    // Digital silence has no level to report, and neither has a file with no
    // frames: `-Infinity` says so, where a 0 would read as full scale.
    peakDbfs: peak === 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(peak / FULL_SCALE),
    // Two measurements of one recording that must agree: the voiced time is
    // added window by window, the duration is a single expression, and at a
    // sample rate where a window is not a binary-exact number of milliseconds
    // the sum can land a hair above the whole. `SpeechMeasurement` says voiced
    // time is at most the duration and `gradeReadAloud` throws on a pair that
    // is not, so the clamp makes the measurement consistent by construction
    // rather than leaving a grading job to crash on the SDK's own output.
    voicedMs: Math.min(voicedMs, durationMs),
  };
}
