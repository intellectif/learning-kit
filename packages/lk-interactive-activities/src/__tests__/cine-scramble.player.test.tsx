// @vitest-environment jsdom
import { evaluate, score } from '@intellectif/lk-core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractiveActivityPlayer } from '../player/InteractiveActivityPlayer.js';
import { registerInteractiveActivities } from '../registry/templates.js';
import { CineScramblePlayer } from '../templates/cine-scramble/player/CineScramblePlayer.js';
import {
  checkSlots,
  chronological,
  placeClip,
  shuffleClips,
  startOrder,
  stitchCaptions,
  unplaceClip,
  wrapRows,
} from '../templates/cine-scramble/player/machine.js';
import type { CineScrambleData } from '../templates/cine-scramble/schema.js';
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

/** The "Clip N" number the pool shows for a chronological clip id. */
function numberOf(activity: CineScrambleData, id: number, sceneIndex = 0, attempt = 0): number {
  const scene = activity.scenes[sceneIndex];
  if (!scene) throw new Error('No scene');
  return (
    startOrder(scene.clips, `${activity.id}/${scene.id}`, attempt).findIndex(
      (clip) => clip.id === id,
    ) + 1
  );
}
function slot(container: HTMLElement, index: number) {
  return container.querySelector(`[data-lkia-slot="${index}"]`) as HTMLElement;
}
function card(activity: CineScrambleData, id: number, sceneIndex = 0) {
  return document.querySelector(
    `[data-lkia-clip="${numberOf(activity, id, sceneIndex)}"]`,
  ) as HTMLElement;
}
function clipButton(activity: CineScrambleData, id: number, sceneIndex = 0) {
  return card(activity, id, sceneIndex).querySelector('[data-lkia-clip-button]') as HTMLElement;
}
/** The text of the player's one status region, once it has been read out. */
async function status(text: string) {
  await waitFor(() => expect(document.querySelector('[data-lkia-status]')?.textContent).toBe(text));
}
function start(name = 'Start') {
  fireEvent.click(screen.getByRole('button', { name }));
}
function solve(activity: CineScrambleData, sceneIndex = 0) {
  const count = activity.scenes[sceneIndex]?.clips.length ?? 0;
  for (let id = 0; id < count; id++)
    fireEvent.keyDown(clipButton(activity, id, sceneIndex), { key: String(id + 1) });
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
  it('starts every scene in one stable order that gives nothing away', () => {
    for (const count of [3, 4, 5, 6]) {
      const clips = cineScrambleFixture(count).scenes[0].clips;
      for (const attempt of [0, 1, 2]) {
        const order = startOrder([...clips].reverse(), 'sequence/morning', attempt).map(
          (c) => c.id,
        );
        expect(order).toEqual(startOrder(clips, 'sequence/morning', attempt).map((c) => c.id));
        expect([...order].sort()).toEqual(clips.map((c) => c.id));
        expect(order[0]).not.toBe(0);
        order.forEach((id, index) => {
          if (index > 0) expect(id).not.toBe((order[index - 1] as number) + 1);
        });
      }
    }
    expect(chronological([{ id: 2 }, { id: 0 }, { id: 1 }]).map((c) => c.id)).toEqual([0, 1, 2]);
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
  it('lk-core never grades the order, whatever it is', () => {
    registerInteractiveActivities();
    const activity = cineScrambleFixture();
    activity.scenes[0].clips = [2, 0, 1, 3].map((id) => activity.scenes[0].clips[id]);
    for (const order of [[0, 1, 2, 3], [2, 0, 1, 3], [0, 1, 2, 3, 9], '0123']) {
      expect(evaluate(activity as never, { sceneId: 'morning', order } as never)).toMatchObject({
        status: 'deferred',
      });
    }
    expect(() =>
      score(
        'cine-scramble' as never,
        activity as never,
        { sceneId: 'morning', order: [] } as never,
      ),
    ).toThrow(/no synchronous score/);
  });
});

describe('Cine-Scramble React player', () => {
  it('shows start, slots with hints, a muted pool, and per-slot feedback until fixed', async () => {
    const onEvent = vi.fn();
    const activity = cineScrambleFixture();
    const { container } = render(
      <InteractiveActivityPlayer activity={activity} onEvent={onEvent} />,
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
    // The page never carries the answer: clips are numbered in their start order.
    const numbers = Array.from(
      container.querySelectorAll('[data-lkia-pool] [data-lkia-clip]'),
      (el) => el.getAttribute('data-lkia-clip'),
    );
    expect(numbers).toEqual(['1', '2', '3', '4']);
    // Check before every clip is placed: nothing is graded, the learner is told why.
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await status('Place every clip before checking.');
    expect(onEvent.mock.calls.map((call) => call[0].type)).toEqual(['scramble.started']);
    fireEvent.keyDown(clipButton(activity, 1), { key: '1' });
    fireEvent.keyDown(clipButton(activity, 0), { key: '2' });
    fireEvent.keyDown(clipButton(activity, 2), { key: '3' });
    fireEvent.keyDown(clipButton(activity, 3), { key: '4' });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(slot(container, 0).getAttribute('data-slot-result')).toBe('incorrect');
    expect(slot(container, 2).getAttribute('data-slot-result')).toBe('correct');
    expect(screen.getAllByText('Not here')).toHaveLength(2);
    expect(screen.getAllByText('Right place')).toHaveLength(2);
    await status('2 of 4 in the right place. Move the others and check again.');
    fireEvent.keyDown(clipButton(activity, 0), { key: '1' });
    expect(slot(container, 0).getAttribute('data-slot-result')).toBeNull();
    fireEvent.keyDown(clipButton(activity, 1), { key: '2' });
    fireEvent.keyDown(container.querySelector('[data-lkia-root]') as Element, {
      key: 'c',
      ctrlKey: true,
    });
    expect(container.querySelector('[data-stage="arranging"]')).not.toBeNull();
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
      // One scene: completing it completes the activity.
      'activity.completed',
    ]);
    expect(onEvent.mock.calls[1]?.[0].correct).toBe(false);
    expect(onEvent.mock.calls[2]?.[0].correct).toBe(true);
    // Play again starts a new attempt in a new order.
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(container.querySelector('[data-stage="arranging"]')).not.toBeNull();
    expect(onEvent.mock.calls.at(-1)?.[0].type).toBe('scramble.started');
  });
  it.each([3, 5, 6])('reflows %s clips into rows of clip and caption', (count) => {
    const activity = cineScrambleFixture(count);
    const { container } = render(<CineScramblePlayer activity={activity} />);
    start();
    solve(activity);
    expect(
      Array.from(
        container.querySelectorAll('[data-lkia-row]'),
        (row) => row.querySelectorAll('figure').length,
      ),
    ).toEqual(wrapRows(count, count > 4 ? 3 : 2));
  });
  it('keeps keyboard focus moving: placing focuses the next clip, then Check', () => {
    const activity = cineScrambleFixture(3);
    const { container } = render(<CineScramblePlayer activity={activity} />);
    start();
    const pool = () =>
      Array.from(container.querySelectorAll('[data-lkia-pool] [data-lkia-clip-button]'));
    const first = pool()[0] as HTMLElement;
    first.focus();
    fireEvent.keyDown(first, { key: '2' });
    expect(document.activeElement).toBe(pool()[0]);
    fireEvent.keyDown(document.activeElement as Element, { key: '1' });
    fireEvent.keyDown(document.activeElement as Element, { key: '3' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Check' }));
    // Delete on a placed clip returns it and focuses it in the pool.
    const placed = slot(container, 0).querySelector('[data-lkia-clip-button]') as HTMLElement;
    const number = placed.closest('[data-lkia-clip]')?.getAttribute('data-lkia-clip');
    fireEvent.keyDown(placed, { key: 'Delete' });
    expect(
      document.activeElement?.closest('[data-lkia-clip]')?.getAttribute('data-lkia-clip'),
    ).toBe(number);
    expect(document.activeElement?.closest('[data-lkia-pool]')).not.toBeNull();
  });
  it('places by selecting a clip and then a slot, and replaces an occupied slot', async () => {
    const activity = cineScrambleFixture();
    const { container } = render(<CineScramblePlayer activity={activity} />);
    start();
    fireEvent.click(clipButton(activity, 0));
    expect(clipButton(activity, 0).getAttribute('aria-pressed')).toBe('true');
    await status(`Clip ${numberOf(activity, 0)} selected. Choose a slot.`);
    fireEvent.click(within(slot(container, 0)).getByRole('button', { name: /Slot 1/ }));
    expect(slot(container, 0).querySelector('[data-lkia-clip]')).not.toBeNull();
    // A drop zone with nothing selected does nothing.
    fireEvent.click(within(slot(container, 1)).getByRole('button', { name: /Slot 2/ }));
    expect(slot(container, 1).querySelector('[data-lkia-clip]')).toBeNull();
    // Select another clip, then tap the occupied slot's clip: the new one takes its place.
    fireEvent.click(clipButton(activity, 1));
    fireEvent.click(slot(container, 0).querySelector('[data-lkia-clip-button]') as HTMLElement);
    expect(
      slot(container, 0).querySelector('[data-lkia-clip]')?.getAttribute('data-lkia-clip'),
    ).toBe(String(numberOf(activity, 1)));
    // Selecting the same clip twice deselects it; Escape also clears a selection.
    fireEvent.click(clipButton(activity, 2));
    fireEvent.click(clipButton(activity, 2));
    expect(clipButton(activity, 2).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(clipButton(activity, 2));
    fireEvent.keyDown(container.querySelector('[data-lkia-root]') as Element, { key: 'Escape' });
    expect(clipButton(activity, 2).getAttribute('aria-pressed')).toBe('false');
    // Keys that are not slot numbers, or are past the last slot, place nothing.
    fireEvent.keyDown(clipButton(activity, 3), { key: 'x' });
    fireEvent.keyDown(clipButton(activity, 3), { key: '9' });
    fireEvent.keyDown(clipButton(activity, 3), { key: '1', metaKey: true });
    expect(card(activity, 3).closest('[data-lkia-pool]')).not.toBeNull();
    fireEvent.click(
      within(slot(container, 0)).getByRole('button', { name: /Take out of the slot/ }),
    );
    expect(container.querySelector('[data-lkia-pool]')?.querySelectorAll('video')).toHaveLength(4);
  });
  it('drags with native pointer events into slots and back to the pool, with guards', () => {
    const activity = cineScrambleFixture();
    const { container } = render(<CineScramblePlayer activity={activity} />);
    start();
    const hit = vi.mocked(document.elementFromPoint);
    let drag = card(activity, 0);
    // A move or release with no press, and a right-button press, do nothing.
    fireEvent.pointerMove(drag, { clientX: 1, clientY: 1 });
    fireEvent.pointerUp(drag);
    fireEvent.pointerDown(drag, { button: 2 });
    fireEvent.pointerUp(drag);
    // A press without movement is a tap (select), not a drop.
    fireEvent.pointerDown(drag, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(drag, { pointerId: 1, clientX: 2, clientY: 2 });
    expect(slot(container, 0).querySelector('[data-lkia-clip]')).toBeNull();
    // A real drag follows the pointer and lights the slot beneath it.
    fireEvent.pointerDown(drag, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    hit.mockReturnValue(slot(container, 0));
    fireEvent.pointerMove(drag, { pointerId: 1, clientX: 40, clientY: 30 });
    expect(drag.getAttribute('data-dragging')).toBe('true');
    expect(drag.style.getPropertyValue('--lkia-drag-x')).toBe('40px');
    expect(drag.style.getPropertyValue('--lkia-drag-y')).toBe('30px');
    // It leans into a move to the right, the board enters drag mode, and its pool cell shows the hole.
    expect(Number.parseFloat(drag.style.getPropertyValue('--lkia-drag-tilt'))).toBeGreaterThan(0);
    expect(container.querySelector('[data-lkia-arrange]')?.getAttribute('data-drag-active')).toBe(
      'true',
    );
    expect(drag.parentElement?.hasAttribute('data-lkia-cell')).toBe(true);
    expect(slot(container, 0).getAttribute('data-drop-target')).toBe('true');
    fireEvent.pointerUp(drag, { pointerId: 1, clientX: 40, clientY: 30 });
    expect(
      slot(container, 0).querySelector(`[data-lkia-clip="${numberOf(activity, 0)}"]`),
    ).not.toBeNull();
    // The click that follows a drag does not also select the clip.
    fireEvent.click(slot(container, 0).querySelector('[data-lkia-clip-button]') as HTMLElement);
    expect(
      slot(container, 0).querySelector('[data-lkia-clip-button]')?.getAttribute('aria-pressed'),
    ).toBe('false');
    drag = slot(container, 0).querySelector('[data-lkia-clip]') as HTMLElement;
    fireEvent.pointerDown(drag, { button: 0, pointerId: 2, clientX: 0, clientY: 0 });
    hit.mockReturnValue(container.querySelector('[data-lkia-pool]'));
    fireEvent.pointerMove(drag, { pointerId: 2, clientX: 0, clientY: 50 });
    expect(container.querySelector('[data-lkia-pool]')?.getAttribute('data-drop-target')).toBe(
      'true',
    );
    fireEvent.pointerUp(drag, { pointerId: 2, clientX: 0, clientY: 50 });
    expect(slot(container, 0).querySelector('[data-lkia-clip]')).toBeNull();
    // Cancelled, dropped on nothing, outside the player, or on a non-target: the clip stays.
    drag = card(activity, 0);
    fireEvent.pointerDown(drag, { button: 0, pointerId: 3, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(drag, { pointerId: 3, clientX: 20, clientY: 20 });
    fireEvent.pointerCancel(drag, { pointerId: 3 });
    fireEvent.pointerUp(drag, { pointerId: 3 });
    for (const target of [null, document.body, container.querySelector('[data-lkia-help]')]) {
      hit.mockReturnValue(target as Element | null);
      fireEvent.pointerDown(drag, { button: 0, pointerId: 4, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(drag, { pointerId: 4, clientX: 20, clientY: 20 });
      fireEvent.pointerUp(drag, { pointerId: 4, clientX: 20, clientY: 20 });
    }
    // Another pointer's events are ignored mid-drag.
    fireEvent.pointerDown(drag, { button: 0, pointerId: 5, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(drag, { pointerId: 6, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(drag, { pointerId: 6, clientX: 20, clientY: 20 });
    expect(slot(container, 0).querySelector('[data-lkia-clip]')).toBeNull();
    expect(container.querySelector('[data-lkia-pool]')?.querySelectorAll('video')).toHaveLength(4);
  });
  it('lists scenes, shows the poster, honors copy, URLs and vocabulary focus/escape', () => {
    const activity = cineScrambleFixture(3);
    activity.tagline = 'One fine morning';
    activity.poster = { assetKey: 'poster.png' };
    activity.vocab = [{ term: 'gate', definition: 'An entrance' }];
    activity.copy = { replayLabel: 'Once more' };
    activity.scenes.push({ ...activity.scenes[0], id: 'evening', title: 'Evening' });
    const onEvent = vi.fn();
    const { container } = render(
      <CineScramblePlayer
        activity={activity}
        onEvent={onEvent}
        resolveUrl={(asset) => `https://cdn.example/${asset.assetKey}?sig=1`}
        strings={{ replayLabel: 'Host replay', nextSceneLabel: 'Onwards' }}
      />,
    );
    expect(screen.getByText('One fine morning')).toBeTruthy();
    expect(container.querySelector('img')?.src).toContain('poster.png?sig=1');
    fireEvent.click(screen.getByRole('button', { name: /Evening/ }));
    expect(screen.getByText('Evening')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vocabulary' }));
    expect(screen.getByRole('dialog', { name: 'Vocabulary' })).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Close');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement?.textContent).toBe('Close');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'c' });
    expect(container.querySelector('[data-stage="arranging"]')).not.toBeNull();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement?.textContent?.trim()).toBe('Vocabulary');
    fireEvent.click(screen.getByRole('button', { name: 'Vocabulary' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    solve(activity, 1);
    // The editor's copy beats the host's strings; host strings fill the rest. The last
    // scene done, the next one offered is the first still unfinished.
    expect(screen.getByRole('button', { name: /Once more/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Onwards' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /All scenes/ })[0] as HTMLElement);
    expect(screen.getByRole('button', { name: /Evening/ }).getAttribute('data-completed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: /Morning/ }));
    solve(activity, 0);
    expect(screen.queryByRole('button', { name: 'Onwards' })).toBeNull();
    expect(onEvent).toHaveBeenCalledWith({ type: 'vocab.opened', activityId: activity.id });
  });
  it('offers the next unfinished scene after a correct check', () => {
    const activity = cineScrambleFixture(3);
    activity.scenes.push({ ...activity.scenes[0], id: 'evening', title: 'Evening' });
    render(<CineScramblePlayer activity={activity} />);
    fireEvent.click(screen.getByRole('button', { name: /Morning/ }));
    solve(activity, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Next scene' }));
    expect(screen.getByText('Evening')).toBeTruthy();
  });
  it.each([false, true])(
    'omits empty or disabled vocabulary and the scene list for one scene (%s), with Spanish chrome',
    (disabled) => {
      const activity = cineScrambleFixture();
      if (disabled) {
        activity.vocabEnabled = false;
        activity.vocab = [{ term: 'gate', definition: 'entrance' }];
      }
      const { container } = render(<CineScramblePlayer activity={activity} locale="es-CO" />);
      expect(container.querySelector('[data-lkia-scenes]')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Vocabulario' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Comenzar' }));
      expect(container.querySelector('[data-lkia-root]')?.getAttribute('lang')).toBe('es-CO');
    },
  );
  it('pauses every loop behind one control when autoplay is blocked, and announces a failed clip once', async () => {
    play.mockRejectedValueOnce(new Error('blocked'));
    const { container, unmount } = render(<CineScramblePlayer activity={cineScrambleFixture()} />);
    start();
    const toggle = await screen.findByRole('button', { name: /Play clips/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /Pause clips/ }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    for (const video of container.querySelectorAll('video')) fireEvent.error(video);
    await status('This clip could not be played.');
    expect(container.querySelectorAll('[data-lkia-loop] [data-lkia-error]')).toHaveLength(4);
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    unmount();
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
  it('starts paused under reduced motion', () => {
    const { container } = render(
      <CineScramblePlayer activity={cineScrambleFixture()} reducedMotion />,
    );
    start();
    expect(screen.getByRole('button', { name: /Play clips/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(container.querySelector('[data-lkia-pool]')?.querySelectorAll('video')).toHaveLength(4);
  });
});

describe('Cine-Scramble: the drag tidies up after itself', () => {
  it('clears the drag position, the lean and drag mode when the drop is cancelled', () => {
    vi.useFakeTimers();
    try {
      const activity = cineScrambleFixture();
      const { container } = render(<CineScramblePlayer activity={activity} />);
      start();
      const drag = card(activity, 0);
      fireEvent.pointerDown(drag, { button: 0, pointerId: 7, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(drag, { pointerId: 7, clientX: -30, clientY: 10 });
      expect(Number.parseFloat(drag.style.getPropertyValue('--lkia-drag-tilt'))).toBeLessThan(0);
      vi.advanceTimersByTime(130);
      expect(drag.style.getPropertyValue('--lkia-drag-tilt')).toBe('0deg');
      // A clip dragged out of the pool does not light the pool up as a place to drop.
      vi.mocked(document.elementFromPoint).mockReturnValue(
        container.querySelector('[data-lkia-pool]'),
      );
      fireEvent.pointerMove(drag, { pointerId: 7, clientX: -20, clientY: 40 });
      expect(container.querySelector('[data-lkia-pool]')?.getAttribute('data-drop-target')).toBe(
        'false',
      );
      fireEvent.pointerCancel(drag, { pointerId: 7 });
      for (const property of ['--lkia-drag-x', '--lkia-drag-y', '--lkia-drag-tilt'])
        expect(drag.style.getPropertyValue(property)).toBe('');
      expect(drag.getAttribute('data-dragging')).toBe('false');
      expect(container.querySelector('[data-lkia-arrange]')?.getAttribute('data-drag-active')).toBe(
        'false',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
