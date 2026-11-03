/**
 * The discovery contracts (R14.3, R14.4, R14.7, R14.8, R14.10, D29; revised
 * in M12): the facts a diagnoser gets, the checks of its output, the verdict,
 * the admission of a confirmed hypothesis and the hardening report.
 */

import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../config.js';
import { composeGraph, hypothesisId } from '../../graph/index.js';
import { createPractice } from '../../practice.js';
import type {
  Evidence,
  HypothesisState,
  PracticeItem,
  PracticeState,
  PrerequisiteRequestOptions,
  SkillGraph,
  SkillNode,
} from '../../types.js';
import {
  checkPrerequisiteHypothesis,
  discoveryExtension,
  generationRequest,
  prerequisiteReport,
  prerequisiteRequest,
  prerequisiteVerdict,
} from '../index.js';

const T0 = Date.UTC(2026, 10, 4);

/**
 * `call` comes before `params` (hard); `params` before `stream` (soft);
 * `stream` encompasses `fmt`, so `fmt` is two edges away; `doc` is labelled
 * and described, and comes before `call`, so it is two edges away too.
 */
const GRAPH: SkillGraph = {
  version: 'g1',
  skills: [
    { id: 'call', knowledge: 'procedural', label: 'Call the model' },
    { id: 'params', knowledge: 'procedural', label: 'Call with parameters' },
    { id: 'stream', knowledge: 'procedural' },
    { id: 'fmt', knowledge: 'procedural', label: 'Format a string' },
    { id: 'deep', knowledge: 'procedural' },
    {
      id: 'doc',
      knowledge: 'declarative',
      label: 'Read the docs',
      description: 'Where the reference lives',
    },
  ],
  edges: [
    { kind: 'prerequisite', from: 'call', to: 'params', strength: 'hard' },
    { kind: 'prerequisite', from: 'params', to: 'stream', strength: 'soft' },
    { kind: 'encompasses', from: 'stream', to: 'fmt', weight: 1 },
    { kind: 'prerequisite', from: 'doc', to: 'call', strength: 'soft' },
    { kind: 'prerequisite', from: 'deep', to: 'doc', strength: 'soft' },
  ],
};
/** GRAPH with `mix`, mixed and without a ladder, next to `params` (an unvalidated graph). */
const MIXED: SkillGraph = {
  ...GRAPH,
  skills: [...GRAPH.skills, { id: 'mix', knowledge: 'mixed' }],
  edges: [...GRAPH.edges, { kind: 'prerequisite', from: 'mix', to: 'params', strength: 'soft' }],
};

const ITEM: PracticeItem = {
  id: 'i1',
  skills: [{ skillId: 'params', weight: 1 }],
  stage: 'example',
  difficulty: -1,
  origin: 'generated',
  status: 'proven',
};
const EVIDENCE: Evidence = {
  id: 'e1',
  itemId: 'i1',
  at: T0,
  source: { kind: 'auto', score: 0, maxScore: 1, passed: false },
};
const OPTIONS: PrerequisiteRequestOptions = { idPrefix: 'py', seed: 's' };
const p = createPractice();
const EMPTY = p.initState('l1', GRAPH);

const node = (id: string, label?: string): SkillNode => ({
  id,
  knowledge: 'procedural',
  ...(label === undefined ? {} : { label }),
});
const soft = (from: string, to = 'params') => ({
  kind: 'prerequisite' as const,
  from,
  to,
  strength: 'soft' as const,
});

function request(
  state: PracticeState = EMPTY,
  options: PrerequisiteRequestOptions = OPTIONS,
  extra: Partial<Parameters<typeof prerequisiteRequest>[0]> = {},
) {
  return prerequisiteRequest(
    { graph: GRAPH, state, evidence: EVIDENCE, item: ITEM, ...extra },
    options,
  );
}

function hypothesis(change: Partial<HypothesisState> = {}): HypothesisState {
  const skill = node('py.dict', 'Read a dict');
  return {
    id: hypothesisId({ forSkillId: 'params', skillId: 'py.dict', skill }),
    forSkillId: 'params',
    skillId: 'py.dict',
    skill,
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
    ...change,
  };
}
/** `h` naming a skill already in the graph: no `skill`. */
function withoutSkill(h: HypothesisState): HypothesisState {
  const { skill: _skill, ...rest } = h;
  return rest;
}
function defaults() {
  const resolved = resolveConfig({});
  if (!resolved.ok) throw new Error('config');
  return resolved.value;
}
const withHypotheses = (...list: HypothesisState[]): PracticeState => ({
  ...EMPTY,
  hypotheses: Object.fromEntries(list.map((h) => [h.id, h])),
});

describe('prerequisiteRequest (R14.3)', () => {
  it('gives the blocked skill, the failure, the task, the prerequisites and the skills nearby', () => {
    const built = request();
    expect(built.version).toBe(1);
    expect(built.blocked).toEqual({
      id: 'params',
      knowledge: 'procedural',
      ladder: ['example', 'complete', 'write', 'transfer'],
      label: 'Call with parameters',
      stage: 'example',
    });
    expect(built.failure).toEqual({
      evidenceId: 'e1',
      passed: false,
      score: 0,
      maxScore: 1,
      skillOutcomes: [],
      failedCriteria: [],
    });
    expect(built.task.skills).toEqual([{ skillId: 'params', weight: 1 }]);
    expect(built.prerequisites).toEqual([
      {
        id: 'call',
        knowledge: 'procedural',
        ladder: ['example', 'complete', 'write', 'transfer'],
        label: 'Call the model',
        strength: 'hard',
      },
    ]);
    // stream (one edge), fmt and doc (two, through stream and call); call is a
    // prerequisite; deep is three edges away.
    expect(built.nearby.map((fact) => fact.id)).toEqual(['stream', 'fmt', 'doc']);
    const mixed = prerequisiteRequest(
      { graph: MIXED, state: p.initState('l1', MIXED), evidence: EVIDENCE, item: ITEM },
      OPTIONS,
    );
    expect(mixed.prerequisites.find((fact) => fact.id === 'mix')?.ladder).toEqual([]);
    expect(built).toMatchObject({
      open: [],
      refuted: [],
      idPrefix: 'py',
      knowledge: ['declarative', 'procedural', 'mixed'],
      maxCandidates: 3,
      seed: 's',
    });
  });

  it('takes the blocked skill, criteria, excerpt, outcomes and options the host gives', () => {
    const built = prerequisiteRequest(
      {
        graph: GRAPH,
        state: EMPTY,
        evidence: { ...EVIDENCE, skillOutcomes: [{ skillId: 'call', score: 1, maxScore: 1 }] },
        item: {
          ...ITEM,
          skills: [
            { skillId: 'call', weight: 0.5 },
            { skillId: 'params', weight: 0.5 },
          ],
        },
        skillId: 'params',
        failedCriteria: ['logs the usage'],
        excerpt: 'TypeError',
      },
      { idPrefix: 'py', seed: 't', maxCandidates: 5, knowledge: ['procedural'] },
      defaults(),
    );
    expect(built.blocked.id).toBe('params');
    expect(built.failure).toMatchObject({
      skillOutcomes: [{ skillId: 'call', score: 1, maxScore: 1 }],
      failedCriteria: ['logs the usage'],
      excerpt: 'TypeError',
    });
    expect(built).toMatchObject({ maxCandidates: 5, knowledge: ['procedural'], seed: 't' });
  });

  it('describes a doc skill fully, and a self-rated or exposure failure without a score', () => {
    const doc = prerequisiteRequest(
      {
        graph: GRAPH,
        state: EMPTY,
        evidence: { ...EVIDENCE, source: { kind: 'self', rating: 'again' } },
        item: { ...ITEM, skills: [{ skillId: 'doc', weight: 1 }], stage: 'recall' },
      },
      OPTIONS,
    );
    expect(doc.blocked).toMatchObject({
      label: 'Read the docs',
      description: 'Where the reference lives',
    });
    expect(doc.failure).toEqual({
      evidenceId: 'e1',
      passed: false,
      skillOutcomes: [],
      failedCriteria: [],
    });
    const good = request(EMPTY, OPTIONS, {
      evidence: { ...EVIDENCE, source: { kind: 'self', rating: 'good' } },
    });
    expect(good.failure.passed).toBe(true);
    const seen = request(EMPTY, OPTIONS, {
      evidence: { ...EVIDENCE, source: { kind: 'exposure' } },
    });
    expect(seen.failure).toMatchObject({ passed: false });
    expect(seen.failure).not.toHaveProperty('score');
    const ai = request(EMPTY, OPTIONS, {
      evidence: {
        ...EVIDENCE,
        source: { kind: 'ai', score: 1, maxScore: 2, passed: false, confidence: 'high' },
      },
    });
    expect(ai.failure).toMatchObject({ score: 1, maxScore: 2 });
    const human = request(EMPTY, OPTIONS, {
      evidence: { ...EVIDENCE, source: { kind: 'human', score: 2, maxScore: 2, passed: true } },
    });
    expect(human.failure).toMatchObject({ passed: true, score: 2 });
  });

  it('gives the blocked skill its current stage, and lists open and refuted hypotheses sorted', () => {
    const recorded = p.record(EMPTY, {
      graph: GRAPH,
      evidence: { ...EVIDENCE, id: 'e0', at: T0 - 1, itemId: 'i0' },
      item: { ...ITEM, id: 'i0', stage: 'example' },
    });
    if (recorded.kind !== 'applied') throw new Error(recorded.kind);
    const placed = {
      ...recorded.state,
      skills: {
        ...recorded.state.skills,
        params: { ...recorded.state.skills.params, stage: 'write' },
      },
    } as PracticeState;
    expect(request(placed).blocked.stage).toBe('write');
    const a = hypothesis({ id: 'b-open' });
    const b = hypothesis({ id: 'a-open' });
    const refuted = hypothesis({ id: 'c-refuted', verdict: 'refuted', decidedAt: T0 });
    const closed = hypothesis({ id: 'd-closed', closedAt: T0 });
    const other = hypothesis({ id: 'e-other', forSkillId: 'stream' });
    const listed = request(withHypotheses(a, b, refuted, closed, other));
    expect(listed.open).toEqual(['a-open', 'b-open']);
    expect(listed.refuted).toEqual(['c-refuted']);
    const { hypotheses: _none, ...old } = EMPTY;
    expect(request(old as PracticeState).open).toEqual([]);
  });

  it('gives a skill with no edges no prerequisites and nothing nearby', () => {
    const solo: SkillGraph = { ...GRAPH, skills: [...GRAPH.skills, node('solo')] };
    const built = prerequisiteRequest(
      {
        graph: solo,
        state: p.initState('l1', solo),
        evidence: EVIDENCE,
        item: { ...ITEM, skills: [{ skillId: 'solo', weight: 1 }] },
      },
      OPTIONS,
    );
    expect([built.prerequisites, built.nearby]).toEqual([[], []]);
  });

  it('throws a TypeError for inputs it cannot describe', () => {
    const throws = (run: () => unknown) => expect(run).toThrow(TypeError);
    throws(() => request(EMPTY, OPTIONS, { skillId: 'nope' }));
    throws(() => request(EMPTY, OPTIONS, { item: { ...ITEM, skills: [] } }));
    // A blocked skill without a ladder is refused as such, not by a failure further on.
    expect(() =>
      prerequisiteRequest(
        { graph: MIXED, state: EMPTY, evidence: EVIDENCE, item: ITEM, skillId: 'mix' },
        OPTIONS,
      ),
    ).toThrow(/blocked skill "mix" is not in the graph/);
    throws(() => request(EMPTY, OPTIONS, { evidence: { ...EVIDENCE, itemId: 'other' } }));
    throws(() => request(EMPTY, { ...OPTIONS, idPrefix: '' }));
    throws(() => request(EMPTY, { ...OPTIONS, idPrefix: 1 as never }));
    for (const maxCandidates of [0, 21, 1.5])
      throws(() => request(EMPTY, { ...OPTIONS, maxCandidates }));
    expect(request(EMPTY, { ...OPTIONS, maxCandidates: 20 }).maxCandidates).toBe(20);
    expect(request(EMPTY, { ...OPTIONS, maxCandidates: 1 }).maxCandidates).toBe(1);
    throws(() => request(EMPTY, { ...OPTIONS, knowledge: [] }));
    throws(() => request(EMPTY, { ...OPTIONS, knowledge: ['bogus' as never] }));
    throws(() => request(EMPTY, { ...OPTIONS, seed: 1 as never }));
  });
});

describe('checkPrerequisiteHypothesis (R14.4)', () => {
  const check = (candidate: unknown, built = request()) =>
    checkPrerequisiteHypothesis(built, GRAPH, candidate);
  const issues = (candidate: unknown, built = request()) =>
    check(candidate, built).rejected.map(({ index, issues }) => [
      index,
      issues.map((issue) => issue.code),
    ]);

  it('accepts a new skill or an existing one, with a content id and the rationale', () => {
    const dict = node('py.dict', 'Read a dict');
    const result = check({
      hypotheses: [
        { skillId: 'py.dict', skill: dict, edge: soft('py.dict'), rationale: 'reads a key' },
        { skillId: 'fmt', edge: soft('fmt') },
        { skillId: 'py.plain', skill: node('py.plain'), edge: soft('py.plain') },
      ],
    });
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toEqual([
      {
        id: hypothesisId({ forSkillId: 'params', skillId: 'py.dict', skill: dict }),
        forSkillId: 'params',
        skillId: 'py.dict',
        skill: dict,
        rationale: 'reads a key',
      },
      {
        id: hypothesisId({ forSkillId: 'params', skillId: 'fmt' }),
        forSkillId: 'params',
        skillId: 'fmt',
      },
      expect.objectContaining({ skillId: 'py.plain' }),
    ]);
  });

  it('rejects a value that is not { hypotheses: [...] } as one rejection at index -1', () => {
    for (const bad of [null, 'x', { hypotheses: 'x' }, { hypotheses: [{ skillId: 'fmt' }] }]) {
      const result = check(bad);
      expect(result.accepted).toEqual([]);
      expect(result.rejected.map((entry) => entry.index)).toEqual([-1]);
    }
  });

  it('rejects each hypothesis with every issue it has', () => {
    const built = request(EMPTY, { ...OPTIONS, maxCandidates: 11, knowledge: ['procedural'] });
    expect(
      issues(
        {
          hypotheses: [
            { skillId: 'params', edge: soft('params') },
            { skillId: 'nope', edge: soft('nope') },
            { skillId: 'py.a', skill: node('py.b'), edge: soft('py.a') },
            { skillId: 'call', skill: node('call'), edge: soft('call') },
            { skillId: 'js.x', skill: node('js.x'), edge: soft('js.x') },
            {
              skillId: 'py.k',
              skill: { id: 'py.k', knowledge: 'declarative' },
              edge: soft('py.k'),
            },
            { skillId: 'py.f', skill: node('py.f', 'FORMAT a string!'), edge: soft('py.f') },
            { skillId: 'fmt', edge: { ...soft('fmt'), strength: 'hard' } },
            { skillId: 'fmt', edge: soft('fmt', 'stream') },
            { skillId: 'fmt', edge: { kind: 'encompasses', from: 'fmt', to: 'params', weight: 1 } },
            { skillId: 'stream', edge: soft('stream') },
            { skillId: 'fmt', edge: soft('call') },
          ],
        },
        built,
      ),
    ).toEqual([
      [0, ['HYPOTHESIS_SELF']],
      [1, ['SKILL_UNKNOWN']],
      [2, ['HYPOTHESIS_SKILL_MISMATCH']],
      [3, ['HYPOTHESIS_SKILL_EXISTS', 'HYPOTHESIS_EDGE_EXISTS']],
      [4, ['HYPOTHESIS_ID_OUTSIDE_PREFIX']],
      [5, ['HYPOTHESIS_KNOWLEDGE_NOT_ALLOWED']],
      [6, ['HYPOTHESIS_DUPLICATE_LABEL']],
      [7, ['HYPOTHESIS_EDGE_INVALID']],
      [8, ['HYPOTHESIS_EDGE_INVALID', 'HYPOTHESIS_DUPLICATE']],
      [9, ['HYPOTHESIS_EDGE_INVALID', 'HYPOTHESIS_DUPLICATE']],
      [10, ['GRAPH_CYCLE']],
      [11, ['HYPOTHESIS_TOO_MANY', 'HYPOTHESIS_EDGE_INVALID', 'HYPOTHESIS_DUPLICATE']],
    ]);
  });

  it('rejects a mismatched new skill already in the graph, and a mismatch outside the prefix', () => {
    expect(
      issues({ hypotheses: [{ skillId: 'py.a', skill: node('call'), edge: soft('py.a') }] }),
    ).toEqual([[0, ['HYPOTHESIS_SKILL_MISMATCH', 'HYPOTHESIS_SKILL_EXISTS']]]);
    expect(
      issues({ hypotheses: [{ skillId: 'py.a', skill: node('js.b'), edge: soft('py.a') }] }),
    ).toEqual([[0, ['HYPOTHESIS_SKILL_MISMATCH', 'HYPOTHESIS_ID_OUTSIDE_PREFIX']]]);
  });

  it('rejects a hypothesis this learner has open or refuted, but not a closed or decided one', () => {
    const open = hypothesis();
    const dict = { skillId: 'py.dict', skill: open.skill, edge: soft('py.dict') };
    expect(issues({ hypotheses: [dict] }, request(withHypotheses(open)))).toEqual([
      [0, ['HYPOTHESIS_OPEN']],
    ]);
    const refuted = hypothesis({ verdict: 'refuted', decidedAt: T0 });
    expect(issues({ hypotheses: [dict] }, request(withHypotheses(refuted)))).toEqual([
      [0, ['HYPOTHESIS_REFUTED']],
    ]);
    expect(
      issues({ hypotheses: [dict] }, request(withHypotheses(hypothesis({ closedAt: T0 })))),
    ).toEqual([]);
  });
});

describe('prerequisiteVerdict and discoveryExtension (R14.7, R14.8)', () => {
  it('reads the verdict, inconclusive while open, null when unknown', () => {
    const open = hypothesis();
    const confirmed = hypothesis({ id: 'c', verdict: 'confirmed', decidedAt: T0 });
    const refuted = hypothesis({ id: 'r', verdict: 'refuted', decidedAt: T0 });
    const state = withHypotheses(open, confirmed, refuted);
    expect(prerequisiteVerdict(state, open.id)).toBe('inconclusive');
    expect(prerequisiteVerdict(state, 'c')).toBe('confirmed');
    expect(prerequisiteVerdict(state, 'r')).toBe('refuted');
    expect(prerequisiteVerdict(state, 'none')).toBeNull();
    expect(prerequisiteVerdict(state, 'toString')).toBeNull();
    const { hypotheses: _none, ...old } = EMPTY;
    expect(prerequisiteVerdict(old as PracticeState, open.id)).toBeNull();
  });

  it('admits a confirmed hypothesis as its candidate and one soft edge; composeGraph takes it', () => {
    const confirmed = hypothesis({ verdict: 'confirmed', decidedAt: T0 + 5 });
    const admission = discoveryExtension(withHypotheses(confirmed), confirmed.id);
    expect(admission.ok).toBe(true);
    if (!admission.ok) return;
    expect(admission.extension).toEqual({
      kind: 'prerequisite-discovery',
      id: expect.stringMatching(/^[0-9a-f]{16}$/),
      hypothesisId: confirmed.id,
      forSkillId: 'params',
      skills: [confirmed.skill],
      edges: [soft('py.dict')],
      status: 'admitted',
      confirmedAt: T0 + 5,
    });
    const composed = composeGraph(GRAPH, [admission.extension]);
    expect(composed.ok && composed.graph.skills.map((skill) => skill.id)).toContain('py.dict');
    const existing = withoutSkill(
      hypothesis({ id: 'x', skillId: 'fmt', verdict: 'confirmed', decidedAt: T0 }),
    );
    const second = discoveryExtension(withHypotheses(existing), 'x');
    expect(second.ok && second.extension.skills).toEqual([]);
  });

  it('refuses an unknown, closed, open or refuted hypothesis', () => {
    const code = (state: PracticeState, id: string) => {
      const admission = discoveryExtension(state, id);
      return admission.ok
        ? 'ok'
        : admission.issues.map((issue) => `${issue.code}@${issue.path.join('.')}`);
    };
    const open = hypothesis();
    expect(code(withHypotheses(open), 'none')).toEqual(['HYPOTHESIS_UNKNOWN@hypothesisId']);
    expect(
      code(
        withHypotheses(hypothesis({ verdict: 'confirmed', decidedAt: T0, closedAt: T0 })),
        open.id,
      ),
    ).toEqual(['HYPOTHESIS_CLOSED@hypothesisId']);
    expect(code(withHypotheses(open), open.id)).toEqual(['HYPOTHESIS_NOT_CONFIRMED@hypothesisId']);
    expect(
      code(withHypotheses(hypothesis({ verdict: 'refuted', decidedAt: T0 })), open.id),
    ).toEqual(['HYPOTHESIS_NOT_CONFIRMED@hypothesisId']);
  });
});

describe('prerequisiteReport (R14.10)', () => {
  const confirmed = (id: string, change: Partial<HypothesisState> = {}) =>
    hypothesis({ id, verdict: 'confirmed', decidedAt: T0, ...change });
  const admittedGraph = (...edges: SkillGraph['edges']): SkillGraph => ({
    ...GRAPH,
    skills: [...GRAPH.skills, node('py.dict', 'Read a dict')],
    edges: [...GRAPH.edges, ...edges],
  });
  const advice = (graph: SkillGraph, ...list: HypothesisState[]) =>
    prerequisiteReport(withHypotheses(...list), graph).map((entry) => [
      entry.hypothesisId,
      entry.advice,
    ]);

  it('advises admit, practise, keep, harden or revoke, by verdict time then id', () => {
    const graph = admittedGraph(soft('py.dict'));
    expect(advice(GRAPH, confirmed('a'))).toEqual([['a', 'admit']]);
    expect(advice(graph, confirmed('a'))).toEqual([['a', 'practise']]);
    expect(advice(graph, confirmed('a', { readyAt: T0 + 1 }))).toEqual([['a', 'keep']]);
    expect(advice(graph, confirmed('a', { readyAt: T0 + 1, blockedFailures: 1 }))).toEqual([
      ['a', 'keep'],
    ]);
    expect(advice(graph, confirmed('a', { readyAt: T0 + 1, blockedFailures: 2 }))).toEqual([
      ['a', 'revoke'],
    ]);
    expect(advice(graph, confirmed('a', { readyAt: T0 + 1, blockedPassedAt: T0 + 2 }))).toEqual([
      ['a', 'harden'],
    ]);
    const hard = admittedGraph({ ...soft('py.dict'), strength: 'hard' });
    expect(advice(hard, confirmed('a', { readyAt: T0 + 1, blockedPassedAt: T0 + 2 }))).toEqual([
      ['a', 'keep'],
    ]);
    expect(
      advice(
        graph,
        confirmed('b'),
        confirmed('a'),
        confirmed('c', { decidedAt: T0 - 1 }),
        hypothesis({ id: 'o' }),
      ),
    ).toEqual([
      ['c', 'practise'],
      ['a', 'practise'],
      ['b', 'practise'],
    ]);
    expect(
      advice(
        graph,
        confirmed('a', { closedAt: T0 + 3 }),
        hypothesis({ id: 'r', verdict: 'refuted', decidedAt: T0 }),
      ),
    ).toEqual([]);
  });

  it('carries the evidence behind the advice, and uses the configuration given', () => {
    const graph = admittedGraph(soft('py.dict'));
    const state = withHypotheses(confirmed('a', { readyAt: T0 + 1, blockedFailures: 1 }));
    expect(prerequisiteReport(state, graph)).toEqual([
      {
        hypothesisId: 'a',
        skillId: 'py.dict',
        forSkillId: 'params',
        advice: 'keep',
        confirmedAt: T0,
        readyAt: T0 + 1,
        blockedPassedAt: null,
        blockedFailures: 1,
      },
    ]);
    const config = resolveConfig({ discovery: { revokeAfter: 1 } });
    if (!config.ok) throw new Error('config');
    expect(prerequisiteReport(state, graph, config.value)[0]?.advice).toBe('revoke');
    const { hypotheses: _none, ...old } = EMPTY;
    expect(prerequisiteReport(old as PracticeState, graph)).toEqual([]);
  });
});

describe('generationRequest for a probe target (R14.6)', () => {
  const dict = node('py.dict', 'Read a dict');
  const opened = hypothesis();
  const answered = p.record(EMPTY, {
    graph: GRAPH,
    evidence: { ...EVIDENCE, id: 'e0', itemId: 'i0', at: T0 - 1 },
    item: { ...ITEM, id: 'i0' },
  });
  if (answered.kind !== 'applied') throw new Error(answered.kind);
  const act = (h: typeof opened) =>
    p.act(answered.state, GRAPH, {
      id: 'o1',
      at: T0,
      action: {
        kind: 'open-hypothesis',
        hypothesis: {
          id: h.id,
          forSkillId: h.forSkillId,
          skillId: h.skillId,
          ...(h.skill ? { skill: h.skill } : {}),
        },
      },
    });

  it('takes a new candidate from the hypothesis, in context diagnostic', () => {
    const result = act(opened);
    if (result.kind !== 'applied') throw new Error(result.kind);
    const [target] = p.plan(result.state, GRAPH, { now: T0 + 1, seed: 's', budget: {} }).targets;
    expect(target?.kind).toBe('probe');
    const built = generationRequest(
      target as never,
      { graph: GRAPH, state: result.state, now: T0 + 1 },
      { count: 2, seed: 'g' },
    );
    expect(built.target).toMatchObject({ kind: 'probe', stage: 'transfer', context: 'diagnostic' });
    expect(built.skills).toEqual([
      expect.objectContaining({
        id: 'py.dict',
        role: 'primary',
        label: dict.label,
        stage: 'transfer',
      }),
    ]);
  });

  it('takes a candidate in the graph from the graph, and refuses a new one the state does not know', () => {
    const inGraph = withoutSkill(
      hypothesis({ id: hypothesisId({ forSkillId: 'params', skillId: 'fmt' }), skillId: 'fmt' }),
    );
    const result = act(inGraph);
    if (result.kind !== 'applied') throw new Error(result.kind);
    const [target] = p.plan(result.state, GRAPH, { now: T0 + 1, seed: 's', budget: {} }).targets;
    const built = generationRequest(
      target as never,
      { graph: GRAPH, state: result.state, now: T0 + 1 },
      { count: 1, seed: 'g' },
    );
    expect(built.skills.map((skill) => [skill.id, skill.label])).toEqual([
      ['fmt', 'Format a string'],
    ]);

    const fresh = act(opened);
    if (fresh.kind !== 'applied') throw new Error(fresh.kind);
    const [probe] = p.plan(fresh.state, GRAPH, { now: T0 + 1, seed: 's', budget: {} }).targets;
    const { hypotheses: _none, ...old } = fresh.state;
    expect(() =>
      generationRequest(
        probe as never,
        { graph: GRAPH, state: old as PracticeState, now: T0 + 1 },
        { count: 1, seed: 'g' },
      ),
    ).toThrow(/target skill "py.dict" is not in the graph/);
  });
});
