/**
 * A working copy of a `PracticeState` for a run of transitions. Inputs are
 * never mutated: the draft reads the input state, keeps its changes in its
 * own maps and arrays, and `finish` builds a fresh state that shares only the
 * unchanged skill and item records with the input (R1.5). New objects are
 * frozen; shared ones are left as the host passed them. (revised in M8) The
 * skill and item records are read through their changes, never copied, so a
 * transition costs what it changes plus one rebuild of each changed record
 * (R12.4).
 */

import type {
  HeldEvidence,
  ItemUsage,
  PracticeEvent,
  PracticeState,
  SkillState,
  StageId,
} from '../types.js';

export class Draft {
  readonly learnerId: string;
  readonly graphVersion: string;
  readonly configHash: string;
  length: number;
  lastAt: number | null;
  hash: string;
  held: HeldEvidence[];
  recentIds: string[];
  readonly events: PracticeEvent[] = [];

  private readonly skills: RecordDraft<SkillState>;
  private readonly items: RecordDraft<ItemUsage>;
  /** The smallest `lastUsedAt` in `items`, or null when unknown; skips the prune scan. */
  private oldestUse: number | null = null;

  constructor(state: PracticeState) {
    this.learnerId = state.learnerId;
    this.graphVersion = state.graphVersion;
    this.configHash = state.configHash;
    this.length = state.log.length;
    this.lastAt = state.log.lastAt;
    this.hash = state.log.hash;
    this.held = [...state.held];
    this.recentIds = [...state.recentIds];
    this.skills = new RecordDraft(state.skills);
    this.items = new RecordDraft(state.items);
  }

  skill(skillId: string): SkillState | undefined {
    return this.skills.get(skillId);
  }

  setSkill(skillId: string, state: SkillState): void {
    this.skills.set(skillId, Object.freeze(state));
  }

  deleteSkill(skillId: string): void {
    this.skills.delete(skillId);
  }

  emit(event: PracticeEvent): void {
    this.events.push(Object.freeze(event));
  }

  /** Step 1 of design §8.1: count the use, then drop usage older than the retention. */
  use(itemId: string, at: number, newestAt: number, retentionMs: number): void {
    const previous = this.items.get(itemId);
    const lastUsedAt = previous === undefined ? at : Math.max(previous.lastUsedAt, at);
    this.items.set(itemId, Object.freeze({ uses: (previous?.uses ?? 0) + 1, lastUsedAt }));
    if (this.oldestUse !== null && lastUsedAt < this.oldestUse) this.oldestUse = lastUsedAt;
    const cutoff = newestAt - retentionMs;
    if (this.oldestUse !== null && this.oldestUse >= cutoff) return;
    let oldest: number | null = null;
    this.items.forEach((id, usage) => {
      if (usage.lastUsedAt < cutoff) this.items.delete(id);
      else if (oldest === null || usage.lastUsedAt < oldest) oldest = usage.lastUsedAt;
    });
    this.oldestUse = oldest;
  }

  /** Step 2: push the id and keep the last `window`. */
  remember(id: string, window: number): void {
    this.recentIds.push(id);
    if (this.recentIds.length > window) this.recentIds.splice(0, this.recentIds.length - window);
  }

  finish(): PracticeState {
    return Object.freeze({
      schemaVersion: 1,
      learnerId: this.learnerId,
      graphVersion: this.graphVersion,
      configHash: this.configHash,
      log: Object.freeze({ length: this.length, lastAt: this.lastAt, hash: this.hash }),
      skills: this.skills.finish(),
      items: this.items.finish(),
      held: Object.freeze([...this.held]),
      recentIds: Object.freeze([...this.recentIds]),
    });
  }
}

/**
 * A record read through its changes (revised in M8): the source is never
 * copied or mutated, a change or a deletion is kept beside it, and `finish`
 * builds the record once. Values are objects, so `null` marks a deletion.
 */
class RecordDraft<T extends object> {
  private readonly changes = new Map<string, T | null>();

  constructor(private readonly source: Readonly<Record<string, T>>) {}

  get(key: string): T | undefined {
    const change = this.changes.get(key);
    if (change !== undefined) return change ?? undefined;
    return Object.hasOwn(this.source, key) ? this.source[key] : undefined;
  }

  set(key: string, value: T): void {
    this.changes.set(key, value);
  }

  /** A key of the source is marked deleted; an added key is dropped, so `changes` stays the size of what changed. */
  delete(key: string): void {
    if (Object.hasOwn(this.source, key)) this.changes.set(key, null);
    else this.changes.delete(key);
  }

  /**
   * Calls `visit` with each key present now and its value, the source's
   * first; `visit` may delete the key it is given.
   */
  forEach(visit: (key: string, value: T) => void): void {
    for (const key of Object.keys(this.source)) {
      if (!this.changes.has(key)) visit(key, this.source[key] as T);
    }
    for (const [key, value] of this.changes) {
      if (value !== null) visit(key, value);
    }
  }

  /**
   * The source itself when nothing changed; otherwise a frozen record with
   * keys in UTF-16 code unit order. When the source's keys are in that order,
   * as a record this built has them, its kept keys are merged with the added
   * ones instead of sorting them all (R12.4); otherwise every key is sorted.
   * It is built by assignment, which V8 does several times faster than
   * `Object.fromEntries` for a large record whose keys change, and
   * `__proto__` is defined as an own key, not assigned.
   */
  finish(): Readonly<Record<string, T>> {
    if (this.changes.size === 0) return this.source;
    const kept = this.kept();
    const added = this.added().sort(compareKeys);
    const keys = inOrder(Object.keys(this.source))
      ? merge(kept, added)
      : [...kept, ...added].sort(compareKeys);
    const record: Record<string, T> = {};
    for (const key of keys) {
      const value = this.get(key) as T;
      if (key === '__proto__') {
        Object.defineProperty(record, key, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      } else {
        record[key] = value;
      }
    }
    return Object.freeze(record);
  }

  private kept(): string[] {
    return Object.keys(this.source).filter((key) => this.changes.get(key) !== null);
  }

  private added(): string[] {
    return [...this.changes.keys()].filter(
      (key) => this.changes.get(key) !== null && !Object.hasOwn(this.source, key),
    );
  }
}

function inOrder(keys: readonly string[]): boolean {
  return keys.every((key, i) => i === 0 || compareKeys(keys[i - 1] as string, key) < 0);
}

/** Two arrays of distinct keys, each in order, merged in order. */
function merge(a: readonly string[], b: readonly string[]): string[] {
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    out.push(
      compareKeys(a[i] as string, b[j] as string) < 0 ? (a[i++] as string) : (b[j++] as string),
    );
  }
  return out.concat(a.slice(i), b.slice(j));
}

export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A skill's state before anything has happened to it. */
export function defaultSkillState(stage: StageId): SkillState {
  return {
    stage,
    startedAt: null,
    unlockedAt: null,
    credited: false,
    suspended: null,
    memories: {},
    ability: {},
    mastered: false,
    evidenceCount: 0,
    lastLapseAt: null,
    top: { successes: 0, firstSuccessAt: null, lastSuccessAt: null, lastWasLapse: false },
  };
}
