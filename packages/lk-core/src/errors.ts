import type { ValidationError } from './types/activity.js';

/** Thrown when activity data fails schema validation at a component boundary. */
export class ActivitySchemaError extends Error {
  constructor(
    public readonly activityType: string,
    public readonly errors: ValidationError[],
  ) {
    super(`Invalid activity data for type "${activityType}"`);
    this.name = 'ActivitySchemaError';
  }
}

/** Thrown when an unrecognised activity type is passed to the scoring engine. */
export class UnknownActivityTypeError extends Error {
  constructor(public readonly activityType: string) {
    super(`Activity type "${activityType}" is not registered`);
    this.name = 'UnknownActivityTypeError';
  }
}
