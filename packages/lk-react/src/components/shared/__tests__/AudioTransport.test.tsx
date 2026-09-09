import type { ActivityMedia as ActivityMediaData } from '@intellectif/lk-core';
import { resolvePlaybackPolicy } from '@intellectif/lk-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LkIntlProvider } from '../../../i18n/LkIntlProvider.js';
import { stubMediaElement } from '../../../test-support/media.js';
import type { MediaBudgetBinding } from '../../types.js';
import { AudioTransport } from '../AudioTransport.js';

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
    // maxPlays 3, not 2: with two plays left after the first, the resume press
    // clears the last-play confirmation gate. At `remaining === 1` the gate
    // swallows the press and charges nothing either way, so the assertion
    // below would hold even if resume detection were broken.
    renderTransport(audio({ maxPlays: 3 }), { mediaBudget: binding({ onPlayConsumed }) });
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
    // Playback actually resumed — it was not a press the gate absorbed.
    expect(element().paused).toBe(false);
    expect(screen.queryByText('This is your last play. Start it now?')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 of 3 plays remaining');
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
    // maxPlays 3 so two remain: the press clears the last-play gate, which
    // would otherwise absorb it and make this pass without resuming anything.
    renderTransport(audio({ maxPlays: 3 }), {
      mediaBudget: binding({ entry: { plays: 1, at: 42 }, onPlayConsumed }),
    });
    loadMetadata();

    expect(element().currentTime).toBe(42);
    await user.click(screen.getByRole('button', { name: 'Play' }));

    // Continuing the play they already paid for is free — and it really did
    // continue, rather than being swallowed by a confirmation.
    expect(onPlayConsumed).not.toHaveBeenCalled();
    expect(element().paused).toBe(false);
    expect(screen.queryByText('This is your last play. Start it now?')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 of 3 plays remaining');
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

  /**
   * The precedence promised in four places — `docs/i18n.md`, `docs/upgrading.md`,
   * the `types.ts` docblock and the changeset — was implemented as a spread
   * order and asserted nowhere: no test rendered a provider together with the
   * two narrower props, so swapping the spreads would not have failed CI. The
   * order is a back-compat guarantee to anyone who wired `mediaStrings` in
   * 7.0.0, which makes it exactly the kind of promise that needs a test.
   */
  it('mediaBudget.strings beats mediaStrings beats the provider, key by key', () => {
    const media = audio({ maxPlays: 3 });
    const withProvider = (over: Partial<React.ComponentProps<typeof AudioTransport>>) =>
      render(
        <LkIntlProvider
          locale="es"
          strings={{ media: { play: 'PROVIDER_PLAY', mute: 'PROVIDER_MUTE' } }}
        >
          <AudioTransport
            media={media}
            policy={resolvePlaybackPolicy(media)}
            renderMode="exam"
            {...over}
          />
        </LkIntlProvider>,
      );

    // All three levels present: the narrowest wins.
    withProvider({
      mediaStrings: { play: 'PROP_PLAY' },
      mediaBudget: binding({ strings: { play: 'BUDGET_PLAY' } }),
    });
    expect(screen.getByRole('button', { name: 'BUDGET_PLAY' })).toBeInTheDocument();
    // And a key none of the narrower levels mention still comes from the
    // provider — the layers merge key by key rather than replacing wholesale.
    expect(screen.getByRole('button', { name: 'PROVIDER_MUTE' })).toBeInTheDocument();
    cleanup();

    // Drop the budget strings: the 7.0.0 prop takes over.
    withProvider({ mediaStrings: { play: 'PROP_PLAY' }, mediaBudget: binding() });
    expect(screen.getByRole('button', { name: 'PROP_PLAY' })).toBeInTheDocument();
    cleanup();

    // Drop both: the provider is what is left.
    withProvider({ mediaBudget: binding() });
    expect(screen.getByRole('button', { name: 'PROVIDER_PLAY' })).toBeInTheDocument();
  });
});

/**
 * The last-play confirmation gate.
 *
 * When one play remains, the first press opens a confirmation instead of
 * spending it — an accidental tap on a listening paper should not cost a
 * learner their final listen. The whole path had no coverage anywhere in the
 * repo: `lastPlayConfirm` and `setConfirming` appeared only in source.
 *
 * That gap also silently weakened two neighbouring tests, which used
 * `maxPlays: 2` with one play spent. At `remaining === 1` the press they made
 * was swallowed by this gate, so their assertions held whether playback
 * resumed or a dialog opened; both now use budgets that clear it.
 */
describe('AudioTransport last-play confirmation', () => {
  beforeEach(() => {
    stubMediaElement();
  });

  it('asks before spending the final play instead of spending it', async () => {
    const user = userEvent.setup();
    const onPlayConsumed = vi.fn();
    renderTransport(audio({ maxPlays: 2 }), {
      mediaBudget: binding({ entry: { plays: 1 }, onPlayConsumed }),
    });
    loadMetadata();

    await user.click(screen.getByRole('button', { name: 'Play' }));

    expect(screen.getByText('This is your last play. Start it now?')).toBeInTheDocument();
    expect(onPlayConsumed).not.toHaveBeenCalled();
    expect(element().paused).toBe(true);
  });

  it('charges nothing when the learner backs out', async () => {
    const user = userEvent.setup();
    const onPlayConsumed = vi.fn();
    renderTransport(audio({ maxPlays: 2 }), {
      mediaBudget: binding({ entry: { plays: 1 }, onPlayConsumed }),
    });
    loadMetadata();

    await user.click(screen.getByRole('button', { name: 'Play' }));
    await user.click(screen.getByRole('button', { name: 'Not yet' }));

    expect(onPlayConsumed).not.toHaveBeenCalled();
    expect(element().paused).toBe(true);
    expect(document.querySelector('.lk-media-plays')).toHaveTextContent('1 of 2 plays remaining');
  });

  it('spends exactly one play when the learner confirms', async () => {
    const user = userEvent.setup();
    const onPlayConsumed = vi.fn();
    renderTransport(audio({ maxPlays: 2 }), {
      mediaBudget: binding({ entry: { plays: 1 }, onPlayConsumed }),
    });
    loadMetadata();

    await user.click(screen.getByRole('button', { name: 'Play' }));
    await user.click(screen.getByRole('button', { name: 'Start last play' }));

    expect(onPlayConsumed).toHaveBeenCalledTimes(1);
    expect(element().paused).toBe(false);
    expect(document.querySelector('.lk-media-plays')).toHaveTextContent('No plays remaining');
  });

  it('does not gate a press while more than one play remains', async () => {
    const user = userEvent.setup();
    const onPlayConsumed = vi.fn();
    renderTransport(audio({ maxPlays: 3 }), { mediaBudget: binding({ onPlayConsumed }) });
    loadMetadata();

    await user.click(screen.getByRole('button', { name: 'Play' }));

    expect(screen.queryByText('This is your last play. Start it now?')).not.toBeInTheDocument();
    expect(onPlayConsumed).toHaveBeenCalledTimes(1);
    expect(element().paused).toBe(false);
  });
});
