import type {
  BlankConfig,
  FillInTheBlanksData,
  FillInTheBlanksLearnerResponse,
  ScoringDetail,
} from '../../types/activity.js';
import { allOrNothingStrategy } from '../strategies/all-or-nothing.js';
import { partialBlankStrategy } from '../strategies/partial.js';
import type { PartialScoringResult } from './multiple-choice.js';

/**
 * Normalises a value for comparison per the blank's rules.
 * Defaults: `trimWhitespace` true, `caseSensitive` false (case-insensitive
 * unless the author explicitly opts in).
 */
function normalize(value: string, blank: BlankConfig): string {
  let result = value;
  if (blank.trimWhitespace !== false) {
    result = result.trim();
  }
  if (blank.caseSensitive !== true) {
    result = result.toLowerCase();
  }
  return result;
}

/**
 * Scores a Fill-in-the-Blanks response. Each blank is evaluated independently;
 * a missing answer key is treated as empty input and scored incorrect.
 */
export function scoreFillInTheBlanks(
  data: FillInTheBlanksData,
  response: FillInTheBlanksLearnerResponse,
): PartialScoringResult {
  const details: ScoringDetail[] = [];
  const perBlankCorrect: boolean[] = [];

  for (const blank of data.blanks) {
    const rawInput = response.answers[blank.id];
    const input = typeof rawInput === 'string' ? rawInput : '';
    const normalizedInput = normalize(input, blank);
    const matched = blank.acceptedAnswers.some(
      (accepted) => normalize(accepted, blank) === normalizedInput,
    );

    perBlankCorrect.push(matched);
    details.push({
      itemId: blank.id,
      correct: matched,
      learnerResponse: [input],
      correctResponse: [...blank.acceptedAnswers],
    });
  }

  const correctBlanks = perBlankCorrect.filter(Boolean).length;
  const scoreValue =
    data.scoringStrategy === 'all-or-nothing'
      ? allOrNothingStrategy(perBlankCorrect)
      : partialBlankStrategy(correctBlanks, data.blanks.length);

  return { score: scoreValue, maxScore: 1, feedback: null, details };
}
