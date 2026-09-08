/**
 * The frozen record of what one attempt was served.
 *
 * A sequence definition is live content: it gets edited, re-ordered, corrected.
 * An attempt is a historical fact. Everything that decides a grade — which
 * questions, in what order, each worth how much, against which version of the
 * content — has to be pinned at the moment the attempt starts, or a re-grade
 * six months later silently answers a different question than the learner was
 * asked.
 *
 * This is the thing you persist next to the responses.
 */

/** One planned position: an item, its identity, its worth, and its fingerprint. */
export interface AttemptPlanSlot {
  /**
   * Slot identity, from `flattenSequence`. Stable under shuffling; stable
   * under editing too when the entries declare `slotKey`. This is the key to
   * store responses and scores against.
   */
  slotId: string;
  /** 0-based PRESENTED position in this attempt. */
  index: number;
  /** The activity that filled the slot. */
  activityId: string;
  /** The activity's `type` discriminator. */
  activityType: string;
  /**
   * What this slot is worth, frozen. Points belong to the PAPER, not the item:
   * the same question can be worth 1 in a quiz and 3 in a final, so they are
   * resolved when the attempt is planned and never read from content again.
   */
  points: number;
  /**
   * Fingerprint of the activity's content as served. Compare it later with
   * {@link verifyAttemptPlan} to find out whether the item has been edited
   * since — the difference between "re-grading this attempt" and "grading a
   * different exam".
   */
  contentHash: string;
  /** Present when the slot came from an item group. */
  group?: {
    id: string;
    title?: string;
    /** Fingerprint of the stimulus as served — a corrected passage changes the question. */
    stimulusHash: string;
  };
  /**
   * Play budgets in force for this slot when the attempt was planned.
   *
   * Frozen for the same reason `points` is: a budget decides the grade, so an
   * author who edits `maxPlays: 2 → 4` mid-window must not be able to change
   * what a past learner was held to. A group's stimulus budget repeats on every
   * slot of the group, exactly as `group.stimulusHash` already does.
   *
   * Absent when the slot budgets nothing, which keeps the plan — and therefore
   * `planHash` — byte-identical for every paper written before 0.8.0.
   */
  mediaBudgets?: MediaBudgetRef[];
}

/** A budgeted recording a slot presents, frozen as served. */
export interface MediaBudgetRef {
  /** `slot:<slotId>` or `stimulus:<entryKey>`. */
  key: string;
  /** The `maxPlays` in force when the attempt was planned. */
  maxPlays: number;
}

/** Everything needed to reproduce and re-grade one attempt. */
export interface AttemptPlan {
  /** Version of this envelope, so a stored plan stays readable as it evolves. */
  planVersion: '1.0';
  /**
   * The seed every shuffle in this attempt used, when anything shuffled.
   * Absent means nothing was shuffled and the order is the authored one.
   */
  seed?: string;
  /**
   * Whether the top-level entries were shuffled. Recorded because
   * {@link verifyAttemptPlan} needs to rebuild the SAME presented order: a
   * re-plan that omitted this returned authored order, every slot compared as
   * re-ordered, and unchanged content reported as drift.
   */
  shuffleEntries?: boolean;
  /**
   * Fingerprint of the whole plan's content — every slot's identity, order,
   * points and content hash. One value to store against an attempt and compare
   * later; the per-slot hashes then say WHICH item moved.
   */
  planHash: string;
  slots: AttemptPlanSlot[];
  /** Sum of every slot's `points`, frozen. The denominator of the paper. */
  totalPoints: number;
}

/** What {@link verifyAttemptPlan} found when a plan met current content. */
export interface AttemptPlanDrift {
  /** True when the plan and the content still agree in every respect. */
  matches: boolean;
  /** Slots in the plan that no longer exist in the content at all. */
  missingSlotIds: string[];
  /** Slots present now that the plan never held — content added since. */
  addedSlotIds: string[];
  /** Slots whose activity content has been edited since the attempt. */
  changedSlotIds: string[];
  /** Slots whose item group's stimulus has been edited since the attempt. */
  changedStimulusSlotIds: string[];
  /**
   * Slots now worth a different number of points. A reweight is a paper
   * change — it moves the grade without touching a single question — so it
   * cannot be left out of a remark or an appeal.
   */
  changedPointsSlotIds: string[];
  /** Slots presented at a different position now than they were then. */
  reorderedSlotIds: string[];
}
