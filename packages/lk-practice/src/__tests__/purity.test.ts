import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTrap, PurityViolation, removeTrap } from './trap.js';

/**
 * The runtime purity trap (R1.1). The clock, the random source and argument-
 * less `new Date()` are replaced by functions that throw, and the package is
 * loaded and run with them in place: a path that reaches one of them fails
 * here, however it was reached. `scripts/verify-dist.mjs` sets the same trap
 * around the built entries, and scans their text as well. Every vector also
 * replays under it (`policy-vectors.test.mjs`; revised in M8).
 */
describe('the runtime purity trap', () => {
  beforeEach(() => {
    installTrap();
  });

  afterEach(() => {
    removeTrap();
  });

  // A trap that never fires proves nothing, so each vector is sprung first.
  it('throws on every vector it guards', () => {
    expect(() => new Date()).toThrow(PurityViolation);
    expect(() => Date.now()).toThrow(PurityViolation);
    expect(() => Math.random()).toThrow(PurityViolation);
    expect(() => globalThis.crypto.randomUUID()).toThrow(PurityViolation);
  });

  it('still allows a Date built from a given time', () => {
    expect(new Date(0).toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });

  it('loads and runs the root entry without reaching any of them', async () => {
    vi.resetModules();
    const entry = await import('../index.js');
    expect(Object.keys(entry).sort()).toEqual([
      'PracticeConfigError',
      'admitCandidate',
      'admitExtension',
      'candidatesJsonSchema',
      'checkCandidates',
      'checkDecomposition',
      'checkGradeResult',
      'composeGraph',
      'createPractice',
      'decompositionJsonSchema',
      'decompositionRequest',
      'eloMasteryModel',
      'evidenceFromGrade',
      'evidenceSchema',
      'fsrsMemoryModel',
      'generationRequest',
      'gradeResultJsonSchema',
      'gradeResultSchema',
      'mapEvidence',
      'migrateState',
      'practiceStateJsonSchema',
      'practiceStateSchema',
      'reviewLogEntryJsonSchema',
      'reviewLogEntrySchema',
      'validateGraph',
      'validateItems',
    ]);
    const graph = {
      version: '1',
      skills: [
        { id: 'a', knowledge: 'declarative' as const },
        { id: 'b', knowledge: 'procedural' as const, stages: ['use'] },
      ],
      edges: [{ kind: 'prerequisite' as const, from: 'a', to: 'b', strength: 'hard' as const }],
    };
    expect(entry.validateGraph(graph).ok).toBe(true);
    expect(
      entry.validateItems(
        [
          {
            id: 'i',
            skills: [{ skillId: 'a', weight: 1 }],
            stage: 'recall',
            origin: 'authored',
            status: 'proven',
          },
        ],
        graph,
      ).ok,
    ).toBe(true);
    const composed = entry.composeGraph(graph, [
      {
        id: 'e',
        goalId: 'g',
        idPrefix: 'x',
        skills: [{ id: 'x', knowledge: 'procedural' }],
        edges: [{ kind: 'prerequisite', from: 'b', to: 'x', strength: 'soft' }],
        status: 'admitted',
      },
    ]);
    expect(composed.ok).toBe(true);
    // The memory model, with ts-fsrs loaded under the trap too: every grade,
    // a lapse, two retention values and fitted options.
    const model = entry.fsrsMemoryModel({ maximumIntervalDays: 3650 });
    const context = { desiredRetention: 0.9 };
    let memory = model.init();
    let at = 1_767_225_600_000;
    for (const rating of ['again', 'hard', 'good', 'easy', 'again', 'good'] as const) {
      const next = model.review(memory, rating, at, {
        ...context,
        desiredRetention: rating === 'easy' ? 0.8 : 0.9,
      });
      expect(next.due).toBeGreaterThan(at);
      memory = model.deserialize(JSON.parse(JSON.stringify(model.serialize(next.memory))));
      expect(model.retrievability(memory, next.due)).toBeGreaterThan(0);
      at = next.due;
    }
    // The mastery model and the evidence mapper.
    const elo = entry.eloMasteryModel();
    const ability = elo.update(elo.init(graph.skills[0] as never), {
      correct: 1,
      weight: 1,
      difficulty: 0,
      stage: 'recall',
      context: 'practice',
    });
    expect(elo.estimate(ability).value).toBe(0.5);
    const { defaultConfig } = await import('../config.js');
    const mapped = entry.mapEvidence(
      {
        id: 'e',
        itemId: 'i',
        at,
        source: { kind: 'auto', score: 1, maxScore: 1, passed: true },
        durationMs: 1000,
      },
      {
        itemId: 'i',
        skills: [{ skillId: 'a', weight: 1 }],
        stage: 'recall',
        difficulty: 0,
        origin: 'authored',
        fluentSeconds: 5,
      },
      {},
      defaultConfig(),
    );
    expect(mapped.perSkill[0]?.rating).toBe('easy');
    // The practice object: record, a host action, replay, status, plan
    // (revised in M6), migrate.
    const practice = entry.createPractice();
    const item = {
      id: 'i',
      skills: [{ skillId: 'a', weight: 1 }],
      stage: 'recall',
      origin: 'authored' as const,
      status: 'proven' as const,
    };
    const first = practice.record(practice.initState('l', graph), {
      graph,
      item,
      evidence: { id: 'e1', itemId: 'i', at, source: { kind: 'self', rating: 'good' } },
    });
    expect(first.kind).toBe('applied');
    if (first.kind !== 'applied') return;
    const second = practice.act(first.state, graph, {
      id: 'h1',
      at: at + 1,
      action: { kind: 'place', skillId: 'b', stage: 'use', credited: true },
    });
    expect(second.kind).toBe('applied');
    if (second.kind !== 'applied') return;
    const replayed = practice.replay([...first.appended, ...second.appended], graph, 'l');
    expect(replayed.ok && replayed.state).toEqual(second.state);
    expect(practice.status(second.state, graph, at + 2).skills).toHaveLength(2);
    const planned = practice.plan(second.state, graph, {
      now: at + 30 * 86_400_000,
      seed: 's1',
      pool: [item],
      budget: { maxTargets: 2 },
    });
    expect(planned.targets[0]?.skillIds).toEqual(['a']);
    expect(entry.migrateState(JSON.parse(JSON.stringify(second.state))).ok).toBe(true);
    // The history export (revised in M8).
    const history = practice.exportReviewHistory(
      [...first.appended, ...second.appended],
      graph,
      'l',
    );
    expect(history.ok && history.history.skills.map((skill) => skill.skillId)).toEqual(['a']);
  });

  it('loads and runs the testing entry without reaching any of them (revised in M8)', async () => {
    vi.resetModules();
    const testing = await import('../testing/index.js');
    expect(Object.keys(testing).sort()).toEqual(['simulateLearner']);
    const { createPractice } = await import('../index.js');
    const graph = {
      version: '1',
      skills: [{ id: 'a', knowledge: 'declarative' as const }],
      edges: [],
    };
    const practice = createPractice();
    const state = practice.initState('l', graph);
    const now = 1_767_225_600_000;
    const [target] = practice.plan(state, graph, { now, seed: 's', budget: {} }).targets;
    if (target === undefined) throw new Error('no target');
    const learner = testing.simulateLearner({
      seed: 's',
      skills: { a: { trueAbility: 0, forgettingDays: 5 } },
    });
    const attempt = learner.attempt(target, now);
    expect(practice.record(state, { graph, ...attempt }).kind).toBe('applied');
  });
});
