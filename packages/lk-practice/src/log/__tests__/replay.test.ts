import { describe, expect, it } from 'vitest';
import type { ReplayResult, ReviewLogEntry } from '../../types.js';
import {
  DAY,
  evidence,
  fail,
  GRAPH,
  host,
  human,
  item,
  lowAi,
  masterA,
  practice,
  run,
  type Step,
  T0,
} from './fixtures.js';

const p = practice();
const codes = (result: ReplayResult) => (result.ok ? [] : result.issues.map((issue) => issue.code));
const ok = (result: ReplayResult) => {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
};

const steps: Step[] = [
  { evidence: evidence('e1', 'i1', T0), item: item('i1') },
  { evidence: evidence('h1', 'i2', T0 + DAY, lowAi), item: item('i2') },
  { evidence: evidence('e2', 'i3', T0 + 2 * DAY, fail), item: item('i3') },
  { host: host('p1', T0 + 3 * DAY, { kind: 'prior', skillId: 'c', theta: 0.5, pseudoCount: 2 }) },
  { evidence: evidence('e3', 'i4', T0 + 4 * DAY), item: item('i4', 'c') },
];

describe('replay', () => {
  it('rebuilds the recorded state, events included in order', () => {
    const recorded = run(p, steps);
    const replayed = ok(p.replay(recorded.entries, GRAPH, 'l1'));
    expect(replayed.state).toEqual(recorded.state);
    const recordedEvents = recorded.results.flatMap((result) =>
      result.kind === 'applied' ? result.events : [],
    );
    expect(replayed.events).toEqual(recordedEvents);
    expect(Object.isFrozen(replayed)).toBe(true);
  });

  it('accepts the entries in any array order', () => {
    const recorded = run(p, steps);
    const reversed = [...recorded.entries].reverse();
    expect(ok(p.replay(reversed, GRAPH, 'l1')).state).toEqual(recorded.state);
  });

  it('applies an entry that arrived late at its instant', () => {
    const late = run(p, [
      { evidence: evidence('e1', 'i1', T0 + DAY), item: item('i1') },
      { evidence: evidence('e0', 'i0', T0), item: item('i0') },
    ]);
    const inOrder = run(p, [
      { evidence: evidence('e0', 'i0', T0), item: item('i0') },
      { evidence: evidence('e1', 'i1', T0 + DAY), item: item('i1') },
    ]);
    expect(late.results[1]?.kind).toBe('replay-required');
    // Same skills; the log differs only in seq order, so the hash differs.
    expect(late.state.skills).toEqual(inOrder.state.skills);
    expect(late.state.log.hash).not.toBe(inOrder.state.log.hash);
  });

  it('confirms a held entry by look-ahead, at the held instant', () => {
    const held = run(p, [
      { evidence: evidence('h1', 'i1', T0, lowAi), item: item('i1') },
      { evidence: evidence('e2', 'i2', T0 + DAY), item: item('i2', 'c') },
      { evidence: evidence('c1', 'i1', T0 + 2 * DAY, human(false), { confirms: 'h1' }) },
    ]);
    expect(held.results[2]).toMatchObject({ kind: 'replay-required', replayFrom: T0 });
    expect(held.state.held).toEqual([]);
    expect(held.state.skills.a).toMatchObject({ startedAt: T0, lastLapseAt: T0 });
  });

  it('leaves a held entry held when a discard comes before its confirmation', () => {
    const { entries } = run(p, [
      { evidence: evidence('h1', 'i1', T0, lowAi), item: item('i1') },
      { host: host('d1', T0 + 1, { kind: 'discard-held', evidenceId: 'h1' }) },
    ]);
    const confirmation: ReviewLogEntry = {
      schemaVersion: 1,
      seq: 2,
      at: T0 + 2,
      configHash: p.configHash,
      kind: 'evidence',
      evidence: evidence('c1', 'i1', T0 + 2, human(true), { confirms: 'h1' }),
    };
    const replayed = ok(p.replay([...entries, confirmation], GRAPH, 'l1'));
    expect(replayed.state.held).toEqual([]);
    expect(replayed.state.skills).toEqual({});
    expect(replayed.events.map((event) => event.type)).toEqual([
      'evidence.held',
      'evidence.discarded',
    ]);
  });

  it('uses only the first confirmation of a held entry', () => {
    const { entries, state } = run(p, [
      { evidence: evidence('h1', 'i1', T0, lowAi), item: item('i1') },
      { evidence: evidence('c1', 'i1', T0 + 1, human(true), { confirms: 'h1' }) },
    ]);
    const second: ReviewLogEntry = {
      schemaVersion: 1,
      seq: 2,
      at: T0 + 2,
      configHash: p.configHash,
      kind: 'evidence',
      evidence: evidence('c2', 'i1', T0 + 2, human(false), { confirms: 'h1' }),
    };
    const replayed = ok(p.replay([...entries, second], GRAPH, 'l1'));
    expect(replayed.state.skills).toEqual(state.skills);
    expect(replayed.state.log.length).toBe(3);
  });

  it('recomputes under the current configuration', () => {
    const { entries } = run(p, steps);
    const other = practice({ leechThreshold: 3 });
    const replayed = ok(other.replay(entries, GRAPH, 'l1'));
    expect(replayed.state.configHash).toBe(other.configHash);
  });

  it('rejects bad input: shape, graph, learner, ids, seq and rules', () => {
    const { entries } = run(p, steps);
    expect(codes(p.replay('x' as never, GRAPH, 'l1'))).toEqual(['SHAPE_INVALID']);
    expect(codes(p.replay(entries, GRAPH, ''))).toEqual(['SHAPE_INVALID']);
    expect(codes(p.replay(entries, null as never, 'l1'))).toEqual(['SHAPE_INVALID']);
    expect(codes(p.replay([{ ...entries[0], seq: -1 } as never], GRAPH, 'l1'))).toEqual([
      'SHAPE_INVALID',
    ]);
    const cyclic = {
      ...GRAPH,
      edges: [
        ...GRAPH.edges,
        { kind: 'prerequisite' as const, from: 'b', to: 'a', strength: 'hard' as const },
      ],
    };
    const graphResult = p.replay(entries, cyclic, 'l1');
    expect(graphResult.ok === false && graphResult.issues[0]?.path[0]).toBe('graph');
    const duplicate = { ...(entries[0] as ReviewLogEntry), seq: entries.length };
    expect(codes(p.replay([...entries, duplicate], GRAPH, 'l1'))).toEqual(['ID_DUPLICATE']);
    expect(codes(p.replay(entries.slice(1), GRAPH, 'l1'))).toContain('LOG_SEQ_INVALID');
    const hostDup = { ...(entries[3] as ReviewLogEntry), seq: entries.length };
    const hostResult = p.replay([...entries, hostDup], GRAPH, 'l1');
    expect(hostResult.ok === false && hostResult.issues[0]?.path).toEqual(['entries', 5, 'id']);
    const smaller = {
      ...GRAPH,
      skills: GRAPH.skills.filter((skill) => skill.id !== 'c'),
      version: 'g1',
    };
    expect(codes(p.replay(entries, smaller, 'l1'))).toEqual(['SKILL_UNKNOWN', 'SKILL_UNKNOWN']);
  });

  it('rejects confirmations with no earlier target, or that do not fit it', () => {
    const lone: ReviewLogEntry = {
      schemaVersion: 1,
      seq: 0,
      at: T0,
      configHash: p.configHash,
      kind: 'evidence',
      evidence: evidence('c1', 'i1', T0, human(true), { confirms: 'h1' }),
    };
    expect(codes(p.replay([lone], GRAPH, 'l1'))).toEqual(['HELD_UNKNOWN']);
    const { entries } = run(p, [{ evidence: evidence('h1', 'i1', T0, lowAi), item: item('i1') }]);
    const wrong = { ...lone, seq: 1, evidence: { ...lone.evidence, itemId: 'i9' } };
    expect(codes(p.replay([...entries, wrong], GRAPH, 'l1'))).toEqual(['CONFIRMATION_INVALID']);
  });
});

describe('replayFrom', () => {
  it('continues from any checkpoint to the same state', () => {
    const recorded = run(p, steps);
    for (let cut = 0; cut <= recorded.entries.length; cut += 1) {
      const checkpoint = ok(p.replay(recorded.entries.slice(0, cut), GRAPH, 'l1')).state;
      const resumed = ok(p.replayFrom(checkpoint, recorded.entries, GRAPH));
      expect(resumed.state).toEqual(recorded.state);
      const tail = ok(p.replayFrom(checkpoint, recorded.entries.slice(cut), GRAPH));
      expect(tail.state).toEqual(recorded.state);
    }
  });

  it("confirms the checkpoint's newest held entry", () => {
    const recorded = run(p, [
      { evidence: evidence('e1', 'i1', T0), item: item('i1') },
      { evidence: evidence('h1', 'i2', T0 + DAY, lowAi), item: item('i2') },
      { evidence: evidence('c1', 'i2', T0 + 2 * DAY, human(true), { confirms: 'h1' }) },
    ]);
    const checkpoint = ok(p.replay(recorded.entries.slice(0, 2), GRAPH, 'l1')).state;
    expect(ok(p.replayFrom(checkpoint, recorded.entries, GRAPH)).state).toEqual(recorded.state);
  });

  it('needs an earlier checkpoint for an older held entry or an earlier entry', () => {
    const recorded = run(p, [
      { evidence: evidence('h1', 'i1', T0, lowAi), item: item('i1') },
      { evidence: evidence('e2', 'i2', T0 + DAY), item: item('i2', 'c') },
      { evidence: evidence('c1', 'i1', T0 + 2 * DAY, human(true), { confirms: 'h1' }) },
    ]);
    const checkpoint = ok(p.replay(recorded.entries.slice(0, 2), GRAPH, 'l1')).state;
    const old = p.replayFrom(checkpoint, recorded.entries, GRAPH);
    expect(old.ok === false && old.issues[0]).toMatchObject({
      code: 'REPLAY_CHECKPOINT_TOO_NEW',
      path: ['checkpoint', 'held'],
    });
    const early: ReviewLogEntry = {
      schemaVersion: 1,
      seq: 2,
      at: T0,
      configHash: p.configHash,
      kind: 'evidence',
      evidence: evidence('e0', 'i2', T0),
      task: (recorded.entries[1] as Extract<ReviewLogEntry, { kind: 'evidence' }>).task as never,
    };
    const result = p.replayFrom(checkpoint, [early], GRAPH);
    expect(result.ok === false && result.issues[0]).toMatchObject({
      code: 'REPLAY_CHECKPOINT_TOO_NEW',
      path: ['entries', 0, 'at'],
    });
  });

  it('rejects a checkpoint from another configuration or graph version', () => {
    const { state } = masterA(p);
    expect(codes(practice({ leechThreshold: 3 }).replayFrom(state, [], GRAPH))).toEqual([
      'STATE_CONFIG_MISMATCH',
    ]);
    const moved = p.replayFrom(state, [], { ...GRAPH, version: 'g2' });
    expect(moved.ok === false && moved.issues[0]).toMatchObject({
      code: 'GRAPH_VERSION_MISMATCH',
      path: ['checkpoint', 'graphVersion'],
    });
  });
});
