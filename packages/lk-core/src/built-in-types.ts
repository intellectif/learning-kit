/**
 * The activity types the SDK ships, in one closed list.
 *
 * {@link ActivityType} is `keyof ActivityDataMap`, which a host widens by
 * module augmentation to name its own types, so it cannot say which types are
 * the SDK's. This list can: every table the SDK keeps per built-in type is
 * typed against it (`satisfies Record<BuiltInActivityType, …>`) or walks it, so
 * a type added here is a compile error, or a failing test, everywhere it has
 * not been handled yet.
 *
 * The SDK's own registry holds exactly these, in this order, before a host
 * registers anything.
 */
export const BUILT_IN_ACTIVITY_TYPES = [
  'multiple-choice',
  'fill-in-the-blanks',
  'written-response',
  'gap-select',
  'dictation',
  'read-aloud',
] as const;

/** One of {@link BUILT_IN_ACTIVITY_TYPES}: an activity type the SDK ships, not one a host registered. */
export type BuiltInActivityType = (typeof BUILT_IN_ACTIVITY_TYPES)[number];

/** Whether `type` names an activity type the SDK ships. */
export function isBuiltInActivityType(type: unknown): type is BuiltInActivityType {
  return (BUILT_IN_ACTIVITY_TYPES as readonly unknown[]).includes(type);
}

/**
 * For the `default` of a `switch`, or the end of an `if` chain, over a
 * built-in type: `value` has type `never` there only when every built-in type
 * was handled above it, so a type added to the list fails to compile until it
 * is. At runtime it does nothing — what follows it decides what an unknown
 * type gets.
 *
 * @internal
 */
export function everyBuiltInTypeHandled(_value: never): void {}
