import { canonicalJson } from './content-hash.js';
import type { LearnerResponse } from './types/activity.js';
import type { AttemptPlan } from './types/attempt-plan.js';
import type { AttemptState, ResponseDiffEntry } from './types/attempt-state.js';

export type { AttemptState, ResponseDiffEntry } from './types/attempt-state.js';

/** What {@link serializeAttemptState} is given about an attempt in progress. */
export interface AttemptProgress {
  /** Answers so far, keyed by `slotId`. */
  responses: Readonly<Record<string, LearnerResponse>>;
  /** Slots already submitted. Defaults to none. */
  submittedSlotIds?: readonly string[];
  /** Presented position the learner is on. Defaults to 0. */
  index?: number;
  /** ISO 8601 timestamp to stamp the snapshot with. The SDK does not read a clock. */
  savedAt?: string;
}

/**
 * A DEEP copy of the responses.
 *
 * A one-level spread is not enough: every `LearnerResponse` shape is itself an
 * object (`selectedOptionIds`, `answers`, `text`), so a spread hands back a new
 * map of the caller's SAME response objects. A consumer whose reducer updates
 * an answer in place — an Immer draft, a push onto a multi-select, or
 * `answers[blankId] = text`, which is the natural update for that shape — then
 * mutates every snapshot ever taken. The stored snapshot retroactively becomes
 * the new answer, `diffResponses` sees no change, and a delta autosave writes
 * nothing for an edit the learner really made.
 */
function cloneResponses(
  responses: Readonly<Record<string, LearnerResponse>>,
): Record<string, LearnerResponse> {
  // Responses are JSON by contract, so the fallback is lossless for them.
  return typeof structuredClone === 'function'
    ? structuredClone(responses as Record<string, LearnerResponse>)
    : (JSON.parse(JSON.stringify(responses)) as Record<string, LearnerResponse>);
}

/** Slot ids present in the object but unknown to the plan. */
function unknownKeys(plan: AttemptPlan, keys: readonly string[]): string[] {
  const known = new Set(plan.slots.map((slot) => slot.slotId));
  return keys.filter((key) => !known.has(key));
}

/**
 * Captures an in-progress attempt as a storable snapshot, bound to its plan.
 *
 * Validated against the plan on the way in, not on the way out: a response
 * stored under a slot the paper does not contain is a bug at the moment it is
 * written, and finding it months later — when a learner tries to resume — is
 * finding it far too late.
 *
 * The SDK reads no clock: pass `savedAt` if you want the snapshot stamped, so
 * the function stays pure and its output stays reproducible in a test.
 *
 * @throws Error when a response or submitted slot is not in the plan, or when
 *         `index` is not a position the plan actually has.
 */
export function serializeAttemptState(plan: AttemptPlan, progress: AttemptProgress): AttemptState {
  const responseKeys = Object.keys(progress.responses);
  const submittedSlotIds = [...(progress.submittedSlotIds ?? [])];

  const strayResponses = unknownKeys(plan, responseKeys);
  if (strayResponses.length > 0) {
    throw new Error(
      `serializeAttemptState: response recorded for slot(s) the plan does not contain: ${strayResponses.join(', ')}. ` +
        'A response that belongs to no question cannot be scored and would be lost silently.',
    );
  }
  const straySubmitted = unknownKeys(plan, submittedSlotIds);
  if (straySubmitted.length > 0) {
    throw new Error(
      `serializeAttemptState: submitted slot(s) the plan does not contain: ${straySubmitted.join(', ')}.`,
    );
  }

  const index = progress.index ?? 0;
  // An out-of-range position would reopen the attempt on a question that is
  // not there — which the pager renders as an empty shell with no way forward.
  // An empty plan admits only 0: guarding with `slots.length > 0` skipped the
  // range check altogether there, so a zero-slot paper accepted any index and
  // the error message contradicted itself.
  const lastIndex = Math.max(0, plan.slots.length - 1);
  if (!Number.isInteger(index) || index < 0 || index > lastIndex) {
    throw new Error(
      `serializeAttemptState: index ${String(index)} is not a position in a ${plan.slots.length}-slot plan.`,
    );
  }

  return {
    stateVersion: '1.0',
    planHash: plan.planHash,
    // Copied DEEPLY, not aliased: a snapshot that keeps mutating with the
    // live attempt is not a snapshot. See cloneResponses.
    responses: cloneResponses(progress.responses),
    submittedSlotIds,
    index,
    ...(progress.savedAt !== undefined ? { savedAt: progress.savedAt } : {}),
  };
}

/**
 * Reopens a stored snapshot against a plan, refusing anything that does not
 * belong to it.
 *
 * The `planHash` check is the point. Slot ids are short and stable by design,
 * so a snapshot from a DIFFERENT paper — last term's midterm, a sibling
 * version, a copy-pasted attempt row — will happily line its answers up
 * against the wrong questions and look entirely plausible doing it. Comparing
 * the paper's fingerprint is what makes that impossible rather than unlikely.
 *
 * @throws Error when the snapshot belongs to a different plan, or references
 *         slots the plan does not contain.
 */
export function restoreAttemptState(plan: AttemptPlan, state: AttemptState): AttemptState {
  if (state === null || typeof state !== 'object') {
    throw new Error('restoreAttemptState: the snapshot is not an object.');
  }
  // The one field added so a stored snapshot survives an envelope change was
  // the one field never read: an unrecognised version was accepted,
  // reinterpreted under this version's rules, and re-stamped '1.0' — which
  // also destroyed the evidence that it had ever been anything else.
  if (state.stateVersion !== '1.0') {
    throw new Error(
      `restoreAttemptState: unsupported stateVersion ${JSON.stringify(state.stateVersion)}. ` +
        'This build understands "1.0"; a newer snapshot must be migrated before it is restored.',
    );
  }
  if (state.responses === null || typeof state.responses !== 'object') {
    throw new Error(
      'restoreAttemptState: the snapshot carries no responses object (a NULL column, or a ' +
        'partially written row).',
    );
  }
  if (state.planHash !== plan.planHash) {
    throw new Error(
      'restoreAttemptState: this snapshot belongs to a different paper ' +
        `(snapshot ${state.planHash}, plan ${plan.planHash}). Restoring it would attach the ` +
        "learner's answers to questions they never saw.",
    );
  }
  // Re-validated rather than trusted: a snapshot is storage, and storage is
  // edited, migrated and hand-fixed.
  return serializeAttemptState(plan, {
    responses: state.responses,
    submittedSlotIds: state.submittedSlotIds,
    index: state.index,
    ...(state.savedAt !== undefined ? { savedAt: state.savedAt } : {}),
  });
}

/**
 * Reports how two snapshots' responses differ, slot by slot.
 *
 * Useful for an autosave that should only write what moved, and for an audit
 * trail that has to show what a learner changed between two saves — including
 * an answer they cleared, which a naive comparison of the later snapshot
 * alone cannot see.
 *
 * Entries come back sorted by `slotId`, so the output is stable regardless of
 * the order the two objects happened to be written in.
 */
export function diffResponses(
  before: Pick<AttemptState, 'responses'>,
  after: Pick<AttemptState, 'responses'>,
): ResponseDiffEntry[] {
  const slotIds = [...new Set([...Object.keys(before.responses), ...Object.keys(after.responses)])];
  slotIds.sort();

  const entries: ResponseDiffEntry[] = [];
  for (const slotId of slotIds) {
    const had = Object.hasOwn(before.responses, slotId);
    const has = Object.hasOwn(after.responses, slotId);
    const from = before.responses[slotId];
    const to = after.responses[slotId];

    if (had && !has) {
      entries.push({ slotId, change: 'removed', ...(from !== undefined ? { before: from } : {}) });
      continue;
    }
    if (!had && has) {
      entries.push({ slotId, change: 'added', ...(to !== undefined ? { after: to } : {}) });
      continue;
    }
    // Structural comparison through the canonical form, so a response that
    // survived a JSON round-trip with its keys reordered does not read as a
    // change the learner never made.
    if (canonicalJson(from) !== canonicalJson(to)) {
      entries.push({
        slotId,
        change: 'changed',
        ...(from !== undefined ? { before: from } : {}),
        ...(to !== undefined ? { after: to } : {}),
      });
    }
  }
  return entries;
}
