// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractiveActivityPlayer } from '../player/InteractiveActivityPlayer.js';
import { answerSegments } from '../templates/what-happens/player/answer-text.js';
import { listenToAnswer } from '../templates/what-happens/player/listen.js';
import {
  clampPlaybackTime,
  nextWhatHappensStage,
} from '../templates/what-happens/player/machine.js';
import { WhatHappensPlayer } from '../templates/what-happens/player/WhatHappensPlayer.js';
import { whatHappensFixture } from './player-fixtures.js';

let play: ReturnType<typeof vi.spyOn>;
const speak = vi.fn();
const cancel = vi.fn();
beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.stubGlobal('speechSynthesis', { speak, cancel });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      constructor(public text: string) {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  speak.mockClear();
  cancel.mockClear();
});
function video(container: HTMLElement) {
  return container.querySelector('video') as HTMLVideoElement;
}
function freeze(container: HTMLElement) {
  const element = video(container);
  element.currentTime = 4;
  fireEvent.timeUpdate(element);
}
function open() {
  fireEvent.click(screen.getByRole('button', { name: /^The garden/ }));
}
function tell(container: HTMLElement) {
  open();
  freeze(container);
  fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
  fireEvent.ended(video(container));
}
describe('What Happens machine and answer text', () => {
  it('accepts only legal transitions and clamps locked playback', () => {
    let stage = nextWhatHappensStage('board', 'open');
    expect(stage).toBe('watch');
    stage = nextWhatHappensStage(stage, 'freeze');
    expect(stage).toBe('guess');
    expect(nextWhatHappensStage(stage, 'replay')).toBe('watch');
    stage = nextWhatHappensStage(stage, 'reveal');
    expect(stage).toBe('reveal');
    stage = nextWhatHappensStage(stage, 'ended');
    expect(stage).toBe('tell');
    stage = nextWhatHappensStage(stage, 'answer');
    expect(stage).toBe('answer');
    expect(nextWhatHappensStage(stage, 'next')).toBe('board');
    expect(nextWhatHappensStage('board', 'reveal')).toBe('board');
    expect(clampPlaybackTime(8, 3, false)).toBe(3);
    expect(clampPlaybackTime(8, 3, true)).toBe(8);
    expect(clampPlaybackTime(-1, 3, false)).toBe(0);
  });
  it('marks only verbatim first-wins supports in answer order', () => {
    expect(answerSegments('one two three', ['three', 'one', 'one two', 'missing'])).toEqual([
      { text: 'one', underline: true, start: 0 },
      { text: ' two ', underline: false, start: 3 },
      { text: 'three', underline: true, start: 8 },
    ]);
    expect(answerSegments('', [])).toEqual([]);
  });
});
describe('What Happens React player', () => {
  it('runs board → watch → freeze → reveal → tell → answer → speech listen → board, emits ungraded events once', async () => {
    const onEvent = vi.fn();
    const activity = whatHappensFixture();
    const { container } = render(
      <InteractiveActivityPlayer
        activity={activity}
        onEvent={onEvent}
        viewport={{ width: 1920, height: 1080 }}
      />,
    );
    open();
    expect(video(container).getAttribute('src')).toBe('media/garden.mp4');
    video(container).currentTime = 1;
    fireEvent.timeUpdate(video(container));
    expect(container.querySelector('[data-stage="watch"]')).not.toBeNull();
    freeze(container);
    expect(video(container).currentTime).toBe(3);
    expect(screen.getByText('What happens next?')).toBeTruthy();
    video(container).currentTime = 8;
    fireEvent.seeking(video(container));
    expect(video(container).currentTime).toBe(3);
    fireEvent.play(video(container));
    fireEvent.click(screen.getByRole('button', { name: 'Replay to freeze' }));
    expect(video(container).currentTime).toBe(0);
    freeze(container);
    fireEvent.keyDown(container.querySelector('[data-lkia-root]') as Element, { key: 'r' });
    expect(video(container).currentTime).toBe(3);
    video(container).currentTime = 8;
    fireEvent.seeking(video(container));
    expect(video(container).currentTime).toBe(8);
    fireEvent.ended(video(container));
    expect(screen.getByText('To help you')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    fireEvent.keyDown(container.querySelector('[data-lkia-root]') as Element, { key: 'a' });
    expect(screen.queryByRole('list')).toBeNull();
    expect(container.querySelectorAll('mark')).toHaveLength(1);
    expect(container.querySelector('mark')?.textContent).toBe('opens the gate');
    fireEvent.keyDown(container.querySelector('[data-lkia-root]') as Element, { key: 'l' });
    await waitFor(() => expect(speak).toHaveBeenCalled());
    fireEvent.keyDown(container.querySelector('[data-lkia-root]') as Element, { key: 'n' });
    expect(container.querySelector('[data-stage="board"]')).not.toBeNull();
    expect(onEvent.mock.calls.map((call) => call[0].type)).toEqual([
      'clip.opened',
      'clip.frozen',
      'clip.frozen',
      'clip.revealed',
      'answer.shown',
      'audio.played',
      'clip.completed',
      'board.completed',
    ]);
    expect(onEvent).toHaveBeenCalledWith({
      type: 'audio.played',
      activityId: 'prediction',
      clipId: 'garden',
      via: 'speechSynthesis',
    });
    tell(container);
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onEvent.mock.calls.filter((call) => call[0].type === 'board.completed')).toHaveLength(1);
  });
  it('honors copy, clip prompts/labels, posters, thumbnails, URL resolver and supplied audio', async () => {
    const activity = whatHappensFixture();
    const clip = activity.clips[0];
    clip.thumb = { assetKey: 'thumb.png' };
    clip.poster = { assetKey: 'poster.png' };
    clip.predictPrompt = 'Your prediction';
    clip.tellPrompt = 'Describe it';
    clip.supportsLabel = 'Hints';
    clip.audio = { assetKey: 'voice.mp3', textHash: 'hash' };
    activity.copy = { answerLabel: 'Example' };
    const onEvent = vi.fn();
    const resolveUrl = vi.fn((asset) => `https://cdn.example/${asset.assetKey}?sig=abc`);
    const { container } = render(
      <WhatHappensPlayer
        activity={activity}
        resolveUrl={resolveUrl}
        onEvent={onEvent}
        strings={{ showAnswer: 'Example please' }}
      />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toContain('thumb.png?sig=abc');
    open();
    freeze(container);
    expect(screen.getByText('Your prediction')).toBeTruthy();
    expect(container.querySelector('[data-lkia-backdrop]')?.getAttribute('style')).toContain(
      'poster.png',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    fireEvent.ended(video(container));
    expect(screen.getByText('Describe it')).toBeTruthy();
    expect(screen.getByText('Hints')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Example please' }));
    expect(screen.getByText('Example')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
    await waitFor(() =>
      expect(onEvent).toHaveBeenCalledWith({
        type: 'audio.played',
        activityId: activity.id,
        clipId: clip.id,
        via: 'audio',
      }),
    );
    expect(container.querySelector('audio')?.src).toContain('voice.mp3?sig=abc');
    expect(speak).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'hides absent or disabled supports (%s), with Spanish chrome',
    (disabled) => {
      const activity = whatHappensFixture();
      if (disabled) activity.supportsEnabled = false;
      else delete activity.clips[0].supports;
      const { container } = render(<WhatHappensPlayer activity={activity} locale="es-419" />);
      open();
      freeze(container);
      fireEvent.click(screen.getByRole('button', { name: 'Revelar' }));
      fireEvent.ended(video(container));
      expect(screen.queryByRole('list')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Mostrar respuesta' }));
      expect(container.querySelector('[data-stage="answer"]')).not.toBeNull();
    },
  );
  it('offers blocked autoplay retry and media error, restores auto-hiding controls', async () => {
    play.mockRejectedValueOnce(new Error('blocked'));
    const { container } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    open();
    await screen.findByRole('button', { name: 'Play' });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Play' })).toBeNull());
    play.mockRejectedValueOnce(new Error('blocked again'));
    freeze(container);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    await screen.findByRole('button', { name: 'Play' });
    play.mockRejectedValueOnce(new Error('still blocked'));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await screen.findByRole('button', { name: 'Play' });
    fireEvent.error(video(container));
    expect(screen.getByRole('alert').textContent).toBe('This clip could not be played.');
    vi.useFakeTimers();
    fireEvent.pointerMove(container.querySelector('[data-lkia-watch]') as Element);
    act(() => vi.advanceTimersByTime(2501));
    expect(video(container).controls).toBe(false);
    fireEvent.focus(video(container));
    expect(video(container).controls).toBe(true);
  });
  it('ignores native Enter on focused buttons; shortcuts on the shell work with Enter', () => {
    const { container } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    open();
    fireEvent.ended(video(container));
    expect(container.querySelector('[data-stage="watch"]')).not.toBeNull();
    freeze(container);
    const root = container.querySelector('[data-lkia-root]') as Element;
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reveal' }), { key: 'Enter' });
    expect(container.querySelector('[data-stage="guess"]')).not.toBeNull();
    const input = document.createElement('input');
    root.append(input);
    fireEvent.keyDown(input, { key: 'r' });
    expect(container.querySelector('[data-stage="guess"]')).not.toBeNull();
    input.remove();
    fireEvent.keyDown(root, { key: 'Enter' });
    fireEvent.ended(video(container));
    fireEvent.keyDown(root, { key: 'Enter' });
    fireEvent.keyDown(root, { key: 'Enter' });
    expect(container.querySelector('[data-stage="board"]')).not.toBeNull();
  });
  it('handles unavailable speech and cleans up delayed rejection on unmount', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    Reflect.deleteProperty(window, 'speechSynthesis');
    const { container, unmount } = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    tell(container);
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
    await screen.findByRole('alert');
    unmount();
    let reject: (error: Error) => void = () => {};
    play.mockImplementation(
      () =>
        new Promise((_resolve, rej) => {
          reject = rej;
        }),
    );
    const rendered = render(<WhatHappensPlayer activity={whatHappensFixture()} />);
    open();
    rendered.unmount();
    await act(async () => reject(new Error('late rejection')));
  });
});
describe('listen audio fallback', () => {
  it('falls back to speech when supplied audio fails', async () => {
    const clip = whatHappensFixture().clips[0];
    clip.audio = { assetKey: 'audio.mp3', textHash: 'hash' };
    play.mockRejectedValueOnce(new Error('not available'));
    expect(await listenToAnswer(clip, document.createElement('audio'))).toBe('speechSynthesis');
    expect(speak.mock.calls[0]?.[0].text).toBe(clip.answer.text);
  });
});

describe('player focus, multi-clip progress and pending listen cancellation', () => {
  it('keeps shortcuts focused after stage changes and completes the board only after all clips', () => {
    const activity = whatHappensFixture();
    activity.clips.push({ ...activity.clips[0], id: 'second', title: 'The second garden' });
    const onEvent = vi.fn();
    const { container } = render(<WhatHappensPlayer activity={activity} onEvent={onEvent} />);
    tell(container);
    expect(document.activeElement).toBe(container.querySelector('[data-lkia-root]'));
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onEvent.mock.calls.some((call) => call[0].type === 'board.completed')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /^The second garden/ }));
    freeze(container);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    fireEvent.ended(video(container));
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onEvent.mock.calls.filter((call) => call[0].type === 'board.completed')).toHaveLength(1);
  });
  it('never starts speech or emits a stale audio event when Next cancels pending media playback', async () => {
    const activity = whatHappensFixture();
    activity.clips[0].audio = { assetKey: 'voice.mp3', textHash: 'hash' };
    const onEvent = vi.fn();
    const { container } = render(<WhatHappensPlayer activity={activity} onEvent={onEvent} />);
    tell(container);
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    let reject: (error: Error) => void = () => {};
    play.mockImplementationOnce(
      () =>
        new Promise((_resolve, rej) => {
          reject = rej;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await act(async () => reject(new Error('interrupted')));
    expect(speak).not.toHaveBeenCalled();
    expect(onEvent.mock.calls.some((call) => call[0].type === 'audio.played')).toBe(false);
  });
  it('stops an audio play promise which resolves after cancellation', async () => {
    const clip = whatHappensFixture().clips[0];
    clip.audio = { assetKey: 'voice.mp3', textHash: 'hash' };
    expect(
      await listenToAnswer(clip, document.createElement('audio'), undefined, () => false),
    ).toBeNull();
  });
});
