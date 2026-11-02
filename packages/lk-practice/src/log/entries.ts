/**
 * Builds log entries (design §5.6): the task snapshot an evidence entry
 * stores, so replay never needs the item (R2.3), and the entries `record`
 * and `act` append. Optional fields are copied only when present, so an
 * entry is canonical JSON of exactly its declared shape.
 */

import type {
  Evidence,
  HostActionInput,
  PracticeItem,
  ReviewLogEntry,
  TaskSnapshot,
} from '../types.js';

/** The snapshot of an item that an evidence entry stores. */
export function taskSnapshot(item: PracticeItem): TaskSnapshot {
  return {
    itemId: item.id,
    skills: item.skills.map((entry) => ({ skillId: entry.skillId, weight: entry.weight })),
    stage: item.stage,
    difficulty: item.difficulty ?? 0,
    ...(item.criteria === undefined
      ? {}
      : {
          criteria: item.criteria.map((criterion) => ({
            name: criterion.name,
            skillId: criterion.skillId,
          })),
        }),
    ...(item.fluentSeconds === undefined ? {} : { fluentSeconds: item.fluentSeconds }),
    ...(item.slowSeconds === undefined ? {} : { slowSeconds: item.slowSeconds }),
    ...(item.contentHash === undefined ? {} : { contentHash: item.contentHash }),
    origin: item.origin,
    ...(item.proof === undefined ? {} : { proofKind: item.proof.kind }),
  };
}

export function evidenceEntry(
  seq: number,
  configHash: string,
  evidence: Evidence,
  task: TaskSnapshot | undefined,
): ReviewLogEntry {
  return {
    schemaVersion: 1,
    seq,
    at: evidence.at,
    configHash,
    kind: 'evidence',
    evidence: copyJson(evidence),
    ...(task === undefined ? {} : { task }),
  };
}

export function hostEntry(seq: number, configHash: string, input: HostActionInput): ReviewLogEntry {
  return {
    schemaVersion: 1,
    seq,
    at: input.at,
    configHash,
    kind: 'host',
    id: input.id,
    action: copyJson(input.action),
  };
}

/** The id an entry takes in `recentIds`. */
export function entryId(entry: ReviewLogEntry): string {
  return entry.kind === 'evidence' ? entry.evidence.id : entry.id;
}

/** A plain copy of a value that passed a shape check, so the entry shares nothing with the input. */
function copyJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
