// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractiveActivityPlayer } from '../player/InteractiveActivityPlayer.js';
import { CineScramblePlayer } from '../templates/cine-scramble/player/CineScramblePlayer.js';
import {
  checkSlots,
  placeClip,
  shuffleClips,
  stitchCaptions,
  unplaceClip,
  wrapRows,
} from '../templates/cine-scramble/player/machine.js';
import { cineScrambleFixture } from './player-fixtures.js';

let play: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal('PointerEvent', MouseEvent);
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function slot(container: HTMLElement, index: number) {
  return container.querySelector(`[data-lkia-slot="${index}"]`) as HTMLElement;
}
function clipButton(id: number) {
  return document.querySelector(`[data-lkia-clip="${id}"] button[aria-describedby]`) as HTMLElement;
}
function start() {
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
}
function solve(count: number) {
  for (let id = 0; id < count; id++) fireEvent.keyDown(clipButton(id), { key: String(id + 1) });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
}
describe('Cine-Scramble pure arrangement', () => {
  it('shuffles without mutating and rotates a chronological shuffle', () => {
    const clips = cineScrambleFixture().scenes[0].clips;
    expect(shuffleClips(clips, () => 0.999).map((c) => c.id)).toEqual([1, 2, 3, 0]);
    expect(shuffleClips(clips, () => 0).map((c) => c.id)).not.toEqual([0, 1, 2, 3]);
    expect(clips.map((c) => c.id)).toEqual([0, 1, 2, 3]);
    expect(shuffleClips([])).toEqual([]);
    expect(shuffleClips([{ id: 0 }])).toEqual([{ id: 0 }]);
  });
  it('moves/replaces uniquely, returns clips, checks by id and wraps all counts', () => {
    expect(placeClip([0, 1, null], 0, 1)).toEqual([null, 0, null]);
    expect(placeClip([0], 1, -1)).toEqual([0]);
    expect(placeClip([0], 1, 2)).toEqual([0]);
    expect(unplaceClip([0, 1], 1)).toEqual([0, null]);
    expect(checkSlots([0, null, 1])).toEqual([true, false, false]);
    for (const count of [3, 4, 5, 6])
      expect(wrapRows(count)).toEqual(
        Array.from({ length: Math.ceil(count / 2) }, (_, i) => Math.min(2, count - i * 2)),
      );
    expect(wrapRows(0)).toEqual([]);
    expect(wrapRows(2, 0)).toEqual([1, 1]);
    const clips = cineScrambleFixture(3).scenes[0].clips;
    expect(stitchCaptions([clips[2], clips[0], clips[1]])).toBe('Step 1. Step 2. Step 3.');
  });
});
describe('Cine-Scramble React player', () => {
  it('shows start, top slots/hints, bottom muted pool and incorrect feedback until fixed', () => {
    const onEvent = vi.fn();
    const { container } = render(
      <InteractiveActivityPlayer activity={cineScrambleFixture()} onEvent={onEvent} />,
    );
    start();
    expect(container.querySelector('[data-stage="arranging"]')).not.toBeNull();
    expect(slot(container, 0).textContent).toContain('Step 1.');
    expect(container.querySelector('[data-lkia-pool]')?.querySelectorAll('video')).toHaveLength(4);
    for (const video of container.querySelectorAll('video')) {
      expect(video.muted).toBe(true);
      expect(video.loop).toBe(true);
      expect(video.playsInline).toBe(true);
    }
    fireEvent.keyDown(clipButton(1), { key: '1' });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(slot(container, 0).getAttribute('data-slot-result')).toBe('incorrect');
    expect(screen.getAllByText('Try again')).toHaveLength(4);
    fireEvent.keyDown(clipButton(0), { key: '1' });
    expect(slot(container, 0).getAttribute('data-slot-result')).toBeNull();
    fireEvent.keyDown(clipButton(1), { key: '2' });
    fireEvent.keyDown(clipButton(2), { key: '3' });
    fireEvent.keyDown(clipButton(3), { key: '4' });
    fireEvent.keyDown(container.querySelector('[data-lkia-root]') as Element, { key: 'c' });
    expect(container.querySelector('[data-stage="checked-correct"]')).not.toBeNull();
    expect(screen.getByText('Step 1. Step 2. Step 3. Step 4.')).toBeTruthy();
    expect(container.querySelectorAll('[data-lkia-row]')).toHaveLength(2);
    expect(container.querySelectorAll('figcaption')).toHaveLength(4);
    expect(onEvent.mock.calls.map((call) => call[0].type)).toEqual([
      'scramble.started',
      'scramble.checked',
      'scramble.checked',
      'scramble.completed',
    ]);
    expect(onEvent.mock.calls[1]?.[0].correct).toBe(false);
    expect(onEvent.mock.calls[2]?.[0].correct).toBe(true);
  });
  it.each([3, 5, 6])('reflows %s clips into two-column clip+caption rows', (count) => {
    const { container } = render(<CineScramblePlayer activity={cineScrambleFixture(count)} />);
    start();
    solve(count);
    expect(
      Array.from(
        container.querySelectorAll('[data-lkia-row]'),
        (row) => row.querySelectorAll('figure').length,
      ),
    ).toEqual(wrapRows(count));
  });
  it('supports keyboard removal, replacing occupied slots and rejects invalid keys', () => {
    const { container } = render(<CineScramblePlayer activity={cineScrambleFixture()} />);
    start();
    fireEvent.keyDown(clipButton(0), { key: 'x' });
    fireEvent.keyDown(clipButton(0), { key: '9' });
    expect(slot(container, 0).querySelector('video')).toBeNull();
    fireEvent.keyDown(clipButton(0), { key: '1' });
    fireEvent.keyDown(clipButton(1), { key: '1' });
    expect(slot(container, 0).querySelector('[data-lkia-clip="1"]')).not.toBeNull();
    fireEvent.keyDown(slot(container, 0), { key: 'Backspace' });
    expect(slot(container, 0).querySelector('video')).toBeNull();
    fireEvent.keyDown(clipButton(1), { key: '2' });
    fireEvent.keyDown(slot(container, 1), { key: 'Delete' });
    fireEvent.keyDown(clipButton(0), { key: '1' });
    fireEvent.click(within(slot(container, 0)).getByRole('button', { name: 'Return to pool' }));
    expect(container.querySelector('[data-lkia-pool]')?.querySelectorAll('video')).toHaveLength(4);
  });
  it('uses native pointer capture to move into slots and return to pool, with cancellation and outside guards', () => {
    const { container } = render(<CineScramblePlayer activity={cineScrambleFixture()} />);
    start();
    const hit = vi.mocked(document.elementFromPoint);
    let drag = container.querySelector('[data-lkia-clip="0"]') as HTMLElement;
    fireEvent.pointerMove(drag, { clientX: 1, clientY: 1 });
    fireEvent.pointerUp(drag);
    fireEvent.pointerDown(drag, { button: 2 });
    fireEvent.pointerUp(drag);
    expect(slot(container, 0).querySelector('video')).toBeNull();
    fireEvent.pointerDown(drag, { button: 0, pointerId: 1 });
    hit.mockReturnValue(slot(container, 0));
    fireEvent.pointerMove(drag, { clientX: 1, clientY: 1 });
    expect(slot(container, 0).getAttribute('data-drop-target')).toBe('true');
    fireEvent.pointerUp(drag, { clientX: 1, clientY: 1 });
    expect(slot(container, 0).querySelector('[data-lkia-clip="0"]')).not.toBeNull();
    drag = slot(container, 0).querySelector('[data-lkia-clip]') as HTMLElement;
    fireEvent.pointerDown(drag, { button: 0 });
    hit.mockReturnValue(container.querySelector('[data-lkia-pool]'));
    fireEvent.pointerMove(drag);
    fireEvent.pointerUp(drag);
    expect(slot(container, 0).querySelector('video')).toBeNull();
    drag = container.querySelector('[data-lkia-clip="0"]') as HTMLElement;
    fireEvent.pointerDown(drag, { button: 0 });
    fireEvent.pointerCancel(drag);
    fireEvent.pointerUp(drag);
    fireEvent.pointerDown(drag, { button: 0 });
    hit.mockReturnValue(null);
    fireEvent.pointerUp(drag);
    fireEvent.pointerDown(drag, { button: 0 });
    hit.mockReturnValue(document.body);
    fireEvent.pointerMove(drag);
    fireEvent.pointerUp(drag);
    fireEvent.pointerDown(drag, { button: 0 });
    hit.mockReturnValue(container.querySelector('h1'));
    fireEvent.pointerUp(drag);
    expect(slot(container, 0).querySelector('video')).toBeNull();
  });
  it('honors scene picker, poster, locale/copy, URL resolver and vocabulary focus/escape', async () => {
    const activity = cineScrambleFixture(3);
    activity.tagline = 'One fine morning';
    activity.poster = { assetKey: 'poster.png' };
    activity.vocab = [{ term: 'gate', definition: 'An entrance' }];
    activity.scenes.push({ ...activity.scenes[0], id: 'evening', title: 'Evening' });
    const onEvent = vi.fn();
    const { container } = render(
      <CineScramblePlayer
        activity={activity}
        onEvent={onEvent}
        resolveUrl={(asset) => `https://cdn.example/${asset.assetKey}?sig=1`}
        strings={{ startLabel: 'Begin' }}
      />,
    );
    expect(screen.getByText('One fine morning')).toBeTruthy();
    expect(container.querySelector('img')?.src).toContain('poster.png?sig=1');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    expect(screen.getByRole('heading', { name: 'Evening' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vocabulary' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Close');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement?.textContent).toBe('Close');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement?.textContent).toBe('Vocabulary');
    fireEvent.click(screen.getByRole('button', { name: 'Vocabulary' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    solve(3);
    fireEvent.click(screen.getByRole('button', { name: 'Scene' }));
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(onEvent).toHaveBeenCalledWith({ type: 'vocab.opened', activityId: activity.id });
  });
  it.each([false, true])(
    'omits empty or disabled vocabulary and single scene picker (%s)',
    (disabled) => {
      const activity = cineScrambleFixture();
      activity.locale = 'es';
      if (disabled) {
        activity.vocabEnabled = false;
        activity.vocab = [{ term: 'gate', definition: 'entrance' }];
      }
      const { container } = render(<CineScramblePlayer activity={activity} />);
      expect(screen.queryByRole('combobox')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Vocabulario' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Comenzar' }));
      expect(container.querySelector('[data-lkia-layout]')).toBeTruthy();
    },
  );
  it('shows media errors and autoplay retry per loop and cleans up pending playback', async () => {
    play.mockRejectedValueOnce(new Error('blocked'));
    const { container, unmount } = render(<CineScramblePlayer activity={cineScrambleFixture()} />);
    start();
    await screen.findByRole('button', { name: 'Play' });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Play' }), { button: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Play' })).toBeNull());
    fireEvent.error(container.querySelector('video') as Element);
    expect(screen.getByRole('alert')).toBeTruthy();
    unmount();
    play.mockRejectedValue(new Error('all blocked'));
    const next = render(<CineScramblePlayer activity={cineScrambleFixture(3)} />);
    start();
    await screen.findAllByRole('button', { name: 'Play' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Play' })[0] as HTMLElement);
    await screen.findByRole('alert');
    next.unmount();
    let reject: (error: Error) => void = () => {};
    play.mockImplementation(
      () =>
        new Promise((_resolve, rej) => {
          reject = rej;
        }),
    );
    const last = render(<CineScramblePlayer activity={cineScrambleFixture(3)} />);
    start();
    last.unmount();
    await act(async () => reject(new Error('late')));
  });
});

it('keeps correct-slot feedback alongside incorrect slots while arranging', () => {
  const { container } = render(<CineScramblePlayer activity={cineScrambleFixture(3)} />);
  start();
  fireEvent.keyDown(clipButton(0), { key: '1' });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(container.querySelector('[data-stage="arranging"]')).not.toBeNull();
  expect(slot(container, 0).getAttribute('data-slot-result')).toBe('correct');
  expect(within(slot(container, 0)).getByRole('status').textContent).toBe('Correct');
  expect(slot(container, 1).getAttribute('data-slot-result')).toBe('incorrect');
  expect(within(slot(container, 1)).getByRole('status').textContent).toBe('Try again');
});
