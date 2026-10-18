import type { FieldPolicy } from './registry.js';

/**
 * A nested field policy that keeps its field only when the field's value
 * passes a test. Internal: the symbol is never exported, so no host policy can
 * carry one, and `FieldPolicy`'s string keys never see it.
 *
 * It can only drop a field the policy would otherwise emit, never emit one it
 * would drop, so redaction stays fail-closed. It exists for a field
 * `validateActivity` does not check in 1.x — a rubric criterion's `levels` —
 * whose malformed values would otherwise reach the strict redacted schema and
 * make `redact()` throw on content it accepted before.
 */
const KEEP_WHEN: unique symbol = Symbol('lk.keepWhen');

interface GuardedPolicy extends FieldPolicy {
  readonly [KEEP_WHEN]?: (value: unknown) => boolean;
}

/** `policy`, kept only for values `test` accepts. */
export function keepWhen(policy: FieldPolicy, test: (value: unknown) => boolean): FieldPolicy {
  const guarded: GuardedPolicy = { ...policy, [KEEP_WHEN]: test };
  return Object.freeze(guarded);
}

/** The test a nested policy keeps its field by, when it has one. */
export function guardOf(policy: FieldPolicy): ((value: unknown) => boolean) | undefined {
  return (policy as GuardedPolicy)[KEEP_WHEN];
}
