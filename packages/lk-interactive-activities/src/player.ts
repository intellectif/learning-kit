/**
 * The players: React 19 client components. Import them from
 * `@intellectif/lk-interactive-activities/player`; the package root holds the
 * contracts (validators, schemas, AI specs, styles, fonts, xAPI) and no React.
 */

export { postEmbedResize } from './player/embed.js';
export type { InteractiveActivityPlayerProps } from './player/InteractiveActivityPlayer.js';
export { InteractiveActivityPlayer } from './player/InteractiveActivityPlayer.js';
export type { PlayerViewport } from './player/layout.js';
export {
  MIN_STAGE_SCALE,
  resolveLayout,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  stageScale,
} from './player/layout.js';
export type { TemplatePlayerProps } from './player/registry.js';
export { getTemplatePlayer, registerTemplatePlayer } from './player/registry.js';
export type { PlayerHostOptions } from './player/types.js';
export type { CineScramblePlayerProps } from './templates/cine-scramble/player/CineScramblePlayer.js';
export { CineScramblePlayer } from './templates/cine-scramble/player/CineScramblePlayer.js';
export type { WhatHappensPlayerProps } from './templates/what-happens/player/WhatHappensPlayer.js';
export { WhatHappensPlayer } from './templates/what-happens/player/WhatHappensPlayer.js';
