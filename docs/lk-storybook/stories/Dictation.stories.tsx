import { type DictationData, evaluate, redact } from '@intellectif/lk-core';
import { Dictation } from '@intellectif/lk-react/components/Dictation';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, within } from 'storybook/test';

/**
 * A real, silent WAV as a data URI, so the stories need no hosted audio. Two
 * lengths give the dictation two different files, which the schema requires.
 */
function silentWavDataUri(seconds: number): string {
  const rate = 8000;
  const frames = Math.round(rate * seconds);
  const buffer = new ArrayBuffer(44 + frames);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + frames, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, 'data');
  view.setUint32(40, frames, true);
  new Uint8Array(buffer, 44).fill(128);
  let binary = '';
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

const data: DictationData = {
  schemaVersion: '1.0',
  type: 'dictation',
  id: 'sb-dictation',
  title: 'Listen and type the sentence',
  transcript: "The cat isn't on the mat.",
  media: {
    type: 'audio',
    url: silentWavDataUri(0.5),
    alt: 'Recording',
    playback: { seek: 'none', rate: 'fixed' },
  },
  slowMedia: { type: 'audio', url: silentWavDataUri(1), alt: 'Recording, slow' },
  hints: { mode: 'progressive-words' },
  tolerance: { equivalences: [{ from: "isn't", to: 'is not' }] },
  feedback: { correct: 'Well heard!', incorrect: 'Play it once more.' },
};

const attempt = { type: 'dictation', text: 'cat is not on the met now' } as const;

const meta: Meta<typeof Dictation> = {
  title: 'Activities/Dictation',
  component: Dictation,
  args: { data, onComplete: fn(), onSubmit: fn(), onInteraction: fn() },
};
export default meta;

type Story = StoryObj<typeof Dictation>;

/** Practice: two recordings, progressive hints, local marking on check. */
export const Practice: Story = {};

/** The marked result: a missing word, a wrong one with its character diff, an extra one. */
export const Marked: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Reveal the next word/ }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Type what you hear' }), attempt.text);
    await userEvent.click(canvas.getByRole('button', { name: 'Check answers' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Show solution' }));
  },
};

/** Exam: a redacted projection — no transcript, no hints, no marks; both recordings still play. */
export const ExamRedacted: Story = {
  args: {
    data: redact(data) as unknown as DictationData,
    renderMode: 'exam',
  },
};

/**
 * Review with no transcript on the client: the word list is rebuilt from the
 * stored scoring details of the server's outcome. No character diff and no
 * solution, because there is nothing to compare against.
 */
export const ReviewFromDetails: Story = {
  args: {
    data: redact(data) as unknown as DictationData,
    renderMode: 'review',
    defaultValue: attempt,
    outcome: evaluate(data, attempt),
  },
};

/**
 * Review with the key revealed after submit: `redact(data, { reveal: 'after-submit' })`
 * keeps the transcript, so the full marks — character diff, legend and the
 * solution toggle — render from the same alignment the scorer used.
 */
export const ReviewFromAfterSubmitProjection: Story = {
  args: {
    data: redact(data, { reveal: 'after-submit' }) as unknown as DictationData,
    renderMode: 'review',
    defaultValue: attempt,
    outcome: evaluate(data, attempt),
  },
};

export const Disabled: Story = { args: { disabled: true } };
