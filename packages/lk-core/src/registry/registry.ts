import type { z } from 'zod/v4';
import type { DeferredScoringPartial, ScoringResult } from '../types/activity.js';

/** ScoringResult without `passed` — the public `score()` / `evaluate()` fill that in. */
export type PartialScoringResult = Omit<ScoringResult, 'passed'>;

/**
 * Sensitivity classification of a single activity-data field, driving
 * `redact()`:
 * - `public` — safe to send to a learner before they answer.
 * - `answer-key` — reveals (or helps infer) the correct answer or the scoring
 *   rules; removed unless `reveal: 'after-submit'` is requested.
 * - `author-only` — never leaves the authoring/grading context (e.g. rubrics).
 */
export type Sensitivity = 'public' | 'answer-key' | 'author-only';

/**
 * Per-field sensitivity map for an activity type. A `Sensitivity` value
 * classifies the whole field (objects and arrays included); a nested
 * `FieldPolicy` recurses into an object field — and, for an array field,
 * applies to every element. Fail-closed: any field a policy does not mention
 * is treated as `author-only` and removed by `redact()` — adding a field
 * without classifying it hides it, never leaks it.
 */
export interface FieldPolicy {
  readonly [field: string]: Sensitivity | FieldPolicy;
}

/** xAPI interaction types defined by xAPI 1.0.3 (cmi.interaction vocabulary). */
export type XAPIInteractionType =
  | 'choice'
  | 'fill-in'
  | 'long-fill-in'
  | 'matching'
  | 'sequencing'
  | 'performance'
  | 'true-false'
  | 'other';

/** Interop facts a generic statement builder cannot infer from data alone. */
export interface ActivityTypeInterop<TData> {
  /** IRI for the xAPI Activity `definition.type`. */
  readonly xapiActivityTypeIri?: string;
  /** xAPI `definition.interactionType` for this activity type. */
  readonly xapiInteractionType?: XAPIInteractionType;
  /** Builds the xAPI `correctResponsesPattern` strings for an item. */
  readonly correctResponsesPattern?: (data: TData) => string[];
}

/**
 * How responses to an activity type are graded:
 * - `sync` — a pure function produces the grade at submit time.
 * - `deferred` — grading happens asynchronously (AI or human) after
 *   submission; `partial` reports the facts computable synchronously
 *   (e.g. word counts), surfaced in `ItemOutcome.partial`.
 */
export type ActivityTypeScoring<TData, TResponse> =
  | {
      readonly kind: 'sync';
      readonly score: (data: TData, response: TResponse) => PartialScoringResult;
    }
  | {
      readonly kind: 'deferred';
      readonly reason: 'requires_async_grading';
      readonly partial?: (data: TData, response: TResponse | undefined) => DeferredScoringPartial;
    };

/**
 * A value-level description of an activity type: its contract (schema), its
 * grading, its redaction policy, and its interop facts. Registering a
 * descriptor makes `validateActivity`, `score`, `evaluate`, `redact`, and
 * `jsonSchemaFor` work for the type — an activity type is a value, not a
 * hardcoded union member (R1).
 */
export interface ActivityTypeDescriptor<TData extends { type: string }, TResponse> {
  /** The `type` discriminator string (kebab-case by convention). */
  readonly type: TData['type'];
  /** Zod schema validating the activity's data contract. */
  readonly schema: z.ZodType<TData>;
  /** How responses are graded. */
  readonly scoring: ActivityTypeScoring<TData, TResponse>;
  /** Whether a response counts as an answer (vs. blank/untouched). */
  readonly isAnswered?: (response: TResponse | undefined) => boolean;
  /** Per-field sensitivity map driving `redact()`. Fail-closed. */
  readonly fieldPolicy?: FieldPolicy;
  /**
   * Schema the output of `redact(data)` (with default `reveal: 'none'`) must
   * satisfy. Strict by design: it proves the ABSENCE of answer-key fields,
   * so `assertRedacted` can guarantee a payload is safe to send to a learner.
   */
  readonly redactedSchema?: z.ZodType<unknown>;
  /** Interop facts for xAPI (and later QTI) statement building. */
  readonly interop?: ActivityTypeInterop<TData>;
  /** The interaction-event kinds components for this type emit. */
  readonly interactions?: readonly string[];
}

/**
 * Internal type-erased descriptor shape stored in the registry. Dispatch call
 * sites cast payloads back; the public generic API preserves inference.
 */
export interface RegisteredActivityTypeDescriptor {
  readonly type: string;
  readonly schema: z.ZodType<unknown>;
  readonly scoring:
    | {
        readonly kind: 'sync';
        readonly score: (data: unknown, response: unknown) => PartialScoringResult;
      }
    | {
        readonly kind: 'deferred';
        readonly reason: 'requires_async_grading';
        readonly partial?: (data: unknown, response: unknown) => DeferredScoringPartial;
      };
  readonly isAnswered?: (response: unknown) => boolean;
  readonly fieldPolicy?: FieldPolicy;
  readonly redactedSchema?: z.ZodType<unknown>;
  readonly interop?: ActivityTypeInterop<unknown>;
  readonly interactions?: readonly string[];
}

/**
 * Module-scoped default registry (deliberate — no registry instances until a
 * second consumer exists; see roadmap §3.2 / audit §15.3).
 */
const registry = new Map<string, RegisteredActivityTypeDescriptor>();

/**
 * Identity helper that gives full type inference when authoring a descriptor:
 *
 * ```ts
 * const myType = defineActivityType<MyTypeData, MyTypeLearnerResponse>({ ... });
 * registerActivityType(myType);
 * ```
 */
export function defineActivityType<TData extends { type: string }, TResponse>(
  descriptor: ActivityTypeDescriptor<TData, TResponse>,
): ActivityTypeDescriptor<TData, TResponse> {
  return descriptor;
}

/**
 * Registers an activity type on the default registry, making it live for
 * `validateActivity`, `score`, `evaluate`, `redact`, and `jsonSchemaFor`.
 * Re-registering the same descriptor object is a no-op; registering a
 * DIFFERENT descriptor under an existing type throws — silently replacing a
 * type's contract or scoring is exactly the class of accident a summative
 * SDK must not allow.
 */
export function registerActivityType<TData extends { type: string }, TResponse>(
  descriptor: ActivityTypeDescriptor<TData, TResponse>,
): void {
  if (descriptor.type === 'item-group') {
    // The container that holds several items around one stimulus. It has no
    // learner response and no score of its own, so it can never satisfy this
    // contract — and letting a consumer register one would make `isItemGroup`
    // and `flattenSequence` misread their own container.
    throw new Error(
      '"item-group" is reserved for the SDK\'s item-group container (see ItemGroup) and cannot be registered as an activity type.',
    );
  }
  const existing = registry.get(descriptor.type);
  if (existing !== undefined) {
    if ((existing as unknown) === (descriptor as unknown)) {
      return;
    }
    throw new Error(
      `Activity type "${descriptor.type}" is already registered. ` +
        'Registering a different descriptor for an existing type is not allowed.',
    );
  }
  registry.set(descriptor.type, descriptor as unknown as RegisteredActivityTypeDescriptor);
}

/** Returns the registered descriptor for `type`, or `undefined`. */
export function getActivityTypeDescriptor(
  type: string,
): RegisteredActivityTypeDescriptor | undefined {
  return registry.get(type);
}

/** The type strings currently registered (built-ins plus consumer-registered). */
export function registeredActivityTypes(): string[] {
  return [...registry.keys()];
}
