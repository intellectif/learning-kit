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
import { PLAYER_CSS } from './player-css.js';
import type { PlayerHostOptions } from './types.js';
export interface StageProps extends PlayerHostOptions {
  children: ReactNode;
  style: StyleChoice;
  template: string;
  stage: string;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}
export function Stage({
  children,
  style,
  template,
  stage,
  viewport,
  reducedMotion,
  embed,
  onKeyDown,
}: StageProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const previousStage = useRef(stage);
  useEffect(() => {
    if (previousStage.current !== stage && !root.current?.contains(document.activeElement))
      root.current?.focus();
    previousStage.current = stage;
  }, [stage]);
  const [size, setSize] = useState(() => ({ width: 1920, height: 1080 }));
  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const { width, height } = viewport ?? size;
  const layout = resolveLayout(width, height);
  const scale = stageScale(width, height);
  useEffect(() => {
    if (embed?.postResize) postEmbedResize(width, height);
  }, [embed?.postResize, width, height]);
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
    <div
      ref={root}
      role="application"
      aria-label={template}
      tabIndex={-1}
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
    </div>
  );
}
