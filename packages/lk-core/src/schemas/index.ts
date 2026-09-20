import { UnknownActivityTypeError } from '../errors.js';
import { getActivityTypeDescriptor } from '../registry/index.js';
import type { ActivityDataMap, ActivityType, ValidationResult } from '../types/activity.js';

export {
  DictationDataSchema,
  DictationEquivalenceSchema,
  DictationSlowMediaSchema,
  DictationToleranceSchema,
} from './dictation.js';
export { FeedbackSchema } from './feedback.js';
export {
  BlankConfigSchema,
  FillInTheBlanksDataSchema,
  TextMatchPolicySchema,
} from './fill-in-the-blanks.js';
export {
  GapSelectBankSchema,
  GapSelectChoiceSchema,
  GapSelectDataSchema,
  GapSelectGapSchema,
} from './gap-select.js';
export type { RedactedStimulus } from './item-group.js';
export {
  ItemGroupSchema,
  MediaTimelineSchema,
  RedactedItemGroupSchema,
  RedactedStimulusSchema,
  StimulusSchema,
  TimelineChapterSchema,
  TimelineCueSchema,
  validateItemGroup,
} from './item-group.js';
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
export {
  MediaPlaybackSchema,
  MediaSchema,
  MediaTrackSchema,
  MediaUrlSchema,
  NativeControlHintSchema,
  RedactedMediaSchema,
} from './media.js';
export {
  MultipleChoiceDataSchema,
  MultipleChoiceOptionMediaSchema,
  MultipleChoiceOptionSchema,
} from './multiple-choice.js';
export { ReadAloudDataSchema, ReadAloudSlowMediaSchema } from './read-aloud.js';
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
  RedactedWrittenResponseData,
} from './redacted.js';
export {
  RedactedBlankConfigSchema,
  RedactedDictationDataSchema,
  RedactedDictationSlowMediaSchema,
  RedactedFillInTheBlanksDataSchema,
  RedactedGapSelectBankSchema,
  RedactedGapSelectChoiceSchema,
  RedactedGapSelectDataSchema,
  RedactedGapSelectGapSchema,
  RedactedMultipleChoiceDataSchema,
  RedactedMultipleChoiceOptionMediaSchema,
  RedactedMultipleChoiceOptionSchema,
  RedactedReadAloudDataSchema,
  RedactedWrittenResponseDataSchema,
} from './redacted.js';
export {
  WrittenResponseDataSchema,
  WrittenResponseRubricCriterionSchema,
  WrittenResponseRubricSchema,
} from './written-response.js';

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

  const result = descriptor.schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data as ActivityDataMap[T] };
  }

  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.map(String),
      message: issue.message,
      code: issue.code,
    })),
  };
}
