import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STRINGS } from '../../../i18n/LkIntlProvider.js';
import { Scrubber, type ScrubberMarker } from '../Scrubber.js';
import { parseWebVtt } from '../vtt.js';

/**
 * The progress bar. It is one slider for assistive technology and a hit strip
 * for a pointer, and the two are driven separately here: a learner who drags
 * and a learner who arrows must arrive at the same place.
 */

const cues = parseWebVtt(
  [
    'WEBVTT',
    '',
    '00:00:00.000 --> 00:00:20.000',
    'Primera línea',
    '',
    '00:01:00.000 --> 00:01:20.000',
    'Línea del final',
  ].join('\n'),
);

const markers: ScrubberMarker[] = [
  { id: 'q1', at: 30, label: 'Pausa · 1 de 2', state: 'open', required: true },
  { id: 'q2', at: 90, label: 'Segunda · 0 de 1', state: 'unreached', required: false },
];

const onSeek = vi.fn();
const onScrubChange = vi.fn();

function draw(
  over: Partial<React.ComponentProps<typeof Scrubber>> = {},
  onPlayerKeyDown?: (event: React.KeyboardEvent) => void,
) {
  const view = render(
    // The player handles keys on an ancestor, as React propagates them.
    // biome-ignore lint/a11y/noStaticElementInteractions: standing in for the player's shell, which carries its own role and controls
    <div onKeyDown={onPlayerKeyDown}>
      <Scrubber
        current={10}
        duration={100}
        buffered={40}
        chapters={[
          { at: 0, title: 'Principio' },
          { at: 50, title: 'Medio' },
        ]}
        markers={markers}
        cues={cues}
        previewLimit={Number.POSITIVE_INFINITY}
        strings={DEFAULT_STRINGS}
        onSeek={onSeek}
        onScrubChange={onScrubChange}
        {...over}
      />
    </div>,
  );
  const track = view.container.querySelector('[role="slider"]') as HTMLElement;
  // jsdom lays nothing out, so the bar is given a width: 200 px for 100 s.
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 20,
    width: 200,
    height: 20,
    toJSON: () => ({}),
  } as DOMRect);
  return { ...view, track };
}

/**
 * jsdom implements no pointer events, so a `pointerdown` fired at it carries
 * no coordinates and the bar would be driven by `NaN`. This is the smallest
 * class that carries what the bar reads.
 */
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}

beforeEach(() => {
  (globalThis as { PointerEvent?: unknown }).PointerEvent = TestPointerEvent;
  onSeek.mockClear();
  onScrubChange.mockClear();
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Scrubber', () => {
  it('reports where it is, in words, with the chapter it is inside', () => {
    const { track } = draw();
    expect(track).toHaveAttribute('aria-valuenow', '10');
    expect(track).toHaveAttribute('aria-valuemax', '100');
    expect(track).toHaveAttribute('aria-valuetext', '0:10 of 1:40, Principio');
    expect(draw({ current: 60 }).track).toHaveAttribute('aria-valuetext', '1:00 of 1:40, Medio');
  });

  it('seeks to where the pointer went down, and keeps seeking through a drag', () => {
    const { track } = draw();
    fireEvent.pointerDown(track, { clientX: 50, pointerId: 1 });
    expect(onSeek).toHaveBeenLastCalledWith(25);
    expect(onScrubChange).toHaveBeenLastCalledWith(true);

    fireEvent.pointerMove(track, { clientX: 150, pointerId: 1 });
    expect(onSeek).toHaveBeenLastCalledWith(75);

    fireEvent.pointerUp(track, { clientX: 150, pointerId: 1 });
    expect(onScrubChange).toHaveBeenLastCalledWith(false);

    // With the button up, moving the pointer previews without seeking.
    onSeek.mockClear();
    fireEvent.pointerMove(track, { clientX: 20, pointerId: 1 });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('holds a drag that leaves the bar inside its own ends', () => {
    const { track } = draw();
    fireEvent.pointerDown(track, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: -400, pointerId: 1 });
    expect(onSeek).toHaveBeenLastCalledWith(0);
    fireEvent.pointerMove(track, { clientX: 4000, pointerId: 1 });
    expect(onSeek).toHaveBeenLastCalledWith(100);
    fireEvent.pointerCancel(track, { pointerId: 1 });
    expect(onScrubChange).toHaveBeenLastCalledWith(false);
  });

  it('moves by arrow, page and end, and stops those keys reaching the player', () => {
    const reachedPlayer = vi.fn();
    const { track } = draw({}, reachedPlayer);

    fireEvent.keyDown(track, { key: 'ArrowRight' });
    expect(onSeek).toHaveBeenLastCalledWith(15);
    fireEvent.keyDown(track, { key: 'ArrowLeft', shiftKey: true });
    expect(onSeek).toHaveBeenLastCalledWith(9);
    fireEvent.keyDown(track, { key: 'PageUp' });
    expect(onSeek).toHaveBeenLastCalledWith(40);
    fireEvent.keyDown(track, { key: 'PageDown' });
    expect(onSeek).toHaveBeenLastCalledWith(-20);
    fireEvent.keyDown(track, { key: 'End' });
    expect(onSeek).toHaveBeenLastCalledWith(100);
    fireEvent.keyDown(track, { key: 'Home' });
    expect(onSeek).toHaveBeenLastCalledWith(0);

    // The player would otherwise move the playhead a second time for one press.
    expect(reachedPlayer).not.toHaveBeenCalled();
    fireEvent.keyDown(track, { key: 'a' });
    expect(reachedPlayer).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all until the video reports a duration', () => {
    const { track } = draw({ duration: 0 });
    expect(track).toHaveAttribute('tabindex', '-1');
    fireEvent.pointerDown(track, { clientX: 100, pointerId: 1 });
    fireEvent.keyDown(track, { key: 'ArrowRight' });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('previews the moment under the pointer: its time, its chapter and its line', () => {
    const { track, container } = draw();
    fireEvent.pointerMove(track, { clientX: 20, pointerId: 1 });
    const bubble = container.querySelector('.lk-iv-bubble') as HTMLElement;
    expect(bubble).toHaveTextContent('0:10');
    expect(bubble).toHaveTextContent('Principio');
    expect(bubble).toHaveTextContent('Primera línea');

    // Over a quiz marker, it names the quiz and how much of it is answered.
    fireEvent.pointerMove(track, { clientX: 60, pointerId: 1 });
    expect(container.querySelector('.lk-iv-bubble')).toHaveTextContent('Pausa · 1 de 2');

    fireEvent.pointerLeave(track);
    expect(container.querySelector('.lk-iv-bubble')).toBeNull();
  });

  it('will not preview a line the learner is not allowed to have reached', () => {
    const { track, container } = draw({ previewLimit: 30 });
    fireEvent.pointerMove(track, { clientX: 140, pointerId: 1 });
    const bubble = container.querySelector('.lk-iv-bubble') as HTMLElement;
    expect(bubble).toHaveTextContent('1:10');
    expect(bubble).not.toHaveTextContent('Línea del final');
  });

  it('draws what has played, what has loaded, each chapter break and each quiz', () => {
    const { container } = draw();
    expect(container.querySelector('.lk-iv-scrubber-played')).toHaveStyle({ width: '10%' });
    expect(container.querySelector('.lk-iv-scrubber-buffered')).toHaveStyle({ width: '40%' });
    // The break at 0 is the start of the bar, not a break in it.
    expect(container.querySelectorAll('.lk-iv-scrubber-gap')).toHaveLength(1);
    const drawn = container.querySelectorAll('.lk-iv-marker');
    expect(drawn).toHaveLength(2);
    expect(drawn[0]).toHaveAttribute('data-state', 'open');
    expect(drawn[0]).toHaveAttribute('data-required', 'true');
    expect(drawn[1]).toHaveAttribute('data-state', 'unreached');
    expect(drawn[1]).not.toHaveAttribute('data-required');
  });

  it('keeps a marker past the end of the video on the bar', () => {
    const { container } = draw({ markers: [{ ...markers[0], at: 500 } as ScrubberMarker] });
    expect(container.querySelector('.lk-iv-marker')).toHaveStyle({ insetInlineStart: '100%' });
  });
});
