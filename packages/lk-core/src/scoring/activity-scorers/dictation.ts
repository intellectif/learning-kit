import type { PartialScoringResult } from '../../registry/registry.js';
import type {
  DictationData,
  DictationLearnerResponse,
  ScoringDetail,
} from '../../types/activity.js';
import { alignDictation } from '../dictation/align.js';

/**
 * Scores a Dictation response: the character-level similarity of what the
 * learner typed to the transcript, over the whole sentence.
 *
 * Built on `alignDictation`, so the grade and a marked display read one
 * computation. One {@link ScoringDetail} per word of the chosen transcript, in
 * order — `w1`…`wN` — carrying the word the learner typed for it, an outcome
 * (`correct`, `incorrect`, or `incorrect-omission` when no typed word aligned)
 * and its own `score`, the pair's similarity. Extra typed words appear in the
 * alignment, never in `details`: ids must be derivable from the activity alone.
 *
 * Dictation is the first built-in whose details carry a continuous `score` of
 * their own, and its item score is not derived from them: the sentence is
 * graded as one string (`the cat sat` vs `the cat sit` → words 1, 1, 0.67;
 * score 0.909). A stored `details` array is the audit
 * record of the mark, and survives a future major that changes the algorithm.
 */
export function scoreDictation(
  data: DictationData,
  response: DictationLearnerResponse,
): PartialScoringResult {
  const alignment = alignDictation(data, typeof response?.text === 'string' ? response.text : '');
  const details: ScoringDetail[] = [];
  for (const word of alignment.words) {
    if (word.status === 'extra') {
      continue;
    }
    details.push({
      itemId: word.itemId as string,
      correct: word.status === 'correct',
      outcome:
        word.status === 'correct'
          ? 'correct'
          : word.status === 'incorrect'
            ? 'incorrect'
            : 'incorrect-omission',
      learnerResponse: word.attempt,
      correctResponse: word.reference,
      score: word.similarity,
      weight: 1,
    });
  }
  return { score: alignment.similarity, maxScore: 1, feedback: null, details };
}
