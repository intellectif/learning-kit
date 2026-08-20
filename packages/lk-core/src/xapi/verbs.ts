/**
 * The set of xAPI verbs emitted by SDK activities, keyed by a stable
 * identifier mapped to its canonical xAPI verb IRI (xAPI 1.0.3 / ADL registry).
 */
export const XAPIVerb = {
  ANSWERED: 'http://adlnet.gov/expapi/verbs/answered',
  COMPLETED: 'http://adlnet.gov/expapi/verbs/completed',
  EXPERIENCED: 'http://adlnet.gov/expapi/verbs/experienced',
  INTERACTED: 'http://adlnet.gov/expapi/verbs/interacted',
  ATTEMPTED: 'http://adlnet.gov/expapi/verbs/attempted',
  PASSED: 'http://adlnet.gov/expapi/verbs/passed',
  FAILED: 'http://adlnet.gov/expapi/verbs/failed',
  WATCHED: 'https://w3id.org/xapi/video/verbs/watched',
  /**
   * Emitted for deferred-grading submissions (e.g. written-response): the
   * learner has submitted work whose grade does not exist yet, so `answered`
   * (which implies a scored response) would be wrong. xAPI 1.0.3 defines no
   * canonical "submit" verb; the Activity Streams 1.0 IRI is the established
   * community choice (design decision recorded per Task 25.4).
   */
  SUBMITTED: 'http://activitystrea.ms/schema/1.0/submit',
  /**
   * Emitted when an asynchronous grader produces a grade for work that was
   * previously only SUBMITTED. Distinct from `answered`, which asserts the
   * grade existed at submission time — here the learner acted earlier and the
   * grade arrived later, often from a different actor (an AI or a teacher).
   */
  SCORED: 'http://adlnet.gov/expapi/verbs/scored',
} as const;

/** Union of the valid `XAPIVerb` keys. */
export type XAPIVerbKey = keyof typeof XAPIVerb;

/**
 * Default `en-US` display label for each verb, used to populate
 * `XAPIVerbObject.display` when the builder resolves a verb key.
 */
export const XAPI_VERB_DISPLAY: Record<XAPIVerbKey, Record<string, string>> = {
  ANSWERED: { 'en-US': 'answered' },
  COMPLETED: { 'en-US': 'completed' },
  EXPERIENCED: { 'en-US': 'experienced' },
  INTERACTED: { 'en-US': 'interacted' },
  ATTEMPTED: { 'en-US': 'attempted' },
  PASSED: { 'en-US': 'passed' },
  FAILED: { 'en-US': 'failed' },
  WATCHED: { 'en-US': 'watched' },
  SUBMITTED: { 'en-US': 'submitted' },
  SCORED: { 'en-US': 'scored' },
};
