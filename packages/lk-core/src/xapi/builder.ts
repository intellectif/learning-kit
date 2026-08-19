import type { ScoringResult } from '../types/activity.js';
import type {
  XAPIActor,
  XAPIContext,
  XAPIObject,
  XAPIResult,
  XAPIStatement,
} from '../types/xapi.js';
import { validateXAPIStatement } from './validators.js';
import { XAPI_VERB_DISPLAY, XAPIVerb, type XAPIVerbKey } from './verbs.js';

/** Caller-supplied activity object descriptor (mapped to an xAPI Activity). */
export interface XAPIObjectParams {
  /** Activity IRI. */
  id: string;
  name?: Record<string, string>;
  description?: Record<string, string>;
  /** Activity type IRI. */
  type?: string;
  /** xAPI cmi.interaction type (e.g. `choice`, `fill-in`, `long-fill-in`). */
  interactionType?: string;
  /** Correct-responses patterns, per the xAPI CRP format. */
  correctResponsesPattern?: string[];
  /** For choice-family interactions: the available components. */
  choices?: Array<{ id: string; description?: Record<string, string> }>;
}

/** Parameters for the generic {@link xAPIBuilder.buildStatement}. */
export interface XAPIStatementParams {
  actor: XAPIActor;
  verb: XAPIVerbKey;
  object: XAPIObjectParams;
  result?: XAPIResult;
  context?: XAPIContext;
}

/** Parameters for {@link xAPIBuilder.buildAnsweredStatement} (verb = ANSWERED). */
export interface AnsweredStatementParams {
  actor: XAPIActor;
  object: XAPIObjectParams;
  scoringResult: ScoringResult;
  timeSpentMs: number;
  /** Serialized learner response string. */
  response?: string;
  context?: XAPIContext;
  resultExtensions?: Record<string, unknown>;
}

/**
 * Parameters for {@link xAPIBuilder.buildSubmittedStatement} (verb =
 * SUBMITTED — deferred-grading submissions). Carries NO score, success, or
 * completion: the grade does not exist yet (Req 22.7).
 */
export interface SubmittedStatementParams {
  actor: XAPIActor;
  object: XAPIObjectParams;
  timeSpentMs: number;
  /** Serialized learner response string (e.g. the submitted text). */
  response?: string;
  context?: XAPIContext;
  resultExtensions?: Record<string, unknown>;
}

/** Parameters for {@link xAPIBuilder.buildCompletedStatement} (verb = COMPLETED). */
export interface CompletedStatementParams {
  actor: XAPIActor;
  object: XAPIObjectParams;
  scoringResult?: ScoringResult;
  timeSpentMs: number;
  context?: XAPIContext;
  resultExtensions?: Record<string, unknown>;
}

/**
 * Converts a millisecond duration to an ISO 8601 seconds string with
 * centisecond precision (`PT1.23S`), per the xAPI 1.0.3 recommendation of
 * 0.01-second accuracy. Sub-second durations are preserved (previously any
 * duration under 500 ms collapsed to `PT0S`). Negative inputs (clock skew)
 * clamp to zero — a negative ISO duration is invalid.
 */
function msToIsoDuration(ms: number): string {
  return `PT${(Math.round(Math.max(0, ms) / 10) / 100).toFixed(2)}S`;
}

/**
 * UUID v4 that works outside secure contexts. `crypto.randomUUID` is
 * SecureContext-gated (undefined on plain-http LAN/staging origins), and a
 * statement is built at SUBMIT time — throwing here would lose the learner's
 * answer. `crypto.getRandomValues` is NOT gated, so the fallback still emits
 * a spec-valid v4 UUID (the statement validator enforces the v4 format).
 */
function uuidv4(): string {
  const c = (
    globalThis as {
      crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array };
    }
  ).crypto;
  if (c?.randomUUID) {
    return c.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Builds the xAPI Activity object, including `definition` only when populated. */
function buildObject(params: XAPIObjectParams): XAPIObject {
  const definition: NonNullable<XAPIObject['definition']> = {
    ...(params.name !== undefined ? { name: params.name } : {}),
    ...(params.description !== undefined ? { description: params.description } : {}),
    ...(params.type !== undefined ? { type: params.type } : {}),
    ...(params.interactionType !== undefined ? { interactionType: params.interactionType } : {}),
    ...(params.correctResponsesPattern !== undefined
      ? { correctResponsesPattern: params.correctResponsesPattern }
      : {}),
    ...(params.choices !== undefined ? { choices: params.choices } : {}),
  };
  return {
    objectType: 'Activity',
    id: params.id,
    ...(Object.keys(definition).length > 0 ? { definition } : {}),
  };
}

/**
 * Maps a {@link ScoringResult} + timing to an {@link XAPIResult} per the
 * normative mapping in the design document.
 */
function buildResult(
  timeSpentMs: number,
  scoringResult: ScoringResult | undefined,
  resultExtensions: Record<string, unknown> | undefined,
  response: string | undefined,
): XAPIResult {
  return {
    completion: true,
    duration: msToIsoDuration(timeSpentMs),
    ...(scoringResult !== undefined
      ? {
          score: {
            scaled: scoringResult.score,
            raw: scoringResult.score,
            min: 0,
            max: scoringResult.maxScore,
          },
          success: scoringResult.passed,
        }
      : {}),
    ...(response !== undefined ? { response } : {}),
    ...(resultExtensions !== undefined ? { extensions: resultExtensions } : {}),
  };
}

/**
 * Constructs xAPI 1.0.3 Statements. Every call stamps a fresh UUID v4 `id`,
 * an ISO 8601 `timestamp`, and `version: '1.0.3'`. Not pure by design —
 * statements are unique events.
 */
export const xAPIBuilder = {
  buildStatement(params: XAPIStatementParams): XAPIStatement {
    const statement: XAPIStatement = {
      id: uuidv4(),
      actor: params.actor,
      verb: {
        id: XAPIVerb[params.verb],
        display: XAPI_VERB_DISPLAY[params.verb],
      },
      object: buildObject(params.object),
      ...(params.result !== undefined ? { result: params.result } : {}),
      ...(params.context !== undefined ? { context: params.context } : {}),
      timestamp: new Date().toISOString(),
      version: '1.0.3',
    };
    // Design xAPIBuilder step 4: validate every statement (throws in dev,
    // warns in prod). All build*Statement helpers route through here.
    validateXAPIStatement(statement);
    return statement;
  },

  buildAnsweredStatement(params: AnsweredStatementParams): XAPIStatement {
    return this.buildStatement({
      actor: params.actor,
      verb: 'ANSWERED',
      object: params.object,
      result: buildResult(
        params.timeSpentMs,
        params.scoringResult,
        params.resultExtensions,
        params.response,
      ),
      ...(params.context !== undefined ? { context: params.context } : {}),
    });
  },

  /**
   * Builds a statement for a deferred-grading submission (e.g. a written
   * response). Verb is SUBMITTED and the result deliberately omits `score`,
   * `success`, and `completion` — none of them exist until the asynchronous
   * grader runs; only `duration`, `response`, and extensions are recorded.
   */
  buildSubmittedStatement(params: SubmittedStatementParams): XAPIStatement {
    return this.buildStatement({
      actor: params.actor,
      verb: 'SUBMITTED',
      object: params.object,
      result: {
        duration: msToIsoDuration(params.timeSpentMs),
        ...(params.response !== undefined ? { response: params.response } : {}),
        ...(params.resultExtensions !== undefined ? { extensions: params.resultExtensions } : {}),
      },
      ...(params.context !== undefined ? { context: params.context } : {}),
    });
  },

  buildCompletedStatement(params: CompletedStatementParams): XAPIStatement {
    return this.buildStatement({
      actor: params.actor,
      verb: 'COMPLETED',
      object: params.object,
      result: buildResult(
        params.timeSpentMs,
        params.scoringResult,
        params.resultExtensions,
        undefined,
      ),
      ...(params.context !== undefined ? { context: params.context } : {}),
    });
  },
};
