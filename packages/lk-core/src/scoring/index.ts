import { UnknownActivityTypeError } from '../errors.js';
import type {
  ActivityData,
  ActivityType,
  FillInTheBlanksData,
  FillInTheBlanksLearnerResponse,
  LearnerResponse,
  MultipleChoiceData,
  MultipleChoiceLearnerResponse,
  ScoringResult,
} from '../types/activity.js';
import { scoreFillInTheBlanks } from './activity-scorers/fill-in-the-blanks.js';
import { scoreMultipleChoice } from './activity-scorers/multiple-choice.js';

/** Default minimum scaled score required to pass when `passThreshold` is absent. */
const DEFAULT_PASS_THRESHOLD = 0.7;

/**
 * Returns `true` iff `score` meets or exceeds the activity's `passThreshold`,
 * defaulting to {@link DEFAULT_PASS_THRESHOLD} when the field is absent.
 */
export function computePassThreshold(activityData: ActivityData, score: number): boolean {
  return score >= (activityData.passThreshold ?? DEFAULT_PASS_THRESHOLD);
}

/**
 * Scores a learner response against activity data and returns a full
 * {@link ScoringResult}.
 *
 * Pure and deterministic with no side effects. It does **not** re-validate
 * `activityData` — schema validation is the component boundary's
 * responsibility; this is a low-level scoring primitive that trusts its typed
 * inputs. Dispatches on `activityType`; an unrecognised type throws
 * {@link UnknownActivityTypeError}.
 */
export function score(
  activityType: ActivityType,
  activityData: ActivityData,
  learnerResponse: LearnerResponse,
): ScoringResult {
  let result: Omit<ScoringResult, 'passed'>;

  switch (activityType) {
    case 'multiple-choice':
      result = scoreMultipleChoice(
        activityData as MultipleChoiceData,
        learnerResponse as MultipleChoiceLearnerResponse,
      );
      break;
    case 'fill-in-the-blanks':
      result = scoreFillInTheBlanks(
        activityData as FillInTheBlanksData,
        learnerResponse as FillInTheBlanksLearnerResponse,
      );
      break;
    default:
      throw new UnknownActivityTypeError(String(activityType));
  }

  return { ...result, passed: computePassThreshold(activityData, result.score) };
}
