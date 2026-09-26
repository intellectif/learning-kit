import type * as z from 'zod/v4';
import type { StandardSchemaV1 } from '../standard-schema.js';

/**
 * How every entry point reads a schema — `validateActivity`, `validateDraft`,
 * `validateItemGroup`, `redact`, `assertRedacted` — so a schema is read one way
 * wherever it is read.
 *
 * - **A zod schema** — the SDK's own, and any registered one whose Standard
 *   Schema `vendor` is `'zod'` and which has zod's `safeParse` — is read with
 *   `safeParse`. zod can report the value each failing check was given
 *   (`reportInput`), which is how `validateDraft` tells a refused `null` from a
 *   rule that points at one; and what a check throws reaches the caller as it
 *   was thrown. zod's Standard Schema `validate` would turn that throw into a
 *   rejected Promise.
 * - **Any other schema** is read through Standard Schema v1. An issue's `code`
 *   is kept when the library gives one, and its `input` is the value at its
 *   path.
 *
 * Internal: not exported by any entry point.
 */

/**
 * The schemas the SDK wrote itself, tracked by identity. `jsonSchemaFor`
 * derives theirs with the SDK's own zod, as it always has.
 */
const OWN_SCHEMAS = new WeakSet<object>();

/** Marks schemas as the SDK's own. */
export function ownSchemas(...schemas: readonly object[]): void {
  for (const schema of schemas) {
    OWN_SCHEMAS.add(schema);
  }
}

/** Whether `schema` is one of the SDK's own. */
export function isOwnSchema(schema: object): boolean {
  return OWN_SCHEMAS.has(schema);
}

/** One failure, from either kind of schema. */
export interface SchemaIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
  readonly code: string;
  readonly input?: unknown;
}

export type SchemaReading<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly issues: readonly SchemaIssue[] };

/** The code of an issue whose library gives none. */
const GENERIC_CODE = 'invalid';

/** What sits at `path` inside `root`, or `undefined`. */
function valueAt(root: unknown, path: readonly PropertyKey[]): unknown {
  let node = root;
  for (const segment of path) {
    if (node === null || typeof node !== 'object') {
      return undefined;
    }
    node = (node as Record<PropertyKey, unknown>)[segment];
  }
  return node;
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown } | null)?.then === 'function';

/** A zod schema, by its own Standard Schema vendor name and its `safeParse`. */
function isZodSchema(schema: StandardSchemaV1): boolean {
  return (
    schema['~standard'].vendor === 'zod' &&
    typeof (schema as { safeParse?: unknown }).safeParse === 'function'
  );
}

/**
 * Validates `value` against `schema`. What the schema's own code throws is
 * rethrown.
 *
 * @param subject Names the schema in the error a schema that validates
 *   asynchronously throws, e.g. `Activity type "poll"`.
 * @throws TypeError when a schema's Standard Schema validation returns a
 *   Promise: every entry point that reads one is synchronous.
 */
export function readSchema<T>(
  schema: StandardSchemaV1<unknown, T>,
  value: unknown,
  subject: string,
  options?: { readonly reportInput?: boolean },
): SchemaReading<T> {
  if (isZodSchema(schema)) {
    const parsed = (schema as unknown as z.ZodType<T>).safeParse(
      value,
      options?.reportInput === true ? { reportInput: true } : undefined,
    );
    if (parsed.success) {
      return { success: true, data: parsed.data };
    }
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
        code: issue.code,
        ...('input' in issue ? { input: issue.input } : {}),
      })),
    };
  }

  const result = schema['~standard'].validate(value);
  if (isThenable(result)) {
    // Never left to reject unobserved: in Node an unhandled rejection can end
    // the process. Its reason cannot be read synchronously.
    result.then(undefined, () => {});
    throw new TypeError(
      `${subject} has a schema whose validation returned a Promise: it validates asynchronously, or its library reported an error that way. lk-core validates synchronously: register a schema whose validation returns its result.`,
    );
  }
  const settled = result as StandardSchemaV1.Result<T>;
  if (settled.issues === undefined) {
    return { success: true, data: settled.value };
  }
  return {
    success: false,
    issues: settled.issues.map((issue) => {
      const path = (issue.path ?? []).map((segment) =>
        typeof segment === 'object' && segment !== null ? segment.key : segment,
      );
      const code = (issue as { code?: unknown }).code;
      return {
        path,
        message: issue.message,
        code: typeof code === 'string' && code !== '' ? code : GENERIC_CODE,
        input: valueAt(value, path),
      };
    }),
  };
}

/**
 * The shape a registered schema must have, checked when it is registered so a
 * mistake shows there rather than at the first validation.
 */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  const props = (value as { '~standard'?: { version?: unknown; validate?: unknown } } | null)?.[
    '~standard'
  ];
  return props?.version === 1 && typeof props.validate === 'function';
}

/**
 * A schema's own JSON Schema, when it implements the Standard JSON Schema
 * converter (`'~standard'.jsonSchema`) — zod 4.6 does — or `undefined`.
 */
export function standardJsonSchemaOf(
  schema: StandardSchemaV1,
): Record<string, unknown> | undefined {
  const converter = (
    schema['~standard'] as { jsonSchema?: { output?: (options: { target: string }) => unknown } }
  ).jsonSchema;
  if (typeof converter?.output !== 'function') {
    return undefined;
  }
  const generated = converter.output({ target: 'draft-07' });
  return generated !== null && typeof generated === 'object' && !Array.isArray(generated)
    ? (generated as Record<string, unknown>)
    : undefined;
}
