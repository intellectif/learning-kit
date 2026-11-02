/**
 * `migrateState` (R11.1, R11.2): reads a stored state of any supported
 * version and returns the current version. Version 1 is the only one, so it
 * checks the shape and returns a fresh, frozen copy. Total: any input gives
 * a result, never a throw.
 */

import { canonicalize } from '../determinism/canonical.js';
import { deepFreeze } from '../determinism/freeze.js';
import type { Issue, MigrationResult, PracticeState } from '../types.js';
import { isRecord, shapeIssues, stateShape } from './shape.js';

/** The state schema version this release writes. */
export const STATE_SCHEMA_VERSION = 1;

export function migrateState(raw: unknown): MigrationResult {
  if (isRecord(raw) && typeof raw.schemaVersion === 'number' && raw.schemaVersion !== 1) {
    return fail({
      code: 'SCHEMA_VERSION_UNSUPPORTED',
      path: ['schemaVersion'],
      message: `State schema version ${String(raw.schemaVersion)} is not supported; this release reads version ${STATE_SCHEMA_VERSION}.`,
    });
  }
  const issues = shapeIssues(stateShape, raw);
  if (issues.length > 0) return { ok: false, issues };
  const canonical = canonicalize(raw);
  if (!canonical.ok) {
    return fail({ code: 'SHAPE_INVALID', path: canonical.path, message: canonical.message });
  }
  const state = deepFreeze(JSON.parse(canonical.json) as PracticeState);
  return { ok: true, state, migrated: false };
}

function fail(issue: Issue): MigrationResult {
  return { ok: false, issues: [issue] };
}
