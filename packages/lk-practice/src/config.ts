/**
 * Configuration (design §5.8, D26): `resolveConfig` fills in every default and
 * reduces each model and policy instance to a `PolicyRef`, so the resolved
 * configuration is plain, frozen data; `configHash` hashes exactly that (§9).
 * Internal: `createPractice` exposes both (M5).
 */

import { canonicalize, formatPath } from './determinism/canonical.js';
import { hashCanonical } from './determinism/fnv.js';
import { DEFAULT_STAGE_DEMAND, resolveStageDemand } from './graph/stages.js';
import { FSRS_DEFAULT_PARAMS } from './memory/fsrs.js';
import type {
  CandidateProof,
  CheckResult,
  EvidenceOptions,
  Issue,
  JsonValue,
  PolicyRef,
  PracticeConfig,
  Rating,
  ResolvedPracticeConfig,
  StageId,
  StagePolicyOptions,
} from './types.js';

/** The ts-fsrs version the default memory model is pinned to (R4.5); enters the hash. */
export const TS_FSRS_VERSION = '6.0.0';
/** The planner algorithm version; enters the hash. */
export const PLANNER_VERSION = 'planner@1';

const PROOF_KINDS: readonly CandidateProof['kind'][] = ['executable', 'model-checked', 'reviewed'];
const RATINGS: readonly Rating[] = ['again', 'hard', 'good', 'easy'];

const DEFAULT_STAGE_POLICY_OPTIONS: Required<StagePolicyOptions> = {
  promoteAfter: 2,
  promoteGapMs: 86_400_000,
  demoteAfter: 2,
};

const DEFAULT_EVIDENCE_OPTIONS: Required<EvidenceOptions> = {
  checksPassFraction: 1,
  aiMediumWeight: 0.5,
  selfWeight: 0.5,
  selfCorrect: { again: 0, hard: 0.6, good: 1, easy: 1 },
};

const DEFAULT_STAGE_SECONDS: Readonly<Record<StageId, number>> = {
  recognise: 20,
  recall: 30,
  produce: 60,
  apply: 120,
  example: 90,
  complete: 180,
  write: 420,
  transfer: 600,
};

type Path = readonly (string | number)[];

/** Collects `CONFIG_INVALID` issues while reading one configuration. */
class Reader {
  readonly issues: Issue[] = [];

  invalid(path: Path, message: string): void {
    this.issues.push({ code: 'CONFIG_INVALID', path: [...path], message });
  }

  /** The object at `path`, or undefined; flags a non-object and keys outside `allowed`. */
  object(
    value: unknown,
    path: Path,
    allowed: readonly string[],
  ): Record<string, unknown> | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.invalid(path, 'Expected an object.');
      return undefined;
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record).sort()) {
      if (!allowed.includes(key)) this.invalid([...path, key], `Unknown option "${key}".`);
    }
    return record;
  }

  number(
    value: unknown,
    path: Path,
    fallback: number,
    range: { min: number; max: number; integer?: boolean; minExclusive?: boolean },
  ): number {
    if (value === undefined) return fallback;
    const ok =
      typeof value === 'number' &&
      Number.isFinite(value) &&
      (range.integer !== true || Number.isInteger(value)) &&
      (range.minExclusive === true ? value > range.min : value >= range.min) &&
      value <= range.max;
    if (!ok) {
      const open = range.minExclusive === true ? '(' : '[';
      const kind = range.integer === true ? 'an integer' : 'a number';
      this.invalid(path, `Expected ${kind} in ${open}${range.min}, ${range.max}].`);
      return fallback;
    }
    return value as number;
  }

  boolean(value: unknown, path: Path, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') {
      this.invalid(path, 'Expected a boolean.');
      return fallback;
    }
    return value;
  }

  /** A record of stage id to number, every value in range. */
  stageNumbers(
    value: unknown,
    path: Path,
    range: { min: number; max: number; minExclusive?: boolean },
  ): Record<StageId, number> {
    const out: Record<StageId, number> = {};
    if (value === undefined) return out;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.invalid(path, 'Expected an object of stage ids to numbers.');
      return out;
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record).sort()) {
      if (key === '') {
        this.invalid([...path, key], 'A stage id is a non-empty string.');
        continue;
      }
      const before = this.issues.length;
      const read = this.number(record[key], [...path, key], 0, range);
      // An invalid entry is left out, so it cannot raise follow-on issues.
      if (this.issues.length === before) out[key] = read;
    }
    return out;
  }

  ladder(value: unknown, path: Path, fallback: readonly StageId[]): readonly StageId[] {
    if (value === undefined) return fallback;
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every((stage) => typeof stage === 'string' && stage !== '')
    ) {
      this.invalid(path, 'A ladder is a non-empty array of non-empty stage ids.');
      return fallback;
    }
    if (new Set(value).size !== value.length) {
      this.invalid(path, 'A ladder lists each stage once.');
      return fallback;
    }
    return [...(value as StageId[])];
  }

  /** A custom model or policy instance reduced to its `PolicyRef` (D26). */
  policyRef(value: unknown, path: Path, methods: readonly string[]): PolicyRef | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.invalid(path, 'Expected a model or policy object.');
      return undefined;
    }
    const instance = value as Record<string, unknown>;
    const before = this.issues.length;
    if (typeof instance.id !== 'string' || instance.id === '') {
      this.invalid([...path, 'id'], 'Expected a non-empty string id.');
    }
    if (
      typeof instance.version !== 'number' ||
      !Number.isInteger(instance.version) ||
      instance.version < 1
    ) {
      this.invalid([...path, 'version'], 'Expected an integer version of at least 1.');
    }
    for (const method of methods) {
      if (typeof instance[method] !== 'function') {
        this.invalid([...path, method], `Expected a function "${method}".`);
      }
    }
    const params = canonicalize(instance.params);
    if (!params.ok) {
      this.invalid(
        [...path, 'params', ...params.path],
        `params must be canonical JSON: ${params.message} at ${formatPath(params.path)}.`,
      );
    }
    if (this.issues.length !== before || !params.ok) return undefined;
    return {
      id: instance.id as string,
      version: instance.version as number,
      params: JSON.parse(params.json) as JsonValue,
    };
  }
}

const MEMORY_METHODS = ['init', 'retrievability', 'review', 'serialize', 'deserialize'];
const MASTERY_METHODS = [
  'init',
  'update',
  'prior',
  'derive',
  'expectedSuccess',
  'estimate',
  'serialize',
  'deserialize',
];

const TOP_LEVEL_KEYS = [
  'memoryModel',
  'masteryModel',
  'stagePolicy',
  'stagePolicyOptions',
  'evidenceMapper',
  'evidenceOptions',
  'stageDemand',
  'ability',
  'ladders',
  'desiredRetention',
  'stageRetention',
  'mastery',
  'planner',
  'contexts',
  'leechThreshold',
  'memoryWeightFloor',
  'itemCooldownMs',
  'itemUsageRetentionMs',
  'recentIdWindow',
  'acceptProofs',
];

const UNIT = { min: 0, max: 1 };
const RETENTION = { min: 0.7, max: 0.97 };
const NON_NEGATIVE_INT = { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true };
const POSITIVE_INT = { min: 1, max: Number.MAX_SAFE_INTEGER, integer: true };
const NON_NEGATIVE = { min: 0, max: Number.MAX_VALUE };
const FINITE = { min: -Number.MAX_VALUE, max: Number.MAX_VALUE };

/**
 * Resolves a `PracticeConfig` into plain, frozen data. Fails with
 * `CONFIG_CONFLICT` when a custom policy or mapper comes with the built-in
 * one's options, `CONFIG_INVALID` for an option out of range or `params` that
 * are not canonical JSON, and `STAGE_DEMAND_ORDER` or `STAGE_DEMAND_AMBIGUOUS`
 * for the configured ladders (R3.8).
 */
export function resolveConfig(config?: PracticeConfig): CheckResult<ResolvedPracticeConfig> {
  const r = new Reader();
  const input = r.object(config, [], TOP_LEVEL_KEYS) ?? {};

  const memoryModel =
    input.memoryModel === undefined
      ? defaultMemoryRef()
      : r.policyRef(input.memoryModel, ['memoryModel'], MEMORY_METHODS);
  const masteryModel =
    input.masteryModel === undefined
      ? defaultMasteryRef()
      : r.policyRef(input.masteryModel, ['masteryModel'], MASTERY_METHODS);

  const conflicts: Issue[] = [];
  let stagePolicy: PolicyRef | undefined;
  let stagePolicyOptions: Required<StagePolicyOptions> | null = null;
  if (input.stagePolicy !== undefined) {
    stagePolicy = r.policyRef(input.stagePolicy, ['stagePolicy'], ['decide']);
    if (input.stagePolicyOptions !== undefined) {
      conflicts.push({
        code: 'CONFIG_CONFLICT',
        path: ['stagePolicyOptions'],
        message:
          'stagePolicyOptions configure the built-in stage policy; a custom stagePolicy takes its own params.',
      });
    }
  } else {
    stagePolicyOptions = readStagePolicyOptions(r, input.stagePolicyOptions);
    stagePolicy = { id: 'stage-default', version: 1, params: { ...stagePolicyOptions } };
  }

  let evidenceMapper: PolicyRef | undefined;
  let evidenceOptions: Required<EvidenceOptions> | null = null;
  if (input.evidenceMapper !== undefined) {
    evidenceMapper = r.policyRef(input.evidenceMapper, ['evidenceMapper'], ['map']);
    if (input.evidenceOptions !== undefined) {
      conflicts.push({
        code: 'CONFIG_CONFLICT',
        path: ['evidenceOptions'],
        message:
          'evidenceOptions configure the built-in evidence mapper; a custom evidenceMapper takes its own params.',
      });
    }
  } else {
    evidenceOptions = readEvidenceOptions(r, input.evidenceOptions);
    evidenceMapper = {
      id: 'evidence-default',
      version: 1,
      params: { ...evidenceOptions, selfCorrect: { ...evidenceOptions.selfCorrect } },
    };
  }

  const stageDemand = {
    ...DEFAULT_STAGE_DEMAND,
    ...r.stageNumbers(input.stageDemand, ['stageDemand'], FINITE),
  };
  const ability = r.object(input.ability, ['ability'], ['stageOffset']) ?? {};
  const ladders = r.object(input.ladders, ['ladders'], ['declarative', 'procedural']) ?? {};
  const mastery =
    r.object(
      input.mastery,
      ['mastery'],
      ['topSuccesses', 'topGapMs', 'minExpectedSuccess', 'retentionMargin'],
    ) ?? {};
  const planner =
    r.object(
      input.planner,
      ['planner'],
      [
        'targetSuccess',
        'difficultyTolerance',
        'coalesce',
        'remediationWindowMs',
        'pretestNewSkills',
        'pretestStageIndex',
        'stageSeconds',
        'limits',
      ],
    ) ?? {};
  const limits =
    r.object(
      planner.limits,
      ['planner', 'limits'],
      ['maxNewSkills', 'maxReviewBacklog', 'maxRemediation', 'maxSkillsPerTarget'],
    ) ?? {};
  const contexts =
    r.object(
      input.contexts,
      ['contexts'],
      ['examsMoveSchedule', 'diagnosticWeight', 'pretestWeight'],
    ) ?? {};

  const resolvedLadders = {
    declarative: r.ladder(
      ladders.declarative,
      ['ladders', 'declarative'],
      ['recognise', 'recall', 'produce', 'apply'],
    ),
    procedural: r.ladder(
      ladders.procedural,
      ['ladders', 'procedural'],
      ['example', 'complete', 'write', 'transfer'],
    ),
  };

  const resolved: ResolvedPracticeConfig = {
    memoryModel: memoryModel ?? defaultMemoryRef(),
    masteryModel: masteryModel ?? defaultMasteryRef(),
    stagePolicy: stagePolicy ?? { id: 'stage-default', version: 1, params: null },
    stagePolicyOptions,
    evidenceMapper: evidenceMapper ?? { id: 'evidence-default', version: 1, params: null },
    evidenceOptions,
    stageDemand: sortKeys(stageDemand),
    ability: {
      stageOffset: r.number(ability.stageOffset, ['ability', 'stageOffset'], 1, NON_NEGATIVE),
    },
    ladders: resolvedLadders,
    desiredRetention: r.number(input.desiredRetention, ['desiredRetention'], 0.9, RETENTION),
    stageRetention: r.stageNumbers(input.stageRetention, ['stageRetention'], RETENTION),
    mastery: {
      topSuccesses: r.number(mastery.topSuccesses, ['mastery', 'topSuccesses'], 2, POSITIVE_INT),
      topGapMs: r.number(mastery.topGapMs, ['mastery', 'topGapMs'], 259_200_000, NON_NEGATIVE_INT),
      minExpectedSuccess: r.number(
        mastery.minExpectedSuccess,
        ['mastery', 'minExpectedSuccess'],
        0.8,
        UNIT,
      ),
      retentionMargin: r.number(mastery.retentionMargin, ['mastery', 'retentionMargin'], 0.1, UNIT),
    },
    planner: {
      targetSuccess: r.number(planner.targetSuccess, ['planner', 'targetSuccess'], 0.85, {
        min: 0.6,
        max: 0.95,
      }),
      difficultyTolerance: r.number(
        planner.difficultyTolerance,
        ['planner', 'difficultyTolerance'],
        0.5,
        NON_NEGATIVE,
      ),
      coalesce: r.boolean(planner.coalesce, ['planner', 'coalesce'], true),
      remediationWindowMs: r.number(
        planner.remediationWindowMs,
        ['planner', 'remediationWindowMs'],
        86_400_000,
        NON_NEGATIVE_INT,
      ),
      pretestNewSkills: r.boolean(planner.pretestNewSkills, ['planner', 'pretestNewSkills'], false),
      pretestStageIndex: r.number(
        planner.pretestStageIndex,
        ['planner', 'pretestStageIndex'],
        2,
        NON_NEGATIVE_INT,
      ),
      stageSeconds: sortKeys({
        ...DEFAULT_STAGE_SECONDS,
        ...r.stageNumbers(planner.stageSeconds, ['planner', 'stageSeconds'], {
          min: 0,
          max: Number.MAX_VALUE,
          minExclusive: true,
        }),
      }),
      limits: {
        maxNewSkills: r.number(
          limits.maxNewSkills,
          ['planner', 'limits', 'maxNewSkills'],
          2,
          NON_NEGATIVE_INT,
        ),
        maxReviewBacklog: r.number(
          limits.maxReviewBacklog,
          ['planner', 'limits', 'maxReviewBacklog'],
          100,
          NON_NEGATIVE_INT,
        ),
        maxRemediation: r.number(
          limits.maxRemediation,
          ['planner', 'limits', 'maxRemediation'],
          3,
          NON_NEGATIVE_INT,
        ),
        maxSkillsPerTarget: r.number(
          limits.maxSkillsPerTarget,
          ['planner', 'limits', 'maxSkillsPerTarget'],
          4,
          POSITIVE_INT,
        ),
      },
    },
    contexts: {
      examsMoveSchedule: r.boolean(
        contexts.examsMoveSchedule,
        ['contexts', 'examsMoveSchedule'],
        false,
      ),
      diagnosticWeight: r.number(
        contexts.diagnosticWeight,
        ['contexts', 'diagnosticWeight'],
        1,
        UNIT,
      ),
      pretestWeight: r.number(contexts.pretestWeight, ['contexts', 'pretestWeight'], 0, UNIT),
    },
    leechThreshold: r.number(input.leechThreshold, ['leechThreshold'], 8, POSITIVE_INT),
    memoryWeightFloor: r.number(input.memoryWeightFloor, ['memoryWeightFloor'], 0.3, UNIT),
    itemCooldownMs: r.number(
      input.itemCooldownMs,
      ['itemCooldownMs'],
      604_800_000,
      NON_NEGATIVE_INT,
    ),
    itemUsageRetentionMs: r.number(
      input.itemUsageRetentionMs,
      ['itemUsageRetentionMs'],
      2_592_000_000,
      NON_NEGATIVE_INT,
    ),
    recentIdWindow: r.number(input.recentIdWindow, ['recentIdWindow'], 256, POSITIVE_INT),
    acceptProofs: readAcceptProofs(r, input.acceptProofs),
  };

  const demand = resolveStageDemand(
    [
      { ladder: resolved.ladders.declarative, path: ['ladders', 'declarative'] },
      { ladder: resolved.ladders.procedural, path: ['ladders', 'procedural'] },
    ],
    resolved.stageDemand,
  );

  const issues = [...conflicts, ...r.issues, ...demand.issues];
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: deepFreeze(resolved) };
}

/** The resolved defaults; a fresh frozen object per call. */
export function defaultConfig(): ResolvedPracticeConfig {
  const result = resolveConfig();
  /* v8 ignore next */
  if (!result.ok) throw new Error('lk-practice: the default configuration is invalid.');
  return result.value;
}

/** `fnv1a64(canonicalJson({ v: 1, config, tsFsrs, planner }))` (design §9). */
export function configHash(config: ResolvedPracticeConfig): string {
  return hashCanonical({ v: 1, config, tsFsrs: TS_FSRS_VERSION, planner: PLANNER_VERSION });
}

/**
 * The default memory model's reference: the same id, version and params as
 * `fsrsMemoryModel()`, without building a scheduler.
 */
function defaultMemoryRef(): PolicyRef {
  const { weights, learningSteps, relearningSteps, maximumIntervalDays } = FSRS_DEFAULT_PARAMS;
  return {
    id: 'fsrs-7',
    version: 1,
    params: {
      weights: [...weights],
      learningSteps: [...learningSteps],
      relearningSteps: [...relearningSteps],
      maximumIntervalDays,
    },
  };
}

function defaultMasteryRef(): PolicyRef {
  return { id: 'elo', version: 1, params: { alpha: 1, beta: 0.05 } };
}

function readStagePolicyOptions(r: Reader, value: unknown): Required<StagePolicyOptions> {
  const path = ['stagePolicyOptions'];
  const input = r.object(value, path, ['promoteAfter', 'promoteGapMs', 'demoteAfter']) ?? {};
  const d = DEFAULT_STAGE_POLICY_OPTIONS;
  return {
    promoteAfter: r.number(
      input.promoteAfter,
      [...path, 'promoteAfter'],
      d.promoteAfter,
      POSITIVE_INT,
    ),
    promoteGapMs: r.number(
      input.promoteGapMs,
      [...path, 'promoteGapMs'],
      d.promoteGapMs,
      NON_NEGATIVE_INT,
    ),
    demoteAfter: r.number(input.demoteAfter, [...path, 'demoteAfter'], d.demoteAfter, POSITIVE_INT),
  };
}

function readEvidenceOptions(r: Reader, value: unknown): Required<EvidenceOptions> {
  const path = ['evidenceOptions'];
  const input =
    r.object(value, path, ['checksPassFraction', 'aiMediumWeight', 'selfWeight', 'selfCorrect']) ??
    {};
  const d = DEFAULT_EVIDENCE_OPTIONS;
  const selfCorrectInput = r.object(input.selfCorrect, [...path, 'selfCorrect'], RATINGS);
  let selfCorrect = d.selfCorrect;
  if (selfCorrectInput !== undefined) {
    const out: Record<string, number> = {};
    for (const rating of RATINGS) {
      if (selfCorrectInput[rating] === undefined) {
        r.invalid([...path, 'selfCorrect', rating], `selfCorrect needs a value for "${rating}".`);
      }
      out[rating] = r.number(selfCorrectInput[rating], [...path, 'selfCorrect', rating], 0, UNIT);
    }
    selfCorrect = out as Record<Rating, number>;
  }
  return {
    checksPassFraction: r.number(
      input.checksPassFraction,
      [...path, 'checksPassFraction'],
      d.checksPassFraction,
      UNIT,
    ),
    aiMediumWeight: r.number(
      input.aiMediumWeight,
      [...path, 'aiMediumWeight'],
      d.aiMediumWeight,
      UNIT,
    ),
    selfWeight: r.number(input.selfWeight, [...path, 'selfWeight'], d.selfWeight, UNIT),
    selfCorrect: { ...selfCorrect },
  };
}

function readAcceptProofs(r: Reader, value: unknown): readonly CandidateProof['kind'][] {
  if (value === undefined) return ['executable', 'reviewed'];
  if (
    !Array.isArray(value) ||
    !value.every((kind) => PROOF_KINDS.includes(kind as CandidateProof['kind'])) ||
    new Set(value).size !== value.length
  ) {
    r.invalid(['acceptProofs'], `Expected distinct proof kinds from ${PROOF_KINDS.join(', ')}.`);
    return ['executable', 'reviewed'];
  }
  // Order carries no meaning, so it is sorted and cannot change the hash.
  return [...(value as CandidateProof['kind'][])].sort();
}

function sortKeys<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) out[key] = record[key] as T;
  return out;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
