/**
 * All-or-nothing scoring: full credit only when every item is correct.
 *
 * @param correctItems - per-item correctness flags for the relevant items
 * @returns `1` if every item is correct (or the list is empty), otherwise `0`
 */
export function allOrNothingStrategy(correctItems: boolean[]): number {
  return correctItems.every((isCorrect) => isCorrect) ? 1 : 0;
}
