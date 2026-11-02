import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../config.js';
import type { PracticeItem, SkillEdge, SkillGraph, SkillNode } from '../../types.js';
import { validateGraph, validateItems } from '../validate.js';

const skill = (id: string, extra: Partial<SkillNode> = {}): SkillNode => ({
  id,
  knowledge: 'procedural',
  ...extra,
});
const hard = (from: string, to: string): SkillEdge => ({
  kind: 'prerequisite',
  from,
  to,
  strength: 'hard',
});
const item = (id: string, extra: Partial<PracticeItem> = {}): PracticeItem => ({
  id,
  skills: [{ skillId: 'a', weight: 1 }],
  stage: 'write',
  origin: 'authored',
  status: 'proven',
  ...extra,
});

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

const codes = (result: { ok: boolean; issues?: readonly { code: string }[] }) =>
  result.ok ? [] : (result.issues ?? []).map((issue) => issue.code);

describe('validateGraph', () => {
  it('returns the input graph, unmodified, with no warnings when it is clean', () => {
    const graph = deepFreeze<SkillGraph>({
      version: 'v1',
      skills: [skill('a'), skill('b', { tags: ['t'], label: 'B', masteryPrior: 0 })],
      edges: [hard('a', 'b')],
    });
    const before = JSON.stringify(graph);
    const result = validateGraph(graph);
    expect(result).toEqual({ ok: true, graph, warnings: [] });
    expect(result.ok && result.graph).toBe(graph);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it('gives each issue a code, a path and a message', () => {
    const result = validateGraph({
      version: '1',
      skills: [skill('a'), skill('a')],
      edges: [hard('a', 'zz')],
    });
    expect(result).toEqual({
      ok: false,
      issues: [
        { code: 'ID_DUPLICATE', path: ['skills', 1, 'id'], message: 'Skill id "a" is used twice.' },
        {
          code: 'SKILL_UNKNOWN',
          path: ['edges', 0, 'to'],
          message: 'Edge to "zz" is not a skill of the graph.',
        },
      ],
    });
  });

  it('reports every shape problem and stops there', () => {
    const result = validateGraph({
      version: 1,
      skills: [
        null,
        {
          id: '',
          knowledge: 'procedural',
          stages: 'write',
          label: 1,
          tags: [1],
          desiredRetention: '0.9',
          forms: { write: 'x' },
          interleaveGroup: undefined,
        },
      ],
      edges: [
        3,
        { kind: 'encompasses', from: 'a', to: '', weight: Number.NaN },
        { kind: 'prerequisite', from: 1, to: 'b', strength: 'firm' },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues.map((issue) => issue.path.join('.'))).toEqual([
      'version',
      'skills.0',
      'skills.1.id',
      'skills.1.stages',
      'skills.1.interleaveGroup',
      'skills.1.label',
      'skills.1.tags',
      'skills.1.desiredRetention',
      'skills.1.forms',
      'edges.0',
      'edges.1.to',
      'edges.1.weight',
      'edges.2.from',
      'edges.2.strength',
    ]);
    expect(codes(result).every((code) => code === 'SHAPE_INVALID')).toBe(true);
    expect(codes(validateGraph({ version: '1', skills: {}, edges: [] }))).toEqual([
      'SHAPE_INVALID',
    ]);
  });

  it('checks stage demand against the given configuration', () => {
    const graph: SkillGraph = {
      version: '1',
      skills: [skill('u', { stages: ['use'] })],
      edges: [],
    };
    const declared = resolveConfig({ stageDemand: { use: 2 } });
    if (!declared.ok) throw new Error('config');
    expect(validateGraph(graph, declared.value)).toEqual({ ok: true, graph, warnings: [] });
    expect(validateGraph(graph).ok && validateGraph(graph)).toMatchObject({
      warnings: [{ code: 'STAGE_DEMAND_DEFAULTED', path: ['skills', 0, 'stages', 0] }],
    });
  });

  it('checks forms against a configured ladder', () => {
    const graph: SkillGraph = {
      version: '1',
      skills: [skill('a', { forms: { debug: ['trace'] } })],
      edges: [],
    };
    expect(codes(validateGraph(graph))).toEqual(['STAGE_NOT_IN_LADDER']);
    const custom = resolveConfig({
      ladders: { procedural: ['example', 'write', 'debug'] },
      stageDemand: { debug: 4 },
    });
    if (!custom.ok) throw new Error('config');
    expect(validateGraph(graph, custom.value).ok).toBe(true);
  });

  it('does not order-check an invalid ladder twice', () => {
    expect(
      codes(
        validateGraph({ version: '1', skills: [skill('a', { stages: ['x', 'x'] })], edges: [] }),
      ),
    ).toEqual(['LADDER_INVALID']);
    expect(
      codes(
        validateGraph({ version: '1', skills: [skill('a', { stages: ['', 'x'] })], edges: [] }),
      ),
    ).toEqual(['LADDER_INVALID']);
  });

  it('names every skill of a cycle', () => {
    const result = validateGraph({
      version: '1',
      skills: [skill('c'), skill('a'), skill('b')],
      edges: [hard('c', 'a'), hard('a', 'b'), hard('b', 'c')],
    });
    expect(result.ok ? null : result.issues[0]).toEqual({
      code: 'GRAPH_CYCLE',
      path: ['edges', 0],
      message: 'The prerequisite edges form a cycle through "a", "b", "c".',
    });
  });
});

describe('validateItems', () => {
  const graph: SkillGraph = {
    version: '1',
    skills: [skill('a'), skill('b', { knowledge: 'declarative' })],
    edges: [hard('b', 'a'), { kind: 'encompasses', from: 'a', to: 'b', weight: 1 }],
  };

  it('returns the input items, unmodified', () => {
    const items = deepFreeze([
      item('i1'),
      item('i2', { skills: [{ skillId: 'b', weight: 1 }], stage: 'recall' }),
    ]);
    const result = validateItems(items, graph);
    expect(result).toEqual({ ok: true, items, warnings: [] });
    expect(result.ok && result.items).toBe(items);
  });

  it('reports shape problems per item', () => {
    const result = validateItems(
      [
        7,
        {
          id: 'x',
          skills: [{ skillId: 'a' }],
          stage: '',
          difficulty: 'hard',
          expectedSeconds: 0,
          criteria: [{ name: 'n' }],
          form: 1,
          origin: 'authored',
          status: 'draft',
          proof: 'yes',
        },
      ],
      graph,
    );
    expect(result.ok ? [] : result.issues.map((issue) => issue.path.join('.'))).toEqual([
      '0',
      '1.skills',
      '1.stage',
      '1.difficulty',
      '1.expectedSeconds',
      '1.criteria',
      '1.form',
      '1.status',
      '1.proof',
    ]);
  });

  it('takes the first of equally weighted skills as the primary', () => {
    const tied = item('i', {
      skills: [
        { skillId: 'a', weight: 0.5 },
        { skillId: 'b', weight: 0.5 },
      ],
      stage: 'write',
    });
    expect(validateItems([tied], graph).ok).toBe(true);
    const flipped = { ...tied, skills: [...tied.skills].reverse() };
    expect(codes(validateItems([flipped], graph))).toEqual(['STAGE_NOT_IN_LADDER']);
  });

  it('accepts a criterion on a listed skill and points at a bad one', () => {
    const ok = item('i', { criteria: [{ name: 'whole', skillId: 'a' }] });
    expect(validateItems([ok], graph).ok).toBe(true);
    const lone: SkillGraph = { ...graph, skills: [...graph.skills, skill('c')] };
    const bad = item('i', { criteria: [{ name: 'other', skillId: 'c' }] });
    expect(validateItems([bad], lone)).toMatchObject({
      ok: false,
      issues: [{ code: 'SKILL_NOT_IN_TASK', path: [0, 'criteria', 0, 'skillId'] }],
    });
  });

  it('uses the configured ladders', () => {
    const custom = resolveConfig({ ladders: { procedural: ['example', 'write'] } });
    if (!custom.ok) throw new Error('config');
    expect(codes(validateItems([item('i', { stage: 'complete' })], graph, custom.value))).toEqual([
      'STAGE_NOT_IN_LADDER',
    ]);
  });

  it('skips the stage rules when a skill is unknown, and still checks timing', () => {
    const bad = item('i', {
      skills: [{ skillId: 'zz', weight: 1 }],
      stage: 'nowhere',
      fluentSeconds: 9,
      slowSeconds: 3,
    });
    expect(codes(validateItems([bad], graph))).toEqual(['SKILL_UNKNOWN', 'ITEM_TIMING_ORDER']);
  });
});
