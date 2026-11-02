import { describe, expect, it } from 'vitest';
import { migrateState } from '../../schema/index.js';
import type { EvidenceMapper, ReviewLogEntry, SkillGraph, SkillStatesView } from '../../types.js';
import {
  applied,
  DAY,
  evidence,
  fail,
  GRAPH,
  host,
  human,
  item,
  lowAi,
  practice,
  run,
  T0,
} from './fixtures.js';

const p = practice();

/** `d` needs both `a` and `c` (hard); `b` needs `a` (soft); `p` is procedural and starts at `write`. */
const WIDE: SkillGraph = {
  version: 'w1',
  skills: [
    { id: 'a', knowledge: 'declarative', stages: ['recall'] },
    { id: 'b', knowledge: 'declarative' },
    { id: 'c', knowledge: 'declarative', stages: ['recall'] },
    { id: 'd', knowledge: 'declarative' },
    { id: 'p', knowledge: 'procedural', stages: ['write'] },
  ],
  edges: [
    { kind: 'prerequisite', from: 'a', to: 'd', strength: 'hard' },
    { kind: 'prerequisite', from: 'c', to: 'd', strength: 'hard' },
    { kind: 'prerequisite', from: 'a', to: 'b', strength: 'soft' },
  ],
};

describe('record and replay edges', () => {
  it('handles a task on two skills and unlocks a skill with two hard prerequisites', () => {
    const both = item('i1', 'a', 'recall', {
      skills: [
        { skillId: 'c', weight: 0.5 },
        { skillId: 'a', weight: 0.5 },
      ],
    });
    const { state, results } = run(
      p,
      [
        { host: host('h1', T0, { kind: 'place', skillId: 'c', stage: 'recall', credited: true }) },
        {
          host: host('h2', T0 + 1, {
            kind: 'place',
            skillId: 'a',
            stage: 'recall',
            credited: true,
          }),
        },
        { evidence: evidence('e1', 'i1', T0 + 2), item: both },
      ],
      WIDE,
    );
    expect(results[1]?.kind === 'applied' && results[1].events.map((event) => event.type)).toEqual([
      'skill.placed',
      'skill.unlocked',
    ]);
    expect(state.skills.d?.unlockedAt).toBe(T0 + 1);
    expect(results[2]?.kind).toBe('applied');
    expect(state.skills.a?.memories.recall?.reviews).toBe(1);
    expect(state.skills.c?.memories.recall?.reviews).toBe(1);
    expect(Object.keys(state.skills)).toEqual(['a', 'c', 'd']);
  });

  it('rejects a task skill with no stage at or below the task demand, at the item', () => {
    const task = item('i1', 'a', 'recall', {
      skills: [
        { skillId: 'a', weight: 0.5 },
        { skillId: 'p', weight: 0.5 },
      ],
    });
    const result = p.record(p.initState('l1', WIDE), {
      graph: WIDE,
      item: task,
      evidence: evidence('e1', 'i1', T0, fail, {
        skillOutcomes: [{ skillId: 'p', score: 1, maxScore: 1 }],
      }),
    });
    expect(result.kind === 'rejected' && result.issues[0]).toMatchObject({
      code: 'STAGE_NO_EQUIVALENT',
      path: ['item', 'skills', 1],
    });
  });

  it('counts a reused item once more and keeps its latest use', () => {
    const { state } = run(p, [
      { evidence: evidence('e1', 'i1', T0 + DAY), item: item('i1') },
      { evidence: evidence('e2', 'i1', T0 + 2 * DAY), item: item('i1') },
    ]);
    expect(state.items.i1).toEqual({ uses: 2, lastUsedAt: T0 + 2 * DAY });
  });

  it('demotes to a stage that never had a memory', () => {
    const { state } = run(p, [
      { host: host('h1', T0, { kind: 'place', skillId: 'a', stage: 'produce', credited: false }) },
      { evidence: evidence('e1', 'i1', T0 + 1, fail), item: item('i1', 'a', 'produce') },
      { evidence: evidence('e2', 'i2', T0 + 2, fail), item: item('i2', 'a', 'produce') },
    ]);
    expect(state.skills.a?.stage).toBe('recall');
    expect(state.skills.a?.memories.recall).toBeUndefined();
  });

  it('applies a confirmation with its own skill outcomes', () => {
    const held = applied(
      p.record(p.initState('l1', GRAPH), {
        graph: GRAPH,
        item: item('i1'),
        evidence: evidence('h1', 'i1', T0, lowAi),
      }),
    );
    const confirmed = applied(
      p.record(held.state, {
        graph: GRAPH,
        evidence: evidence('c1', 'i1', T0 + 1, human(true), {
          confirms: 'h1',
          skillOutcomes: [{ skillId: 'a', score: 0, maxScore: 1 }],
        }),
      }),
    );
    expect(confirmed.state.skills.a?.memories.recall?.lapses).toBe(1);
  });

  it('replays task snapshots with every optional field, and rejects a bad one', () => {
    const full = item('i1', 'a', 'recall', {
      fluentSeconds: 5,
      slowSeconds: 60,
      criteria: [{ name: 'x', skillId: 'a' }],
    });
    const recorded = run(p, [{ evidence: evidence('e1', 'i1', T0), item: full }]);
    const replayed = p.replay(recorded.entries, GRAPH, 'l1');
    expect(replayed.ok && replayed.state).toEqual(recorded.state);
    const entry = recorded.entries[0] as Extract<ReviewLogEntry, { kind: 'evidence' }>;
    const bad = { ...entry, task: { ...entry.task, stage: 'apply' } } as ReviewLogEntry;
    const result = p.replay([bad], GRAPH, 'l1');
    expect(result.ok === false && result.issues[0]?.path.slice(0, 3)).toEqual([
      'entries',
      0,
      'task',
    ]);
  });

  it('ignores a replayed discard of evidence that is not held', () => {
    const recorded = run(p, [{ evidence: evidence('e1', 'i1', T0), item: item('i1') }]);
    const discard: ReviewLogEntry = {
      schemaVersion: 1,
      seq: 1,
      at: T0 + 1,
      configHash: p.configHash,
      kind: 'host',
      id: 'd1',
      action: { kind: 'discard-held', evidenceId: 'e1' },
    };
    const replayed = p.replay([...recorded.entries, discard], GRAPH, 'l1');
    expect(replayed.ok && replayed.state.skills).toEqual(recorded.state.skills);
    expect(replayed.ok && replayed.events.map((event) => event.type)).not.toContain(
      'evidence.discarded',
    );
  });
});

describe('a custom evidence mapper', () => {
  const views: SkillStatesView[] = [];
  const mapper: EvidenceMapper = {
    id: 'test-mapper',
    version: 1,
    params: null,
    map(found, task, skills) {
      views.push(skills);
      if (found.source.kind === 'self') return { held: true, perSkill: [] };
      return {
        held: false,
        perSkill: task.skills.map((skill) => ({
          skillId: skill.skillId,
          rating: 'good',
          correct: 1,
          weight: 1,
          memory: 'review',
          reason: 'overall',
        })),
      };
    },
  };
  const custom = practice({ evidenceMapper: mapper });

  it('receives the current stages, and its held evidence is held as deferred', () => {
    const { state, results } = run(custom, [
      { evidence: evidence('e1', 'i1', T0), item: item('i1') },
      {
        evidence: evidence('s1', 'i2', T0 + 1, { kind: 'self', rating: 'easy' }),
        item: item('i2'),
      },
    ]);
    expect(views.at(-1)).toEqual({ a: { stage: 'recall' } });
    expect(results[1]?.kind === 'applied' && results[1].events).toEqual([
      { type: 'evidence.held', at: T0 + 1, evidenceId: 's1', reason: 'deferred' },
    ]);
    expect(state.held).toHaveLength(1);
  });
});

describe('migrateState edges', () => {
  it('rejects a value with no JSON form inside an opaque memory', () => {
    const recorded = run(p, [{ evidence: evidence('e1', 'i1', T0), item: item('i1') }]);
    const stored = JSON.parse(JSON.stringify(recorded.state));
    stored.skills.a.memories.recall.memory.extra = () => 0;
    const result = migrateState(stored);
    expect(result.ok).toBe(false);
  });
});
