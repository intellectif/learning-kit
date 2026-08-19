import type {
  BlankConfig,
  FillInTheBlanksData,
  FillInTheBlanksLearnerResponse,
  ScoringDetail,
} from '../../types/activity.js';
import { allOrNothingStrategy } from '../strategies/all-or-nothing.js';
import { partialBlankStrategy } from '../strategies/partial.js';
import { matchText, type TextMatchPolicy } from '../text-match.js';
import type { PartialScoringResult } from './multiple-choice.js';

/**
 * Resolves the effective match policy for a blank. The legacy
 * `caseSensitive` / `trimWhitespace` flags map onto the baseline policy
 * fields; an explicit `blank.match` policy takes precedence field-by-field.
 * With neither present, the result is the v1 semantics exactly.
 */
function policyFor(blank: BlankConfig): TextMatchPolicy {
  return {
    ...(blank.caseSensitive !== undefined ? { caseSensitive: blank.caseSensitive } : {}),
    ...(blank.trimWhitespace !== undefined ? { trim: blank.trimWhitespace } : {}),
    ...blank.match,
  };
}

/**
 * Scores a Fill-in-the-Blanks response. Each blank is evaluated independently
 * via {@link matchText} under the blank's resolved policy; a missing answer
 * key is treated as empty input and scored incorrect.
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
    const matched = matchText(input, blank.acceptedAnswers, policyFor(blank)).matched;

    perBlankCorrect.push(matched);
    details.push({
      itemId: blank.id,
      correct: matched,
      outcome: matched ? 'correct' : 'incorrect',
      learnerResponse: [input],
      correctResponse: [...blank.acceptedAnswers],
      weight: 1,
    });
  }

  const correctBlanks = perBlankCorrect.filter(Boolean).length;
  const scoreValue =
    data.scoringStrategy === 'all-or-nothing'
      ? allOrNothingStrategy(perBlankCorrect)
      : partialBlankStrategy(correctBlanks, data.blanks.length);

  return { score: scoreValue, maxScore: 1, feedback: null, details };
}
