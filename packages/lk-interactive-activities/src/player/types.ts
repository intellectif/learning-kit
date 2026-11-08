import type { CineScrambleCopy } from '../templates/cine-scramble/schema.js';
import type { WhatHappensCopy } from '../templates/what-happens/schema.js';
import type { PlayerEvent } from './events.js';
import type { PlayerViewport } from './layout.js';
import type { AssetUrlResolver } from './resolve-url.js';
export interface PlayerHostOptions {
  /**
   * Turns an asset reference into a URL. Return the same URL for the same
   * asset until it really changes (a refreshed signature): a new URL reloads
   * the media.
   */
  resolveUrl?: AssetUrlResolver;
  onEvent?: (event: PlayerEvent) => void;
  /**
   * BCP 47 tag of the player's chrome (buttons, labels). Independent of the
   * activity's `locale`, which is the language of its content. Built-in chrome
   * is English (the default) and Spanish (any `es` tag).
   */
  locale?: string;
  /** Replaces the built-in chrome. The activity's own `copy` still wins. */
  strings?: WhatHappensCopy & CineScrambleCopy;
  reducedMotion?: boolean;
  /** Posts the player's rendered size to the parent window as it changes. */
  embed?: { postResize: boolean };
  /**
   * The space to fit, in CSS pixels. By default the player fits its container's
   * width and the window's height; pass this where neither describes it.
   */
  viewport?: PlayerViewport;
}
