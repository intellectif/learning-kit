'use client';

/**
 * 16-bit PCM WAV, and the two level measurements taken over the same samples.
 *
 * This is the one format the SDK's `inspectWav` reads, so these bytes are the
 * bytes a server measures a take with — anything else would need a decoder on
 * the application's side before a grade could exist. Nothing here touches Web
 * Audio, which is why the encoder can be unit tested against `inspectWav`
 * itself rather than against a browser.
 */

/** The media type of what {@link encodeWav16} returns. */
export const WAV_MIME_TYPE = 'audio/wav';

/** RIFF + a 16-byte `fmt ` + `data`, every field fixed-size. */
const HEADER_BYTES = 44;

/** Writes four ASCII characters, which is all a RIFF tag ever is. */
function writeTag(view: DataView, offset: number, tag: string): void {
  for (let index = 0; index < tag.length; index += 1) {
    view.setUint8(offset + index, tag.charCodeAt(index));
  }
}

/**
 * Encodes mono samples as a 16-bit PCM WAV.
 *
 * The two scale factors are not a typo. Signed 16-bit runs from -32768 to
 * 32767, so a single factor cannot reach full scale in both directions: 0x7fff
 * throughout leaves a full-scale negative peak reading -0.99997, and 0x8000
 * throughout overflows into the positive at +1. Each sign gets the factor that
 * lands exactly on its own limit.
 *
 * The buffer is named in the return type because a `Blob` refuses a view that
 * might be backed by a `SharedArrayBuffer`, and these bytes go straight into
 * one.
 */
export function encodeWav16(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const dataBytes = samples.length * 2;
  const bytes = new Uint8Array(HEADER_BYTES + dataBytes);
  const view = new DataView(bytes.buffer);

  writeTag(view, 0, 'RIFF');
  view.setUint32(4, HEADER_BYTES - 8 + dataBytes, true);
  writeTag(view, 8, 'WAVE');
  writeTag(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM, uncompressed
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate: one channel of two bytes
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeTag(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
    view.setInt16(
      HEADER_BYTES + index * 2,
      Math.round(clamped * (clamped < 0 ? 0x8000 : 0x7fff)),
      true,
    );
  }
  return bytes;
}

/** The loudest sample, 0..1 — what a take reports as its `peakLevel`. */
export function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const magnitude = Math.abs(samples[index]);
    if (magnitude > peak) {
      peak = magnitude;
    }
  }
  return peak > 1 ? 1 : peak;
}

/**
 * Root mean square, 0..1 — what the recorder reports as its `level`.
 *
 * RMS rather than the peak, because a meter driven by peaks sits near full
 * scale on any speech at all and tells a learner nothing about whether they
 * are being heard. It is also the measure `inspectWav` decides voiced time
 * with, so what the meter shows and what the server later counts as speech are
 * the same quantity.
 */
export function rmsOf(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let total = 0;
  for (let index = 0; index < samples.length; index += 1) {
    total += samples[index] * samples[index];
  }
  const rms = Math.sqrt(total / samples.length);
  return rms > 1 ? 1 : rms;
}
