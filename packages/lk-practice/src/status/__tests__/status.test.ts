import { describe, expect, it } from 'vitest';
import { PracticeConfigError } from '../../errors.js';
import {
  DAY,
  evidence,
  GRAPH,
  host,
  item,
  lowAi,
  masterA,
  practice,
  run,
  T0,
} from '../../log/__tests__/fixtures.js';

const p = practice();

describe('status', () => {
  it('reports every graph skill in graph order, with counts', () => {
    const empty = p.initState('l1', GRAPH);
    const status = p.status(empty, GRAPH, T0);
    expect(status.skills.map((skill) => [skill.skillId, skill.status, skill.stage])).toEqual([
      ['a', 'ready', null],
      ['b', 'locked', null],
      ['c', 'ready', null],
    ]);
    expect(status.counts).toEqual({
      locked: 1,
      ready: 2,
      learning: 0,
      reviewing: 0,
      mastered: 0,
      credited: 0,
      suspended: 0,
    });
    expect(status).toMatchObject({ at: T0, dueNow: 0, held: [] });
    expect(Object.isFrozen(status.skills[0])).toBe(true);
  });

  it('reads due, retrievability, ability and lapses from the current stage', () => {
    const { state } = run(p, [{ evidence: evidence('e1', 'i1', T0), item: item('i1') }]);
    const memory = state.skills.a?.memories.recall;
    const now = (memory?.due as number) + 1;
    const [a] = p.status(state, GRAPH, now).skills;
    expect(a).toMatchObject({ status: 'learning', stage: 'recall', due: memory?.due, lapses: 0 });
    expect(a?.retrievability).toBeGreaterThan(0);
    expect(a?.retrievability).toBeLessThan(1);
    expect(a?.ability?.evidenceCount).toBe(1);
    expect(a?.expectedSuccessAtReference).toBeGreaterThan(0);
    expect(p.status(state, GRAPH, now).dueNow).toBe(1);
    expect(p.status(state, GRAPH, T0).dueNow).toBe(0);
  });

  it('gives null memory fields for a skill placed but not yet reviewed', () => {
    const { state } = run(p, [
      { host: host('h1', T0, { kind: 'place', skillId: 'c', stage: 'recall', credited: false }) },
    ]);
    const c = p.status(state, GRAPH, T0).skills[2];
    expect(c).toMatchObject({ status: 'learning', due: null, retrievability: null, lapses: 0 });
  });

  it('does not count a suspended skill as due, and lists held evidence with its age', () => {
    const { state } = run(p, [
      { evidence: evidence('e1', 'i1', T0), item: item('i1') },
      { host: host('s1', T0 + 1, { kind: 'suspend', skillId: 'a' }) },
      { evidence: evidence('h1', 'i2', T0 + 2, lowAi), item: item('i2') },
    ]);
    const status = p.status(state, GRAPH, T0 + 100 * DAY);
    expect(status.dueNow).toBe(0);
    expect(status.skills[0]?.status).toBe('suspended');
    expect(status.held).toEqual([
      { evidenceId: 'h1', itemId: 'i2', at: T0 + 2, ageMs: 100 * DAY - 2 },
    ]);
    expect(p.status(state, GRAPH, T0).held[0]?.ageMs).toBe(0);
  });

  it('shows mastered, then masteryLapsed once decay breaks the predicate', () => {
    const { state } = masterA(p);
    const at = state.log.lastAt as number;
    expect(p.status(state, GRAPH, at).skills[0]).toMatchObject({
      status: 'mastered',
      masteryLapsed: false,
    });
    expect(p.status(state, GRAPH, at + 10_000 * DAY).skills[0]?.masteryLapsed).toBe(true);
    expect(p.status(state, GRAPH, at).skills[1]?.status).toBe('ready');
  });

  it('treats a stage no longer on the ladder like no state', () => {
    const { state } = run(p, [{ evidence: evidence('e1', 'i1', T0), item: item('i1') }]);
    const moved = {
      ...GRAPH,
      skills: GRAPH.skills.map((skill) =>
        skill.id === 'a' ? { ...skill, stages: ['produce', 'apply'] } : skill,
      ),
    };
    expect(p.status(state, moved, T0).skills[0]).toMatchObject({
      stage: 'recall',
      due: null,
      ability: null,
    });
  });

  it('throws on a bad instant or a mismatched state', () => {
    const state = p.initState('l1', GRAPH);
    expect(() => p.status(state, GRAPH, 1.5)).toThrow(RangeError);
    expect(() => p.status(state, { ...GRAPH, version: 'g2' }, T0)).toThrow(PracticeConfigError);
  });
});

describe('reconcile', () => {
  it('lists orphaned and new skills and memories for stages a ladder dropped', () => {
    const { state } = run(p, [
      { evidence: evidence('e1', 'i1', T0), item: item('i1') },
      { evidence: evidence('e2', 'i2', T0 + 1), item: item('i2', 'c') },
    ]);
    const next = {
      version: 'g2',
      skills: [
        { id: 'a', knowledge: 'declarative' as const, stages: ['produce'] },
        { id: 'b', knowledge: 'declarative' as const },
        { id: 'd', knowledge: 'declarative' as const },
      ],
      edges: [],
    };
    expect(p.reconcile(state, next)).toEqual({
      stateGraphVersion: 'g1',
      graphVersion: 'g2',
      orphanedSkills: ['c'],
      newSkills: ['b', 'd'],
      missingStages: [{ skillId: 'a', stage: 'recall' }],
    });
    expect(p.reconcile(state, GRAPH)).toMatchObject({ orphanedSkills: [], missingStages: [] });
  });
});
