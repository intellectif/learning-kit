import type { ItemGroup, MediaProgress } from '@intellectif/lk-core';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import { stubMediaElement } from '../../../test-support/media.js';
import { InteractiveVideo } from '../index.js';

/**
 * The player, driven as a learner drives it.
 *
 * jsdom has no media stack, so the element is given the three behaviours the
 * player reasons about — a paused flag, a settable playhead and a duration —
 * and the playhead is moved by the test. Everything else (when a quiz opens,
 * what a seek is allowed to do, what survives a rewind) is the player's own
 * logic and is exercised for real.
 */

const VIDEO = 'https://cdn.example.test/lesson.mp4';

/** Moves the playhead the way playback would, and lets the frame loop see it. */
async function playTo(seconds: number): Promise<void> {
  const video = document.querySelector('video') as HTMLVideoElement;
  await act(async () => {
    video.currentTime = seconds;
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

async function press(key: string, over: KeyboardEventInit = {}): Promise<void> {
  const shell = document.querySelector('.lk-iv') as HTMLElement;
  await act(async () => {
    shell.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...over }));
    await new Promise((resolve) => setTimeout(resolve, 20));
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

const group = (over: Partial<ItemGroup> = {}): ItemGroup =>
  ({
    schemaVersion: '1.0',
    type: 'item-group',
    id: 'lesson-2',
    title: 'Lección 2',
    stimulus: {
      id: 's1',
      kind: 'video',
      media: { type: 'video', url: VIDEO, alt: 'Vídeo de la lección' },
    },
    items: [mc('q1', '¿Uno?'), mc('q2', '¿Dos?'), mc('q3', '¿Tres?')],
    timeline: {
      chapters: [
        { at: 0, title: 'Principio' },
        { at: 40, title: 'Medio' },
      ],
      cues: [
        { id: 'first', at: 30, title: 'Primera pausa', itemIds: ['q1', 'q2'] },
        { id: 'second', at: 90, title: 'Segunda pausa', itemIds: ['q3'] },
      ],
    },
    ...over,
  }) as ItemGroup;

/** Mounts the player and starts playback, as pressing play does. */
async function start(ui: React.ReactElement): Promise<HTMLElement> {
  const { container } = render(ui);
  await act(async () => {
    (document.querySelector('video') as HTMLVideoElement).dispatchEvent(
      new Event('loadedmetadata'),
    );
  });
  await act(async () => {
    await (document.querySelector('video') as HTMLVideoElement).play();
  });
  return container;
}

// `getByRole` skips hidden nodes, and the closed panel is exactly that: the
// questions stay mounted behind `hidden` so an answer survives a rewind.
const quizPanel = () => document.querySelector('.lk-iv-quiz') as HTMLElement;
const video = () => document.querySelector('video') as HTMLVideoElement;

beforeEach(() => {
  stubMediaElement({ duration: 120 });
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InteractiveVideo', () => {
  it('pauses the video at a quiz and puts its questions on the player', async () => {
    const onInteraction = vi.fn();
    await start(<InteractiveVideo group={group()} onInteraction={onInteraction} />);
    expect(quizPanel()).not.toBeVisible();

    await playTo(31);

    await waitFor(() => expect(quizPanel()).toBeVisible());
    expect(video().paused).toBe(true);
    // Landed ON the quiz, not wherever the frame happened to fall.
    expect(video().currentTime).toBe(30);
    expect(within(quizPanel()).getByText('Primera pausa')).toBeInTheDocument();
    expect(within(quizPanel()).getByRole('radio', { name: 'q1 correcta' })).toBeInTheDocument();
    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'video-quiz-opened', payload: { cueId: 'first', at: 30 } }),
    );
  });

  it('holds the learner in the quiz until they continue, then plays on', async () => {
    const user = userEvent.setup();
    await start(<InteractiveVideo group={group()} />);
    await playTo(31);
    await waitFor(() => expect(quizPanel()).toBeVisible());

    // Two questions: the first, then the second, then back to the video.
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    expect(within(quizPanel()).getByRole('radio', { name: 'q2 correcta' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continue video/ }));

    await waitFor(() => expect(quizPanel()).not.toBeVisible());
    expect(video().paused).toBe(false);

    // And it does not stop there again on the way past.
    await playTo(35);
    await playTo(40);
    expect(quizPanel()).not.toBeVisible();

    // Nor when the learner rewinds to watch that part again: a quiz they have
    // been through is theirs to reopen from the contents, not the video's to
    // impose a second time.
    await press('Home');
    await playTo(10);
    await playTo(31);
    expect(quizPanel()).not.toBeVisible();
  });

  it('keeps every answer when the learner rewinds and the quiz opens again', async () => {
    const user = userEvent.setup();
    await start(<InteractiveVideo group={group()} preferences={{ panel: true }} />);
    await playTo(31);
    await waitFor(() => expect(quizPanel()).toBeVisible());

    await user.click(within(quizPanel()).getByRole('radio', { name: 'q1 correcta' }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Submit' }));
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    await user.click(screen.getByRole('button', { name: /Continue video/ }));
    await waitFor(() => expect(quizPanel()).not.toBeVisible());

    // Back to the quiz from the contents list.
    await user.click(screen.getByRole('button', { name: /Primera pausa/ }));
    await waitFor(() => expect(quizPanel()).toBeVisible());
    // It opens at the first question with no answer, and the answered one is
    // still answered and still submitted.
    expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Question 1, answered' }));
    expect(within(quizPanel()).getByRole('radio', { name: 'q1 correcta' })).toBeChecked();
    // Submitted stays submitted: the question cannot be answered twice.
    expect(within(quizPanel()).getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('will not let a required quiz be skipped, by pressing on or by seeking', async () => {
    const user = userEvent.setup();
    const required = group({
      timeline: {
        cues: [
          { id: 'first', at: 30, title: 'Obligatoria', itemIds: ['q1', 'q2'], required: true },
          { id: 'second', at: 90, title: 'Segunda pausa', itemIds: ['q3'] },
        ],
      },
    } as Partial<ItemGroup>);

    await start(<InteractiveVideo group={required} />);
    await playTo(31);
    await waitFor(() => expect(quizPanel()).toBeVisible());

    expect(screen.queryByRole('button', { name: 'Skip quiz' })).not.toBeInTheDocument();
    const next = screen.getByRole('button', { name: 'Next question' });
    expect(next).toHaveAttribute('aria-disabled', 'true');
    await user.click(next);
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();

    // Answer both, and the way on opens.
    await user.click(within(quizPanel()).getByRole('radio', { name: 'q1 correcta' }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Submit' }));
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    await user.click(within(quizPanel()).getByRole('radio', { name: 'q2 incorrecta' }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Submit' }));
    await user.click(screen.getByRole('button', { name: /Continue video/ }));
    await waitFor(() => expect(quizPanel()).not.toBeVisible());
  });

  it('stops a seek at the required quiz it would have jumped over, and says why', async () => {
    const required = group({
      timeline: {
        cues: [
          {
            id: 'first',
            at: 30,
            title: 'Obligatoria',
            itemIds: ['q1', 'q2', 'q3'],
            required: true,
          },
        ],
      },
    } as Partial<ItemGroup>);
    await start(<InteractiveVideo group={required} />);

    await press('End');

    await waitFor(() => expect(quizPanel()).toBeVisible());
    expect(video().currentTime).toBe(30);
    await waitFor(() =>
      expect(screen.getByText('Finish the quiz at 0:30 to continue.')).toBeInTheDocument(),
    );
  });

  it('holds a no-skip-ahead learner at the furthest point they have watched', async () => {
    const strict = group({
      timeline: {
        navigation: 'no-skip-ahead',
        cues: [{ id: 'late', at: 110, title: 'Al final', itemIds: ['q1', 'q2', 'q3'] }],
      },
    } as Partial<ItemGroup>);
    await start(<InteractiveVideo group={strict} />);
    await playTo(20);

    await press('End');

    expect(video().currentTime).toBeLessThanOrEqual(21);
    await waitFor(() =>
      expect(screen.getByText('You can rewind, but not skip ahead.')).toBeInTheDocument(),
    );
    // Backwards is still free.
    await press('Home');
    expect(video().currentTime).toBe(0);
  });

  it('gives the quiz the keyboard, so typing an answer never drives the video', async () => {
    const user = userEvent.setup();
    await start(<InteractiveVideo group={group()} />);
    await playTo(31);
    await waitFor(() => expect(quizPanel()).toBeVisible());
    const at = video().currentTime;

    // 'l' jumps forward 10 s when the player has the keyboard.
    await press('l');
    await user.keyboard('{Home}');

    expect(video().currentTime).toBe(at);
  });

  it('starts where the learner left off, but never past an unanswered required quiz', async () => {
    const required = group({
      timeline: {
        cues: [
          {
            id: 'first',
            at: 30,
            title: 'Obligatoria',
            itemIds: ['q1', 'q2', 'q3'],
            required: true,
          },
        ],
      },
    } as Partial<ItemGroup>);
    const progress: MediaProgress = { progressVersion: '1.0', at: 100, furthest: 100 };
    render(<InteractiveVideo group={required} progress={progress} />);
    await act(async () => {
      video().dispatchEvent(new Event('loadedmetadata'));
    });
    expect(video().currentTime).toBeCloseTo(29.75, 2);

    // With the same stored point and no required quiz, it resumes where it was.
    cleanup();
    const optional = group({
      timeline: { cues: [{ id: 'first', at: 30, title: 'Pausa', itemIds: ['q1', 'q2', 'q3'] }] },
    } as Partial<ItemGroup>);
    render(<InteractiveVideo group={optional} progress={progress} />);
    await act(async () => {
      video().dispatchEvent(new Event('loadedmetadata'));
    });
    expect(video().currentTime).toBe(100);
  });

  it('reports where the learner is, and reports it as a quiz opens', async () => {
    const onProgress = vi.fn();
    await start(<InteractiveVideo group={group()} onProgress={onProgress} />);
    await playTo(31);
    await waitFor(() => expect(quizPanel()).toBeVisible());

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ progressVersion: '1.0', at: 30 }),
    );
    expect(onProgress.mock.calls.at(-1)?.[0].furthest).toBeGreaterThanOrEqual(30);
  });

  it('files each answer under its own question and quiz', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onActivityComplete = vi.fn();
    await start(
      <InteractiveVideo
        group={group()}
        onSubmit={onSubmit}
        onActivityComplete={onActivityComplete}
      />,
    );
    await playTo(31);
    await waitFor(() => expect(quizPanel()).toBeVisible());
    await user.click(within(quizPanel()).getByRole('radio', { name: 'q1 correcta' }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Submit' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ slotId: '0.0', activityId: 'q1', cueId: 'first', index: 0 }),
    );
    expect(onActivityComplete).toHaveBeenCalledWith(
      expect.objectContaining({ score: 1 }),
      expect.objectContaining({ activityId: 'q1', cueId: 'first' }),
    );
  });

  it('counts an answer the host restored, and does not offer it again', async () => {
    await start(
      <InteractiveVideo
        group={group()}
        responses={{ '0.0': { type: 'multiple-choice', selectedOptionIds: ['right'] } }}
        submittedSlotIds={['0.0']}
        preferences={{ panel: true }}
      />,
    );
    await playTo(31);
    await waitFor(() => expect(quizPanel()).toBeVisible());

    // Opens at the unanswered question, and the contents say one of two is in.
    expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();
  });

  it('shows the end card when the video ends, and finishes once', async () => {
    const user = userEvent.setup();
    const onFinished = vi.fn();
    await start(<InteractiveVideo group={group()} onFinished={onFinished} />);
    await act(async () => {
      video().dispatchEvent(new Event('ended'));
    });

    expect(screen.getByText('You reached the end')).toBeInTheDocument();
    expect(screen.getByText('You answered 0 of 3 questions')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    await user.click(screen.getByRole('button', { name: 'Finish' })).catch(() => undefined);
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished).toHaveBeenCalledWith({
      slots: [
        { slotId: '0.0', activityId: 'q1', cueId: 'first', status: 'unreached' },
        { slotId: '0.1', activityId: 'q2', cueId: 'first', status: 'unreached' },
        { slotId: '0.2', activityId: 'q3', cueId: 'second', status: 'unreached' },
      ],
    });
  });

  it('opens a quiz placed at the end of the video before the end card', async () => {
    const atEnd = group({
      timeline: { cues: [{ id: 'last', at: 120, title: 'Última', itemIds: ['q1', 'q2', 'q3'] }] },
    } as Partial<ItemGroup>);
    await start(<InteractiveVideo group={atEnd} />);
    await act(async () => {
      video().dispatchEvent(new Event('ended'));
    });

    expect(quizPanel()).toBeVisible();
    expect(screen.queryByText('You reached the end')).not.toBeInTheDocument();
  });

  it('says why the video will not play, and offers to try again', async () => {
    const user = userEvent.setup();
    render(<InteractiveVideo group={group()} />);
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load');
    await act(async () => {
      Object.defineProperty(video(), 'error', { configurable: true, value: { code: 2 } });
      video().dispatchEvent(new Event('error'));
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The connection dropped while the video was loading.',
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(load).toHaveBeenCalled();
  });

  it('reads the captions a host fetches for it, and lists them as a transcript', async () => {
    const user = userEvent.setup();
    const captionsLoader = vi.fn(
      async () =>
        'WEBVTT\n\n00:00:00.000 --> 00:00:40.000\nHola, clase\n\n00:01:00.000 --> 00:01:10.000\nAdiós',
    );
    const withTrack = group({
      stimulus: {
        id: 's1',
        kind: 'video',
        media: {
          type: 'video',
          url: VIDEO,
          alt: 'Vídeo',
          tracks: [{ kind: 'captions', src: '/c.vtt', srclang: 'es', label: 'Español' }],
        },
      },
    } as Partial<ItemGroup>);
    // With no loader the player fetches the track itself, as a `<track>` would.
    const fetched = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(['WEBVTT', '', '00:00:00.000 --> 00:00:01.000', 'Directo'].join('\n')),
      );
    await start(<InteractiveVideo group={withTrack} />);
    await waitFor(() => expect(fetched).toHaveBeenCalledWith('/c.vtt', expect.anything()));
    fetched.mockRestore();
    cleanup();

    await start(
      <InteractiveVideo
        group={withTrack}
        captionsLoader={captionsLoader}
        preferences={{ panel: true }}
      />,
    );
    await waitFor(() =>
      expect(captionsLoader).toHaveBeenCalledWith(
        expect.objectContaining({ src: '/c.vtt', srclang: 'es' }),
      ),
    );
    await waitFor(() => expect(screen.getByText('Hola, clase')).toBeInTheDocument());

    // The transcript lists every line, and a line seeks to its moment.
    await user.click(screen.getByRole('tab', { name: 'Transcript' }));
    await user.click(screen.getByRole('button', { name: /Adiós/ }));
    expect(video().currentTime).toBe(60);

    // Searching narrows it; a search that matches nothing says so.
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No lines match.')).toBeInTheDocument();
  });

  it('does not restart when the host rebuilds the same group on every render', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<InteractiveVideo group={group()} preferences={{ panel: true }} />);
    await act(async () => {
      video().dispatchEvent(new Event('loadedmetadata'));
    });
    await act(async () => {
      await video().play();
    });
    await playTo(31);
    await waitFor(() => expect(quizPanel()).toBeVisible());
    await user.click(within(quizPanel()).getByRole('radio', { name: 'q1 correcta' }));
    await user.click(within(quizPanel()).getByRole('button', { name: 'Submit' }));

    // A brand-new object with the same content, as `redactItemGroup` returns.
    rerender(<InteractiveVideo group={group()} preferences={{ panel: true }} />);

    expect(quizPanel()).toBeVisible();
    expect(within(quizPanel()).getByRole('radio', { name: 'q1 correcta' })).toBeChecked();
    expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();
  });

  it('starts over when the content is a different video', async () => {
    const { rerender } = render(<InteractiveVideo group={group()} />);
    await act(async () => {
      video().dispatchEvent(new Event('loadedmetadata'));
      await video().play();
    });
    await playTo(31);
    await waitFor(() => expect(quizPanel()).toBeVisible());

    rerender(
      <InteractiveVideo
        group={group({
          stimulus: {
            id: 's1',
            kind: 'video',
            media: { type: 'video', url: 'https://cdn.example.test/other.mp4', alt: 'Otro' },
          },
        } as Partial<ItemGroup>)}
      />,
    );

    expect(quizPanel()).not.toBeVisible();
    expect(video()).toHaveAttribute('src', 'https://cdn.example.test/other.mp4');
  });

  it('renders on a server without touching storage, and hydrates to the same chrome', () => {
    const storage = vi.spyOn(Storage.prototype, 'getItem');
    const html = renderToString(<InteractiveVideo group={group()} preferences={{ speed: 1.5 }} />);
    expect(html).toContain('lk-iv');
    expect(html).toContain('1.5×');
    expect(storage).not.toHaveBeenCalled();
  });

  it('is accessible at rest and with a quiz open', async () => {
    const container = await start(
      <InteractiveVideo group={group()} preferences={{ panel: true }} />,
    );
    expect(await checkA11y(container)).toHaveNoViolations();

    await playTo(31);
    await waitFor(() => expect(quizPanel()).toBeVisible());
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});
