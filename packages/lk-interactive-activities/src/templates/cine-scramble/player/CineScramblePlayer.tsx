import type {
  AnimationEvent,
  CSSProperties,
  JSX,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../../player/icons.js';
import {
  chromeLocaleFor,
  definedOnly,
  fillTemplate,
  hasCommandModifier,
  isTypingTarget,
  keyShortcuts,
  languageAttributes,
} from '../../../player/locale.js';
import { resolveAssetUrl } from '../../../player/resolve-url.js';
import { type Announcement, Stage } from '../../../player/Stage.js';
import type { PlayerHostOptions } from '../../../player/types.js';
import { cineScrambleChrome } from '../copy.js';
import { isVocabEnabled } from '../rules.js';
import type { CineScrambleClip, CineScrambleData } from '../types.js';
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
type ScrambleStage = 'start' | 'arranging' | 'checked-correct';

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

/** Whether the viewer asked the system for reduced motion. */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** A muted loop of one clip, playing unless every loop is paused. */
function LoopVideo({
  clip,
  host,
  paused,
  errorLabel,
  onBlocked,
  onFailed,
}: {
  clip: CineScrambleClip;
  host: PlayerHostOptions;
  paused: boolean;
  errorLabel: string;
  onBlocked: () => void;
  onFailed: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  const src = resolveAssetUrl(clip.video, host.resolveUrl);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new source clears an old error.
  useEffect(() => setError(false), [src]);
  const blockedRef = useRef(onBlocked);
  blockedRef.current = onBlocked;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (paused) {
      element.pause();
      return;
    }
    let active = true;
    void element.play().catch(() => {
      if (active) blockedRef.current();
    });
    return () => {
      active = false;
    };
  }, [paused]);
  useEffect(() => {
    const element = ref.current;
    return () => element?.pause();
  }, []);
  return (
    <span data-lkia-loop="" data-aspect={clip.video.aspect}>
      <video
        ref={ref}
        src={src}
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
        onError={() => {
          setError(true);
          onFailed();
        }}
      />
      {error && <span data-lkia-error="">{errorLabel}</span>}
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

/** What identifies the activity a player shows: a new one starts the player afresh. */
function identityOf(activity: CineScrambleData): string {
  return [
    activity.id,
    ...(activity.scenes ?? []).map((scene) => `${scene.id}:${scene.clips?.length ?? 0}`),
  ].join('\u0000');
}

/**
 * The Cine-Scramble player: the learner puts a scene's muted looping clips back
 * in story order, by dragging, by tapping a clip then a slot, or by keyboard,
 * and checks. Never graded.
 */
export function CineScramblePlayer(props: CineScramblePlayerProps): JSX.Element {
  // A different activity, or different scenes, starts from the beginning.
  return <CineScrambleView key={identityOf(props.activity)} {...props} />;
}

function CineScrambleView({ activity, ...host }: CineScramblePlayerProps): JSX.Element {
  // Built-in chrome < host strings < the editor's own copy for this activity.
  const chrome = {
    ...cineScrambleChrome(host.locale),
    ...definedOnly(host.strings),
    ...definedOnly(activity.copy),
  };
  const chromeLocale = chromeLocaleFor(host.locale, host.strings);
  const content = languageAttributes(activity.locale);
  const shortcuts = host.shortcuts !== false;
  const helpId = useId();
  const [stage, setStage] = useState<ScrambleStage>('start');
  const [sceneIndex, setSceneIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [completedScenes, setCompletedScenes] = useState<string[]>([]);
  const [slots, setSlots] = useState<(number | null)[]>([]);
  const [results, setResults] = useState<boolean[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [target, setTarget] = useState<DropTarget>(null);
  const [announcement, setAnnouncement] = useState<Announcement>();
  const [vocab, setVocab] = useState(false);
  // Every loop plays unless paused: by the viewer, by reduced motion, or
  // because the browser blocked autoplay.
  const [paused, setPaused] = useState(() => host.reducedMotion === true || prefersReducedMotion());
  const failedAnnounced = useRef(false);
  const drag = useRef<Drag | null>(null);
  const suppressClickUntil = useRef(0);
  const focusAfter = useRef<string | null>(null);
  const flipFrom = useRef<Map<string, DOMRect> | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const vocabButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const vocabWasOpen = useRef(false);
  const scene = activity.scenes[sceneIndex] ?? activity.scenes[0];
  const ordered = chronological(scene.clips);
  const seed = `${activity.id}/${scene.id}`;
  const pool = useMemo(() => startOrder(scene.clips, seed, attempt), [scene.clips, seed, attempt]);
  const numberOf = (id: number) => pool.findIndex((clip) => clip.id === id) + 1;
  const nameOf = (id: number) => `${chrome.clipLabel} ${numberOf(id)}`;
  const vocabAvailable = isVocabEnabled(activity);
  const full = slots.length > 0 && slots.every((id) => id !== null);
  const announce = (text: string) =>
    setAnnouncement((previous) => ({ id: (previous?.id ?? 0) + 1, text }));

  // The glossary takes focus when it opens and gives it back to its button.
  useEffect(() => {
    if (vocab) {
      vocabWasOpen.current = true;
      closeButton.current?.focus();
    } else if (vocabWasOpen.current) {
      vocabWasOpen.current = false;
      vocabButton.current?.focus();
    }
  }, [vocab]);
  // Moves focus after a placement, once the clip has re-rendered in its new
  // place: to the next clip still to place, to Check, or to the moved clip.
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
      element.setAttribute('data-entered', '');
      element.setAttribute('data-flip', 'true');
    }
  });

  const endDrag = () => {
    const current = drag.current;
    drag.current = null;
    if (current) {
      clearTimeout(current.settle);
      for (const property of DRAG_PROPERTIES) current.element.style.removeProperty(property);
      if (current.element.hasPointerCapture?.(current.pointerId)) {
        current.element.releasePointerCapture(current.pointerId);
      }
    }
    setDraggingId(null);
    setTarget(null);
  };
  const goTo = (next: ScrambleStage) => {
    endDrag();
    setSelected(null);
    setStage(next);
  };
  const startScene = (index: number, nextAttempt: number) => {
    const chosen = activity.scenes[index];
    if (!chosen) return;
    setSceneIndex(index);
    setAttempt(nextAttempt);
    setSlots(chosen.clips.map(() => null));
    setResults([]);
    goTo('arranging');
    host.onEvent?.({ type: 'scramble.started', activityId: activity.id, sceneId: chosen.id });
  };
  const focusNext = (nextSlots: readonly (number | null)[]) => {
    const remaining = pool.find((clip) => !nextSlots.includes(clip.id));
    focusAfter.current = remaining
      ? `[data-lkia-pool] [data-lkia-clip="${numberOf(remaining.id)}"] [data-lkia-clip-button]`
      : '[data-lkia-check]';
  };
  // A pointer that clicked a control the move unmounts keeps focus in the board.
  const boardHasFocus = () => board.current?.contains(document.activeElement) === true;
  const place = (id: number, index: number, via: Via) => {
    if (index < 0 || index >= slots.length) return;
    const keepFocus = via === 'pointer' && boardHasFocus();
    flipFrom.current ??= clipRects(board.current);
    const nextSlots = placeClip(slots, id, index);
    setSlots(nextSlots);
    setResults([]);
    setSelected(null);
    announce(fillTemplate(chrome.placedLabel, { clip: nameOf(id), slot: index + 1 }));
    if (via === 'keyboard') focusNext(nextSlots);
    else if (keepFocus) {
      focusAfter.current = `[data-lkia-slot="${index}"] [data-lkia-clip-button]`;
    }
  };
  const returnToPool = (id: number, via: Via) => {
    if (!slots.includes(id)) return;
    const keepFocus = via === 'keyboard' || boardHasFocus();
    flipFrom.current ??= clipRects(board.current);
    setSlots(slots.map((value) => (value === id ? null : value)));
    setResults([]);
    setSelected(null);
    announce(fillTemplate(chrome.returnedLabel, { clip: nameOf(id) }));
    if (keepFocus) {
      focusAfter.current = `[data-lkia-pool] [data-lkia-clip="${numberOf(id)}"] [data-lkia-clip-button]`;
    }
  };
  const check = () => {
    if (!full) {
      announce(chrome.fillAllLabel);
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
      const done = completedScenes.includes(scene.id)
        ? completedScenes
        : [...completedScenes, scene.id];
      setCompletedScenes(done);
      announce(chrome.completeLabel);
      goTo('checked-correct');
      host.onEvent?.({ type: 'scramble.completed', activityId: activity.id, sceneId: scene.id });
      if (done.length === activity.scenes.length && completedScenes.length < activity.scenes.length)
        host.onEvent?.({ type: 'activity.completed', activityId: activity.id });
    } else {
      announce(
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
    announce(next !== null ? fillTemplate(chrome.selectedLabel, { clip: nameOf(next) }) : '');
  };
  const openVocab = () => {
    endDrag();
    setVocab(true);
    host.onEvent?.({ type: 'vocab.opened', activityId: activity.id });
  };
  const closeVocab = () => setVocab(false);
  const loopBlocked = () => setPaused(true);
  const loopFailed = () => {
    if (failedAnnounced.current) return;
    failedAnnounced.current = true;
    announce(chrome.mediaError);
  };

  const onPointerDown = (id: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
    // One drag at a time: a second finger never takes over a clip in flight.
    if (drag.current !== null || event.isPrimary === false) return;
    if (event.button !== 0 || (event.target as Element).closest('[data-lkia-no-drag]')) return;
    const element = event.currentTarget;
    // Captured from the press, so the release is seen wherever it happens.
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      /* Not every environment captures; pointerup on the clip still ends it. */
    }
    drag.current = {
      id,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      scale: stageScaleOf(board.current),
      element,
      lastX: event.clientX,
      tilt: 0,
    };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    // A mouse whose button is no longer held ended its drag somewhere we missed.
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      cancelDrag(event);
      return;
    }
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      current.moved = true;
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
  const cancelDrag = (event: { pointerId: number }) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.moved) flipFrom.current = clipRects(board.current);
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
    if (shortcuts && /^[1-9]$/.test(event.key) && index < slots.length) {
      event.preventDefault();
      place(id, index, 'keyboard');
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && slots.includes(id)) {
      event.preventDefault();
      returnToPool(id, 'keyboard');
    }
  };
  // The entrance plays once; later moves are flights (`data-flip`), not re-entrances.
  const onClipAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    event.currentTarget.setAttribute('data-entered', '');
    event.currentTarget.removeAttribute('data-flip');
  };

  const renderClip = (id: number, slotIndex?: number) => {
    const clip = scene.clips.find((item) => item.id === id);
    if (!clip) return null;
    const number = numberOf(id);
    const name = nameOf(id);
    const dragging = draggingId === id;
    const placedIn =
      slotIndex === undefined
        ? ''
        : `${name}, ${chrome.slotLabel} ${slotIndex + 1}${
            results[slotIndex] === undefined
              ? ''
              : `, ${results[slotIndex] ? chrome.correctLabel : chrome.incorrectLabel}`
          }`;
    const described = [
      `${helpId}-clip`,
      ...(slotIndex === undefined ? [] : [`${helpId}-hint-${slotIndex}`]),
    ].join(' ');
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
        onLostPointerCapture={cancelDrag}
        onAnimationEnd={onClipAnimationEnd}
        onClick={onClipClick(id)}
      >
        <LoopVideo
          clip={clip}
          host={host}
          paused={paused}
          errorLabel={chrome.mediaError}
          onBlocked={loopBlocked}
          onFailed={loopFailed}
        />
        <span data-lkia-grip="" aria-hidden="true">
          <Icon name="grip" />
        </span>
        <span data-lkia-clip-foot="">
          <button
            type="button"
            data-lkia-clip-button=""
            aria-pressed={selected === id}
            aria-describedby={described}
            aria-label={slotIndex === undefined ? name : placedIn}
            {...keyShortcuts(shortcuts, `1-${slots.length}`)}
            onKeyDown={onClipKeyDown(id)}
          >
            <span data-lkia-chip="">{number}</span>
            <span data-lkia-clip-name="">{name}</span>
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
      announce('');
      return;
    }
    if (shortcuts && !vocab && stage === 'arranging' && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      check();
    }
  };

  const unfinished = (index: number) => {
    const item = activity.scenes[index];
    return item !== undefined && index !== sceneIndex && !completedScenes.includes(item.id);
  };
  const after = activity.scenes.findIndex((_, index) => index > sceneIndex && unfinished(index));
  const nextScene =
    after !== -1 ? after : activity.scenes.findIndex((_, index) => unfinished(index));
  const pauseToggle = (
    <button
      type="button"
      data-lkia-pause=""
      data-animate="button-press"
      aria-pressed={paused}
      onClick={() => setPaused((value) => !value)}
    >
      <Icon name={paused ? 'play' : 'pause'} /> {paused ? chrome.resumeLabel : chrome.pauseLabel}
    </button>
  );
  let offset = 0;
  return (
    <Stage
      {...host}
      chromeLocale={chromeLocale}
      label={activity.title}
      style={activity.style ?? { presetId: 'cinema-dark', mode: 'dark' }}
      template="cine-scramble"
      stage={stage}
      {...(announcement !== undefined ? { announcement } : {})}
      onKeyDown={onKeyDown}
    >
      <div data-lkia-content="" inert={vocab}>
        <header data-lkia-bar="">
          {stage !== 'start' && activity.scenes.length > 1 && (
            <button
              type="button"
              data-lkia-back=""
              data-animate="button-press"
              onClick={() => goTo('start')}
            >
              <Icon name="back" /> {chrome.scenesLabel}
            </button>
          )}
          {stage !== 'start' && (
            <h1
              data-lkia-eyebrow=""
              data-lkia-focus={stage === 'arranging' ? '' : undefined}
              tabIndex={-1}
            >
              <span data-lkia-eyebrow-title="" {...content}>
                {activity.title}
              </span>
              <span data-lkia-eyebrow-count="">
                <span aria-hidden="true">· </span>
                <span {...content}>{scene.title}</span>
              </span>
            </h1>
          )}
          <span data-lkia-bar-tools="">
            {stage !== 'start' && pauseToggle}
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
          </span>
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
                        // Back at the scene list, focus returns to the scene the learner left.
                        {...(index === sceneIndex ? { 'data-lkia-focus': '' } : {})}
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
                  data-lkia-focus=""
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
            <p id={`${helpId}-help`} data-lkia-help="">
              {chrome.keyboardHelp}
            </p>
            <span id={`${helpId}-clip`} hidden>
              {shortcuts ? chrome.clipHelp : ''}
            </span>
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
                          aria-describedby={`${helpId}-hint-${index}`}
                          onClick={(event) => {
                            if (selected !== null) {
                              place(selected, index, event.detail === 0 ? 'keyboard' : 'pointer');
                            } else {
                              announce(chrome.selectFirstLabel);
                            }
                          }}
                        >
                          {chrome.emptySlotLabel}
                        </button>
                      )}
                    </div>
                    <p id={`${helpId}-hint-${index}`} data-lkia-hint="" {...content}>
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
                {...keyShortcuts(shortcuts, 'C')}
                onClick={check}
              >
                {chrome.checkLabel}
              </button>
            </div>
          </div>
        )}

        {stage === 'checked-correct' && (
          <div data-lkia-complete="" data-count={ordered.length} data-animate="panel-fade">
            <h2 data-lkia-celebrate="" data-lkia-focus="" tabIndex={-1}>
              <Icon name="check" /> {chrome.completeLabel}
            </h2>
            <section data-lkia-story="">
              <h3>{chrome.storyLabel}</h3>
              <p {...content}>{stitchCaptions(scene.clips)}</p>
            </section>
            <div data-lkia-pairs="">
              {wrapRows(ordered.length, ordered.length > 4 ? 3 : 2).map((count, row) => {
                const clips = ordered.slice(offset, offset + count);
                offset += count;
                return (
                  <div data-lkia-row={row} key={clips[0]?.id}>
                    {clips.map((clip, index) => (
                      <figure
                        key={clip.id}
                        data-animate="card-stagger"
                        style={{ '--i': row * count + index } as CSSProperties}
                      >
                        <LoopVideo
                          clip={clip}
                          host={host}
                          paused={paused}
                          errorLabel={chrome.mediaError}
                          onBlocked={loopBlocked}
                          onFailed={loopFailed}
                        />
                        <figcaption>
                          {/* The number the class used for this clip while arranging. */}
                          <span data-lkia-chip="">{numberOf(clip.id)}</span>
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
                <button type="button" data-animate="button-press" onClick={() => goTo('start')}>
                  {chrome.scenesLabel}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

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
