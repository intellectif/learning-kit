import type { CineScrambleCopy } from '../templates/cine-scramble/schema.js';
import type { WhatHappensCopy } from '../templates/what-happens/schema.js';
import type { PlayerEvent } from './events.js';
import type { PlayerViewport } from './layout.js';
import type { AssetUrlResolver } from './resolve-url.js';
export interface PlayerHostOptions {
  resolveUrl?: AssetUrlResolver;
  onEvent?: (event: PlayerEvent) => void;
  /** Host overrides activity copy, which overrides locale defaults. */
  strings?: WhatHappensCopy & CineScrambleCopy;
  reducedMotion?: boolean;
  embed?: { postResize: boolean };
  /** Optional constrained viewport; otherwise follows the embedding window. */
  viewport?: PlayerViewport;
}
