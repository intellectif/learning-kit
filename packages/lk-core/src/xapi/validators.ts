import { z } from 'zod/v4';
import { ActivitySchemaError } from '../errors.js';
import type { ValidationError } from '../types/activity.js';
import type { XAPIStatement } from '../types/xapi.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Minimal IRI/URI check: a scheme followed by ':'.
const IRI = /^[a-z][a-z0-9+.-]*:/i;

const langMap = z.record(z.string(), z.string());
const extensions = z.record(z.string(), z.unknown());

const actorSchema = z
  .object({
    objectType: z.literal('Agent'),
    name: z.string().optional(),
    mbox: z
      .string()
      .regex(/^mailto:/, 'mbox must be a mailto IRI')
      .optional(),
    account: z.object({ homePage: z.string(), name: z.string() }).optional(),
  })
  .refine((actor) => actor.mbox !== undefined || actor.account !== undefined, {
    error: 'actor must be identified by an mbox or an account',
  });

const statementSchema = z.object({
  id: z.string().regex(UUID_V4, 'id must be a UUID v4'),
  actor: actorSchema,
  verb: z.object({
    id: z.string().regex(IRI, 'verb.id must be an IRI'),
    display: langMap,
  }),
  object: z.object({
    objectType: z.literal('Activity'),
    id: z.string().regex(IRI, 'object.id must be an IRI'),
    definition: z
      .object({
        name: langMap.optional(),
        description: langMap.optional(),
        type: z.string().optional(),
        interactionType: z.string().optional(),
        correctResponsesPattern: z.array(z.string()).optional(),
        choices: z.array(z.object({ id: z.string(), description: langMap.optional() })).optional(),
        extensions: extensions.optional(),
      })
      .optional(),
  }),
  result: z
    .object({
      // xAPI 1.0.3 permits scaled in [-1, 1]; the SDK only emits [0, 1].
      score: z
        .object({
          scaled: z.number().min(-1).max(1),
          raw: z.number().optional(),
          min: z.number().optional(),
          max: z.number().optional(),
        })
        .optional(),
      success: z.boolean().optional(),
      completion: z.boolean().optional(),
      duration: z.string().regex(/^P/, 'duration must be an ISO 8601 duration').optional(),
      response: z.string().optional(),
      extensions: extensions.optional(),
    })
    .optional(),
  context: z
    .object({
      platform: z.string().optional(),
      language: z.string().optional(),
      contextActivities: z
        .object({
          parent: z
            .array(z.object({ objectType: z.literal('Activity'), id: z.string() }))
            .optional(),
          grouping: z
            .array(z.object({ objectType: z.literal('Activity'), id: z.string() }))
            .optional(),
          category: z
            .array(z.object({ objectType: z.literal('Activity'), id: z.string() }))
            .optional(),
          other: z
            .array(z.object({ objectType: z.literal('Activity'), id: z.string() }))
            .optional(),
        })
        .optional(),
      extensions: extensions.optional(),
    })
    .optional(),
  timestamp: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'timestamp must be ISO 8601'),
  version: z.literal('1.0.3'),
});

/**
 * The one global this module reads by name. Declared here, not globally: this
 * package compiles without Node's types on purpose, and nothing else in it may
 * come to rely on `process`.
 */
declare const process: { env: { NODE_ENV?: string } };

/**
 * Whether this is a production build.
 *
 * **The literal `process.env.NODE_ENV`, spelled exactly so.** It is the one
 * expression bundlers replace at build time, and a browser has no `process` to
 * read at run time. The reading this replaces,
 * `globalThis.process?.env?.NODE_ENV`, is not that expression, so no bundler
 * touched it, and in a browser it found no `process` and answered "not
 * production" in every production app — so a malformed statement threw there
 * instead of being logged and sent. Tests running in Node never saw it,
 * because Node has a `process`.
 *
 * This package's own build must leave the literal in its output, for the
 * consumer's bundler to replace. The `try` covers code that reaches a runtime
 * unbundled, with no `process` at all: that is not production, as it always
 * was.
 */
function isProduction(): boolean {
  try {
    return process.env.NODE_ENV === 'production';
  } catch {
    return false;
  }
}

/**
 * Validates a constructed {@link XAPIStatement} against the xAPI 1.0.3
 * structural contract.
 *
 * In development a structural failure throws (caught early); in production it
 * logs a warning and returns (the statement is still sent — see the design's
 * Error Handling table). Uses a `zod/v4` schema rather than `ajv` + an
 * external JSON Schema to keep `lk-core` dependency-free.
 *
 * NOTE: `ActivitySchemaError` is reused here per the task spec; its
 * `activityType` field carries the sentinel `'xAPIStatement'`. A dedicated
 * `XAPIValidationError` would be semantically cleaner — flagged for review.
 */
export function validateXAPIStatement(statement: XAPIStatement): void {
  const result = statementSchema.safeParse(statement);
  if (result.success) {
    return;
  }

  const errors: ValidationError[] = result.error.issues.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
    code: issue.code,
  }));

  if (isProduction()) {
    console.warn('[learning-kit] Invalid xAPI statement (sent anyway):', errors);
    return;
  }

  throw new ActivitySchemaError('xAPIStatement', errors);
}
