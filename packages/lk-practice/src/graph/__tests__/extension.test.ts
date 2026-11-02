import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../determinism/canonical.js';
import { fnv1a64 } from '../../determinism/fnv.js';
import type { GraphExtension, SkillGraph } from '../../types.js';
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
