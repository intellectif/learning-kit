import { describe, expect, it } from 'vitest';
import { evidence, item, lowAi, masterA, practice, run, T0 } from '../../log/__tests__/fixtures.js';
import { migrateState, STATE_SCHEMA_VERSION } from '../index.js';

const p = practice();

describe('migrateState', () => {
  it('returns a deep-frozen equal copy of a version 1 state', () => {
    const { state } = masterA(p);
    const stored = JSON.parse(JSON.stringify(state));
    const result = migrateState(stored);
    expect(STATE_SCHEMA_VERSION).toBe(1);
    expect(result).toEqual({ ok: true, state, migrated: false });
    if (!result.ok) return;
    expect(result.state).not.toBe(stored);
    expect(Object.isFrozen(result.state.skills.a?.memories.produce?.memory)).toBe(true);
  });

  it('keeps held records with their task', () => {
    const { state } = run(p, [{ evidence: evidence('h', 'i1', T0, lowAi), item: item('i1') }]);
    expect(migrateState(JSON.parse(JSON.stringify(state)))).toMatchObject({ ok: true, state });
  });

  it('rejects another schema version', () => {
    expect(migrateState({ schemaVersion: 2 })).toMatchObject({
      ok: false,
      issues: [{ code: 'SCHEMA_VERSION_UNSUPPORTED', path: ['schemaVersion'] }],
    });
  });

  it('rejects anything that is not a state, without throwing', () => {
    for (const raw of [
      null,
      undefined,
      1,
      'x',
      [],
      {},
      { schemaVersion: 1 },
      { schemaVersion: '1' },
    ]) {
      const result = migrateState(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues[0]?.code).toBe('SHAPE_INVALID');
    }
  });

  it('rejects an opaque memory with a cycle or an array hole, which has no JSON form', () => {
    const { state } = masterA(p);
    for (const bad of ['cycle', 'hole'] as const) {
      const stored = JSON.parse(JSON.stringify(state));
      const memory = stored.skills.a.memories.recall.memory;
      if (bad === 'cycle') memory.self = memory;
      // biome-ignore lint/suspicious/noSparseArray: the hole is the case under test.
      else memory.list = [1, , 3];
      const result = migrateState(stored);
      expect(result).toMatchObject({ ok: false, issues: [{ code: 'SHAPE_INVALID' }] });
      if (!result.ok) {
        expect(result.issues[0]?.path.slice(0, 5)).toEqual([
          'skills',
          'a',
          'memories',
          'recall',
          'memory',
        ]);
      }
    }
  });
});
