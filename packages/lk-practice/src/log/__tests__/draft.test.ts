import { describe, expect, it } from 'vitest';
import type { PracticeState, SkillGraph } from '../../types.js';
import { applied, DAY, evidence, GRAPH, item, practice, run, T0 } from './fixtures.js';

const p = practice();

describe("a state's records (revised in M8)", () => {
  it('keep their keys in order whatever order the skills and items arrive in', () => {
    const { state } = run(p, [
      { evidence: evidence('e1', 'i3', T0), item: item('i3', 'c') },
      { evidence: evidence('e2', 'i1', T0 + DAY), item: item('i1', 'a') },
      { evidence: evidence('e3', 'i2', T0 + 2 * DAY), item: item('i2', 'c') },
    ]);
    expect(Object.keys(state.skills)).toEqual(['a', 'c']);
    expect(Object.keys(state.items)).toEqual(['i1', 'i2', 'i3']);
    expect(Object.isFrozen(state.skills) && Object.isFrozen(state.items)).toBe(true);
  });

  it('sort every key of a stored state whose keys are out of order', () => {
    const { state } = run(p, [
      { evidence: evidence('e1', 'i1', T0), item: item('i1', 'a') },
      { evidence: evidence('e2', 'i2', T0 + DAY), item: item('i2', 'c') },
    ]);
    const reversed = (record: Readonly<Record<string, unknown>>) =>
      Object.fromEntries(Object.entries(record).reverse());
    const stored = { ...state, skills: reversed(state.skills), items: reversed(state.items) };
    expect(Object.keys(stored.skills)).toEqual(['c', 'a']);
    const next = applied(
      p.record(stored as PracticeState, {
        graph: GRAPH,
        evidence: evidence('e3', 'i0', T0 + 2 * DAY),
        item: item('i0', 'b'),
      }),
    );
    expect(Object.keys(next.state.skills)).toEqual(['a', 'b', 'c']);
    expect(Object.keys(next.state.items)).toEqual(['i0', 'i1', 'i2']);
  });

  it('hold a skill or item named __proto__ as an own key, not a prototype', () => {
    const graph: SkillGraph = {
      version: 'proto',
      skills: [{ id: '__proto__', knowledge: 'declarative' }],
      edges: [],
    };
    const { state, entries } = run(
      p,
      [
        {
          evidence: evidence('e1', '__proto__', T0),
          item: item('__proto__', '__proto__', 'recognise'),
        },
      ],
      graph,
    );
    expect(Object.keys(state.skills)).toEqual(['__proto__']);
    expect(Object.keys(state.items)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(state.skills)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(state.items)).toBe(Object.prototype);
    const replayed = p.replay(entries, graph, 'l1');
    expect(replayed.ok && replayed.state).toEqual(state);
  });
});
