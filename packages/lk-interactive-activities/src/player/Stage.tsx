import {
  type CSSProperties,
  type KeyboardEventHandler,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { StyleChoice } from '../contract/types.js';
import { interactiveActivitiesStylesheet } from '../style/css.js';
import { postEmbedResize } from './embed.js';
import { resolveLayout, STAGE_HEIGHT, STAGE_WIDTH, stageScale } from './layout.js';
import { languageAttributes } from './locale.js';
import { PLAYER_CSS } from './player-css.js';
import type { PlayerHostOptions } from './types.js';

/** A status message; a new `id` announces it again even when the text repeats. */
export interface Announcement {
  id: number;
  text: string;
}

export interface StageProps extends Omit<PlayerHostOptions, 'locale'> {
  children: ReactNode;
  style: StyleChoice;
  template: string;
  stage: string;
  /** Accessible name of the player region: the activity's title. */
  label?: string;
  /** The language the chrome is actually written in (not merely asked for). */
  chromeLocale: string;
  /** Read out by the player's one status region. */
  announcement?: Announcement;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
}

/**
 * The width a container gives its content: `clientWidth` without its side
 * padding. `clientWidth` alone counts the padding, so a host column with side
 * padding would get a player as wide as the column's outer edge, overflowing it.
 */
export function contentWidth(container: Element): number {
  const style = getComputedStyle(container);
  const padding =
    (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  return Math.max(0, container.clientWidth - padding);
}

/**
 * The shell both players draw in: the scoped stylesheet, the scaled landscape
 * stage or the stacked layout, focus on stage changes, one polite status region,
 * and the optional resize messages.
 */
export function Stage({
  children,
  style,
  template,
  stage,
  label,
  chromeLocale,
  announcement,
  viewport,
  reducedMotion,
  embed,
  onKeyDown,
}: StageProps) {
  const id = useId();
  const root = useRef<HTMLElement>(null);
  const previousStage = useRef(stage);
  const embedded = embed?.postResize === true;

  // After a stage change, focus the new step's heading (or what the step marks
  // with `data-lkia-focus`), but only when focus was in the player or nowhere:
  // a stage the player changes by itself (the freeze, the end of a clip) never
  // takes focus from the host page. A control marked `data-lkia-keep-focus`
  // that is still there after the change (a toggle that stays in place) keeps it.
  useLayoutEffect(() => {
    if (previousStage.current === stage) return;
    previousStage.current = stage;
    const element = root.current;
    if (!element) return;
    const active = document.activeElement;
    const ownsFocus = active === null || active === document.body || element.contains(active);
    if (!ownsFocus) return;
    if (active instanceof HTMLElement && active.hasAttribute('data-lkia-keep-focus')) return;
    const target = element.querySelector<HTMLElement>('[data-lkia-focus]');
    (target ?? element).focus({ preventScroll: true });
  }, [stage]);

  // A message is cleared, then set, so a repeated message is read again.
  const [spoken, setSpoken] = useState('');
  useEffect(() => {
    if (!announcement) return;
    setSpoken('');
    const timer = setTimeout(() => setSpoken(announcement.text), 60);
    return () => clearTimeout(timer);
  }, [announcement]);

  // Fits the space it is given: the width of its container (an iframe's body,
  // a page column, a studio preview pane) and the height of the window. In
  // embed mode the host sizes the iframe from the messages, so only the width
  // counts.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const container = root.current?.parentElement ?? null;
    const resize = () => {
      const available = container ? contentWidth(container) : 0;
      setSize({
        width: available > 0 ? Math.min(available, window.innerWidth) : window.innerWidth,
        height: embedded ? Number.POSITIVE_INFINITY : window.innerHeight,
      });
    };
    resize();
    window.addEventListener('resize', resize);
    const observer =
      container && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : undefined;
    if (container) observer?.observe(container);
    return () => {
      window.removeEventListener('resize', resize);
      observer?.disconnect();
    };
  }, [embedded]);
  const { width, height } = viewport ?? size ?? { width: STAGE_WIDTH, height: STAGE_HEIGHT };
  const layout = resolveLayout(width, height);
  const scale = stageScale(width, height);
  const measured = viewport !== undefined || size !== null;

  useEffect(() => {
    const element = root.current;
    if (!embedded || !measured || !element) return;
    const post = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) postEmbedResize(rect.width, rect.height);
    };
    post();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(post);
    observer.observe(element);
    return () => observer.disconnect();
  }, [embedded, measured]);

  const stageStyle: CSSProperties =
    layout === 'landscape'
      ? {
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }
      : { width: '100%' };
  return (
    <section
      ref={root}
      aria-label={label ?? template}
      tabIndex={-1}
      {...languageAttributes(chromeLocale)}
      data-lkia-root={id}
      data-lkia-mode={style.mode ?? 'auto'}
      data-lkia-template={template}
      data-stage={stage}
      data-lkia-layout={layout}
      data-reduced-motion={reducedMotion}
      onKeyDown={onKeyDown}
      style={
        layout === 'landscape'
          ? { width: STAGE_WIDTH * scale, height: STAGE_HEIGHT * scale }
          : { width: '100%' }
      }
    >
      <style>
        {(interactiveActivitiesStylesheet(style) + PLAYER_CSS).replaceAll(
          '[data-lkia-root]',
          `[data-lkia-root="${id}"]`,
        )}
      </style>
      <div data-lkia-stage="" style={stageStyle}>
        {children}
      </div>
      <p role="status" data-lkia-status="">
        {spoken}
      </p>
    </section>
  );
}
