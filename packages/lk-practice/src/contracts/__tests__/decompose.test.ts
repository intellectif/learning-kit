import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../config.js';
import { hashCanonical } from '../../determinism/fnv.js';
import { deepFreeze } from '../../determinism/freeze.js';
import { composeGraph } from '../../graph/index.js';
import { createPractice } from '../../practice.js';
import type {
  DecompositionCheck,
  ExtensionApproval,
  GraphExtension,
  SkillEdge,
  SkillGraph,
} from '../../types.js';
import {
  admitExtension,
  checkDecomposition,
  DEFAULT_MAX_SKILLS,
  decompositionRequest,
  extensionId,
} from '../decompose.js';
import { BASE, EDGES, GOAL, OPTIONS, PROPOSAL, SKILLS } from './appendix.js';

const request = decompositionRequest(GOAL, BASE, OPTIONS);
const learner: ExtensionApproval = deepFreeze({ by: 'learner', at: 1000 });

const codes = (check: DecompositionCheck) =>
  check.ok ? [] : check.issues.map((issue) => `${issue.code}@${issue.path.join('.')}`);
const propose = (change: object, req = request, graph: SkillGraph = BASE) =>
  codes(checkDecomposition(req, graph, { ...PROPOSAL, ...change }));

describe('decompositionRequest', () => {
  it('gives the goal, its anchors and the skills within two edges, and no prompt', () => {
    expect(request.goal).toEqual(GOAL);
    expect(request.anchors.map((fact) => fact.id)).toEqual(['py.imports', 'py.kwargs']);
    expect(request.anchors[0]).toEqual({
      id: 'py.imports',
      knowledge: 'procedural',
      ladder: ['example', 'complete', 'write', 'transfer'],
      label: 'Imports',
    });
    expect(request.neighbours.map((fact) => fact.id)).toEqual([
      'py.basics',
      'py.classes',
      'py.decorators',
    ]);
    expect(request.neighbours[1]).toEqual({
      id: 'py.classes',
      knowledge: 'procedural',
      ladder: ['example', 'complete', 'write', 'transfer'],
    });
    expect(request.edges).toEqual(BASE.edges.slice(0, 4));
    expect(request).toMatchObject({
      version: 1,
      idPrefix: 'llm.call',
      knowledge: ['declarative', 'procedural', 'mixed'],
      ladders: {
        declarative: ['recognise', 'recall', 'produce', 'apply'],
        procedural: ['example', 'complete', 'write', 'transfer'],
      },
      maxSkills: 8,
      seed: GOAL.id,
    });
    expect(Object.isFrozen(request.anchors[0]?.ladder)).toBe(true);
    expect(JSON.stringify(request)).not.toMatch(/prompt/i);
  });

  it('defaults maxSkills to 12, takes a knowledge list and a configuration', () => {
    const resolved = resolveConfig({ ladders: { declarative: ['recall'] } });
    if (!resolved.ok) throw new Error('config');
    const other = decompositionRequest(
      { ...GOAL, anchorSkillIds: ['py.async'] },
      BASE,
      { idPrefix: 'x', seed: 's', knowledge: ['declarative'] },
      resolved.value,
    );
    expect(DEFAULT_MAX_SKILLS).toBe(12);
    expect(other.maxSkills).toBe(12);
    expect(other.knowledge).toEqual(['declarative']);
    expect(other.ladders.declarative).toEqual(['recall']);
    expect(other.neighbours.map((fact) => fact.id)).toEqual(['py.classes', 'py.decorators']);
    expect(other.edges).toEqual(BASE.edges.slice(3));
    const lone = decompositionRequest(
      { ...GOAL, anchorSkillIds: ['solo'] },
      { version: 'v', skills: [{ id: 'solo', knowledge: 'declarative' }], edges: [] },
      { idPrefix: 'x', seed: 's', maxSkills: 1 },
    );
    expect(lone.neighbours).toEqual([]);
    expect(lone.edges).toEqual([]);
  });

  it.each([
    ['no anchor', { ...GOAL, anchorSkillIds: [] }, OPTIONS],
    ['an unknown anchor', { ...GOAL, anchorSkillIds: ['py.nope'] }, OPTIONS],
    ['an empty prefix', GOAL, { ...OPTIONS, idPrefix: '' }],
    ['a prefix that is not a string', GOAL, { ...OPTIONS, idPrefix: 1 }],
    ['maxSkills 0', GOAL, { ...OPTIONS, maxSkills: 0 }],
    ['a fractional maxSkills', GOAL, { ...OPTIONS, maxSkills: 1.5 }],
    ['an empty knowledge list', GOAL, { ...OPTIONS, knowledge: [] }],
    ['an unknown knowledge type', GOAL, { ...OPTIONS, knowledge: ['tacit'] }],
    ['no seed', GOAL, { idPrefix: OPTIONS.idPrefix }],
    ['a seed that is not a string', GOAL, { ...OPTIONS, seed: 1 }],
  ])('throws a TypeError for %s', (_name, goal, options) => {
    expect(() => decompositionRequest(goal, BASE, options as never)).toThrow(TypeError);
  });
});

describe('checkDecomposition', () => {
  it('accepts the Appendix A decomposition as a proposed extension with its content id', () => {
    const check = checkDecomposition(request, BASE, PROPOSAL);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.extension).toEqual({
      id: extensionId(PROPOSAL),
      goalId: GOAL.id,
      idPrefix: 'llm.call',
      skills: SKILLS,
      edges: EDGES,
      status: 'proposed',
    });
    expect(Object.isFrozen(check.extension.skills[0])).toBe(true);
  });

  it('rejects malformed proposals as SHAPE_INVALID', () => {
    for (const value of [null, [], { skills: [] }, { ...PROPOSAL, extra: 1 }, { skills: SKILLS }]) {
      const issues = codes(checkDecomposition(request, BASE, value));
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.every((code) => code.startsWith('SHAPE_INVALID'))).toBe(true);
    }
  });

  it('rejects an edge into a base skill (R2.6)', () => {
    const into: SkillEdge = {
      kind: 'prerequisite',
      from: 'llm.call.import',
      to: 'py.imports',
      strength: 'soft',
    };
    expect(propose({ edges: [...EDGES, into] })).toEqual([
      `EXTENSION_EDGE_INTO_BASE@edges.${EDGES.length}.to`,
    ]);
  });

  it('rejects a cycle among the new skills, at the proposal path', () => {
    const back: SkillEdge = {
      kind: 'prerequisite',
      from: 'llm.call',
      to: 'llm.call.import',
      strength: 'hard',
    };
    const issues = propose({ edges: [...EDGES, back] });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((code) => code.startsWith('GRAPH_CYCLE@'))).toBe(true);
    expect(issues.some((code) => !code.includes('graph'))).toBe(true);
  });

  it('rejects too many skills, a knowledge type not allowed, and an unanchored skill', () => {
    const extra = { id: 'llm.call.stream', knowledge: 'declarative' as const };
    expect(propose({ skills: [...SKILLS, extra] })).toEqual([
      'DECOMPOSITION_TOO_MANY_SKILLS@skills',
    ]);
    const narrow = decompositionRequest(GOAL, BASE, { ...OPTIONS, knowledge: ['declarative'] });
    expect(propose({}, narrow)).toHaveLength(SKILLS.length);
    expect(propose({}, narrow)[0]).toBe('DECOMPOSITION_KNOWLEDGE_NOT_ALLOWED@skills.0.knowledge');
    const wide = decompositionRequest(GOAL, BASE, { ...OPTIONS, maxSkills: 9 });
    expect(propose({ skills: [...SKILLS, extra] }, wide)).toEqual([
      'DECOMPOSITION_UNANCHORED@skills.8.id',
    ]);
  });

  it('rejects an id outside the prefix or already in the graph', () => {
    const outside = { id: 'other', knowledge: 'procedural' as const };
    const known = { id: 'llm.call.x', knowledge: 'procedural' as const };
    const graph = { ...BASE, skills: [...BASE.skills, known] };
    const wide = decompositionRequest(GOAL, graph, { ...OPTIONS, maxSkills: 10 });
    const issues = propose({ skills: [...SKILLS, outside, known] }, wide, graph);
    expect(issues).toContain('EXTENSION_ID_OUTSIDE_PREFIX@skills.8.id');
    expect(issues.some((code) => code.startsWith('ID_DUPLICATE@skills.9'))).toBe(true);
  });

  it('puts an issue the base graph raises under graph', () => {
    const broken: SkillGraph = {
      ...BASE,
      skills: [...BASE.skills, { id: 'py.bad', knowledge: 'declarative', stages: ['a', 'a'] }],
    };
    const issues = propose({}, decompositionRequest(GOAL, broken, OPTIONS), broken);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((code) => code.includes('@graph.'))).toBe(true);
  });

  it('puts an issue on a base edge under graph, and an anchor with no edges reaches nothing', () => {
    const broken: SkillGraph = {
      ...BASE,
      edges: [...BASE.edges, { kind: 'encompasses', from: 'py.basics', to: 'py.async', weight: 2 }],
    };
    const issues = propose({}, decompositionRequest(GOAL, broken, OPTIONS), broken);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((code) => code.includes(`@graph.edges.${BASE.edges.length}`))).toBe(true);
    const resolved = resolveConfig({});
    if (!resolved.ok) throw new Error('config');
    const handMade = {
      ...resolved.value,
      ladders: { ...resolved.value.ladders, declarative: ['zz', 'recognise'] },
    };
    const top = codes(checkDecomposition(request, BASE, PROPOSAL, handMade));
    expect(top.length).toBeGreaterThan(0);
    expect(top.every((code) => code.includes('@graph.config'))).toBe(true);
    const lone: SkillGraph = {
      version: 'v',
      skills: [
        { id: 'solo', knowledge: 'declarative' },
        { id: 'odd', knowledge: 'mixed' },
      ],
      edges: [],
    };
    const loneRequest = decompositionRequest({ ...GOAL, anchorSkillIds: ['odd'] }, lone, {
      idPrefix: 'x',
      seed: 's',
    });
    expect(loneRequest.anchors[0]?.ladder).toEqual([]);
    const fine: SkillGraph = { ...lone, skills: [lone.skills[0] as never] };
    const fineRequest = decompositionRequest({ ...GOAL, anchorSkillIds: ['solo'] }, fine, {
      idPrefix: 'x',
      seed: 's',
    });
    expect(
      codes(
        checkDecomposition(fineRequest, fine, {
          skills: [{ id: 'x.a', knowledge: 'declarative' }],
          edges: [],
        }),
      ),
    ).toEqual(['DECOMPOSITION_UNANCHORED@skills.0.id']);
  });

  it('puts an issue on a proposed skill or edge at its own index', () => {
    const issues = propose({
      skills: [SKILLS[0], { ...SKILLS[1], stages: ['a', 'a'] }, ...SKILLS.slice(2)],
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((code) => code.includes('@skills.1'))).toBe(true);
    const edge = propose({
      edges: [...EDGES, { kind: 'encompasses', from: 'llm.call', to: 'py.basics', weight: 0.5 }],
    });
    expect(edge).toEqual([`EXTENSION_EDGE_INTO_BASE@edges.${EDGES.length}.to`]);
  });

  it('is total: a candidate that is not JSON gives SHAPE_INVALID', () => {
    const cyclic: Record<string, unknown> = { skills: SKILLS };
    cyclic.edges = [cyclic];
    expect(codes(checkDecomposition(request, BASE, cyclic))[0]).toMatch(/^SHAPE_INVALID/);
    const skills: unknown[] = [...SKILLS];
    skills.length += 1;
    expect(codes(checkDecomposition(request, BASE, { skills, edges: EDGES }))).toEqual([
      `SHAPE_INVALID@skills.${SKILLS.length}`,
    ]);
  });
});

describe('admitExtension', () => {
  const proposed = (checkDecomposition(request, BASE, PROPOSAL) as { extension: GraphExtension })
    .extension;
  const admitCodes = (...args: Parameters<typeof admitExtension>) => {
    const result = admitExtension(...args);
    return result.ok ? [] : result.issues.map((issue) => `${issue.code}@${issue.path.join('.')}`);
  };

  it('admits a proposed extension with its approval, and composeGraph takes it', () => {
    const admitted = admitExtension(proposed, learner);
    expect(admitted).toEqual({
      ok: true,
      extension: { ...proposed, status: 'admitted', approval: learner },
    });
    if (!admitted.ok) return;
    expect(Object.isFrozen(admitted.extension.approval)).toBe(true);
    const composed = composeGraph(BASE, [admitted.extension]);
    expect(composed.ok).toBe(true);
    const human = admitExtension(
      proposed,
      { by: 'human', at: 1, approverId: 'h1' },
      {
        allowLearner: false,
      },
    );
    expect(human.ok).toBe(true);
  });

  it('names the content, not who approved it or why: the id is the §5.5 content hash', () => {
    const reordered = { skills: [...SKILLS].reverse(), edges: [...EDGES].reverse() };
    expect(extensionId(reordered)).toBe(proposed.id);
    const sorted = [...SKILLS].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const edges = [...EDGES]
      .map((edge) => ({
        edge,
        key: JSON.stringify(Object.fromEntries(Object.entries(edge).sort())),
      }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map(({ edge }) => edge);
    expect(proposed.id).toBe(hashCanonical({ skills: sorted, edges }));
    const other = decompositionRequest({ ...GOAL, id: 'goal.other' }, BASE, OPTIONS);
    const again = checkDecomposition(other, BASE, PROPOSAL);
    expect(again.ok && again.extension.id).toBe(proposed.id);
  });

  it('rejects an admitted extension, a changed one, and a learner where not allowed', () => {
    expect(admitCodes({ ...proposed, status: 'admitted' }, learner)).toEqual([
      'EXTENSION_NOT_PROPOSED@extension.status',
    ]);
    expect(admitCodes({ ...proposed, skills: SKILLS.slice(0, 7) }, learner)).toEqual([
      'EXTENSION_ID_MISMATCH@extension.id',
    ]);
    expect(admitCodes(proposed, learner, { allowLearner: false })).toEqual([
      'EXTENSION_LEARNER_NOT_ALLOWED@approval.by',
    ]);
    expect(admitCodes(proposed, learner, {})).toEqual([]);
  });

  it('rejects a malformed extension or approval under its own path', () => {
    const issues = admitCodes({ ...proposed, status: 'maybe' } as never, { by: 'robot' } as never);
    expect(issues.some((code) => code.startsWith('SHAPE_INVALID@extension'))).toBe(true);
    expect(issues.some((code) => code.startsWith('SHAPE_INVALID@approval'))).toBe(true);
    expect(admitCodes(null as never, null as never)).toHaveLength(2);
  });

  it('a graph change makes record refuse the old state, and a full replay rebuilds it', () => {
    const practice = createPractice();
    const admitted = admitExtension(proposed, learner);
    if (!admitted.ok) throw new Error('not admitted');
    const composed = composeGraph(BASE, [admitted.extension]);
    if (!composed.ok) throw new Error('not composed');
    const evidence = {
      id: 'e1',
      itemId: 'i1',
      at: 1000,
      source: { kind: 'auto', score: 1, maxScore: 1, passed: true },
    } as const;
    const item = {
      id: 'i1',
      skills: [{ skillId: 'py.imports', weight: 1 }],
      stage: 'example',
      origin: 'authored',
      status: 'proven',
    } as const;
    const first = practice.record(practice.initState('l1', BASE), { graph: BASE, evidence, item });
    if (first.kind !== 'applied') throw new Error(first.kind);
    const stale = practice.record(first.state, {
      graph: composed.graph,
      evidence: { ...evidence, id: 'e2', at: 2000 },
      item,
    });
    expect(stale).toMatchObject({ kind: 'rejected', issues: [{ code: 'GRAPH_VERSION_MISMATCH' }] });
    const replayed = practice.replay(first.appended, composed.graph, 'l1');
    expect(replayed.ok && replayed.state.graphVersion).toBe(composed.graph.version);
    expect(replayed.ok && Object.keys(replayed.state.skills)).toContain('py.imports');
  });
});
