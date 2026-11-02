/**
 * Ability per (skill, stage) (design §8.5, R5.6). Each stage keeps its own
 * ability, in logits on that stage's own scale. A stage with no ability yet
 * starts from the nearest stage that has one: `derive(from, shift)` with
 * `shift = stageOffset * (demand(stage) - demand(from))`, so a harder stage
 * starts lower and a confirmed ability at a lower stage counts as partial
 * evidence. A skill with no ability at any stage starts from `init` at its
 * first stage.
 */

import type { MasteryModel, MasteryObservation, SkillNode, StageId } from '../types.js';

/** What the ability functions need besides the skill. */
export interface AbilityContext {
  readonly model: MasteryModel;
  /** The skill's ladder, first stage first. */
  readonly ladder: readonly StageId[];
  /** The resolved stage demand (`graphStageDemand`), covering every stage of the ladder. */
  readonly demand: ReadonlyMap<StageId, number>;
  readonly stageOffset: number;
}

/** The stored abilities of one skill, serialized, by stage (`SkillState.ability`). */
export type StoredAbility = Readonly<Record<StageId, unknown>>;

/**
 * The model state of `skill` at `stage`: the stored one, else derived from the
 * nearest stage of the ladder that has one (ties go to the lower stage), else
 * `init` at the first stage, derived up to `stage`. Throws `RangeError` when
 * `stage` is not on the ladder or has no demand.
 */
export function abilityAt(
  stored: StoredAbility,
  skill: SkillNode,
  stage: StageId,
  context: AbilityContext,
): unknown {
  const { model, ladder } = context;
  const target = ladder.indexOf(stage);
  if (target < 0) throw new RangeError(`lk-practice: stage ${stage} is not on the ladder.`);
  let from = -1;
  for (let index = 0; index < ladder.length; index += 1) {
    if (!Object.hasOwn(stored, ladder[index] as StageId)) continue;
    if (from < 0 || Math.abs(index - target) < Math.abs(from - target)) from = index;
  }
  if (from === target) return model.deserialize(stored[stage]);
  if (from < 0 && target === 0) return model.init(skill);
  const sourceStage = ladder[Math.max(from, 0)] as StageId;
  const base = from < 0 ? model.init(skill) : model.deserialize(stored[sourceStage]);
  const shift = context.stageOffset * (demandOf(stage, context) - demandOf(sourceStage, context));
  return model.derive(base, shift);
}

/**
 * The stored abilities after one observation at `stage`. A weight of 0 is a
 * no-op and returns `stored` itself, so no derived ability is stored for it.
 */
export function updateAbility(
  stored: StoredAbility,
  skill: SkillNode,
  stage: StageId,
  observation: MasteryObservation,
  context: AbilityContext,
): StoredAbility {
  if (observation.weight === 0) return stored;
  const { model } = context;
  const next = model.update(abilityAt(stored, skill, stage, context), observation);
  return withStage(stored, stage, model.serialize(next), context.ladder);
}

/** The stored abilities after a `prior` host action at `stage` (R5.5). */
export function priorAbility(
  stored: StoredAbility,
  skill: SkillNode,
  stage: StageId,
  theta: number,
  pseudoCount: number,
  context: AbilityContext,
): StoredAbility {
  const { model } = context;
  const next = model.prior(abilityAt(stored, skill, stage, context), theta, pseudoCount);
  return withStage(stored, stage, model.serialize(next), context.ladder);
}

function demandOf(stage: StageId, context: AbilityContext): number {
  const demand = context.demand.get(stage);
  if (demand === undefined) throw new RangeError(`lk-practice: stage ${stage} has no demand.`);
  return demand;
}

/** A new record in ladder order, so equal histories give equal objects. */
function withStage(
  stored: StoredAbility,
  stage: StageId,
  value: unknown,
  ladder: readonly StageId[],
): StoredAbility {
  const next: Record<StageId, unknown> = {};
  for (const id of ladder) {
    if (id === stage) next[id] = value;
    else if (Object.hasOwn(stored, id)) next[id] = stored[id];
  }
  return Object.freeze(next);
}
