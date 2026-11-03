/**
 * Prerequisite hypotheses and the graph (R14; revised in M12): the content id
 * of a hypothesis, and the graph its probes are checked and planned against.
 */

import { hashCanonical } from '../determinism/fnv.js';
import type { PrerequisiteHypothesis, SkillGraph } from '../types.js';

type Content = Pick<PrerequisiteHypothesis, 'forSkillId' | 'skillId' | 'skill'>;

/**
 * The content id of a hypothesis (R14.4): `fnv1a64` of the canonical JSON of
 * its blocked skill, its candidate and the candidate's node when it is new.
 * The rationale does not count, so the same hypothesis worded twice has one id.
 */
export function hypothesisId(hypothesis: Content): string {
  return hashCanonical({
    forSkillId: hypothesis.forSkillId,
    skillId: hypothesis.skillId,
    skill: hypothesis.skill ?? null,
  });
}

/**
 * The graph a hypothesis's probes are checked and planned against (R14.6):
 * `graph`, plus the candidate as a node with no edge when it is new to it. The
 * version is unchanged: the result is never a learner's graph, only the
 * frame in which a probe item is validated, so a new candidate is probed
 * without composing or admitting anything.
 */
export function probeGraph(graph: SkillGraph, hypothesis: Content): SkillGraph {
  const { skill } = hypothesis;
  if (skill === undefined || graph.skills.some((node) => node.id === skill.id)) return graph;
  return { version: graph.version, skills: [...graph.skills, skill], edges: graph.edges };
}
