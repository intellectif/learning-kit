import type {
  ActivityResult,
  GradeRecord,
  InteractionEvent,
  ItemOutcome,
  LearnerResponse,
  SpeakingResponseData,
  SpeechAssessment,
} from '@intellectif/lk-core';
import { outcomeFromGrade, redact, validateXAPIStatement } from '@intellectif/lk-core';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordedTake } from '../../../hooks/useSpeechRecorder.js';
import { checkA11y } from '../../../test-support/a11y.js';
import { stubMediaElement } from '../../../test-support/media.js';
import { type SpeechCaptureHarness, stubSpeechCapture } from '../../../test-support/speech.js';
import { ActivitySequence } from '../../ActivitySequence/index.js';
import type { RecordingBinding } from '../../ReadAloud/ReadAloud.js';
import { asRenderable } from '../../types.js';
import { SpeakingResponse } from '../index.js';
import type { SpeakingAssessResult } from '../SpeakingResponse.js';
import { SpeakingResponse as SpeakingResponseCore } from '../SpeakingResponse.js';

let harness: SpeechCaptureHarness | undefined;

afterEach(() => {
  cleanup();
  harness?.restore();
  harness = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(() => {
  harness = stubSpeechCapture();
});

const TRANSCRIPT = 'um I think the city is more better for young people';

const data: SpeakingResponseData = {
  schemaVersion: '1.0',
  type: 'speaking-response',
  id: 'sr1',
  title: 'City or country',
  instructions: 'Answer in about a minute.',
  prompt: 'Would you rather live in a city or in the country? Say why.',
  locale: 'en-US',
  recording: { maxSeconds: 60, maxTakes: 3 },
  rubric: {
    criteria: [
      { name: 'Content', weight: 2 },
      { name: 'Pronunciation', weight: 1, measure: 'pronunciation' },
    ],
  },
  feedback: { correct: 'Well said.', incorrect: 'Try again.' },
};

const assessment: SpeechAssessment = {
  assessmentVersion: '1.0',
  status: 'assessed',
  task: 'unscripted',
  locale: 'en-US',
  recordingKey: 'take-1',
  assessor: { kind: 'auto', id: 'engine' },
  scale: 100,
  scores: { accuracy: 90 },
  transcript: { text: TRANSCRIPT, source: { kind: 'auto', id: 'transcriber' } },
  miscue: 'none',
  words: [{ text: 'city', accuracy: 90, error: 'none' }],
};

const grade: GradeRecord = {
  score: 0.8,
  maxScore: 1,
  passed: true,
  feedback: 'You gave a clear reason.',
  criteria: [
    { name: 'Content', score: 0.75, weight: 2, band: 'Good', comment: 'One reason, developed.' },
    { name: 'Pronunciation', score: 90, maxScore: 100, weight: 1 },
  ],
  corrections: [
    { original: 'more better', corrected: 'better', explanation: 'One comparative is enough.' },
  ],
  grader: { kind: 'ai', model: 'judge-1', promptHash: 'p1' },
};

function storeOnly(): RecordingBinding<SpeakingAssessResult> {
  return {
    upload: async (take: RecordedTake) => ({
      key: 'take-1',
      mimeType: take.mimeType,
      durationMs: take.durationMs,
    }),
  };
}

function judging(result: SpeakingAssessResult): RecordingBinding<SpeakingAssessResult> {
  return { ...storeOnly(), assess: async () => result };
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 20; tick += 1) {
      await Promise.resolve();
    }
  });
}

const record = () => screen.getByRole('button', { name: /^Record/ });
const submit = () => screen.getByRole('button', { name: 'Submit' });
const feedbackRegion = (container: HTMLElement) =>
  container.querySelector('[id="sr1-feedback"]') as HTMLElement;

async function makeTake(user: UserEvent, seconds = 2): Promise<void> {
  const capture = harness as SpeechCaptureHarness;
  await user.click(record());
  await flush();
  act(() => {
    capture.pushLevel(0.5, Math.round(capture.sampleRate * seconds));
  });
  await user.click(screen.getByRole('button', { name: 'Stop recording' }));
}

async function answer(user: UserEvent): Promise<void> {
  await makeTake(user);
  await user.click(submit());
  await flush();
}

describe('<SpeakingResponse> rendering', () => {
  it('names the form with the title and shows the instructions, the prompt, the limit and the controls', async () => {
    const { container } = render(<SpeakingResponse data={data} recordingBinding={storeOnly()} />);
    expect(screen.getByRole('form', { name: data.title })).toBeInTheDocument();
    expect(container.querySelector('.lk-sr')).toHaveAttribute('data-render-mode', 'practice');
    expect(screen.getByText(data.prompt)).toHaveAttribute('lang', 'en-US');
    expect(screen.getByText('Answer in about a minute.')).toBeInTheDocument();
    expect(screen.getByText('Answer in up to 60 seconds.')).toBeInTheDocument();
    expect(record()).toHaveTextContent('Record');
    expect(screen.getByText('3 of 3 recordings left')).toBeInTheDocument();
    expect(submit()).toHaveAttribute('aria-disabled', 'true');
    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('states a shortest answer too, when the item sets one', () => {
    render(
      <SpeakingResponse
        data={{ ...data, recording: { minSeconds: 10, maxSeconds: 60 } }}
        recordingBinding={storeOnly()}
      />,
    );
    expect(screen.getByText('Answer for 10 to 60 seconds.')).toBeInTheDocument();
  });

  it('renders a rich prompt only through the sanitiser it is given', () => {
    const rich = { ...data, promptHtml: '<p>Would you rather <strong>live</strong>?</p>' };
    const { container, unmount } = render(
      <SpeakingResponse data={rich} recordingBinding={storeOnly()} />,
    );
    expect(container.querySelector('strong')).toBeNull();
    expect(screen.getByText(data.prompt)).toBeInTheDocument();
    unmount();
    render(
      <SpeakingResponse data={rich} recordingBinding={storeOnly()} sanitizeHtml={(html) => html} />,
    );
    expect(screen.getByText('live').tagName).toBe('STRONG');
  });

  it('silences a recording to answer while the learner records', async () => {
    stubMediaElement();
    const user = userEvent.setup();
    const withRecording: SpeakingResponseData = {
      ...data,
      media: {
        type: 'audio',
        url: 'https://x.test/question.mp3',
        alt: 'The question',
        playback: { seek: 'none', rate: 'fixed' },
      },
    };
    render(<SpeakingResponse data={withRecording} recordingBinding={storeOnly()} />);
    await user.click(screen.getByRole('button', { name: 'Play' }));
    const element = document.querySelector('audio') as HTMLAudioElement;
    expect(element.paused).toBe(false);
    await user.click(record());
    await flush();
    expect(element.paused).toBe(true);
  });

  it('renders on a server as before anything is recorded', () => {
    const markup = renderToString(
      <SpeakingResponseCore data={data} recordingBinding={storeOnly()} />,
    );
    expect(markup).toContain('lk-sr-record');
    expect(markup).toContain(data.prompt);
  });
});

describe('<SpeakingResponse> guards', () => {
  it('refuses to render outside review without an upload', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const mode of ['practice', 'exam'] as const) {
      render(<SpeakingResponse data={data} renderMode={mode} />);
      expect(screen.getByRole('alert')).toHaveTextContent('recordingBinding.upload');
      cleanup();
    }
  });

  it('throws the mapped schema error in development for data that is not speaking-response', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { ...data, locale: 'english' } as SpeakingResponseData;
    render(<SpeakingResponse data={broken} recordingBinding={storeOnly()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders a learner-safe projection in exam', () => {
    render(
      <SpeakingResponse
        data={asRenderable(redact(data))}
        renderMode="exam"
        recordingBinding={storeOnly()}
      />,
    );
    expect(screen.getByText(data.prompt)).toBeInTheDocument();
  });
});

describe('<SpeakingResponse> in practice', () => {
  it('uploads, submits the stored key, and shows the grade, its breakdown and what was said', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(response: LearnerResponse) => void>();
    const onComplete = vi.fn<(result: ActivityResult) => void>();
    const { container } = render(
      <SpeakingResponse
        data={data}
        recordingBinding={judging({ status: 'graded', assessment, grade })}
        onSubmit={onSubmit}
        onComplete={onComplete}
      />,
    );
    await answer(user);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      type: 'speaking-response',
      recording: { key: 'take-1', mimeType: 'audio/wav' },
      takes: 1,
    });
    expect(feedbackRegion(container)).toHaveTextContent(
      'Answer submitted. Score 80%. Passed. You gave a clear reason.',
    );
    const criteria = container.querySelectorAll('.lk-sr-criterion');
    expect([...criteria].map((row) => row.textContent)).toEqual([
      'ContentGoodOne reason, developed.',
      'Pronunciation90%',
    ]);
    expect(container.querySelector('.lk-sr-correction-original')).toHaveTextContent('more better');
    expect(screen.getByText('What you said')).toBeInTheDocument();
    expect(screen.getByText(TRANSCRIPT)).toHaveAttribute('lang', 'en-US');

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0]?.[0] as ActivityResult;
    expect(result).toMatchObject({ score: 0.8, maxScore: 1, passed: true });
    expect(() => validateXAPIStatement(result.xapiStatement)).not.toThrow();
    expect(result.xapiStatement.result?.response).toBe(TRANSCRIPT);
  });

  it('says the answer is in and waits for a person when the grade is pending', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const { container } = render(
      <SpeakingResponse
        data={data}
        recordingBinding={judging({ status: 'pending' })}
        onComplete={onComplete}
      />,
    );
    await answer(user);
    expect(feedbackRegion(container)).toHaveTextContent(
      'Answer submitted. Not graded yet. This response is waiting for its grade.',
    );
    expect(onComplete).not.toHaveBeenCalled();
    expect(container.querySelector('.lk-sr-details')).toBeNull();
  });

  it.each([
    ['no_speech', 'We could not hear you. Record again somewhere quieter.'],
    ['implausible_speech_rate', 'This recording could not be assessed. Try recording it again.'],
    ['judgement_mismatch', 'Your answer could not be checked.'],
    ['a code of the application', 'This recording could not be assessed. Try recording it again.'],
  ])('tells the learner what an unscorable %s means, never the code', async (code, said) => {
    const user = userEvent.setup();
    const { container } = render(
      <SpeakingResponse data={data} recordingBinding={judging({ status: 'unscorable', code })} />,
    );
    await answer(user);
    expect(feedbackRegion(container)).toHaveTextContent(said);
    expect(feedbackRegion(container)).not.toHaveTextContent(code);
  });

  it('says only that it was received when the policy shows no feedback', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SpeakingResponse
        data={data}
        delivery={{ feedback: false }}
        recordingBinding={judging({ status: 'graded', assessment, grade })}
      />,
    );
    await answer(user);
    expect(feedbackRegion(container)).toHaveTextContent(/^Answer submitted\.$/);
    expect(container.querySelector('.lk-sr-details')).toBeNull();
  });

  it('notes that there is no feedback when the binding judges nothing', async () => {
    const user = userEvent.setup();
    const { container } = render(<SpeakingResponse data={data} recordingBinding={storeOnly()} />);
    await answer(user);
    expect(feedbackRegion(container)).toHaveTextContent(
      'Feedback is not available for this answer.',
    );
  });

  it('offers to judge the same take again when the assessment fails', async () => {
    const user = userEvent.setup();
    const assess = vi
      .fn<(ref: { key: string }) => Promise<SpeakingAssessResult>>()
      .mockResolvedValueOnce({ status: 'failed', retryable: true })
      .mockResolvedValueOnce({ status: 'graded', assessment, grade });
    const upload = vi.fn(async (take: RecordedTake) => ({
      key: 'take-1',
      mimeType: take.mimeType,
      durationMs: take.durationMs,
    }));
    const { container } = render(
      <SpeakingResponse data={data} recordingBinding={{ upload, assess }} />,
    );
    await answer(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Your answer could not be checked.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(assess).toHaveBeenCalledTimes(2);
    expect(feedbackRegion(container)).toHaveTextContent('Score 80%');
  });

  it('reports what happened to each take as interactions', async () => {
    const user = userEvent.setup();
    const events: InteractionEvent[] = [];
    render(
      <SpeakingResponse
        data={data}
        recordingBinding={judging({ status: 'graded', assessment, grade })}
        onInteraction={(event) => events.push(event)}
      />,
    );
    await answer(user);
    expect(events.map((event) => event.type)).toEqual([
      'recording-started',
      'recording-stopped',
      'recording-uploaded',
      'submitted',
      'assessment-requested',
    ]);
    expect(events.every((event) => event.activityId === 'sr1')).toBe(true);
  });
});

describe('<SpeakingResponse> in exam', () => {
  it('submits without assessing, and offers an answer without a recording', async () => {
    const user = userEvent.setup();
    const assess = vi.fn();
    const onSubmit = vi.fn<(response: LearnerResponse) => void>();
    const { container } = render(
      <SpeakingResponse
        data={data}
        renderMode="exam"
        recordingBinding={{ ...storeOnly(), assess }}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Submit without recording' }));
    await flush();
    expect(onSubmit).toHaveBeenCalledWith({ type: 'speaking-response', recording: null });
    expect(assess).not.toHaveBeenCalled();
    expect(feedbackRegion(container)).toHaveTextContent('Answer submitted.');
    expect(container.querySelector('.lk-sr-record')).toBeNull();
  });
});

describe('<SpeakingResponse> in review', () => {
  it('shows the stored grade, its breakdown, and the transcript of the kept evidence', () => {
    const { container } = render(
      <SpeakingResponse
        data={data}
        renderMode="review"
        outcome={outcomeFromGrade(grade)}
        assessment={assessment}
      />,
    );
    expect(feedbackRegion(container)).toHaveTextContent('Score 80%. Passed.');
    expect(container.querySelector('.lk-sr-outcome')).toHaveAttribute('data-passed', 'true');
    expect(within(container.querySelector('.lk-sr-details') as HTMLElement).getByText('Good'));
    expect(screen.getByText(TRANSCRIPT)).toBeInTheDocument();
    expect(container.querySelector('.lk-sr-record')).toBeNull();
  });

  it('shows a grade waiting for a person, and a grade that could not be read, without inventing one', () => {
    const { container, unmount } = render(
      <SpeakingResponse
        data={data}
        renderMode="review"
        outcome={{ status: 'deferred', reason: 'awaiting_human_review', maxScore: 1 }}
      />,
    );
    expect(feedbackRegion(container)).toHaveTextContent('Not graded yet.');
    unmount();
    const { container: broken } = render(
      <SpeakingResponse
        data={data}
        renderMode="review"
        outcome={{ ...outcomeFromGrade(grade), score: '80' } as unknown as ItemOutcome}
      />,
    );
    expect(feedbackRegion(broken)).toHaveTextContent('This response could not be graded.');
    expect(broken.querySelector('.lk-sr-details')).toBeNull();
  });
});

describe('<SpeakingResponse> in a question set', () => {
  it('draws a spoken answer with the paper binding, which may answer pending', async () => {
    const user = userEvent.setup();
    const assess = vi.fn(async () => ({ status: 'pending' as const }));
    const onSubmit = vi.fn();
    render(
      <ActivitySequence
        activities={[data]}
        recordingBinding={{
          upload: async (take, slot) => ({
            key: `${slot.slotId}-take`,
            mimeType: take.mimeType,
            durationMs: take.durationMs,
          }),
          assess,
        }}
        onSubmit={onSubmit}
      />,
    );
    await answer(user);
    expect(assess).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Not graded yet/)).toBeInTheDocument();
  });
});
