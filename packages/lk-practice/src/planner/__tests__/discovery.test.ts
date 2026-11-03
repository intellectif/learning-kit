/**
 * The planner and prerequisite discovery (R14.6, R14.9, D29; revised in M12):
 * probe targets first, then a confirmed prerequisite's practice, while its
 * blocked skill waits; re-probes once it is practised.
 */

import { describe, expect, it } from 'vitest';
import { discoveryExtension } from '../../contracts/index.js';
import { composeGraph, hypothesisId } from '../../graph/index.js';
import { evidence, type Run, type Step } from '../../log/__tests__/fixtures.js';
import type {
  EvidenceSource,
  Practice,
  PracticeState,
  PrerequisiteHypothesis,
  SkillGraph,
  SkillNode,
} from '../../types.js';
import { OTHER_STAGE_SECONDS } from '../plan.js';
import {
  DAY,
  fail,
  GRAPH,
  item,
  pass,
  practice,
  request,
  review,
  run,
  shape,
  T0,
} from './helpers.js';

const NEW_SKILL: SkillNode = { id: 'n', knowledge: 'declarative', stages: ['recall', 'produce'] };

function hypothesis(
  forSkillId: string,
  skillId: string,
  skill?: SkillNode,
): PrerequisiteHypothesis {
  return {
    id: hypothesisId({ forSkillId, skillId, ...(skill === undefined ? {} : { skill }) }),
    forSkillId,
    skillId,
    ...(skill === undefined ? {} : { skill }),
  };
}
const H = hypothesis('c', 'n', NEW_SKILL);
const open = (id: string, at: number, opened: PrerequisiteHypothesis = H): Step => ({
  host: { id, at, action: { kind: 'open-hypothesis', hypothesis: opened } },
});
const probe = (
  id: string,
  at: number,
  source: EvidenceSource,
  opened = H,
  stage = 'produce',
): Step => ({
  evidence: evidence(id, `${id}-item`, at, source, { context: 'diagnostic', probe: opened.id }),
  item: item(`${id}-item`, opened.skillId, stage),
});
/** `c` fails twice. */
const STUCK: Step[] = [
  review('c1', 'c', 'recognise', T0, fail),
  review('c2', 'c', 'recognise', T0 + DAY, fail),
];

/** The graph with each confirmed hypothesis admitted, in order. */
function admit(state: PracticeState, ...list: PrerequisiteHypothesis[]): SkillGraph {
  const extensions = list.map((h) => {
    const admission = discoveryExtension(state, h.id);
    if (!admission.ok) throw new Error(JSON.stringify(admission.issues));
    return admission.extension;
  });
  const composed = composeGraph(GRAPH, extensions);
  if (!composed.ok) throw new Error(JSON.stringify(composed.issues));
  return composed.graph;
}

/** `start`'s log replayed against `graph`, then `more` there, as a host does after an admission. */
function proceed(p: Practice, start: Run, graph: SkillGraph, more: Step[] = []): PracticeState {
  const replayed = p.replay(start.entries, graph, 'l1');
  if (!replayed.ok) throw new Error(JSON.stringify(replayed.issues));
  let { state } = replayed;
  for (const step of more) {
    const result =
      'host' in step
        ? p.act(state, graph, step.host)
        : p.record(state, {
            graph,
            evidence: step.evidence,
            ...(step.item ? { item: step.item } : {}),
          });
    if (result.kind !== 'applied') throw new Error(JSON.stringify(result));
    state = result.state;
  }
  return state;
}

describe('probe targets (R14.6)', () => {
  it('probe the candidate alone at its top stage and reference difficulty, in context diagnostic', () => {
    const p = practice();
    const { state } = run(p, [...STUCK, open('o1', T0 + DAY + 1)]);
    const plan = p.plan(state, GRAPH, request(T0 + 2 * DAY));
    expect(shape(plan)).toEqual(['probe:n@produce', 'review:c@recognise', 'new:a@recall']);
    const [target] = plan.targets;
    expect(target).toMatchObject({
      kind: 'probe',
      skillIds: ['n'],
      stage: 'produce',
      targetDifficulty: 0,
      expectedSeconds: 60,
      constraints: { needsSkillOutcomes: false, context: 'diagnostic' },
      reason: {
        code: 'probe',
        hypothesisId: H.id,
        forSkillId: 'c',
        // A candidate with no answers starts at 0 on its first stage, a stage below.
        expectedSuccess: expect.closeTo(1 / (1 + Math.E), 12),
        coalesced: [],
        newSkillsDeferred: false,
      },
    });
    expect(target).not.toHaveProperty('item');
    expect(target?.constraints).not.toHaveProperty('forms');
  });

  it('take the candidate forms, reference difficulty and stage seconds, else the default seconds', () => {
    const shaped = hypothesis('c', 'm', {
      id: 'm',
      knowledge: 'declarative',
      stages: ['recall', 'master'],
      forms: { master: ['short'] },
      referenceDifficulty: 0.5,
    });
    const p = practice();
    const { state } = run(p, [...STUCK, open('o1', T0 + DAY + 1, shaped)]);
    const [target] = p.plan(state, GRAPH, request(T0 + 2 * DAY)).targets;
    expect(target).toMatchObject({
      stage: 'master',
      targetDifficulty: 0.5,
      expectedSeconds: OTHER_STAGE_SECONDS,
      constraints: { forms: ['short'] },
    });
    const timed = practice({ planner: { stageSeconds: { master: 30 } } });
    const timedState = run(timed, [...STUCK, open('o1', T0 + DAY + 1, shaped)]).state;
    expect(timed.plan(timedState, GRAPH, request(T0 + 2 * DAY)).targets[0]?.expectedSeconds).toBe(
      30,
    );
  });

  it('match a pool item only for a candidate in the graph, with its difficulty or 0', () => {
    const known = hypothesis('c', 'a');
    const p = practice();
    const { state } = run(p, [...STUCK, open('o1', T0 + DAY + 1), open('o2', T0 + DAY + 1, known)]);
    const pool = [
      item('pool-a', 'a', 'produce', { expectedSeconds: 45 }),
      item('pool-n', 'n', 'produce', { difficulty: 0 }),
    ];
    const plan = p.plan(state, GRAPH, request(T0 + 2 * DAY, { pool }));
    const probes = plan.targets.filter((target) => target.kind === 'probe');
    // Opened at the same instant: by id.
    expect(probes.map((target) => target.skillIds[0])).toEqual(
      [H, known].sort((x, y) => (x.id < y.id ? -1 : 1)).map((h) => h.skillId),
    );
    const onA = probes.find((target) => target.skillIds[0] === 'a');
    expect(onA).toMatchObject({
      expectedSeconds: 45,
      item: {
        itemId: 'pool-a',
        difficulty: 0,
        expectedSuccess: expect.closeTo(1 / (1 + Math.E), 12),
      },
    });
    expect(probes.find((target) => target.skillIds[0] === 'n')).not.toHaveProperty('item');
    // The probe used a: it is not planned as new as well.
    expect(shape(plan)).not.toContain('new:a@recall');
  });

  it('leave out a probe the budget cannot fit, and plan the rest', () => {
    const p = practice();
    const { state } = run(p, [...STUCK, open('o1', T0 + DAY + 1)]);
    // The probe takes 60 s; the review (20 s) and the new skill (30 s) fit in 50.
    const plan = p.plan(state, GRAPH, request(T0 + 2 * DAY, { budget: { maxSeconds: 50 } }));
    expect(shape(plan)).toEqual(['review:c@recognise', 'new:a@recall']);
  });

  it('order open hypotheses by opening time, not by id', () => {
    const three = ['m1', 'm2', 'm3'].map((id) =>
      hypothesis('c', id, { id, knowledge: 'declarative', stages: ['recall'] }),
    );
    // Ids sorted, then opened middle first, then the smallest, then the largest.
    const [low, mid, high] = [...three].sort((x, y) => (x.id < y.id ? -1 : 1)) as [
      PrerequisiteHypothesis,
      PrerequisiteHypothesis,
      PrerequisiteHypothesis,
    ];
    const p = practice();
    const { state } = run(p, [
      ...STUCK,
      open('o1', T0 + DAY + 1, mid),
      open('o2', T0 + DAY + 2, low),
      open('o3', T0 + DAY + 3, high),
    ]);
    const probes = p
      .plan(state, GRAPH, request(T0 + 2 * DAY))
      .targets.filter((target) => target.kind === 'probe')
      .map((target) => target.skillIds[0]);
    expect(probes).toEqual([mid.skillId, low.skillId, high.skillId]);
  });

  it('probe a candidate open for two skills once a plan', () => {
    const forA = hypothesis('a', 'n', NEW_SKILL);
    const p = practice();
    const { state } = run(p, [...STUCK, open('o1', T0 + DAY + 1), open('o2', T0 + DAY + 2, forA)]);
    const plan = p.plan(state, GRAPH, request(T0 + 2 * DAY));
    expect(plan.targets.filter((target) => target.kind === 'probe')).toHaveLength(1);
  });

  it('plan none for an old state without hypotheses', () => {
    const p = practice();
    const { hypotheses: _none, ...old } = run(p, STUCK).state;
    expect(shape(p.plan(old as PracticeState, GRAPH, request(T0 + 2 * DAY)))).toEqual([
      'review:c@recognise',
      'new:a@recall',
    ]);
  });
});

describe('a confirmed prerequisite (R14.9)', () => {
  const p = practice();
  const confirmedSteps: Step[] = [
    ...STUCK,
    open('o1', T0 + DAY + 1),
    probe('q1', T0 + 2 * DAY, fail),
    probe('q2', T0 + 2 * DAY + 1, fail),
  ];
  const confirmed = run(p, confirmedSteps);
  const graph = admit(confirmed.state, H);

  it('is practised first at its first stage while its blocked skill waits, still counted as deferred', () => {
    const plan = p.plan(proceed(p, confirmed, graph), graph, request(T0 + 3 * DAY));
    expect(shape(plan)).toEqual(['remediation:n@recall', 'new:a@recall']);
    expect(plan.targets[0]?.reason).toMatchObject({
      code: 'discovered',
      hypothesisId: H.id,
      forSkillId: 'c',
    });
    expect(plan.deferred.reviewsDue).toBe(1);
  });

  it('is re-probed once practised, and practised again at its current stage after a failed re-probe', () => {
    const practised = proceed(p, confirmed, graph, [review('n1', 'n', 'recall', T0 + 3 * DAY)]);
    expect(shape(p.plan(practised, graph, request(T0 + 4 * DAY)))[0]).toBe('probe:n@produce');
    const failed = proceed(p, confirmed, graph, [
      review('n1', 'n', 'recall', T0 + 3 * DAY),
      review('n2', 'n', 'recall', T0 + 4 * DAY + 2),
      probe('r1', T0 + 5 * DAY, fail),
    ]);
    expect(failed.skills.n?.stage).toBe('produce');
    // n is discovered at produce, which is also its stage-up: planned once.
    expect(shape(p.plan(failed, graph, request(T0 + 6 * DAY)))).toEqual([
      'remediation:n@produce',
      'new:a@recall',
    ]);
  });

  it('frees its blocked skill once ready', () => {
    const ready = proceed(p, confirmed, graph, [
      review('n1', 'n', 'recall', T0 + 3 * DAY),
      probe('r1', T0 + 4 * DAY, pass),
      probe('r2', T0 + 4 * DAY + 1, pass),
    ]);
    expect(shape(p.plan(ready, graph, request(T0 + 5 * DAY)))).toContain('review:c@recognise');
  });

  it('plans an existing candidate only once its own edge is admitted', () => {
    // a is in the graph and active, and has an edge of its own (a before b): not the admission.
    const known = hypothesis('c', 'a');
    const unadmitted = run(p, [
      ...STUCK,
      open('o1', T0 + DAY + 1, known),
      probe('q1', T0 + 2 * DAY, fail, known, 'produce'),
      probe('q2', T0 + 2 * DAY + 1, fail, known, 'produce'),
    ]);
    expect(unadmitted.state.hypotheses?.[known.id]?.verdict).toBe('confirmed');
    expect(shape(p.plan(unadmitted.state, GRAPH, request(T0 + 3 * DAY)))).toEqual([
      'review:c@recognise',
      'new:a@recall',
    ]);
    const graphA = admit(unadmitted.state, known);
    expect(shape(p.plan(proceed(p, unadmitted, graphA), graphA, request(T0 + 3 * DAY)))).toEqual([
      'remediation:a@recall',
    ]);
  });

  it('plans nothing until admitted, and nothing while its candidate is suspended', () => {
    expect(shape(p.plan(confirmed.state, GRAPH, request(T0 + 3 * DAY)))).toEqual([
      'review:c@recognise',
      'new:a@recall',
    ]);
    const suspended = proceed(p, confirmed, graph, [
      review('n1', 'n', 'recall', T0 + 3 * DAY),
      { host: { id: 's1', at: T0 + 3 * DAY + 1, action: { kind: 'suspend', skillId: 'n' } } },
    ]);
    expect(shape(p.plan(suspended, graph, request(T0 + 4 * DAY)))).toEqual([
      'review:c@recognise',
      'new:a@recall',
    ]);
  });

  it('orders several by verdict time, then id, and skips a candidate a probe already used', () => {
    // n is confirmed for c and for a at the same instant; m, for b, later.
    const forA = hypothesis('a', 'n', NEW_SKILL);
    const forB = hypothesis('b', 'm', { id: 'm', knowledge: 'declarative', stages: ['recall'] });
    const again = hypothesis('a', 'm');
    const both = run(p, [
      ...STUCK,
      open('o1', T0 + DAY + 1),
      open('o2', T0 + DAY + 1, forA),
      open('o3', T0 + DAY + 1, forB),
      probe('q1', T0 + 2 * DAY, fail),
      probe('q2', T0 + 2 * DAY, fail, forA),
      probe('q3', T0 + 2 * DAY + 1, fail),
      probe('q4', T0 + 2 * DAY + 1, fail, forA),
      probe('q5', T0 + 2 * DAY + 2, fail, forB, 'recall'),
      probe('q6', T0 + 2 * DAY + 3, fail, forB, 'recall'),
    ]);
    const many = admit(both.state, H, forA, forB);
    const state = proceed(p, both, many);
    const plan = p.plan(state, many, request(T0 + 3 * DAY));
    const discovered = plan.targets.filter((target) => target.reason.code === 'discovered');
    // n once (its first hypothesis by id), then m; a and c wait.
    const first = [H, forA].sort((x, y) => (x.id < y.id ? -1 : 1))[0] as PrerequisiteHypothesis;
    expect(
      discovered.map((target) => [
        target.skillIds[0],
        target.reason.code === 'discovered' && target.reason.hypothesisId,
      ]),
    ).toEqual([
      ['n', first.id],
      ['m', forB.id],
    ]);
    expect(shape(plan)).not.toContain('review:c@recognise');
    // m opened for a too: its probe uses m, so m is not practised as well.
    const probing = proceed(p, both, many, [open('o4', T0 + 3 * DAY, again)]);
    const shared = p.plan(probing, many, request(T0 + 4 * DAY));
    expect(shape(shared).filter((entry) => entry.includes(':m@'))).toEqual(['probe:m@recall']);
  });
});

describe('a waiting skill is not coalesced into another target', () => {
  it('leaves a waiting component out of the target that encompasses it', () => {
    const KIT: SkillGraph = {
      version: 'k1',
      skills: [
        { id: 'k', knowledge: 'declarative', stages: ['recall'] },
        { id: 'c', knowledge: 'declarative', stages: ['recall'] },
      ],
      edges: [{ kind: 'encompasses', from: 'k', to: 'c', weight: 1 }],
    };
    const forC = hypothesis('c', 'n', NEW_SKILL);
    const p = practice();
    // k is reviewed first, so it is the more overdue: c joins its target.
    const steps: Step[] = [
      review('k1', 'k', 'recall', T0),
      review('c1', 'c', 'recall', T0 + 10 * DAY),
    ];
    const due = run(p, steps, KIT).state;
    expect(shape(p.plan(due, KIT, request(T0 + 90 * DAY)))).toEqual(['review:k+c@recall']);

    const start = run(
      p,
      [
        ...steps,
        open('o1', T0 + 10 * DAY + 1, forC),
        probe('q1', T0 + 10 * DAY + 2, fail, forC),
        probe('q2', T0 + 10 * DAY + 3, fail, forC),
      ],
      KIT,
    );
    const extension = discoveryExtension(start.state, forC.id);
    const composed = composeGraph(KIT, [extension.ok ? extension.extension : (null as never)]);
    if (!composed.ok) throw new Error('compose');
    const waiting = proceed(p, start, composed.graph);
    expect(shape(p.plan(waiting, composed.graph, request(T0 + 90 * DAY)))).toEqual([
      'remediation:n@recall',
      'review:k@recall',
    ]);
  });
});
