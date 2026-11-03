/**
 * Replays vectors/evidence.json, vectors/stage.json, vectors/log.json,
 * vectors/plan.json (revised in M6) and vectors/contracts.json (revised in M7)
 * against src/ through vectors/replay.mjs,
 * the way scripts/mutate.mjs replays them against each mutant, with the
 * runtime purity trap installed (revised in M8). Plain ESM, as the replay is.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { differences, ENTRY, NEEDS, replay } from '../../vectors/replay.mjs';
import * as config from '../config.js';
import * as contracts from '../contracts/index.js';
import * as evidence from '../evidence/index.js';
import * as graph from '../graph/index.js';
import * as mastery from '../mastery/index.js';
import * as memory from '../memory/fsrs.js';
import * as practice from '../practice.js';
import * as migrate from '../schema/migrate.js';
import * as stage from '../stage/index.js';
import { installTrap, removeTrap } from './trap.js';

const MODULES = {
  'config.ts': config,
  'contracts/index.ts': contracts,
  'evidence/index.ts': evidence,
  'graph/index.ts': graph,
  'mastery/index.ts': mastery,
  'memory/fsrs.ts': memory,
  'practice.ts': practice,
  'schema/migrate.ts': migrate,
  'stage/index.ts': stage,
};
const impl = {};
for (const [module, names] of Object.entries(ENTRY)) {
  for (const name of names) impl[name] = MODULES[module][name];
}

const corpus = (file) =>
  JSON.parse(readFileSync(new URL(`../../vectors/${file}`, import.meta.url), 'utf8'));

describe('policy, log, plan and contract vectors', () => {
  for (const [file, least] of [
    ['evidence.json', 10],
    ['stage.json', 10],
    ['log.json', 10],
    ['plan.json', 10],
    ['contracts.json', 15],
  ]) {
    it(`${file} replays with no difference, under the purity trap`, () => {
      const loaded = corpus(file);
      expect(loaded.vectors.length).toBeGreaterThanOrEqual(least);
      installTrap();
      try {
        expect(replay(impl, loaded)).toEqual([]);
      } finally {
        removeTrap();
      }
    });
  }

  // verify-dist replays over the build the vectors whose kinds need only
  // what the build exports; this proves each kind needs no more than NEEDS
  // says (revised in M8).
  it('replays each vector with only the functions its kind needs', () => {
    const entry = new Set(Object.values(ENTRY).flat());
    for (const names of Object.values(NEEDS)) {
      for (const name of names) expect(entry.has(name)).toBe(true);
    }
    for (const file of ['evidence.json', 'stage.json', 'log.json', 'plan.json', 'contracts.json']) {
      const loaded = corpus(file);
      for (const vector of loaded.vectors) {
        expect(Object.keys(NEEDS)).toContain(vector.kind);
        const only = Object.fromEntries(NEEDS[vector.kind].map((name) => [name, impl[name]]));
        expect(replay(only, { ...loaded, vectors: [vector] })).toEqual([]);
      }
    }
  });

  it('reports a changed value, and rejects another corpus version', () => {
    const loaded = corpus('stage.json');
    const changed = structuredClone(loaded);
    changed.vectors[0].expected[0] = 'success';
    expect(replay(impl, changed)).toHaveLength(1);
    expect(() => replay(impl, { ...loaded, version: 2 })).toThrow(/version/);
    expect(replay(impl, { version: 1, vectors: [{ kind: 'nope', name: 'x' }] })).toEqual([
      'x: unknown kind nope',
    ]);
  });

  it('reports a changed log outcome and a changed migrated state', () => {
    const loaded = corpus('log.json');
    const changed = structuredClone(loaded);
    const log = changed.vectors.find((vector) => vector.kind === 'log' && vector.expected.steps);
    log.expected.steps[0].kind = 'duplicate';
    const rows = changed.vectors.find((vector) => vector.kind === 'migrate');
    rows.expected[0].ok = false;
    expect(replay(impl, changed)).toHaveLength(2);
  });

  it('reports a changed plan target and a changed thrown error', () => {
    const loaded = corpus('plan.json');
    const changed = structuredClone(loaded);
    const planned = changed.vectors.find((vector) =>
      vector.expected.plans.some((entry) => entry.targets?.length > 0),
    );
    planned.expected.plans.find((entry) => entry.targets?.length > 0).targets[0].stage = 'x';
    const thrown = changed.vectors.find((vector) =>
      vector.expected.plans.some((entry) => entry.$throws !== undefined),
    );
    thrown.expected.plans.find((entry) => entry.$throws !== undefined).$throws = 'Error';
    expect(replay(impl, changed)).toHaveLength(2);
  });

  it('reports a changed admission, a changed candidate rejection and a changed grade check', () => {
    const loaded = corpus('contracts.json');
    const changed = structuredClone(loaded);
    const composed = changed.vectors.find((vector) => vector.expected.after !== undefined);
    composed.expected.after.kind = 'applied';
    const generated = changed.vectors.find(
      (vector) => vector.kind === 'generate' && vector.expected.candidates?.rejected.length > 0,
    );
    generated.expected.candidates.rejected[0].index = 99;
    const graded = changed.vectors.find((vector) => vector.kind === 'grade');
    graded.expected.checks[0].ok = false;
    expect(replay(impl, changed)).toHaveLength(3);
  });

  it('compares floats at a relative 1e-9 and everything else exactly', () => {
    expect(differences(1 + 1e-12, 1)).toEqual([]);
    expect(differences(0.5 + 1e-6, 0.5)).toHaveLength(1);
    expect(differences(2, 3)).toHaveLength(1);
    expect(differences({ a: [1, null] }, { a: [1, null] })).toEqual([]);
    expect(differences({ a: 1 }, { b: 1 })).toHaveLength(2);
    expect(differences([1], [1, 2])).toHaveLength(1);
    expect(differences('x', { a: 1 })).toHaveLength(1);
    expect(differences(null, 'x')).toHaveLength(1);
  });
});
