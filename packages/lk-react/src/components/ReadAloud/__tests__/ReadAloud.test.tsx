import type {
  GradeRecord,
  InteractionEvent,
  ItemOutcome,
  LearnerResponse,
  MultipleChoiceData,
  ReadAloudData,
  SpeechAssessment,
} from '@intellectif/lk-core';
import {
  OPEN_DELIVERY_POLICY,
  outcomeFromGrade,
  redact,
  validateXAPIStatement,
} from '@intellectif/lk-core';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { type ComponentProps, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordedTake } from '../../../hooks/useSpeechRecorder.js';
import { checkA11y } from '../../../test-support/a11y.js';
import { stubMediaElement } from '../../../test-support/media.js';
import { type SpeechCaptureHarness, stubSpeechCapture } from '../../../test-support/speech.js';
import { ActivitySequence } from '../../ActivitySequence/index.js';
import { stopCaptureGroup } from '../../shared/capture-registry.js';
import { SequenceSlotContext } from '../../shared/sequence-slot.js';
import { asRenderable, type Renderable } from '../../types.js';
import { ReadAloud } from '../index.js';
import {
  type ReadAloudAssessResult,
  ReadAloud as ReadAloudCore,
  type ReadAloudProps,
  type RecordingBinding,
} from '../ReadAloud.js';

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

const data: ReadAloudData = {
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'ra1',
  title: 'Read the sentence',
  instructions: 'Read at a natural pace.',
  referenceText: 'The weather is lovely today.',
  locale: 'en-US',
  recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 3 },
  scoring: {
    dimensions: [
      { name: 'accuracy', weight: 3 },
      { name: 'fluency', weight: 1 },
    ],
  },
  feedback: { correct: 'Well read.', incorrect: 'Read it once more.' },
};

// A locked scrubber and a fixed speed, no play budget: the schema refuses a
// budgeted model recording beside a slow one, so this is the two-file shape
// that validates.
const withModels: ReadAloudData = {
  ...data,
  id: 'ra2',
  media: {
    type: 'audio',
    url: 'https://x.test/weather.mp3',
    alt: 'Model',
    playback: { seek: 'none', rate: 'fixed' },
  },
  slowMedia: { type: 'audio', url: 'https://x.test/weather-slow.mp3' },
};

const assessment: SpeechAssessment = {
  assessmentVersion: '1.0',
  status: 'assessed',
  task: 'scripted',
  locale: 'en-US',
  referenceText: data.referenceText,
  recordingKey: 'take-1',
  assessor: { kind: 'auto', id: 'engine-1' },
  scale: 100,
  scores: { accuracy: 88, fluency: 72 },
  recognizedText: 'the weather is lonely today',
  miscue: 'assessor',
  words: [
    { text: 'The', accuracy: 95, error: 'none' },
    { text: 'weather', accuracy: 90, error: 'none' },
    { text: 'is', accuracy: 90, error: 'none' },
    { text: 'lonely', accuracy: 41, error: 'mispronunciation' },
    { text: 'today', accuracy: 85, error: 'none' },
  ],
};

const grade: GradeRecord = {
  score: 0.82,
  maxScore: 1,
  passed: true,
  feedback: 'Clear and steady.',
  criteria: [
    { name: 'accuracy', score: 88, maxScore: 100, weight: 3 },
    { name: 'fluency', score: 72, maxScore: 100, weight: 1 },
  ],
  details: [
    {
      itemId: 'w1',
      correct: true,
      outcome: 'correct',
      learnerResponse: 'the',
      correctResponse: 'the',
      weight: 1,
      score: 0.95,
    },
    {
      itemId: 'w2',
      correct: false,
      outcome: 'incorrect',
      learnerResponse: 'lonely',
      correctResponse: 'lovely',
      weight: 1,
      score: 0.41,
    },
    {
      itemId: 'w3',
      correct: false,
      outcome: 'incorrect-omission',
      learnerResponse: '',
      correctResponse: 'today',
      weight: 1,
      score: 0,
    },
  ],
};

/** A binding that stores a take under a fixed key and judges nothing. */
function storeOnly(): RecordingBinding {
  return {
    upload: async (take: RecordedTake) => ({
      key: 'take-1',
      mimeType: take.mimeType,
      durationMs: take.durationMs,
    }),
  };
}

/** Lets every pending promise in the recorder's `start()` settle. */
async function flush(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 20; tick += 1) {
      await Promise.resolve();
    }
  });
}

const record = () => screen.getByRole('button', { name: /^Record/ });
const submit = () => screen.getByRole('button', { name: 'Submit' });

/** Records one take of `seconds` at half scale, and stops it. */
async function makeTake(user: UserEvent, seconds = 2): Promise<void> {
  const capture = harness as SpeechCaptureHarness;
  await user.click(record());
  await flush();
  act(() => {
    capture.pushLevel(0.5, Math.round(capture.sampleRate * seconds));
  });
  await user.click(screen.getByRole('button', { name: 'Stop recording' }));
}

describe('<ReadAloud> rendering', () => {
  it('names the form with the title and shows the reading, the instructions and the controls', async () => {
    const { container } = render(<ReadAloud data={data} recordingBinding={storeOnly()} />);
    expect(screen.getByRole('form', { name: data.title })).toBeInTheDocument();
    expect(container.querySelector('.lk-ra')).toHaveAttribute('data-render-mode', 'practice');
    expect(screen.getByText(data.referenceText)).toHaveAttribute('lang', 'en-US');
    expect(screen.getByText('Read at a natural pace.')).toBeInTheDocument();
    expect(record()).toHaveTextContent('Record');
    expect(screen.getByText('3 of 3 recordings left')).toBeInTheDocument();
    // Nothing recorded yet: the submit control is there and reachable, but says
    // it is not ready rather than dropping out of the tab order.
    expect(submit()).toHaveAttribute('aria-disabled', 'true');
    expect(submit()).toBeEnabled();
    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('renders the model recordings as two named groups, the slow one inheriting the policy', () => {
    stubMediaElement();
    render(<ReadAloud data={withModels} recordingBinding={storeOnly()} />);
    const model = screen.getByRole('group', { name: 'Model recording' });
    const slow = screen.getByRole('group', { name: 'Slow model recording' });
    for (const group of [model, slow]) {
      expect(within(group).getByRole('button', { name: 'Play' })).toBeInTheDocument();
      expect(within(group).queryByRole('slider', { name: 'Seek' })).not.toBeInTheDocument();
    }
  });

  it('pauses a playing model recording the moment the learner starts recording', async () => {
    stubMediaElement();
    const user = userEvent.setup();
    render(<ReadAloud data={withModels} recordingBinding={storeOnly()} />);
    const model = screen.getByRole('group', { name: 'Model recording' });
    await user.click(within(model).getByRole('button', { name: 'Play' }));
    const element = document.querySelector('audio') as HTMLAudioElement;
    expect(element.paused).toBe(false);
    await user.click(record());
    await flush();
    expect(element.paused).toBe(true);
  });

  it('renders the same on a server as it does before anything is recorded', () => {
    const markup = renderToString(<ReadAloudCore data={data} recordingBinding={storeOnly()} />);
    expect(markup).toContain('lk-ra-record');
    expect(markup).toContain(data.referenceText);
  });
});

describe('<ReadAloud> guards', () => {
  it('refuses to render outside review without an upload', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const mode of ['practice', 'exam'] as const) {
      render(<ReadAloud data={data} renderMode={mode} />);
      expect(screen.getByRole('alert')).toHaveTextContent('recordingBinding.upload');
      cleanup();
    }
  });

  it('renders review with no binding at all', () => {
    render(<ReadAloud data={data} renderMode="review" outcome={outcomeFromGrade(grade)} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('throws the mapped schema error in development for data that is not read-aloud', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { ...data, referenceText: 42 } as unknown as ReadAloudData;
    render(<ReadAloud data={broken} recordingBinding={storeOnly()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Activity failed to render');
  });

  it('renders a redacted projection in practice, because there is no answer key to withhold', () => {
    // Unlike every other built-in: `redact()` on a read-aloud keeps the text,
    // the locale, the bounds and the weights, and removes only the authored
    // feedback — so there is nothing practice could grade against and nothing
    // it could leak.
    const projection = asRenderable<ReadAloudData>(redact(data));
    render(<ReadAloud data={projection} recordingBinding={storeOnly()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(data.referenceText)).toBeInTheDocument();
  });

  it('refuses a payload that claims to be redacted and is not', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const projection = asRenderable<ReadAloudData>(redact(data));
    const pretend = { ...projection, transcript: 'not a read-aloud field' } as ReadAloudData;
    render(<ReadAloud data={pretend} recordingBinding={storeOnly()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Activity failed to render');
  });
});

describe('<ReadAloud> practice', () => {
  it('records, previews, uploads, submits and renders the grade it is given back', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onComplete = vi.fn();
    const assess = vi.fn(async () => ({ status: 'graded' as const, assessment, grade }));
    const { container } = render(
      <ReadAloud
        data={data}
        recordingBinding={{ ...storeOnly(), assess }}
        onSubmit={onSubmit}
        onComplete={onComplete}
      />,
    );

    await makeTake(user);
    // The take is previewable before it is committed, and the control now
    // offers to replace it.
    expect(screen.getByLabelText('Your recording')).toBeInTheDocument();
    expect(record()).toHaveTextContent('Record again');
    expect(screen.getByText('2 of 3 recordings left')).toBeInTheDocument();
    // The attribute is written only when it is true, so a ready control has none.
    expect(submit()).not.toHaveAttribute('aria-disabled');

    await user.click(submit());
    await flush();

    const response = onSubmit.mock.calls[0]?.[0] as LearnerResponse;
    expect(response).toMatchObject({ type: 'read-aloud', recording: { key: 'take-1' }, takes: 1 });
    expect(assess).toHaveBeenCalledWith({
      key: 'take-1',
      mimeType: 'audio/wav',
      durationMs: expect.any(Number),
    });

    expect(screen.getByRole('region', { name: 'Pronunciation feedback' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Your reading, word by word' })).toBeInTheDocument();
    // Once on screen, in the panel — and once more inside the live region,
    // clipped, so a screen reader is told the grade arrived without a sighted
    // learner reading the same sentence twice.
    expect(screen.getAllByText('Score 82%. Passed.')).toHaveLength(1);
    expect(container.querySelector('.lk-ra [aria-live] .lk-visually-hidden')).toHaveTextContent(
      'Answer submitted. Score 82%. Passed. Clear and steady.',
    );

    const result = onComplete.mock.calls[0]?.[0];
    expect(result).toMatchObject({ score: 0.82, maxScore: 1, passed: true });
    expect(result.xapiStatement.result.score.raw).toBe(0.82);
    // `response` is the recognised text, and `details` is never invented.
    expect(result.xapiStatement.result.response).toBe('the weather is lonely today');
    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('marks the submit busy and says what it is waiting for, at each step', async () => {
    const user = userEvent.setup();
    let settleUpload: (ref: { key: string; mimeType: string }) => void = () => {};
    let settleAssess: (result: { status: 'unscorable'; code: string }) => void = () => {};
    render(
      <ReadAloud
        data={data}
        recordingBinding={{
          upload: () =>
            new Promise((resolve) => {
              settleUpload = resolve;
            }),
          assess: () =>
            new Promise((resolve) => {
              settleAssess = resolve;
            }),
        }}
      />,
    );
    await makeTake(user);
    await user.click(submit());
    expect(screen.getByText('Sending your recording…')).toBeInTheDocument();
    expect(submit()).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      settleUpload({ key: 'take-1', mimeType: 'audio/wav' });
    });
    await flush();
    expect(screen.getByText('Checking your pronunciation…')).toBeInTheDocument();
    expect(submit()).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      settleAssess({ status: 'unscorable', code: 'no_speech' });
    });
    await flush();
    expect(submit()).not.toHaveAttribute('aria-busy');
  });

  it('offers another take after a grade, while any remain', async () => {
    const user = userEvent.setup();
    const assess = vi.fn(async () => ({ status: 'graded' as const, assessment, grade }));
    render(<ReadAloud data={data} recordingBinding={{ ...storeOnly(), assess }} />);
    await makeTake(user);
    await user.click(submit());
    await flush();
    expect(record()).not.toHaveAttribute('aria-disabled');
  });

  it('shows the notice, and never completes, when the binding judges nothing', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onComplete = vi.fn();
    render(
      <ReadAloud
        data={data}
        recordingBinding={storeOnly()}
        onSubmit={onSubmit}
        onComplete={onComplete}
      />,
    );
    await makeTake(user);
    await user.click(submit());
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText('Pronunciation feedback is not available for this activity.'),
    ).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('tells a learner they were not heard, and keeps the code off the screen', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const assess = vi.fn(async () => ({ status: 'unscorable' as const, code: 'no_speech' }));
    const { container } = render(
      <ReadAloud
        data={data}
        recordingBinding={{ ...storeOnly(), assess }}
        onComplete={onComplete}
      />,
    );
    await makeTake(user);
    await user.click(submit());
    await flush();
    expect(
      screen.getByText('We could not hear you. Record again somewhere quieter.'),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain('no_speech');
    expect(onComplete).not.toHaveBeenCalled();
    expect(record()).toHaveTextContent('Record again');
  });

  it('falls back to the general message for a code the SDK does not name', async () => {
    const user = userEvent.setup();
    const assess = vi.fn(async () => ({ status: 'unscorable' as const, code: 'house_policy' }));
    const { container } = render(
      <ReadAloud data={data} recordingBinding={{ ...storeOnly(), assess }} />,
    );
    await makeTake(user);
    await user.click(submit());
    await flush();
    expect(
      screen.getByText('This recording could not be assessed. Try recording it again.'),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain('house_policy');
  });

  it('retries a retryable assessment failure without uploading the take again', async () => {
    const user = userEvent.setup();
    const upload = vi.fn(storeOnly().upload);
    const assess = vi
      .fn()
      .mockResolvedValueOnce({ status: 'failed', retryable: true })
      .mockResolvedValueOnce({ status: 'graded', assessment, grade });
    render(<ReadAloud data={data} recordingBinding={{ upload, assess }} />);
    await makeTake(user);
    await user.click(submit());
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('Your pronunciation could not be checked.');

    // Pressed twice as fast as a learner can: an assessment costs the
    // application money, so one press must buy exactly one.
    const retry = screen.getByRole('button', { name: 'Try again' });
    await act(async () => {
      retry.click();
      retry.click();
    });
    await flush();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(assess).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('region', { name: 'Pronunciation feedback' })).toBeInTheDocument();
  });

  it('offers no retry for a failure the application called final', async () => {
    const user = userEvent.setup();
    const assess = vi.fn(async () => ({ status: 'failed' as const, retryable: false }));
    render(<ReadAloud data={data} recordingBinding={{ ...storeOnly(), assess }} />);
    await makeTake(user);
    await user.click(submit());
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('Your pronunciation could not be checked.');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('never turns a failed upload into a submitted response, and retries the same take', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error('the network went away'))
      .mockResolvedValueOnce({ key: 'take-1', mimeType: 'audio/wav' });
    render(<ReadAloud data={data} recordingBinding={{ upload }} onSubmit={onSubmit} />);
    await makeTake(user);
    await user.click(submit());
    await flush();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Your recording could not be sent.');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('announces a microphone refusal again the second time it happens', async () => {
    const user = userEvent.setup();
    harness?.restore();
    harness = stubSpeechCapture({ refuseMicrophone: 'NotAllowedError' });
    render(<ReadAloud data={data} recordingBinding={storeOnly()} />);
    await user.click(record());
    await flush();
    const first = screen.getByRole('alert');
    expect(first).toHaveTextContent('This page is not allowed to use the microphone.');

    await user.click(record());
    await flush();
    // A new node, so the identical sentence is announced a second time.
    expect(screen.getByRole('alert')).not.toBe(first);
  });

  it('spends no take on a recording too short to judge', async () => {
    const user = userEvent.setup();
    render(<ReadAloud data={data} recordingBinding={storeOnly()} />);
    await makeTake(user, 0.2);
    expect(screen.getByRole('alert')).toHaveTextContent('That recording was too short.');
    expect(screen.getByText('3 of 3 recordings left')).toBeInTheDocument();
  });

  it('stops offering a take once the budget is spent', async () => {
    const user = userEvent.setup();
    const capture = harness as SpeechCaptureHarness;
    render(
      <ReadAloud
        data={{ ...data, recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 1 } }}
        recordingBinding={storeOnly()}
      />,
    );
    await makeTake(user);
    expect(screen.getByText('0 of 1 recording left')).toBeInTheDocument();
    expect(record()).toHaveAttribute('aria-disabled', 'true');
    // Marked, not removed from the tab order — and pressing it opens no
    // microphone, so the mark is presentation and the refusal is real.
    await user.click(record());
    await flush();
    expect(capture.microphonesOpened()).toBe(1);
  });

  it('submits nothing before there is a take to submit', async () => {
    const user = userEvent.setup();
    const upload = vi.fn(storeOnly().upload);
    const onSubmit = vi.fn();
    render(<ReadAloud data={data} recordingBinding={{ upload }} onSubmit={onSubmit} />);
    await user.click(submit());
    await flush();
    expect(upload).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('uploads once however fast the retry is pressed twice', async () => {
    const user = userEvent.setup();
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error('gone'))
      .mockResolvedValue({ key: 'take-1', mimeType: 'audio/wav' });
    render(<ReadAloud data={data} recordingBinding={{ upload }} />);
    await makeTake(user);
    await user.click(submit());
    await flush();

    const retry = screen.getByRole('button', { name: 'Try again' });
    await act(async () => {
      retry.click();
      retry.click();
    });
    await flush();
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('treats an assessor that rejects exactly as one that reports a failure', async () => {
    const user = userEvent.setup();
    const events: InteractionEvent[] = [];
    const assess = vi.fn().mockRejectedValue(new Error('the assessor is unreachable'));
    render(
      <ReadAloud
        data={data}
        recordingBinding={{ ...storeOnly(), assess }}
        onInteraction={(event) => events.push(event)}
      />,
    );
    await makeTake(user);
    await user.click(submit());
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('Your pronunciation could not be checked.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(events.at(-1)).toMatchObject({
      type: 'assessment-failed',
      payload: { retryable: true },
    });
  });
});

describe('<ReadAloud> exam', () => {
  it('uploads, submits and locks, without scoring, revealing or completing', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onComplete = vi.fn();
    const assess = vi.fn();
    render(
      <ReadAloud
        data={data}
        renderMode="exam"
        recordingBinding={{ ...storeOnly(), assess }}
        onSubmit={onSubmit}
        onComplete={onComplete}
      />,
    );
    await makeTake(user);
    await user.click(submit());
    await flush();
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      type: 'read-aloud',
      recording: { key: 'take-1' },
      takes: 1,
    });
    expect(assess).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByText('Answer submitted.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Record/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Pronunciation feedback' }),
    ).not.toBeInTheDocument();
  });

  it('submits a blank only through the control that says so', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ReadAloud
        data={data}
        renderMode="exam"
        recordingBinding={storeOnly()}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Submit without recording' }));
    await flush();
    expect(onSubmit).toHaveBeenCalledWith({ type: 'read-aloud', recording: null });
  });

  it('offers no blank submit in practice', () => {
    render(<ReadAloud data={data} recordingBinding={storeOnly()} />);
    expect(
      screen.queryByRole('button', { name: 'Submit without recording' }),
    ).not.toBeInTheDocument();
  });

  it('blocks submit and offers a retry when the upload fails', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const upload = vi.fn().mockRejectedValue(new Error('the store is down'));
    render(
      <ReadAloud data={data} renderMode="exam" recordingBinding={{ upload }} onSubmit={onSubmit} />,
    );
    await makeTake(user);
    await user.click(submit());
    await flush();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('Answer submitted.')).not.toBeInTheDocument();
  });
});

describe('<ReadAloud> review', () => {
  const submittedResponse: LearnerResponse = {
    type: 'read-aloud',
    recording: { key: 'take-1', mimeType: 'audio/wav' },
    takes: 1,
  };

  it('renders the stored grade and the assessment’s marks, and offers no recorder', async () => {
    const { container } = render(
      <ReadAloud
        data={data}
        renderMode="review"
        value={submittedResponse}
        outcome={outcomeFromGrade(grade)}
        assessment={assessment}
      />,
    );
    expect(screen.queryByRole('button', { name: /^Record/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Pronunciation feedback' })).toBeInTheDocument();
    // The score is rendered once: the feedback panel owns it when it has the grade.
    expect(screen.getAllByText('Score 82%. Passed.')).toHaveLength(1);
    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('rebuilds the word marks from the stored details when no assessment was kept', async () => {
    const { container } = render(
      <ReadAloud
        data={data}
        renderMode="review"
        value={submittedResponse}
        outcome={outcomeFromGrade(grade)}
      />,
    );
    const marks = screen.getByRole('list', { name: 'Your reading, word by word' });
    expect(
      [...marks.querySelectorAll('.lk-ra-word')].map((el) => el.getAttribute('data-state')),
    ).toEqual(['correct', 'mispronounced', 'omitted']);
    expect([...marks.querySelectorAll('.lk-visually-hidden')].map((el) => el.textContent)).toEqual([
      '“the” was read correctly',
      '“lovely” was mispronounced',
      '“today” was not read',
    ]);
    // Nothing else shows the grade now, so this render must.
    expect(screen.getByText('Score 82%. Passed.')).toBeInTheDocument();
    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('shows the score and no marks when the stored details are not word marks', () => {
    const rubricOnly: GradeRecord = {
      ...grade,
      details: [
        {
          itemId: 'overall',
          correct: true,
          learnerResponse: 'x',
          correctResponse: 'x',
        },
      ],
    };
    render(
      <ReadAloud
        data={data}
        renderMode="review"
        value={submittedResponse}
        outcome={outcomeFromGrade(rubricOnly)}
      />,
    );
    expect(
      screen.queryByRole('list', { name: 'Your reading, word by word' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Score 82%. Passed.')).toBeInTheDocument();
  });

  it('reads a stored grade back as nothing when the policy shows no feedback', () => {
    render(
      <ReadAloud
        data={data}
        renderMode="review"
        value={submittedResponse}
        outcome={outcomeFromGrade(grade)}
        assessment={assessment}
        delivery={{ feedback: false }}
      />,
    );
    // Neither the panel with its marks nor the score it would announce.
    expect(screen.queryByText(/Score 82%/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Your reading, word by word' }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('.lk-pf-grade')).toBeNull();
  });

  it('says a graded take was handed in, and nothing more, when the policy shows no feedback', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <ReadAloud
        data={data}
        recordingBinding={{
          ...storeOnly(),
          assess: async () => ({ status: 'graded', assessment, grade }),
        }}
        onComplete={onComplete}
        delivery={{ feedback: false }}
      />,
    );
    await makeTake(user);
    await user.click(submit());
    await flush();
    expect(screen.queryByText(/Score 82%/)).not.toBeInTheDocument();
    expect(screen.queryByText('Clear and steady.')).not.toBeInTheDocument();
    expect(document.querySelector('.lk-pf-grade')).toBeNull();
    expect(screen.getByText('Answer submitted.')).toBeInTheDocument();
    // The grade is still the host's: it arrives, whole.
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ score: 0.82, passed: true }));
  });

  it('shows the deferred and unscorable states with the deferred vocabulary', () => {
    const deferred: ItemOutcome = {
      status: 'deferred',
      reason: 'requires_async_grading',
      maxScore: 1,
    };
    const { container, rerender } = render(
      <ReadAloud data={data} renderMode="review" outcome={deferred} />,
    );
    expect(container.querySelector('[data-status="deferred"]')).toHaveTextContent(
      'Not graded yet. This response is waiting for its grade.',
    );

    const unscorable: ItemOutcome = {
      status: 'unscorable',
      reason: 'the assessor found no speech',
      code: 'no_speech',
      maxScore: 1,
    };
    rerender(<ReadAloud data={data} renderMode="review" outcome={unscorable} />);
    const node = container.querySelector('[data-status="unscorable"]') as HTMLElement;
    expect(node).toHaveTextContent('This response could not be graded.');
    expect(node).toHaveAttribute('data-code', 'no_speech');
    expect(node.textContent).not.toContain('no_speech');
  });

  it('plays the stored take back through the binding’s link', async () => {
    const playbackUrl = vi.fn(async () => 'https://x.test/takes/take-1.wav');
    render(
      <ReadAloud
        data={data}
        renderMode="review"
        value={submittedResponse}
        outcome={outcomeFromGrade(grade)}
        recordingBinding={{ upload: storeOnly().upload, playbackUrl }}
      />,
    );
    await flush();
    expect(playbackUrl).toHaveBeenCalledWith({ key: 'take-1', mimeType: 'audio/wav' });
    expect(screen.getByLabelText('Your recording')).toHaveAttribute(
      'src',
      'https://x.test/takes/take-1.wav',
    );
  });
});

describe('<ReadAloud> events and lifecycle', () => {
  it('reports each step with the take count and the take’s own length', async () => {
    const user = userEvent.setup();
    const events: InteractionEvent[] = [];
    const assess = vi.fn(async () => ({ status: 'graded' as const, assessment, grade }));
    render(
      <ReadAloud
        data={data}
        recordingBinding={{ ...storeOnly(), assess }}
        onInteraction={(event) => events.push(event)}
      />,
    );
    await makeTake(user);
    await user.click(submit());
    await flush();

    expect(events.map((event) => event.type)).toEqual([
      'recording-started',
      'recording-stopped',
      'recording-uploaded',
      'submitted',
      'assessment-requested',
    ]);
    for (const event of events) {
      expect(event.activityId).toBe('ra1');
      expect(typeof event.timestamp).toBe('number');
      expect(event.payload).toHaveProperty('takes');
      expect(event.payload).toHaveProperty('durationMs');
    }
    const stopped = events[1] as InteractionEvent;
    expect(stopped.payload.takes).toBe(1);
    expect(stopped.payload.durationMs).toBeCloseTo(2000, 0);
  });

  it('marks an upload failure and an assessment failure as retryable or not', async () => {
    const user = userEvent.setup();
    const events: InteractionEvent[] = [];
    const upload = vi.fn().mockRejectedValue(new Error('gone'));
    render(
      <ReadAloud
        data={data}
        recordingBinding={{ upload }}
        onInteraction={(event) => events.push(event)}
      />,
    );
    await makeTake(user);
    await user.click(submit());
    await flush();
    const failure = events.find((event) => event.type === 'recording-upload-failed');
    expect(failure?.payload).toMatchObject({ retryable: true, takes: 1 });
  });

  it('reports a discard when the learner replaces a take', async () => {
    const user = userEvent.setup();
    const events: InteractionEvent[] = [];
    render(
      <ReadAloud
        data={data}
        recordingBinding={storeOnly()}
        onInteraction={(event) => events.push(event)}
      />,
    );
    await makeTake(user);
    await user.click(record());
    await flush();
    expect(events.some((event) => event.type === 'recording-discarded')).toBe(true);
  });

  it('gives the microphone back when the capture group its slot names is stopped', async () => {
    const user = userEvent.setup();
    const capture = harness as SpeechCaptureHarness;
    // The group reaches the component only through the slot channel a pager's
    // pane provides — never as a prop.
    render(
      <SequenceSlotContext.Provider
        value={{
          captureGroup: 'slot-1',
          renderMode: 'practice',
          delivery: OPEN_DELIVERY_POLICY,
          scoring: undefined,
          triesClosed: false,
          triesState: () => {},
          takeState: () => {},
        }}
      >
        <ReadAloud data={data} recordingBinding={storeOnly()} />
      </SequenceSlotContext.Provider>,
    );
    await user.click(record());
    await flush();
    expect(capture.liveTracks()).toBe(1);
    await act(async () => {
      stopCaptureGroup('slot-1');
    });
    expect(capture.liveTracks()).toBe(0);
    expect(record()).toHaveTextContent('Record');
  });

  it('gives the microphone back on unmount, group or no group', async () => {
    const user = userEvent.setup();
    const capture = harness as SpeechCaptureHarness;
    const view = render(<ReadAloud data={data} recordingBinding={storeOnly()} />);
    await user.click(record());
    await flush();
    expect(capture.liveTracks()).toBe(1);
    view.unmount();
    expect(capture.liveTracks()).toBe(0);
    expect(capture.openContexts()).toBe(0);
  });

  it('starts over when the activity changes, and not when it merely re-renders', async () => {
    const user = userEvent.setup();
    const binding = storeOnly();
    const view = render(<ReadAloud data={data} recordingBinding={binding} />);
    await makeTake(user);
    expect(record()).toHaveTextContent('Record again');

    // The same object: a parent that rebuilt its props must not throw the take away.
    view.rerender(<ReadAloud data={data} recordingBinding={binding} />);
    expect(record()).toHaveTextContent('Record again');

    view.rerender(<ReadAloud data={{ ...data, id: 'ra9' }} recordingBinding={binding} />);
    expect(record()).toHaveTextContent('Record');
    expect(screen.queryByLabelText('Your recording')).not.toBeInTheDocument();
  });

  it('restores the take budget when the activity changes, so the next item can be recorded', async () => {
    // `discard()` deliberately refunds nothing — a budget a re-record gave back
    // would bound nothing — so a new item that inherited the old one's spent
    // takes would render a live-looking recorder that refuses to record.
    // Reachable through <ActivityPreview>, whose remount key is media-only: an
    // author who tries one take and then edits the reference text is stuck.
    const user = userEvent.setup();
    const oneTake: ReadAloudData = {
      ...data,
      recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 1 },
    };
    const binding = storeOnly();
    const view = render(<ReadAloud data={oneTake} recordingBinding={binding} />);
    await makeTake(user);
    expect(screen.getByText('0 of 1 recording left')).toBeInTheDocument();
    expect(record()).toHaveAttribute('aria-disabled', 'true');

    view.rerender(
      <ReadAloud
        data={{ ...oneTake, referenceText: 'A different sentence.' }}
        recordingBinding={binding}
      />,
    );
    expect(screen.getByText('1 of 1 recording left')).toBeInTheDocument();
    expect(record()).not.toHaveAttribute('aria-disabled');

    // And the restored budget is real: the microphone opens again.
    await makeTake(user);
    expect(screen.getByLabelText('Your recording')).toBeInTheDocument();
  });

  it.each([
    ['its id', { id: 'ra9' }, '3 of 3 recordings left'],
    ['its reference text', { referenceText: 'A different sentence.' }, '3 of 3 recordings left'],
    ['its locale', { locale: 'en-GB' }, '3 of 3 recordings left'],
    [
      'its longest take',
      { recording: { maxSeconds: 30, minSeconds: 1, maxTakes: 3 } },
      '3 of 3 recordings left',
    ],
    [
      'its shortest take',
      { recording: { maxSeconds: 20, minSeconds: 2, maxTakes: 3 } },
      '3 of 3 recordings left',
    ],
    [
      'its take budget',
      { recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 2 } },
      '2 of 2 recordings left',
    ],
  ] as const)('starts over when the reading changes %s (C3)', async (_field, change, left) => {
    const user = userEvent.setup();
    const binding = storeOnly();
    const view = render(<ReadAloud data={data} recordingBinding={binding} />);
    await makeTake(user);
    expect(screen.getByText('2 of 3 recordings left')).toBeInTheDocument();

    view.rerender(<ReadAloud data={{ ...data, ...change }} recordingBinding={binding} />);

    expect(record()).toHaveTextContent(/^Record$/);
    expect(screen.queryByLabelText('Your recording')).not.toBeInTheDocument();
    expect(screen.getByText(left)).toBeInTheDocument();
  });

  it.each([
    ['its title', (item: ReadAloudData) => ({ ...item, title: 'Read this sentence' })],
    ['its instructions', (item: ReadAloudData) => ({ ...item, instructions: 'Take your time.' })],
    [
      'its feedback',
      (item: ReadAloudData): Renderable<ReadAloudData> => ({
        ...item,
        feedback: { correct: 'Good.', incorrect: 'Again.' },
      }),
    ],
    [
      'nothing, as a rebuilt copy',
      (item: ReadAloudData): Renderable<ReadAloudData> => ({ ...item }),
    ],
    [
      'nothing, as its redacted projection',
      (item: ReadAloudData): Renderable<ReadAloudData> => asRenderable<ReadAloudData>(redact(item)),
    ],
  ] as const)('keeps the take, the budget and the grade in flight when the host changes %s (C3)', async (_change, rebuild) => {
    // Measured before the fix: reset on the IDENTITY of `data` threw a grade
    // still being assessed away and refunded the take budget whenever a host
    // handed the component a new object — which `redact()` does on every call,
    // and `activities={raw.map(redact)}` on every render. Nothing about what
    // the learner reads changed, so nothing about the take may.
    const user = userEvent.setup();
    const onComplete = vi.fn();
    let settle: (result: ReadAloudAssessResult) => void = () => {};
    const binding: RecordingBinding = {
      ...storeOnly(),
      assess: () =>
        new Promise<ReadAloudAssessResult>((resolve) => {
          settle = resolve;
        }),
    };
    const view = render(
      <ReadAloud data={data} recordingBinding={binding} onComplete={onComplete} />,
    );
    await makeTake(user);
    await user.click(submit());
    await flush();
    expect(screen.getByText('Checking your pronunciation…')).toBeInTheDocument();

    view.rerender(
      <ReadAloud data={rebuild(data)} recordingBinding={binding} onComplete={onComplete} />,
    );
    await act(async () => {
      settle({ status: 'graded', assessment, grade });
    });
    await flush();

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByText('2 of 3 recordings left')).toBeInTheDocument();
    expect(record()).toHaveTextContent('Record again');
  });

  it.each([
    'practice',
    'exam',
  ] as const)('allows one take at maxTakes 1 in %s when the host rebuilds the item on every render (C3)', async (renderMode) => {
    // The regression as a host meets it: an item passed through `redact()` in
    // render, and a submit saved into state. Before the fix the save re-rendered
    // the host, the component reset, and a `maxTakes: 1` exam took a second take.
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onComplete = vi.fn();
    const oneTake: ReadAloudData = {
      ...data,
      recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 1 },
    };
    let settle: (result: ReadAloudAssessResult) => void = () => {};
    const binding: RecordingBinding = {
      ...storeOnly(),
      assess: () =>
        new Promise<ReadAloudAssessResult>((resolve) => {
          settle = resolve;
        }),
    };
    function Host() {
      const [saved, setSaved] = useState(0);
      return (
        <>
          <output>{saved}</output>
          <ReadAloud
            data={asRenderable<ReadAloudData>(redact(oneTake))}
            renderMode={renderMode}
            recordingBinding={binding}
            onComplete={onComplete}
            onSubmit={(response) => {
              onSubmit(response);
              setSaved((count) => count + 1);
            }}
          />
        </>
      );
    }
    render(<Host />);

    await makeTake(user);
    await user.click(submit());
    await flush();
    await act(async () => {
      settle({ status: 'graded', assessment, grade });
    });
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    if (renderMode === 'practice') {
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(screen.getByText('0 of 1 recording left')).toBeInTheDocument();
      expect(record()).toHaveAttribute('aria-disabled', 'true');
    } else {
      expect(screen.queryByRole('button', { name: /^Record/ })).toBeNull();
      expect(screen.getByText('Answer submitted.')).toBeInTheDocument();
    }
  });

  it('reports nothing once it has been detached, and nothing for the item it has left', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    let settle: (result: {
      status: 'graded';
      assessment: SpeechAssessment;
      grade: GradeRecord;
    }) => void = () => {};
    const assess = () =>
      new Promise<{ status: 'graded'; assessment: SpeechAssessment; grade: GradeRecord }>(
        (resolve) => {
          settle = resolve;
        },
      );
    const view = render(
      <ReadAloud
        data={data}
        recordingBinding={{ ...storeOnly(), assess }}
        onComplete={onComplete}
      />,
    );
    await makeTake(user);
    await user.click(submit());
    await flush();
    view.unmount();
    await act(async () => {
      settle({ status: 'graded', assessment, grade });
    });
    await flush();
    expect(onComplete).not.toHaveBeenCalled();

    // The same guard, one door along: an assessment held while the activity is
    // swapped must not grade the item now on screen.
    const second = render(
      <ReadAloud
        data={data}
        recordingBinding={{ ...storeOnly(), assess }}
        onComplete={onComplete}
      />,
    );
    await makeTake(user);
    await user.click(submit());
    await flush();
    second.rerender(
      <ReadAloud
        data={{ ...data, id: 'ra9' }}
        recordingBinding={{ ...storeOnly(), assess }}
        onComplete={onComplete}
      />,
    );
    await act(async () => {
      settle({ status: 'graded', assessment, grade });
    });
    await flush();
    expect(onComplete).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('region', { name: 'Pronunciation feedback' }),
    ).not.toBeInTheDocument();
  });
});

describe('<ReadAloud> inside a pager', () => {
  const question: MultipleChoiceData = {
    schemaVersion: '1.0',
    type: 'multiple-choice',
    id: 'mc1',
    title: 'A question',
    question: 'Which one?',
    mode: 'single',
    scoringStrategy: 'all-or-nothing',
    options: [
      { id: 'a', text: 'A', isCorrect: true },
      { id: 'b', text: 'B', isCorrect: false },
    ],
  };

  it('keeps a finished take, and its spent budget, across navigating away and back', async () => {
    // The pager stops a hidden slot's captures so a microphone does not go on
    // listening under the next question. Releasing the DEVICE is right;
    // throwing away a take that is already encoded is not — the take is spent
    // either way, so a learner would come back to an activity they can no
    // longer answer and no message saying why. It is the pager's own founding
    // principle: slots stay mounted precisely so nobody silently loses an
    // answer.
    const user = userEvent.setup();
    const capture = harness as SpeechCaptureHarness;
    render(
      <ActivitySequence
        activities={[
          { ...data, id: 'ra1', recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 1 } },
          question,
        ]}
        recordingBinding={{ upload: async (take) => ({ key: 'take-1', mimeType: take.mimeType }) }}
      />,
    );

    await user.click(record());
    await flush();
    act(() => {
      capture.pushLevel(0.5, capture.sampleRate * 2);
    });
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    expect(screen.getByLabelText('Your recording')).toBeInTheDocument();
    expect(screen.getByText('0 of 1 recording left')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    // Hiding the pane releases the device, and there was none open to release.
    expect(capture.liveTracks()).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Previous' }));

    expect(screen.getByLabelText('Your recording')).toBeInTheDocument();
    expect(screen.getByText('0 of 1 recording left')).toBeInTheDocument();
    expect(submit()).not.toHaveAttribute('aria-disabled');
  });

  it('still releases the microphone when the pager hides a slot mid-take', async () => {
    const user = userEvent.setup();
    const capture = harness as SpeechCaptureHarness;
    render(
      <ActivitySequence
        activities={[{ ...data, id: 'ra1' }, question]}
        recordingBinding={{ upload: async (take) => ({ key: 'take-1', mimeType: take.mimeType }) }}
      />,
    );
    await user.click(record());
    await flush();
    expect(capture.liveTracks()).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(capture.liveTracks()).toBe(0);
    expect(capture.openContexts()).toBe(0);
  });
});

describe('<ReadAloud> a grade nothing validated', () => {
  const submittedResponse: LearnerResponse = {
    type: 'read-aloud',
    recording: { key: 'take-1', mimeType: 'audio/wav' },
    takes: 1,
  };

  it('survives a stored grade whose details came back as JSON null', () => {
    // `GradeRecord.details` is optional, so a backend that serialises an absent
    // optional as `null` is the ordinary way here — and the throw came from a
    // useMemo in the core, taking the score, the feedback and the outcome
    // summary with it, in the one mode whose job is to show a stored result.
    const nulled = { ...grade, details: null } as unknown as GradeRecord;
    render(
      <ReadAloud
        data={data}
        renderMode="review"
        value={submittedResponse}
        outcome={outcomeFromGrade(nulled)}
      />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Score 82%. Passed.')).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Your reading, word by word' }),
    ).not.toBeInTheDocument();
  });

  it('renders no percentage at all rather than “NaN%” for an outcome that carries none', () => {
    const outcome = {
      status: 'graded',
      score: 'eighty-two',
      maxScore: 1,
      passed: 'yes',
      grade,
    } as unknown as ItemOutcome;
    const { container } = render(
      <ReadAloud data={data} renderMode="review" value={submittedResponse} outcome={outcome} />,
    );
    expect(container.textContent).not.toContain('NaN');
    expect(screen.getByText('This response could not be graded.')).toBeInTheDocument();
  });

  it('renders review for an outcome that came back as JSON null, as if none were sent', () => {
    render(
      <ReadAloud
        data={data}
        renderMode="review"
        value={submittedResponse}
        outcome={null as never}
      />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(data.referenceText)).toBeInTheDocument();
  });

  it('marks the words and says the take could not be graded when only the grade is unreadable', async () => {
    // Before one reader owned the grade, the panel's grade block rendered with
    // no score in it and the component hid its own copy: the learner got
    // neither a score nor the sentence saying there was none.
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const events: InteractionEvent[] = [];
    const unreadable = { ...grade, maxScore: '100', score: 82 } as unknown as GradeRecord;
    const { container } = render(
      <ReadAloud
        data={data}
        recordingBinding={{
          ...storeOnly(),
          assess: async () => ({ status: 'graded', assessment, grade: unreadable }),
        }}
        onComplete={onComplete}
        onInteraction={(event) => events.push(event)}
      />,
    );
    await makeTake(user);
    await user.click(submit());
    await flush();
    expect(screen.getByRole('list', { name: 'Your reading, word by word' })).toBeInTheDocument();
    expect(container.querySelector('.lk-pf-grade')).not.toBeInTheDocument();
    expect(container.querySelector('.lk-ra [aria-live]')).toHaveTextContent(
      'Answer submitted. This response could not be graded.',
    );
    expect(container.textContent).not.toMatch(/\d+%\. (Passed|Not passed)/);
    expect(onComplete).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({
      type: 'assessment-failed',
      payload: { retryable: true },
    });
  });

  it('reports a readable grade that came back without evidence, and shows its score', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <ReadAloud
        data={data}
        recordingBinding={{
          ...storeOnly(),
          assess: async () =>
            ({ status: 'graded', assessment: null, grade }) as unknown as ReadAloudAssessResult,
        }}
        onComplete={onComplete}
      />,
    );
    await makeTake(user);
    await user.click(submit());
    await flush();
    expect(screen.getByText(/Score 82%\. Passed\./)).toBeInTheDocument();
    const result = onComplete.mock.calls[0]?.[0];
    expect(result).toMatchObject({ score: 0.82, maxScore: 1, passed: true });
    // No evidence, so no recognised text: the statement says so and still validates.
    expect(result.xapiStatement.result.response).toBe('');
    expect(() => validateXAPIStatement(result.xapiStatement)).not.toThrow();
  });

  it('never completes on a verdict that is not a boolean, and never builds a statement from one', async () => {
    // Development used to throw from the statement build after the score was
    // on screen, dropping the grade from every callback; production sent a
    // statement with `success: null`.
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <ReadAloud
        data={data}
        recordingBinding={{
          ...storeOnly(),
          assess: async () =>
            ({
              status: 'graded',
              assessment,
              grade: { ...grade, passed: null },
            }) as unknown as ReadAloudAssessResult,
        }}
        onComplete={onComplete}
      />,
    );
    await makeTake(user);
    await user.click(submit());
    await flush();
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.queryByText(/Not passed/)).not.toBeInTheDocument();
    expect(screen.getByText(/This response could not be graded\./)).toBeInTheDocument();
  });

  it('shows the score even when the feedback panel falls to its boundary', () => {
    // D2's dev throw, met through the one input D2 does not cover: the grade.
    // Whether this component clips its own score sentence must be a FACT about
    // what reached the screen, never a prediction from the props — a grade on
    // screen twice is a far smaller defect than a grade nowhere.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const refused = { ...assessment, scale: 5 } as unknown as SpeechAssessment;
    render(
      <ReadAloud
        data={data}
        renderMode="review"
        value={submittedResponse}
        outcome={outcomeFromGrade(grade)}
        assessment={refused}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Activity failed to render');
    expect(screen.getByText('Score 82%. Passed.')).toBeInTheDocument();
  });
});

describe('<ReadAloud> and the microphone it is about to be assessed through', () => {
  it('keeps the per-second counter out of the live region and announces the two moments instead', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReadAloud data={data} recordingBinding={storeOnly()} />);
    const region = container.querySelector('.lk-ra [aria-live]') as HTMLElement;

    await user.click(record());
    await flush();
    const progress = container.querySelector('.lk-ra-progress') as HTMLElement;
    // A counter that changes every second is ten announcements in a ten-second
    // take, and on a device without headphones that speech goes into the
    // recording being assessed for pronunciation.
    expect(progress).not.toHaveAttribute('role', 'status');
    expect(progress).toHaveAttribute('aria-hidden', 'true');
    expect(progress).toBeVisible();
    expect(region).toHaveTextContent('Recording started.');

    act(() => {
      (harness as SpeechCaptureHarness).pushLevel(
        0.5,
        (harness as SpeechCaptureHarness).sampleRate * 2,
      );
    });
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    expect(region).toHaveTextContent('Recording stopped.');
  });

  it('pauses a model recording that is started in the middle of a take', async () => {
    // F5's hazard through the other door: pausing on record start is not
    // enough, because the play control is still there while the take runs.
    stubMediaElement();
    const user = userEvent.setup();
    render(<ReadAloud data={withModels} recordingBinding={storeOnly()} />);
    await user.click(record());
    await flush();

    const model = screen.getByRole('group', { name: 'Model recording' });
    await user.click(within(model).getByRole('button', { name: 'Play' }));
    expect((document.querySelector('audio') as HTMLAudioElement).paused).toBe(true);
  });
});

describe('<ReadAloud> bounds and statements', () => {
  it('clamps an out-of-range maxSeconds to the schema’s own ceiling', async () => {
    // `practice` renders unvalidated content in production, so the bound a take
    // is captured under is whatever the data says — and a recording that never
    // stops itself is the one failure a learner cannot see coming.
    vi.stubEnv('NODE_ENV', 'production');
    const user = userEvent.setup();
    const unbounded = {
      ...data,
      recording: { maxSeconds: 100_000, minSeconds: 1, maxTakes: 3 },
    } as unknown as ReadAloudData;
    render(<ReadAloud data={unbounded} recordingBinding={storeOnly()} />);
    await user.click(record());
    await flush();
    expect(screen.getByText('Recording: 0 of 300 seconds')).toBeInTheDocument();
  });

  it('builds a statement the SDK’s own validator accepts from a points-based grade', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const points: GradeRecord = { ...grade, score: 82, maxScore: 100 };
    const assess = vi.fn(async () => ({ status: 'graded' as const, assessment, grade: points }));
    render(
      <ReadAloud
        data={data}
        recordingBinding={{ ...storeOnly(), assess }}
        onComplete={onComplete}
      />,
    );
    await makeTake(user);
    await user.click(submit());
    await flush();

    const result = onComplete.mock.calls[0]?.[0];
    // The learner's own numbers are untouched; only the statement normalises,
    // because xAPI's `scaled` is a fraction of 1.
    expect(result).toMatchObject({ score: 82, maxScore: 100 });
    expect(result.xapiStatement.result.score.scaled).toBeCloseTo(0.82, 10);
    expect(() => validateXAPIStatement(result.xapiStatement)).not.toThrow();
  });

  it('says each mark once, not twice, to a screen reader', async () => {
    // The hidden sentence is the marks' only channel for assistive technology;
    // a `title` carrying the same sentence is read straight after it.
    const { container } = render(
      <ReadAloud
        data={data}
        renderMode="review"
        value={{ type: 'read-aloud', recording: { key: 'take-1', mimeType: 'audio/wav' } }}
        outcome={outcomeFromGrade(grade)}
      />,
    );
    for (const word of container.querySelectorAll('.lk-ra-word')) {
      expect(word).not.toHaveAttribute('title');
    }
  });

  it('does not offer `captureGroup` as a consumer prop, on the props or on the component (C6)', () => {
    // It names the registry group a pager's pane stops. A consumer string there
    // could stop a sequence's microphone, so it is on neither the published
    // props nor the published component's own signature — round 2 removed it
    // from the first and left it on the second.
    const props: ReadAloudProps = { data };
    // @ts-expect-error `captureGroup` is the pager's, not a consumer's
    props.captureGroup = 'slot-1';
    const element = (
      // @ts-expect-error the component takes `ReadAloudProps` and nothing beside them
      <ReadAloud data={data} recordingBinding={storeOnly()} captureGroup="slot-1" />
    );
    type Same<A, B> =
      (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
    const signature: Same<ComponentProps<typeof ReadAloud>, ReadAloudProps> = true;
    expect(props.data).toBe(data);
    expect(signature).toBe(true);
    expect(element.type).toBe(ReadAloud);
  });
});

describe('<ReadAloud> under a strict Content-Security-Policy (C7)', () => {
  const question: MultipleChoiceData = {
    schemaVersion: '1.0',
    type: 'multiple-choice',
    id: 'mc1',
    title: 'A question',
    question: 'Which one?',
    mode: 'single',
    scoringStrategy: 'all-or-nothing',
    options: [
      { id: 'a', text: 'A', isCorrect: true },
      { id: 'b', text: 'B', isCorrect: false },
    ],
  };

  it('loads the capture module from `workletUrl` when it is given, and mints a blob: one when not', async () => {
    // Neither component forwarded it, so on a policy that refuses `blob:` in
    // `script-src` every take went through the deprecated main-thread path —
    // and still recorded, so nothing said so.
    const user = userEvent.setup();
    const capture = harness as SpeechCaptureHarness;
    const { unmount } = render(
      <ReadAloud data={data} recordingBinding={storeOnly()} workletUrl="/lk-speech-capture.js" />,
    );
    await user.click(record());
    await flush();
    expect(capture.addedModules()).toEqual(['/lk-speech-capture.js']);
    expect(capture.capturePath()).toBe('worklet');
    unmount();

    render(<ReadAloud data={data} recordingBinding={storeOnly()} />);
    await user.click(record());
    await flush();
    expect(capture.addedModules()[1]).toMatch(/^blob:/);
  });

  it('hands `workletUrl` from a sequence to every read-aloud slot', async () => {
    const user = userEvent.setup();
    const capture = harness as SpeechCaptureHarness;
    render(
      <ActivitySequence
        activities={[question, { ...data, id: 'ra1' }]}
        recordingBinding={{ upload: async (take) => ({ key: 'take-1', mimeType: take.mimeType }) }}
        workletUrl="/assets/lk-speech-capture.js"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(record());
    await flush();
    expect(capture.addedModules()).toEqual(['/assets/lk-speech-capture.js']);
  });

  it('says the take cannot be played where the page refuses it, and offers no button that would do nothing', async () => {
    // Under `default-src 'self'` a `blob:` take is blocked by `media-src`: the
    // element fires `error`, the player and every per-word Play button go on
    // looking as if they work, and pressing them does nothing.
    const user = userEvent.setup();
    const assess = vi.fn(async () => ({ status: 'graded' as const, assessment, grade }));
    const withTimings: SpeechAssessment = {
      ...assessment,
      words: assessment.words.map((word, index) => ({
        ...word,
        startMs: index * 300,
        durationMs: 250,
      })),
    };
    assess.mockResolvedValue({ status: 'graded', assessment: withTimings, grade });
    const { container } = render(
      <ReadAloud data={data} recordingBinding={{ ...storeOnly(), assess }} />,
    );
    await makeTake(user);
    const player = screen.getByLabelText('Your recording');
    fireEvent.error(player);

    expect(screen.queryByLabelText('Your recording')).not.toBeInTheDocument();
    const note = container.querySelector('.lk-ra-take-unavailable') as HTMLElement;
    expect(note).toHaveTextContent('Your recording cannot be played back on this page.');
    expect(note).toHaveAttribute('role', 'note');
    expect(await checkA11y(container)).toHaveNoViolations();

    // Submitting still works: nothing is wrong with the take itself.
    await user.click(submit());
    await flush();
    expect(assess).toHaveBeenCalledTimes(1);
    await user.click(screen.getAllByRole('button', { name: /^Details for/ })[0] as HTMLElement);
    expect(screen.queryByRole('button', { name: /^Play “/ })).not.toBeInTheDocument();
    expect(container.querySelector('.lk-pf-audio')).toBeNull();
    // One note, not one per element that plays the take.
    expect(screen.getAllByText('Your recording cannot be played back on this page.')).toHaveLength(
      1,
    );

    // A new take is a new URL, and nothing has refused that one yet.
    await makeTake(user);
    expect(screen.getByLabelText('Your recording')).toBeInTheDocument();
    expect(container.querySelector('.lk-ra-take-unavailable')).toBeNull();
  });

  it('says the same in review, for a stored link the page will not load', async () => {
    const playbackUrl = vi.fn(async () => 'https://storage.x.test/takes/take-1.wav');
    render(
      <ReadAloud
        data={data}
        renderMode="review"
        value={{ type: 'read-aloud', recording: { key: 'take-1', mimeType: 'audio/wav' } }}
        outcome={outcomeFromGrade(grade)}
        recordingBinding={{ upload: storeOnly().upload, playbackUrl }}
      />,
    );
    await flush();
    fireEvent.error(screen.getByLabelText('Your recording'));
    expect(screen.getByText('Your recording cannot be played back on this page.')).toHaveClass(
      'lk-ra-take-unavailable',
    );
  });

  it('keeps a refusal that belongs to an earlier take from marking a later one', async () => {
    // The element reports what it holds when it fails, not what a closure
    // remembered: an `error` for a source the element no longer holds names
    // that source, which is not the take on screen.
    const user = userEvent.setup();
    render(<ReadAloud data={data} recordingBinding={storeOnly()} />);
    await makeTake(user);
    const first = screen.getByLabelText('Your recording');
    const firstUrl = first.getAttribute('src') as string;
    await makeTake(user);
    const second = screen.getByLabelText('Your recording');
    expect(second.getAttribute('src')).not.toBe(firstUrl);
    // A stale element reporting its own, earlier source.
    const stale = document.createElement('audio');
    stale.setAttribute('src', firstUrl);
    stale.addEventListener('error', () => {});
    fireEvent.error(stale);
    expect(screen.getByLabelText('Your recording')).toBe(second);
  });
});

describe('<ReadAloud> and a budgeted model recording during a take (C8)', () => {
  const budgeted = (maxPlays: number): ReadAloudData => ({
    ...data,
    id: 'ra-budget',
    media: {
      type: 'audio',
      url: 'https://x.test/weather.mp3',
      alt: 'Model',
      playback: { maxPlays },
    },
  });
  const bindingFor = (onPlayConsumed: () => undefined) => ({
    key: 'm',
    slotId: '0',
    index: 0,
    activityId: 'ra-budget',
    onPlayConsumed,
  });

  it.each([
    'practice',
    'exam',
  ] as const)('charges no play for a press, a media key or a confirmation while the learner records (%s)', async (renderMode) => {
    // The F6 guard silenced a model started mid-take — after the transport had
    // charged the play. A learner on a two-play listening item lost one they
    // never heard, with no message. Refused before the charge instead.
    stubMediaElement();
    const user = userEvent.setup();
    const onPlayConsumed = vi.fn(() => undefined);
    render(
      <ReadAloud
        data={budgeted(2)}
        renderMode={renderMode}
        recordingBinding={storeOnly()}
        mediaBudget={bindingFor(onPlayConsumed)}
      />,
    );
    const model = screen.getByRole('group', { name: 'Model recording' });
    const element = model.querySelector('audio') as HTMLAudioElement;
    await user.click(record());
    await flush();

    const play = within(model).getByRole('button', { name: 'Play' });
    expect(play).toHaveAttribute('aria-disabled', 'true');
    await user.click(play);
    // A hardware media key or a script starts the element without the button.
    await act(async () => {
      await element.play();
    });
    expect(onPlayConsumed).not.toHaveBeenCalled();
    expect(element.paused).toBe(true);
    expect(within(model).getByText('2 of 2 plays remaining')).toBeInTheDocument();

    act(() => {
      (harness as SpeechCaptureHarness).pushLevel(
        0.5,
        (harness as SpeechCaptureHarness).sampleRate * 2,
      );
    });
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));

    // Once the take is over, a press is a play again, charged once.
    await user.click(within(model).getByRole('button', { name: 'Play' }));
    expect(onPlayConsumed).toHaveBeenCalledTimes(1);
    expect(within(model).getByText('1 of 2 plays remaining')).toBeInTheDocument();
  });

  it('charges nothing for a last-play confirmation that was left open when the take began', async () => {
    // The confirmation calls straight into the charge, past the checks the
    // button and the element make: the one place left to refuse it is the
    // charge itself.
    stubMediaElement();
    const user = userEvent.setup();
    const onPlayConsumed = vi.fn(() => undefined);
    render(
      <ReadAloud
        data={budgeted(1)}
        recordingBinding={storeOnly()}
        mediaBudget={bindingFor(onPlayConsumed)}
      />,
    );
    const model = screen.getByRole('group', { name: 'Model recording' });
    await user.click(within(model).getByRole('button', { name: 'Play' }));
    const confirm = within(model).getByRole('button', { name: 'Start last play' });

    await user.click(record());
    await flush();
    await user.click(confirm);
    expect(onPlayConsumed).not.toHaveBeenCalled();
    expect((model.querySelector('audio') as HTMLAudioElement).paused).toBe(true);
  });
});

describe('<ReadAloud> focus after Try again (C8)', () => {
  it.each([
    [
      'a failed upload',
      (): RecordingBinding => ({
        upload: vi
          .fn()
          .mockRejectedValueOnce(new Error('the network went away'))
          .mockResolvedValue({ key: 'take-1', mimeType: 'audio/wav' }),
      }),
    ],
    [
      'a failed assessment',
      (): RecordingBinding => ({
        ...storeOnly(),
        assess: vi
          .fn()
          .mockResolvedValueOnce({ status: 'failed', retryable: true })
          .mockResolvedValue({ status: 'graded', assessment, grade }),
      }),
    ],
  ])('moves focus to the submit it retries, never to the page body, after %s', async (_, binding) => {
    const user = userEvent.setup();
    render(<ReadAloud data={data} recordingBinding={binding()} />);
    await makeTake(user);
    await user.click(submit());
    await flush();

    const retry = screen.getByRole('button', { name: 'Try again' });
    retry.focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(submit());
    await flush();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(submit());
  });
});

describe('<ReadAloud> bounds a server stored (C8)', () => {
  it.each([
    [
      'a fractional bound',
      { maxSeconds: 2.5, minSeconds: 1, maxTakes: 3 },
      'Recording stopped. 2.5 of 2.5 seconds recorded.',
      '2 of 3 recordings left',
    ],
    [
      'a take count stored as a string',
      { maxSeconds: 3, maxTakes: '1' },
      'Recording stopped. 3 of 3 seconds recorded.',
      '19 of 20 recordings left',
    ],
    [
      'a minimum the maximum cannot reach',
      { maxSeconds: 3, minSeconds: 30, maxTakes: 3 },
      'Recording stopped. 3 of 3 seconds recorded.',
      '2 of 3 recordings left',
    ],
  ])('records %s to its bound and says no more than it', async (_, recording, stopped, takes) => {
    vi.stubEnv('NODE_ENV', 'production');
    const user = userEvent.setup();
    const capture = harness as SpeechCaptureHarness;
    const { container } = render(
      <ReadAloud
        data={{ ...data, recording } as unknown as ReadAloudData}
        recordingBinding={storeOnly()}
      />,
    );
    await user.click(record());
    await flush();
    // Past the bound: the recorder stops the take there by itself.
    act(() => {
      capture.pushLevel(0.5, capture.sampleRate * 4);
    });
    await flush();
    expect(container.querySelector('.lk-ra-recorder')).toHaveAttribute('data-status', 'recorded');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.querySelector('.lk-ra [aria-live]')).toHaveTextContent(stopped);
    expect(screen.getByText(takes)).toBeInTheDocument();
  });
});
