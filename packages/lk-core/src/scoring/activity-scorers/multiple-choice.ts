import type {
  MultipleChoiceData,
  MultipleChoiceLearnerResponse,
  ScoringDetail,
  ScoringResult,
} from '../../types/activity.js';
import { partialStrategy } from '../strategies/partial.js';

/** ScoringResult without `passed` — the public `score()` fills that in. */
export type PartialScoringResult = Omit<ScoringResult, 'passed'>;

/**
 * Scores a Multiple Choice response. Pure; trusts its typed inputs (validation
 * is the component boundary's job). Options are looked up by id; an unknown
 * selected id is treated as an incorrect selection.
 */
export function scoreMultipleChoice(
  data: MultipleChoiceData,
  response: MultipleChoiceLearnerResponse,
): PartialScoringResult {
  const optionById = new Map(data.options.map((option) => [option.id, option]));
  const selected = new Set(response.selectedOptionIds);

  const totalCorrect = data.options.filter((option) => option.isCorrect).length;
  const totalIncorrect = data.options.length - totalCorrect;

  let scoreValue: number;

  if (data.scoringStrategy === 'all-or-nothing') {
    if (data.mode === 'single') {
      scoreValue =
        response.selectedOptionIds.length === 1 &&
        optionById.get(response.selectedOptionIds[0])?.isCorrect === true
          ? 1
          : 0;
    } else {
      const correctIds = data.options.filter((o) => o.isCorrect).map((o) => o.id);
      const allCorrectSelected = correctIds.every((id) => selected.has(id));
      scoreValue = selected.size === correctIds.length && allCorrectSelected ? 1 : 0;
    }
  } else {
    let correctSelected = 0;
    let incorrectSelected = 0;
    for (const id of selected) {
      const option = optionById.get(id);
      if (option?.isCorrect) {
        correctSelected += 1;
      } else {
        incorrectSelected += 1;
      }
    }
    scoreValue = partialStrategy(correctSelected, incorrectSelected, totalCorrect, totalIncorrect);
  }

  const details: ScoringDetail[] = data.options.map((option) => {
    const wasSelected = selected.has(option.id);
    return {
      itemId: option.id,
      correct: wasSelected === option.isCorrect,
      learnerResponse: [wasSelected ? 'selected' : 'not-selected'],
      correctResponse: [option.isCorrect ? 'selected' : 'not-selected'],
    };
  });

  return { score: scoreValue, maxScore: 1, feedback: null, details };
}
