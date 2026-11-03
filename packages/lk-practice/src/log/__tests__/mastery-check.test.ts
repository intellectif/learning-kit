import { describe, expect, it } from 'vitest';
import type {
  PracticeEvent,
  PracticeItem,
  PracticeState,
  SkillGraph,
  SkillState,
} from '../../types.js';
import {
  applied,
  DAY,
  evidence,
  fail,
  GRAPH,
  host,
  item,
  pass,
  practice,
  run,
  type Step,
  T0,
} from './fixtures.js';

// Mastery checks (design 8.2 and 8.6; revised in M9). `a` climbs recall then
// produce; its produce ability starts one logit below recall's (stageOffset),
// so it is short of R3.5 (c) until the learner passes tasks at the reference.

type ReviewRecorded = Extract<PracticeEvent, { readonly type: 'review.recorded' }>;

const p = practice();
const GAP = 3 * DAY; // mastery.topGapMs

/** A task on `a` at `stage` with `difficulty`. */
function task(id: string, stage = 'produce', difficulty?: number): PracticeItem {
  return item(id, 'a', stage, difficulty === undefined ? {} : { difficulty });
}

function step(id: string, at: number, source = pass, stage = 'produce', difficulty?: number): Step {
  return { evidence: evidence(id, id, at, source), item: task(id, stage, difficulty) };
}

/** `a` at produce with two counted top-stage successes, its ability short of the standard. */
const TOP: Step[] = [
  step('r1', T0, pass, 'recall'),
  step('r2', T0 + DAY, pass, 'recall'),
  step('t1', T0 + 2 * DAY),
  step('t2', T0 + 5 * DAY),
];
const AT_TOP = T0 + 5 * DAY;

/** A prior that meets the standard at produce. */
const MET: Step = {
  host: host('h-met', AT_TOP + 1, {
    kind: 'prior',
    skillId: 'a',
    stage: 'produce',
    theta: 3,
    pseudoCount: 10,
  }),
};

function reviews(steps: readonly Step[]): ReviewRecorded[] {
  return run(p, steps).results.flatMap((result) =>
    result.kind === 'applied'
      ? result.events.filter((event): event is ReviewRecorded => event.type === 'review.recorded')
      : [],
  );
}

describe('mastery checks: record', () => {
  it('reaches the top stage short of the standard, and a pass brings the next check within topGapMs', () => {
    const { state } = run(p, TOP);
    const skill = state.skills.a;
    expect(skill?.stage).toBe('produce');
    expect(skill?.top.successes).toBe(2);
    const memory = skill?.memories.produce;
    expect(memory?.due).toBe(AT_TOP + GAP);
    expect(memory?.modelDue).toBeGreaterThan(AT_TOP + GAP);
  });

  it('a pass once the standard is met keeps the model interval', () => {
    const { state } = run(p, [...TOP, MET, step('t3', AT_TOP + GAP)]);
    const memory = state.skills.a?.memories.produce;
    expect(memory?.due).toBe(memory?.modelDue);
    expect(memory?.due).toBeGreaterThan(AT_TOP + 2 * GAP);
  });

  it('a failed check is reviewed as hard: no lapse, demotion or leech count, and lastLapseAt is set', () => {
    const steps = [...TOP, step('c1', AT_TOP + DAY, fail), step('c2', AT_TOP + 2 * DAY, fail)];
    const { state } = run(p, steps);
    const skill = state.skills.a;
    expect(
      reviews(steps)
        .slice(-2)
        .map((event) => event.rating),
    ).toEqual(['hard', 'hard']);
    expect(skill?.stage).toBe('produce');
    expect(skill?.memories.produce?.lapses).toBe(0);
    expect(skill?.memories.produce?.streak.successes).toBe(2);
    expect(skill?.top.lastWasLapse).toBe(false);
    expect(skill?.lastLapseAt).toBe(AT_TOP + 2 * DAY);
  });

  it('a sure learner who fails a check is still a confident error', () => {
    const result = applied(
      p.record(run(p, TOP).state, {
        graph: GRAPH,
        item: task('c1'),
        evidence: evidence('c1', 'c1', AT_TOP + DAY, fail, { learnerConfidence: 'sure' }),
      }),
    );
    expect(result.events.map((event) => event.type)).toEqual([
      'review.recorded',
      'evidence.confident-error',
    ]);
  });

  it('a failure on a task at the learner’s level is a lapse, and one straight after it demotes', () => {
    const steps = [
      ...TOP,
      step('e1', AT_TOP + DAY, fail, 'produce', -5),
      step('c1', AT_TOP + DAY + 1, fail),
    ];
    const { state } = run(p, steps);
    expect(
      reviews(steps)
        .slice(-2)
        .map((event) => event.rating),
    ).toEqual(['again', 'again']);
    expect(state.skills.a?.stage).toBe('recall');
    expect(state.skills.a?.memories.produce?.lapses).toBe(2);
  });

  it('a failure is a lapse once the standard is met, when recall has decayed, below the top stage task, or before a top memory', () => {
    const lapse = (steps: readonly Step[]) => reviews(steps).at(-1)?.rating;
    expect(lapse([...TOP, MET, step('c1', AT_TOP + DAY, fail)])).toBe('again');
    expect(lapse([...TOP, step('c1', AT_TOP + 400 * DAY, fail)])).toBe('again');
    expect(lapse([...TOP, step('c1', AT_TOP + DAY, fail, 'recall')])).toBe('again');
    expect(lapse([...TOP.slice(0, 2), step('c1', T0 + 2 * DAY, fail)])).toBe('again');
  });
});

describe('mastery checks: record, at the edges', () => {
  it('a failure on a task within the tolerance of the learner’s level is a lapse, up to its edge', () => {
    const { state } = run(p, TOP);
    const ability = state.skills.a?.ability.produce as { theta: number } | undefined;
    if (ability === undefined) throw new Error('a has no produce ability');
    const { theta } = ability;
    const training = theta - Math.log(0.85 / (1 - 0.85));
    for (const difficulty of [training + 0.25, training + 0.5]) {
      const steps = [...TOP, step('c1', AT_TOP + DAY, fail, 'produce', difficulty)];
      expect(reviews(steps).at(-1)?.rating).toBe('again');
    }
    const above = [...TOP, step('c1', AT_TOP + DAY, fail, 'produce', training + 0.51)];
    expect(reviews(above).at(-1)?.rating).toBe('hard');
  });

  it('a skill placed below its top stage does not review a failed top-stage task', () => {
    const placed: Step = {
      host: host('h-down', AT_TOP + 1, {
        kind: 'place',
        skillId: 'a',
        stage: 'recall',
        credited: false,
      }),
    };
    const result = applied(
      p.record(run(p, [...TOP, placed]).state, {
        graph: GRAPH,
        item: task('c1'),
        evidence: evidence('c1', 'c1', AT_TOP + DAY, fail),
      }),
    );
    expect(result.events.map((event) => event.type)).not.toContain('review.recorded');
  });
});

describe('mastery checks: back off (revised in M11)', () => {
  const failAt = (state: PracticeState, id: string, at: number) =>
    applied(
      p.record(state, {
        graph: GRAPH,
        item: task(id),
        evidence: evidence(id, id, at, fail),
      }),
    );

  it('a failed check waits topGapMs, doubled for each failed check before it', () => {
    const one = failAt(run(p, TOP).state, 'c1', AT_TOP + DAY);
    expect(one.state.skills.a?.top.failedChecks).toBe(1);
    expect(one.state.skills.a?.memories.produce?.due).toBe(AT_TOP + DAY + GAP);
    // The planner would not plan a check straight after a failed one, but a
    // host may serve one, past the one-hour sitting: it counts and backs off.
    const at = AT_TOP + DAY + 2 * 3_600_000;
    const two = failAt(one.state, 'c2', at);
    expect(two.state.skills.a?.top.failedChecks).toBe(2);
    expect(two.state.skills.a?.memories.produce?.due).toBeLessThanOrEqual(at + 2 * GAP);
    expect(two.state.skills.a?.memories.produce?.due).toBeGreaterThan(at + GAP);
  });

  it('a passed check starts the count again', () => {
    const one = failAt(run(p, TOP).state, 'c1', AT_TOP + DAY);
    const passedCheck = applied(
      p.record(one.state, {
        graph: GRAPH,
        item: task('c2'),
        evidence: evidence('c2', 'c2', AT_TOP + DAY + GAP, pass),
      }),
    );
    expect(passedCheck.state.skills.a?.top.failedChecks).toBe(0);
  });

  it('reads a state written before 0.3.0, with no count, as 0', () => {
    const { state } = run(p, TOP);
    const stored = JSON.parse(JSON.stringify(state)) as PracticeState;
    const a = stored.skills.a as SkillState;
    const { failedChecks: _omit, ...top } = a.top;
    const old = { ...stored, skills: { ...stored.skills, a: { ...a, top } } };
    expect(failAt(old, 'c1', AT_TOP + DAY).state.skills.a?.top.failedChecks).toBe(1);
    const passedOld = applied(
      p.record(old, {
        graph: GRAPH,
        item: task('t9', 'produce', -5),
        evidence: evidence('t9', 't9', AT_TOP + GAP, pass),
      }),
    );
    expect(passedOld.state.skills.a?.memories.produce?.due).toBe(AT_TOP + 2 * GAP);
  });
});

describe('mastery checks: plan', () => {
  const ask = (now: number) => ({ now, seed: 's', budget: {} });

  it('plans a due top-stage review short of the standard at the reference difficulty', () => {
    const graph: SkillGraph = {
      ...GRAPH,
      version: 'g-ref',
      skills: GRAPH.skills.map((skill) =>
        skill.id === 'a' ? { ...skill, referenceDifficulty: 0.7 } : skill,
      ),
    };
    for (const [g, reference] of [
      [GRAPH, 0],
      [graph, 0.7],
    ] as const) {
      const { state } = run(p, TOP, g);
      const target = p.plan(state, g, ask(AT_TOP + GAP)).targets.find((t) => t.skillIds[0] === 'a');
      expect(target).toMatchObject({
        kind: 'review',
        stage: 'produce',
        targetDifficulty: reference,
      });
      expect(target?.reason).toMatchObject({ code: 'overdue', masteryCheck: true });
      expect(target?.reason.expectedSuccess).toBeLessThan(0.8);
    }
  });

  it('plans an ordinary review once the standard is met, after a lapse, or when recall has decayed', () => {
    const review = (steps: readonly Step[], now: number, q = p) => {
      const { state } = run(q, steps);
      return q.plan(state, GRAPH, ask(now)).targets.find((t) => t.skillIds[0] === 'a');
    };
    const met = review([...TOP, MET], AT_TOP + GAP);
    const lapsed = review(
      [...TOP, step('e1', AT_TOP + DAY, fail, 'produce', -5)],
      AT_TOP + 2 * DAY,
    );
    const decayed = review(TOP, AT_TOP + 400 * DAY);
    const recall = review(TOP.slice(0, 1), T0 + DAY);
    for (const target of [met, lapsed, decayed, recall]) {
      expect(target?.kind).toBe('review');
      expect(target?.reason).toMatchObject({
        masteryCheck: false,
        expectedSuccess: expect.closeTo(0.85, 12),
      });
    }
  });

  it('plans an ordinary review when targetSuccess is below the standard and the target is already harder than the reference', () => {
    const q = practice({ planner: { targetSuccess: 0.6 } });
    const prior: Step = {
      host: host('h-prior', AT_TOP + 1, {
        kind: 'prior',
        skillId: 'a',
        stage: 'produce',
        theta: 1,
        pseudoCount: 10,
      }),
    };
    const { state } = run(q, [...TOP, prior]);
    const target = q
      .plan(state, GRAPH, ask(AT_TOP + GAP))
      .targets.find((t) => t.skillIds[0] === 'a');
    expect(target?.reason).toMatchObject({
      masteryCheck: false,
      expectedSuccess: expect.closeTo(0.6, 12),
    });
    expect(target?.targetDifficulty).toBeGreaterThan(0);
  });
});
