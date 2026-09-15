/**
 * Work shared for the length of one outermost validation call.
 *
 * A draft is checked twice over — by its type's draft checks, then by its
 * schema — and a group draft checks every item a third time when it validates
 * the group. The dictation normaliser is the expensive part of each, so it
 * memoises under the scope a validator opens here. Entries are keyed by the
 * content they were computed from, never by object identity, so data that
 * changes inside a scope can only miss the cache, never read a stale entry;
 * and the scope ends with the call that opened it, so nothing outlives it.
 *
 * Synchronous only. Outside a scope every cache is absent and the work is done
 * afresh, which is the behaviour of a direct `DictationDataSchema.safeParse`.
 */
let active: Map<symbol, unknown> | null = null;

/** Runs `run` inside a validation scope, or inside the one already open. */
export function withValidationScope<T>(run: () => T): T {
  if (active !== null) {
    return run();
  }
  active = new Map();
  try {
    return run();
  } finally {
    active = null;
  }
}

/**
 * The open scope's cache under `key`, created by `create` on first use;
 * `undefined` outside a scope.
 */
export function scopeCache<V>(key: symbol, create: () => V): V | undefined {
  if (active === null) {
    return undefined;
  }
  let value = active.get(key) as V | undefined;
  if (value === undefined) {
    value = create();
    active.set(key, value);
  }
  return value;
}
