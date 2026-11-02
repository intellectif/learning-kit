/**
 * The checks `record`, `act`, `replay` and `replayFrom` share (design §6.1,
 * §8.10). They run before anything is applied, so `applyEntry` can trust its
 * input; any issue rejects the call with nothing to append.
 */

import { heldReason, skillOutcomeIssues } from '../evidence/index.js';
import { validateItems } from '../graph/index.js';
import type {
  Evidence,
  HostAction,
  Issue,
  PracticeItem,
  PracticeState,
  StageId,
  TaskSnapshot,
} from '../types.js';
import type { Engine, GraphIndex } from './context.js';

type Path = readonly (string | number)[];

function issue(code: string, path: Path, message: string): Issue {
  return { code, path: [...path], message };
}

/** `STATE_CONFIG_MISMATCH` and `GRAPH_VERSION_MISMATCH` for a state used with another configuration or graph. */
export function mismatchIssues(
  state: Pick<PracticeState, 'configHash' | 'graphVersion'>,
  graphVersion: string,
  engine: Engine,
  path: Path = ['state'],
): Issue[] {
  const issues: Issue[] = [];
  if (state.configHash !== engine.hash) {
    issues.push(
      issue(
        'STATE_CONFIG_MISMATCH',
        [...path, 'configHash'],
        `The state was built with configuration ${state.configHash}, not ${engine.hash}; replay the log.`,
      ),
    );
  }
  if (state.graphVersion !== graphVersion) {
    issues.push(
      issue(
        'GRAPH_VERSION_MISMATCH',
        [...path, 'graphVersion'],
        `The state was built against graph version "${state.graphVersion}", not "${graphVersion}"; replay the log.`,
      ),
    );
  }
  return issues;
}

/** Checks an item for `record` and returns its snapshot's source, or the issues. */
export function itemIssues(
  evidence: Evidence,
  item: PracticeItem | undefined,
  graph: GraphIndex,
  engine: Engine,
): Issue[] {
  if (item === undefined || item === null || (item as PracticeItem).id !== evidence.itemId) {
    return [
      issue(
        'ITEM_UNKNOWN',
        ['item'],
        `Evidence for item "${evidence.itemId}" needs that item, unless it confirms held evidence.`,
      ),
    ];
  }
  const validation = validateItems([item], graph.graph, engine.config);
  if (!validation.ok) {
    return validation.issues.map((found) => ({ ...found, path: ['item', ...found.path.slice(1)] }));
  }
  if (
    item.status !== 'proven' ||
    (item.proof !== undefined && !engine.config.acceptProofs.includes(item.proof.kind))
  ) {
    return [
      issue(
        'ITEM_UNPROVEN',
        ['item', item.status !== 'proven' ? 'status' : 'proof'],
        `Item "${item.id}" is not proven with an accepted proof kind.`,
      ),
    ];
  }
  return [];
}

/** Checks a task snapshot from the log against the graph, as `validateItems` checks an item. */
export function taskIssues(
  task: TaskSnapshot,
  graph: GraphIndex,
  engine: Engine,
  path: Path,
): Issue[] {
  const item: PracticeItem = {
    id: task.itemId,
    skills: task.skills,
    stage: task.stage,
    difficulty: task.difficulty,
    ...(task.criteria === undefined ? {} : { criteria: task.criteria }),
    ...(task.fluentSeconds === undefined ? {} : { fluentSeconds: task.fluentSeconds }),
    ...(task.slowSeconds === undefined ? {} : { slowSeconds: task.slowSeconds }),
    origin: task.origin,
    status: 'proven',
  };
  const validation = validateItems([item], graph.graph, engine.config);
  if (validation.ok) return [];
  // The snapshot shape already requires a non-empty itemId, the only id
  // check on one item, so every issue is under a field the snapshot shares.
  return validation.issues.map((found) => ({ ...found, path: [...path, ...found.path.slice(1)] }));
}

/**
 * `SKILL_NOT_IN_TASK` for the evidence's skill outcomes. Every task skill has
 * a stage equivalent to the task's (the item or snapshot check rejects one
 * without, `STAGE_NO_EQUIVALENT`), so an outcome on a task skill has one too.
 */
export function outcomeIssues(
  evidence: Evidence,
  task: TaskSnapshot,
  graph: GraphIndex,
  path: Path,
): Issue[] {
  return skillOutcomeIssues(evidence, task, graph.graph).map((found) => ({
    ...found,
    path: [...path, ...found.path],
  }));
}

/** What a confirmation needs of the evidence it confirms. */
export interface HeldTarget {
  readonly itemId: string;
  readonly at: number;
  readonly task: TaskSnapshot;
}

/** `CONFIRMATION_INVALID` and the outcome checks for evidence that confirms `held`. */
export function confirmationIssues(
  evidence: Evidence,
  held: HeldTarget,
  graph: GraphIndex,
  path: Path,
): Issue[] {
  const invalid = (key: string, message: string) => [
    issue('CONFIRMATION_INVALID', [...path, key], message),
  ];
  if (evidence.at < held.at)
    return invalid('at', 'A confirmation is not earlier than the evidence it confirms.');
  if (evidence.itemId !== held.itemId) {
    return invalid('itemId', 'A confirmation names the item of the evidence it confirms.');
  }
  if (evidence.supplements !== undefined) {
    return invalid('supplements', 'A confirmation does not also supplement other evidence.');
  }
  if (
    evidence.source.kind === 'exposure' ||
    evidence.source.kind === 'pending' ||
    heldReason(evidence) !== null
  ) {
    return invalid(
      'source',
      'A confirmation carries a grade that is applied now, not one that is held.',
    );
  }
  return outcomeIssues(evidence, held.task, graph, path);
}

/** The rule checks of a host action against the graph; `heldIds` are the evidence ids a discard may name. */
export function hostActionIssues(
  action: HostAction,
  graph: GraphIndex,
  isHeld: (evidenceId: string) => boolean,
  path: Path,
): Issue[] {
  if (action.kind === 'discard-held') {
    return isHeld(action.evidenceId)
      ? []
      : [
          issue(
            'HELD_UNKNOWN',
            [...path, 'evidenceId'],
            `No held evidence has id "${action.evidenceId}".`,
          ),
        ];
  }
  if (!graph.nodes.has(action.skillId)) {
    return [
      issue(
        'SKILL_UNKNOWN',
        [...path, 'skillId'],
        `Skill "${action.skillId}" is not in the graph.`,
      ),
    ];
  }
  const ladder = graph.ladder(action.skillId);
  if (ladder === null) {
    return [
      issue('LADDER_INVALID', [...path, 'skillId'], `Skill "${action.skillId}" has no ladder.`),
    ];
  }
  const stage: StageId | undefined =
    action.kind === 'place' || action.kind === 'prior' ? action.stage : undefined;
  if (stage !== undefined && !ladder.includes(stage)) {
    return [
      issue(
        'STAGE_NOT_IN_LADDER',
        [...path, 'stage'],
        `Stage "${stage}" is not in the ladder of skill "${action.skillId}".`,
      ),
    ];
  }
  return [];
}
