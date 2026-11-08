import type { ValidationResult } from './types.js';

/** Minimal Standard Schema v1 object, so this package does not depend on zod. */
export interface StandardSchema<T> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: 'lk-interactive-activities';
    readonly validate: (value: unknown) =>
      | { value: T; issues?: undefined }
      | {
          issues: ReadonlyArray<{
            message: string;
            path?: ReadonlyArray<PropertyKey>;
            code?: string;
          }>;
        };
  };
}

/** Wraps a validator as a Standard Schema; issues keep their stable `code`. */
export function defineStandardSchema<T>(
  validate: (value: unknown) => ValidationResult<T>,
): StandardSchema<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'lk-interactive-activities',
      validate(value) {
        const result = validate(value);
        if (result.success) {
          return { value: result.data };
        }
        return {
          issues: result.errors.map((issue) => ({
            message: issue.message,
            path: issue.path,
            code: issue.code,
          })),
        };
      },
    },
  };
}
