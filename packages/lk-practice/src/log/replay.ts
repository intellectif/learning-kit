/**
 * `replay` and `replayFrom` (design §7, §8.7): check every entry, sort by
 * `(at, seq)`, link each held entry to the first later confirmation with no
 * discard between (look-ahead), and apply the entries in that order through
 * `applyEntry`. The log hash folds the entries in `seq` order.
 */

import { probeGraph, validateGraph } from '../graph/index.js';
import { entryShape, shapeIssues } from '../schema/shape.js';
import type {
  Evidence,
  Issue,
  PracticeEvent,
  PracticeState,
  ReplayResult,
  ReviewLogEntry,
  SkillGraph,
} from '../types.js';
import { type ApplyContext, applyConfirmed, applyEntry, hashEntry } from './apply.js';
import { type Engine, type GraphIndex, indexGraph } from './context.js';
import { Draft } from './draft.js';
import { entryId } from './entries.js';
import {
  confirmationIssues,
  type HeldTarget,
  hostActionIssues,
  type KnownHypothesis,
  mismatchIssues,
  outcomeIssues,
  probeIssues,
  probeTaskIssues,
  taskIssues,
} from './validate.js';

interface Indexed {
  readonly entry: ReviewLogEntry;
  /** Position in the host's array, for issue paths. */
  readonly index: number;
}

function failed(issues: readonly Issue[]): ReplayResult {
  return Object.freeze({ ok: false, issues: Object.freeze(issues.map((i) => Object.freeze(i))) });
}

function graphIssues(graph: SkillGraph, engine: Engine): Issue[] {
  const validation = validateGraph(graph, engine.config);
  return validation.ok
    ? []
    : validation.issues.map((found) => ({ ...found, path: ['graph', ...found.path] }));
}

/** The replay of a whole log onto `start`, the initial state of the learner. */
export function replayLog(
  engine: Engine,
  start: PracticeState,
  entries: readonly ReviewLogEntry[],
  graph: SkillGraph,
): ReplayResult {
  const issues = graphIssues(graph, engine);
  if (issues.length > 0) return failed(issues);
  return run(engine, start, entries, graph, false);
}

/** The replay of the entries a checkpoint has not applied. */
export function replayLogFrom(
  engine: Engine,
  checkpoint: PracticeState,
  entries: readonly ReviewLogEntry[],
  graph: SkillGraph,
): ReplayResult {
  const issues = [
    ...mismatchIssues(checkpoint, graph.version, engine, ['checkpoint']),
    ...graphIssues(graph, engine),
  ];
  if (issues.length > 0) return failed(issues);
  return run(engine, checkpoint, entries, graph, true);
}

function run(
  engine: Engine,
  start: PracticeState,
  entries: readonly ReviewLogEntry[],
  graph: SkillGraph,
  fromCheckpoint: boolean,
): ReplayResult {
  if (!Array.isArray(entries)) {
    return failed([{ code: 'SHAPE_INVALID', path: ['entries'], message: 'entries is an array.' }]);
  }
  const shape = entries.flatMap((entry, index) =>
    shapeIssues(entryShape, entry, ['entries', index]),
  );
  if (shape.length > 0) return failed(shape);

  const pending: Indexed[] = [];
  entries.forEach((entry, index) => {
    if (entry.seq >= start.log.length) pending.push({ entry, index });
  });
  const bySeq = [...pending].sort((a, b) => a.entry.seq - b.entry.seq);
  const structure = structureIssues(start, bySeq, fromCheckpoint);
  if (structure.length > 0) return failed(structure);

  const index = indexGraph(graph, engine);
  const rules = ruleIssues(start, bySeq, index, engine);
  if (rules.length > 0) return failed(rules);

  const sorted = [...bySeq].sort((a, b) => a.entry.at - b.entry.at || a.entry.seq - b.entry.seq);
  const links = lookAhead(start, sorted);
  const checkpointLinks = [...links.entries()].filter(
    ([heldId]) =>
      !bySeq.some(({ entry }) => entry.kind === 'evidence' && entry.evidence.id === heldId),
  );
  const last = start.held.find(
    (held) => held.seq === start.log.length - 1 && held.at === start.log.lastAt,
  );
  const tooNew = checkpointLinks.filter(([heldId]) => heldId !== last?.evidenceId);
  if (tooNew.length > 0) {
    return failed(
      tooNew.map(([heldId]) => ({
        code: 'REPLAY_CHECKPOINT_TOO_NEW',
        path: ['checkpoint', 'held'],
        message: `Held evidence "${heldId}" is confirmed after entries the checkpoint already applied; replay from an earlier checkpoint.`,
      })),
    );
  }

  const context: ApplyContext = { engine, graph: index };
  const draft = new Draft(start);
  const used = new Set<string>();
  for (const [heldId, confirmation] of checkpointLinks) {
    applyConfirmed(draft, heldId, confirmation, context);
    used.add(confirmation.id);
  }
  for (const { entry } of sorted) {
    if (entry.kind === 'evidence' && entry.evidence.confirms !== undefined) {
      applyEntry(draft, entry, context, { confirmed: used.has(entry.evidence.id) });
      continue;
    }
    const confirmation = entry.kind === 'evidence' ? links.get(entry.evidence.id) : undefined;
    const link = confirmation === undefined ? {} : { confirmation };
    if (applyEntry(draft, entry, context, link) && confirmation !== undefined) {
      used.add(confirmation.id);
    }
  }
  for (const { entry } of bySeq) hashEntry(draft, entry);
  const state = draft.finish();
  const events: readonly PracticeEvent[] = Object.freeze([...draft.events]);
  return Object.freeze({ ok: true, state, events });
}

/** `ID_DUPLICATE`, `LOG_SEQ_INVALID` and `REPLAY_CHECKPOINT_TOO_NEW` (an entry earlier than the checkpoint). */
function structureIssues(
  start: PracticeState,
  bySeq: readonly Indexed[],
  fromCheckpoint: boolean,
): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  bySeq.forEach(({ entry, index }, position) => {
    const id = entryId(entry);
    if (seen.has(id)) {
      issues.push({
        code: 'ID_DUPLICATE',
        path:
          entry.kind === 'host' ? ['entries', index, 'id'] : ['entries', index, 'evidence', 'id'],
        message: `Two entries have id "${id}".`,
      });
    }
    seen.add(id);
    if (entry.seq !== start.log.length + position) {
      issues.push({
        code: 'LOG_SEQ_INVALID',
        path: ['entries', index, 'seq'],
        message: `The entries' seq values are not exactly ${start.log.length} to ${start.log.length + bySeq.length - 1}.`,
      });
    }
    if (fromCheckpoint && start.log.lastAt !== null && entry.at < start.log.lastAt) {
      issues.push({
        code: 'REPLAY_CHECKPOINT_TOO_NEW',
        path: ['entries', index, 'at'],
        message:
          'The entry is earlier than the last instant of the checkpoint; replay from an earlier checkpoint.',
      });
    }
  });
  return issues;
}

/** The rule checks of `record` and `act`, per entry, in seq order. */
function ruleIssues(
  start: PracticeState,
  bySeq: readonly Indexed[],
  graph: GraphIndex,
  engine: Engine,
): Issue[] {
  const targets = new Map<string, HeldTarget>();
  for (const held of start.held) targets.set(held.evidenceId, held);
  // Hypotheses known before each entry (R14.5; revised in M12). Replay knows
  // which were opened, not which were decided: the apply step ignores a late
  // probe, in order.
  const opened = new Map<string, KnownHypothesis>();
  for (const [id, hypothesis] of Object.entries(start.hypotheses ?? {})) {
    opened.set(id, { hypothesis, probing: true, closed: false });
  }
  const probeIndexes = new Map<string, GraphIndex>();
  const issues: Issue[] = [];
  for (const { entry, index } of bySeq) {
    const path = ['entries', index];
    if (entry.kind === 'host') {
      const found = hostActionIssues(
        entry.action,
        graph,
        (id) => targets.has(id),
        [...path, 'action'],
        (id) => opened.get(id),
        engine.config,
        false,
      );
      issues.push(...found);
      if (entry.action.kind === 'open-hypothesis' && found.length === 0) {
        const { hypothesis } = entry.action;
        opened.set(hypothesis.id, { hypothesis, probing: true, closed: false });
      }
      continue;
    }
    const { evidence } = entry;
    if (evidence.probe !== undefined) {
      const task = entry.task as NonNullable<typeof entry.task>;
      const known = opened.get(evidence.probe);
      let found = probeIssues(evidence, known, [...path, 'evidence']);
      if (found.length === 0 && known !== undefined) {
        let probeIndex = probeIndexes.get(evidence.probe);
        if (probeIndex === undefined) {
          probeIndex = indexGraph(probeGraph(graph.graph, known.hypothesis), engine);
          probeIndexes.set(evidence.probe, probeIndex);
        }
        found = taskIssues(task, probeIndex, [...path, 'task']);
        if (found.length === 0) found = probeTaskIssues(task, known, [...path, 'task']);
      }
      issues.push(...found);
      targets.set(evidence.id, { itemId: evidence.itemId, at: evidence.at, task });
      continue;
    }
    if (evidence.confirms === undefined) {
      const task = entry.task as NonNullable<typeof entry.task>;
      const found = taskIssues(task, graph, [...path, 'task']);
      issues.push(
        ...(found.length > 0 ? found : outcomeIssues(evidence, task, graph, [...path, 'evidence'])),
      );
      targets.set(evidence.id, { itemId: evidence.itemId, at: evidence.at, task });
      continue;
    }
    const target = targets.get(evidence.confirms);
    if (target === undefined) {
      issues.push({
        code: 'HELD_UNKNOWN',
        path: [...path, 'evidence', 'confirms'],
        message: `No earlier evidence entry has id "${evidence.confirms}".`,
      });
      continue;
    }
    issues.push(...confirmationIssues(evidence, target, graph, [...path, 'evidence']));
  }
  return issues;
}

/**
 * For each held candidate (an evidence entry, or a checkpoint's held record),
 * the first confirmation after it in `(at, seq)` order with no discard of it
 * between.
 */
function lookAhead(start: PracticeState, sorted: readonly Indexed[]): Map<string, Evidence> {
  const open = new Set<string>(start.held.map((held) => held.evidenceId));
  const links = new Map<string, Evidence>();
  for (const { entry } of sorted) {
    if (entry.kind === 'host') {
      if (entry.action.kind === 'discard-held') open.delete(entry.action.evidenceId);
      continue;
    }
    const { evidence } = entry;
    if (evidence.confirms === undefined) {
      open.add(evidence.id);
    } else if (open.has(evidence.confirms)) {
      links.set(evidence.confirms, evidence);
      open.delete(evidence.confirms);
    }
  }
  return links;
}
