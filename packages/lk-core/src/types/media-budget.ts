/**
 * What one budgeted recording has cost the learner so far.
 */
export interface MediaPlayLedgerEntry {
  /**
   * Plays consumed. A non-negative integer. It MAY exceed the budget: an
   * invigilator override and a race the server resolved both legitimately
   * produce that, and clamping here would hide it.
   */
  plays: number;
  /**
   * Where playback stood at the last report, in seconds.
   *
   * Restored on mount so a refresh RESUMES the play the learner already paid
   * for instead of charging them again for it. It can only ever let them
   * continue from where they were, never restart, because `seek` resolves to
   * `'none'` under a budget.
   */
  at?: number;
}

/**
 * The spent-play ledger for one attempt.
 *
 * Deliberately **not** part of `AttemptState`, for two reasons that both bite
 * in production:
 *
 * 1. It is written on a different cadence. A play is charged *immediately*,
 *    before audio is audible; answers are autosaved on a debounce. Batching a
 *    payment with a debounced write is how a learner starts a third play and
 *    hard-reloads inside the debounce window.
 * 2. `restoreAttemptState` rebuilds its output field by field. A build that
 *    predates this release would not merely fail to read a `mediaPlays` field —
 *    it would write the snapshot back **without** it, erasing spent plays
 *    across a staged rollout, at exactly the moment they matter.
 *
 * Bound to its paper by `planHash` for the same reason `AttemptState` is.
 */
export interface MediaPlayLedger {
  ledgerVersion: '1.0';
  /** The `planHash` of the paper these counts were spent on. */
  planHash: string;
  /** Keyed by `slotMediaKey()` / `stimulusMediaKey()`. An absent key means nothing spent. */
  entries: Record<string, MediaPlayLedgerEntry>;
  /** ISO 8601, when the caller supplies one. The SDK reads no clock. */
  savedAt?: string;
}

/**
 * What the SDK asks the consumer to record, before a sample of audio is
 * audible.
 *
 * `previousPlaysUsed` is what makes a compare-and-set possible: two tabs both
 * seeded at 0 both claim 1, and only an atomic write can tell them apart.
 */
export interface MediaPlayClaim {
  /** `slot:…` / `stimulus:…`. */
  key: string;
  /** The count the client believes was already spent — the value to compare against. */
  previousPlaysUsed: number;
  /** The count the client is claiming: `previousPlaysUsed + 1`. */
  playsUsed: number;
  maxPlays: number;
  playsRemaining: number;
  /** Where the learner stood when the claim was made. Forensics; never identity. */
  slotId: string;
  index: number;
  activityId?: string;
}

/** The consumer's authoritative answer to a {@link MediaPlayClaim}. */
export interface MediaPlayGrant {
  /**
   * The count AFTER the server's atomic write. A value greater than
   * `maxPlays` refuses the play — which is how a second tab is caught.
   */
  playsUsed: number;
}
