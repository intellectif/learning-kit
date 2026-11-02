/**
 * The built-in evidence mapper (design §8.1, R7.2 to R7.4): one attempt to
 * one effect per skill it updates, with the rating for the memory, `correct`
 * and `weight` for the ability, and whether the memory takes a review.
 *
 * The mapper does not apply the context weight to the ability (replay
 * multiplies by `contextWeight`, §8.1), nor the implication rule (the stage
 * policy), nor anything that needs the learner's state.
 */

import { PracticeConfigError } from '../errors.js';
import type {
  Evidence,
  EvidenceOptions,
  HeldEvidence,
  MappedEvidence,
  Rating,
  ResolvedPracticeConfig,
  SkillEffect,
  SkillStatesView,
  TaskSnapshot,
} from '../types.js';
import { type SkillSelection, selectSkills } from './skills.js';

type Options = Required<EvidenceOptions>;
type Graded = Extract<Evidence['source'], { readonly kind: 'auto' | 'ai' | 'human' }>;

/** Why evidence is held (R7.2), or null when it is applied now. */
export function heldReason(evidence: Evidence): HeldEvidence['reason'] | null {
  const { source } = evidence;
  if (source.kind === 'pending') return source.reason;
  if (source.kind !== 'ai') return null;
  if (source.requiresHumanReview === true) return 'human-review';
  return source.confidence === 'low' ? 'low-confidence' : null;
}

/** The ability weight of a context (R7.3): `practice` and `exam` 1. */
export function contextWeight(
  context: Evidence['context'],
  config: ResolvedPracticeConfig,
): number {
  if (context === 'diagnostic') return config.contexts.diagnosticWeight;
  if (context === 'pretest') return config.contexts.pretestWeight;
  return 1;
}

/**
 * The built-in mapper. Throws `PracticeConfigError` (`CONFIG_CONFLICT`) when
 * the configuration names a custom mapper, so `evidenceOptions` is null.
 * `skills` is accepted for the mapper port and not read: the built-in mapping
 * does not depend on the learner's state.
 */
export function mapEvidence(
  evidence: Evidence,
  task: TaskSnapshot,
  _skills: SkillStatesView,
  config: ResolvedPracticeConfig,
): MappedEvidence {
  const options = config.evidenceOptions;
  if (options === null) {
    throw new PracticeConfigError([
      {
        code: 'CONFIG_CONFLICT',
        path: ['evidenceOptions'],
        message:
          'mapEvidence is the built-in mapper, and the configuration names a custom evidence mapper.',
      },
    ]);
  }
  const { source } = evidence;
  if (heldReason(evidence) !== null) return result(true, blank(task, 'held'));
  if (source.kind === 'exposure') return result(false, blank(task, 'exposure'));
  const graded = source.kind !== 'self' && source.kind !== 'pending' ? source : null;
  const selections = selectSkills(evidence, task, config.memoryWeightFloor, graded !== null);
  const sourceWeight = graded === null ? options.selfWeight : gradedWeight(graded, options);
  const perSkill = selections.map((selection) => {
    const effect = rate(selection, evidence, task, graded, sourceWeight, options);
    return adjustMemory(effect, evidence, config);
  });
  return result(false, perSkill);
}

function result(held: boolean, perSkill: SkillEffect[]): MappedEvidence {
  return Object.freeze({ held, perSkill: Object.freeze(perSkill.map((e) => Object.freeze(e))) });
}

function blank(task: TaskSnapshot, reason: 'held' | 'exposure'): SkillEffect[] {
  return task.skills.map((entry) => ({
    skillId: entry.skillId,
    rating: null,
    correct: 0,
    weight: 0,
    memory: 'none',
    reason,
  }));
}

function gradedWeight(source: Graded, options: Options): number {
  return source.kind === 'ai' && source.confidence === 'medium' ? options.aiMediumWeight : 1;
}

function rate(
  selection: SkillSelection,
  evidence: Evidence,
  task: TaskSnapshot,
  graded: Graded | null,
  sourceWeight: number,
  options: Options,
): SkillEffect {
  const { skillId } = selection;
  if (selection.kind === 'not-assessed') {
    return { skillId, rating: null, correct: 0, weight: 0, memory: 'none', reason: 'not-assessed' };
  }
  if (selection.kind === 'outcome') {
    // Outcomes are selected for graded sources only.
    const { outcome } = selection;
    const passed = outcome.passed ?? outcome.score === outcome.maxScore;
    return {
      skillId,
      rating: gradedRating(passed, evidence, task, graded as Graded),
      correct: ratio(outcome.score, outcome.maxScore, passed),
      weight: sourceWeight,
      memory: 'review',
      reason: 'outcome',
    };
  }
  const weight = sourceWeight * selection.itemWeight;
  const memory = selection.memory ? 'review' : 'none';
  const reason = selection.memory ? 'overall' : 'below-weight-floor';
  if (graded === null) {
    const rating = (evidence.source as { readonly rating: Rating }).rating;
    return { skillId, rating, correct: options.selfCorrect[rating], weight, memory, reason };
  }
  const { rating, correct } = overall(graded, evidence, task, options);
  return { skillId, rating, correct, weight, memory, reason };
}

/** The overall outcome of a graded source: the R7.2 rows for `auto`, `ai` and `human`. */
function overall(
  source: Graded,
  evidence: Evidence,
  task: TaskSnapshot,
  options: Options,
): { rating: Rating; correct: number } {
  if (source.kind === 'auto' && source.checks !== undefined) {
    const { checks } = source;
    const fraction = checks.total > 0 ? clamp(checks.passed / checks.total) : 0;
    const passed = fraction >= options.checksPassFraction;
    return { rating: gradedRating(passed, evidence, task, source), correct: fraction };
  }
  const rating = gradedRating(source.passed, evidence, task, source);
  const firstTry = source.passed && !retried(evidence);
  return {
    rating,
    correct: firstTry ? 1 : ratio(source.score, source.maxScore, source.passed),
  };
}

/**
 * R7.2: not passed `again`; passed after hints or failed attempts `hard`;
 * passed first try `good`, `easy` at or under `fluentSeconds` (never for `ai`
 * at medium confidence), `hard` above `slowSeconds`. The timing rows apply only
 * when both `durationMs` and the task's threshold are set.
 */
function gradedRating(
  passed: boolean,
  evidence: Evidence,
  task: TaskSnapshot,
  source: Graded,
): Rating {
  if (!passed) return 'again';
  if (retried(evidence)) return 'hard';
  const duration = evidence.durationMs;
  if (duration !== undefined) {
    if (task.fluentSeconds !== undefined && duration <= task.fluentSeconds * 1000) {
      return source.kind === 'ai' && source.confidence === 'medium' ? 'good' : 'easy';
    }
    if (task.slowSeconds !== undefined && duration > task.slowSeconds * 1000) return 'hard';
  }
  return 'good';
}

function retried(evidence: Evidence): boolean {
  return (evidence.hintsUsed ?? 0) > 0 || (evidence.attempts ?? 0) > 0;
}

/** `score / maxScore` in [0, 1]; with no maximum, 1 when passed and 0 otherwise. */
function ratio(score: number, maxScore: number, passed: boolean): number {
  if (maxScore > 0) return clamp(score / maxScore);
  return passed ? 1 : 0;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Supplements and contexts (R7.2, R7.3): a supplement never reviews memory; a
 * passed `exam` answer reviews memory only with `examsMoveSchedule`, a failed
 * one does; `diagnostic` and `pretest` never review memory.
 */
function adjustMemory(
  effect: SkillEffect,
  evidence: Evidence,
  config: ResolvedPracticeConfig,
): SkillEffect {
  if (effect.reason === 'not-assessed') return effect;
  if (evidence.supplements !== undefined)
    return { ...effect, memory: 'none', reason: 'supplement' };
  if (effect.memory === 'none') return effect;
  const { context } = evidence;
  const exam =
    context === 'exam' && effect.rating !== 'again' && !config.contexts.examsMoveSchedule;
  if (exam || context === 'diagnostic' || context === 'pretest') {
    return { ...effect, memory: 'none', reason: 'context' };
  }
  return effect;
}
