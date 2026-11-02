import { describe, expect, it } from 'vitest';
import { EMPTY_LOG_HASH } from '../../determinism/keys.js';
import { PracticeConfigError } from '../../errors.js';
import type { PracticeState, SkillGraph } from '../../types.js';
import {
  applied,
  DAY,
  evidence,
  fail,
  GRAPH,
  human,
  item,
  lowAi,
  masterA,
  practice,
  run,
  T0,
} from './fixtures.js';

const p = practice();
const empty = (): PracticeState => p.initState('l1', GRAPH);

function issueCodes(result: ReturnType<typeof p.record>): string[] {
  return result.kind === 'rejected' ? result.issues.map((issue) => issue.code) : [result.kind];
}

describe('createPractice', () => {
  it('binds a resolved, hashed configuration and builds an empty state', () => {
    expect(p.configHash).toMatch(/^[0-9a-f]{16}$/);
    expect(Object.isFrozen(p)).toBe(true);
    expect(empty()).toEqual({
      schemaVersion: 1,
      learnerId: 'l1',
      graphVersion: 'g1',
      configHash: p.configHash,
      log: { length: 0, lastAt: null, hash: EMPTY_LOG_HASH },
      skills: {},
      items: {},
      held: [],
      recentIds: [],
    });
  });

  it('throws PracticeConfigError for an invalid configuration', () => {
    expect(() => practice({ leechThreshold: 0 })).toThrow(PracticeConfigError);
  });

  it('rejects a bad learner id or graph in initState', () => {
    expect(() => p.initState('', GRAPH)).toThrow(TypeError);
    expect(() => p.initState('l', {} as SkillGraph)).toThrow(TypeError);
  });
});

describe('record', () => {
  it('applies evidence: log header, usage, ids, skill state, events and the entry', () => {
    const result = applied(
      p.record(empty(), { graph: GRAPH, item: item('i1'), evidence: evidence('e1', 'i1', T0) }),
    );
    const { state, appended, events } = result;
    expect(state.log).toEqual({ length: 1, lastAt: T0, hash: expect.any(String) });
    expect(state.log.hash).not.toBe(EMPTY_LOG_HASH);
    expect(state.items).toEqual({ i1: { uses: 1, lastUsedAt: T0 } });
    expect(state.recentIds).toEqual(['e1']);
    expect(state.skills.a?.startedAt).toBe(T0);
    expect(state.skills.a?.evidenceCount).toBe(1);
    expect(state.skills.a?.memories.recall?.reviews).toBe(1);
    expect(state.skills.a?.memories.recall?.model).toBe('fsrs-7@1');
    expect(events.map((event) => event.type)).toEqual(['skill.started', 'review.recorded']);
    expect(appended).toEqual([
      {
        schemaVersion: 1,
        seq: 0,
        at: T0,
        configHash: p.configHash,
        kind: 'evidence',
        evidence: evidence('e1', 'i1', T0),
        task: {
          itemId: 'i1',
          skills: [{ skillId: 'a', weight: 1 }],
          stage: 'recall',
          difficulty: 0,
          origin: 'generated',
        },
      },
    ]);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(appended[0])).toBe(true);
  });

  it('snapshots the optional task fields an item has', () => {
    const full = item('i1', 'a', 'recall', {
      difficulty: 0.5,
      fluentSeconds: 5,
      slowSeconds: 60,
      criteria: [{ name: 'x', skillId: 'a' }],
      contentHash: 'h',
      proof: { kind: 'reviewed', at: T0, reviewerId: 'r' },
    });
    const { appended } = applied(
      p.record(empty(), { graph: GRAPH, item: full, evidence: evidence('e1', 'i1', T0) }),
    );
    expect(appended[0]).toMatchObject({
      task: {
        difficulty: 0.5,
        fluentSeconds: 5,
        slowSeconds: 60,
        criteria: [{ name: 'x', skillId: 'a' }],
        contentHash: 'h',
        proofKind: 'reviewed',
      },
    });
  });

  it('reports a repeated id as a duplicate and changes nothing', () => {
    const first = applied(
      p.record(empty(), { graph: GRAPH, item: item('i1'), evidence: evidence('e1', 'i1', T0) }),
    );
    const again = p.record(first.state, {
      graph: GRAPH,
      item: item('i1'),
      evidence: evidence('e1', 'i1', T0 + 1),
    });
    expect(again).toEqual({
      kind: 'duplicate',
      events: [{ type: 'evidence.duplicate', at: T0 + 1, evidenceId: 'e1' }],
    });
  });

  it('rejects a state built with another configuration or graph version', () => {
    const other = practice({ leechThreshold: 3 }).initState('l1', GRAPH);
    expect(
      issueCodes(
        p.record(other, { graph: GRAPH, item: item('i1'), evidence: evidence('e', 'i1', T0) }),
      ),
    ).toEqual(['STATE_CONFIG_MISMATCH']);
    const moved = { ...GRAPH, version: 'g2' };
    expect(
      issueCodes(
        p.record(empty(), { graph: moved, item: item('i1'), evidence: evidence('e', 'i1', T0) }),
      ),
    ).toEqual(['GRAPH_VERSION_MISMATCH']);
  });

  it('rejects malformed evidence before the duplicate check', () => {
    const bad = { ...evidence('e', 'i1', T0), at: 1.5 };
    expect(
      issueCodes(p.record(empty(), { graph: GRAPH, item: item('i1'), evidence: bad })),
    ).toEqual(['SHAPE_INVALID']);
  });

  it('needs the item, proven, with an accepted proof', () => {
    const record = (extra: Partial<Parameters<typeof p.record>[1]>) =>
      issueCodes(p.record(empty(), { graph: GRAPH, evidence: evidence('e', 'i1', T0), ...extra }));
    expect(record({})).toEqual(['ITEM_UNKNOWN']);
    expect(record({ item: item('i2') })).toEqual(['ITEM_UNKNOWN']);
    expect(record({ item: item('i1', 'zz') })).toEqual(['SKILL_UNKNOWN']);
    expect(record({ item: item('i1', 'a', 'recall', { status: 'unproven' }) })).toEqual([
      'ITEM_UNPROVEN',
    ]);
    expect(
      record({
        item: item('i1', 'a', 'recall', {
          proof: { kind: 'model-checked', at: T0, checkerId: 'm' } as never,
        }),
      }),
    ).toEqual(['ITEM_UNPROVEN']);
  });

  it('places item issues under item and outcome issues under evidence', () => {
    const result = p.record(empty(), {
      graph: GRAPH,
      item: item('i1', 'zz'),
      evidence: evidence('e', 'i1', T0),
    });
    expect(result.kind === 'rejected' && result.issues[0]?.path[0]).toBe('item');
    const outcome = p.record(empty(), {
      graph: GRAPH,
      item: item('i1'),
      evidence: evidence('e', 'i1', T0, pass(), {
        skillOutcomes: [{ skillId: 'c', score: 1, maxScore: 1 }],
      }),
    });
    expect(outcome.kind === 'rejected' && outcome.issues[0]).toMatchObject({
      code: 'SKILL_NOT_IN_TASK',
      path: ['evidence', 'skillOutcomes', 0, 'skillId'],
    });
  });

  it('asks for a replay when evidence is earlier than the last entry', () => {
    const first = applied(
      p.record(empty(), { graph: GRAPH, item: item('i1'), evidence: evidence('e1', 'i1', T0) }),
    );
    const late = p.record(first.state, {
      graph: GRAPH,
      item: item('i2'),
      evidence: evidence('e2', 'i2', T0 - DAY),
    });
    expect(late.kind).toBe('replay-required');
    if (late.kind !== 'replay-required') return;
    expect(late.replayFrom).toBe(T0 - DAY);
    expect(late.appended[0]).toMatchObject({ seq: 1, at: T0 - DAY });
  });

  it('applies exposure without a review and context weights to ability', () => {
    const exposure = applied(
      p.record(empty(), {
        graph: GRAPH,
        item: item('i1'),
        evidence: evidence('e1', 'i1', T0, { kind: 'exposure' }),
      }),
    );
    expect(exposure.state.skills.a).toMatchObject({ startedAt: T0, memories: {}, ability: {} });
    const pretest = applied(
      practice({ contexts: { pretestWeight: 0 } }).record(
        practice({ contexts: { pretestWeight: 0 } }).initState('l1', GRAPH),
        {
          graph: GRAPH,
          item: item('i1'),
          evidence: evidence('e1', 'i1', T0, pass(), { context: 'pretest' }),
        },
      ),
    );
    expect(pretest.state.skills.a?.ability).toEqual({});
  });

  it('emits confident-error on a sure failure and counts a lapse', () => {
    const { state, events } = applied(
      p.record(empty(), {
        graph: GRAPH,
        item: item('i1'),
        evidence: evidence('e1', 'i1', T0, fail, { learnerConfidence: 'sure' }),
      }),
    );
    expect(events.map((event) => event.type)).toContain('evidence.confident-error');
    expect(state.skills.a?.lastLapseAt).toBe(T0);
    expect(state.skills.a?.memories.recall?.lapses).toBe(1);
  });

  it('marks a leech and suspends the skill at the threshold, then stops reviewing it', () => {
    const leechy = practice({ leechThreshold: 2 });
    const { state, results } = run(leechy, [
      { evidence: evidence('e1', 'i1', T0, fail), item: item('i1') },
      { evidence: evidence('e2', 'i2', T0 + DAY, fail), item: item('i2') },
      { evidence: evidence('e3', 'i3', T0 + 2 * DAY, fail), item: item('i3') },
    ]);
    const second = applied(results[1] as never);
    expect(second.events.map((event) => event.type)).toEqual([
      'review.recorded',
      'skill.leech',
      'skill.suspended',
    ]);
    expect(state.skills.a?.suspended).toBe('leech');
    expect(state.skills.a?.memories.recall?.reviews).toBe(2);
    expect(state.skills.a?.evidenceCount).toBe(3);
  });

  it('prunes item usage past the retention and keeps the last ids in the window', () => {
    const short = practice({ itemUsageRetentionMs: DAY, recentIdWindow: 2 });
    const { state } = run(short, [
      { evidence: evidence('e1', 'i1', T0), item: item('i1') },
      { evidence: evidence('e2', 'i2', T0 + DAY / 2), item: item('i2') },
      { evidence: evidence('e3', 'i3', T0 + 2 * DAY), item: item('i3') },
    ]);
    expect(Object.keys(state.items)).toEqual(['i3']);
    expect(state.recentIds).toEqual(['e2', 'e3']);
  });

  it('promotes on spaced successes, masters, and unlocks the hard dependent', () => {
    const { state, results } = masterA(p);
    const types = results.flatMap((result) =>
      result.kind === 'applied' ? result.events.map((event) => event.type) : [],
    );
    expect(types).toContain('stage.promoted');
    expect(types.slice(-2)).toEqual(['skill.mastered', 'skill.unlocked']);
    expect(state.skills.a).toMatchObject({ stage: 'produce', mastered: true });
    expect(state.skills.a?.memories.recall?.superseded).toBe(true);
    expect(state.skills.b?.unlockedAt).toBe(state.log.lastAt);
  });

  it('demotes after lapses at the higher stage and revives the lower memory', () => {
    const { state, results } = run(p, [
      { evidence: evidence('e1', 'i1', T0), item: item('i1') },
      { evidence: evidence('e2', 'i2', T0 + DAY), item: item('i2') },
      { evidence: evidence('e3', 'i3', T0 + 2 * DAY, fail), item: item('i3', 'a', 'produce') },
      { evidence: evidence('e4', 'i4', T0 + 3 * DAY, fail), item: item('i4', 'a', 'produce') },
    ]);
    const types = results.flatMap((result) =>
      result.kind === 'applied' ? result.events.map((event) => event.type) : [],
    );
    expect(types).toContain('stage.demoted');
    expect(state.skills.a?.stage).toBe('recall');
    expect(state.skills.a?.memories.recall?.superseded).toBe(false);
  });

  it('reports mastery lost to decay at the next entry, with the failed conditions', () => {
    const mastered = masterA(p);
    const later = (mastered.state.log.lastAt as number) + 10_000 * DAY;
    const status = p.status(mastered.state, GRAPH, later);
    expect(status.skills[0]).toMatchObject({
      skillId: 'a',
      masteryLapsed: true,
      status: 'reviewing',
    });
    const touched = applied(
      p.record(mastered.state, {
        graph: GRAPH,
        item: item('x1', 'a', 'produce'),
        evidence: evidence('x1', 'x1', later, { kind: 'exposure' }),
      }),
    );
    expect(touched.events).toContainEqual({
      type: 'skill.mastery-lost',
      at: later,
      skillId: 'a',
      failed: ['retrievability'],
    });
    expect(touched.state.skills.a?.mastered).toBe(false);
    // Sticky: the dependent stays unlocked.
    expect(touched.state.skills.b?.unlockedAt).not.toBeNull();
  });
});

describe('held evidence and confirmations', () => {
  const held = () =>
    applied(
      p.record(empty(), {
        graph: GRAPH,
        item: item('i1'),
        evidence: evidence('h1', 'i1', T0, lowAi),
      }),
    );

  it('holds low-confidence evidence without touching the skill', () => {
    const { state, events } = held();
    expect(events).toEqual([
      { type: 'evidence.held', at: T0, evidenceId: 'h1', reason: 'low-confidence' },
    ]);
    expect(state.skills).toEqual({});
    expect(state.held).toMatchObject([{ evidenceId: 'h1', itemId: 'i1', at: T0, seq: 0 }]);
    expect(state.items).toEqual({ i1: { uses: 1, lastUsedAt: T0 } });
  });

  it('applies a confirmation of the newest entry at once, at the held instant', () => {
    const { state } = held();
    const confirmed = applied(
      p.record(state, {
        graph: GRAPH,
        evidence: evidence('c1', 'i1', T0 + 5, human(true), { confirms: 'h1' }),
      }),
    );
    expect(confirmed.state.held).toEqual([]);
    expect(confirmed.state.skills.a?.startedAt).toBe(T0);
    expect(confirmed.events.map((event) => event.type)).toEqual([
      'skill.started',
      'review.recorded',
      'evidence.confirmed',
    ]);
    expect(confirmed.appended[0]).not.toHaveProperty('task');
    // Equal to replay, where the held entry takes the confirmation's grade.
    const replayed = p.replay([...held().appended, ...confirmed.appended], GRAPH, 'l1');
    expect(replayed.ok && replayed.state).toEqual(confirmed.state);
  });

  it('asks for a replay from the held instant when later entries followed it', () => {
    const { state } = held();
    const next = applied(
      p.record(state, { graph: GRAPH, item: item('i2'), evidence: evidence('e2', 'i2', T0 + 10) }),
    );
    const confirmation = p.record(next.state, {
      graph: GRAPH,
      evidence: evidence('c1', 'i1', T0 + 20, human(true), { confirms: 'h1' }),
    });
    expect(confirmation).toMatchObject({ kind: 'replay-required', replayFrom: T0 });
  });

  it('rejects confirmations that do not fit the held evidence', () => {
    const { state } = held();
    const confirm = (extra: Partial<ReturnType<typeof evidence>>, source = human(true)) =>
      issueCodes(
        p.record(state, {
          graph: GRAPH,
          evidence: { ...evidence('c1', 'i1', T0 + 5, source, { confirms: 'h1' }), ...extra },
        }),
      );
    expect(confirm({ confirms: 'nope' })).toEqual(['HELD_UNKNOWN']);
    expect(confirm({ at: T0 - 1 })).toEqual(['CONFIRMATION_INVALID']);
    expect(confirm({ itemId: 'i9' })).toEqual(['CONFIRMATION_INVALID']);
    expect(confirm({ supplements: 'x' })).toEqual(['CONFIRMATION_INVALID']);
    expect(confirm({}, { kind: 'pending', reason: 'deferred' })).toEqual(['CONFIRMATION_INVALID']);
    expect(confirm({}, lowAi)).toEqual(['CONFIRMATION_INVALID']);
    expect(confirm({ skillOutcomes: [{ skillId: 'c', score: 1, maxScore: 1 }] })).toEqual([
      'SKILL_NOT_IN_TASK',
    ]);
  });
});

function pass() {
  return { kind: 'auto', score: 1, maxScore: 1, passed: true } as const;
}
