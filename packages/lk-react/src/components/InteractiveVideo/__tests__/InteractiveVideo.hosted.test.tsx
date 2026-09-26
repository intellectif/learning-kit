import type {
  ActivityResult,
  ItemGroup,
  ItemOutcome,
  LearnerResponse,
  RecordingRef,
  XAPIStatement,
} from '@intellectif/lk-core';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LearnerAi, LkAiProvider } from '../../../ai/LkAiProvider.js';
import { useAiHints } from '../../../ai/useAiHelp.js';
import type { InteractiveVideoQuestion as FromTheRoot } from '../../../index.js';
import { stubMediaElement } from '../../../test-support/media.js';
import { type SpeechCaptureHarness, stubSpeechCapture } from '../../../test-support/speech.js';
import { MultipleChoice } from '../../MultipleChoice/index.js';
import { SequenceSlotContext } from '../../shared/sequence-slot.js';
import {
  InteractiveVideo,
  type InteractiveVideoProps,
  type InteractiveVideoQuestion,
} from '../index.js';

/**
 * Questions the host draws itself, through `renderQuestion`.
 *
 * The rule under test is that the video cannot tell a host's question from its
 * own: the same answered state, the same required-quiz gate, the same end card
 * and summary. Beside it, what only a host needs — being told its question has
 * left the screen, a place to portal into that survives fullscreen — and the
 * one change every host sees: Finish waits for an answer still on its way.
 */

const VIDEO = 'https://cdn.example.test/lesson.mp4';

async function playTo(seconds: number): Promise<void> {
  await act(async () => {
    video().currentTime = seconds;
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

const mc = (id: string, question: string) => ({
  schemaVersion: '1.0' as const,
  type: 'multiple-choice' as const,
  id,
  title: id,
  question,
  mode: 'single' as const,
  scoringStrategy: 'all-or-nothing' as const,
  options: [
    { id: 'right', text: `${id} correcta`, isCorrect: true },
    { id: 'wrong', text: `${id} incorrecta`, isCorrect: false },
  ],
});

const readAloud = {
  schemaVersion: '1.0' as const,
  type: 'read-aloud' as const,
  id: 'q-ra',
  title: 'Lee en voz alta',
  instructions: 'Lee la frase.',
  referenceText: 'Me llamo Ana.',
  locale: 'es-ES',
  recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 3 },
  scoring: {
    dimensions: [
      { name: 'accuracy' as const, weight: 3 },
      { name: 'fluency' as const, weight: 1 },
    ],
  },
  passThreshold: 0.7,
};

/** A read-aloud and a multiple-choice in the first quiz, one more question later. */
const group = (over: Partial<ItemGroup> = {}): ItemGroup =>
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
    items: [readAloud, mc('q1', '¿Uno?'), mc('q2', '¿Dos?')],
    timeline: {
      cues: [
        { id: 'first', at: 30, title: 'Primera pausa', itemIds: ['q-ra', 'q1'] },
        { id: 'second', at: 90, title: 'Segunda pausa', itemIds: ['q2'] },
      ],
    },
    ...over,
  }) as ItemGroup;

const take = (key: string): LearnerResponse =>
  ({
    type: 'read-aloud',
    recording: { key, mimeType: 'audio/wav', durationMs: 1500 },
  }) as LearnerResponse;

const result = (score: number): ActivityResult => ({
  score,
  maxScore: 1,
  passed: score >= 0.7,
  timeSpent: 900,
  xapiStatement: {} as XAPIStatement,
});

/** A host's own read-aloud: its own pixels, reporting through the question's calls. */
function HostReadAloud({
  question,
  onActive,
}: {
  question: InteractiveVideoQuestion;
  onActive?: (active: boolean) => void;
}) {
  const { active } = question;
  useEffect(() => {
    onActive?.(active);
  }, [active, onActive]);
  return (
    <div className="host-ra" data-active={active}>
      <p>Grabadora del anfitrión</p>
      <button type="button" onClick={() => question.submit(take('k1'))}>
        Guardar toma
      </button>
      <button type="button" onClick={() => question.complete(result(0.8))}>
        Calificar
      </button>
      <button type="button" onClick={() => question.clear()}>
        Otra vez
      </button>
    </div>
  );
}

/** Draws every read-aloud itself and leaves the rest to the SDK; keeps the last question it was handed. */
function hosting(onActive?: (active: boolean) => void) {
  const held: { question?: InteractiveVideoQuestion } = {};
  const renderQuestion = (question: InteractiveVideoQuestion) => {
    if (question.activity.type !== 'read-aloud') {
      return undefined;
    }
    held.question = question;
    return <HostReadAloud question={question} {...(onActive !== undefined ? { onActive } : {})} />;
  };
  const current = (): InteractiveVideoQuestion => {
    if (held.question === undefined) {
      throw new Error('renderQuestion has not been called for the read-aloud');
    }
    return held.question;
  };
  return { renderQuestion, current };
}

async function begin(): Promise<void> {
  await act(async () => {
    video().dispatchEvent(new Event('loadedmetadata'));
  });
  await act(async () => {
    await video().play();
  });
}

/** Mounts the player and starts playback, as pressing play does. */
async function start(ui: React.ReactElement): Promise<ReturnType<typeof render>> {
  const rendered = render(ui);
  await begin();
  return rendered;
}

async function openFirstQuiz(): Promise<void> {
  await playTo(31);
  await waitFor(() => expect(quizPanel()).toBeVisible());
}

async function endVideo(): Promise<void> {
  await act(async () => {
    video().dispatchEvent(new Event('ended'));
  });
}

const quizPanel = () => document.querySelector('.lk-iv-quiz') as HTMLElement;
const video = () => document.querySelector('video') as HTMLVideoElement;
const finishButton = () => screen.getByRole('button', { name: 'Finish' });
const pendingLine = () => document.querySelector('.lk-iv-end-pending');

let harness: SpeechCaptureHarness | undefined;

beforeEach(() => {
  stubMediaElement({ duration: 120 });
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  harness?.restore();
  harness = undefined;
  vi.restoreAllMocks();
});

describe('InteractiveVideo renderQuestion: the host draws, the video keeps count', () => {
  it('draws the host’s read-aloud and the SDK’s other questions, with no recording binding', async () => {
    const user = userEvent.setup();
    const { renderQuestion } = hosting();
    await start(<InteractiveVideo group={group()} renderQuestion={renderQuestion} />);
    await openFirstQuiz();

    expect(within(quizPanel()).getByText('Grabadora del anfitrión')).toBeVisible();
    // No SDK read-aloud anywhere: it would have thrown for want of a binding.
    expect(document.querySelector('.lk-ra')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Next question' }));
    expect(within(quizPanel()).getByRole('radio', { name: 'q1 correcta' })).toBeVisible();
  });

  it('counts a host answer as it counts its own: step dots, the end card and onFinished agree', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onActivityComplete = vi.fn();
    const onFinished = vi.fn();
    const { renderQuestion } = hosting();
    await start(
      <InteractiveVideo
        group={group()}
        renderQuestion={renderQuestion}
        onSubmit={onSubmit}
        onActivityComplete={onActivityComplete}
        onFinished={onFinished}
      />,
    );
    await openFirstQuiz();

    await user.click(within(quizPanel()).getByRole('button', { name: 'Guardar toma' }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Calificar' }));
    const place = { slotId: '0.0', index: 0, activityId: 'q-ra', cueId: 'first' };
    expect(onSubmit).toHaveBeenCalledWith(take('k1'), place);
    expect(onActivityComplete).toHaveBeenCalledWith(result(0.8), place);
    expect(screen.getByRole('button', { name: 'Question 1, answered' })).toBeInTheDocument();

    // The SDK's question beside it, answered the SDK's way.
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    await user.click(within(quizPanel()).getByRole('radio', { name: 'q1 correcta' }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Submit' }));
    expect(screen.getByRole('button', { name: 'Question 2, answered' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continue video/ }));
    await endVideo();

    // 0.8 from the host, 1 from the SDK: one average, one count.
    expect(screen.getByText('You answered 2 of 3 · 90%')).toBeInTheDocument();
    await user.click(finishButton());
    expect(onFinished).toHaveBeenCalledWith({
      slots: [
        { slotId: '0.0', activityId: 'q-ra', cueId: 'first', status: 'answered' },
        { slotId: '0.1', activityId: 'q1', cueId: 'first', status: 'answered' },
        { slotId: '0.2', activityId: 'q2', cueId: 'second', status: 'unreached' },
      ],
    });
  });

  it('lets a required quiz go on once the host completes, and holds it again when the host clears', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onActivityComplete = vi.fn();
    const onFinished = vi.fn();
    const { renderQuestion } = hosting();
    const required = group({
      timeline: {
        cues: [
          { id: 'first', at: 30, title: 'Obligatoria', itemIds: ['q-ra', 'q1'], required: true },
          { id: 'second', at: 90, title: 'Segunda pausa', itemIds: ['q2'] },
        ],
      },
    } as Partial<ItemGroup>);
    await start(
      <InteractiveVideo
        group={required}
        renderQuestion={renderQuestion}
        onSubmit={onSubmit}
        onActivityComplete={onActivityComplete}
        onFinished={onFinished}
      />,
    );
    await openFirstQuiz();
    const next = () => screen.getByRole('button', { name: 'Next question' });
    expect(next()).toHaveAttribute('aria-disabled', 'true');

    // A grade alone is an answer, and nothing it did not call is reported.
    await user.click(within(quizPanel()).getByRole('button', { name: 'Calificar' }));
    expect(next()).not.toHaveAttribute('aria-disabled');
    expect(onActivityComplete).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();

    // Withdrawn: unanswered again, held again, and the host is not told what
    // it already knows.
    await user.click(within(quizPanel()).getByRole('button', { name: 'Otra vez' }));
    expect(next()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Question 1' })).toBeInTheDocument();
    expect(onActivityComplete).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the latest result: a later grade replaces the score, and one with nothing to score removes it', async () => {
    const user = userEvent.setup();
    const onActivityComplete = vi.fn();
    const { renderQuestion, current } = hosting();
    await start(
      <InteractiveVideo
        group={group()}
        renderQuestion={renderQuestion}
        onActivityComplete={onActivityComplete}
      />,
    );
    await openFirstQuiz();
    act(() => {
      current().complete(result(0.4));
      current().complete(result(0.8));
    });
    await user.click(screen.getByRole('button', { name: 'Skip quiz' }));
    await endVideo();
    expect(screen.getByText('You answered 1 of 3 · 80%')).toBeInTheDocument();

    // A grade that arrives after the end still lands on the card.
    act(() => {
      current().complete({ ...result(0), maxScore: 0 });
    });
    expect(screen.getByText('You answered 1 of 3 questions')).toBeInTheDocument();
    expect(onActivityComplete).toHaveBeenCalledTimes(3);
  });

  it('forgets the score of an answer the host withdraws', async () => {
    const user = userEvent.setup();
    const { renderQuestion } = hosting();
    await start(<InteractiveVideo group={group()} renderQuestion={renderQuestion} />);
    await openFirstQuiz();
    await user.click(within(quizPanel()).getByRole('button', { name: 'Calificar' }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Otra vez' }));
    await user.click(screen.getByRole('button', { name: 'Skip quiz' }));
    await endVideo();
    // Nothing answered, and no score left over from the answer taken back.
    expect(screen.getByText('You answered 0 of 3 questions')).toBeInTheDocument();
  });

  it('turns active off as the question leaves the screen, and on as the learner comes back', async () => {
    const user = userEvent.setup();
    const seen: boolean[] = [];
    const onActive = (active: boolean) => {
      seen.push(active);
    };
    const { renderQuestion } = hosting(onActive);
    await start(
      <InteractiveVideo
        group={group()}
        renderQuestion={renderQuestion}
        preferences={{ panel: true }}
      />,
    );
    await openFirstQuiz();
    expect(seen).toEqual([true]);

    // Paged away, and back.
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    await user.click(screen.getByRole('button', { name: 'Question 1' }));
    expect(seen).toEqual([true, false, true]);

    // The quiz closed; then reopened from the contents after a rewind.
    await user.click(screen.getByRole('button', { name: 'Skip quiz' }));
    expect(seen).toEqual([true, false, true, false]);
    await user.click(screen.getByRole('button', { name: /Primera pausa/ }));
    await waitFor(() => expect(quizPanel()).toBeVisible());
    expect(seen).toEqual([true, false, true, false, true]);

    // Closed again, and the video ends: still off, and still mounted.
    await user.click(screen.getByRole('button', { name: 'Skip quiz' }));
    await endVideo();
    expect(screen.getByText('You reached the end')).toBeInTheDocument();
    expect(seen).toEqual([true, false, true, false, true, false]);
    expect(document.querySelector('.host-ra')).toHaveAttribute('data-active', 'false');
  });

  it('keeps active on while a video error sits under the open quiz, which is still answerable', async () => {
    const seen: boolean[] = [];
    const onActive = (active: boolean) => {
      seen.push(active);
    };
    const { renderQuestion } = hosting(onActive);
    await start(<InteractiveVideo group={group()} renderQuestion={renderQuestion} />);
    await openFirstQuiz();
    await act(async () => {
      Object.defineProperty(video(), 'error', { configurable: true, value: { code: 2 } });
      video().dispatchEvent(new Event('error'));
    });
    expect(quizPanel()).toBeVisible();
    expect(seen).toEqual([true]);
  });

  it('draws nothing for null, and never falls back to the SDK’s own component', async () => {
    await start(
      <InteractiveVideo
        group={group()}
        renderQuestion={(question) => (question.activity.type === 'read-aloud' ? null : undefined)}
      />,
    );
    await openFirstQuiz();
    const shown = quizPanel().querySelector('.lk-iv-question:not([hidden])') as HTMLElement;
    expect(shown).toBeEmptyDOMElement();
    // A fallback would be the SDK's read-aloud, which throws without a binding.
    expect(document.querySelector('.lk-ra')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hands the host what the attempt restored: the answer, whether it was handed in, and its outcome', async () => {
    const byId = new Map<string, InteractiveVideoQuestion>();
    const stored = take('k0');
    const outcome = {
      status: 'deferred',
      reason: 'requires_async_grading',
      maxScore: 1,
    } as ItemOutcome;
    await start(
      <InteractiveVideo
        group={group()}
        responses={{ '0.0': stored }}
        submittedSlotIds={['0.0']}
        outcomes={{ '0.0': outcome }}
        renderQuestion={(question) => {
          byId.set(question.slot.slotId, question);
          return question.activity.type === 'read-aloud' ? null : undefined;
        }}
      />,
    );
    await openFirstQuiz();

    // Handed in already, so the quiz opens at the question still to answer.
    expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
    expect(byId.get('0.0')).toMatchObject({
      defaultValue: stored,
      defaultSubmitted: true,
      outcome,
      active: false,
    });
    const fresh = byId.get('0.1') as InteractiveVideoQuestion;
    expect(fresh.defaultSubmitted).toBe(false);
    expect('defaultValue' in fresh).toBe(false);
    expect('outcome' in fresh).toBe(false);
    expect(fresh.active).toBe(true);
    expect(fresh.renderMode).toBe('practice');
  });

  it('forwards emit with the question’s own activity id and the time', async () => {
    const onInteraction = vi.fn();
    const { renderQuestion, current } = hosting();
    await start(
      <InteractiveVideo
        group={group()}
        renderQuestion={renderQuestion}
        onInteraction={onInteraction}
      />,
    );
    await openFirstQuiz();
    act(() => {
      current().emit('text-changed', { length: 3 });
      current().emit('submitted');
    });
    expect(onInteraction).toHaveBeenCalledWith({
      type: 'text-changed',
      activityId: 'q-ra',
      timestamp: expect.any(Number),
      payload: { length: 3 },
    });
    expect(onInteraction).toHaveBeenLastCalledWith({
      type: 'submitted',
      activityId: 'q-ra',
      timestamp: expect.any(Number),
    });
  });

  it('keeps one identity for each question’s calls and slot, however often the player renders', async () => {
    const identities = new Map<string, Set<unknown>>();
    let calls = 0;
    const renderQuestion = (question: InteractiveVideoQuestion) => {
      calls += 1;
      const { slot } = question;
      for (const [name, value] of Object.entries({
        slot,
        submit: question.submit,
        complete: question.complete,
        clear: question.clear,
        setPending: question.setPending,
        emit: question.emit,
      })) {
        const key = `${slot.slotId}:${name}`;
        identities.set(key, (identities.get(key) ?? new Set()).add(value));
      }
      return question.activity.type === 'read-aloud' ? null : undefined;
    };
    const lesson = group();
    const { rerender } = await start(
      <InteractiveVideo group={lesson} renderQuestion={(question) => renderQuestion(question)} />,
    );
    await openFirstQuiz();
    for (let round = 0; round < 100; round += 1) {
      // A new function every time, as a host writing it inline passes.
      rerender(
        <InteractiveVideo group={lesson} renderQuestion={(question) => renderQuestion(question)} />,
      );
    }
    expect(calls).toBeGreaterThanOrEqual(200);
    // Two questions mounted, six things each, one identity apiece.
    expect(identities.size).toBe(12);
    for (const [key, values] of identities) {
      expect(values.size, key).toBe(1);
    }
  });

  it('ignores answers in review, and warns once for each call', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onSubmit = vi.fn();
    const onActivityComplete = vi.fn();
    const { renderQuestion, current } = hosting();
    await start(
      <InteractiveVideo
        group={group()}
        renderMode="review"
        renderQuestion={renderQuestion}
        onSubmit={onSubmit}
        onActivityComplete={onActivityComplete}
      />,
    );
    await openFirstQuiz();
    act(() => {
      current().submit(take('k1'));
      current().submit(take('k2'));
      current().complete(result(1));
      current().clear();
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onActivityComplete).not.toHaveBeenCalled();
    expect(current().renderMode).toBe('review');
    expect(screen.getByRole('button', { name: 'Question 1' })).toBeInTheDocument();
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.map(([message]) => String(message).match(/`(\w+)\(\)`/)?.[1])).toEqual([
      'submit',
      'complete',
      'clear',
    ]);
  });

  it('does nothing when called after the player has gone', async () => {
    const onSubmit = vi.fn();
    const onActivityComplete = vi.fn();
    const onInteraction = vi.fn();
    const { renderQuestion, current } = hosting();
    await start(
      <InteractiveVideo
        group={group()}
        renderQuestion={renderQuestion}
        onSubmit={onSubmit}
        onActivityComplete={onActivityComplete}
        onInteraction={onInteraction}
      />,
    );
    await openFirstQuiz();
    const late = current();
    cleanup();
    onInteraction.mockClear();
    late.submit(take('k1'));
    late.complete(result(1));
    late.clear();
    late.setPending(true);
    late.emit('submitted');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onActivityComplete).not.toHaveBeenCalled();
    expect(onInteraction).not.toHaveBeenCalled();
  });
});

describe('InteractiveVideo renderQuestion: safety', () => {
  it('degrades only the question that throws, and the video plays on', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    function Broken(): never {
      throw new Error('the host renderer broke');
    }
    await start(
      <InteractiveVideo
        group={group()}
        renderQuestion={(question) =>
          question.activity.type === 'read-aloud' ? <Broken /> : undefined
        }
      />,
    );
    await openFirstQuiz();
    expect(within(quizPanel()).getByRole('alert')).toHaveTextContent('Activity failed to render');

    await user.click(screen.getByRole('button', { name: 'Next question' }));
    expect(within(quizPanel()).getByRole('radio', { name: 'q1 correcta' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Continue video/ }));
    expect(video().paused).toBe(false);
  });

  it('degrades only that question when renderQuestion itself throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    await start(
      <InteractiveVideo
        group={group()}
        renderQuestion={(question) => {
          if (question.activity.type === 'read-aloud') {
            throw new Error('could not decide');
          }
          return undefined;
        }}
      />,
    );
    await openFirstQuiz();
    expect(within(quizPanel()).getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    expect(within(quizPanel()).getByRole('radio', { name: 'q1 correcta' })).toBeVisible();
  });

  it('lets Finish go when a host question that said it was busy breaks', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    function BusyThenBroken({ question }: { question: InteractiveVideoQuestion }) {
      const [broken, setBroken] = useState(false);
      const { setPending } = question;
      useEffect(() => {
        setPending(true);
      }, [setPending]);
      if (broken) {
        throw new Error('broke mid-upload');
      }
      return (
        <button type="button" onClick={() => setBroken(true)}>
          Romper
        </button>
      );
    }
    await start(
      <InteractiveVideo
        group={group()}
        onFinished={vi.fn()}
        renderQuestion={(question) =>
          question.activity.type === 'read-aloud' ? (
            <BusyThenBroken question={question} />
          ) : undefined
        }
      />,
    );
    await openFirstQuiz();
    await user.click(within(quizPanel()).getByRole('button', { name: 'Romper' }));
    expect(within(quizPanel()).getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Skip quiz' }));
    await endVideo();
    expect(finishButton()).not.toHaveAttribute('aria-disabled');
    expect(pendingLine()).toBeNull();
  });

  it('leaves the quiz open for an Escape a host popover handled, and skips it for any other', async () => {
    const user = userEvent.setup();
    // A popover in the portal that closes on Escape, as a host's menu does.
    function Menu({ question }: { question: InteractiveVideoQuestion }) {
      const [open, setOpen] = useState(true);
      if (!open || question.portalContainer === null) {
        return <button type="button">Otro botón</button>;
      }
      return createPortal(
        <button
          type="button"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
            }
          }}
        >
          Menú
        </button>,
        question.portalContainer,
      );
    }
    await start(
      <InteractiveVideo
        group={group()}
        renderQuestion={(question) =>
          question.activity.type === 'read-aloud' ? <Menu question={question} /> : undefined
        }
      />,
    );
    await openFirstQuiz();
    screen.getByRole('button', { name: 'Menú' }).focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Menú' })).toBeNull();
    expect(quizPanel()).toBeVisible();

    within(quizPanel()).getByRole('button', { name: 'Otro botón' }).focus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(quizPanel()).not.toBeVisible());
  });

  it('gives the host one portal, inside the player, that fullscreen paints', async () => {
    const { renderQuestion, current } = hosting();
    function Hint({ question }: { question: InteractiveVideoQuestion }) {
      return question.portalContainer === null
        ? null
        : createPortal(<span role="tooltip">Pista</span>, question.portalContainer);
    }
    await start(
      <InteractiveVideo
        group={group()}
        renderQuestion={(question) =>
          question.activity.type === 'read-aloud' ? (
            <>
              {renderQuestion(question)}
              <Hint question={question} />
            </>
          ) : undefined
        }
      />,
    );
    await openFirstQuiz();
    const shell = document.querySelector('.lk-iv') as HTMLElement;
    const portal = current().portalContainer as HTMLElement;
    expect(portal).toBeInstanceOf(HTMLElement);
    // In the shell, outside the stage that clips, and last, so it paints on top.
    expect(shell.contains(portal)).toBe(true);
    expect(portal.closest('.lk-iv-stage')).toBeNull();
    expect(shell.lastElementChild).toBe(portal);
    expect(portal).toContainElement(screen.getByRole('tooltip'));

    try {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: shell });
      act(() => {
        document.dispatchEvent(new Event('fullscreenchange'));
      });
      expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument();
      expect(document.fullscreenElement?.contains(screen.getByRole('tooltip'))).toBe(true);
      expect(current().portalContainer).toBe(portal);
    } finally {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    }
  });
});

describe('InteractiveVideo: Finish waits for an answer on its way', () => {
  it('holds Finish while the host says work is on its way, and finishes once it lands', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn();
    const { renderQuestion, current } = hosting();
    await start(
      <InteractiveVideo group={group()} renderQuestion={renderQuestion} onFinished={onFinished} />,
    );
    await openFirstQuiz();
    act(() => {
      current().setPending(true);
    });
    // Closing the quiz and seeking do not wait.
    await user.click(screen.getByRole('button', { name: 'Skip quiz' }));
    expect(quizPanel()).not.toBeVisible();
    await endVideo();

    expect(finishButton()).toHaveAttribute('aria-disabled', 'true');
    expect(pendingLine()).toHaveTextContent('Saving your answer…');
    expect(finishButton()).toHaveAccessibleDescription('Saving your answer…');
    await user.click(finishButton());
    expect(onFinished).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.querySelector('.lk-iv-live')).toHaveTextContent('Saving your answer…'),
    );

    // The work lands late, through the same calls, on a question off screen.
    act(() => {
      current().submit(take('k1'));
      current().setPending(false);
    });
    expect(finishButton()).not.toHaveAttribute('aria-disabled');
    expect(pendingLine()).toBeNull();
    await user.click(finishButton());
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0]?.[0].slots[0]).toEqual({
      slotId: '0.0',
      activityId: 'q-ra',
      cueId: 'first',
      status: 'answered',
    });
  });

  it('waits to finish a video that ends with every answer in until nothing is on its way', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn();
    const { renderQuestion, current } = hosting();
    const short = group({
      items: [readAloud, mc('q1', '¿Uno?')],
      timeline: { cues: [{ id: 'first', at: 30, itemIds: ['q-ra', 'q1'] }] },
    } as Partial<ItemGroup>);
    await start(
      <InteractiveVideo group={short} renderQuestion={renderQuestion} onFinished={onFinished} />,
    );
    await openFirstQuiz();
    act(() => {
      current().setPending(true);
      current().submit(take('k1'));
    });
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    await user.click(within(quizPanel()).getByRole('radio', { name: 'q1 correcta' }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Submit' }));
    await user.click(screen.getByRole('button', { name: /Continue video/ }));
    await endVideo();
    expect(onFinished).not.toHaveBeenCalled();

    act(() => {
      current().setPending(false);
    });
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
  });

  it('holds Finish while the SDK’s own read-aloud is still uploading a take', async () => {
    const capture = stubSpeechCapture();
    harness = capture;
    const user = userEvent.setup();
    const onFinished = vi.fn();
    const onSubmit = vi.fn();
    const upload = deferred<RecordingRef>();
    const only = group({
      items: [readAloud],
      timeline: { cues: [{ id: 'first', at: 30, itemIds: ['q-ra'] }] },
    } as Partial<ItemGroup>);
    await start(
      <InteractiveVideo
        group={only}
        onFinished={onFinished}
        onSubmit={onSubmit}
        recordingBinding={{ upload: () => upload.promise }}
      />,
    );
    await openFirstQuiz();
    await makeTake(user, capture);
    await user.click(within(quizPanel()).getByRole('button', { name: 'Submit' }));
    // The learner moves on while the take uploads: nothing waits for that.
    await user.click(screen.getByRole('button', { name: /Continue video/ }));
    await endVideo();

    expect(finishButton()).toHaveAttribute('aria-disabled', 'true');
    expect(pendingLine()).toHaveTextContent('Saving your answer…');
    expect(onFinished).not.toHaveBeenCalled();

    act(() => {
      upload.settle({ key: 'take-1', mimeType: 'audio/wav', durationMs: 2000 });
    });
    await flush();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // Stored, and the only question: the video that ended finishes now.
    await waitFor(() =>
      expect(onFinished).toHaveBeenCalledWith({
        slots: [{ slotId: '0.0', activityId: 'q-ra', cueId: 'first', status: 'answered' }],
      }),
    );
  });

  it('reads a slot’s takes in order: an older take’s end never releases a newer one', async () => {
    const onFinished = vi.fn();
    const held: { report?: (take: number, state: 'in-flight' | 'retryable' | 'settled') => void } =
      {};
    // What a component inside the question reports through its slot's channel,
    // as the SDK's read-aloud does.
    function Reporter() {
      const channel = useContext(SequenceSlotContext);
      held.report = (take, state) => channel?.takeState(take, state);
      return <p>Informe</p>;
    }
    const user = userEvent.setup();
    await start(
      <InteractiveVideo
        group={group()}
        onFinished={onFinished}
        renderQuestion={(question) =>
          question.activity.type === 'read-aloud' ? <Reporter /> : undefined
        }
      />,
    );
    await openFirstQuiz();
    const report = (take: number, state: 'in-flight' | 'retryable' | 'settled') =>
      act(() => {
        held.report?.(take, state);
      });
    await user.click(screen.getByRole('button', { name: 'Skip quiz' }));
    await endVideo();

    report(5, 'in-flight');
    expect(finishButton()).toHaveAttribute('aria-disabled', 'true');
    report(4, 'settled');
    expect(finishButton()).toHaveAttribute('aria-disabled', 'true');
    // A failure the learner may retry is nothing on its way.
    report(5, 'retryable');
    expect(finishButton()).not.toHaveAttribute('aria-disabled');
    report(6, 'in-flight');
    expect(finishButton()).toHaveAttribute('aria-disabled', 'true');
    report(6, 'settled');
    expect(finishButton()).not.toHaveAttribute('aria-disabled');
  });
});

describe('InteractiveVideo: AI ports', () => {
  const fakePorts = () => ({
    hint: vi.fn(async () => ({ text: 'Piensa en la hora.' })),
    explain: vi.fn(async () => ({ text: 'Porque es la capital.' })),
  });
  /** Draws nothing for the read-aloud, and records what each question was handed. */
  const recording = (seen: (LearnerAi | undefined)[]) => (question: InteractiveVideoQuestion) => {
    seen.push(question.ai);
    return question.activity.type === 'read-aloud' ? null : undefined;
  };

  it('hands a question the host draws the ports in force: its prop, else a provider above it', async () => {
    const own = fakePorts();
    const seen: (LearnerAi | undefined)[] = [];
    await start(<InteractiveVideo group={group()} ai={own} renderQuestion={recording(seen)} />);
    await openFirstQuiz();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((ai) => ai === own)).toBe(true);
    cleanup();

    const provided = fakePorts();
    const fromAbove: (LearnerAi | undefined)[] = [];
    await start(
      <LkAiProvider ai={provided}>
        <InteractiveVideo group={group()} renderQuestion={recording(fromAbove)} />
      </LkAiProvider>,
    );
    await openFirstQuiz();
    expect(fromAbove.every((ai) => ai === provided)).toBe(true);
  });

  it('gives a question the SDK draws in a quiz the same help as anywhere else', async () => {
    const user = userEvent.setup();
    const ai = fakePorts();
    await start(<InteractiveVideo group={group()} ai={ai} renderQuestion={recording([])} />);
    await openFirstQuiz();
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Get a hint' }));
    expect(await within(quizPanel()).findByText('Piensa en la hora.')).toBeInTheDocument();
  });

  it('gives no question AI help in exam: the SDK draws none, and a host is handed no ports', async () => {
    const user = userEvent.setup();
    const ai = fakePorts();
    const seen: (LearnerAi | undefined)[] = [];
    await start(
      <LkAiProvider ai={ai}>
        <InteractiveVideo
          group={group()}
          renderMode="exam"
          ai={ai}
          renderQuestion={recording(seen)}
        />
      </LkAiProvider>,
    );
    await openFirstQuiz();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((handed) => handed === undefined)).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Next question' }));
    expect(within(quizPanel()).queryByRole('button', { name: 'Get a hint' })).toBeNull();
    await user.click(within(quizPanel()).getByRole('radio', { name: 'q1 correcta' }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Submit' }));
    expect(within(quizPanel()).queryByRole('button', { name: 'Explain my answer' })).toBeNull();
    expect(ai.hint).not.toHaveBeenCalled();
    expect(ai.explain).not.toHaveBeenCalled();
  });

  it('refuses the hooks in an exam video, even for a host that passes no renderMode', async () => {
    const user = userEvent.setup();
    const ai = fakePorts();
    // The worst case the ports alone do not cover: the host draws its own
    // question, asks the hooks for help without telling them the mode, and a
    // provider above the player holds the ports the video itself withholds.
    // The video the question sits in is what decides.
    function Drawn({ activity }: InteractiveVideoQuestion) {
      const hints = useAiHints({
        data: activity,
        response: { type: 'multiple-choice', selectedOptionIds: [] },
        submitted: false,
      });
      return (
        <button type="button" onClick={hints.ask}>
          {`Mine: hints ${hints.offered ? 'on' : 'off'}`}
        </button>
      );
    }
    await start(
      <LkAiProvider ai={ai}>
        <InteractiveVideo
          group={group()}
          renderMode="exam"
          renderQuestion={(question) =>
            question.activity.type === 'multiple-choice' ? <Drawn {...question} /> : null
          }
        />
      </LkAiProvider>,
    );
    await openFirstQuiz();
    // Past the read-aloud, which this host leaves to nobody, to the question it draws.
    await user.click(screen.getByRole('button', { name: 'Next question' }));

    const mine = within(quizPanel()).getAllByRole('button', { name: /^Mine: hints/ });
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((button) => button.textContent === 'Mine: hints off')).toBe(true);
    await user.click(mine[0] as HTMLElement);
    expect(ai.hint).not.toHaveBeenCalled();
  });
});

describe('InteractiveVideo: delivery policy', () => {
  it('counts answers on the end card and shows no score where the policy shows no feedback', async () => {
    const user = userEvent.setup();
    const { renderQuestion } = hosting();
    await start(
      <InteractiveVideo
        group={group()}
        renderQuestion={renderQuestion}
        delivery={{ feedback: false }}
      />,
    );
    await openFirstQuiz();
    await user.click(within(quizPanel()).getByRole('button', { name: 'Guardar toma' }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Calificar' }));
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    await user.click(within(quizPanel()).getByRole('radio', { name: 'q1 correcta' }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Submit' }));
    // The SDK's own question, under the video's policy: no mark on the choice.
    expect(within(quizPanel()).queryByText(/Score/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /Continue video/ }));
    await endVideo();

    expect(screen.getByText('You answered 2 of 3 questions')).toBeInTheDocument();
    expect(screen.queryByText(/90%/)).toBeNull();
  });

  it('hands a question the host draws the video policy, spelled out', async () => {
    const seen: InteractiveVideoQuestion[] = [];
    await start(
      <InteractiveVideo
        group={group()}
        delivery={{ hints: false }}
        renderQuestion={(question) => {
          seen.push(question);
          return question.activity.type === 'read-aloud' ? null : undefined;
        }}
      />,
    );
    await openFirstQuiz();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)?.delivery).toEqual({
      feedback: true,
      solutions: true,
      hints: false,
      ai: { hints: true, explanations: true },
    });
  });
});

describe('InteractiveVideo renderQuestion: types', () => {
  it('takes undefined as the SDK’s own and null as nothing, and exports the question type from the root', () => {
    const sdkOwn: NonNullable<InteractiveVideoProps['renderQuestion']> = () => undefined;
    const nothing: NonNullable<InteractiveVideoProps['renderQuestion']> = () => null;
    const same = (question: InteractiveVideoQuestion): FromTheRoot => question;
    expect([sdkOwn, nothing, same]).toHaveLength(3);
  });
});

/** A promise the test settles when it chooses. */
function deferred<T>(): { promise: Promise<T>; settle: (value: T) => void } {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

/** Lets every pending promise in the recorder settle. */
async function flush(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 20; tick += 1) {
      await Promise.resolve();
    }
  });
}

/** Records one take of two seconds inside the open quiz, and stops it. */
async function makeTake(user: UserEvent, capture: SpeechCaptureHarness): Promise<void> {
  await user.click(within(quizPanel()).getByRole('button', { name: /^Record/ }));
  await flush();
  act(() => {
    capture.pushLevel(0.5, Math.round(capture.sampleRate * 2));
  });
  await user.click(within(quizPanel()).getByRole('button', { name: 'Stop recording' }));
}

describe('InteractiveVideo scoring', () => {
  const quizzes = () =>
    group({
      items: [mc('q1', '¿Uno?'), mc('q2', '¿Dos?')],
      timeline: {
        cues: [
          { id: 'first', at: 30, title: 'Primera pausa', itemIds: ['q1'] },
          { id: 'second', at: 90, title: 'Segunda pausa', itemIds: ['q2'] },
        ],
      },
    });

  it('offers a question another try, and the later try’s grade is the one it keeps', async () => {
    const user = userEvent.setup();
    const onActivityComplete = vi.fn();
    await start(
      <InteractiveVideo
        group={quizzes()}
        scoring={{ retries: 1, retryPenalty: 0.5, counts: 'best' }}
        onActivityComplete={onActivityComplete}
      />,
    );
    await openFirstQuiz();
    await user.click(within(quizPanel()).getByRole('radio', { name: /^q1 incorrecta/ }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Submit' }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Try again' }));
    await user.click(within(quizPanel()).getByRole('radio', { name: /^q1 correcta/ }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Submit' }));
    expect(onActivityComplete).toHaveBeenCalledTimes(2);
    expect(onActivityComplete.mock.calls[1]?.[0]).toMatchObject({ score: 0.5 });
  });

  it('hands a question the host draws the policy, spelled out', async () => {
    const seen: InteractiveVideoQuestion[] = [];
    await start(
      <InteractiveVideo
        group={quizzes()}
        scoring={{ hintPenalty: 0.1 }}
        renderQuestion={(question) => {
          seen.push(question);
          return undefined;
        }}
      />,
    );
    await openFirstQuiz();
    expect(seen.at(-1)?.scoring).toEqual({
      hintPenalty: 0.1,
      retries: 0,
      retryPenalty: 0,
      counts: 'first',
    });
  });

  it('holds the video’s policy in a question the host draws with a policy of its own', async () => {
    const user = userEvent.setup();
    await start(
      <InteractiveVideo
        group={quizzes()}
        scoring={{ hintPenalty: 0.5 }}
        renderQuestion={(question) => (
          <MultipleChoice
            data={question.activity as never}
            renderMode={question.renderMode}
            onSubmit={question.submit}
            onComplete={question.complete}
            scoring={{ retries: 3 }}
          />
        )}
      />,
    );
    await openFirstQuiz();
    await user.click(within(quizPanel()).getByRole('radio', { name: /^q1 incorrecta/ }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Submit' }));
    // The video gives one try; the question asked for four.
    expect(within(quizPanel()).queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('closes every question’s tries once the learner finishes', async () => {
    const user = userEvent.setup();
    await start(<InteractiveVideo group={quizzes()} scoring={{ retries: 1 }} />);
    await openFirstQuiz();
    await user.click(within(quizPanel()).getByRole('radio', { name: /^q1 incorrecta/ }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Submit' }));
    expect(within(quizPanel()).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continue video/ }));
    await endVideo();
    // Opened again before finishing, the question still offers its try: what
    // closes it below is finishing, not reopening.
    await user.click(screen.getAllByRole('button', { name: /Primera pausa/ })[0] as HTMLElement);
    await waitFor(() => expect(quizPanel()).toBeVisible());
    expect(within(quizPanel()).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continue video/ }));
    await endVideo();
    await user.click(finishButton());
    await user.click(screen.getAllByRole('button', { name: /Primera pausa/ })[0] as HTMLElement);
    await waitFor(() => expect(quizPanel()).toBeVisible());
    expect(within(quizPanel()).queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
