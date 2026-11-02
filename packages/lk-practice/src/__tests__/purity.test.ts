import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The runtime purity trap (R1.1). The clock, the random source and argument-
 * less `new Date()` are replaced by functions that throw, and the package is
 * loaded and run with them in place: a path that reaches one of them fails
 * here, however it was reached. `scripts/verify-dist.mjs` sets the same trap
 * around the built entry, and scans its text as well.
 */
class PurityViolation extends Error {
  constructor(source: string) {
    super(`lk-practice reached ${source}, which it must never call.`);
    this.name = 'PurityViolation';
  }
}

const RealDate = Date;

/** `Date` with a date given still works; the current time does not. */
class TrappedDate extends RealDate {
  constructor(...args: [] | [value: number | string | Date]) {
    if (args.length === 0) {
      throw new PurityViolation('new Date()');
    }
    super(args[0]);
  }

  static override now(): number {
    throw new PurityViolation('Date.now()');
  }
}

function installTrap(): void {
  vi.stubGlobal('Date', TrappedDate);
  vi.spyOn(Math, 'random').mockImplementation(() => {
    throw new PurityViolation('Math.random()');
  });
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
    throw new PurityViolation('crypto.randomUUID()');
  });
}

describe('the runtime purity trap', () => {
  beforeEach(() => {
    installTrap();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // A trap that never fires proves nothing, so each vector is sprung first.
  it('throws on every vector it guards', () => {
    expect(() => new Date()).toThrow(PurityViolation);
    expect(() => Date.now()).toThrow(PurityViolation);
    expect(() => Math.random()).toThrow(PurityViolation);
    expect(() => globalThis.crypto.randomUUID()).toThrow(PurityViolation);
  });

  it('still allows a Date built from a given time', () => {
    expect(new Date(0).toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });

  it('loads and runs the root entry without reaching any of them', async () => {
    vi.resetModules();
    const entry = await import('../index.js');
    expect(Object.keys(entry).sort()).toEqual(['composeGraph', 'validateGraph', 'validateItems']);
    const graph = {
      version: '1',
      skills: [
        { id: 'a', knowledge: 'declarative' as const },
        { id: 'b', knowledge: 'procedural' as const, stages: ['use'] },
      ],
      edges: [{ kind: 'prerequisite' as const, from: 'a', to: 'b', strength: 'hard' as const }],
    };
    expect(entry.validateGraph(graph).ok).toBe(true);
    expect(
      entry.validateItems(
        [
          {
            id: 'i',
            skills: [{ skillId: 'a', weight: 1 }],
            stage: 'recall',
            origin: 'authored',
            status: 'proven',
          },
        ],
        graph,
      ).ok,
    ).toBe(true);
    const composed = entry.composeGraph(graph, [
      {
        id: 'e',
        goalId: 'g',
        idPrefix: 'x',
        skills: [{ id: 'x', knowledge: 'procedural' }],
        edges: [{ kind: 'prerequisite', from: 'b', to: 'x', strength: 'soft' }],
        status: 'admitted',
      },
    ]);
    expect(composed.ok).toBe(true);
  });
});
