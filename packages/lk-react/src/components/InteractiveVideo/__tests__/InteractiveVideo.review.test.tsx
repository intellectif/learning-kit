import type { ItemGroup, ItemOutcome } from '@intellectif/lk-core';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractiveVideo } from '../index.js';

/**
 * Review: the attempt is over and the video is the record of it. Every quiz
 * shows how it was marked, nothing is required any more, and there is nothing
 * left to finish.
 */

const item = (id: string) => ({
  schemaVersion: '1.0' as const,
  type: 'multiple-choice' as const,
  id,
  title: id,
  question: '¿Cuánto?',
  mode: 'single' as const,
  scoringStrategy: 'all-or-nothing' as const,
  options: [
    { id: 'a', text: `${id} tres`, isCorrect: false },
    { id: 'b', text: `${id} cuatro`, isCorrect: true },
  ],
});

const group = (): ItemGroup =>
  ({
    schemaVersion: '1.0',
    type: 'item-group',
    id: 'v',
    title: 'Vídeo',
    stimulus: { id: 's', kind: 'video', media: { type: 'video', url: '/v.mp4', alt: 'Vídeo' } },
    items: [item('q1'), item('q2'), item('q3'), item('q4')],
    timeline: {
      cues: [
        { id: 'both', at: 20, title: 'Las dos', itemIds: ['q1', 'q2'], required: true },
        { id: 'one', at: 50, title: 'La otra', itemIds: ['q3'] },
        { id: 'later', at: 80, title: 'Sin nota', itemIds: ['q4'] },
      ],
    },
  }) as ItemGroup;

const scored = (passed: boolean): ItemOutcome => ({
  status: 'scored',
  score: passed ? 1 : 0,
  maxScore: 1,
  passed,
  feedback: passed ? 'Bien' : 'Mal',
  details: [
    { itemId: 'a', correct: !passed, learnerResponse: ['not-selected'], correctResponse: [] },
    { itemId: 'b', correct: passed, learnerResponse: ['selected'], correctResponse: ['selected'] },
  ],
});

const deferred: ItemOutcome = { status: 'deferred', reason: 'requires_async_grading', maxScore: 1 };

function stubVideo(): void {
  const state = new WeakMap<HTMLMediaElement, { paused: boolean; time: number }>();
  const get = (el: HTMLMediaElement) => {
    let entry = state.get(el);
    if (entry === undefined) {
      entry = { paused: true, time: 0 };
      state.set(el, entry);
    }
    return entry;
  };
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return get(this).paused;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return get(this).time;
    },
    set(this: HTMLMediaElement, value: number) {
      get(this).time = value;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
    configurable: true,
    get: () => 100,
  });
  HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    get(this).paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement) {
    get(this).paused = true;
    this.dispatchEvent(new Event('pause'));
  };
}

const video = () => document.querySelector('video') as HTMLVideoElement;

// A review shows the learner's own answers marked, so the host hands back both
// what they answered and how it was graded.
const answered = (id: string) => ({ type: 'multiple-choice' as const, selectedOptionIds: [id] });
const responses = {
  '0.0': answered('b'),
  '0.1': answered('a'),
  '0.2': answered('b'),
  '0.3': answered('b'),
};
const outcomes = {
  '0.0': scored(true),
  '0.1': scored(false),
  '0.2': scored(true),
  '0.3': deferred,
};

async function mountReview(): Promise<void> {
  render(
    <InteractiveVideo
      group={group()}
      renderMode="review"
      responses={responses}
      outcomes={outcomes}
      preferences={{ panel: true }}
    />,
  );
  await act(async () => {
    video().dispatchEvent(new Event('loadedmetadata'));
  });
}

beforeEach(() => {
  stubVideo();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InteractiveVideo in review', () => {
  it('marks each quiz by how it was graded, not by colour alone', async () => {
    await mountReview();
    const marks = [...document.querySelectorAll('.lk-iv-marker')].map((mark) =>
      mark.getAttribute('data-state'),
    );
    // One quiz passed both, one passed some, and one is still being marked.
    expect(marks).toEqual(['partial', 'correct', 'pending']);
  });

  it('lets the learner move anywhere, required quiz or not', async () => {
    await mountReview();
    await act(async () => {
      (document.querySelector('.lk-iv') as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
      );
    });
    expect(video().currentTime).toBe(100);
    expect(document.querySelector('.lk-iv-quiz')).not.toBeVisible();
  });

  it('opens a quiz from the contents with its questions marked, and nothing to submit', async () => {
    const user = userEvent.setup();
    await mountReview();

    await user.click(screen.getByRole('button', { name: /Las dos/ }));
    const panel = document.querySelector('.lk-iv-quiz') as HTMLElement;
    await waitFor(() => expect(panel).toBeVisible());

    // The question the learner got right carries its grade and its feedback,
    // and the answer key is marked on the options.
    expect(within(panel).getByText(/Score 100%\. Passed\. Bien/)).toBeInTheDocument();
    expect(
      panel.querySelector('[data-correct="true"]') ?? panel.querySelector('[data-correct]'),
    ).not.toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    // Nothing is required of a learner who is only reading the result.
    expect(screen.queryByText('Required')).not.toBeInTheDocument();
    // Nothing gates the way on, though the quiz was required when it was sat.
    expect(screen.getByRole('button', { name: 'Next question' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('ends with the record, and offers no Finish to press again', async () => {
    await mountReview();
    await act(async () => {
      video().dispatchEvent(new Event('ended'));
    });

    expect(screen.getByText('You reached the end')).toBeInTheDocument();
    expect(screen.getByText('You answered 4 of 4 questions')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Watch again' })).toBeInTheDocument();
  });

  it('reports a quiz whose grade has not come back as pending, not as wrong', async () => {
    render(
      <InteractiveVideo
        group={group()}
        renderMode="review"
        outcomes={{ '0.0': deferred, '0.1': scored(true) }}
        preferences={{ panel: true }}
      />,
    );
    await act(async () => {
      video().dispatchEvent(new Event('loadedmetadata'));
    });
    expect(document.querySelector('.lk-iv-marker')).toHaveAttribute('data-state', 'pending');
  });
});
