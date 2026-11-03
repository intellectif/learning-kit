/**
 * `record` and `act` (design §6.1): check the input, build the entry, and
 * either apply it at once or ask the host to replay, when the entry is
 * earlier than the state's last instant or confirms evidence that later
 * entries followed (§8.7).
 */

import { deepFreeze } from '../determinism/freeze.js';
import { probeGraph } from '../graph/index.js';
import { evidenceShape, hostInputShape, shapeIssues } from '../schema/shape.js';
import type {
  Evidence,
  HostActionInput,
  Issue,
  PracticeState,
  RecordInput,
  RecordResult,
  ReviewLogEntry,
  SkillGraph,
  TaskSnapshot,
} from '../types.js';
import { type ApplyContext, applyConfirmed, applyEntry, hashEntry } from './apply.js';
import { type Engine, indexGraph } from './context.js';
import { Draft } from './draft.js';
import { evidenceEntry, hostEntry, taskSnapshot } from './entries.js';
import {
  confirmationIssues,
  hostActionIssues,
  itemIssues,
  mismatchIssues,
  outcomeIssues,
  probeIssues,
  probeTaskIssues,
  stateHypotheses,
} from './validate.js';

function rejected(issues: readonly Issue[]): RecordResult {
  return Object.freeze({
    kind: 'rejected',
    issues: Object.freeze(issues.map((i) => Object.freeze(i))),
  });
}

function duplicate(id: string, at: number): RecordResult {
  return Object.freeze({
    kind: 'duplicate',
    events: Object.freeze([
      Object.freeze({ type: 'evidence.duplicate', at, evidenceId: id } as const),
    ]),
  });
}

export function recordEvidence(
  engine: Engine,
  state: PracticeState,
  input: RecordInput,
): RecordResult {
  const { graph, evidence } = input;
  const mismatch = mismatchIssues(state, graph.version, engine);
  if (mismatch.length > 0) return rejected(mismatch);
  const shape = shapeIssues(evidenceShape, evidence, ['evidence']);
  if (shape.length > 0) return rejected(shape);
  if (state.recentIds.includes(evidence.id)) return duplicate(evidence.id, evidence.at);

  const index = indexGraph(graph, engine);
  const context: ApplyContext = { engine, graph: index };
  let task: TaskSnapshot | undefined;
  let held: PracticeState['held'][number] | undefined;
  if (evidence.confirms !== undefined) {
    held = state.held.find((record) => record.evidenceId === evidence.confirms);
    if (held === undefined) {
      return rejected([
        {
          code: 'HELD_UNKNOWN',
          path: ['evidence', 'confirms'],
          message: `No held evidence has id "${evidence.confirms}".`,
        },
      ]);
    }
    const issues = confirmationIssues(evidence, held, index, ['evidence']);
    if (issues.length > 0) return rejected(issues);
  } else if (evidence.probe !== undefined) {
    // A probe answer is checked in the hypothesis's probe graph (R14.6; revised in M12).
    const known = stateHypotheses(state)(evidence.probe);
    const issues = probeIssues(evidence, known, ['evidence']);
    if (issues.length > 0 || known === undefined) return rejected(issues);
    const probeIndex = indexGraph(probeGraph(graph, known.hypothesis), engine);
    const itemFound = itemIssues(evidence, input.item, probeIndex, engine);
    if (itemFound.length > 0) return rejected(itemFound);
    const item = input.item as NonNullable<RecordInput['item']>;
    const taskFound = probeTaskIssues(item, known, ['item']);
    if (taskFound.length > 0) return rejected(taskFound);
    task = taskSnapshot(item);
  } else {
    const issues = itemIssues(evidence, input.item, index, engine);
    if (issues.length > 0) return rejected(issues);
    task = taskSnapshot(input.item as NonNullable<RecordInput['item']>);
    const outcomes = outcomeIssues(evidence, task, index, ['evidence']);
    if (outcomes.length > 0) return rejected(outcomes);
  }

  const entry = evidenceEntry(state.log.length, engine.hash, evidence, task);
  if (state.log.lastAt !== null && evidence.at < state.log.lastAt) {
    return replayRequired(entry, evidence.at);
  }
  if (held !== undefined && !(held.at === state.log.lastAt && held.seq === state.log.length - 1)) {
    return replayRequired(entry, held.at);
  }
  return applied(state, entry, context, held === undefined ? undefined : evidence);
}

export function recordHostAction(
  engine: Engine,
  state: PracticeState,
  graph: SkillGraph,
  input: HostActionInput,
): RecordResult {
  const mismatch = mismatchIssues(state, graph.version, engine);
  if (mismatch.length > 0) return rejected(mismatch);
  const shape = shapeIssues(hostInputShape, input, ['input']);
  if (shape.length > 0) return rejected(shape);
  if (state.recentIds.includes(input.id)) return duplicate(input.id, input.at);
  const index = indexGraph(graph, engine);
  const issues = hostActionIssues(
    input.action,
    index,
    (id) => state.held.some((record) => record.evidenceId === id),
    ['input', 'action'],
    stateHypotheses(state),
    engine.config,
    true,
  );
  if (issues.length > 0) return rejected(issues);
  const entry = hostEntry(state.log.length, engine.hash, input);
  if (state.log.lastAt !== null && input.at < state.log.lastAt)
    return replayRequired(entry, input.at);
  return applied(state, entry, { engine, graph: index }, undefined);
}

function replayRequired(entry: ReviewLogEntry, from: number): RecordResult {
  return Object.freeze({
    kind: 'replay-required',
    appended: Object.freeze([deepFreeze(entry)]),
    replayFrom: from,
  });
}

function applied(
  state: PracticeState,
  entry: ReviewLogEntry,
  context: ApplyContext,
  confirmation: Evidence | undefined,
): RecordResult {
  const draft = new Draft(state);
  if (confirmation !== undefined) {
    applyConfirmed(draft, confirmation.confirms as string, confirmation, context);
  }
  applyEntry(draft, entry, context, { confirmed: confirmation !== undefined });
  hashEntry(draft, entry);
  return Object.freeze({
    kind: 'applied',
    state: draft.finish(),
    appended: Object.freeze([deepFreeze(entry)]),
    events: Object.freeze([...draft.events]),
  });
}
