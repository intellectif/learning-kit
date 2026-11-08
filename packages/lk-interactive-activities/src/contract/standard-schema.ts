import type { ValidationIssue } from './types.js';

/** Minimal Standard Schema v1 object, so this package does not depend on zod. */
export interface StandardSchema<T> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: 'lk-interactive-activities';
    readonly validate: (
      value: unknown,
    ) =>
      | { value: T; issues?: undefined }
      | { issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey> }> };
  };
}

export function defineStandardSchema<T>(
  validate: (value: unknown) => { value: T } | { issues: ValidationIssue[] },
): StandardSchema<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'lk-interactive-activities',
      validate(value) {
        const result = validate(value);
        if ('value' in result) {
          return { value: result.value };
        }
        return {
          issues: result.issues.map((issue) => ({
            message: issue.message,
            path: issue.path,
          })),
        };
      },
    },
  };
}

export function readObject(
  value: unknown,
  path: Array<string | number> = [],
): Record<string, unknown> | ValidationIssue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { path, message: 'Expected an object.' };
  }
  return value as Record<string, unknown>;
}

export function readString(
  value: unknown,
  path: Array<string | number>,
  options?: { allowEmpty?: boolean },
): string | ValidationIssue {
  if (typeof value !== 'string') {
    return { path, message: 'Expected a string.' };
  }
  if (!options?.allowEmpty && value.trim() === '') {
    return { path, message: 'Expected a non-empty string.' };
  }
  return value;
}

export function readNumber(value: unknown, path: Array<string | number>): number | ValidationIssue {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { path, message: 'Expected a finite number.' };
  }
  return value;
}

export function readBoolean(
  value: unknown,
  path: Array<string | number>,
): boolean | ValidationIssue {
  if (typeof value !== 'boolean') {
    return { path, message: 'Expected a boolean.' };
  }
  return value;
}

export function isIssue(value: unknown): value is ValidationIssue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    'path' in value &&
    !('success' in value)
  );
}
