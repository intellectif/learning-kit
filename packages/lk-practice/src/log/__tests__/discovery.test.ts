/**
 * Prerequisite discovery in the log (R14.2, R14.5 to R14.10, D29; revised in
 * M12): the diagnosis trigger, opening and closing hypotheses, probe answers
 * and their verdict, re-probes, readiness and the blocked skill's fresh
 * start, the blocked skill's answers after it, and the rules record, act and
 * replay check.
 */

import { describe, expect, it } from 'vitest';
import { discoveryExtension } from '../../contracts/index.js';
import { composeGraph, hypothesisId } from '../../graph/index.js';
import type {
  DiscoveryOptions,
  EvidenceSource,
  HypothesisState,
  PracticeEvent,
  PracticeItem,
  PracticeState,
  PrerequisiteHypothesis,
  RecordResult,
  ReviewLogEntry,
  SkillGraph,
  SkillNode,
} from '../../types.js';
import { diagnosisUnderWay, probeVerdict } from '../discovery.js';
import { Draft } from '../draft.js';
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
  type Run,
  run,
  type Step,
  T0,
} from './fixtures.js';

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

/** The evidence step of `Step`. */
type Answer = Extract<Step, { readonly evidence: unknown }>;

/** `n`, new to the graph, as a prerequisite of `c`. */
const H = hypothesis('c', 'n', NEW_SKILL);

const open = (id: string, at: number, opened: PrerequisiteHypothesis = H): Step => ({
  host: host(id, at, { kind: 'open-hypothesis', hypothesis: opened }),
});
const close = (id: string, at: number, closed = H.id): Step => ({
  host: host(id, at, { kind: 'close-hypothesis', hypothesisId: closed }),
});
/** A probe answer on `n` at its top stage. */
const probe = (
  id: string,
  at: number,
  source: EvidenceSource,
  probed = H.id,
  task: PracticeItem = item(`${id}-item`, 'n', 'produce'),
): Step => ({
  evidence: evidence(id, task.id, at, source, { context: 'diagnostic', probe: probed }),
  item: task,
});
/** A practice answer on `skillId` at `stage`. */
const answer = (
  id: string,
  at: number,
  source: EvidenceSource,
  skillId = 'c',
  stage = 'recognise',
) => ({
  evidence: evidence(id, `${id}-item`, at, source),
  item: item(`${id}-item`, skillId, stage),
});
/** `c` fails twice: a diagnosis is suggested. */
const STUCK: Step[] = [answer('c1', T0, fail), answer('c2', T0 + DAY, fail)];

const types = (result: RecordResult): string[] =>
  result.kind === 'applied' ? result.events.map((event) => event.type) : [result.kind];
const codes = (result: RecordResult): string[] =>
  result.kind === 'rejected' ? result.issues.map((issue) => issue.code) : [result.kind];
const stored = (state: PracticeState): HypothesisState =>
  (state.hypotheses as Record<string, HypothesisState>)[H.id] as HypothesisState;

/** The graph with the confirmed `h` admitted: `n` as a soft prerequisite. */
function admitted(state: PracticeState, h: PrerequisiteHypothesis = H): SkillGraph {
  const admission = discoveryExtension(state, h.id);
  if (!admission.ok) throw new Error(JSON.stringify(admission.issues));
  const composed = composeGraph(GRAPH, [admission.extension]);
  if (!composed.ok) throw new Error(JSON.stringify(composed.issues));
  return composed.graph;
}

const OPTIONS: Required<DiscoveryOptions> = {
  diagnoseAfter: 2,
  minProbes: 2,
  maxProbes: 4,
  confirmBelow: 0.5,
  refuteFrom: 0.75,
  readyAfter: 2,
  revokeAfter: 2,
};

describe('the diagnosis trigger (R14.2)', () => {
  it('suggests a diagnosis at the second lapse in a row at a stage, and again after a pass', () => {
    const p = practice();
    const { results } = run(p, [
      ...STUCK,
      answer('c3', T0 + 2 * DAY, fail),
      answer('c4', T0 + 3 * DAY, pass),
      answer('c5', T0 + 4 * DAY, fail),
      answer('c6', T0 + 5 * DAY, fail),
    ]);
    const suggested = results.map((result) => types(result).includes('skill.diagnosis-suggested'));
    expect(suggested).toEqual([false, true, false, false, false, true]);
    const second = applied(results[1] as RecordResult).events.at(-1);
    expect(second).toEqual({
      type: 'skill.diagnosis-suggested',
      at: T0 + DAY,
      evidenceId: 'c2',
      skillId: 'c',
      stage: 'recognise',
      lapses: 2,
    });
  });

  it('counts the lapses the configuration names', () => {
    const { results } = run(practice({ discovery: { diagnoseAfter: 3 } }), [
      ...STUCK,
      answer('c3', T0 + 2 * DAY, fail),
    ]);
    expect(results.map((result) => types(result).includes('skill.diagnosis-suggested'))).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('suggests none while a hypothesis for the skill is open', () => {
    const { results } = run(practice(), [
      ...STUCK,
      open('o1', T0 + DAY + 1),
      answer('c3', T0 + 2 * DAY, pass),
      answer('c4', T0 + 3 * DAY, fail),
      answer('c5', T0 + 4 * DAY, fail),
    ]);
    expect(types(results[5] as RecordResult)).not.toContain('skill.diagnosis-suggested');
  });

  describe('diagnosisUnderWay', () => {
    const base: HypothesisState = {
      id: 'h',
      forSkillId: 'c',
      skillId: 'n',
      openedAt: T0,
      probes: { passed: 0, failed: 0 },
      verdict: 'open',
      decidedAt: null,
      practisedAt: null,
      reprobeStreak: 0,
      readyAt: null,
      blockedPassedAt: null,
      blockedFailures: 0,
      closedAt: null,
    };
    const underWay = (change: Partial<HypothesisState>, skillId = 'c'): boolean => {
      const state = practice().initState('l1', GRAPH);
      const draft = new Draft({ ...state, hypotheses: { h: { ...base, ...change } } });
      return diagnosisUnderWay(draft, skillId, OPTIONS);
    };
    const confirmed = { verdict: 'confirmed' as const, decidedAt: T0 };

    it('is under way for an open hypothesis or a confirmed one on trial', () => {
      expect(underWay({})).toBe(true);
      expect(underWay(confirmed)).toBe(true);
      expect(underWay({ ...confirmed, readyAt: T0, blockedFailures: 1 })).toBe(true);
    });

    it('is not for another skill, a closed or refuted one, or a trial that ended', () => {
      expect(underWay({}, 'a')).toBe(false);
      expect(underWay({ closedAt: T0 })).toBe(false);
      expect(underWay({ verdict: 'refuted', decidedAt: T0 })).toBe(false);
      expect(underWay({ ...confirmed, readyAt: T0, blockedPassedAt: T0 })).toBe(false);
      expect(underWay({ ...confirmed, readyAt: T0, blockedFailures: 2 })).toBe(false);
    });
  });
});

describe('probeVerdict (R14.7)', () => {
  const verdict = (passed: number, failed: number, options = OPTIONS) =>
    probeVerdict({ passed, failed }, options);

  it('waits for minProbes, refutes at refuteFrom, confirms below confirmBelow', () => {
    expect(verdict(0, 1)).toBe('open');
    expect(verdict(1, 0)).toBe('open');
    expect(verdict(0, 2)).toBe('confirmed');
    expect(verdict(2, 0)).toBe('refuted');
    expect(verdict(1, 1)).toBe('open');
    expect(verdict(1, 2)).toBe('confirmed');
    expect(verdict(2, 1)).toBe('open');
    expect(verdict(3, 1)).toBe('refuted');
  });

  it('confirms at maxProbes when not refuted: doubt confirms', () => {
    expect(verdict(2, 2)).toBe('confirmed');
    expect(verdict(2, 1, { ...OPTIONS, maxProbes: 3 })).toBe('confirmed');
    expect(verdict(1, 0, { ...OPTIONS, minProbes: 1, maxProbes: 1 })).toBe('refuted');
    expect(verdict(0, 1, { ...OPTIONS, minProbes: 1, maxProbes: 1 })).toBe('confirmed');
  });
});

describe('opening, probing and closing (R14.5, R14.6)', () => {
  it('opens a hypothesis with an empty tally', () => {
    const { state, results } = run(practice(), [...STUCK, open('o1', T0 + DAY + 1)]);
    expect(applied(results[2] as RecordResult).events).toEqual([
      {
        type: 'hypothesis.opened',
        at: T0 + DAY + 1,
        hypothesisId: H.id,
        skillId: 'n',
        forSkillId: 'c',
      },
    ]);
    expect(stored(state)).toEqual({
      ...H,
      openedAt: T0 + DAY + 1,
      probes: { passed: 0, failed: 0 },
      verdict: 'open',
      decidedAt: null,
      practisedAt: null,
      reprobeStreak: 0,
      readyAt: null,
      blockedPassedAt: null,
      blockedFailures: 0,
      closedAt: null,
    });
  });

  it('a probe answer changes only its hypothesis: no skill, memory or ability; its item counts as used', () => {
    const p = practice();
    const before = run(p, [...STUCK, open('o1', T0 + DAY + 1)]);
    const after = run(p, [...STUCK, open('o1', T0 + DAY + 1), probe('q1', T0 + 2 * DAY, pass)]);
    expect(after.state.skills).toEqual(before.state.skills);
    expect(after.state.items).toEqual({
      ...before.state.items,
      'q1-item': { uses: 1, lastUsedAt: T0 + 2 * DAY },
    });
    expect(types(after.results[3] as RecordResult)).toEqual(['hypothesis.probed']);
    expect(stored(after.state).probes).toEqual({ passed: 1, failed: 0 });
  });

  it('takes a self-rated probe as passed unless again', () => {
    const self = (rating: 'again' | 'good'): EvidenceSource => ({ kind: 'self', rating });
    const { state, results } = run(practice(), [
      ...STUCK,
      open('o1', T0 + DAY + 1),
      probe('q1', T0 + 2 * DAY, self('good')),
      probe('q2', T0 + 2 * DAY + 1, self('again')),
    ]);
    const probed = (index: number) =>
      applied(results[index] as RecordResult).events.find(
        (event): event is Extract<PracticeEvent, { type: 'hypothesis.probed' }> =>
          event.type === 'hypothesis.probed',
      )?.passed;
    expect([probed(3), probed(4)]).toEqual([true, false]);
    expect(stored(state).verdict).toBe('open');
  });

  it('decides, then closes; a closed hypothesis takes no probe and no second close', () => {
    const { state, results } = run(practice(), [
      ...STUCK,
      open('o1', T0 + DAY + 1),
      probe('q1', T0 + 2 * DAY, pass),
      probe('q2', T0 + 2 * DAY + 1, pass),
      close('x1', T0 + 3 * DAY),
      probe('q3', T0 + 3 * DAY + 1, pass),
      close('x2', T0 + 3 * DAY + 2),
    ]);
    expect(types(results[4] as RecordResult)).toEqual(['hypothesis.probed', 'hypothesis.decided']);
    expect(stored(state)).toMatchObject({ verdict: 'refuted', decidedAt: T0 + 2 * DAY + 1 });
    expect(types(results[5] as RecordResult)).toEqual(['hypothesis.closed']);
    expect(stored(state).closedAt).toBe(T0 + 3 * DAY);
    expect(codes(results[6] as RecordResult)).toEqual(['HYPOTHESIS_CLOSED']);
    expect(codes(results[7] as RecordResult)).toEqual(['HYPOTHESIS_CLOSED']);
  });

  it('refutes and then takes no more probes', () => {
    const { results } = run(practice(), [
      ...STUCK,
      open('o1', T0 + DAY + 1),
      probe('q1', T0 + 2 * DAY, pass),
      probe('q2', T0 + 2 * DAY + 1, pass),
      probe('q3', T0 + 2 * DAY + 2, pass),
    ]);
    expect(codes(results[5] as RecordResult)).toEqual(['HYPOTHESIS_CLOSED']);
  });

  it('reads an old state without hypotheses as having none', () => {
    const p = practice();
    const { state } = run(p, STUCK);
    const { hypotheses: _none, ...old } = state;
    const opened = applied(
      p.act(old, GRAPH, host('o1', T0 + DAY + 1, { kind: 'open-hypothesis', hypothesis: H })),
    );
    expect(Object.keys(opened.state.hypotheses ?? {})).toEqual([H.id]);
    expect(
      codes(p.record(old, { graph: GRAPH, ...(probe('q1', T0 + 2 * DAY, pass) as Answer) })),
    ).toEqual(['HYPOTHESIS_UNKNOWN']);
  });
});

describe('the checks of record and act (R14.5, R14.6)', () => {
  const p = practice();
  const opened = run(p, [...STUCK, open('o1', T0 + DAY + 1)]).state;
  const act = (h: PrerequisiteHypothesis, graph: SkillGraph = GRAPH) =>
    codes(
      p.act(
        run(p, STUCK, graph).state,
        graph,
        host('o', T0 + DAY + 1, { kind: 'open-hypothesis', hypothesis: h }),
      ),
    );
  const record = (step: Step) => codes(p.record(opened, { graph: GRAPH, ...(step as Answer) }));

  it('refuses an open whose id, skills or edge break a rule', () => {
    expect(
      codes(
        p.act(opened, GRAPH, host('o2', T0 + DAY + 2, { kind: 'open-hypothesis', hypothesis: H })),
      ),
    ).toEqual(['HYPOTHESIS_EXISTS']);
    expect(act({ ...H, id: 'other' })).toEqual(['HYPOTHESIS_ID_MISMATCH']);
    expect(act(hypothesis('zz', 'a'))).toEqual(['SKILL_UNKNOWN']);
    expect(act(hypothesis('c', 'c'))).toEqual(['HYPOTHESIS_SELF']);
    expect(act(hypothesis('c', 'zz'))).toEqual(['SKILL_UNKNOWN']);
    expect(act(hypothesis('c', 'n2', NEW_SKILL))).toEqual(['HYPOTHESIS_SKILL_MISMATCH']);
    expect(act(hypothesis('c', 'a', { id: 'a', knowledge: 'declarative' }))).toEqual([
      'HYPOTHESIS_SKILL_EXISTS',
    ]);
    expect(act(hypothesis('b', 'a'))).toEqual(['HYPOTHESIS_EDGE_EXISTS']);
    expect(act(hypothesis('a', 'b'))).toEqual(['GRAPH_CYCLE']);
  });

  it('refuses a ladder it cannot build, for the blocked skill or a new candidate', () => {
    const ladderless: SkillGraph = {
      ...GRAPH,
      skills: [...GRAPH.skills, { id: 'z', knowledge: 'mixed' }],
    };
    const p2 = practice();
    const start = p2.initState('l1', ladderless);
    const opening = (h: PrerequisiteHypothesis) =>
      codes(p2.act(start, ladderless, host('o', T0, { kind: 'open-hypothesis', hypothesis: h })));
    expect(opening(hypothesis('z', 'a'))).toEqual(['LADDER_INVALID']);
    expect(opening(hypothesis('c', 'm', { id: 'm', knowledge: 'mixed' }))).toEqual([
      'LADDER_INVALID',
    ]);
  });

  it('follows every prerequisite path to find a cycle, past other edges and shared skills', () => {
    // d needs b and c; b and c both need a; e encompasses d. A hypothesis that
    // d comes before a is a cycle through either path; one that e comes before
    // a is not, since encompassing is not needing.
    const diamond: SkillGraph = {
      version: 'd1',
      skills: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({
        id,
        knowledge: 'declarative' as const,
      })),
      edges: [
        { kind: 'prerequisite', from: 'a', to: 'b', strength: 'hard' },
        { kind: 'prerequisite', from: 'a', to: 'c', strength: 'soft' },
        { kind: 'prerequisite', from: 'b', to: 'd', strength: 'hard' },
        { kind: 'prerequisite', from: 'c', to: 'd', strength: 'hard' },
        { kind: 'encompasses', from: 'e', to: 'd', weight: 1 },
      ],
    };
    const p2 = practice();
    const start = p2.initState('l1', diamond);
    const opening = (h: PrerequisiteHypothesis) =>
      codes(p2.act(start, diamond, host('o', T0, { kind: 'open-hypothesis', hypothesis: h })));
    expect(opening(hypothesis('a', 'd'))).toEqual(['GRAPH_CYCLE']);
    expect(opening(hypothesis('a', 'e'))).toEqual(['applied']);
    // d reaches a twice and never f.
    expect(opening(hypothesis('f', 'd'))).toEqual(['applied']);
  });

  it('refuses a probe that is unknown, mixed, extra or not on the candidate alone', () => {
    expect(record(probe('q', T0 + 2 * DAY, pass, 'none'))).toEqual(['HYPOTHESIS_UNKNOWN']);
    expect(record(probe('q', T0 + 2 * DAY, { kind: 'exposure' }))).toEqual(['PROBE_INVALID']);
    expect(
      record({
        evidence: evidence('q', 'q-item', T0 + 2 * DAY, pass, {
          probe: H.id,
          skillOutcomes: [{ skillId: 'n', score: 1, maxScore: 1 }],
        }),
        item: item('q-item', 'n', 'produce'),
      }),
    ).toEqual(['PROBE_INVALID']);
    expect(
      record(
        probe('q', T0 + 2 * DAY, pass, H.id, {
          ...item('q-item', 'n', 'produce'),
          skills: [
            { skillId: 'n', weight: 0.5 },
            { skillId: 'c', weight: 0.5 },
          ],
        }),
      ),
    ).toEqual(['PROBE_INVALID']);
    expect(
      record(
        probe('q', T0 + 2 * DAY, pass, H.id, {
          ...item('q-item', 'n', 'produce'),
          criteria: [{ name: 'reads the value', skillId: 'n' }],
        }),
      ),
    ).toEqual(['PROBE_INVALID']);
    expect(record(probe('q', T0 + 2 * DAY, pass, H.id, item('q-item', 'a', 'produce')))).toEqual([
      'PROBE_INVALID',
    ]);
  });

  it('checks a probe item in the probe graph, where the new candidate has its ladder', () => {
    expect(record(probe('q', T0 + 2 * DAY, pass, H.id, item('q-item', 'n', 'apply')))).toEqual([
      'STAGE_NOT_IN_LADDER',
    ]);
    expect(record(probe('q', T0 + 2 * DAY, pass, H.id, item('q-item', 'n', 'recall')))).toEqual([
      'applied',
    ]);
  });
});

/**
 * Continues `start` as a host does after an admission: its log replayed
 * against `graph`, then `more` there. `results` are those of `more` only.
 */
function proceed(p: ReturnType<typeof practice>, start: Run, graph: SkillGraph, more: Step[]): Run {
  const replayed = p.replay(start.entries, graph, 'l1');
  if (!replayed.ok) throw new Error(JSON.stringify(replayed.issues));
  let state = replayed.state;
  const entries = [...start.entries];
  const results: RecordResult[] = [];
  for (const step of more) {
    const result =
      'host' in step
        ? p.act(state, graph, step.host)
        : p.record(state, {
            graph,
            evidence: step.evidence,
            ...(step.item === undefined ? {} : { item: step.item }),
          });
    results.push(result);
    if (result.kind === 'applied') {
      state = result.state;
      entries.push(...result.appended);
    }
  }
  return { state, entries, results };
}

/** Confirmed on two failed probes, on the base graph, with `before` first. */
function confirmedRun(p: ReturnType<typeof practice>, before: Step[] = [], forB = false): Run {
  const h = forB ? B : H;
  return run(p, [
    ...before,
    ...(forB ? [] : STUCK),
    open('o1', T0 + DAY + 1, h),
    probe('q1', T0 + 2 * DAY, fail, h.id),
    probe('q2', T0 + 2 * DAY + 1, fail, h.id),
  ]);
}

/** `n` practised once, then two passed re-probes: ready under the defaults. */
const READY = (h = H): Step[] => [
  answer('n1', T0 + 3 * DAY, pass, 'n', 'recall'),
  probe('r1', T0 + 4 * DAY, pass, h.id),
  probe('r2', T0 + 4 * DAY + 1, pass, h.id),
];

/** `n` as a prerequisite of `b`, which has no answers yet. */
const B = hypothesis('b', 'n', NEW_SKILL);

describe('confirmation, practice, re-probes and readiness (R14.8, R14.9)', () => {
  const p = practice();
  const confirmed = confirmedRun(p);
  const graph = admitted(confirmed.state);
  const continued = (more: Step[]) => proceed(p, confirmed, graph, more);

  it('confirms on failed probes and is admitted as one soft edge; replay rebuilds the state', () => {
    expect(stored(confirmed.state)).toMatchObject({
      verdict: 'confirmed',
      decidedAt: T0 + 2 * DAY + 1,
    });
    expect(graph.edges).toContainEqual({
      kind: 'prerequisite',
      from: 'n',
      to: 'c',
      strength: 'soft',
    });
    const replayed = p.replay(confirmed.entries, graph, 'l1');
    expect(replayed.ok && stored(replayed.state)).toEqual(stored(confirmed.state));
  });

  it('marks the first practice pass on the prerequisite, which makes re-probes due', () => {
    const { state, results } = continued([
      answer('n1', T0 + 3 * DAY, fail, 'n', 'recall'),
      answer('n2', T0 + 3 * DAY + 1, pass, 'n', 'recall'),
      answer('n3', T0 + 3 * DAY + 2, pass, 'n', 'recall'),
    ]);
    expect(applied(results[0] as RecordResult).state.hypotheses?.[H.id]?.practisedAt).toBeNull();
    expect(stored(state).practisedAt).toBe(T0 + 3 * DAY + 1);
  });

  it('counts passed re-probes in a row; a failed one sends the prerequisite back to practice', () => {
    const { state, results } = continued([
      answer('n1', T0 + 3 * DAY, pass, 'n', 'recall'),
      probe('r1', T0 + 4 * DAY, pass),
      probe('r2', T0 + 4 * DAY + 1, fail),
    ]);
    expect(applied(results[1] as RecordResult).state.hypotheses?.[H.id]).toMatchObject({
      reprobeStreak: 1,
      practisedAt: T0 + 3 * DAY,
      readyAt: null,
    });
    expect(types(results[2] as RecordResult)).toEqual(['hypothesis.probed']);
    expect(stored(state)).toMatchObject({ reprobeStreak: 0, practisedAt: null, readyAt: null });
    expect(stored(state).probes).toEqual({ passed: 0, failed: 2 });
  });

  it('is ready after readyAfter passed re-probes, which gives the blocked skill a fresh start', () => {
    const [practised, first] = READY();
    const before = continued([practised as Step, first as Step]).state.skills.c;
    expect(before?.memories.recognise?.lapses).toBe(2);
    expect((before?.ability.recognise as { theta: number } | undefined)?.theta).toBeLessThan(0);
    const { state, results } = continued(READY());
    expect(types(results[2] as RecordResult)).toEqual(['hypothesis.probed', 'hypothesis.ready']);
    expect(stored(state)).toMatchObject({ reprobeStreak: 2, readyAt: T0 + 4 * DAY + 1 });
    const fresh = state.skills.c;
    expect(fresh?.ability).toEqual({ recognise: { theta: 0, n: 0 } });
    expect(fresh?.memories.recognise).toMatchObject({ reviews: 0, lapses: 0 });
    expect(fresh?.memories.recognise?.memory).toEqual(before?.memories.recognise?.memory);
    expect(fresh?.memories.recognise?.due).toBe(before?.memories.recognise?.due);
  });

  it('readies on one re-probe when readyAfter is 1, and takes no probe once ready', () => {
    const p1 = practice({ discovery: { readyAfter: 1 } });
    const start = confirmedRun(p1);
    const { state, results } = proceed(p1, start, admitted(start.state), [
      answer('n1', T0 + 3 * DAY, pass, 'n', 'recall'),
      probe('r1', T0 + 4 * DAY, pass),
      probe('r2', T0 + 4 * DAY + 1, pass),
    ]);
    expect(stored(state).readyAt).toBe(T0 + 4 * DAY);
    expect(codes(results[2] as RecordResult)).toEqual(['HYPOTHESIS_CLOSED']);
  });

  it('then records the blocked skill: failures until its first pass, and nothing after it', () => {
    const { state, results } = continued([
      ...READY(),
      answer('n2', T0 + 5 * DAY, pass, 'n', 'recall'),
      answer('c3', T0 + 5 * DAY + 1, fail),
      answer('c4', T0 + 6 * DAY, pass),
      answer('c5', T0 + 7 * DAY, fail),
      answer('n3', T0 + 7 * DAY + 1, { kind: 'exposure' }, 'n', 'recall'),
    ]);
    expect(applied(results[3] as RecordResult).state.hypotheses?.[H.id]).toMatchObject({
      practisedAt: T0 + 3 * DAY,
      blockedFailures: 0,
    });
    expect(applied(results[4] as RecordResult).state.hypotheses?.[H.id]).toMatchObject({
      blockedFailures: 1,
      blockedPassedAt: null,
    });
    expect(stored(state)).toMatchObject({ blockedFailures: 1, blockedPassedAt: T0 + 6 * DAY });
  });

  it('ignores diagnostic and pretest answers, and confirmed hypotheses that are closed', () => {
    const diagnostic = {
      evidence: evidence('n1', 'n1-item', T0 + 3 * DAY, pass, { context: 'diagnostic' }),
      item: item('n1-item', 'n', 'recall'),
    };
    const pretest = {
      evidence: evidence('n2', 'n2-item', T0 + 3 * DAY + 1, pass, { context: 'pretest' }),
      item: item('n2-item', 'n', 'recall'),
    };
    expect(stored(continued([diagnostic, pretest]).state).practisedAt).toBeNull();
    const closed = continued([
      close('x1', T0 + 3 * DAY),
      answer('n1', T0 + 3 * DAY + 1, pass, 'n', 'recall'),
    ]);
    expect(stored(closed.state)).toMatchObject({ practisedAt: null, closedAt: T0 + 3 * DAY });
  });

  it('lifts a leech suspension the failures explain, and keeps a host suspension', () => {
    const leechy = practice({ leechThreshold: 2 });
    const start = confirmedRun(leechy);
    expect(start.state.skills.c?.suspended).toBe('leech');
    const leechGraph = admitted(start.state);
    const lifted = proceed(leechy, start, leechGraph, READY());
    expect(lifted.state.skills.c?.suspended).toBeNull();
    expect(types(lifted.results.at(-1) as RecordResult)).toEqual([
      'hypothesis.probed',
      'hypothesis.ready',
      'skill.unsuspended',
    ]);
    const suspended = proceed(leechy, start, leechGraph, [
      { host: host('s1', T0 + 3 * DAY - 1, { kind: 'suspend', skillId: 'c' }) },
      ...READY(),
    ]);
    expect(suspended.state.skills.c?.suspended).toBe('host');
  });

  it('keeps an ability at or above the start', () => {
    // c passes a hard item at recall before it fails twice at recognise: its
    // recall ability stays above the start there, its recognise one does not.
    const strong = confirmedRun(p, [
      answer('c0', T0 - 9 * DAY, pass),
      {
        evidence: evidence('c00', 'c00-item', T0 - 8 * DAY, pass),
        item: item('c00-item', 'c', 'recall', { difficulty: 3 }),
      },
    ]);
    const before = strong.state.skills.c;
    const kept = proceed(p, strong, admitted(strong.state), READY()).state.skills.c;
    const theta = (skill: typeof kept, stage: string) =>
      (skill?.ability[stage] as { theta: number } | undefined)?.theta;
    expect(theta(before, 'recall')).toBeGreaterThan(0);
    expect(theta(kept, 'recall')).toBe(theta(before, 'recall'));
    expect(theta(kept, 'recognise')).toBe(0);
  });

  it('keeps an ability exactly at the start with its evidence count, and restarts a single review', () => {
    // A prior after the failures puts recognise back at the start, worth ten answers.
    const atStart = confirmedRun(p, []);
    const prior = proceed(p, atStart, admitted(atStart.state), [
      {
        host: host('p0', T0 + 3 * DAY - 1, {
          kind: 'prior',
          skillId: 'c',
          stage: 'recognise',
          theta: 0,
          pseudoCount: 10,
        }),
      },
      ...READY(),
    ]);
    expect(prior.state.skills.c?.ability.recognise).toEqual({ theta: 0, n: 10 });

    // One failure under a high prior: nothing below the start, one review to restart.
    const once = run(p, [
      {
        host: host('p0', T0 - DAY, {
          kind: 'prior',
          skillId: 'c',
          stage: 'recognise',
          theta: 3,
          pseudoCount: 10,
        }),
      },
      answer('c1', T0, fail),
      open('o1', T0 + DAY + 1),
      probe('q1', T0 + 2 * DAY, fail),
      probe('q2', T0 + 2 * DAY + 1, fail),
    ]);
    expect(once.state.skills.c?.memories.recognise).toMatchObject({ reviews: 1, lapses: 1 });
    const restarted = proceed(p, once, admitted(once.state), READY()).state.skills.c;
    expect(restarted?.memories.recognise).toMatchObject({ reviews: 0, lapses: 0 });
  });

  it('restarts the counts even when no ability is below the start', () => {
    const prior = confirmedRun(p, [
      {
        host: host('p0', T0 - DAY, {
          kind: 'prior',
          skillId: 'c',
          stage: 'recognise',
          theta: 3,
          pseudoCount: 10,
        }),
      },
    ]);
    const before = prior.state.skills.c;
    expect((before?.ability.recognise as { theta: number } | undefined)?.theta).toBeGreaterThan(0);
    const after = proceed(p, prior, admitted(prior.state), READY()).state.skills.c;
    expect(after?.ability).toEqual(before?.ability);
    expect(after?.memories.recognise).toMatchObject({ reviews: 0, lapses: 0 });
  });

  it('leaves a blocked skill with no state, or with nothing recorded, alone', () => {
    const quiet = confirmedRun(p, [], true);
    const quietGraph = admitted(quiet.state, B);
    expect(quietGraph.edges.some((edge) => edge.to === 'b' && edge.from === 'n')).toBe(true);
    const none = proceed(p, quiet, quietGraph, READY(B));
    expect(types(none.results.at(-1) as RecordResult)).toEqual([
      'hypothesis.probed',
      'hypothesis.ready',
    ]);
    expect(none.state.skills.b).toBeUndefined();

    const placed = confirmedRun(
      p,
      [{ host: host('p1', T0, { kind: 'place', skillId: 'b', stage: 'recall', credited: true }) }],
      true,
    );
    const nothing = proceed(p, placed, quietGraph, READY(B));
    expect(types(nothing.results.at(-1) as RecordResult)).toEqual([
      'hypothesis.probed',
      'hypothesis.ready',
    ]);
    expect(nothing.state.skills.b).toEqual(placed.state.skills.b);
  });
});

describe('late entries and replay (R14.5)', () => {
  const p = practice();

  it('a probe timed before its hypothesis was opened changes nothing when replayed', () => {
    const { state, results } = run(p, [
      ...STUCK,
      open('o1', T0 + DAY + 10),
      probe('q1', T0 + DAY + 5, fail),
    ]);
    expect(results.at(-1)?.kind).toBe('replay-required');
    expect(stored(state).probes).toEqual({ passed: 0, failed: 0 });
  });

  it('a close timed before its open changes nothing; a second close or a later probe neither', () => {
    const late = run(p, [...STUCK, open('o1', T0 + DAY + 10), close('x1', T0 + DAY + 5)]);
    expect(late.results.at(-1)?.kind).toBe('replay-required');
    expect(stored(late.state).closedAt).toBeNull();

    const { entries } = run(p, [
      ...STUCK,
      open('o1', T0 + DAY + 1),
      probe('q1', T0 + 2 * DAY, fail),
      close('x1', T0 + 3 * DAY),
    ]);
    const closeEntry = entries.at(-1) as Extract<ReviewLogEntry, { kind: 'host' }>;
    const probeEntry = entries.at(-2) as Extract<ReviewLogEntry, { kind: 'evidence' }>;
    const edited: ReviewLogEntry[] = [
      ...entries,
      { ...closeEntry, seq: entries.length, at: T0 + 4 * DAY, id: 'x2' },
      {
        ...probeEntry,
        seq: entries.length + 1,
        at: T0 + 5 * DAY,
        evidence: { ...probeEntry.evidence, id: 'q2', at: T0 + 5 * DAY },
      },
    ];
    const replayed = p.replay(edited, GRAPH, 'l1');
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) return;
    expect(replayed.events.filter((event) => event.type === 'hypothesis.closed')).toHaveLength(1);
    expect(replayed.events.filter((event) => event.type === 'hypothesis.probed')).toHaveLength(1);
    expect(stored(replayed.state)).toMatchObject({
      closedAt: T0 + 3 * DAY,
      probes: { passed: 0, failed: 1 },
    });
  });

  it('checks each probe entry against the hypotheses opened before it, in its probe graph', () => {
    const { entries } = run(p, [
      ...STUCK,
      open('o1', T0 + DAY + 1),
      probe('q1', T0 + 2 * DAY, fail),
    ]);
    const probeEntry = entries.at(-1) as Extract<ReviewLogEntry, { kind: 'evidence' }>;
    const unknown = [
      ...entries.slice(0, -1),
      { ...probeEntry, evidence: { ...probeEntry.evidence, probe: 'none' } },
    ];
    const replayIssues = (log: ReviewLogEntry[]) => {
      const result = p.replay(log, GRAPH, 'l1');
      return result.ok ? [] : result.issues.map((issue) => issue.code);
    };
    expect(replayIssues(unknown)).toEqual(['HYPOTHESIS_UNKNOWN']);
    const task = probeEntry.task as NonNullable<typeof probeEntry.task>;
    const offLadder = [
      ...entries.slice(0, -1),
      { ...probeEntry, task: { ...task, stage: 'apply' } },
    ];
    expect(replayIssues(offLadder)).toEqual(['STAGE_NOT_IN_LADDER']);
    const mixed = [
      ...entries.slice(0, -1),
      {
        ...probeEntry,
        task: {
          ...task,
          skills: [
            { skillId: 'n', weight: 0.5 },
            { skillId: 'c', weight: 0.5 },
          ],
        },
      },
    ];
    expect(replayIssues(mixed)).toEqual(['PROBE_INVALID']);
    // An answer that is no probe answer, for a known hypothesis, is refused too.
    const outcomes = [
      ...entries.slice(0, -1),
      {
        ...probeEntry,
        evidence: {
          ...probeEntry.evidence,
          skillOutcomes: [{ skillId: 'n', score: 0, maxScore: 1 }],
        },
      },
    ];
    expect(replayIssues(outcomes)).toEqual(['PROBE_INVALID']);
  });

  it('replays from a checkpoint whose hypotheses are known, or from an old one without', () => {
    const { entries } = run(p, [
      ...STUCK,
      open('o1', T0 + DAY + 1),
      probe('q1', T0 + 2 * DAY, fail),
      probe('q2', T0 + 2 * DAY + 1, fail),
    ]);
    const start = p.replay(entries.slice(0, 3), GRAPH, 'l1');
    if (!start.ok) throw new Error('replay');
    const rest = p.replayFrom(start.state, entries.slice(3), GRAPH);
    expect(rest.ok && stored(rest.state).verdict).toBe('confirmed');
    const early = p.replay(entries.slice(0, 2), GRAPH, 'l1');
    if (!early.ok) throw new Error('replay');
    const { hypotheses: _none, ...old } = early.state;
    const fromOld = p.replayFrom(old, entries.slice(2), GRAPH);
    expect(fromOld.ok && stored(fromOld.state).verdict).toBe('confirmed');
  });
});
