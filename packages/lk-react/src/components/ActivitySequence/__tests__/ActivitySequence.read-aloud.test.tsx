import type {
  ActivityResult,
  ItemOutcome,
  LearnerResponse,
  MultipleChoiceData,
  ReadAloudData,
  ReadAloudLearnerResponse,
  RecordingRef,
  SpeechAssessment,
} from '@intellectif/lk-core';
import { redact } from '@intellectif/lk-core';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import { type SpeechCaptureHarness, stubSpeechCapture } from '../../../test-support/speech.js';
import { ReadAloud } from '../../ReadAloud/index.js';
import type { ReadAloudAssessResult, RecordingBinding } from '../../ReadAloud/ReadAloud.js';
import { joinCaptureGroup } from '../../shared/capture-registry.js';
import {
  type ActivityProps,
  asRenderableSequence,
  type SequenceRecordingBinding,
} from '../../types.js';
import { ActivitySequence, type SequenceItemOutcome } from '../index.js';

/**
 * The read-aloud slot, and what it changes about how a sequence decides a set
 * is finished: D1, the review round that followed it (F10, F11b, F13–F15), and
 * round 3's classes (C2–C4), whose general proof is the state-machine property
 * in `ActivitySequence.takes.property.test.tsx`. The cases here are the
 * measured orderings, kept as named regressions.
 *
 * The defect this suite exists around is silent: in `practice` the pager
 * records nothing on submit, and `<ReadAloud>` calls `onComplete` only when a
 * grade comes back — so an unscorable take, an assessor that failed, or a
 * binding that stores without judging left the slot `null` for ever and
 * `onFinished` never fired for the whole set. One bad take, and a mixed
 * practice set silently never finishes.
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

const readAloud = (id: string, title: string): ReadAloudData => ({
  schemaVersion: '1.0',
  type: 'read-aloud',
  id,
  title,
  referenceText: 'The weather is lovely today.',
  locale: 'en-US',
  recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 2 },
  scoring: { dimensions: [{ name: 'accuracy', weight: 3 }] },
});

const mc = (id: string, question: string): MultipleChoiceData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id,
  title: `Title ${id}`,
  question,
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'wrong', text: 'Wrong', isCorrect: false },
    { id: 'right', text: 'Right', isCorrect: true },
  ],
});

const assessment: SpeechAssessment = {
  assessmentVersion: '1.0',
  status: 'assessed',
  task: 'scripted',
  locale: 'en-US',
  referenceText: 'The weather is lovely today.',
  recordingKey: 'take-1',
  assessor: { kind: 'auto' },
  scale: 100,
  scores: { accuracy: 88 },
  recognizedText: 'the weather is lonely today',
  miscue: 'assessor',
  words: [
    { text: 'The', accuracy: 95, error: 'none' },
    { text: 'weather', accuracy: 92, error: 'none' },
    { text: 'is', accuracy: 91, error: 'none' },
    { text: 'lonely', accuracy: 40, error: 'mispronunciation' },
    { text: 'today', accuracy: 88, error: 'none' },
  ],
};

const graded: ReadAloudAssessResult = {
  status: 'graded',
  assessment,
  grade: { score: 0.88, maxScore: 1, passed: true, feedback: 'Clear and steady.' },
};

/** A pager-level binding that stores every take and judges it however it is told. */
function bindingThat(
  assess?: (ref: RecordingRef) => Promise<ReadAloudAssessResult>,
): SequenceRecordingBinding {
  return {
    upload: async (take) => ({
      key: 'take-1',
      mimeType: take.mimeType,
      durationMs: take.durationMs,
    }),
    ...(assess !== undefined ? { assess: (ref) => assess(ref) } : {}),
  };
}

/** A promise the test settles by hand, so an assessment or a grade can be held across renders. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

/** Lets every pending promise in the recorder and the bindings settle. */
async function flush(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 20; tick += 1) {
      await Promise.resolve();
    }
  });
}

/** Records one take in the visible slot and submits it. */
async function speakAndSubmit(user: UserEvent, scope: HTMLElement = document.body): Promise<void> {
  const capture = harness as SpeechCaptureHarness;
  const inside = within(scope);
  await user.click(inside.getByRole('button', { name: /^Record/ }));
  await flush();
  act(() => {
    capture.pushLevel(0.5, capture.sampleRate * 2);
  });
  await user.click(inside.getByRole('button', { name: 'Stop recording' }));
  await user.click(inside.getByRole('button', { name: 'Submit' }));
  await flush();
}

const answerMultipleChoice = async (user: UserEvent): Promise<void> => {
  await user.click(screen.getByRole('radio', { name: 'Right' }));
  await user.click(screen.getByRole('button', { name: 'Submit' }));
};

describe('<ActivitySequence> read-aloud slot', () => {
  it('renders the activity, not the unsupported note, and binds the take to its slot', async () => {
    const user = userEvent.setup();
    const upload = vi.fn<SequenceRecordingBinding['upload']>(async () => ({
      key: 'take-1',
      mimeType: 'audio/wav',
    }));
    const onSubmit = vi.fn();
    const { container } = render(
      <ActivitySequence
        activities={[readAloud('ra1', 'Read it')]}
        recordingBinding={{ upload }}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('form', { name: 'Read it' })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(await checkA11y(container)).toHaveNoViolations();

    await speakAndSubmit(user);

    // The slot travels with the take, in the shape `onSubmit` already uses —
    // so one identity is stored against the answer and against the recording.
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]?.[1]).toEqual({ slotId: '0', index: 0, activityId: 'ra1' });
    const response = onSubmit.mock.calls[0]?.[0] as ReadAloudLearnerResponse;
    expect(response.recording?.key).toBe('take-1');
    expect(onSubmit.mock.calls[0]?.[1]).toEqual({ slotId: '0', index: 0, activityId: 'ra1' });
  });

  it('hands a per-slot assessment to review, and reads it live rather than at mount', () => {
    const outcome: ItemOutcome = {
      status: 'graded',
      score: 0.88,
      maxScore: 1,
      passed: true,
      feedback: 'Clear and steady.',
      grade: { score: 0.88, maxScore: 1, passed: true, feedback: 'Clear and steady.' },
    };
    const { rerender } = render(
      <ActivitySequence
        activities={[readAloud('ra1', 'Read it')]}
        renderMode="review"
        outcomes={{ '0': outcome }}
      />,
    );

    // Nothing to mark yet: the grade is on screen, the words are not.
    expect(screen.queryByRole('list', { name: 'Your reading, word by word' })).toBeNull();

    // An assessment is fetched beside the attempt it explains and lands after
    // the first paint. A mount-only read would leave the marks missing for ever.
    rerender(
      <ActivitySequence
        activities={[readAloud('ra1', 'Read it')]}
        renderMode="review"
        outcomes={{ '0': outcome }}
        assessments={{ '0': assessment }}
      />,
    );

    const words = screen.getByRole('list', { name: 'Your reading, word by word' });
    // Named by the word the item asked for, never by what was heard in its
    // place: "lovely" is what the learner was supposed to say.
    expect(within(words).getByText('“lovely” was mispronounced')).toBeInTheDocument();
  });

  it('shows the assessment-unavailable notice when the pager stores takes but judges none', async () => {
    const user = userEvent.setup();
    render(
      <ActivitySequence
        activities={[readAloud('ra1', 'Read it')]}
        recordingBinding={bindingThat()}
      />,
    );

    await speakAndSubmit(user);

    expect(
      screen.getByText('Pronunciation feedback is not available for this activity.'),
    ).toBeInTheDocument();
  });
});

describe('<ActivitySequence> completion with a read-aloud (D1)', () => {
  it('finishes a practice set whose only read-aloud take comes back unscorable', async () => {
    // The whole reason the rule exists. Before it, this set never finished:
    // an unscorable take produces no grade, `onComplete` never fires, and the
    // slot's entry stayed null for ever.
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    const onComplete = vi.fn();
    render(
      <ActivitySequence
        activities={[mc('q1', 'Q one?'), readAloud('ra1', 'Read it')]}
        recordingBinding={bindingThat(async () => ({ status: 'unscorable', code: 'no_speech' }))}
        onFinished={onFinished}
        onComplete={onComplete}
      />,
    );

    await answerMultipleChoice(user);
    expect(onFinished).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await speakAndSubmit(user);

    // The learner is told, and the set is over.
    expect(
      screen.getByText('We could not hear you. Record again somewhere quieter.'),
    ).toBeInTheDocument();
    expect(onFinished).toHaveBeenCalledTimes(1);
    const items = onFinished.mock.calls[0]?.[0] ?? [];
    expect(items.map((item) => item.kind)).toEqual(['scored', 'responded']);
    const spoken = items[1];
    if (spoken?.kind !== 'responded') {
      throw new Error(`expected a responded outcome, got ${spoken?.kind ?? 'nothing'}`);
    }
    expect(spoken.slotId).toBe('1');
    expect(spoken.activityId).toBe('ra1');
    expect((spoken.response as ReadAloudLearnerResponse).recording?.key).toBe('take-1');

    // `onComplete` promises ActivityResult[], and a take nobody could grade has
    // no result — inventing one is the defect the deferred outcome prevents.
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('finishes when the binding judges nothing at all, and when the assessor failed', async () => {
    for (const assess of [
      undefined,
      async (): Promise<ReadAloudAssessResult> => ({ status: 'failed', retryable: false }),
    ]) {
      const user = userEvent.setup();
      const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
      render(
        <ActivitySequence
          activities={[readAloud('ra1', 'Read it')]}
          recordingBinding={bindingThat(assess)}
          onFinished={onFinished}
        />,
      );

      await speakAndSubmit(user);

      expect(onFinished).toHaveBeenCalledTimes(1);
      expect(onFinished.mock.calls[0]?.[0]?.[0]?.kind).toBe('responded');
      cleanup();
    }
  });

  it('lets the grade replace the placeholder the submit recorded', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    const onComplete = vi.fn<(results: ActivityResult[]) => void>();
    const onActivityComplete = vi.fn();
    render(
      <ActivitySequence
        activities={[readAloud('ra1', 'Read it'), mc('q1', 'Q one?')]}
        recordingBinding={bindingThat(async () => graded)}
        onFinished={onFinished}
        onComplete={onComplete}
        onActivityComplete={onActivityComplete}
      />,
    );

    await speakAndSubmit(user);
    // The grade arrived while the second question was still open, so the
    // placeholder is gone by the time the set completes.
    expect(onActivityComplete).toHaveBeenCalledTimes(1);
    expect(onActivityComplete.mock.calls[0]?.[2]).toBe('0');
    expect(onFinished).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await answerMultipleChoice(user);

    expect(onFinished).toHaveBeenCalledTimes(1);
    const items = onFinished.mock.calls[0]?.[0] ?? [];
    expect(items.map((item) => item.kind)).toEqual(['scored', 'scored']);
    const spoken = items[0];
    if (spoken?.kind !== 'scored') {
      throw new Error(`expected a scored outcome, got ${spoken?.kind ?? 'nothing'}`);
    }
    expect(spoken.result.score).toBe(0.88);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it.each([
    { settles: 'graded', kinds: ['scored', 'scored'], retryable: false },
    { settles: 'unscorable', kinds: ['scored', 'responded'], retryable: false },
    { settles: 'failed', kinds: ['scored', 'responded'], retryable: false },
    // An assessor that threw is offered "Try again" (C4), so it is still in
    // flight for the report until the learner retries it or leaves the question.
    { settles: 'rejected', kinds: ['scored', 'responded'], retryable: true },
    { settles: 'failed, retryable', kinds: ['scored', 'responded'], retryable: true },
    // `<ReadAloud>` shows this grade but refuses to report it — a score that is
    // not a number is not an `ActivityResult` — so no `onComplete` says it
    // ended. A wait released only by a grade would hold this set for good.
    { settles: 'graded with no usable score', kinds: ['scored', 'responded'], retryable: false },
  ] as const)('waits for a grade in flight when the read-aloud fills the set last, and reports once when it settles $settles (F13)', async ({
    settles,
    kinds,
    retryable,
  }) => {
    // The read-aloud is the LAST slot to be filled, and its assessment is still
    // running when it is. Reporting the set there handed `onFinished` the raw
    // `responded` placeholder, and the grade that landed a moment later could
    // never reach it — the one whole-set report a mixed set gets carried no
    // score for the question that had one. So the report waits for the grade
    // the pager KNOWS is in flight, and every way an assessment can end
    // releases it: a grade puts the score in place, and a take that came back
    // with none reports the placeholder, exactly as D1 requires.
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    const onComplete = vi.fn<(results: ActivityResult[]) => void>();
    const onActivityComplete = vi.fn();
    const held = deferred<ReadAloudAssessResult>();

    render(
      <ActivitySequence
        activities={[mc('q1', 'Q one?'), readAloud('ra1', 'Read it')]}
        recordingBinding={bindingThat(() => held.promise)}
        onFinished={onFinished}
        onComplete={onComplete}
        onActivityComplete={onActivityComplete}
      />,
    );

    await answerMultipleChoice(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await speakAndSubmit(user);

    expect(onFinished).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    if (settles === 'graded') {
      held.resolve(graded);
    } else if (settles === 'graded with no usable score') {
      held.resolve({ ...graded, grade: { ...graded.grade, score: Number.NaN } });
    } else if (settles === 'unscorable') {
      held.resolve({ status: 'unscorable', code: 'no_speech' });
    } else if (settles === 'failed') {
      held.resolve({ status: 'failed', retryable: false });
    } else if (settles === 'failed, retryable') {
      held.resolve({ status: 'failed', retryable: true });
    } else {
      held.reject(new Error('assessor unreachable'));
    }
    await flush();

    if (retryable) {
      // "Try again" is on screen and may yet grade the take, so the set is not
      // reported; leaving the question is what gives the retry up.
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(onFinished).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Previous' }));
    }

    expect(onFinished).toHaveBeenCalledTimes(1);
    const items = onFinished.mock.calls[0]?.[0] ?? [];
    expect(items.map((item) => item.kind)).toEqual(kinds);
    if (settles === 'graded') {
      const spoken = items[1];
      expect(spoken?.kind === 'scored' ? spoken.result.score : null).toBe(0.88);
      expect(onActivityComplete).toHaveBeenCalledTimes(2);
      expect(onActivityComplete.mock.calls[1]?.[2]).toBe('1');
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete.mock.calls[0]?.[0]?.map((result) => result.score)).toEqual([1, 0.88]);
    } else {
      expect(onActivityComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).not.toHaveBeenCalled();
    }
  });

  it('waits again for an assessment the learner retries (F13)', async () => {
    // Released once — the first assessment failed and said so — and then put
    // back in flight by "Try again". A pager that armed the wait only on submit
    // would report this set the moment its last question was answered, with the
    // retried grade still on its way.
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    const held = deferred<ReadAloudAssessResult>();
    let assessed = 0;
    render(
      <ActivitySequence
        activities={[readAloud('ra1', 'Read it'), mc('q1', 'Q one?')]}
        recordingBinding={bindingThat(async () => {
          assessed += 1;
          return assessed === 1 ? { status: 'failed', retryable: true } : held.promise;
        })}
        onFinished={onFinished}
      />,
    );

    await speakAndSubmit(user);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await answerMultipleChoice(user);

    expect(onFinished).not.toHaveBeenCalled();

    held.resolve(graded);
    await flush();

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0]?.[0]?.map((item) => item.kind)).toEqual(['scored', 'scored']);
  });

  it('records an exam take exactly as it always did, and never grades it', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    render(
      <ActivitySequence
        activities={[readAloud('ra1', 'Read it')]}
        renderMode="exam"
        recordingBinding={bindingThat(async () => graded)}
        onFinished={onFinished}
      />,
    );

    await speakAndSubmit(user);

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0]?.[0]?.[0]?.kind).toBe('responded');
    // An exam never assesses on the client, whatever the binding offers.
    expect(screen.queryByRole('list', { name: 'Your reading, word by word' })).toBeNull();
  });
});

/**
 * The rule is narrow by construction: only a practice read-aloud slot numbers
 * its answers by take, a slot without a take keeps its first outcome, and a
 * take is graded at most once. These are the paths that reach `record()` twice
 * for one slot for every OTHER activity type, and each must behave as it did.
 */
describe('<ActivitySequence> first-outcome-wins is otherwise untouched', () => {
  /** Submits a raw response and then reports a score, in one click. */
  function SubmitsThenScores({ data, onSubmit, onComplete }: ActivityProps) {
    return (
      <button
        type="button"
        onClick={() => {
          onSubmit?.({ type: 'multiple-choice', selectedOptionIds: ['right'] } as LearnerResponse);
          onComplete?.({
            score: 1,
            maxScore: 1,
            passed: true,
            timeSpent: 0,
            xapiStatement: {} as never,
          });
        }}
      >
        Finish {data.id}
      </button>
    );
  }

  it('keeps the responded outcome when an exam renderer submits and then scores', async () => {
    // The one path that could have been widened by accident: a consumer's own
    // renderer, in a mode where the pager records `responded` on submit. Its
    // score used to be dropped, and it still is.
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    render(
      <ActivitySequence
        activities={[mc('q1', 'Q one?')]}
        renderMode="exam"
        renderers={{ 'multiple-choice': SubmitsThenScores }}
        onFinished={onFinished}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Finish q1' }));

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0]?.[0]?.[0]?.kind).toBe('responded');
  });

  it.each([
    'multiple-choice',
    'read-aloud',
  ] as const)('keeps a restored outcome when a resumed %s slot submits and scores anyway', async (type) => {
    // `restored` is seeded at mount for a slot the learner had already
    // submitted. It is not a placeholder and nothing upgrades it — a resumed
    // attempt must not be re-reported as if it had just been sat. The
    // read-aloud case is the one that could regress: a submit marks its slot
    // provisional even when the submit itself is refused (F10), so a `restored`
    // slot has to be excluded by name or the score that follows would replace it.
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    const activity = type === 'read-aloud' ? readAloud('ra1', 'Read it') : mc('q1', 'Q one?');
    render(
      <ActivitySequence
        activities={[activity]}
        submittedSlotIds={['0']}
        renderers={{ [type]: SubmitsThenScores }}
        onFinished={onFinished}
      />,
    );

    // Seeding fires nothing; the set was already this far along at mount.
    expect(onFinished).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: `Finish ${activity.id}` }));

    expect(onFinished).not.toHaveBeenCalled();
  });

  it('keeps the first score when a practice renderer scores twice', async () => {
    const user = userEvent.setup();
    const onActivityComplete = vi.fn();
    function ScoresTwice({ onComplete }: ActivityProps) {
      return (
        <button
          type="button"
          onClick={() => {
            for (const score of [1, 0]) {
              onComplete?.({
                score,
                maxScore: 1,
                passed: score === 1,
                timeSpent: 0,
                xapiStatement: {} as never,
              });
            }
          }}
        >
          Score twice
        </button>
      );
    }
    render(
      <ActivitySequence
        activities={[mc('q1', 'Q one?')]}
        renderers={{ 'multiple-choice': ScoresTwice }}
        onActivityComplete={onActivityComplete}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Score twice' }));

    expect(onActivityComplete).toHaveBeenCalledTimes(1);
    expect(onActivityComplete.mock.calls[0]?.[0]?.score).toBe(1);
  });

  it('refuses a second grade for the same read-aloud slot', async () => {
    // A consumer's renderer stamps no take, so each submit is numbered by the
    // pager and a grade is for the latest one — once: a second score with no
    // new take is refused.
    const user = userEvent.setup();
    const onActivityComplete = vi.fn();
    function SubmitsThenScoresTwice({ onSubmit, onComplete }: ActivityProps) {
      return (
        <button
          type="button"
          onClick={() => {
            onSubmit?.({ type: 'read-aloud', recording: null } as LearnerResponse);
            for (const score of [1, 0]) {
              onComplete?.({
                score,
                maxScore: 1,
                passed: score === 1,
                timeSpent: 0,
                xapiStatement: {} as never,
              });
            }
          }}
        >
          Submit and score twice
        </button>
      );
    }
    render(
      <ActivitySequence
        activities={[readAloud('ra1', 'Read it')]}
        renderers={{ 'read-aloud': SubmitsThenScoresTwice }}
        onActivityComplete={onActivityComplete}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Submit and score twice' }));

    expect(onActivityComplete).toHaveBeenCalledTimes(1);
    expect(onActivityComplete.mock.calls[0]?.[0]?.score).toBe(1);
  });
});

/**
 * What a read-aloud slot's outcome holds: the score for a grade, the stored
 * key for a take with none (`null` when nothing was stored).
 */
function heldBy(item: SequenceItemOutcome | undefined): number | string | null | undefined {
  if (item?.kind === 'scored') {
    return item.result.score;
  }
  if (item?.kind === 'responded') {
    return (item.response as ReadAloudLearnerResponse).recording?.key ?? null;
  }
  return undefined;
}

/**
 * A binding that stores every take under its own key and judges the takes in
 * turn: a number is a grade, `unscorable` is a take that produced none.
 */
function bindingGrading(verdicts: readonly (number | 'unscorable')[]): SequenceRecordingBinding {
  let stored = 0;
  let judged = 0;
  return {
    upload: async (take) => {
      stored += 1;
      return { key: `take-${stored}`, mimeType: take.mimeType, durationMs: take.durationMs };
    },
    assess: async (ref) => {
      const verdict = verdicts[judged] ?? 'unscorable';
      judged += 1;
      if (verdict === 'unscorable') {
        return { status: 'unscorable', code: 'no_speech' };
      }
      return {
        status: 'graded',
        assessment: { ...assessment, recordingKey: ref.key },
        grade: { score: verdict, maxScore: 1, passed: verdict >= 0.5, feedback: null },
      };
    },
  };
}

describe('<ActivitySequence> a practice learner who records again (F10, F15)', () => {
  it("lets a re-recorded take's grade replace the grade before it", async () => {
    // Measured before the fix: the panel showed the second take's 95%, the
    // application had been told only the first take's 40%, and the response it
    // stored carried the SECOND take's key — a stored score and a stored
    // response describing different takes, on the ordinary re-record path. The
    // second grade was dropped because the first had cleared the slot's mark,
    // and the re-take's submit could not set it again: it was refused, and the
    // mark waited on acceptance.
    const user = userEvent.setup();
    const onActivityComplete =
      vi.fn<(result: ActivityResult, index: number, slotId: string) => void>();
    const onSubmit = vi.fn<(response: LearnerResponse, slot: { slotId: string }) => void>();
    const { container } = render(
      <ActivitySequence
        activities={[readAloud('ra1', 'Read it')]}
        recordingBinding={bindingGrading([0.4, 0.95])}
        onActivityComplete={onActivityComplete}
        onSubmit={onSubmit}
      />,
    );

    await speakAndSubmit(user);
    expect(container.querySelector('.lk-pf-grade')).toHaveTextContent('Score 40%. Not passed.');

    await speakAndSubmit(user);

    // What the learner is shown is what the application is told, about the
    // take the application stored.
    expect(container.querySelector('.lk-pf-grade')).toHaveTextContent('Score 95%. Passed.');
    expect(onActivityComplete.mock.calls.map(([result]) => result.score)).toEqual([0.4, 0.95]);
    expect(onActivityComplete.mock.calls[1]?.[2]).toBe('0');
    const stored = onSubmit.mock.calls.at(-1)?.[0] as ReadAloudLearnerResponse;
    expect(stored.recording?.key).toBe('take-2');
  });

  it.each([
    // A grade replaces a grade: the set reports the take that earned it.
    { verdicts: [0.4, 0.95], kind: 'scored', holds: 0.95 },
    // A take with no grade replaces a take with no grade: the set's response is
    // the newer take, the one `onSubmit` handed the application last.
    { verdicts: ['unscorable', 'unscorable'], kind: 'responded', holds: 'take-2' },
    // A newer take replaces a grade too, even when it comes back with none
    // (C2). `onSubmit` has already handed the application take-2, so keeping
    // take-1's 40% reported a score beside a response it does not grade — the
    // one pairing a set's report must never make.
    { verdicts: [0.4, 'unscorable'], kind: 'responded', holds: 'take-2' },
  ] as const)('reports what two takes judged $verdicts leave in the set, when it finishes after them', async ({
    verdicts,
    kind,
    holds,
  }) => {
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    render(
      <ActivitySequence
        activities={[readAloud('ra1', 'Read it'), mc('q1', 'Q one?')]}
        recordingBinding={bindingGrading(verdicts)}
        onFinished={onFinished}
      />,
    );

    await speakAndSubmit(user);
    await speakAndSubmit(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await answerMultipleChoice(user);

    expect(onFinished).toHaveBeenCalledTimes(1);
    const spoken = onFinished.mock.calls[0]?.[0]?.[0];
    expect(spoken?.kind).toBe(kind);
    expect(heldBy(spoken)).toBe(holds);
  });

  it('reports a fully scored set to onComplete once, however many of its takes are graded (F15)', async () => {
    // The only path that reaches the `onComplete` latch a second time: a set
    // that is already fully scored, whose read-aloud is recorded again and
    // graded again. Before F10 that second grade was dropped and the latch was
    // unreachable; now it lands, and the latch is what keeps one attempt from
    // being handed to the application twice.
    const user = userEvent.setup();
    const onComplete = vi.fn<(results: ActivityResult[]) => void>();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    const onActivityComplete = vi.fn();
    render(
      <ActivitySequence
        activities={[readAloud('ra1', 'Read it')]}
        recordingBinding={bindingGrading([0.4, 0.95])}
        onComplete={onComplete}
        onFinished={onFinished}
        onActivityComplete={onActivityComplete}
      />,
    );

    await speakAndSubmit(user);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]?.map((result) => result.score)).toEqual([0.4]);

    await speakAndSubmit(user);

    expect(onActivityComplete).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});

describe('<ActivitySequence> an outcome that settles after the paper changed (F11b)', () => {
  it('drops a grade still in flight for the read-aloud the learner has left', async () => {
    const user = userEvent.setup();
    const held = deferred<ReadAloudAssessResult>();
    const onActivityComplete = vi.fn();
    const onFinished = vi.fn();
    const onComplete = vi.fn();
    const pager = (activities: ReadAloudData[]) => (
      <ActivitySequence
        activities={activities}
        recordingBinding={bindingThat(() => held.promise)}
        onActivityComplete={onActivityComplete}
        onFinished={onFinished}
        onComplete={onComplete}
      />
    );
    const { rerender } = render(pager([readAloud('ra1', 'Read it')]));

    await speakAndSubmit(user);
    rerender(pager([readAloud('ra2', 'Read the next one')]));
    onFinished.mockClear();
    held.resolve(graded);
    await flush();

    expect(onActivityComplete).not.toHaveBeenCalled();
    expect(onFinished).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('form', { name: 'Read the next one' })).toBeInTheDocument();
  });

  /** A consumer's renderer that grades asynchronously, whenever `score` settles. */
  function gradingWhen(score: Promise<number>) {
    return function GradesLater({ data, onComplete }: ActivityProps) {
      return (
        <button
          type="button"
          onClick={() => {
            void score.then((value) =>
              onComplete?.({
                score: value,
                maxScore: 1,
                passed: value === 1,
                timeSpent: 0,
                xapiStatement: {} as never,
              }),
            );
          }}
        >
          Answer {data.id}
        </button>
      );
    };
  }

  it.each([
    'read-aloud',
    'multiple-choice',
  ] as const)('refuses an outcome from a %s renderer that lands in the paper that replaced it', async (type) => {
    // Measured before the fix: the new paper was reported finished and fully
    // scored though nobody had answered it, and `onActivityComplete` carries no
    // activity id, so a consumer could not tell. The renderer is the consumer's,
    // so no guard inside a bundled component can reach this — only the pager,
    // which knows what is at that position NOW.
    const user = userEvent.setup();
    const score = deferred<number>();
    const onActivityComplete = vi.fn();
    const onFinished = vi.fn();
    const onComplete = vi.fn();
    const renderers = { [type]: gradingWhen(score.promise) };
    const item = (id: string) =>
      type === 'read-aloud' ? readAloud(id, `Read ${id}`) : mc(id, `${id}?`);
    const pager = (id: string) => (
      <ActivitySequence
        activities={[item(id)]}
        renderers={renderers}
        onActivityComplete={onActivityComplete}
        onFinished={onFinished}
        onComplete={onComplete}
      />
    );
    const { rerender } = render(pager('first'));

    await user.click(screen.getByRole('button', { name: 'Answer first' }));
    rerender(pager('second'));
    score.resolve(1);
    await flush();

    expect(onActivityComplete).not.toHaveBeenCalled();
    expect(onFinished).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Answer second' })).toBeInTheDocument();
  });

  it('still takes that outcome when the paper is only re-created, not changed', async () => {
    // The guard compares identity, not array references: a parent that builds
    // the same paper afresh on every render must keep its late grades.
    const user = userEvent.setup();
    const score = deferred<number>();
    const onActivityComplete = vi.fn();
    const renderers = { 'multiple-choice': gradingWhen(score.promise) };
    const pager = () => (
      <ActivitySequence
        activities={[mc('q1', 'Q one?')]}
        renderers={renderers}
        onActivityComplete={onActivityComplete}
      />
    );
    const { rerender } = render(pager());

    await user.click(screen.getByRole('button', { name: 'Answer q1' }));
    rerender(pager());
    score.resolve(1);
    await flush();

    expect(onActivityComplete).toHaveBeenCalledTimes(1);
    expect(onActivityComplete.mock.calls[0]?.[2]).toBe('0');
  });

  it('refuses a late submit from a renderer whose paper was replaced, before the host hears of it', async () => {
    // `onSubmit` carries only the slot's ids, and the paper that replaced this
    // one reuses them: a host filing the late answer by `slotId` would store it
    // against a question the learner never saw.
    const user = userEvent.setup();
    const answer = deferred<void>();
    const onSubmit = vi.fn();
    function SubmitsLater({ data, onSubmit: submit }: ActivityProps) {
      return (
        <button
          type="button"
          onClick={() => {
            void answer.promise.then(() =>
              submit?.({
                type: 'multiple-choice',
                selectedOptionIds: ['right'],
              } as LearnerResponse),
            );
          }}
        >
          Answer {data.id}
        </button>
      );
    }
    const renderers = { 'multiple-choice': SubmitsLater };
    const pager = (id: string) => (
      <ActivitySequence activities={[mc(id, `${id}?`)]} renderers={renderers} onSubmit={onSubmit} />
    );
    const { rerender } = render(pager('first'));

    await user.click(screen.getByRole('button', { name: 'Answer first' }));
    rerender(pager('second'));
    answer.resolve();
    await flush();

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

/**
 * C2: a result belongs to the take that produced it — whatever ids the paper on
 * screen shares with the one that asked for it. These are the verifiers'
 * measured orderings; the state-machine property covers the rest.
 */
describe('<ActivitySequence> a result from a paper that shares the read-aloud (C2)', () => {
  /** Stores takes as take-1, take-2… and holds every upload and assessment until told. */
  function heldBinding() {
    const uploads: { settle: (ok: boolean) => void }[] = [];
    const assessments = new Map<string, ReturnType<typeof deferred<ReadAloudAssessResult>>>();
    let stored = 0;
    const binding: SequenceRecordingBinding = {
      upload: (take) =>
        new Promise<RecordingRef>((resolve, reject) => {
          uploads.push({
            settle: (ok) => {
              if (!ok) {
                reject(new Error('storage offline'));
                return;
              }
              stored += 1;
              resolve({ key: `take-${stored}`, mimeType: take.mimeType });
            },
          });
        }),
      assess: (ref) => {
        const held = deferred<ReadAloudAssessResult>();
        assessments.set(ref.key, held);
        return held.promise;
      },
    };
    const gradeOf = (key: string, score: number): ReadAloudAssessResult => ({
      status: 'graded',
      assessment: { ...assessment, recordingKey: key, recognizedText: key },
      grade: { score, maxScore: 1, passed: score >= 0.5, feedback: null },
    });
    return { binding, uploads, assessments, gradeOf };
  }

  /** A host that swaps papers the way a loading screen or a paper list does. */
  function renderSwappable(
    binding: SequenceRecordingBinding,
    callbacks: {
      onFinished: (items: SequenceItemOutcome[]) => void;
      onSubmit: (response: LearnerResponse, slot: { slotId: string }) => void;
    },
  ) {
    const pager = (activities: (ReadAloudData | MultipleChoiceData)[]) => (
      <ActivitySequence activities={activities} recordingBinding={binding} {...callbacks} />
    );
    const paperA = [readAloud('ra1', 'Read it'), mc('mcA', 'Q A?')];
    const view = render(pager(paperA));
    return {
      paperA,
      paperB: [readAloud('ra1', 'Read it'), mc('mcB', 'Q B?')],
      show: (activities: (ReadAloudData | MultipleChoiceData)[]) =>
        view.rerender(pager(activities)),
    };
  }

  it("files no placeholder in the new paper when the old paper's upload fails late", async () => {
    // Measured before the fix: "onFinished 0:responded(null) 1:scored" — a
    // blank, in paper B, for a read-aloud B's learner never touched.
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    const onSubmit = vi.fn();
    const { binding, uploads } = heldBinding();
    const host = renderSwappable(binding, { onFinished, onSubmit });

    await speakAndSubmit(user);
    host.show(host.paperB);
    await flush();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await answerMultipleChoice(user);
    await act(async () => {
      uploads[0]?.settle(false);
    });
    await flush();

    expect(onFinished).not.toHaveBeenCalled();
    expect(screen.getByText('2 of 2 recordings left')).toBeInTheDocument();
  });

  it.each([
    'a new paper that shares the read-aloud',
    'the same paper after a loading blip',
  ] as const)("does not let the old paper's late grade report %s while its own take is assessed", async (swap) => {
    // Measured before the fix: the old grade released the new paper's wait, so
    // `onFinished` reported B's read-aloud as ungraded while B's own take was
    // still being assessed — and B's grade then reached everything but it.
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    const onSubmit = vi.fn();
    const { binding, uploads, assessments, gradeOf } = heldBinding();
    const host = renderSwappable(binding, { onFinished, onSubmit });

    await speakAndSubmit(user);
    await act(async () => {
      uploads[0]?.settle(true);
    });
    await flush();
    if (swap === 'a new paper that shares the read-aloud') {
      host.show(host.paperB);
    } else {
      host.show([]);
      await flush();
      host.show([...host.paperA]);
    }
    await flush();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await answerMultipleChoice(user);
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await speakAndSubmit(user);
    await act(async () => {
      uploads[1]?.settle(true);
    });
    await flush();

    await act(async () => {
      assessments.get('take-1')?.resolve(gradeOf('take-1', 0.4));
    });
    await flush();
    expect(onFinished).not.toHaveBeenCalled();

    await act(async () => {
      assessments.get('take-2')?.resolve(gradeOf('take-2', 0.9));
    });
    await flush();

    expect(onFinished).toHaveBeenCalledTimes(1);
    const spoken = onFinished.mock.calls[0]?.[0]?.[0];
    expect(spoken?.kind).toBe('scored');
    // The score and the answer it grades travel together.
    expect(spoken?.kind === 'scored' ? spoken.result.score : null).toBe(0.9);
    expect(
      spoken?.kind === 'scored'
        ? (spoken.response as ReadAloudLearnerResponse | undefined)?.recording?.key
        : null,
    ).toBe('take-2');
  });
});

/**
 * C3: the pager's items rebuilt on every render — `activities={raw.map(redact)}`,
 * which the authoring guide documents — are the same reading, and keep the take,
 * the take budget and the grade still in flight.
 */
describe('<ActivitySequence> a host that rebuilds its read-aloud on every render (C3)', () => {
  const raw = [
    { ...readAloud('ra1', 'Read it'), recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 1 } },
  ];

  it.each([
    'practice',
    'exam',
  ] as const)('allows one take at maxTakes 1 in %s, and lands the grade in flight', async (mode) => {
    // Measured before the fix, in both modes: the host's re-render after
    // `onSubmit` handed the slot a new object, the component took that for a
    // different reading, threw the grade in flight away and refunded the budget
    // — "1 of 1 recording left", and a second take accepted.
    const user = userEvent.setup();
    const onActivityComplete = vi.fn();
    const onSubmit = vi.fn();
    const held = deferred<ReadAloudAssessResult>();
    function Host() {
      const [saved, setSaved] = useState(0);
      return (
        <>
          <output>{saved}</output>
          <ActivitySequence
            activities={asRenderableSequence(raw.map((item) => redact(item)))}
            renderMode={mode}
            recordingBinding={bindingThat(() => held.promise)}
            onActivityComplete={onActivityComplete}
            onSubmit={(response) => {
              onSubmit(response);
              setSaved((count) => count + 1);
            }}
          />
        </>
      );
    }
    render(<Host />);

    await speakAndSubmit(user);
    held.resolve(graded);
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    if (mode === 'practice') {
      expect(onActivityComplete).toHaveBeenCalledTimes(1);
      expect(screen.getByText('0 of 1 recording left')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Record again' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    } else {
      // An exam answer is locked once handed in: no recorder to offer again.
      expect(screen.queryByRole('button', { name: /^Record/ })).toBeNull();
      expect(screen.getByText('Answer submitted.')).toBeInTheDocument();
    }
  });
});

describe('<ActivitySequence> a practice take that could not be stored (F14)', () => {
  const offline = async (): Promise<RecordingRef> => {
    throw new Error('storage offline');
  };

  it('finishes the set once the learner leaves it, as unsubmitted and never as a blank (C4)', async () => {
    // Before F14 this set never finished: the take never uploaded, so nothing
    // was submitted, the slot stayed null for ever, and practice has no
    // blank-submit control to get past it. F14's placeholder then finished it
    // the moment the upload failed — while "Try again" was still on screen —
    // and as `recording: null`, which is lk-core's blank: a grader marks it 0
    // with every word omitted, so a storage outage became a zero.
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    const onSubmit = vi.fn<(response: LearnerResponse, slot: { slotId: string }) => void>();
    const onComplete = vi.fn();
    render(
      <ActivitySequence
        activities={[mc('q1', 'Q one?'), readAloud('ra1', 'Read it')]}
        recordingBinding={{ upload: offline, assess: async () => graded }}
        onFinished={onFinished}
        onSubmit={onSubmit}
        onComplete={onComplete}
      />,
    );

    await answerMultipleChoice(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await speakAndSubmit(user);

    // The learner can still retry, so the set is not over.
    expect(screen.getByText('Your recording could not be sent.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(onFinished).not.toHaveBeenCalled();

    // Leaving the question gives the retry up.
    await user.click(screen.getByRole('button', { name: 'Previous' }));

    expect(onFinished).toHaveBeenCalledTimes(1);
    const items = onFinished.mock.calls[0]?.[0] ?? [];
    // What the slot honestly holds: no response at all — never a recording of
    // `null`, and no take count the pager never saw.
    expect(items[1]).toEqual({ kind: 'unsubmitted', index: 1, slotId: '1', activityId: 'ra1' });
    // The response channel is not told a blank was handed in — that is a
    // learner's decision, never a failed upload's.
    expect(onSubmit.mock.calls.map(([, slot]) => slot.slotId)).toEqual(['0']);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('holds the set for a failed upload while "Try again" is on screen, and reports the retried take (C4)', async () => {
    // Measured before the fix: `onFinished` reported the slot as a blank the
    // moment the upload failed, and the retry then stored and graded take-1 —
    // so `onComplete` described a different set from the `onFinished` before it.
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    const onComplete = vi.fn<(results: ActivityResult[]) => void>();
    let attempts = 0;
    render(
      <ActivitySequence
        activities={[mc('q1', 'Q one?'), readAloud('ra1', 'Read it')]}
        recordingBinding={{
          upload: async (take) => {
            attempts += 1;
            return attempts === 1 ? offline() : { key: 'take-1', mimeType: take.mimeType };
          },
          assess: async () => graded,
        }}
        onFinished={onFinished}
        onComplete={onComplete}
      />,
    );

    await answerMultipleChoice(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await speakAndSubmit(user);
    expect(onFinished).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await flush();

    expect(onFinished).toHaveBeenCalledTimes(1);
    const items = onFinished.mock.calls[0]?.[0] ?? [];
    expect(items.map((item) => item.kind)).toEqual(['scored', 'scored']);
    // One report, told twice the same way.
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]).toEqual(
      items.map((item) => (item.kind === 'scored' ? item.result : null)),
    );
  });

  it.each([
    { retried: 'graded', kind: 'scored', holds: 0.88 },
    // No grade follows here, so only the stored take itself can fill the slot —
    // the case that shows the retry's take is what the set reports.
    { retried: 'unscorable', kind: 'responded', holds: 'take-1' },
  ] as const)('reports the take a retried upload stored, $retried', async ({
    retried,
    kind,
    holds,
  }) => {
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    let attempts = 0;
    render(
      <ActivitySequence
        activities={[readAloud('ra1', 'Read it'), mc('q1', 'Q one?')]}
        recordingBinding={{
          upload: async (take) => {
            attempts += 1;
            return attempts === 1 ? offline() : { key: 'take-1', mimeType: take.mimeType };
          },
          assess: async () =>
            retried === 'graded' ? graded : { status: 'unscorable', code: 'no_speech' },
        }}
        onFinished={onFinished}
      />,
    );

    await speakAndSubmit(user);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await answerMultipleChoice(user);

    expect(onFinished).toHaveBeenCalledTimes(1);
    const spoken = onFinished.mock.calls[0]?.[0]?.[0];
    expect(spoken?.kind).toBe(kind);
    expect(heldBy(spoken)).toBe(holds);
  });

  it.each([
    { first: 'graded', kind: 'scored' },
    { first: 'unscorable', kind: 'responded' },
  ] as const)('never lets a failed upload replace a take that was stored and came back $first', async ({
    first,
    kind,
  }) => {
    // `unsubmitted` is for a slot with nothing in it. A take that WAS stored is
    // the answer `onSubmit` last reported, graded or not, and a re-take that
    // failed to upload — never reported — must not overwrite it.
    const user = userEvent.setup();
    const onFinished = vi.fn<(items: SequenceItemOutcome[]) => void>();
    let attempts = 0;
    render(
      <ActivitySequence
        activities={[readAloud('ra1', 'Read it'), mc('q1', 'Q one?')]}
        recordingBinding={{
          upload: async (take) => {
            attempts += 1;
            return attempts === 1 ? { key: 'take-1', mimeType: take.mimeType } : offline();
          },
          assess: async () =>
            first === 'graded' ? graded : { status: 'unscorable', code: 'no_speech' },
        }}
        onFinished={onFinished}
      />,
    );

    await speakAndSubmit(user);
    await speakAndSubmit(user);
    expect(screen.getByText('Your recording could not be sent.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await answerMultipleChoice(user);

    expect(onFinished).toHaveBeenCalledTimes(1);
    const spoken = onFinished.mock.calls[0]?.[0]?.[0];
    expect(spoken?.kind).toBe(kind);
    expect(heldBy(spoken)).toBe(kind === 'scored' ? 0.88 : 'take-1');
  });

  it('records nothing for a failed upload in an exam, where a blank is the learner’s decision', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn();
    render(
      <ActivitySequence
        activities={[readAloud('ra1', 'Read it')]}
        renderMode="exam"
        recordingBinding={{ upload: offline }}
        onFinished={onFinished}
      />,
    );

    await speakAndSubmit(user);

    expect(screen.getByText('Your recording could not be sent.')).toBeInTheDocument();
    expect(onFinished).not.toHaveBeenCalled();
  });
});

describe('<ActivitySequence> releases the microphone of a slot it hides', () => {
  it('stops a take in progress when the learner navigates away', async () => {
    const user = userEvent.setup();
    const capture = harness as SpeechCaptureHarness;
    render(
      <ActivitySequence
        activities={[readAloud('ra1', 'Read it'), mc('q1', 'Q one?')]}
        recordingBinding={bindingThat()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^Record/ }));
    await flush();
    expect(capture.liveTracks()).toBe(1);

    // The pane is only hidden, never unmounted — so the component's own
    // teardown does not run, and without the registry the microphone would go
    // on listening under the next question.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await flush();
    expect(capture.liveTracks()).toBe(0);
    expect(capture.openContexts()).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    // Discarded, not kept: the take was abandoned, so the control offers a
    // first take again rather than a re-record of something that is not there.
    expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
  });

  it('does not stop a take in another pager that happens to share a slot id', async () => {
    const user = userEvent.setup();
    const capture = harness as SpeechCaptureHarness;
    const pager = () => (
      <ActivitySequence
        activities={[readAloud('ra1', 'Read it'), mc('q1', 'Q one?')]}
        recordingBinding={bindingThat()}
      />
    );
    const recording = render(pager()).container;
    const other = render(pager()).container;

    await user.click(within(recording).getByRole('button', { name: /^Record/ }));
    await flush();
    expect(capture.liveTracks()).toBe(1);

    // Slot ids are short and repeat across pagers ("0", "1.0"). A registry
    // keyed on the slot id alone would stop the wrong pager's microphone here.
    await user.click(within(other).getByRole('button', { name: 'Next' }));
    await flush();
    expect(capture.liveTracks()).toBe(1);
  });

  it('does not stop a standalone read-aloud handed that pager’s group name, when the pager navigates (C6)', async () => {
    // Measured before the fix in Chromium: a standalone `<ReadAloud>` given
    // `captureGroup="lk-seq-capture-1::0"` was stopped by an unrelated pager's
    // Next — live tracks 1 → 0 — because the published signature still took the
    // prop. The group now reaches a component only through the slot channel a
    // pager's own pane provides, so no prop a consumer writes can name one.
    const user = userEvent.setup();
    const capture = harness as SpeechCaptureHarness;
    const pager = render(
      <ActivitySequence activities={[mc('q1', 'Q one?'), mc('q2', 'Q two?')]} />,
    );

    // Learn the live name of the pager's first-slot group the only way a
    // consumer could: guess, and watch which guess the pager stops.
    const heard: string[] = [];
    const leave = Array.from({ length: 5000 }, (_, n) => {
      const name = `lk-seq-capture-${n + 1}::0`;
      return joinCaptureGroup(name, () => heard.push(name));
    });
    await user.click(within(pager.container).getByRole('button', { name: 'Next' }));
    for (const removal of leave) {
      removal();
    }
    expect(heard).toHaveLength(1);
    const group = heard[0] as string;
    await user.click(within(pager.container).getByRole('button', { name: 'Previous' }));

    // The prop the old signature published, passed past the type checker.
    const leaked = { captureGroup: group } as object;
    const componentBinding: RecordingBinding = {
      upload: async (take) => ({
        key: 'take-1',
        mimeType: take.mimeType,
        durationMs: take.durationMs,
      }),
    };
    const standalone = render(
      <ReadAloud
        data={readAloud('ra1', 'Read it')}
        recordingBinding={componentBinding}
        {...leaked}
      />,
    );
    await user.click(within(standalone.container).getByRole('button', { name: 'Record' }));
    await flush();
    expect(capture.liveTracks()).toBe(1);

    const stillJoined = vi.fn();
    const leaveAgain = joinCaptureGroup(group, stillJoined);
    await user.click(within(pager.container).getByRole('button', { name: 'Next' }));
    await flush();
    leaveAgain();

    // The group was stopped — and the standalone take in it was not.
    expect(stillJoined).toHaveBeenCalledTimes(1);
    expect(capture.liveTracks()).toBe(1);
    expect(
      within(standalone.container).getByRole('button', { name: 'Stop recording' }),
    ).toBeInTheDocument();
  });
});
