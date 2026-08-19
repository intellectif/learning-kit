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

/**
 * Thrown when `score()` is called for an activity type whose grading is
 * deferred (asynchronous AI/human grading, e.g. `written-response`). A
 * deferred submission has no synchronous score — treating it as 0 would show
 * a learner a failing grade for work that simply has not been graded yet.
 * Call `evaluate()` instead, which returns `{ status: 'deferred', ... }`.
 */
export class DeferredScoringError extends Error {
  constructor(public readonly activityType: string) {
    super(
      `Activity type "${activityType}" is graded asynchronously and has no synchronous score. ` +
        `Use evaluate() — it returns { status: 'deferred' } for this type.`,
    );
    this.name = 'DeferredScoringError';
  }
}
