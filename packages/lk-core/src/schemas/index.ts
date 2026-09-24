import { UnknownActivityTypeError } from '../errors.js';
import { getActivityTypeDescriptor } from '../registry/index.js';
import type {
  ActivityDataMap,
  ActivityMedia,
  ActivityType,
  MultipleChoiceOptionMedia,
  ValidationResult,
} from '../types/activity.js';
import { MediaSchema } from './media.js';
import { MultipleChoiceOptionMediaSchema } from './multiple-choice.js';
import { readSchema, type SchemaReading } from './read-schema.js';

export type {
  RedactedActivity,
  RedactedBlankConfig,
  RedactedDictationData,
  RedactedDictationSlowMedia,
  RedactedFillInTheBlanksData,
  RedactedGapSelectBank,
  RedactedGapSelectChoice,
  RedactedGapSelectData,
  RedactedGapSelectGap,
  RedactedMultipleChoiceData,
  RedactedMultipleChoiceOption,
  RedactedMultipleChoiceOptionMedia,
  RedactedReadAloudData,
  RedactedStimulus,
  RedactedWrittenResponseData,
} from '../types/redacted.js';
export { validateItemGroup } from './item-group.js';
export {
  dictationJsonSchema,
  fillInTheBlanksJsonSchema,
  gapSelectJsonSchema,
  itemGroupJsonSchema,
  jsonSchemaFor,
  multipleChoiceJsonSchema,
  readAloudJsonSchema,
  stimulusJsonSchema,
  writtenResponseJsonSchema,
} from './json-schema.js';

/**
 * Checks a piece of activity media — an item's `media`, a stimulus's, a
 * dictation's `slowMedia` — on its own, the way `validateActivity` checks it
 * inside an item: its kind, an address in the allowed schemes, a playback
 * policy only on audio, captions and tracks only where they can play. For an
 * editor's media picker, which holds the media before the item is whole.
 *
 * @returns `{ success: true, data }`, or `{ success: false, errors }` with the
 *   same codes, paths and messages `validateActivity` reports.
 */
export function validateMedia(value: unknown): ValidationResult<ActivityMedia> {
  return asValidation(readSchema(MediaSchema as never, value, 'Media'));
}

/**
 * Checks a multiple-choice option's `media` on its own: a picture or a
 * recording, at an address in the allowed schemes, with no playback policy.
 *
 * @returns `{ success: true, data }`, or `{ success: false, errors }` with the
 *   same codes, paths and messages `validateActivity` reports.
 */
export function validateOptionMedia(value: unknown): ValidationResult<MultipleChoiceOptionMedia> {
  return asValidation(readSchema(MultipleChoiceOptionMediaSchema as never, value, 'Option media'));
}

function asValidation<T>(reading: SchemaReading<unknown>): ValidationResult<T> {
  if (reading.success) {
    return { success: true, data: reading.data as T };
  }
  return {
    success: false,
    errors: reading.issues.map((issue) => ({
      path: issue.path.map(String),
      message: issue.message,
      code: issue.code,
    })),
  };
}

/**
 * Validates raw activity data against the schema registered for the given
 * activity type (built-in or consumer-registered via `registerActivityType`).
 *
 * Unknown keys are PRESERVED, not stripped: every built-in schema is loose,
 * so consumer sidecar fields and forward-version fields survive validation
 * verbatim in the returned `data`.
 *
 * @returns `{ success: true, data }` with the typed, validated data, or
 *          `{ success: false, errors }` with one entry per failed constraint.
 * @throws UnknownActivityTypeError when `type` has no registered descriptor.
 */
export function validateActivity<T extends ActivityType>(
  type: T,
  data: unknown,
): ValidationResult<ActivityDataMap[T]> {
  const descriptor = getActivityTypeDescriptor(type);
  if (descriptor === undefined) {
    throw new UnknownActivityTypeError(String(type));
  }

  return asValidation(readSchema(descriptor.schema, data, `Activity type "${descriptor.type}"`));
}
