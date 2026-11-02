/**
 * A working copy of a `PracticeState` for a run of transitions. Inputs are
 * never mutated: the draft reads the input state, keeps its changes in its
 * own maps and arrays, and `finish` builds a fresh state that shares only the
 * unchanged skill and item records with the input (R1.5). New objects are
 * frozen; shared ones are left as the host passed them.
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

  private readonly source: PracticeState;
  private readonly skills: Map<string, SkillState>;
  private readonly items: Map<string, ItemUsage>;
  private skillsChanged = false;
  private itemsChanged = false;
  /** The smallest `lastUsedAt` in `items`, or null when unknown; skips the prune scan. */
  private oldestUse: number | null = null;

  constructor(state: PracticeState) {
    this.source = state;
    this.learnerId = state.learnerId;
    this.graphVersion = state.graphVersion;
    this.configHash = state.configHash;
    this.length = state.log.length;
    this.lastAt = state.log.lastAt;
    this.hash = state.log.hash;
    this.held = [...state.held];
    this.recentIds = [...state.recentIds];
    this.skills = new Map(Object.entries(state.skills));
    this.items = new Map(Object.entries(state.items));
  }

  skill(skillId: string): SkillState | undefined {
    return this.skills.get(skillId);
  }

  setSkill(skillId: string, state: SkillState): void {
    this.skills.set(skillId, Object.freeze(state));
    this.skillsChanged = true;
  }

  deleteSkill(skillId: string): void {
    if (this.skills.delete(skillId)) this.skillsChanged = true;
  }

  emit(event: PracticeEvent): void {
    this.events.push(Object.freeze(event));
  }

  /** Step 1 of design §8.1: count the use, then drop usage older than the retention. */
  use(itemId: string, at: number, newestAt: number, retentionMs: number): void {
    const previous = this.items.get(itemId);
    const lastUsedAt = previous === undefined ? at : Math.max(previous.lastUsedAt, at);
    this.items.set(itemId, Object.freeze({ uses: (previous?.uses ?? 0) + 1, lastUsedAt }));
    this.itemsChanged = true;
    if (this.oldestUse !== null && lastUsedAt < this.oldestUse) this.oldestUse = lastUsedAt;
    const cutoff = newestAt - retentionMs;
    if (this.oldestUse !== null && this.oldestUse >= cutoff) return;
    let oldest: number | null = null;
    for (const [id, usage] of this.items) {
      if (usage.lastUsedAt < cutoff) this.items.delete(id);
      else if (oldest === null || usage.lastUsedAt < oldest) oldest = usage.lastUsedAt;
    }
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
      skills: this.skillsChanged ? sortedRecord(this.skills) : this.source.skills,
      items: this.itemsChanged ? sortedRecord(this.items) : this.source.items,
      held: Object.freeze([...this.held]),
      recentIds: Object.freeze([...this.recentIds]),
    });
  }
}

/** A frozen record with keys in UTF-16 code unit order, built without assignment (`__proto__` stays a key). */
function sortedRecord<T>(map: ReadonlyMap<string, T>): Readonly<Record<string, T>> {
  const keys = [...map.keys()].sort(compareKeys);
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, map.get(key) as T])));
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
