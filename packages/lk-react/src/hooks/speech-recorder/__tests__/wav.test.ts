import { inspectWav } from '@intellectif/lk-core';
import { describe, expect, it } from 'vitest';
import { TARGET_SAMPLE_RATE } from '../resample.js';
import { encodeWav16, peakOf, rmsOf, WAV_MIME_TYPE } from '../wav.js';

/**
 * A measurement policy, not an assertion about one. Every expectation below is
 * about the bytes the encoder wrote; the policy only has to be one `inspectWav`
 * accepts.
 */
const POLICY = { silenceDbfs: -45, frameMs: 20 };

/** Runs the encoder's output through the SDK function a server measures it with. */
function measure(samples: Float32Array) {
  const wav = inspectWav(encodeWav16(samples, TARGET_SAMPLE_RATE), POLICY);
  if (!wav.valid) {
    throw new Error(`inspectWav refused the encoder's output: ${wav.reason}`);
  }
  return wav;
}

function steady(amplitude: number, seconds: number): Float32Array {
  return new Float32Array(Math.round(TARGET_SAMPLE_RATE * seconds)).fill(amplitude);
}

function tone(hz: number, seconds: number, amplitude: number): Float32Array {
  const samples = new Float32Array(Math.round(TARGET_SAMPLE_RATE * seconds));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = amplitude * Math.sin((2 * Math.PI * hz * index) / TARGET_SAMPLE_RATE);
  }
  return samples;
}

/** The encoded samples, read back as the signed 16-bit integers they are. */
function pcmOf(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pcm: number[] = [];
  for (let at = 44; at < bytes.length; at += 2) {
    pcm.push(view.getInt16(at, true));
  }
  return pcm;
}

describe('encodeWav16', () => {
  it('writes a file inspectWav reads, in the shape the SDK requires', () => {
    const wav = measure(tone(440, 1.25, 0.5));
    expect(wav.sampleRate).toBe(TARGET_SAMPLE_RATE);
    expect(wav.channels).toBe(1);
    expect(wav.bitsPerSample).toBe(16);
    expect(wav.durationMs).toBe(1250);
    expect(wav.voicedMs).toBe(1250);
  });

  it('carries the level the samples carry', () => {
    // Half of full scale, so the measured peak is a number that can be checked
    // rather than whichever sample a sine happened to land nearest its crest on.
    expect(measure(steady(0.5, 0.25)).peakDbfs).toBeCloseTo(-6.02, 2);
  });

  it('measures digital silence as silence, not as full scale', () => {
    const wav = measure(steady(0, 0.5));
    expect(wav.durationMs).toBe(500);
    expect(wav.voicedMs).toBe(0);
    expect(wav.peakDbfs).toBe(Number.NEGATIVE_INFINITY);
  });

  it('clamps past full scale in both directions instead of wrapping', () => {
    // Wrapping is the failure this guards: 2.0 scaled and truncated into 16
    // bits comes back as a loud negative sample, which reads as a click.
    expect(pcmOf(encodeWav16(new Float32Array([2, -2, 1, -1, 0]), TARGET_SAMPLE_RATE))).toEqual([
      32767, -32768, 32767, -32768, 0,
    ]);
  });

  it('writes a RIFF header even for a take with no samples', () => {
    const bytes = encodeWav16(new Float32Array(0), TARGET_SAMPLE_RATE);
    expect(bytes).toHaveLength(44);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.subarray(8, 12))).toBe('WAVE');
    expect(measure(new Float32Array(0)).durationMs).toBe(0);
  });

  it('declares the media type a take is uploaded under', () => {
    expect(WAV_MIME_TYPE).toBe('audio/wav');
  });
});

describe('peakOf', () => {
  it('is the loudest magnitude, either side of zero', () => {
    expect(peakOf(new Float32Array([0.2, -0.75, 0.5]))).toBeCloseTo(0.75, 6);
  });

  it('is zero for no samples, and never above one', () => {
    expect(peakOf(new Float32Array(0))).toBe(0);
    expect(peakOf(new Float32Array([4, -9]))).toBe(1);
  });
});

describe('rmsOf', () => {
  it('is the root mean square of the block', () => {
    expect(rmsOf(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5, 6);
    expect(rmsOf(new Float32Array([1, 0, -1, 0]))).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('is zero for no samples, and never above one', () => {
    expect(rmsOf(new Float32Array(0))).toBe(0);
    expect(rmsOf(new Float32Array([3, -3]))).toBe(1);
  });
});
