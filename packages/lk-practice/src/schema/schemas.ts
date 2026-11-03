/**
 * Standard Schema objects (design §5.9, R8.2, R10.1) (M7). Each validates
 * with the same total check the package runs itself, so a host validator
 * library and the package agree; a success value is a frozen canonical copy.
 */

import { checkGradeResult } from '../contracts/grade.js';
import type { Evidence, GradeResult, PracticeState, ReviewLogEntry } from '../types.js';
import { frozenCopy } from './copy.js';
import { migrateState } from './migrate.js';
import { type Check, entryShape, evidenceShape, shapeIssues } from './shape.js';
import { standardSchema } from './standard.js';

function shaped<T>(shape: Check) {
  return (value: unknown) => {
    const issues = shapeIssues(shape, value);
    return issues.length > 0 ? { ok: false as const, issues } : frozenCopy<T>(value);
  };
}

/** A stored state of the current schema version (`migrateState` without the migration flag). */
export const practiceStateSchema = standardSchema<PracticeState>((value) => {
  const result = migrateState(value);
  return result.ok ? { ok: true, value: result.state } : result;
});

/** One review log entry (§5.3), with the entry's cross-field rules. */
export const reviewLogEntrySchema = standardSchema<ReviewLogEntry>(shaped(entryShape));

/** One piece of evidence (§5.2), the shape `record` checks first. */
export const evidenceSchema = standardSchema<Evidence>(shaped(evidenceShape));

/** A grader's result (§5.4), as `checkGradeResult` checks it. */
export const gradeResultSchema = standardSchema<GradeResult>(checkGradeResult);
