/**
 * The frozen canonical copy of a shape-checked value (M7): what the schema
 * objects and the contract checks return, so a result never shares a mutable
 * object with the caller. A value that passed a shape check is JSON apart
 * from an array hole inside a `json` field (the `json` check reads the
 * array's entries), which is a `SHAPE_INVALID` issue here.
 */

import { canonicalize } from '../determinism/canonical.js';
import { deepFreeze } from '../determinism/freeze.js';
import type { CheckResult } from '../types.js';

export function frozenCopy<T>(value: unknown): CheckResult<T> {
  const canonical = canonicalize(value);
  if (!canonical.ok) {
    return {
      ok: false,
      issues: [{ code: 'SHAPE_INVALID', path: [...canonical.path], message: canonical.message }],
    };
  }
  return { ok: true, value: deepFreeze(JSON.parse(canonical.json) as T) };
}

/**
 * The frozen canonical copy of a value whose shape has no `json` field, so
 * it is always JSON: the shapes are finite, so no cycle passes them, and
 * their array checks read every index, so no hole does.
 */
export function plainCopy<T>(value: unknown): T {
  const copied = frozenCopy<T>(value);
  /* v8 ignore next */
  if (!copied.ok) throw new Error('lk-practice: a shape-checked value is not JSON.');
  return copied.value;
}
