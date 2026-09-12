import type { ValidationError } from './activity.js';

/**
 * Why a draft is not an activity yet.
 *
 * - `incomplete` — something the author has not written yet: an empty title, an
 *   option with no text, no option marked correct. The fix is to add it.
 * - `invalid` — something is wrong in a way that writing more cannot fix: two
 *   correct options on a single-selection question, a maximum word count below
 *   the minimum, a media address with a scheme the SDK refuses, a `null` in an
 *   optional field that accepts none. The fix is to change it.
 */
export type DraftSeverity = 'incomplete' | 'invalid';

/**
 * One problem with a draft. A {@link ValidationError} with a severity, so code
 * that already lists `validateActivity` errors can list these unchanged.
 */
export interface DraftIssue extends ValidationError {
  severity: DraftSeverity;
}

/** A draft that is a valid activity and has nothing left to write. */
export interface DraftComplete<T> {
  status: 'complete';
  /** The validated activity, exactly as `validateActivity` returns it. */
  data: T;
  /** Always empty. Present so that every result can be read the same way. */
  issues: DraftIssue[];
}

/**
 * A draft that is not an activity yet: `invalid` when any issue is invalid,
 * otherwise `incomplete`. It carries no `data`, because nothing here may be
 * stored or rendered as an activity.
 */
export interface DraftNotComplete {
  status: 'incomplete' | 'invalid';
  issues: DraftIssue[];
}

/**
 * The result of `validateDraft`.
 *
 * There is deliberately no `success` boolean. A boolean has to call an
 * incomplete draft either a success, which lets a half-written answer key
 * through anything that checks it, or a failure, which is the conflation this
 * result exists to remove. Branch on `status`.
 */
export type DraftValidationResult<T> = DraftComplete<T> | DraftNotComplete;

/** What `createDraft` hands an activity type's `authoring.createDraft`. */
export interface DraftContext {
  /**
   * Returns a new id on every call. The SDK invents none: an id made here would
   * need `crypto`, which plain-http origins do not have, or would be positional —
   * and option ids reach the learner, so ids like `"a"` and `"b"` would tell them
   * which option was written first.
   */
  newId: () => string;
}
