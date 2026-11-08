import type { TemplateAiSpec } from './ai-spec.js';
import type { ValidationIssueCode } from './read.js';

export type { ValidationIssueCode } from './read.js';

/** A media file the host resolves at render time. */
export interface AssetRef {
  /** The host's key for the file (for example its storage key). */
  assetKey: string;
  /** A URL the host already resolved; `resolveUrl` may ignore it. */
  url?: string;
}

export type ColorMode = 'light' | 'dark' | 'auto';
export type VideoAspect = '9:16' | '16:9';

/** Editor/AI pick from the style catalog by stable ID (FR-35). */
export interface StyleChoice {
  presetId: string;
  /** Light, dark, or the viewer's system setting (`auto`, the default). */
  mode?: ColorMode;
  fonts?: {
    heading?: string;
    body?: string;
  };
  /** Defaults to the style preset's own motion preset. */
  motionPresetId?: string;
}

export interface ValidationIssue {
  path: Array<string | number>;
  /** Stable; branch on this, not on the message. */
  code: ValidationIssueCode;
  message: string;
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationIssue[] };

/**
 * One file an activity has or needs, for a host's upload checklist or an
 * offline export manifest. Optional slots are listed whether or not they are
 * filled; `present` says which.
 */
export interface TemplateMediaSlot {
  /** From the activity to the asset reference, e.g. `['clips', 2, 'video']`. */
  path: Array<string | number>;
  kind: 'video' | 'image' | 'audio' | 'captions';
  /** The slot's role, for a checklist label: `video`, `thumb`, `poster`, `audio`, `captions`. */
  role: 'video' | 'thumb' | 'poster' | 'audio' | 'captions';
  /** Whether a publishable activity must have this file. */
  required: boolean;
  /** Whether the activity has a file here now (a non-empty `assetKey`). */
  present: boolean;
  assetKey?: string;
  /** For a video slot: the aspect the editor chose. */
  aspect?: VideoAspect;
  /** For a video slot: the duration the host recorded, in seconds. */
  durationS?: number;
  /** The clip or scene this slot belongs to, for a checklist. */
  label?: string;
}

export interface TemplateDefinition<TData = unknown> {
  id: string;
  version: string;
  label: string;
  activityType: string;
  /** Whether stored JSON is a publishable activity of this template. */
  validate(data: unknown): ValidationResult<TData>;
  /**
   * A new, unauthored activity for an editor to start from. It is not
   * publishable: `validate` refuses it until it is written and its media are
   * uploaded, and lk-core's `validateDraft` reports it as `incomplete`.
   */
  createDraft(id?: string): TData;
  jsonSchema: Record<string, unknown>;
  aiSpec: TemplateAiSpec;
  /** Every file the activity has or needs. Accepts partial drafts. */
  mediaSlots(data: TData): TemplateMediaSlot[];
}
