import type { ActivityMedia, NativeControlHint } from './types/activity.js';
import type { AttemptPlan } from './types/attempt-plan.js';
import type { MediaPlayLedger, MediaPlayLedgerEntry } from './types/media-budget.js';

export type {
  MediaPlayClaim,
  MediaPlayGrant,
  MediaPlayLedger,
  MediaPlayLedgerEntry,
} from './types/media-budget.js';

/**
 * The authored-entry prefix of a slot id: `"3"` for both `"3"` and `"3.1"`.
 *
 * Safe because every slot id in a plan is produced by `flattenSequence`, and
 * `keyOf` rejects a `.` in both an entry key and an item key — so the first
 * `.` is always the group/item separator.
 */
export function entryKeyOf(slotId: string): string {
  const dot = slotId.indexOf('.');
  return dot === -1 ? slotId : slotId.slice(0, dot);
}

/** Budget key for an activity's OWN `data.media`. One budget per slot. */
export function slotMediaKey(slotId: string): string {
  return `slot:${slotId}`;
}

/**
 * Budget key for an item group's `stimulus.media`.
 *
 * Keyed by the ENTRY, not the slot: one recording serves every question in the
 * group, so `"3.0"`…`"3.5"` share one budget. Keying by `slotId` would hand a
 * six-question `maxPlays: 2` listening group twelve plays; keying by
 * `stimulus.id` would collide across papers, which is the thing slot keys and
 * `planHash` exist to prevent.
 */
export function stimulusMediaKey(slotId: string): string {
  return `stimulus:${entryKeyOf(slotId)}`;
}

/** A playback policy with every default resolved. One derivation, used everywhere. */
export interface ResolvedPlaybackPolicy {
  controls: 'native' | 'minimal';
  /** `null` when the recording is unbudgeted. */
  maxPlays: number | null;
  seek: 'allow' | 'none';
  rate: 'allow' | 'fixed';
  nativeControlHints: readonly NativeControlHint[];
}

/**
 * Resolves the defaults once, so the schema refinements, the plan and the
 * renderer cannot drift apart about what a policy means.
 *
 * Absent `playback` resolves to exactly the SDK's pre-0.8.0 behaviour:
 * `controls: 'native'`, no budget, free seeking, free speed, no hints.
 */
export function resolvePlaybackPolicy(media: ActivityMedia): ResolvedPlaybackPolicy {
  const p = media.playback;
  const budgeted = typeof p?.maxPlays === 'number';
  const seek = p?.seek ?? (budgeted ? 'none' : 'allow');
  const rate = p?.rate ?? 'allow';
  const controls =
    p?.controls ?? (budgeted || seek === 'none' || rate === 'fixed' ? 'minimal' : 'native');
  return {
    controls,
    maxPlays: budgeted ? (p?.maxPlays as number) : null,
    seek,
    rate,
    nativeControlHints: p?.nativeControlHints ?? [],
  };
}

/**
 * Every budgeted recording a plan contains: budget key → the `maxPlays` that
 * was frozen when the attempt was planned.
 *
 * Use it to build the storage rows an attempt needs, and to check a stored
 * ledger against the paper it claims to belong to.
 */
export function planMediaBudgets(plan: AttemptPlan): Record<string, number> {
  const out: Record<string, number> = {};
  for (const slot of plan.slots) {
    for (const budget of slot.mediaBudgets ?? []) {
      out[budget.key] = budget.maxPlays;
    }
  }
  return out;
}

function assertEntry(key: string, entry: MediaPlayLedgerEntry): void {
  if (
    entry === null ||
    typeof entry !== 'object' ||
    !Number.isInteger(entry.plays) ||
    entry.plays < 0
  ) {
    throw new Error(
      `serializeMediaPlayLedger: play count for ${JSON.stringify(key)} is ` +
        `${JSON.stringify((entry as MediaPlayLedgerEntry | null)?.plays)}. A count must be a ` +
        'non-negative integer; Number(a NULL column) is the usual cause.',
    );
  }
  if (entry.at !== undefined && (!Number.isFinite(entry.at) || entry.at < 0)) {
    throw new Error(
      `serializeMediaPlayLedger: position for ${JSON.stringify(key)} is ` +
        `${JSON.stringify(entry.at)}. A position must be a finite number of seconds >= 0.`,
    );
  }
}

/**
 * Validates a set of spent-play counts against the plan that budgeted them,
 * and stamps the envelope.
 *
 * Validates on the way **in**: a play recorded against a recording the paper
 * does not budget is a bug at the moment it is written, and discovering it
 * when a learner tries to resume is discovering it far too late.
 *
 * @throws Error when a key is not budgeted by the plan, or a count is not a
 *         non-negative integer, or a position is not a finite number.
 */
export function serializeMediaPlayLedger(
  plan: AttemptPlan,
  entries: Readonly<Record<string, MediaPlayLedgerEntry>>,
  options: { savedAt?: string } = {},
): MediaPlayLedger {
  if (entries === null || typeof entries !== 'object') {
    throw new Error('serializeMediaPlayLedger: entries must be an object keyed by media key.');
  }
  const budgets = planMediaBudgets(plan);
  const out: Record<string, MediaPlayLedgerEntry> = {};

  for (const key of Object.keys(entries)) {
    if (!Object.hasOwn(budgets, key)) {
      throw new Error(
        `serializeMediaPlayLedger: media play recorded against a recording the plan does not ` +
          `budget: ${JSON.stringify(key)}. Keys come from slotMediaKey() / stimulusMediaKey(); a ` +
          'key that belongs to no budgeted media means the client and the plan disagree about ' +
          'which paper this is.',
      );
    }
    const entry = entries[key] as MediaPlayLedgerEntry;
    assertEntry(key, entry);
    out[key] = { plays: entry.plays, ...(entry.at !== undefined ? { at: entry.at } : {}) };
  }

  return {
    ledgerVersion: '1.0',
    planHash: plan.planHash,
    entries: out,
    ...(options.savedAt !== undefined ? { savedAt: options.savedAt } : {}),
  };
}

/**
 * Reopens a stored ledger against the paper it was spent on.
 *
 * Refuses a ledger from a different paper for the same reason
 * `restoreAttemptState` does: budget keys are short and repeat across papers
 * (`slot:0`, `stimulus:1`), so a ledger from last term's midterm would hold a
 * learner to a budget from an exam they never sat, and look entirely plausible
 * doing it.
 *
 * @throws Error on an unrecognised `ledgerVersion`, a `planHash` mismatch, or
 *         anything `serializeMediaPlayLedger` refuses.
 */
export function restoreMediaPlayLedger(
  plan: AttemptPlan,
  stored: MediaPlayLedger,
): MediaPlayLedger {
  if (stored === null || typeof stored !== 'object') {
    throw new Error('restoreMediaPlayLedger: the stored ledger is not an object.');
  }
  if (stored.ledgerVersion !== '1.0') {
    throw new Error(
      `restoreMediaPlayLedger: unsupported ledgerVersion ${JSON.stringify(stored.ledgerVersion)}. ` +
        'This build understands "1.0"; a newer ledger must be migrated before it is restored.',
    );
  }
  if (stored.entries === null || typeof stored.entries !== 'object') {
    throw new Error(
      'restoreMediaPlayLedger: the ledger carries no entries object (a NULL column, or a ' +
        'partially written row).',
    );
  }
  if (stored.planHash !== plan.planHash) {
    throw new Error(
      'restoreMediaPlayLedger: this ledger belongs to a different paper ' +
        `(ledger ${stored.planHash}, plan ${plan.planHash}). Restoring it would hold the learner ` +
        'to a play budget from an exam they never sat.',
    );
  }
  return serializeMediaPlayLedger(plan, stored.entries, {
    ...(stored.savedAt !== undefined ? { savedAt: stored.savedAt } : {}),
  });
}
