import { SPEEDS } from './format.js';

/** The size captions are drawn at. */
export type CaptionSize = 'small' | 'medium' | 'large';

/** What the player remembers between videos, for one browser. */
export interface VideoPreferences {
  /** One of the speed list. */
  speed: number;
  /** 0 to 1. */
  volume: number;
  muted: boolean;
  /** Captions shown. */
  captions: boolean;
  /** The caption language chosen, as a track's `srclang`; null for the default track. */
  captionLanguage: string | null;
  captionSize: CaptionSize;
  /** A dark box behind each caption line. Off draws the text with an outline only. */
  captionBackground: boolean;
  /** The contents and transcript panel is open. */
  panel: boolean;
  /** Single-key shortcuts act while the player has focus (WCAG 2.1.4 lets a learner turn them off). */
  shortcuts: boolean;
}

export const DEFAULT_PREFERENCES: VideoPreferences = {
  speed: 1,
  volume: 1,
  muted: false,
  captions: true,
  captionLanguage: null,
  captionSize: 'medium',
  captionBackground: true,
  panel: false,
  shortcuts: true,
};

const STORAGE_KEY = 'lk.video.v1';

/**
 * Clamps every value on the way IN. Anything in storage is writable by the
 * learner and survives a schema change, so it is input from a stranger: one
 * `volume: 50` must not mute every video, and a `speed: null` must not pin
 * playback at a rate the menu cannot undo.
 */
export function sanitizePreferences(raw: unknown): VideoPreferences {
  if (typeof raw !== 'object' || raw === null) {
    return DEFAULT_PREFERENCES;
  }
  const value = raw as Partial<Record<keyof VideoPreferences, unknown>>;
  const bool = (input: unknown, fallback: boolean): boolean =>
    typeof input === 'boolean' ? input : fallback;
  const speed = (SPEEDS as readonly unknown[]).includes(value.speed)
    ? (value.speed as number)
    : DEFAULT_PREFERENCES.speed;
  const volume =
    typeof value.volume === 'number' && Number.isFinite(value.volume)
      ? Math.min(1, Math.max(0, value.volume))
      : DEFAULT_PREFERENCES.volume;
  const size =
    value.captionSize === 'small' || value.captionSize === 'medium' || value.captionSize === 'large'
      ? value.captionSize
      : DEFAULT_PREFERENCES.captionSize;
  const language =
    typeof value.captionLanguage === 'string' &&
    /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(value.captionLanguage)
      ? value.captionLanguage
      : null;
  return {
    speed,
    volume,
    muted: bool(value.muted, DEFAULT_PREFERENCES.muted),
    captions: bool(value.captions, DEFAULT_PREFERENCES.captions),
    captionLanguage: language,
    captionSize: size,
    captionBackground: bool(value.captionBackground, DEFAULT_PREFERENCES.captionBackground),
    panel: bool(value.panel, DEFAULT_PREFERENCES.panel),
    shortcuts: bool(value.shortcuts, DEFAULT_PREFERENCES.shortcuts),
  };
}

/**
 * The stored preferences. Every read goes through a `try`: a private window,
 * blocked site data or a sandboxed frame throws on `localStorage` itself.
 */
export function readPreferences(): VideoPreferences {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return stored ? sanitizePreferences(JSON.parse(stored)) : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Remembers the preferences. A browser that will not store them loses nothing but the memory. */
export function writePreferences(preferences: VideoPreferences): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* storage refused: the preferences still apply for this video */
  }
}
