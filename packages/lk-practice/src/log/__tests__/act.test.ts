import { describe, expect, it } from 'vitest';
import type { HostAction, PracticeState } from '../../types.js';
import {
  applied,
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
} from './fixtures.js';

const p = practice();
const empty = (): PracticeState => p.initState('l1', GRAPH);
const act = (state: PracticeState, action: HostAction, at = T0, id = 'h') =>
  p.act(state, GRAPH, host(id, at, action));
const codes = (result: ReturnType<typeof p.act>) =>
  result.kind === 'rejected' ? result.issues.map((issue) => issue.code) : [result.kind];

describe('act', () => {
  it('appends a host entry and counts its id like an evidence id', () => {
    const result = applied(act(empty(), { kind: 'suspend', skillId: 'a' }));
    expect(result.appended).toEqual([
      {
        schemaVersion: 1,
        seq: 0,
        at: T0,
        configHash: p.configHash,
        kind: 'host',
        id: 'h',
        action: { kind: 'suspend', skillId: 'a' },
      },
    ]);
    expect(result.state.recentIds).toEqual(['h']);
    expect(result.state.items).toEqual({});
    expect(codes(act(result.state, { kind: 'unsuspend', skillId: 'a' }, T0 + 1))).toEqual([
      'duplicate',
    ]);
  });

  it('suspends and unsuspends, and a suspended skill is not reviewed', () => {
    const { state } = run(p, [
      { host: host('h1', T0, { kind: 'suspend', skillId: 'a' }) },
      { evidence: evidence('e1', 'i1', T0 + 1), item: item('i1') },
    ]);
    expect(state.skills.a).toMatchObject({ suspended: 'host', memories: {}, evidenceCount: 1 });
    const back = applied(act(state, { kind: 'unsuspend', skillId: 'a' }, T0 + 2, 'h2'));
    expect(back.state.skills.a?.suspended).toBeNull();
    expect(back.events).toEqual([{ type: 'skill.unsuspended', at: T0 + 2, skillId: 'a' }]);
  });

  it('unsuspend on a skill with no record changes nothing but still reports', () => {
    const result = applied(act(empty(), { kind: 'unsuspend', skillId: 'c' }));
    expect(result.state.skills).toEqual({});
    expect(result.events.map((event) => event.type)).toEqual(['skill.unsuspended']);
  });

  it('places a skill, starting it unless credited; credit unlocks hard dependents', () => {
    const placed = applied(
      act(empty(), { kind: 'place', skillId: 'a', stage: 'produce', credited: false }),
    );
    expect(placed.state.skills.a).toMatchObject({
      stage: 'produce',
      credited: false,
      startedAt: T0,
    });
    expect(placed.events.map((event) => event.type)).toEqual(['skill.placed', 'skill.started']);
    const credited = applied(
      act(empty(), { kind: 'place', skillId: 'a', stage: 'produce', credited: true }),
    );
    expect(credited.state.skills.a).toMatchObject({ credited: true, startedAt: null });
    expect(credited.events.map((event) => event.type)).toEqual(['skill.placed', 'skill.unlocked']);
    expect(credited.state.skills.b?.unlockedAt).toBe(T0);
  });

  it('sets a prior at the current stage or a named one', () => {
    const current = applied(
      act(empty(), { kind: 'prior', skillId: 'a', theta: 1, pseudoCount: 4 }),
    );
    expect(current.state.skills.a?.ability.recall).toEqual({ theta: 1, n: 4 });
    expect(current.events[0]).toEqual({
      type: 'skill.prior-set',
      at: T0,
      skillId: 'a',
      stage: 'recall',
      theta: 1,
      pseudoCount: 4,
    });
    const named = applied(
      act(empty(), { kind: 'prior', skillId: 'a', theta: 2, pseudoCount: 1, stage: 'produce' }),
    );
    expect(Object.keys(named.state.skills.a?.ability ?? {})).toContain('produce');
  });

  it('discards a held record, and ignores an unknown one in a replayed log', () => {
    const held = applied(
      p.record(empty(), {
        graph: GRAPH,
        item: item('i1'),
        evidence: evidence('x', 'i1', T0, lowAi),
      }),
    );
    const discarded = applied(act(held.state, { kind: 'discard-held', evidenceId: 'x' }, T0 + 1));
    expect(discarded.state.held).toEqual([]);
    expect(discarded.events).toEqual([{ type: 'evidence.discarded', at: T0 + 1, heldId: 'x' }]);
    expect(codes(act(empty(), { kind: 'discard-held', evidenceId: 'x' }))).toEqual([
      'HELD_UNKNOWN',
    ]);
  });

  it('resets a skill: a mastered skill loses its flag and record, a dependent keeps its unlock', () => {
    const mastered = masterA(p);
    const at = (mastered.state.log.lastAt as number) + DAY;
    const resetA = applied(act(mastered.state, { kind: 'reset-skill', skillId: 'a' }, at, 'r1'));
    expect(resetA.events).toEqual([
      expect.objectContaining({ type: 'skill.mastery-lost', skillId: 'a' }),
    ]);
    expect(resetA.state.skills.a).toBeUndefined();
    expect(resetA.state.skills.b?.unlockedAt).not.toBeNull();

    const started = applied(
      p.record(resetA.state, {
        graph: GRAPH,
        item: item('ib', 'b'),
        evidence: evidence('eb', 'ib', at + 1),
      }),
    );
    const resetB = applied(act(started.state, { kind: 'reset-skill', skillId: 'b' }, at + 2, 'r2'));
    expect(resetB.state.skills.b).toMatchObject({
      unlockedAt: started.state.skills.b?.unlockedAt,
      startedAt: null,
      memories: {},
      evidenceCount: 0,
    });
    // Resetting a skill without a record adds none.
    expect(applied(act(empty(), { kind: 'reset-skill', skillId: 'c' })).state.skills).toEqual({});
  });

  it('rejects unknown skills, missing ladders and stages off the ladder', () => {
    expect(codes(act(empty(), { kind: 'suspend', skillId: 'zz' }))).toEqual(['SKILL_UNKNOWN']);
    expect(
      codes(act(empty(), { kind: 'place', skillId: 'a', stage: 'apply', credited: false })),
    ).toEqual(['STAGE_NOT_IN_LADDER']);
    expect(
      codes(
        act(empty(), { kind: 'prior', skillId: 'a', theta: 0, pseudoCount: 1, stage: 'apply' }),
      ),
    ).toEqual(['STAGE_NOT_IN_LADDER']);
    // A mixed skill without stages has no ladder; record and act check only the version.
    const mixed = { ...GRAPH, skills: [...GRAPH.skills, { id: 'm', knowledge: 'mixed' as const }] };
    const state = p.initState('l1', mixed);
    expect(codes(p.act(state, mixed, host('h', T0, { kind: 'suspend', skillId: 'm' })))).toEqual([
      'LADDER_INVALID',
    ]);
  });

  it('rejects a malformed input, a mismatched state, and asks for a replay when late', () => {
    expect(
      codes(p.act(empty(), GRAPH, { id: '', at: T0, action: { kind: 'suspend', skillId: 'a' } })),
    ).toEqual(['SHAPE_INVALID']);
    expect(
      codes(
        p.act(
          empty(),
          { ...GRAPH, version: 'g2' },
          host('h', T0, { kind: 'suspend', skillId: 'a' }),
        ),
      ),
    ).toEqual(['GRAPH_VERSION_MISMATCH']);
    const first = applied(act(empty(), { kind: 'suspend', skillId: 'a' }, T0, 'h1'));
    const late = act(first.state, { kind: 'unsuspend', skillId: 'a' }, T0 - 1, 'h2');
    expect(late).toMatchObject({ kind: 'replay-required', replayFrom: T0 - 1 });
  });
});
