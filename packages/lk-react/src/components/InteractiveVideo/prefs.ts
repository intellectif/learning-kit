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
  /** Captions shown — both lines, when there are two. */
  captions: boolean;
  /** The caption language chosen, as a track's `srclang`; null for the default track. */
  captionLanguage: string | null;
  /**
   * A second caption language, drawn under the first, as a track's `srclang`;
   * null for none. A learner's preference, never content: nothing about it is
   * authored. Never the same as `captionLanguage` — a pair of one language is
   * normalised to no second line.
   */
  secondaryCaptionLanguage: string | null;
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
  secondaryCaptionLanguage: null,
  captionSize: 'medium',
  captionBackground: true,
  panel: false,
  shortcuts: true,
};

const STORAGE_KEY = 'lk.video.v1';

/** A BCP 47 tag as a track's `srclang` carries one: `en`, `pt-BR`, `es-419`. */
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

const BOOLEAN_FIELDS = ['muted', 'captions', 'captionBackground', 'panel', 'shortcuts'] as const;
const LANGUAGE_FIELDS = ['captionLanguage', 'secondaryCaptionLanguage'] as const;

/**
 * Every field of `raw` that is present and usable, clamped — and nothing at
 * all for a field that is absent or unusable, so a layer below it applies.
 *
 * Anything in storage is writable by the learner and survives a schema
 * change, so it is input from a stranger: one `volume: 50` must not mute every
 * video, and a `speed: null` must not pin playback at a rate the menu cannot
 * undo. A host's layers go through here too — a `speed: 3` is no more a rate
 * the menu can undo for having come from code.
 *
 * `null` is a value for the two language fields (the default track; no second
 * line), so it counts as present; an unparseable tag does not.
 */
export function sanitizePartialPreferences(raw: unknown): Partial<VideoPreferences> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }
  const value = raw as Partial<Record<keyof VideoPreferences, unknown>>;
  const has = (key: keyof VideoPreferences): boolean => Object.hasOwn(value, key);
  const out: Partial<VideoPreferences> = {};
  if (has('speed') && (SPEEDS as readonly unknown[]).includes(value.speed)) {
    out.speed = value.speed as number;
  }
  if (has('volume') && typeof value.volume === 'number' && Number.isFinite(value.volume)) {
    out.volume = Math.min(1, Math.max(0, value.volume));
  }
  for (const field of BOOLEAN_FIELDS) {
    if (has(field) && typeof value[field] === 'boolean') {
      out[field] = value[field] as boolean;
    }
  }
  for (const field of LANGUAGE_FIELDS) {
    const tag = value[field];
    if (has(field) && (tag === null || (typeof tag === 'string' && LANGUAGE_TAG.test(tag)))) {
      out[field] = tag as string | null;
    }
  }
  if (
    has('captionSize') &&
    (value.captionSize === 'small' ||
      value.captionSize === 'medium' ||
      value.captionSize === 'large')
  ) {
    out.captionSize = value.captionSize;
  }
  return out;
}

/** A pair of one language is no pair: the second line is dropped, case-insensitively. */
function normalised(preferences: VideoPreferences): VideoPreferences {
  const { captionLanguage: first, secondaryCaptionLanguage: second } = preferences;
  return first !== null && second !== null && first.toLowerCase() === second.toLowerCase()
    ? { ...preferences, secondaryCaptionLanguage: null }
    : preferences;
}

/** A whole, clamped set of preferences from anything: what is unusable takes its default. */
export function sanitizePreferences(raw: unknown): VideoPreferences {
  return normalised({ ...DEFAULT_PREFERENCES, ...sanitizePartialPreferences(raw) });
}

/**
 * The preferences in force, decided field by field, highest first:
 *
 * 1. `force` — the host's `preferences` prop, which overrides what the
 *    learner chose, on every mount;
 * 2. `stored` — what the learner chose in this browser;
 * 3. `defaults` — the host's `defaultPreferences` prop: a starting point, such
 *    as a language pair kept on the learner's account;
 * 4. the SDK's own defaults.
 *
 * Deciding per field is the point: a learner who has only ever changed the
 * volume has chosen no caption language, so the host's suggested pair applies
 * to them — where a whole stored object would have beaten it.
 */
export function resolvePreferences(layers: {
  force?: unknown;
  stored?: unknown;
  defaults?: unknown;
  /**
   * What the learner changed while this video has been open. Above the force,
   * which applies when the video opens: a learner who closes a panel the host
   * opened keeps it closed when the preferences are next resolved — when the
   * host's `defaultPreferences` change, say.
   */
  chosen?: unknown;
}): VideoPreferences {
  return normalised({
    ...DEFAULT_PREFERENCES,
    ...sanitizePartialPreferences(layers.defaults),
    ...sanitizePartialPreferences(layers.stored),
    ...sanitizePartialPreferences(layers.force),
    ...sanitizePartialPreferences(layers.chosen),
  });
}

/** `previous` with a learner's change applied, clamped and normalised like everything else. */
export function applyPreferenceChange(
  previous: VideoPreferences,
  change: Partial<VideoPreferences>,
): VideoPreferences {
  return normalised({ ...previous, ...sanitizePartialPreferences(change) });
}

/**
 * What the learner chose in this browser: only the fields present in storage.
 * Every read goes through a `try`: a private window, blocked site data or a
 * sandboxed frame throws on `localStorage` itself.
 */
export function readStoredPreferences(): Partial<VideoPreferences> {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return stored ? sanitizePartialPreferences(JSON.parse(stored)) : {};
  } catch {
    return {};
  }
}

/**
 * Remembers a learner's change: the fields they changed, merged into what they
 * chose before. Only what the learner chose is stored — never a value the host
 * forced or suggested — so a host that later suggests a different pair still
 * reaches a learner who never picked one. A payload written by 15.0, which
 * stored every field, reads as every field chosen: the behaviour it had.
 *
 * A browser that will not store them loses nothing but the memory.
 */
export function rememberPreferences(change: Partial<VideoPreferences>): void {
  try {
    const next = { ...readStoredPreferences(), ...sanitizePartialPreferences(change) };
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage refused: the preferences still apply for this video */
  }
}
