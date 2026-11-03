import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../determinism/canonical.js';
import { fnv1a64 } from '../../determinism/fnv.js';
import type { DiscoveryExtension, GraphExtension, SkillGraph } from '../../types.js';
import { composeGraph, extensionIssues, isUnderPrefix } from '../extension.js';

const base: SkillGraph = {
  version: 'b1',
  skills: [
    { id: 'a', knowledge: 'procedural' },
    { id: 'b', knowledge: 'declarative' },
  ],
  edges: [{ kind: 'prerequisite', from: 'a', to: 'b', strength: 'hard' }],
};

const extension = (
  id: string,
  prefix: string,
  extra: Partial<GraphExtension> = {},
): GraphExtension => ({
  id,
  goalId: `goal-${id}`,
  idPrefix: prefix,
  skills: [{ id: prefix, knowledge: 'procedural' }],
  edges: [{ kind: 'prerequisite', from: 'a', to: prefix, strength: 'hard' }],
  status: 'admitted',
  ...extra,
});

describe('isUnderPrefix', () => {
  it('accepts the prefix itself and dotted children only', () => {
    expect(isUnderPrefix('x', 'x')).toBe(true);
    expect(isUnderPrefix('x.y.z', 'x')).toBe(true);
    expect(isUnderPrefix('xy', 'x')).toBe(false);
    expect(isUnderPrefix('y.x', 'x')).toBe(false);
  });
});

describe('composeGraph', () => {
  it('returns the base unchanged with no extensions', () => {
    expect(composeGraph(base, [])).toEqual({ ok: true, graph: base, warnings: [] });
  });

  it('derives the version from the sorted extension ids', () => {
    const one = extension('e2', 'p');
    const two = extension('e1', 'q');
    const forward = composeGraph(base, [one, two]);
    const backward = composeGraph(base, [two, one]);
    expect(forward.ok && forward.graph.version).toBe(`b1+${fnv1a64(canonicalJson(['e1', 'e2']))}`);
    expect(backward).toEqual(forward);
    // Skills and edges come in base order, then extension id order.
    expect(forward.ok && forward.graph.skills.map((skill) => skill.id)).toEqual([
      'a',
      'b',
      'q',
      'p',
    ]);
  });

  it('changes the version with the set of extensions', () => {
    const one = composeGraph(base, [extension('e1', 'p')]);
    const two = composeGraph(base, [extension('e1', 'p'), extension('e2', 'q')]);
    expect(one.ok && two.ok && one.graph.version !== two.graph.version).toBe(true);
  });

  it('reports extension issues at the extension as passed', () => {
    const result = composeGraph(base, [
      extension('z', 'p'),
      extension('a', 'q', { status: 'proposed' }),
    ]);
    expect(result).toEqual({
      ok: false,
      issues: [
        {
          code: 'EXTENSION_NOT_ADMITTED',
          path: ['extensions', 1, 'status'],
          message: 'Extension "a" is proposed; only admitted extensions are composed.',
        },
      ],
    });
  });

  it('allows edges among its own skills and from base skills only', () => {
    const own = extension('e', 'p', {
      skills: [
        { id: 'p', knowledge: 'procedural' },
        { id: 'p.c', knowledge: 'procedural' },
      ],
      edges: [
        { kind: 'prerequisite', from: 'p.c', to: 'p', strength: 'soft' },
        { kind: 'encompasses', from: 'p', to: 'p.c', weight: 1 },
        { kind: 'prerequisite', from: 'b', to: 'p.c', strength: 'hard' },
      ],
    });
    expect(extensionIssues(base, own, [])).toEqual([]);
    expect(composeGraph(base, [own]).ok).toBe(true);
  });

  it('reports union problems at their place in the composed graph', () => {
    const cyclic = extension('e', 'p', {
      skills: [
        { id: 'p', knowledge: 'procedural' },
        { id: 'p.c', knowledge: 'procedural' },
      ],
      edges: [
        { kind: 'prerequisite', from: 'p', to: 'p.c', strength: 'hard' },
        { kind: 'prerequisite', from: 'p.c', to: 'p', strength: 'hard' },
      ],
    });
    expect(composeGraph(base, [cyclic])).toMatchObject({
      ok: false,
      issues: [{ code: 'GRAPH_CYCLE', path: ['edges', 1] }],
    });
  });
});

describe('composeGraph with prerequisite-discovery extensions (R2.6, R14.8; revised in M12)', () => {
  const discovery = (id: string, extra: Partial<DiscoveryExtension> = {}): DiscoveryExtension => ({
    kind: 'prerequisite-discovery',
    id,
    hypothesisId: `h-${id}`,
    forSkillId: 'b',
    skills: [{ id: 'n', knowledge: 'procedural' }],
    edges: [{ kind: 'prerequisite', from: 'n', to: 'b', strength: 'soft' }],
    status: 'admitted',
    confirmedAt: 0,
    ...extra,
  });
  const codes = (...extensions: (GraphExtension | DiscoveryExtension)[]) => {
    const result = composeGraph(base, extensions);
    return result.ok ? [] : result.issues.map((issue) => `${issue.code}@${issue.path.join('.')}`);
  };

  it('adds one skill and one soft edge into a base skill, or one soft edge from a base skill', () => {
    const composed = composeGraph(base, [discovery('d1')]);
    expect(composed.ok && composed.graph.skills.map((skill) => skill.id)).toEqual(['a', 'b', 'n']);
    expect(composed.ok && composed.graph.edges.at(-1)).toEqual({
      kind: 'prerequisite',
      from: 'n',
      to: 'b',
      strength: 'soft',
    });
    const reversed: SkillGraph = { ...base, edges: [] };
    const fromBase = composeGraph(reversed, [
      discovery('d2', {
        skills: [],
        edges: [{ kind: 'prerequisite', from: 'b', to: 'a', strength: 'soft' }],
        forSkillId: 'a',
      }),
    ]);
    expect(fromBase.ok).toBe(true);
  });

  it('takes the same new skill from two extensions once; a different one with its id is a duplicate', () => {
    const forA = discovery('d2', {
      forSkillId: 'a',
      edges: [{ kind: 'prerequisite', from: 'n', to: 'a', strength: 'soft' }],
    });
    const composed = composeGraph(base, [discovery('d1'), forA]);
    expect(composed.ok && composed.graph.skills.map((skill) => skill.id)).toEqual(['a', 'b', 'n']);
    const other = { ...forA, skills: [{ id: 'n', knowledge: 'declarative' as const }] };
    expect(codes(discovery('d1'), other)).toEqual(['ID_DUPLICATE@skills.3.id']);
    // A goal extension's skill is never shared, even with the same content, in either order.
    const goal = extension('g1', 'n', { skills: [{ id: 'n', knowledge: 'procedural' }] });
    expect(codes(goal, discovery('h1'))).toEqual(['ID_DUPLICATE@skills.3.id']);
    expect(codes(goal, discovery('f1'))).toEqual(['ID_DUPLICATE@skills.3.id']);
  });

  it('reports each broken rule at the extension as passed', () => {
    expect(codes(discovery('d1', { status: 'proposed' as never }))).toEqual([
      'EXTENSION_NOT_ADMITTED@extensions.0.status',
    ]);
    expect(
      codes(
        discovery('d1', {
          skills: [
            { id: 'n', knowledge: 'procedural' },
            { id: 'm', knowledge: 'procedural' },
          ],
        }),
      ),
    ).toEqual(['DISCOVERY_EDGE_INVALID@extensions.0.skills']);
    expect(
      codes(
        discovery('d1', {
          skills: [{ id: 'a', knowledge: 'procedural' }],
          edges: [{ kind: 'prerequisite', from: 'a', to: 'b', strength: 'soft' }],
        }),
      ),
    ).toEqual([
      'ID_DUPLICATE@extensions.0.skills.0.id',
      'DISCOVERY_EDGE_EXISTS@extensions.0.edges.0',
    ]);
    const edges = (list: DiscoveryExtension['edges']) => codes(discovery('d1', { edges: list }));
    expect(edges([])).toEqual(['DISCOVERY_EDGE_INVALID@extensions.0.edges']);
    const soft = { kind: 'prerequisite' as const, from: 'n', to: 'b', strength: 'soft' as const };
    expect(edges([soft, { ...soft, from: 'a' }])).toEqual([
      'DISCOVERY_EDGE_INVALID@extensions.0.edges',
    ]);
    expect(edges([{ kind: 'encompasses', from: 'n', to: 'b', weight: 1 }])).toEqual([
      'DISCOVERY_EDGE_INVALID@extensions.0.edges',
    ]);
    expect(edges([{ ...soft, strength: 'hard' }])).toEqual([
      'DISCOVERY_EDGE_INVALID@extensions.0.edges',
    ]);
    expect(edges([{ ...soft, to: 'a' }])).toEqual(['DISCOVERY_EDGE_INVALID@extensions.0.edges']);
    expect(
      codes(
        discovery('d1', {
          forSkillId: 'z',
          edges: [{ ...soft, from: 'q', to: 'z' }],
        }),
      ),
    ).toEqual(['SKILL_UNKNOWN@extensions.0.edges.0.to', 'SKILL_UNKNOWN@extensions.0.edges.0.from']);
    expect(
      codes(
        discovery('d1', {
          skills: [],
          edges: [{ kind: 'prerequisite', from: 'a', to: 'b', strength: 'soft' }],
        }),
      ),
    ).toEqual(['DISCOVERY_EDGE_EXISTS@extensions.0.edges.0']);
  });
});
