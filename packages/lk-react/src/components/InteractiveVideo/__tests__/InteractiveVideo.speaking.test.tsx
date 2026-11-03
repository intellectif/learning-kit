import type {
  ActivityResult,
  GradeRecord,
  ItemGroup,
  LearnerResponse,
  RecordingRef,
  SpeakingResponseData,
  SpeechAssessment,
  XAPIStatement,
} from '@intellectif/lk-core';
import { outcomeFromGrade, redactItemGroup } from '@intellectif/lk-core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordedTake } from '../../../hooks/useSpeechRecorder.js';
import { stubMediaElement } from '../../../test-support/media.js';
import { type SpeechCaptureHarness, stubSpeechCapture } from '../../../test-support/speech.js';
import type { SpeakingAssessResult } from '../../SpeakingResponse/SpeakingResponse.js';
import type { SequenceRecordingBinding, SequenceRecordingSlot } from '../../types.js';
import { InteractiveVideo, type InteractiveVideoQuestion } from '../index.js';

/**
 * A spoken answer inside an interactive video (lk-core 1.10.0, lk-react 23.6.0):
 * the video pauses for it like any other question, the SDK draws
 * `<SpeakingResponse>` with the slot's binding, and the video waits for a take
 * on its way and reads a grade a person will give as an answer still to be
 * graded.
 */

const VIDEO = 'https://cdn.example.test/lesson.mp4';
const TRANSCRIPT = 'um I think the city is more better for young people';

const mc = {
  schemaVersion: '1.0' as const,
  type: 'multiple-choice' as const,
  id: 'q1',
  title: 'q1',
  question: '¿Uno?',
  mode: 'single' as const,
  scoringStrategy: 'all-or-nothing' as const,
  options: [
    { id: 'right', text: 'correcta', isCorrect: true },
    { id: 'wrong', text: 'incorrecta', isCorrect: false },
  ],
};

const spoken: SpeakingResponseData = {
  schemaVersion: '1.0',
  type: 'speaking-response',
  id: 'sr',
  title: 'City or country',
  prompt: 'Would you rather live in a city or in the country? Say why.',
  locale: 'en-US',
  recording: { maxSeconds: 60, maxTakes: 3 },
  rubric: {
    criteria: [
      { name: 'Content', weight: 2 },
      { name: 'Pronunciation', weight: 1, measure: 'pronunciation' },
    ],
  },
};

/** A multiple choice at 0:30, and the spoken answer alone at 1:00. */
const group = (over: { item?: SpeakingResponseData; required?: boolean } = {}): ItemGroup =>
  ({
    schemaVersion: '1.0',
    type: 'item-group',
    id: 'lesson',
    title: 'Lección',
    stimulus: {
      id: 's1',
      kind: 'video',
      media: { type: 'video', url: VIDEO, alt: 'Vídeo de la lección' },
    },
    items: [mc, over.item ?? spoken],
    timeline: {
      cues: [
        { id: 'first', at: 30, title: 'Primera pausa', itemIds: ['q1'] },
        {
          id: 'speak',
          at: 60,
          title: 'Habla',
          itemIds: ['sr'],
          ...(over.required === true ? { required: true } : {}),
        },
      ],
    },
  }) as ItemGroup;

/** The spoken answer's place: the second question of entry `0`. */
const PLACE: SequenceRecordingSlot = { slotId: '0.1', index: 1, activityId: 'sr' };

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

const stored = (take: RecordedTake): RecordingRef => ({
  key: 'take-1',
  mimeType: take.mimeType,
  durationMs: take.durationMs,
});

function binding(result?: SpeakingAssessResult): SequenceRecordingBinding & {
  upload: ReturnType<typeof vi.fn>;
  assess: ReturnType<typeof vi.fn>;
} {
  return {
    upload: vi.fn(async (take: RecordedTake) => stored(take)),
    assess: vi.fn(
      async (): Promise<SpeakingAssessResult> => result ?? { status: 'graded', assessment, grade },
    ),
  };
}

function deferred<T>(): { promise: Promise<T>; settle: (value: T) => void } {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 20; tick += 1) {
      await Promise.resolve();
    }
  });
}

async function playTo(seconds: number): Promise<void> {
  await act(async () => {
    video().currentTime = seconds;
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

/** Mounts the player, starts playback and plays to the spoken answer's quiz. */
async function toSpokenQuiz(ui: React.ReactElement): Promise<ReturnType<typeof render>> {
  const rendered = render(ui);
  await act(async () => {
    video().dispatchEvent(new Event('loadedmetadata'));
  });
  await act(async () => {
    await video().play();
  });
  await playTo(31);
  await waitFor(() => expect(quizPanel()).toBeVisible());
  await userEvent.setup().click(continueButton());
  await playTo(61);
  await waitFor(() => expect(quizPanel()).toBeVisible());
  return rendered;
}

async function makeTake(user: UserEvent): Promise<void> {
  const capture = harness as SpeechCaptureHarness;
  await user.click(within(quizPanel()).getByRole('button', { name: /^Record/ }));
  await flush();
  act(() => {
    capture.pushLevel(0.5, Math.round(capture.sampleRate * 2));
  });
  await user.click(within(quizPanel()).getByRole('button', { name: 'Stop recording' }));
}

async function answer(user: UserEvent): Promise<void> {
  await makeTake(user);
  await user.click(within(quizPanel()).getByRole('button', { name: 'Submit' }));
  await flush();
}

async function endVideo(): Promise<void> {
  await act(async () => {
    video().dispatchEvent(new Event('ended'));
  });
}

const quizPanel = () => document.querySelector('.lk-iv-quiz') as HTMLElement;
const video = () => document.querySelector('video') as HTMLVideoElement;
const finishButton = () => screen.getByRole('button', { name: 'Finish' });
const continueButton = () => screen.getByRole('button', { name: /Continue video/ });
const spokenMarker = () => document.querySelectorAll('.lk-iv-marker')[1] as HTMLElement;
const spokenRow = () => document.querySelectorAll('.lk-iv-end-list .lk-iv-row')[1] as HTMLElement;
const feedback = () => document.querySelector('[id="sr-feedback"]') as HTMLElement;

let harness: SpeechCaptureHarness | undefined;

beforeEach(() => {
  stubMediaElement({ duration: 120 });
  localStorage.clear();
  harness = stubSpeechCapture();
});

afterEach(() => {
  cleanup();
  harness?.restore();
  harness = undefined;
  vi.restoreAllMocks();
});

describe('InteractiveVideo: a spoken answer the SDK draws', () => {
  it('pauses at its quiz and draws the spoken answer, with no schema error', async () => {
    await toSpokenQuiz(<InteractiveVideo group={group()} recordingBinding={binding()} />);
    expect(video().paused).toBe(true);
    expect(within(quizPanel()).getByRole('form', { name: spoken.title })).toBeInTheDocument();
    expect(within(quizPanel()).getByText(spoken.prompt)).toBeInTheDocument();
  });

  it('records, stores and judges the take at its slot, and shows the grade under the pause', async () => {
    const user = userEvent.setup();
    const judge = binding();
    const onSubmit = vi.fn<(response: LearnerResponse, slot: unknown) => void>();
    const onActivityComplete = vi.fn<(result: ActivityResult, slot: unknown) => void>();
    await toSpokenQuiz(
      <InteractiveVideo
        group={group()}
        recordingBinding={judge}
        onSubmit={onSubmit}
        onActivityComplete={onActivityComplete}
      />,
    );
    await answer(user);

    expect(judge.upload).toHaveBeenCalledWith(expect.anything(), PLACE);
    expect(judge.assess).toHaveBeenCalledWith(expect.objectContaining({ key: 'take-1' }), PLACE);
    expect(feedback()).toHaveTextContent('Score 80%. Passed. You gave a clear reason.');
    const criteria = quizPanel().querySelectorAll('.lk-sr-criterion');
    expect([...criteria].map((row) => row.textContent)).toEqual([
      'ContentGoodOne reason, developed.',
      'Pronunciation90%',
    ]);
    expect(quizPanel().querySelector('.lk-sr-correction-original')).toHaveTextContent(
      'more better',
    );
    expect(within(quizPanel()).getByText(TRANSCRIPT)).toBeInTheDocument();

    const place = { ...PLACE, cueId: 'speak' };
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'speaking-response', recording: expect.anything() }),
      place,
    );
    expect(onActivityComplete).toHaveBeenCalledWith(
      expect.objectContaining({ score: 0.8, passed: true }),
      place,
    );
    expect(spokenMarker()).toHaveAttribute('data-state', 'answered');
  });

  it('holds a required quiz until the take is stored, and Finish while it is judged', async () => {
    const user = userEvent.setup();
    const upload = deferred<RecordingRef>();
    const judged = deferred<SpeakingAssessResult>();
    const onFinished = vi.fn();
    await toSpokenQuiz(
      <InteractiveVideo
        group={group({ required: true })}
        onFinished={onFinished}
        recordingBinding={{ upload: () => upload.promise, assess: () => judged.promise }}
      />,
    );
    expect(continueButton()).toHaveAttribute('aria-disabled', 'true');
    await answer(user);
    // Still uploading: no answer yet, so the quiz still holds the learner.
    expect(continueButton()).toHaveAttribute('aria-disabled', 'true');

    act(() => {
      upload.settle({ key: 'take-1', mimeType: 'audio/wav', durationMs: 2000 });
    });
    await flush();
    // Stored and handed in: an answer, so the learner may carry on.
    await waitFor(() => expect(continueButton()).not.toHaveAttribute('aria-disabled'));
    await user.click(continueButton());
    await endVideo();
    // Still being judged: Finish waits.
    expect(finishButton()).toHaveAttribute('aria-disabled', 'true');
    expect(onFinished).not.toHaveBeenCalled();

    act(() => {
      judged.settle({ status: 'graded', assessment, grade });
    });
    await flush();
    await waitFor(() => expect(finishButton()).not.toHaveAttribute('aria-disabled'));
  });

  it('counts a grade a person will give as an answer: the learner goes on, is told, and sees it pending', async () => {
    const user = userEvent.setup();
    const onActivityComplete = vi.fn();
    const onSubmit = vi.fn();
    const onFinished = vi.fn();
    await toSpokenQuiz(
      <InteractiveVideo
        group={group({ required: true })}
        recordingBinding={binding({ status: 'pending' })}
        onSubmit={onSubmit}
        onActivityComplete={onActivityComplete}
        onFinished={onFinished}
      />,
    );
    await answer(user);

    expect(feedback()).toHaveTextContent(
      'Answer submitted. Not graded yet. This response is waiting for its grade.',
    );
    expect(continueButton()).not.toHaveAttribute('aria-disabled');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onActivityComplete).not.toHaveBeenCalled();
    expect(spokenMarker()).toHaveAttribute('data-state', 'pending');

    await user.click(continueButton());
    await endVideo();
    expect(spokenRow()).toHaveAttribute('data-state', 'pending');
    expect(finishButton()).not.toHaveAttribute('aria-disabled');
  });

  it('keeps the video still and silent while the learner records, and stops the take when the quiz closes', async () => {
    const user = userEvent.setup();
    const withRecording: SpeakingResponseData = {
      ...spoken,
      media: {
        type: 'audio',
        url: 'https://x.test/question.mp3',
        alt: 'The question',
        playback: { seek: 'none', rate: 'fixed' },
      },
    };
    await toSpokenQuiz(
      <InteractiveVideo group={group({ item: withRecording })} recordingBinding={binding()} />,
    );
    const question = quizPanel().querySelector('audio') as HTMLAudioElement;
    await user.click(within(quizPanel()).getByRole('button', { name: 'Play' }));
    expect(question.paused).toBe(false);

    await user.click(within(quizPanel()).getByRole('button', { name: /^Record/ }));
    await flush();
    // The item's own recording falls silent, the video stays paused, and
    // neither its controls nor its shortcuts can start it.
    expect(question.paused).toBe(true);
    expect(video().paused).toBe(true);
    expect(document.querySelector('.lk-iv-chrome')).toHaveAttribute('inert');
    fireEvent.keyDown(quizPanel(), { key: 'k' });
    fireEvent.keyDown(quizPanel(), { key: ' ' });
    expect(video().paused).toBe(true);
    expect((harness as SpeechCaptureHarness).liveTracks()).toBe(1);

    // Leaving the quiz stops the take before the video plays on.
    await user.click(continueButton());
    await flush();
    expect((harness as SpeechCaptureHarness).liveTracks()).toBe(0);
  });
});

describe('InteractiveVideo: a spoken answer in exam and review', () => {
  it('records and submits in exam with nothing assessed', async () => {
    const user = userEvent.setup();
    const judge = binding();
    const onSubmit = vi.fn();
    await toSpokenQuiz(
      <InteractiveVideo
        group={redactItemGroup(group()) as unknown as ItemGroup}
        renderMode="exam"
        recordingBinding={judge}
        onSubmit={onSubmit}
      />,
    );
    await answer(user);
    expect(judge.upload).toHaveBeenCalledWith(expect.anything(), PLACE);
    expect(judge.assess).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'speaking-response', recording: expect.anything() }),
      { ...PLACE, cueId: 'speak' },
    );
    expect(feedback()).toHaveTextContent('Answer submitted.');
    expect(feedback()).not.toHaveTextContent('Score');
  });

  it('lets an exam take the answer without a recording', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    await toSpokenQuiz(
      <InteractiveVideo
        group={redactItemGroup(group({ required: true })) as unknown as ItemGroup}
        renderMode="exam"
        recordingBinding={binding()}
        onSubmit={onSubmit}
      />,
    );
    await user.click(within(quizPanel()).getByRole('button', { name: 'Submit without recording' }));
    await flush();
    expect(onSubmit).toHaveBeenCalledWith(
      { type: 'speaking-response', recording: null },
      { ...PLACE, cueId: 'speak' },
    );
    expect(continueButton()).not.toHaveAttribute('aria-disabled');
  });

  it('shows the stored grade and what was said in review, and plays the take back', async () => {
    const playbackUrl = vi.fn(async () => 'https://x.test/take-1.wav');
    await toSpokenQuiz(
      <InteractiveVideo
        group={redactItemGroup(group()) as unknown as ItemGroup}
        renderMode="review"
        responses={{
          '0.1': {
            type: 'speaking-response',
            recording: { key: 'take-1', mimeType: 'audio/wav', durationMs: 2000 },
            takes: 1,
          } as LearnerResponse,
        }}
        outcomes={{ '0.1': outcomeFromGrade(grade) }}
        assessments={{ '0.1': assessment }}
        recordingBinding={{ upload: vi.fn(), playbackUrl }}
      />,
    );
    await flush();
    expect(feedback()).toHaveTextContent('Score 80%. Passed.');
    expect(within(quizPanel()).getByText(TRANSCRIPT)).toBeInTheDocument();
    expect(playbackUrl).toHaveBeenCalledWith(expect.objectContaining({ key: 'take-1' }), PLACE);
    await waitFor(() =>
      expect(quizPanel().querySelector('audio[src="https://x.test/take-1.wav"]')).not.toBeNull(),
    );
    expect(quizPanel().querySelector('.lk-sr-record')).toBeNull();
  });
});

describe('InteractiveVideo: a spoken answer the host draws', () => {
  const result: ActivityResult = {
    score: 0.6,
    maxScore: 1,
    passed: false,
    timeSpent: 900,
    xapiStatement: {} as XAPIStatement,
  };

  /** The host's own card, as a platform draws it, with its own storage and grading. */
  function HostCard({ question }: { question: InteractiveVideoQuestion }) {
    return (
      <div className="host-sr">
        <p>Tarjeta del anfitrión</p>
        <button type="button" onClick={() => question.setPending(true)}>
          Subiendo
        </button>
        <button
          type="button"
          onClick={() => {
            question.submit({
              type: 'speaking-response',
              recording: { key: 'k1', mimeType: 'audio/wav', durationMs: 1500 },
            } as LearnerResponse);
            question.setPending(false);
          }}
        >
          Entregar
        </button>
        <button type="button" onClick={() => question.complete(result)}>
          Calificar
        </button>
      </div>
    );
  }
  const renderQuestion = (question: InteractiveVideoQuestion) =>
    question.activity.type === 'speaking-response' ? <HostCard question={question} /> : undefined;

  it('draws the host card, and counts its submit, its complete and its pending work as its own', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onActivityComplete = vi.fn();
    await toSpokenQuiz(
      <InteractiveVideo
        group={group({ required: true })}
        renderQuestion={renderQuestion}
        onSubmit={onSubmit}
        onActivityComplete={onActivityComplete}
      />,
    );
    expect(within(quizPanel()).getByText('Tarjeta del anfitrión')).toBeInTheDocument();
    expect(quizPanel().querySelector('.lk-sr')).toBeNull();
    expect(continueButton()).toHaveAttribute('aria-disabled', 'true');

    await user.click(within(quizPanel()).getByRole('button', { name: 'Subiendo' }));
    await user.click(continueButton());
    // Not answered yet: still held.
    expect(quizPanel()).toBeVisible();

    await user.click(within(quizPanel()).getByRole('button', { name: 'Entregar' }));
    expect(continueButton()).not.toHaveAttribute('aria-disabled');
    await user.click(within(quizPanel()).getByRole('button', { name: 'Calificar' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onActivityComplete).toHaveBeenCalledWith(result, { ...PLACE, cueId: 'speak' });
  });

  it('holds Finish while the host says its take is on its way', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn();
    const held: { question?: InteractiveVideoQuestion } = {};
    await toSpokenQuiz(
      <InteractiveVideo
        group={group()}
        renderQuestion={(question) => {
          if (question.activity.type === 'speaking-response') {
            held.question = question;
          }
          return renderQuestion(question);
        }}
        onFinished={onFinished}
      />,
    );
    await user.click(within(quizPanel()).getByRole('button', { name: 'Subiendo' }));
    await user.click(continueButton());
    await endVideo();
    expect(finishButton()).toHaveAttribute('aria-disabled', 'true');
    expect(onFinished).not.toHaveBeenCalled();
    // However the host's work ends, it says so, and Finish goes.
    act(() => {
      held.question?.setPending(false);
    });
    expect(finishButton()).not.toHaveAttribute('aria-disabled');
  });

  it('marks the quiz pending for a stored outcome a person has yet to grade', async () => {
    render(
      <InteractiveVideo
        group={group()}
        renderQuestion={renderQuestion}
        outcomes={{ '0.1': { status: 'deferred', reason: 'awaiting_human_review', maxScore: 1 } }}
      />,
    );
    await act(async () => {
      video().dispatchEvent(new Event('loadedmetadata'));
    });
    expect(spokenMarker()).toHaveAttribute('data-state', 'pending');
  });
});
