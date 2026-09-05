import type { LearnerResponse } from './activity.js';

/**
 * A resumable snapshot of an attempt in progress.
 *
 * The plan says what the learner was asked; this says how far they got. It is
 * deliberately the smallest thing that can reopen an attempt exactly where it
 * was left: the answers so far, which of them are already submitted, and where
 * the learner was standing.
 *
 * It is bound to a plan by {@link AttemptState.planHash}, because restoring
 * answers onto a DIFFERENT paper is the failure this type exists to prevent —
 * slot ids alone would happily line up against the wrong questions.
 */
export interface AttemptState {
  /** Version of this envelope, so a stored snapshot stays readable as it evolves. */
  stateVersion: '1.0';
  /**
   * `planHash` of the {@link AttemptPlan} this state belongs to. `restoreAttemptState`
   * refuses a plan that does not match, rather than restoring a learner's
   * answers onto a paper they never sat.
   */
  planHash: string;
  /** The learner's answers so far, keyed by `slotId`. */
  responses: Record<string, LearnerResponse>;
  /**
   * Slots the learner has already submitted. Kept apart from `responses`
   * because they answer different questions: what did they write, and may they
   * still change it.
   */
  submittedSlotIds: string[];
  /** Presented position the learner was on, so a resume reopens there. */
  index: number;
  /** ISO 8601 timestamp of the snapshot, when the caller supplies one. */
  savedAt?: string;
}

/** One slot whose response differs between two snapshots. */
export interface ResponseDiffEntry {
  slotId: string;
  /** `added` — answered since; `removed` — cleared; `changed` — a different answer. */
  change: 'added' | 'removed' | 'changed';
  before?: LearnerResponse;
  after?: LearnerResponse;
}
