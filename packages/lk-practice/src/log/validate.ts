/**
 * The checks `record`, `act`, `replay` and `replayFrom` share (design §6.1,
 * §8.10). They run before anything is applied, so `applyEntry` can trust its
 * input; any issue rejects the call with nothing to append.
 */

import { heldReason, skillOutcomeIssues } from '../evidence/index.js';
import { hypothesisId, ladderOf, validateItemsOn } from '../graph/index.js';
import type {
  Evidence,
  HostAction,
  Issue,
  PracticeItem,
  PracticeState,
  PrerequisiteHypothesis,
  ResolvedPracticeConfig,
  StageId,
  TaskSnapshot,
} from '../types.js';
import type { Engine, GraphIndex } from './context.js';
import { probing } from './discovery.js';

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
  const validation = validateItemsOn([item], graph.items());
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
export function taskIssues(task: TaskSnapshot, graph: GraphIndex, path: Path): Issue[] {
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
  const validation = validateItemsOn([item], graph.items());
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

/**
 * A hypothesis as the checks see it (R14.5; revised in M12). `record` and
 * `act` read the state, so a decided or closed one is known as such; `replay`
 * knows only which ones were opened, and leaves both flags false: what the
 * apply step does with a late answer is decided there, in order.
 */
export interface KnownHypothesis {
  readonly hypothesis: Pick<PrerequisiteHypothesis, 'forSkillId' | 'skillId' | 'skill'>;
  /** Takes probe answers: open, or confirmed with its prerequisite not ready (R14.9). */
  readonly probing: boolean;
  readonly closed: boolean;
}

export type HypothesisLookup = (id: string) => KnownHypothesis | undefined;

/** The lookup of a state's hypotheses. */
export function stateHypotheses(state: PracticeState): HypothesisLookup {
  return (id) => {
    const found =
      state.hypotheses !== undefined && Object.hasOwn(state.hypotheses, id)
        ? state.hypotheses[id]
        : undefined;
    return found === undefined
      ? undefined
      : { hypothesis: found, probing: probing(found), closed: found.closedAt !== null };
  };
}

/**
 * The rule checks of a host action against the graph; `isHeld` says which
 * evidence a discard may name and `hypotheses` which hypotheses exist.
 * `fresh` is true for `act` and false for `replay`: an opened hypothesis
 * stays valid in the log once its own discovery extension has put its
 * candidate and edge into the graph (R14.8; revised in M12).
 */
export function hostActionIssues(
  action: HostAction,
  graph: GraphIndex,
  isHeld: (evidenceId: string) => boolean,
  path: Path,
  hypotheses: HypothesisLookup,
  config: ResolvedPracticeConfig,
  fresh: boolean,
): Issue[] {
  if (action.kind === 'open-hypothesis') {
    return openIssues(action.hypothesis, graph, hypotheses, config, fresh, [...path, 'hypothesis']);
  }
  if (action.kind === 'close-hypothesis') {
    const known = hypotheses(action.hypothesisId);
    if (known === undefined) {
      return [
        issue(
          'HYPOTHESIS_UNKNOWN',
          [...path, 'hypothesisId'],
          `No hypothesis "${action.hypothesisId}" was opened.`,
        ),
      ];
    }
    return known.closed
      ? [
          issue(
            'HYPOTHESIS_CLOSED',
            [...path, 'hypothesisId'],
            `Hypothesis "${action.hypothesisId}" is closed.`,
          ),
        ]
      : [];
  }
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

/**
 * The checks of `open-hypothesis` (R14.5): the content id
 * (`HYPOTHESIS_ID_MISMATCH`); a hypothesis not opened before
 * (`HYPOTHESIS_EXISTS`, so a refuted one stays refuted); the blocked skill in
 * the graph with a ladder; a candidate other than it (`HYPOTHESIS_SELF`), in
 * the graph or, when `skill` is given, one with a ladder
 * (`HYPOTHESIS_SKILL_MISMATCH`). When `fresh` (`act`), also: a new candidate
 * not in the graph yet (`HYPOTHESIS_SKILL_EXISTS`), no prerequisite edge
 * between them yet (`HYPOTHESIS_EDGE_EXISTS`), and no path of prerequisites
 * from the candidate back to the blocked skill (`GRAPH_CYCLE`). Replay skips these
 * three: admitting the hypothesis is what makes them true.
 */
function openIssues(
  hypothesis: PrerequisiteHypothesis,
  graph: GraphIndex,
  hypotheses: HypothesisLookup,
  config: ResolvedPracticeConfig,
  fresh: boolean,
  path: Path,
): Issue[] {
  const { forSkillId, skillId, skill } = hypothesis;
  const expected = hypothesisId(hypothesis);
  if (hypothesis.id !== expected) {
    return [
      issue(
        'HYPOTHESIS_ID_MISMATCH',
        [...path, 'id'],
        `Hypothesis id "${hypothesis.id}" is not its content id "${expected}".`,
      ),
    ];
  }
  if (hypotheses(hypothesis.id) !== undefined) {
    return [
      issue('HYPOTHESIS_EXISTS', [...path, 'id'], `Hypothesis "${hypothesis.id}" was opened.`),
    ];
  }
  if (!graph.nodes.has(forSkillId)) {
    return [
      issue('SKILL_UNKNOWN', [...path, 'forSkillId'], `Skill "${forSkillId}" is not in the graph.`),
    ];
  }
  if (graph.ladder(forSkillId) === null) {
    return [
      issue('LADDER_INVALID', [...path, 'forSkillId'], `Skill "${forSkillId}" has no ladder.`),
    ];
  }
  if (skillId === forSkillId) {
    return [issue('HYPOTHESIS_SELF', [...path, 'skillId'], 'A skill is not its own prerequisite.')];
  }
  if (skill === undefined) {
    if (!graph.nodes.has(skillId)) {
      return [
        issue('SKILL_UNKNOWN', [...path, 'skillId'], `Skill "${skillId}" is not in the graph.`),
      ];
    }
  } else if (skill.id !== skillId) {
    return [
      issue('HYPOTHESIS_SKILL_MISMATCH', [...path, 'skill', 'id'], 'skill.id equals skillId.'),
    ];
  } else if (ladderOf(skill, config) === null) {
    return [issue('LADDER_INVALID', [...path, 'skill'], `Skill "${skillId}" has no ladder.`)];
  } else if (fresh && graph.nodes.has(skillId)) {
    return [
      issue(
        'HYPOTHESIS_SKILL_EXISTS',
        [...path, 'skill'],
        `Skill "${skillId}" is in the graph; name it without a new skill.`,
      ),
    ];
  }
  if (!fresh) return [];
  if (
    graph.graph.edges.some(
      (edge) => edge.kind === 'prerequisite' && edge.from === skillId && edge.to === forSkillId,
    )
  ) {
    return [
      issue(
        'HYPOTHESIS_EDGE_EXISTS',
        [...path, 'skillId'],
        `Skill "${skillId}" is already a prerequisite of "${forSkillId}".`,
      ),
    ];
  }
  if (needs(graph, skillId, forSkillId)) {
    return [
      issue(
        'GRAPH_CYCLE',
        [...path, 'skillId'],
        `Skill "${skillId}" needs "${forSkillId}", so it cannot also come before it.`,
      ),
    ];
  }
  return [];
}

/** True when `skillId` reaches `target` through prerequisite edges (it needs it, directly or not). */
function needs(graph: GraphIndex, skillId: string, target: string): boolean {
  const before = new Map<string, string[]>();
  for (const edge of graph.graph.edges) {
    if (edge.kind !== 'prerequisite') continue;
    const list = before.get(edge.to);
    if (list === undefined) before.set(edge.to, [edge.from]);
    else list.push(edge.from);
  }
  const seen = new Set<string>();
  const stack = [...(before.get(skillId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(before.get(id) ?? []));
  }
  return false;
}

/**
 * The checks of a probe answer itself (R14.6; revised in M12): the hypothesis
 * is known (`HYPOTHESIS_UNKNOWN`) and takes probes: open, or confirmed with
 * its prerequisite not ready (`HYPOTHESIS_CLOSED`), and the answer stands
 * alone, graded or self-rated:
 * no confirmation, supplement, exposure or skill outcomes (`PROBE_INVALID`).
 */
export function probeIssues(
  evidence: Evidence,
  known: KnownHypothesis | undefined,
  path: Path,
): Issue[] {
  const probe = [...path, 'probe'];
  if (known === undefined) {
    return [issue('HYPOTHESIS_UNKNOWN', probe, `No hypothesis "${evidence.probe}" was opened.`)];
  }
  if (!known.probing) {
    return [
      issue('HYPOTHESIS_CLOSED', probe, `Hypothesis "${evidence.probe}" takes no more probes.`),
    ];
  }
  for (const key of ['confirms', 'supplements', 'skillOutcomes'] as const) {
    if (evidence[key] !== undefined) {
      return [issue('PROBE_INVALID', [...path, key], `A probe answer has no ${key}.`)];
    }
  }
  if (evidence.source.kind === 'exposure') {
    return [issue('PROBE_INVALID', [...path, 'source'], 'A probe answer is graded or self-rated.')];
  }
  return [];
}

/**
 * The checks of a probe's task (R14.6): on the candidate alone, with no
 * criteria (`PROBE_INVALID`). The item's other rules are the item checks, run
 * in the hypothesis's probe graph.
 */
export function probeTaskIssues(
  task: Pick<TaskSnapshot, 'skills' | 'criteria'>,
  known: KnownHypothesis,
  path: Path,
): Issue[] {
  const [only, ...rest] = task.skills;
  if (only?.skillId !== known.hypothesis.skillId || rest.length > 0) {
    return [
      issue(
        'PROBE_INVALID',
        [...path, 'skills'],
        `A probe is on the candidate "${known.hypothesis.skillId}" alone.`,
      ),
    ];
  }
  if (task.criteria !== undefined) {
    return [issue('PROBE_INVALID', [...path, 'criteria'], 'A probe binds no criteria.')];
  }
  return [];
}
