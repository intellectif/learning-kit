/**
 * Partial-credit scoring for Multiple Choice — balanced/symmetric scheme.
 *
 * Reward and penalty are each normalised by their own pool: the fraction of
 * correct options found, minus the fraction of distractors wrongly chosen.
 * This is fairer than normalising the penalty by the correct-option count —
 * under that older form a single wrong pick could zero an otherwise-correct
 * response when there was only one correct answer.
 *
 * Result is always in [0, 1]: `reward ∈ [0,1]` and `penalty ∈ [0,1]`, so
 * `reward - penalty ∈ [-1,1]` and `max(0, …)` floors it at 0. Selecting every
 * option yields `1 - 1 = 0`; selecting exactly the correct set yields `1`.
 *
 * @param correctSelected - number of selected options that are correct
 * @param incorrectSelected - number of selected options that are incorrect
 * @param totalCorrect - total correct options; the `MultipleChoiceDataSchema`
 *   "≥1 correct" guard guarantees this is ≥ 1, so the reward term cannot
 *   divide by zero for schema-validated data
 * @param totalIncorrect - total incorrect options (distractors); when `0`
 *   (every option is correct) the penalty term is defined as `0`
 */
export function partialStrategy(
  correctSelected: number,
  incorrectSelected: number,
  totalCorrect: number,
  totalIncorrect: number,
): number {
  const reward = correctSelected / totalCorrect;
  const penalty = totalIncorrect === 0 ? 0 : incorrectSelected / totalIncorrect;
  return Math.max(0, reward - penalty);
}

/**
 * Partial-credit scoring for Fill-in-the-Blanks: fraction of blanks answered
 * correctly. Each blank is independently right or wrong, so a plain proportion
 * is already fair — no penalty term applies.
 *
 * @param correctBlanks - number of blanks answered correctly
 * @param totalBlanks - total number of blanks; the `FillInTheBlanksDataSchema`
 *   `blanks.min(1)` constraint guarantees this is ≥ 1, so division by zero
 *   cannot occur for schema-validated data
 */
export function partialBlankStrategy(correctBlanks: number, totalBlanks: number): number {
  return correctBlanks / totalBlanks;
}
