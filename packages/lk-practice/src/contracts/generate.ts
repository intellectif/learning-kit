/**
 * The generator contract (design 8.8, R9.1 to R9.3) (M7): the facts a
 * generator receives, the check of what it returns, and the proof gate. The
 * package never calls a generator and writes no prompt.
 */

import { defaultConfig, resolveConfig } from '../config.js';
import { canonicalize } from '../determinism/canonical.js';
import { fnv1a64 } from '../determinism/fnv.js';
import { deepFreeze } from '../determinism/freeze.js';
import { PracticeConfigError } from '../errors.js';
import { equivalentStage } from '../graph/index.js';
import { createEngine, indexGraph } from '../log/context.js';
import { compareKeys } from '../log/draft.js';
import { mismatchIssues } from '../log/validate.js';
import { abilityAt } from '../mastery/index.js';
import { usedWithin } from '../planner/match.js';
import { candidateShape, MAX_CANDIDATES, proofShape, shapeIssues } from '../schema/shape.js';
import type {
  AdmitResult,
  CandidateCheck,
  CandidateItem,
  CandidateProof,
  GenerationContext,
  GenerationOptions,
  GenerationRequest,
  Issue,
  PracticeConfig,
  PracticeItem,
  PracticeTarget,
  ResolvedPracticeConfig,
  SkillNode,
  StageId,
} from '../types.js';

/** The tolerance on the sum of a candidate's skill weights, as `validateItems` uses. */
const WEIGHT_TOLERANCE = 1e-9;

type RequestSkill = GenerationRequest['skills'][number];

/** A value `candidateShape` accepted: `difficulty` is required. */
type ShapedCandidate = CandidateItem & { readonly difficulty: number };

/**
 * The facts a generator receives for one target (R9.1); no prompt. `context`
 * is the graph and state the plan was made from and the instant the request
 * is built at. `config` is the configuration the state was built with (the
 * one passed to `createPractice`, default `{}`): the expected successes and
 * thetas come from its mastery model. Throws `PracticeConfigError` for an
 * invalid configuration or a state built with another configuration or
 * graph version, `TypeError` for a target skill the graph does not have or a
 * `count` that is not an integer in 1..20, and `RangeError` for a target skill
 * without an equivalent of the target's stage.
 */
export function generationRequest(
  target: PracticeTarget,
  context: GenerationContext,
  options: GenerationOptions,
  config: PracticeConfig = {},
): GenerationRequest {
  const resolved = resolveConfig(config);
  if (!resolved.ok) throw new PracticeConfigError(resolved.issues);
  const engine = createEngine(config, resolved.value);
  const { graph, state, now } = context;
  const mismatch = mismatchIssues(state, graph.version, engine);
  if (mismatch.length > 0) throw new PracticeConfigError(mismatch);
  const { count, seed } = options;
  if (!Number.isInteger(count) || count < 1 || count > MAX_CANDIDATES) {
    throw new TypeError(`lk-practice: count is an integer from 1 to ${MAX_CANDIDATES}.`);
  }
  if (typeof seed !== 'string') throw new TypeError('lk-practice: seed is a string.');
  const index = indexGraph(graph, engine);
  const cfg = engine.config;

  const thetas: { skillId: string; theta: number }[] = [];
  const skills = target.skillIds.map((skillId, position): RequestSkill => {
    const node = index.nodes.get(skillId);
    const ladder = index.ladder(skillId);
    if (node === undefined || ladder === null) {
      throw new TypeError(`lk-practice: target skill "${skillId}" is not in the graph.`);
    }
    const stage =
      position === 0 ? target.stage : equivalentStage(target.stage, ladder, index.demand);
    if (stage === null || !ladder.includes(stage)) {
      throw new RangeError(
        `lk-practice: skill "${skillId}" has no equivalent of stage "${target.stage}".`,
      );
    }
    const stored = Object.hasOwn(state.skills, skillId) ? state.skills[skillId] : undefined;
    const ability = abilityAt(stored?.ability ?? {}, node, stage, index.mastery(skillId));
    thetas.push({ skillId, theta: engine.mastery.estimate(ability).value });
    const forms = formsOf(node, stage);
    return {
      id: skillId,
      role: position === 0 ? 'primary' : 'component',
      knowledge: node.knowledge,
      ladder: [...ladder],
      stage,
      ...(forms === undefined ? {} : { forms: [...forms] }),
      expectedSuccess: engine.mastery.expectedSuccess(ability, target.targetDifficulty),
      referenceDifficulty: node.referenceDifficulty ?? 0,
      ...(node.criteriaHint === undefined ? {} : { criteriaHint: node.criteriaHint }),
      ...(node.label === undefined ? {} : { label: node.label }),
      ...(node.description === undefined ? {} : { description: node.description }),
      ...(node.tags === undefined ? {} : { tags: [...node.tags] }),
    };
  });

  const usedIds = Object.keys(state.items).filter((id) =>
    usedWithin((state.items[id] as { lastUsedAt: number }).lastUsedAt, now, cfg.itemCooldownMs),
  );
  const constraints = target.constraints;
  const recentLapses = target.skillIds
    .map((skillId) => ({ skillId, at: state.skills[skillId]?.lastLapseAt ?? null }))
    .filter(
      (lapse): lapse is { skillId: string; at: number } =>
        lapse.at !== null && lapse.at >= now - cfg.planner.remediationWindowMs && lapse.at <= now,
    )
    .sort((a, b) => b.at - a.at || compareKeys(a.skillId, b.skillId));
  const weakest = thetas.sort((a, b) => a.theta - b.theta || compareKeys(a.skillId, b.skillId));

  return deepFreeze({
    version: 1,
    target: {
      id: target.id,
      kind: target.kind,
      stage: target.stage,
      targetDifficulty: target.targetDifficulty,
      difficultyTolerance: target.difficultyTolerance,
      expectedSuccess: target.reason.expectedSuccess,
      expectedSeconds: target.expectedSeconds,
      context: constraints.context,
    },
    skills,
    ...(constraints.forms === undefined ? {} : { forms: [...constraints.forms] }),
    needsSkillOutcomes: constraints.needsSkillOutcomes,
    avoid: {
      itemIds: sortedUnique([...constraints.avoidItemIds, ...usedIds]),
      contentHashes: sortedUnique(constraints.avoidContentHashes),
    },
    learner: { recentLapses, weakest },
    count,
    seed,
  });
}

function formsOf(node: SkillNode, stage: StageId): readonly string[] | undefined {
  return node.forms !== undefined && Object.hasOwn(node.forms, stage)
    ? node.forms[stage]
    : undefined;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareKeys);
}

/**
 * Checks what a generator returned against its request (R9.2). Total: any
 * value gives a result and never throws. Each candidate is accepted or
 * rejected with its index and issues; a value that is not an array is one
 * rejection with index -1. Accepted candidates are frozen items with
 * `origin: 'generated'`, `status: 'unproven'` and a `contentHash` (the
 * generator's, else `fnv1a64` of the canonical content); `content` passes
 * through as the generator returned it. Ids and content hashes must be unique
 * among the accepted candidates, so a later duplicate is the rejected one.
 */
export function checkCandidates(request: GenerationRequest, candidates: unknown): CandidateCheck {
  if (!Array.isArray(candidates)) {
    return deepFreeze({
      accepted: [],
      rejected: [
        {
          index: -1,
          issues: [{ code: 'SHAPE_INVALID', path: [], message: 'Candidates are an array.' }],
        },
      ],
    });
  }
  const accepted: CandidateItem[] = [];
  const rejected: { index: number; issues: readonly Issue[] }[] = [];
  const ids = new Set(request.avoid.itemIds);
  const hashes = new Set(request.avoid.contentHashes);
  const avoidedIds = new Set(request.avoid.itemIds);
  const avoidedHashes = new Set(request.avoid.contentHashes);
  // Every index, so a hole is a rejected candidate rather than skipped.
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate: unknown = candidates[index];
    const checked = checkCandidate(request, candidate, { ids, hashes, avoidedIds, avoidedHashes });
    if (checked.ok) {
      accepted.push(checked.item);
      ids.add(checked.item.id);
      hashes.add(checked.item.contentHash);
    } else {
      rejected.push({ index, issues: Object.freeze(checked.issues) });
    }
  }
  return Object.freeze({ accepted: Object.freeze(accepted), rejected: deepFreeze(rejected) });
}

interface Seen {
  readonly ids: ReadonlySet<string>;
  readonly hashes: ReadonlySet<string>;
  readonly avoidedIds: ReadonlySet<string>;
  readonly avoidedHashes: ReadonlySet<string>;
}

type CandidateResult =
  | { readonly ok: true; readonly item: CandidateItem }
  | { readonly ok: false; readonly issues: Issue[] };

function checkCandidate(request: GenerationRequest, value: unknown, seen: Seen): CandidateResult {
  const shape = shapeIssues(candidateShape, value);
  if (shape.length > 0) return { ok: false, issues: shape };
  const candidate = value as ShapedCandidate;
  const issues: Issue[] = [];
  const add = (code: string, path: Issue['path'], message: string) => {
    issues.push({ code, path, message });
  };
  const known = new Map(request.skills.map((skill) => [skill.id, skill]));
  const primaryId = (request.skills[0] as RequestSkill).id;

  if (candidate.stage !== request.target.stage) {
    add(
      'CANDIDATE_STAGE_MISMATCH',
      ['stage'],
      `Stage "${candidate.stage}" is not the target's stage "${request.target.stage}".`,
    );
  }

  const listed = new Set<string>();
  let sum = 0;
  let primary = 0;
  candidate.skills.forEach((entry, j) => {
    const path = ['skills', j];
    const skill = known.get(entry.skillId);
    if (skill === undefined) {
      add(
        'CANDIDATE_SKILL_NOT_ALLOWED',
        [...path, 'skillId'],
        `Skill "${entry.skillId}" is not a skill of the request.`,
      );
    } else if (!skill.ladder.includes(skill.stage)) {
      add(
        'STAGE_NO_EQUIVALENT',
        path,
        `Skill "${entry.skillId}" has no stage equivalent to "${request.target.stage}".`,
      );
    }
    if (listed.has(entry.skillId)) {
      add('ID_DUPLICATE', [...path, 'skillId'], `Skill "${entry.skillId}" is listed twice.`);
    }
    listed.add(entry.skillId);
    if (!(entry.weight > 0 && entry.weight <= 1)) {
      add('ITEM_WEIGHT_INVALID', [...path, 'weight'], 'A skill weight is in (0, 1].');
    }
    sum += entry.weight;
    if (entry.weight > (candidate.skills[primary] as { weight: number }).weight) primary = j;
  });
  if (Math.abs(sum - 1) > WEIGHT_TOLERANCE) {
    add('ITEM_WEIGHTS_SUM', ['skills'], `The skill weights sum to ${sum}, not 1.`);
  }
  if ((candidate.skills[primary] as { skillId: string }).skillId !== primaryId) {
    add(
      'CANDIDATE_PRIMARY_MISMATCH',
      ['skills'],
      `The target's primary skill "${primaryId}" is not the candidate's primary (largest weight, first on a tie).`,
    );
  }

  const tolerance = request.target.difficultyTolerance;
  if (!(Math.abs(candidate.difficulty - request.target.targetDifficulty) <= tolerance)) {
    add(
      'CANDIDATE_DIFFICULTY_OUT_OF_RANGE',
      ['difficulty'],
      `Difficulty ${candidate.difficulty} is more than ${tolerance} from the target ${request.target.targetDifficulty}.`,
    );
  }

  const forms = request.forms ?? [];
  if (candidate.form !== undefined && forms.length > 0 && !forms.includes(candidate.form)) {
    add(
      'CANDIDATE_FORM_NOT_ALLOWED',
      ['form'],
      `Form "${candidate.form}" is not one of ${forms.join(', ')}.`,
    );
  }

  const bound = new Set<string>();
  candidate.criteria?.forEach((criterion, j) => {
    bound.add(criterion.skillId);
    if (!known.has(criterion.skillId)) {
      add(
        'SKILL_NOT_IN_TASK',
        ['criteria', j, 'skillId'],
        `Criterion "${criterion.name}" names "${criterion.skillId}", which is not a skill of the request.`,
      );
    }
  });
  if (request.needsSkillOutcomes) {
    for (const skill of request.skills) {
      if (!bound.has(skill.id)) {
        add(
          'CANDIDATE_CRITERIA_MISSING',
          ['criteria'],
          `Per-skill outcomes are needed and no criterion binds "${skill.id}".`,
        );
      }
    }
  }

  if (
    candidate.fluentSeconds !== undefined &&
    candidate.slowSeconds !== undefined &&
    !(candidate.fluentSeconds < candidate.slowSeconds)
  ) {
    add('ITEM_TIMING_ORDER', ['fluentSeconds'], 'fluentSeconds must be below slowSeconds.');
  }

  if (seen.avoidedIds.has(candidate.id)) {
    add('CANDIDATE_AVOIDED', ['id'], `Item id "${candidate.id}" is on the avoid list.`);
  } else if (seen.ids.has(candidate.id)) {
    add('ID_DUPLICATE', ['id'], `Item id "${candidate.id}" is used twice in the batch.`);
  }
  const canonical = canonicalize(candidate.content);
  if (!canonical.ok) {
    add('SHAPE_INVALID', ['content', ...canonical.path], canonical.message);
    return { ok: false, issues };
  }
  const contentHash = candidate.contentHash ?? fnv1a64(canonical.json);
  if (seen.avoidedHashes.has(contentHash)) {
    add(
      'CANDIDATE_AVOIDED',
      ['contentHash'],
      `Content hash "${contentHash}" is on the avoid list.`,
    );
  } else if (seen.hashes.has(contentHash)) {
    add(
      'CANDIDATE_CONTENT_DUPLICATE',
      ['contentHash'],
      `Content hash "${contentHash}" is used twice in the batch.`,
    );
  }
  if (issues.length > 0) return { ok: false, issues };

  return { ok: true, item: Object.freeze(candidateItem(candidate, contentHash)) };
}

function candidateItem(candidate: ShapedCandidate, contentHash: string): CandidateItem {
  return {
    id: candidate.id,
    skills: deepFreeze(candidate.skills.map(({ skillId, weight }) => ({ skillId, weight }))),
    stage: candidate.stage,
    difficulty: candidate.difficulty,
    ...(candidate.expectedSeconds === undefined
      ? {}
      : { expectedSeconds: candidate.expectedSeconds }),
    ...(candidate.fluentSeconds === undefined ? {} : { fluentSeconds: candidate.fluentSeconds }),
    ...(candidate.slowSeconds === undefined ? {} : { slowSeconds: candidate.slowSeconds }),
    ...(candidate.criteria === undefined
      ? {}
      : {
          criteria: deepFreeze(candidate.criteria.map(({ name, skillId }) => ({ name, skillId }))),
        }),
    ...(candidate.form === undefined ? {} : { form: candidate.form }),
    contentHash,
    origin: 'generated',
    status: 'unproven',
    content: candidate.content,
  };
}

/**
 * The proof gate (R9.3): promotes a checked candidate to a proven item.
 * The proof kind must be in `acceptProofs` (`PROOF_NOT_ACCEPTED`); an
 * `executable` proof needs `referencePassed: true` and at least one failed
 * wrong solution, a `model-checked` one `agreed: true`
 * (`PROOF_INCOMPLETE`). The item is the candidate without `content`, with
 * `status: 'proven'` and the proof. `config` defaults to the resolved
 * default configuration. Total: a malformed candidate or proof gives
 * `SHAPE_INVALID` issues, under `candidate` or `proof`.
 */
export function admitCandidate(
  candidate: CandidateItem,
  proof: CandidateProof,
  config?: ResolvedPracticeConfig,
): AdmitResult {
  const issues = [
    ...shapeIssues(candidateShape, candidate, ['candidate']),
    ...shapeIssues(proofShape, proof, ['proof']),
  ];
  if (issues.length > 0) return deepFreeze({ ok: false, issues });
  const accept = (config ?? defaultConfig()).acceptProofs;
  if (!accept.includes(proof.kind)) {
    issues.push({
      code: 'PROOF_NOT_ACCEPTED',
      path: ['proof', 'kind'],
      message: `Proof kind "${proof.kind}" is not in acceptProofs (${accept.join(', ')}).`,
    });
  } else if (proof.kind === 'executable') {
    if (proof.referencePassed !== true) {
      incomplete(issues, 'referencePassed', 'The reference solution must pass the checks.');
    }
    if (proof.wrongSolutionsFailed < 1) {
      incomplete(issues, 'wrongSolutionsFailed', 'At least one wrong solution must fail.');
    }
  } else if (proof.kind === 'model-checked' && proof.agreed !== true) {
    incomplete(issues, 'agreed', 'The independent model check must agree.');
  }
  if (issues.length > 0) return deepFreeze({ ok: false, issues });

  const { content: _content, ...rest } = candidate;
  const item: PracticeItem = {
    ...rest,
    skills: rest.skills.map(({ skillId, weight }) => ({ skillId, weight })),
    ...(rest.criteria === undefined
      ? {}
      : { criteria: rest.criteria.map(({ name, skillId }) => ({ name, skillId })) }),
    origin: 'generated',
    status: 'proven',
    proof: { ...proof },
  };
  return deepFreeze({ ok: true, item });
}

function incomplete(issues: Issue[], key: string, message: string): void {
  issues.push({ code: 'PROOF_INCOMPLETE', path: ['proof', key], message });
}
