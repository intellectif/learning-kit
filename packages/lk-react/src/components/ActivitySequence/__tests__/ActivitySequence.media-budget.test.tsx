import type { MediaPlayClaim } from '@intellectif/lk-core';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivitySequence } from '../index.js';

/**
 * The pager is where a play budget is actually wired: it derives the budget
 * key, seeds the count from the ledger, and refuses to render an exam that
 * could not persist what it spends. Testing the transport alone proves none of
 * that — and the keying in particular is the difference between a
 * six-question listening group having two plays and having twelve.
 */
function stubMediaElement(): void {
  const state = new WeakMap<HTMLMediaElement, { paused: boolean; time: number }>();
  const get = (el: HTMLMediaElement) => {
    let s = state.get(el);
    if (s === undefined) {
      s = { paused: true, time: 0 };
      state.set(el, s);
    }
    return s;
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
    set(this: HTMLMediaElement, v: number) {
      get(this).time = v;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
    configurable: true,
    get: () => 60,
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

const question = (id: string) =>
  ({
    schemaVersion: '1.0',
    type: 'multiple-choice',
    id,
    title: id,
    question: `Question ${id}?`,
    mode: 'single',
    scoringStrategy: 'all-or-nothing',
    options: [
      { id: 'a', text: 'A', isCorrect: true },
      { id: 'b', text: 'B', isCorrect: false },
    ],
  }) as never;

/** A listening group: one recording, several questions. */
const listeningGroup = (maxPlays: number, questionCount: number) =>
  ({
    schemaVersion: '1.0',
    id: 'g1',
    type: 'item-group',
    title: 'Part 2',
    stimulus: {
      id: 's1',
      kind: 'audio',
      title: 'Recording',
      media: { type: 'audio', url: '/part2.mp3', alt: 'Part 2', playback: { maxPlays } },
    },
    items: Array.from({ length: questionCount }, (_, i) => question(`q${i}`)),
  }) as never;

describe('ActivitySequence media budget', () => {
  beforeEach(() => {
    stubMediaElement();
  });

  it('gives a whole listening group ONE budget, keyed by the entry', () => {
    const onPlayConsumed = vi.fn();
    render(
      <ActivitySequence
        activities={[listeningGroup(2, 6)]}
        renderMode="exam"
        onSubmit={vi.fn()}
        mediaBudget={{ onPlayConsumed }}
      />,
    );

    // One transport for the group's stimulus, not one per question.
    expect(document.querySelectorAll('.lk-media-transport')).toHaveLength(1);
    expect(document.querySelector('.lk-media-plays')).toHaveTextContent('2 of 2 plays remaining');
  });

  it('seeds the count from the ledger so a resume does not restore the budget', () => {
    render(
      <ActivitySequence
        activities={[listeningGroup(2, 3)]}
        renderMode="exam"
        onSubmit={vi.fn()}
        responses={{ '0.0': { type: 'multiple-choice', selectedOptionIds: ['a'] } } as never}
        mediaBudget={{
          onPlayConsumed: vi.fn(),
          plays: { 'stimulus:0': { plays: 1, at: 12 } },
        }}
      />,
    );

    expect(document.querySelector('.lk-media-plays')).toHaveTextContent('1 of 2 plays remaining');
  });

  it('refuses an exam that could not persist what it spends', () => {
    expect(() =>
      render(
        <ActivitySequence
          activities={[listeningGroup(2, 3)]}
          renderMode="exam"
          onSubmit={vi.fn()}
        />,
      ),
    ).toThrow(/onPlayConsumed/);
  });

  it('refuses a resumed exam that omits the ledger', () => {
    expect(() =>
      render(
        <ActivitySequence
          activities={[listeningGroup(2, 3)]}
          renderMode="exam"
          onSubmit={vi.fn()}
          submittedSlotIds={['0.0']}
          mediaBudget={{ onPlayConsumed: vi.fn() }}
        />,
      ),
    ).toThrow(/mediaBudget\.plays/);
  });

  it('refuses a paper that budgets one recording under two keys', () => {
    const shared = {
      type: 'audio',
      url: '/part2.mp3',
      alt: 'Part 2',
      playback: { maxPlays: 2 },
    };
    const a = { ...(question('q1') as object), media: shared } as never;
    const b = { ...(question('q2') as object), media: shared } as never;

    expect(() =>
      render(
        <ActivitySequence
          activities={[a, b]}
          renderMode="exam"
          onSubmit={vi.fn()}
          mediaBudget={{ onPlayConsumed: vi.fn() }}
        />,
      ),
    ).toThrow(/budgeted under 2 separate keys/);
  });

  it('stamps the claim with the slot the learner was standing on', () => {
    const claims: MediaPlayClaim[] = [];
    render(
      <ActivitySequence
        activities={[listeningGroup(2, 3)]}
        renderMode="exam"
        onSubmit={vi.fn()}
        mediaBudget={{
          onPlayConsumed: (claim) => {
            claims.push(claim);
          },
        }}
      />,
    );

    (document.querySelector('.lk-media-play') as HTMLButtonElement).click();

    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      key: 'stimulus:0',
      previousPlaysUsed: 0,
      playsUsed: 1,
      maxPlays: 2,
      slotId: '0.0',
    });
  });

  it('never enforces in review mode', () => {
    render(
      <ActivitySequence
        activities={[listeningGroup(1, 2)]}
        renderMode="review"
        shuffleSeed="attempt-1"
        mediaBudget={{ plays: { 'stimulus:0': { plays: 1 } } }}
      />,
    );

    // The native bar comes back: a graded paper cannot be changed by listening.
    expect(document.querySelector('.lk-media-transport')).toBeNull();
    expect(document.querySelector('audio[controls]')).not.toBeNull();
  });
});
