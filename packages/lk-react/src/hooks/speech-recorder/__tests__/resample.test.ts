import { describe, expect, it } from 'vitest';
import { downmix, joinBlocks, resampleToTarget, TARGET_SAMPLE_RATE } from '../resample.js';

function tone(hz: number, rate: number, seconds: number, amplitude = 1): Float32Array {
  const samples = new Float32Array(Math.round(rate * seconds));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = amplitude * Math.sin((2 * Math.PI * hz * index) / rate);
  }
  return samples;
}

/**
 * The level of a signal, ignoring the first and last hundred samples.
 *
 * The filter's kernel reaches past each end of a take, so the very edges carry
 * its transient. What a downmix or an alias does to the body of a recording is
 * what these tests are about.
 */
function body(samples: Float32Array): number {
  const inner = samples.subarray(100, samples.length - 100);
  let total = 0;
  for (const sample of inner) {
    total += sample * sample;
  }
  return Math.sqrt(total / inner.length);
}

describe('downmix', () => {
  it('averages the channels into one', () => {
    const left = new Float32Array([1, 0, -1]);
    const right = new Float32Array([0, 0, 1]);
    expect(Array.from(downmix([left, right]))).toEqual([0.5, 0, 0]);
  });

  it('copies, so a buffer the engine reuses cannot rewrite a captured block', () => {
    // A ScriptProcessorNode hands out the same array on every callback. A mono
    // downmix that passed it through would find every block it kept replaced by
    // whatever the microphone heard a few milliseconds later.
    const reused = new Float32Array([0.25, 0.25]);
    const captured = downmix([reused]);
    reused.fill(0.9);
    expect(Array.from(captured)).toEqual([0.25, 0.25]);
  });

  it('reads ragged channels to the shortest, whichever one that is', () => {
    // Either order, because reading past the end of one channel poisons the
    // whole take with NaN and neither channel is the one to trust.
    const short = new Float32Array([1, 1, 1]);
    const long = new Float32Array([1, 1, 1, 1]);
    expect(Array.from(downmix([short, long]))).toEqual([1, 1, 1]);
    expect(Array.from(downmix([long, short]))).toEqual([1, 1, 1]);
  });

  it('has nothing to average when there are no channels', () => {
    expect(downmix([])).toHaveLength(0);
  });
});

describe('joinBlocks', () => {
  it('lays the blocks end to end in the order they arrived', () => {
    expect(
      Array.from(
        joinBlocks([new Float32Array([1, 2]), new Float32Array([3]), new Float32Array(0)], 3),
      ),
    ).toEqual([1, 2, 3]);
  });
});

describe('resampleToTarget', () => {
  it('copies a device already running at the target rate', () => {
    const captured = tone(1000, TARGET_SAMPLE_RATE, 0.1);
    const resampled = resampleToTarget(captured, TARGET_SAMPLE_RATE);
    expect(resampled).not.toBe(captured);
    expect(Array.from(resampled)).toEqual(Array.from(captured));
  });

  it('brings 48 kHz down to the rate the SDK measures', () => {
    const resampled = resampleToTarget(tone(1000, 48_000, 0.5), 48_000);
    expect(resampled).toHaveLength(8000);
    expect(body(resampled)).toBeCloseTo(Math.SQRT1_2, 2);
  });

  it('brings 44.1 kHz down without changing what was said', () => {
    const resampled = resampleToTarget(tone(1000, 44_100, 0.5), 44_100);
    expect(resampled).toHaveLength(8000);
    expect(body(resampled)).toBeCloseTo(Math.SQRT1_2, 2);
  });

  it('removes what would otherwise fold back into the speech band', () => {
    // 12 kHz decimated to 16 kHz without a filter comes back as a strong 4 kHz
    // tone that was never spoken — right in the middle of speech, and an
    // assessor would score it.
    expect(body(resampleToTarget(tone(12_000, 48_000, 0.5), 48_000))).toBeLessThan(0.005);
  });

  it('interpolates upwards from a device below the target rate', () => {
    const resampled = resampleToTarget(tone(500, 8000, 0.5), 8000);
    expect(resampled).toHaveLength(8000);
    // Within a percent: interpolating between samples cuts the corner at each
    // crest, which is a hair of level and no anti-alias filter's business —
    // there is nothing above the input's own Nyquist to remove.
    expect(body(resampled)).toBeCloseTo(Math.SQRT1_2, 1);
  });

  it('has nothing to resample in a take with no samples', () => {
    expect(resampleToTarget(new Float32Array(0), 48_000)).toHaveLength(0);
  });
});
