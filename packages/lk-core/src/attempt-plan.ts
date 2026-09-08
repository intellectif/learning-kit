import { contentHash } from './content-hash.js';
import { flattenSequence } from './item-group.js';
import { resolvePlaybackPolicy, slotMediaKey, stimulusMediaKey } from './media-budget.js';
import type { ScoredItem } from './scoring/compose.js';
import type { ActivityData, ActivityMedia, ItemOutcome } from './types/activity.js';
import type {
  AttemptPlan,
  AttemptPlanDrift,
  AttemptPlanSlot,
  MediaBudgetRef,
} from './types/attempt-plan.js';
import type { SequenceEntry, SequenceSlot } from './types/item-group.js';

export type {
  AttemptPlan,
  AttemptPlanDrift,
  AttemptPlanSlot,
  MediaBudgetRef,
} from './types/attempt-plan.js';

/** Options for {@link planAttempt}. */
export interface PlanAttemptOptions<TItem> {
  /** Shuffle the top-level entries. A group moves as one block. */
  shuffleEntries?: boolean;
  /**
   * Seed for every shuffle in this attempt. Required whenever anything
   * shuffles — the attempt has to be reproducible, which is the entire point
   * of writing a plan down. Use the attempt id.
   */
  seed?: string;
  /**
   * What each slot is worth. Defaults to 1 for every slot.
   *
   * Points are resolved HERE, not read from content, because they belong to
   * the paper rather than the item: the same question is worth 1 in a practice
   * quiz and 3 in a final. Whatever this returns is frozen into the plan and
   * is what `composeAssessmentScore` will weight by.
   *
   * @throws Error when it returns a value that is not a finite, non-negative
   *         number — a slot worth `NaN` points would poison the whole total.
   */
  points?: (slot: SequenceSlot<TItem>) => number;
}

/**
 * The activity as CONTENT, with its slot key removed.
 *
 * `slotKey` rides on the same object but is identity, not content — the whole
 * point of the design. Including it in the fingerprint meant that annotating
 * an existing entry with the key that pins its identity reported as
 * "this question was edited", which is precisely backwards.
 */
function contentOf(activity: object): object {
  if (!Object.hasOwn(activity, 'slotKey')) {
    return activity;
  }
  const { slotKey: _slotKey, ...content } = activity as { slotKey?: unknown };
  return content;
}

/**
 * The budgeted recordings a slot presents: its own media, and its group's
 * stimulus. Returns `undefined` — not `[]` — when nothing is budgeted, so the
 * conditional spread below leaves the serialized slot byte-identical to what
 * every pre-0.8.0 paper produced.
 */
function mediaBudgetsOf<TItem extends { id: string; type: string }>(
  slot: SequenceSlot<TItem>,
): MediaBudgetRef[] | undefined {
  const budgets: MediaBudgetRef[] = [];
  // Read structurally: `media` is a shared optional field, not part of the
  // `{ id, type }` bound this function is generic over.
  const own = (slot.activity as { media?: ActivityMedia }).media;
  if (own !== undefined) {
    const maxPlays = resolvePlaybackPolicy(own).maxPlays;
    if (maxPlays !== null) {
      budgets.push({ key: slotMediaKey(slot.slotId), maxPlays });
    }
  }
  const stimulusMedia = slot.group?.stimulus.media;
  if (stimulusMedia !== undefined) {
    const maxPlays = resolvePlaybackPolicy(stimulusMedia).maxPlays;
    if (maxPlays !== null) {
      budgets.push({ key: stimulusMediaKey(slot.slotId), maxPlays });
    }
  }
  return budgets.length > 0 ? budgets : undefined;
}

/**
 * Refuses a paper in which one recording is budgeted under several keys.
 *
 * Six questions that each carry the same `/audio/part2.mp3` with `maxPlays: 2`
 * are six budgets, so the learner gets twelve plays of one recording while the
 * paper says two. The fix is authoring, not arithmetic: questions that share a
 * recording belong in an item group, whose stimulus is one recording with one
 * budget.
 */
function assertNoSplitBudgets<TItem extends { id: string; type: string }>(
  slots: readonly SequenceSlot<TItem>[],
): void {
  const keysByUrl = new Map<string, string[]>();
  for (const slot of slots) {
    const own = (slot.activity as { media?: ActivityMedia }).media;
    if (own === undefined || resolvePlaybackPolicy(own).maxPlays === null) {
      continue;
    }
    const keys = keysByUrl.get(own.url) ?? [];
    keys.push(slotMediaKey(slot.slotId));
    keysByUrl.set(own.url, keys);
  }
  for (const [url, keys] of keysByUrl) {
    if (keys.length > 1) {
      throw new Error(
        `planAttempt: media ${JSON.stringify(url)} is budgeted under ${keys.length} separate ` +
          `keys (${keys.join(', ')}), so one recording grants ${keys.length} × maxPlays. Put the ` +
          "questions that share a recording in an item group — a group's stimulus is one " +
          'recording with one budget.',
      );
    }
  }
}

function planSlot<TItem extends { id: string; type: string }>(
  slot: SequenceSlot<TItem>,
  points: number,
): AttemptPlanSlot {
  if (!Number.isFinite(points) || points < 0) {
    throw new Error(
      `planAttempt: slot "${slot.slotId}" resolved to ${String(points)} points. Points must be a ` +
        'finite, non-negative number, or the paper has no defensible total.',
    );
  }
  const mediaBudgets = mediaBudgetsOf(slot);
  return {
    slotId: slot.slotId,
    index: slot.index,
    activityId: slot.activity.id,
    activityType: slot.activity.type,
    points,
    contentHash: contentHash(contentOf(slot.activity)),
    ...(slot.group !== undefined
      ? {
          group: {
            id: slot.group.id,
            ...(slot.group.title !== undefined ? { title: slot.group.title } : {}),
            stimulusHash: contentHash(slot.group.stimulus),
          },
        }
      : {}),
    ...(mediaBudgets !== undefined ? { mediaBudgets } : {}),
  };
}

/**
 * Freezes what an attempt is being served: the presented order, each slot's
 * identity and worth, and a fingerprint of the content behind it.
 *
 * Call this once, when the attempt starts, and store the result beside the
 * responses. Everything that decides the grade is then a historical fact
 * rather than a re-read of content that may since have changed — which is what
 * makes a re-grade, a remark or an appeal answerable.
 *
 * Ordering comes from `flattenSequence`, so a plan and a live render of the
 * same entries with the same seed agree slot for slot.
 *
 * @throws Error when a shuffle is requested without a seed, when a group is
 *         empty, when two entries collide on a `slotKey`, or when `points`
 *         returns a value that is not finite and non-negative.
 */
export function planAttempt<TItem extends { id: string; type: string }>(
  entries: readonly SequenceEntry<TItem>[],
  options: PlanAttemptOptions<TItem> = {},
): AttemptPlan {
  const { seed, shuffleEntries, points } = options;
  const slots = flattenSequence(entries, {
    ...(shuffleEntries !== undefined ? { shuffleEntries } : {}),
    ...(seed !== undefined ? { seed } : {}),
  });

  assertNoSplitBudgets(slots);

  const planned = slots.map((slot) => planSlot(slot, points?.(slot) ?? 1));
  const totalPoints = planned.reduce((sum, slot) => sum + slot.points, 0);

  return {
    planVersion: '1.0',
    ...(seed !== undefined ? { seed } : {}),
    ...(shuffleEntries !== undefined ? { shuffleEntries } : {}),
    // The plan's own fingerprint covers the slots verbatim — identity, order,
    // points and content hashes — so one stored value answers "is this still
    // the paper that was sat?" and the per-slot hashes then say what moved.
    planHash: contentHash(planned),
    slots: planned,
    totalPoints,
  };
}

/**
 * Compares a stored plan with the content as it stands now, and reports every
 * way they have drifted apart.
 *
 * This is the question a remark or an appeal actually asks: *is the paper I am
 * looking at the paper this learner sat?* Ids alone cannot answer it, because
 * they survive an edit unchanged.
 *
 * Rebuild the comparison plan with the SAME options the stored one recorded —
 * its `seed`, its `shuffleEntries`, and the same `points` function — or the
 * differences you see will be your own:
 *
 * ```ts
 * const now = planAttempt(currentEntries, {
 *   seed: stored.seed,
 *   shuffleEntries: stored.shuffleEntries,
 *   points: pointsFor,          // omit it and every slot reweights to 1
 * });
 * const drift = verifyAttemptPlan(stored, now);
 * ```
 *
 * A drift is not automatically a problem — a fixed typo changes a hash without
 * changing what was asked. It is a fact somebody has to be able to see.
 */
export function verifyAttemptPlan(plan: AttemptPlan, current: AttemptPlan): AttemptPlanDrift {
  const before = new Map(plan.slots.map((slot) => [slot.slotId, slot]));
  const after = new Map(current.slots.map((slot) => [slot.slotId, slot]));

  const missingSlotIds = plan.slots.filter((s) => !after.has(s.slotId)).map((s) => s.slotId);
  const addedSlotIds = current.slots.filter((s) => !before.has(s.slotId)).map((s) => s.slotId);

  const changedSlotIds: string[] = [];
  const changedStimulusSlotIds: string[] = [];
  const changedPointsSlotIds: string[] = [];
  const reorderedSlotIds: string[] = [];
  for (const slot of plan.slots) {
    const now = after.get(slot.slotId);
    if (now === undefined) {
      continue;
    }
    // A swapped activity changes the content behind the slot, so it lands in
    // `changedSlotIds` through the fingerprint rather than needing its own arm.
    if (now.contentHash !== slot.contentHash) {
      changedSlotIds.push(slot.slotId);
    }
    if (now.group?.stimulusHash !== slot.group?.stimulusHash) {
      changedStimulusSlotIds.push(slot.slotId);
    }
    // A reweight moves the grade without touching a single question. Left out,
    // `matches` said the paper was unchanged while its `planHash` disagreed.
    if (now.points !== slot.points) {
      changedPointsSlotIds.push(slot.slotId);
    }
    if (now.index !== slot.index) {
      reorderedSlotIds.push(slot.slotId);
    }
  }

  return {
    matches:
      missingSlotIds.length === 0 &&
      addedSlotIds.length === 0 &&
      changedSlotIds.length === 0 &&
      changedStimulusSlotIds.length === 0 &&
      changedPointsSlotIds.length === 0 &&
      reorderedSlotIds.length === 0,
    missingSlotIds,
    addedSlotIds,
    changedSlotIds,
    changedStimulusSlotIds,
    changedPointsSlotIds,
    reorderedSlotIds,
  };
}

/** How {@link scoredItemsFromPlan} fills a slot that has no recorded outcome. */
export type MissingOutcomePolicy =
  /**
   * Default. `{ status: 'deferred', reason: 'no_response_recorded' }` — a
   * non-terminal state, so the composed result stays `provisional` and cannot
   * be recorded as a final pass or fail.
   */
  | 'deferred'
  /**
   * `{ status: 'scored', score: 0 }` — the learner left it blank on a paper
   * that IS complete. Choose this only when you know the attempt was
   * submitted; it is a real zero and makes the result final.
   */
  | 'zero'
  /** Build the outcome yourself, per slot. */
  | ((slot: AttemptPlanSlot) => ItemOutcome);

function missingOutcome(slot: AttemptPlanSlot, policy: MissingOutcomePolicy): ItemOutcome {
  if (typeof policy === 'function') {
    return policy(slot);
  }
  if (policy === 'zero') {
    return { status: 'scored', score: 0, maxScore: 1, passed: false, feedback: null, details: [] };
  }
  return { status: 'deferred', reason: 'no_response_recorded', maxScore: 1 };
}

/**
 * Turns a plan plus whatever outcomes exist into the `ScoredItem[]`
 * `composeAssessmentScore` consumes.
 *
 * The plan is the source of the denominator, not the outcomes. A slot the
 * learner never reached still has to appear — otherwise it silently leaves the
 * denominator and the remaining questions quietly become worth more than the
 * paper says.
 *
 * **A missing outcome defaults to `deferred`, never `unscorable`.** The
 * distinction decides a grade: `unscorable` means "a grade is never coming",
 * so `composeAssessmentScore` drops the slot from the denominator AND lets the
 * result go `final` — which turned a three-question paper with one answer into
 * a final, passing 100%. `deferred` means "not yet", which holds the result
 * `provisional` so nothing can be recorded. Pass `'zero'` once you know the
 * attempt was submitted and the blanks are genuinely blanks.
 *
 * Pass outcomes keyed by `slotId`. Keys the plan does not know are ignored:
 * a plan is the authority on what the attempt contained.
 */
export function scoredItemsFromPlan(
  plan: AttemptPlan,
  outcomes: Readonly<Record<string, ItemOutcome>>,
  options: { missing?: MissingOutcomePolicy } = {},
): ScoredItem[] {
  const policy = options.missing ?? 'deferred';
  return plan.slots.map((slot) => ({
    slotId: slot.slotId,
    activityId: slot.activityId,
    points: slot.points,
    // `Object.hasOwn`, not a bare lookup: slot ids come from authored
    // `slotKey`s, and a key of `constructor` or `toString` would otherwise
    // resolve through the prototype chain and hand a FUNCTION to the scorer
    // in place of an outcome.
    outcome: Object.hasOwn(outcomes, slot.slotId)
      ? (outcomes[slot.slotId] as ItemOutcome)
      : missingOutcome(slot, policy),
  }));
}

/** Convenience alias: the entry type a plan is built from. */
export type PlannableEntry = SequenceEntry<ActivityData>;
