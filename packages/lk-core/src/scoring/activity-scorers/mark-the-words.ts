import { markableWords, markTargetIndices } from '../../mark-the-words.js';
import type {
  MarkTheWordsData,
  MarkTheWordsLearnerResponse,
  ScoringDetail,
} from '../../types/activity.js';
import type { PartialScoringResult } from './multiple-choice.js';

/**
 * Scores a Mark the Words response.
 *
 * Each target is found when every one of its words is marked. Every marked
 * word that belongs to no target is a wrong mark, and costs one target's
 * worth: `partial` is (targets found − wrong marks) / targets, never below 0,
 * so marking every word is not a strategy. `all-or-nothing` is 1 only with
 * every target found and no wrong mark.
 *
 * A position that names no word, repeats one, or is not a whole number (a
 * tampered payload, or a text edited after the attempt) is ignored: it marks
 * nothing, right or wrong.
 *
 * Details: one per target (`t1`, `t2`… in target order) — `correct`, or
 * `incorrect` when only some of its words are marked, or `incorrect-omission`
 * when none are — with the target's word positions as `correctResponse`; then
 * one per wrong mark (`w` and the word's position), `incorrect`, with no
 * correct response. A review reads both to mark the text.
 */
export function scoreMarkTheWords(
  data: MarkTheWordsData,
  response: MarkTheWordsLearnerResponse,
): PartialScoringResult {
  const count = markableWords(data.text).length;
  const raw: unknown[] = Array.isArray(response.marked) ? response.marked : [];
  const marked = new Set(
    raw
      .filter(
        (word): word is number => typeof word === 'number' && Number.isInteger(word) && word >= 0,
      )
      .filter((word) => word < count),
  );
  const targets = markTargetIndices(data);
  const inTargets = new Set(targets.flat());

  const details: ScoringDetail[] = [];
  let found = 0;
  targets.forEach((words, index) => {
    const hit = words.filter((word) => marked.has(word));
    const correct = words.length > 0 && hit.length === words.length;
    if (correct) {
      found += 1;
    }
    details.push({
      itemId: `t${index + 1}`,
      outcome: correct ? 'correct' : hit.length > 0 ? 'incorrect' : 'incorrect-omission',
      learnerResponse: hit.map(String),
      correctResponse: words.map(String),
      weight: 1,
    });
  });

  const wrong = [...marked].filter((word) => !inTargets.has(word)).sort((a, b) => a - b);
  for (const word of wrong) {
    details.push({
      itemId: `w${word}`,
      outcome: 'incorrect',
      learnerResponse: [String(word)],
      correctResponse: [],
      weight: 1,
    });
  }

  const total = targets.length;
  const score =
    total === 0
      ? 0
      : data.scoringStrategy === 'all-or-nothing'
        ? found === total && wrong.length === 0
          ? 1
          : 0
        : Math.max(0, found - wrong.length) / total;

  return { score, maxScore: 1, feedback: null, details };
}
