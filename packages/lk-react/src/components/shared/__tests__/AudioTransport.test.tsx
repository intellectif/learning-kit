import type { ActivityMedia as ActivityMediaData } from '@intellectif/lk-core';
import { resolvePlaybackPolicy } from '@intellectif/lk-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaBudgetBinding } from '../../types.js';
import { AudioTransport } from '../AudioTransport.js';

/**
 * jsdom ships no media pipeline: `play()` rejects with "Not implemented" and
 * `currentTime` never advances. These stubs give the element the two behaviours
 * the transport actually reasons about — a paused flag and a playhead — so the
 * state machine is exercised rather than mocked away.
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
    set(this: HTMLMediaElement, value: number) {
      get(this).time = value;
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

const audio = (playback: Record<string, unknown>): ActivityMediaData =>
  ({ type: 'audio', url: '/part2.mp3', alt: 'Part 2', playback }) as ActivityMediaData;

const binding = (over: Partial<MediaBudgetBinding> = {}): MediaBudgetBinding => ({
  key: 'stimulus:1',
  slotId: '1.0',
  index: 0,
  activityId: 'q1',
  ...over,
});

const renderTransport = (
  media: ActivityMediaData,
  props: Partial<React.ComponentProps<typeof AudioTransport>> = {},
) =>
  render(
    <AudioTransport
      media={media}
      policy={resolvePlaybackPolicy(media)}
      renderMode="exam"
      {...props}
    />,
  );

const element = (): HTMLAudioElement =>
  document.querySelector('audio') as unknown as HTMLAudioElement;

const loadMetadata = (): void => {
  act(() => {
    element().dispatchEvent(new Event('loadedmetadata'));
  });
};

describe('AudioTransport', () => {
  beforeEach(() => {
    stubMediaElement();
  });

  it('announces the remaining budget and spends one play per start', async () => {
    const user = userEvent.setup();
    const onPlayConsumed = vi.fn();
    renderTransport(audio({ maxPlays: 2 }), { mediaBudget: binding({ onPlayConsumed }) });
    loadMetadata();

    expect(screen.getByRole('status')).toHaveTextContent('2 of 2 plays remaining');

    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(onPlayConsumed).toHaveBeenCalledTimes(1);
    expect(onPlayConsumed.mock.calls[0]?.[0]).toMatchObject({
      key: 'stimulus:1',
      previousPlaysUsed: 0,
      playsUsed: 1,
      maxPlays: 2,
      playsRemaining: 1,
      slotId: '1.0',
    });
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 plays remaining');
  });

  it('charges nothing for pausing and resuming where playback stopped', async () => {
    const user = userEvent.setup();
    const onPlayConsumed = vi.fn();
    renderTransport(audio({ maxPlays: 2 }), { mediaBudget: binding({ onPlayConsumed }) });
    loadMetadata();

    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(onPlayConsumed).toHaveBeenCalledTimes(1);

    // The learner listens a while, then pauses — as the pager itself does when
    // a pane hides. Resuming from that spot must be free, or paging through a
    // six-question listening group would exhaust the budget by navigation.
    act(() => {
      element().currentTime = 12;
      element().dispatchEvent(new Event('timeupdate'));
    });
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await user.click(screen.getByRole('button', { name: 'Play' }));

    expect(onPlayConsumed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 plays remaining');
  });

  it('refuses a scripted play once the budget is spent, before audio is audible', async () => {
    const onPlayConsumed = vi.fn();
    const onInteraction = vi.fn();
    renderTransport(audio({ maxPlays: 1 }), {
      mediaBudget: binding({ entry: { plays: 1 }, onPlayConsumed }),
      onInteraction,
    });
    loadMetadata();

    // A hardware media key or an extension calls play() directly — the budget
    // lives on the ELEMENT event, so this path is guarded too.
    act(() => {
      void element().play();
    });

    expect(element().paused).toBe(true);
    expect(onPlayConsumed).not.toHaveBeenCalled();
    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'media-play-refused' }),
    );
  });

  it('holds playback until a confirmed grant settles, and refuses one above the budget', async () => {
    const user = userEvent.setup();
    let resolveGrant: (grant: { playsUsed: number }) => void = () => {};
    const onPlayConsumed = vi.fn(
      () =>
        new Promise<{ playsUsed: number }>((resolve) => {
          resolveGrant = resolve;
        }),
    );
    renderTransport(audio({ maxPlays: 2 }), { mediaBudget: binding({ onPlayConsumed }) });
    loadMetadata();

    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Preparing…' })).toHaveAttribute('aria-busy', 'true');
    expect(element().paused).toBe(true);

    // A second tab already spent both plays, so the atomic write returns 3.
    await act(async () => {
      resolveGrant({ playsUsed: 3 });
    });

    expect(element().paused).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('No plays remaining');
  });

  it('restores the paid-for position so a refresh continues rather than recharges', async () => {
    const user = userEvent.setup();
    const onPlayConsumed = vi.fn();
    renderTransport(audio({ maxPlays: 2 }), {
      mediaBudget: binding({ entry: { plays: 1, at: 42 }, onPlayConsumed }),
    });
    loadMetadata();

    expect(element().currentTime).toBe(42);
    await user.click(screen.getByRole('button', { name: 'Play' }));

    // Continuing the play they already paid for is free.
    expect(onPlayConsumed).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 plays remaining');
  });

  it('reverts an out-of-band seek under seek: none and says so', () => {
    renderTransport(audio({ maxPlays: 2 }), { mediaBudget: binding() });
    loadMetadata();

    act(() => {
      element().currentTime = 10;
      element().dispatchEvent(new Event('timeupdate'));
    });
    act(() => {
      element().currentTime = 2;
      element().dispatchEvent(new Event('seeking'));
    });

    expect(element().currentTime).toBe(10);
    expect(screen.getByRole('alert')).toHaveTextContent('Rewinding is not available');
  });

  it('emits no media events when nothing is budgeted', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn();
    const media = audio({ seek: 'none' });
    renderTransport(media, { onInteraction });
    loadMetadata();

    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(onInteraction).not.toHaveBeenCalled();
  });

  it('keeps volume, mute and the exhausted play button operable', () => {
    renderTransport(audio({ maxPlays: 1 }), { mediaBudget: binding({ entry: { plays: 1 } }) });
    loadMetadata();

    // Volume affects no assessment property and is never restricted — a
    // learner whose OS volume is locked has no other lever once the native
    // bar is gone.
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument();

    // `aria-disabled`, never `disabled`: a natively disabled button leaves the
    // focus order, so a learner who tabs into nothing is told nothing.
    const play = screen.getByRole('button', { name: 'Play — No plays remaining' });
    expect(play).toHaveAttribute('aria-disabled', 'true');
    expect(play).not.toBeDisabled();
  });
});
