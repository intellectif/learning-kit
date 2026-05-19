import type { ActivityDataMap, ActivityType, ValidationResult } from '../types/activity.js';
import { FillInTheBlanksDataSchema } from './fill-in-the-blanks.js';
import { MultipleChoiceDataSchema } from './multiple-choice.js';

export { FeedbackSchema } from './feedback.js';
export { BlankConfigSchema, FillInTheBlanksDataSchema } from './fill-in-the-blanks.js';
export { fillInTheBlanksJsonSchema, multipleChoiceJsonSchema } from './json-schema.js';
export { MediaSchema } from './media.js';
export { MultipleChoiceDataSchema, MultipleChoiceOptionSchema } from './multiple-choice.js';

/** Maps each activity type to the Zod schema that validates its data. */
const schemaMap = {
  'multiple-choice': MultipleChoiceDataSchema,
  'fill-in-the-blanks': FillInTheBlanksDataSchema,
} as const;

/**
 * Validates raw activity data against the schema for the given activity type.
 *
 * @returns `{ success: true, data }` with the typed, validated data, or
 *          `{ success: false, errors }` with one entry per failed constraint.
 */
export function validateActivity<T extends ActivityType>(
  type: T,
  data: unknown,
): ValidationResult<ActivityDataMap[T]> {
  const result = schemaMap[type].safeParse(data);

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
