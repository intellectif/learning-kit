import {
  type CSSProperties,
  type KeyboardEventHandler,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { StyleChoice } from '../contract/types.js';
import { interactiveActivitiesStylesheet } from '../style/css.js';
import { postEmbedResize } from './embed.js';
import { resolveLayout, STAGE_HEIGHT, STAGE_WIDTH, stageScale } from './layout.js';
import { DEFAULT_CHROME_LOCALE, languageAttributes } from './locale.js';
import { PLAYER_CSS } from './player-css.js';
import type { PlayerHostOptions } from './types.js';

export interface StageProps extends PlayerHostOptions {
  children: ReactNode;
  style: StyleChoice;
  template: string;
  stage: string;
  /** Accessible name of the player region: the activity's title. */
  label?: string;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
}

export function Stage({
  children,
  style,
  template,
  stage,
  label,
  locale,
  viewport,
  reducedMotion,
  embed,
  onKeyDown,
}: StageProps) {
  const id = useId();
  const root = useRef<HTMLElement>(null);
  const previousStage = useRef(stage);
  useEffect(() => {
    if (previousStage.current !== stage && !root.current?.contains(document.activeElement))
      root.current?.focus({ preventScroll: true });
    previousStage.current = stage;
  }, [stage]);
  const [size, setSize] = useState(() => ({ width: STAGE_WIDTH, height: STAGE_HEIGHT }));
  // Fits the space it is given: the width of its container (an iframe's body,
  // a page column, a studio preview pane) and the height of the window.
  useEffect(() => {
    const container = root.current?.parentElement ?? null;
    const resize = () => {
      const available = container?.clientWidth ?? 0;
      setSize({
        width: available > 0 ? Math.min(available, window.innerWidth) : window.innerWidth,
        height: window.innerHeight,
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
  }, []);
  const { width, height } = viewport ?? size;
  const layout = resolveLayout(width, height);
  const scale = stageScale(width, height);
  const postResize = embed?.postResize === true;
  useEffect(() => {
    const element = root.current;
    if (!postResize || !element) return;
    const post = () => {
      const rect = element.getBoundingClientRect();
      postEmbedResize(rect.width || width, rect.height || height);
    };
    post();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(post);
    observer.observe(element);
    return () => observer.disconnect();
  }, [postResize, width, height]);
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
      {...languageAttributes(locale ?? DEFAULT_CHROME_LOCALE)}
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
    </section>
  );
}
