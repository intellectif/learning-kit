/**
 * The defensive guards of the transition, reached by calling it directly
 * with entries that the public validation would reject first.
 */
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../config.js';
import type { ReviewLogEntry, SkillGraph, TaskSnapshot } from '../../types.js';
import { type ApplyContext, applyConfirmed, applyEntry } from '../apply.js';
import { createEngine, indexGraph } from '../context.js';
import { compareKeys, Draft } from '../draft.js';
import { applied, DAY, evidence, GRAPH, host, item, practice, run, T0 } from './fixtures.js';

const p = practice();
const MIXED: SkillGraph = {
  ...GRAPH,
  skills: [...GRAPH.skills, { id: 'm', knowledge: 'mixed' }],
};

function context(graph: SkillGraph): ApplyContext {
  const resolved = resolveConfig({});
  if (!resolved.ok) throw new Error('config');
  const engine = createEngine({}, resolved.value);
  return { engine, graph: indexGraph(graph, engine) };
}

const task = (skillId: string, stage: string): TaskSnapshot => ({
  itemId: 'i1',
  skills: [{ skillId, weight: 1 }],
  stage,
  difficulty: 0,
  origin: 'authored',
});

function base(seq: number, at: number) {
  return { schemaVersion: 1 as const, seq, at, configHash: p.configHash };
}

describe('transition guards', () => {
  it('leaves skills alone for an unknown skill, a skill without a ladder, or a stage without an equivalent', () => {
    const ctx = context(MIXED);
    const draft = new Draft(p.initState('l1', MIXED));
    const entries: ReviewLogEntry[] = [
      {
        ...base(0, T0),
        kind: 'evidence',
        evidence: evidence('e0', 'i1', T0),
        task: task('zz', 'recall'),
      },
      {
        ...base(1, T0),
        kind: 'evidence',
        evidence: evidence('e1', 'i1', T0),
        task: task('m', 'recall'),
      },
      {
        ...base(2, T0),
        kind: 'evidence',
        evidence: evidence('e2', 'i1', T0),
        task: task('a', 'recognise'),
      },
      { ...base(3, T0), kind: 'host', id: 'h3', action: { kind: 'suspend', skillId: 'zz' } },
      { ...base(4, T0), kind: 'host', id: 'h4', action: { kind: 'suspend', skillId: 'm' } },
    ];
    for (const entry of entries) expect(applyEntry(draft, entry, ctx)).toBe(false);
    applyConfirmed(draft, 'not-held', evidence('c', 'i1', T0), ctx);
    draft.deleteSkill('zz');
    const state = draft.finish();
    expect(state.skills).toEqual({});
    expect(state.log.length).toBe(5);
    expect(state.recentIds).toEqual(['e0', 'e1', 'e2', 'h3', 'h4']);
  });

  it('answers null for the ladder of an unknown skill and gives a no-ladder skill an empty one', () => {
    const { graph } = context(MIXED);
    expect(graph.ladder('zz')).toBeNull();
    expect(graph.ladder('m')).toBeNull();
    expect(graph.mastery('m').ladder).toEqual([]);
  });

  it('keeps the pruning bound when usage arrives older than the oldest kept', () => {
    const draft = new Draft(p.initState('l1', GRAPH));
    draft.use('new', T0 + 2 * DAY, T0 + 2 * DAY, 10 * DAY);
    draft.use('old', T0, T0 + 2 * DAY, 10 * DAY);
    draft.use('x', T0 + 11 * DAY, T0 + 11 * DAY, 10 * DAY);
    expect(Object.keys(draft.finish().items)).toEqual(['new', 'x']);
  });

  it('orders keys by code unit', () => {
    expect([compareKeys('a', 'b'), compareKeys('b', 'a'), compareKeys('a', 'a')]).toEqual([
      -1, 1, 0,
    ]);
  });
});

describe('graph shapes', () => {
  it('unlocks two hard dependents of one skill in graph order', () => {
    const graph: SkillGraph = {
      version: 'f1',
      skills: [
        { id: 'a', knowledge: 'declarative', stages: ['recall'] },
        { id: 'y', knowledge: 'declarative', stages: ['recall'] },
        { id: 'x', knowledge: 'declarative', stages: ['recall'] },
      ],
      edges: [
        { kind: 'prerequisite', from: 'a', to: 'x', strength: 'hard' },
        { kind: 'prerequisite', from: 'a', to: 'y', strength: 'hard' },
      ],
    };
    const state = p.initState('l1', graph);
    const placed = applied(
      p.act(
        state,
        graph,
        host('h', T0, { kind: 'place', skillId: 'a', stage: 'recall', credited: true }),
      ),
    );
    expect(
      placed.events
        .filter((event) => event.type === 'skill.unlocked')
        .map((event) => event.skillId),
    ).toEqual(['y', 'x']);
  });

  it('summarises and reconciles a skill without a ladder', () => {
    const state = p.initState('l1', MIXED);
    const summary = p.status(state, MIXED, T0);
    expect(summary.skills.find((skill) => skill.skillId === 'm')).toMatchObject({ stage: null });
    const { state: stored } = run(p, [{ evidence: evidence('e', 'i1', T0), item: item('i1') }]);
    const withM = {
      ...stored,
      graphVersion: MIXED.version,
      skills: { ...stored.skills, m: stored.skills.a },
    } as typeof stored;
    expect(p.reconcile(withM, MIXED).missingStages).toEqual([{ skillId: 'm', stage: 'recall' }]);
  });
});
