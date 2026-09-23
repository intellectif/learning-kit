/**
 * How the questions on a paper are scored when a learner can try again or ask
 * for hints: how many tries there are, which one counts, and what each try and
 * each hint costs.
 *
 * It sits beside the {@link DeliveryPolicy} and is set per paper in the same
 * way, but it is a separate object for a reason: every delivery setting takes
 * something away from what a learner is shown and cannot move a grade, while
 * every setting here moves one. A delivery policy can be read charitably; this
 * one cannot, because a grade-moving setting has no safe direction to read a
 * mistake in. {@link resolveItemScoringPolicy} throws on one.
 *
 * Every setting is optional, and absent or `null` is its default. The defaults
 * are exactly how questions were scored before this policy existed: one try,
 * nothing costs anything, and the first (only) try counts.
 *
 * **The SDK's components apply it in `practice`**, where they grade. An exam's
 * hints stay free and uncounted, as they always were. See
 * https://github.com/intellectif/learning-kit/blob/main/docs/scoring.md
 *
 * @see {@link scoreTries} for the arithmetic.
 */
export interface ItemScoringPolicy {
  /**
   * What each hint costs, as a fraction of the question's marks: `0.1` takes
   * a tenth of them per hint. A hint is any a learner is shown before
   * answering — an author's hint on a blank, a dictation's hint word, an AI
   * hint — and is counted in the response's `hintsRevealed`.
   *
   * A number from 0 to 1. Default 0.
   */
  hintPenalty?: number | null;
  /**
   * How many more tries a learner gets after an answer that did not earn full
   * marks: "Try again". A whole number from 0 to 10. Default 0 — one try, as
   * before.
   */
  retries?: number | null;
  /**
   * What each try after the first costs, as a fraction of the question's
   * marks: with `0.25`, a right answer on the second try earns 75%. A number
   * from 0 to 1. Default 0.
   *
   * It applies only where a later try can count — `counts: 'best'` or
   * `'last'` — and {@link validateItemScoringPolicy} refuses it otherwise.
   */
  retryPenalty?: number | null;
  /**
   * Which try's score is the question's score.
   *
   * - `first` (default): the first. Tries after it are for learning, and
   *   change no grade — which is why it is the default: switching tries on
   *   moves no grade until a school also chooses one of the others.
   * - `best`: the highest, after what each try cost. Never goes down.
   * - `last`: the latest the policy allows.
   */
  counts?: ItemScoringCount | null;
}

/** Which try counts: see {@link ItemScoringPolicy.counts}. */
export type ItemScoringCount = 'first' | 'best' | 'last';

/**
 * A policy with every setting spelled out: what
 * {@link resolveItemScoringPolicy} returns and what an attempt plan records,
 * so the record never depends on a default that may one day change.
 */
export interface ResolvedItemScoringPolicy {
  hintPenalty: number;
  retries: number;
  retryPenalty: number;
  counts: ItemScoringCount;
}

/** One thing {@link validateItemScoringPolicy} found wrong with a policy. */
export interface ItemScoringPolicyIssue {
  /** The setting, e.g. `hintPenalty`, or `''` for the policy itself. */
  path: string;
  message: string;
}

/** One graded try at a question, as {@link scoreTries} reads it. */
export interface ItemTry {
  /** What the try's answer scored, before anything it cost: from `score()`. */
  score: number;
  maxScore: number;
  /**
   * Hints shown before this try was submitted, counted from the start of the
   * question — so a later try's count includes an earlier one's. The response's
   * `hintsRevealed`. Anything but a whole number of 0 or more reads as 0.
   */
  hintsRevealed?: number | undefined;
}

/** One try, as {@link scoreTries} scored it. */
export interface ItemTryScore {
  /** What the answer scored, before anything it cost. */
  score: number;
  /** What it scored after what it cost, never below 0. */
  scored: number;
  maxScore: number;
  /** The hints it was charged for. */
  hintsRevealed: number;
  /** What it cost, as a fraction of `maxScore`: hints, and the tries before it. */
  penalty: number;
}

/** A question's score under a policy, from its tries. */
export interface ItemTriesScore {
  /** The counted try's score after what it cost, never below 0. */
  score: number;
  maxScore: number;
  /** 0-based: the try whose score counts. */
  counted: number;
  /**
   * Every try the policy allows, in order, as scored. A try past the
   * allowance (`1 + retries`) is left out: a learner cannot be given one, so a
   * record that holds one is not believed.
   */
  tries: ItemTryScore[];
}
