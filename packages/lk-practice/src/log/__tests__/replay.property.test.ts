import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../../determinism/freeze.js';
import type { PracticeState, ReplayResult, ReviewLogEntry } from '../../types.js';
import { shuffled, steps } from './arbitraries.js';
import { GRAPH, practice, run, type Step } from './fixtures.js';

const p = practice({ leechThreshold: 3, itemUsageRetentionMs: 5 * 86_400_000, recentIdWindow: 8 });
const RUNS = { numRuns: 120 };

function state(result: ReplayResult): PracticeState {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.state;
}

/** The parts of a state that do not depend on the arrival order. */
function timeline(s: PracticeState) {
  return {
    skills: s.skills,
    items: s.items,
    held: s.held.map(({ seq: _seq, ...rest }) => rest),
    length: s.log.length,
    lastAt: s.log.lastAt,
  };
}

function byInstant(list: readonly Step[]): Step[] {
  const at = (step: Step) => ('host' in step ? step.host.at : step.evidence.at);
  return [...list].sort((a, b) => at(a) - at(b));
}

describe('log properties', () => {
  it('property: replay == record (the replay of the recorded log equals the recorded state)', () => {
    fc.assert(
      fc.property(steps({ late: true }), (list) => {
        const recorded = run(p, list);
        const replayed = state(p.replay(recorded.entries, GRAPH, 'l1'));
        expect(replayed).toEqual(recorded.state);
      }),
      RUNS,
    );
  });

  it('property: any checkpoint (replayFrom any prefix state gives the full replay, or asks for an earlier checkpoint)', () => {
    fc.assert(
      fc.property(steps({ late: true }), fc.nat(), (list, cutSeed) => {
        const { entries } = run(p, list);
        const full = state(p.replay(entries, GRAPH, 'l1'));
        const cut = cutSeed % (entries.length + 1);
        const checkpoint = state(
          p.replay(
            entries.filter((entry) => entry.seq < cut),
            GRAPH,
            'l1',
          ),
        );
        const resumed = p.replayFrom(checkpoint, entries, GRAPH);
        if (resumed.ok) {
          expect(resumed.state).toEqual(full);
        } else {
          expect(cut).toBeGreaterThan(0);
          expect(new Set(resumed.issues.map((issue) => issue.code))).toEqual(
            new Set(['REPLAY_CHECKPOINT_TOO_NEW']),
          );
        }
      }),
      RUNS,
    );
  });

  it('property: any checkpoint of an in-order log resumes without a replay request', () => {
    fc.assert(
      fc.property(steps({ independent: true }), fc.nat(), (list, cutSeed) => {
        const { entries, state: recorded } = run(p, list);
        const cut = cutSeed % (entries.length + 1);
        const checkpoint = state(p.replay(entries.slice(0, cut), GRAPH, 'l1'));
        expect(state(p.replayFrom(checkpoint, entries.slice(cut), GRAPH))).toEqual(recorded);
      }),
      RUNS,
    );
  });

  it('property: any arrival order (late arrivals end at the in-order timeline; any array order replays the same)', () => {
    fc.assert(
      fc.property(
        steps({ independent: true, distinct: true, maxLength: 15 }).chain((list) =>
          fc.tuple(
            fc.constant(list),
            fc.shuffledSubarray(list, { minLength: list.length, maxLength: list.length }),
          ),
        ),
        ([list, arrival]) => {
          const inOrder = run(p, byInstant(list));
          const arrived = run(p, arrival);
          expect(timeline(arrived.state)).toEqual(timeline(inOrder.state));
          const array = fc.sample(shuffled(arrived.entries), {
            numRuns: 1,
            seed: arrival.length,
          })[0] as ReviewLogEntry[];
          expect(state(p.replay(array, GRAPH, 'l1'))).toEqual(arrived.state);
        },
      ),
      RUNS,
    );
  });

  it('property: deep-frozen inputs (frozen inputs give the same results and nothing is mutated)', () => {
    fc.assert(
      fc.property(steps({ late: true, maxLength: 15 }), (list) => {
        const copy = structuredClone(list);
        const plain = run(p, list);
        const frozenGraph = deepFreeze(structuredClone(GRAPH));
        const frozen = run(
          practice({ leechThreshold: 3, itemUsageRetentionMs: 5 * 86_400_000, recentIdWindow: 8 }),
          deepFreeze(structuredClone(list)),
          frozenGraph,
        );
        expect(frozen.state).toEqual(plain.state);
        expect(frozen.entries).toEqual(plain.entries);
        const replayed = p.replay(deepFreeze(structuredClone(plain.entries)), frozenGraph, 'l1');
        expect(state(replayed)).toEqual(plain.state);
        expect(list).toEqual(copy);
      }),
      RUNS,
    );
  });
});
