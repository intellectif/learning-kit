import { ActivitySchemaError, UnknownActivityTypeError } from './errors.js';
import { getActivityTypeDescriptor } from './registry/index.js';
import type { FieldPolicy, Sensitivity } from './registry/registry.js';

/**
 * A learner-safe projection of activity data produced by {@link redact}:
 * the activity's public fields plus the `redacted: true` marker. Renderable
 * and validatable (each built-in type registers a strict redacted schema),
 * but stripped of the answer key, scoring rules, authored feedback, and
 * author-only assets.
 */
export interface RedactedActivityData {
  redacted: true;
  schemaVersion: string;
  type: string;
  id: string;
  title: string;
  [key: string]: unknown;
}

/** Options for {@link redact}. */
export interface RedactOptions {
  /**
   * Which sensitivity tiers to keep beyond `public`:
   * - `'none'` (default) — public fields only; the output satisfies the
   *   type's strict redacted schema and `assertRedacted`.
   * - `'after-submit'` — public + answer-key fields (for post-submission
   *   review renders). `author-only` fields and unclassified fields are
   *   STILL removed; the output will NOT pass `assertRedacted`.
   */
  reveal?: 'none' | 'after-submit';
}

function isSensitivity(value: Sensitivity | FieldPolicy): value is Sensitivity {
  return typeof value === 'string';
}

function keepField(sensitivity: Sensitivity, reveal: 'none' | 'after-submit'): boolean {
  if (sensitivity === 'public') {
    return true;
  }
  return sensitivity === 'answer-key' && reveal === 'after-submit';
}

function redactValue(
  value: unknown,
  policy: FieldPolicy,
  reveal: 'none' | 'after-submit',
): unknown {
  if (Array.isArray(value)) {
    return value.map((element) => redactValue(element, policy, reveal));
  }
  if (value === null || typeof value !== 'object') {
    // A nested FieldPolicy cannot classify a primitive's sub-fields; the
    // policy author classified an object shape that is not there. Fail
    // closed: drop it (handled by the caller returning undefined).
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(source)) {
    if (fieldValue === undefined) {
      continue;
    }
    const classification = policy[key];
    if (classification === undefined) {
      // Fail closed: unclassified fields are never emitted, at any reveal
      // level. Adding a field without classifying it hides it — never leaks it.
      continue;
    }
    if (isSensitivity(classification)) {
      if (keepField(classification, reveal)) {
        output[key] = fieldValue;
      }
      continue;
    }
    const nested = redactValue(fieldValue, classification, reveal);
    if (nested !== undefined) {
      output[key] = nested;
    }
  }
  return output;
}

/**
 * Produces the learner-safe projection of activity data (R7), driven by the
 * `fieldPolicy` registered for `data.type`. Fail-closed and exhaustive by
 * construction: a field the policy does not classify is removed — including
 * unknown passthrough fields — so a NEW field added by a future SDK or a
 * consumer sidecar can never leak through an out-of-date redactor.
 *
 * With the default `reveal: 'none'`, the output validates against the type's
 * strict redacted schema (verified here; an invalid projection throws
 * {@link ActivitySchemaError} rather than shipping an unproven payload).
 *
 * @throws UnknownActivityTypeError when `data.type` is not registered.
 * @throws Error when the registered descriptor declares no `fieldPolicy`
 *         (redaction cannot guess sensitivities).
 */
export function redact(
  data: { type: string; [key: string]: unknown },
  options: RedactOptions = {},
): RedactedActivityData {
  const reveal = options.reveal ?? 'none';
  const descriptor = getActivityTypeDescriptor(data.type);
  if (descriptor === undefined) {
    throw new UnknownActivityTypeError(String(data.type));
  }
  if (descriptor.fieldPolicy === undefined) {
    throw new Error(
      `Activity type "${descriptor.type}" has no fieldPolicy; redact() cannot run fail-closed redaction without one.`,
    );
  }

  const projected = redactValue(data, descriptor.fieldPolicy, reveal) as Record<string, unknown>;
  const result = { ...projected, redacted: true as const } as RedactedActivityData;

  if (reveal === 'none' && descriptor.redactedSchema !== undefined) {
    const parsed = descriptor.redactedSchema.safeParse(result);
    if (!parsed.success) {
      throw new ActivitySchemaError(
        descriptor.type,
        parsed.error.issues.map((issue) => ({
          path: issue.path.map(String),
          message: issue.message,
          code: issue.code,
        })),
      );
    }
  }

  return result;
}

/**
 * Asserts that `data` is a learner-safe redacted projection: it carries the
 * `redacted: true` marker and, when its type registers a strict redacted
 * schema, validates against it (proving the absence of answer-key fields).
 * Use this at the server boundary before sending activity data to a client
 * that must not hold the key.
 */
export function assertRedacted(data: unknown): asserts data is RedactedActivityData {
  if (typeof data !== 'object' || data === null) {
    throw new ActivitySchemaError('unknown', [
      { path: [], message: 'Redacted activity data must be an object.', code: 'invalid_type' },
    ]);
  }
  const candidate = data as Record<string, unknown>;
  if (candidate.redacted !== true) {
    throw new ActivitySchemaError(String(candidate.type ?? 'unknown'), [
      {
        path: ['redacted'],
        message: 'Missing redacted marker — this payload is not a redact() projection.',
        code: 'custom',
      },
    ]);
  }
  const type = typeof candidate.type === 'string' ? candidate.type : '';
  const descriptor = getActivityTypeDescriptor(type);
  if (descriptor === undefined) {
    throw new UnknownActivityTypeError(type);
  }
  if (descriptor.redactedSchema === undefined) {
    // Fail closed: without a registered redacted schema there is no way to
    // PROVE the absence of answer-key fields, and a marker alone proves
    // nothing (any object can carry `redacted: true`).
    throw new ActivitySchemaError(descriptor.type, [
      {
        path: [],
        message: `Activity type "${descriptor.type}" registers no redactedSchema; assertRedacted cannot prove this payload is learner-safe.`,
        code: 'custom',
      },
    ]);
  }
  const parsed = descriptor.redactedSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ActivitySchemaError(
      descriptor.type,
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
        code: issue.code,
      })),
    );
  }
}
