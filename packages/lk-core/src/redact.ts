import { ActivitySchemaError, UnknownActivityTypeError } from './errors.js';
import { MEDIA_FIELD_POLICY } from './registry/builtins.js';
import { getActivityTypeDescriptor } from './registry/index.js';
import type { FieldPolicy, Sensitivity } from './registry/registry.js';
import { RedactedItemGroupSchema } from './schemas/item-group.js';
import type { ItemGroup } from './types/item-group.js';

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
  /**
   * Per-call sensitivity overrides, merged over the type's registered
   * `fieldPolicy` (top-level keys replace; nested objects merge one level).
   *
   * Sensitivity is partly a PEDAGOGICAL decision, not purely a security one —
   * whether a rubric or a hint is learner-visible differs legitimately between
   * deployments — and the SDK must not freeze that choice. Use this to tighten
   * a field the SDK ships as `public`:
   *
   * ```ts
   * redact(essay, { policy: { rubric: 'author-only' } });
   * ```
   *
   * Overrides can only be applied to fields; they cannot re-open a field the
   * caller has not classified, because unclassified still means removed.
   * Note that tightening below what the type's `redactedSchema` requires is
   * allowed — the schema check only rejects payloads that reveal MORE than
   * the learner-safe shape.
   */
  policy?: FieldPolicy;
}

/** Merges per-call overrides over a registered policy, one level deep. */
function mergePolicy(base: FieldPolicy, overrides: FieldPolicy | undefined): FieldPolicy {
  if (overrides === undefined) {
    return base;
  }
  const merged: Record<string, Sensitivity | FieldPolicy> = { ...base };
  for (const [key, override] of Object.entries(overrides)) {
    const current = merged[key];
    merged[key] =
      typeof override === 'object' && typeof current === 'object'
        ? { ...current, ...override }
        : override;
  }
  return merged;
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

/** An object projection that kept no fields at all. Arrays are never dropped. */
function isEmptyObject(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
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
    // A nested projection that emitted nothing is omitted rather than emitted
    // as `{}`. "Nothing survived redaction" and "the field was absent" are the
    // same thing to a learner — and without this, giving an all-`answer-key`
    // object a nested policy would turn its absence under `reveal: 'none'`
    // into an empty object, changing every existing projection.
    if (nested !== undefined && !isEmptyObject(nested)) {
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
export function redact<T extends { type: string }>(
  data: T,
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

  const effectivePolicy = mergePolicy(descriptor.fieldPolicy, options.policy);
  const projected = redactValue(data, effectivePolicy, reveal) as Record<string, unknown>;
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

/**
 * Sensitivity of a stimulus. Everything is learner-visible — that is what a
 * stimulus IS — except the author transcript. Fail-closed like every other
 * policy: a field added to `Stimulus` without a classification here is
 * dropped, never leaked.
 */
const STIMULUS_FIELD_POLICY: FieldPolicy = {
  id: 'public',
  kind: 'public',
  title: 'public',
  body: 'public',
  bodyHtml: 'public',
  media: MEDIA_FIELD_POLICY,
  locale: 'public',
  attribution: 'public',
  transcript: 'author-only',
};

/** The group container's own fields. `items` is handled separately, per item type. */
const ITEM_GROUP_FIELD_POLICY: FieldPolicy = {
  schemaVersion: 'public',
  type: 'public',
  id: 'public',
  title: 'public',
  // See the note on the built-in activity policies: a slot key is identity,
  // and identity has to cross the redaction boundary intact.
  slotKey: 'public',
  shuffle: 'public',
  stimulus: STIMULUS_FIELD_POLICY,
};

/** A learner-safe item group: the container with its marker, holding `redact()` projections. */
export type RedactedItemGroup = ItemGroup<RedactedActivityData> & { redacted: true };

/**
 * Produces the learner-safe projection of an item group: the container and
 * stimulus under their own fail-closed policy (the author transcript goes;
 * the passage, media and attribution stay — the learner is meant to see
 * them), and every item through {@link redact} with the same `options`, so
 * a per-call `policy` tightens each item exactly as it would alone.
 *
 * With the default `reveal: 'none'` the container is verified against the
 * strict redacted schema; each item was already verified by `redact`.
 */
export function redactItemGroup<TItem extends { type: string }>(
  group: ItemGroup<TItem>,
  options: RedactOptions = {},
): RedactedItemGroup {
  const reveal = options.reveal ?? 'none';
  const { items, ...container } = group;
  const projected = redactValue(container, ITEM_GROUP_FIELD_POLICY, reveal) as Record<
    string,
    unknown
  >;
  const result = {
    ...projected,
    items: items.map((item) => redact(item, options)),
    redacted: true as const,
  } as RedactedItemGroup;

  if (reveal === 'none') {
    const parsed = RedactedItemGroupSchema.safeParse(result);
    if (!parsed.success) {
      throw new ActivitySchemaError(
        'item-group',
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
 * Asserts that `data` is a learner-safe item group: it carries the marker,
 * its container and stimulus satisfy the strict redacted schema (so no
 * transcript, no unclassified field), and EVERY item passes
 * {@link assertRedacted} against its own type's redacted schema. Item
 * failures are reported at `items.<index>.…`. Use it at the server boundary
 * before sending a group to a client that must not hold the key.
 */
export function assertRedactedItemGroup(data: unknown): asserts data is RedactedItemGroup {
  if (typeof data !== 'object' || data === null) {
    throw new ActivitySchemaError('item-group', [
      { path: [], message: 'Redacted item group must be an object.', code: 'invalid_type' },
    ]);
  }
  const candidate = data as Record<string, unknown>;
  if (candidate.redacted !== true) {
    throw new ActivitySchemaError('item-group', [
      {
        path: ['redacted'],
        message: 'Missing redacted marker — this payload is not a redactItemGroup() projection.',
        code: 'custom',
      },
    ]);
  }
  const parsed = RedactedItemGroupSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ActivitySchemaError(
      'item-group',
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
        code: issue.code,
      })),
    );
  }
  parsed.data.items.forEach((item, index) => {
    try {
      assertRedacted(item);
    } catch (error) {
      if (error instanceof ActivitySchemaError) {
        throw new ActivitySchemaError(
          'item-group',
          error.errors.map((issue) => ({
            ...issue,
            path: ['items', String(index), ...issue.path],
          })),
        );
      }
      throw error;
    }
  });
}
