import { describe, expect, it } from 'vitest';
import { defaultConfig, resolveConfig } from '../../config.js';
import type {
  MasteryModel,
  MemoryModel,
  ResolvedPracticeConfig,
  SkillNode,
  SkillState,
  StageId,
  StageMemory,
} from '../../types.js';
import { createEloModel } from '../elo.js';
import {
  desiredRetentionFor,
  isMastered,
  type MasteryContext,
  masteryFailures,
  skillStatus,
} from '../predicate.js';

const LADDER = ['recognise', 'recall', 'produce', 'apply'];
const DEMAND = new Map<StageId, number>(LADDER.map((stage, i) => [stage, i + 1]));

/** Retrievability is stored in the memory, so each case names it. */
const memoryModel = {
  retrievability: (memory: { r: number }) => memory.r,
  deserialize: (raw: unknown) => raw,
} as unknown as MemoryModel;

function configWith(input: object): ResolvedPracticeConfig {
  const result = resolveConfig(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

function contextFor(config = defaultConfig()): MasteryContext {
  return {
    model: createEloModel({}) as MasteryModel,
    ladder: LADDER,
    demand: DEMAND,
    stageOffset: 1,
    memoryModel,
    config,
  };
}

function stageMemory(r: number): StageMemory {
  return {
    model: 'fsrs-7@1',
    memory: { r },
    due: 1,
    modelDue: 1,
    lastReviewAt: 0,
    reviews: 3,
    lapses: 0,
    streak: { successes: 0, firstSuccessAt: null, lastSuccessAt: null, lapses: 0 },
    superseded: false,
  };
}

/** A mastered skill at the default configuration: every condition holds. */
function mastered(overrides: Partial<SkillState> = {}): SkillState {
  return {
    stage: 'apply',
    startedAt: 0,
    unlockedAt: 0,
    credited: false,
    suspended: null,
    memories: { apply: stageMemory(0.85) },
    // The margin is 0.5 * K(5) = 0.5 / 1.25 = 0.4 (revised in M11), and
    // sigmoid(1.8 - 0.4) = 0.802 >= 0.8.
    ability: { apply: { theta: 1.8, n: 5 } },
    mastered: false,
    evidenceCount: 10,
    lastLapseAt: null,
    top: { successes: 2, firstSuccessAt: 0, lastSuccessAt: 259_200_000, lastWasLapse: false },
    ...overrides,
  };
}

const SKILL: SkillNode = { id: 's', knowledge: 'declarative' };

describe('masteryFailures', () => {
  it('is empty when all of (a) to (d) hold', () => {
    expect(masteryFailures(mastered(), SKILL, 1, contextFor())).toEqual([]);
    expect(isMastered(mastered(), SKILL, 1, contextFor())).toBe(true);
  });

  it('reports (a) a stage below the top', () => {
    expect(masteryFailures(mastered({ stage: 'produce' }), SKILL, 1, contextFor())).toEqual([
      'stage',
    ]);
  });

  it('reports (b) too few top successes or a last lapse', () => {
    const top = mastered().top;
    const few = mastered({ top: { ...top, successes: 1 } });
    expect(masteryFailures(few, SKILL, 1, contextFor())).toEqual(['successes']);
    const lapse = mastered({ top: { ...top, successes: 5, lastWasLapse: true } });
    expect(masteryFailures(lapse, SKILL, 1, contextFor())).toEqual(['successes']);
    const three = contextFor(configWith({ mastery: { topSuccesses: 3 } }));
    expect(masteryFailures(mastered(), SKILL, 1, three)).toEqual(['successes']);
  });

  it('reports (c) a low expected success, against the reference difficulty', () => {
    const low = mastered({ ability: { apply: { theta: 1.78, n: 5 } } });
    expect(masteryFailures(low, SKILL, 1, contextFor())).toEqual(['ability']);
    const hard = { ...SKILL, referenceDifficulty: 0.5 };
    expect(masteryFailures(mastered(), hard, 1, contextFor())).toEqual(['ability']);
    const easy = { ...SKILL, referenceDifficulty: -1 };
    expect(masteryFailures(low, easy, 1, contextFor())).toEqual([]);
  });

  it('holds the standard against the reference raised by the margin times the uncertainty (revised in M11)', () => {
    // sigmoid(1.4) = 0.802 with no margin; K(5) = 0.8 makes the default margin 0.4.
    const edge = mastered({ ability: { apply: { theta: 1.4, n: 5 } } });
    expect(masteryFailures(edge, SKILL, 1, contextFor())).toEqual(['ability']);
    const none = contextFor(configWith({ mastery: { uncertaintyMargin: 0 } }));
    expect(masteryFailures(edge, SKILL, 1, none)).toEqual([]);
    // More evidence shrinks the step: K(95) = 1 / 5.75, a margin of 0.087.
    const settled = mastered({ ability: { apply: { theta: 1.48, n: 95 } } });
    expect(masteryFailures(settled, SKILL, 1, contextFor())).toEqual([]);
    const twice = contextFor(configWith({ mastery: { uncertaintyMargin: 1 } }));
    expect(masteryFailures(settled, SKILL, 1, twice)).toEqual(['ability']);
    // A model that states no uncertainty has no margin.
    const elo = createEloModel({});
    const silent: MasteryModel = {
      ...(elo as MasteryModel),
      estimate(state) {
        const { uncertainty: _omit, ...rest } = elo.estimate(state as never);
        return rest;
      },
    };
    expect(masteryFailures(edge, SKILL, 1, { ...contextFor(), model: silent })).toEqual([]);
  });

  it('derives an absent top ability from a lower stage', () => {
    // produce 2.9 -> apply 1.9 with n 0, so a margin of 0.5: sigmoid(1.4) = 0.802.
    const derived = mastered({ ability: { produce: { theta: 2.9, n: 9 } } });
    expect(masteryFailures(derived, SKILL, 1, contextFor())).toEqual([]);
    const none = mastered({ ability: {} });
    expect(masteryFailures(none, SKILL, 1, contextFor())).toEqual(['ability']);
  });

  it('reports (d) retrievability under the retention floor, or no top memory', () => {
    // Floor 0.9 - 0.1 = 0.8; 0.8 itself passes.
    expect(
      masteryFailures(mastered({ memories: { apply: stageMemory(0.8) } }), SKILL, 1, contextFor()),
    ).toEqual([]);
    expect(
      masteryFailures(mastered({ memories: { apply: stageMemory(0.79) } }), SKILL, 1, contextFor()),
    ).toEqual(['retrievability']);
    expect(
      masteryFailures(mastered({ memories: { produce: stageMemory(1) } }), SKILL, 1, contextFor()),
    ).toEqual(['retrievability']);
    // A skill retention of 0.7 lowers the floor to 0.6.
    const relaxed = { ...SKILL, desiredRetention: 0.7 };
    expect(
      masteryFailures(
        mastered({ memories: { apply: stageMemory(0.61) } }),
        relaxed,
        1,
        contextFor(),
      ),
    ).toEqual([]);
  });

  it('reports every failing condition at once, in order', () => {
    const state = mastered({
      stage: 'recall',
      memories: {},
      ability: { apply: { theta: 0, n: 1 } },
      top: { successes: 0, firstSuccessAt: null, lastSuccessAt: null, lastWasLapse: false },
    });
    expect(masteryFailures(state, SKILL, 1, contextFor())).toEqual([
      'stage',
      'successes',
      'ability',
      'retrievability',
    ]);
    expect(isMastered(state, SKILL, 1, contextFor())).toBe(false);
  });

  it('passes the time to the memory model', () => {
    const timed = {
      retrievability: (_memory: unknown, t: number) => (t < 100 ? 0.95 : 0.5),
      deserialize: (raw: unknown) => raw,
    } as unknown as MemoryModel;
    const context = { ...contextFor(), memoryModel: timed };
    expect(masteryFailures(mastered(), SKILL, 99, context)).toEqual([]);
    expect(masteryFailures(mastered(), SKILL, 100, context)).toEqual(['retrievability']);
  });
});

describe('desiredRetentionFor', () => {
  it('prefers the skill, then the stage, then the configuration', () => {
    const config = configWith({ desiredRetention: 0.85, stageRetention: { recognise: 0.75 } });
    expect(desiredRetentionFor(SKILL, 'recall', config)).toBe(0.85);
    expect(desiredRetentionFor(SKILL, 'recognise', config)).toBe(0.75);
    expect(desiredRetentionFor({ ...SKILL, desiredRetention: 0.95 }, 'recognise', config)).toBe(
      0.95,
    );
  });
});

describe('skillStatus', () => {
  const input = { mastered: false, top: 'apply', hasHardPrerequisites: true };
  const base = mastered({ stage: 'recall', startedAt: null, unlockedAt: null });

  it('is ready or locked with no state', () => {
    expect(skillStatus(undefined, input)).toBe('locked');
    expect(skillStatus(undefined, { ...input, hasHardPrerequisites: false })).toBe('ready');
  });

  it('follows the order of design 8.3', () => {
    expect(
      skillStatus({ ...base, suspended: 'leech', credited: true }, { ...input, mastered: true }),
    ).toBe('suspended');
    expect(skillStatus({ ...base, suspended: 'host' }, input)).toBe('suspended');
    expect(skillStatus({ ...base, credited: true }, { ...input, mastered: true })).toBe('credited');
    expect(
      skillStatus({ ...base, credited: true, startedAt: 5 }, { ...input, mastered: true }),
    ).toBe('mastered');
    expect(skillStatus({ ...base, stage: 'apply', startedAt: 5 }, input)).toBe('reviewing');
    expect(skillStatus({ ...base, startedAt: 5 }, input)).toBe('learning');
    expect(skillStatus({ ...base, unlockedAt: 5 }, input)).toBe('ready');
    expect(skillStatus(base, input)).toBe('locked');
    expect(skillStatus(base, { ...input, hasHardPrerequisites: false })).toBe('ready');
  });
});
