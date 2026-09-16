import { describe, expect, it } from 'vitest';
import type { WavInspectionPolicy } from '../../types/speech.js';
import { inspectWav } from '../index.js';
import {
  ascii,
  chunk,
  fmtBody,
  INSPECTION_POLICY,
  i16,
  pcmWav,
  riff,
  silence,
  tone,
  u32,
} from './read-aloud-fixtures.js';

/** The inspection, when it read the file. Fails the test when it did not. */
function measured(bytes: Uint8Array, policy: WavInspectionPolicy = INSPECTION_POLICY) {
  const inspection = inspectWav(bytes, policy);
  if (!inspection.valid) {
    throw new Error(`expected readable bytes, got ${inspection.reason}`);
  }
  return inspection;
}

describe('inspectWav()', () => {
  describe('arguments', () => {
    it('reads bytes, not something that merely holds them', () => {
      expect(() => inspectWav([0, 1, 2] as unknown as Uint8Array, INSPECTION_POLICY)).toThrow(
        TypeError,
      );
      expect(() =>
        inspectWav(new ArrayBuffer(8) as unknown as Uint8Array, INSPECTION_POLICY),
      ).toThrow(TypeError);
    });

    it('refuses a silence floor that is not a finite level at or below full scale', () => {
      const bytes = pcmWav(silence(16));

      for (const silenceDbfs of [
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        3,
      ]) {
        expect(() => inspectWav(bytes, { silenceDbfs, frameMs: 20 })).toThrow(RangeError);
      }
      expect(() =>
        inspectWav(bytes, { silenceDbfs: '-50' as unknown as number, frameMs: 20 }),
      ).toThrow(/of type string/);
      expect(() => inspectWav(bytes, null as unknown as WavInspectionPolicy)).toThrow(RangeError);
    });

    it('refuses a window length that is not a finite number of milliseconds above 0', () => {
      const bytes = pcmWav(silence(16));

      for (const frameMs of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => inspectWav(bytes, { silenceDbfs: -50, frameMs })).toThrow(RangeError);
      }
      expect(() =>
        inspectWav(bytes, { silenceDbfs: -50, frameMs: undefined as unknown as number }),
      ).toThrow(/frameMs of type undefined/);
    });

    it('accepts a silence floor of exactly 0 dBFS: only full scale is then voiced', () => {
      const inspection = measured(pcmWav(tone(64)), { silenceDbfs: 0, frameMs: 20 });

      expect(inspection.voicedMs).toBe(0);
    });
  });

  describe('what it refuses to read', () => {
    it('is not a WAV without the RIFF/WAVE signature, or with too few bytes to carry one', () => {
      expect(inspectWav(new Uint8Array([0x52, 0x49, 0x46]), INSPECTION_POLICY)).toEqual({
        valid: false,
        reason: 'not_wav',
      });
      expect(inspectWav(new Uint8Array(new Array(20).fill(0)), INSPECTION_POLICY)).toEqual({
        valid: false,
        reason: 'not_wav',
      });

      const notWave = pcmWav(silence(16));
      notWave.set(ascii('WAVF'), 8);
      expect(inspectWav(notWave, INSPECTION_POLICY)).toEqual({ valid: false, reason: 'not_wav' });
    });

    it('is not a WAV when the samples arrive before the format that describes them', () => {
      const bytes = riff([...chunk('data', silence(8).flatMap(i16)), ...chunk('fmt ', fmtBody())]);

      expect(inspectWav(bytes, INSPECTION_POLICY)).toEqual({ valid: false, reason: 'not_wav' });
    });

    it('is not a WAV without a format chunk at all', () => {
      const bytes = riff([...chunk('LIST', ascii('INFO'))]);

      expect(inspectWav(bytes, INSPECTION_POLICY)).toEqual({ valid: false, reason: 'not_wav' });
    });

    it('reports a format it cannot measure rather than guessing at the samples', () => {
      const unsupported: [string, Uint8Array][] = [
        ['8-bit', pcmWav(silence(8), { bitsPerSample: 8 })],
        ['24-bit', pcmWav(silence(8), { bitsPerSample: 24 })],
        ['compressed', pcmWav(silence(8), { audioFormat: 3 })],
        ['no channels', pcmWav(silence(8), { channels: 0, blockAlign: 2 })],
        ['no sample rate', pcmWav(silence(8), { sampleRate: 0 })],
        ['a frame size that disagrees', pcmWav(silence(8), { blockAlign: 4 })],
        ['a format chunk too short to read', riff([...chunk('fmt ', fmtBody().slice(0, 14))])],
      ];

      for (const [what, bytes] of unsupported) {
        expect([what, inspectWav(bytes, INSPECTION_POLICY)]).toEqual([
          what,
          { valid: false, reason: 'unsupported_encoding' },
        ]);
      }
    });

    it('reports a format chunk cut short of what it declares', () => {
      const cutPcm = riff([...ascii('fmt '), ...u32(16), ...fmtBody().slice(0, 8)]);
      const cutExtensible = riff([
        ...ascii('fmt '),
        ...u32(40),
        // The declared SubFormat is past the end of the file, so what the
        // format really is cannot be read.
        ...fmtBody({ audioFormat: 0xfffe, extensible: true }).slice(0, 16),
      ]);

      expect(inspectWav(cutPcm, INSPECTION_POLICY)).toEqual({
        valid: false,
        reason: 'unsupported_encoding',
      });
      expect(inspectWav(cutExtensible, INSPECTION_POLICY)).toEqual({
        valid: false,
        reason: 'unsupported_encoding',
      });
    });

    it('reports a missing or short data chunk as truncated, never as silence', () => {
      const noData = riff([...chunk('fmt ', fmtBody())]);
      const short = riff([
        ...chunk('fmt ', fmtBody()),
        ...chunk('data', silence(8).flatMap(i16), 4096),
      ]);

      expect(inspectWav(noData, INSPECTION_POLICY)).toEqual({ valid: false, reason: 'truncated' });
      expect(inspectWav(short, INSPECTION_POLICY)).toEqual({ valid: false, reason: 'truncated' });
    });
  });

  describe('what it measures', () => {
    it('measures digital silence as no level at all, and no voiced time', () => {
      const inspection = measured(pcmWav(silence(1600)));

      expect(inspection).toEqual({
        valid: true,
        durationMs: 100,
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
        peakDbfs: Number.NEGATIVE_INFINITY,
        voicedMs: 0,
      });
    });

    it('measures a tone: its peak, and every window of it voiced', () => {
      const samples = tone(1600);
      const peak = Math.max(...samples.map((sample) => Math.abs(sample)));
      const inspection = measured(pcmWav(samples));

      expect(inspection.durationMs).toBe(100);
      expect(inspection.peakDbfs).toBeCloseTo(20 * Math.log10(peak / 32768), 10);
      expect(inspection.voicedMs).toBe(100);
    });

    it('measures a stereo recording in frames, not in samples', () => {
      const frames = 800;
      const samples = tone(frames).flatMap((sample) => [sample, sample]);
      const inspection = measured(pcmWav(samples, { channels: 2 }));

      expect(inspection.channels).toBe(2);
      expect(inspection.durationMs).toBe(50);
      expect(inspection.voicedMs).toBe(50);
    });

    it('measures a recording at another sample rate by its own rate', () => {
      const inspection = measured(pcmWav(tone(2400, 8000), { sampleRate: 8000 }));

      expect(inspection.sampleRate).toBe(8000);
      expect(inspection.durationMs).toBe(300);
      expect(inspection.voicedMs).toBe(300);
    });

    it('reads a WAVE_FORMAT_EXTENSIBLE file whose SubFormat is PCM', () => {
      const inspection = measured(pcmWav(tone(320), { audioFormat: 0xfffe, extensible: true }));

      expect(inspection.durationMs).toBe(20);
      expect(inspection.bitsPerSample).toBe(16);
    });

    it('refuses a WAVE_FORMAT_EXTENSIBLE file whose SubFormat is not PCM', () => {
      const bytes = pcmWav(tone(320), { audioFormat: 0xfffe, extensible: true, subFormat: 3 });

      expect(inspectWav(bytes, INSPECTION_POLICY)).toEqual({
        valid: false,
        reason: 'unsupported_encoding',
      });
    });

    it('walks past a chunk of odd size, whose pad byte is not part of it', () => {
      const bytes = riff([
        ...chunk('fmt ', fmtBody()),
        ...chunk('LIST', ascii('abc')),
        ...chunk('data', tone(1600).flatMap(i16)),
      ]);

      expect(measured(bytes).durationMs).toBe(100);
      expect(measured(bytes).voicedMs).toBe(100);
    });

    it('measures the last window from what is left of the recording', () => {
      // 25 frames at 16 kHz with a 1 ms window: one whole window of silence,
      // then 9 frames of sound, which are 0.5625 ms.
      const samples = [...silence(16), ...new Array(9).fill(12000)];
      const inspection = measured(pcmWav(samples), { silenceDbfs: -50, frameMs: 1 });

      expect(inspection.durationMs).toBe(25 * (1000 / 16000));
      expect(inspection.voicedMs).toBeCloseTo(9 * (1000 / 16000), 12);
    });

    it('counts whole frames only, and reports no level for a file with none', () => {
      const empty = measured(pcmWav([]));
      // Three bytes of data: one whole frame, and half of another.
      const half = riff([...chunk('fmt ', fmtBody()), ...chunk('data', [0x00, 0x40, 0x00])]);

      expect(empty).toMatchObject({
        durationMs: 0,
        voicedMs: 0,
        peakDbfs: Number.NEGATIVE_INFINITY,
      });
      expect(measured(half).durationMs).toBe(1000 / 16000);
    });

    it('reads bytes that start partway into their buffer', () => {
      const bytes = pcmWav(tone(1600));
      const padded = new Uint8Array(bytes.length + 7);
      padded.set(bytes, 7);

      expect(measured(padded.subarray(7))).toEqual(measured(bytes));
    });

    it('counts a window at exactly the silence floor as voiced', () => {
      // A constant amplitude is its own RMS, so the floor can be set to it.
      const amplitude = 1000;
      const level = 20 * Math.log10(amplitude / 32768);
      const bytes = pcmWav(new Array(1600).fill(amplitude));

      expect(measured(bytes, { silenceDbfs: level, frameMs: 20 }).voicedMs).toBe(100);
      expect(measured(bytes, { silenceDbfs: level + 1, frameMs: 20 }).voicedMs).toBe(0);
    });

    it('never reports more voiced time than the recording holds', () => {
      // 11025 Hz with a 6 ms window: 132 frames a window, and 132000/11025 is
      // not a binary-exact number of milliseconds. Three windows of it, summed,
      // land above the one expression the duration is computed with — which is
      // a measurement `SpeechMeasurement` excludes and `gradeReadAloud` throws
      // on, so the return clamps the sum to the whole.
      const sampleRate = 11025;
      const frameMs = 6;
      const frames = 396;
      const unclamped = 3 * ((132 * 1000) / sampleRate);
      const inspection = measured(pcmWav(new Array(frames).fill(8000), { sampleRate }), {
        silenceDbfs: -50,
        frameMs,
      });

      expect(unclamped).toBeGreaterThan((frames * 1000) / sampleRate);
      expect(inspection.durationMs).toBe((frames * 1000) / sampleRate);
      expect(inspection.voicedMs).toBe(inspection.durationMs);
    });

    it('still reports the whole file as voiced when the whole file is', () => {
      const inspection = measured(pcmWav(new Array(1600).fill(8000)));

      expect(inspection.durationMs).toBe(100);
      expect(inspection.voicedMs).toBe(100);
    });
  });
});
