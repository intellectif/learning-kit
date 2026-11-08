import type {
  CSSProperties,
  JSX,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../../player/icons.js';
import {
  fillTemplate,
  hasCommandModifier,
  isTypingTarget,
  languageAttributes,
} from '../../../player/locale.js';
import { resolveAssetUrl } from '../../../player/resolve-url.js';
import { Stage } from '../../../player/Stage.js';
import type { PlayerHostOptions } from '../../../player/types.js';
import { cineScrambleChrome } from '../copy.js';
import { type CineScrambleClip, type CineScrambleData, isVocabEnabled } from '../schema.js';
import {
  checkSlots,
  chronological,
  placeClip,
  startOrder,
  stitchCaptions,
  wrapRows,
} from './machine.js';

export interface CineScramblePlayerProps extends PlayerHostOptions {
  activity: CineScrambleData;
}

type Via = 'keyboard' | 'pointer';
type DropTarget = number | 'pool' | null;

interface Drag {
  id: number;
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
  scale: number;
  element: HTMLElement;
  lastX: number;
  tilt: number;
  settle?: ReturnType<typeof setTimeout>;
}

/** How far a pointer must travel before a press becomes a drag, in CSS pixels. */
const DRAG_THRESHOLD = 6;
/** The most a dragged clip leans into its movement, in degrees. */
const MAX_TILT = 7;

/** The custom properties that move a dragged clip; set on the element, not through React. */
const DRAG_PROPERTIES = ['--lkia-drag-x', '--lkia-drag-y', '--lkia-drag-tilt'] as const;

/** The scale of the stage an element is drawn in: its rendered width over its layout width. */
function stageScaleOf(element: HTMLElement | null): number {
  if (!element || element.offsetWidth === 0) return 1;
  const width = element.getBoundingClientRect().width;
  return width > 0 ? width / element.offsetWidth : 1;
}

/** Where every clip is drawn now, by its number. */
function clipRects(root: HTMLElement | null): Map<string, DOMRect> {
  const rects = new Map<string, DOMRect>();
  for (const element of root?.querySelectorAll<HTMLElement>('[data-lkia-clip]') ?? []) {
    const number = element.getAttribute('data-lkia-clip');
    if (number) rects.set(number, element.getBoundingClientRect());
  }
  return rects;
}

function LoopVideo({
  clip,
  host,
  playLabel,
  errorLabel,
}: {
  clip: CineScrambleClip;
  host: PlayerHostOptions;
  playLabel: string;
  errorLabel: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const element = ref.current;
    void element?.play().catch(() => {
      if (active) setBlocked(true);
    });
    return () => {
      active = false;
      element?.pause();
    };
  }, []);
  return (
    <span data-lkia-loop="" data-aspect={clip.video.aspect}>
      <video
        ref={ref}
        src={resolveAssetUrl(clip.video, host.resolveUrl)}
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
        onError={() => setError(true)}
      />
      {blocked && !error && (
        <button
          type="button"
          data-lkia-no-drag=""
          data-lkia-play=""
          onClick={(event) => {
            event.stopPropagation();
            void ref.current
              ?.play()
              .then(() => setBlocked(false))
              .catch(() => setError(true));
          }}
        >
          <Icon name="play" /> {playLabel}
        </button>
      )}
      {error && (
        <span role="alert" data-lkia-error="">
          {errorLabel}
        </span>
      )}
    </span>
  );
}

/** The slot or pool under a point, looking beneath the clip being dragged. */
function dropTargetAt(
  x: number,
  y: number,
  dragged: HTMLElement,
  root: HTMLElement | null,
): DropTarget {
  if (!root) return null;
  const stack =
    typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(x, y) : [];
  const candidates = stack.length > 0 ? stack : [document.elementFromPoint?.(x, y)];
  for (const element of candidates) {
    if (!element || dragged.contains(element)) continue;
    if (!root.contains(element)) return null;
    const slot = element.closest('[data-lkia-slot]');
    if (slot) return Number(slot.getAttribute('data-lkia-slot'));
    if (element.closest('[data-lkia-pool]')) return 'pool';
  }
  return null;
}

export function CineScramblePlayer({ activity, ...host }: CineScramblePlayerProps): JSX.Element {
  // Built-in chrome < host strings < the editor's own copy for this activity.
  const chrome = { ...cineScrambleChrome(host.locale), ...host.strings, ...activity.copy };
  const content = languageAttributes(activity.locale);
  const helpId = useId();
  const [stage, setStage] = useState<'start' | 'arranging' | 'checked-correct'>('start');
  const [sceneIndex, setSceneIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [completedScenes, setCompletedScenes] = useState<string[]>([]);
  const [slots, setSlots] = useState<(number | null)[]>([]);
  const [results, setResults] = useState<boolean[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [target, setTarget] = useState<DropTarget>(null);
  const [announcement, setAnnouncement] = useState('');
  const [vocab, setVocab] = useState(false);
  const drag = useRef<Drag | null>(null);
  const suppressClickUntil = useRef(0);
  const focusAfter = useRef<string | null>(null);
  const flipFrom = useRef<Map<string, DOMRect> | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const vocabButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const scene = activity.scenes[sceneIndex] ?? activity.scenes[0];
  const ordered = chronological(scene.clips);
  const seed = `${activity.id}/${scene.id}`;
  const pool = useMemo(() => startOrder(scene.clips, seed, attempt), [scene.clips, seed, attempt]);
  const numberOf = (id: number) => pool.findIndex((clip) => clip.id === id) + 1;
  const nameOf = (id: number) => `${chrome.clipLabel} ${numberOf(id)}`;
  const vocabAvailable = isVocabEnabled(activity);
  const full = slots.length > 0 && slots.every((id) => id !== null);

  useEffect(() => {
    if (vocab) closeButton.current?.focus();
  }, [vocab]);
  // Moves focus after a keyboard placement, once the clip has re-rendered in
  // its new place: to the next clip still to place, or to Check.
  useEffect(() => {
    const selector = focusAfter.current;
    if (!selector) return;
    focusAfter.current = null;
    board.current?.querySelector<HTMLElement>(selector)?.focus();
  });
  // Every clip that changed place flies there from where it was drawn: from the
  // pool into its slot, from a slot back to the pool, from the spot where a drag
  // was let go, or back home when it was dropped on nothing. CSS does the motion
  // (`lkia-clip-fly`); this only measures the start, before the browser paints.
  useLayoutEffect(() => {
    const before = flipFrom.current;
    if (!before) return;
    flipFrom.current = null;
    const root = board.current;
    const scale = stageScaleOf(root);
    for (const element of root?.querySelectorAll<HTMLElement>('[data-lkia-clip]') ?? []) {
      const from = before.get(element.getAttribute('data-lkia-clip') ?? '');
      if (!from) continue;
      const to = element.getBoundingClientRect();
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      if (Math.hypot(dx, dy) < 2 || to.width === 0) continue;
      element.style.setProperty('--lkia-from-x', `${dx / scale}px`);
      element.style.setProperty('--lkia-from-y', `${dy / scale}px`);
      element.style.setProperty('--lkia-from-scale', `${from.width / to.width}`);
      element.removeAttribute('data-flip');
      void element.offsetWidth;
      element.setAttribute('data-flip', 'true');
      element.addEventListener('animationend', () => element.removeAttribute('data-flip'), {
        once: true,
      });
    }
  });

  const startScene = (index: number, nextAttempt: number) => {
    const chosen = activity.scenes[index];
    if (!chosen) return;
    setSceneIndex(index);
    setAttempt(nextAttempt);
    setSlots(chosen.clips.map(() => null));
    setResults([]);
    setSelected(null);
    setAnnouncement('');
    setStage('arranging');
    host.onEvent?.({ type: 'scramble.started', activityId: activity.id, sceneId: chosen.id });
  };
  const focusNext = (nextSlots: readonly (number | null)[]) => {
    const remaining = pool.find((clip) => !nextSlots.includes(clip.id));
    focusAfter.current = remaining
      ? `[data-lkia-clip="${numberOf(remaining.id)}"] [data-lkia-clip-button]`
      : '[data-lkia-check]';
  };
  const place = (id: number, index: number, via: Via) => {
    if (index < 0 || index >= slots.length) return;
    flipFrom.current ??= clipRects(board.current);
    const nextSlots = placeClip(slots, id, index);
    setSlots(nextSlots);
    setResults([]);
    setSelected(null);
    setAnnouncement(fillTemplate(chrome.placedLabel, { clip: nameOf(id), slot: index + 1 }));
    if (via === 'keyboard') focusNext(nextSlots);
  };
  const returnToPool = (id: number, via: Via) => {
    if (!slots.includes(id)) return;
    flipFrom.current ??= clipRects(board.current);
    setSlots(slots.map((value) => (value === id ? null : value)));
    setResults([]);
    setSelected(null);
    setAnnouncement(fillTemplate(chrome.returnedLabel, { clip: nameOf(id) }));
    if (via === 'keyboard')
      focusAfter.current = `[data-lkia-pool] [data-lkia-clip="${numberOf(id)}"] [data-lkia-clip-button]`;
  };
  const check = () => {
    if (!full) {
      setAnnouncement(chrome.fillAllLabel);
      return;
    }
    const checked = checkSlots(slots);
    setResults(checked);
    const correct = checked.every(Boolean);
    host.onEvent?.({
      type: 'scramble.checked',
      activityId: activity.id,
      sceneId: scene.id,
      correct,
    });
    if (correct) {
      setCompletedScenes((done) => (done.includes(scene.id) ? done : [...done, scene.id]));
      setAnnouncement(chrome.completeLabel);
      setStage('checked-correct');
      host.onEvent?.({ type: 'scramble.completed', activityId: activity.id, sceneId: scene.id });
    } else {
      setAnnouncement(
        fillTemplate(chrome.resultSummary, {
          correct: checked.filter(Boolean).length,
          total: checked.length,
        }),
      );
    }
  };
  const select = (id: number) => {
    const next = selected === id ? null : id;
    setSelected(next);
    if (next !== null) setAnnouncement(fillTemplate(chrome.selectedLabel, { clip: nameOf(next) }));
  };
  const openVocab = () => {
    setVocab(true);
    host.onEvent?.({ type: 'vocab.opened', activityId: activity.id });
  };
  const closeVocab = () => {
    setVocab(false);
    vocabButton.current?.focus();
  };

  const onPointerDown = (id: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('[data-lkia-no-drag]')) return;
    drag.current = {
      id,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      scale: stageScaleOf(board.current),
      element: event.currentTarget,
      lastX: event.clientX,
      tilt: 0,
    };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      current.moved = true;
      try {
        current.element.setPointerCapture(event.pointerId);
      } catch {
        /* The pointer is already gone; the drag ends at pointerup. */
      }
      setSelected(null);
      setDraggingId(current.id);
    }
    // The clip follows the pointer and leans into the way it is moving; React
    // re-renders only when the slot under it changes.
    const lean = Math.max(-MAX_TILT, Math.min(MAX_TILT, (event.clientX - current.lastX) * 0.9));
    current.tilt = current.tilt * 0.6 + lean * 0.4;
    current.lastX = event.clientX;
    const style = current.element.style;
    style.setProperty('--lkia-drag-x', `${dx / current.scale}px`);
    style.setProperty('--lkia-drag-y', `${dy / current.scale}px`);
    style.setProperty('--lkia-drag-tilt', `${current.tilt.toFixed(2)}deg`);
    clearTimeout(current.settle);
    current.settle = setTimeout(() => {
      current.tilt = 0;
      style.setProperty('--lkia-drag-tilt', '0deg');
    }, 120);
    const over = dropTargetAt(event.clientX, event.clientY, current.element, board.current);
    // The pool is a target only for a clip coming back from a slot.
    setTarget(over === 'pool' && !slots.includes(current.id) ? null : over);
  };
  const endDrag = () => {
    const current = drag.current;
    drag.current = null;
    if (current) {
      clearTimeout(current.settle);
      for (const property of DRAG_PROPERTIES) current.element.style.removeProperty(property);
    }
    setDraggingId(null);
    setTarget(null);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.moved) {
      endDrag();
      return;
    }
    // Measured before the clip lets go, so it flies from where it was dropped.
    flipFrom.current = clipRects(board.current);
    const drop = dropTargetAt(event.clientX, event.clientY, current.element, board.current);
    endDrag();
    suppressClickUntil.current = performance.now() + 400;
    if (typeof drop === 'number') place(current.id, drop, 'pointer');
    else if (drop === 'pool') returnToPool(current.id, 'pointer');
  };
  const cancelDrag = () => {
    if (drag.current?.moved) flipFrom.current = clipRects(board.current);
    endDrag();
  };
  const onClipClick = (id: number) => (event: ReactMouseEvent<HTMLDivElement>) => {
    if (performance.now() < suppressClickUntil.current) return;
    const slot = slots.indexOf(id);
    // Tapping a placed clip while another is selected puts the selected one there.
    if (selected !== null && selected !== id && slot !== -1) {
      place(selected, slot, event.detail === 0 ? 'keyboard' : 'pointer');
      return;
    }
    select(id);
  };
  const onClipKeyDown = (id: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (hasCommandModifier(event)) return;
    const index = Number(event.key) - 1;
    if (/^[1-9]$/.test(event.key) && index < slots.length) {
      event.preventDefault();
      place(id, index, 'keyboard');
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && slots.includes(id)) {
      event.preventDefault();
      returnToPool(id, 'keyboard');
    }
  };

  const renderClip = (id: number, slotIndex?: number) => {
    const clip = scene.clips.find((item) => item.id === id);
    if (!clip) return null;
    const number = numberOf(id);
    const name = nameOf(id);
    const dragging = draggingId === id;
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: Pointer dragging; the button inside is the keyboard and screen-reader control.
      // biome-ignore lint/a11y/useKeyWithClickEvents: Keyboard clicks come from the button inside and bubble here.
      <div
        key={`clip-${id}`}
        data-lkia-clip={number}
        data-selected={selected === id}
        data-dragging={dragging}
        onPointerDown={onPointerDown(id)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancelDrag}
        onClick={onClipClick(id)}
      >
        <LoopVideo
          clip={clip}
          host={host}
          playLabel={chrome.playFallback}
          errorLabel={chrome.mediaError}
        />
        <span data-lkia-grip="" aria-hidden="true">
          <Icon name="grip" />
        </span>
        <span data-lkia-clip-foot="">
          <button
            type="button"
            data-lkia-clip-button=""
            aria-pressed={selected === id}
            aria-describedby={helpId}
            aria-label={
              slotIndex === undefined ? name : `${name}, ${chrome.slotLabel} ${slotIndex + 1}`
            }
            onKeyDown={onClipKeyDown(id)}
          >
            <span data-lkia-chip="">{number}</span>
            {name}
          </button>
          {slotIndex !== undefined && (
            <button
              type="button"
              data-lkia-no-drag=""
              data-lkia-return=""
              aria-label={`${chrome.removeLabel}: ${name}`}
              title={chrome.removeLabel}
              onClick={(event) => {
                event.stopPropagation();
                returnToPool(id, event.detail === 0 ? 'keyboard' : 'pointer');
              }}
            >
              <Icon name="return" />
            </button>
          )}
        </span>
      </div>
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (vocab && event.key === 'Escape') {
      event.preventDefault();
      closeVocab();
      return;
    }
    if (vocab && event.key === 'Tab') {
      event.preventDefault();
      closeButton.current?.focus();
      return;
    }
    if (hasCommandModifier(event) || isTypingTarget(event.target)) return;
    if (stage === 'arranging' && event.key === 'Escape' && selected !== null) {
      event.preventDefault();
      setSelected(null);
      return;
    }
    if (!vocab && stage === 'arranging' && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      check();
    }
  };

  // The next scene still to do: after this one first, then from the start.
  const unfinished = (index: number) => {
    const item = activity.scenes[index];
    return item !== undefined && index !== sceneIndex && !completedScenes.includes(item.id);
  };
  const after = activity.scenes.findIndex((_, index) => index > sceneIndex && unfinished(index));
  const nextScene =
    after !== -1 ? after : activity.scenes.findIndex((_, index) => unfinished(index));
  let offset = 0;
  return (
    <Stage
      {...host}
      label={activity.title}
      style={activity.style ?? { presetId: 'cinema-dark', mode: 'dark' }}
      template="cine-scramble"
      stage={stage}
      onKeyDown={onKeyDown}
    >
      <header data-lkia-bar="">
        {stage !== 'start' && activity.scenes.length > 1 && (
          <button
            type="button"
            data-lkia-back=""
            data-animate="button-press"
            onClick={() => setStage('start')}
          >
            <Icon name="back" /> {chrome.scenesLabel}
          </button>
        )}
        {stage !== 'start' && (
          <p data-lkia-eyebrow="">
            <span {...content}>{activity.title}</span>
            <span aria-hidden="true"> · </span>
            <span {...content}>{scene.title}</span>
          </p>
        )}
        {vocabAvailable && (
          <button
            ref={vocabButton}
            type="button"
            data-lkia-vocab-button=""
            data-animate="button-press"
            aria-haspopup="dialog"
            onClick={openVocab}
          >
            <Icon name="book" /> {chrome.vocabButtonLabel}
          </button>
        )}
      </header>

      {stage === 'start' && (
        <div data-lkia-start="" data-animate="panel-fade">
          {activity.poster && (
            <img
              data-lkia-poster=""
              src={resolveAssetUrl(activity.poster, host.resolveUrl)}
              alt=""
            />
          )}
          <div data-lkia-start-body="">
            <h1 {...content}>{activity.title}</h1>
            {activity.tagline && (
              <p data-lkia-tagline="" {...content}>
                {activity.tagline}
              </p>
            )}
            {activity.scenes.length > 1 ? (
              <ol data-lkia-scenes="">
                {activity.scenes.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      data-lkia-scene=""
                      data-animate="card-stagger"
                      style={{ '--i': index } as CSSProperties}
                      data-completed={completedScenes.includes(item.id)}
                      onClick={() => startScene(index, 0)}
                    >
                      <span data-lkia-chip="">{index + 1}</span>
                      <span {...content}>{item.title}</span>
                      {completedScenes.includes(item.id) && (
                        <span data-lkia-done="">
                          <Icon name="check" /> {chrome.doneLabel}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <button
                type="button"
                data-lkia-primary=""
                data-animate="button-press"
                onClick={() => startScene(0, completedScenes.length > 0 ? attempt + 1 : 0)}
              >
                {chrome.startLabel}
              </button>
            )}
          </div>
        </div>
      )}

      {stage === 'arranging' && (
        <div
          ref={board}
          data-lkia-arrange=""
          data-has-selection={selected !== null}
          data-drag-active={draggingId !== null}
        >
          <p id={helpId} data-lkia-help="">
            {chrome.keyboardHelp}
          </p>
          <ol
            data-lkia-timeline=""
            style={{ '--lkia-clip-count': scene.clips.length } as CSSProperties}
          >
            {ordered.map((clip, index) => {
              const placed = slots[index] ?? null;
              const result = results[index];
              return (
                <li
                  key={clip.id}
                  data-lkia-slot={index}
                  data-drop-target={target === index}
                  data-filled={placed !== null}
                  data-slot-result={
                    result === undefined ? undefined : result ? 'correct' : 'incorrect'
                  }
                >
                  <div data-lkia-dropzone="">
                    <span data-lkia-slot-number="" aria-hidden="true">
                      {index + 1}
                    </span>
                    {placed !== null ? (
                      renderClip(placed, index)
                    ) : (
                      <button
                        type="button"
                        data-lkia-drop=""
                        aria-label={`${chrome.slotLabel} ${index + 1}: ${chrome.emptySlotLabel}`}
                        onClick={(event) => {
                          if (selected !== null)
                            place(selected, index, event.detail === 0 ? 'keyboard' : 'pointer');
                        }}
                      >
                        {chrome.emptySlotLabel}
                      </button>
                    )}
                  </div>
                  <p data-lkia-hint="" {...content}>
                    {clip.caption}
                  </p>
                  {result !== undefined && (
                    <p data-lkia-result="">
                      <Icon name={result ? 'check' : 'cross'} />{' '}
                      {result ? chrome.correctLabel : chrome.incorrectLabel}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          <section
            data-lkia-pool=""
            data-drop-target={target === 'pool'}
            aria-label={chrome.poolLabel}
            style={{ '--lkia-clip-count': scene.clips.length } as CSSProperties}
          >
            {pool.map((clip) =>
              slots.includes(clip.id) ? (
                <div key={`gap-${clip.id}`} data-lkia-pool-gap="" aria-hidden="true" />
              ) : (
                <div key={`cell-${clip.id}`} data-lkia-cell="">
                  {renderClip(clip.id)}
                </div>
              ),
            )}
          </section>
          <div data-lkia-actions="">
            <button
              type="button"
              data-lkia-check=""
              data-lkia-primary=""
              data-animate="button-press"
              aria-disabled={!full}
              onClick={check}
            >
              {chrome.checkLabel}
            </button>
          </div>
          <p role="status" data-lkia-announce="">
            {announcement}
          </p>
        </div>
      )}

      {stage === 'checked-correct' && (
        <div data-lkia-complete="" data-animate="panel-fade">
          <p role="status" data-lkia-celebrate="">
            <Icon name="check" /> {chrome.completeLabel}
          </p>
          <section data-lkia-story="">
            <h2>{chrome.storyLabel}</h2>
            <p {...content}>{stitchCaptions(scene.clips)}</p>
          </section>
          <div data-lkia-pairs="">
            {wrapRows(ordered.length).map((count, row) => {
              const clips = ordered.slice(offset, offset + count);
              offset += count;
              return (
                <div data-lkia-row={row} key={clips[0]?.id}>
                  {clips.map((clip, index) => (
                    <figure
                      key={clip.id}
                      data-animate="card-stagger"
                      style={{ '--i': row * 2 + index } as CSSProperties}
                    >
                      <LoopVideo
                        clip={clip}
                        host={host}
                        playLabel={chrome.playFallback}
                        errorLabel={chrome.mediaError}
                      />
                      <figcaption>
                        <span data-lkia-chip="">{clip.id + 1}</span>
                        <span {...content}>{clip.caption}</span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              );
            })}
          </div>
          <div data-lkia-actions="">
            {nextScene !== -1 && (
              <button
                type="button"
                data-lkia-primary=""
                data-animate="button-press"
                onClick={() => startScene(nextScene, 0)}
              >
                {chrome.nextSceneLabel}
              </button>
            )}
            <button
              type="button"
              data-lkia-primary={nextScene === -1 ? '' : undefined}
              data-animate="button-press"
              onClick={() => startScene(sceneIndex, attempt + 1)}
            >
              <Icon name="replay" /> {chrome.replayLabel}
            </button>
            {activity.scenes.length > 1 && (
              <button type="button" data-animate="button-press" onClick={() => setStage('start')}>
                {chrome.scenesLabel}
              </button>
            )}
          </div>
        </div>
      )}

      {vocab && (
        // biome-ignore lint/a11y/noStaticElementInteractions: A click on the dimmed activity closes the glossary; Escape and Close do the same from the keyboard.
        // biome-ignore lint/a11y/useKeyWithClickEvents: Escape and the Close button are the keyboard path.
        <div
          data-lkia-scrim=""
          onClick={(event) => {
            if (event.target === event.currentTarget) closeVocab();
          }}
        >
          <div
            data-animate="panel-fade"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${helpId}-vocab`}
            data-lkia-vocab=""
            data-lkia-panel=""
          >
            <div data-lkia-vocab-head="">
              <h2 id={`${helpId}-vocab`}>{chrome.vocabButtonLabel}</h2>
              <button
                ref={closeButton}
                type="button"
                data-animate="button-press"
                onClick={closeVocab}
              >
                {chrome.closeLabel}
              </button>
            </div>
            <dl {...content}>
              {activity.vocab?.map((item) => (
                <div key={item.term}>
                  <dt>{item.term}</dt>
                  <dd>{item.definition}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </Stage>
  );
}
