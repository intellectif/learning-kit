import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../config.js';
import {
  DEFAULT_STAGE_DEMAND,
  equivalentStage,
  fallbackDemand,
  ladderOf,
  resolveStageDemand,
} from '../stages.js';

const config = defaultConfig();
const DECLARATIVE = ['recognise', 'recall', 'produce', 'apply'];
const PROCEDURAL = ['example', 'complete', 'write', 'transfer'];
const defaults = resolveStageDemand(
  [
    { ladder: DECLARATIVE, path: ['d'] },
    { ladder: PROCEDURAL, path: ['p'] },
  ],
  DEFAULT_STAGE_DEMAND,
).demand;

describe('ladderOf', () => {
  it('uses the skill override, else the configured ladder of its knowledge type', () => {
    expect(ladderOf({ knowledge: 'declarative' }, config)).toEqual(DECLARATIVE);
    expect(ladderOf({ knowledge: 'procedural' }, config)).toEqual(PROCEDURAL);
    expect(ladderOf({ knowledge: 'procedural', stages: ['use'] }, config)).toEqual(['use']);
    expect(ladderOf({ knowledge: 'mixed', stages: ['recall', 'write'] }, config)).toEqual([
      'recall',
      'write',
    ]);
    expect(ladderOf({ knowledge: 'mixed' }, config)).toBeNull();
  });
});

describe('fallbackDemand', () => {
  it('spreads a ladder over 1..4, and a one-stage ladder is 4', () => {
    expect([0, 1, 2, 3].map((i) => fallbackDemand(i, 4))).toEqual([1, 2, 3, 4]);
    expect([0, 1].map((i) => fallbackDemand(i, 2))).toEqual([1, 4]);
    expect(fallbackDemand(1, 3)).toBe(2.5);
    expect(fallbackDemand(0, 1)).toBe(4);
  });
});

describe('resolveStageDemand', () => {
  it('uses the declared demand and raises nothing for the default ladders', () => {
    const result = resolveStageDemand(
      [
        { ladder: DECLARATIVE, path: ['d'] },
        { ladder: PROCEDURAL, path: ['p'] },
      ],
      DEFAULT_STAGE_DEMAND,
    );
    expect(result.issues).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.demand.get('write')).toBe(3);
  });

  it('warns once per undeclared stage, at its first ladder', () => {
    const result = resolveStageDemand(
      [
        { ladder: ['use'], path: ['a'] },
        { ladder: ['use'], path: ['b'] },
      ],
      {},
    );
    expect(result.issues).toEqual([]);
    expect(result.warnings).toEqual([
      {
        code: 'STAGE_DEMAND_DEFAULTED',
        path: ['a', 0],
        message: 'Stage "use" has no declared demand and uses its ladder position (4).',
      },
    ]);
  });

  it('reports an ambiguous fallback once and skips the order check of its ladders', () => {
    const result = resolveStageDemand(
      [
        { ladder: ['x'], path: ['a'] },
        { ladder: ['x', 'y'], path: ['b'] },
        { ladder: ['z', 'x'], path: ['c'] },
      ],
      {},
    );
    expect(result.issues.map((issue) => [issue.code, issue.path])).toEqual([
      ['STAGE_DEMAND_AMBIGUOUS', ['b', 0]],
    ]);
    expect(result.issues[0]?.message).toContain('4 at a.0, 1 here');
  });

  it('reports one order issue per ladder that does not strictly increase', () => {
    const result = resolveStageDemand(
      [
        { ladder: ['write', 'complete', 'example'], path: ['a'] },
        { ladder: ['recall', 'complete'], path: ['b'] },
      ],
      DEFAULT_STAGE_DEMAND,
    );
    expect(result.issues.map((issue) => [issue.code, issue.path])).toEqual([
      ['STAGE_DEMAND_ORDER', ['a', 1]],
      ['STAGE_DEMAND_ORDER', ['b', 1]],
    ]);
  });
});

describe('equivalentStage', () => {
  it('is the stage itself when the ladder has it', () => {
    expect(equivalentStage('write', PROCEDURAL, defaults)).toBe('write');
  });

  it('is the most demanding stage at or below the demand, across ladders', () => {
    expect(equivalentStage('write', DECLARATIVE, defaults)).toBe('produce');
    expect(equivalentStage('transfer', ['recognise', 'recall'], defaults)).toBe('recall');
  });

  it('is null when every stage is more demanding, or the demand is unknown', () => {
    expect(equivalentStage('example', ['recall', 'apply'], defaults)).toBeNull();
    expect(equivalentStage('unknown', DECLARATIVE, defaults)).toBeNull();
  });

  it('is monotone: a more demanding stage never maps lower', () => {
    const stages = [...DECLARATIVE, ...PROCEDURAL];
    fc.assert(
      fc.property(
        fc.constantFrom(...stages),
        fc.constantFrom(...stages),
        fc.subarray(DECLARATIVE, { minLength: 1 }),
        (x, y, ladder) => {
          const [low, high] =
            (defaults.get(x) as number) <= (defaults.get(y) as number) ? [x, y] : [y, x];
          const a = equivalentStage(low, ladder, defaults);
          const b = equivalentStage(high, ladder, defaults);
          if (a === null) return true;
          return b !== null && (defaults.get(b) as number) >= (defaults.get(a) as number);
        },
      ),
      { numRuns: 300 },
    );
  });
});
