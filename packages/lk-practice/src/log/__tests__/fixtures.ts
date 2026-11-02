/** Shared fixtures for the log, replay and status tests. */

import { expect } from 'vitest';
import { createPractice } from '../../practice.js';
import type {
  Evidence,
  EvidenceSource,
  HostAction,
  HostActionInput,
  Practice,
  PracticeConfig,
  PracticeItem,
  PracticeState,
  RecordResult,
  ReviewLogEntry,
  SkillGraph,
} from '../../types.js';

export const DAY = 86_400_000;
export const T0 = Date.UTC(2026, 0, 5);

/** `a` and `b` have a two-stage ladder; `b` needs `a` (hard); `c` is free. */
export const GRAPH: SkillGraph = {
  version: 'g1',
  skills: [
    { id: 'a', knowledge: 'declarative', stages: ['recall', 'produce'] },
    { id: 'b', knowledge: 'declarative', stages: ['recall', 'produce'] },
    { id: 'c', knowledge: 'declarative' },
  ],
  edges: [{ kind: 'prerequisite', from: 'a', to: 'b', strength: 'hard' }],
};

export function item(
  id: string,
  skillId = 'a',
  stage = 'recall',
  extra: Partial<PracticeItem> = {},
): PracticeItem {
  return {
    id,
    skills: [{ skillId, weight: 1 }],
    stage,
    origin: 'generated',
    status: 'proven',
    ...extra,
  };
}

export const pass: EvidenceSource = { kind: 'auto', score: 1, maxScore: 1, passed: true };
export const fail: EvidenceSource = { kind: 'auto', score: 0, maxScore: 1, passed: false };
export const lowAi: EvidenceSource = {
  kind: 'ai',
  score: 1,
  maxScore: 1,
  passed: true,
  confidence: 'low',
};
export const human = (passed: boolean): EvidenceSource => ({
  kind: 'human',
  score: passed ? 1 : 0,
  maxScore: 1,
  passed,
});

export function evidence(
  id: string,
  itemId: string,
  at: number,
  source: EvidenceSource = pass,
  extra: Partial<Evidence> = {},
): Evidence {
  return { id, itemId, at, source, ...extra };
}

export function host(id: string, at: number, action: HostAction): HostActionInput {
  return { id, at, action };
}

export function practice(config: PracticeConfig = {}): Practice {
  return createPractice(config);
}

/** The applied result, or a failed expectation. */
export function applied(result: RecordResult): Extract<RecordResult, { kind: 'applied' }> {
  expect(result.kind).toBe('applied');
  if (result.kind !== 'applied') throw new Error(JSON.stringify(result));
  return result;
}

/** A sequence of record and act steps, applied one after another. */
export type Step =
  | { readonly evidence: Evidence; readonly item?: PracticeItem }
  | { readonly host: HostActionInput };

export interface Run {
  readonly state: PracticeState;
  readonly entries: ReviewLogEntry[];
  readonly results: RecordResult[];
}

export function run(p: Practice, steps: readonly Step[], graph = GRAPH, learnerId = 'l1'): Run {
  let state = p.initState(learnerId, graph);
  const entries: ReviewLogEntry[] = [];
  const results: RecordResult[] = [];
  for (const step of steps) {
    const result =
      'host' in step
        ? p.act(state, graph, step.host)
        : p.record(state, {
            graph,
            evidence: step.evidence,
            ...(step.item === undefined ? {} : { item: step.item }),
          });
    results.push(result);
    if (result.kind === 'applied') {
      state = result.state;
      entries.push(...result.appended);
    } else if (result.kind === 'replay-required') {
      entries.push(...result.appended);
      const replayed = p.replay(entries, graph, learnerId);
      if (!replayed.ok) throw new Error(JSON.stringify(replayed.issues));
      state = replayed.state;
    }
  }
  return { state, entries, results };
}

/** Steps that pass `a` at each due time until it is mastered (bounded). */
export function masterA(p: Practice, start = T0): Run {
  const steps: Step[] = [];
  let at = start;
  let state = p.initState('l1', GRAPH);
  for (let i = 0; i < 40 && !state.skills.a?.mastered; i += 1) {
    const stage = state.skills.a?.stage ?? 'recall';
    const step: Step = {
      evidence: evidence(`m${i}`, `i${i}`, at),
      item: item(`i${i}`, 'a', stage),
    };
    steps.push(step);
    state = run(p, steps).state;
    const memory = state.skills.a?.memories[state.skills.a.stage];
    at = Math.max(memory?.due ?? at + DAY, at + DAY);
  }
  return run(p, steps);
}
