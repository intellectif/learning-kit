/**
 * The diagnosis contract (R14, D29; revised in M12): the facts a diagnoser
 * receives about a blocked skill, the check of the prerequisites it proposes,
 * the verdict the probes reach, the extension a confirmed one becomes, and the
 * advice later evidence supports. The package never calls a diagnoser and
 * writes no prompt; a hypothesis is opened with the `open-hypothesis` host
 * action and decided by probe answers in the learner's log.
 */

import { defaultConfig } from '../config.js';
import { deepFreeze } from '../determinism/freeze.js';
import { composeGraph, hypothesisId, isUnderPrefix, ladderOf } from '../graph/index.js';
import { compareKeys } from '../log/draft.js';
import { taskSnapshot } from '../log/entries.js';
import { plainCopy } from '../schema/copy.js';
import { hypothesesShape, shapeIssues } from '../schema/shape.js';
import type {
  DiscoveryAdmission,
  DiscoveryExtension,
  DiscoverySkillFact,
  EvidenceSource,
  HypothesisCheck,
  HypothesisState,
  Issue,
  PracticeState,
  PrerequisiteAdvice,
  PrerequisiteHypothesis,
  PrerequisiteRequest,
  PrerequisiteRequestInput,
  PrerequisiteRequestOptions,
  ResolvedPracticeConfig,
  SkillEdge,
  SkillGraph,
  SkillNode,
} from '../types.js';
import { extensionId } from './decompose.js';

/** The default `maxCandidates` (R14.3). */
export const DEFAULT_MAX_HYPOTHESES = 3;

const KNOWLEDGE: readonly SkillNode['knowledge'][] = ['declarative', 'procedural', 'mixed'];

/** A hypothesis as the model writes it. */
interface Proposed {
  readonly skillId: string;
  readonly edge: SkillEdge;
  readonly skill?: SkillNode;
  readonly rationale?: string;
}

function hypothesesOf(state: PracticeState): HypothesisState[] {
  return Object.values(state.hypotheses ?? {});
}

/** A graded answer by its verdict, a self-rated one unless `again`; neither, not passed. */
function passedBy(source: EvidenceSource): boolean {
  if (source.kind === 'self') return source.rating !== 'again';
  return 'passed' in source && source.passed;
}

/**
 * The facts a diagnoser receives about a failed answer (R14.3); no prompt.
 * The blocked skill is `input.skillId`, else the item's first skill; its
 * stage is its current one, or the first of its ladder. `nearby` are the
 * skills within two edges of it, of either kind and in either direction,
 * that are not its prerequisites, in graph order. `open` and `refuted` are
 * the ids of this learner's hypotheses for the skill, sorted. Throws a
 * `TypeError` for a blocked skill the graph does not have or without a
 * ladder, evidence for another item, an empty `idPrefix`, a `maxCandidates`
 * that is not an integer in 1..20, an unknown or empty `knowledge` list, or a
 * `seed` that is not a string.
 */
export function prerequisiteRequest(
  input: PrerequisiteRequestInput,
  options: PrerequisiteRequestOptions,
  config?: ResolvedPracticeConfig,
): PrerequisiteRequest {
  const resolved = config ?? defaultConfig();
  const { graph, state, evidence, item } = input;
  const nodes = new Map(graph.skills.map((skill) => [skill.id, skill]));
  const skillId = input.skillId ?? item.skills[0]?.skillId;
  const blocked = skillId === undefined ? undefined : nodes.get(skillId);
  const ladder = blocked === undefined ? null : ladderOf(blocked, resolved);
  if (blocked === undefined || ladder === null) {
    throw new TypeError(`lk-practice: blocked skill "${String(skillId)}" is not in the graph.`);
  }
  if (evidence.itemId !== item.id) {
    throw new TypeError('lk-practice: the evidence answers another item.');
  }
  if (typeof options.idPrefix !== 'string' || options.idPrefix === '') {
    throw new TypeError('lk-practice: idPrefix is a non-empty string.');
  }
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_HYPOTHESES;
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 20) {
    throw new TypeError('lk-practice: maxCandidates is an integer from 1 to 20.');
  }
  const knowledge = options.knowledge ?? KNOWLEDGE;
  if (knowledge.length === 0 || knowledge.some((kind) => !KNOWLEDGE.includes(kind))) {
    throw new TypeError('lk-practice: knowledge lists declarative, procedural or mixed.');
  }
  if (typeof options.seed !== 'string') throw new TypeError('lk-practice: seed is a string.');

  const fact = (skill: SkillNode): DiscoverySkillFact => ({
    id: skill.id,
    knowledge: skill.knowledge,
    ladder: [...(ladderOf(skill, resolved) ?? [])],
    ...(skill.label === undefined ? {} : { label: skill.label }),
    ...(skill.description === undefined ? {} : { description: skill.description }),
  });
  const prerequisites = graph.edges
    .filter(
      (edge): edge is Extract<SkillEdge, { kind: 'prerequisite' }> =>
        edge.kind === 'prerequisite' && edge.to === blocked.id,
    )
    .map((edge) => ({ id: edge.from, strength: edge.strength }));
  const prerequisiteIds = new Set(prerequisites.map((entry) => entry.id));

  const near = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const list = near.get(a);
    if (list === undefined) near.set(a, [b]);
    else list.push(b);
  };
  for (const edge of graph.edges) {
    link(edge.from, edge.to);
    link(edge.to, edge.from);
  }
  const within = new Set<string>([blocked.id]);
  let frontier = [blocked.id];
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
  const mine = hypothesesOf(state).filter((h) => h.forSkillId === blocked.id);
  const ids = (keep: (h: HypothesisState) => boolean) =>
    mine
      .filter(keep)
      .map((h) => h.id)
      .sort(compareKeys);
  const { source } = evidence;
  const graded = source.kind === 'auto' || source.kind === 'ai' || source.kind === 'human';

  return deepFreeze({
    version: 1,
    blocked: { ...fact(blocked), stage: state.skills[blocked.id]?.stage ?? (ladder[0] as string) },
    failure: {
      evidenceId: evidence.id,
      passed: passedBy(source),
      ...(graded ? { score: source.score, maxScore: source.maxScore } : {}),
      skillOutcomes: (evidence.skillOutcomes ?? []).map((outcome) => ({ ...outcome })),
      failedCriteria: [...(input.failedCriteria ?? [])],
      ...(input.excerpt === undefined ? {} : { excerpt: input.excerpt }),
    },
    task: taskSnapshot(item),
    prerequisites: prerequisites.map(({ id, strength }) => ({
      ...fact(nodes.get(id) as SkillNode),
      strength,
    })),
    nearby: graph.skills
      .filter(
        (skill) =>
          within.has(skill.id) && skill.id !== blocked.id && !prerequisiteIds.has(skill.id),
      )
      .map(fact),
    open: ids((h) => h.verdict === 'open' && h.closedAt === null),
    refuted: ids((h) => h.verdict === 'refuted'),
    idPrefix: options.idPrefix,
    knowledge: [...knowledge],
    ladders: {
      declarative: [...resolved.ladders.declarative],
      procedural: [...resolved.ladders.procedural],
    },
    maxCandidates,
    seed: options.seed,
  });
}

/** Lowercase, with runs of space and punctuation as one space, for comparing labels. */
function normalLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Checks a diagnoser's output (R14.4). Total: any `candidate` gives a result
 * and never throws; a value that is not `{ hypotheses: [...] }` is one
 * rejection at index -1. Each hypothesis, in order, is rejected with every
 * issue found: past `maxCandidates` (`HYPOTHESIS_TOO_MANY`); an edge that is
 * not a soft prerequisite from `skillId` into the blocked skill
 * (`HYPOTHESIS_EDGE_INVALID`); the blocked skill itself (`HYPOTHESIS_SELF`);
 * an existing skill the graph does not have (`SKILL_UNKNOWN`); a new skill
 * whose id is not `skillId` (`HYPOTHESIS_SKILL_MISMATCH`), already in the
 * graph (`HYPOTHESIS_SKILL_EXISTS`), outside the prefix
 * (`HYPOTHESIS_ID_OUTSIDE_PREFIX`), of a knowledge type the request does not
 * allow (`HYPOTHESIS_KNOWLEDGE_NOT_ALLOWED`) or labelled like an existing
 * skill (`HYPOTHESIS_DUPLICATE_LABEL`, so the model names that skill
 * instead); an edge the graph already has (`HYPOTHESIS_EDGE_EXISTS`); a union
 * `composeGraph` refuses (its codes, `CYCLE` among them); and a hypothesis
 * already open, refuted, or earlier in the output (`HYPOTHESIS_OPEN`,
 * `HYPOTHESIS_REFUTED`, `HYPOTHESIS_DUPLICATE`). Accepted hypotheses carry
 * their content id.
 */
export function checkPrerequisiteHypothesis(
  request: PrerequisiteRequest,
  graph: SkillGraph,
  candidate: unknown,
  config?: ResolvedPracticeConfig,
): HypothesisCheck {
  const shape = shapeIssues(hypothesesShape, candidate);
  if (shape.length > 0)
    return deepFreeze({ accepted: [], rejected: [{ index: -1, issues: shape }] });
  const { hypotheses } = plainCopy<{ hypotheses: Proposed[] }>(candidate);
  const forSkillId = request.blocked.id;
  const nodes = new Map(graph.skills.map((skill) => [skill.id, skill]));
  const labels = new Map(
    graph.skills
      .filter((skill) => skill.label !== undefined)
      .map((skill) => [normalLabel(skill.label as string), skill.id]),
  );
  const open = new Set(request.open);
  const refuted = new Set(request.refuted);
  const seen = new Set<string>();
  const accepted: PrerequisiteHypothesis[] = [];
  const rejected: { index: number; issues: readonly Issue[] }[] = [];

  hypotheses.forEach((proposed, index) => {
    const path = ['hypotheses', index];
    const issues: Issue[] = [];
    const add = (code: string, at: readonly (string | number)[], message: string) =>
      issues.push({ code, path: [...path, ...at], message });
    const { skillId, edge, skill } = proposed;
    if (index >= request.maxCandidates) {
      add('HYPOTHESIS_TOO_MANY', [], `At most ${request.maxCandidates} hypotheses are allowed.`);
    }
    if (
      edge.kind !== 'prerequisite' ||
      edge.strength !== 'soft' ||
      edge.from !== skillId ||
      edge.to !== forSkillId
    ) {
      add(
        'HYPOTHESIS_EDGE_INVALID',
        ['edge'],
        `The edge is a soft prerequisite from "${skillId}" to "${forSkillId}".`,
      );
    }
    if (skillId === forSkillId)
      add('HYPOTHESIS_SELF', ['skillId'], 'A skill is not its own prerequisite.');
    if (skill === undefined) {
      if (!nodes.has(skillId))
        add('SKILL_UNKNOWN', ['skillId'], `Skill "${skillId}" is not in the graph.`);
    } else {
      if (skill.id !== skillId)
        add('HYPOTHESIS_SKILL_MISMATCH', ['skill', 'id'], 'skill.id equals skillId.');
      if (nodes.has(skill.id)) {
        add(
          'HYPOTHESIS_SKILL_EXISTS',
          ['skill'],
          `Skill "${skill.id}" is in the graph; name it without a new skill.`,
        );
      } else if (!isUnderPrefix(skill.id, request.idPrefix)) {
        add(
          'HYPOTHESIS_ID_OUTSIDE_PREFIX',
          ['skill', 'id'],
          `Skill "${skill.id}" is not under the prefix "${request.idPrefix}".`,
        );
      }
      if (!request.knowledge.includes(skill.knowledge)) {
        add(
          'HYPOTHESIS_KNOWLEDGE_NOT_ALLOWED',
          ['skill', 'knowledge'],
          `Knowledge type "${skill.knowledge}" is not one of ${request.knowledge.join(', ')}.`,
        );
      }
      const same = skill.label === undefined ? undefined : labels.get(normalLabel(skill.label));
      if (same !== undefined) {
        add(
          'HYPOTHESIS_DUPLICATE_LABEL',
          ['skill', 'label'],
          `Skill "${same}" has this label; name it instead of a new skill.`,
        );
      }
    }
    if (
      graph.edges.some(
        (found) =>
          found.kind === 'prerequisite' && found.from === skillId && found.to === forSkillId,
      )
    ) {
      add(
        'HYPOTHESIS_EDGE_EXISTS',
        ['edge'],
        `"${skillId}" is already a prerequisite of "${forSkillId}".`,
      );
    }
    if (issues.length === 0) {
      const composed = composeGraph(graph, [extensionOf(forSkillId, skillId, skill, 0)], config);
      if (!composed.ok) {
        for (const found of composed.issues)
          add(found.code, ['graph', ...found.path], found.message);
      }
    }
    const content = { forSkillId, skillId, ...(skill === undefined ? {} : { skill }) };
    const id = hypothesisId(content);
    if (open.has(id)) add('HYPOTHESIS_OPEN', [], `Hypothesis "${id}" is already open.`);
    if (refuted.has(id))
      add('HYPOTHESIS_REFUTED', [], `Hypothesis "${id}" was refuted for this learner.`);
    if (seen.has(id)) add('HYPOTHESIS_DUPLICATE', [], `Hypothesis "${id}" is proposed twice.`);
    seen.add(id);
    if (issues.length > 0) {
      rejected.push({ index, issues });
      return;
    }
    accepted.push({
      id,
      ...content,
      ...(proposed.rationale === undefined ? {} : { rationale: proposed.rationale }),
    });
  });
  return deepFreeze({ accepted, rejected });
}

/** The extension of a hypothesis: the candidate if new, and its soft edge into the blocked skill. */
function extensionOf(
  forSkillId: string,
  skillId: string,
  skill: SkillNode | undefined,
  confirmedAt: number,
  hypothesis = '',
): DiscoveryExtension {
  const skills = skill === undefined ? [] : [skill];
  const edges: SkillEdge[] = [
    { kind: 'prerequisite', from: skillId, to: forSkillId, strength: 'soft' },
  ];
  return {
    kind: 'prerequisite-discovery',
    id: extensionId({ skills, edges }),
    hypothesisId: hypothesis,
    forSkillId,
    skills,
    edges,
    status: 'admitted',
    confirmedAt,
  };
}

function lookup(state: PracticeState, hypothesisId: string): HypothesisState | undefined {
  const all = state.hypotheses;
  return all !== undefined && Object.hasOwn(all, hypothesisId) ? all[hypothesisId] : undefined;
}

/**
 * A hypothesis's verdict (R14.7), read from the state, where each probe
 * answer settled it: `confirmed`, `refuted`, or `inconclusive` while it is
 * open; `null` for a hypothesis the state does not have.
 */
export function prerequisiteVerdict(
  state: PracticeState,
  hypothesisId: string,
): 'confirmed' | 'refuted' | 'inconclusive' | null {
  const hypothesis = lookup(state, hypothesisId);
  if (hypothesis === undefined) return null;
  return hypothesis.verdict === 'open' ? 'inconclusive' : hypothesis.verdict;
}

/**
 * The admitted `prerequisite-discovery` extension of a confirmed hypothesis
 * (R14.8): the candidate if it is new, and one soft prerequisite edge into
 * the blocked skill. Total: `HYPOTHESIS_UNKNOWN`, `HYPOTHESIS_CLOSED`, or
 * `HYPOTHESIS_NOT_CONFIRMED` for one not confirmed. Compose it with
 * `composeGraph` and replay the learner's log against the new graph.
 */
export function discoveryExtension(state: PracticeState, hypothesisId: string): DiscoveryAdmission {
  const hypothesis = lookup(state, hypothesisId);
  const refuse = (code: string, message: string) =>
    deepFreeze({ ok: false as const, issues: [{ code, path: ['hypothesisId'], message }] });
  if (hypothesis === undefined)
    return refuse('HYPOTHESIS_UNKNOWN', `No hypothesis "${hypothesisId}".`);
  if (hypothesis.closedAt !== null)
    return refuse('HYPOTHESIS_CLOSED', `Hypothesis "${hypothesisId}" is closed.`);
  if (hypothesis.verdict !== 'confirmed') {
    return refuse(
      'HYPOTHESIS_NOT_CONFIRMED',
      `Hypothesis "${hypothesisId}" is ${hypothesis.verdict}.`,
    );
  }
  return deepFreeze({
    ok: true as const,
    extension: extensionOf(
      hypothesis.forSkillId,
      hypothesis.skillId,
      hypothesis.skill,
      hypothesis.decidedAt as number,
      hypothesis.id,
    ),
  });
}

/**
 * What to do with each confirmed hypothesis not closed (R14.10), by the time
 * of its verdict, then id: `admit` while its edge is not in `graph`;
 * `practise` while its prerequisite is not ready; `harden` once the blocked
 * skill passed after that, unless the edge is already hard (`keep`);
 * `revoke` when the blocked skill failed `discovery.revokeAfter` times after
 * that and never passed; `keep` otherwise. Advice only: the host decides.
 */
export function prerequisiteReport(
  state: PracticeState,
  graph: SkillGraph,
  config?: ResolvedPracticeConfig,
): readonly PrerequisiteAdvice[] {
  const { revokeAfter } = (config ?? defaultConfig()).discovery;
  const report = hypothesesOf(state)
    .filter((h) => h.verdict === 'confirmed' && h.closedAt === null)
    .sort((a, b) => (a.decidedAt as number) - (b.decidedAt as number) || compareKeys(a.id, b.id))
    .map((h): PrerequisiteAdvice => {
      const edge = graph.edges.find(
        (found): found is Extract<SkillEdge, { kind: 'prerequisite' }> =>
          found.kind === 'prerequisite' && found.from === h.skillId && found.to === h.forSkillId,
      );
      const advice: PrerequisiteAdvice['advice'] =
        edge === undefined
          ? 'admit'
          : h.readyAt === null
            ? 'practise'
            : h.blockedPassedAt !== null
              ? edge.strength === 'hard'
                ? 'keep'
                : 'harden'
              : h.blockedFailures >= revokeAfter
                ? 'revoke'
                : 'keep';
      return {
        hypothesisId: h.id,
        skillId: h.skillId,
        forSkillId: h.forSkillId,
        advice,
        confirmedAt: h.decidedAt as number,
        readyAt: h.readyAt,
        blockedPassedAt: h.blockedPassedAt,
        blockedFailures: h.blockedFailures,
      };
    });
  return deepFreeze(report);
}
