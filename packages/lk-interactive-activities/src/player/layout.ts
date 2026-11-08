export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;
export interface PlayerViewport {
  width: number;
  height: number;
}
export function resolveLayout(width: number, height: number): 'landscape' | 'portrait' {
  return width >= height && width >= 640 ? 'landscape' : 'portrait';
}
export function stageScale(width: number, height: number): number {
  return Math.max(0, Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT));
}
