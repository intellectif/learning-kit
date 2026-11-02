import { describe, expect, it } from 'vitest';
import type { Evidence, SkillGraph, TaskSnapshot } from '../../types.js';
import { selectSkills, skillOutcomeIssues } from '../skills.js';

const GRAPH: SkillGraph = {
  version: '1',
  skills: ['a', 'b', 'c', 'd', 'e', 'x'].map((id) => ({ id, knowledge: 'declarative' as const })),
  edges: [
    { kind: 'encompasses', from: 'a', to: 'c', weight: 1 },
    { kind: 'encompasses', from: 'a', to: 'e', weight: 1 },
    { kind: 'encompasses', from: 'c', to: 'd', weight: 1 },
    { kind: 'prerequisite', from: 'x', to: 'a', strength: 'hard' },
  ],
} as never;

const TASK: TaskSnapshot = {
  itemId: 'i',
  skills: [
    { skillId: 'a', weight: 0.8 },
    { skillId: 'b', weight: 0.2 },
  ],
  stage: 'recall',
  difficulty: 0,
  origin: 'authored',
};

function withOutcomes(...skillIds: string[]): Evidence {
  return {
    id: 'e',
    itemId: 'i',
    at: 0,
    source: { kind: 'auto', score: 1, maxScore: 1, passed: true },
    skillOutcomes: skillIds.map((skillId) => ({ skillId, score: 1, maxScore: 1 })),
  };
}

describe('skillOutcomeIssues', () => {
  it('accepts task skills and their transitive components', () => {
    expect(skillOutcomeIssues(withOutcomes('a', 'b', 'c', 'd', 'e'), TASK, GRAPH)).toEqual([]);
    const { skillOutcomes: _none, ...bare } = withOutcomes();
    expect(skillOutcomeIssues(bare, TASK, GRAPH)).toEqual([]);
    // A component that is also a task skill, and one reached twice.
    const both = {
      ...TASK,
      skills: [
        { skillId: 'c', weight: 0.5 },
        { skillId: 'a', weight: 0.5 },
      ],
    };
    const diamond = {
      ...GRAPH,
      edges: [...GRAPH.edges, { kind: 'encompasses', from: 'e', to: 'd', weight: 1 }],
    } as never;
    expect(skillOutcomeIssues(withOutcomes('d'), both, diamond)).toEqual([]);
  });

  it('accepts a skill the criteria name', () => {
    const task = { ...TASK, criteria: [{ name: 'q1', skillId: 'x' }] };
    expect(skillOutcomeIssues(withOutcomes('x'), task, GRAPH)).toEqual([]);
  });

  it('rejects any other skill, with its path', () => {
    const issues = skillOutcomeIssues(withOutcomes('a', 'x', 'zz'), TASK, GRAPH);
    expect(issues.map((issue) => [issue.code, issue.path])).toEqual([
      ['SKILL_NOT_IN_TASK', ['skillOutcomes', 1, 'skillId']],
      ['SKILL_NOT_IN_TASK', ['skillOutcomes', 2, 'skillId']],
    ]);
    expect(issues[0]?.message).toContain('"x"');
    // A prerequisite is not a component; a component of a non-task skill is not either.
    const task = { ...TASK, skills: [{ skillId: 'c', weight: 1 }] };
    expect(skillOutcomeIssues(withOutcomes('d', 'e'), task, GRAPH)).toHaveLength(1);
  });
});

describe('selectSkills', () => {
  it('selects outcomes, not-assessed and overall in task order, then components', () => {
    const task = {
      ...TASK,
      skills: [...TASK.skills, { skillId: 'e', weight: 0 }],
      criteria: [{ name: 'k', skillId: 'b' }],
    };
    const selections = selectSkills(withOutcomes('c', 'e'), task, 0.3, true);
    expect(selections).toEqual([
      { skillId: 'a', kind: 'overall', itemWeight: 0.8, memory: true },
      { skillId: 'b', kind: 'not-assessed' },
      { skillId: 'e', kind: 'outcome', outcome: { skillId: 'e', score: 1, maxScore: 1 } },
      { skillId: 'c', kind: 'outcome', outcome: { skillId: 'c', score: 1, maxScore: 1 } },
    ]);
    expect(selectSkills(withOutcomes('c', 'e'), task, 0.3, false).map((s) => s.kind)).toEqual([
      'overall',
      'not-assessed',
      'overall',
    ]);
  });

  it('applies the weight floor at its value', () => {
    expect(selectSkills(withOutcomes(), TASK, 0.2, true)[1]).toEqual({
      skillId: 'b',
      kind: 'overall',
      itemWeight: 0.2,
      memory: true,
    });
    expect(selectSkills(withOutcomes(), TASK, 0.21, true)[1]).toMatchObject({ memory: false });
  });
});
