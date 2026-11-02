/**
 * Replays vectors/evidence.json, vectors/stage.json and vectors/log.json
 * against src/ through vectors/replay.mjs, the way scripts/mutate.mjs replays
 * them against each mutant. Plain ESM, as the replay is.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { differences, ENTRY, replay } from '../../vectors/replay.mjs';
import * as config from '../config.js';
import * as evidence from '../evidence/index.js';
import * as mastery from '../mastery/index.js';
import * as memory from '../memory/fsrs.js';
import * as practice from '../practice.js';
import * as migrate from '../schema/migrate.js';
import * as stage from '../stage/index.js';

const MODULES = {
  'config.ts': config,
  'evidence/index.ts': evidence,
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

describe('policy and log vectors', () => {
  for (const [file, least] of [
    ['evidence.json', 10],
    ['stage.json', 10],
    ['log.json', 10],
  ]) {
    it(`${file} replays with no difference`, () => {
      const loaded = corpus(file);
      expect(loaded.vectors.length).toBeGreaterThanOrEqual(least);
      expect(replay(impl, loaded)).toEqual([]);
    });
  }

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
