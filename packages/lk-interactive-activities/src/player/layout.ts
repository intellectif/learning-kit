/** The landscape stage's design size, in CSS pixels; it is scaled to fit. */
export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

/**
 * The smallest scale the landscape stage is drawn at. Below it, text and
 * controls would shrink under readable and touchable sizes (and browser zoom
 * would only shrink them further), so the player stacks instead, at real CSS
 * sizes that zoom enlarges. 0.55 keeps body text at about 16px.
 */
export const MIN_STAGE_SCALE = 0.55;

export interface PlayerViewport {
  width: number;
  height: number;
}

/**
 * `landscape` (the scaled 1920×1080 stage) when the space is wide and large
 * enough to draw it at {@link MIN_STAGE_SCALE} or more; otherwise `portrait`,
 * the stacked layout phones and small panes get.
 */
export function resolveLayout(width: number, height: number): 'landscape' | 'portrait' {
  return width >= height && stageScale(width, height) >= MIN_STAGE_SCALE ? 'landscape' : 'portrait';
}

export function stageScale(width: number, height: number): number {
  return Math.max(0, Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT));
}
