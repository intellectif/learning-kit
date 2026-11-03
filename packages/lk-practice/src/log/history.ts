/**
 * The review history of a log (R4.8, design 5.9; revised in M8), for a host
 * that fits FSRS weights itself: the package never fits them.
 */

import type {
  PracticeEvent,
  ReplayResult,
  ReviewHistoryResult,
  SkillGraph,
  StageId,
} from '../types.js';
import { type Engine, indexGraph } from './context.js';

type Review = Extract<PracticeEvent, { type: 'review.recorded' }>;

/**
 * Groups a replay's `review.recorded` events by skill and stage: skills in
 * graph order, stages in ladder order, and each group's reviews in the order
 * the replay applied them, which is `(at, seq)`. A skill or stage with no
 * review is left out. When the log does not replay, its issues come back.
 */
export function reviewHistory(
  engine: Engine,
  replayed: ReplayResult,
  graph: SkillGraph,
  learnerId: string,
): ReviewHistoryResult {
  if (!replayed.ok) return replayed;
  const groups = new Map<string, { skillId: string; stage: StageId; reviews: Review[] }>();
  for (const event of replayed.events) {
    if (event.type !== 'review.recorded') continue;
    const key = JSON.stringify([event.skillId, event.stage]);
    let group = groups.get(key);
    if (group === undefined) {
      group = { skillId: event.skillId, stage: event.stage, reviews: [] };
      groups.set(key, group);
    }
    group.reviews.push(event);
  }
  const index = indexGraph(graph, engine);
  const rank = (group: { skillId: string; stage: StageId }): [number, number] => [
    index.order.get(group.skillId) as number,
    (index.ladder(group.skillId) as readonly StageId[]).indexOf(group.stage),
  ];
  const skills = [...groups.values()]
    .sort((a, b) => {
      const [skillA, stageA] = rank(a);
      const [skillB, stageB] = rank(b);
      return skillA - skillB || stageA - stageB;
    })
    .map(({ skillId, stage, reviews }) =>
      Object.freeze({
        skillId,
        stage,
        reviews: Object.freeze(
          reviews.map(({ at, rating, evidenceId }) => Object.freeze({ at, rating, evidenceId })),
        ),
      }),
    );
  return Object.freeze({
    ok: true,
    history: Object.freeze({ learnerId, configHash: engine.hash, skills: Object.freeze(skills) }),
  });
}
