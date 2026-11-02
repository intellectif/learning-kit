/**
 * Graph and item validation (R2.1, R2.2, R3.8). Pure: inputs are never
 * mutated; issues come in a stable order (input order, then rule order).
 */

import { defaultConfig } from '../config.js';
import type {
  GraphValidation,
  Issue,
  ItemsValidation,
  PracticeItem,
  ResolvedPracticeConfig,
  SkillEdge,
  SkillGraph,
  SkillNode,
  StageId,
} from '../types.js';
import {
  equivalentStage,
  type LadderSource,
  ladderOf,
  resolveStageDemand,
  type StageDemandResolution,
} from './stages.js';

type Path = readonly (string | number)[];

const KNOWLEDGE = ['declarative', 'procedural', 'mixed'];
const ORIGINS = ['authored', 'generated'];
const STATUSES = ['proven', 'unproven'];
const WEIGHT_TOLERANCE = 1e-9;

function issue(code: string, path: Path, message: string): Issue {
  return { code, path: [...path], message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function optional(
  record: Record<string, unknown>,
  key: string,
  check: (value: unknown) => boolean,
): boolean {
  return record[key] === undefined ? !Object.hasOwn(record, key) : check(record[key]);
}

const isFiniteNumber = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value);
const isPositiveNumber = (value: unknown): boolean =>
  isFiniteNumber(value) && (value as number) > 0;
const isString = (value: unknown): boolean => typeof value === 'string';

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

function graphShapeIssues(graph: unknown): Issue[] {
  const issues: Issue[] = [];
  if (!isRecord(graph)) return [issue('SHAPE_INVALID', [], 'A skill graph is an object.')];
  if (typeof graph.version !== 'string') {
    issues.push(issue('SHAPE_INVALID', ['version'], 'version is a string.'));
  }
  if (!Array.isArray(graph.skills)) {
    issues.push(issue('SHAPE_INVALID', ['skills'], 'skills is an array.'));
  } else {
    graph.skills.forEach((skill: unknown, i: number) => {
      issues.push(...skillShapeIssues(skill, ['skills', i]));
    });
  }
  if (!Array.isArray(graph.edges)) {
    issues.push(issue('SHAPE_INVALID', ['edges'], 'edges is an array.'));
  } else {
    graph.edges.forEach((edge: unknown, i: number) => {
      issues.push(...edgeShapeIssues(edge, ['edges', i]));
    });
  }
  return issues;
}

function skillShapeIssues(skill: unknown, path: Path): Issue[] {
  if (!isRecord(skill)) return [issue('SHAPE_INVALID', path, 'A skill is an object.')];
  const issues: Issue[] = [];
  const bad = (key: string, message: string) =>
    issues.push(issue('SHAPE_INVALID', [...path, key], message));
  if (!isId(skill.id)) bad('id', 'id is a non-empty string.');
  if (!KNOWLEDGE.includes(skill.knowledge as string)) {
    bad('knowledge', `knowledge is one of ${KNOWLEDGE.join(', ')}.`);
  }
  if (!optional(skill, 'stages', isStringArray)) bad('stages', 'stages is an array of stage ids.');
  for (const key of ['interleaveGroup', 'label', 'description', 'criteriaHint']) {
    if (!optional(skill, key, isString)) bad(key, `${key} is a string.`);
  }
  if (!optional(skill, 'tags', isStringArray)) bad('tags', 'tags is an array of strings.');
  for (const key of ['masteryPrior', 'referenceDifficulty', 'desiredRetention']) {
    if (!optional(skill, key, isFiniteNumber)) bad(key, `${key} is a finite number.`);
  }
  if (
    !optional(
      skill,
      'forms',
      (forms) => isRecord(forms) && Object.values(forms).every((list) => isStringArray(list)),
    )
  ) {
    bad('forms', 'forms maps stage ids to arrays of strings.');
  }
  return issues;
}

function edgeShapeIssues(edge: unknown, path: Path): Issue[] {
  if (!isRecord(edge)) return [issue('SHAPE_INVALID', path, 'An edge is an object.')];
  const issues: Issue[] = [];
  const bad = (key: string, message: string) =>
    issues.push(issue('SHAPE_INVALID', [...path, key], message));
  if (!isId(edge.from)) bad('from', 'from is a skill id.');
  if (!isId(edge.to)) bad('to', 'to is a skill id.');
  if (edge.kind === 'prerequisite') {
    if (edge.strength !== 'hard' && edge.strength !== 'soft') {
      bad('strength', 'strength is hard or soft.');
    }
  } else if (edge.kind === 'encompasses') {
    if (!isFiniteNumber(edge.weight)) bad('weight', 'weight is a finite number.');
  } else {
    bad('kind', 'kind is prerequisite or encompasses.');
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Graph rules
// ---------------------------------------------------------------------------

/** Effective ladders of a shape-valid graph, for stage demand. */
function graphLadders(graph: SkillGraph, config: ResolvedPracticeConfig): LadderSource[] {
  const ladders: LadderSource[] = [
    { ladder: config.ladders.declarative, path: ['config', 'ladders', 'declarative'] },
    { ladder: config.ladders.procedural, path: ['config', 'ladders', 'procedural'] },
  ];
  graph.skills.forEach((skill, i) => {
    const stages = skill.stages;
    if (
      stages !== undefined &&
      stages.length > 0 &&
      !stages.includes('') &&
      new Set(stages).size === stages.length
    ) {
      ladders.push({ ladder: stages, path: ['skills', i, 'stages'] });
    }
  });
  return ladders;
}

/** Stage demand for a graph's ladders under a configuration (R3.8). */
export function graphStageDemand(
  graph: SkillGraph,
  config: ResolvedPracticeConfig,
): StageDemandResolution {
  return resolveStageDemand(graphLadders(graph, config), config.stageDemand);
}

/**
 * Validates a skill graph (R2.1, R3.8). `config` supplies the ladders and
 * stage demand; it defaults to the resolved default configuration.
 */
export function validateGraph(graph: unknown, config?: ResolvedPracticeConfig): GraphValidation {
  const shape = graphShapeIssues(graph);
  if (shape.length > 0) return { ok: false, issues: shape };
  const g = graph as SkillGraph;
  const resolved = config ?? defaultConfig();
  const issues: Issue[] = [];
  const warnings: Issue[] = [];

  const ids = new Map<string, number>();
  g.skills.forEach((skill, i) => {
    if (ids.has(skill.id)) {
      issues.push(
        issue('ID_DUPLICATE', ['skills', i, 'id'], `Skill id "${skill.id}" is used twice.`),
      );
    } else {
      ids.set(skill.id, i);
    }
    issues.push(...skillRuleIssues(skill, ['skills', i], resolved));
  });

  const edgeKeys = new Set<string>();
  const usable: { edge: SkillEdge; index: number }[] = [];
  g.edges.forEach((edge, i) => {
    const path = ['edges', i];
    let ok = true;
    for (const end of ['from', 'to'] as const) {
      if (!ids.has(edge[end])) {
        issues.push(
          issue(
            'SKILL_UNKNOWN',
            [...path, end],
            `Edge ${end} "${edge[end]}" is not a skill of the graph.`,
          ),
        );
        ok = false;
      }
    }
    if (edge.from === edge.to) {
      issues.push(issue('EDGE_SELF', path, `Skill "${edge.from}" has an edge to itself.`));
      ok = false;
    }
    const key = JSON.stringify([edge.kind, edge.from, edge.to]);
    if (edgeKeys.has(key)) {
      issues.push(
        issue(
          'EDGE_DUPLICATE',
          path,
          `The ${edge.kind} edge from "${edge.from}" to "${edge.to}" is listed twice.`,
        ),
      );
      ok = false;
    }
    edgeKeys.add(key);
    if (edge.kind === 'encompasses' && !(edge.weight > 0 && edge.weight <= 1)) {
      issues.push(
        issue('EDGE_WEIGHT_INVALID', [...path, 'weight'], 'An encompasses weight is in (0, 1].'),
      );
    }
    if (ok) usable.push({ edge, index: i });
  });

  for (const kind of ['prerequisite', 'encompasses'] as const) {
    issues.push(
      ...cycleIssues(
        usable.filter(({ edge }) => edge.kind === kind),
        kind,
      ),
    );
  }

  const demand = graphStageDemand(g, resolved);
  issues.push(...demand.issues);
  warnings.push(...demand.warnings);

  // R2.1 warning: a composite should come after its components.
  const prerequisites = adjacency(usable.filter(({ edge }) => edge.kind === 'prerequisite'));
  for (const { edge, index } of usable) {
    if (edge.kind !== 'encompasses') continue;
    if (!reaches(prerequisites, edge.to, edge.from)) {
      warnings.push(
        issue(
          'ENCOMPASSES_WITHOUT_PREREQUISITE',
          ['edges', index],
          `"${edge.from}" encompasses "${edge.to}", which is not also a prerequisite of it, directly or transitively.`,
        ),
      );
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, graph: g, warnings };
}

function skillRuleIssues(skill: SkillNode, path: Path, config: ResolvedPracticeConfig): Issue[] {
  const issues: Issue[] = [];
  if (skill.stages !== undefined) {
    if (skill.stages.length === 0 || skill.stages.some((stage) => stage === '')) {
      issues.push(
        issue(
          'LADDER_INVALID',
          [...path, 'stages'],
          'A ladder is a non-empty array of non-empty stage ids.',
        ),
      );
    } else if (new Set(skill.stages).size !== skill.stages.length) {
      issues.push(issue('LADDER_INVALID', [...path, 'stages'], 'A ladder lists each stage once.'));
    }
  } else if (skill.knowledge === 'mixed') {
    issues.push(
      issue(
        'LADDER_INVALID',
        [...path, 'stages'],
        'A mixed skill declares its ladder in stages (R3.1).',
      ),
    );
  }
  const ladder = ladderOf(skill, config) ?? [];
  if (skill.forms !== undefined) {
    for (const stage of Object.keys(skill.forms).sort()) {
      if (!ladder.includes(stage)) {
        issues.push(
          issue(
            'STAGE_NOT_IN_LADDER',
            [...path, 'forms', stage],
            `forms names stage "${stage}", which is not in the skill's ladder.`,
          ),
        );
      }
    }
  }
  if (
    skill.desiredRetention !== undefined &&
    !(skill.desiredRetention >= 0.7 && skill.desiredRetention <= 0.97)
  ) {
    issues.push(
      issue(
        'RETENTION_OUT_OF_RANGE',
        [...path, 'desiredRetention'],
        'desiredRetention is in [0.7, 0.97].',
      ),
    );
  }
  return issues;
}

function adjacency(edges: readonly { edge: SkillEdge }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { edge } of edges) {
    const list = out.get(edge.from);
    if (list === undefined) out.set(edge.from, [edge.to]);
    else list.push(edge.to);
  }
  return out;
}

function reaches(graph: ReadonlyMap<string, readonly string[]>, from: string, to: string): boolean {
  const seen = new Set<string>([from]);
  const stack = [from];
  while (stack.length > 0) {
    const node = stack.pop() as string;
    for (const next of graph.get(node) ?? []) {
      if (next === to) return true;
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}

/** One `GRAPH_CYCLE` per strongly connected component with more than one skill (Tarjan). */
function cycleIssues(
  edges: readonly { edge: SkillEdge; index: number }[],
  kind: SkillEdge['kind'],
): Issue[] {
  const graph = adjacency(edges);
  const nodes = [...new Set(edges.flatMap(({ edge }) => [edge.from, edge.to]))];
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  const visit = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node) as number, low.get(next) as number));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) as number, index.get(next) as number));
      }
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop() as string;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) components.push(component.sort());
    }
  };
  for (const node of nodes) if (!index.has(node)) visit(node);

  return components
    .map((component) => {
      const members = new Set(component);
      const first = edges.find(({ edge }) => members.has(edge.from) && members.has(edge.to));
      return { component, at: (first as { index: number }).index };
    })
    .sort((a, b) => a.at - b.at)
    .map(({ component, at }) =>
      issue(
        'GRAPH_CYCLE',
        ['edges', at],
        `The ${kind} edges form a cycle through ${component.map((id) => `"${id}"`).join(', ')}.`,
      ),
    );
}

// ---------------------------------------------------------------------------
// Items (R2.2)
// ---------------------------------------------------------------------------

function itemShapeIssues(item: unknown, path: Path): Issue[] {
  if (!isRecord(item)) return [issue('SHAPE_INVALID', path, 'An item is an object.')];
  const issues: Issue[] = [];
  const bad = (key: string, message: string) =>
    issues.push(issue('SHAPE_INVALID', [...path, key], message));
  if (!isId(item.id)) bad('id', 'id is a non-empty string.');
  if (
    !Array.isArray(item.skills) ||
    item.skills.length === 0 ||
    !item.skills.every(
      (entry) => isRecord(entry) && isId(entry.skillId) && isFiniteNumber(entry.weight),
    )
  ) {
    bad('skills', 'skills is a non-empty array of { skillId, weight }.');
  }
  if (!isId(item.stage)) bad('stage', 'stage is a stage id.');
  if (!optional(item, 'difficulty', isFiniteNumber))
    bad('difficulty', 'difficulty is a finite number.');
  for (const key of ['expectedSeconds', 'fluentSeconds', 'slowSeconds']) {
    if (!optional(item, key, isPositiveNumber)) bad(key, `${key} is a positive number.`);
  }
  if (
    !optional(
      item,
      'criteria',
      (criteria) =>
        Array.isArray(criteria) &&
        criteria.every((entry) => isRecord(entry) && isId(entry.name) && isId(entry.skillId)),
    )
  ) {
    bad('criteria', 'criteria is an array of { name, skillId }.');
  }
  for (const key of ['form', 'contentHash']) {
    if (!optional(item, key, isString)) bad(key, `${key} is a string.`);
  }
  if (!ORIGINS.includes(item.origin as string)) bad('origin', 'origin is authored or generated.');
  if (!STATUSES.includes(item.status as string)) bad('status', 'status is proven or unproven.');
  if (!optional(item, 'proof', isRecord)) bad('proof', 'proof is an object.');
  return issues;
}

/**
 * Validates practice items against a graph that `validateGraph` accepted
 * (R2.2, R3.8). `config` supplies the ladders and stage demand; it defaults to
 * the resolved default configuration.
 */
export function validateItems(
  items: unknown,
  graph: SkillGraph,
  config?: ResolvedPracticeConfig,
): ItemsValidation {
  if (!Array.isArray(items)) {
    return { ok: false, issues: [issue('SHAPE_INVALID', [], 'Items are an array.')] };
  }
  const shape = items.flatMap((item, i) => itemShapeIssues(item, [i]));
  if (shape.length > 0) return { ok: false, issues: shape };

  const resolved = config ?? defaultConfig();
  const skills = new Map(graph.skills.map((skill) => [skill.id, skill]));
  const components = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'encompasses') continue;
    const list = components.get(edge.from);
    if (list === undefined) components.set(edge.from, [edge.to]);
    else list.push(edge.to);
  }
  const { demand } = graphStageDemand(graph, resolved);
  const ladder = (skillId: string): readonly StageId[] =>
    ladderOf(skills.get(skillId) as SkillNode, resolved) ?? [];

  const issues: Issue[] = [];
  const seen = new Set<string>();
  (items as PracticeItem[]).forEach((item, i) => {
    const path = [i];
    if (seen.has(item.id)) {
      issues.push(issue('ID_DUPLICATE', [...path, 'id'], `Item id "${item.id}" is used twice.`));
    }
    seen.add(item.id);

    const listed = new Set<string>();
    let known = true;
    let sum = 0;
    item.skills.forEach((entry, j) => {
      if (!skills.has(entry.skillId)) {
        issues.push(
          issue(
            'SKILL_UNKNOWN',
            [...path, 'skills', j, 'skillId'],
            `Skill "${entry.skillId}" is not in the graph.`,
          ),
        );
        known = false;
      }
      if (listed.has(entry.skillId)) {
        issues.push(
          issue(
            'ID_DUPLICATE',
            [...path, 'skills', j, 'skillId'],
            `Skill "${entry.skillId}" is listed twice.`,
          ),
        );
      }
      listed.add(entry.skillId);
      if (!(entry.weight > 0 && entry.weight <= 1)) {
        issues.push(
          issue(
            'ITEM_WEIGHT_INVALID',
            [...path, 'skills', j, 'weight'],
            'A skill weight is in (0, 1].',
          ),
        );
      }
      sum += entry.weight;
    });
    if (Math.abs(sum - 1) > WEIGHT_TOLERANCE) {
      issues.push(
        issue('ITEM_WEIGHTS_SUM', [...path, 'skills'], `The skill weights sum to ${sum}, not 1.`),
      );
    }

    if (known) {
      // The primary skill has the largest weight; the first listed wins a tie.
      let primary = 0;
      item.skills.forEach((entry, j) => {
        if (entry.weight > (item.skills[primary] as { weight: number }).weight) primary = j;
      });
      const primaryId = (item.skills[primary] as { skillId: string }).skillId;
      if (!ladder(primaryId).includes(item.stage)) {
        issues.push(
          issue(
            'STAGE_NOT_IN_LADDER',
            [...path, 'stage'],
            `Stage "${item.stage}" is not in the ladder of the primary skill "${primaryId}".`,
          ),
        );
      }
      const reachable = closure([...listed], components);
      item.skills.forEach((entry, j) => {
        if (j === primary || ladder(entry.skillId).includes(item.stage)) return;
        const parents = [...listed].filter((other) => other !== entry.skillId);
        const isComponent = closure(parents, components).has(entry.skillId);
        if (!isComponent || equivalentStage(item.stage, ladder(entry.skillId), demand) === null) {
          issues.push(
            issue(
              'STAGE_NO_EQUIVALENT',
              [...path, 'skills', j],
              isComponent
                ? `Skill "${entry.skillId}" has no stage at or below the demand of "${item.stage}".`
                : `Skill "${entry.skillId}" lacks stage "${item.stage}" and is not a component of another listed skill.`,
            ),
          );
        }
      });
      item.criteria?.forEach((criterion, j) => {
        const criterionPath = [...path, 'criteria', j, 'skillId'];
        if (!skills.has(criterion.skillId)) {
          issues.push(
            issue(
              'SKILL_UNKNOWN',
              criterionPath,
              `Skill "${criterion.skillId}" is not in the graph.`,
            ),
          );
        } else if (!reachable.has(criterion.skillId)) {
          issues.push(
            issue(
              'SKILL_NOT_IN_TASK',
              criterionPath,
              `Criterion "${criterion.name}" names "${criterion.skillId}", which is neither an item skill nor a component of one.`,
            ),
          );
        }
      });
    }

    if (
      item.fluentSeconds !== undefined &&
      item.slowSeconds !== undefined &&
      !(item.fluentSeconds < item.slowSeconds)
    ) {
      issues.push(
        issue(
          'ITEM_TIMING_ORDER',
          [...path, 'fluentSeconds'],
          'fluentSeconds must be below slowSeconds.',
        ),
      );
    }
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, items: items as PracticeItem[], warnings: [] };
}

/** `roots` and every skill they encompass, transitively. */
function closure(
  roots: readonly string[],
  components: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const out = new Set<string>(roots);
  const stack = [...roots];
  while (stack.length > 0) {
    for (const next of components.get(stack.pop() as string) ?? []) {
      if (!out.has(next)) {
        out.add(next);
        stack.push(next);
      }
    }
  }
  return out;
}
