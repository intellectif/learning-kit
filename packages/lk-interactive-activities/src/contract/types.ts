/** A media file the host resolves at render time. */
export interface AssetRef {
  assetKey: string;
  url?: string;
}

export type ColorMode = 'light' | 'dark' | 'auto';
export type VideoAspect = '9:16' | '16:9';

/** Editor/AI pick from the style catalog by stable ID (FR-35). */
export interface StyleChoice {
  presetId: string;
  mode?: ColorMode;
  fonts?: {
    heading?: string;
    body?: string;
  };
  motionPresetId?: string;
}

export interface ValidationIssue {
  path: Array<string | number>;
  message: string;
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationIssue[] };

/** One file an activity needs, for the host's upload checklist or export manifest. */
export interface TemplateMediaSlot {
  path: Array<string | number>;
  kind: 'video' | 'image' | 'audio';
  assetKey?: string;
}

export interface TemplateDefinition<TData = unknown> {
  id: string;
  version: string;
  label: string;
  activityType: string;
  validate(data: unknown): ValidationResult<TData>;
  jsonSchema: Record<string, unknown>;
  mediaSlots(data: TData): TemplateMediaSlot[];
}
