'use client';

/**
 * Turning the blocks a capture node delivers into one mono 16 kHz signal.
 *
 * 16 kHz mono is the rate every mainstream assessor accepts and the rate
 * `inspectWav` measures exactly, while a microphone is opened at whatever rate
 * the device runs at — 44.1 or 48 kHz on most, already 16 kHz on some. The
 * three steps are separated and pure so the arithmetic that decides what a
 * server will measure can be tested without a browser.
 */

/** The capture rate every mainstream assessor accepts. */
export const TARGET_SAMPLE_RATE = 16_000;

/**
 * Where the anti-alias filter stops passing, as a fraction of the target rate.
 *
 * Below 0.5 on purpose: a filter cutting at exactly the target's Nyquist is
 * only 6 dB down there and its transition band folds straight back into the
 * signal. Cutting at 7.2 kHz leaves the transition band room to finish before
 * 8 kHz, and speech carries next to nothing in the 800 Hz that costs.
 */
const CUTOFF_FRACTION = 0.45;

/**
 * Half the kernel width, counted in target-rate sample periods. Sixteen
 * periods of taps is enough Hann-windowed sinc to put a tone an octave above
 * the cutoff far below anything a meter or an assessor would notice, and short
 * enough that filtering a whole take costs a fraction of a second.
 */
const KERNEL_HALF_PERIODS = 8;

/**
 * Averages the channels of one capture block into mono.
 *
 * Always allocates, never returns what it was given: a `ScriptProcessorNode`
 * hands out the same buffer on every callback and overwrites it in place, so a
 * mono capture that passed the input straight through would find every block
 * it had kept replaced by the last one.
 *
 * Channels of unequal length are read to the shortest. Nothing should produce
 * them, and the alternative to a bound is reading past the end of one and
 * poisoning the whole take with NaN.
 */
export function downmix(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) {
    return new Float32Array(0);
  }
  let frames = channels[0].length;
  for (const channel of channels) {
    if (channel.length < frames) {
      frames = channel.length;
    }
  }
  const mono = new Float32Array(frames);
  for (const channel of channels) {
    for (let frame = 0; frame < frames; frame += 1) {
      mono[frame] += channel[frame];
    }
  }
  for (let frame = 0; frame < frames; frame += 1) {
    mono[frame] /= channels.length;
  }
  return mono;
}

/** Concatenates captured blocks into the single signal a take is encoded from. */
export function joinBlocks(blocks: readonly Float32Array[], frames: number): Float32Array {
  const joined = new Float32Array(frames);
  let at = 0;
  for (const block of blocks) {
    joined.set(block, at);
    at += block.length;
  }
  return joined;
}

/**
 * A windowed-sinc low-pass, applied at the input rate before any samples are
 * dropped.
 *
 * Without it, resampling is aliasing: every component above the target's
 * Nyquist folds back down into the speech band as a tone that was never
 * spoken, and an assessor scores what it hears. The window is Hann and the
 * kernel is normalised to unit gain, so a signal already inside the band comes
 * through at its own amplitude.
 *
 * Edges are extended by repeating the first and last sample rather than by
 * zero-padding, which would put a step — and so a click — at each end of every
 * take.
 */
function lowPass(samples: Float32Array, inputRate: number): Float32Array {
  const cutoff = (TARGET_SAMPLE_RATE * CUTOFF_FRACTION) / inputRate;
  const half = Math.max(1, Math.round((KERNEL_HALF_PERIODS * inputRate) / TARGET_SAMPLE_RATE));
  const taps = new Float32Array(half * 2 + 1);
  let gain = 0;
  for (let tap = 0; tap < taps.length; tap += 1) {
    const at = tap - half;
    const angle = 2 * Math.PI * cutoff * at;
    const sinc = at === 0 ? 2 * cutoff : Math.sin(angle) / (Math.PI * at);
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * tap) / (taps.length - 1));
    taps[tap] = sinc * window;
    gain += taps[tap];
  }
  for (let tap = 0; tap < taps.length; tap += 1) {
    taps[tap] /= gain;
  }

  const last = samples.length - 1;
  const filtered = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    let total = 0;
    for (let tap = 0; tap < taps.length; tap += 1) {
      const at = index + tap - half;
      total += taps[tap] * samples[at < 0 ? 0 : at > last ? last : at];
    }
    filtered[index] = total;
  }
  return filtered;
}

/**
 * Resamples mono samples from `inputRate` to {@link TARGET_SAMPLE_RATE}.
 *
 * Every path returns an array the caller owns, the equal-rate one included, so
 * no caller has to know whether it was handed its own buffer back.
 *
 * The filter runs only when the rate is coming down. Interpolating upwards
 * invents no frequencies above the input's own Nyquist, so there is nothing
 * for an anti-alias filter to remove and applying one would only dull a
 * recording a 16 kHz device already captured cleanly.
 */
export function resampleToTarget(samples: Float32Array, inputRate: number): Float32Array {
  if (samples.length === 0) {
    return new Float32Array(0);
  }
  if (inputRate === TARGET_SAMPLE_RATE) {
    return samples.slice();
  }
  const source = inputRate > TARGET_SAMPLE_RATE ? lowPass(samples, inputRate) : samples;
  const length = Math.round((samples.length * TARGET_SAMPLE_RATE) / inputRate);
  const resampled = new Float32Array(length);
  const step = inputRate / TARGET_SAMPLE_RATE;
  const last = source.length - 1;
  for (let index = 0; index < length; index += 1) {
    const at = index * step;
    const left = Math.min(Math.floor(at), last);
    const right = Math.min(left + 1, last);
    const fraction = at - left;
    resampled[index] = source[left] * (1 - fraction) + source[right] * fraction;
  }
  return resampled;
}
