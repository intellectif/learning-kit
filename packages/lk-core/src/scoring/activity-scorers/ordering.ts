import type { OrderingData, OrderingLearnerResponse, ScoringDetail } from '../../types/activity.js';
import type { PartialScoringResult } from './multiple-choice.js';

/**
 * The learner's order, cleaned: ids that name an item, each once, first to
 * last. Anything else in a response (a tampered payload, or an item removed
 * after the attempt) places nothing.
 */
export function placedOrder(data: OrderingData, response: OrderingLearnerResponse): string[] {
  const known = new Set(data.items.map((item) => item.id));
  const raw: unknown[] = Array.isArray(response.order) ? response.order : [];
  const placed: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id === 'string' && known.has(id) && !seen.has(id)) {
      seen.add(id);
      placed.push(id);
    }
  }
  return placed;
}

/**
 * Scores an Ordering response.
 *
 * Each item is right when it follows, in the learner's order, the item that
 * comes before it in the right order — and the item that comes first is right
 * when the learner put it first. Credit by these links rather than by
 * position: an order right but for one item moved to the front loses two
 * items, not every one after it. `partial` is the items right / the items;
 * `all-or-nothing` is 1 only with every item right, which is the right order.
 *
 * Ids that name no item, and repeats, are ignored; an item the response
 * leaves out was not placed, and the items around the gap are judged as the
 * learner left them.
 *
 * Details: one per item, in the right order, under the item's id — `correct`,
 * `incorrect`, or `incorrect-omission` when it was not placed. The
 * `learnerResponse` is the id the learner put before it and the
 * `correctResponse` the id that comes before it, each `''` for "first". A
 * review reads them alone to mark the items and to rebuild the right order.
 */
export function scoreOrdering(
  data: OrderingData,
  response: OrderingLearnerResponse,
): PartialScoringResult {
  const placed = placedOrder(data, response);
  const learnerBefore = new Map(placed.map((id, index) => [id, placed[index - 1] ?? '']));

  const details: ScoringDetail[] = [];
  let right = 0;
  data.items.forEach((item, index) => {
    const before = data.items[index - 1]?.id ?? '';
    const theirs = learnerBefore.get(item.id);
    const correct = theirs === before;
    if (correct) {
      right += 1;
    }
    details.push({
      itemId: item.id,
      outcome: theirs === undefined ? 'incorrect-omission' : correct ? 'correct' : 'incorrect',
      learnerResponse: theirs ?? '',
      correctResponse: before,
      weight: 1,
    });
  });

  const total = data.items.length;
  const score =
    total === 0
      ? 0
      : data.scoringStrategy === 'all-or-nothing'
        ? right === total
          ? 1
          : 0
        : right / total;

  return { score, maxScore: 1, feedback: null, details };
}
