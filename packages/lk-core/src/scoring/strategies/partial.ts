/**
 * Partial-credit scoring for Multiple Choice: net correct selections over the
 * total number of correct options, floored at zero so wrong picks cannot drive
 * the score negative.
 *
 * Result is always in [0, 1]: `correctSelected ≤ totalCorrect` and
 * `incorrectSelected ≥ 0`, so the ratio is ≤ 1 and `max(0, …)` floors it at 0.
 *
 * @param correctSelected - number of selected options that are correct
 * @param incorrectSelected - number of selected options that are incorrect
 * @param totalCorrect - total correct options in the activity; the
 *   `MultipleChoiceDataSchema` "≥1 correct" guard guarantees this is ≥ 1, so
 *   division by zero cannot occur for schema-validated data
 */
export function partialStrategy(
  correctSelected: number,
  incorrectSelected: number,
  totalCorrect: number,
): number {
  return Math.max(0, (correctSelected - incorrectSelected) / totalCorrect);
}

/**
 * Partial-credit scoring for Fill-in-the-Blanks: fraction of blanks answered
 * correctly.
 *
 * @param correctBlanks - number of blanks answered correctly
 * @param totalBlanks - total number of blanks; the `FillInTheBlanksDataSchema`
 *   `blanks.min(1)` constraint guarantees this is ≥ 1, so division by zero
 *   cannot occur for schema-validated data
 */
export function partialBlankStrategy(correctBlanks: number, totalBlanks: number): number {
  return correctBlanks / totalBlanks;
}
