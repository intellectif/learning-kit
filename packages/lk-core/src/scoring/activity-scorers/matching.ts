import type { MatchingData, MatchingLearnerResponse, ScoringDetail } from '../../types/activity.js';
import { allOrNothingStrategy } from '../strategies/all-or-nothing.js';
import { partialBlankStrategy } from '../strategies/partial.js';
import type { PartialScoringResult } from './multiple-choice.js';

/**
 * Scores a Matching response.
 *
 * Each prompt is an identity comparison between the option the learner matched
 * it with and `correctOptionId`, as a gap select's gap is. A prompt with no
 * match, or matched with an id that is not an option (a tampered payload, or
 * content edited after the attempt), is scored incorrect and reported as
 * `incorrect-omission`, so an unanswered prompt stays distinguishable from a
 * wrong one downstream.
 *
 * Under `optionUse: 'once'` a response that uses one option twice is scored
 * prompt by prompt like any other: the SDK's component never produces one, and
 * a second use earns nothing the key does not give it, since the key uses each
 * option at most once.
 */
export function scoreMatching(
  data: MatchingData,
  response: MatchingLearnerResponse,
): PartialScoringResult {
  const optionIds = new Set(data.options.map((option) => option.id));
  const details: ScoringDetail[] = [];
  const perPromptCorrect: boolean[] = [];

  for (const prompt of data.prompts) {
    const raw = response.matches[prompt.id];
    const matched = typeof raw === 'string' ? raw : '';
    const answered = matched !== '' && optionIds.has(matched);
    const correct = answered && matched === prompt.correctOptionId;

    perPromptCorrect.push(correct);
    details.push({
      itemId: prompt.id,
      outcome: correct ? 'correct' : answered ? 'incorrect' : 'incorrect-omission',
      learnerResponse: [matched],
      correctResponse: [prompt.correctOptionId],
      weight: 1,
    });
  }

  const correctPrompts = perPromptCorrect.filter(Boolean).length;
  const scoreValue =
    data.scoringStrategy === 'all-or-nothing'
      ? allOrNothingStrategy(perPromptCorrect)
      : partialBlankStrategy(correctPrompts, data.prompts.length);

  return { score: scoreValue, maxScore: 1, feedback: null, details };
}
