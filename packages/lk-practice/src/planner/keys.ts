/**
 * The planner's deterministic keys (design §8.6, D23): the seeded tie key and
 * the target id. Both are versioned strings, so a change of either rule is a
 * new version, never a silent change.
 */

import { canonicalJson, fnv1a64 } from '../determinism/index.js';
import type { PracticeTarget, StageId } from '../types.js';

/** `fnv1a64(canonicalJson(['planner@1', seed, id]))`, compared as strings. */
export function tieKey(seed: string, id: string): string {
  return fnv1a64(canonicalJson(['planner@1', seed, id]));
}

/** `fnv1a64(canonicalJson(['target@1', learnerId, logHash, kind, skillIds, stage]))`. */
export function targetId(
  learnerId: string,
  logHash: string,
  kind: PracticeTarget['kind'],
  skillIds: readonly string[],
  stage: StageId,
): string {
  return fnv1a64(canonicalJson(['target@1', learnerId, logHash, kind, skillIds, stage]));
}
