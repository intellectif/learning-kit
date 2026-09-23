/**
 * How a paper is delivered: what a learner is shown around the questions, as
 * the school running it decides — separately from the content, so that one
 * item serves a practice lesson and a final exam without being authored twice.
 *
 * Every setting is a RESTRICTION on what the SDK does by default, and every
 * one defaults to `true`: an empty policy is exactly the behaviour there was
 * before policies existed. A policy can take something away; it can never make
 * a mode show what that mode cannot — no policy makes an `exam` reveal a grade,
 * because the client in an exam has no answer key to grade with.
 */
export interface DeliveryPolicy {
  /**
   * Whether a graded answer shows as graded: right and wrong marks, the score,
   * and the author's feedback. `false` leaves the learner with "Answer
   * submitted." — a homework quiz marked on the client and shown to the
   * learner at the end, or a review that shows what was answered and not how
   * it was marked. Never on in `exam`.
   */
  feedback?: boolean | null;
  /**
   * Whether the right answer is shown beside a wrong one, wherever an activity
   * would show it: the correct option of a multiple-choice question, the
   * correct answers `showCorrectAnswers` puts in the blanks, a dictation's
   * transcript. `false` still marks what the learner answered right or wrong.
   * Use it on a paper that will be sat again, or before a retry.
   */
  solutions?: boolean | null;
  /**
   * Whether the learner can ask for hints: the author's hints on a
   * fill-in-the-blanks blank, a dictation's word hints, and AI hints. `false`
   * switches every kind off.
   *
   * **The author's fill-in-the-blanks hints are on in `exam` unless this says
   * otherwise** — they are public content, and were designed to be. Set
   * `hints: false` on a paper of record whose hints are not part of the test.
   */
  hints?: boolean | null;
  /**
   * The deployment's switches for AI help, beside the author's switch on the
   * item and the ports the host supplies: a feature appears only where all
   * three allow it. `false` switches a feature off; nothing here can switch one
   * on, and nothing switches AI help on in an `exam`.
   *
   * `ai: false` switches both off and `ai: true` leaves both as the other
   * settings allow — the same as leaving `ai` out.
   */
  ai?:
    | boolean
    | {
        hints?: boolean | null;
        explanations?: boolean | null;
      }
    | null;
}

/**
 * A policy with every setting spelled out: what {@link resolveDeliveryPolicy}
 * returns, and what an attempt plan records, so the record of the conditions
 * a learner sat a paper under never depends on a default that may one day
 * change.
 */
export interface ResolvedDeliveryPolicy {
  feedback: boolean;
  solutions: boolean;
  hints: boolean;
  ai: {
    hints: boolean;
    explanations: boolean;
  };
}

/** One thing {@link validateDeliveryPolicy} found wrong with a policy. */
export interface DeliveryPolicyIssue {
  /** Where, as a dotted path: `hints`, `ai.explanations`, or `''` for the policy itself. */
  path: string;
  message: string;
}
