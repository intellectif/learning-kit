import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { steps } from '../../log/__tests__/arbitraries.js';
import { practice, run } from '../../log/__tests__/fixtures.js';
import { migrateState } from '../index.js';

const p = practice();
const RUNS = { numRuns: 200 };

function isDeepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

describe('migrateState properties', () => {
  it('property: random JSON into migrateState never throws, and an accepted value comes back equal and deep-frozen', () => {
    fc.assert(
      fc.property(fc.oneof(fc.jsonValue(), fc.anything()), (raw) => {
        const result = migrateState(raw);
        if (result.ok) {
          expect(result.state).toEqual(raw);
          expect(isDeepFrozen(result.state)).toBe(true);
        } else {
          expect(result.issues.length).toBeGreaterThan(0);
        }
      }),
      RUNS,
    );
  });

  it('property: random JSON into migrateState: a stored state with one field replaced is rejected or read, never thrown on', () => {
    fc.assert(
      fc.property(steps({ maxLength: 8 }), fc.jsonValue(), fc.nat(), (list, replacement, pick) => {
        const stored = JSON.parse(JSON.stringify(run(p, list).state));
        expect(migrateState(stored)).toMatchObject({ ok: true, migrated: false });
        const paths: (string | number)[][] = [];
        const walk = (value: unknown, path: (string | number)[]) => {
          paths.push(path);
          if (value !== null && typeof value === 'object') {
            for (const [key, child] of Object.entries(value))
              walk(child, [...path, Array.isArray(value) ? Number(key) : key]);
          }
        };
        walk(stored, []);
        const path = paths[pick % paths.length] as (string | number)[];
        if (path.length === 0) return;
        let parent = stored;
        for (const key of path.slice(0, -1)) parent = parent[key];
        parent[path[path.length - 1] as string | number] = replacement;
        const result = migrateState(stored);
        // (revised in M7) As stored JSON: the read writes -0 as 0 (canonical
        // JSON), and toEqual tells -0 from 0, so a -0 replacement failed here.
        if (result.ok) expect(result.state).toEqual(JSON.parse(JSON.stringify(stored)));
      }),
      RUNS,
    );
  });
});
