/** Shared fixtures for the planner tests. */

import { evidence, item, pass, type Step } from '../../log/__tests__/fixtures.js';
import type {
  EvidenceSource,
  PlanRequest,
  Practice,
  PracticeState,
  SessionPlan,
  SkillGraph,
} from '../../types.js';

export { DAY, fail, GRAPH, item, pass, practice, run, T0 } from '../../log/__tests__/fixtures.js';

/** A request at `now` with an open budget. */
export function request(now: number, extra: Partial<PlanRequest> = {}): PlanRequest {
  return { now, seed: 's', budget: {}, ...extra };
}

/** One evidence step for `skillId` at `stage`, through an item named after the step. */
export function review(
  id: string,
  skillId: string,
  stage: string,
  at: number,
  source: EvidenceSource = pass,
): Step {
  return {
    evidence: evidence(id, `${id}-item`, at, source),
    item: item(`${id}-item`, skillId, stage),
  };
}

/** The skill ids of each target, in order, as `kind:ids@stage`. */
export function shape(plan: SessionPlan): string[] {
  return plan.targets.map(
    (target) => `${target.kind}:${target.skillIds.join('+')}@${target.stage}`,
  );
}

/** Plans `state` against `graph` with `request`. */
export function planOf(
  p: Practice,
  state: PracticeState,
  graph: SkillGraph,
  req: PlanRequest,
): SessionPlan {
  return p.plan(state, graph, req);
}
