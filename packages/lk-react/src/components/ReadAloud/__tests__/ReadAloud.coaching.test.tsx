import {
  type AiCoachingRequest,
  type AiCoachingResult,
  type GradeRecord,
  outcomeFromGrade,
  type ReadAloudData,
  type SpeechAssessment,
} from '@intellectif/lk-core';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordedTake } from '../../../hooks/useSpeechRecorder.js';
import { type SpeechCaptureHarness, stubSpeechCapture } from '../../../test-support/speech.js';
import { ActivitySequence } from '../../ActivitySequence/index.js';
import { ReadAloud } from '../index.js';
import type { RecordingBinding } from '../ReadAloud.js';

/**
 * Coaching inside `<ReadAloud>`: under the marks in `practice` once a take is
 * graded, and in `review` wherever marks are shown — from kept evidence, or
 * from the stored grade's details. Never in `exam`. The rules themselves are
 * the panel's and the hook's, tested with them; what is under test here is
 * that the component hands them what it has.
 */

let harness: SpeechCaptureHarness | undefined;

beforeEach(() => {
  harness = stubSpeechCapture();
});

afterEach(() => {
  cleanup();
  harness?.restore();
  harness = undefined;
  vi.restoreAllMocks();
});

const data: ReadAloudData = {
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'ra1',
  title: 'Read the sentence',
  referenceText: 'The weather is lovely today.',
  locale: 'en-US',
  recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 3 },
  scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
};

const assessment: SpeechAssessment = {
  assessmentVersion: '1.0',
  status: 'assessed',
  task: 'scripted',
  locale: 'en-US',
  referenceText: data.referenceText,
  recordingKey: 'take-1',
  assessor: { kind: 'auto' },
  scale: 100,
  scores: { accuracy: 76 },
  miscue: 'assessor',
  phonemeAlphabet: 'ipa',
  words: [
    { text: 'The', accuracy: 95, error: 'none' },
    { text: 'weather', accuracy: 90, error: 'none' },
    { text: 'is', accuracy: 92, error: 'none' },
    {
      text: 'lovely',
      accuracy: 40,
      error: 'mispronunciation',
      phonemes: [{ symbol: 'ʌ', accuracy: 20, heardAs: [{ symbol: 'oʊ', score: 60 }] }],
    },
    { text: 'today', accuracy: 85, error: 'none' },
  ],
};

const grade: GradeRecord = {
  score: 0.76,
  maxScore: 1,
  passed: true,
  feedback: 'Clear and steady.',
  criteria: [{ name: 'accuracy', score: 76, maxScore: 100, weight: 1 }],
  details: [
    {
      itemId: 'w4',
      outcome: 'incorrect',
      learnerResponse: 'lovely',
      correctResponse: 'lovely',
      weight: 1,
      score: 0.4,
    },
    {
      itemId: 'w5',
      outcome: 'correct',
      learnerResponse: 'today',
      correctResponse: 'today',
      weight: 1,
      score: 0.85,
    },
  ],
};

const coached: AiCoachingResult = {
  text: 'One word to practise.',
  words: [{ itemId: 'w4', tip: 'Keep the first vowel short.' }],
};

const port = () =>
  vi.fn(async (_request: AiCoachingRequest, _options: { signal: AbortSignal }) => coached);

const COACH = 'Coach me on this reading';

function graded(): RecordingBinding {
  return {
    upload: async (take: RecordedTake) => ({
      key: 'take-1',
      mimeType: take.mimeType,
      durationMs: take.durationMs,
    }),
    assess: async () => ({ status: 'graded', assessment, grade }),
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 20; tick += 1) {
      await Promise.resolve();
    }
  });
}

async function recordAndSubmit(user: UserEvent): Promise<void> {
  const capture = harness as SpeechCaptureHarness;
  await user.click(screen.getByRole('button', { name: /^Record/ }));
  await flush();
  act(() => {
    capture.pushLevel(0.5, Math.round(capture.sampleRate * 2));
  });
  await user.click(screen.getByRole('button', { name: 'Stop recording' }));
  await user.click(screen.getByRole('button', { name: 'Submit' }));
  await flush();
}

describe('<ReadAloud> coaching', () => {
  it('is offered in practice once the take is graded — not before — and is told the marks with their sounds', async () => {
    const user = userEvent.setup();
    const pronunciationCoaching = port();
    render(<ReadAloud data={data} recordingBinding={graded()} ai={{ pronunciationCoaching }} />);
    expect(screen.queryByRole('button', { name: COACH })).toBeNull();
    await recordAndSubmit(user);
    await user.click(screen.getByRole('button', { name: COACH }));
    const request = pronunciationCoaching.mock.calls[0]?.[0] as AiCoachingRequest;
    expect(request.facts.words[3]).toMatchObject({
      itemId: 'w4',
      state: 'mispronounced',
      sounds: [{ symbol: 'ʌ', heardAs: [{ symbol: 'oʊ', score: 60 }] }],
    });
    expect(request.grade).toEqual({ score: 0.76, maxScore: 1, passed: true });
    const panel = await screen.findByRole('region', { name: 'Coaching on your reading' });
    expect(within(panel).getByText('Keep the first vowel short.')).toBeInTheDocument();
  });

  it('is offered in review on kept evidence, and on the marks a stored grade reads back', async () => {
    const user = userEvent.setup();
    const pronunciationCoaching = port();
    const outcome = outcomeFromGrade(grade);
    render(
      <ReadAloud
        data={data}
        renderMode="review"
        outcome={outcome}
        assessment={assessment}
        ai={{ pronunciationCoaching }}
      />,
    );
    expect(screen.getByRole('button', { name: COACH })).toBeInTheDocument();
    cleanup();

    const { container } = render(
      <ReadAloud
        data={data}
        renderMode="review"
        outcome={outcome}
        ai={{ pronunciationCoaching }}
      />,
    );
    // Under the stored marks, which is the only place marks are on screen.
    const marks = container.querySelector('.lk-ra-marks') as HTMLElement;
    await user.click(within(marks).getByRole('button', { name: COACH }));
    const request = pronunciationCoaching.mock.calls[0]?.[0] as AiCoachingRequest;
    expect(request.facts.words.map((word) => [word.itemId, word.state])).toEqual([
      ['w4', 'mispronounced'],
      ['w5', 'correct'],
    ]);
    expect(request.facts.words.some((word) => word.sounds !== undefined)).toBe(false);
    expect(await within(marks).findByText('Keep the first vowel short.')).toBeInTheDocument();
  });

  it('is not offered on the stored marks where the paper or the author switched AI explanations off', () => {
    const ai = { pronunciationCoaching: port() };
    const outcome = outcomeFromGrade(grade);
    for (const props of [
      { delivery: { ai: { explanations: false } } },
      { data: { ...data, ai: { explanations: false } } },
    ]) {
      const { container } = render(
        <ReadAloud data={data} renderMode="review" outcome={outcome} ai={ai} {...props} />,
      );
      // The stored marks are there; coaching on them is not.
      expect(container.querySelector('.lk-ra-marks'), JSON.stringify(props)).not.toBeNull();
      expect(screen.queryByRole('button', { name: COACH }), JSON.stringify(props)).toBeNull();
      cleanup();
    }
  });

  it('is not offered where the paper shows no feedback, or the author switched explanations off', () => {
    const ai = { pronunciationCoaching: port() };
    const outcome = outcomeFromGrade(grade);
    for (const props of [
      { delivery: { feedback: false } },
      { delivery: { ai: { explanations: false } } },
      { data: { ...data, ai: { explanations: false } } },
    ]) {
      render(
        <ReadAloud
          data={data}
          renderMode="review"
          outcome={outcome}
          assessment={assessment}
          ai={ai}
          {...props}
        />,
      );
      expect(screen.queryByRole('button', { name: COACH }), JSON.stringify(props)).toBeNull();
      cleanup();
    }
  });

  it('is handed down by a question set in review, and never by one sat as an exam', () => {
    const pronunciationCoaching = port();
    render(
      <ActivitySequence
        activities={[data]}
        renderMode="review"
        outcomes={{ '0': outcomeFromGrade(grade) }}
        ai={{ pronunciationCoaching }}
      />,
    );
    expect(screen.getByRole('button', { name: COACH })).toBeInTheDocument();
    cleanup();
    render(
      <ActivitySequence
        activities={[data]}
        renderMode="exam"
        recordingBinding={graded()}
        ai={{ pronunciationCoaching }}
      />,
    );
    expect(screen.queryByRole('button', { name: COACH })).toBeNull();
  });
});
