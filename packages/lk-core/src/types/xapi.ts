/**
 * An xAPI Activity object — the thing a statement is about.
 * This SDK only builds Activity-type objects (xAPI 1.0.3 §4.1.4.1).
 */
export interface XAPIObject {
  objectType: 'Activity';
  /** IRI uniquely identifying the activity. */
  id: string;
  definition?: {
    /** Language-map of human-readable names for the activity. */
    name?: Record<string, string>;
    /** Language-map of human-readable descriptions. */
    description?: Record<string, string>;
    /** IRI identifying the activity type. */
    type?: string;
    extensions?: Record<string, unknown>;
  };
}

/**
 * An xAPI Agent (person or system) that performed the statement's verb.
 * Exactly one of `mbox` or `account` must be present.
 */
export interface XAPIActor {
  objectType: 'Agent';
  /** Display name for the actor. */
  name?: string;
  /** Mailto IRI uniquely identifying the actor (e.g. `mailto:user@example.com`). */
  mbox?: string;
  /** Account-based actor identifier. */
  account?: {
    /** IRI of the home page of the account's service provider. */
    homePage: string;
    /** The actor's unique name on that service. */
    name: string;
  };
}

/** An xAPI Verb — the action performed in the statement. */
export interface XAPIVerbObject {
  /** IRI uniquely identifying this verb (e.g. from adlnet.gov/expapi/verbs). */
  id: string;
  /** Language-map of human-readable verb labels. */
  display: Record<string, string>;
}

/** Score sub-object within an xAPI Result. */
export interface XAPIScore {
  /** Normalized score in the range [0, 1]. */
  scaled: number;
  /** Raw score in the instrument's native scale. */
  raw?: number;
  /** Minimum possible raw score. */
  min?: number;
  /** Maximum possible raw score. */
  max?: number;
}

/** Result information attached to an xAPI Statement. */
export interface XAPIResult {
  score?: XAPIScore;
  /** Whether the actor's performance was successful. */
  success?: boolean;
  /** Whether the activity was completed. */
  completion?: boolean;
  /** ISO 8601 duration string representing time spent (e.g. `PT5M30S`). */
  duration?: string;
  /** A string representation of the learner's response. */
  response?: string;
  extensions?: Record<string, unknown>;
}

/** Context information attached to an xAPI Statement. */
export interface XAPIContext {
  /** Name of the software used to record the statement. */
  platform?: string;
  /** BCP 47 language tag for the activity content. */
  language?: string;
  extensions?: Record<string, unknown>;
}

/** A complete xAPI 1.0.3 Statement. */
export interface XAPIStatement {
  /** UUID v4 uniquely identifying this statement. */
  id: string;
  actor: XAPIActor;
  verb: XAPIVerbObject;
  object: XAPIObject;
  result?: XAPIResult;
  context?: XAPIContext;
  /** ISO 8601 timestamp of when the statement occurred. */
  timestamp: string;
  version: '1.0.3';
}

/**
 * Configuration passed to `useXAPI` to connect to an LRS endpoint.
 * The `auth` field supports both HTTP Basic and Bearer token authentication.
 */
export interface XAPIConfig {
  /** Full URL of the LRS statements endpoint. */
  endpoint: string;
  /** Authentication credentials for the LRS. */
  auth: { type: 'basic'; username: string; password: string } | { type: 'bearer'; token: string };
  /** IRI identifying the activity in all statements sent by this hook instance. */
  activityId: string;
  actor: XAPIActor;
  /** Called after all retry attempts are exhausted. */
  onError?: (err: XAPIError) => void;
}

/** Error payload delivered to `XAPIConfig.onError` after retries are exhausted. */
export interface XAPIError {
  /** The statement that failed to send. */
  statement: XAPIStatement;
  /** The 1-based attempt number on which the final failure occurred. */
  attempt: number;
  /** HTTP status code from the LRS, if a response was received. */
  statusCode?: number;
  /** Human-readable error description. */
  message: string;
}
