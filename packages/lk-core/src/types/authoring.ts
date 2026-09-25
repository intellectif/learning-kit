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

/**
 * How much a finding of the item critic matters. Neither makes a draft
 * incomplete or invalid: an item with findings is a valid item, stored and
 * served like any other, and whether to change it is the author's call.
 *
 * - `warning` — a known flaw a learner can exploit or trip over: the right
 *   option is the longest, an answer printed in the passage, a hint that gives
 *   the answer away, two options that read the same.
 * - `advice` — an item-writing guideline the item departs from: "all of the
 *   above", two accepted answers the matcher already treats as one.
 */
export type ItemFindingSeverity = 'warning' | 'advice';

/**
 * One thing the item critic found. A {@link ValidationError} with a severity,
 * as a {@link DraftIssue} is, so an editor lists both in one list — sorted by
 * severity: `invalid`, `incomplete`, `warning`, `advice`.
 */
export interface ItemFinding extends ValidationError {
  severity: ItemFindingSeverity;
}

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
