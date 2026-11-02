import { describe, expect, it } from 'vitest';
import { configHash, defaultConfig, resolveConfig } from '../config.js';
import type {
  EvidenceMapper,
  MasteryModel,
  MemoryModel,
  PracticeConfig,
  ResolvedPracticeConfig,
  StagePolicy,
} from '../types.js';

const fn = () => {
  throw new Error('not called in M2');
};

const memory = (extra: Partial<MemoryModel> = {}): MemoryModel =>
  ({
    id: 'custom-memory',
    version: 1,
    params: { steps: [1, 2] },
    init: fn,
    retrievability: fn,
    review: fn,
    serialize: fn,
    deserialize: fn,
    ...extra,
  }) as MemoryModel;

const mastery = (): MasteryModel =>
  ({
    id: 'custom-mastery',
    version: 2,
    params: null,
    init: fn,
    update: fn,
    prior: fn,
    derive: fn,
    expectedSuccess: fn,
    estimate: fn,
    serialize: fn,
    deserialize: fn,
  }) as MasteryModel;

const policy = (): StagePolicy =>
  ({ id: 'p', version: 1, params: { k: 3 }, decide: fn }) as StagePolicy;
const mapper = (): EvidenceMapper =>
  ({ id: 'm', version: 1, params: [], map: fn }) as EvidenceMapper;

function resolved(config: PracticeConfig): ResolvedPracticeConfig {
  const result = resolveConfig(config);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

function codesOf(config: unknown) {
  const result = resolveConfig(config as PracticeConfig);
  return result.ok ? [] : result.issues.map((issue) => `${issue.code} ${issue.path.join('.')}`);
}

/** Every value reachable from `value`, depth first. */
function walk(value: unknown, out: unknown[] = []): unknown[] {
  out.push(value);
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) walk(child, out);
  }
  return out;
}

describe('resolveConfig', () => {
  it('fills in the documented defaults', () => {
    const config = defaultConfig();
    expect(config.memoryModel).toEqual({
      id: 'fsrs-7',
      version: 1,
      params: {
        learningSteps: ['1m', '10m'],
        relearningSteps: ['10m'],
        maximumIntervalDays: 36500,
      },
    });
    expect(config.masteryModel.id).toBe('elo');
    expect(config.stagePolicy).toEqual({
      id: 'stage-default',
      version: 1,
      params: { promoteAfter: 2, promoteGapMs: 86_400_000, demoteAfter: 2 },
    });
    expect(config.evidenceMapper.id).toBe('evidence-default');
    expect(config.stageDemand).toEqual({
      apply: 4,
      complete: 2,
      example: 1,
      produce: 3,
      recall: 2,
      recognise: 1,
      transfer: 4,
      write: 3,
    });
    expect(config.ladders).toEqual({
      declarative: ['recognise', 'recall', 'produce', 'apply'],
      procedural: ['example', 'complete', 'write', 'transfer'],
    });
    expect(config.desiredRetention).toBe(0.9);
    expect(config.mastery).toEqual({
      topSuccesses: 2,
      topGapMs: 259_200_000,
      minExpectedSuccess: 0.8,
      retentionMargin: 0.1,
    });
    expect(config.planner.targetSuccess).toBe(0.85);
    expect(config.planner.limits).toEqual({
      maxNewSkills: 2,
      maxReviewBacklog: 100,
      maxRemediation: 3,
      maxSkillsPerTarget: 4,
    });
    expect(config.itemCooldownMs).toBe(604_800_000);
    expect(config.itemUsageRetentionMs).toBe(2_592_000_000);
    expect(config.acceptProofs).toEqual(['executable', 'reviewed']);
  });

  it('is deeply frozen plain data with no function anywhere (D26)', () => {
    const config = resolved({
      memoryModel: memory(),
      masteryModel: mastery(),
      stagePolicy: policy(),
      evidenceMapper: mapper(),
    });
    for (const value of walk(config)) {
      expect(typeof value).not.toBe('function');
      if (typeof value === 'object' && value !== null) expect(Object.isFrozen(value)).toBe(true);
    }
    expect(config.memoryModel).toEqual({
      id: 'custom-memory',
      version: 1,
      params: { steps: [1, 2] },
    });
    expect(config.stagePolicyOptions).toBeNull();
    expect(config.evidenceOptions).toBeNull();
  });

  it('copies params, so a later change to the instance changes nothing', () => {
    const params = { steps: [1, 2] };
    const config = resolved({ memoryModel: memory({ params }) });
    params.steps.push(3);
    expect(config.memoryModel.params).toEqual({ steps: [1, 2] });
  });

  it('merges stage demand and stage seconds over the defaults, keys sorted', () => {
    const config = resolved({
      stageDemand: { debug: 4.5, apply: 5 },
      planner: { stageSeconds: { write: 300 } },
    });
    expect(Object.keys(config.stageDemand)[0]).toBe('apply');
    expect(config.stageDemand.debug).toBe(4.5);
    expect(config.planner.stageSeconds.write).toBe(300);
    expect(Object.keys(config.planner.stageSeconds)).toEqual(
      [...Object.keys(config.planner.stageSeconds)].sort(),
    );
  });

  it('accepts every documented option in range', () => {
    const config = resolved({
      stagePolicyOptions: { promoteAfter: 3, promoteGapMs: 0, demoteAfter: 1 },
      evidenceOptions: {
        checksPassFraction: 0.5,
        aiMediumWeight: 0.25,
        selfWeight: 0,
        selfCorrect: { again: 0, hard: 0.5, good: 0.9, easy: 1 },
      },
      ability: { stageOffset: 0.5 },
      ladders: { declarative: ['recall', 'apply'] },
      desiredRetention: 0.7,
      stageRetention: { apply: 0.95 },
      mastery: { topSuccesses: 3, topGapMs: 0, minExpectedSuccess: 1, retentionMargin: 0 },
      planner: {
        targetSuccess: 0.6,
        difficultyTolerance: 0,
        coalesce: false,
        remediationWindowMs: 0,
        pretestNewSkills: true,
        pretestStageIndex: 0,
        limits: { maxNewSkills: 0, maxReviewBacklog: 0, maxRemediation: 0, maxSkillsPerTarget: 1 },
      },
      contexts: { examsMoveSchedule: true, diagnosticWeight: 0, pretestWeight: 1 },
      leechThreshold: 1,
      memoryWeightFloor: 0,
      itemCooldownMs: 0,
      itemUsageRetentionMs: 0,
      recentIdWindow: 1,
      acceptProofs: ['reviewed', 'model-checked'],
    });
    expect(config.stagePolicy.params).toEqual({ promoteAfter: 3, promoteGapMs: 0, demoteAfter: 1 });
    expect(config.evidenceOptions?.selfCorrect.hard).toBe(0.5);
    expect(config.acceptProofs).toEqual(['model-checked', 'reviewed']);
    expect(config.ladders.declarative).toEqual(['recall', 'apply']);
  });

  it('rejects a custom policy given with the built-in options (CONFIG_CONFLICT)', () => {
    expect(codesOf({ stagePolicy: policy(), stagePolicyOptions: { promoteAfter: 3 } })).toEqual([
      'CONFIG_CONFLICT stagePolicyOptions',
    ]);
    expect(codesOf({ evidenceMapper: mapper(), evidenceOptions: {} })).toEqual([
      'CONFIG_CONFLICT evidenceOptions',
    ]);
  });

  it('rejects options out of range, of the wrong type, or unknown (CONFIG_INVALID)', () => {
    expect(
      codesOf({
        desiredRetention: 0.99,
        leechThreshold: 1.5,
        planner: { targetSuccess: 0.5, coalesce: 'yes', limits: { maxSkillsPerTarget: 0 }, x: 1 },
        mastery: { minExpectedSuccess: Number.NaN },
        stageDemand: { '': 1, recall: '2' },
        stageRetention: 0.9,
        ladders: { declarative: [], procedural: ['a', 'a'] },
        acceptProofs: ['executable', 'executable'],
        ability: [],
        evidenceOptions: { selfCorrect: { again: 0, hard: 2 } },
        nope: true,
      }),
    ).toEqual([
      'CONFIG_INVALID nope',
      'CONFIG_INVALID evidenceOptions.selfCorrect.hard',
      'CONFIG_INVALID evidenceOptions.selfCorrect.good',
      'CONFIG_INVALID evidenceOptions.selfCorrect.easy',
      'CONFIG_INVALID stageDemand.',
      'CONFIG_INVALID stageDemand.recall',
      'CONFIG_INVALID ability',
      'CONFIG_INVALID planner.x',
      'CONFIG_INVALID ladders.declarative',
      'CONFIG_INVALID ladders.procedural',
      'CONFIG_INVALID desiredRetention',
      'CONFIG_INVALID stageRetention',
      'CONFIG_INVALID mastery.minExpectedSuccess',
      'CONFIG_INVALID planner.targetSuccess',
      'CONFIG_INVALID planner.coalesce',
      'CONFIG_INVALID planner.limits.maxSkillsPerTarget',
      'CONFIG_INVALID leechThreshold',
      'CONFIG_INVALID acceptProofs',
    ]);
    expect(codesOf('fast')).toEqual(['CONFIG_INVALID ']);
  });

  it('rejects a custom instance without its id, version, methods or canonical params', () => {
    expect(
      codesOf({
        memoryModel: memory({ id: '', version: 0, review: undefined as never }),
        masteryModel: 'elo',
        stagePolicy: { ...policy(), params: { f: fn } },
        evidenceMapper: { ...mapper(), params: { n: Number.POSITIVE_INFINITY } },
      }),
    ).toEqual([
      'CONFIG_INVALID memoryModel.id',
      'CONFIG_INVALID memoryModel.version',
      'CONFIG_INVALID memoryModel.review',
      'CONFIG_INVALID masteryModel',
      'CONFIG_INVALID stagePolicy.params.f',
      'CONFIG_INVALID evidenceMapper.params.n',
    ]);
  });

  it('checks the configured ladders against stage demand (R3.8)', () => {
    expect(codesOf({ ladders: { procedural: ['write', 'example'] } })).toEqual([
      'STAGE_DEMAND_ORDER ladders.procedural.1',
    ]);
    expect(
      codesOf({ ladders: { declarative: ['say', 'recall'], procedural: ['example', 'say'] } }),
    ).toEqual(['STAGE_DEMAND_AMBIGUOUS ladders.procedural.1']);
  });
});

describe('configHash', () => {
  // Pinned so an unintended change to a default shows up here. The default
  // vector changes on purpose when the FSRS-7 weights join the memory
  // model's params (M3).
  const DEFAULT_HASH = configHash(defaultConfig());

  it('is 16 hex characters and equal for equal configuration data', () => {
    expect(DEFAULT_HASH).toMatch(/^[0-9a-f]{16}$/);
    expect(configHash(resolved({}))).toBe(DEFAULT_HASH);
    expect(configHash(resolved({ desiredRetention: 0.9 }))).toBe(DEFAULT_HASH);
    const a = resolved({
      stageDemand: { x: 1.5, y: 2.5 },
      acceptProofs: ['reviewed', 'executable'],
    });
    const b = resolved({
      stageDemand: { y: 2.5, x: 1.5 },
      acceptProofs: ['executable', 'reviewed'],
    });
    expect(configHash(a)).toBe(configHash(b));
    expect(configHash(resolved({ stagePolicy: policy() }))).toBe(
      configHash(resolved({ stagePolicy: { ...policy(), decide: () => fn() } as StagePolicy })),
    );
  });

  it('changes with a default, and with a custom policy id, version or params', () => {
    const hashes = [
      DEFAULT_HASH,
      configHash(resolved({ desiredRetention: 0.85 })),
      configHash(resolved({ stagePolicy: policy() })),
      configHash(resolved({ stagePolicy: { ...policy(), id: 'other' } as StagePolicy })),
      configHash(resolved({ stagePolicy: { ...policy(), version: 2 } as StagePolicy })),
      configHash(resolved({ stagePolicy: { ...policy(), params: { k: 4 } } as StagePolicy })),
      configHash(resolved({ memoryModel: memory() })),
      configHash(resolved({ memoryModel: memory({ params: { steps: [2, 1] } }) })),
    ];
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('pins the vectors', () => {
    expect({
      default: DEFAULT_HASH,
      custom: configHash(
        resolved({ stagePolicy: policy(), evidenceMapper: mapper(), desiredRetention: 0.8 }),
      ),
    }).toMatchInlineSnapshot(`
      {
        "custom": "88d2e6521528d7a6",
        "default": "3ff64cac2f9dd2a1",
      }
    `);
  });
});
