import type {
  GapSelectChoice,
  GapSelectData,
  GapSelectGap,
  GapSelectLearnerResponse,
  ScoringDetail,
} from '../../types/activity.js';
import { allOrNothingStrategy } from '../strategies/all-or-nothing.js';
import { partialBlankStrategy } from '../strategies/partial.js';
import type { PartialScoringResult } from './multiple-choice.js';

/**
 * The choices a gap offers: its own list, or the bank it names.
 *
 * Returns an empty list when neither resolves. The schema rejects that, but the
 * scorer is reachable with data an older build stored, and an empty list scores
 * the gap incorrect rather than throwing — a paper that cannot be marked is
 * worse at an appeal than one gap nobody can pass.
 */
function choicesFor(data: GapSelectData, gap: GapSelectGap): readonly GapSelectChoice[] {
  if (gap.choices !== undefined) {
    return gap.choices;
  }
  return data.banks?.find((bank) => bank.id === gap.bankId)?.choices ?? [];
}

/**
 * Scores a Gap Select response.
 *
 * Each gap is an identity comparison between the selected choice id and
 * `correctChoiceId` — no text matching of any kind, because a learner choosing
 * from a list cannot mistype, and tolerances that cannot apply must not be
 * configurable.
 *
 * A gap with no selection, or one whose selection is not a choice it offers
 * (a tampered payload, or content edited after the attempt), is scored
 * incorrect and reported as `incorrect-omission`, the outcome the SDK already
 * uses for "the learner never answered this". That keeps an unanswered gap
 * distinguishable from a wrong one everywhere downstream, which is the whole
 * reason the selector's first entry is blank.
 */
export function scoreGapSelect(
  data: GapSelectData,
  response: GapSelectLearnerResponse,
): PartialScoringResult {
  const details: ScoringDetail[] = [];
  const perGapCorrect: boolean[] = [];

  for (const gap of data.gaps) {
    const raw = response.selections[gap.id];
    const selected = typeof raw === 'string' ? raw : '';
    const choices = choicesFor(data, gap);
    const offered = choices.some((choice) => choice.id === selected);
    const answered = selected !== '' && offered;
    const correct = answered && selected === gap.correctChoiceId;

    perGapCorrect.push(correct);
    details.push({
      itemId: gap.id,
      correct,
      outcome: correct ? 'correct' : answered ? 'incorrect' : 'incorrect-omission',
      learnerResponse: [selected],
      correctResponse: [gap.correctChoiceId],
      weight: 1,
    });
  }

  const correctGaps = perGapCorrect.filter(Boolean).length;
  const scoreValue =
    data.scoringStrategy === 'all-or-nothing'
      ? allOrNothingStrategy(perGapCorrect)
      : partialBlankStrategy(correctGaps, data.gaps.length);

  return { score: scoreValue, maxScore: 1, feedback: null, details };
}
