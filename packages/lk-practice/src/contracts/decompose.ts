/**
 * The decomposition contract (design 8.8, R9.5, R2.6) (M7): the facts a
 * decomposer receives for a learner's goal, the check of its proposal, and
 * the admission of the resulting extension. The package never calls a
 * decomposer and writes no prompt. Admitting an extension changes the
 * composed graph's version, so the host replays the learner's log against
 * the new graph (design 8.9).
 */

import { defaultConfig } from '../config.js';
import { canonicalJson } from '../determinism/canonical.js';
import { hashCanonical } from '../determinism/fnv.js';
import { deepFreeze } from '../determinism/freeze.js';
import { composeGraph, extensionIssues, ladderOf } from '../graph/index.js';
import { compareKeys } from '../log/draft.js';
import { plainCopy } from '../schema/copy.js';
import { approvalShape, extensionShape, proposalShape, shapeIssues } from '../schema/shape.js';
import type {
  DecompositionCheck,
  DecompositionOptions,
  DecompositionRequest,
  DecompositionSkillFact,
  ExtensionAdmission,
  ExtensionApproval,
  GraphExtension,
  Issue,
  LearnerGoal,
  ResolvedPracticeConfig,
  SkillEdge,
  SkillGraph,
  SkillNode,
} from '../types.js';

/** The default `maxSkills` (R9.5). */
export const DEFAULT_MAX_SKILLS = 12;

const KNOWLEDGE: readonly SkillNode['knowledge'][] = ['declarative', 'procedural', 'mixed'];

/**
 * The facts a decomposer receives for `goal` (R9.5); no prompt. Neighbours
 * are the skills within two edges of an anchor, of either kind and in either
 * direction, in graph order; `edges` are the graph's edges among anchors and
 * neighbours. `config` supplies the ladders and defaults to the resolved
 * default configuration. Throws a `TypeError` for an anchor the graph does
 * not have, no anchor, an empty `idPrefix`, a `maxSkills` that is not a
 * positive integer, an unknown or empty `knowledge` list, or a `seed` that is
 * not a string.
 */
export function decompositionRequest(
  goal: LearnerGoal,
  graph: SkillGraph,
  options: DecompositionOptions,
  config?: ResolvedPracticeConfig,
): DecompositionRequest {
  const resolved = config ?? defaultConfig();
  const nodes = new Map(graph.skills.map((skill) => [skill.id, skill]));
  const anchors = goal.anchorSkillIds;
  if (anchors.length === 0) throw new TypeError('lk-practice: a goal has at least one anchor.');
  for (const anchor of anchors) {
    if (!nodes.has(anchor)) {
      throw new TypeError(`lk-practice: anchor skill "${anchor}" is not in the graph.`);
    }
  }
  if (typeof options.idPrefix !== 'string' || options.idPrefix === '') {
    throw new TypeError('lk-practice: idPrefix is a non-empty string.');
  }
  const maxSkills = options.maxSkills ?? DEFAULT_MAX_SKILLS;
  if (!Number.isInteger(maxSkills) || maxSkills < 1) {
    throw new TypeError('lk-practice: maxSkills is a positive integer.');
  }
  const knowledge = options.knowledge ?? KNOWLEDGE;
  if (knowledge.length === 0 || knowledge.some((kind) => !KNOWLEDGE.includes(kind))) {
    throw new TypeError('lk-practice: knowledge lists declarative, procedural or mixed.');
  }
  if (typeof options.seed !== 'string') throw new TypeError('lk-practice: seed is a string.');

  const near = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    const set = near.get(a);
    if (set === undefined) near.set(a, new Set([b]));
    else set.add(b);
  };
  for (const edge of graph.edges) {
    link(edge.from, edge.to);
    link(edge.to, edge.from);
  }
  const anchorSet = new Set(anchors);
  const within = new Set<string>(anchors);
  let frontier = [...anchors];
  for (let step = 0; step < 2; step += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const other of near.get(id) ?? []) {
        if (!within.has(other)) {
          within.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  const fact = (skill: SkillNode): DecompositionSkillFact => ({
    id: skill.id,
    knowledge: skill.knowledge,
    ladder: [...(ladderOf(skill, resolved) ?? [])],
    ...(skill.label === undefined ? {} : { label: skill.label }),
  });

  return deepFreeze({
    version: 1,
    goal: { id: goal.id, text: goal.text, anchorSkillIds: [...anchors] },
    anchors: anchors.map((id) => fact(nodes.get(id) as SkillNode)),
    neighbours: graph.skills
      .filter((skill) => within.has(skill.id) && !anchorSet.has(skill.id))
      .map(fact),
    edges: graph.edges
      .filter((edge) => within.has(edge.from) && within.has(edge.to))
      .map((edge) => ({ ...edge })),
    idPrefix: options.idPrefix,
    knowledge: [...knowledge],
    ladders: {
      declarative: [...resolved.ladders.declarative],
      procedural: [...resolved.ladders.procedural],
    },
    maxSkills,
    seed: options.seed,
  });
}

/**
 * The id of an extension (design §5.5, §9): `fnv1a64` of the canonical JSON
 * of its skills sorted by id and its edges sorted by their canonical JSON.
 * Only the content counts, so the same skills and edges have the same id
 * whoever approves them and whatever goal proposed them.
 */
export function extensionId(extension: Pick<GraphExtension, 'skills' | 'edges'>): string {
  const skills = [...extension.skills].sort((a, b) => compareKeys(a.id, b.id));
  const edges = extension.edges
    .map((edge) => ({ edge, key: canonicalJson(edge) }))
    .sort((a, b) => compareKeys(a.key, b.key))
    .map(({ edge }) => edge);
  return hashCanonical({ skills, edges });
}

/**
 * Checks a decomposer's proposal (R9.5). Total: any `candidate` gives a
 * result and never throws. Beyond the shape: at most `maxSkills` skills
 * (`DECOMPOSITION_TOO_MANY_SKILLS`), knowledge types the request allows
 * (`DECOMPOSITION_KNOWLEDGE_NOT_ALLOWED`), the R2.6 rules of `composeGraph`
 * (ids under the prefix and new to the graph, edges only into new skills),
 * the union a valid graph (acyclic, valid ladders and edges; an issue the
 * union raises on a proposed skill or edge has the proposal's path, one on
 * the base graph a path under `graph`), and every new skill connected to an
 * anchor through edges of the union, in either direction
 * (`DECOMPOSITION_UNANCHORED`). Returns the extension with
 * `status: 'proposed'` and its content id.
 */
export function checkDecomposition(
  request: DecompositionRequest,
  graph: SkillGraph,
  candidate: unknown,
  config?: ResolvedPracticeConfig,
): DecompositionCheck {
  const shape = shapeIssues(proposalShape, candidate);
  if (shape.length > 0) return deepFreeze({ ok: false, issues: shape });
  const { skills, edges } = plainCopy<Pick<GraphExtension, 'skills' | 'edges'>>(candidate);

  const issues: Issue[] = [];
  if (skills.length > request.maxSkills) {
    issues.push({
      code: 'DECOMPOSITION_TOO_MANY_SKILLS',
      path: ['skills'],
      message: `${skills.length} skills proposed; at most ${request.maxSkills} are allowed.`,
    });
  }
  skills.forEach((skill, i) => {
    if (!request.knowledge.includes(skill.knowledge)) {
      issues.push({
        code: 'DECOMPOSITION_KNOWLEDGE_NOT_ALLOWED',
        path: ['skills', i, 'knowledge'],
        message: `Knowledge type "${skill.knowledge}" is not one of ${request.knowledge.join(', ')}.`,
      });
    }
  });
  const extension: GraphExtension = {
    id: extensionId({ skills, edges }),
    goalId: request.goal.id,
    idPrefix: request.idPrefix,
    skills,
    edges,
    status: 'proposed',
  };
  const admitted: GraphExtension = { ...extension, status: 'admitted' };
  issues.push(...extensionIssues(graph, admitted, []));
  if (issues.length > 0) return deepFreeze({ ok: false, issues });

  const composed = composeGraph(graph, [admitted], config);
  if (!composed.ok) {
    return deepFreeze({
      ok: false,
      issues: composed.issues.map((found) => relocate(found, graph)),
    });
  }
  issues.push(...unanchored(request, graph, skills, edges));
  if (issues.length > 0) return deepFreeze({ ok: false, issues });
  return deepFreeze({ ok: true, extension });
}

/** Moves an issue on the composed graph to the proposal's path, or under `graph`. */
function relocate(found: Issue, graph: SkillGraph): Issue {
  const [head, index, ...rest] = found.path;
  const base =
    head === 'skills' ? graph.skills.length : head === 'edges' ? graph.edges.length : null;
  if (base !== null && typeof index === 'number' && index >= base) {
    return { ...found, path: [head as string, index - base, ...rest] };
  }
  return { ...found, path: ['graph', ...found.path] };
}

function unanchored(
  request: DecompositionRequest,
  graph: SkillGraph,
  skills: readonly SkillNode[],
  edges: readonly SkillEdge[],
): Issue[] {
  const near = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const list = near.get(a);
    if (list === undefined) near.set(a, [b]);
    else list.push(b);
  };
  for (const edge of [...graph.edges, ...edges]) {
    link(edge.from, edge.to);
    link(edge.to, edge.from);
  }
  const reached = new Set<string>(request.goal.anchorSkillIds);
  const stack = [...request.goal.anchorSkillIds];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    for (const other of near.get(id) ?? []) {
      if (!reached.has(other)) {
        reached.add(other);
        stack.push(other);
      }
    }
  }
  const issues: Issue[] = [];
  skills.forEach((skill, i) => {
    if (!reached.has(skill.id)) {
      issues.push({
        code: 'DECOMPOSITION_UNANCHORED',
        path: ['skills', i, 'id'],
        message: `Skill "${skill.id}" is not connected to an anchor (${request.goal.anchorSkillIds.join(', ')}).`,
      });
    }
  });
  return issues;
}

/**
 * Admits a proposed extension (R9.5), recording who approved it. Total:
 * malformed input gives `SHAPE_INVALID` issues under `extension` or
 * `approval`. The extension must be `proposed` (`EXTENSION_NOT_PROPOSED`) and
 * its id must be its content id (`EXTENSION_ID_MISMATCH`, so content changed
 * after the check is caught); a `learner` approval needs `allowLearner`
 * (default true; `EXTENSION_LEARNER_NOT_ALLOWED`). The R2.6 and graph rules
 * are re-checked by `composeGraph`.
 */
export function admitExtension(
  extension: GraphExtension,
  approval: ExtensionApproval,
  options?: { readonly allowLearner?: boolean },
): ExtensionAdmission {
  const issues = [
    ...shapeIssues(extensionShape, extension, ['extension']),
    ...shapeIssues(approvalShape, approval, ['approval']),
  ];
  if (issues.length > 0) return deepFreeze({ ok: false, issues });
  if (extension.status !== 'proposed') {
    issues.push({
      code: 'EXTENSION_NOT_PROPOSED',
      path: ['extension', 'status'],
      message: `Extension "${extension.id}" is ${extension.status}; only a proposed one is admitted.`,
    });
  }
  const expected = extensionId(extension);
  if (extension.id !== expected) {
    issues.push({
      code: 'EXTENSION_ID_MISMATCH',
      path: ['extension', 'id'],
      message: `Extension id "${extension.id}" is not its content id "${expected}".`,
    });
  }
  if (approval.by === 'learner' && options?.allowLearner === false) {
    issues.push({
      code: 'EXTENSION_LEARNER_NOT_ALLOWED',
      path: ['approval', 'by'],
      message: 'A learner approval is not allowed for this goal.',
    });
  }
  if (issues.length > 0) return deepFreeze({ ok: false, issues });
  const admitted = plainCopy<GraphExtension>({ ...extension, status: 'admitted', approval });
  return Object.freeze({ ok: true, extension: admitted });
}
