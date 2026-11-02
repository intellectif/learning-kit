/**
 * What every transition needs besides the state and the entry: the bound
 * models (`Engine`, built once by `createPractice`) and a per-call index of
 * the graph (`GraphIndex`), so no step scans the graph twice.
 */

import { configHash } from '../config.js';
import { mapEvidence } from '../evidence/index.js';
import { graphStageDemand, ladderOf } from '../graph/index.js';
import type { MasteryContext } from '../mastery/index.js';
import { eloMasteryModel } from '../mastery/index.js';
import { fsrsMemoryModel } from '../memory/index.js';
import { createStagePolicy } from '../stage/index.js';
import type {
  EvidenceMapper,
  MasteryModel,
  MemoryModel,
  PracticeConfig,
  ResolvedPracticeConfig,
  SkillGraph,
  SkillNode,
  StageId,
  StagePolicy,
} from '../types.js';

export interface Engine {
  readonly config: ResolvedPracticeConfig;
  readonly hash: string;
  readonly memory: MemoryModel;
  readonly mastery: MasteryModel;
  readonly policy: StagePolicy;
  readonly mapper: Pick<EvidenceMapper, 'map'>;
  /** The built-in mapper does not read the learner's states, so none are built for it. */
  readonly builtinMapper: boolean;
}

/** Binds the models of a configuration that `resolveConfig` accepted. */
export function createEngine(input: PracticeConfig, config: ResolvedPracticeConfig): Engine {
  const options = config.stagePolicyOptions;
  return {
    config,
    hash: configHash(config),
    memory: input.memoryModel ?? fsrsMemoryModel(),
    mastery: input.masteryModel ?? eloMasteryModel(),
    policy: input.stagePolicy ?? createStagePolicy(options as NonNullable<typeof options>),
    mapper: input.evidenceMapper ?? { map: mapEvidence },
    builtinMapper: input.evidenceMapper === undefined,
  };
}

export interface GraphIndex {
  readonly graph: SkillGraph;
  readonly nodes: ReadonlyMap<string, SkillNode>;
  /** Graph order of each skill. */
  readonly order: ReadonlyMap<string, number>;
  readonly demand: ReadonlyMap<StageId, number>;
  /** The skill's ladder; null for a `mixed` skill without `stages` (rejected by `validateGraph`). */
  ladder(skillId: string): readonly StageId[] | null;
  readonly hardPrerequisites: ReadonlyMap<string, readonly string[]>;
  readonly hardDependents: ReadonlyMap<string, readonly string[]>;
  /** The mastery context of a skill with a ladder. */
  mastery(skillId: string): MasteryContext;
}

/** Indexes a graph that `validateGraph` accepted. */
export function indexGraph(graph: SkillGraph, engine: Engine): GraphIndex {
  const nodes = new Map<string, SkillNode>();
  const order = new Map<string, number>();
  graph.skills.forEach((skill, index) => {
    nodes.set(skill.id, skill);
    order.set(skill.id, index);
  });
  const prerequisites = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'prerequisite' || edge.strength !== 'hard') continue;
    push(prerequisites, edge.to, edge.from);
    push(dependents, edge.from, edge.to);
  }
  const { demand } = graphStageDemand(graph, engine.config);
  const ladders = new Map<string, readonly StageId[] | null>();
  const contexts = new Map<string, MasteryContext>();
  const ladder = (skillId: string): readonly StageId[] | null => {
    let found = ladders.get(skillId);
    if (found === undefined) {
      const node = nodes.get(skillId);
      found = node === undefined ? null : ladderOf(node, engine.config);
      ladders.set(skillId, found);
    }
    return found;
  };
  return {
    graph,
    nodes,
    order,
    demand,
    ladder,
    hardPrerequisites: prerequisites,
    hardDependents: dependents,
    mastery(skillId) {
      let context = contexts.get(skillId);
      if (context === undefined) {
        context = {
          model: engine.mastery,
          memoryModel: engine.memory,
          config: engine.config,
          ladder: ladder(skillId) ?? [],
          demand,
          stageOffset: engine.config.ability.stageOffset,
        };
        contexts.set(skillId, context);
      }
      return context;
    },
  };
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}
