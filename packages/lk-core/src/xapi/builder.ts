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

/** Parameters for {@link xAPIBuilder.buildCompletedStatement} (verb = COMPLETED). */
export interface CompletedStatementParams {
  actor: XAPIActor;
  object: XAPIObjectParams;
  scoringResult?: ScoringResult;
  timeSpentMs: number;
  context?: XAPIContext;
  resultExtensions?: Record<string, unknown>;
}

/** Converts a millisecond duration to an ISO 8601 `PT<seconds>S` string. */
function msToIsoDuration(ms: number): string {
  return `PT${Math.round(ms / 1000)}S`;
}

/** Builds the xAPI Activity object, including `definition` only when populated. */
function buildObject(params: XAPIObjectParams): XAPIObject {
  const definition: NonNullable<XAPIObject['definition']> = {
    ...(params.name !== undefined ? { name: params.name } : {}),
    ...(params.description !== undefined ? { description: params.description } : {}),
    ...(params.type !== undefined ? { type: params.type } : {}),
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
      id: crypto.randomUUID(),
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
