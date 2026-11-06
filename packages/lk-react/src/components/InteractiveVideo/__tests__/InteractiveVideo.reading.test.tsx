import type { ItemGroup } from '@intellectif/lk-core';
import { act, cleanup, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubMediaElement } from '../../../test-support/media.js';
import type { ReadingRouteResult } from '../../ReadingRoute/ReadingRoute.js';
import { InteractiveVideo } from '../index.js';

/**
 * A reading quiz: a quiz whose every question the group's route covers opens,
 * in practice, as a reading route over the video stimulus's text — and its
 * answers count in the video as any quiz's do.
 */

const BODY = [
  'Trams left most cities in the 1950s. By 1960, only a handful of British cities still ran them.',
  'They came back in the 1990s. The first new line opened in Manchester in 1992.',
].join('\n\n');

const tfng = (id: string, question: string, answer: 't' | 'f' | 'ng') => ({
  schemaVersion: '1.0' as const,
  type: 'multiple-choice' as const,
  id,
  title: id,
  question,
  mode: 'single' as const,
  scoringStrategy: 'all-or-nothing' as const,
  options: [
    { id: 't', text: 'True', isCorrect: answer === 't' },
    { id: 'f', text: 'False', isCorrect: answer === 'f' },
    { id: 'ng', text: 'Not Given', isCorrect: answer === 'ng' },
  ],
});

const lesson = (): ItemGroup =>
  ({
    schemaVersion: '1.0',
    type: 'item-group',
    id: 'trams-video',
    title: 'Trams',
    stimulus: {
      id: 'clip',
      kind: 'video',
      media: { type: 'video', url: 'https://cdn.example.test/trams.mp4', alt: 'A lesson on trams' },
      title: 'The Return of the Tram',
      body: BODY,
    },
    items: [
      tfng('tf1', 'By 1960, most British cities had stopped running trams.', 't'),
      tfng('tf2', 'Manchester opened the first new line.', 't'),
      {
        schemaVersion: '1.0',
        type: 'multiple-choice',
        id: 'check',
        title: 'check',
        question: 'Did you watch the clip?',
        mode: 'single',
        scoringStrategy: 'all-or-nothing',
        options: [
          { id: 'y', text: 'Yes', isCorrect: true },
          { id: 'n', text: 'No', isCorrect: false },
        ],
      },
    ],
    timeline: {
      cues: [
        { id: 'read', at: 30, title: 'Read the passage', itemIds: ['tf1', 'tf2'] },
        { id: 'watched', at: 90, itemIds: ['check'] },
      ],
    },
    route: {
      routeVersion: '1.0',
      paragraphLabels: ['A', 'B'],
      questions: [
        {
          itemId: 'tf1',
          strategy: 'tfng',
          evidence: ['By 1960, only a handful of British cities still ran them.'],
        },
        {
          itemId: 'tf2',
          strategy: 'tfng',
          evidence: ['The first new line opened in Manchester in 1992.'],
        },
      ],
    },
  }) as ItemGroup;

async function playTo(seconds: number): Promise<void> {
  const video = document.querySelector('video') as HTMLVideoElement;
  await act(async () => {
    video.currentTime = seconds;
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

async function start(ui: React.ReactElement): Promise<void> {
  render(ui);
  await act(async () => {
    (document.querySelector('video') as HTMLVideoElement).dispatchEvent(
      new Event('loadedmetadata'),
    );
  });
  await act(async () => {
    await (document.querySelector('video') as HTMLVideoElement).play();
  });
}

const quizPanel = () => document.querySelector('.lk-iv-quiz') as HTMLElement;

beforeEach(() => {
  stubMediaElement({ duration: 120 });
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InteractiveVideo reading quizzes', () => {
  it('opens a reading quiz as a route over the video text, and counts its answers', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onFinish = vi.fn<(result: ReadingRouteResult, cueId: string) => void>();
    await start(
      <InteractiveVideo
        group={lesson()}
        onSubmit={onSubmit}
        readingRoute={{ level: 'solo', onFinish }}
      />,
    );
    await playTo(31);
    await waitFor(() => expect(quizPanel()).toBeVisible());
    const panel = within(quizPanel());
    // The route, loaded on demand: the passage beside both questions at once.
    await waitFor(() => expect(panel.getByText('The Return of the Tram')).toBeInTheDocument());
    expect(panel.getAllByRole('radio', { name: 'True' })).toHaveLength(2);
    expect(quizPanel().querySelector('.lk-iv-steps')).toBeNull();
    expect(panel.getByRole('button', { name: /Continue/ })).toBeInTheDocument();

    const cards = quizPanel().querySelectorAll<HTMLElement>('.lk-rr-card');
    await user.click(within(cards[0] as HTMLElement).getByRole('radio', { name: 'True' }));
    await user.click(within(cards[0] as HTMLElement).getByRole('button', { name: 'Submit' }));
    // Recorded by the video, under the question's own slot.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ selectedOptionIds: ['t'] }),
      expect.objectContaining({ activityId: 'tf1' }),
    );
    // Answered and never handed in: counted when the learner finishes.
    await user.click(within(cards[1] as HTMLElement).getByRole('radio', { name: 'False' }));
    await user.click(panel.getByRole('button', { name: 'Finish and review' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ selectedOptionIds: ['f'] }),
      expect.objectContaining({ activityId: 'tf2' }),
    );
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: expect.objectContaining({ groupId: 'trams-video:read', correct: 1, total: 2 }),
      }),
      'read',
    );
    expect(panel.getByText('1 of 2 correct')).toBeInTheDocument();
  });

  it('keeps the other quizzes ordinary, and every quiz ordinary outside practice', async () => {
    await start(<InteractiveVideo group={lesson()} renderMode="exam" />);
    await playTo(31);
    await waitFor(() => expect(quizPanel()).toBeVisible());
    // An exam shows the reading quiz's questions one at a time, with no route.
    expect(quizPanel().querySelector('.lk-rr')).toBeNull();
    expect(quizPanel().querySelector('.lk-iv-steps')).not.toBeNull();
  });
});
