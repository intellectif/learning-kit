import { isAllowedFont, isMotionPresetId, isStylePresetId } from '../style/catalog.js';
import type { AssetRef, StyleChoice, ValidationIssue, ValidationResult } from './types.js';

/** Where a value sits in an activity: object keys and array indexes. */
export type Path = Array<string | number>;

/**
 * The issues one validation collects. Every issue carries a stable `code` a host
 * can branch on (see {@link ValidationIssueCode}); the message is for people.
 */
export class Issues {
  readonly list: ValidationIssue[] = [];

  add(path: Path, code: ValidationIssueCode, message: string): void {
    this.list.push({ path, code, message });
  }

  get count(): number {
    return this.list.length;
  }
}

/**
 * The stable codes of a {@link ValidationIssue}. New codes may be added in a
 * minor release; an existing code keeps its meaning.
 */
export type ValidationIssueCode =
  | 'required'
  | 'expected_object'
  | 'expected_array'
  | 'expected_string'
  | 'expected_number'
  | 'expected_boolean'
  | 'empty'
  | 'unknown_template'
  | 'unknown_schema_version'
  | 'unknown_style_preset'
  | 'unknown_motion_preset'
  | 'unknown_font'
  | 'invalid_option'
  | 'invalid_locale'
  | 'unsafe_url'
  | 'count_out_of_range'
  | 'not_positive'
  | 'freeze_out_of_bounds'
  | 'duplicate_id'
  | 'duplicate_item'
  | 'not_chronological'
  | 'reveal_field'
  | 'author_only_field';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

interface Presence {
  /** When false, `undefined` is accepted and returns `undefined` with no issue. */
  required?: boolean;
}

export function objectAt(
  issues: Issues,
  value: unknown,
  path: Path,
  { required = true }: Presence = {},
): Record<string, unknown> | undefined {
  if (value === undefined) {
    if (required) issues.add(path, 'required', 'Required.');
    return undefined;
  }
  if (!isRecord(value)) {
    issues.add(path, 'expected_object', 'Expected an object.');
    return undefined;
  }
  return value;
}

export function arrayAt(
  issues: Issues,
  value: unknown,
  path: Path,
  { required = true }: Presence = {},
): unknown[] | undefined {
  if (value === undefined) {
    if (required) issues.add(path, 'required', 'Required.');
    return undefined;
  }
  if (!Array.isArray(value)) {
    issues.add(path, 'expected_array', 'Expected a list.');
    return undefined;
  }
  return value;
}

export function stringAt(
  issues: Issues,
  value: unknown,
  path: Path,
  { required = true, allowEmpty = false }: Presence & { allowEmpty?: boolean } = {},
): string | undefined {
  if (value === undefined) {
    if (required) issues.add(path, 'required', 'Required.');
    return undefined;
  }
  if (typeof value !== 'string') {
    issues.add(path, 'expected_string', 'Expected text.');
    return undefined;
  }
  if (!allowEmpty && value.trim() === '') {
    issues.add(path, 'empty', 'Expected text that is not empty.');
    return undefined;
  }
  return value;
}

export function numberAt(
  issues: Issues,
  value: unknown,
  path: Path,
  { required = true }: Presence = {},
): number | undefined {
  if (value === undefined) {
    if (required) issues.add(path, 'required', 'Required.');
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.add(path, 'expected_number', 'Expected a finite number.');
    return undefined;
  }
  return value;
}

export function booleanAt(
  issues: Issues,
  value: unknown,
  path: Path,
  { required = true }: Presence = {},
): boolean | undefined {
  if (value === undefined) {
    if (required) issues.add(path, 'required', 'Required.');
    return undefined;
  }
  if (typeof value !== 'boolean') {
    issues.add(path, 'expected_boolean', 'Expected true or false.');
    return undefined;
  }
  return value;
}

export function oneOfAt<T extends string>(
  issues: Issues,
  value: unknown,
  path: Path,
  options: readonly T[],
  { required = true }: Presence = {},
): T | undefined {
  if (value === undefined) {
    if (required) issues.add(path, 'required', 'Required.');
    return undefined;
  }
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) {
    issues.add(
      path,
      'invalid_option',
      `Expected one of ${options.map((o) => `"${o}"`).join(', ')}.`,
    );
    return undefined;
  }
  return value as T;
}

/** A BCP 47 tag `Intl` accepts (`en`, `es-CO`, `es-419`, `zh-Hant`). */
export function localeAt(
  issues: Issues,
  value: unknown,
  path: Path,
  presence: Presence = {},
): string | undefined {
  const tag = stringAt(issues, value, path, presence);
  if (tag === undefined) return undefined;
  try {
    Intl.getCanonicalLocales(tag);
    return tag;
  } catch {
    issues.add(path, 'invalid_locale', `"${tag}" is not a language tag, such as "en" or "es-CO".`);
    return undefined;
  }
}

/**
 * Whether a media URL may be handed to a player: a relative path, or an
 * `http(s)`, `blob`, or `file` URL, or a `data:` URL of an image, audio or
 * video. Script-running schemes (`javascript:`, `vbscript:`, `data:text/html`)
 * are refused.
 */
export function isSafeMediaUrl(url: string): boolean {
  const scheme = /^\s*([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (scheme === undefined) return true;
  if (['http', 'https', 'blob', 'file'].includes(scheme)) return true;
  return scheme === 'data' && /^\s*data:(image|audio|video)\//i.test(url);
}

/** An {@link AssetRef}: a non-empty `assetKey` and an optional safe `url`. Unknown keys are kept. */
export function assetRefAt(
  issues: Issues,
  value: unknown,
  path: Path,
  presence: Presence = {},
): (AssetRef & Record<string, unknown>) | undefined {
  const object = objectAt(issues, value, path, presence);
  if (object === undefined) return undefined;
  const before = issues.count;
  const assetKey = stringAt(issues, object.assetKey, [...path, 'assetKey']);
  const url = stringAt(issues, object.url, [...path, 'url'], { required: false, allowEmpty: true });
  if (url !== undefined && !isSafeMediaUrl(url)) {
    issues.add(
      [...path, 'url'],
      'unsafe_url',
      'Expected a relative path or an http(s), blob or file URL.',
    );
  }
  if (issues.count > before || assetKey === undefined) return undefined;
  return { ...object, assetKey };
}

/** A {@link StyleChoice} whose every ID is in the catalog. Unknown keys are kept. */
export function styleAt(
  issues: Issues,
  value: unknown,
  path: Path,
  presence: Presence = {},
): StyleChoice | undefined {
  const object = objectAt(issues, value, path, presence);
  if (object === undefined) return undefined;
  const before = issues.count;
  const presetId = stringAt(issues, object.presetId, [...path, 'presetId']);
  if (presetId !== undefined && !isStylePresetId(presetId)) {
    issues.add(
      [...path, 'presetId'],
      'unknown_style_preset',
      `Unknown style preset "${presetId}".`,
    );
  }
  oneOfAt(issues, object.mode, [...path, 'mode'], ['light', 'dark', 'auto'], { required: false });
  const motion = stringAt(issues, object.motionPresetId, [...path, 'motionPresetId'], {
    required: false,
  });
  if (motion !== undefined && !isMotionPresetId(motion)) {
    issues.add(
      [...path, 'motionPresetId'],
      'unknown_motion_preset',
      `Unknown motion preset "${motion}".`,
    );
  }
  let fonts: StyleChoice['fonts'];
  const fontsObject = objectAt(issues, object.fonts, [...path, 'fonts'], { required: false });
  if (fontsObject !== undefined) {
    fonts = { ...fontsObject };
    for (const key of ['heading', 'body'] as const) {
      const font = stringAt(issues, fontsObject[key], [...path, 'fonts', key], { required: false });
      if (font !== undefined && !isAllowedFont(font)) {
        issues.add([...path, 'fonts', key], 'unknown_font', `Unknown font "${font}".`);
      }
    }
  }
  if (issues.count > before || presetId === undefined) return undefined;
  return { ...object, presetId, ...(fonts !== undefined ? { fonts } : {}) } as StyleChoice;
}

/** Chrome copy: every known key, when present, is non-empty text. Unknown keys are kept. */
export function copyAt(
  issues: Issues,
  value: unknown,
  path: Path,
  knownKeys: readonly string[],
): Record<string, unknown> | undefined {
  const object = objectAt(issues, value, path, { required: false });
  if (object === undefined) return undefined;
  for (const key of knownKeys) stringAt(issues, object[key], [...path, key], { required: false });
  return { ...object };
}

/** Rejects the authoring-only keys a learner's copy must not carry. */
export function refuseKeys(
  issues: Issues,
  object: Record<string, unknown>,
  path: Path,
  keys: readonly string[],
  code: ValidationIssueCode,
  message: string,
): void {
  for (const key of keys) {
    if (key in object) issues.add([...path, key], code, message);
  }
}

/**
 * A deep copy of validated JSON, so a caller who edits the result never edits
 * the input. Values that cannot be cloned (a host's function) are kept as is.
 */
export function detached<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

export function result<T>(issues: Issues, data: T | undefined): ValidationResult<T> {
  if (issues.count > 0 || data === undefined) {
    return {
      success: false,
      errors:
        issues.count > 0 ? issues.list : [{ path: [], code: 'required', message: 'Incomplete.' }],
    };
  }
  return { success: true, data };
}
