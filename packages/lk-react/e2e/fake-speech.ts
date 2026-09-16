import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The audio chromium's fake microphone plays into `read-aloud.spec.ts`.
 *
 * `--use-fake-device-for-media-stream` on its own is not enough, and the way it
 * falls short is worth writing down because the symptom accuses the wrong code.
 * The device chromium synthesises is a BEEP — a short tone with long gaps — so
 * a four-second take carries about a second of sound. The example app measures
 * what it stored with `inspectWav`, hands the measurement to `gradeReadAloud`,
 * and the eleven recognised words of its canned evidence come out at more than
 * ten words per second of voiced audio. The demo's plausibility policy refuses
 * that take as `implausible_speech_rate` — correctly: refusing a cough that
 * claims to be a sentence is the whole point of a plausibility policy — and no
 * pronunciation feedback ever renders. The spec would fail against working
 * code, for a reason no assertion names.
 *
 * Chromium will play a file in place of that beep, so the spec supplies one: an
 * unbroken tone, which every frame of `inspectWav` reads as voiced. It is
 * generated rather than committed because a megabyte of PCM is not reviewable,
 * and because the one property the spec depends on — level that never drops for
 * longer than any take — is easier to check as arithmetic than to trust in a
 * binary blob.
 *
 * The tone is not speech and does not pretend to be: nothing in the demo
 * listens to the recording, and the marks it renders are canned. What the audio
 * has to do is be *there*, so that what the spec proves is the real path —
 * capture, WAV encoding, measurement, grading — and not a page that would have
 * rendered the same marks from silence.
 */

/**
 * Under the gitignored `.playwright/`, deliberately not under Playwright's own
 * `test-results/`: that directory is emptied when a run starts, and this file
 * has to outlive global setup and still be readable when a browser launches.
 */
export const FAKE_SPEECH_WAV = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '.playwright',
  'fake-speech.wav',
);

/** 16-bit mono PCM, which is the only shape chromium's file capture accepts. */
const SAMPLE_RATE = 48_000;
const BYTES_PER_SAMPLE = 2;
const HEADER_BYTES = 44;

/**
 * Comfortably longer than any take the suite records, because the capture is
 * started with `%noloop`: past the end of the file the device goes silent, and
 * a take that ran off the end would be measured as half speech and half
 * silence — the beep's failure again, wearing a different hat.
 */
const SECONDS = 15;

/**
 * A mid-range tone at half of full scale. Loud enough that every 20 ms frame
 * sits far above the demo's -45 dBFS silence floor, quiet enough that the
 * encoder's clamp is never the thing under test.
 */
const FREQUENCY_HZ = 300;
const AMPLITUDE = 0.5;

/** Writes the tone, creating `.playwright/` on a clean checkout. */
export function writeFakeSpeechWav(): void {
  const frames = SAMPLE_RATE * SECONDS;
  const dataBytes = frames * BYTES_PER_SAMPLE;
  const wav = new Uint8Array(HEADER_BYTES + dataBytes);
  const view = new DataView(wav.buffer);
  const ascii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  ascii(0, 'RIFF');
  view.setUint32(4, HEADER_BYTES - 8 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM, uncompressed
  view.setUint16(22, 1, true); // one channel
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * BYTES_PER_SAMPLE, true); // byte rate
  view.setUint16(32, BYTES_PER_SAMPLE, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let frame = 0; frame < frames; frame += 1) {
    const phase = (2 * Math.PI * FREQUENCY_HZ * frame) / SAMPLE_RATE;
    view.setInt16(
      HEADER_BYTES + frame * BYTES_PER_SAMPLE,
      Math.round(AMPLITUDE * Math.sin(phase) * 0x7fff),
      true,
    );
  }

  mkdirSync(dirname(FAKE_SPEECH_WAV), { recursive: true });
  writeFileSync(FAKE_SPEECH_WAV, wav);
}
